import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Plus, Search, Filter, Clock, CheckCircle2, AlertTriangle, FileText, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';

export default function HallazgosPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hallazgos, setHallazgos] = useState([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [severidadFilter, setSeveridadFilter] = useState('todos');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedHallazgo, setSelectedHallazgo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    tipo: '',
    severidad: '',
    area: '',
    descripcion: '',
    ruta: '',
    zona: '',
    empleado_involucrado: '',
    accion_correctiva: '',
    status: 'abierto',
    pac_descripcion: '',
    pac_responsable: '',
    pac_fecha: ''
  });

  const isJefe = user?.user_metadata?.type === 'jefe-control-interno' || user?.user_metadata?.type === 'jefe control interno';

  useEffect(() => {
    loadHallazgos();
  }, [user]);

  useEffect(() => {
    // Check if there is an ID in the URL to open automatically
    const queryParams = new URLSearchParams(location.search);
    const id = queryParams.get('id');
    if (id && hallazgos.length > 0) {
      const h = hallazgos.find(x => x.id === id);
      if (h) {
        openModal(h);
        // Clear the URL param without refreshing
        navigate(location.pathname, { replace: true });
      }
    }
  }, [location.search, hallazgos]);

  const loadHallazgos = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('ci_hallazgos')
        .select('*, pac:ci_pac(*)')
        .order('created_at', { ascending: false });

      // If not jefe, only show my own hallazgos or those in my route/zone
      if (!isJefe) {
        const route = user?.user_metadata?.route;
        const zona = user?.user_metadata?.zona;
        
        let orQuery = `auditor_id.eq.${user.id}`;
        if (route) orQuery += `,ruta.eq.${route}`;
        if (zona) orQuery += `,zona.eq.${zona}`;
        
        query = query.or(orQuery);
      }

      const { data, error } = await query;
      if (error) throw error;
      setHallazgos(data || []);
    } catch (error) {
      console.error("Error loading hallazgos:", error);
      setError(error.message || 'Error al cargar datos');
      toast({ title: 'Error', description: 'No se pudieron cargar los hallazgos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filteredHallazgos = hallazgos.filter(h => {
    const matchesSearch = 
      (h.descripcion?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (h.ruta?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (h.empleado_involucrado?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (h.id?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter === 'todos' || h.status === statusFilter;
    const matchesSev = severidadFilter === 'todos' || h.severidad === severidadFilter;
    
    return matchesSearch && matchesStatus && matchesSev;
  });

  const openModal = (hallazgo = null) => {
    if (hallazgo) {
      setSelectedHallazgo(hallazgo);
      setFormData({
        tipo: hallazgo.tipo || '',
        severidad: hallazgo.severidad || '',
        area: hallazgo.area || '',
        descripcion: hallazgo.descripcion || '',
        ruta: hallazgo.ruta || '',
        zona: hallazgo.zona || '',
        empleado_involucrado: hallazgo.empleado_involucrado || '',
        accion_correctiva: hallazgo.accion_correctiva || '',
        status: hallazgo.status || 'abierto',
        pac_descripcion: hallazgo.pac?.[0]?.descripcion_accion || '',
        pac_responsable: hallazgo.pac?.[0]?.responsable_nombre || '',
        pac_fecha: hallazgo.pac?.[0]?.fecha_compromiso || ''
      });
    } else {
      setSelectedHallazgo(null);
      setFormData({
        tipo: 'proceso',
        severidad: 'media',
        area: 'reparto',
        descripcion: '',
        ruta: user?.user_metadata?.route || '',
        zona: user?.user_metadata?.zona || '',
        empleado_involucrado: '',
        accion_correctiva: '',
        status: 'abierto',
        pac_descripcion: '',
        pac_responsable: '',
        pac_fecha: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.tipo || !formData.severidad || !formData.descripcion) {
      toast({ title: 'Faltan datos', description: 'Tipo, severidad y descripción son obligatorios.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        fecha_deteccion: selectedHallazgo ? selectedHallazgo.fecha_deteccion : new Date().toISOString().split('T')[0],
        auditor_id: selectedHallazgo ? selectedHallazgo.auditor_id : user.id,
        auditor_nombre: selectedHallazgo ? selectedHallazgo.auditor_nombre : (user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || 'Auditor'),
        updated_at: new Date().toISOString()
      };

      if (formData.status === 'cerrado' && (!selectedHallazgo || selectedHallazgo.status !== 'cerrado')) {
        payload.fecha_cierre = new Date().toISOString().split('T')[0];
        payload.responsable_cierre = user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || 'Sistema';
      }

      let error;
      let hallazgoId;
      if (selectedHallazgo) {
        const { error: updateError } = await supabase.from('ci_hallazgos').update({
          tipo: payload.tipo, severidad: payload.severidad, area: payload.area, descripcion: payload.descripcion,
          ruta: payload.ruta, zona: payload.zona, empleado_involucrado: payload.empleado_involucrado,
          accion_correctiva: payload.accion_correctiva, status: payload.status,
          fecha_cierre: payload.fecha_cierre, responsable_cierre: payload.responsable_cierre, updated_at: payload.updated_at
        }).eq('id', selectedHallazgo.id);
        error = updateError;
        hallazgoId = selectedHallazgo.id;
      } else {
        const { data: newH, error: insertError } = await supabase.from('ci_hallazgos').insert([{
          tipo: payload.tipo, severidad: payload.severidad, area: payload.area, descripcion: payload.descripcion,
          ruta: payload.ruta, zona: payload.zona, empleado_involucrado: payload.empleado_involucrado,
          accion_correctiva: payload.accion_correctiva, status: payload.status, auditor_id: payload.auditor_id, 
          auditor_nombre: payload.auditor_nombre, fecha_deteccion: payload.fecha_deteccion
        }]).select('id').single();
        error = insertError;
        hallazgoId = newH?.id;
      }

      if (error) throw error;

      // Handle PAC
      if ((formData.severidad === 'alta' || formData.severidad === 'critica') && hallazgoId) {
        const pacPayload = {
          hallazgo_id: hallazgoId,
          descripcion_accion: formData.pac_descripcion || 'Acción requerida',
          responsable_nombre: formData.pac_responsable || 'Pendiente',
          fecha_compromiso: formData.pac_fecha || null
        };

        if (selectedHallazgo && selectedHallazgo.pac && selectedHallazgo.pac.length > 0) {
          // Update PAC
          await supabase.from('ci_pac').update(pacPayload).eq('hallazgo_id', hallazgoId);
        } else {
          // Insert PAC
          await supabase.from('ci_pac').insert([pacPayload]);
        }
      }

      toast({ title: 'Éxito', description: `Hallazgo ${selectedHallazgo ? 'actualizado' : 'creado'} correctamente.` });
      setIsModalOpen(false);
      loadHallazgos();
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: 'Error', description: 'No se pudo guardar el hallazgo', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeveridadColor = (severidad) => {
    switch (severidad?.toLowerCase()) {
      case 'critica': return 'bg-red-100 text-red-800 border-red-200';
      case 'alta': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'media': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'cerrado': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'en_proceso': return <Clock className="h-4 w-4 text-blue-600" />;
      case 'escalado': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      default: return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="p-4 rounded-full bg-red-50 dark:bg-red-950/30 mb-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Error al cargar datos</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-xs">{error}</p>
      <button onClick={() => { setError(null); loadHallazgos(); }} className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Reintentar</button>
    </div>
  );

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-6">
      <Helmet>
        <title>Gestión de Hallazgos | Cervezas Finas</title>
      </Helmet>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <AlertCircle className="h-8 w-8 text-[#E31837]" />
            Gestión de Hallazgos
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Registro y seguimiento de no conformidades e incidencias.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openModal()} className="bg-[#E31837] hover:bg-[#C21530] text-white">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Hallazgo
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar por descripción, ruta..."
                className="pl-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos (Estado)</SelectItem>
                  <SelectItem value="abierto">Abiertos</SelectItem>
                  <SelectItem value="en_proceso">En Proceso</SelectItem>
                  <SelectItem value="escalado">Escalados</SelectItem>
                  <SelectItem value="cerrado">Cerrados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severidadFilter} onValueChange={setSeveridadFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Severidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas (Severidad)</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E31837]"></div>
            </div>
          ) : filteredHallazgos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No hay hallazgos registrados</p>
              <p className="text-slate-400 text-sm mt-1">Los hallazgos que registres aparecerán aquí.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredHallazgos.map((hallazgo) => (
                <div 
                  key={hallazgo.id} 
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group"
                  onClick={() => openModal(hallazgo)}
                >
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="uppercase text-[10px] bg-white dark:bg-gray-900">
                          {hallazgo.tipo}
                        </Badge>
                        <Badge variant="outline" className={`uppercase text-[10px] ${getSeveridadColor(hallazgo.severidad)}`}>
                          {hallazgo.severidad}
                        </Badge>
                        <Badge variant="secondary" className="flex items-center gap-1 uppercase text-[10px] bg-gray-100 dark:bg-gray-800">
                          {getStatusIcon(hallazgo.status)}
                          {hallazgo.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-gray-400 font-mono">#{hallazgo.id.split('-')[0]}</span>
                      </div>
                      <h4 className="text-base font-medium text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-[#E31837] transition-colors">
                        {hallazgo.descripcion}
                      </h4>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {hallazgo.area && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" /> {hallazgo.area}
                          </span>
                        )}
                        {(hallazgo.ruta || hallazgo.zona) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {[hallazgo.ruta, hallazgo.zona].filter(Boolean).join(' - ')}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {format(new Date(hallazgo.created_at), 'dd MMM yyyy', { locale: es })}
                        </span>
                      </div>
                    </div>
                    {hallazgo.auditor_nombre && (
                      <div className="text-left md:text-right text-sm">
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Auditor</p>
                        <p className="font-medium text-gray-700 dark:text-gray-300">{hallazgo.auditor_nombre}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal / Dialog para crear/editar hallazgo */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertCircle className="h-5 w-5 text-[#E31837]" />
              {selectedHallazgo ? 'Detalle de Hallazgo' : 'Nuevo Hallazgo'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Hallazgo *</Label>
                <Select value={formData.tipo} onValueChange={(v) => setFormData({...formData, tipo: v})}>
                  <SelectTrigger id="tipo">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proceso">Proceso / Operativo</SelectItem>
                    <SelectItem value="merma">Merma / Daño</SelectItem>
                    <SelectItem value="faltante">Faltante de Inventario</SelectItem>
                    <SelectItem value="conducta">Conducta / Uniforme</SelectItem>
                    <SelectItem value="precio">Alteración de Precios</SelectItem>
                    <SelectItem value="activo">Equipos / Activos</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="severidad">Severidad *</Label>
                <Select value={formData.severidad} onValueChange={(v) => setFormData({...formData, severidad: v})}>
                  <SelectTrigger id="severidad">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="critica">Crítica (Requiere PAC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción detallada *</Label>
              <Textarea 
                id="descripcion" 
                placeholder="Describe la irregularidad encontrada..." 
                className="min-h-[100px]"
                value={formData.descripcion}
                onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="area">Área Operativa</Label>
                <Select value={formData.area} onValueChange={(v) => setFormData({...formData, area: v})}>
                  <SelectTrigger id="area">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reparto">Reparto</SelectItem>
                    <SelectItem value="bodega">Bodega</SelectItem>
                    <SelectItem value="um6">UM6</SelectItem>
                    <SelectItem value="ventas">Preventa / Ventas</SelectItem>
                    <SelectItem value="activos">Técnico / Activos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Estado del Hallazgo</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="abierto">Abierto</SelectItem>
                    <SelectItem value="en_proceso">En Proceso</SelectItem>
                    {isJefe && <SelectItem value="escalado">Escalado</SelectItem>}
                    <SelectItem value="cerrado">Cerrado (Resuelto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ruta">Ruta (Opcional)</Label>
                <Input id="ruta" value={formData.ruta} onChange={(e) => setFormData({...formData, ruta: e.target.value})} placeholder="Ej: RUTA 101" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zona">Zona (Opcional)</Label>
                <Input id="zona" value={formData.zona} onChange={(e) => setFormData({...formData, zona: e.target.value})} placeholder="Ej: NORTE" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="empleado">Empleado/s Involucrado/s (Opcional)</Label>
              <Input id="empleado" value={formData.empleado_involucrado} onChange={(e) => setFormData({...formData, empleado_involucrado: e.target.value})} placeholder="Nombre del chofer, bodeguero, etc." />
            </div>

            {formData.status === 'cerrado' && (
              <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <Label htmlFor="accion_correctiva" className="text-green-600">Acción Correctiva Implementada *</Label>
                <Textarea 
                  id="accion_correctiva" 
                  placeholder="Describe cómo se solucionó..." 
                  value={formData.accion_correctiva}
                  onChange={(e) => setFormData({...formData, accion_correctiva: e.target.value})}
                  required={formData.status === 'cerrado'}
                />
              </div>
            )}

            {(formData.severidad === 'alta' || formData.severidad === 'critica') && (
              <div className="space-y-4 pt-4 border-t border-rose-100 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 -mx-6 px-6 pb-2">
                <div className="flex items-center gap-2 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                  <h4 className="font-semibold text-sm">Plan de Acción Correctiva (PAC) Requerido</h4>
                </div>
                <div className="space-y-2">
                  <Label>Acción a Tomar *</Label>
                  <Textarea placeholder="Qué se va a hacer para resolverlo definitivamente..." value={formData.pac_descripcion} onChange={e => setFormData({...formData, pac_descripcion: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Responsable de Solución *</Label>
                    <Input placeholder="Nombre del responsable..." value={formData.pac_responsable} onChange={e => setFormData({...formData, pac_responsable: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha Compromiso *</Label>
                    <Input type="date" value={formData.pac_fecha} onChange={e => setFormData({...formData, pac_fecha: e.target.value})} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSubmitting} className="bg-[#E31837] hover:bg-[#C21530] text-white">
              {isSubmitting ? 'Guardando...' : 'Guardar Hallazgo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
