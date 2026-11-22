// Edge Function: sync-sales-links
// Objetivo: Dado un listado de URLs públicos/compartidos de Google Drive (XLSX) descargar, normalizar y hacer upsert a client_sales.
// Implementa autenticación con Service Account (Drive API) firmando un JWT para obtener access_token.
// Requisitos:
//   - Crear Service Account en Google Cloud con Drive API habilitada.
//   - Compartir cada archivo (o carpeta) de "AVANCE MENSUAL" con el correo de la Service Account (lectura).
//   - Añadir en Variables de Configuración de Supabase (Dashboard -> Project Settings -> Config Vars):
//       GOOGLE_SA_EMAIL
//       GOOGLE_SA_PRIVATE_KEY   (PEM completo, con saltos \n escapados, ej: -----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n)
//       (Opcional) WEBHOOK_SECRET para proteger la invocación.
// NOTA: Esta función NO cachea el token; si necesitas alto volumen puedes agregar cache KV o variable global.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

type RowIn = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "";
const GOOGLE_SA_EMAIL = Deno.env.get("GOOGLE_SA_EMAIL") || '';
const GOOGLE_SA_PRIVATE_KEY_RAW = Deno.env.get("GOOGLE_SA_PRIVATE_KEY") || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function toFirstDayUTC(y: number, m: number) { return new Date(Date.UTC(y, m - 1, 1)); }
function parsePeriodDate(input: unknown): Date | null {
  if (typeof input === "string") {
    const s = input.trim();
    const m1 = s.match(/^(\d{4})[-\/]?(\d{2})/); if (m1) { const y=+m1[1]; const m=+m1[2]; if (y&&m) return toFirstDayUTC(y,m);}    
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m2) { const y=+m2[1]; const m=+m2[2]; if (y&&m) return toFirstDayUTC(y,m);}  }
  if (input instanceof Date) return input; return null;
}
function numFrom(val: unknown): number { if (typeof val==="number") return val; if (typeof val==="string") { const n = Number(val.replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:n;} return 0; }
function normalizeRow(r: RowIn) { const obj: Record<string,any>={}; for(const k of Object.keys(r)) obj[String(k).trim().toLowerCase()] = r[k]; const client_code=String(obj.client_code||obj.codigo||obj.code||'').trim(); const client_id=String(obj.client_id||obj.id||'').trim(); const periodRaw = obj.periodo??obj.period??obj.mes??obj.fecha??obj.period_date??''; const periodDate=parsePeriodDate(periodRaw); const amount = numFrom(obj.htl??obj.monto??obj.amount??obj.venta??obj.ventas??0); return { client_code, client_id, periodDate, amount }; }
async function resolveClientIds(rows: Array<{ client_code:string; client_id:string }>) { const codes = Array.from(new Set(rows.filter(r=>!r.client_id&&r.client_code).map(r=>r.client_code))); const map:Record<string,string>={}; if(!codes.length) return map; const { data, error } = await supabase.from('clients').select('id, client_code').in('client_code', codes); if(error) throw error; (data||[]).forEach((c:any)=>{ map[c.client_code]=c.id;}); return map; }
async function upsertSales(payload: Array<{ client_id:string; period_date:string; amount:number }>) { const chunk=500; for(let i=0;i<payload.length;i+=chunk){ const sub=payload.slice(i,i+chunk); const { error } = await supabase.from('client_sales').upsert(sub,{ onConflict:'client_id,period_date'}); if(error) throw error; } }
function extractFileId(url:string): string | null { const d=url.match(/\/d\/([A-Za-z0-9_-]{10,})/); if(d) return d[1]; const q=url.match(/[?&]id=([A-Za-z0-9_-]{10,})/); return q? q[1]: null; }
async function getAccessToken(): Promise<string> {
  if (!GOOGLE_SA_EMAIL || !GOOGLE_SA_PRIVATE_KEY_RAW) throw new Error('Faltan GOOGLE_SA_EMAIL o GOOGLE_SA_PRIVATE_KEY');
  // 1. Preparar JWT header & claims
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: GOOGLE_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  // 2. Base64URL encode helper
  const b64u = (data: Uint8Array) => {
    let str = '';
    for (const b of data) str += String.fromCharCode(b);
    return btoa(str).replace(/=+/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  };
  const encJson = (obj: any) => b64u(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${encJson(header)}.${encJson(claim)}`;
  // 3. Procesar la clave PEM (remover headers + newlines)
  const pem = GOOGLE_SA_PRIVATE_KEY_RAW.replace(/\\n/g, '\n');
  const match = pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (!match) throw new Error('Formato de PRIVATE KEY inválido');
  const base64Key = match[1].replace(/\s+/g, '');
  const keyRaw = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
  // 4. Importar clave PKCS#8
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyRaw.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  // 5. Firmar
  const signatureBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const signature = b64u(new Uint8Array(signatureBuf));
  const assertion = `${unsigned}.${signature}`;
  // 6. Intercambiar por access_token
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!resp.ok) throw new Error(`Fallo token Google: ${resp.status}`);
  const json = await resp.json();
  if (!json.access_token) throw new Error('Respuesta token sin access_token');
  return json.access_token;
}
async function fetchXlsx(fileId:string, token:string){ const url=`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`; const r=await fetch(url,{ headers:{ Authorization:`Bearer ${token}` }}); if(!r.ok) throw new Error(`Descarga falló ${fileId}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); }
function parseWorkbook(bytes: Uint8Array): RowIn[] { const wb = XLSX.read(bytes,{ type:'array'}); const sheet = wb.Sheets[wb.SheetNames[0]]; if(!sheet) return []; return XLSX.utils.sheet_to_json(sheet,{ defval:'' }) as RowIn[]; }

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Only POST',{ status:405 });
    if (WEBHOOK_SECRET){ const got=req.headers.get('x-webhook-secret')||req.headers.get('x-api-key')||''; if(got!==WEBHOOK_SECRET) return new Response(JSON.stringify({ error:'unauthorized'}), { status:401, headers:{'content-type':'application/json'} }); }
    const body = await req.json().catch(()=>null); if(!body || !Array.isArray(body.urls)) throw new Error('Payload inválido { urls: string[] }');
    const fileIds = body.urls.map((u:string)=>extractFileId(u)).filter(Boolean) as string[]; if(!fileIds.length) return new Response(JSON.stringify({ imported:0, files:0, error:'sin fileIds'}), { headers:{'content-type':'application/json'} });
  const token = await getAccessToken();
    let all: RowIn[] = []; const processed: string[] = [];
    for (const id of fileIds){ try { const bytes=await fetchXlsx(id, token); const rows=parseWorkbook(bytes); all=all.concat(rows); processed.push(id);} catch(e){ console.error('Error archivo', id, e);} }
    const norm = all.map(normalizeRow).filter(r=>(r.client_code||r.client_id)&&r.periodDate&&r.amount>=0); const codeToId=await resolveClientIds(norm); const payload = norm.map(r=>({ client_id: r.client_id||codeToId[r.client_code], period_date: r.periodDate!.toISOString().slice(0,10), amount: r.amount})).filter(p=>p.client_id); await upsertSales(payload); return new Response(JSON.stringify({ imported: payload.length, rows_raw: all.length, files_processed: processed.length }), { headers:{'content-type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message||e) }), { status:400, headers:{'content-type':'application/json'} });
  }
});
