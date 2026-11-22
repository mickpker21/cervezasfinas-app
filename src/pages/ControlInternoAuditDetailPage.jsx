import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, AlertCircle, ArrowLeft, Calendar as CalendarIcon, User, MapPin, FileText, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ControlInternoAuditDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState(null);

  useEffect(() => {
    const fetchAudit = async () => {
      setLoading(true);
      try {
        // Asumiendo que buscamos en control_interno_audits
        const { data, error } = await supabase
          .from('control_interno_audits')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setAudit(data);
      } catch (err) {
        console.error("Error fetching audit:", err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchAudit();
  }, [id]);

  const handleLevantarHallazgo = () => {
    // Navigate to hallazgos with prepopulated context (via state or URL params)
    navigate('/control-interno/hallazgos', {
      state: {
        tipo: audit.tipo,
        empleado_involucrado: audit.empleado_nombre || audit.client_id,
        descripcion: `Hallazgo detectado en la auditoría ${audit.id.substring(0,8)}`
      }
    });
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-b-2 border-[#E31837] rounded-full" /></div>;
  }

  if (!audit) {
    return (
      <div className="container mx-auto p-4 text-center">
        <h2 className="text-2xl font-bold">Auditoría no encontrada</h2>
        <Button onClick={() => navigate(-1)} className="mt-4">Volver</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      <Helmet>
        <title>Detalle de Auditoría | Cervezas Finas</title>
      </Helmet>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-[#E31837]" />
            Detalle de Auditoría
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 uppercase tracking-widest font-mono">
            ID: {audit.id.substring(0,8)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">Información General</CardTitle>
                  <CardDescription>Datos principales del levantamiento</CardDescription>
                </div>
                <Badge className="bg-blue-100 text-blue-800 uppercase tracking-widest text-[10px]">
                  {audit.tipo}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1"><CalendarIcon className="w-3 h-3"/> Fecha</p>
                <p className="font-medium">{format(new Date(audit.fecha || audit.created_at), 'dd MMMM yyyy, HH:mm', { locale: es })}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1"><User className="w-3 h-3"/> Evaluado / Cliente</p>
                <p className="font-medium">{audit.empleado_nombre || audit.client_id || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1"><MapPin className="w-3 h-3"/> Ubicación (GPS)</p>
                <p className="font-medium text-sm">
                  {audit.latitud ? `${audit.latitud}, ${audit.longitud}` : 'Sin coordenadas'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1"><User className="w-3 h-3"/> Auditor</p>
                <p className="font-medium">{audit.auditor_nombre || 'Sistema'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg">Resultados del Check-List</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {audit.respuestas ? (
                Object.entries(audit.respuestas).map(([pregunta, valor], idx) => (
                  <div key={idx} className="flex justify-between items-start py-2 border-b last:border-0 border-gray-100 dark:border-gray-800">
                    <span className="text-sm font-medium">{pregunta}</span>
                    <Badge variant={valor === 'SI' || valor === true ? 'default' : (valor === 'NO' || valor === false ? 'destructive' : 'secondary')}>
                      {String(valor).toUpperCase()}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center p-8 text-gray-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No hay respuestas detalladas disponibles
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-[#E31837]/20 bg-rose-50 dark:bg-rose-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-[#E31837]">
                <AlertCircle className="w-5 h-5" />
                Acciones
              </CardTitle>
              <CardDescription>¿Encontraste alguna anomalía?</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleLevantarHallazgo} className="w-full bg-[#E31837] hover:bg-[#C21530] text-white py-6 shadow-lg hover:shadow-xl transition-all">
                Levantar Hallazgo
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Calificación
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center py-6">
              <div className="text-5xl font-black text-gray-900 dark:text-white drop-shadow-sm">
                {audit.puntaje_final !== undefined ? `${audit.puntaje_final}%` : 'N/A'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
