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
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EvaluationDetailViewer from '@/components/EvaluationDetailViewer';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getAllSupervisions, syncOnboardSupervisions } from '@/repositories/onboardSupervisionRepository';

export default function SupervisorOnboardSummary() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [supervisions, setSupervisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedEvalModal, setSelectedEvalModal] = useState(null);

  const role = (user?.user_metadata?.type || user?.user_metadata?.role || user?.user_metadata?.user_type || '').toLowerCase();
  const isAnalista = ['analista', 'analyst', 'admin', 'gerente', 'coortrade', 'coordinador', 'jefe', 'director'].includes(role);

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
    link.setAttribute("download", `Supervision_${selectedSession.route_name.replace(/\s+/g, '_')}_${selectedSession.start_at.split('T')[0]}.csv`);
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
      const d = new Date(dateStr);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return dateStr; }
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

               <div className="flex gap-3">
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
                  <ChevronRight className="text-slate-700 group-hover:text-emerald-500/50 transition-colors" size={16} />
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
    </div>
  );
}
