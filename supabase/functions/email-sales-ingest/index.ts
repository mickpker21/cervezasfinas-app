// Eliminado: flujo de ingesta por correo desactivado.
// Este archivo queda intencionalmente vacío.

// Supabase Edge Function: email-sales-ingest
// Recibe un POST con CSV (multipart/form-data: field "file") o JSON { rows: [...] }
// Filas esperadas: client_code o client_id, periodo (YYYY-MM) o period_date, htl|monto|amount

// @ts-ignore Remote import for Deno deploy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// @ts-ignore Remote import for Deno deploy
import { parse as parseCsv } from "https://deno.land/std@0.224.0/csv/parse.ts";

// Ambient declarations to silence TypeScript in local editor (Deno provides these at runtime)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type RowIn = Record<string, unknown>;

// Campos adicionales (numéricos) que queremos preservar desde la hoja de cálculo
// Si no existen, se ignoran. Si existen, se almacenan en client_sales (la tabla debe haber sido extendida previamente)
const EXTRA_NUMERIC_FIELDS = [
  "cajas",
  "htls",
  "meta",
  "dif",
  "total",
  "con_compra",
  "efectividad",
  "venta",
  "descuento",
  "gasto",
  "cliente_compra"
];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function toFirstDayUTC(y: number, m: number) {
  return new Date(Date.UTC(y, m - 1, 1));
}

function parsePeriodDate(input: unknown): Date | null {
  if (typeof input === "number") {
    try {
      // Excel serial not supported here; expect strings. Fallback null
      return null;
    } catch { return null; }
  }
  if (typeof input === "string") {
    const s = input.trim();
    const m1 = s.match(/^(\d{4})[-\/]?(\d{2})/); // YYYY-MM or YYYYMM
    if (m1) {
      const y = Number(m1[1]);
      const m = Number(m1[2]);
      if (y && m) return toFirstDayUTC(y, m);
    }
    // Allow YYYY-MM-DD picking first day
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) {
      const y = Number(m2[1]);
      const m = Number(m2[2]);
      if (y && m) return toFirstDayUTC(y, m);
    }
  }
  return null;
}

function numFrom(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const s = val.replace(/[^0-9.\-]/g, "");
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function normalizeRow(r: RowIn) {
  const obj: Record<string, any> = {};
  for (const k of Object.keys(r)) {
    obj[String(k).trim().toLowerCase()] = r[k as keyof RowIn];
  }
  const client_code = String(obj.client_code || obj.codigo || obj.code || "").trim();
  const client_id = String(obj.client_id || obj.id || "").trim();
  const periodRaw = obj.periodo ?? obj.period ?? obj.mes ?? obj.fecha ?? obj.period_date ?? "";
  const periodDate = parsePeriodDate(periodRaw);
  // amount: mantenemos compatibilidad intentando múltiples alias
  const amount = numFrom(obj.amount ?? obj.monto ?? obj.htl ?? obj.venta ?? obj.ventas ?? 0);
  const extras: Record<string, number> = {};
  for (const f of EXTRA_NUMERIC_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, f)) {
      const n = numFrom(obj[f]);
      if (!isNaN(n)) extras[f] = n;
    }
  }
  return { client_code, client_id, periodDate, amount, ...extras };
}

async function resolveClientIds(rows: Array<{ client_code: string; client_id: string }>) {
  const codes = Array.from(new Set(rows.filter(r => !r.client_id && r.client_code).map(r => r.client_code)));
  const codeToId: Record<string, string> = {};
  if (!codes.length) return codeToId;
  const { data, error } = await supabase
    .from("clients")
    .select("id, client_code")
    .in("client_code", codes);
  if (error) throw error;
  (data || []).forEach((c: any) => { codeToId[c.client_code] = c.id; });
  return codeToId;
}

async function upsertSales(payload: Array<Record<string, any>>) {
  const chunkSize = 500;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error } = await supabase.from("client_sales").upsert(chunk, { onConflict: "client_id,period_date" });
    if (error) throw error;
  }
}

async function upsertRaw(payload: Array<Record<string, any>>) {
  if (!payload.length) return;
  const chunkSize = 300;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error } = await supabase.from("client_sales_sheet").upsert(chunk, { onConflict: "client_id,period_date" });
    if (error) throw error;
  }
}

async function readCsvFromFormData(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File)) throw new Error("Archivo CSV no encontrado (campo 'file').");
  const text = await file.text();
  const rows = await parseCsv(text, { skipFirstRow: false }) as unknown as Array<Record<string, string>>;
  // If parsed to arrays, user should ensure headered csv. std/csv parse will return objects if header present.
  return rows;
}

Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET) {
      const got = req.headers.get("x-webhook-secret") || req.headers.get("x-api-key") || "";
      if (got !== WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
      }
    }

    let rows: RowIn[] = [];
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      rows = await readCsvFromFormData(fd);
    } else {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.rows)) throw new Error("Payload inválido. Esperado JSON { rows: [...] } o multipart/form-data con 'file'.");
      rows = body.rows;
    }

    const norm = rows.map(normalizeRow).filter(r => (r.client_code || r.client_id) && r.periodDate && r.amount >= 0);
    const codeToId = await resolveClientIds(norm);
    const payload = norm.map(r => {
      if (!r.periodDate) return null; // safety guard
      const client_id = r.client_id || codeToId[r.client_code];
      if (!client_id) return null;
      const base: Record<string, any> = {
        client_id,
        period_date: r.periodDate.toISOString().slice(0, 10),
        amount: r.amount
      };
      // Copiar extras presentes
      for (const f of EXTRA_NUMERIC_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(r, f)) {
          const v = (r as any)[f];
          if (typeof v === "number" && !isNaN(v)) base[f] = v;
        }
      }
      return base;
    }).filter(Boolean) as Array<Record<string, any>>;

    // Construir payload raw completo para client_sales_sheet
    const rawPayload = norm.map(r => {
      if (!r.periodDate) return null;
      const client_id = r.client_id || codeToId[r.client_code];
      if (!client_id && !r.client_code) return null;
      const period_date = r.periodDate.toISOString().slice(0,10);
      const raw: Record<string, any> = { client_id: client_id || null, client_code: r.client_code || null, period_date, raw: r };
      for (const f of EXTRA_NUMERIC_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(r, f)) {
          const v = (r as any)[f];
          if (typeof v === "number" && !isNaN(v)) raw[f] = v;
        }
      }
      return raw;
    }).filter(Boolean) as Array<Record<string, any>>;

    if (!payload.length) {
      return new Response(JSON.stringify({ imported: 0, skipped: rows.length, reason: "sin client_id" }), { headers: { "content-type": "application/json" } });
    }

  await upsertSales(payload);
  await upsertRaw(rawPayload);
  return new Response(JSON.stringify({ imported: payload.length, raw_upserted: rawPayload.length, skipped: rows.length - payload.length }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 400, headers: { "content-type": "application/json" } });
  }
});
