import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { getCensos } from '@/repositories/censosRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Search, RefreshCw, CheckCircle2, XCircle, Layers, User, Calendar, MapPin, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import SafeImg from '@/components/SafeImg';

function StatusBadge({ value, yesLabel = 'Sí', noLabel = 'No', yesColor = 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', noColor = 'text-slate-400 bg-slate-800/60 border-white/10' }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', value ? yesColor : noColor)}>
      {value ? yesLabel : noLabel}
    </span>
  );
}

export default function SupervisorCensosPage() {
  const { user } = useSupabaseAuth();
  const [censos, setCensos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCenso, setSelectedCenso] = useState(null);

  // Filters
  const firstDay = new Date();
  firstDay.setDate(1);
  const [from, setFrom] = useState(firstDay.toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [filterModelo, setFilterModelo] = useState('');

  const loadCensos = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getCensos({ from, to, limit: 1000 });
      setCensos(rows);
    } catch (e) {
      console.error('[SupervisorCensosPage]', e);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { loadCensos(); }, [loadCensos]);

  const filtered = censos.filter(c => {
    const term = search.toLowerCase();
    const matchSearch = !term ||
      c.client_name?.toLowerCase().includes(term) ||
      c.client_code?.toLowerCase().includes(term) ||
      c.serial?.toLowerCase().includes(term) ||
      c.supervisor_name?.toLowerCase().includes(term);
    const matchModelo = !filterModelo || c.modelo === filterModelo;
    return matchSearch && matchModelo;
  });

  const uniqueModelos = [...new Set(censos.map(c => c.modelo).filter(Boolean))].sort();

  // Stats
  const totalCensos = filtered.length;
  const conEnfriador = filtered.filter(c => c.tiene_enfriador).length;
  const invadidos = filtered.filter(c => c.invadido).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 space-y-6">
      <Helmet><title>Censos Supervisor — Cervezas Finas</title></Helmet>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🧊 Censos de Enfriadores</h1>
          <p className="text-sm text-slate-400 mt-0.5">Seguimiento de censos realizados por supervisores</p>
        </div>
        <button
          onClick={loadCensos}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-white/10 text-slate-300 hover:text-white text-sm transition-colors"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Censos', value: totalCensos, color: 'text-cyan-300' },
          { label: 'Con Enfriador', value: conEnfriador, color: 'text-emerald-300' },
          { label: 'Invadidos', value: invadidos, color: 'text-red-300' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl bg-slate-900/60 border border-white/[0.08] p-4 text-center">
            <div className={cn('text-2xl font-extrabold', k.color)}>{k.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente, código, serial o supervisor…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
        <input
          type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
        />
        <input
          type="date" value={to} onChange={e => setTo(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
        />
        <select
          value={filterModelo} onChange={e => setFilterModelo(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
        >
          <option value="">Todos los modelos</option>
          {uniqueModelos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <Layers className="w-10 h-10 opacity-30" />
            <p className="text-sm">No hay censos para el período seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Cliente', 'Supervisor', 'Fecha', '¿Enfriador?', 'Modelo', 'Posición', 'Invadido', 'Fachada', 'Fotos'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    onClick={() => setSelectedCenso(c)}
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white group-hover:text-cyan-300 transition-colors truncate max-w-[160px]">
                        {c.client_name || c.business_name || '—'}
                      </div>
                      <div className="text-[10px] text-slate-500">{c.client_code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <User className="w-3 h-3 text-slate-600" />
                        <span className="truncate max-w-[120px]">{c.supervisor_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {c.created_at ? format(parseISO(c.created_at), 'dd MMM yy HH:mm', { locale: es }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={c.tiene_enfriador} yesLabel="Sí" noLabel="No" />
                    </td>
                    <td className="px-4 py-3">
                      {c.modelo ? (
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[11px] font-mono font-bold">{c.modelo}</span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{c.posicion || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={c.invadido} yesLabel="Invadido" noLabel="Limpio"
                        yesColor="text-red-300 bg-red-500/15 border-red-500/30"
                        noColor="text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={c.tiene_fachada} yesLabel={c.tipo_fachada || 'Sí'} noLabel="No" 
                        yesColor="text-blue-300 bg-blue-500/15 border-blue-500/30"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex -space-x-2">
                      {c.photo_fachada && (
                        <SafeImg src={c.photo_fachada} alt="fachada" className="w-8 h-8 rounded-lg object-cover border border-white/20 relative z-10" />
                      )}
                      {c.photo_url && (
                        <SafeImg src={c.photo_url} alt="foto" className="w-8 h-8 rounded-lg object-cover border border-white/20 relative z-0" />
                      )}
                        {!c.photo_url && !c.photo_fachada && <span className="text-slate-600 text-xs">—</span>}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      {selectedCenso && (
        <Dialog open={!!selectedCenso} onOpenChange={o => !o && setSelectedCenso(null)}>
          <DialogContent className="sm:max-w-xl max-w-[95vw] bg-slate-950 border border-white/10 text-white p-6 gap-4 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">Detalle del Censo</DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                Información técnica y fotos del activo censado.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Client */}
              <div className="rounded-xl bg-slate-900 border border-white/[0.08] p-4 space-y-1">
                <div className="text-xs text-slate-500 uppercase tracking-wide">Cliente</div>
                <div className="font-bold text-white">{selectedCenso.client_name || selectedCenso.business_name || '—'}</div>
                <div className="text-xs text-slate-400">{selectedCenso.client_code}</div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-900 border border-white/[0.08] p-3">
                  <div className="text-xs text-slate-500 mb-1">Supervisor</div>
                  <div className="text-sm text-white">{selectedCenso.supervisor_name || '—'}</div>
                </div>
                <div className="rounded-xl bg-slate-900 border border-white/[0.08] p-3">
                  <div className="text-xs text-slate-500 mb-1">Fecha</div>
                  <div className="text-sm text-white">
                    {selectedCenso.created_at ? format(parseISO(selectedCenso.created_at), "dd MMM yyyy 'a las' HH:mm", { locale: es }) : '—'}
                  </div>
                </div>
              </div>

              {/* Enfriador details */}
              <div className="rounded-xl bg-slate-900 border border-white/[0.08] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">¿Tiene enfriador?</span>
                  <StatusBadge value={selectedCenso.tiene_enfriador} />
                </div>
                {selectedCenso.tiene_enfriador && <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Modelo</span>
                    <span className="text-sm font-mono font-bold text-cyan-300">{selectedCenso.modelo || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Serie</span>
                    <span className="text-sm font-mono text-white">{selectedCenso.serial || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Posición</span>
                    <span className="text-sm text-slate-300">{selectedCenso.posicion || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">¿Invadido?</span>
                    <StatusBadge value={selectedCenso.invadido} yesLabel="Invadido" noLabel="Limpio"
                      yesColor="text-red-300 bg-red-500/15 border-red-500/30"
                      noColor="text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
                    />
                  </div>
                </>}
              </div>

              {/* Photos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedCenso.photo_fachada && (
                  <div className="space-y-1.5 font-medium">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider px-1">Foto Fachada</div>
                    <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-slate-900 group relative">
                      {console.log('[Debug] Photo Fachada URL:', selectedCenso.photo_fachada)}
                      <SafeImg 
                        src={selectedCenso.photo_fachada} 
                        alt="Foto Fachada" 
                        className="w-full aspect-video object-cover transition-transform duration-500 group-hover:scale-105" 
                      />
                    </div>
                  </div>
                )}
                {selectedCenso.photo_url && (
                  <div className="space-y-1.5 font-medium">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider px-1">Foto Enfriador</div>
                    <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-slate-900 group relative">
                      {console.log('[Debug] Photo Enfriador URL:', selectedCenso.photo_url)}
                      <SafeImg 
                        src={selectedCenso.photo_url} 
                        alt="Foto Enfriador" 
                        className="w-full aspect-video object-cover transition-transform duration-500 group-hover:scale-105" 
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Notas */}
              {selectedCenso.notas && (
                <div className="rounded-xl bg-slate-900 border border-white/[0.08] p-4">
                  <div className="text-xs text-slate-500 mb-1">Notas</div>
                  <div className="text-sm text-slate-300 whitespace-pre-wrap">{selectedCenso.notas}</div>
                </div>
              )}

              {/* GPS */}
              {selectedCenso.lat && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <MapPin className="w-3 h-3" />
                  {selectedCenso.lat.toFixed(5)}, {selectedCenso.lng?.toFixed(5)}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
