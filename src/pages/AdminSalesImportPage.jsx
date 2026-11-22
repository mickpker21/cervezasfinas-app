// AdminSalesImportPage.jsx — Multi-archivo, SKUs + Clients + Ventas con RPC delete
// - Crea/actualiza SKUs desde hoja "marcas"
// - Actualiza Clients desde hoja "clientes" (con conteos de insertados/actualizados)
// - Inserta ventas desde hoja "VENTA" (por defecto) al período seleccionado
// - Borrado por período (+zona) vía RPC (Supabase) o PHP (MySQL)
// - Lotes con fallback y batching adaptativo + flush incondicional final
// - Diagnóstico: conteos por archivo y suma de htls_total importados
// - Selector de destino de ventas (Supabase vs MySQL vía API/PHP Hostinger)

import React, { useEffect, useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { Upload, FileSpreadsheet, Settings, Trash2, Loader2, Lock, AlertTriangle } from "lucide-react";
import { importClientsApi } from "@/lib/mysqlClients";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const ScrollArea = ({ className = "", children }) => (
  <div className={`overflow-auto ${className}`}>{children}</div>
);

// ---------- Tunables ----------
const INSERT_BATCH_SIZE = 50; // REDUCED from 100 for Hostinger stability
const MIN_SUBBATCH_SIZE = 10; // REDUCED for better granularity in adaptive
const PREVIEW_MAX_ROWS = 5;
const MAX_FILES = 5;
const CLIENTS_STREAM_CHUNK = 50; // REDUCED from 100
const SKUS_STREAM_CHUNK = 200; // REDUCED from 500
const PERMISSIVE_NO_AMOUNTS = false; // true = no omites por montos (para diagnóstico)

// ---------- Endpoints MySQL (Hostinger) ----------
const MYSQL_IMPORT_URL = "/api/ventas-por-sku-import.php";
const MYSQL_DELETE_URL = "/api/ventas-por-sku-delete.php";
const EMAIL_IMPORT_URL = "/api/email-ventas-import.php";
const EMAIL_STATUS_URL = "/api/email-ventas-status.php";
const EMAIL_LOGS_URL = "/api/email-ventas-logs.php";

// ---------- Supabase ----------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnon) {
  throw new Error("Faltan variables de entorno: VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY");
}
const supabase = createClient(supabaseUrl, supabaseAnon);

