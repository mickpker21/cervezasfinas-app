import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, Clock, CheckCircle2, User, Camera, Image as ImageIcon, AlertTriangle, Loader2, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchTickets, fetchAreas, createTicket, fetchMessages, addMessage, seedBasicAreasIfMissing, updateTicketStatus } from '@/repositories/helpdeskRepository';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/supabaseClient';

export default function MyTicketsDashboard() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [areas, setAreas] = useState([
    { id: 'area-sistemas-001', name: 'Sistemas / TI', is_active: 1 },
    { id: 'area-canalfrio-002', name: 'Canal Frío / Enfriadores', is_active: 1 },
    { id: 'area-rrhh-003', name: 'Recursos Humanos', is_active: 1 },
    { id: 'area-ventas-004', name: 'Ventas / Comercial', is_active: 1 },
    { id: 'area-logistica-005', name: 'Logística / Reparto', is_active: 1 },
    { id: 'area-operaciones-006', name: 'Operaciones', is_active: 1 },
    { id: 'area-soporte-007', name: 'Soporte General', is_active: 1 },
  ]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({ area_id: '', area_name: '', subject: '', description: '', priority: 'MEDIA' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitGuardRef = React.useRef(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isClosingTicket, setIsClosingTicket] = useState(false);

  // Areas por defecto siempre disponibles como fallback
  const FALLBACK_AREAS = [
    { id: 'area-sistemas-001', name: 'Sistemas / TI', is_active: 1 },
    { id: 'area-canalfrio-002', name: 'Canal Frío / Enfriadores', is_active: 1 },
    { id: 'area-rrhh-003', name: 'Recursos Humanos', is_active: 1 },
    { id: 'area-ventas-004', name: 'Ventas / Comercial', is_active: 1 },
    { id: 'area-logistica-005', name: 'Logística / Reparto', is_active: 1 },
    { id: 'area-operaciones-006', name: 'Operaciones', is_active: 1 },
    { id: 'area-soporte-007', name: 'Soporte General', is_active: 1 },
  ];

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [ticketFile, setTicketFile] = useState(null);
  const [messageFile, setMessageFile] = useState(null);
  const { toast } = useToast();

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const processFile = async (file) => {
    if (!file) return null;
    try {
      if (!navigator.onLine) throw new Error("Offline");
      const { uploadPhoto: uploadService } = await import('@/lib/uploadService');
      return await uploadService(file, "helpdesk-archivos");
    } catch (err) {
      console.warn("Archivo se guardará como Base64 (sin conexión):", err);
      try {
        return await fileToBase64(file);
      } catch (b64Err) {
        return null;
      }
    }
  };

  const isImage = (url) => {
    if (!url) return false;
    if (url.startsWith('data:image/')) return true;
    return /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(url);
  };

  const renderAttachment = (url, label = "Archivo") => {
    if (!url) return null;
    if (isImage(url)) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className="block mt-2">
          <img src={url} alt={label} className="w-auto max-h-48 rounded object-contain border border-slate-700 shadow-sm hover:opacity-90 transition" />
        </a>
      );
    }
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 p-3 bg-slate-800 border border-slate-700 rounded-lg text-indigo-400 hover:bg-slate-700 transition w-fit">
        <FileText className="w-5 h-5" />
        <span className="text-sm font-medium">Descargar / Ver {label}</span>
      </a>
    );
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      await seedBasicAreasIfMissing().catch(e => console.warn('seedBasicAreas error:', e));
      const [fetchedAreas, fetchedTickets, fetchedUsers] = await Promise.all([
        fetchAreas().catch(e => { console.warn('fetchAreas error:', e); return []; }),
        fetchTickets(user?.id).catch(e => { console.warn('fetchTickets error:', e); return []; }),
        supabase.from('profiles').select('id, name')
      ]);
      
      const rawAreas = Array.isArray(fetchedAreas) && fetchedAreas.length > 0 ? fetchedAreas : FALLBACK_AREAS;
      
      // Deduplicar áreas por nombre normalizado (ej. 'sistemas', 'canal frio', 'rrhh')
      const seenNames = new Set();
      const uniqueAreas = [];
      
      for (const a of rawAreas) {
        let norm = (a.name || '').toLowerCase().trim();
        if (norm.includes('sistemas')) norm = 'sistemas';
        else if (norm.includes('canal fri') || norm.includes('canal frí')) norm = 'canalfrio';
        else if (norm.includes('recursos') || norm.includes('rrhh') || norm.includes('humanos')) norm = 'rrhh';
        else if (norm.includes('ventas') || norm.includes('comercial')) norm = 'ventas';
        else if (norm.includes('logistica') || norm.includes('logística') || norm.includes('reparto')) norm = 'logistica';
        else if (norm.includes('operacion') || norm.includes('operación')) norm = 'operaciones';

        if (!seenNames.has(norm)) {
          seenNames.add(norm);
          uniqueAreas.push(a);
        }
      }

      setAreas(uniqueAreas.length > 0 ? uniqueAreas : FALLBACK_AREAS);
      setTickets(Array.isArray(fetchedTickets) ? fetchedTickets : []);
      if (fetchedUsers && !fetchedUsers.error) {
        setUsers(fetchedUsers.data || []);
      }
    } catch (e) {
      console.error('[MyTicketsDashboard] Error en refreshData:', e);
      setAreas(FALLBACK_AREAS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) refreshData();
  }, [user?.id]);

  const handleCreateTicket = async () => {
    if (!newTicket.area_id || !newTicket.subject.trim() || !newTicket.description.trim()) {
       toast({ title: 'Campos incompletos', description: 'Selecciona área, asunto y descripción.', variant: 'destructive' });
       return;
    }

    // Canal Frío no genera tickets — redirige a Órdenes de Trabajo
    const isCanFrio = newTicket.area_name?.toUpperCase().includes('CANAL FR');
    if (isCanFrio) {
      toast({ title: 'Canal Frío → Órdenes de Trabajo', description: 'Las solicitudes de Canal Frío se gestionan desde Órdenes de Trabajo. Serás redirigido.', variant: 'destructive' });
      setIsNewTicketOpen(false);
      setNewTicket({ area_id: '', area_name: '', subject: '', description: '', priority: 'MEDIA' });
      navigate('/orders');
      return;
    }
    
    if (isSubmitting || submitGuardRef.current) return;


    try {
      submitGuardRef.current = true;
      setIsSubmitting(true);
      const fileUrl = await processFile(ticketFile);

      await createTicket({
        creator_id: user.id,
        creator_name: user.rawUserMetaData?.name || user.email || 'Usuario',
        area_id: newTicket.area_id,
        area_name: newTicket.area_name,
        subject: newTicket.subject,
        description: newTicket.description,
        priority: newTicket.priority,
        image_url: fileUrl // Reused the same field for any file URL
      });
      toast({ title: 'Ticket Creado', description: 'Tu solicitud fue enviada correctamente.' });
      setIsNewTicketOpen(false);
      setNewTicket({ area_id: '', area_name: '', subject: '', description: '', priority: 'MEDIA' });
      setTicketFile(null);
      refreshData();
    } catch (e) {
      console.error("[MyTicketsDashboard] Error creating ticket:", e);
      toast({ title: 'Error', description: 'No se pudo crear el ticket.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      submitGuardRef.current = false;
    }
  };

  const handleOpenTicket = async (ticket) => {
    setSelectedTicket(ticket);
    const msgs = await fetchMessages(ticket.id);
    setMessages(msgs);
  };

  const handleSendMessage = async () => {
    if ((!newMessageText.trim() && !messageFile) || isSendingMessage) return;
    try {
      setIsSendingMessage(true);
      const fileUrl = await processFile(messageFile);

      const msg = await addMessage(
        selectedTicket.id, 
        user.id, 
        user.rawUserMetaData?.name || user.email || 'Usuario', 
        newMessageText,
        fileUrl
      );
      setMessages([...messages, msg]);
      setNewMessageText("");
      setMessageFile(null);
    } catch (e) {
      console.error("[MyTicketsDashboard] Error sending message:", e);
      toast({ title: 'Error', description: 'No se pudo enviar el mensaje.', variant: 'destructive' });
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleCloseTicket = async () => {
    if (isClosingTicket) return;
    try {
      setIsClosingTicket(true);
      const updated = await updateTicketStatus(selectedTicket.id, { status: 'CLOSED' });
      setSelectedTicket(updated);
      refreshData();
      toast({ title: 'Ticket Cerrado', description: 'Has marcado este ticket como resuelto.' });
    } catch (e) {
      console.error("[MyTicketsDashboard] Error closing ticket:", e);
      toast({ title: 'Error', variant: 'destructive', description: 'No se pudo cerrar el ticket.' });
    } finally {
      setIsClosingTicket(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'IN_PROGRESS') return 'text-yellow-400 bg-yellow-900/50 border-yellow-800';
    if (status === 'RESOLVED' || status === 'CLOSED') return 'text-emerald-400 bg-emerald-900/50 border-emerald-800';
    return 'text-blue-400 bg-blue-900/50 border-blue-800';
  };

  const getStatusText = (status) => {
    if (status === 'IN_PROGRESS') return 'En Proceso';
    if (status === 'RESOLVED' || status === 'CLOSED') return 'Cerrado';
    return 'Recibido / Abierto';
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Centro de Ayuda / Mis Tickets</h1>
          <p className="text-slate-400">Levanta incidencias de Canal Frío, Sistemas, Recursos Humanos, etc.</p>
        </div>
        <Button onClick={() => setIsNewTicketOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4" /> Nuevo Ticket
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tickets.map(t => (
          <Card key={t.id} className="cursor-pointer bg-slate-800/80 border-slate-700 hover:border-indigo-500 hover:bg-slate-800 transition-all" onClick={() => handleOpenTicket(t)}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] font-bold uppercase text-indigo-400 px-1.5 py-0.5 bg-indigo-500/10 rounded-sm border border-indigo-500/20">{t.area_name}</span>
                <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm border", getStatusColor(t.status))}>
                  {getStatusText(t.status)}
                </span>
              </div>
              <CardTitle className="text-lg line-clamp-1 text-white">{t.subject}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-400 line-clamp-2 mb-4">{t.description}</p>
              <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-700 pt-2">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(t.created_at).toLocaleDateString()}</span>
                {t.assigned_to && (
                  <span className="flex items-center gap-1 font-medium text-indigo-400">
                    <User className="w-3 h-3" /> Asignado a {users.find(u => u.id === t.assigned_to)?.name || 'Admin'}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {tickets.length === 0 && !loading && (
          <div className="col-span-full h-40 flex flex-col items-center justify-center border-2 border-dashed rounded-xl text-slate-400">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p>No has levantado ningún ticket aún.</p>
          </div>
        )}
      </div>

      <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md bg-slate-900 border-slate-700 text-white rounded-xl p-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="p-6 pb-2 border-b border-white/5 bg-slate-800/50">
            <DialogTitle>Crear Nuevo Ticket</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Área Destino</label>
              <Select 
                value={String(newTicket.area_id || '')} 
                onValueChange={(v) => {
                  const area = areas.find(a => String(a.id) === String(v) || a.name === v);
                  setNewTicket({ ...newTicket, area_id: String(v), area_name: area?.name || v });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Selecciona el área encargada" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white z-[10050]">
                  {areas.map((a, idx) => (
                    <SelectItem key={String(a.id || idx)} value={String(a.id || a.name)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(newTicket.area_name?.toUpperCase().includes('CANAL FRÍO') || newTicket.area_name?.toUpperCase().includes('CANAL FRIO')) ? (
                <div className="animate-in fade-in slide-in-from-top-2 rounded-2xl overflow-hidden border border-amber-500/30 bg-amber-500/10 p-5 space-y-4 my-2 text-center">
                  <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                  <div>
                    <h3 className="font-black text-amber-300 uppercase tracking-wider text-xs mb-1">CANAL FRÍO NO ACEPTA TICKETS DE INCIDENCIA</h3>
                    <p className="text-xs text-amber-200/90 leading-relaxed">
                      Las solicitudes de equipos, instalaciones, retiros o movimientos de enfriadores deben realizarse directamente en el módulo de <strong>Órdenes de Trabajo</strong>.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsNewTicketOpen(false);
                      setNewTicket({ area_id: '', area_name: '', subject: '', description: '', priority: 'MEDIA' });
                      navigate('/orders');
                    }}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase text-xs tracking-widest transition-all rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                  >
                    Crear Órden de Trabajo →
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Prioridad</label>
                    <Select 
                      value={newTicket.priority} 
                      onValueChange={(v) => setNewTicket({ ...newTicket, priority: v })}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Prioridad" /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        <SelectItem value="BAJA">Baja - Puede esperar</SelectItem>
                        <SelectItem value="MEDIA">Media - Importante</SelectItem>
                        <SelectItem value="ALTA">Alta - Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Asunto</label>
                    <Input 
                      placeholder="Ej. Problema con sistema, Error en App..." 
                      value={newTicket.subject} 
                      onChange={(e) => setNewTicket({...newTicket, subject: e.target.value})} 
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Descripción detallada</label>
                    <Textarea 
                      placeholder="Explica detalladamente la situación..." 
                      className="resize-none h-24 bg-slate-800 border-slate-700 text-white"
                      value={newTicket.description} 
                      onChange={(e) => setNewTicket({...newTicket, description: e.target.value})} 
                    />
                  </div>
                  
                  <MediaDropzone 
                    label="Archivo o Evidencia" 
                    file={ticketFile} 
                    onChange={setTicketFile} 
                  />

                  <Button 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11" 
                    onClick={handleCreateTicket}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isSubmitting ? 'Enviando...' : 'Enviar Ticket'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* TICKET DETAILS & CHAT DIALOG */}
      <Dialog open={!!selectedTicket} onOpenChange={(v) => !v && setSelectedTicket(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-2xl h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-900 border-slate-700 text-white shadow-2xl">
          <DialogHeader className="p-4 md:px-6 border-b border-slate-700 bg-slate-800 flex-shrink-0">
            <div className="flex justify-between items-start pr-8">
              <div>
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1 block">
                  Ticket a {selectedTicket?.area_name}
                </span>
                <DialogTitle className="text-xl leading-snug">{selectedTicket?.subject}</DialogTitle>
                {selectedTicket?.assigned_to && (
                  <div className="text-sm text-slate-400 mt-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> Asignado a: <span className="font-medium text-slate-300">{users.find(u => u.id === selectedTicket.assigned_to)?.name || 'Admin'}</span>
                  </div>
                )}
              </div>
              <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm border whitespace-nowrap", getStatusColor(selectedTicket?.status))}>
                {getStatusText(selectedTicket?.status)}
              </span>
            </div>
            <div className="mt-2 bg-slate-900 border-slate-700 p-2 md:p-3 rounded-lg border flex flex-col gap-2">
              <p className="text-sm text-slate-300 overflow-y-auto max-h-[120px] md:max-h-[150px] whitespace-pre-wrap">{selectedTicket?.description}</p>
              {renderAttachment(selectedTicket?.image_url, "Evidencia Principal")}
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 flex flex-col bg-slate-950/50">
            {messages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                No hay comentarios todavía en este ticket.
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.sender_id === user?.id;
                return (
                  <div key={msg.id} className={cn("flex flex-col max-w-[85%]", isMe ? "self-end items-end ml-auto" : "self-start items-start")}>
                    <span className="text-[10px] text-slate-500 mb-1 px-1">{isMe ? 'Tú' : (msg.sender_name || 'Agente')} • {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <div className={cn(
                      "px-4 py-2.5 text-sm shadow-sm",
                      isMe ? "bg-indigo-600 text-white rounded-tr-sm rounded-l-2xl" : "bg-slate-800 border border-slate-700 rounded-tl-sm rounded-r-2xl text-slate-200"
                    )}>
                      {msg.message}
                      {renderAttachment(msg.image_url, "Adjunto")}
                    </div>
                  </div>
                );
              })
            )}
            
            {/* Dummy element to force scroll to bottom could go here */}
          </div>
          
          {selectedTicket?.status !== 'CLOSED' && selectedTicket?.status !== 'RESOLVED' ? (
            <div className="p-4 bg-slate-900 border-t border-slate-700 flex-shrink-0 flex flex-col gap-2">
              {messageFile && (
                <div className="flex items-center justify-between bg-slate-800 px-3 py-1.5 rounded text-xs text-indigo-300">
                  <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Archivo: {messageFile.name}</span>
                  <button onClick={() => setMessageFile(null)} className="text-slate-500 hover:text-red-400">Quitar</button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input 
                  type="file" 
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" 
                  className="hidden" 
                  id="chat-photo-upload" 
                  onChange={e => setMessageFile(e.target.files?.[0])}
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  className={cn("h-10 w-10 shrink-0 border-slate-700 bg-slate-800", messageFile ? "text-indigo-400 border-indigo-500/50" : "text-slate-400")}
                  onClick={() => document.getElementById('chat-photo-upload')?.click()}
                >
                  <Plus className="w-5 h-5" />
                </Button>
                <div className="flex-1 flex gap-2">
                  <Input 
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                    placeholder="Escribe un comentario..." 
                    className="h-10 rounded-xl bg-slate-800 border-slate-700 text-white text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  />
                  <Button 
                    onClick={handleSendMessage} 
                    className="rounded-xl h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-sm font-bold"
                    disabled={isSendingMessage}
                  >
                    {isSendingMessage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isSendingMessage ? '...' : 'Enviar'}
                  </Button>
                </div>
              </div>
              {selectedTicket?.assigned_to === user?.id && (
                <div className="flex justify-end mt-1">
                   <Button 
                     variant="outline" 
                     className="text-xs h-8 text-green-400 border-green-800 bg-green-900/40 hover:bg-green-900/60" 
                     onClick={handleCloseTicket}
                     disabled={isClosingTicket}
                   >
                     {isClosingTicket ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                     {isClosingTicket ? 'Cerrando...' : 'Cerrar Ticket como Resuelto'}
                   </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-slate-900 border-t border-slate-700 flex-shrink-0 flex justify-center text-slate-500 text-sm items-center gap-2">
               <CheckCircle2 className="w-4 h-4 text-emerald-500" />
               Este ticket se encuentra cerrado.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaDropzone({ label, file, onChange }) {
  const inputId = `media-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="rounded-xl bg-slate-800 p-4 ring-1 ring-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{label}</p>
      <input
        id={inputId}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => document.getElementById(inputId)?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900 px-3 py-4 md:py-6 text-sm font-medium text-slate-400 transition hover:border-indigo-400 hover:text-indigo-400"
      >
        <ImageIcon className="h-5 w-5 shrink-0" />
        <span className="truncate flex-1 text-left">{file ? file.name : "Subir Imagen o Archivo"}</span>
      </button>
    </div>
  );
}
