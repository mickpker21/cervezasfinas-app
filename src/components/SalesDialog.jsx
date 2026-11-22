// SalesDialog.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { getSalesBySku } from "@/repositories/salesRepository";
import { calculateProductPrice } from "@/lib/pricingEngine";
import { fetchShopProducts } from "@/repositories/shopRepository";
import { getLocalProducts } from "@/repositories/productsRepository";
import { getLocalPricingRules } from "@/repositories/pricingRepository";
import { X } from "lucide-react";
import { getProductImageUrl } from "@/lib/imageCatalog";

// ---------- helpers ----------
const toNumOrNull = (v) => {
  const s = String(v ?? "").trim();
  return s && /^\d+$/.test(s) ? Number(s) : null;
};
const keyVariants = (k) => {
  const s = String(k ?? "").trim();
  const n = toNumOrNull(s);
  return n !== null ? [s, String(n)] : [s];
};

export default function SalesDialog({ client, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  });

  const [orders, setOrders] = useState([]);
  const [selectedRemision, setSelectedRemision] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Pricing State
  const [pricingRules, setPricingRules] = useState({});
  const [productMap, setProductMap] = useState({}); // Stores hydrated products with prices

  // Load Pricing Rules
  useEffect(() => {
    let active = true;
    getLocalPricingRules().then(rules => {
      if (active) setPricingRules(rules);
    });
    return () => { active = false; };
  }, [client]);

  const getEffectiveRange = () => {
    if (month) {
      const [yearStr, monthStr] = month.split("-");
      const year = Number(yearStr);
      const monthIndex = Number(monthStr) - 1;
      if (!Number.isNaN(year) && !Number.isNaN(monthIndex)) {
        const start = new Date(Date.UTC(year, monthIndex, 1));
        const end = new Date(Date.UTC(year, monthIndex + 1, 0));
        return {
          s: start.toISOString().slice(0, 10),
          e: end.toISOString().slice(0, 10),
        };
      }
    }
    if (startDate || endDate) return { s: startDate, e: endDate };
    const now = new Date();
    const s = new Date(now);
    s.setDate(s.getDate() - 90);
    return { s: s.toISOString().slice(0, 10), e: now.toISOString().slice(0, 10) };
  };

  // ---------- fetch ventas_por_sku ----------
  const fetchSales = useCallback(async () => {
    if (!client?.client_code) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSelectedRemision(null);
    setItems([]);
    try {
      const { s, e } = getEffectiveRange();
      const allRows = await getSalesBySku({ 
        from: s, 
        to: e, 
        cve_cliente: client.client_code 
      });
      // We no longer need to filter manually in frontend for normal cases
      // directly setting the result from backend
      setRows(allRows);
    } catch (err) {
      console.error("ventas_por_sku error:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [client?.client_code, startDate, endDate, month]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // ---------- agrupa por num_remision ----------
  useEffect(() => {
    const m = {};
    for (const r of rows) {
      const rem = r.num_remision ?? "SIN_REMISION";
      if (!m[rem]) m[rem] = { num_remision: rem, fecha: r.fecha_alta, totalHlts: 0, totalCajas: 0, lineCount: 0 };
      m[rem].lineCount += 1;
      m[rem].totalHlts += Number(r.htls_total) || 0;
      m[rem].totalCajas += Number(r.unidades) || 0;
      if (r.fecha_alta && new Date(r.fecha_alta) > new Date(m[rem].fecha)) m[rem].fecha = r.fecha_alta;
    }
    setOrders(Object.values(m).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
  }, [rows]);

  // ---------- helper de precios (memoria) ----------
  // Carga productos y calcula precios (Hybrid Strategy)
  const hydrateProducts = async (skuList) => {
    if (!skuList.length) return {};

    // 1. Local Base
    const local = await getLocalProducts();

    // 2. Shop API (Client Specific)
    let shopProducts = [];
    try {
      if (client?.client_code) {
        shopProducts = await fetchShopProducts(client.client_code);
      }
    } catch (e) {
      console.warn("Could not fetch shop products", e);
    }

    const shopMap = new Map();
    shopProducts.forEach(sp => shopMap.set(String(sp.cve_marca), sp));

    const map = {};

    // Process only requested SKUs for efficiency? Or all local?
    // Let's iterate local to find matches for our SKU list (normalized)
    // Actually, we need to map the SKU list to products.

    for (const skuRaw of skuList) {
      const sku = String(skuRaw).trim();
      // Find in Shop first
      let p = shopMap.get(sku);
      let source = 'shop';

      if (!p) {
        // Find in Local
        p = local.find(lp => String(lp.cve_marca) === sku);
        source = 'local';
      }

      if (!p) continue; // Product not found in catalog

      // Prepare for Calc
      const base = Number(p.price || p.current_price || p.precio || 0);
      const pNormal = { ...p, price: base, current_price: base };

      // Calculate Price
      // We always use local calculation to ensure we have the breakdown logic correct for GEC/Promos
      // even if we used Shop data (unless Shop data has pre-calculated breakdown, but Autoventa keeps it hybrid)
      const calc = calculateProductPrice(pNormal, client, pricingRules);

      map[sku] = {
        ...p,
        price: calc.finalPrice,
        originalPrice: calc.basePrice,
        breakdown: calc.breakdown,
        description: p.des_marca || p.name || 'Sin Descripción',
        image_url: getProductImageUrl(sku)
      };
    }

    return map;
  };

  // ---------- abre pedido ----------
  const openOrder = useCallback(
    async (remision) => {
      setSelectedRemision(remision);
      setItemsLoading(true);
      try {
        const orderItems = rows.filter((r) => String(r.num_remision) === String(remision));

        // Get Unique SKUs
        const skus = Array.from(new Set(orderItems.map((it) => String(it.cve_marca ?? "").trim()).filter(Boolean)));

        // Hydrate Products (Images/Desc only) - Price from DB
        const pMap = await hydrateProducts(skus);
        setProductMap(pMap);

        // Enrich Items with Prices from Historical Data
        const enriched = orderItems.map(it => {
          const sku = String(it.cve_marca ?? "").trim();
          const product = pMap[sku] || {};

          // USE REAL HISTORICAL DATA
          const price = Number(it.precio_venta_marca) || 0;
          const total = Number(it.venta) || 0;

          return {
            ...it,
            price: price,
            total: total,
            product
          };
        });

        setItems(enriched);
      } catch (e) {
        console.error("Error opening order", e);
      } finally {
        setItemsLoading(false);
      }
    },
    [rows, client, pricingRules]
  );

  // ---------- totales ----------
  const rangeTotals = useMemo(
    () => ({
      hl: rows.reduce((a, r) => a + (Number(r.htls_total) || 0), 0),
      cajas: rows.reduce((a, r) => a + (Number(r.unidades) || 0), 0),
      money: rows.reduce((a, r) => a + (Number(r.venta) || 0), 0),
    }),
    [rows]
  );

  const orderTotals = useMemo(() => {
    if (!selectedRemision || items.length === 0) return null;
    return {
      hl: items.reduce((a, it) => a + (Number(it.htls_total) || 0), 0),
      cajas: items.reduce((a, it) => a + (Number(it.unidades) || 0), 0),
      money: items.reduce((a, it) => a + (Number(it.total) || Number(it.venta) || 0), 0)
    };
  }, [selectedRemision, items]);

  const shownHl = (orderTotals ? orderTotals.hl : rangeTotals.hl) || 0;
  const shownBox = (orderTotals ? orderTotals.cajas : rangeTotals.cajas) || 0;
  const shownMoney = (orderTotals ? orderTotals.money : rangeTotals.money) || 0;
  const shownLabel = orderTotals ? "Totales del pedido" : "Totales del rango";

  const closeOrder = () => {
    setSelectedRemision(null);
    setItems([]);
  };

  return (
    <Dialog open={!!client} onOpenChange={(open) => { if (!open && onClose) onClose(); }}>
      <DialogContent className="grid w-full max-w-6xl gap-4 border border-slate-700 bg-slate-900 p-0 shadow-lg sm:rounded-lg h-full max-h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header with built-in styling, removing manual fix/positioning */}
        <DialogHeader className="border-b border-slate-700 px-4 py-3 sm:px-6 flex flex-row items-center justify-between shrink-0">
          <DialogTitle className="text-lg sm:text-xl text-slate-100 truncate pr-8">
            Ventas por pedido - {client?.name ?? ""}
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="flex flex-1 min-h-0 flex-col px-4 py-4 sm:px-6 sm:py-6 gap-6 overflow-y-auto">
          {/* Filtros */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 shrink-0">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-400">Desde</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (month) setMonth("");
                }}
                className="border-slate-700 bg-slate-800/60 text-slate-100"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-400">Hasta</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (month) setMonth("");
                }}
                className="border-slate-700 bg-slate-800/60 text-slate-100"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-400">Mes</label>
              <Input
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  if (e.target.value) {
                    setStartDate("");
                    setEndDate("");
                  }
                }}
                className="border-slate-700 bg-slate-800/60 text-slate-100"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={fetchSales} className="w-full bg-emerald-600 text-white hover:bg-emerald-500">
                Aplicar
              </Button>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">{shownLabel}</div>
              <div className="mt-2 text-lg font-semibold">HL: {shownHl.toFixed(2)}</div>
              <div className="text-sm text-slate-300">Cajas: {shownBox.toLocaleString("es-MX")}</div>
              <div className="text-sm font-bold text-emerald-400 mt-1">${shownMoney.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-6 lg:flex-row">
            {/* Izquierda: pedidos */}
            <div className="flex-1 lg:flex-[2] flex flex-col min-h-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                <h2 className="text-lg font-semibold text-slate-100">Pedidos recientes</h2>
                <div className="text-xs text-slate-400">
                  {loading ? "Cargando..." : `${orders.length} pedidos`}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-800/60 shadow-lg flex-1 overflow-hidden flex flex-col">
                {loading ? (
                  <div className="p-6 text-center text-slate-300">Cargando ventas...</div>
                ) : orders.length === 0 ? (
                  <div className="p-6 text-center text-slate-300">
                    No se encontraron ventas en el periodo seleccionado.
                  </div>
                ) : (
                  <div className="overflow-y-auto flex-1">
                    <div className="divide-y divide-slate-700">
                      {orders.map((o) => (
                        <div
                          key={o.num_remision}
                          className={`p-4 transition cursor-pointer ${selectedRemision === o.num_remision
                            ? "bg-emerald-900/40 border-l-4 border-emerald-500"
                            : "hover:bg-slate-800/50"
                            }`}
                          onClick={() => openOrder(o.num_remision)}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <div className="text-sm text-slate-400">
                                {o.fecha ? format(new Date(o.fecha), "dd/MM/yyyy") : "Sin fecha"}
                              </div>
                              <div className="text-lg font-semibold text-slate-100">
                                Remision #{o.num_remision}
                              </div>
                            </div>
                            <div className="text-right text-sm text-slate-200">
                              <div>{o.totalHlts.toFixed(2)} HL</div>
                              <div>{o.totalCajas.toLocaleString("es-MX")} cajas</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Derecha: detalle */}
            {selectedRemision && items.length > 0 && (
              <div className="flex-1 lg:flex-[3] flex flex-col min-h-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <h3 className="text-base font-semibold text-slate-200">
                    Pedido #{selectedRemision}
                  </h3>
                  <Button
                    variant="outline"
                    onClick={closeOrder}
                    className="lg:hidden border-slate-700 text-slate-200 hover:bg-slate-800/60"
                  >
                    Cerrar Detalle
                  </Button>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-0 shadow-lg flex-1 overflow-hidden flex flex-col">
                  {itemsLoading ? (
                    <div className="p-4 text-slate-300">Cargando detalle...</div>
                  ) : (
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="sticky top-0 bg-slate-800/90 backdrop-blur z-10 shadow-sm">
                          <tr className="text-xs uppercase text-slate-300 font-bold border-b border-slate-700">
                            <th className="px-3 py-3 w-12">Img</th>
                            <th className="px-3 py-3">Producto</th>
                            <th className="px-3 py-3 text-right">Cant.</th>
                            <th className="px-3 py-3 text-right">Precio</th>
                            <th className="px-3 py-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                          {items.map((it, idx) => {
                            const sku = String(it.cve_marca ?? "").trim();
                            const prod = it.product || {};
                            const img = prod.image_url;
                            const desc = prod.des_marca || prod.description || "Sin descripción";

                            return (
                              <tr key={`${selectedRemision}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                                <td className="px-3 py-2">
                                  {img ? (
                                    <img
                                      src={img}
                                      alt={sku}
                                      className="h-10 w-10 rounded object-contain bg-white/5"
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded bg-slate-700 flex items-center justify-center text-[9px] text-slate-400">
                                      N/A
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-slate-200">{desc}</div>
                                  <div className="font-mono text-xs text-slate-500">{sku}</div>
                                </td>
                                <td className="px-3 py-2 text-right text-slate-200">
                                  <div className="font-bold">{Number(it.unidades)?.toLocaleString("es-MX")}</div>
                                  <div className="text-[10px] text-slate-500">{Number(it.htls_total)?.toFixed(2)} HL</div>
                                </td>
                                <td className="px-3 py-2 text-right text-slate-200">
                                  ${(it.price || 0).toFixed(2)}
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-400">
                                  ${(it.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile-friendly Footer Close */}
        <DialogFooter className="border-t border-slate-700 px-4 py-3 sm:px-6 sm:hidden shrink-0">
          <Button onClick={onClose} variant="secondary" className="w-full h-12 text-lg">
            Cerrar Ventana
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

