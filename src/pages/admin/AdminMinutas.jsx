// src/pages/admin/AdminMinutas.jsx
// Panel de administración de Minutas — Crear, asignar y aprobar actividades
import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';
import {
  getMinutas, createMinuta, createMinutaItem, closeMinuta
} from '@/repositories/minutaRepository';
import {
  Plus, ClipboardList, Calendar, Users, CheckCircle2, Clock,
  FileText, ChevronRight, Search, AlertTriangle, XCircle, Eye,
  Lock, Unlock
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_STYLES = {
  activa: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  cerrada: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const ITEM_STATUS_STYLES = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: Clock },
  en_progreso: { label: 'En progreso', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: Clock },
  evidencia_enviada: { label: 'Evidencia enviada', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30', icon: Eye },
  aprobada: { label: 'Aprobada', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 },
  rechazada: { label: 'Rechazada', color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: XCircle },
};

export default function AdminMinutas() {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const { toast } = useToast();

  const [minutas, setMinutas] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('__ALL__');

  // Dialog states
  const [isNewMinutaOpen, setIsNewMinutaOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [selectedMinutaId, setSelectedMinutaId] = useState(null);

  // New minuta form
  const [newMinuta, setNewMinuta] = useState({ title: '', description: '' });
  // New item form
  const [newItem, setNewItem] = useState({ title: '', description: '', assigned_to: '', due_date: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [minutasData, { data: profilesData }] = await Promise.all([
        getMinutas(),
        supabase.from('profiles').select('id, name, email, role').order('name')
      ]);
      setMinutas(minutasData);
      setProfiles(profilesData || []);
    } catch (e) {
      console.error('[AdminMinutas] Error:', e);
    } finally {
      setLoading(false);
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    const total = minutas.length;
    const activas = minutas.filter(m => m.status === 'activa').length;
    const cerradas = minutas.filter(m => m.status === 'cerrada').length;
    let totalItems = 0, pendientes = 0, aprobadas = 0, evidencia = 0;
    minutas.forEach(m => {
      const items = m.minuta_items || [];
      totalItems += items.length;
      items.forEach(i => {
        if (i.status === 'pendiente' || i.status === 'en_progreso') pendientes++;
        if (i.status === 'aprobada') aprobadas++;
        if (i.status === 'evidencia_enviada') evidencia++;
      });
    });
    return { total, activas, cerradas, totalItems, pendientes, aprobadas, evidencia };
  }, [minutas]);

  // Filter
  const filtered = useMemo(() => {
    return minutas.filter(m => {
      const matchSearch = !searchTerm ||
        m.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === '__ALL__' || m.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [minutas, searchTerm, statusFilter]);

  const handleCreateMinuta = async () => {
    if (!newMinuta.title.trim()) {
      toast({ title: 'Error', description: 'El título es obligatorio.', variant: 'destructive' });
      return;
    }
    try {
      await createMinuta({
        title: newMinuta.title.trim(),
        description: newMinuta.description.trim(),
        created_by: user.id,
      });
      toast({ title: 'Minuta creada', description: 'La minuta se ha creado exitosamente.' });
      setNewMinuta({ title: '', description: '' });
      setIsNewMinutaOpen(false);
      loadData();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo crear la minuta.', variant: 'destructive' });
    }
  };

  const handleAddItem = async () => {
    if (!newItem.title.trim() || !newItem.assigned_to) {
      toast({ title: 'Error', description: 'Título y usuario asignado son obligatorios.', variant: 'destructive' });
      return;
    }
    try {
      await createMinutaItem({
        minuta_id: selectedMinutaId,
        assigned_to: newItem.assigned_to,
        title: newItem.title.trim(),
        description: newItem.description.trim(),
        due_date: newItem.due_date || null,
      });
      toast({ title: 'Actividad agregada', description: 'La actividad se ha asignado correctamente.' });
      setNewItem({ title: '', description: '', assigned_to: '', due_date: '' });
      setIsAddItemOpen(false);
      loadData();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo agregar la actividad.', variant: 'destructive' });
    }
  };

  const handleCloseMinuta = async (minutaId) => {
    if (!window.confirm('¿Cerrar esta minuta? Los usuarios ya no podrán subir evidencia.')) return;
    try {
      await closeMinuta(minutaId);
      toast({ title: 'Minuta cerrada', description: 'La minuta ha sido cerrada.' });
      loadData();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo cerrar la minuta.', variant: 'destructive' });
    }
  };

  const KPIS = [
    { label: 'Total Minutas', value: kpis.total, icon: ClipboardList, gradient: 'from-blue-600 to-blue-700' },
    { label: 'Activas', value: kpis.activas, icon: Unlock, gradient: 'from-emerald-600 to-emerald-700' },
    { label: 'Actividades', value: kpis.totalItems, icon: FileText, gradient: 'from-violet-600 to-violet-700' },
    { label: 'Pendientes', value: kpis.pendientes, icon: Clock, gradient: 'from-amber-600 to-amber-700' },
    { label: 'Por Revisar', value: kpis.evidencia, icon: Eye, gradient: 'from-orange-600 to-orange-700' },
    { label: 'Aprobadas', value: kpis.aprobadas, icon: CheckCircle2, gradient: 'from-green-600 to-green-700' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <Helmet><title>Gestión de Minutas | Admin</title></Helmet>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-cyan-400" />
            Gestión de Minutas
          </h1>
          <p className="text-slate-400 mt-1">Crea minutas, asigna actividades y revisa evidencia</p>
        </div>
        <Button
          onClick={() => setIsNewMinutaOpen(true)}
          className="bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white shadow-lg shadow-cyan-900/30"
        >
          <Plus className="h-4 w-4 mr-2" /> Nueva Minuta
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {KPIS.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className={`bg-gradient-to-br ${kpi.gradient} border-0 shadow-lg text-white`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <kpi.icon className="h-5 w-5 opacity-75" />
                </div>
                <p className="text-2xl font-bold">{loading ? '—' : kpi.value}</p>
                <p className="text-xs opacity-80 mt-0.5">{kpi.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar minuta..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-white/5 border-white/10 text-white">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">Todas</SelectItem>
            <SelectItem value="activa">Activas</SelectItem>
            <SelectItem value="cerrada">Cerradas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Minutas List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-16 text-slate-400">
            <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
            Cargando minutas...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="h-12 w-12 mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">No hay minutas para mostrar.</p>
            <Button onClick={() => setIsNewMinutaOpen(true)} className="mt-4 bg-cyan-600 hover:bg-cyan-500">
              <Plus className="h-4 w-4 mr-2" /> Crear primera minuta
            </Button>
          </div>
        ) : (
          filtered.map((minuta, idx) => {
            const items = minuta.minuta_items || [];
            const aprovadas = items.filter(i => i.status === 'aprobada').length;
            const porRevisar = items.filter(i => i.status === 'evidencia_enviada').length;
            const progress = items.length > 0 ? Math.round((aprovadas / items.length) * 100) : 0;

            return (
              <motion.div
                key={minuta.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className="bg-white/5 border-white/10 hover:border-cyan-500/30 transition-all group overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-white truncate">{minuta.title}</h3>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLES[minuta.status]}`}>
                            {minuta.status === 'activa' ? 'Activa' : 'Cerrada'}
                          </span>
                          {porRevisar > 0 && (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-orange-500/20 text-orange-300 border-orange-500/30 animate-pulse">
                              {porRevisar} por revisar
                            </span>
                          )}
                        </div>
                        {minuta.description && (
                          <p className="text-sm text-slate-400 mb-2 line-clamp-2">{minuta.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {minuta.created_at ? format(new Date(minuta.created_at), 'dd MMM yyyy', { locale: es }) : '—'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {items.length} actividades
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {aprovadas}/{items.length} completadas
                          </span>
                          {minuta.profiles && (
                            <span className="flex items-center gap-1">
                              Creada por: {minuta.profiles.name || minuta.profiles.email}
                            </span>
                          )}
                        </div>
                        {/* Progress bar */}
                        {items.length > 0 && (
                          <div className="mt-3">
                            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {minuta.status === 'activa' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setSelectedMinutaId(minuta.id); setIsAddItemOpen(true); }}
                              className="border-white/10 text-white hover:bg-white/5"
                            >
                              <Plus className="h-4 w-4 mr-1" /> Actividad
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCloseMinuta(minuta.id)}
                              className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                            >
                              <Lock className="h-4 w-4 mr-1" /> Cerrar
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          onClick={() => navigate(`/admin/minutas/${minuta.id}`)}
                          className="bg-cyan-600/80 hover:bg-cyan-500 text-white"
                        >
                          <Eye className="h-4 w-4 mr-1" /> Ver detalle
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Dialog: New Minuta */}
      <Dialog open={isNewMinutaOpen} onOpenChange={setIsNewMinutaOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-cyan-400" /> Nueva Minuta
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Crea una nueva minuta para asignar actividades y compromisos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Título *</Label>
              <Input
                placeholder="Ej: Minuta de reunión semanal"
                className="bg-slate-800 border-white/10 h-11 text-white"
                value={newMinuta.title}
                onChange={e => setNewMinuta({ ...newMinuta, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Descripción</Label>
              <textarea
                placeholder="Descripción de la minuta..."
                className="w-full bg-slate-800 border border-white/10 rounded-md p-3 text-white text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                value={newMinuta.description}
                onChange={e => setNewMinuta({ ...newMinuta, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsNewMinutaOpen(false)} className="text-slate-400">Cancelar</Button>
            <Button onClick={handleCreateMinuta} className="bg-cyan-600 hover:bg-cyan-500 text-white px-8">
              Crear Minuta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add Item */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-cyan-400" /> Nueva Actividad
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Asigna una actividad o compromiso a un usuario
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Actividad *</Label>
              <Input
                placeholder="Título de la actividad"
                className="bg-slate-800 border-white/10 h-11 text-white"
                value={newItem.title}
                onChange={e => setNewItem({ ...newItem, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Descripción</Label>
              <textarea
                placeholder="Detalle de la actividad..."
                className="w-full bg-slate-800 border border-white/10 rounded-md p-3 text-white text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                value={newItem.description}
                onChange={e => setNewItem({ ...newItem, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Asignar a *</Label>
              <Select value={newItem.assigned_to} onValueChange={v => setNewItem({ ...newItem, assigned_to: v })}>
                <SelectTrigger className="bg-slate-800 border-white/10 text-white h-11">
                  <SelectValue placeholder="Seleccionar usuario..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white max-h-60">
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id} className="focus:bg-cyan-500/20">
                      {p.name || p.email} {p.role ? `(${p.role})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Fecha límite</Label>
              <Input
                type="date"
                className="bg-slate-800 border-white/10 h-11 text-white"
                value={newItem.due_date}
                onChange={e => setNewItem({ ...newItem, due_date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsAddItemOpen(false)} className="text-slate-400">Cancelar</Button>
            <Button onClick={handleAddItem} className="bg-cyan-600 hover:bg-cyan-500 text-white px-8">
              Agregar Actividad
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
