import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/supabaseClient';
import { API_URL, getShopAuthHeaders } from '@/lib/api';
import { awardPreventaPoints, deliverPreventa } from '@/lib/preventaPoints';
import ReceiptModal from '@/components/ReceiptModal';
import {
    Search, User, Store, Phone, MapPin, Truck, KeyRound, ShieldCheck,
    MessageSquare, Send, RefreshCw, Unlink, Link2, CheckCircle2, Clock,
    Package, FileDown, Edit3, Plus, Trash2, Bot, Sparkles, Copy,
    ExternalLink, Award, AlertCircle, PauseCircle, PlayCircle, Headphones,
    Calendar, Eye, X
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://cervezasfinas.com'
    : '';

const CLIENT_360_API = `${API_URL}/televenta/client-360.php`;
const CHAT_SEND_API = `${API_URL}/televenta/chat/send.php`;
const APPROVALS_API = `${API_BASE}/api/whatsapp/approvals_api.php`;

const WEEKDAYS_LIST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function computeDeliveryDaysFromVisit(visitDaysStr) {
    if (!visitDaysStr) return '';
    const mapNext = {
        lunes: 'Martes',
        martes: 'Miércoles',
        miercoles: 'Jueves',
        miércoles: 'Jueves',
        jueves: 'Viernes',
        viernes: 'Sábado',
        sabado: 'Lunes',
        sábado: 'Lunes',
        domingo: 'Lunes',
        lun: 'Martes',
        mar: 'Miércoles',
        mie: 'Jueves',
        mié: 'Jueves',
        jue: 'Viernes',
        vie: 'Sábado',
        sab: 'Lunes',
        sáb: 'Lunes',
        dom: 'Lunes'
    };
    const clean = String(visitDaysStr).replace(/[\[\]"']/g, '');
    const tokens = clean.toLowerCase().split(/[,;\/|\s]+/).map(t => t.trim()).filter(Boolean);
    const out = [];
    tokens.forEach(t => {
        if (mapNext[t] && !out.includes(mapNext[t])) {
            out.push(mapNext[t]);
        }
    });
    return out.join(', ');
}

export default function TeleventaClientHelpCenter() {
    const { toast } = useToast();
    const location = useLocation();
    const navigate = useNavigate();

    // Search & Queue State
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [clientsList, setClientsList] = useState([]);
    const [advisorQueue, setAdvisorQueue] = useState([]);
    const [waUsage, setWaUsage] = useState({
        outbound_today: 0,
        inbound_today: 0,
        outbound_month: 0,
        pause_outbound: false,
        only_24h_free_window: true,
        daily_per_phone_limit: 40,
        daily_global_limit: 500,
        televenta_schedule_days: 'Lunes a Sábado',
        televenta_hours_start: '08:00',
        televenta_hours_end: '18:00',
        bot_training_rules: ''
    });
    const [savingWaSettings, setSavingWaSettings] = useState(false);

    // Modal para editar Horario de Atención de Televenta y Entrenamiento Bot
    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [editScheduleDays, setEditScheduleDays] = useState('Lunes a Sábado');
    const [editHoursStart, setEditHoursStart] = useState('08:00');
    const [editHoursEnd, setEditHoursEnd] = useState('18:00');
    const [editBotRules, setEditBotRules] = useState('');

    // Selected Client 360 State
    const [selectedCode, setSelectedCode] = useState('');
    const [loadingDossier, setLoadingDossier] = useState(false);
    const [dossier, setDossier] = useState(null);
    const [preventaOrders, setPreventaOrders] = useState([]);
    const [ordersTab, setOrdersTab] = useState('pending'); // 'pending' | 'delivered_real'

    // Editable Client Fields
    const [editBusinessName, setEditBusinessName] = useState('');
    const [editContact, setEditContact] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editVisitDays, setEditVisitDays] = useState('');
    const [editDeliveryDays, setEditDeliveryDays] = useState('');
    const [savingClientInfo, setSavingClientInfo] = useState(false);

    // Password Change State
    const [newPassword, setNewPassword] = useState('');
    const [lastSavedPassword, setLastSavedPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);

    // Phone Link / Unlink State
    const [phoneInput, setPhoneInput] = useState('');
    const [notifyOnLink, setNotifyOnLink] = useState(true);
    const [savingPhone, setSavingPhone] = useState(false);

    // Live Chat State
    const [chatTab, setChatTab] = useState('support'); // 'support' | 'bot_logs'
    const [replyMessage, setReplyMessage] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [closingRequestCode, setClosingRequestCode] = useState('');
    const chatBottomRef = useRef(null);

    // Order Modification & Ticket State
    const [availableProducts, setAvailableProducts] = useState([]);
    const [editingOrder, setEditingOrder] = useState(null);
    const [editOrderItems, setEditOrderItems] = useState([]);
    const [editDeliveryDate, setEditDeliveryDate] = useState('');
    const [selectedProductSku, setSelectedProductSku] = useState('');
    const [savingOrder, setSavingOrder] = useState(false);
    const [receiptSale, setReceiptSale] = useState(null);
    const [receiptClient, setReceiptClient] = useState(null);

    // Read initial client from query param (?client=...) or state
    useEffect(() => {
        const params = new URLSearchParams(location.search || '');
        const clientParam = params.get('client') || params.get('chat') || location.state?.clientCode || location.state?.openChat || '';
        if (clientParam) {
            setSelectedCode(String(clientParam).trim());
        }
        loadDashboardAndSearch('');
        loadAvailableProducts();
    }, [location.search]);

    // Load 360 Dossier whenever selectedCode changes
    useEffect(() => {
        if (selectedCode) {
            loadClientDossier(selectedCode);
        }
    }, [selectedCode]);

    // Auto-refresh active chat & advisor queue every 6 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadDashboardAndSearch(searchQuery, true);
            if (selectedCode) {
                loadClientDossier(selectedCode, true);
            }
        }, 6000);
        return () => clearInterval(interval);
    }, [selectedCode, searchQuery]);

    async function loadAvailableProducts() {
        try {
            const res = await fetch(`${API_URL}/products/list.php`, { headers: await getShopAuthHeaders() });
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                setAvailableProducts(data.data);
            }
        } catch (e) {
            console.warn('Error loading products:', e);
        }
    }

    async function loadDashboardAndSearch(query = searchQuery, silent = false) {
        if (!silent) setSearching(true);
        try {
            const headers = await getShopAuthHeaders();
            const url = `${CLIENT_360_API}?q=${encodeURIComponent(query || '')}`;
            const res = await fetch(url, { headers });
            const data = await res.json();
            if (data.success) {
                setClientsList(data.clients || []);
                setAdvisorQueue(data.advisor_queue || []);
                if (data.whatsapp_usage) {
                    setWaUsage(data.whatsapp_usage);
                }
                if (!selectedCode && !silent) {
                    if (data.advisor_queue?.length > 0) {
                        setSelectedCode(data.advisor_queue[0].client_code);
                    } else if (data.clients?.length > 0) {
                        setSelectedCode(data.clients[0].client_code);
                    }
                }
            }
        } catch (err) {
            console.error('Error loading 360 search:', err);
        } finally {
            if (!silent) setSearching(false);
        }
    }

    async function loadClientDossier(code, silent = false) {
        if (!code) return;
        if (!silent) setLoadingDossier(true);
        try {
            const headers = await getShopAuthHeaders();
            const res = await fetch(`${CLIENT_360_API}?client_code=${encodeURIComponent(code)}`, { headers });
            const data = await res.json();
            if (data.success) {
                setDossier(data);
                if (data.whatsapp_usage) setWaUsage(data.whatsapp_usage);

                if (!silent) {
                    const c = data.client || {};
                    setEditBusinessName(c.business_name || '');
                    setEditContact(c.contact || '');
                    setEditAddress(c.address || '');
                    const vDays = Array.isArray(c.visit_days) ? c.visit_days.join(', ') : (c.visit_days || '');
                    setEditVisitDays(vDays);
                    setEditDeliveryDays(c.delivery_days || computeDeliveryDaysFromVisit(vDays));
                    const activePh = data.whatsapp?.active_phone || c.phone || '';
                    setPhoneInput(String(activePh).replace(/\D/g, '').slice(-10));
                    setNewPassword(`CF${c.client_code || code}`);
                    setLastSavedPassword('');
                    loadClientPreventasFromSupabase(c.client_code || code, c.business_name, activePh, Boolean(data.shop_account?.is_active));
                }
            }
        } catch (err) {
            console.error('Error loading client dossier:', err);
        } finally {
            if (!silent) setLoadingDossier(false);
        }
    }

    async function loadClientPreventasFromSupabase(clientCode, clientName, clientPhone, isShopActive) {
        if (!clientCode || String(clientCode).startsWith('WA-')) {
            setPreventaOrders([]);
            return;
        }
        try {
            const { getClientByCode } = await import('@/repositories/clientsRepository');
            const cl = await getClientByCode(clientCode);
            if (!cl?.id) {
                setPreventaOrders([]);
                return;
            }

            const { data: prevs } = await supabase
                .from('preventa')
                .select('id, client_id, user_id, total_amount, status, created_at')
                .eq('client_id', cl.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!Array.isArray(prevs) || prevs.length === 0) {
                setPreventaOrders([]);
                return;
            }

            const prevIds = prevs.map(p => p.id);
            const [{ data: items }, ovResp] = await Promise.all([
                supabase.from('preventa_items').select('*').in('preventa_id', prevIds),
                fetch(`${API_URL}/televenta/preventa-overrides.php`, { headers: await getShopAuthHeaders() })
                    .then(r => r.json())
                    .catch(() => ({}))
            ]);

            const overrides = ovResp?.data || {};
            const itemsMap = {};
            (items || []).forEach(it => {
                if (!itemsMap[it.preventa_id]) itemsMap[it.preventa_id] = [];
                itemsMap[it.preventa_id].push({
                    sku: it.cve_marca,
                    product_name: it.des_marca || it.cve_marca,
                    quantity: Number(it.quantity) || 0,
                    unit_price: Number(it.unit_price) || 0,
                    subtotal: Number(it.total_price) || ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))
                });
            });

            const mapped = prevs
                .map(p => {
                    const ov = overrides[p.id] || null;
                    const rawSt = String(ov?.status || p.status || 'pending').toLowerCase();
                    const status = ['entregado', 'delivered'].includes(rawSt)
                        ? 'delivered'
                        : ['confirmado', 'confirmed', 'cargado', 'en_ruta'].includes(rawSt)
                        ? 'confirmed'
                        : ['rechazado', 'cancelled'].includes(rawSt)
                        ? 'cancelled'
                        : 'pending';

                    return {
                        id: p.id,
                        order_number: `PREV-${String(p.id).slice(0, 8).toUpperCase()}`,
                        client_code: clientCode,
                        client_name: clientName || `Cliente ${clientCode}`,
                        phone: clientPhone || '',
                        total_amount: ov?.total_amount != null ? Number(ov.total_amount) : Number(p.total_amount || 0),
                        status,
                        created_at: p.created_at,
                        delivery_date: ov?.delivery_date || null,
                        notes: ov?.notes || (ov ? 'Preventa modificada por Televenta' : 'Pedido levantado por Televenta en llamada'),
                        items: Array.isArray(ov?.items) && ov.items.length > 0 ? ov.items : (itemsMap[p.id] || []),
                        source: 'preventa',
                        is_shop_registered: isShopActive
                    };
                })
                // SOLAMENTE mantener los pedidos pendientes de entrega o solicitados (nunca entregados ni cancelados de preventa)
                .filter(p => p.status === 'pending' || p.status === 'confirmed');

            setPreventaOrders(mapped);

            // Sincronizar con shop_preventa_overrides para que aparezcan en https://cervezasfinas.com.mx/orders
            getShopAuthHeaders({ 'Content-Type': 'application/json' })
                .then(syncHeaders => {
                    mapped.forEach(p => {
                        const ov = overrides[p.id];
                        if (!ov || !ov.client_code) {
                            fetch(`${API_URL}/televenta/update-preventa.php`, {
                                method: 'POST',
                                headers: syncHeaders,
                                body: JSON.stringify({
                                    preventa_id: p.id,
                                    client_code: clientCode,
                                    status: p.status,
                                    delivery_date: p.delivery_date,
                                    notes: p.notes,
                                    created_at: p.created_at,
                                    items: (p.items || []).map(it => ({
                                        sku: it.sku,
                                        name: it.product_name || it.name || it.sku,
                                        quantity: Number(it.quantity) || 1,
                                        unit_price: Number(it.unit_price) || 0
                                    }))
                                })
                            }).catch(() => {});
                        }
                    });
                })
                .catch(() => {});
        } catch (e) {
            console.warn('Error loading preventas for client 360:', e);
            setPreventaOrders([]);
        }
    }

    // 1) SOLAMENTE Pedidos Solicitados / Pendientes de Entrega (status pending o confirmed)
    const pendingClientOrders = useMemo(() => {
        const byOrderNumber = new Map();
        (dossier?.orders || []).forEach(o => {
            const st = String(o.status || 'pending').toLowerCase();
            if (st !== 'pending' && st !== 'confirmed') return;
            const key = o.order_number || `${o.source || 'shop'}-${o.id}`;
            byOrderNumber.set(key, {
                ...o,
                source: o.source || 'shop',
                is_shop_registered: Boolean(dossier?.shop_account?.is_active)
            });
        });
        (preventaOrders || []).forEach(p => {
            if (p.status !== 'pending' && p.status !== 'confirmed') return;
            const key = p.order_number || `preventa-${p.id}`;
            if (!byOrderNumber.has(key)) {
                byOrderNumber.set(key, p);
            }
        });
        const combined = Array.from(byOrderNumber.values());
        combined.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return combined;
    }, [dossier?.orders, dossier?.shop_account?.is_active, preventaOrders]);

    // 2) SOLAMENTE Pedidos Reales Entregados que existen en ventas_por_sku
    const deliveredSalesList = useMemo(() => {
        return Array.isArray(dossier?.delivered_sales) ? dossier.delivered_sales : [];
    }, [dossier?.delivered_sales]);

    async function handleToggleWaSetting(field, value) {
        setSavingWaSettings(true);
        try {
            const res = await fetch(APPROVALS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'SET_WHATSAPP_LIMITS',
                    [field]: value
                })
            });
            const data = await res.json();
            if (data.success) {
                setWaUsage(prev => ({ ...prev, [field]: value }));
                toast({
                    title: '⚙️ Control de WhatsApp actualizado',
                    description: data.message,
                    className: 'bg-emerald-700 text-white'
                });
            }
        } catch (err) {
            toast({ title: 'Error al guardar configuración', variant: 'destructive' });
        } finally {
            setSavingWaSettings(false);
        }
    }

    function openScheduleModal() {
        setEditScheduleDays(waUsage.televenta_schedule_days || 'Lunes a Sábado');
        setEditHoursStart(waUsage.televenta_hours_start || '08:00');
        setEditHoursEnd(waUsage.televenta_hours_end || '18:00');
        setEditBotRules(waUsage.bot_training_rules || '');
        setScheduleModalOpen(true);
    }

    async function handleSaveTeleventaSchedule(e) {
        if (e) e.preventDefault();
        setSavingWaSettings(true);
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CLIENT_360_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'SET_WHATSAPP_LIMITS',
                    televenta_schedule_days: editScheduleDays.trim() || 'Lunes a Sábado',
                    televenta_hours_start: editHoursStart || '08:00',
                    televenta_hours_end: editHoursEnd || '18:00',
                    bot_training_rules: editBotRules
                })
            });
            const data = await res.json();
            if (data.success) {
                if (data.whatsapp_usage) {
                    setWaUsage(data.whatsapp_usage);
                } else {
                    setWaUsage(prev => ({
                        ...prev,
                        televenta_schedule_days: editScheduleDays.trim() || 'Lunes a Sábado',
                        televenta_hours_start: editHoursStart || '08:00',
                        televenta_hours_end: editHoursEnd || '18:00',
                        bot_training_rules: editBotRules
                    }));
                }
                setScheduleModalOpen(false);
                toast({
                    title: '🕒 Horario de Atención de Televenta Actualizado',
                    description: `${editScheduleDays} de ${editHoursStart} a ${editHoursEnd} hrs.`,
                    className: 'bg-emerald-700 text-white'
                });
            } else {
                toast({ title: 'Error', description: data.error, variant: 'destructive' });
            }
        } catch (err) {
            toast({ title: 'Error al guardar horario', variant: 'destructive' });
        } finally {
            setSavingWaSettings(false);
        }
    }

    function toggleVisitWeekday(dayName) {
        const clean = String(editVisitDays || '').replace(/[\[\]"']/g, '');
        const current = clean
            .split(/[,;\/]+/)
            .map(d => d.trim())
            .filter(Boolean);
        const exists = current.some(d => d.toLowerCase() === dayName.toLowerCase());
        const nextList = exists
            ? current.filter(d => d.toLowerCase() !== dayName.toLowerCase())
            : [...current, dayName];
        const nextStr = nextList.join(', ');
        setEditVisitDays(nextStr);
        setEditDeliveryDays(computeDeliveryDaysFromVisit(nextStr));
    }

    async function handleSaveClientInfo(e) {
        e.preventDefault();
        if (!selectedCode) return;
        setSavingClientInfo(true);
        try {
            const computedReparto = editDeliveryDays.trim() || computeDeliveryDaysFromVisit(editVisitDays);
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CLIENT_360_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'UPDATE_CLIENT',
                    client_code: selectedCode,
                    business_name: editBusinessName,
                    contact: editContact,
                    address: editAddress,
                    visit_days: editVisitDays,
                    delivery_days: computedReparto
                })
            });
            const data = await res.json();
            if (data.success) {
                // También sincronizar visit_days en Supabase clients para que el panel de llamadas Televenta refleje el cambio
                try {
                    const visitArray = String(editVisitDays || '')
                        .split(/[,;\/]+/)
                        .map(d => d.trim())
                        .filter(Boolean);
                    await supabase
                        .from('clients')
                        .update({
                            business_name: editBusinessName || undefined,
                            contact: editContact || undefined,
                            address: editAddress || undefined,
                            visit_days: visitArray
                        })
                        .eq('client_code', String(selectedCode));
                } catch (supaErr) {
                    console.warn('No se pudo sincronizar visit_days en Supabase:', supaErr);
                }

                toast({
                    title: '✅ Datos y Días de Visita / Reparto actualizados',
                    description: data.message,
                    className: 'bg-emerald-700 text-white'
                });
                loadClientDossier(selectedCode);
                loadDashboardAndSearch(searchQuery, true);
            } else {
                toast({ title: 'Error', description: data.error, variant: 'destructive' });
            }
        } catch (e) {
            toast({ title: 'Error de conexión', variant: 'destructive' });
        } finally {
            setSavingClientInfo(false);
        }
    }

    async function handleChangePassword(e) {
        e.preventDefault();
        if (!selectedCode || !newPassword.trim()) return;
        setSavingPassword(true);
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CLIENT_360_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'CHANGE_PASSWORD',
                    client_code: selectedCode,
                    password: newPassword.trim(),
                    must_change_password: 0
                })
            });
            const data = await res.json();
            if (data.success) {
                setLastSavedPassword(newPassword.trim());
                toast({
                    title: '🔑 Contraseña Actualizada en UM6 SHOP',
                    description: `Usuario: ${selectedCode} · Contraseña: ${newPassword.trim()}`,
                    className: 'bg-emerald-700 text-white'
                });
                loadClientDossier(selectedCode, true);
            } else {
                toast({ title: 'Error al cambiar contraseña', description: data.error, variant: 'destructive' });
            }
        } catch (e) {
            toast({ title: 'Error de red', variant: 'destructive' });
        } finally {
            setSavingPassword(false);
        }
    }

    async function handleToggleShopActive(nextActive) {
        if (!selectedCode) return;
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CLIENT_360_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'TOGGLE_SHOP_ACTIVE',
                    client_code: selectedCode,
                    is_active: nextActive ? 1 : 0
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: nextActive ? '⭐ Cuenta Shop Activada' : '⚪ Cuenta Shop Desactivada',
                    description: data.message,
                    className: 'bg-emerald-700 text-white'
                });
                loadClientDossier(selectedCode, true);
            }
        } catch (e) {
            toast({ title: 'Error al cambiar estatus Shop', variant: 'destructive' });
        }
    }

    async function handleLinkPhone(e) {
        e.preventDefault();
        if (!selectedCode || !phoneInput.trim()) return;
        setSavingPhone(true);
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CLIENT_360_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'LINK_PHONE',
                    client_code: selectedCode,
                    phone_number: phoneInput.trim(),
                    notify_client: notifyOnLink
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: '🔗 Teléfono Vinculado con Éxito',
                    description: data.message,
                    className: 'bg-emerald-700 text-white'
                });
                loadClientDossier(selectedCode);
                loadDashboardAndSearch(searchQuery, true);
            } else {
                toast({ title: 'Error al vincular', description: data.error, variant: 'destructive' });
            }
        } catch (e) {
            toast({ title: 'Error de red', variant: 'destructive' });
        } finally {
            setSavingPhone(false);
        }
    }

    async function handleUnlinkPhone() {
        if (!selectedCode) return;
        if (!confirm(`¿Desvincular el número de teléfono actual del cliente ${selectedCode}?`)) return;
        setSavingPhone(true);
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CLIENT_360_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'UNLINK_PHONE',
                    client_code: selectedCode
                })
            });
            const data = await res.json();
            if (data.success) {
                setPhoneInput('');
                toast({
                    title: '🔓 Teléfono Desvinculado',
                    description: data.message,
                    className: 'bg-amber-700 text-white'
                });
                loadClientDossier(selectedCode);
                loadDashboardAndSearch(searchQuery, true);
            }
        } catch (e) {
            toast({ title: 'Error al desvincular', variant: 'destructive' });
        } finally {
            setSavingPhone(false);
        }
    }

    async function handleSendChatReply(e, customText = null) {
        if (e) e.preventDefault();
        const textToSend = customText != null ? customText : replyMessage.trim();
        if (!selectedCode || !textToSend) return;
        setSendingReply(true);
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CHAT_SEND_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    client_code: selectedCode,
                    message: textToSend
                })
            });
            const data = await res.json();
            if (data.success) {
                if (customText == null) setReplyMessage('');
                if (data.whatsapp_sent) {
                    toast({
                        title: '💬 Enviado al WhatsApp del cliente',
                        description: 'Entregado dentro de la ventana gratuita de 24h.',
                        className: 'bg-emerald-700 text-white'
                    });
                } else if (data.whatsapp_warning) {
                    toast({
                        title: 'Guardado en Soporte (Sin envío API)',
                        description: data.whatsapp_warning,
                    });
                }
                loadClientDossier(selectedCode, true);
                loadDashboardAndSearch(searchQuery, true);
            } else {
                toast({ title: 'Error al enviar', description: data.error, variant: 'destructive' });
            }
        } catch (e) {
            toast({ title: 'Error de red', variant: 'destructive' });
        } finally {
            setSendingReply(false);
        }
    }

    async function handleCloseAdvisorRequest(targetCode, e) {
        if (e) e.stopPropagation();
        const code = String(targetCode || selectedCode || '').trim();
        if (!code) return;
        setClosingRequestCode(code);
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CLIENT_360_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'CLOSE_ADVISOR_REQUEST',
                    client_code: code
                })
            });
            const data = await res.json();
            if (data.success) {
                setAdvisorQueue(prev => prev.filter(item => item.client_code !== code));
                toast({
                    title: '✅ Solicitud de asesor cerrada',
                    description: data.message || `Se marcó como atendida la solicitud de ${code}.`,
                    className: 'bg-emerald-700 text-white'
                });
                loadDashboardAndSearch(searchQuery, true);
                if (selectedCode === code) {
                    loadClientDossier(code, true);
                }
            } else {
                toast({
                    title: 'No se pudo cerrar la solicitud',
                    description: data.error || 'Intenta nuevamente.',
                    variant: 'destructive'
                });
            }
        } catch (err) {
            console.error('Error closing advisor request:', err);
            toast({ title: 'Error de red al cerrar solicitud', variant: 'destructive' });
        } finally {
            setClosingRequestCode('');
        }
    }

    async function handleResumeBot() {
        if (!selectedCode) return;
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(CHAT_SEND_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    client_code: selectedCode,
                    action: 'resume_bot'
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: '🤖 Bot IA Reactivado',
                    description: 'El cliente puede volver a levantar pedidos automáticos.',
                    className: 'bg-emerald-700 text-white'
                });
                loadClientDossier(selectedCode, true);
                loadDashboardAndSearch(searchQuery, true);
            }
        } catch (e) {
            console.error(e);
        }
    }

    function openEditOrderModal(order) {
        setEditingOrder(order);
        setEditOrderItems((order.items || []).map(i => ({
            sku: i.sku,
            name: i.product_name || i.name || i.sku,
            quantity: Number(i.quantity) || 1,
            unit_price: Number(i.unit_price) || 0
        })));
        setEditDeliveryDate(
            order.delivery_date
                ? new Date(order.delivery_date).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0]
        );
        setSelectedProductSku('');
    }

    function handleAddProductToOrder() {
        if (!selectedProductSku) return;
        const prod = availableProducts.find(p => String(p.sku) === String(selectedProductSku));
        if (!prod) return;
        const idx = editOrderItems.findIndex(i => String(i.sku) === String(prod.sku));
        if (idx >= 0) {
            const next = [...editOrderItems];
            next[idx].quantity += 1;
            setEditOrderItems(next);
        } else {
            setEditOrderItems([
                ...editOrderItems,
                {
                    sku: prod.sku,
                    name: prod.name,
                    quantity: 1,
                    unit_price: Number(prod.priceData?.unit_price || prod.base_price || 0)
                }
            ]);
        }
        setSelectedProductSku('');
    }

    async function handleSaveOrderChanges() {
        if (!editingOrder) return;
        const activeItems = editOrderItems.filter(i => (Number(i.quantity) || 0) > 0);
        if (activeItems.length === 0) {
            alert('El pedido debe tener al menos 1 producto con cantidad mayor a 0.');
            return;
        }
        setSavingOrder(true);
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            if (editingOrder.source === 'preventa') {
                const res = await fetch(`${API_URL}/televenta/update-preventa.php`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        preventa_id: editingOrder.id,
                        client_code: selectedCode,
                        delivery_date: editDeliveryDate,
                        status: 'confirmed',
                        items: activeItems
                    })
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Error actualizando preventa');
            } else {
                const res = await fetch(`${API_URL}/televenta/confirm-order.php`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        order_id: editingOrder.id,
                        order_number: editingOrder.order_number || '',
                        delivery_date: editDeliveryDate,
                        items: activeItems
                    })
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Error actualizando pedido');
            }

            toast({
                title: '✅ Pedido modificado y confirmado',
                description: `Se guardaron los cambios del pedido ${editingOrder.order_number}.`,
                className: 'bg-emerald-700 text-white'
            });
            setEditingOrder(null);
            loadClientDossier(selectedCode);
        } catch (err) {
            toast({ title: 'Error al guardar pedido', description: err.message, variant: 'destructive' });
        } finally {
            setSavingOrder(false);
        }
    }

    async function handleDeliverOrderFrom360(order) {
        const isReg = Boolean(dossier?.shop_account?.is_active);
        const msg = isReg
            ? '¿Marcar este pedido como ENTREGADO y otorgar puntos al cliente?'
            : '¿Marcar este pedido como ENTREGADO? (El cliente NO está activo en UM6 SHOP, por lo que recibirá 0 puntos).';
        if (!confirm(msg)) return;

        try {
            if (order.source === 'preventa') {
                await deliverPreventa(order.id);
                if (isReg) {
                    await awardPreventaPoints(order.id, order).catch(() => {});
                }
            } else {
                const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
                await fetch(`${API_URL}/televenta/deliver-order.php`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        order_id: Number(order.id) || 0,
                        order_number: order.order_number || ''
                    })
                });
            }
            toast({
                title: '🚚 Pedido marcado como Entregado',
                description: isReg ? 'Puntos acreditados al cliente.' : 'Sin puntos (cliente no activo en UM6 SHOP).',
                className: 'bg-emerald-700 text-white'
            });
            loadClientDossier(selectedCode);
        } catch (e) {
            toast({ title: 'Error al entregar pedido', description: e.message, variant: 'destructive' });
        }
    }

    function openTicketModal(order) {
        const c = dossier?.client || {};
        const items = (order.items || []).map(i => ({
            cve_marca: i.sku || '',
            des_marca: i.product_name || i.name || i.sku || 'Producto',
            name: i.product_name || i.name || i.sku || 'Producto',
            quantity: Number(i.quantity) || 1,
            price: Number(i.unit_price) || 0
        }));
        setReceiptClient({
            client_code: c.client_code || order.client_code || '',
            name: c.business_name || order.client_name || `Cliente ${order.client_code}`,
            business_name: c.business_name || order.client_name || `Cliente ${order.client_code}`,
            phone: dossier?.whatsapp?.active_phone || c.phone || '',
            is_shop_registered: Boolean(dossier?.shop_account?.is_active)
        });
        setReceiptSale({
            id: order.order_number || order.id,
            preventaId: order.order_number || order.id,
            totalAmount: Number(order.total_amount) || 0,
            items,
            delivery_date: order.delivery_date || null,
            created_at: order.created_at || new Date().toISOString()
        });
    }

    const activePhone = dossier?.whatsapp?.active_phone || dossier?.client?.phone || '';
    const waLink = activePhone
        ? `https://wa.me/${String(activePhone).replace(/\D/g, '').startsWith('52') ? String(activePhone).replace(/\D/g, '') : '52' + String(activePhone).replace(/\D/g, '')}`
        : null;

    return (
        <div className="space-y-4 pb-16">
            <Helmet>
                <title>Centro de Ayuda y Atención al Cliente 360° | Televenta</title>
            </Helmet>

            {/* TOP HEADER + WHATSAPP FREE TIER CONTROL */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shrink-0">
                            <Headphones className="w-7 h-7" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2 flex-wrap">
                                Centro de Ayuda y Atención 360° (Televenta)
                                <Badge className="bg-emerald-600 text-white text-xs">Todo en un solo panel</Badge>
                            </h1>
                            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                                Consulta expediente, cambia contraseña de la Shop, vincula/desvincula teléfono, responde solicitudes de asesor y modifica pedidos sin cambiar de página.
                            </p>
                        </div>
                    </div>

                    {/* Control de Uso Gratuito de WhatsApp API + Horario de Atención Televenta */}
                    <div className="flex flex-wrap items-center gap-2.5 bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
                        <div className="text-xs pr-2 border-r border-slate-800">
                            <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                                <ShieldCheck className="w-4 h-4" />
                                Uso Gratuito Meta 24h
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                Hoy: <strong className="text-white">{waUsage.outbound_today}</strong> envíos API · <strong className="text-emerald-300">{waUsage.inbound_today}</strong> recibidos
                            </p>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            onClick={openScheduleModal}
                            className="text-xs h-8 gap-1.5 border-indigo-500/50 bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-200 font-semibold"
                            title="Editar horario de atención de Televenta y reglas del Bot IA"
                        >
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            Horario Televenta: {waUsage.televenta_schedule_days || 'Lunes a Sábado'} ({waUsage.televenta_hours_start || '08:00'} - {waUsage.televenta_hours_end || '18:00'})
                        </Button>

                        <Button
                            size="sm"
                            variant={waUsage.only_24h_free_window ? 'default' : 'outline'}
                            disabled={savingWaSettings}
                            onClick={() => handleToggleWaSetting('only_24h_free_window', !waUsage.only_24h_free_window)}
                            className={`text-xs h-8 gap-1.5 ${
                                waUsage.only_24h_free_window
                                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                                    : 'border-slate-700 text-slate-300'
                            }`}
                            title="En Meta WhatsApp Cloud API, responder dentro de las 24 horas posteriores al mensaje del cliente es 100% GRATUITO. Esta opción bloquea cualquier envío fuera de las 24h para evitar cargos."
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {waUsage.only_24h_free_window ? 'Solo Ventana Gratuita 24h: ON' : 'Filtro 24h: OFF'}
                        </Button>

                        <Button
                            size="sm"
                            variant={waUsage.pause_outbound ? 'destructive' : 'outline'}
                            disabled={savingWaSettings}
                            onClick={() => handleToggleWaSetting('pause_outbound', !waUsage.pause_outbound)}
                            className={`text-xs h-8 gap-1.5 ${
                                waUsage.pause_outbound
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white font-bold'
                                    : 'border-slate-700 text-slate-200 hover:bg-slate-800'
                            }`}
                            title="Si activas esta pausa, el servidor no enviará ningún mensaje nuevo por la API de WhatsApp (solo recibirá los mensajes y pedidos)."
                        >
                            {waUsage.pause_outbound ? (
                                <>
                                    <PlayCircle className="w-3.5 h-3.5" />
                                    Envíos API Pausados (Click para Reanudar)
                                </>
                            ) : (
                                <>
                                    <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                                    Pausar Envíos Nuevos API
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* COLA EN VIVO DE CLIENTES QUE SOLICITAN HABLAR CON UN ASESOR */}
                {advisorQueue.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                                🙋‍♂️ Solicitudes de Hablar con Asesor / Mensajes de Clientes ({advisorQueue.length})
                            </span>
                            <span className="text-[11px] text-slate-400">
                                Haz clic en cualquier cliente para atenderlo aquí mismo
                            </span>
                        </div>
                        <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                            {advisorQueue.map(item => {
                                const isSel = selectedCode === item.client_code;
                                const isHuman = item.bot_stage === 'HUMAN';
                                const isClosing = closingRequestCode === item.client_code;
                                return (
                                    <div
                                        key={item.client_code}
                                        onClick={() => setSelectedCode(item.client_code)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setSelectedCode(item.client_code); }}
                                        className={`shrink-0 text-left px-3 py-2 rounded-xl border transition-all flex items-center gap-2.5 max-w-xs cursor-pointer ${
                                            isSel
                                                ? 'bg-emerald-950/90 border-emerald-400 ring-2 ring-emerald-500/30'
                                                : isHuman
                                                ? 'bg-purple-950/60 border-purple-500/50 hover:bg-purple-900/60'
                                                : 'bg-slate-900/90 border-slate-700 hover:border-slate-500'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-xs text-white truncate">
                                                    {item.business_name}
                                                </span>
                                                {item.unread_count > 0 && (
                                                    <span className="px-1.5 py-0.2 text-[10px] font-extrabold rounded-full bg-rose-600 text-white">
                                                        {item.unread_count}
                                                    </span>
                                                )}
                                                {isHuman && (
                                                    <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-purple-600 text-white">
                                                        Pide Asesor
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-slate-300 truncate mt-0.5">
                                                {item.last_message}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={isClosing}
                                            onClick={(e) => handleCloseAdvisorRequest(item.client_code, e)}
                                            title="Cerrar / Finalizar esta solicitud de asesor"
                                            className="shrink-0 p-1.5 rounded-lg bg-slate-800/90 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 hover:border-rose-500 transition-colors disabled:opacity-50"
                                        >
                                            {isClosing ? (
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <X className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* MAIN GRID: LEFT (CLIENT SEARCH LIST) + RIGHT (360 DOSSIER) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* COLUMNA IZQUIERDA: BUSCADOR DE CLIENTES */}
                <div className="lg:col-span-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex flex-col h-[420px] lg:h-[calc(100vh-230px)]">
                    <div className="mb-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                            1. Buscar Cliente o Teléfono
                        </label>
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    loadDashboardAndSearch(e.target.value);
                                }}
                                placeholder="Código, negocio, teléfono, ruta..."
                                className="pl-9 bg-slate-950 border-slate-700 text-white h-9 text-xs"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                        {searching ? (
                            <div className="text-center py-8 text-xs text-slate-400">
                                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                                Buscando clientes...
                            </div>
                        ) : clientsList.length === 0 ? (
                            <div className="text-center py-8 text-xs text-slate-500">
                                No se encontraron clientes con ese criterio.
                            </div>
                        ) : (
                            clientsList.map(cl => {
                                const active = selectedCode === cl.client_code;
                                const hasShop = Number(cl.shop_is_active) === 1;
                                const isHuman = cl.bot_stage === 'HUMAN';
                                return (
                                    <button
                                        key={cl.client_code}
                                        type="button"
                                        onClick={() => setSelectedCode(cl.client_code)}
                                        className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                                            active
                                                ? 'bg-emerald-950/70 border-emerald-500 text-white shadow-md'
                                                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="font-mono text-[11px] font-bold text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/60">
                                                #{cl.client_code}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {isHuman && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white font-bold">
                                                        🙋‍♂️ Asesor
                                                    </span>
                                                )}
                                                {hasShop ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/70 text-emerald-300 border border-emerald-700/50">
                                                        ⭐ {Number(cl.points_balance || 0)} pts
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                                        Sin Shop
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="font-bold text-xs text-white truncate mt-1">
                                            {cl.business_name || 'Sin nombre'}
                                        </p>
                                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                                            <span className="truncate">{cl.phone || cl.wa_session_phone || 'Sin tel.'}</span>
                                            {cl.sales_route && <span>Ruta {cl.sales_route}</span>}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* COLUMNA DERECHA: EXPEDIENTE 360° TODO EN UNO */}
                <div className="lg:col-span-9 space-y-4">
                    {!selectedCode || !dossier ? (
                        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center">
                            <Headphones className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                            <h3 className="text-lg font-bold text-white">Selecciona o busca un cliente</h3>
                            <p className="text-sm text-slate-400 mt-1">
                                Elige un cliente de la lista izquierda o de la barra de solicitudes de asesor para ver todo su expediente en un solo lugar.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* CABECERA DEL CLIENTE SELECCIONADO */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-indigo-600 text-white">
                                            CÓDIGO: {dossier.client?.client_code}
                                        </span>
                                        {dossier.shop_account?.is_active ? (
                                            <Badge className="bg-emerald-600 text-white gap-1">
                                                <Award className="w-3.5 h-3.5" />
                                                Activo en UM6 SHOP ({dossier.shop_account?.points_balance || 0} Puntos)
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="border-amber-500/50 text-amber-300">
                                                No registrado en UM6 SHOP (0 Puntos)
                                            </Badge>
                                        )}
                                        {dossier.whatsapp?.bot_stage === 'HUMAN' ? (
                                            <Badge className="bg-purple-600 text-white animate-pulse">
                                                🙋‍♂️ Esperando respuesta de Asesor
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                                                🤖 Bot IA Activo ({dossier.whatsapp?.bot_stage || 'IDLE'})
                                            </Badge>
                                        )}
                                        {dossier.whatsapp?.in_free_24h_window ? (
                                            <Badge className="bg-emerald-950 text-emerald-300 border border-emerald-600/50">
                                                🟢 Ventana Gratuita 24h Activa
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="border-slate-700 text-slate-400">
                                                ⚪ Sin mensaje en 24h (Usar WhatsApp Web)
                                            </Badge>
                                        )}
                                    </div>
                                    <h2 className="text-xl font-black text-white mt-1.5 flex items-center gap-2">
                                        <Store className="w-5 h-5 text-emerald-400" />
                                        {dossier.client?.business_name || 'Cliente'}
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span>Ruta: <strong className="text-slate-200">{dossier.client?.sales_route || 'N/A'}</strong></span>
                                        <span>· Zona: <strong className="text-slate-200">{dossier.client?.zona_comercial || 'Estándar'}</strong></span>
                                        <span>· GEC: <strong className="text-slate-200">{dossier.client?.gec || 'N/A'}</strong></span>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-indigo-200">
                                            📞 Día Visita de VENTA: <strong>{dossier.client?.visit_days || 'No asignado'}</strong>
                                        </span>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-200">
                                            🚚 Día de REPARTO (Entrega): <strong>{dossier.client?.delivery_days || computeDeliveryDaysFromVisit(dossier.client?.visit_days) || 'Día siguiente a venta'}</strong>
                                        </span>
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {(dossier.whatsapp?.bot_stage === 'HUMAN' || advisorQueue.some(q => q.client_code === selectedCode)) && (
                                        <Button
                                            size="sm"
                                            disabled={closingRequestCode === selectedCode}
                                            onClick={() => handleCloseAdvisorRequest(selectedCode)}
                                            className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold h-9 gap-1.5 shadow"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            {closingRequestCode === selectedCode ? 'Cerrando...' : 'Cerrar Solicitud de Asesor'}
                                        </Button>
                                    )}
                                    {waLink && (
                                        <a
                                            href={waLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Abrir WhatsApp Web
                                        </a>
                                    )}
                                    {activePhone && (
                                        <a
                                            href={`tel:${activePhone}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                                        >
                                            <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                            Llamar ({activePhone})
                                        </a>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => loadClientDossier(selectedCode)}
                                        className="border-slate-700 text-slate-300 h-9"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loadingDossier ? 'animate-spin text-emerald-400' : ''}`} />
                                    </Button>
                                </div>
                            </div>

                            {/* FILA DE 3 TARJETAS DE ACCIÓN DIRECTA: 1) DATOS CLIENTE, 2) CONTRASEÑA SHOP Y PUNTOS, 3) TELÉFONO VINCULADO */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* TARJETA 1: DATOS DEL CLIENTE */}
                                <Card className="bg-slate-900 border-slate-800 text-white">
                                    <CardHeader className="pb-2 pt-4 px-4">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2 text-indigo-300">
                                            <User className="w-4 h-4" />
                                            Ficha y Datos del Cliente
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4">
                                        <form onSubmit={handleSaveClientInfo} className="space-y-2.5 text-xs">
                                            <div>
                                                <label className="text-[11px] text-slate-400 block mb-0.5">Nombre del Negocio</label>
                                                <Input
                                                    value={editBusinessName}
                                                    onChange={e => setEditBusinessName(e.target.value)}
                                                    className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] text-slate-400 block mb-0.5">Nombre del Titular / Contacto</label>
                                                <Input
                                                    value={editContact}
                                                    onChange={e => setEditContact(e.target.value)}
                                                    placeholder="Nombre del encargado"
                                                    className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] text-slate-400 block mb-0.5">Dirección</label>
                                                <Input
                                                    value={editAddress}
                                                    onChange={e => setEditAddress(e.target.value)}
                                                    placeholder="Calle, número, colonia..."
                                                    className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                                                />
                                            </div>
                                            <div className="p-2.5 rounded-lg bg-slate-950/90 border border-indigo-500/30 space-y-2">
                                                <div>
                                                    <label className="text-[11px] font-bold text-indigo-300 flex items-center justify-between mb-1">
                                                        <span>📞 Día de Visita de VENTA (Preventa / Llamada)</span>
                                                        <span className="text-[10px] font-normal text-slate-400">Se guarda en visit_days</span>
                                                    </label>
                                                    <div className="flex flex-wrap gap-1 mb-1.5">
                                                        {WEEKDAYS_LIST.map(day => {
                                                            const isSelected = String(editVisitDays || '')
                                                                .toLowerCase()
                                                                .includes(day.toLowerCase());
                                                            return (
                                                                <button
                                                                    key={day}
                                                                    type="button"
                                                                    onClick={() => toggleVisitWeekday(day)}
                                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                                                                        isSelected
                                                                            ? 'bg-indigo-600 border-indigo-400 text-white'
                                                                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                                                    }`}
                                                                >
                                                                    {day.slice(0, 3)}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <Input
                                                        value={editVisitDays}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setEditVisitDays(val);
                                                            setEditDeliveryDays(computeDeliveryDaysFromVisit(val));
                                                        }}
                                                        placeholder="Ej. Lunes, Jueves (Día en que Televenta/Preventa toma pedido)"
                                                        className="h-8 text-xs bg-slate-900 border-slate-700 text-white"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="text-[11px] font-bold text-emerald-300 flex items-center justify-between mb-0.5">
                                                        <span>🚚 Día de REPARTO (Entrega Física en Ruta)</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditDeliveryDays(computeDeliveryDaysFromVisit(editVisitDays))}
                                                            className="text-[10px] underline text-emerald-400 hover:text-emerald-300"
                                                        >
                                                            Auto (Día siguiente)
                                                        </button>
                                                    </label>
                                                    <Input
                                                        value={editDeliveryDays}
                                                        onChange={e => setEditDeliveryDays(e.target.value)}
                                                        placeholder="Ej. Martes, Viernes (Día siguiente hábil a la venta)"
                                                        className="h-8 text-xs bg-slate-900 border-emerald-700/50 text-emerald-200"
                                                    />
                                                    <p className="text-[10px] text-slate-400 mt-1">
                                                        ℹ️ La preventa/llamada se realiza en el <strong>Día de Visita de Venta</strong> y el camión entrega en el <strong>Día de Reparto</strong>.
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={savingClientInfo}
                                                className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                                            >
                                                {savingClientInfo ? 'Guardando...' : '💾 Guardar Datos del Cliente'}
                                            </Button>
                                        </form>
                                    </CardContent>
                                </Card>

                                {/* TARJETA 2: CONTRASEÑA UM6 SHOP Y PUNTOS */}
                                <Card className="bg-slate-900 border-slate-800 text-white">
                                    <CardHeader className="pb-2 pt-4 px-4">
                                        <CardTitle className="text-sm font-bold flex items-center justify-between text-emerald-400">
                                            <span className="flex items-center gap-1.5">
                                                <KeyRound className="w-4 h-4" />
                                                Contraseña Shop y Puntos
                                            </span>
                                            <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300">
                                                ⭐ {dossier.shop_account?.points_balance || 0} pts
                                            </span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4 space-y-3 text-xs">
                                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                                            <div>
                                                <span className="text-[11px] text-slate-400 block">Cuenta en UM6 SHOP:</span>
                                                <strong className={dossier.shop_account?.is_active ? 'text-emerald-400' : 'text-amber-400'}>
                                                    {dossier.shop_account?.is_active ? 'ACTIVA (Sí acumula puntos)' : 'INACTIVA / No registrada'}
                                                </strong>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleToggleShopActive(!dossier.shop_account?.is_active)}
                                                className="h-7 text-[11px] border-slate-700 text-slate-200"
                                            >
                                                {dossier.shop_account?.is_active ? 'Desactivar' : 'Activar Shop'}
                                            </Button>
                                        </div>

                                        <form onSubmit={handleChangePassword} className="space-y-2">
                                            <label className="text-[11px] text-slate-400 block">
                                                Asignar / Cambiar Contraseña del Cliente (Usuario: <strong className="text-white">{selectedCode}</strong>)
                                            </label>
                                            <div className="flex gap-1.5">
                                                <Input
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                    placeholder="Nueva contraseña..."
                                                    className="h-8 text-xs bg-slate-950 border-slate-700 text-white font-mono"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setNewPassword(`CF${selectedCode}`)}
                                                    className="h-8 px-2 text-[11px] border-slate-700 text-slate-300 shrink-0"
                                                    title="Sugerir contraseña estándar"
                                                >
                                                    Sugerir
                                                </Button>
                                            </div>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={savingPassword}
                                                className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                            >
                                                {savingPassword ? 'Actualizando...' : '🔑 Guardar Contraseña y Activar'}
                                            </Button>
                                        </form>

                                        {lastSavedPassword && (
                                            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-600/40 space-y-1.5">
                                                <p className="text-[11px] text-emerald-200">
                                                    ✅ Nueva contraseña lista: <strong className="font-mono">{lastSavedPassword}</strong>
                                                </p>
                                                <div className="flex gap-1.5">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(
                                                                `🏪 UM6 SHOP · Cervezas Finas\nUsuario (Código): ${selectedCode}\nContraseña: ${lastSavedPassword}\nIngresa en: https://cervezasfinas.com`
                                                            );
                                                            toast({ title: '📋 Credenciales copiadas al portapapeles' });
                                                        }}
                                                        className="h-7 text-[11px] flex-1 border-emerald-600/50 text-emerald-200"
                                                    >
                                                        <Copy className="w-3 h-3 mr-1" /> Copiar
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() =>
                                                            handleSendChatReply(
                                                                null,
                                                                `🔑 Tus datos de acceso a *UM6 SHOP · Cervezas Finas* han sido actualizados:\n• *Código de Cliente:* ${selectedCode}\n• *Nueva Contraseña:* ${lastSavedPassword}`
                                                            )
                                                        }
                                                        className="h-7 text-[11px] flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                                                    >
                                                        <Send className="w-3 h-3 mr-1" /> Enviar al Chat
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* TARJETA 3: TELÉFONO VINCULADO Y WHATSAPP BOT */}
                                <Card className="bg-slate-900 border-slate-800 text-white">
                                    <CardHeader className="pb-2 pt-4 px-4">
                                        <CardTitle className="text-sm font-bold flex items-center justify-between text-amber-400">
                                            <span className="flex items-center gap-1.5">
                                                <Phone className="w-4 h-4" />
                                                Teléfono y Vinculación WhatsApp
                                            </span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4 space-y-3 text-xs">
                                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                                            <div>
                                                <span className="text-[11px] text-slate-400 block">Teléfono Vinculado Actual:</span>
                                                <strong className="font-mono text-sm text-white">
                                                    {activePhone || 'Sin número vinculado'}
                                                </strong>
                                            </div>
                                            {activePhone && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={savingPhone}
                                                    onClick={handleUnlinkPhone}
                                                    className="h-7 text-[11px] border-amber-500/50 text-amber-300 hover:bg-amber-950/50 gap-1"
                                                >
                                                    <Unlink className="w-3 h-3" /> Desvincular
                                                </Button>
                                            )}
                                        </div>

                                        <form onSubmit={handleLinkPhone} className="space-y-2">
                                            <label className="text-[11px] text-slate-400 block">
                                                Cambiar o Vincular Nuevo Número (10 dígitos):
                                            </label>
                                            <Input
                                                value={phoneInput}
                                                onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 13))}
                                                placeholder="Ej. 2221234567"
                                                className="h-8 text-xs bg-slate-950 border-slate-700 text-white font-mono"
                                            />
                                            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={notifyOnLink}
                                                    onChange={e => setNotifyOnLink(e.target.checked)}
                                                    className="rounded border-slate-600"
                                                />
                                                Notificar bienvenida si está en ventana gratuita 24h
                                            </label>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={savingPhone}
                                                className="w-full h-8 text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold gap-1.5"
                                            >
                                                <Link2 className="w-3.5 h-3.5" />
                                                {savingPhone ? 'Procesando...' : 'Vincular / Actualizar Número'}
                                            </Button>
                                        </form>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* FILA INFERIOR: IZQUIERDA (CHAT EN VIVO Y BITÁCORA BOT) + DERECHA (HISTORIAL DE PEDIDOS Y MODIFICACIONES) */}
                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                                {/* CHAT EN VIVO CON EL CLIENTE (5 COLUMNAS) */}
                                <Card className="xl:col-span-5 bg-slate-900 border-slate-800 text-white flex flex-col h-[520px]">
                                    <CardHeader className="py-3 px-4 border-b border-slate-800 flex flex-row items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                size="sm"
                                                variant={chatTab === 'support' ? 'default' : 'ghost'}
                                                onClick={() => setChatTab('support')}
                                                className={`h-7 text-xs ${chatTab === 'support' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
                                            >
                                                💬 Chat con Asesor ({dossier.support_chat?.length || 0})
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={chatTab === 'bot_logs' ? 'default' : 'ghost'}
                                                onClick={() => setChatTab('bot_logs')}
                                                className={`h-7 text-xs ${chatTab === 'bot_logs' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                                            >
                                                🤖 Bitácora Bot ({dossier.whatsapp?.recent_logs?.length || 0})
                                            </Button>
                                        </div>

                                        {dossier.whatsapp?.bot_stage === 'HUMAN' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={handleResumeBot}
                                                className="h-7 text-[11px] border-emerald-500/50 text-emerald-300 hover:bg-emerald-950/60 gap-1"
                                            >
                                                <Bot className="w-3.5 h-3.5" /> Devolver al Bot
                                            </Button>
                                        )}
                                    </CardHeader>

                                    <CardContent className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-slate-950/60">
                                        {chatTab === 'support' ? (
                                            (dossier.support_chat || []).length === 0 ? (
                                                <div className="text-center py-12 text-xs text-slate-500">
                                                    No hay mensajes en el chat de asesor todavía. Puedes escribirle abajo para iniciar o responder.
                                                </div>
                                            ) : (
                                                (dossier.support_chat || []).map(msg => {
                                                    const isAgent = msg.sender_type === 'agent';
                                                    return (
                                                        <div
                                                            key={msg.id}
                                                            className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}
                                                        >
                                                            <div
                                                                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap ${
                                                                    isAgent
                                                                        ? 'bg-emerald-700 text-white rounded-br-none'
                                                                        : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-none'
                                                                }`}
                                                            >
                                                                {msg.message}
                                                            </div>
                                                            <span className="text-[10px] text-slate-500 mt-0.5 px-1">
                                                                {isAgent ? 'Televenta' : 'Cliente'} · {msg.created_at}
                                                            </span>
                                                        </div>
                                                    );
                                                })
                                            )
                                        ) : (dossier.whatsapp?.recent_logs || []).length === 0 ? (
                                            <div className="text-center py-12 text-xs text-slate-500">
                                                No hay bitácora de mensajes de WhatsApp para este número.
                                            </div>
                                        ) : (
                                            (dossier.whatsapp?.recent_logs || []).map(log => {
                                                const isOut = log.direction === 'OUTBOUND';
                                                let bodyText = log.message_body || '';
                                                if (bodyText.startsWith('{')) {
                                                    try {
                                                        const parsed = JSON.parse(bodyText);
                                                        bodyText =
                                                            parsed?.text?.body ||
                                                            parsed?.interactive?.body?.text ||
                                                            bodyText;
                                                    } catch (e) {}
                                                }
                                                return (
                                                    <div
                                                        key={log.id}
                                                        className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}
                                                    >
                                                        <div
                                                            className={`max-w-[88%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap ${
                                                                isOut
                                                                    ? 'bg-indigo-900/80 text-indigo-100 border border-indigo-700/50 rounded-br-none'
                                                                    : 'bg-slate-800 text-white border border-slate-700 rounded-bl-none'
                                                            }`}
                                                        >
                                                            {bodyText}
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 mt-0.5 px-1">
                                                            {isOut ? `Bot/API (${log.status})` : 'Cliente WhatsApp'} · {log.created_at}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        )}
                                        <div ref={chatBottomRef} />
                                    </CardContent>

                                    <form onSubmit={handleSendChatReply} className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2">
                                        <Input
                                            value={replyMessage}
                                            onChange={e => setReplyMessage(e.target.value)}
                                            placeholder="Escribe aquí para responder al WhatsApp / Chat del cliente..."
                                            className="bg-slate-950 border-slate-700 text-white text-xs h-9"
                                        />
                                        <Button
                                            type="submit"
                                            size="sm"
                                            disabled={sendingReply || !replyMessage.trim()}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white h-9 px-4 gap-1.5 font-bold shrink-0"
                                        >
                                            <Send className="w-3.5 h-3.5" />
                                            Enviar
                                        </Button>
                                    </form>
                                </Card>

                                {/* HISTORIAL DE PEDIDOS PENDIENTES Y VENTAS ENTREGADAS REALES (7 COLUMNAS) */}
                                <Card className="xl:col-span-7 bg-slate-900 border-slate-800 text-white flex flex-col h-[520px]">
                                    <CardHeader className="py-3 px-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Button
                                                size="sm"
                                                variant={ordersTab === 'pending' ? 'default' : 'ghost'}
                                                onClick={() => setOrdersTab('pending')}
                                                className={`h-7 text-xs gap-1.5 ${
                                                    ordersTab === 'pending'
                                                        ? 'bg-amber-600 hover:bg-amber-500 text-white font-bold'
                                                        : 'text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                <Clock className="w-3.5 h-3.5" />
                                                Solicitados / Pendientes de Entrega ({pendingClientOrders.length})
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={ordersTab === 'delivered_real' ? 'default' : 'ghost'}
                                                onClick={() => setOrdersTab('delivered_real')}
                                                className={`h-7 text-xs gap-1.5 ${
                                                    ordersTab === 'delivered_real'
                                                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold'
                                                        : 'text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                <Truck className="w-3.5 h-3.5" />
                                                Entregados Reales · ventas_por_sku ({deliveredSalesList.length})
                                            </Button>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => navigate(`/sales-simulator?client=${encodeURIComponent(selectedCode)}`)}
                                            className="h-7 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/50 shrink-0"
                                        >
                                            + Nuevo Pedido en Simulador
                                        </Button>
                                    </CardHeader>

                                    <CardContent className="flex-1 overflow-y-auto p-3.5 space-y-3">
                                        {ordersTab === 'pending' ? (
                                            pendingClientOrders.length === 0 ? (
                                                <div className="text-center py-12 text-xs text-slate-400 space-y-1">
                                                    <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                                    <p className="font-semibold text-slate-300">No hay pedidos solicitados ni pendientes de entrega.</p>
                                                    <p className="text-[11px] text-slate-500">
                                                        Los pedidos levantados en llamada de Televenta, WhatsApp o Tienda aparecen aquí mientras están por entregarse.
                                                    </p>
                                                </div>
                                            ) : (
                                                pendingClientOrders.map(ord => {
                                                    const isConfirmed = ord.status === 'confirmed';
                                                    const isPreventa = ord.source === 'preventa' || String(ord.order_number || '').startsWith('PREV-');
                                                    return (
                                                        <div
                                                            key={`${ord.source}-${ord.id}`}
                                                            className="rounded-xl bg-slate-950/90 border border-amber-500/30 p-3.5 space-y-2.5"
                                                        >
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-mono text-xs font-extrabold text-white bg-slate-800 px-2 py-0.5 rounded">
                                                                        #{ord.order_number}
                                                                    </span>
                                                                    <Badge className={isPreventa ? 'bg-indigo-600 text-white' : 'bg-sky-700 text-white'}>
                                                                        {isPreventa ? '📞 Televenta / Preventa' : '🛒 Tienda / WhatsApp'}
                                                                    </Badge>
                                                                    <Badge className={isConfirmed ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'}>
                                                                        {isConfirmed ? 'Confirmado · Por Entregar' : 'Solicitado · Pendiente de Entrega'}
                                                                    </Badge>
                                                                    <span className="text-[11px] text-slate-400">
                                                                        {ord.created_at ? new Date(ord.created_at).toLocaleString('es-MX') : ''}
                                                                    </span>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-sm font-black text-emerald-400">
                                                                        ${Number(ord.total_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {ord.notes && (
                                                                <p className="text-[11px] text-indigo-300 bg-indigo-950/40 px-2.5 py-1 rounded border border-indigo-800/40">
                                                                    📝 {ord.notes}
                                                                </p>
                                                            )}

                                                            {/* Productos del pedido */}
                                                            <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                                                                {(ord.items || []).map((it, idx) => (
                                                                    <div key={idx} className="flex items-center justify-between text-xs">
                                                                        <span className="text-slate-200 truncate">
                                                                            <strong className="text-emerald-400">{it.quantity}x</strong> {it.product_name || it.name || it.sku}
                                                                        </span>
                                                                        <span className="font-mono text-slate-300 shrink-0 ml-2">
                                                                            ${Number(it.subtotal || (it.quantity * it.unit_price) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Acciones del pedido pendiente en 1 clic */}
                                                            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => openTicketModal(ord)}
                                                                    className="h-7 text-xs border-slate-700 text-slate-200 hover:bg-slate-800 gap-1"
                                                                >
                                                                    <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                                                                    Ver / Descargar Ticket
                                                                </Button>

                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => openEditOrderModal(ord)}
                                                                    className="h-7 text-xs border-indigo-500/50 text-indigo-300 hover:bg-indigo-950/60 gap-1"
                                                                >
                                                                    <Edit3 className="w-3.5 h-3.5" />
                                                                    Modificar Pedido
                                                                </Button>

                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleDeliverOrderFrom360(ord)}
                                                                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1"
                                                                >
                                                                    <Truck className="w-3.5 h-3.5" />
                                                                    Marcar Entregado
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )
                                        ) : deliveredSalesList.length === 0 ? (
                                            <div className="text-center py-12 text-xs text-slate-400 space-y-1">
                                                <Truck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                                <p className="font-semibold text-slate-300">No se encontraron ventas entregadas en ventas_por_sku para este cliente.</p>
                                                <p className="text-[11px] text-slate-500">
                                                    Aquí se muestran únicamente los pedidos reales ya entregados y facturados en el historial oficial de ventas_por_sku.
                                                </p>
                                            </div>
                                        ) : (
                                            deliveredSalesList.map(sale => (
                                                <div
                                                    key={sale.id}
                                                    className="rounded-xl bg-slate-950/90 border border-emerald-500/30 p-3.5 space-y-2.5"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-mono text-xs font-extrabold text-white bg-emerald-950 border border-emerald-700/60 px-2 py-0.5 rounded">
                                                                #{sale.order_number}
                                                            </span>
                                                            <Badge className="bg-emerald-600 text-white">
                                                                ✅ Entregado Real (ventas_por_sku)
                                                            </Badge>
                                                            <span className="text-[11px] text-slate-300 font-medium">
                                                                📅 Fecha Entrega: {sale.delivery_date || (sale.created_at ? String(sale.created_at).slice(0, 10) : 'N/A')}
                                                            </span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-sm font-black text-emerald-400">
                                                                ${Number(sale.total_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {sale.notes && (
                                                        <p className="text-[11px] text-emerald-300 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-800/40">
                                                            🚚 {sale.notes}
                                                        </p>
                                                    )}

                                                    <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                                                        {(sale.items || []).map((it, idx) => (
                                                            <div key={idx} className="flex items-center justify-between text-xs">
                                                                <span className="text-slate-200 truncate">
                                                                    <strong className="text-emerald-400">{it.quantity}x</strong> {it.product_name || it.sku}
                                                                    <span className="text-[10px] text-slate-500 ml-1">({it.sku})</span>
                                                                </span>
                                                                <span className="font-mono text-slate-300 shrink-0 ml-2">
                                                                    ${Number(it.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => openTicketModal(sale)}
                                                            className="h-7 text-xs border-slate-700 text-slate-200 hover:bg-slate-800 gap-1"
                                                        >
                                                            <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                                                            Ver / Descargar Ticket Entregado
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* MODAL PARA MODIFICAR UN PEDIDO DESDE EL MISMO PANEL 360° */}
            <Dialog open={Boolean(editingOrder)} onOpenChange={(open) => !open && setEditingOrder(null)}>
                <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-xl">
                    <DialogHeader>
                        <DialogTitle>✏️ Modificar Pedido #{editingOrder?.order_number}</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Ajusta cantidades, agrega o quita productos y actualiza la fecha de entrega sin salir del expediente.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
                        <div>
                            <label className="text-xs text-slate-300 block mb-1">Fecha de Entrega Programada</label>
                            <Input
                                type="date"
                                value={editDeliveryDate}
                                onChange={e => setEditDeliveryDate(e.target.value)}
                                className="bg-slate-950 border-slate-700 text-white h-9 text-xs"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-slate-300 block">Productos del Pedido</label>
                            {editOrderItems.map((it, idx) => (
                                <div key={idx} className="flex items-center justify-between gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-white truncate">{it.name}</p>
                                        <span className="text-[11px] text-slate-400">SKU: {it.sku}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Input
                                            type="number"
                                            min="1"
                                            value={it.quantity ?? ''}
                                            onChange={e => {
                                                const raw = e.target.value;
                                                const next = [...editOrderItems];
                                                next[idx].quantity = raw === '' ? '' : Math.max(0, parseInt(raw, 10) || 0);
                                                setEditOrderItems(next);
                                            }}
                                            onBlur={() => {
                                                const next = [...editOrderItems];
                                                next[idx].quantity = Math.max(1, parseInt(next[idx].quantity, 10) || 1);
                                                setEditOrderItems(next);
                                            }}
                                            className="w-16 h-8 text-xs bg-slate-900 border-slate-700 text-center"
                                        />
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={it.unit_price}
                                            onChange={e => {
                                                const next = [...editOrderItems];
                                                next[idx].unit_price = parseFloat(e.target.value) || 0;
                                                setEditOrderItems(next);
                                            }}
                                            className="w-24 h-8 text-xs bg-slate-900 border-slate-700"
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setEditOrderItems(editOrderItems.filter((_, i) => i !== idx))}
                                            className="h-8 w-8 p-0 text-rose-400 hover:bg-rose-950/50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Agregar producto */}
                        <div className="flex gap-2 pt-2">
                            <select
                                value={selectedProductSku}
                                onChange={e => setSelectedProductSku(e.target.value)}
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 h-9 text-xs text-white"
                            >
                                <option value="">+ Seleccionar producto para agregar...</option>
                                {availableProducts.map(p => (
                                    <option key={p.sku} value={p.sku}>
                                        [{p.sku}] {p.name}
                                    </option>
                                ))}
                            </select>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleAddProductToOrder}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white h-9"
                            >
                                Agregar
                            </Button>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setEditingOrder(null)} className="border-slate-700 text-slate-300">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveOrderChanges}
                            disabled={savingOrder}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        >
                            {savingOrder ? 'Guardando...' : '💾 Guardar Modificaciones'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MODAL PARA EDITAR HORARIO DE ATENCIÓN DE TELEVENTA Y ENTRENAMIENTO DEL BOT */}
            <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
                <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-indigo-400" />
                            Horario de Atención de Televenta y Reglas del Bot
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-xs">
                            Configura los días y horas de atención de Televenta. Cuando un cliente solicite hablar con un asesor por WhatsApp, el bot le informará este horario y si su mensaje está dentro o fuera de horario laboral.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveTeleventaSchedule} className="space-y-3 py-2 text-xs">
                        <div>
                            <label className="text-xs font-bold text-slate-200 block mb-1">
                                📅 Días de Atención de Televenta
                            </label>
                            <Input
                                value={editScheduleDays}
                                onChange={e => setEditScheduleDays(e.target.value)}
                                placeholder="Ej. Lunes a Sábado"
                                className="bg-slate-950 border-slate-700 text-white h-9 text-xs"
                            />
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {['Lunes a Sábado', 'Lunes a Viernes', 'Lunes a Domingo'].map(preset => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setEditScheduleDays(preset)}
                                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700"
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-slate-200 block mb-1">
                                    🌅 Hora de Inicio (Apertura)
                                </label>
                                <Input
                                    type="time"
                                    value={editHoursStart}
                                    onChange={e => setEditHoursStart(e.target.value)}
                                    className="bg-slate-950 border-slate-700 text-white h-9 text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-200 block mb-1">
                                    🌇 Hora de Cierre (Fin)
                                </label>
                                <Input
                                    type="time"
                                    value={editHoursEnd}
                                    onChange={e => setEditHoursEnd(e.target.value)}
                                    className="bg-slate-950 border-slate-700 text-white h-9 text-xs"
                                />
                            </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-indigo-950/50 border border-indigo-500/30 text-[11px] text-indigo-200">
                            💬 <strong>Vista previa para el cliente:</strong>{' '}
                            <em>
                                "🕒 Nuestro horario de atención de Televenta es de {editScheduleDays || 'Lunes a Sábado'} de {editHoursStart || '08:00'} a {editHoursEnd || '18:00'} hrs."
                            </em>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-200 block mb-1">
                                🤖 Instrucciones / Entrenamiento Adicional para el Bot IA (Opcional)
                            </label>
                            <textarea
                                rows={3}
                                value={editBotRules}
                                onChange={e => setEditBotRules(e.target.value)}
                                placeholder="Ej. Recuerda ofrecer primero presentaciones retornables, mencionar que el pedido mínimo es de 1 caja..."
                                className="w-full rounded-lg bg-slate-950 border border-slate-700 text-white p-2 text-xs"
                            />
                        </div>

                        <DialogFooter className="gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setScheduleModalOpen(false)}
                                className="border-slate-700 text-slate-300"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={savingWaSettings}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                            >
                                {savingWaSettings ? 'Guardando...' : '💾 Guardar Horario de Atención'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL DE TICKET PDF / IMAGEN */}
            {receiptSale && (
                <ReceiptModal
                    sale={receiptSale}
                    client={receiptClient}
                    onClose={() => {
                        setReceiptSale(null);
                        setReceiptClient(null);
                    }}
                />
            )}
        </div>
    );
}