// ------------- Helpers -------------
function isoDateOnly(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function firstOfMonth(yyyyMm) {
  if (!/^\d{4}-\d{2}$/.test(String(yyyyMm))) return null;
  return `${yyyyMm}-01`;
}
// Improved helper to handle currency like "$ 1,200.50"
function numOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  // Remove commas, spaces, and $ signs
  const n = typeof v === "string"
    ? Number(v.replace(/[$,\s]/g, ""))
    : Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v).replace(/[$,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function isNAish(v) {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  if (s === "") return true;
  const up = s.toUpperCase();
  return up === "N/A" || up === "NA" || up === "N.A." || up === "NULL" || s === "-";
}
function textOrNull(v) {
  return isNAish(v) ? null : String(v).trim();
}
function bigIntLike(v) {
  return isNAish(v) ? null : String(v).trim();
}

function inferZonaFromFilename(name) {
  if (!name) return "";
  const up = name.toUpperCase();
  if (up.includes("PALMARITO")) return "PALMARITO";
  if (up.includes("IZUCAR")) return "IZUCAR";
  if (up.includes("OAXACA")) return "OAXACA";
  if (up.includes("SERDAN")) return "SERDAN";
  // GPE-CHILCHOTLA: capture variations like 'GPE-CHILC HOTLA'
  if (up.includes("CHILC") || up.includes("CHILCHOTLA")) return "GPE-CHILCHOTLA";
  
  // Fallback: quitar extensión
  return name.replace(/\.[^.]+$/, "");
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}
function sheetToRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
    dense: true,
  });
  while (
    rows.length &&
    rows[rows.length - 1].every((v) => v === "" || v === null || v === undefined)
  )
    rows.pop();
  return rows;
}
function yieldTick(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

// ------ Encabezados Ventas ------
function buildHeaderMap(headers) {
  const candidates = {
    period_date: ["period_date", "periodo", "fecha_periodo", "fecha"],
    ruta: ["ruta", "sales_route", "ruta_id", "cve_ruta", "clave_ruta", "id_ruta"],
    cve_cliente: [
      "cve_cliente",
      "client_code",
      "codigo_cliente",
      "cod_cliente",
      "id_cliente",
    ],
    client_id: ["client_id", "cliente_id", "id_cliente_interno"],
    num_remision: [
      "num_remision",
      "remision",
      "no_remision",
      "numero_remision",
      "folio_remision",
    ],
    cve_venta: ["cve_venta", "venta_id", "folio_venta", "id_venta"],
    cve_marca: [
      "cve_marca",
      "sku",
      "clave_marca",
      "clave",
      "codigo",
      "codigo_marca",
      "cod_marca",
      "id_marca",
    ],
    unidades: ["unidades", "uds", "qty", "cantidad", "cant"],
    unidades_obsequio: [
      "unidades_obsequio",
      "obsequio",
      "promo_uds",
      "promo",
      "obsequios",
    ],
    precio_venta_marca: [
      "precio_venta_marca",
      "precio_venta",
      "precio_unitario",
      "precio",
      "unit_price",
      "p_venta",
      "p_unitario",
      "precioventamarca"
    ],
    descuento: ["descuento", "desc", "desct", "descuento_%", "descuento_pct"],
    sobreprecio_ingreso: ["sobreprecio_ingreso", "sp_ingreso"],
    sobreprecio_abono: ["sobreprecio_abono", "sp_abono"],
    ieps_venta: ["ieps_venta", "ieps"],
    iva_venta: ["iva_venta", "iva"],
    ruta_express: ["ruta_express", "express"],
    fecha_alta: ["fecha_alta", "fecha_captura", "fecha_mov"],
    sobreprecio_ahorro: ["sobreprecio_ahorro"],
    sobreprecio_np: ["sobreprecio_np"],
    sobreprecio_envase: ["sobreprecio_envase"],
    precio_compra_marca: ["precio_compra_marca", "costo", "costo_unitario"],
    ieps_compra: ["ieps_compra"],
    iva_compra: ["iva_compra"],
    margen_operacion: ["margen_operacion", "margen_op"],
    importe_margen_operacion: ["importe_margen_operacion", "imp_margen_op"],
    venta: [
      "venta",
      "importe_venta",
      "monto",
      "importe",
      "importe_total",
      "subtotal",
      "total",
    ],
    descuento_col: ["descuento_col"],
    sp: ["sp", "sobreprecio"],
    htls: ["htls", "hls", "hectolitros", "htl", "hl"],
    htls_total: [
      "htls_total",
      "hls_total",
      "hectolitros_total",
      "hl_total",
      "htl_total",
    ],
    vta_cajas: [
      "vta_cajas",
      "cajas",
      "ventas_cajas",
      "cajas_vendidas",
    ],
    producto: [
      "producto",
      "descripcion_producto",
      "nombre_producto",
      "descripcion",
      "producto_desc",
    ],
  };

  const map = {};
  const scores = {}; // target -> best_score (lower is better)

  for (let idx = 0; idx < headers.length; idx++) {
    const key = normalizeHeader(headers[idx]);
    for (const target in candidates) {
      const score = candidates[target].indexOf(key);
      if (score !== -1) {
        // If not mapped yet, or this column matches the target with a better (lower) score
        if (map[target] === undefined || score < scores[target]) {
          map[target] = idx;
          scores[target] = score;
        }
        break; // Match found for this header, move to next header column
      }
    }
  }
  return map;
}


// ------ CLIENTS helpers ------
function onlyTextLetters(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function buildClientsHeaderMap(headers) {
  const alias = {
    cve_cliente: ["cve_cliente", "client_code", "codigo_cliente"],
    nom_negocio: [
      "nom_negocio",
      "negocio",
      "nombre_negocio",
      "business_name",
      "razon_social",
    ],
    nom_propietario: [
      "nom_propietario",
      "propietario",
      "dueno",
      "dueño",
      "owner",
      "nombre_propietario",
    ],
    cve_ruta: ["cve_ruta", "ruta", "sales_route", "internal_route"],
    cadena: ["cadena", "gec", "nivel", "level"],
    visit_day_televenta: ["visit_day_televenta", "dia_televenta", "televenta", "call_day", "dia_llamada"],
    zona_comercial: ["zona", "zona_comercial", "region", "territorio"],
    address: ["address", "direccion", "calle_01", "calle"],
    colony: ["colony", "colonia", "colonia_01"],
    city: ["city", "ciudad", "poblacion", "poblacion_01"],
    phone: ["phone", "telefono", "tel"],
    vis_dom: ["visdia_dom", "vis_domingo", "domingo"],
    vis_lun: ["visdia_lun", "vis_lunes", "lunes"],
    vis_mar: ["visdia_mar", "vis_martes", "martes"],
    vis_mie: ["visdia_mie", "visdia_miercoles", "vis_miercoles", "miercoles"],
    vis_jue: ["visdia_jue", "vis_jueves", "jueves"],
    vis_vie: ["visdia_vie", "vis_viernes", "viernes"],
    vis_sab: ["visdia_sab", "vis_sabado", "sabado"],
  };

  const map = {};
  const scores = {};

  for (let idx = 0; idx < headers.length; idx++) {
    const key = normalizeHeader(headers[idx]);
    for (const target in alias) {
      const score = alias[target].indexOf(key);
      if (score !== -1) {
        if (map[target] === undefined || score < scores[target]) {
          map[target] = idx;
          scores[target] = score;
        }
        break;
      }
    }
  }
  return map;
}


async function upsertClientsStreaming(file, pushLog, flushLog) {
  const wb = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        pushLog(`    · Leyendo binario de ${file.name} (clientes)...`);
        flushLog();
        await yieldTick();
        pushLog(`    · Parseando workbook (clientes)...`);
        flushLog();
        const _wb = XLSX.read(data, { type: "array", dense: true, cellDates: true });
        resolve(_wb);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
  await yieldTick();

  const names = wb.SheetNames || [];
  const matchingSheets = names.filter(n => n.trim().toLowerCase().includes("clientes"));

  if (matchingSheets.length === 0) {
    pushLog(`  · No se encontraron hojas con "clientes" en ${file.name}.`);
    flushLog();
    return { affected: 0, inserted: 0, updated: 0 };
  }

  let totals = { affected: 0, inserted: 0, updated: 0 };
  // Collect routes from "clientes" sheet to re-apply at end (priority over "DATOS CLIENTES")
  const clientsSheetRoutes = new Map();

  for (const sheetName of matchingSheets) {
    pushLog(`  · Procesando hoja: "${sheetName}"`);
    flushLog();

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
      dense: true,
    });
    
    if (!rows || rows.length === 0) {
      pushLog(`    ⚠️ Hoja "${sheetName}" vacía.`);
      flushLog();
      continue;
    }

    let headerRowIdx = -1;
    const norm = (s) => normalizeHeader(s);
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const r = rows[i] || [];
      const hasCode = r.some((cell) =>
        ["cve_cliente", "cliente", "client_code", "codigo_cliente"].includes(norm(cell))
      );
      if (hasCode) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      pushLog(`    ⚠️ Cabecera no encontrada en "${sheetName}".`);
      flushLog();
      continue;
    }

    const headers = rows[headerRowIdx];
    const map = buildClientsHeaderMap(headers);
    
    // Diagnostic: log route column mapping for this sheet
    const rutaColIdx = map["cve_ruta"];
    const rutaColName = typeof rutaColIdx === "number" ? headers[rutaColIdx] : "—NO ENCONTRADA—";
    pushLog(`    · Columna ruta en "${sheetName}": ${rutaColName} (col ${rutaColIdx ?? "N/A"})`);
    flushLog();
    
    let chunk = [];
    const isMainClientesSheet = sheetName.trim().toLowerCase() === "clientes";

    async function flushChunk(label = "clients") {
      if (chunk.length === 0) return;
      try {
        const res = await importClientsApi(chunk);
        const affected = res.inserted_or_updated || 0;
        if (res.errors && res.errors.length > 0) {
          pushLog(`    · Avisos en ${sheetName}: ${res.errors.length} errores/warnings.`);
        }
        totals.affected += affected;
      } catch (e) {
        pushLog(`    · Error en lote de ${sheetName}: ${e.message || e}`);
      } finally {
        chunk = [];
        await yieldTick(150);
      }
    }

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const get = (k) => (typeof map[k] === "number" ? row[map[k]] : "");
      const code = String(get("cve_cliente") || "").trim();
      if (!code || isNAish(code)) continue;

      const name = String(get("nom_propietario") || "").trim();
      const bn = String(get("nom_negocio") || "").trim();
      const ruta = String(get("cve_ruta") || "").trim();
      const cadena = String(get("cadena") || "").trim();
      const visitDayTeleventa = String(get("visit_day_televenta") || "").trim();
      
      // Save route from "clientes" sheet (priority source)
      if (isMainClientesSheet && ruta) {
        clientsSheetRoutes.set(code, ruta);
      }
      
      const days = [];
      const isTrue = (val) => {
        if (!val) return false;
        const s = String(val).toUpperCase();
        return s === 'VERDADERO' || s === 'TRUE' || s === 'SI' || s === 'YES' || val === true || val === 1;
      };
      if (isTrue(get("vis_dom"))) days.push("domingo");
      if (isTrue(get("vis_lun"))) days.push("lunes");
      if (isTrue(get("vis_mar"))) days.push("martes");
      if (isTrue(get("vis_mie"))) days.push("miercoles");
      if (isTrue(get("vis_jue"))) days.push("jueves");
      if (isTrue(get("vis_vie"))) days.push("viernes");
      if (isTrue(get("vis_sab"))) days.push("sabado");
      
      const visitDaysStr = days.length > 0 ? days.join(",") : null;
      const zonaSheet = String(get("zona_comercial") || "").trim();
      const zonaFile = inferZonaFromFilename(file.name);
      const zonaFinal = zonaSheet || zonaFile;
      const textOnly = onlyTextLetters(cadena);

      chunk.push({
        client_code: code,
        name: name || bn || `Cliente ${code}`,
        business_name: bn || null,
        sales_route: ruta || null,
        gec: textOnly || null,
        level: textOnly || null,
        visit_day_televenta: visitDayTeleventa || null,
        visit_days: visitDaysStr,
        cadena: cadena || null,
        zona_comercial: zonaFinal || null,
        address: String(get("address") || "").trim() || null,
        colony: String(get("colony") || "").trim() || null,
        city: String(get("city") || "").trim() || null,
        phone: String(get("phone") || "").trim() || null
      });

      if (chunk.length >= CLIENTS_STREAM_CHUNK || r === rows.length - 1) {
        await flushChunk();
        if (r % (CLIENTS_STREAM_CHUNK * 2) === 0) {
          pushLog(`    · Avance "${sheetName}": ${totals.affected} registros procesados.`);
          flushLog();
        }
      }
    }
    await flushChunk(); 
  }

  // Re-apply routes from "clientes" sheet to ensure they take priority
  if (clientsSheetRoutes.size > 0) {
    pushLog(`  · Re-aplicando ${clientsSheetRoutes.size} rutas de hoja "clientes" (prioridad)...`);
    flushLog();
    const routeChunks = Array.from(clientsSheetRoutes.entries()).map(([code, route]) => ({
      client_code: code,
      sales_route: route,
    }));
    for (let i = 0; i < routeChunks.length; i += CLIENTS_STREAM_CHUNK) {
      const batch = routeChunks.slice(i, i + CLIENTS_STREAM_CHUNK);
      try {
        await importClientsApi(batch);
      } catch (e) {
        pushLog(`    · Error re-aplicando rutas: ${e.message || e}`);
      }
      await yieldTick(150);
    }
    pushLog(`  ✓ Rutas de "clientes" re-aplicadas (${clientsSheetRoutes.size} clientes).`);
    flushLog();
  }

  pushLog(`  ✓ Total Clientes afectados (MySQL): ${totals.affected}`);
  flushLog();
  return totals;
}

