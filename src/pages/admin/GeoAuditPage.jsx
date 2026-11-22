import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { normalizeCoords } from '@/components/map/mapUtils';
import { updateClient } from '@/repositories/clientsRepository';
import { fetchClientsApi, deleteClientApi } from '@/lib/mysqlClients';
import FullPageLoader from '@/components/FullPageLoader';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  Search, AlertTriangle, MapPinOff, Users, DatabaseZap, RefreshCw,
  XCircle, Trash2, UserX, ChevronLeft, ChevronRight, CheckCircle2,
  Loader2, MapPin, SkipForward, ListChecks, SlidersHorizontal, Type
} from 'lucide-react';

// Normalize name for comparison: lowercase, remove accents, extra spaces, common suffixes
const normalizeName = (s) => {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
};

// Simple similarity ratio (0-1) based on longest common subsequence
const similarity = (a, b) => {
  if (!a || !b) return 0;
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return 1;
  const longer = na.length >= nb.length ? na : nb;
  const shorter = na.length >= nb.length ? nb : na;
  if (longer.length === 0) return 1;
  // Check if one contains the other
  if (longer.includes(shorter) && shorter.length >= 4) return 0.85;
  // Trigram similarity
  const trigrams = (s) => { const t = new Set(); for (let i = 0; i <= s.length - 3; i++) t.add(s.slice(i, i+3)); return t; };
  const tA = trigrams(na), tB = trigrams(nb);
  if (tA.size === 0 || tB.size === 0) return 0;
  let common = 0;
  tA.forEach(t => { if (tB.has(t)) common++; });
  return common / Math.max(tA.size, tB.size);
};
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

