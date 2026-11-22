// src/pages/BrandScorecardPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/supabaseClient";
import { getSalesBySku } from "@/repositories/salesRepository";
import { getClients, getClientsByCodes } from "@/repositories/clientsRepository";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { kvStorage } from "@/services/kvStorage";
import { getSkuBrandMap, getAllowedZonas as getMetaZonas, getAllowedRoutes as getMetaRoutes } from "@/repositories/metadataRepository";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/* ================= Helpers ================= */
const strip = (s) => (s ?? "").toString().trim();
const norm = (s) => strip(s).toUpperCase();
const isYYYYMM = (x) => /^\d{4}-\d{2}$/.test(String(x));
const endOfMonthISO = (y, m) => new Date(y, m, 0).toISOString().slice(0, 10);
const startFromYYYYMM = (ym) => (isYYYYMM(ym) ? `${ym}-01` : null);
const nextFromYYYYMM = (ym) => {
  if (!isYYYYMM(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const brandDisplay = (s) => (s ?? "").toString().trim();
const brandKey = (s) => brandDisplay(s).toUpperCase().replace(/\s+/g, " ");
const brandFile = (s) => encodeURIComponent(brandDisplay(s)) + ".png";

const routeKey = (s) => norm(s).replace(/[^A-Z0-9]/g, "");
const clientCodeKey = (s) => norm(strip(s)).replace(/[^A-Z0-9]/g, "");

const isZeroLike = (s) => {
  const t = strip(s);
  if (!t) return false;
  if (/^0+(\.0+)?$/.test(t)) return true;
  if (/^\d+$/.test(t) && Number(t) === 0) return true;
  return false;
};

function periodRangeFrom(period, includeToday) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString().slice(0, 10);
  const isPicker = isYYYYMM(period);
  const from = isPicker ? startFromYYYYMM(period) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextFrom = isPicker ? nextFromYYYYMM(period) : null;
  const monthEnd = isPicker ? endOfMonthISO(...period.split("-").map(Number)) : endOfMonthISO(now.getFullYear(), now.getMonth() + 1);
  let to = includeToday ? today : yesterday;
  if (to > monthEnd) to = monthEnd;
  if (isPicker && to < from) to = from;
  return { from, to, nextFrom, isPicker };
}

/* ============ Marcas por defecto ============ */
const DEFAULT_BRANDS = ["XX", "TECATE", "CARTA BLANCA", "SOL", "HEINEKEN", "MILLER", "SUPERIOR"];

/* ================= Página ================= */
export default function BrandScorecardPage() {
  const { user } = useSupabaseAuth();

  /* Periodo */
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [includeToday, setIncludeToday] = useState(false);
  const pr = useMemo(() => periodRangeFrom(period, includeToday), [period, includeToday]);

  const periodLabel = useMemo(() => {
    if (!isYYYYMM(period)) return "mes actual";
    const [y, m] = period.split("-").map(Number);
    try { return new Date(y, m - 1, 1).toLocaleString("es-ES", { month: "long", year: "numeric" }); }
    catch { return period; }
  }, [period]);

  /* Zonas / Rutas (permisos) */
  const [allowedZonas, setAllowedZonas] = useState([]);
  const [allowedRoutes, setAllowedRoutes] = useState([]);
  const [selectedZona, setSelectedZona] = useState("__ALL__");
  const [selectedRoute, setSelectedRoute] = useState("__ALL__");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;

      // 1. Try LocalStorage
      try {
        const z = await kvStorage.getItem('supervisor_allowed_zonas');
        const r = await kvStorage.getItem('supervisor_allowed_sales_routes');
        if (z && r) {
          setAllowedZonas(z);
          setAllowedRoutes(r);
          setSelectedZona(z.length > 1 ? "__ALL__" : (z[0] ?? "__ALL__"));
          setSelectedRoute("__ALL__");
          // If we have cached data, we can return early or continue to update in bg
        }
      } catch (e) { }

      try {
        const [zList, routesMeta] = await Promise.all([
          getMetaZonas(user.id),
          getMetaRoutes(user.id)
        ]);
        if (!active) return;
        
        const z = (zList || []).filter(Boolean);
        const r = (routesMeta?.sales || []).filter(Boolean);

        setAllowedZonas(z);
        setAllowedRoutes(r);
        
        // Update cache just in case
        kvStorage.setItem('supervisor_allowed_zonas', z).catch(e => { });
        kvStorage.setItem('supervisor_allowed_sales_routes', r).catch(e => { });

        if (!allowedZonas.length) {
          setSelectedZona(z.length > 1 ? "__ALL__" : (z[0] ?? "__ALL__"));
          setSelectedRoute("__ALL__");
        }
      } catch (e) {
        if (active && !allowedZonas.length) { setAllowedZonas([]); setAllowedRoutes([]); }
      }
    })();
    return () => { active = false; };
  }, [user]);

  /* Marcas disponibles + preselección */
  const [availableBrands, setAvailableBrands] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const brandMap = await getSkuBrandMap();
      const marcas = Array.from(brandMap.values());
      const uniq = Array.from(new Set(marcas.map(m => brandDisplay(m)).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, "es"));
      if (!active) return;
      setAvailableBrands(uniq);
      const defaults = DEFAULT_BRANDS.filter(d => uniq.some(u => brandKey(u) === brandKey(d)));
      setSelectedBrands(defaults);
    })();
    return () => { active = false; };
  }, []);

  const toggleBrandChip = (name) => {
    setSelectedBrands(prev => {
      const has = prev.some(b => brandKey(b) === brandKey(name));
      return has ? prev.filter(b => brandKey(b) !== brandKey(name)) : [...prev, name];
    });
  };

  /* ========== Clientes (para fallback de ruta) ========== */
  const [clients, setClients] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const all = await getClients();
        if (active) setClients(all || []);
      } catch (e) { if (active) setClients([]); }
    })();
    return () => { active = false; };
  }, []);

  const getClientCode = (c) => strip(c?.client_code || c?.code || c?.cve_cliente || c?.clave_cliente || c?.id || "");
  const clientsByKey = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) {
      const code = getClientCode(c); if (!code) continue;
      map.set(clientCodeKey(code), c);
    }
    return map;
  }, [clients]);

  /* ========== Normalización de ruta (igual Dashboard) ========== */
  const routeFromRow = (r) => {
    const rx = strip(r?.ruta_express);
    if (rx && !isZeroLike(rx)) return rx;

    const rn = r?.ruta; const n = Number(rn);
    if (Number.isFinite(n) && n > 0) return String(n);
    if (typeof rn === "string" && rn && !isZeroLike(rn)) return strip(rn);

    const codeKey = clientCodeKey(r?.cve_cliente);
    const c = clientsByKey.get(codeKey);
    const alt = strip(c?.sales_route || c?.ruta || c?.internal_route || c?.route);
    return alt && !isZeroLike(alt) ? alt : null;
  };

  /* ========== Dataset base (ventas_por_sku) ========== */
  const [vpsRows, setVpsRows] = useState([]);
  const [vpsLoading, setVpsLoading] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      setVpsLoading(true);
      try {
        const { from, to, nextFrom, isPicker } = pr;
        const rows = await getSalesBySku({
          from,
          to,
          nextFrom: isPicker ? nextFrom : undefined,
          zona: selectedZona && selectedZona !== "__ALL__" ? strip(selectedZona) : undefined,
        });
        if (active) setVpsRows(rows || []);
      } finally {
        if (active) setVpsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [pr, selectedZona]);

  /* ========== Rutas visibles y alcance ========== */
  const zoneRoutes = useMemo(() => {
    if (selectedZona === "__ALL__") return allowedRoutes || [];
    const set = new Set();
    for (const r of vpsRows || []) {
      const z = strip(r.zona);
      if (!z) continue;
      if (norm(z).includes(norm(selectedZona)) || norm(selectedZona).includes(norm(z))) {
        const raw = routeFromRow(r);
        if (raw) set.add(strip(raw));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [selectedZona, vpsRows, allowedRoutes, clientsByKey]);

  const scopeRoutes = useMemo(() => {
    if (selectedRoute !== "__ALL__") return [selectedRoute];
    if (selectedZona !== "__ALL__") return zoneRoutes || [];
    return allowedRoutes || [];
  }, [selectedRoute, selectedZona, zoneRoutes, allowedRoutes]);

  const rowsInScope = useMemo(() => {
    if (selectedRoute === "__ALL__") return vpsRows;
    const wanted = (scopeRoutes || []).map(strip).filter(Boolean);
    if (!wanted.length) return vpsRows;
    const W = new Set(wanted.map(routeKey));
    return (vpsRows || []).filter(r => {
      const raw = routeFromRow(r);
      if (!raw) return false;
      return W.has(routeKey(raw));
    });
  }, [vpsRows, scopeRoutes, selectedRoute, clientsByKey]);

  /* ===== UNIVERSO (clientes con venta) ===== */
  const [clientsIndex, setClientsIndex] = useState(new Map());
  const universeCodes = useMemo(() => {
    const set = new Set(
      (rowsInScope || [])
        .filter(r => (Number(r.htls_total) || 0) > 0)
        .map(r => strip(r.cve_cliente))
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [rowsInScope]);

  useEffect(() => {
    let active = true;
    (async () => {
      const idxMap = new Map();
      const codes = universeCodes;
      const CHUNK = 1000;
      for (let i = 0; i < codes.length; i += CHUNK) {
        const slice = codes.slice(i, i + CHUNK);
        // Use Repository for batch fetch by client_codes
        const data = await getClientsByCodes(slice);

        for (const c of (data || [])) {
          idxMap.set(strip(c.client_code), {
            client_code: strip(c.client_code),
            name: strip(c.name),
            business_name: strip(c.business_name),
          });
        }
      }
      if (active) setClientsIndex(idxMap);
    })();
    return () => { active = false; };
  }, [universeCodes]);

  /* ===== Mapeo global cve_marca -> marca (para contadores) ===== */
  const [brandByCveAll, setBrandByCveAll] = useState(new Map());
  useEffect(() => {
    let active = true;
    (async () => {
      const cves = Array.from(new Set((rowsInScope || []).map(r => strip(r.cve_marca)).filter(Boolean)));
      if (!cves.length) { if (active) setBrandByCveAll(new Map()); return; }
      const rMap = await getSkuBrandMap(cves);
      const m = new Map();
      for (const [k, v] of rMap.entries()) {
        m.set(k.toUpperCase(), brandDisplay(v) || null);
      }
      if (active) setBrandByCveAll(m);
    })();
    return () => { active = false; };
  }, [rowsInScope]);

  /* ===== Zonas × Marcas (global por zona) ===== */
  const [zonesBrandCoverage, setZonesBrandCoverage] = useState([]);
  useEffect(() => {
    (async () => {
      // zonas visibles
      let zonas = [];
      if (selectedZona !== "__ALL__") zonas = [selectedZona];
      else if ((allowedZonas || []).length > 0) zonas = [...allowedZonas];
      else {
        const zs = Array.from(new Set((vpsRows || []).map(r => strip(r.zona)).filter(Boolean)));
        zonas = zs.sort((a, b) => a.localeCompare(b, "es"));
      }
      if (!zonas.length) { setZonesBrandCoverage([]); return; }

      const selBK = new Set(selectedBrands.map(b => brandKey(b)));
      const out = [];

      for (const zona of zonas) {
        const rowsZ = (vpsRows || []).filter(r => {
          const z = strip(r.zona);
          return z && (norm(z).includes(norm(zona)) || norm(zona).includes(norm(z)));
        });

        // filtra por ruta si aplica
        const rowsScoped = (selectedRoute === "__ALL__") ? rowsZ : rowsZ.filter(r => {
          const raw = routeFromRow(r); if (!raw) return false;
          return routeKey(raw) === routeKey(selectedRoute);
        });

        const universe = new Set();
        const brandClients = new Map(); // brandKey -> Set(code)
        const anySelected = new Set();  // union de marcas filtradas

        for (const r of rowsScoped) {
          const code = strip(r.cve_cliente);
          const v = Number(r.htls_total) || 0;
          if (!code || v <= 0) continue;
          universe.add(code);

          const bk = brandKey(brandByCveAll.get(strip(r.cve_marca).toUpperCase()) || "");
          if (!bk) continue;

          if (selBK.has(bk)) {
            anySelected.add(code); // union
            if (!brandClients.has(bk)) brandClients.set(bk, new Set());
            brandClients.get(bk).add(code);
          }
        }

        const brands = {};
        for (const b of selectedBrands) {
          brands[b.toUpperCase()] = brandClients.get(brandKey(b))?.size || 0;
        }
        out.push({ zone: zona, universe: universe.size, anyCount: anySelected.size, brands });
      }

      setZonesBrandCoverage(out);
    })();
  }, [selectedZona, allowedZonas, selectedBrands, vpsRows, selectedRoute, clientsByKey, brandByCveAll]);

  /* ===== Totales de zonas (para fila "Total zonas") ===== */
  const zonesTotals = useMemo(() => {
    const uni = zonesBrandCoverage.reduce((a, z) => a + (Number(z.universe) || 0), 0);
    const any = zonesBrandCoverage.reduce((a, z) => a + (Number(z.anyCount) || 0), 0);
    const counts = {};
    for (const b of selectedBrands) {
      const bk = b.toUpperCase();
      counts[bk] = zonesBrandCoverage.reduce((a, z) => a + (Number(z.brands[bk] || 0)), 0);
    }
    return { universe: uni, anyCount: any, brandCounts: counts };
  }, [zonesBrandCoverage, selectedBrands]);

  /* ===== Buscador + paginación sobre universo (solo UI) ===== */
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { setPage(1); }, [universeCodes.length, search]);

  const filteredCodes = useMemo(() => {
    if (!search) return universeCodes;
    const q = norm(search);
    return universeCodes.filter(code => {
      const c = clientsIndex.get(code) || {};
      const name = norm(c.name || "");
      const bn = norm(c.business_name || "");
      return code.toUpperCase().includes(q) || name.includes(q) || bn.includes(q);
    });
  }, [universeCodes, clientsIndex, search]);

  const clientsTotal = filteredCodes.length;
  const totalPages = Math.max(1, Math.ceil(clientsTotal / PAGE_SIZE));

  const clientsPage = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE;
    const codes = filteredCodes.slice(from, to);
    return codes.map(code => {
      const c = clientsIndex.get(code) || {};
      return {
        client_code: code,
        name: c.name || c.business_name || `Cliente ${code}`,
        business_name: c.business_name || null,
      };
    });
  }, [filteredCodes, clientsIndex, page]);

  /* ===== Ventas SOLO para los clientes de la página ===== */
  const [salesRows, setSalesRows] = useState([]);
  useEffect(() => {
    const codes = new Set(clientsPage.map(c => strip(c.client_code)).filter(Boolean));
    const filtered = (rowsInScope || []).filter(r => codes.has(strip(r.cve_cliente)));
    setSalesRows(filtered);
  }, [clientsPage, rowsInScope]);

  /* ===== Lookup cve_marca -> marca (para la página) ===== */
  const [brandByCvePage, setBrandByCvePage] = useState(new Map());
  useEffect(() => {
    const cves = Array.from(new Set((salesRows || []).map(r => strip(r.cve_marca)).filter(Boolean)));
    if (!cves.length) { setBrandByCvePage(new Map()); return; }
    let active = true;
    (async () => {
      const rMap = await getSkuBrandMap(cves);
      const m = new Map();
      for (const [k, v] of rMap.entries()) {
        m.set(k.toUpperCase(), brandDisplay(v) || null);
      }
      if (active) setBrandByCvePage(m);
    })();
    return () => { active = false; };
  }, [salesRows]);

  /* ===== ✓ / ✗ por fila (página) ===== */
  const scoreRows = useMemo(() => {
    const bset = new Set(selectedBrands.map(brandKey));
    const soldByClient = new Map();
    for (const r of salesRows || []) {
      const code = strip(r.cve_cliente); if (!code) continue;
      const cve = strip(r.cve_marca).toUpperCase();
      const brand = brandDisplay(brandByCvePage.get(cve));
      const v = Number(r.htls_total) || 0;
      if (v > 0 && brand && bset.has(brandKey(brand))) {
        if (!soldByClient.has(code)) soldByClient.set(code, new Set());
        soldByClient.get(code).add(brandKey(brand));
      }
    }
    return clientsPage.map(c => {
      const flags = selectedBrands.map(b => soldByClient.get(c.client_code)?.has(brandKey(b)) ?? false);
      return { code: c.client_code, name: c.name, flags };
    });
  }, [clientsPage, selectedBrands, salesRows, brandByCvePage]);

  /* ===== Cobertura GLOBAL (todas las zonas/rutas visibles) ===== */
  const [coverageGlobal, setCoverageGlobal] = useState([]); // [{brand,pct,count,total}]
  useEffect(() => {
    (async () => {
      const totalUniverse = universeCodes.length || 1;
      if (totalUniverse === 1 && universeCodes.length === 0) { setCoverageGlobal([]); return; }

      const bset = new Set(selectedBrands.map(brandKey));
      const universeSet = new Set(universeCodes);
      const clientsByBrand = new Map(); // brandKey -> Set(client_code)

      for (const r of rowsInScope || []) {
        const code = strip(r.cve_cliente);
        if (!universeSet.has(code)) continue;
        const v = Number(r.htls_total) || 0;
        const cve = strip(r.cve_marca).toUpperCase();
        const brand = brandDisplay(brandByCveAll.get(cve));
        if (v > 0 && brand && bset.has(brandKey(brand))) {
          const bk = brandKey(brand);
          if (!clientsByBrand.has(bk)) clientsByBrand.set(bk, new Set());
          clientsByBrand.get(bk).add(code);
        }
      }

      const total = Math.max(1, totalUniverse);
      const cov = selectedBrands.map(b => {
        const count = clientsByBrand.get(brandKey(b))?.size ?? 0;
        const pct = Math.round((count / total) * 100);
        return { brand: b, pct, count, total };
      });

      setCoverageGlobal(cov);
    })();
  }, [selectedBrands, pr, selectedZona, selectedRoute, scopeRoutes, allowedRoutes, allowedZonas, universeCodes, rowsInScope, brandByCveAll]);

  /* ===== Mapa global de ventas por cliente -> set de marcas seleccionadas (para export full) ===== */
  const soldSelectedBrandsByClientAll = useMemo(() => {
    const map = new Map(); // client_code -> Set(brandKey)
    const sel = new Set(selectedBrands.map(brandKey));
    for (const r of rowsInScope || []) {
      const v = Number(r.htls_total) || 0; if (v <= 0) continue;
      const code = strip(r.cve_cliente); if (!code) continue;
      const cve = strip(r.cve_marca).toUpperCase();
      const bname = brandDisplay(brandByCveAll.get(cve));
      if (!bname) continue;
      const bk = brandKey(bname);
      if (!sel.has(bk)) continue;
      if (!map.has(code)) map.set(code, new Set());
      map.get(code).add(bk);
    }
    return map;
  }, [rowsInScope, selectedBrands, brandByCveAll]);

  /* ====== Modal de clientes ====== */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogRows, setDialogRows] = useState([]); // [{client_code,name,business_name,zone,route}]

  const zoneMatches = (z, zona) => {
    const zz = strip(z);
    return zz && (norm(zz).includes(norm(zona)) || norm(zona).includes(norm(zz)));
  };

  const openClientsForZone = (zona, kind, brandName) => {
    const selBrandKeys = new Set(selectedBrands.map(brandKey));
    const rowsZ = (rowsInScope || []).filter(r => zoneMatches(r.zona, zona));

    const byClient = new Map(); // code -> { zone, route }
    for (const r of rowsZ) {
      const v = Number(r.htls_total) || 0;
      if (v <= 0) continue;
      const code = strip(r.cve_cliente); if (!code) continue;
      if (!byClient.has(code)) {
        byClient.set(code, {
          zone: strip(r.zona) || zona,
          route: routeFromRow(r) || "",
        });
      }
    }

    const keep = new Set();
    for (const r of rowsZ) {
      const v = Number(r.htls_total) || 0; if (v <= 0) continue;
      const code = strip(r.cve_cliente); if (!code) continue;

      const cve = strip(r.cve_marca).toUpperCase();
      const brand = brandDisplay(brandByCveAll.get(cve));
      const bKey = brand ? brandKey(brand) : "";

      if (kind === "ANY") {
        if (bKey && selBrandKeys.has(bKey)) keep.add(code);
      } else {
        const wantedKey = brandKey(brandName);
        if (bKey && bKey === wantedKey) keep.add(code);
      }
    }

    const rows = Array.from(keep).map(code => {
      const meta = byClient.get(code) || {};
      const c = clientsIndex.get(code) || {};
      return {
        client_code: code,
        name: c.name || c.business_name || `Cliente ${code}`,
        business_name: c.business_name || "",
        zone: meta.zone || zona,
        route: meta.route || "",
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));

    const title =
      kind === "ANY"
        ? `Clientes con alguna marca filtrada — Zona ${zona}`
        : `Clientes de ${brandName} — Zona ${zona}`;

    setDialogTitle(title);
    setDialogRows(rows);
    setDialogOpen(true);
  };

  const openClientsForTotals = (kind, brandName) => {
    const selBrandKeys = new Set(selectedBrands.map(brandKey));
    const rowsZ = (rowsInScope || []);

    const byClient = new Map(); // code -> { zone, route }
    for (const r of rowsZ) {
      const v = Number(r.htls_total) || 0;
      if (v <= 0) continue;
      const code = strip(r.cve_cliente); if (!code) continue;
      if (!byClient.has(code)) {
        byClient.set(code, {
          zone: strip(r.zona) || "",
          route: routeFromRow(r) || "",
        });
      }
    }

    const keep = new Set();
    for (const r of rowsZ) {
      const v = Number(r.htls_total) || 0; if (v <= 0) continue;
      const code = strip(r.cve_cliente); if (!code) continue;

      const cve = strip(r.cve_marca).toUpperCase();
      const brand = brandDisplay(brandByCveAll.get(cve));
      const bKey = brand ? brandKey(brand) : "";

      if (kind === "ANY") {
        if (bKey && selBrandKeys.has(bKey)) keep.add(code);
      } else {
        const wantedKey = brandKey(brandName);
        if (bKey && bKey === wantedKey) keep.add(code);
      }
    }

    const rows = Array.from(keep).map(code => {
      const meta = byClient.get(code) || {};
      const c = clientsIndex.get(code) || {};
      return {
        client_code: code,
        name: c.name || c.business_name || `Cliente ${code}`,
        business_name: c.business_name || "",
        zone: meta.zone || "",
        route: meta.route || "",
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));

    const title =
      kind === "ANY"
        ? `Clientes con alguna marca filtrada — Total zonas`
        : `Clientes de ${brandName} — Total zonas`;

    setDialogTitle(title);
    setDialogRows(rows);
    setDialogOpen(true);
  };

  // Descargar CSV de los datos visibles del modal
  const downloadVisibleAsCSV = () => {
    if (!dialogRows.length) return;
    const headers = ["client_code", "name", "business_name", "zone", "route"];
    const csv = [
      headers.join(","),
      ...dialogRows.map(r => headers.map(h => {
        const val = (r[h] ?? "").toString();
        if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
        return val;
      }).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dialogTitle.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ===== Descargar tabla Clientes × Marcas — TODO EL UNIVERSO ===== */
  const downloadClientesMarcasFullCSV = () => {
    // Encabezados: Código, Cliente, <marcas seleccionadas>
    const headers = ["Codigo", "Cliente", ...selectedBrands.map(brandDisplay)];

    // Fila de Cobertura (global)
    const covRow = [
      "", "Cobertura (global)",
      ...selectedBrands.map(b => {
        const row = coverageGlobal.find(x => brandKey(x.brand) === brandKey(b));
        const pct = row?.pct ?? 0;
        const cnt = row?.count ?? 0;
        return `${pct}% (${cnt})`;
      })
    ];

    // Filas del UNIVERSO completo (respetando periodo/zona/ruta, ignorando paginación/búsqueda)
    const rows = universeCodes.map(code => {
      const c = clientsIndex.get(code) || {};
      const name = c.name || c.business_name || `Cliente ${code}`;
      const boughtSet = soldSelectedBrandsByClientAll.get(code) || new Set();
      const brandCols = selectedBrands.map(b => (boughtSet.has(brandKey(b)) ? "1" : "0")); // 1/0 amigable para Excel
      return [code, name, ...brandCols];
    });

    const escape = (val) => {
      const v = (val ?? "").toString();
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const csv = [
      headers.map(escape).join(","),
      covRow.map(escape).join(","),
      ...rows.map(r => r.map(escape).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Clientes_x_Marcas_UNIVERSO.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ================= UI ================= */
  return (
    <div className="max-w-screen-2xl mx-auto px-3 py-4 space-y-4 bg-[#1f2031]">
      <Helmet><title>Scorecard de marcas</title></Helmet>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <div className="text-white text-2xl font-extrabold leading-tight">Scorecard de marcas</div>
          <div className="text-white/60 text-xs">Periodo: {periodLabel}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-white/70 text-xs">Periodo</span>
            <input
              type="month"
              value={period}
              onChange={(e) => { setPeriod(e.target.value); setPage(1); }}
              className="bg-white/10 text-white px-2 py-1 rounded text-xs w-32"
            />
          </div>
          <label className="flex items-center gap-2 text-white/80 text-xs bg-white/10 px-2 py-1 rounded cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeToday}
              onChange={(e) => { setIncludeToday(e.target.checked); setPage(1); }}
            />
            Incluir hoy
          </label>

          {allowedZonas.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-white/70 text-xs">Zona</span>
              <Select value={selectedZona} onValueChange={(v) => { setSelectedZona(v); setSelectedRoute("__ALL__"); setPage(1); }}>
                <SelectTrigger className="w-36 h-7 bg-white/10 text-white text-xs"><SelectValue placeholder="Zona" /></SelectTrigger>
                <SelectContent>
                  {allowedZonas.length > 1 && <SelectItem value="__ALL__">Todas</SelectItem>}
                  {allowedZonas.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-1">
            <span className="text-white/70 text-xs">Ruta</span>
            <Select value={selectedRoute} onValueChange={(v) => { setSelectedRoute(v); setPage(1); }}>
              <SelectTrigger className="w-36 h-7 bg-white/10 text-white text-xs"><SelectValue placeholder="Ruta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">Todas</SelectItem>
                {zoneRoutes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Buscador + Estado + Paginación */}
      <Card className="bg-[#2a2c44] border-0">
        <CardContent className="pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar cliente (nombre, negocio o código)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-white/10 text-white placeholder:text-white/50 w-72 h-8"
            />
            <Button size="sm" className="h-8" onClick={() => { setSearch(query.trim()); setPage(1); }}>Buscar</Button>

            <div className="ml-auto flex items-center gap-3 text-white/80 text-xs">
              <span>Universo: {vpsLoading ? "cargando..." : `${universeCodes.length.toLocaleString("es-MX")} clientes con venta`}</span>
              <span>Resultados: {clientsTotal.toLocaleString("es-MX")}</span>
              <span>Página</span>
              <Button size="sm" variant="secondary" className="h-7" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</Button>
              <span className="px-2">{page} / {totalPages}</span>
              <Button size="sm" variant="secondary" className="h-7" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Siguiente</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chips de marcas */}
      <Card className="bg-[#2a2c44] border-0 shadow-lg">
        <CardHeader className="pb-2"><CardTitle className="text-white text-sm">Marcas</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {availableBrands.map(name => {
              const active = selectedBrands.some(b => brandKey(b) === brandKey(name));
              return (
                <button
                  key={name}
                  onClick={() => toggleBrandChip(name)}
                  className={`flex items-center gap-2 px-2 py-1 rounded-full ring-1 transition ${active ? "bg-green-500/20 ring-green-400 text-green-100" : "bg-white/5 ring-white/15 text-white/80 hover:bg-white/10"
                    }`}
                  title={name}
                >
                  <img
                    src={`/brands/${brandFile(name)}`}
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/brands/default.png"; }}
                    alt={name}
                    className="w-5 h-5 object-contain rounded bg-white"
                  />
                  <span className="text-xs font-medium">{name}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Zonas × Marcas */}
      <Card className="bg-[#2a2c44] border-0 shadow-lg">
        <CardHeader className="pb-1">
          <CardTitle className="text-white text-sm">Zonas × Marcas (saturación global por zona)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="w-full overflow-auto ring-1 ring-white/10 rounded-lg">
            <table className="min-w-[820px] w-full text-[12px]">
              <thead className="bg-white/10 sticky top-0">
                <tr className="[&>th]:py-2 [&>th]:px-3 [&>th]:text-left [&>th]:text-white/80">
                  <th className="w-56">Zona</th>
                  <th className="w-24">Universo</th>
                  <th className="w-36 text-center">% marcas filtradas</th>
                  {selectedBrands.map(name => (
                    <th key={name} className="text-center">
                      <div className="flex items-center justify-center">
                        <img
                          src={`/brands/${brandFile(name)}`}
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/brands/default.png"; }}
                          alt={name}
                          className="w-6 h-6 object-contain rounded bg-white"
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-white/5">
                {zonesBrandCoverage.length === 0 ? (
                  <tr><td colSpan={3 + selectedBrands.length} className="py-6 px-3 text-center text-white/70">Sin datos.</td></tr>
                ) : (
                  <>
                    {zonesBrandCoverage.map(z => {
                      const totalPct = z.universe > 0 ? Math.round((z.anyCount / z.universe) * 100) : 0;
                      const rowCells = selectedBrands.map(b => {
                        const count = z.brands[b.toUpperCase()] || 0;
                        const pct = z.universe > 0 ? Math.round((count / z.universe) * 100) : 0;
                        return { brand: b, pct, count };
                      });
                      return (
                        <tr key={z.zone} className="[&>td]:py-2 [&>td]:px-3 hover:bg-white/10 cursor-pointer">
                          <td className="text-white/90 font-semibold" onClick={() => setSelectedZona(z.zone)}>{z.zone}</td>
                          <td className="text-white/80 tabular-nums">{z.universe.toLocaleString("es-MX")}</td>
                          <td className="text-center">
                            <button
                              title={`${z.anyCount.toLocaleString("es-MX")} clientes`}
                              className={`font-bold tabular-nums ${totalPct >= 80 ? "text-green-300" : "text-white/85"} underline underline-offset-2`}
                              onClick={() => openClientsForZone(z.zone, "ANY")}
                            >
                              {totalPct}%
                            </button>
                          </td>
                          {rowCells.map(({ brand, pct, count }) => (
                            <td key={brand} className="text-center">
                              <button
                                title={`${count.toLocaleString("es-MX")} clientes`}
                                className={`font-bold tabular-nums ${pct >= 80 ? "text-green-300" : "text-white/85"} underline underline-offset-2`}
                                onClick={() => openClientsForZone(z.zone, "BRAND", brand)}
                              >
                                {pct}%
                              </button>
                            </td>
                          ))}
                        </tr>
                      );
                    })}

                    {/* ===== Total zonas ===== */}
                    <tr className="bg-white/10 [&>td]:py-2 [&>td]:px-3">
                      <td className="text-white/90 font-bold">Total zonas</td>
                      <td className="text-white/90 font-semibold tabular-nums">
                        {zonesTotals.universe.toLocaleString("es-MX")}
                      </td>
                      <td className="text-center">
                        {(() => {
                          const pct = zonesTotals.universe > 0 ? Math.round((zonesTotals.anyCount / zonesTotals.universe) * 100) : 0;
                          return (
                            <button
                              title={`${zonesTotals.anyCount.toLocaleString("es-MX")} clientes`}
                              className={`font-bold tabular-nums ${pct >= 80 ? "text-green-300" : "text-white/85"} underline underline-offset-2`}
                              onClick={() => openClientsForTotals("ANY")}
                            >
                              {pct}%
                            </button>
                          );
                        })()}
                      </td>
                      {selectedBrands.map(b => {
                        const bk = b.toUpperCase();
                        const count = zonesTotals.brandCounts[bk] || 0;
                        const pct = zonesTotals.universe > 0 ? Math.round((count / zonesTotals.universe) * 100) : 0;
                        return (
                          <td key={`total-${bk}`} className="text-center">
                            <button
                              title={`${count.toLocaleString("es-MX")} clientes`}
                              className={`font-bold tabular-nums ${pct >= 80 ? "text-green-300" : "text-white/85"} underline underline-offset-2`}
                              onClick={() => openClientsForTotals("BRAND", b)}
                            >
                              {pct}%
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-white/60 mt-2">
            Saturación por zona = clientes de la zona que compraron la marca / clientes con venta en la zona (periodo seleccionado).
            â€œ% marcas filtradasâ€ = clientes (de esa zona) que compraron al menos una de las marcas seleccionadas / universo.
            Click en una zona para filtrar la tabla de clientes.
          </div>
        </CardContent>
      </Card>

      {/* Clientes × Marcas */}
      <Card className="bg-[#2a2c44] border-0 shadow-lg">
        <CardHeader className="pb-1 flex flex-row items-center justify-between">
          <CardTitle className="text-white text-sm">Clientes × Marcas</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={downloadClientesMarcasFullCSV}>
              Descargar tabla (universo)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="w-full overflow-auto ring-1 ring-white/10 rounded-lg">
            <table className="min-w-[720px] w-full text-[12px]">
              <thead className="bg-white/10 sticky top-0 z-10">
                <tr className="[&>th]:py-2 [&>th]:px-3 [&>th]:text-left [&>th]:text-white/80">
                  <th className="w-24">Código</th>
                  <th className="min-w-[220px]">Cliente</th>
                  {selectedBrands.map(name => (
                    <th key={name} className="text-center">
                      <div className="flex items-center justify-center">
                        <img
                          src={`/brands/${brandFile(name)}`}
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/brands/default.png"; }}
                          alt={name}
                          className="w-6 h-6 object-contain rounded bg-white"
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-white/5">
                {/* Cobertura (global) */}
                <tr className="bg-white/5">
                  <td colSpan={2} className="py-2 px-3 text-white/80 font-semibold">Cobertura (global)</td>
                  {selectedBrands.map(b => {
                    const row = coverageGlobal.find(x => brandKey(x.brand) === brandKey(b));
                    const pct = row?.pct ?? 0;
                    const cnt = row?.count ?? 0;
                    return (
                      <td key={b} className="py-2 px-3 text-center">
                        <button
                          className={`font-bold tabular-nums ${pct >= 80 ? "text-green-300" : "text-red-300"} underline underline-offset-2`}
                          title={`${cnt.toLocaleString("es-MX")} clientes`}
                          onClick={() => openClientsForTotals("BRAND", b)}
                        >
                          {pct}%
                        </button>
                      </td>
                    );
                  })}
                </tr>

                {/* Filas de la página */}
                {vpsLoading ? (
                  <tr><td colSpan={2 + selectedBrands.length} className="py-6 px-3 text-center text-white/70">Cargando universo...</td></tr>
                ) : (clientsPage.length === 0 ? (
                  <tr><td colSpan={2 + selectedBrands.length} className="py-6 px-3 text-center text-white/70">Sin resultados.</td></tr>
                ) : scoreRows.map(r => (
                  <tr key={r.code} className="[&>td]:py-2 [&>td]:px-3">
                    <td className="text-white/80">{r.code}</td>
                    <td className="text-white">{r.name}</td>
                    {r.flags.map((ok, idx) => (
                      <td key={idx} className="text-center">
                        {ok ? <span className="text-green-400 text-lg">✓</span> : <span className="text-red-400 text-lg">✗</span>}
                      </td>
                    ))}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          {/* Pager */}
          <div className="flex items-center justify-end gap-2 text-white/80 text-xs mt-2">
            <Button size="sm" variant="secondary" className="h-7" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</Button>
            <span>{page} / {totalPages}</span>
            <Button size="sm" variant="secondary" className="h-7" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Siguiente</Button>
          </div>

          <div className="text-[11px] text-white/60 mt-2">
            Universo = clientes con venta en el periodo/zona/ruta.
            Cobertura global = clientes con venta de la marca / universo.
            Exportar “universoâ€ respeta periodo/zona/ruta, e ignora la paginación y el buscador.
          </div>
        </CardContent>
      </Card>

      {/* ===== Modal de clientes ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[80vh] overflow-hidden p-0 bg-[#2a2c44] text-white border-white/10">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="text-white">{dialogTitle}</DialogTitle>
            <DialogDescription className="text-white/70">
              {dialogRows.length.toLocaleString("es-MX")} clientes
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-3">
            <div className="ring-1 ring-white/10 rounded-lg overflow-auto max-h-[58vh]">
              <table className="w-full text-[12px]">
                <thead className="bg-white/10 sticky top-0">
                  <tr className="[&>th]:py-2 [&>th]:px-3 [&>th]:text-left [&>th]:text-white/80">
                    <th className="w-28">Código</th>
                    <th>Nombre</th>
                    <th>Razón social</th>
                    <th className="w-40">Zona</th>
                    <th className="w-32">Ruta</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:nth-child(even)]:bg-white/5">
                  {dialogRows.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 px-3 text-center text-white/70">Sin clientes.</td></tr>
                  ) : dialogRows.map((r) => (
                    <tr key={r.client_code} className="[&>td]:py-2 [&>td]:px-3">
                      <td className="text-white/80">{r.client_code}</td>
                      <td className="text-white">{r.name}</td>
                      <td className="text-white/80">{r.business_name}</td>
                      <td className="text-white/80">{r.zone}</td>
                      <td className="text-white/80">{r.route}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="px-4 pb-4">
            <Button variant="secondary" onClick={downloadVisibleAsCSV}>
              Descargar Excel
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