// ------ SKUS helpers ------
function buildSkusHeaderMap(headers) {
  const alias = {
    cve_marca: ["cve_marca", "clave_marca", "sku", "clave", "codigo", "codigo_marca"],
    des_marca: ["des_marca", "descripcion", "descripcion_marca", "desmarca", "des_marca_"],
    descorta_marca: ["descorta_marca", "des_corta_marca", "descripcion_corta"],
    hlts: ["hlts", "hls", "hectolitros", "htls"],
  };

  const map = {};
  const scores = {};

  for (let idx = 0; idx < headers.length; idx++) {
    const key = normalizeHeader(headers[idx]);
    for (const target in alias) {
      const score = alias[target].indexOf(key);
      if (score !== -1) {
        if (map[target] === undefined || score < scores[target]) {
          map[target] = idx;
          scores[target] = score;
        }
        break;
      }
    }
  }
  return map;
}

async function upsertSkusFromMarcas(file, pushLog, flushLog) {
  const wb = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        pushLog(`    · Leyendo binario de ${file.name} (marcas)...`);
        flushLog();
        await yieldTick();
        pushLog(`    · Parseando workbook (marcas)...`);
        flushLog();
        const _wb = XLSX.read(data, { type: "array", dense: true, cellDates: true });
        resolve(_wb);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
  await yieldTick();

  const names = wb.SheetNames || [];
  let sheetName = null;
  for (let n of names) {
    const ln = String(n).trim().toLowerCase();
    if (ln === "marcas" || ln.includes("marcas")) {
      sheetName = n;
      break;
    }
  }
  if (!sheetName) {
    pushLog(`  · Hoja "marcas" no encontrada.`);
    flushLog();
    return 0;
  }

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
    dense: true,
  });
  if (!rows || rows.length === 0) {
    pushLog(`  · Hoja "marcas" vacía.`);
    flushLog();
    return 0;
  }

  let headerRowIdx = -1;
  const norm = (s) => normalizeHeader(s);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const hasMarca = r.some((cell) =>
      ["cve_marca", "clave_marca", "sku", "clave", "codigo"].includes(norm(cell))
    );
    if (hasMarca) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    pushLog(`  · Cabecera no encontrada en "marcas".`);
    flushLog();
    return 0;
  }

  const headers = rows[headerRowIdx];
  const map = buildSkusHeaderMap(headers);

  let chunk = [];
  let total = 0;
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const get = (k) => (typeof map[k] === "number" ? row[map[k]] : "");

    const code = String(get("cve_marca") || "").trim();
    if (!code) continue;

    const des = String(get("des_marca") || "").trim();
    const desCorta = String(get("descorta_marca") || "").trim();
    const hltsVal = numOrNull(get("hlts"));

    const item = {
      cve_marca: code,
      des_marca: des || desCorta || code,
      hlts: hltsVal === null ? 0 : hltsVal,
    };

    chunk.push(item);

    if (chunk.length >= SKUS_STREAM_CHUNK || r === rows.length - 1) {
      const up = await supabase
        .from("skus")
        .upsert(chunk, { onConflict: "cve_marca" })
        .select("cve_marca");

      const chunkDesc = chunk.map(c => ({
        cve_marca: c.cve_marca,
        descripcion: c.des_marca
      }));
      
      const upDesc = await supabase
        .from("sku_descripcion")
        .upsert(chunkDesc, { onConflict: "cve_marca" });

      if (up.error) {
        pushLog(`  · Error skus: ${up.error.message}`);
        flushLog();
      }
      if (upDesc.error) {
        pushLog(`  · Error sku_desc: ${upDesc.error.message}`);
        flushLog();
      }
      total += (up.data || []).length;
      chunk = [];
      if (r % (SKUS_STREAM_CHUNK * 2) === 0) {
        pushLog(`  · SKUs upsert parciales: ${total}`);
        flushLog();
      }
      await yieldTick(150); // Global throttle for Hostinger
    }
  }

  pushLog(`  · SKUs upsert totales: ${total}`);
  flushLog();
  return total;
}

