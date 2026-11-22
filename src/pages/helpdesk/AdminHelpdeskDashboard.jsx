import React, { useState, useEffect } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Search, Settings, ShieldCheck, CheckCircle2, User, Edit2, Power, Camera, Image as ImageIcon, Trash2, Clock, Activity } from 'lucide-react';
import { fetchTickets, fetchAreas, addOrUpdateArea, updateTicketStatus, fetchMessages, addMessage } from '@/repositories/helpdeskRepository';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/supabaseClient';
import { pushService } from '@/lib/pushService';

export default function AdminHelpdeskDashboard() {
  const { user } = useSupabaseAuth();
  const [tickets, setTickets] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterArea, setFilterArea] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [messagePhoto, setMessagePhoto] = useState(null);

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const processPhoto = async (file) => {
    if (!file) return null;
    try {
      if (!navigator.onLine) throw new Error("Offline");
      const { uploadPhoto: uploadService } = await import('@/lib/uploadService');
      return await uploadService(file, "helpdesk-fotos");
    } catch (err) {
      console.warn("Foto se guardará como Base64 (sin conexión):", err);
      try {
        return await fileToBase64(file);
      } catch (b64Err) {
        return null;
      }
    }
  };

  const [users, setUsers] = useState([]);

  // Area Admin Dialog
  const [isAreaManagerOpen, setIsAreaManagerOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [editingAreaId, setEditingAreaId] = useState(null);
  const [editAreaName, setEditAreaName] = useState("");

  const { toast } = useToast();

  const refreshData = async () => {
    setLoading(true);
    const [fetchedAreas, fetchedTickets, fetchedUsersData] = await Promise.all([
      fetchAreas(true),
      fetchTickets(null),
      supabase.from('profiles').select('id, name, phone')
    ]);
    
    // Sort tickets: Newest first
    const sorted = (fetchedTickets || []).sort((a, b) => {
      const tA = new Date(a.created_at || a.timestamp || 0).getTime();
      const tB = new Date(b.created_at || b.timestamp || 0).getTime();
      return tB - tA;
    });

    setAreas(fetchedAreas);
    setTickets(sorted);
    if (!fetchedUsersData.error) {
      setUsers(fetchedUsersData.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleCreateArea = async () => {
    if (!newAreaName.trim()) return;
    try {
      await addOrUpdateArea(newAreaName, null, 1);
      setNewAreaName("");
      refreshData();
      toast({ title: 'Área Creada' });
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleUpdateAreaStatus = async (area, is_active) => {
    try {
      await addOrUpdateArea(area.name, area.id, is_active ? 1 : 0);
      refreshData();
      toast({ title: is_active ? 'Área Activada' : 'Área Inactivada' });
    } catch (e) { toast({ title: 'Error', variant: 'destructive' }); }
  };

  const handleDeleteArea = async (area) => {
    if (!window.confirm(`¿Confirmas la eliminación permanente del área "${area.name}"?`)) return;
    try {
      const { deleteArea } = await import('@/repositories/helpdeskRepository');
      await deleteArea(area.id);
      refreshData();
      toast({ title: 'Área Eliminada', description: `Se eliminó el área "${area.name}".` });
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive', description: 'No se pudo eliminar el área.' });
    }
  };

  const handleSaveAreaEdit = async () => {
    if (!editAreaName.trim()) return;
    try {
      await addOrUpdateArea(editAreaName, editingAreaId, 1);
      setEditingAreaId(null);
      refreshData();
      toast({ title: 'Área Actualizada' });
    } catch (e) { toast({ title: 'Error', variant: 'destructive' }); }
  };

  const handleOpenTicket = async (ticket) => {
    setSelectedTicket(ticket);
    const msgs = await fetchMessages(ticket.id);
    setMessages(msgs);
  };

  const handleSendMessage = async () => {
    if (!newMessageText.trim() && !messagePhoto) return;
    try {
      const imageUrl = await processPhoto(messagePhoto);

      const msg = await addMessage(
        selectedTicket.id, 
        user.id, 
        user.rawUserMetaData?.name || user.email || 'Admin', 
        newMessageText,
        imageUrl
      );
      setMessages([...messages, msg]);
      setNewMessageText("");
      setMessagePhoto(null);
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo enviar el mensaje.', variant: 'destructive' });
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const updated = await updateTicketStatus(selectedTicket.id, { status: newStatus });
      setSelectedTicket(updated);
      setTickets(tickets.map(t => t.id === updated.id ? updated : t));
      toast({ title: 'Estatus Actualizado' });
    } catch (e) {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleAssignUser = async (userId) => {
    const isUnassigned = userId === 'UNASSIGNED';
    const targetUserId = isUnassigned ? null : userId;
    
    // Trazabilidad
    const oldUser = users.find(u => String(u.id) === String(selectedTicket.assigned_to));
    const newUser = users.find(u => String(u.id) === String(targetUserId));
    const oldName = oldUser ? oldUser.name : 'Sin Asignar';
    const newName = newUser ? newUser.name : 'Sin Asignar';

    if (String(selectedTicket.assigned_to) === String(targetUserId)) return;
    
    try {
      const updated = await updateTicketStatus(selectedTicket.id, { assigned_to: targetUserId });
      setSelectedTicket(updated);
      setTickets(tickets.map(t => t.id === updated.id ? updated : t));
      
      const traceMsg = `🔄 Ticket reasignado de *${oldName}* a *${newName}*`;
      const msg = await addMessage(
        selectedTicket.id,
        user.id,
        'Sistema',
        traceMsg,
        null
      );
      setMessages(prev => [...prev, msg]);

      toast({ title: 'Usuario Asignado', description: `Reasignado a ${newName}. El ticket ahora le aparecerá en su panel personal.` });

      // Push Notification
      if (!isUnassigned) {
        const pushResult = await pushService.sendToUser(
          newUser.id,
          "🎫 NUEVO TICKET ASIGNADO",
          `Hola ${newName}, se te ha asignado: [${selectedTicket.priority}] - ${selectedTicket.subject}\nÁrea: ${selectedTicket.area_name}`,
          "/mis-tickets"
        );
        if (!pushResult.success) {
          toast({ title: 'Aviso Push', description: pushResult.error || 'El usuario no tiene un dispositivo registrado para notificaciones.', variant: 'destructive' });
        }
      }

      // WhatsApp Notification
      if (!isUnassigned && newUser?.phone) {
        const cleanPhone = newUser.phone.replace(/[^0-9]/g, '');
        if (cleanPhone) {
          const message = encodeURIComponent(
            `Hola *${newUser.name || 'Compañero'}*, se te ha asignado un ticket en el sistema.\n\n` +
            `*Asunto:* ${selectedTicket.subject}\n` +
            `*Área:* ${selectedTicket.area_name}\n` +
            `*Prioridad:* ${selectedTicket.priority}\n\n` +
            `Puedes revisarlo aquí: https://cervezasfinas.com/mis-tickets`
          );
          window.open(`https://wa.me/${cleanPhone.startsWith('52') ? cleanPhone : '52' + cleanPhone}?text=${message}`, '_blank');
        }
      }
    } catch (e) {
        toast({ title: 'Error', variant: 'destructive', description: 'No se pudo asignar el usuario.' });
    }
  };

  const handleAreaChange = async (newAreaId) => {
    if (selectedTicket.area_id === newAreaId) return;
    
    const newArea = areas.find(a => a.id === newAreaId);
    const oldArea = areas.find(a => a.id === selectedTicket.area_id) || { name: selectedTicket.area_name };
    if (!newArea) return;
    
    try {
      const updated = await updateTicketStatus(selectedTicket.id, { 
        area_id: newArea.id, 
        area_name: newArea.name 
      });
      setSelectedTicket(updated);
      setTickets(tickets.map(t => t.id === updated.id ? updated : t));
      
      const traceMsg = `🔀 Ticket transferido del área *${oldArea.name}* a *${newArea.name}*`;
      const msg = await addMessage(
        selectedTicket.id,
        user.id,
        'Sistema',
        traceMsg,
        null
      );
      setMessages(prev => [...prev, msg]);
      
      toast({ title: 'Área Transferida', description: `Transferido a ${newArea.name}` });
    } catch (e) {
        toast({ title: 'Error', variant: 'destructive', description: 'No se pudo transferir de área.' });
    }
  };

  const getParticipants = () => {
    const names = new Set();
    if (selectedTicket?.creator_name) names.add(selectedTicket.creator_name);
    
    messages.forEach(m => {
      if (m.sender_name && m.sender_name !== 'Sistema') names.add(m.sender_name);
      if (m.sender_name === 'Sistema' && m.message.includes('Ticket reasignado')) {
          const matches = m.message.match(/\*([^*]+)\*/g);
          if (matches && matches.length >= 2) {
              names.add(matches[0].replace(/\*/g, ''));
              names.add(matches[1].replace(/\*/g, ''));
          }
      }
    });
    
    names.delete('Sin Asignar');
    return Array.from(names);
  };

  // derived data
  const openCount = tickets.filter(t => !t.status || t.status === 'OPEN' || t.status === 'ABIERTO').length;
  const inProgressCount = tickets.filter(t => t.status === 'IN_PROGRESS' || t.status === 'EN_PROCESO').length;
  const closedCount = tickets.filter(t => t.status === 'CLOSED' || t.status === 'RESOLVED' || t.status === 'CERRADO').length;
  const totalCount = tickets.length;

  const filteredTickets = tickets
    .filter(t => {
      if (filterArea !== 'ALL' && t.area_id !== filterArea) return false;
      if (filterStatus !== 'ALL') {
        if (filterStatus === 'OPEN' && t.status !== 'OPEN' && t.status !== 'ABIERTO' && t.status) return false;
        if (filterStatus === 'IN_PROGRESS' && t.status !== 'IN_PROGRESS' && t.status !== 'EN_PROCESO') return false;
        if (filterStatus === 'CLOSED' && t.status !== 'CLOSED' && t.status !== 'RESOLVED' && t.status !== 'CERRADO') return false;
      }
      if (searchTerm) {
        const qs = searchTerm.toLowerCase();
        return t.subject?.toLowerCase().includes(qs) || t.creator_name?.toLowerCase().includes(qs) || t.description?.toLowerCase().includes(qs);
      }
      return true;
    })
    .sort((a, b) => {
      const tA = new Date(a.created_at || a.timestamp || 0).getTime();
      const tB = new Date(b.created_at || b.timestamp || 0).getTime();
      return tB - tA;
    });

  const getStatusColor = (status) => {
    if (status === 'IN_PROGRESS') return 'text-yellow-400 bg-yellow-900/50 border-yellow-800';
    if (status === 'RESOLVED' || status === 'CLOSED') return 'text-emerald-400 bg-emerald-900/50 border-emerald-800';
    return 'text-blue-400 bg-blue-900/50 border-blue-800';
  };
  const getStatusText = (status) => {
    if (status === 'IN_PROGRESS') return 'En Proceso';
    if (status === 'RESOLVED' || status === 'CLOSED') return 'Cerrado';
    return 'Abierto';
  };

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-6 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-white">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Gestión Helpdesk
          </h1>
          <p className="text-slate-400">Panel administrativo de tickets y áreas.</p>
        </div>
        <Button variant="outline" onClick={() => setIsAreaManagerOpen(true)} className="gap-2 border-slate-700 bg-slate-800 hover:bg-slate-700 text-white">
          <Settings className="w-4 h-4" /> Configurar Áreas
        </Button>
      </div>

      {/* Recuadros Ejecutivos / Status Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div 
          onClick={() => setFilterStatus(filterStatus === 'OPEN' ? 'ALL' : 'OPEN')}
          className={cn(
            "p-4 rounded-xl border transition-all cursor-pointer bg-slate-800/80 hover:bg-slate-800 shadow-sm",
            filterStatus === 'OPEN' ? "border-blue-500 bg-blue-950/40 ring-1 ring-blue-500" : "border-slate-700"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Abiertos</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400"><Clock className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-black text-white mt-2">{openCount}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Pendientes de atención</p>
        </div>

        <div 
          onClick={() => setFilterStatus(filterStatus === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
          className={cn(
            "p-4 rounded-xl border transition-all cursor-pointer bg-slate-800/80 hover:bg-slate-800 shadow-sm",
            filterStatus === 'IN_PROGRESS' ? "border-yellow-500 bg-yellow-950/40 ring-1 ring-yellow-500" : "border-slate-700"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-yellow-400">En Proceso</span>
            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400"><Activity className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-black text-white mt-2">{inProgressCount}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">En gestión activa</p>
        </div>

        <div 
          onClick={() => setFilterStatus(filterStatus === 'CLOSED' ? 'ALL' : 'CLOSED')}
          className={cn(
            "p-4 rounded-xl border transition-all cursor-pointer bg-slate-800/80 hover:bg-slate-800 shadow-sm",
            filterStatus === 'CLOSED' ? "border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500" : "border-slate-700"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Cerrados</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><CheckCircle2 className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-black text-white mt-2">{closedCount}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Resueltos / Concluidos</p>
        </div>

        <div 
          onClick={() => setFilterStatus('ALL')}
          className={cn(
            "p-4 rounded-xl border transition-all cursor-pointer bg-slate-800/80 hover:bg-slate-800 shadow-sm",
            filterStatus === 'ALL' ? "border-indigo-500 bg-indigo-950/40 ring-1 ring-indigo-500" : "border-slate-700"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Total</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400"><FileText className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-black text-white mt-2">{totalCount}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Todos los tickets</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 bg-slate-800/80 p-3 rounded-lg border border-slate-700 backdrop-blur">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Buscar ticket o creador..." 
            className="pl-9 bg-slate-900 border-slate-700 text-white placeholder-slate-500" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterArea} onValueChange={setFilterArea}>
          <SelectTrigger className="w-full sm:w-[200px] bg-slate-900 border-slate-700 text-white"><SelectValue placeholder="Todas las áreas" /></SelectTrigger>
          <SelectContent className="z-[10001] bg-slate-800 border-slate-700 text-white">
            <SelectItem value="ALL">Todas las Áreas</SelectItem>
            {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[160px] bg-slate-900 border-slate-700 text-white"><SelectValue placeholder="Estatus" /></SelectTrigger>
          <SelectContent className="z-[10001] bg-slate-800 border-slate-700 text-white">
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="OPEN">Abiertos</SelectItem>
            <SelectItem value="IN_PROGRESS">En Proceso</SelectItem>
            <SelectItem value="CLOSED">Cerrados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-slate-400">Cargando tickets...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTickets.length === 0 ? (
            <div className="col-span-full h-40 flex flex-col items-center justify-center border-2 border-dashed rounded-xl text-slate-400">
              <FileText className="w-8 h-8 mb-2 opacity-50" />
              <p>No se encontraron tickets con estos filtros.</p>
            </div>
          ) : (
            filteredTickets.map(t => {
              const assignedUser = users.find(u => String(u.id) === String(t.assigned_to));
              return (
              <Card key={t.id} className="cursor-pointer bg-slate-800/80 border-slate-700 hover:border-indigo-500 hover:bg-slate-800 transition-all h-full flex flex-col" onClick={() => handleOpenTicket(t)}>
                <CardHeader className="pb-2 flex-none">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span className="text-[10px] font-bold uppercase text-indigo-400 px-1.5 py-0.5 bg-indigo-500/10 rounded-sm border border-indigo-500/20 truncate max-w-[120px]" title={t.area_name}>
                      {t.area_name}
                    </span>
                    <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm border whitespace-nowrap", getStatusColor(t.status))}>
                      {getStatusText(t.status)}
                    </span>
                  </div>
                  <CardTitle className="text-base line-clamp-2 leading-tight text-white mb-2">{t.subject}</CardTitle>
                  
                  <div className="flex items-center gap-1.5 bg-slate-900/80 w-fit px-2 py-1 rounded-md border border-slate-700 mt-1">
                    <User className={cn("w-3.5 h-3.5 shrink-0", assignedUser ? "text-emerald-400" : "text-slate-500")} />
                    <span className={cn("text-[11px] font-medium truncate max-w-[150px]", assignedUser ? "text-emerald-300" : "text-slate-400 italic")} title={assignedUser ? assignedUser.name : 'Sin asignar'}>
                      {assignedUser ? assignedUser.name : 'Sin asignar'}
                    </span>
                  </div>

                </CardHeader>
                <CardContent className="flex flex-col flex-1 justify-between gap-3">
                  <p className="text-xs text-slate-400 line-clamp-3">{t.description}</p>
                  <div className="flex justify-between items-end border-t border-slate-700 pt-2 mt-auto">
                    <div className="text-[11px] text-slate-500">
                      <div>Por: <span className="font-medium text-slate-300">{t.creator_name}</span></div>
                      <div>{new Date(t.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )
            })
          )}
        </div>
      )}

      {/* ADMIN TICKET DIALOG */}
      <Dialog open={!!selectedTicket} onOpenChange={(v) => !v && setSelectedTicket(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-4xl lg:max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-900 border-slate-700 text-white shadow-2xl">
          <DialogHeader className="p-4 md:px-6 border-b border-slate-700 bg-slate-800 flex-shrink-0">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex-1 min-w-0 pr-6">
                <div className="mb-2">
                  <Select 
                    value={selectedTicket?.area_id} 
                    onValueChange={handleAreaChange}
                  >
                    <SelectTrigger className="h-7 w-fit min-w-[120px] max-w-[250px] border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-wider px-2">
                      <SelectValue placeholder="Área" />
                    </SelectTrigger>
                    <SelectContent className="z-[10002] bg-slate-800 border-slate-700 text-white">
                      {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <DialogTitle className="text-xl leading-snug text-white">{selectedTicket?.subject}</DialogTitle>
                <div className="text-sm text-slate-400 mt-1">
                  Reportado por <span className="font-medium text-slate-200">{selectedTicket?.creator_name}</span> el {new Date(selectedTicket?.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full lg:w-auto mt-2 lg:mt-0">
                <div className="flex-1 sm:flex-none">
                  <Select 
                    value={selectedTicket?.assigned_to ? String(selectedTicket.assigned_to) : 'UNASSIGNED'} 
                    onValueChange={handleAssignUser}
                  >
                    <SelectTrigger className="h-9 w-full min-w-[200px] border-indigo-800 bg-indigo-900/30 text-indigo-300">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span className="truncate max-w-[130px]">
                          {selectedTicket?.assigned_to 
                            ? (users.find(u => String(u.id) === String(selectedTicket.assigned_to))?.name || 'Usuario Asignado') 
                            : 'Asignar a...'}
                        </span>
                      </div>
                    </SelectTrigger>
                    <SelectContent className="z-[10002] bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="UNASSIGNED">Sin Asignar</SelectItem>
                      {selectedTicket?.assigned_to && !users.some(u => String(u.id) === String(selectedTicket.assigned_to) && !u.name?.toUpperCase().includes('DEMO')) && (
                        <SelectItem value={String(selectedTicket.assigned_to)}>
                          {users.find(u => String(u.id) === String(selectedTicket.assigned_to))?.name || 'Usuario Asignado (Oculto)'}
                        </SelectItem>
                      )}
                      {users
                        .filter(u => !u.name?.toUpperCase().includes('DEMO'))
                        .map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                </div>
                <Select 
                  value={selectedTicket?.status} 
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger className={cn("h-9 font-semibold w-full sm:w-[140px]", getStatusColor(selectedTicket?.status))}>
                    <SelectValue placeholder="Estatus" />
                  </SelectTrigger>
                  <SelectContent className="z-[10002] bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="OPEN">Abierto</SelectItem>
                    <SelectItem value="IN_PROGRESS">En Proceso</SelectItem>
                    <SelectItem value="CLOSED">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row shadow-inner">
            {/* Context Sidebar */}
            <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-700 bg-slate-900 flex flex-col overflow-y-auto shrink-0 md:shrink border-b shadow-sm max-h-[35vh] md:max-h-none">
                <div className="p-4 border-b border-slate-700 flex-shrink-0">
                   <h3 className="font-semibold text-sm mb-2 text-white">Descripción del problema</h3>
                   <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 space-y-2 flex flex-col">
                     <p className="text-sm text-slate-300 whitespace-pre-wrap flex-none">{selectedTicket?.description}</p>
                     {selectedTicket?.image_url && (
                        <div className="mt-2 rounded-lg flex-none break-inside-avoid">
                          <a href={selectedTicket.image_url} target="_blank" rel="noreferrer">
                            <img src={selectedTicket.image_url} alt="Evidencia Ticket" className="w-auto max-h-48 rounded object-contain border border-slate-700 shadow-sm" />
                          </a>
                        </div>
                     )}
                   </div>
                </div>
                <div className="p-4 border-t border-slate-700 flex-shrink-0">
                    <h3 className="font-semibold text-sm mb-2 text-white">Detalles Adicionales</h3>
                    <div className="text-xs space-y-1 text-slate-400">
                        <p><span className="font-medium text-slate-300">Prioridad:</span> {selectedTicket?.priority}</p>
                        <p><span className="font-medium text-slate-300">Ticket ID:</span> <span className="text-[10px] break-all">{selectedTicket?.id}</span></p>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-700 flex-shrink-0 bg-slate-900/50">
                    <h3 className="font-semibold text-sm mb-2 text-white">Participantes / Asignados</h3>
                    <div className="text-xs space-y-1.5 text-slate-400">
                        {getParticipants().map((p, idx) => (
                           <div key={idx} className="flex items-center gap-1.5">
                             <User className="w-3 h-3 text-slate-500 shrink-0" />
                             <span className="truncate">{p}</span>
                           </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="w-full md:w-2/3 flex flex-col bg-slate-950/50">
              <div className="flex-1 p-4 md:p-6 overflow-y-auto">
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-slate-500 text-sm">
                      Sin comentarios aún. Escribe a continuación para solicitar más info o dar avance.
                    </div>
                  ) : (
                    messages.map(msg => {
                      const isMe = msg.sender_id === user?.id;
                      return (
                        <div key={msg.id} className={cn("flex flex-col max-w-[85%]", isMe ? "self-end items-end ml-auto" : "self-start items-start")}>
                          <span className="text-[10px] text-slate-500 mb-1 px-1">
                            {isMe ? 'Tú (Staff)' : msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                          <div className={cn(
                            "px-4 py-2.5 shadow-sm text-sm",
                            isMe ? "bg-indigo-600 text-white rounded-tr-sm rounded-l-2xl" : 
                            msg.sender_name === 'Sistema' ? "bg-slate-800/80 border border-indigo-500/30 text-indigo-300 rounded-xl text-center italic text-xs mx-auto w-full" :
                            "bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm rounded-r-2xl"
                          )}>
                            {msg.message}
                            {msg.image_url && (
                              <div className="mt-2 text-center">
                                <a href={msg.image_url} target="_blank" rel="noreferrer">
                                  <img src={msg.image_url} alt="Evidencia chat" className="w-auto max-h-40 rounded object-contain border border-slate-500/30" />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              
              <div className="p-4 bg-slate-900 border-t border-slate-700 flex-shrink-0 flex flex-col gap-2">
                {messagePhoto && (
                  <div className="flex items-center justify-between bg-slate-800 px-3 py-1.5 rounded text-xs text-indigo-300">
                    <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> Foto Adjunta: {messagePhoto.name}</span>
                    <button onClick={() => setMessagePhoto(null)} className="text-slate-500 hover:text-red-400">Quitar</button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                    id="admin-chat-photo-upload" 
                    onChange={e => setMessagePhoto(e.target.files?.[0])}
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className={cn("h-[44px] w-[44px] shrink-0 border-slate-700 bg-slate-800", messagePhoto ? "text-indigo-400 border-indigo-500/50" : "text-slate-400")}
                    onClick={() => document.getElementById('admin-chat-photo-upload')?.click()}
                  >
                    <ImageIcon className="w-5 h-5" />
                  </Button>
                  <Textarea 
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                    placeholder="Escribe actualización, avance o respuesta..." 
                    className="min-h-[44px] h-[44px] shrink-0 resize-none rounded-xl bg-slate-800 border-slate-700 text-white"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  />
                  <Button onClick={handleSendMessage} className="rounded-xl h-[44px] shrink-0 bg-indigo-600 hover:bg-indigo-700">Enviar</Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MANAGE AREAS DIALOG */}
      <Dialog open={isAreaManagerOpen} onOpenChange={setIsAreaManagerOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Administrar Áreas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Input 
                value={newAreaName} 
                onChange={e => setNewAreaName(e.target.value)} 
                placeholder="Nombre de la nueva área..." 
                className="bg-slate-800 border-slate-700 text-white"
              />
              <Button onClick={handleCreateArea}>Agregar</Button>
            </div>
            
            <div className="mt-6 border border-slate-700 rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-800 border-b border-slate-700">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-slate-300">Área</th>
                            <th className="px-4 py-3 text-right font-medium text-slate-300">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-slate-900">
                        {areas.map(a => (
                            <tr key={a.id} className={cn("border-b border-slate-800 last:border-0 hover:bg-slate-800/80 transition-colors", !a.is_active && "opacity-60")}>
                                <td className="px-4 py-3 font-medium text-slate-200">
                                  {editingAreaId === a.id ? (
                                    <div className="flex items-center gap-2">
                                      <Input 
                                        className="h-7 text-sm bg-slate-800 border-slate-600 text-white" 
                                        value={editAreaName} 
                                        onChange={(e) => setEditAreaName(e.target.value)} 
                                        autoFocus
                                        onKeyDown={(e) => { if(e.key==='Enter') handleSaveAreaEdit(); }}
                                      />
                                      <Button size="sm" className="h-7 px-2" onClick={handleSaveAreaEdit}>OK</Button>
                                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingAreaId(null)}>x</Button>
                                    </div>
                                  ) : (
                                    <span>{a.name}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/20"
                                        onClick={() => { setEditingAreaId(a.id); setEditAreaName(a.name); }}
                                        title="Editar Nombre"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </Button>
                                        <Button 
                                          variant={a.is_active ? "ghost" : "outline"} 
                                          size="icon" 
                                          className={cn("h-8 w-8 border-transparent", a.is_active ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/20" : "text-green-400 border-green-800 bg-green-900/40 hover:bg-green-900/60")}
                                          onClick={() => handleUpdateAreaStatus(a, !a.is_active)}
                                          title={a.is_active ? "Inactivar" : "Reactivar"}
                                        >
                                          <Power className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                          onClick={() => handleDeleteArea(a)}
                                          title="Eliminar Área"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {areas.length === 0 && <tr><td colSpan={2} className="text-center p-8 text-slate-400">Sin áreas</td></tr>}
                    </tbody>
                </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
