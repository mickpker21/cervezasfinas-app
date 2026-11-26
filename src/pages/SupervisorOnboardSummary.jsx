import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ClipboardCheck, 
  ChevronLeft, 
  Calendar, 
  User, 
  MapPin, 
  ChevronRight,
  Clock,
  Search,
  ShoppingBag,
  Info,
  Download,
  Pencil,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import EvaluationDetailViewer from '@/components/EvaluationDetailViewer';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getAllSupervisions, syncOnboardSupervisions, updateOnboardSupervisionAdmin } from '@/repositories/onboardSupervisionRepository';

export default function SupervisorOnboardSummary() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [supervisions, setSupervisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedEvalModal, setSelectedEvalModal] = useState(null);

  const role = (user?.user_metadata?.type || user?.user_metadata?.role || user?.user_metadata?.user_type || '').toLowerCase();
  const isAnalista = ['analista', 'analyst', 'admin', 'gerente', 'coortrade', 'coordinador', 'jefe', 'director'].includes(role);
  const isAdminUser = ['admin', 'analista', 'analyst', 'gerente', 'director'].includes(role);

  const [editingSession, setEditingSession] = useState(null);
  const [savingSessionEdit, setSavingSessionEdit] = useState(false);
  const [editSupForm, setEditSupForm] = useState({
    route_name: '',
    vendedor_name: '',
    supervisor_name: '',
    status: 'completed',
    score: 0,
    checklist_data: {},
    visits: [],
  });

  const openEditSupervisionModal = (session, e = null) => {
    if (e) e.stopPropagation();
    const cleanChecklist = typeof session.checklist_data === 'string'
      ? JSON.parse(session.checklist_data || '{}')
      : { ...(session.checklist_data || {}) };
    const cleanVisits = (session.visits || []).map((v) => ({
      ...v,
      survey_data:
        typeof v.survey_data === 'string'
          ? JSON.parse(v.survey_data || '{}')
          : { ...(v.survey_data || {}) },
    }));
    setEditingSession(session);
    setEditSupForm({
      route_name: session.route_name || '',
      vendedor_name: session.vendedor_name || '',
      supervisor_name: session.supervisor_name || 'Supervisor',
      status: session.status || 'completed',
      score: Number(session.score || 0),
      checklist_data: cleanChecklist,
      visits: cleanVisits,
    });
  };

  const handleSaveSupervisionEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingSession) return;
    setSavingSessionEdit(true);
    try {
      const updated = await updateOnboardSupervisionAdmin(editingSession, {
        ...editSupForm,
        score: Number(editSupForm.score) || 0,
      });
      toast({
        title: 'Supervisión a Bordo actualizada',
        description: `Se guardaron los cambios de la ruta ${editSupForm.route_name}.`,
        className: 'bg-emerald-600 text-white border-none',
      });
      setEditingSession(null);
      if (selectedSession && selectedSession.id === updated.id) {
        setSelectedSession(updated);
      }
      await loadData(false);
    } catch (err) {
      console.error('Error guardando supervisión:', err);
      toast({
        title: 'Error al guardar',
        description: err?.message || 'No se pudo actualizar la supervisión.',
        variant: 'destructive',
      });
    } finally {
      setSavingSessionEdit(false);
    }
  };

  const loadData = async (shouldSync = false) => {
    if (!user) return;
    const filterId = isAnalista ? 'all' : user.id;
    
    // Local first
    const localData = await getAllSupervisions(filterId);
    setSupervisions(localData || []);
    setLoading(false);

    // Sync from cloud
    if (shouldSync || localData.length === 0) {
      setSyncing(true);
      await syncOnboardSupervisions(filterId);
      const freshData = await getAllSupervisions(filterId);
      setSupervisions(freshData || []);
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [user]);

  const filteredSupervisions = supervisions.filter(s => 
    (s.route_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.vendedor_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.supervisor_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToCSV = () => {
    if (!selectedSession) return;
    
    // Constructing flat rows from session data
    const headers = ['Cliente', 'Codigo', 'Saludo', 'POP', 'Venta', 'Canal', 'Ev_PDV_Score'];
    const rows = (selectedSession.visits || []).map(v => {
      const saludo = v.survey_data?.greeting === 'si' ? 'CUMPLE' : 'NO CUMPLE';
      const pop = v.survey_data?.pop_updated === 'si' ? 'CUMPLE' : 'NO CUMPLE';
      const venta = v.survey_data?.purchased === 'si' ? 'LOGRADA' : 'PENDIENTE';
      const canal = v.survey_data?.client_type || '---';
      const evScore = v.evaluation_pdv_data ? (v.evaluation_pdv_data.result?.score || v.evaluation_pdv_data.score || 0).toFixed(0) + '%' : 'N/A';
      
      return [
        `"${v.client_name}"`,
        v.client_code,
        saludo,
        pop,
        venta,
        canal,
        evScore
      ].join(',');
    });

    const csvData = [
      `"Supervision: ${selectedSession.route_name}"`,
      `"Vendedor: ${selectedSession.vendedor_name}"`,
      `"Score Total: ${selectedSession.score.toFixed(1)}%"`,
      `"Fecha: ${formatDate(selectedSession.start_at)}"`,
      '',
      headers.join(','),
      ...rows
    ].join('\n');

    // UTF-8 BOM to keep accents in Excel correctly formatted
    const blob = new Blob(["\uFEFF" + csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Supervision_${selectedSession.route_name.replace(/\s+/g, '_')}_${String(selectedSession.start_at || '').slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAllToCSV = () => {
    if (!filteredSupervisions.length) return;

    const headers = [
      'Ruta', 'Fecha', 'Supervisor', 'Vendedor', 'Score_Sesion',
      'Cliente', 'Codigo', 'Canal', 'Saludo', 'Negociacion', 'POP', 'Venta', 'Ev_PDV_Score'
    ];

    const rows = [];
    filteredSupervisions.forEach(s => {
      (s.visits || []).forEach(v => {
        const row = [
          `"${s.route_name}"`,
          `"${formatDate(s.start_at)}"`,
          `"${s.supervisor_name || '---'}"`,
          `"${s.vendedor_name || '---'}"`,
          s.score.toFixed(1) + '%',
          `"${v.client_name}"`,
          v.client_code,
          `"${v.survey_data?.client_type || '---'}"`,
          v.survey_data?.greeting === 'si' ? 'CUMPLE' : 'NO CUMPLE',
          v.survey_data?.negotiation === 'si' ? 'CUMPLE' : 'NO CUMPLE',
          v.survey_data?.pop_updated === 'si' ? 'CUMPLE' : 'NO CUMPLE',
          v.survey_data?.purchased === 'si' ? 'LOGRADA' : 'PENDIENTE',
          v.evaluation_pdv_data ? (v.evaluation_pdv_data.result?.score || v.evaluation_pdv_data.score || 0).toFixed(0) + '%' : 'N/A'
        ];
        rows.push(row.join(','));
      });
    });

    const csvData = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(["\uFEFF" + csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Historial_Onboard_Completo_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '---';
    try {
      const raw = String(dateStr).trim();
      // Si ya viene en formato MySQL DATETIME local México (YYYY-MM-DD HH:mm:ss sin Z/offset)
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
        const d = new Date(raw.replace(' ', 'T'));
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleDateString('es-MX') + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        }
      }
      const d = new Date(raw);
      return d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) + ' ' + d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return dateStr; }
  };

  const renderEditSupervisionModal = () => {
    if (!editingSession) return null;
    const checklistKeys = Object.keys(editSupForm.checklist_data || {}).filter(
      (k) => !k.startsWith('_')
    );
    const defaultChecklistKeys = checklistKeys.length > 0
      ? checklistKeys
      : ['vehicle_clean', 'uniform_ok', 'vehicle_status_ok'];

    return (
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Pencil className="w-5 h-5 text-amber-400" />
              Editar Supervisión a Bordo
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveSupervisionEdit} className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Ruta</label>
                <Input
                  value={editSupForm.route_name}
                  onChange={(e) => setEditSupForm({ ...editSupForm, route_name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Vendedor</label>
                <Input
                  value={editSupForm.vendedor_name}
                  onChange={(e) => setEditSupForm({ ...editSupForm, vendedor_name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Supervisor</label>
                <Input
                  value={editSupForm.supervisor_name}
                  onChange={(e) => setEditSupForm({ ...editSupForm, supervisor_name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Estado</label>
                  <select
                    value={editSupForm.status}
                    onChange={(e) => setEditSupForm({ ...editSupForm, status: e.target.value })}
                    className="h-10 w-full rounded-md bg-slate-800 border border-slate-700 px-2.5 text-sm text-white"
                  >
                    <option value="completed">CERRADA (completed)</option>
                    <option value="draft">ABIERTA (draft)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-emerald-400">Score Total (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={editSupForm.score}
                    onChange={(e) => setEditSupForm({ ...editSupForm, score: e.target.value })}
                    className="bg-slate-800 border-emerald-500/40 text-emerald-300 font-bold text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Checklist de Salida */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                Checklist de Salida (clic para alternar SI / NO)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {defaultChecklistKeys.map((key) => {
                  const val = Boolean(editSupForm.checklist_data?.[key]);
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() =>
                        setEditSupForm((prev) => ({
                          ...prev,
                          checklist_data: {
                            ...(prev.checklist_data || {}),
                            [key]: !val,
                          },
                        }))
                      }
                      className={`p-2 rounded-lg border text-center transition ${
                        val
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      <p className="text-[10px] uppercase font-bold truncate">{key.replace(/_/g, ' ')}</p>
                      <p className="text-xs font-black">{val ? 'SI' : 'NO'}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visitas evaluadas */}
            {editSupForm.visits?.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Visitas de la Supervisión ({editSupForm.visits.length})
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {editSupForm.visits.map((v, idx) => {
                    const s = v.survey_data || {};
                    const toggleVisitField = (field) => {
                      const nextVisits = [...editSupForm.visits];
                      const curVal = nextVisits[idx]?.survey_data?.[field] === 'si' ? 'no' : 'si';
                      nextVisits[idx] = {
                        ...nextVisits[idx],
                        survey_data: {
                          ...(nextVisits[idx].survey_data || {}),
                          [field]: curVal,
                        },
                      };
                      setEditSupForm({ ...editSupForm, visits: nextVisits });
                    };
                    return (
                      <div key={v.id || idx} className="p-3 rounded-xl bg-slate-800/70 border border-slate-700 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-white">{v.client_name}</span>
                          <span className="font-mono text-slate-400">{v.client_code}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                          {[
                            { key: 'greeting', label: 'Saludo' },
                            { key: 'negotiation', label: 'Negociación' },
                            { key: 'pop_updated', label: 'POP' },
                            { key: 'purchased', label: 'Venta' },
                          ].map((f) => {
                            const ok = s[f.key] === 'si';
                            return (
                              <button
                                type="button"
                                key={f.key}
                                onClick={() => toggleVisitField(f.key)}
                                className={`px-2 py-1.5 rounded border font-bold ${
                                  ok
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                    : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                }`}
                              >
                                {f.label}: {ok ? 'SI' : 'NO'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingSession(null)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingSessionEdit}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                {savingSessionEdit ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Guardar Cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  if (selectedSession) {
    return (
      <div className="min-h-screen bg-[#0a0e14] text-slate-200 pb-20">
        <header className="p-4 border-b border-white/5 bg-slate-900/50 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedSession(null)}>
              <ChevronLeft />
            </Button>
            <div>
              <h1 className="text-lg font-bold">Detalle de Supervisión</h1>
              <p className="text-xs text-slate-400">Ruta: {selectedSession.route_name}</p>
            </div>
          </div>
        </header>

        <main className="p-4 space-y-6 max-w-2xl mx-auto">
          <Card className="bg-slate-900/40 border-white/10 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border-b border-white/5">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl font-bold">{selectedSession.vendedor_name}</CardTitle>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-1 font-medium">
                    <User size={12} className="text-emerald-500" /> {selectedSession.supervisor_name || 'Supervisor'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-white">{selectedSession.score.toFixed(1)}%</div>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Score Total</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
               <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Inicio</p>
                    <p className="text-xs font-bold font-mono">{formatDate(selectedSession.start_at)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Visitas</p>
                    <p className="text-sm font-bold">{selectedSession.visits?.length || 0} PDVs Evaluados</p>
                  </div>
               </div>

               <div className="space-y-2">
                 <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Checklist de Salida</h3>
                 <div className="grid grid-cols-3 gap-2">
                    {Object.entries(selectedSession.checklist_data || {}).map(([key, val]) => (
                      <div key={key} className={`p-2 rounded-lg border text-center ${val ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
                        <p className="text-[8px] uppercase font-bold truncate">{key.replace(/_/g, ' ')}</p>
                        <p className="text-[10px] font-black">{val ? 'SI' : 'NO'}</p>
                      </div>
                    ))}
                 </div>
               </div>

               <div className="space-y-3">
                 <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Lista de Visitas</h3>
                 {(selectedSession.visits || []).map((v, idx) => (
                   <div key={idx} className="p-4 rounded-xl bg-slate-800/40 border border-white/5 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-sm text-white">{v.client_name}</h4>
                          <p className="text-[10px] text-slate-500 font-bold tracking-wider">{v.client_code}</p>
                        </div>
                        <div className="flex gap-2.5 items-center">
                          {v.survey_data?.purchased === 'si' && <ShoppingBag className="w-4 h-4 text-emerald-500" title="Venta Realizada" />}
                          {v.evaluation_pdv_data ? (
                            <div className="flex items-center gap-1 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20" title="Evaluación Complementaria PDV">
                              <ClipboardCheck className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-[10px] font-black text-blue-400">
                                {(v.evaluation_pdv_data.result?.score || v.evaluation_pdv_data.score || 0).toFixed(0)}%
                              </span>
                            </div>
                          ) : v.evaluation_pdv_id ? (
                            <ClipboardCheck className="w-4 h-4 text-blue-400" title="Evaluación Complementaria" />
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex items-center gap-1.5 p-1.5 px-2 rounded-lg bg-black/20 border border-white/5">
                          <span className="text-slate-500 uppercase font-black">Saludo:</span>
                          <span className={v.survey_data?.greeting === 'si' ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
                            {v.survey_data?.greeting === 'si' ? 'CUMPLE' : 'NO CUMPLE'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 p-1.5 px-2 rounded-lg bg-black/20 border border-white/5">
                          <span className="text-slate-500 uppercase font-black">Pop:</span>
                          <span className={v.survey_data?.pop_updated === 'si' ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
                            {v.survey_data?.pop_updated === 'si' ? 'CUMPLE' : 'NO CUMPLE'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 p-1.5 px-2 rounded-lg bg-black/20 border border-white/5">
                          <span className="text-slate-500 uppercase font-black">Venta:</span>
                          <span className={v.survey_data?.purchased === 'si' ? 'text-emerald-400 font-black' : 'text-amber-400 font-black'}>
                            {v.survey_data?.purchased === 'si' ? 'LOGRADA' : 'PENDIENTE'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 p-1.5 px-2 rounded-lg bg-black/20 border border-white/5">
                          <span className="text-slate-500 uppercase font-black">Canal:</span>
                          <span className="text-blue-400 font-black uppercase truncate">{v.survey_data?.client_type || '---'}</span>
                        </div>
                      </div>

                      {v.evaluation_pdv_data && (
                        <div className="pt-2 mt-2 border-t border-white/5">
                           <Button 
                             size="sm" 
                             variant="outline" 
                             className="w-full h-8 text-[10px] uppercase font-bold bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20"
                             onClick={() => setSelectedEvalModal(v)}
                           >
                             Ver Evaluación PDV
                           </Button>
                        </div>
                      )}

                   </div>
                 ))}
               </div>

               <div className="flex flex-wrap gap-3">
                 {isAdminUser && (
                   <Button
                     type="button"
                     className="flex-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold hover:bg-amber-500/30"
                     onClick={() => openEditSupervisionModal(selectedSession)}
                   >
                     <Pencil className="w-4 h-4 mr-2" /> Editar Supervisión
                   </Button>
                 )}
                 <Button className="flex-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 font-bold hover:bg-emerald-600/40" onClick={exportToCSV}>
                    <Download className="w-4 h-4 mr-2" /> Exportar a Excel
                 </Button>
                 <Button className="flex-1 bg-slate-800 border border-white/5 font-bold hover:bg-slate-700" onClick={() => setSelectedSession(null)}>
                    Volver al Listado
                 </Button>
               </div>
            </CardContent>
          </Card>
        </main>
      
        <Dialog open={!!selectedEvalModal} onOpenChange={(open) => !open && setSelectedEvalModal(null)}>
          <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md md:max-w-xl rounded-[2rem] max-h-[85vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="p-6 border-b border-white/5 bg-slate-800/30">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-blue-400" /> 
                Evaluación PDV / Enfriador
              </DialogTitle>
              <p className="text-xs text-slate-400 mt-1 font-medium">{selectedEvalModal?.client_name}</p>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-0 custom-scrollbar bg-slate-900">
              {selectedEvalModal?.evaluation_pdv_data ? (
                 <EvaluationDetailViewer evaluation={{ ...selectedEvalModal.evaluation_pdv_data, tipo: 'PDV' }} />
              ) : (
                 <div className="p-4 text-center text-slate-500 text-xs italic">No hay detalle de evaluación disponible.</div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {renderEditSupervisionModal()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e14] text-slate-200 pb-20">
      <header className="p-4 border-b border-white/5 bg-slate-900/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-white/5">
              <ChevronLeft />
            </Button>
            <div>
              <h1 className="text-lg font-bold">Historial Onboard</h1>
              <p className="text-xs text-slate-400">
                {syncing ? 'Sincronizando...' : isAnalista ? 'Panel de Monitor Global' : 'Resumen de rutas acompañadas'}
              </p>
            </div>
          </div>
          {isAnalista && <Info className="text-emerald-500 animate-pulse" size={18} />}
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2 bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold hover:bg-emerald-500/20"
            onClick={exportAllToCSV}
            disabled={filteredSupervisions.length === 0}
          >
            <Download className="w-4 h-4 mr-1.5" /> Exportar Todo
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-[50%] -translate-y-[50%] text-slate-500 w-5 h-5" />
          <Input 
            placeholder="Buscar ruta, vendedor o supervisor..."
            className="bg-slate-900 border-white/10 h-11 pl-11 rounded-2xl text-sm focus:border-emerald-500/50 transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="space-y-3 pt-2">
          {loading ? (
            <div className="text-center py-20 flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">Consultando historial...</p>
            </div>
          ) : filteredSupervisions.length > 0 ? (
            filteredSupervisions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedSession(session)}
                className="p-5 rounded-3xl bg-slate-900/40 border border-white/5 active:scale-[0.98] transition-all cursor-pointer hover:bg-slate-800/40 hover:border-white/10 group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                       <h3 className="font-bold text-lg group-hover:text-emerald-400 transition-colors uppercase tracking-tight">
                        {session.route_name}
                       </h3>
                       <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                         {session.status === 'completed' ? 'CERRADA' : 'ABIERTA'}
                       </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
                        <User size={13} className="text-slate-600" /> Vendedor: <span className="text-slate-200">{session.vendedor_name}</span>
                      </p>
                      {isAnalista && (
                        <p className="text-[10px] text-slate-500 font-black flex items-center gap-2 uppercase">
                          <Info size={11} className="text-blue-500/60" /> Sup: <span className="text-blue-400/80">{session.supervisor_name || '---'}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-white leading-none">{session.score.toFixed(0)}%</div>
                    <p className="text-[8px] text-slate-600 font-bold tracking-widest uppercase mt-1">Score</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-4 border-t border-white/5 text-[10px] text-slate-500 font-black tracking-widest uppercase">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-emerald-500/40" /> {formatDate(session.start_at).split(' ')[0]}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-blue-500/40" /> {session.visits?.length || 0} PDVs
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdminUser && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => openEditSupervisionModal(session, e)}
                        className="h-7 px-2.5 text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/25"
                      >
                        <Pencil className="w-3 h-3 mr-1" /> Editar
                      </Button>
                    )}
                    <ChevronRight className="text-slate-700 group-hover:text-emerald-500/50 transition-colors" size={16} />
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-20 bg-slate-900/20 rounded-3xl border border-dashed border-white/5">
               <ClipboardCheck className="w-12 h-12 text-slate-800 mx-auto mb-4" />
               <p className="text-slate-500 text-sm font-medium">No hay registros para mostrar</p>
            </div>
          )}
        </div>
      </main>
      {renderEditSupervisionModal()}
    </div>
  );
}
