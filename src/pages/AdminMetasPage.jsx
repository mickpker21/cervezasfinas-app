import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  Target,
  Plus,
  Save,
  Trash2,
  Edit3,
  X,
  Check,
  MapPin,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronRight,
  Calendar,
  Layers,
  AlertCircle,
  Lock
} from 'lucide-react';

const TABLE_METAS_VENTA = 'metas_venta';

function currentPeriodDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function periodStartFromYYYYMM(yyyymm) {
  if (!yyyymm) return currentPeriodDate();
  return `${yyyymm}-01`;
}

function nextPeriodStartFromYYYYMM(yyyymm) {
  if (!yyyymm) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
  }
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m, 1).toISOString().slice(0, 10);
}

const GlassCard = ({ children, className = "" }) => (
  <Card className={`bg-slate-900/40 backdrop-blur-xl border-white/10 shadow-2xl overflow-hidden ${className}`}>
    {children}
  </Card>
);

export default function AdminMetasPage() {
  const { toast } = useToast();
  const { user } = useSupabaseAuth();

  // Detect analyst role
  const isAnalista = useMemo(() => {
    const rawType = user?.user_metadata?.type || user?.user_metadata?.role || (user?.app_metadata?.roles?.[0]) || '';
    return rawType.toString().toLowerCase().replace(/[\s_-]/g, '') === 'analista';
  }, [user]);

  const isAdmin = useMemo(() => {
    const rawType = user?.user_metadata?.type || user?.user_metadata?.role || (user?.app_metadata?.roles?.[0]) || '';
    const norm = rawType.toString().toLowerCase().replace(/[\s_-]/g, '');
    return norm === 'admin' || norm === 'superadmin' || norm === 'gerentegeneral';
  }, [user]);

  // Current month for analyst lock
  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Data
  const [metasZona, setMetasZona] = useState([]);
  const [metasRuta, setMetasRuta] = useState([]);
  const [metasVenta, setMetasVenta] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(() => currentPeriodDate().slice(0, 7));
  const [zonasRutas, setZonasRutas] = useState([]);
  const [zrLoading, setZrLoading] = useState(true);

  // Inputs
  const [newZona, setNewZona] = useState('');
  const [newMetaZona, setNewMetaZona] = useState('');
  const [newRutaForZona, setNewRutaForZona] = useState({});
  const [editingPair, setEditingPair] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [metaRutaDraft, setMetaRutaDraft] = useState({});
  const [newVenta, setNewVenta] = useState('');
  const [newMetaVenta, setNewMetaVenta] = useState('');
  const [newMetaClientes, setNewMetaClientes] = useState('');
  const [newMetaClientes1HL, setNewMetaClientes1HL] = useState('');

  // UI state
  const [expandedZonas, setExpandedZonas] = useState(new Set());

  // Force analyst to current month
  useEffect(() => {
    if (isAnalista && selectedPeriod !== currentMonth) {
      setSelectedPeriod(currentMonth);
    }
  }, [isAnalista, currentMonth, selectedPeriod]);

  // Period is locked for analysts
  const periodLocked = isAnalista;

  const allRutas = useMemo(() => {
    const set = new Set([
      ...metasRuta.map(r => r.ruta).filter(Boolean),
      ...metasVenta.map(v => v.sales_route).filter(Boolean),
      ...zonasRutas.map(zr => zr.ruta).filter(Boolean),
    ]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [metasRuta, metasVenta, zonasRutas]);

  const rutasPorZona = useMemo(() => {
    const acc = {};
    zonasRutas.forEach(({ zona, ruta }) => {
      if (!acc[zona]) acc[zona] = [];
      if (ruta && !acc[zona].includes(ruta)) acc[zona].push(ruta);
    });
    Object.keys(acc).forEach(z => acc[z].sort((a, b) => a.localeCompare(b)));
    return acc;
  }, [zonasRutas]);

  // Load data
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setZrLoading(true);
      try {
        const period_date = periodStartFromYYYYMM(selectedPeriod);
        const next_period = nextPeriodStartFromYYYYMM(selectedPeriod);
        const [
          { data: zonas, error: ez },
          { data: rutas, error: er },
          { data: ventas, error: ev },
          { data: zr, error: ezr },
        ] = await Promise.all([
          supabase.from('metas_zona').select('*').gte('period_date', period_date).lt('period_date', next_period),
          supabase.from('metas_ruta').select('*').gte('period_date', period_date).lt('period_date', next_period),
          supabase.from(TABLE_METAS_VENTA).select('*').gte('period_date', period_date).lt('period_date', next_period),
          supabase.from('zonas_rutas').select('*'),
        ]);

        if (ez) throw ez;
        if (er) throw er;
        if (ev) throw ev;
        if (ezr) throw ezr;

        const normalizeRow = (r) => ({
          ...r,
          period_date: r?.period_date ? new Date(r.period_date).toISOString().slice(0, 10) : period_date,
        });
        setMetasZona((zonas || []).map(normalizeRow));
        setMetasRuta((rutas || []).map(normalizeRow));
        setMetasVenta((ventas || []).map(normalizeRow));
        setZonasRutas(zr || []);

        // Auto-expand all zonas
        const allZonas = new Set((zonas || []).map(z => z.zona));
        setExpandedZonas(allZonas);
      } catch (err) {
        toast({ title: 'Error', description: err?.message || 'No se pudieron cargar los datos.', variant: 'destructive' });
      } finally {
        setLoading(false);
        setZrLoading(false);
      }
    };
    fetchAll();
  }, [toast, selectedPeriod]);

  // CRUD helpers
  const addMetaZona = async (zona, meta) => {
    try {
      const period_date = periodStartFromYYYYMM(selectedPeriod);
      const value = Number(meta);
      if (!zona || Number.isNaN(value)) return;
      const { error } = await supabase.from('metas_zona').upsert([{ zona, meta: value, period_date }], { onConflict: 'zona,period_date' });
      if (error) throw error;
      setMetasZona(prev => {
        const idx = prev.findIndex(m => m.zona === zona && m.period_date === period_date);
        const row = { zona, meta: value, period_date };
        return idx >= 0 ? prev.map((m, i) => (i === idx ? row : m)) : [...prev, row];
      });
      setExpandedZonas(prev => new Set([...prev, zona]));
      toast({ title: 'Meta guardada', description: `Zona "${zona}" con meta ${value} HL.` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const addMetaVenta = async (sales_route, meta, meta_clientes, meta_clientes_1htl) => {
    try {
      const period_date = periodStartFromYYYYMM(selectedPeriod);
      const value = Number(meta);
      const valClientes = Number(meta_clientes || 0);
      const valClientes1HL = Number(meta_clientes_1htl || 0);
      if (!sales_route || Number.isNaN(value)) return;
      const { error } = await supabase.from(TABLE_METAS_VENTA).upsert([{
        sales_route, meta: value, meta_clientes: valClientes, meta_clientes_1htl: valClientes1HL, period_date
      }], { onConflict: 'sales_route,period_date' });
      if (error) throw error;
      setMetasVenta(prev => {
        const idx = prev.findIndex(m => m.sales_route === sales_route && m.period_date === period_date);
        const row = { sales_route, meta: value, meta_clientes: valClientes, meta_clientes_1htl: valClientes1HL, period_date };
        return idx >= 0 ? prev.map((m, i) => (i === idx ? row : m)) : [...prev, row];
      });
      toast({ title: 'Meta guardada', description: `Ruta "${sales_route}" actualizada.` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const addRutaToZona = async (zona, ruta) => {
    try {
      const val = (ruta || '').trim();
      if (!zona || !val) return;
      const { error } = await supabase.from('zonas_rutas').upsert([{ zona, ruta: val }], { onConflict: 'zona,ruta' });
      if (error) throw error;
      setZonasRutas(prev => {
        const exists = prev.some(zr => zr.zona === zona && zr.ruta === val);
        return exists ? prev : [...prev, { zona, ruta: val }];
      });
      setNewRutaForZona(s => ({ ...s, [zona]: '' }));
      toast({ title: 'Ruta asignada', description: `Ruta "${val}" → Zona "${zona}".` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const removeRutaFromZona = async (zona, ruta) => {
    try {
      const { error } = await supabase.from('zonas_rutas').delete().eq('zona', zona).eq('ruta', ruta);
      if (error) throw error;
      setZonasRutas(prev => prev.filter(zr => !(zr.zona === zona && zr.ruta === ruta)));
      if (editingPair?.zona === zona && editingPair?.ruta === ruta) {
        setEditingPair(null);
        setEditingValue('');
      }
      toast({ title: 'Ruta eliminada', description: `"${ruta}" removida de "${zona}".` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const updateRutaForZona = async (zona, oldRuta, newRuta) => {
    try {
      const val = (newRuta || '').trim();
      if (!zona || !oldRuta || !val) return;
      const { error } = await supabase.from('zonas_rutas').update({ ruta: val }).eq('zona', zona).eq('ruta', oldRuta);
      if (error) {
        if (error.code === '23505') {
          await supabase.from('zonas_rutas').upsert([{ zona, ruta: newRuta }], { onConflict: 'zona,ruta' });
          await supabase.from('zonas_rutas').delete().eq('zona', zona).eq('ruta', oldRuta);
          setZonasRutas(prev => {
            const filtered = prev.filter(zr => !(zr.zona === zona && zr.ruta === oldRuta));
            return filtered.some(zr => zr.zona === zona && zr.ruta === newRuta) ? filtered : [...filtered, { zona, ruta: newRuta }];
          });
        } else throw error;
      } else {
        setZonasRutas(prev => prev.map(zr => zr.zona === zona && zr.ruta === oldRuta ? { ...zr, ruta: val } : zr));
      }
      setEditingPair(null);
      setEditingValue('');
      toast({ title: 'Ruta actualizada' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const getMetaDeRutaVenta = (ruta) => {
    const period_date = periodStartFromYYYYMM(selectedPeriod);
    const m = metasVenta.find(r => r.sales_route === ruta && r.period_date === period_date);
    return m ? { meta: m.meta, meta_clientes: m.meta_clientes, meta_clientes_1htl: m.meta_clientes_1htl } : { meta: '', meta_clientes: '', meta_clientes_1htl: '' };
  };

  const saveMetaForRutaVenta = async (ruta, valuesObj) => {
    try {
      const period_date = periodStartFromYYYYMM(selectedPeriod);
      const value = valuesObj.meta === '' ? 0 : Number(valuesObj.meta);
      const valCli = valuesObj.meta_clientes === '' ? 0 : Number(valuesObj.meta_clientes);
      const valCli1 = valuesObj.meta_clientes_1htl === '' ? 0 : Number(valuesObj.meta_clientes_1htl);
      if (!ruta) return;
      const { error } = await supabase.from(TABLE_METAS_VENTA).upsert([{
        sales_route: ruta, meta: value, meta_clientes: valCli, meta_clientes_1htl: valCli1, period_date
      }], { onConflict: 'sales_route,period_date' });
      if (error) throw error;
      setMetasVenta(prev => {
        const idx = prev.findIndex(m => m.sales_route === ruta && m.period_date === period_date);
        const row = { sales_route: ruta, meta: value, meta_clientes: valCli, meta_clientes_1htl: valCli1, period_date };
        return idx >= 0 ? prev.map((m, i) => (i === idx ? row : m)) : [...prev, row];
      });
      setMetaRutaDraft(s => ({ ...s, [ruta]: null }));
      toast({ title: 'Meta guardada', description: `Ruta "${ruta}" actualizada.` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const toggleZona = (zona) => {
    setExpandedZonas(prev => {
      const next = new Set(prev);
      if (next.has(zona)) next.delete(zona);
      else next.add(zona);
      return next;
    });
  };

  // Summary stats
  const totalZonaMeta = metasZona.reduce((a, m) => a + (Number(m.meta) || 0), 0);
  const totalVentaMeta = metasVenta.reduce((a, m) => a + (Number(m.meta) || 0), 0);
  const totalVentaClie = metasVenta.reduce((a, m) => a + (Number(m.meta_clientes) || 0), 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-emerald-400">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="mb-4">
          <Target className="w-12 h-12" />
        </motion.div>
        <p className="font-medium animate-pulse">Cargando metas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 text-slate-100 max-w-[1400px] mx-auto px-4">
      <Helmet><title>Gestión de Metas | Cervezas Finas</title></Helmet>

      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 rounded-2xl border border-emerald-500/20 text-emerald-400">
              <Target className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Gestión de Metas
              </h1>
              <p className="text-slate-500 text-sm font-medium">
                {isAnalista ? 'Solo puedes editar el mes en curso' : 'Zona, Ruta y Ruta de Venta'}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
          <div className={`flex items-center gap-2 p-2 rounded-xl border backdrop-blur-md ${periodLocked ? 'bg-rose-900/20 border-rose-500/20' : 'bg-slate-900/60 border-white/5'}`}>
            {periodLocked ? <Lock className="w-4 h-4 text-rose-400 ml-2" /> : <Calendar className="w-4 h-4 text-emerald-400 ml-2" />}
            <input
              type="month"
              value={selectedPeriod}
              onChange={e => !periodLocked && setSelectedPeriod(e.target.value)}
              disabled={periodLocked}
              className="bg-transparent border-none text-white focus:ring-0 text-sm font-bold uppercase disabled:opacity-50"
            />
          </div>
          {periodLocked && (
            <span className="text-[10px] text-rose-400 font-bold uppercase">Solo mes actual</span>
          )}
        </motion.div>
      </div>

      {/* ═══════════════════════ SUMMARY CARDS ═══════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Meta Total Zonas (HL)', value: totalZonaMeta.toFixed(0), icon: MapPin, color: 'emerald' },
          { label: 'Meta Total Ventas (HL)', value: totalVentaMeta.toFixed(0), icon: TrendingUp, color: 'amber' },
          { label: 'Meta Total Clientes', value: totalVentaClie, icon: Users, color: 'violet' },
        ].map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <GlassCard className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                  <h3 className="text-2xl font-black text-white">{stat.value}</h3>
                </div>
                <div className={`p-3 bg-${stat.color}-500/10 rounded-xl text-${stat.color}-400`}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* ═══════════════════════ METAS POR ZONA ═══════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400"><MapPin className="w-5 h-5" /></div>
            <h2 className="text-lg font-bold text-white">Metas por Zona</h2>
            <span className="ml-auto text-[10px] font-bold text-slate-500 uppercase">{metasZona.length} zonas</span>
          </div>

          {/* Add zona */}
          <form className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-white/[0.03] rounded-xl border border-white/5" onSubmit={async e => {
            e.preventDefault();
            if (!newZona || newMetaZona === '') return;
            await addMetaZona(newZona, newMetaZona);
            setNewZona(''); setNewMetaZona('');
          }}>
            <Input placeholder="Nombre de Zona" value={newZona} onChange={e => setNewZona(e.target.value.toUpperCase())} className="w-44 bg-slate-900/60 border-slate-700/60" />
            <Input type="number" placeholder="Meta HL" value={newMetaZona} onChange={e => setNewMetaZona(e.target.value)} className="w-28 bg-slate-900/60 border-slate-700/60" />
            <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-500"><Plus className="w-4 h-4 mr-1" /> Agregar Zona</Button>
          </form>

          {/* Zona cards */}
          <div className="space-y-3">
            {metasZona.map(meta => {
              const zona = meta.zona;
              const isExpanded = expandedZonas.has(zona);
              const rutasDeEstaZona = rutasPorZona[zona] || [];
              const period_date = meta.period_date;

              return (
                <motion.div key={`${zona}_${period_date}`} layout className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
                  {/* Zona header */}
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => toggleZona(zona)}>
                    <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </motion.div>
                    <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400"><MapPin className="w-3.5 h-3.5" /></div>
                    <span className="font-bold text-white text-sm">{zona}</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 rounded-full">
                        <Target className="w-3 h-3 text-emerald-400" />
                        <Input
                          type="number"
                          value={meta.meta ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setMetasZona(prev => prev.map(m => m.zona === zona && m.period_date === period_date ? { ...m, meta: val } : m));
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-20 h-7 bg-transparent border-none text-emerald-400 font-bold text-sm focus:ring-0 p-0 text-center"
                        />
                        <span className="text-[10px] text-emerald-400/60 font-bold">HL</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-400 hover:bg-emerald-500/10" onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { error } = await supabase.from('metas_zona').update({ meta: Number(meta.meta) }).eq('zona', zona).eq('period_date', period_date);
                          if (error) throw error;
                          toast({ title: '✓ Guardado' });
                        } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
                      }}><Save className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-400 hover:bg-rose-500/10" onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { error } = await supabase.from('metas_zona').delete().eq('zona', zona).eq('period_date', period_date);
                          if (error) throw error;
                          setMetasZona(prev => prev.filter(m => !(m.zona === zona && m.period_date === period_date)));
                          toast({ title: 'Zona eliminada' });
                        } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
                      }}><Trash2 className="w-3.5 h-3.5" /></Button>
                      <span className="text-[10px] text-slate-500 font-bold">{rutasDeEstaZona.length} rutas</span>
                    </div>
                  </div>

                  {/* Expanded: rutas table */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                        <div className="px-5 pb-4 pt-1 border-t border-white/5">
                          {/* Routes table */}
                          {rutasDeEstaZona.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5">
                                    <th className="text-left py-2 px-3">Ruta</th>
                                    <th className="text-center py-2 px-2">Vol (HL)</th>
                                    <th className="text-center py-2 px-2">Clientes</th>
                                    <th className="text-center py-2 px-2">{'>'} 1HL</th>
                                    <th className="text-right py-2 px-2">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {rutasDeEstaZona.map(ruta => {
                                    const isEditing = editingPair?.zona === zona && editingPair?.ruta === ruta;
                                    const draft = metaRutaDraft[ruta] || getMetaDeRutaVenta(ruta);
                                    return (
                                      <tr key={ruta} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="py-2.5 px-3">
                                          {!isEditing ? (
                                            <span className="text-white font-medium">{ruta}</span>
                                          ) : (
                                            <div className="flex items-center gap-2">
                                              <Input value={editingValue} onChange={e => setEditingValue(e.target.value)} className="w-28 h-7 text-xs bg-slate-900/60 border-slate-700/60" list={`edit_rutas_${zona}`} />
                                              <datalist id={`edit_rutas_${zona}`}>{allRutas.map(opt => <option key={opt} value={opt} />)}</datalist>
                                              <button onClick={() => updateRutaForZona(zona, ruta, editingValue)} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"><Check className="w-3.5 h-3.5" /></button>
                                              <button onClick={() => { setEditingPair(null); setEditingValue(''); }} className="p-1 text-slate-400 hover:bg-slate-500/10 rounded"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                          <Input type="number" className="w-16 h-7 text-xs bg-transparent border-white/10 text-center mx-auto" value={draft.meta} onChange={e => setMetaRutaDraft(s => ({ ...s, [ruta]: { ...draft, meta: e.target.value } }))} />
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                          <Input type="number" className="w-16 h-7 text-xs bg-transparent border-white/10 text-center mx-auto" value={draft.meta_clientes} onChange={e => setMetaRutaDraft(s => ({ ...s, [ruta]: { ...draft, meta_clientes: e.target.value } }))} />
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                          <Input type="number" className="w-16 h-7 text-xs bg-transparent border-white/10 text-center mx-auto" value={draft.meta_clientes_1htl} onChange={e => setMetaRutaDraft(s => ({ ...s, [ruta]: { ...draft, meta_clientes_1htl: e.target.value } }))} />
                                        </td>
                                        <td className="py-2.5 px-2 text-right">
                                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => saveMetaForRutaVenta(ruta, draft)} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Guardar"><Save className="w-3.5 h-3.5" /></button>
                                            {!isEditing && (
                                              <button onClick={() => { setEditingPair({ zona, ruta }); setEditingValue(ruta); }} className="p-1.5 text-slate-400 hover:bg-slate-500/10 rounded-lg transition-colors" title="Editar nombre"><Edit3 className="w-3.5 h-3.5" /></button>
                                            )}
                                            <button onClick={() => removeRutaFromZona(zona, ruta)} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Quitar ruta"><Trash2 className="w-3.5 h-3.5" /></button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500 py-3 text-center">Sin rutas asignadas a esta zona</p>
                          )}

                          {/* Add route to zone */}
                          <form className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5" onSubmit={e => { e.preventDefault(); addRutaToZona(zona, newRutaForZona[zona]); }}>
                            <Input placeholder="Agregar ruta..." list={`allRutas_${zona}`} value={newRutaForZona[zona] || ''} onChange={e => setNewRutaForZona(s => ({ ...s, [zona]: e.target.value }))} className="w-44 h-8 text-xs bg-slate-900/60 border-slate-700/60" />
                            <datalist id={`allRutas_${zona}`}>{allRutas.map(opt => <option key={opt} value={opt} />)}</datalist>
                            <Button size="sm" type="submit" className="h-8 text-xs bg-white/5 hover:bg-white/10 border border-white/10"><Plus className="w-3.5 h-3.5 mr-1" /> Agregar</Button>
                          </form>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
            {metasZona.length === 0 && (
              <div className="flex flex-col items-center py-10 text-slate-500">
                <AlertCircle className="w-8 h-8 mb-2" />
                <p className="text-sm">No hay metas de zona para este período</p>
              </div>
            )}
          </div>
        </GlassCard>
      </motion.div>

      {/* ═══════════════════════ METAS POR RUTA DE VENTA ═══════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400"><TrendingUp className="w-5 h-5" /></div>
            <h2 className="text-lg font-bold text-white">Metas por Ruta de Venta</h2>
            <span className="ml-auto text-[10px] font-bold text-slate-500 uppercase">{metasVenta.length} rutas</span>
          </div>

          {/* Add */}
          <form className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-white/[0.03] rounded-xl border border-white/5" onSubmit={async e => {
            e.preventDefault();
            if (!newVenta || newMetaVenta === '') return;
            await addMetaVenta(newVenta, newMetaVenta, newMetaClientes, newMetaClientes1HL);
            setNewVenta(''); setNewMetaVenta(''); setNewMetaClientes(''); setNewMetaClientes1HL('');
          }}>
            <Input placeholder="Ruta Venta" value={newVenta} onChange={e => setNewVenta(e.target.value)} className="w-36 bg-slate-900/60 border-slate-700/60" />
            <Input type="number" placeholder="Vol (HL)" value={newMetaVenta} onChange={e => setNewMetaVenta(e.target.value)} className="w-24 bg-slate-900/60 border-slate-700/60" />
            <Input type="number" placeholder="Clientes" value={newMetaClientes} onChange={e => setNewMetaClientes(e.target.value)} className="w-24 bg-slate-900/60 border-slate-700/60" />
            <Input type="number" placeholder="> 1HL" value={newMetaClientes1HL} onChange={e => setNewMetaClientes1HL(e.target.value)} className="w-24 bg-slate-900/60 border-slate-700/60" />
            <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-500"><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
          </form>

          {/* Table */}
          {metasVenta.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/10">
                    <th className="text-left py-3 px-4">Ruta</th>
                    <th className="text-center py-3 px-3">Vol (HL)</th>
                    <th className="text-center py-3 px-3">Clientes</th>
                    <th className="text-center py-3 px-3">{'>'} 1HL</th>
                    <th className="text-right py-3 px-4">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {metasVenta.map(meta => {
                    const keyVal = meta.sales_route;
                    const period_date = meta.period_date;
                    return (
                      <tr key={`${keyVal}_${period_date}`} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="py-3 px-4 font-bold text-white">{keyVal}</td>
                        <td className="py-3 px-3 text-center">
                          <Input type="number" value={meta.meta ?? ''} onChange={e => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setMetasVenta(prev => prev.map(m => m.sales_route === keyVal && m.period_date === period_date ? { ...m, meta: val } : m));
                          }} className="w-20 h-8 text-xs bg-transparent border-white/10 text-center mx-auto text-emerald-400 font-bold" />
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Input type="number" value={meta.meta_clientes ?? ''} onChange={e => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setMetasVenta(prev => prev.map(m => m.sales_route === keyVal && m.period_date === period_date ? { ...m, meta_clientes: val } : m));
                          }} className="w-20 h-8 text-xs bg-transparent border-white/10 text-center mx-auto text-amber-400 font-bold" />
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Input type="number" value={meta.meta_clientes_1htl ?? ''} onChange={e => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setMetasVenta(prev => prev.map(m => m.sales_route === keyVal && m.period_date === period_date ? { ...m, meta_clientes_1htl: val } : m));
                          }} className="w-20 h-8 text-xs bg-transparent border-white/10 text-center mx-auto text-violet-400 font-bold" />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={async () => {
                              try {
                                const { error } = await supabase.from(TABLE_METAS_VENTA).update({
                                  meta: Number(meta.meta || 0), meta_clientes: Number(meta.meta_clientes || 0), meta_clientes_1htl: Number(meta.meta_clientes_1htl || 0)
                                }).eq('sales_route', keyVal).eq('period_date', period_date);
                                if (error) throw error;
                                toast({ title: '✓ Guardado' });
                              } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
                            }} className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Guardar"><Save className="w-4 h-4" /></button>
                            <button onClick={async () => {
                              try {
                                const { error } = await supabase.from(TABLE_METAS_VENTA).delete().eq('sales_route', keyVal).eq('period_date', period_date);
                                if (error) throw error;
                                setMetasVenta(prev => prev.filter(m => !(m.sales_route === keyVal && m.period_date === period_date)));
                              } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
                            }} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 text-slate-500">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm">No hay metas de venta para este período</p>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
