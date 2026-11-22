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
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, MapPin, Clock, AlertCircle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays, subDays, startOfMonth, endOfMonth, isSameDay, isSameMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';

export default function ControlInternoCalendarPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [users, setUsers] = useState([]); // For assigning audits

  const [formData, setFormData] = useState({
    titulo: '',
    tipo_auditoria: 'delivery',
    fecha_programada: format(new Date(), 'yyyy-MM-dd'),
    asignado_a: '',
    ruta: '',
    zona: '',
    notas: ''
  });

  const isJefe = user?.user_metadata?.type === 'jefe-control-interno' || user?.user_metadata?.type === 'jefe control interno';

  useEffect(() => {
    loadEvents();
    if (isJefe) {
      loadUsers();
    }
  }, [user, currentDate]);

  const loadEvents = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const start = startOfMonth(currentDate).toISOString();
      const end = endOfMonth(currentDate).toISOString();

      let query = supabase
        .from('ci_calendario')
        .select('*')
        .gte('fecha_programada', start)
        .lte('fecha_programada', end);

      if (!isJefe) {
        query = query.eq('asignado_a', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error("Error loading calendar events:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    // Attempt to load control_interno users from a profiles table if it exists,
    // or just mock it since we can't fetch auth.users directly from client usually.
    // For now we will allow manual entry or mock.
    // Let's assume we can query 'profiles' or we just enter the auditor's name.
    // For simplicity, we use text for asignado_nombre and ID.
  };

  const openModal = (date) => {
    setFormData({
      ...formData,
      fecha_programada: format(date, 'yyyy-MM-dd'),
      asignado_a: isJefe ? '' : user.id
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.titulo || !formData.fecha_programada) {
      toast({ title: 'Error', description: 'Título y fecha son obligatorios', variant: 'destructive' });
      return;
    }
    try {
      const payload = {
        ...formData,
        created_by: user.id,
        asignado_a: formData.asignado_a || user.id,
        asignado_nombre: isJefe ? formData.asignado_a : (user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || 'Auditor')
      };
      
      const { error } = await supabase.from('ci_calendario').insert([payload]);
      if (error) throw error;

      toast({ title: 'Programada', description: 'Auditoría programada correctamente.' });
      setIsModalOpen(false);
      loadEvents();
    } catch (error) {
      console.error("Save error:", error);
      toast({ title: 'Error', description: 'No se pudo guardar la programación', variant: 'destructive' });
    }
  };

  const getDaysInMonth = () => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  };

  const days = getDaysInMonth();

  const getEventsForDay = (day) => {
    return events.filter(e => isSameDay(parseISO(e.fecha_programada), day));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completado': return 'bg-emerald-500 text-white';
      case 'omitido': return 'bg-slate-500 text-white';
      default: return 'bg-blue-500 text-white';
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-6">
      <Helmet>
        <title>Calendario Operativo | Cervezas Finas</title>
      </Helmet>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="h-8 w-8 text-[#E31837]" />
            Calendario de Auditorías
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Programación y seguimiento de revisiones.
          </p>
        </div>
        {isJefe && (
          <div className="flex gap-2">
            <Button onClick={() => openModal(new Date())} className="bg-[#E31837] hover:bg-[#C21530] text-white">
              <Plus className="w-4 h-4 mr-2" />
              Programar
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(subDays(currentDate, 30))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-bold capitalize w-40 text-center">
              {format(currentDate, 'MMMM yyyy', { locale: es })}
            </h2>
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 30))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" onClick={() => setCurrentDate(new Date())}>Hoy</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-slate-50 dark:bg-slate-900">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
              <div key={d} className="p-2 text-center text-sm font-semibold text-slate-500">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 bg-white dark:bg-slate-950">
            {days.map((day, i) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());

              return (
                <div 
                  key={i} 
                  className={`min-h-[120px] p-2 border-b border-r ${!isCurrentMonth ? 'bg-slate-50 dark:bg-slate-900/50 opacity-50' : ''} ${isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-[#E31837] text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                      {format(day, 'd')}
                    </span>
                    {isJefe && isCurrentMonth && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 hover:opacity-100 transition-opacity group-hover:opacity-100" onClick={() => openModal(day)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1 mt-2">
                    {dayEvents.map(e => (
                      <div 
                        key={e.id} 
                        className={`text-xs p-1.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(e.status)}`}
                        onClick={() => {/* View Details */}}
                        title={`${e.titulo} - ${e.asignado_nombre || 'Sin asignar'}`}
                      >
                        <span className="font-semibold block truncate">{e.titulo}</span>
                        {isJefe && <span className="text-[9px] opacity-80 block truncate">{e.asignado_nombre}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Programar Auditoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Título / Descripción corta *</Label>
              <Input value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} placeholder="Ej: Revisión Ruta 10..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha *</Label>
                <Input type="date" value={formData.fecha_programada} onChange={e => setFormData({...formData, fecha_programada: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formData.tipo_auditoria} onValueChange={v => setFormData({...formData, tipo_auditoria: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery">Reparto</SelectItem>
                    <SelectItem value="bodega">Bodega</SelectItem>
                    <SelectItem value="um6">Mercado (UM6)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isJefe && (
              <div className="space-y-2">
                <Label>Asignar A (Nombre o ID)</Label>
                <Input value={formData.asignado_a} onChange={e => setFormData({...formData, asignado_a: e.target.value})} placeholder="Nombre del auditor..." />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ruta (Opcional)</Label>
                <Input value={formData.ruta} onChange={e => setFormData({...formData, ruta: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Zona (Opcional)</Label>
                <Input value={formData.zona} onChange={e => setFormData({...formData, zona: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas Adicionales</Label>
              <Textarea value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button className="bg-[#E31837] text-white" onClick={handleSave}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
