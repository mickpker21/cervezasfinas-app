import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAllEvaluations } from "@/repositories/evaluationsRepository";
import EvaluationDetailViewer from "@/components/EvaluationDetailViewer";

// Muestra evaluaciones recientes del PDV relacionadas por nombre/negocio.
// Nota: La tabla evaluaciones_pdv actualmente no guarda client_id, así que hacemos match por nombre.
export default function ClientEvaluationsList({ client }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState(null);

  const needles = useMemo(() => {
    const arr = [];
    const a = (client?.business_name || "").trim();
    const b = (client?.name || "").trim();
    if (a) arr.push(a);
    if (b && b !== a) arr.push(b);
    return arr;
  }, [client]);

  useEffect(() => {
    const fetchEvaluations = async () => {
      if (!client?.id && !client?.client_code) return;
      setLoading(true);
      try {
        // 1. Cargar de MySQL + SQLite local (nuevo sistema unificado)
        const allRepoEvals = await getAllEvaluations({
          from: fromDate || undefined,
          to: toDate || undefined,
        }).catch(() => []);

        const cIdStr = client?.id != null ? String(client.id).trim() : "";
        const cCodeStr = String(client?.client_code || client?.code || "").trim().toLowerCase();
        const lowerNeedles = needles.map((n) => n.toLowerCase());

        const matchedRepo = (allRepoEvals || []).filter((ev) => {
          if (cIdStr && String(ev.client_id || "").trim() === cIdStr) return true;
          if (cCodeStr && String(ev.client_code || "").trim().toLowerCase() === cCodeStr) return true;
          const pv = String(ev.punto_venta || "").trim().toLowerCase();
          if (pv && lowerNeedles.some((n) => n && pv.includes(n))) return true;
          return false;
        });

        // 2. Fallback legacy Supabase
        let sbRows = [];
        try {
          if (client?.id) {
            let q = supabase
              .from("evaluaciones_pdv")
              .select("*")
              .eq("client_id", client.id)
              .order("fecha", { ascending: false })
              .limit(50);
            if (fromDate) q = q.gte("fecha", fromDate);
            if (toDate) q = q.lte("fecha", toDate);
            const byClient = await q;
            if (Array.isArray(byClient.data)) sbRows = byClient.data;
          }
        } catch {}

        const map = new Map();
        for (const r of [...matchedRepo, ...sbRows]) {
          const key = r.id || `${r.fecha || r.created_at}-${r.puntoVenta || r.punto_venta || ""}`;
          if (!map.has(key)) map.set(key, r);
        }
        const sorted = Array.from(map.values()).sort((a, b) => {
          const da = new Date(String(a.fecha || a.created_at || 0).replace(" ", "T")).getTime() || 0;
          const db = new Date(String(b.fecha || b.created_at || 0).replace(" ", "T")).getTime() || 0;
          return db - da;
        });
        setItems(sorted.slice(0, 100));
      } catch (e) {
        console.error("Error cargando evaluaciones:", e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEvaluations();
  }, [client?.id, client?.client_code, fromDate, toDate, needles]);

  return (
    <div className="mt-2">
      <div className="flex gap-2 mb-1 items-center">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="text-xs border rounded px-1 text-black bg-white crm-accent-border"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="text-xs border rounded px-1 text-black bg-white crm-accent-border ml-auto"
        />
      </div>
      {loading ? (
        <div className="text-sm text-gray-400">Cargando evaluaciones...</div>
      ) : !items.length ? (
        <div className="text-sm crm-accent-text">Sin evaluaciones recientes</div>
      ) : (
        <ul className="text-xs text-gray-700 space-y-1">
          {items.map((ev, idx) => {
            const fecha = ev.fecha || ev.created_at || "";
            const puntaje = ev.puntajeTotal ?? ev.puntaje_total ?? ev.puntaje ?? null;
            return (
              <li
                key={ev.id || idx}
                className="border-b last:border-b-0 pb-1 cursor-pointer hover:crm-accent-soft-bg"
                onClick={() => setSelected(ev)}
              >
                <span className="font-semibold">{String(fecha).slice(0, 10)}</span>
                {typeof puntaje === "number" && (
                  <span> · Puntaje: {puntaje}</span>
                )}
                {!(typeof puntaje === "number") && ev.puntoVenta && (
                  <span> · {ev.puntoVenta}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-2xl bg-slate-900 text-white border-slate-700 max-h-[85vh] overflow-y-auto" aria-describedby="desc-eval-detail-dialog">
          <div id="desc-eval-detail-dialog" className="sr-only">Detalle completo de la evaluación seleccionada</div>
          <DialogHeader>
            <DialogTitle>Detalle de Evaluación</DialogTitle>
          </DialogHeader>
          {selected && (
            <EvaluationDetailViewer evaluation={{ ...(selected.payload || {}), ...selected, tipo: selected.tipo || 'PDV' }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