export default function GeoAuditPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  // Survey state
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [validatedGroups, setValidatedGroups] = useState(new Set());
  const [actionDialog, setActionDialog] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [mode, setMode] = useState('survey'); // 'survey' | 'search' | 'done'

  // Adjustable filters
  const [rangeMeters, setRangeMeters] = useState(30);
  const [filterMode, setFilterMode] = useState('geo'); // 'geo' | 'names' | 'both'

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const { rows } = await fetchClientsApi({ limit: 50000 });
      setClients(rows.map(c => ({ ...c, parsedCoords: normalizeCoords(c.coords, c) })));
    } catch (error) {
      console.error('Error loading clients:', error);
      toast({ title: "Error", description: "No se pudieron cargar los clientes.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadClients(); }, [loadClients]);

  // Detect clusters by proximity
  const geoClusters = useMemo(() => {
    if (filterMode === 'names') return [];
    const withCoords = clients.filter(c => c.parsedCoords);
    const visited = new Set();
    const result = [];
    for (let i = 0; i < withCoords.length; i++) {
      if (visited.has(i)) continue;
      const cluster = [withCoords[i]];
      visited.add(i);
      for (let j = i + 1; j < withCoords.length; j++) {
        if (visited.has(j)) continue;
        const d = getDistanceMeters(
          withCoords[i].parsedCoords.lat, withCoords[i].parsedCoords.lng,
          withCoords[j].parsedCoords.lat, withCoords[j].parsedCoords.lng
        );
        if (d <= rangeMeters) { cluster.push(withCoords[j]); visited.add(j); }
      }
      if (cluster.length > 1) result.push(cluster);
    }
    return result;
  }, [clients, rangeMeters, filterMode]);

  // Detect clusters by similar names
  const nameClusters = useMemo(() => {
    if (filterMode === 'geo') return [];
    const visited = new Set();
    const result = [];
    for (let i = 0; i < clients.length; i++) {
      if (visited.has(i)) continue;
      const nameA = clients[i].business_name || clients[i].name;
      if (!nameA || nameA.length < 3) continue;
      const cluster = [clients[i]];
      visited.add(i);
      for (let j = i + 1; j < clients.length; j++) {
        if (visited.has(j)) continue;
        const nameB = clients[j].business_name || clients[j].name;
        if (!nameB || nameB.length < 3) continue;
        if (similarity(nameA, nameB) >= 0.7) {
          cluster.push(clients[j]);
          visited.add(j);
        }
      }
      if (cluster.length > 1) result.push(cluster);
    }
    return result;
  }, [clients, filterMode]);

  // Merge clusters (deduplicate by group)
  const clusters = useMemo(() => {
    if (filterMode === 'geo') return geoClusters;
    if (filterMode === 'names') return nameClusters;
    // 'both': combine, dedup by first client id
    const seen = new Set();
    const merged = [];
    for (const cl of [...geoClusters, ...nameClusters]) {
      const key = cl.map(c => c.id).sort().join(',');
      if (!seen.has(key)) { seen.add(key); merged.push(cl); }
    }
    return merged;
  }, [geoClusters, nameClusters, filterMode]);

  const pendingGroups = clusters.filter((_, i) => !validatedGroups.has(i));
  const currentCluster = clusters[currentGroupIdx] || [];

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const ids = currentCluster.map(c => c.id);
    setSelectedIds(new Set(ids));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const goNext = () => {
    deselectAll();
    if (currentGroupIdx < clusters.length - 1) setCurrentGroupIdx(currentGroupIdx + 1);
    else setMode('done');
  };

  const goPrev = () => {
    deselectAll();
    if (currentGroupIdx > 0) setCurrentGroupIdx(currentGroupIdx - 1);
  };

  const validateGroup = () => {
    setValidatedGroups(prev => new Set([...prev, currentGroupIdx]));
    toast({ title: "✓ Grupo validado", description: `Grupo ${currentGroupIdx + 1} marcado como correcto.` });
    goNext();
  };

  const handleBulkAction = async () => {
    if (!actionDialog) return;
    setProcessing(true);
    const { type, ids } = actionDialog;
    let successCount = 0;

    for (const id of ids) {
      try {
        if (type === 'delete') {
          await deleteClientApi(id);
          setClients(prev => prev.filter(c => c.id !== id));
        } else {
          await updateClient(id, { coords: null });
          setClients(prev => prev.map(c => c.id === id ? { ...c, coords: null, parsedCoords: null } : c));
        }
        successCount++;
      } catch (e) {
        console.error(`Error ${type} client ${id}:`, e);
      }
    }

    toast({
      title: type === 'delete' ? "Clientes eliminados" : "GPS borrado",
      description: `${successCount}/${ids.length} procesados correctamente.`,
    });

    setProcessing(false);
    setActionDialog(null);
    deselectAll();
  };

  // Search mode
  const searchResults = useMemo(() => {
    if (!searchTerm || mode !== 'search') return [];
    const lower = searchTerm.toLowerCase();
    return clients.filter(c =>
      c.name?.toLowerCase().includes(lower) ||
      c.business_name?.toLowerCase().includes(lower) ||
      c.client_code?.toLowerCase().includes(lower)
    ).slice(0, 50);
  }, [clients, searchTerm, mode]);

  if (loading) return <FullPageLoader />;

  const progress = clusters.length > 0 ? Math.round((validatedGroups.size / clusters.length) * 100) : 100;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-20">
      <Helmet><title>Auditoría GPS - Admin</title></Helmet>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <MapPinOff className="w-8 h-8 text-rose-500" />
            Auditoría GPS
          </h1>
          <p className="text-slate-400 mt-1">Encuesta de duplicados — revisa grupo por grupo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setMode(mode === 'search' ? 'survey' : 'search'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors ${mode === 'search' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-white/10 text-white hover:bg-slate-700'}`}>
            <Search className="w-4 h-4" /> Buscar
          </button>
          <button onClick={() => { loadClients(); setCurrentGroupIdx(0); setValidatedGroups(new Set()); setMode('survey'); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-white/10">
            <RefreshCw className="w-4 h-4" /> Recargar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<DatabaseZap className="w-5 h-5 text-blue-400" />} label="Total Clientes" value={clients.length} color="blue" />
        <StatCard icon={<AlertTriangle className="w-5 h-5 text-rose-400" />} label="Grupos Duplicados" value={clusters.length} color="rose" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} label="Validados" value={validatedGroups.size} color="emerald" />
        <StatCard icon={<Users className="w-5 h-5 text-amber-400" />} label="Pendientes" value={pendingGroups.length} color="amber" />
      </div>

      {/* Filter Controls */}
      <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
          <SlidersHorizontal className="w-4 h-4" /> Filtros de detección
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Range Slider */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 flex justify-between">
              <span>Rango de proximidad GPS</span>
              <span className="text-white font-bold">{rangeMeters}m</span>
            </label>
            <input type="range" min={10} max={500} step={5} value={rangeMeters}
              onChange={(e) => { setRangeMeters(Number(e.target.value)); setCurrentGroupIdx(0); setValidatedGroups(new Set()); }}
              disabled={filterMode === 'names'}
              className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-500 disabled:opacity-30" />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>10m</span><span>100m</span><span>250m</span><span>500m</span>
            </div>
          </div>

          {/* Filter Mode */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Tipo de detección</label>
            <div className="flex gap-2">
              {[
                { key: 'geo', label: 'GPS', icon: <MapPin className="w-3.5 h-3.5" />, desc: 'Proximidad' },
                { key: 'names', label: 'Nombres', icon: <Type className="w-3.5 h-3.5" />, desc: 'Similares' },
                { key: 'both', label: 'Ambos', icon: <AlertTriangle className="w-3.5 h-3.5" />, desc: 'GPS + Nombres' },
              ].map(opt => (
                <button key={opt.key}
                  onClick={() => { setFilterMode(opt.key); setCurrentGroupIdx(0); setValidatedGroups(new Set()); }}
                  className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                    filterMode === opt.key
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}>
                  <span className="flex items-center gap-1">{opt.icon} {opt.label}</span>
                  <span className="text-[10px] opacity-60">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {clusters.length > 0 && mode === 'survey' && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Progreso de auditoría</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full"
              initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
          </div>
        </div>
      )}

      {/* =================== SEARCH MODE =================== */}
      {mode === 'search' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Buscar cliente por nombre o código..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus
              className="w-full pl-12 pr-10 py-4 bg-slate-900 border border-slate-700 text-white rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {searchResults.map(client => (
                <ClientRow key={client.id} client={client}
                  onClearGps={() => setActionDialog({ type: 'clearGps', ids: [client.id] })}
                  onDelete={() => setActionDialog({ type: 'delete', ids: [client.id] })} />
              ))}
            </div>
          )}
          {searchTerm && searchResults.length === 0 && (
            <p className="text-center text-slate-500 py-8">No se encontraron clientes</p>
          )}
        </div>
      )}

      {/* =================== SURVEY MODE =================== */}
      {mode === 'survey' && clusters.length > 0 && (
        <AnimatePresence mode="wait">
          <motion.div key={currentGroupIdx} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}
            className="bg-slate-900/80 border border-slate-700 rounded-2xl overflow-hidden">

            {/* Group Header */}
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${validatedGroups.has(currentGroupIdx) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {validatedGroups.has(currentGroupIdx) ? '✓ Validado' : `Grupo ${currentGroupIdx + 1} / ${clusters.length}`}
                </span>
                <span className="text-slate-400 text-sm">
                  {currentCluster.length} clientes
                  {filterMode !== 'names' && ` · ≤${rangeMeters}m`}
                  {filterMode !== 'geo' && ` · nombres similares`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={goPrev} disabled={currentGroupIdx === 0}
                  className="p-2 rounded-lg bg-slate-800 text-white disabled:opacity-30 hover:bg-slate-700">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-400 min-w-[3rem] text-center">{currentGroupIdx + 1}/{clusters.length}</span>
                <button onClick={goNext} disabled={currentGroupIdx >= clusters.length - 1}
                  className="p-2 rounded-lg bg-slate-800 text-white disabled:opacity-30 hover:bg-slate-700">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Client List with checkboxes */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <button onClick={selectAll} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700">
                  Seleccionar todos
                </button>
                <button onClick={deselectAll} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700">
                  Deseleccionar
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-blue-400 ml-2">{selectedIds.size} seleccionado(s)</span>
                )}
              </div>

              {currentCluster.map(client => (
                <label key={client.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedIds.has(client.id)
                    ? 'bg-blue-500/10 border-blue-500/40' : 'bg-slate-950 border-white/5 hover:border-white/20'}`}>
                  <input type="checkbox" checked={selectedIds.has(client.id)} onChange={() => toggleSelect(client.id)}
                    className="w-5 h-5 rounded border-slate-600 text-blue-500 focus:ring-blue-500 bg-slate-800 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-white truncate">{client.business_name || client.name}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded uppercase font-bold">{client.client_code || 'S/N'}</span>
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded uppercase font-bold">Ruta {client.sales_route || 'N/A'}</span>
                      {client.parsedCoords && (
                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {client.parsedCoords.lat.toFixed(6)}, {client.parsedCoords.lng.toFixed(6)}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Action Bar */}
            <div className="px-5 py-4 border-t border-slate-700 flex flex-wrap gap-2">
              <button onClick={validateGroup}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors">
                <CheckCircle2 className="w-4 h-4" /> Validar Grupo (OK)
              </button>
              <button onClick={() => goNext()}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors">
                <SkipForward className="w-4 h-4" /> Saltar
              </button>
              <div className="flex-1" />
              <button onClick={() => selectedIds.size > 0 && setActionDialog({ type: 'clearGps', ids: [...selectedIds] })}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white rounded-xl font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <MapPinOff className="w-4 h-4" /> Borrar GPS ({selectedIds.size})
              </button>
              <button onClick={() => selectedIds.size > 0 && setActionDialog({ type: 'delete', ids: [...selectedIds] })}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded-xl font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <UserX className="w-4 h-4" /> Eliminar ({selectedIds.size})
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* No duplicates */}
      {mode === 'survey' && clusters.length === 0 && (
        <div className="py-20 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Todo en orden</h3>
          <p className="text-slate-400 max-w-md">No se detectaron clientes duplicados a menos de 30 metros.</p>
        </div>
      )}

      {/* Done */}
      {mode === 'done' && (
        <div className="py-20 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
            <ListChecks className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Auditoría completada</h3>
          <p className="text-slate-400 max-w-md mb-6">
            Revisaste {clusters.length} grupos. {validatedGroups.size} validados como correctos.
          </p>
          <button onClick={() => { setCurrentGroupIdx(0); setMode('survey'); }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium">
            Volver al inicio
          </button>
        </div>
      )}

      {/* ========== BULK ACTION DIALOG ========== */}
      <AlertDialog open={!!actionDialog} onOpenChange={(open) => !open && !processing && setActionDialog(null)}>
        <AlertDialogContent className="bg-slate-900 border border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500">
              {actionDialog?.type === 'delete' ? <UserX className="w-5 h-5" /> : <MapPinOff className="w-5 h-5" />}
              {actionDialog?.type === 'delete' ? '¿Eliminar clientes seleccionados?' : '¿Borrar GPS de los seleccionados?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              {actionDialog?.type === 'delete' ? (
                <>Se eliminarán <strong className="text-white">{actionDialog?.ids?.length}</strong> cliente(s) permanentemente.<br/><br/>
                <span className="text-red-400 font-semibold">⚠️ Esta acción NO se puede deshacer.</span></>
              ) : (
                <>Se borrarán las coordenadas GPS de <strong className="text-white">{actionDialog?.ids?.length}</strong> cliente(s).<br/><br/>
                Los clientes seguirán existiendo pero sin ubicación en el mapa.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing} className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAction} disabled={processing}
              className={`text-white ${actionDialog?.type === 'delete' ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
              {processing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
                : actionDialog?.type === 'delete' ? 'Sí, Eliminar' : 'Sí, Borrar GPS'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Stat card mini component
function StatCard({ icon, label, value, color }) {
  return (
    <div className={`bg-slate-900 border border-${color}-900/30 p-4 rounded-xl flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-lg bg-${color}-500/20 flex items-center justify-center shrink-0`}>{icon}</div>
      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{label}</p>
        <p className="text-xl font-black text-white">{value}</p>
      </div>
    </div>
  );
}

// Search result row
function ClientRow({ client, onClearGps, onDelete }) {
  const hasCoords = !!client.parsedCoords;
  return (
    <div className="bg-slate-950 border border-white/5 rounded-xl p-3 flex items-center justify-between hover:border-white/20 transition-colors">
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-bold text-white truncate">{client.business_name || client.name}</h4>
        <div className="flex items-center gap-2 mt-1">
          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded uppercase font-bold">{client.client_code || 'S/N'}</span>
          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded uppercase font-bold">Ruta {client.sales_route || 'N/A'}</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-1 font-mono">
          {hasCoords ? `${client.parsedCoords.lat.toFixed(6)}, ${client.parsedCoords.lng.toFixed(6)}` : 'Sin coordenadas'}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={onClearGps} disabled={!hasCoords} title="Borrar GPS"
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${hasCoords ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
          <MapPinOff className="w-4 h-4" />
        </button>
        <button onClick={onDelete} title="Eliminar Cliente"
          className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-600 hover:text-white transition-all">
          <UserX className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