// ---------- Componente ----------
export default function AdminSalesImportPage() {
  const [files, setFiles] = useState([]); // [{file, sheetName, zona}]
  const [periodo, setPeriodo] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }); // 'YYYY-MM'
  const [deleteBeforeImport, setDeleteBeforeImport] = useState(true);
  const [doRefreshMV, setDoRefreshMV] = useState(true);
  const [refreshMode, setRefreshMode] = useState("month"); // 'month' | 'full'
  const [doUpdateClients, setDoUpdateClients] = useState(true);
  const [doUpdateSkus, setDoUpdateSkus] = useState(true);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState(0);
  const [previews, setPreviews] = useState([]);

  // destino de ventas
  const [ventasDestino, setVentasDestino] = useState("mysql"); // Solo MySQL

  // --- Auto-Import (email) state ---
  const [autoStatus, setAutoStatus] = useState(null);   // last run status from server
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoLog, setAutoLog] = useState([]);
  const [autoLogOpen, setAutoLogOpen] = useState(false);

  // Fetch last run status on mount
  useEffect(() => {
    async function fetchAutoStatus() {
      try {
        const res = await fetch(EMAIL_STATUS_URL);
        if (!res.ok) return;
        const data = await res.json();
        setAutoStatus(data);
        if (data.log_lines) setAutoLog(data.log_lines);
      } catch (_) {}
    }
    fetchAutoStatus();
  }, []);

  async function runAutoImport() {
    setAutoRunning(true);
    setAutoLogOpen(true);
    setAutoLog(["[" + new Date().toLocaleTimeString() + "] Iniciando importacion... procesando archivos uno por uno."]);

    const MAX_CYCLES = 10;
    const DELAY_MS = 5000;

    for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
      setAutoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] --- Ciclo ${cycle}/${MAX_CYCLES} ---`]);

      try {
        const importRes = await fetch(EMAIL_IMPORT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // First request clears stale processed IDs left by the old importer;
          // subsequent cycles continue normally and advance through Drive files.
          body: JSON.stringify({ periodo: periodo, force_reprocess: cycle === 1 })
        });
        const importData = await importRes.json().catch(() => null);
        if (!importRes.ok || importData?.success === false) {
          const details = importData?.message || importData?.error || `HTTP ${importRes.status}`;
          setAutoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Error del importador: ${details}. El archivo queda pendiente para reintento.`]);
          break;
        }
      } catch (e) {}

      // Leer logs del servidor despues de cada ciclo
      try {
        const logsRes = await fetch(EMAIL_LOGS_URL);
        const logsData = await logsRes.json();
        if (logsData.log && logsData.log.length > 0) {
          setAutoLog(logsData.log);
          const lastLines = logsData.log.slice(-5).join(" ");
          // Si no hay archivos pendientes de Drive, terminamos
          const hayPendientes = lastLines.includes("Faltan") && lastLines.includes("Drive");
          const sinCorreos = lastLines.includes("No hay correos") || lastLines.includes("ya fue importado");
          if (!hayPendientes || sinCorreos) {
            setAutoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Todos los archivos han sido importados.`]);
            break;
          }
        }
      } catch(e) {}

      if (cycle < MAX_CYCLES) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    try {
      const st = await fetch(EMAIL_STATUS_URL);
      const stData = await st.json();
      setAutoStatus(stData);
    } catch(e) {}

    setAutoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sesion de importacion completada.`]);
    setAutoRunning(false);
  }

  // --- Delete Sales Module State ---
  const KNOWN_ZONES = ["PALMARITO", "IZUCAR", "OAXACA", "SERDAN", "GPE-CHILCHOTLA"];
  const [delPeriodo, setDelPeriodo] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [delZona, setDelZona] = useState("__ALL__");
  const [delZonaCustom, setDelZonaCustom] = useState("");
  const [delDestino, setDelDestino] = useState("mysql");
  const [delLoading, setDelLoading] = useState(false);
  const [delResult, setDelResult] = useState(null);

  async function handleDeleteVentas() {
    const periodDate = firstOfMonth(delPeriodo);
    if (!periodDate) { alert("Selecciona un período válido."); return; }

    const zonaFinal = delZona === "__ALL__" ? null : delZona === "__CUSTOM__" ? (delZonaCustom.trim() || null) : delZona;
    const label = `${periodDate}${zonaFinal ? ` / zona: ${zonaFinal}` : " / TODAS las zonas"}`;
    const dest = delDestino === "supabase" ? "Supabase" : "MySQL";

    if (!window.confirm(`⚠️ ¿Estás seguro de ELIMINAR ventas de ${dest}?\n\nPeríodo: ${label}\n\nEsta acción NO se puede deshacer.`)) return;
    if (!zonaFinal && !window.confirm(`🚨 SEGUNDA CONFIRMACIÓN: Vas a borrar TODAS las zonas del período ${periodDate}. ¿Continuar?`)) return;

    setDelLoading(true);
    setDelResult(null);

    try {
      if (delDestino === "supabase") {
        const res = await supabase.rpc("delete_ventas_por_periodo", {
          p_period: periodDate,
          p_zona: zonaFinal,
        });
        if (res.error) throw res.error;
        setDelResult({ success: true, message: `✓ Ventas eliminadas de Supabase: ${label}`, rows: res.data ?? "?" });
      } else {
        const res = await fetch(MYSQL_DELETE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period_date: periodDate, zona: zonaFinal }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || "(sin respuesta)"}`);
        }
        const data = await res.json().catch(() => ({}));
        setDelResult({ success: true, message: `✓ Ventas eliminadas de MySQL: ${label}`, rows: data.deleted_rows ?? "?" });
      }
    } catch (err) {
      setDelResult({ success: false, message: `❌ Error: ${err.message || String(err)}` });
    } finally {
      setDelLoading(false);
    }
  }

  // --- Detección de rol analista ---
  const { user } = useSupabaseAuth();
  const isAnalista = useMemo(() => {
    const rawType = user?.user_metadata?.type
      || user?.user_metadata?.role
      || (user?.app_metadata?.roles && user.app_metadata.roles[0])
      || '';
    return rawType.toString().toLowerCase().replace(/[\s_-]/g, '') === 'analista';
  }, [user]);

  // Período actual (mes en curso) para lock de analista
  const currentPeriod = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const prevPeriod = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const isAdmin = useMemo(() => {
    const rawType = user?.user_metadata?.type
      || user?.user_metadata?.role
      || (user?.app_metadata?.roles && user.app_metadata.roles[0])
      || '';
    const norm = rawType.toString().toLowerCase().replace(/[\s_-]/g, '');
    return norm === 'admin' || norm === 'superadmin' || !isAnalista;
  }, [user, isAnalista]);

  useEffect(() => {
    if (isAnalista && periodo !== currentPeriod && periodo !== prevPeriod) {
      setPeriodo(currentPeriod);
    }
  }, [isAnalista, currentPeriod, prevPeriod, periodo]);

  const logRef = useRef([]);
  function pushLog(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logRef.current.push(line);
    if (logRef.current.length > 400) logRef.current.splice(0, logRef.current.length - 400);
  }
  function flushLog() {
    setLog(logRef.current.slice());
  }

  useEffect(() => {
    const onError = (e) => {
      pushLog(`❌ Error global: ${e.message || e}`);
      flushLog();
    };
    const onRejection = (e) => {
      pushLog(`❌ UnhandledRejection: ${e.reason?.message || e.reason || e}`);
      flushLog();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  function onFilesChange(e) {
    const list = e && e.target && e.target.files ? Array.from(e.target.files) : [];
    if (!list.length) {
      setFiles([]);
      setPreviews([]);
      setProgress(0);
      logRef.current = [];
      setLog([]);
      return;
    }
    const selected = list.slice(0, MAX_FILES).map((f) => ({
      file: f,
      sheetName: "VENTA",
      zona: inferZonaFromFilename(f.name) || "",
    }));
    setFiles(selected);
    setPreviews([]);
    setProgress(0);
    logRef.current = [];
    setLog([]);
  }

  function updateFileMeta(index, key, value) {
    setFiles((prev) => {
      const copy = prev.slice();
      copy[index] = { ...copy[index], [key]: value };
      return copy;
    });
  }

  async function buildHeaderMapFromFile(file, sheetName, pushLog, flushLog) {
    const wb = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          pushLog(`    · Leyendo binario de ${file.name}...`);
          flushLog();
          await yieldTick();
          pushLog(`    · Parseando workbook (XLSX.read)...`);
          flushLog();
          const _wb = XLSX.read(data, { type: "array", dense: true, cellDates: true });
          resolve(_wb);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
    await yieldTick();

    const names = wb.SheetNames || [];
    const ventaName =
      names.find((n) => String(n).trim().toLowerCase() === "venta") ||
      names.find((n) => String(n).trim().toLowerCase().includes("venta"));
    const name =
      sheetName && names.includes(sheetName)
        ? sheetName
        : ventaName
          ? ventaName
          : names[0];
    const ws = wb.Sheets[name];

    pushLog(`    · Extrayendo filas de hoja "${name}"...`);
    flushLog();
    const rows = sheetToRows(ws);
    const headers = rows.length ? rows[0] : [];
    const map = buildHeaderMap(headers);
    pushLog(`    · Encabezados detectados (${headers.length} columnas).`);
    flushLog();

    const keysToShow = ["cve_marca", "venta", "htls", "htls_total", "cve_cliente", "ruta"];
    const mapped = keysToShow
      .map((k) => `${k}:${typeof map[k] === "number" ? map[k] : "—"}`)
      .join(" | ");
    pushLog(`    · Mapeo: ${mapped}`);
    flushLog();

    return { rows, name, map };
  }

  async function previewFiles() {
    setPreviews([]);
    const output = [];
    for (let i = 0; i < files.length; i++) {
      const fmeta = files[i];
      const info = await buildHeaderMapFromFile(
        fmeta.file,
        fmeta.sheetName,
        pushLog,
        flushLog
      );
      const rows = info.rows.slice(1).slice(0, PREVIEW_MAX_ROWS);
      output.push({ filename: fmeta.file.name, sheet: info.name, sampleRows: rows });
      await yieldTick();
    }
    setPreviews(output);
    pushLog("Previsualización lista para " + output.length + " archivo(s).");
    flushLog();
  }

  async function refreshMV(monthDate) {
    if (!doRefreshMV) return;
    if (ventasDestino !== "supabase") {
      pushLog("Destino de ventas = MySQL, no se refresca MV de Supabase.");
      flushLog();
      return;
    }

    try {
      if (refreshMode === "month" && monthDate) {
        pushLog("Refrescando MV (mes): " + monthDate);
        flushLog();
        const res = await supabase.rpc("refresh_client_sales_sheet_month", {
          p_month: monthDate,
        });
        if (res.error) throw res.error;
        pushLog("MV mensual actualizada.");
      } else {
        pushLog("Refrescando MV (full)...");
        flushLog();
        const res = await supabase.rpc("refresh_client_sales_sheet_full");
        if (res.error) throw res.error;
        pushLog("MV full actualizada.");
      }
    } catch (err) {
      pushLog(
        "⚠️ No se pudo refrescar MV por RPC: " +
        (err.message || String(err)) +
        " — fallback (full)"
      );
      flushLog();
      try {
        const res2 = await supabase.rpc("refresh_client_sales_sheet_full");
        if (res2.error) throw res2.error;
        pushLog("MV full actualizada (fallback).");
      } catch (e2) {
        pushLog(
          "❌ FALLO también el fallback de MV: " + (e2.message || String(e2))
        );
      } finally {
        flushLog();
      }
    }
  }

  // Inserción con batching adaptativo + fallback fila-a-fila (VENTAS)
  async function insertVentasBuffer(buffer, fileName, destino, pushLog, flushLog) {
    async function tryInsert(chunk) {
      if (destino === "supabase") {
        const ins = await supabase
          .from("ventas_por_sku")
          .insert(chunk);
        if (ins.error) throw ins.error;
        return { ok: chunk.length, fail: 0 };
      } else {
        const res = await fetch(MYSQL_IMPORT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ventas: chunk, fileName }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          pushLog(
            `API MySQL ERROR ${res.status}: ${text && text.length ? text : "(sin cuerpo)"
            }`
          );
          flushLog();
          throw { status: res.status, message: `API MySQL ${res.status}` };
        }

        const data = await res.json().catch(() => ({}));
        const failCount = Array.isArray(data.errors) ? data.errors.length : 0;
        const okCount = data.inserted ?? Math.max(0, chunk.length - failCount);
        return {
          ok: okCount,
          fail: failCount,
        };
      }
    }

    try {
      return await tryInsert(buffer);
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      const status = e?.status || (e?.message && e.message.includes("500") ? 500 : 0);
      
      const sizeIssue =
        msg.includes("payload") ||
        msg.includes("too large") ||
        msg.includes("entity too large") ||
        msg.includes("413");

      // Si es un error de conexión (Hostinger 1226) o timeout 500, bajamos agresivamente
      const connectionIssue = msg.includes("connection") || msg.includes("1226") || status === 500;

      if (sizeIssue || connectionIssue) {
        const reason = sizeIssue ? "muy grande" : "error de conexión/500";
        pushLog(
          `⚠️ Lote de ${buffer.length} falló por ${reason} (${fileName}). Reintentando con lotes pequeños...`
        );
        flushLog();
        
        let totalOk = 0;
        let totalFail = 0;
        let start = 0;
        
        // Batching adaptativo: si falló, intentamos con trozos mucho más pequeños
        let subSize = connectionIssue ? 5 : Math.max(MIN_SUBBATCH_SIZE, Math.floor(buffer.length / 4));
        
        while (start < buffer.length) {
          const end = Math.min(buffer.length, start + subSize);
          const chunk = buffer.slice(start, end);
          try {
            // Un pequeño retraso para liberar conexiones antes de cada sub-lote
            if (connectionIssue) await yieldTick(200); 
            
            const r = await tryInsert(chunk);
            totalOk += r.ok;
            totalFail += r.fail || 0;
          } catch (e) {
            // Fallback final: fila por fila con delay real
            for (let i = 0; i < chunk.length; i++) {
              try {
                await yieldTick(connectionIssue ? 250 : 50); // Delay crítico para Hostinger
                const r = await tryInsert([chunk[i]]);
                totalOk += r.ok;
                totalFail += r.fail || 0;
              } catch (errOne) {
                totalFail += 1;
                pushLog(`   · Fila fallida permanentemente: ${errOne?.message || "Error desconocido"}`);
                flushLog();
              }
            }
          }
          start = end;
          await yieldTick(50);
        }
        return { ok: totalOk, fail: totalFail };
      }

      pushLog(`⚠️ Lote falló por otra razón (${fileName}): ${e.message || e}`);
      flushLog();
      let ok = 0,
        fail = 0;
      for (let i = 0; i < buffer.length; i++) {
        try {
          await yieldTick(20);
          const r = await tryInsert([buffer[i]]);
          ok += r.ok;
          fail += r.fail || 0;
        } catch (errOne) {
          fail++;
          pushLog(
            `   · Fila omitida (${i}): ${errOne?.message || JSON.stringify(errOne)
            }`
          );
          flushLog();
        }
      }
      return { ok, fail };
    }
  }

  async function handleImport() {
    if (!files.length) {
      alert("Selecciona entre 1 y 5 archivos.");
      return;
    }
    if (!periodo || !/^\d{4}-\d{2}$/.test(String(periodo))) {
      alert("Selecciona el período (YYYY-MM).");
      return;
    }

    setLoading(true);
    setProgress(0);
    logRef.current = [];
    setLog([]);

    try {
      const defaultPeriod = firstOfMonth(periodo);

      pushLog(
        `Destino de ventas seleccionado: ${ventasDestino === "supabase"
          ? "Supabase (tabla ventas_por_sku)"
          : "MySQL (API/PHP Hostinger)"
        }`
      );
      flushLog();

      // 0) SKUs
      if (doUpdateSkus) {
        for (let i = 0; i < files.length; i++) {
          const fmeta = files[i];
          pushLog(
            `Actualizando SKUs desde hoja "marcas" de: ${fmeta.file.name}...`
          );
          flushLog();
          await upsertSkusFromMarcas(fmeta.file, pushLog, flushLog);
          await yieldTick();
        }
      } else {
        pushLog("Saltando actualización de SKUs (toggle off).");
        flushLog();
      }

      // 1) Clients
      let clientsGrand = { affected: 0, inserted: 0, updated: 0 };
      if (doUpdateClients) {
        for (let i = 0; i < files.length; i++) {
          const fmeta = files[i];
          pushLog(`Leyendo hoja "clientes" de: ${fmeta.file.name}...`);
          flushLog();
          const res = await upsertClientsStreaming(
            fmeta.file,
            pushLog,
            flushLog
          );
          clientsGrand.affected += res.affected;
          clientsGrand.inserted += res.inserted;
          clientsGrand.updated += res.updated;
          pushLog(
            `  · ${fmeta.file.name} -> clientes afectados: ${res.affected} (insertados: ${res.inserted}, actualizados: ${res.updated})`
          );
          flushLog();
          await yieldTick();
        }
        pushLog(
          `✓ Resumen CLIENTES -> afectados: ${clientsGrand.affected} | insertados: ${clientsGrand.inserted} | actualizados: ${clientsGrand.updated}`
        );
        flushLog();
      } else {
        pushLog("Saltando actualización de clientes (toggle off).");
        flushLog();
      }

      // 2) Ventas por archivo
      let grandHtlsTotal = 0;
      const clientRoutesMap = new Map(); // cve_cliente → ruta (para cross-update clients.sales_route)

      for (let i = 0; i < files.length; i++) {
        const fmeta = files[i];
        const zonaFinal = (fmeta.zona || "").trim() || null;
        pushLog(
          `Procesando ${i + 1}/${files.length}: ${fmeta.file.name}${zonaFinal ? " [zona=" + zonaFinal + "]" : ""
          }`
        );
        flushLog();

        // 2.a) Protección contra borrado masivo sin zona en multiarchivo
        if (files.length > 1 && !zonaFinal && deleteBeforeImport) {
          pushLog("❌ Error: Se requiere especificar zona para cada archivo en importaciones múltiples para evitar borrado accidental.");
          flushLog();
          continue;
        }
        if (deleteBeforeImport && defaultPeriod) {
          if (ventasDestino === "supabase") {
            let msg = "  - Borrando detalle de " + defaultPeriod;
            if (zonaFinal) msg += " / zona=" + zonaFinal;
            pushLog(msg + " ...");
            flushLog();
            const del = await supabase.rpc("delete_ventas_por_periodo", {
              p_period: defaultPeriod,
              p_zona: zonaFinal,
            });
            if (del.error) {
              pushLog("  - Error borrando (Supabase): " + del.error.message);
              flushLog();
            }
            await yieldTick();
          } else if (ventasDestino === "mysql") {
            let msg = "  - Borrando detalle MySQL de " + defaultPeriod;
            if (zonaFinal) msg += " / zona=" + zonaFinal;
            pushLog(msg + " ...");
            flushLog();
            try {
              const res = await fetch(MYSQL_DELETE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  period_date: defaultPeriod,
                  zona: zonaFinal,
                }),
              });
              if (!res.ok) {
                const text = await res.text().catch(() => "");
                pushLog(
                  `  - Error borrando MySQL (${res.status}): ${text || "(sin cuerpo)"
                  }`
                );
              } else {
                const data = await res.json().catch(() => ({}));
                pushLog(
                  `  - MySQL borrado OK. Filas afectadas: ${data.deleted_rows ?? "?"
                  }`
                );
              }
            } catch (err) {
              pushLog(
                "  - Error borrando MySQL: " + (err.message || String(err))
              );
            }
            flushLog();
            await yieldTick();
          }
        }

        // 2.b) Parseo hoja ventas
        const info = await buildHeaderMapFromFile(
          fmeta.file,
          fmeta.sheetName,
          pushLog,
          flushLog
        );
        const rows = info.rows;
        if (!rows.length) {
          pushLog("  - Hoja vacía: " + info.name);
          flushLog();
          continue;
        }
        const map = info.map;

        const totalDataRows = Math.max(0, rows.length - 1);
        const stats = {
          read: 0,
          skippedNoMarca: 0,
          skippedNoAmounts: 0,
          inserted: 0,
          failed: 0,
          sumHtlsTotal: 0,
          rawMarcaEmpty: 0,
          rawMarcaNonEmpty: 0,
        };

        let buffer = [];
        let insertedForFile = 0;
        const get = (r, k) => (typeof map[k] === "number" ? r[map[k]] : "");

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          stats.read++;

          const obj = {
            period_date: defaultPeriod,
            ruta:
              intOrNull(get(row, "ruta")) ||
              intOrNull(get(row, "cve_ruta")) ||
              null,
            cve_cliente: textOrNull(get(row, "cve_cliente")),
            client_id: bigIntLike(get(row, "client_id")),
            num_remision: bigIntLike(get(row, "num_remision")),
            cve_venta: bigIntLike(get(row, "cve_venta")),
            cve_marca: textOrNull(get(row, "cve_marca")),
            unidades: numOrNull(get(row, "unidades")),
            unidades_obsequio: numOrNull(get(row, "unidades_obsequio")),
            precio_venta_marca: numOrNull(get(row, "precio_venta_marca")),
            descuento: numOrNull(get(row, "descuento")),
            sobreprecio_ingreso: numOrNull(get(row, "sobreprecio_ingreso")),
            sobreprecio_abono: numOrNull(get(row, "sobreprecio_abono")),
            ieps_venta: numOrNull(get(row, "ieps_venta")),
            iva_venta: numOrNull(get(row, "iva_venta")),
            ruta_express: textOrNull(get(row, "ruta_express")),
            fecha_alta: isoDateOnly(get(row, "fecha_alta")),
            sobreprecio_ahorro: numOrNull(get(row, "sobreprecio_ahorro")),
            sobreprecio_np: numOrNull(get(row, "sobreprecio_np")),
            sobreprecio_envase: numOrNull(get(row, "sobreprecio_envase")),
            precio_compra_marca: numOrNull(get(row, "precio_compra_marca")),
            ieps_compra: numOrNull(get(row, "ieps_compra")),
            iva_compra: numOrNull(get(row, "iva_compra")),
            margen_operacion: numOrNull(get(row, "margen_operacion")),
            importe_margen_operacion: numOrNull(
              get(row, "importe_margen_operacion")
            ),
            venta: numOrNull(get(row, "venta")),
            descuento_col: numOrNull(get(row, "descuento_col")),
            sp: numOrNull(get(row, "sp")),
            htls: numOrNull(get(row, "htls")),
            htls_total: numOrNull(get(row, "htls_total")),
            vta_cajas: numOrNull(get(row, "vta_cajas")),
            producto: textOrNull(get(row, "producto")),
            zona: zonaFinal,
          };

          const rawCveMarca =
            typeof map["cve_marca"] === "number" ? row[map["cve_marca"]] : "";
          if (isNAish(rawCveMarca) || String(rawCveMarca).trim() === "")
            stats.rawMarcaEmpty++;
          else stats.rawMarcaNonEmpty++;

          if (obj.htls_total != null) stats.sumHtlsTotal += obj.htls_total;

          if (!obj.cve_marca) {
            stats.skippedNoMarca++;
            if (r % 500 === 0) await yieldTick();
            continue;
          }
          if (
            !PERMISSIVE_NO_AMOUNTS &&
            obj.venta == null &&
            obj.htls == null &&
            obj.htls_total == null
          ) {
            stats.skippedNoAmounts++;
            if (r % 500 === 0) await yieldTick();
            continue;
          }

          // Collect client → route mapping for cross-update
          if (obj.cve_cliente && obj.ruta != null) {
            clientRoutesMap.set(obj.cve_cliente, String(obj.ruta));
          }

          buffer.push(obj);

          if (buffer.length >= INSERT_BATCH_SIZE || r === rows.length - 1) {
            const res = await insertVentasBuffer(
              buffer,
              fmeta.file.name,
              ventasDestino,
              pushLog,
              flushLog
            );
            insertedForFile += res.ok;
            stats.inserted += res.ok;
            stats.failed += res.fail;
            buffer = [];

            const perFile = totalDataRows
              ? Math.round(
                (insertedForFile / totalDataRows) * (100 / files.length)
              )
              : Math.round(100 / files.length);
            const basePrevFiles = Math.round((i * 100) / files.length);
            setProgress(Math.min(100, basePrevFiles + perFile));

            if (r % (INSERT_BATCH_SIZE * 2) === 0) {
              pushLog(
                `    · ${insertedForFile} / ${totalDataRows || "?"
                } insertadas (${fmeta.file.name})`
              );
              flushLog();
            }
            await yieldTick(150); // Global throttle for Hostinger
          }
        }

        if (buffer.length > 0) {
          const res = await insertVentasBuffer(
            buffer,
            fmeta.file.name,
            ventasDestino,
            pushLog,
            flushLog
          );
          insertedForFile += res.ok;
          stats.inserted += res.ok;
          stats.failed += res.fail;
          buffer = [];
        }

        grandHtlsTotal += stats.sumHtlsTotal;

        pushLog(` ✓ Archivo completado: ${fmeta.file.name}`);
        flushLog();
        pushLog(
          `    · Leídas: ${stats.read} | Insertadas OK: ${stats.inserted} | Fallidas: ${stats.failed} | Omitidas sin cve_marca: ${stats.skippedNoMarca} | Omitidas sin montos: ${stats.skippedNoAmounts}`
        );
        flushLog();
        pushLog(
          `    · cve_marca no vacío (crudo): ${stats.rawMarcaNonEmpty} | vacío/NA: ${stats.rawMarcaEmpty}`
        );
        flushLog();
        pushLog(
          `    · htls_total importados (${fmeta.file.name}): ${Number(
            stats.sumHtlsTotal
          ).toFixed(3)}`
        );
        flushLog();

        info.rows.length = 0;
        await yieldTick();
      }

      // 3) Cross-update clients.sales_route from ventas ruta data
      if (clientRoutesMap.size > 0) {
        pushLog(`Actualizando ruta de ventas en ${clientRoutesMap.size} clientes...`);
        flushLog();
        const routeUpdates = Array.from(clientRoutesMap.entries()).map(([code, route]) => ({
          client_code: code,
          sales_route: route,
        }));
        for (let i = 0; i < routeUpdates.length; i += CLIENTS_STREAM_CHUNK) {
          const chunk = routeUpdates.slice(i, i + CLIENTS_STREAM_CHUNK);
          try {
            await importClientsApi(chunk);
          } catch (e) {
            pushLog(`  ⚠️ Error actualizando rutas (lote ${Math.floor(i / CLIENTS_STREAM_CHUNK) + 1}): ${e.message || e}`);
          }
          await yieldTick(150);
        }
        pushLog(`✓ Rutas de venta actualizadas en ${clientRoutesMap.size} clientes.`);
        flushLog();
      }

      setProgress(100);
      pushLog(
        `✓ Importación terminada. HTLS_TOTAL acumulado: ${Number(
          grandHtlsTotal
        ).toFixed(3)}`
      );
      flushLog();

      await refreshMV(firstOfMonth(periodo));
    } catch (err) {
      pushLog("❌ Error general: " + (err.message || String(err)));
      flushLog();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">
          Importador de Ventas por SKU
        </h1>
        <Badge variant="secondary">
          Destino ventas:{" "}
          {ventasDestino === "supabase"
            ? "Supabase (obsoleto)"
            : "MySQL (API/PHP Hostinger)"}
        </Badge>
      </div>

      {/* ── Panel Importación Automática ─────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
        border: "1px solid rgba(139,92,246,0.35)",
        borderRadius: 16,
        padding: "20px 24px",
        boxShadow: "0 4px 32px rgba(139,92,246,0.12)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>🤖</div>
            <div>
              <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>Importación Automática por Correo</div>
              <div style={{ color: "rgba(148,163,184,0.8)", fontSize: 12 }}>almapatricia@cervezasfinas.com — Cron Job 11:30pm</div>
            </div>
          </div>

          {/* Botón ejecutar ahora */}
          <button
            id="btn-auto-import-now"
            onClick={runAutoImport}
            disabled={autoRunning}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 20px", borderRadius: 10, border: "none", cursor: autoRunning ? "not-allowed" : "pointer",
              fontWeight: 700, fontSize: 13, letterSpacing: 0.3,
              background: autoRunning
                ? "rgba(139,92,246,0.3)"
                : "linear-gradient(135deg,#7c3aed,#4f46e5)",
              color: "#fff",
              boxShadow: autoRunning ? "none" : "0 0 20px rgba(139,92,246,0.4)",
              transition: "all 0.2s",
            }}
          >
            {autoRunning ? (
              <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> Ejecutando...</>
            ) : (
              <>▶ Ejecutar Ahora</>
            )}
          </button>
        </div>

        {/* Stats del último proceso */}
        {autoStatus?.has_run ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 14 }}>
            {[
              { label: "Última ejecución", value: autoStatus.last_run ? (() => { const d = new Date(autoStatus.last_run.replace(" ","T") + "-06:00"); return d.toLocaleString("es-MX", { timeZone:"America/Mexico_City", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }); })() : "—" },
              { label: "Estado", value: autoStatus.success ? "✅ Exitoso" : "❌ Error" },
              { label: "Correos revisados", value: autoStatus.emails_checked ?? 0 },
              { label: "Archivos procesados", value: autoStatus.files_processed ?? 0 },
              { label: "Registros insertados", value: (autoStatus.total_inserted ?? 0).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.05)", borderRadius: 10,
                padding: "10px 14px", border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{ color: "rgba(148,163,184,0.7)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, marginTop: 3 }}>{String(value)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "rgba(148,163,184,0.6)", fontSize: 13, marginBottom: 14 }}>
            Sin ejecuciones previas. Haz clic en "Ejecutar Ahora" para probar.
          </div>
        )}

        {/* Resumen por zona */}
        {autoStatus?.summary?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {autoStatus.summary.map((s, i) => (
              <div key={i} style={{
                background: s.errors > 0 ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)",
                border: `1px solid ${s.errors > 0 ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.25)"}`,
                borderRadius: 8, padding: "5px 12px", fontSize: 12,
                color: s.errors > 0 ? "#fca5a5" : "#86efac",
              }}>
                <strong>{s.zona}</strong> · {s.inserted.toLocaleString()} filas
                {s.errors > 0 && <span style={{ color: "#fca5a5" }}> · {s.errors} errores</span>}
              </div>
            ))}
          </div>
        )}

        {/* Log colapsable */}
        {autoLog.length > 0 && (
          <div>
            <button
              onClick={() => setAutoLogOpen(v => !v)}
              style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "5px 14px", color: "rgba(148,163,184,0.8)",
                fontSize: 12, cursor: "pointer", marginBottom: autoLogOpen ? 8 : 0,
              }}
            >
              {autoLogOpen ? "▲ Ocultar log" : "▼ Ver log (" + autoLog.length + " líneas)"}
            </button>
            {autoLogOpen && (
              <div style={{
                background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: "10px 14px",
                maxHeight: 220, overflowY: "auto",
                fontFamily: "monospace", fontSize: 11, color: "#94a3b8",
                border: "1px solid rgba(255,255,255,0.07)",
              }}>
                {autoLog.map((line, i) => (
                  <div key={i} style={{
                    color: line.includes("ERROR") || line.includes("❌") ? "#fca5a5"
                      : line.includes("Insertadas") || line.includes("✓") || line.includes("✅") ? "#86efac"
                      : "#94a3b8",
                    lineHeight: 1.6,
                  }}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel izquierdo */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuración
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Archivos (.xlsx) - hasta {MAX_FILES}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  onChange={onFilesChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={previewFiles}
                  disabled={files.length === 0}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Previsualizar
                </Button>
              </div>
              {files.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Seleccionados: {files.length} archivo(s)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-amber-500 font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                REVISA QUE EL PERIODO A IMPORTAR SEA EL CORRECTO
              </Label>
              <Label>Período (YYYY-MM)</Label>
              <div className="relative">
                <Input
                  type="month"
                  value={periodo}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isAnalista) {
                      if (val === currentPeriod || val === prevPeriod) {
                        setPeriodo(val);
                      }
                    } else {
                      setPeriodo(val);
                    }
                  }}
                  min={isAnalista ? prevPeriod : undefined}
                  max={isAnalista ? currentPeriod : undefined}
                />
                {isAnalista && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-amber-400">
                    <Lock className="w-3 h-3" />
                    <span>Analista: solo periodo actual o anterior</span>
                  </div>
                )}
              </div>
            </div>

            {isAdmin && (
              <>
                <div className="space-y-2">
                  <Label>Destino de ventas</Label>
                  <Select
                    value={ventasDestino}
                    onValueChange={(v) => setVentasDestino(v)}
                    disabled
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="MySQL (API/PHP Hostinger)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mysql">
                        MySQL (API/PHP Hostinger)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    <b>Nota:</b> Las ventas y clientes ahora se guardan 100% en MySQL (Hostinger) para mayor capacidad.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="chk-delete"
                    checked={deleteBeforeImport}
                    onCheckedChange={(v) => setDeleteBeforeImport(Boolean(v))}
                  />
                  <Label
                    htmlFor="chk-delete"
                    className="leading-tight text-sm md:text-base"
                  >
                    Borrar detalle del período antes de importar
                    <span className="block text-xs text-muted-foreground">
                      Aplica tanto para Supabase como para MySQL (borra por
                      período + zona).
                    </span>
                  </Label>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="chk-skus"
                    checked={doUpdateSkus}
                    onCheckedChange={(v) => setDoUpdateSkus(Boolean(v))}
                  />
                  <Label htmlFor="chk-skus" className="leading-tight">
                    Actualizar tabla <code>skus</code> (Supabase) desde hoja
                    “marcas”
                  </Label>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="chk-clients"
                    checked={doUpdateClients}
                    onCheckedChange={(v) => setDoUpdateClients(Boolean(v))}
                  />
                  <Label htmlFor="chk-clients" className="leading-tight">
                    Actualizar Clientes en <b>MySQL</b> (API) desde hoja
                    “clientes” o “DATOS CLIENTES”
                  </Label>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="chk-mv"
                      checked={doRefreshMV}
                      onCheckedChange={(v) => setDoRefreshMV(Boolean(v))}
                    />
                    <Label htmlFor="chk-mv">
                      Refrescar materialized view (Supabase) al terminar
                    </Label>
                  </div>
                  <div>
                    <Label>Modo de refresh</Label>
                    <Select
                      value={refreshMode}
                      onValueChange={(v) => setRefreshMode(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Modo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">Mensual (recomendado)</SelectItem>
                        <SelectItem value="full">Completo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            <div className="pt-2">
              <Button
                type="button"
                onClick={handleImport}
                disabled={loading || files.length === 0 || !periodo}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar
                  </>
                )}
              </Button>
              <div className="mt-3">
                <Progress value={progress} />
                <div className="text-xs text-muted-foreground mt-1">
                  Progreso: {progress}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Panel derecho */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Archivos seleccionados</CardTitle>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No hay archivos seleccionados.
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2">#</th>
                        <th className="text-left p-2">Archivo</th>
                        <th className="text-left p-2">Hoja</th>
                        <th className="text-left p-2">Zona</th>
                        <th className="text-right p-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((fmeta, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 align-middle">{idx + 1}</td>
                          <td className="p-2 align-middle flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4" />
                            <span
                              className="truncate max-w-[320px]"
                              title={fmeta.file.name}
                            >
                              {fmeta.file.name}
                            </span>
                          </td>
                          <td className="p-2 align-middle">
                            <Input
                              value={fmeta.sheetName}
                              onChange={(e) =>
                                updateFileMeta(
                                  idx,
                                  "sheetName",
                                  e.target.value
                                )
                              }
                              placeholder="(VENTA por defecto)"
                            />
                          </td>
                          <td className="p-2 align-middle">
                            <Input
                              value={fmeta.zona}
                              onChange={(e) =>
                                updateFileMeta(idx, "zona", e.target.value)
                              }
                              placeholder="Zona (por archivo)"
                            />
                          </td>
                          <td className="p-2 align-middle text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setFiles((prev) => {
                                  const copy = prev.slice();
                                  copy.splice(idx, 1);
                                  return copy;
                                });
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Previsualización (primeras {PREVIEW_MAX_ROWS} filas por archivo)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previews.length === 0 ? (
                <div className="text-sm text-muted-foreground">-</div>
              ) : (
                <div className="space-y-4">
                  {previews.map((p, i) => (
                    <div key={i} className="rounded-xl border p-3">
                      <div className="mb-2 text-sm">
                        <strong>{p.filename}</strong> - hoja:{" "}
                        <em>{p.sheet}</em>
                      </div>
                      <ScrollArea className="max-h-64">
                        <pre className="text-xs bg-muted rounded-md p-3 overflow-auto">
                          {JSON.stringify(p.sampleRows, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registro</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-72">
                <pre className="text-xs bg-[#0b1021] text-[#e6e6e6] rounded-md p-3">
                  {log.length ? log.join("\n") : "-"}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========== DELETE SALES MODULE ========== */}
      {isAdmin && (
        <Card className="border-red-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Eliminar Ventas por Período / Zona
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {/* Período */}
              <div className="space-y-1">
                <Label>Período</Label>
                <Input
                  type="month"
                  value={delPeriodo}
                  onChange={(e) => setDelPeriodo(e.target.value)}
                />
              </div>

              {/* Zona */}
              <div className="space-y-1">
                <Label>Zona</Label>
                <Select value={delZona} onValueChange={(v) => setDelZona(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona zona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">🌐 TODAS las zonas</SelectItem>
                    {KNOWN_ZONES.map((z) => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                    <SelectItem value="__CUSTOM__">✏️ Otra (escribir)...</SelectItem>
                  </SelectContent>
                </Select>
                {delZona === "__CUSTOM__" && (
                  <Input
                    className="mt-1"
                    placeholder="Nombre de la zona"
                    value={delZonaCustom}
                    onChange={(e) => setDelZonaCustom(e.target.value)}
                  />
                )}
              </div>

              {/* Destino */}
              <div className="space-y-1">
                <Label>Base de datos</Label>
                <Select value={delDestino} onValueChange={(v) => setDelDestino(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mysql">MySQL (Hostinger)</SelectItem>
                    <SelectItem value="supabase">Supabase</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Botón */}
              <Button
                variant="destructive"
                onClick={handleDeleteVentas}
                disabled={delLoading || !delPeriodo}
                className="w-full"
              >
                {delLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eliminar Ventas
                  </>
                )}
              </Button>
            </div>

            {/* Resultado */}
            {delResult && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${delResult.success ? "bg-green-500/10 text-green-400 border border-green-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>
                <p className="font-medium">{delResult.message}</p>
                {delResult.rows != null && delResult.success && (
                  <p className="mt-1 text-xs opacity-80">Filas eliminadas: {delResult.rows}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
