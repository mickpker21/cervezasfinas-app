import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
      if (!client?.id) return;
      setLoading(true);
      try {
        // Intentar primero por client_id si la tabla lo tiene poblado
        let q = supabase
          .from("evaluaciones_pdv")
          .select("*")
          .eq("client_id", client.id)
          .order("fecha", { ascending: false })
          .limit(100);
        if (fromDate) q = q.gte("fecha", fromDate);
        if (toDate) q = q.lte("fecha", toDate);
        const byClient = await q;
        let rows = Array.isArray(byClient.data) ? byClient.data : [];

        // Fallback: si no hay resultados por client_id, buscar por nombre del negocio en columnas conocidas
        if ((!rows || rows.length === 0) && needles.length) {
          const queries = [];
          const cols = ["punto_venta"]; // usar snake_case compatible
          needles.forEach((needle) => {
            cols.forEach((col) => {
              let qq = supabase
                .from("evaluaciones_pdv")
                .select("*")
                .ilike(col, `%${needle}%`)
                .order("fecha", { ascending: false })
                .limit(25);
              if (fromDate) qq = qq.gte("fecha", fromDate);
              if (toDate) qq = qq.lte("fecha", toDate);
              queries.push(qq);
            });
          });
          const results = await Promise.all(queries.map((qq) => qq));
          rows = results
            .filter((r) => !r.error && Array.isArray(r.data))
            .flatMap((r) => r.data);
        }

        // De-duplicar por id si existe, si no por combinación fecha+puntoVenta
        const map = new Map();
        for (const r of rows) {
          const key = r.id || `${r.fecha || r.created_at}-${r.puntoVenta || r.punto_venta || ""}-${r.user_id || ""}`;
          if (!map.has(key)) map.set(key, r);
        }
        // Ordenar por fecha desc (fallback a created_at)
        const sorted = Array.from(map.values()).sort((a, b) => {
          const da = new Date(a.fecha || a.created_at || 0).getTime();
          const db = new Date(b.fecha || b.created_at || 0).getTime();
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
  }, [client?.id, fromDate, toDate, needles]);

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
        <DialogContent aria-describedby="desc-eval-detail-dialog">
          <div id="desc-eval-detail-dialog" className="sr-only">Detalle completo de la evaluación seleccionada</div>
          <DialogHeader>
            <DialogTitle>Detalle de Evaluación</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm text-black">
              <div><b>Fecha:</b> {String(selected.fecha || selected.created_at || "").slice(0, 16)}</div>
              {selected.puntoVenta || selected.punto_venta ? (
                <div><b>Punto de venta:</b> {selected.puntoVenta || selected.punto_venta}</div>
              ) : null}
              {selected.nivel || selected.tipoCliente || selected.tipo_cliente ? (
                <div><b>Nivel:</b> {selected.nivel || selected.tipoCliente || selected.tipo_cliente}</div>
              ) : null}
              {selected.puntajeTotal ?? selected.puntaje_total ?? selected.puntaje ? (
                <div><b>Puntaje:</b> {selected.puntajeTotal ?? selected.puntaje_total ?? selected.puntaje}</div>
              ) : null}
              {Array.isArray(selected.advertencias) && selected.advertencias.length > 0 && (
                <div>
                  <b>Advertencias:</b>
                  <ul className="list-disc ml-5">
                    {selected.advertencias.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {/* Otros campos útiles si existieran */}
              {selected.enfriadorPrimeraPos !== undefined && (
                <div><b>Enfriador 1ra Pos:</b> {String(selected.enfriadorPrimeraPos)}</div>
              )}
              {selected.productividad && (
                <div><b>Productividad:</b> {String(selected.productividad)}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
