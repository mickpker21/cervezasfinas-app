import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getSalesBySku } from '@/repositories/salesRepository';
import { getClients, loadClientsFromLocal } from '@/repositories/clientsRepository';
import { getTercerizados } from '@/repositories/tercerizadosRepository';
import { getSkuDescriptions } from '@/repositories/metadataRepository';
import { getTodayMexico } from '@/lib/dateUtils';
import { Store, TrendingUp, Package, AlertTriangle, BarChart3, MapPin, Users, ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import InteractiveMap from '@/components/common/InteractiveMap';

const strip = (s) => (s || '').toString().trim();
const norm = (s) => strip(s).toUpperCase();
const clientCodeKey = (s) => norm(s).replace(/[^A-Z0-9]/g, '');
const isUM6 = (cadena) => norm(cadena || '').includes('UM6');

const endOfMonthISO = (y, m) => new Date(y, m, 0).toISOString().slice(0, 10);

const KpiCard = ({ title, value, sub, icon: Icon, color = 'emerald', delay = 0 }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
    <Card className="bg-slate-900/60 border-white/5 backdrop-blur-xl shadow-xl overflow-hidden relative">
      <div className="absolute top-0 right-0 p-4 opacity-10">{Icon && <Icon className="w-16 h-16" />}</div>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-4xl font-black text-${color}-400`}>{value}</div>
        {sub && <p className="text-xs text-slate-400 mt-1 font-semibold">{sub}</p>}
      </CardContent>
    </Card>
  </motion.div>
);

export default function JefeUm6Dashboard() {
  const { user } = useSupabaseAuth();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [vpsRows, setVpsRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [tercerizados, setTercerizados] = useState([]);
  const [skuDescMap, setSkuDescMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ventas');

  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = endOfMonthISO(year, month);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextFrom = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [rows, cls, tercs, descs] = await Promise.all([
        getSalesBySku({ from, to, nextFrom }).catch(() => []),
        loadClientsFromLocal().catch(() => getClients().catch(() => [])),
        getTercerizados().catch(() => []),
        getSkuDescriptions().catch(() => []),
      ]);
      setVpsRows(rows || []);
      setClients(cls || []);
      setTercerizados(tercs || []);
      const dm = {};
      for (const r of descs || []) if (r.cve_marca) dm[norm(r.cve_marca)] = r.descripcion || r.cve_marca;
      setSkuDescMap(dm);
      setLoading(false);
    })();
  }, [from, to, nextFrom]);

  // Index clients
  const clientsByKey = useMemo(() => {
    const map = new Map();
    for (const c of clients) {
      const code = strip(c.client_code || c.code || c.cve_cliente || c.id || '');
      if (code) map.set(clientCodeKey(code), c);
      const name = strip(c.name || '');
      if (name) map.set(clientCodeKey(name), c);
    }
    return map;
  }, [clients]);

  const clientsByCode = useMemo(() => {
    const map = new Map();
    for (const c of clients) {
      const code = strip(c.client_code || c.code || c.cve_cliente || c.id || '');
      if (code) map.set(code, c);
    }
    return map;
  }, [clients]);

  // UM6 rows only
  const um6Rows = useMemo(() => {
    return (vpsRows || []).filter(r => {
      const code = strip(r.cve_cliente);
      if (!code) return false;
      const key = clientCodeKey(code);
      const c = clientsByCode.get(code) || clientsByKey.get(key);
      return c && isUM6(c.cadena);
    });
  }, [vpsRows, clientsByCode, clientsByKey]);

  // KPIs
  const totalHL = useMemo(() => um6Rows.reduce((a, r) => a + (Number(r.htls_total) || 0), 0), [um6Rows]);

  const storesWithSales = useMemo(() => {
    const set = new Set();
    for (const r of um6Rows) { const code = strip(r.cve_cliente); if (code) set.add(code); }
    return set.size;
  }, [um6Rows]);

  const um6Clients = useMemo(() => clients.filter(c => isUM6(c.cadena)), [clients]);

  const storesWithoutSales = useMemo(() => {
    const withSales = new Set(um6Rows.map(r => strip(r.cve_cliente)).filter(Boolean));
    return um6Clients.filter(c => {
      const code = strip(c.client_code || c.code || c.cve_cliente || '');
      return !withSales.has(code);
    });
  }, [um6Clients, um6Rows]);

  // New stores this month (tercerizados)
  const newThisMonth = useMemo(() => {
    return tercerizados.filter(t => {
      if (!t.fecha_compra_manual) return false;
      const d = new Date(t.fecha_compra_manual);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    }).length;
  }, [tercerizados, year, month]);

  // Top stores
  const topStores = useMemo(() => {
    const acc = new Map();
    for (const r of um6Rows) {
      const code = strip(r.cve_cliente); if (!code) continue;
      const v = Number(r.htls_total) || 0;
      acc.set(code, (acc.get(code) || 0) + v);
    }
    return Array.from(acc.entries()).map(([code, hl]) => {
      const c = clientsByCode.get(code) || clientsByKey.get(clientCodeKey(code));
      return { code, name: c?.name || c?.business_name || code, hl: Math.round(hl * 100) / 100 };
    }).sort((a, b) => b.hl - a.hl).slice(0, 15);
  }, [um6Rows, clientsByCode, clientsByKey]);

  // SKU breakdown
  const skuBreakdown = useMemo(() => {
    const acc = new Map();
    for (const r of um6Rows) {
      const sku = norm(r.cve_marca || ''); if (!sku) continue;
      const v = Number(r.htls_total) || 0;
      acc.set(sku, (acc.get(sku) || 0) + v);
    }
    return Array.from(acc.entries()).map(([sku, hl]) => ({
      sku, desc: skuDescMap[sku] || sku, hl: Math.round(hl * 100) / 100,
      pct: totalHL > 0 ? Math.round((hl / totalHL) * 100) : 0,
    })).sort((a, b) => b.hl - a.hl).slice(0, 10);
  }, [um6Rows, skuDescMap, totalHL]);

  // Map clients
  const mapClients = useMemo(() => {
    return um6Clients.filter(c => {
      const lat = Number(c.latitud || c.lat); const lng = Number(c.longitud || c.lng || c.lon);
      return lat && lng;
    }).map(c => ({
      ...c,
      coords: { lat: Number(c.latitud || c.lat), lng: Number(c.longitud || c.lng || c.lon) }
    }));
  }, [um6Clients]);

  const tabs = [
    { id: 'ventas', label: '📊 Ventas' },
    { id: 'tiendas', label: '🏪 Tiendas' },
    { id: 'productos', label: '🍺 Productos' },
    { id: 'mapa', label: '📍 Mapa' },
    { id: 'alertas', label: `⚠️ Sin Compra (${storesWithoutSales.length})` },
  ];

  const userName = user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Jefe UM6';

  return (
    <div className="p-4 md:p-8 space-y-6 bg-[#0B1120] min-h-screen text-slate-100">
      <Helmet><title>Dashboard UM6 — Cervezas Finas</title></Helmet>

      {/* Header */}
      <div className="relative bg-slate-900/50 rounded-3xl p-6 border border-white/5 backdrop-blur-xl overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <p className="text-purple-400 text-xs font-bold uppercase tracking-widest mb-1">Bienvenido, {userName}</p>
            <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-purple-400 to-fuchsia-400 text-transparent bg-clip-text">
              Centro de Control UM6
            </h1>
            <p className="text-slate-400 mt-1">Seguimiento de ventas y operaciones — Cadena UM6 · {new Date(year, month - 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</p>
          </div>
          {/* Filtro mes/año */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500"
            >
              {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                .map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500"
            >
              {[now.getFullYear(), now.getFullYear()-1, now.getFullYear()-2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Volumen HL UM6" value={loading ? '…' : totalHL.toFixed(1)} sub={`${storesWithSales} tiendas activas`} icon={TrendingUp} color="purple" delay={0} />
        <KpiCard title="Total Tiendas UM6" value={loading ? '…' : um6Clients.length} sub="En catálogo" icon={Store} color="blue" delay={0.1} />
        <KpiCard title="Tiendas Nuevas" value={loading ? '…' : newThisMonth} sub="Registradas este mes" icon={Users} color="emerald" delay={0.2} />
        <KpiCard title="Sin Compra" value={loading ? '…' : storesWithoutSales.length} sub="Este mes" icon={AlertTriangle} color={storesWithoutSales.length > 0 ? 'rose' : 'emerald'} delay={0.3} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === t.id ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 bg-slate-800/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* VENTAS */}
          {activeTab === 'ventas' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-slate-900/60 border-white/5 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2"><TrendingUp className="h-5 w-5 text-purple-400" />Top Tiendas por HL</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {topStores.map((s, i) => (
                      <div key={s.code} className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 w-5 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-sm text-white truncate">{s.name}</span>
                            <span className="text-sm font-bold text-purple-400 ml-2 shrink-0">{s.hl} HL</span>
                          </div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full"
                              style={{ width: `${totalHL > 0 ? Math.round((s.hl / topStores[0]?.hl) * 100) : 0}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                    {topStores.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Sin ventas registradas este mes.</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/60 border-white/5 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2"><BarChart3 className="h-5 w-5 text-fuchsia-400" />Resumen del Mes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'HL Total', value: `${totalHL.toFixed(2)} HL`, color: 'purple' },
                      { label: 'Tiendas Activas', value: storesWithSales, color: 'blue' },
                      { label: 'Promedio HL/Tienda', value: storesWithSales > 0 ? `${(totalHL / storesWithSales).toFixed(2)} HL` : '—', color: 'emerald' },
                      { label: 'Cobertura', value: um6Clients.length > 0 ? `${Math.round((storesWithSales / um6Clients.length) * 100)}%` : '—', color: 'amber' },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{item.label}</p>
                        <p className={`text-2xl font-black text-${item.color}-400 mt-1`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TIENDAS */}
          {activeTab === 'tiendas' && (
            <Card className="bg-slate-900/60 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Store className="h-5 w-5 text-blue-400" />Todas las Tiendas UM6 ({um6Clients.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-800 text-xs text-slate-400 uppercase">
                      <th className="p-3 text-left">Tienda</th>
                      <th className="p-3 text-left">Código</th>
                      <th className="p-3 text-left">Zona</th>
                      <th className="p-3 text-right">HL Mes</th>
                      <th className="p-3 text-center">Estatus</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {um6Clients.map(c => {
                        const code = strip(c.client_code || c.code || c.cve_cliente || '');
                        const hl = um6Rows.filter(r => strip(r.cve_cliente) === code).reduce((a, r) => a + (Number(r.htls_total) || 0), 0);
                        const active = hl > 0;
                        return (
                          <tr key={c.id || code} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-3 text-white font-medium">{c.name || c.business_name || code}</td>
                            <td className="p-3 text-slate-400 font-mono text-xs">{code}</td>
                            <td className="p-3 text-slate-400">{c.zona || c.region || '—'}</td>
                            <td className="p-3 text-right font-bold text-purple-400">{hl > 0 ? hl.toFixed(2) : '—'}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                {active ? 'Con Compra' : 'Sin Compra'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PRODUCTOS */}
          {activeTab === 'productos' && (
            <Card className="bg-slate-900/60 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-emerald-400" />Marcas y Productos Vendidos en UM6</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {skuBreakdown.map((s, i) => (
                    <div key={s.sku} className="flex items-center gap-4">
                      <span className="text-xs text-slate-500 w-5 text-right">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm text-white">{s.desc}</span>
                          <span className="text-sm font-bold text-emerald-400">{s.hl} HL <span className="text-slate-500 font-normal text-xs">({s.pct}%)</span></span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                            style={{ width: `${s.pct}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {skuBreakdown.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Sin datos de productos este mes.</p>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* MAPA */}
          {activeTab === 'mapa' && (
            <Card className="bg-slate-900/60 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><MapPin className="h-5 w-5 text-rose-400" />Ubicaciones Tiendas UM6 ({mapClients.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[500px] rounded-xl overflow-hidden">
                  <InteractiveMap clients={mapClients} height="500px" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ALERTAS */}
          {activeTab === 'alertas' && (
            <Card className="bg-slate-900/60 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-rose-400" />Tiendas Sin Compra Este Mes ({storesWithoutSales.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {storesWithoutSales.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">🎉</div>
                    <p className="text-emerald-400 font-bold">¡Todas las tiendas tienen compra este mes!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {storesWithoutSales.map(c => {
                      const code = strip(c.client_code || c.code || c.cve_cliente || '');
                      return (
                        <div key={code} className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
                          <p className="text-white font-semibold text-sm">{c.name || c.business_name || code}</p>
                          <p className="text-slate-400 text-xs mt-1 font-mono">{code}</p>
                          <p className="text-slate-500 text-xs">{c.zona || '—'}</p>
                          <span className="mt-2 inline-block px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[10px] font-bold rounded-full">Sin Compra</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
