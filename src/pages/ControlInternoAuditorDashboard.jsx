import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, AlertCircle, FileText, Calendar as CalendarIcon, ArrowRight, LayoutDashboard, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ControlInternoAuditorDashboard() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  const [kpis, setKpis] = useState({
    auditoriasMes: 0,
    hallazgosAbiertos: 0,
    auditoriasHoy: 0,
  });

  const [recentAudits, setRecentAudits] = useState([]);
  const [openHallazgos, setOpenHallazgos] = useState([]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      if (!user?.id) return;
      setLoading(true);

      try {
        const startOfM = startOfMonth(new Date()).toISOString();
        const endOfM = endOfMonth(new Date()).toISOString();
        const startOfD = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
        
        // 1. Fetch recent audits (from control_interno_audits)
        const { data: ciAudits } = await supabase
          .from('control_interno_audits')
          .select('id, tipo, fecha, created_at, client_id, empleado_nombre')
          .eq('auditor_id', user.id)
          .gte('created_at', startOfM)
          .lte('created_at', endOfM)
          .order('created_at', { ascending: false });

        // 2. Fetch hallazgos abiertos
        const { data: hallazgos } = await supabase
          .from('ci_hallazgos')
          .select('id, tipo, severidad, descripcion, status, created_at, client_code, ruta')
          .eq('auditor_id', user.id)
          .in('status', ['abierto', 'en_proceso', 'escalado'])
          .order('created_at', { ascending: false });

        if (active) {
          const audits = ciAudits || [];
          const hallazgosList = hallazgos || [];
          
          setKpis({
            auditoriasMes: audits.length,
            hallazgosAbiertos: hallazgosList.length,
            auditoriasHoy: audits.filter(a => a.created_at >= startOfD).length,
          });

          setRecentAudits(audits.slice(0, 5));
          setOpenHallazgos(hallazgosList.slice(0, 5));
        }
      } catch (err) {
        console.error("Error loading auditor dashboard data", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => { active = false; };
  }, [user]);

  const getSeveridadColor = (severidad) => {
    switch (severidad?.toLowerCase()) {
      case 'critica': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'alta': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'media': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-6">
      <Helmet>
        <title>Mi Resumen CI | Cervezas Finas</title>
      </Helmet>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <LayoutDashboard className="h-8 w-8 text-[#E31837]" />
            Mi Resumen Operativo
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Hola, {user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || 'Auditor'}. Aquí tienes tu desempeño de {format(new Date(), 'MMMM yyyy', { locale: es })}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/control-interno/hallazgos')} variant="outline">
            <AlertCircle className="w-4 h-4 mr-2" />
            Mis Hallazgos
          </Button>
          <Button onClick={() => navigate('/control-interno/audits')} className="bg-[#E31837] hover:bg-[#C21530] text-white">
            <ClipboardCheck className="w-4 h-4 mr-2" />
            Nueva Auditoría
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Auditorías este mes</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{loading ? '-' : kpis.auditoriasMes}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <ClipboardCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Hallazgos Abiertos</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{loading ? '-' : kpis.hallazgosAbiertos}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Auditorías Hoy</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{loading ? '-' : kpis.auditoriasHoy}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CalendarIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mis Hallazgos Abiertos */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Mis Hallazgos Abiertos
              </CardTitle>
              <CardDescription>Requieren seguimiento y cierre</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/control-interno/hallazgos')} className="text-[#E31837]">
              Ver Todos <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            {loading ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E31837]"></div>
              </div>
            ) : openHallazgos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-center">
                <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                <p>Excelente, no tienes hallazgos abiertos.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {openHallazgos.map((h) => (
                  <div key={h.id} className="flex flex-col sm:flex-row justify-between p-3 border rounded-lg bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer" onClick={() => navigate(`/control-interno/hallazgos?id=${h.id}`)}>
                    <div className="space-y-1 mb-2 sm:mb-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="uppercase text-[10px]">{h.tipo}</Badge>
                        <Badge className={`uppercase text-[10px] ${getSeveridadColor(h.severidad)} border-0`}>
                          {h.severidad}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium line-clamp-1">{h.descripcion}</p>
                      <p className="text-xs text-gray-500">
                        {h.ruta || h.client_code ? `${h.ruta || ''} ${h.client_code ? `(${h.client_code})` : ''}` : 'Sin área asignada'} • {format(new Date(h.created_at), 'dd MMM yyyy', { locale: es })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimas Auditorías */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Últimas Auditorías
              </CardTitle>
              <CardDescription>Tu registro reciente</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/ops/delivery-audit-history')} className="text-[#E31837]">
              Historial <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            {loading ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E31837]"></div>
              </div>
            ) : recentAudits.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-center">
                <ClipboardCheck className="h-8 w-8 mb-2 opacity-50" />
                <p>No hay auditorías recientes.</p>
                <Button variant="link" onClick={() => navigate('/control-interno/audits')} className="text-[#E31837]">
                  Iniciar una
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentAudits.map((a) => (
                  <div key={a.id} className="flex justify-between items-center p-3 border rounded-lg bg-gray-50/50 dark:bg-gray-800/30">
                    <div>
                      <p className="text-sm font-medium uppercase">{a.tipo} AUDIT</p>
                      <p className="text-xs text-gray-500">
                        {a.empleado_nombre || a.client_id || 'Sin asignación'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{format(new Date(a.fecha || a.created_at), 'dd MMM', { locale: es })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
