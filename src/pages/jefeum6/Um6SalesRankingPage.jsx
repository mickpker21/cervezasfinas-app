import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { getSalesBySku } from '@/repositories/salesRepository';
import { loadClientsFromLocal, getClients } from '@/repositories/clientsRepository';
import { getSkuDescriptions } from '@/repositories/metadataRepository';
import { ChevronDown, ChevronUp, TrendingUp, Search, X, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const strip = (s) => (s || '').toString().trim();
const norm  = (s) => strip(s).toUpperCase();
const isUM6  = (cadena) => norm(cadena || '').includes('UM6');
const clientCodeKey = (s) => norm(s).replace(/[^A-Z0-9]/g, '');

const MONTHS = [
  { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' },
];

const endOfMonthISO = (y, m) => new Date(y, m, 0).toISOString().slice(0, 10);

export default function Um6SalesRankingPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [rows, setRows]       = useState([]);
  const [clients, setClients] = useState([]);
  const [skuDescMap, setSkuDescMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null); // client code

  const from     = `${year}-${String(month).padStart(2,'0')}-01`;
  const to       = endOfMonthISO(year, month);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  const nextFrom  = `${nextYear}-${String(nextMonth).padStart(2,'0')}-01`;

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [salesRows, cls, descs] = await Promise.all([
        getSalesBySku({ from, to, nextFrom }).catch(() => []),
        loadClientsFromLocal().catch(() => getClients().catch(() => [])),
        getSkuDescriptions().catch(() => []),
      ]);
      if (!active) return;
      setRows(salesRows || []);
      setClients(cls || []);
      const dm = {};
      for (const r of descs || []) if (r.cve_marca) dm[norm(r.cve_marca)] = r.descripcion || r.cve_marca;
      setSkuDescMap(dm);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [from, to, nextFrom]);

  // Index clients
  const clientsByCode = useMemo(() => {
    const map = new Map();
    for (const c of clients) {
      const code = strip(c.client_code || c.code || c.cve_cliente || '');
      if (code) map.set(code, c);
    }
    return map;
  }, [clients]);

  const clientsByKey = useMemo(() => {
    const map = new Map();
    for (const c of clients) {
      const code = strip(c.client_code || c.code || c.cve_cliente || '');
      if (code) map.set(clientCodeKey(code), c);
    }
    return map;
  }, [clients]);

  // UM6 rows
  const um6Rows = useMemo(() => (rows || []).filter(r => {
    const code = strip(r.cve_cliente); if (!code) return false;
    const c = clientsByCode.get(code) || clientsByKey.get(clientCodeKey(code));
    return c && isUM6(c.cadena);
  }), [rows, clientsByCode, clientsByKey]);

  // Aggregate by client
  const ranking = useMemo(() => {
    const acc = new Map(); // code -> { hl, skus: Map }
    for (const r of um6Rows) {
      const code = strip(r.cve_cliente); if (!code) continue;
      const hl   = Number(r.htls_total) || 0;
      const sku  = norm(r.cve_marca || 'SIN MARCA');
      if (!acc.has(code)) acc.set(code, { hl: 0, skus: new Map() });
      const entry = acc.get(code);
      entry.hl += hl;
      entry.skus.set(sku, (entry.skus.get(sku) || 0) + hl);
    }
    return Array.from(acc.entries()).map(([code, { hl, skus }]) => {
      const c = clientsByCode.get(code) || clientsByKey.get(clientCodeKey(code));
      const skuList = Array.from(skus.entries())
        .map(([sku, skuHl]) => ({ sku, desc: skuDescMap[sku] || sku, hl: Math.round(skuHl * 100) / 100 }))
        .sort((a, b) => b.hl - a.hl);
      return {
        code,
        name: c?.name || c?.business_name || code,
        zona: c?.zona || c?.region || '—',
        hl: Math.round(hl * 100) / 100,
        skus: skuList,
      };
    }).sort((a, b) => b.hl - a.hl);
  }, [um6Rows, clientsByCode, clientsByKey, skuDescMap]);

  const totalHL = useMemo(() => ranking.reduce((a, r) => a + r.hl, 0), [ranking]);
  const maxHL   = ranking[0]?.hl || 1;

  const filtered = useMemo(() => {
    if (!search.trim()) return ranking;
    const term = search.toLowerCase();
    return ranking.filter(r => r.name.toLowerCase().includes(term) || r.code.toLowerCase().includes(term));
  }, [ranking, search]);

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const monthLabel = MONTHS.find(m => m.value === month)?.label || '';

  return (
    <div className="p-4 md:p-8 space-y-6 bg-[#0B1120] min-h-screen text-slate-100">
      <Helmet><title>Ranking Ventas UM6 — Cervezas Finas</title></Helmet>

      {/* Header */}
      <div className="relative bg-slate-900/50 rounded-3xl p-6 border border-white/5 backdrop-blur-xl overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <p className="text-purple-400 text-xs font-bold uppercase tracking-widest mb-1">Cadena UM6</p>
            <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 to-fuchsia-400 text-transparent bg-clip-text">
              Ranking de Ventas
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              {loading ? 'Cargando…' : `${ranking.length} tiendas · ${totalHL.toFixed(1)} HL total · ${monthLabel} ${year}`}
            </p>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500"
              >
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Buscar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar tienda…"
          className="w-full pl-10 pr-10 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-purple-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-16 bg-slate-800/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">No hay tiendas con ventas en este período.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((store, idx) => {
            const isOpen = expanded === store.code;
            const barPct = maxHL > 0 ? Math.round((store.hl / maxHL) * 100) : 0;
            const rankColor = idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-slate-500';

            return (
              <motion.div
                key={store.code}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              >
                {/* Row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : store.code)}
                  className={`w-full text-left bg-slate-900/60 border rounded-2xl px-4 py-3 transition-all hover:border-purple-500/40 ${isOpen ? 'border-purple-500/50 shadow-lg shadow-purple-900/20' : 'border-white/5'}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank */}
                    <span className={`text-lg font-black w-8 shrink-0 text-right ${rankColor}`}>
                      {idx < 3 ? ['🥇','🥈','🥉'][idx] : `#${idx+1}`}
                    </span>

                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-white font-semibold text-sm truncate">{store.name}</span>
                        <span className="text-purple-400 font-black text-sm shrink-0">{store.hl.toFixed(2)} HL</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-500 font-mono">{store.code}</span>
                        <span className="text-[10px] text-slate-500">{store.zona}</span>
                        <span className="text-[10px] text-slate-500">{totalHL > 0 ? `${Math.round((store.hl/totalHL)*100)}% del total` : ''}</span>
                      </div>
                    </div>

                    {/* Expand icon */}
                    <div className="shrink-0 text-slate-400">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                </button>

                {/* SKU Breakdown */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 mb-2 ml-8 bg-slate-950/70 border border-purple-500/20 rounded-xl p-4 space-y-2.5">
                        <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">
                          Productos vendidos — {monthLabel} {year}
                        </p>
                        {store.skus.length === 0 ? (
                          <p className="text-slate-500 text-sm">Sin detalle por producto.</p>
                        ) : store.skus.map(s => {
                          const pct = store.hl > 0 ? Math.round((s.hl / store.hl) * 100) : 0;
                          return (
                            <div key={s.sku}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-200">{s.desc}</span>
                                <span className="text-emerald-400 font-bold">{s.hl} HL <span className="text-slate-500 font-normal text-xs">({pct}%)</span></span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
