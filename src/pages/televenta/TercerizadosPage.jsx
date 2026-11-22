import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Plus, 
  Calendar, 
  Search, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  ArrowRight,
  Filter,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { searchClients } from '@/repositories/clientsRepository';
import { getTercerizados, addTercerizado } from '@/repositories/tercerizadosRepository';
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { format, parseISO, isAfter, subMonths, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';
const SalesDialog = React.lazy(() => import("@/components/SalesDialog"));

export default function TercerizadosPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('summary'); // 'add' | 'summary'
  const [loading, setLoading] = useState(true);
  const [tercerizados, setTercerizados] = useState([]);
  
  // Filter states
  const [filterZona, setFilterZona] = useState('ALL');
  const [filterRuta, setFilterRuta] = useState('ALL');
  const [filterSearch, setFilterSearch] = useState('');

  // Form State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [fechaCompra, setFechaCompra] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [submitting, setSubmitting] = useState(false);
  const [salesDialogClient, setSalesDialogClient] = useState(null);

  // Role check
  const userRole = (
    user?.user_metadata?.type || 
    user?.user_metadata?.role || 
    user?.app_metadata?.roles?.[0] || 
    user?.role || 
    ''
  ).toLowerCase();

  const canAdd = 
    userRole.includes('admin') || 
    userRole.includes('televenta');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const data = await getTercerizados();
    setTercerizados(data || []);
    setLoading(false);
  };

  const globalMeta = tercerizados.length * 5;
  const globalAvance = tercerizados.reduce((acc, t) => acc + Number(t.monthly_purchase_hl || 0), 0);
  const globalPercent = globalMeta > 0 ? (globalAvance / globalMeta) * 100 : 0;

  const handleSearch = async (val) => {
    setSearchTerm(val);
    if (val.length > 2) {
      const results = await searchClients(val);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const uniqueZonas = [...new Set(tercerizados.map(t => t.client_zona).filter(Boolean))].sort();
  const uniqueRutas = [...new Set(tercerizados.map(t => t.client_ruta).filter(Boolean))].sort();

  const filteredTercerizados = tercerizados.filter(t => {
    if (filterZona !== 'ALL' && t.client_zona !== filterZona) return false;
    if (filterRuta !== 'ALL' && t.client_ruta !== filterRuta) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!t.client_name?.toLowerCase().includes(q) && 
          !t.business_name?.toLowerCase().includes(q) && 
          !t.client_code?.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const handleAdd = async () => {
    if (!selectedClient || !fechaCompra) {
      toast({ title: "Faltan datos", description: "Selecciona un cliente y una fecha.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const res = await addTercerizado({
      client_id: selectedClient.id,
      fecha_compra_manual: fechaCompra,
      created_by: user?.id
    });

    if (res.success) {
      toast({ title: "¡Éxito!", description: res.message });
      setSelectedClient(null);
      setSearchTerm('');
      setSearchResults([]);
      fetchData();
      setActiveTab('summary');
    } else {
      toast({ title: "Error", description: res.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const getStatusInfo = (t) => {
    const now = new Date();
    const purchaseDate = parseISO(t.fecha_compra_manual);
    const hasBoughtThisMonth = t.monthly_purchase > 0;
    
    if (hasBoughtThisMonth) return { label: 'Completado', color: 'bg-emerald-500/20 text-emerald-400', icon: <CheckCircle2 size={14} /> };
    if (isAfter(now, purchaseDate)) return { label: 'Sin Compra', color: 'bg-rose-500/20 text-rose-400', icon: <AlertCircle size={14} /> };
    return { label: 'Pendiente', color: 'bg-amber-500/20 text-amber-400', icon: <Clock size={14} /> };
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 pb-12">
      <Helmet>
        <title>Tercerizados | Cervezas Finas</title>
      </Helmet>

      {/* Header */}
      <div className="bg-slate-900/50 border-b border-white/5 px-4 sm:px-6 py-5 sm:py-8 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2 sm:gap-3">
              <Users className="text-emerald-400 shrink-0" size={28} />
              PANEL TERCERIZADOS
            </h1>
            <p className="text-slate-400 mt-0.5 text-sm sm:text-base font-medium">Gestión y seguimiento de promociones especiales</p>
          </div>
          
          <div className="flex bg-slate-800/50 p-1 rounded-xl border border-white/5 self-start sm:self-auto">
            <button 
              onClick={() => setActiveTab('summary')}
              className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'summary' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Resumen
            </button>
            {canAdd && (
              <button 
                onClick={() => setActiveTab('add')}
                className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'add' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                Registrar Cliente
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'add' ? (
            <motion.div 
              key="add"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <Card className="bg-slate-900/80 border-white/10 shadow-2xl backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Plus className="text-emerald-400" />
                    Nueva Asignación de Tercerizado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Buscar Cliente</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 text-slate-500" size={18} />
                      <Input 
                        placeholder="Nombre, código o RFC..." 
                        className="pl-10 bg-slate-800/50 border-white/10 text-white"
                        value={searchTerm}
                        onChange={(e) => handleSearch(e.target.value)}
                      />
                    </div>
                    
                    {/* Search Results */}
                    {searchResults.length > 0 && (
                      <div className="mt-2 rounded-xl border border-white/10 bg-slate-800/80 overflow-hidden max-h-60 overflow-y-auto shadow-2xl">
                        {searchResults.map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => { setSelectedClient(c); setSearchResults([]); setSearchTerm(c.name); }}
                            className="p-3 hover:bg-emerald-600/20 cursor-pointer border-b border-white/5 transition-colors flex justify-between items-center"
                          >
                            <div>
                              <div className="text-sm font-bold">{c.name}</div>
                              <div className="text-xs text-slate-500">{c.client_code} · {c.business_name || 'Sin Razón Social'}</div>
                            </div>
                            <ArrowRight size={14} className="text-slate-600" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedClient && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                      <div className="text-xs font-bold text-emerald-400 uppercase mb-1">Cliente Seleccionado</div>
                      <div className="text-lg font-black">{selectedClient.name}</div>
                      <div className="text-sm text-slate-400">{selectedClient.address}</div>
                    </motion.div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Fecha de Alta / Primera Compra</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 text-slate-500" size={18} />
                      <Input 
                        type="date"
                        className="pl-10 bg-slate-800/50 border-white/10 text-white"
                        value={fechaCompra}
                        onChange={(e) => setFechaCompra(e.target.value)}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 italic">* Esta fecha se usará para el seguimiento de la promoción inicial.</p>
                  </div>

                  <Button 
                    onClick={handleAdd}
                    disabled={submitting || !selectedClient}
                    className="w-full py-6 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg rounded-xl shadow-lg transition-all"
                  >
                    {submitting ? 'Registrando...' : 'Confirmar Registro'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div 
              key="summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-slate-900/50 border-white/5">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Tercerizados</p>
                      <h3 className="text-3xl font-black text-white mt-1">{tercerizados.length}</h3>
                    </div>
                    <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                      <Users size={24} />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-white/5">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Meta Global</p>
                      <h3 className="text-3xl font-black text-white mt-1">{globalMeta.toFixed(0)} <span className="text-sm text-slate-500">HTL</span></h3>
                      <div className="flex items-center gap-2 mt-2">
                         <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500" style={{ width: `${Math.min(globalPercent, 100)}%` }} />
                         </div>
                         <span className="text-[10px] font-black text-indigo-400">{globalPercent.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                      <BarChart3 size={24} />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-white/5">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">HL Mes Actual</p>
                      <h3 className="text-3xl font-black text-emerald-400 mt-1">
                        {globalAvance.toFixed(2)}
                      </h3>
                    </div>
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                      <TrendingUp size={24} />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-white/5">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Alertas Sin Compra</p>
                      <h3 className="text-3xl font-black text-rose-400 mt-1">
                        {tercerizados.filter(t => {
                          const status = getStatusInfo(t);
                          return status.label === 'Sin Compra';
                        }).length}
                      </h3>
                    </div>
                    <div className="w-12 h-12 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-400">
                      <AlertCircle size={24} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Filters */}
              <Card className="bg-slate-900/50 border-white/5 mb-6">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-end">
                  <div className="flex-1 w-full space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Search size={14} /> Buscar Cliente
                    </label>
                    <Input 
                      placeholder="Nombre del negocio, cliente o código..." 
                      className="bg-slate-800/50 border-white/10 text-white"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                    />
                  </div>
                  <div className="w-full md:w-48 space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Filter size={14} /> Zona
                    </label>
                    <Select value={filterZona} onValueChange={setFilterZona}>
                      <SelectTrigger className="bg-slate-800/50 border-white/10 text-white">
                        <SelectValue placeholder="Todas las zonas" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        <SelectItem value="ALL">Todas las zonas</SelectItem>
                        {uniqueZonas.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full md:w-48 space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Filter size={14} /> Ruta
                    </label>
                    <Select value={filterRuta} onValueChange={setFilterRuta}>
                      <SelectTrigger className="bg-slate-800/50 border-white/10 text-white">
                        <SelectValue placeholder="Todas las rutas" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        <SelectItem value="ALL">Todas las rutas</SelectItem>
                        {uniqueRutas.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* ── MOBILE: tarjetas apiladas ── */}
              <div className="flex flex-col gap-3 md:hidden">
                {loading && (
                  <div className="p-10 text-center text-slate-400 text-sm">Cargando datos...</div>
                )}
                {!loading && filteredTercerizados.length === 0 && (
                  <div className="p-10 text-center text-slate-500 italic text-sm">No hay clientes que coincidan con los filtros.</div>
                )}
                {filteredTercerizados.map((t, idx) => {
                  const status = getStatusInfo(t);
                  const current = Number(t.monthly_purchase_hl || 0);
                  const percent = (current / 5) * 100;
                  const isGoalMet = current >= 5;
                  return (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      onClick={() => setSalesDialogClient({ name: t.client_name, client_code: t.client_code })}
                      className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      {/* Top row: nombre + estatus */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-100 truncate">{t.business_name || t.client_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono uppercase tracking-tight mt-0.5">
                            {t.client_code}{t.client_zona ? ` · Z:${t.client_zona}` : ''}{t.client_ruta ? ` · R:${t.client_ruta}` : ''}
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${status.color}`}>
                          {status.icon}{status.label}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] text-slate-500 uppercase tracking-widest">Avance</span>
                          <span className={`text-xs font-black ${isGoalMet ? 'text-emerald-400' : 'text-indigo-400'}`}>
                            {current.toFixed(2)} / 5.00 HL · {percent.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(percent, 100)}%` }}
                            className={`h-full rounded-full ${isGoalMet ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                          />
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white/5 rounded-xl p-2.5 text-center">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Alta Promo</div>
                          <div className="text-xs font-bold text-slate-300">
                            {format(parseISO(t.fecha_compra_manual), 'dd MMM yy', { locale: es })}
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-2.5 text-center">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Prom. Ant</div>
                          <div className="text-xs font-bold text-white">{Number(t.avg_prev_3_months_hl || 0).toFixed(1)} HL</div>
                          <div className="text-[9px] text-emerald-400">${Number(t.avg_prev_3_months || 0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-2.5 text-center">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Mes Ant</div>
                          <div className="text-xs font-bold text-white">{Number(t.last_month_purchase_hl || 0).toFixed(1)} HL</div>
                          <div className="text-[9px] text-emerald-400">${Number(t.last_month_purchase || 0).toLocaleString()}</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* ── DESKTOP: tabla completa ── */}
              <Card className="bg-slate-900/80 border-white/10 overflow-hidden hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-slate-400">Cliente</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-slate-400">F. Alta Promo</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-slate-400">PROM ANT</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-slate-400">Vta Mes Ant</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-slate-400">Meta (HTL)</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-slate-400">Compra Mes</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-slate-400">% Avance</th>
                        <th className="p-4 text-xs font-black uppercase tracking-widest text-slate-400 text-center">Estatus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredTercerizados.map((t, idx) => {
                        const status = getStatusInfo(t);
                        return (
                          <motion.tr 
                            key={t.id} 
                            initial={{ opacity: 0, x: -10 }} 
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="hover:bg-white/[0.05] transition-colors cursor-pointer"
                            onClick={() => setSalesDialogClient({ name: t.client_name, client_code: t.client_code })}
                          >
                            <td className="p-4">
                              <div className="font-bold text-slate-200">{t.business_name || t.client_name}</div>
                              <div className="text-[10px] text-slate-500 font-mono tracking-tighter uppercase">
                                {t.client_code} {t.client_zona ? `· Z: ${t.client_zona}` : ''} {t.client_ruta ? `· R: ${t.client_ruta}` : ''}
                              </div>
                            </td>
                            <td className="p-4 text-sm font-medium text-slate-300">
                              {format(parseISO(t.fecha_compra_manual), 'dd MMM yyyy', { locale: es })}
                            </td>
                            <td className="p-4">
                              <div className="text-sm font-black text-white">{Number(t.avg_prev_3_months_hl || 0).toFixed(2)} HL</div>
                              <div className="text-[10px] text-emerald-400 font-bold">${Number(t.avg_prev_3_months || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                              <div className="text-[9px] text-slate-500 uppercase mt-0.5 tracking-tighter">Promedio Registro</div>
                            </td>
                            <td className="p-4">
                              <div className="text-sm font-black text-white">{Number(t.last_month_purchase_hl || 0).toFixed(2)} HL</div>
                              <div className="text-[10px] text-emerald-400 font-bold">${Number(t.last_month_purchase || 0).toLocaleString()}</div>
                              <div className="text-[9px] text-slate-500 uppercase mt-0.5 tracking-tighter">Mes Anterior</div>
                            </td>
                            <td className="p-4">
                              <div className="text-sm font-black text-white">5.00 <span className="text-[10px] text-slate-500">HTL</span></div>
                              <div className="text-[9px] text-slate-500 uppercase mt-0.5 tracking-tighter">Meta Mensual</div>
                            </td>
                            <td className="p-4">
                              <div className="text-sm font-black text-white">{Number(t.monthly_purchase_hl || 0).toFixed(2)} HL</div>
                              <div className="text-[10px] text-emerald-400 font-bold">${Number(t.monthly_purchase || 0).toLocaleString()}</div>
                              <div className="text-[9px] text-slate-500 uppercase mt-0.5 tracking-tighter">Mes Actual</div>
                            </td>
                            <td className="p-4">
                              {(() => {
                                const current = Number(t.monthly_purchase_hl || 0);
                                const percent = (current / 5) * 100;
                                const isGoalMet = current >= 5;
                                return (
                                  <div className="flex flex-col gap-1 w-24">
                                    <div className="flex items-center justify-between">
                                      <span className={`text-[10px] font-black ${isGoalMet ? 'text-emerald-400' : 'text-slate-400'}`}>{percent.toFixed(0)}%</span>
                                      {isGoalMet && <CheckCircle2 size={10} className="text-emerald-400" />}
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(percent, 100)}%` }} className={`h-full ${isGoalMet ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${status.color}`}>
                                {status.icon}{status.label}
                              </span>
                            </td>
                          </motion.tr>
                        );
                      })}
                      {filteredTercerizados.length === 0 && !loading && (
                        <tr><td colSpan="8" className="p-12 text-center text-slate-500 italic">No hay clientes que coincidan con los filtros.</td></tr>
                      )}
                      {loading && (
                        <tr><td colSpan="8" className="p-12 text-center text-slate-400">Cargando datos...</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Sales History Dialog */}
      <React.Suspense fallback={null}>
        {salesDialogClient && (
          <SalesDialog 
            client={salesDialogClient} 
            onClose={() => setSalesDialogClient(null)} 
          />
        )}
      </React.Suspense>
    </div>
  );
}
