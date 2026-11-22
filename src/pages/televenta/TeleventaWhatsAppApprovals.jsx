import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getShopAuthHeaders } from '@/lib/api';
import {
    ShieldCheck,
    ShieldAlert,
    Clock,
    CheckCircle2,
    XCircle,
    Search,
    RefreshCw,
    Phone,
    MessageSquare,
    Store,
    MapPin,
    Truck,
    ExternalLink,
    Calculator,
    AlertTriangle,
    UserCheck,
    Send,
    Unlink,
    Link2,
    Bot
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://cervezasfinas.com'
    : '';

const APPROVALS_API = `${API_BASE}/api/whatsapp/approvals_api.php`;
const PRICING_AUDIT_URL = `${API_BASE}/api/whatsapp/pricing_audit.php`;
const CHAT_SEND_API = `${API_BASE}/api/shop/televenta/chat/send.php`;

export default function TeleventaWhatsAppApprovals() {
    const { toast } = useToast();
    const navigate = useNavigate();

    // Data states
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    // 'PENDING' | 'APPROVED' | 'LINKED_CLIENTS' | 'UNLINKED' | 'REJECTED' | 'ALL'
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [searchTerm, setSearchTerm] = useState('');
    const [stats, setStats] = useState({
        pending_count: 0,
        approved_count: 0,
        rejected_count: 0,
        unlinked_count: 0,
        linked_clients_count: 0,
        total_count: 0
    });

    // Action modals state ('APPROVE' | 'REJECT' | 'UNLINK')
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [modalAction, setModalAction] = useState(null);
    const [actionNotes, setActionNotes] = useState('');
    const [notifyOldPhone, setNotifyOldPhone] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Direct Link / Change Phone Modal
    const [showDirectLinkModal, setShowDirectLinkModal] = useState(false);
    const [directClientCode, setDirectClientCode] = useState('');
    const [directPhoneNumber, setDirectPhoneNumber] = useState('');
    const [directNotes, setDirectNotes] = useState('Vinculación / Cambio de número autorizado por Televenta.');

    // Direct WhatsApp Chat Reply Modal
    const [chatTarget, setChatTarget] = useState(null);
    const [directChatMsg, setDirectChatMsg] = useState('');
    const [sendingChat, setSendingChat] = useState(false);

    // Auditor Modal
    const [showAuditorModal, setShowAuditorModal] = useState(false);
    const [auditorClientCode, setAuditorClientCode] = useState('');

    useEffect(() => {
        fetchRequests();
    }, [statusFilter]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const url = `${APPROVALS_API}?status=${encodeURIComponent(statusFilter)}`;
            const res = await fetch(url);
            const json = await res.json();

            if (json.success) {
                setRequests(json.data || []);
                setStats({
                    pending_count: json.pending_count || 0,
                    approved_count: json.approved_count || 0,
                    rejected_count: json.rejected_count || 0,
                    unlinked_count: json.unlinked_count || 0,
                    linked_clients_count: json.linked_clients_count || 0,
                    total_count: json.total_count || 0
                });
            } else {
                toast({
                    title: "Error al cargar registros",
                    description: json.error || "No se pudo obtener la información.",
                    variant: "destructive"
                });
            }
        } catch (err) {
            console.error("Error fetching approvals:", err);
            toast({
                title: "Error de conexión",
                description: "No se pudo conectar con el servidor de WhatsApp Approvals.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handleOpenActionModal = (request, action) => {
        setSelectedRequest(request);
        setModalAction(action);
        if (action === 'APPROVE') {
            setActionNotes('Confirmado con el encargado por Televenta.');
        } else if (action === 'REJECT') {
            setActionNotes('No corresponde al titular del negocio.');
        } else if (action === 'UNLINK') {
            setActionNotes('Número desvinculado por cambio o extravío de teléfono del cliente.');
            setNotifyOldPhone(true);
        }
    };

    const handleExecuteAction = async () => {
        if (!selectedRequest || !modalAction) return;
        setSubmitting(true);

        try {
            const payload = {
                id: selectedRequest.id || 0,
                client_code: selectedRequest.client_code || '',
                phone_number: selectedRequest.phone_number || selectedRequest.session_phone || selectedRequest.registered_phone || '',
                action: modalAction,
                reviewed_by: 'Televenta',
                notes: actionNotes,
                notify_client: notifyOldPhone
            };

            const res = await fetch(APPROVALS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const json = await res.json();

            if (json.success) {
                toast({
                    title:
                        modalAction === 'APPROVE'
                            ? "✅ Vinculación Aprobada"
                            : modalAction === 'UNLINK'
                            ? "🔓 Número Desvinculado"
                            : "❌ Solicitud Declinada",
                    description: json.message || "Operación aplicada correctamente.",
                    className:
                        modalAction === 'APPROVE'
                            ? "bg-emerald-700 text-white"
                            : modalAction === 'UNLINK'
                            ? "bg-amber-700 text-white"
                            : "bg-red-700 text-white"
                });
                setSelectedRequest(null);
                setModalAction(null);
                fetchRequests();
            } else {
                toast({
                    title: "Error al procesar",
                    description: json.error || "Ocurrió un problema en el servidor.",
                    variant: "destructive"
                });
            }
        } catch (err) {
            console.error("Error executing action:", err);
            toast({
                title: "Error de red",
                description: "No se pudo enviar la resolución.",
                variant: "destructive"
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDirectLinkSubmit = async (e) => {
        e.preventDefault();
        if (!directClientCode.trim() || !directPhoneNumber.trim()) return;
        setSubmitting(true);

        try {
            const res = await fetch(APPROVALS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'LINK_DIRECT',
                    client_code: directClientCode.trim(),
                    phone_number: directPhoneNumber.trim(),
                    reviewed_by: 'Televenta',
                    notes: directNotes
                })
            });
            const json = await res.json();
            if (json.success) {
                toast({
                    title: "🔗 Número Vinculado Oficialmente",
                    description: json.message,
                    className: "bg-emerald-700 text-white"
                });
                setShowDirectLinkModal(false);
                setDirectClientCode('');
                setDirectPhoneNumber('');
                fetchRequests();
            } else {
                toast({
                    title: "No se pudo vincular",
                    description: json.error || "Verifica el código de cliente y teléfono.",
                    variant: "destructive"
                });
            }
        } catch (err) {
            toast({
                title: "Error de conexión",
                description: "No se pudo comunicar con el servidor.",
                variant: "destructive"
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSendDirectChat = async (e) => {
        e.preventDefault();
        if (!chatTarget || !directChatMsg.trim()) return;
        setSendingChat(true);

        try {
            const targetPhone = String(chatTarget.phone_number || chatTarget.session_phone || chatTarget.registered_phone || '').replace(/\D/g, '');
            const clientCodeKey = chatTarget.client_code || (targetPhone ? `WA-${targetPhone}` : '');
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });

            const res = await fetch(CHAT_SEND_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    client_code: clientCodeKey,
                    message: directChatMsg.trim()
                })
            });
            const json = await res.json();
            if (json.success) {
                toast({
                    title: "💬 Mensaje enviado al WhatsApp del cliente",
                    description: json.whatsapp_sent
                        ? "Entregado directamente en la conversación oficial de WhatsApp y guardado en Soporte."
                        : "Guardado en el historial de Soporte.",
                    className: "bg-emerald-700 text-white"
                });
                setDirectChatMsg('');
                setChatTarget(null);
                fetchRequests();
            } else {
                toast({
                    title: "Error al enviar mensaje",
                    description: json.error || "No se pudo enviar el mensaje.",
                    variant: "destructive"
                });
            }
        } catch (err) {
            toast({
                title: "Error de red",
                description: "No se pudo enviar el mensaje.",
                variant: "destructive"
            });
        } finally {
            setSendingChat(false);
        }
    };

    // Filtered items based on search
    const filteredRequests = useMemo(() => {
        if (!searchTerm.trim()) return requests;
        const q = searchTerm.toLowerCase();
        return requests.filter(r =>
            (r.client_code && String(r.client_code).toLowerCase().includes(q)) ||
            (r.business_name && r.business_name.toLowerCase().includes(q)) ||
            (r.phone_number && String(r.phone_number).includes(q)) ||
            (r.session_phone && String(r.session_phone).includes(q)) ||
            (r.registered_phone && String(r.registered_phone).includes(q)) ||
            (r.sales_route && r.sales_route.toLowerCase().includes(q)) ||
            (r.contact_name && r.contact_name.toLowerCase().includes(q)) ||
            (r.client_contact && r.client_contact.toLowerCase().includes(q))
        );
    }, [requests, searchTerm]);

    const formatPhone = (phone) => {
        if (!phone) return 'Sin teléfono';
        const clean = String(phone).replace(/\D/g, '');
        if (clean.length === 10) {
            return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
        }
        if (clean.length > 10) {
            const last10 = clean.slice(-10);
            return `+${clean.slice(0, -10)} (${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
        }
        return phone;
    };

    const getWhatsAppLink = (phone) => {
        if (!phone) return '#';
        const clean = String(phone).replace(/\D/g, '');
        const fullPhone = clean.startsWith('52') ? clean : `52${clean}`;
        return `https://wa.me/${fullPhone}`;
    };

    return (
        <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto pb-24">
            <Helmet>
                <title>Validación y Vinculación de WhatsApp | Televenta Cervezas Finas</title>
            </Helmet>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-2xl border border-slate-700 shadow-xl text-white">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                            <ShieldCheck className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Control de Vinculación WhatsApp (B2B)</h1>
                            <p className="text-sm text-slate-300">
                                🛡️ Aprueba solicitudes nuevas, desvincula teléfonos extraviados o cambia el número oficial de cualquier cliente.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        size="sm"
                        onClick={() => navigate('/televenta/atencion-cliente')}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold gap-1.5 shadow-sm"
                    >
                        <UserCheck className="h-4 w-4" />
                        Centro de Ayuda 360°
                    </Button>

                    <Button
                        size="sm"
                        onClick={() => {
                            setDirectClientCode('');
                            setDirectPhoneNumber('');
                            setShowDirectLinkModal(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
                    >
                        <Link2 className="h-4 w-4" />
                        Vincular / Cambiar Número
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setAuditorClientCode('');
                            setShowAuditorModal(true);
                        }}
                        className="bg-slate-800/80 hover:bg-slate-700 text-amber-300 border-amber-500/30 gap-1.5"
                    >
                        <Calculator className="h-4 w-4 text-amber-400" />
                        Auditor de Precios
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchRequests}
                        disabled={loading}
                        className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-600 gap-1.5"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
                        Actualizar
                    </Button>

                    <a
                        href="/api/whatsapp/status.php"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/60"
                    >
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Estado Bot
                        <ExternalLink className="h-3 w-3 ml-0.5 opacity-70" />
                    </a>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card
                    className={`cursor-pointer transition-all border-2 ${statusFilter === 'PENDING' ? 'border-amber-500 bg-amber-50/5 dark:bg-amber-950/20 shadow-md' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
                    onClick={() => setStatusFilter('PENDING')}
                >
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pendientes de Validar</p>
                            <h3 className="text-3xl font-extrabold text-amber-500 mt-1">{stats.pending_count}</h3>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Solicitudes nuevas</p>
                        </div>
                        <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-xl">
                            <Clock className="h-6 w-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card
                    className={`cursor-pointer transition-all border-2 ${statusFilter === 'LINKED_CLIENTS' ? 'border-emerald-500 bg-emerald-50/5 dark:bg-emerald-950/20 shadow-md' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
                    onClick={() => setStatusFilter('LINKED_CLIENTS')}
                >
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Clientes con Teléfono</p>
                            <h3 className="text-3xl font-extrabold text-emerald-600 mt-1">{stats.linked_clients_count}</h3>
                            <p className="text-xs text-emerald-600/80 mt-0.5">Gestionar / Desvincular</p>
                        </div>
                        <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-xl">
                            <Unlink className="h-6 w-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card
                    className={`cursor-pointer transition-all border-2 ${statusFilter === 'APPROVED' ? 'border-blue-500 bg-blue-50/5 dark:bg-blue-950/20 shadow-md' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
                    onClick={() => setStatusFilter('APPROVED')}
                >
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Aprobadas por Bot</p>
                            <h3 className="text-3xl font-extrabold text-blue-500 mt-1">{stats.approved_count}</h3>
                            <p className="text-xs text-blue-500/80 mt-0.5">Verificaciones activas</p>
                        </div>
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl">
                            <CheckCircle2 className="h-6 w-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card
                    className={`cursor-pointer transition-all border-2 ${statusFilter === 'ALL' ? 'border-indigo-500 bg-indigo-50/5 dark:bg-indigo-950/20 shadow-md' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
                    onClick={() => setStatusFilter('ALL')}
                >
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Historial Solicitudes</p>
                            <h3 className="text-3xl font-extrabold text-indigo-600 mt-1">{stats.total_count}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Todas las bitácoras</p>
                        </div>
                        <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl">
                            <ShieldAlert className="h-6 w-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Controls & Search */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0">
                    <Button
                        size="sm"
                        variant={statusFilter === 'PENDING' ? 'default' : 'ghost'}
                        onClick={() => setStatusFilter('PENDING')}
                        className={`text-xs ${statusFilter === 'PENDING' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}
                    >
                        ⏳ Pendientes ({stats.pending_count})
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === 'LINKED_CLIENTS' ? 'default' : 'ghost'}
                        onClick={() => setStatusFilter('LINKED_CLIENTS')}
                        className={`text-xs ${statusFilter === 'LINKED_CLIENTS' ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold' : ''}`}
                    >
                        🔗 Clientes Vinculados / Desvincular ({stats.linked_clients_count})
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === 'APPROVED' ? 'default' : 'ghost'}
                        onClick={() => setStatusFilter('APPROVED')}
                        className={`text-xs ${statusFilter === 'APPROVED' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                    >
                        ✅ Aprobadas ({stats.approved_count})
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === 'UNLINKED' ? 'default' : 'ghost'}
                        onClick={() => setStatusFilter('UNLINKED')}
                        className={`text-xs ${statusFilter === 'UNLINKED' ? 'bg-orange-600 hover:bg-orange-700 text-white' : ''}`}
                    >
                        🔓 Desvinculadas ({stats.unlinked_count})
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === 'REJECTED' ? 'default' : 'ghost'}
                        onClick={() => setStatusFilter('REJECTED')}
                        className={`text-xs ${statusFilter === 'REJECTED' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                    >
                        ❌ Rechazadas ({stats.rejected_count})
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === 'ALL' ? 'default' : 'ghost'}
                        onClick={() => setStatusFilter('ALL')}
                        className={`text-xs ${statusFilter === 'ALL' ? 'bg-slate-800 text-white' : ''}`}
                    >
                        Todas ({stats.total_count})
                    </Button>
                </div>

                <div className="relative w-full lg:w-80">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Buscar código, negocio, teléfono, ruta..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 text-sm h-9 bg-slate-50 dark:bg-slate-800"
                    />
                </div>
            </div>

            {/* List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">Cargando información de vinculaciones...</p>
                    </div>
                ) : filteredRequests.length === 0 ? (
                    <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <ShieldCheck className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                            {statusFilter === 'PENDING' ? "¡Todo al día! No hay solicitudes pendientes." : "No se encontraron registros."}
                        </h3>
                        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                            {statusFilter === 'PENDING'
                                ? "Cuando un cliente nuevo solicite vincular su número por WhatsApp, aparecerá aquí para que lo apruebes."
                                : "Prueba cambiando el filtro o el término de búsqueda."}
                        </p>
                    </div>
                ) : (
                    filteredRequests.map((req, index) => {
                        const isLinkedClientView = statusFilter === 'LINKED_CLIENTS';
                        const isPending = req.status === 'PENDING';
                        const isApproved = req.status === 'APPROVED' || isLinkedClientView;
                        const isRejected = req.status === 'REJECTED';
                        const isUnlinked = req.status === 'UNLINKED';
                        const activePhone = req.phone_number || req.session_phone || req.registered_phone || '';

                        return (
                            <div
                                key={req.id ? `ver-${req.id}` : `cli-${req.client_code}-${index}`}
                                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                    {/* Client & Request Info */}
                                    <div className="space-y-2 flex-1">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                                                CÓDIGO: {req.client_code}
                                            </span>

                                            {isPending && (
                                                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 gap-1 animate-pulse">
                                                    <Clock className="h-3 w-3" /> Pendiente de Aprobación
                                                </Badge>
                                            )}
                                            {isApproved && (
                                                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 gap-1">
                                                    <CheckCircle2 className="h-3 w-3" /> Teléfono Vinculado
                                                </Badge>
                                            )}
                                            {isUnlinked && (
                                                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-300 dark:border-orange-700 gap-1">
                                                    <Unlink className="h-3 w-3" /> Desvinculado
                                                </Badge>
                                            )}
                                            {isRejected && (
                                                <Badge className="bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-300 dark:border-red-700 gap-1">
                                                    <XCircle className="h-3 w-3" /> Declinado
                                                </Badge>
                                            )}

                                            {req.bot_stage === 'HUMAN' && (
                                                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-700 gap-1">
                                                    🙋‍♂️ En Atención Humana (Soporte)
                                                </Badge>
                                            )}

                                            {req.gec && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                                                    GEC: {req.gec}
                                                </span>
                                            )}

                                            {(req.created_at || req.last_interaction) && (
                                                <span className="text-xs text-slate-400 ml-auto">
                                                    {new Date(req.created_at || req.last_interaction).toLocaleString('es-MX', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            )}
                                        </div>

                                        {/* Business name */}
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                                <Store className="h-4 w-4 text-slate-400 inline" />
                                                {req.business_name || 'Negocio sin nombre'}
                                            </h3>
                                        </div>

                                        {/* Phones comparison */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                            <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                                                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                                    <MessageSquare className="h-3.5 w-3.5" />
                                                    {isLinkedClientView ? 'WhatsApp Activo en Bot' : 'WhatsApp Solicitante'}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-slate-900 dark:text-emerald-200 text-base font-mono">
                                                        {formatPhone(activePhone)}
                                                    </span>
                                                    {activePhone && (
                                                        <div className="flex items-center gap-1">
                                                            <a
                                                                href={getWhatsAppLink(activePhone)}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded transition"
                                                                title="Abrir en WhatsApp Web"
                                                            >
                                                                <ExternalLink className="h-4 w-4" />
                                                            </a>
                                                            <a
                                                                href={`tel:${activePhone}`}
                                                                className="p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded transition"
                                                                title="Llamar directamente"
                                                            >
                                                                <Phone className="h-4 w-4" />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                                                    Teléfono Registrado en Ficha Cliente
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-slate-700 dark:text-slate-300 text-sm font-mono">
                                                        {formatPhone(req.registered_phone || req.current_client_phone)}
                                                    </span>
                                                    {(req.registered_phone || req.current_client_phone) && (
                                                        <a
                                                            href={`tel:${req.registered_phone || req.current_client_phone}`}
                                                            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                                                        >
                                                            Llamar a titular
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Metadata */}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1">
                                            {req.sales_route && (
                                                <span className="flex items-center gap-1">
                                                    <Truck className="h-3.5 w-3.5 text-slate-400" />
                                                    Ruta: <strong className="text-slate-700 dark:text-slate-200">{req.sales_route}</strong>
                                                </span>
                                            )}
                                            {req.zona_comercial && (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                                    Zona: {req.zona_comercial}
                                                </span>
                                            )}
                                            {(req.contact_name || req.client_contact) && (
                                                <span className="flex items-center gap-1">
                                                    <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                                                    Contacto: {req.contact_name || req.client_contact}
                                                </span>
                                            )}
                                            {req.address && (
                                                <span className="truncate max-w-xs text-slate-400" title={req.address}>
                                                    📍 {req.address}
                                                </span>
                                            )}
                                        </div>

                                        {/* Original requested message */}
                                        {req.requested_message && (
                                            <div className="text-xs bg-slate-100 dark:bg-slate-800/80 p-2 rounded text-slate-600 dark:text-slate-300 italic">
                                                "{req.requested_message}"
                                            </div>
                                        )}

                                        {/* Notes if reviewed */}
                                        {req.notes && (
                                            <div className="text-xs text-indigo-700 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 p-2 rounded border border-indigo-200/50 dark:border-indigo-800/50">
                                                <strong>Resolución ({req.reviewed_by || 'Televenta'}):</strong> {req.notes}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-row lg:flex-col items-center justify-end gap-2 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 flex-wrap">
                                        {req.client_code && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => navigate(`/televenta/atencion-cliente?client=${encodeURIComponent(req.client_code)}`)}
                                                className="text-xs border-indigo-500/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 h-8 gap-1.5"
                                                title="Ver expediente 360° completo, cambiar contraseña, pedidos y chat"
                                            >
                                                <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                                                Expediente 360°
                                            </Button>
                                        )}

                                        {activePhone && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setChatTarget(req);
                                                    setDirectChatMsg('');
                                                }}
                                                className="text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 h-8 gap-1.5"
                                                title="Responder directamente en el mismo chat oficial de WhatsApp"
                                            >
                                                <Send className="h-3.5 w-3.5 text-emerald-500" />
                                                Responder en este Chat
                                            </Button>
                                        )}

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setAuditorClientCode(req.client_code);
                                                setShowAuditorModal(true);
                                            }}
                                            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 h-8 gap-1"
                                            title="Verificar precios de su zona y promociones asignadas"
                                        >
                                            <Calculator className="h-3.5 w-3.5 text-amber-500" />
                                            Auditar Precios
                                        </Button>

                                        {isPending && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleOpenActionModal(req, 'APPROVE')}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-1.5 shadow-sm"
                                                >
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    Aprobar
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenActionModal(req, 'REJECT')}
                                                    className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/50 text-xs h-9 px-3 gap-1"
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                    Rechazar
                                                </Button>
                                            </>
                                        )}

                                        {isApproved && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setDirectClientCode(req.client_code || '');
                                                        setDirectPhoneNumber('');
                                                        setDirectNotes('Cambio de número telefónico solicitado por el cliente.');
                                                        setShowDirectLinkModal(true);
                                                    }}
                                                    className="border-indigo-300 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs h-8 px-3 gap-1"
                                                >
                                                    <Link2 className="h-3.5 w-3.5" />
                                                    Cambiar Número
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenActionModal(req, 'UNLINK')}
                                                    className="border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-800 dark:hover:bg-orange-950/50 text-xs h-8 px-3 gap-1"
                                                >
                                                    <Unlink className="h-3.5 w-3.5" />
                                                    Desvincular Número
                                                </Button>
                                            </>
                                        )}

                                        {(isRejected || isUnlinked) && !isLinkedClientView && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleOpenActionModal(req, 'APPROVE')}
                                                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs h-8 px-3 gap-1"
                                            >
                                                Volver a Vincular
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Approval / Rejection / Unlink Confirmation Dialog */}
            <Dialog open={!!modalAction} onOpenChange={() => !submitting && setModalAction(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {modalAction === 'APPROVE' ? (
                                <>
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                    <span>Aprobar Vinculación de WhatsApp</span>
                                </>
                            ) : modalAction === 'UNLINK' ? (
                                <>
                                    <Unlink className="h-5 w-5 text-orange-500" />
                                    <span>Desvincular Número de Teléfono</span>
                                </>
                            ) : (
                                <>
                                    <AlertTriangle className="h-5 w-5 text-red-600" />
                                    <span>Rechazar Solicitud de WhatsApp</span>
                                </>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {modalAction === 'APPROVE'
                                ? "Al aprobar, este número quedará registrado como el canal oficial para realizar pedidos por WhatsApp y se le notificará automáticamente."
                                : modalAction === 'UNLINK'
                                ? "Al desvincular, se borrará el teléfono actual de la cuenta del cliente y su sesión en el Bot quedará libre para que pueda registrar un número nuevo."
                                : "Al rechazar, se bloqueará la vinculación y se enviará un mensaje indicando que puede hablar con un asesor."}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="space-y-3 py-2 text-sm">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-1">
                                <div className="font-bold text-slate-900 dark:text-white">
                                    {selectedRequest.business_name}
                                </div>
                                <div className="text-xs text-slate-500">
                                    Código: <span className="font-mono font-semibold">{selectedRequest.client_code}</span> • Ruta: <span className="font-semibold">{selectedRequest.sales_route || 'General'}</span>
                                </div>
                                <div className="text-xs font-mono text-emerald-600 font-semibold pt-1">
                                    Teléfono: {formatPhone(selectedRequest.phone_number || selectedRequest.session_phone || selectedRequest.registered_phone)}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                    Motivo / Notas de Televenta:
                                </label>
                                <Input
                                    value={actionNotes}
                                    onChange={(e) => setActionNotes(e.target.value)}
                                    placeholder="Ej. Extravió su celular / Confirmado con el titular"
                                    className="text-sm"
                                />
                            </div>

                            {modalAction === 'UNLINK' && (
                                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer pt-1">
                                    <input
                                        type="checkbox"
                                        checked={notifyOldPhone}
                                        onChange={(e) => setNotifyOldPhone(e.target.checked)}
                                        className="rounded border-slate-300"
                                    />
                                    Enviar aviso de desvinculación al número anterior por seguridad
                                </label>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setModalAction(null)}
                            disabled={submitting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleExecuteAction}
                            disabled={submitting}
                            className={
                                modalAction === 'APPROVE'
                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                    : modalAction === 'UNLINK'
                                    ? "bg-orange-600 hover:bg-orange-700 text-white"
                                    : "bg-red-600 hover:bg-red-700 text-white"
                            }
                        >
                            {submitting ? (
                                <>
                                    <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                                    Procesando...
                                </>
                            ) : modalAction === 'APPROVE' ? (
                                "Confirmar y Aprobar"
                            ) : modalAction === 'UNLINK' ? (
                                "Confirmar Desvinculación"
                            ) : (
                                "Confirmar Rechazo"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Direct Link / Replace Phone Modal */}
            <Dialog open={showDirectLinkModal} onOpenChange={(open) => !submitting && setShowDirectLinkModal(open)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5 text-emerald-600" />
                            <span>Vincular o Cambiar Número de Cliente</span>
                        </DialogTitle>
                        <DialogDescription>
                            Asigna directamente el número de WhatsApp (10 dígitos) a un código de cliente. Si tenía un número anterior, será reemplazado automáticamente.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleDirectLinkSubmit} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Código de Cliente:
                            </label>
                            <Input
                                value={directClientCode}
                                onChange={(e) => setDirectClientCode(e.target.value)}
                                placeholder="Ej. 38223"
                                required
                                className="font-mono"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Nuevo Número de WhatsApp (10 dígitos):
                            </label>
                            <Input
                                value={directPhoneNumber}
                                onChange={(e) => setDirectPhoneNumber(e.target.value)}
                                placeholder="Ej. 2451063554"
                                required
                                className="font-mono"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Notas (Opcional):
                            </label>
                            <Input
                                value={directNotes}
                                onChange={(e) => setDirectNotes(e.target.value)}
                                placeholder="Ej. Cambio de teléfono autorizado por Televenta"
                            />
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowDirectLinkModal(false)}
                                disabled={submitting}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitting || !directClientCode.trim() || !directPhoneNumber.trim()}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                {submitting ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                                        Vinculando...
                                    </>
                                ) : (
                                    "Vincular y Notificar por WhatsApp"
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Direct WhatsApp Reply Modal (Same Chat) */}
            <Dialog open={!!chatTarget} onOpenChange={(open) => !sendingChat && !open && setChatTarget(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-emerald-500" />
                            <span>Responder en el Mismo Chat de WhatsApp</span>
                        </DialogTitle>
                        <DialogDescription>
                            Tu mensaje se enviará directamente desde el número oficial del Bot a la conversación de WhatsApp del cliente y activará el modo de atención humana en Soporte.
                        </DialogDescription>
                    </DialogHeader>

                    {chatTarget && (
                        <form onSubmit={handleSendDirectChat} className="space-y-3 py-1">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs space-y-1">
                                <div className="font-bold text-slate-900 dark:text-white text-sm">
                                    {chatTarget.business_name || `Cliente ${chatTarget.client_code}`}
                                </div>
                                <div className="text-emerald-600 font-mono font-semibold">
                                    WhatsApp: {formatPhone(chatTarget.phone_number || chatTarget.session_phone || chatTarget.registered_phone)}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Mensaje para el cliente:
                                </label>
                                <textarea
                                    rows={4}
                                    value={directChatMsg}
                                    onChange={(e) => setDirectChatMsg(e.target.value)}
                                    placeholder="Hola, te atiende tu ejecutivo de Televenta de Cervezas Finas. ¿En qué te puedo apoyar hoy?"
                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    required
                                />
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        const code = chatTarget.client_code || '';
                                        setChatTarget(null);
                                        navigate(`/televenta/shop-orders${code ? `?chat=${encodeURIComponent(code)}` : ''}`);
                                    }}
                                    className="text-xs text-indigo-600 hover:underline px-1"
                                >
                                    Abrir Bandeja Completa de Soporte →
                                </Button>

                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setChatTarget(null)}
                                        disabled={sendingChat}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={sendingChat || !directChatMsg.trim()}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                                    >
                                        <Send className="h-4 w-4" />
                                        {sendingChat ? "Enviando..." : "Enviar al WhatsApp"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* Pricing Auditor Modal */}
            <Dialog open={showAuditorModal} onOpenChange={setShowAuditorModal}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
                    <DialogHeader className="p-4 bg-slate-900 text-white border-b border-slate-800">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Calculator className="h-5 w-5 text-amber-400" />
                            Auditor del Motor de Precios
                        </DialogTitle>
                        <DialogDescription className="text-slate-300 text-xs">
                            Verifica en tiempo real el precio base, reglas de descuento GEC, precios especiales y promociones para cualquier cliente.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-4 bg-slate-950 min-h-[500px]">
                        <iframe
                            src={`${PRICING_AUDIT_URL}${auditorClientCode ? `?client=${encodeURIComponent(auditorClientCode)}` : ''}`}
                            className="w-full h-[600px] border-0 rounded-lg bg-slate-900"
                            title="Auditor de Precios"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
