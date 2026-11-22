import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { 
  BarChart3, 
  Users, 
  Target, 
  TrendingUp, 
  Clock, 
  AlertCircle, 
  Save, 
  ChevronRight,
  ChevronDown,
  Filter,
  Calendar,
  Layers,
  FileSpreadsheet,
  Download,
  FileText,
  Percent,
  Image as ImageIcon,
  X,
  Search,
  Package,
  Check,
  Sparkles,
  Repeat,
  ShoppingBag,
  CalendarCheck,
  CheckCircle2,
  Zap
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

// PDF & Image Export
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Repositories
import { getSalesBySku } from '@/repositories/salesRepository';
import { getAllGoals } from '@/repositories/goalsRepository';
import { getClients } from '@/repositories/clientsRepository';
import { getAllEvaluations } from '@/repositories/evaluationsRepository';
import { getManualIndicators, upsertManualIndicator } from '@/repositories/indicadoresRepository';
import { getSkuBrandMap, getSkuDescriptions } from '@/repositories/metadataRepository';

// Helpers de normalización
const strip = (s) => (s ?? "").toString().trim();
const norm = (s) => strip(s).toUpperCase();
const routeKey = (s) => norm(s).replace(/[^A-Z0-9]/g, "");
const clientCodeKey = (s) => norm(strip(s)).replace(/[^A-Z0-9]/g, "");
const isZeroLike = (v) => {
  const s = strip(v);
  return !s || s === "0" || s === "00" || s === "000";
};

// GEC Levels
const GEC_LEVELS = [
  { key: 'bronce',  label: 'Bronce',  short: 'Brc', color: 'amber',   textColor: 'text-amber-500',   bgColor: 'bg-amber-500/10' },
  { key: 'plata',   label: 'Plata',   short: 'Plt', color: 'slate',   textColor: 'text-slate-300',   bgColor: 'bg-slate-400/10' },
  { key: 'oro',     label: 'Oro',     short: 'Oro', color: 'yellow',  textColor: 'text-yellow-400',  bgColor: 'bg-yellow-500/10' },
  { key: 'platino', label: 'Platino', short: 'Ptn', color: 'cyan',    textColor: 'text-cyan-400',    bgColor: 'bg-cyan-500/10' },
  { key: 'titanio', label: 'Titanio', short: 'Ttn', color: 'violet',  textColor: 'text-violet-400',  bgColor: 'bg-violet-500/10' },
];

// Componentes de apoyo
const GlassCard = ({ children, className = "", id = "" }) => (
  <Card id={id} className={`bg-slate-900/40 backdrop-blur-xl border-white/10 shadow-2xl overflow-hidden ${className}`}>
    {children}
  </Card>
);

const MetricLED = ({ value, thresholds = { success: 90, warning: 70 } }) => {
  let color = "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]";
  if (value >= thresholds.success) color = "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]";
  else if (value >= thresholds.warning) color = "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]";
  
  return <div className={`w-2 h-2 rounded-full ${color} transition-all duration-500`} />;
};

// ─────────────────────────────────────────────────────────
// REUSABLE MULTI-SELECT DROPDOWN
// ─────────────────────────────────────────────────────────
function MultiSelectDropdown({ label, icon: Icon, options, selected, onToggle, onSelectAll, onClearAll, placeholder, accentColor = 'emerald' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => String(o.label || o).toLowerCase().includes(q));
  }, [options, search]);

  const accent = {
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500', ring: 'hover:border-emerald-500/30' },
    blue:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500',    ring: 'hover:border-blue-500/30' },
    violet:  { text: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500',  ring: 'hover:border-violet-500/30' },
  }[accentColor] || {};

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/60 border border-white/10 rounded-2xl transition-all duration-300 backdrop-blur-md ${accent.ring}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 ${accent.bg} rounded-xl ${accent.text} shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-sm font-bold text-white truncate">
              {selected.size === 0 ? placeholder : `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selected.size > 0 && (
            <span className={`text-[10px] font-bold ${accent.text} ${accent.bg} px-2 py-0.5 rounded-full`}>
              {selected.size}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[200] mt-2 w-full bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
          >
            <div className="p-3 border-b border-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text" placeholder="Buscar..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => onSelectAll(filtered.map(o => o.value ?? o))} className={`px-3 py-1.5 text-[10px] font-bold uppercase ${accent.bg} ${accent.text} rounded-lg hover:opacity-80`}>
                  Seleccionar todo
                </button>
                <button onClick={onClearAll} className="px-3 py-1.5 text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 rounded-lg hover:opacity-80">
                  Limpiar
                </button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto pb-1">
              {filtered.map((opt, idx) => {
                const val = opt.value ?? opt;
                const lbl = opt.label ?? opt;
                const isSel = selected.has(val);
                return (
                  <button
                    key={`${val}-${idx}`}
                    onClick={() => onToggle(val)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all border-b border-white/5 last:border-0 ${
                      isSel ? `${accent.bg} border-l-2 ${accent.border}` : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      isSel ? `${accent.bg} ${accent.border}` : 'border-white/20'
                    }`}>
                      {isSel && <Check className={`w-2.5 h-2.5 ${accent.text}`} />}
                    </div>
                    <span className="text-sm text-white">{lbl}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PRODUCT MULTI-SELECT FILTER COMPONENT
// ─────────────────────────────────────────────────────────
function ProductFilter({ products, selected, onSelectionChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      String(p.cve_marca || '').toLowerCase().includes(q) ||
      String(p.descripcion || '').toLowerCase().includes(q) ||
      String(p.marca || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const toggle = (code) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onSelectionChange(next);
  };

  const selectAll = () => onSelectionChange(new Set(filtered.map(p => p.cve_marca)));
  const clearAll = () => onSelectionChange(new Set());

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/60 border border-white/10 rounded-2xl hover:border-rose-500/30 transition-all duration-300 backdrop-blur-md"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400 shrink-0">
            <Percent className="w-4 h-4" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SKUs para Saturación</p>
            <p className="text-sm font-bold text-white truncate">
              {selected.size === 0 ? 'Todos los SKUs (total cartera)' : `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selected.size > 0 && <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">{selected.size}</span>}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[200] mt-2 w-full bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
          >
            <div className="p-3 border-b border-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/40"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={selectAll} className="px-3 py-1.5 text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 rounded-lg">Seleccionar todo</button>
                <button onClick={clearAll} className="px-3 py-1.5 text-[10px] font-bold uppercase bg-white/5 text-slate-400 rounded-lg">Limpiar</button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto pb-2">
              {filtered.map((p, idx) => {
                const isSelected = selected.has(p.cve_marca);
                return (
                  <button key={p.cve_marca || idx} onClick={() => toggle(p.cve_marca)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left ${isSelected ? 'bg-rose-500/10' : 'hover:bg-white/[0.03]'}`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSelected ? 'bg-rose-500 border-rose-500' : 'border-white/20'}`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{p.descripcion || p.cve_marca}</p>
                      <p className="text-[10px] text-slate-500">{p.cve_marca}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────
export default function AnalistaIndicatorDashboard() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const dashboardRef = useRef(null);
  
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);
  
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectedBrands, setSelectedBrands] = useState(new Set());
  const [selectedZones, setSelectedZones] = useState(new Set());
  const [selectedRoutes, setSelectedRoutes] = useState(new Set());
  
  const [routes, setRoutes] = useState([]); 
  const [zonasRutas, setZonasRutas] = useState([]); 
  const [sales, setSales] = useState([]);
  const [goals, setGoals] = useState([]);
  const [clients, setClients] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [manualData, setManualData] = useState([]);
  const [brandMap, setBrandMap] = useState(new Map());
  const [skuCatalog, setSkuCatalog] = useState([]);
  const [editData, setEditData] = useState({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const periodDate = `${period}-01`;
      const [y, m] = period.split('-').map(Number);
      const periodEnd = new Date(y, m, 0).toISOString().slice(0, 10);
      
      const [allClients, rawSales, rawGoals, rawEvals, rawManual, rawBrandMap, rawSkuDesc, rawZonasRutas] = await Promise.all([
        getClients().catch(() => []),
        getSalesBySku({ from: periodDate, to: periodEnd }).catch(() => []),
        getAllGoals({ from: periodDate, to: periodEnd }).catch(() => []),
        getAllEvaluations({ from: periodDate, to: periodEnd }).catch(() => []), 
        getManualIndicators([], periodDate).catch(() => []), 
        getSkuBrandMap().catch(() => new Map()),
        getSkuDescriptions().catch(() => []),
        supabase.from('zonas_rutas').select('*').then(res => res.data || []).catch(() => [])
      ]);
      
      const routeKeysMap = new Map();
      const process = (items, routeField, labelField) => {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
          const r = strip(item[routeField] || item[labelField]);
          if (r && !isZeroLike(r)) {
            const key = routeKey(r);
            if (!routeKeysMap.has(key)) routeKeysMap.set(key, r);
          }
        });
      };

      process(rawGoals, 'sales_route', 'ruta');
      process(allClients, 'sales_route', 'internal_route');
      process(rawSales, 'ruta', 'sales_route');
      process(rawManual, 'ruta', 'sales_route');

      const sortedKeys = Array.from(routeKeysMap.keys()).sort();
      const routeObjects = sortedKeys.map(key => ({
        key,
        label: routeKeysMap.get(key)
      }));

      setClients(allClients || []);
      setRoutes(routeObjects);
      setSales(rawSales || []);
      setGoals(rawGoals || []);
      setEvaluations(rawEvals || []);
      setManualData(rawManual || []);
      setBrandMap(rawBrandMap || new Map());
      setSkuCatalog(rawSkuDesc || []);
      setZonasRutas(rawZonasRutas || []);
      
      const initialEdit = {};
      if (Array.isArray(rawManual)) {
        rawManual.forEach(m => {
          initialEdit[routeKey(m.ruta)] = { faltas: m.faltas, minutos: m.minutos };
        });
      }
      setEditData(initialEdit);
      
    } catch (err) {
      console.error('[AnalistaDashboard] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const getRouteFromRow = (r, clientsMap) => {
    const rn = r?.ruta || r?.sales_route;
    if (rn && !isZeroLike(rn)) return routeKey(rn);
    const codeKey = clientCodeKey(r?.cve_cliente);
    const c = clientsMap.get(codeKey);
    const alt = strip(c?.sales_route || c?.ruta || c?.internal_route || c?.route);
    return alt && !isZeroLike(alt) ? routeKey(alt) : null;
  };

  const activeBrands = useMemo(() => {
    const brands = new Set();
    sales.forEach(s => {
      const marca = brandMap.get(String(s.cve_marca || '').toUpperCase());
      if (marca) brands.add(marca.toUpperCase());
    });
    return Array.from(brands).sort();
  }, [brandMap, sales]);

  // visibleBrands = brands shown as Cobertura columns (filtered by brand selector)
  const visibleBrands = useMemo(() => {
    if (selectedBrands.size === 0) return activeBrands;
    return activeBrands.filter(b => selectedBrands.has(b));
  }, [activeBrands, selectedBrands]);

  // Options for the brand multi-select dropdown
  const brandOptions = useMemo(() => activeBrands.map(b => ({ value: b, label: b })), [activeBrands]);

  const brandColorMap = useMemo(() => {
    const colors = [{ textColor: 'text-amber-400', target: 80 }, { textColor: 'text-red-500', target: 80 }, { textColor: 'text-emerald-500', target: 80 }, { textColor: 'text-yellow-400', target: 50 }, { textColor: 'text-cyan-400', target: 30 }, { textColor: 'text-blue-400', target: 25 }, { textColor: 'text-violet-400', target: 20 }, { textColor: 'text-pink-400', target: 20 }, { textColor: 'text-orange-400', target: 20 }];
    const map = {};
    activeBrands.forEach((brand, idx) => map[brand] = colors[idx % colors.length]);
    return map;
  }, [activeBrands]);

  const filteredSales = useMemo(() => {
    if (selectedProducts.size === 0) return sales;
    return sales.filter(s => selectedProducts.has(String(s.cve_marca || s.cve_sku || s.sku || '').toUpperCase()));
  }, [sales, selectedProducts]);

  const dashboardRows = useMemo(() => {
    if (loading) return [];
    
    const clientsByCode = new Map();
    clients.forEach(c => {
      const code = clientCodeKey(c.client_code || c.cve_cliente);
      if (code) clientsByCode.set(code, c);
    });

    const goalsByRoute = new Map();
    goals.forEach(g => {
      const key = routeKey(g.sales_route);
      goalsByRoute.set(key, g);
    });

    const [year, month] = period.split('-').map(Number);

    return routes.map(({ key, label }) => {
      const routeClients = clients.filter(c => {
        const r = strip(c.sales_route || c.internal_route);
        return r && routeKey(r) === key;
      });
      
      const allRouteSales = sales.filter(s => getRouteFromRow(s, clientsByCode) === key);
      const routeSales = filteredSales.filter(s => getRouteFromRow(s, clientsByCode) === key);
      
      const routeGoal = goalsByRoute.get(key);
      const universe = routeClients.length || 1;

      const volMeta = routeGoal?.meta || 0;
      const volAcum = allRouteSales.reduce((acc, s) => acc + (Number(s.htls_total) || 0), 0);
      const volAlcance = volMeta > 0 ? (volAcum / volMeta) * 100 : 0;
      
      const ccMeta = routeGoal?.meta_clientes || 0;
      const uniqueBuyers = new Set(allRouteSales.filter(s => (Number(s.htls_total) || 0) > 0).map(s => clientCodeKey(s.cve_cliente)));
      const ccAcum = uniqueBuyers.size;
      const ccAlcance = ccMeta > 0 ? (ccAcum / ccMeta) * 100 : 0;
      
      const coverage = activeBrands.filter(b => selectedBrands.size === 0 || selectedBrands.has(b)).map(brandName => {
        const brandSales = allRouteSales.filter(s => {
          if ((Number(s.htls_total) || 0) <= 0) return false;
          const sMarca = brandMap.get(String(s.cve_marca || '').toUpperCase());
          return (sMarca || '').toUpperCase() === brandName;
        });
        const count = new Set(brandSales.map(s => clientCodeKey(s.cve_cliente))).size;
        const meta = brandColorMap[brandName] || {};
        return { name: brandName, pct: Math.min((count / universe) * 100, 100), count, target: meta.target || 20, textColor: meta.textColor };
      });
      
      // SATURATION — anchored to filteredSales (SKU filter)
      const saturation = Math.min(
        (new Set(routeSales.filter(s => (Number(s.htls_total) || 0) > 0).map(s => clientCodeKey(s.cve_cliente))).size / universe) * 100,
        100
      );

      const routeEvals = evaluations.filter(e => {
        const d = new Date(e.fecha);
        if (d.getFullYear() !== year || (d.getMonth() + 1) !== month) return false;
        const r = strip(e.ruta || e.sales_route);
        return (r && routeKey(r) === key) || clientsByCode.get(clientCodeKey(e.client_code || e.client_id))?.sales_route === label;
      });
      const avgExec = routeEvals.length > 0 ? routeEvals.reduce((a, e) => a + (Number(e.score_final || e.puntaje_total) || 0), 0) / routeEvals.length : 0;
        
      const newClients = routeClients.filter(c => {
        const d = new Date(c.created_at || c.fecha_alta);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
      });
      
      const zonaMapping = zonasRutas.find(zr => routeKey(zr.ruta) === key);
      const rowZona = zonaMapping ? zonaMapping.zona : 'SIN ZONA';

      const gecCounts = {};
      GEC_LEVELS.forEach(gec => {
        gecCounts[gec.key] = newClients.filter(c => {
          const level = (c.level || c.gec || '').toUpperCase();
          return level.includes(gec.label.toUpperCase());
        }).length;
      });

      const manual = editData[key] || { faltas: 0, minutos: 0 };

      return {
        key,
        label,
        zona: rowZona,
        volumen: { meta: volMeta, acum: volAcum, alcance: volAlcance },
        cc: { meta: ccMeta, acum: ccAcum, alcance: ccAlcance },
        coverage,
        saturation,
        ejecucion: avgExec,
        gecCounts,
        totalNewClients: newClients.length,
        manual,
        hasSales: allRouteSales.length > 0,
      };
    }).filter(row => row.hasSales)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }, [routes, filteredSales, goals, clients, evaluations, editData, period, loading, brandMap, activeBrands, brandColorMap, selectedProducts, zonasRutas, sales, selectedBrands]);

  // Derived available Zones and Routes based on actual data (with sales only)
  const availableZones = useMemo(() => {
    const zones = new Set(dashboardRows.map(r => r.zona));
    return Array.from(zones).sort().map(z => ({ value: z, label: z }));
  }, [dashboardRows]);

  const availableRoutes = useMemo(() => {
    let validRows = dashboardRows;
    if (selectedZones.size > 0) {
      validRows = dashboardRows.filter(r => selectedZones.has(r.zona));
    }
    return validRows.map(r => ({ value: r.label, label: `Ruta ${r.label}` }))
      .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
  }, [dashboardRows, selectedZones]);

  // When zone changes, clear routes that no longer belong
  useEffect(() => {
    if (selectedZones.size === 0) return;
    setSelectedRoutes(prev => {
      const validLabels = new Set(availableRoutes.map(r => r.value));
      const next = new Set([...prev].filter(r => validLabels.has(r)));
      return next.size !== prev.size ? next : prev;
    });
  }, [selectedZones, availableRoutes]);

  // Apply zone + route filters to dashboard rows
  const filteredDashboardRows = useMemo(() => {
    return dashboardRows.filter(row => {
      if (selectedZones.size > 0 && !selectedZones.has(row.zona)) return false;
      if (selectedRoutes.size > 0 && !selectedRoutes.has(row.label)) return false;
      return true;
    });
  }, [dashboardRows, selectedZones, selectedRoutes]);

  // Zone summary cards
  const zoneSummary = useMemo(() => {
    const allZones = [...new Set(dashboardRows.map(r => r.zona))];
    return allZones.map(zona => {
      const rows = filteredDashboardRows.filter(r => r.zona === zona);
      if (rows.length === 0) return null;
      return {
        zona,
        routes: rows.length,
        volHL: rows.reduce((a, r) => a + r.volumen.acum, 0),
        volMeta: rows.reduce((a, r) => a + r.volumen.meta, 0),
        saturation: rows.reduce((a, r) => a + r.saturation, 0) / rows.length,
        newClients: rows.reduce((a, r) => a + r.totalNewClients, 0),
      };
    }).filter(Boolean);
  }, [dashboardRows, filteredDashboardRows]);

  const handleManualChange = (key, field, value) => {
    setEditData(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || { faltas: 0, minutos: 0 }),
        [field]: parseInt(value) || 0
      }
    }));
  };

  const saveManualData = async (rKey, label) => {
    const data = editData[rKey];
    try {
      await upsertManualIndicator({
        ruta: label,
        periodo: `${period}-01`,
        faltas: data.faltas,
        minutos: data.minutos
      });
      toast({ title: "Guardado", description: `Datos de ruta ${label} actualizados.` });
    } catch (err) {
      console.error('Error saving manual data:', err);
      toast({ title: "Error", description: "No se pudo guardar la información.", variant: "destructive" });
    }
  };

  const handleExport = async (format) => {
    if (!dashboardRef.current) return;
    setExporting(format);
    
    await new Promise(r => setTimeout(r, 300));
    
    try {
      const element = dashboardRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#020617',
        logging: false,
        ignoreElements: (el) => el.classList.contains('no-export'),
        onclone: (clonedDoc) => {
          const container = clonedDoc.querySelector('.dashboard-pdf-container');
          if (container) {
             container.style.padding = '40px';
             container.style.width = 'fit-content';
             container.style.minWidth = '1400px';
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const fileName = `Reporte_Analista_${period}`;
      
      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = imgData;
        link.click();
        toast({ title: "Imagen Descargada", description: "Perfecta para compartir en WhatsApp." });
      } else {
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        
        const mmWidth = imgWidth * 0.264583 / 3;
        const mmHeight = imgHeight * 0.264583 / 3;
        
        const pdf = new jsPDF({
          orientation: mmWidth > mmHeight ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [mmWidth + 20, mmHeight + 20]
        });
        
        pdf.addImage(imgData, 'PNG', 10, 10, mmWidth, mmHeight, undefined, 'FAST');
        pdf.save(`${fileName}.pdf`);
        toast({ title: "PDF Generado", description: "Reporte optimizado guardado." });
      }
    } catch (err) {
      console.error('Export Error:', err);
      toast({ title: "Error", description: "No se pudo generar el archivo.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  // Summary stats from filtered rows
  const totalVolHL = filteredDashboardRows.reduce((acc, r) => acc + r.volumen.acum, 0);
  const avgCC = (filteredDashboardRows.reduce((acc, r) => acc + r.cc.alcance, 0) / (filteredDashboardRows.length || 1));
  const avgSaturation = (filteredDashboardRows.reduce((acc, r) => acc + r.saturation, 0) / (filteredDashboardRows.length || 1));
  const totalNewClients = filteredDashboardRows.reduce((acc, r) => acc + r.totalNewClients, 0);

  // Nuevos KPIs de Efectividad
  const effectivenessKpis = useMemo(() => {
    if (loading || filteredDashboardRows.length === 0) {
      return {
        recompraPct: 0,
        repeatBuyersCount: 0,
        totalBuyersCount: 0,
        avgHlPerClient: 0,
        avgClientesDia: 0,
        diasHabiles: 24,
        pctRutasCumplidas: 0,
        rutasCumplidas: 0,
        totalRutas: 0,
      };
    }

    const filteredRouteKeys = new Set(filteredDashboardRows.map(r => r.key));

    const clientsByCode = new Map();
    clients.forEach(c => {
      const code = clientCodeKey(c.client_code || c.cve_cliente);
      if (code) clientsByCode.set(code, c);
    });

    const activeRouteSales = filteredSales.filter(s => {
      const rKey = getRouteFromRow(s, clientsByCode);
      return rKey && filteredRouteKeys.has(rKey);
    });

    const clientPurchaseDates = new Map();
    let totalSalesVolume = 0;

    activeRouteSales.forEach(s => {
      const vol = Number(s.htls_total) || 0;
      if (vol <= 0) return;

      totalSalesVolume += vol;
      const code = clientCodeKey(s.cve_cliente);
      if (!code) return;

      const dateStr = (s.fecha || s.fecha_venta || s.created_at || s.period_date || '').toString().slice(0, 10);
      if (!clientPurchaseDates.has(code)) {
        clientPurchaseDates.set(code, new Set());
      }

      if (dateStr) {
        clientPurchaseDates.get(code).add(dateStr);
      } else {
        clientPurchaseDates.get(code).add(s.id || s.cve_sku || Math.random());
      }
    });

    const totalBuyersCount = clientPurchaseDates.size;
    let repeatBuyersCount = 0;
    clientPurchaseDates.forEach((datesSet) => {
      if (datesSet.size >= 2) {
        repeatBuyersCount++;
      }
    });

    const recompraPct = totalBuyersCount > 0 ? (repeatBuyersCount / totalBuyersCount) * 100 : 0;

    const totalVolHLAcc = filteredDashboardRows.reduce((acc, r) => acc + (r.volumen.acum || 0), 0);
    const avgHlPerClient = totalBuyersCount > 0 ? (totalVolHLAcc || totalSalesVolume) / totalBuyersCount : 0;

    const getWorkingDays = (periodStr) => {
      if (!periodStr) return 24;
      const [year, month] = periodStr.split('-').map(Number);
      if (!year || !month) return 24;
      const daysInMonth = new Date(year, month, 0).getDate();
      let count = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dayOfWeek = new Date(year, month - 1, day).getDay();
        if (dayOfWeek !== 0) count++;
      }
      return count || 24;
    };

    const diasHabiles = getWorkingDays(period);
    const avgClientesDia = diasHabiles > 0 ? totalBuyersCount / diasHabiles : 0;

    const totalRutas = filteredDashboardRows.length;
    const rutasCumplidas = filteredDashboardRows.filter(r => (r.volumen.alcance || 0) >= 80).length;
    const pctRutasCumplidas = totalRutas > 0 ? (rutasCumplidas / totalRutas) * 100 : 0;

    return {
      recompraPct,
      repeatBuyersCount,
      totalBuyersCount,
      avgHlPerClient,
      avgClientesDia,
      diasHabiles,
      pctRutasCumplidas,
      rutasCumplidas,
      totalRutas,
    };
  }, [filteredDashboardRows, filteredSales, clients, period, loading]);

  // Helpers for multi-select
  const toggleZone = (z) => setSelectedZones(prev => { const n = new Set(prev); n.has(z) ? n.delete(z) : n.add(z); return n; });
  const toggleRoute = (r) => setSelectedRoutes(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n; });
  const toggleBrand = (b) => setSelectedBrands(prev => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n; });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-emerald-400">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="mb-4">
          <TrendingUp className="w-12 h-12" />
        </motion.div>
        <p className="font-medium animate-pulse text-center">Sincronizando indicadores tácticos...</p>
      </div>
    );
  }

  const filterLabel = selectedProducts.size > 0
    ? `Filtrado: ${selectedProducts.size} producto${selectedProducts.size !== 1 ? 's' : ''}`
    : 'Todos los productos';

  return (
    <div className="space-y-6 pb-10 text-slate-100 max-w-[1800px] mx-auto px-4">
      <Helmet>
        <title>Analista Dashboard | Cervezas Finas</title>
      </Helmet>

      {/* ═══════════════════════════════════════════════ */}
      {/* HEADER ESTRATÉGICO                              */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 no-export">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 rounded-2xl border border-emerald-500/20 text-emerald-400">
              <BarChart3 className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Analítica Táctica
              </h1>
              <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                Reporte consolidado por ruta — {filterLabel}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/60 p-2 rounded-xl border border-white/5 backdrop-blur-md">
            <Calendar className="w-4 h-4 text-emerald-400 ml-2" />
            <input 
              type="month" 
              value={period} 
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-transparent border-none text-white focus:ring-0 text-sm font-bold uppercase"
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="border-white/10 bg-white/5 hover:bg-white/10 text-white" 
              onClick={fetchData}
            >
              <TrendingUp className="w-4 h-4 mr-2" /> Actualizar
            </Button>
            
            <Select onValueChange={handleExport}>
              <SelectTrigger className="w-44 bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow-lg shadow-emerald-900/20">
                <div className="flex items-center gap-2">
                  {exporting ? <Spinner className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  <SelectValue placeholder="Exportar reporte" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white">
                <SelectItem value="png">
                  <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Imagen (Para WhatsApp)</div>
                </SelectItem>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2"><FileText className="w-4 h-4" /> Documento PDF</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* FILTROS AVANZADOS                               */}
      {/* ═══════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="no-export relative z-50">
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-4 sm:p-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Filtros Avanzados</h3>
            <div className="ml-auto flex gap-2">
              {selectedZones.size > 0 && <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{selectedZones.size} zonas</span>}
              {selectedRoutes.size > 0 && <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">{selectedRoutes.size} rutas</span>}
              {selectedBrands.size > 0 && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{selectedBrands.size} marcas</span>}
              {selectedProducts.size > 0 && <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">{selectedProducts.size} SKUs Sat.</span>}
            </div>
          </div>

          {/* Row 1: Zona + Ruta + Marca */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 px-1">Zona Comercial (multi)</label>
              <MultiSelectDropdown
                label="Zonas" icon={Layers}
                options={availableZones}
                selected={selectedZones}
                onToggle={toggleZone}
                onSelectAll={(vals) => setSelectedZones(new Set(vals))}
                onClearAll={() => setSelectedZones(new Set())}
                placeholder="Todas las zonas"
                accentColor="blue"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 px-1">Ruta de Venta (multi)</label>
              <MultiSelectDropdown
                label="Rutas" icon={ChevronRight}
                options={availableRoutes}
                selected={selectedRoutes}
                onToggle={toggleRoute}
                onSelectAll={(vals) => setSelectedRoutes(new Set(vals))}
                onClearAll={() => setSelectedRoutes(new Set())}
                placeholder="Todas las rutas"
                accentColor="violet"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 px-1">Marcas — Columnas Cobertura</label>
              <MultiSelectDropdown
                label="Marcas" icon={BarChart3}
                options={brandOptions}
                selected={selectedBrands}
                onToggle={toggleBrand}
                onSelectAll={(vals) => setSelectedBrands(new Set(vals))}
                onClearAll={() => setSelectedBrands(new Set())}
                placeholder="Todas las marcas"
                accentColor="emerald"
                renderOption={(opt) => (
                  <span className={`text-sm font-bold ${brandColorMap[opt.value]?.textColor || 'text-white'}`}>{opt.label}</span>
                )}
              />
            </div>
          </div>

          {/* Row 2: SKU Saturación */}
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-500 px-1 block mb-1.5">SKUs para Saturación — solo afecta la columna %Sat</label>
            <ProductFilter
              products={skuCatalog}
              selected={selectedProducts}
              onSelectionChange={setSelectedProducts}
            />
          </div>
        </div>
      </motion.div>

      <div ref={dashboardRef} className="dashboard-pdf-container space-y-6 bg-slate-950 p-2">
        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Volumen Total HL', value: totalVolHL.toFixed(1), icon: Target, gradient: 'from-emerald-500/20 to-teal-500/10', iconColor: 'text-emerald-400' },
            { label: 'Cumplimiento CC', value: avgCC.toFixed(1) + '%', icon: Users, gradient: 'from-amber-500/20 to-orange-500/10', iconColor: 'text-amber-400' },
            { label: 'Saturación', value: avgSaturation.toFixed(1) + '%', icon: Percent, gradient: 'from-rose-500/20 to-pink-500/10', iconColor: 'text-rose-400',
              note: selectedProducts.size > 0 ? `${selectedProducts.size} SKUs` : 'Total cartera' },
            { label: 'Nuevos Clientes', value: totalNewClients, icon: TrendingUp, gradient: 'from-violet-500/20 to-purple-500/10', iconColor: 'text-violet-400' },
          ].map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <div className="p-5 bg-slate-900/60 border border-white/5 rounded-2xl backdrop-blur-md h-full">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                    <h3 className="text-2xl lg:text-3xl font-black text-white">{stat.value}</h3>
                    {stat.note && <p className="text-[9px] text-slate-600 mt-1">{stat.note}</p>}
                  </div>
                  <div className={`p-3 bg-gradient-to-br ${stat.gradient} rounded-xl ${stat.iconColor}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* RESUMEN DE EFECTIVIDAD (KPIS ADICIONALES)        */}
        {/* ═══════════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Resumen de Efectividad</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Frecuencia de Recompra (%) */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <div className="p-5 bg-slate-900/60 border border-white/5 rounded-2xl backdrop-blur-md h-full flex flex-col justify-between relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Frecuencia de Recompra</p>
                      <h3 className="text-2xl lg:text-3xl font-black text-white mt-1">
                        {effectivenessKpis.recompraPct.toFixed(1)}%
                      </h3>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-blue-500/10 rounded-xl text-cyan-400">
                      <Repeat className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    {effectivenessKpis.repeatBuyersCount} de {effectivenessKpis.totalBuyersCount} clientes (2+ compras)
                  </p>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div 
                    className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(effectivenessKpis.recompraPct, 100)}%` }} 
                  />
                </div>
              </div>
            </motion.div>

            {/* 2. Promedio HL / Cliente */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
              <div className="p-5 bg-slate-900/60 border border-white/5 rounded-2xl backdrop-blur-md h-full flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Promedio HL / Cliente</p>
                      <h3 className="text-2xl lg:text-3xl font-black text-white mt-1">
                        {effectivenessKpis.avgHlPerClient.toFixed(2)} <span className="text-xs font-semibold text-emerald-400">HL</span>
                      </h3>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 rounded-xl text-emerald-400">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    Volumen total / {effectivenessKpis.totalBuyersCount} clientes con compra
                  </p>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div 
                    className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min((effectivenessKpis.avgHlPerClient / 10) * 100, 100)}%` }} 
                  />
                </div>
              </div>
            </motion.div>

            {/* 3. Promedio Clientes con Compra al Día */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }}>
              <div className="p-5 bg-slate-900/60 border border-white/5 rounded-2xl backdrop-blur-md h-full flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/30 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Clientes Compra / Día</p>
                      <h3 className="text-2xl lg:text-3xl font-black text-white mt-1">
                        {effectivenessKpis.avgClientesDia.toFixed(1)} <span className="text-xs font-semibold text-amber-400">/día</span>
                      </h3>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-500/10 rounded-xl text-amber-400">
                      <CalendarCheck className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    {effectivenessKpis.totalBuyersCount} compradores / {effectivenessKpis.diasHabiles} días hábiles
                  </p>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div 
                    className="bg-amber-400 h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min((effectivenessKpis.avgClientesDia / 50) * 100, 100)}%` }} 
                  />
                </div>
              </div>
            </motion.div>

            {/* 4. % Rutas con Cumplimiento >80% */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
              <div className="p-5 bg-slate-900/60 border border-white/5 rounded-2xl backdrop-blur-md h-full flex flex-col justify-between relative overflow-hidden group hover:border-violet-500/30 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Rutas Cumplimiento &gt;80%</p>
                      <h3 className="text-2xl lg:text-3xl font-black text-white mt-1">
                        {effectivenessKpis.pctRutasCumplidas.toFixed(1)}%
                      </h3>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-violet-500/20 to-purple-500/10 rounded-xl text-violet-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    {effectivenessKpis.rutasCumplidas} de {effectivenessKpis.totalRutas} rutas superan el 80% avance
                  </p>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div 
                    className="bg-violet-400 h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(effectivenessKpis.pctRutasCumplidas, 100)}%` }} 
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* ZONE SUMMARY CARDS */}
        {zoneSummary.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Resumen por Zona</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {zoneSummary.map(z => {
                const pct = z.volMeta > 0 ? (z.volHL / z.volMeta) * 100 : 0;
                return (
                  <div key={z.zona} className="p-4 bg-slate-900/60 border border-white/5 rounded-2xl backdrop-blur-md space-y-2 hover:border-blue-500/20 transition-colors">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 truncate">{z.zona}</p>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[9px] text-slate-600">Vol HL</p>
                        <p className="text-lg font-black text-white">{z.volHL.toFixed(1)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-slate-600">Rutas</p>
                        <p className="text-lg font-black text-slate-300">{z.routes}</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className={pct >= 100 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-rose-400'}>{pct.toFixed(0)}% meta</span>
                      <span className="text-slate-600">Sat {z.saturation.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* MAIN TABLE */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Detalle por Ruta</h3>
              <span className="text-[10px] text-slate-600">{filteredDashboardRows.length} rutas con ventas</span>
            </div>
            <div className="overflow-x-auto scrollbar-none">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 uppercase text-[10px] font-bold tracking-widest text-slate-400">
                    <th className="px-5 py-4 sticky left-0 bg-slate-900 z-30">Ruta</th>
                    <th colSpan={2} className="px-3 py-4 text-center border-x border-white/5 bg-rose-500/5">Retardos</th>
                    <th colSpan={3} className="px-3 py-4 text-center border-r border-white/5 bg-emerald-500/5">Volumen HL</th>
                    <th colSpan={3} className="px-3 py-4 text-center border-r border-white/5 bg-amber-500/5">CC (Buyers)</th>
                    {visibleBrands.length > 0 && (
                      <th colSpan={visibleBrands.length} className="px-3 py-4 text-center border-r border-white/5 bg-blue-500/5">
                        Cobertura Marca (%)
                      </th>
                    )}
                    <th className="px-3 py-4 text-center border-r border-white/5 bg-rose-500/5">Saturación{selectedProducts.size > 0 ? ` (${selectedProducts.size} SKU)` : ''}</th>
                    <th className="px-3 py-4 text-center border-r border-white/5 bg-indigo-500/5">% Ejec.</th>
                    <th colSpan={GEC_LEVELS.length} className="px-3 py-4 text-center bg-purple-500/5">Nuevos Clientes</th>
                  </tr>
                  <tr className="bg-white/5 border-b border-white/10 text-[9px] font-bold text-slate-500 text-center uppercase tracking-tighter">
                    <th className="px-5 py-3 text-left sticky left-0 bg-slate-900 z-30 border-r border-white/5">ID</th>
                    <th className="w-14">Flt</th>
                    <th className="w-14 border-r border-white/5">Min</th>
                    <th className="w-16">Meta</th>
                    <th className="w-16">Acu</th>
                    <th className="w-16 border-r border-white/5">%Alc</th>
                    <th className="w-16">Meta</th>
                    <th className="w-16">Acu</th>
                    <th className="w-16 border-r border-white/5">%Alc</th>
                    {visibleBrands.map(b => {
                      const c = brandColorMap[b] || {};
                      const shortName = b.length > 6 ? b.substring(0, 5) + '…' : b;
                      return <th key={b} className={`w-14 ${c.textColor || 'text-slate-400'}`} title={b}>{shortName}</th>;
                    })}
                    <th className="w-20 text-rose-400 border-x border-white/5">%Sat</th>
                    <th className="w-20 border-r border-white/5">PDV Scr</th>
                    {GEC_LEVELS.map(gec => (
                      <th key={gec.key} className={`w-12 ${gec.textColor}`} title={gec.label}>{gec.short}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence>
                    {filteredDashboardRows.length > 0 ? filteredDashboardRows.map((row) => (
                      <motion.tr key={row.key} className="hover:bg-white/[0.03] transition-colors group">
                        <td className="px-5 py-3 font-black text-white sticky left-0 bg-slate-900/90 z-20 backdrop-blur-md border-r border-white/5 text-xs">
                          {row.label}
                          <div className="text-[8px] font-normal text-slate-500">{row.zona}</div>
                        </td>
                        <td className="p-0">
                          <Input type="number" className="w-full bg-transparent border-none text-center text-rose-300 focus:ring-0 h-9 text-[11px]" value={row.manual.faltas} onChange={(e) => handleManualChange(row.key, 'faltas', e.target.value)} onBlur={() => saveManualData(row.key, row.label)} />
                        </td>
                        <td className="p-0 border-r border-white/5">
                          <Input type="number" className="w-full bg-transparent border-none text-center text-rose-300 focus:ring-0 h-9 text-[11px]" value={row.manual.minutos} onChange={(e) => handleManualChange(row.key, 'minutos', e.target.value)} onBlur={() => saveManualData(row.key, row.label)} />
                        </td>
                        <td className="text-center text-slate-500 tabular-nums text-xs">{(row.volumen.meta || 0).toFixed(0)}</td>
                        <td className="text-center text-emerald-400 font-bold tabular-nums text-xs">{(row.volumen.acum || 0).toFixed(1)}</td>
                        <td className="text-center border-r border-white/5 font-black text-[11px]">
                          <span className={row.volumen.alcance >= 100 ? 'text-emerald-400' : row.volumen.alcance >= 70 ? 'text-amber-400' : 'text-rose-400'}>
                            {row.volumen.alcance.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-center text-slate-500 tabular-nums text-xs">{row.cc.meta}</td>
                        <td className="text-center text-amber-400 font-bold tabular-nums text-xs">{row.cc.acum}</td>
                        <td className="text-center border-r border-white/5 font-black text-[11px]">
                          <span className={row.cc.alcance >= 100 ? 'text-emerald-400' : row.cc.alcance >= 70 ? 'text-amber-400' : 'text-rose-400'}>
                            {row.cc.alcance.toFixed(1)}%
                          </span>
                        </td>
                        {/* Only show visibleBrands columns */}
                        {row.coverage.filter(b => visibleBrands.includes(b.name)).map(b => (
                          <td key={b.name} className="text-center text-[10px]">
                            <span className={b.pct >= b.target ? 'text-emerald-400 font-bold' : 'text-slate-600'}>{Math.round(b.pct)}%</span>
                          </td>
                        ))}
                        <td className="text-center border-x border-white/5 bg-rose-500/5 font-black text-rose-400 text-[11px]">
                          {row.saturation.toFixed(1)}%
                        </td>
                        <td className="text-center border-r border-white/5 text-blue-400 font-bold text-xs">{row.ejecucion.toFixed(1)}%</td>
                        {GEC_LEVELS.map(gec => (
                          <td key={gec.key} className={`text-center font-bold text-xs ${gec.textColor}/60 ${gec.bgColor}`}>
                            {row.gecCounts[gec.key] || '-'}
                          </td>
                        ))}
                      </motion.tr>
                    )) : (
                      <tr>
                        <td colSpan={50} className="px-6 py-20 text-center text-slate-500">
                          <div className="flex flex-col items-center gap-2">
                            <AlertCircle className="w-8 h-8 text-slate-600" />
                            <p>No hay datos para el período seleccionado</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════ */}
        {/* TOTALS ROW AS SUMMARY CARD                     */}
        {/* ═══════════════════════════════════════════════ */}
        {dashboardRows.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <GlassCard className="p-5 border-emerald-500/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Resumen por GEC — Clientes Nuevos del Mes
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {GEC_LEVELS.map(gec => {
                  const total = dashboardRows.reduce((acc, r) => acc + (r.gecCounts[gec.key] || 0), 0);
                  return (
                    <div key={gec.key} className={`p-4 rounded-xl ${gec.bgColor} border border-white/5`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${gec.textColor} mb-1`}>{gec.label}</p>
                      <p className="text-2xl font-black text-white">{total}</p>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* FOOTER INFO                                    */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-[10px] font-medium text-slate-500 uppercase tracking-widest no-export">
        <GlassCard className="p-4 border-emerald-500/10">
          <p className="text-emerald-400 mb-1 font-bold">Cobertura:</p>
          <p>Buyers únicos por marca / Cartera total de la ruta.</p>
        </GlassCard>
        <GlassCard className="p-4 border-rose-500/10">
          <p className="text-rose-400 mb-1 font-bold">Saturación:</p>
          <p>Clientes que compraron alguno de los productos seleccionados / Cartera total.</p>
        </GlassCard>
        <GlassCard className="p-4 border-violet-500/10">
          <p className="text-violet-400 mb-1 font-bold">Auto-guardado:</p>
          <p>Los datos de retardos se sincronizan al cambiar de celda.</p>
        </GlassCard>
      </div>
    </div>
  );
}

const Spinner = ({ className }) => (
  <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
