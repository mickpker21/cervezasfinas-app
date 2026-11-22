import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, AlertCircle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { startOfMonth, endOfMonth } from 'date-fns';

export default function AuditoresResumen() {
  const [auditores, setAuditores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const startOfM = startOfMonth(new Date()).toISOString();
        const endOfM = endOfMonth(new Date()).toISOString();

        // 1. Obtener auditorías del mes
        const { data: audits } = await supabase
          .from('control_interno_audits')
          .select('auditor_id, auditor_nombre')
          .gte('created_at', startOfM)
          .lte('created_at', endOfM);

        // 2. Obtener hallazgos abiertos
        const { data: hallazgos } = await supabase
          .from('ci_hallazgos')
          .select('auditor_id, status, severidad')
          .in('status', ['abierto', 'en_proceso', 'escalado']);

        // Agrupar
        const auditorStats = {};

        (audits || []).forEach(a => {
          if (!a.auditor_id) return;
          if (!auditorStats[a.auditor_id]) {
            auditorStats[a.auditor_id] = { id: a.auditor_id, name: a.auditor_nombre || 'Desconocido', totalAudits: 0, openHallazgos: 0, criticalHallazgos: 0 };
          }
          auditorStats[a.auditor_id].totalAudits++;
        });

        (hallazgos || []).forEach(h => {
          if (!h.auditor_id) return;
          if (!auditorStats[h.auditor_id]) {
            auditorStats[h.auditor_id] = { id: h.auditor_id, name: 'Desconocido', totalAudits: 0, openHallazgos: 0, criticalHallazgos: 0 };
          }
          auditorStats[h.auditor_id].openHallazgos++;
          if (h.severidad === 'critica' || h.severidad === 'alta') {
            auditorStats[h.auditor_id].criticalHallazgos++;
          }
        });

        setAuditores(Object.values(auditorStats).sort((a, b) => b.totalAudits - a.totalAudits));
      } catch (err) {
        console.error("Error loading auditores", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-lg shadow-xl mt-6 rounded-3xl">
      <CardHeader className="border-b border-white/5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2 font-bold">
              <Users className="h-5 w-5 text-purple-400" />
              Rendimiento de Auditores
            </CardTitle>
            <CardDescription className="text-slate-500 uppercase tracking-widest text-[10px] mt-1">
              Resumen del equipo en el mes actual
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin h-6 w-6 border-b-2 border-purple-500 rounded-full" />
          </div>
        ) : auditores.length === 0 ? (
          <div className="text-center p-8 text-slate-500">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p>No hay actividad registrada este mes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {auditores.map(auditor => (
              <div key={auditor.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white line-clamp-1">{auditor.name}</h4>
                  <div className="flex items-center gap-3 mt-2 text-xs font-medium">
                    <span className="flex items-center gap-1 text-slate-300">
                      <ClipboardCheck className="h-3 w-3 text-emerald-400" /> {auditor.totalAudits} audits
                    </span>
                    <span className="flex items-center gap-1 text-slate-300">
                      <AlertCircle className={`h-3 w-3 ${auditor.openHallazgos > 0 ? 'text-rose-400' : 'text-slate-500'}`} /> 
                      {auditor.openHallazgos} hallazgos
                    </span>
                  </div>
                </div>
                {auditor.criticalHallazgos > 0 && (
                  <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/20">
                    {auditor.criticalHallazgos} crítico
                  </Badge>
                )}
                {auditor.criticalHallazgos === 0 && auditor.openHallazgos === 0 && auditor.totalAudits > 0 && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500/50" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
