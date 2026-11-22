import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Helmet } from 'react-helmet-async';
import { getTodayMexico } from '@/lib/dateUtils';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Loader2, Package, Calendar, CheckCircle, XCircle, Clock, 
    MessageSquare, User, Send, Smartphone, ShoppingCart, 
    Search, Filter, MapPin, DollarSign, Truck, AlertCircle, 
    UserCheck, Store, RefreshCw, Trash2, FileDown, Share2, Sparkles, ArrowUpDown, Phone
} from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";
import { supabase } from '../supabaseClient';
import { API_URL, getShopAuthHeaders } from '@/lib/api';
import { getClientByCode } from '@/repositories/clientsRepository';
import { awardPreventaPoints, deliverPreventa } from '@/lib/preventaPoints';
import ReceiptModal from '@/components/ReceiptModal';

const MEXICO_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

const getCurrentDayMexico = () => {
    return getTodayMexico() || new Date().toISOString().slice(0, 10);
};

const getCurrentMonthMexico = () => {
    const today = getTodayMexico();
    return today ? today.slice(0, 7) : new Date().toISOString().slice(0, 7);
};

const getPreviousMonthMexico = () => {
    const cur = getCurrentMonthMexico();
    const [year, month] = cur.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const py = prevDate.getFullYear();
    const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
    return `${py}-${pm}`;
};

export default function TeleventaShopOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ordersError, setOrdersError] = useState('');
    const [ordersWarning, setOrdersWarning] = useState('');
    
    // Filters State - Por defecto carga únicamente el MES ACTUAL para máxima velocidad
    const [searchTerm, setSearchTerm] = useState('');
    const [monthFilter, setMonthFilter] = useState(() => getCurrentMonthMexico());
    const [orderDateFilter, setOrderDateFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('pending'); // 'all' | 'pending' | 'confirmed' | 'delivered'
    const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'shop' | 'preventa'
    const [salesRouteFilter, setSalesRouteFilter] = useState('');
    const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'pending_first' | 'highest_amount'
    const [displayLimit, setDisplayLimit] = useState(36);
    const [expandedCards, setExpandedCards] = useState({});
    const [processing, setProcessing] = useState(null);
    const { toast } = useToast();
    const location = useLocation();
    const navigate = useNavigate();

    // 'orders' | 'support'
    const [viewMode, setViewMode] = useState('orders');

    // Support Chat State
    const [activeChats, setActiveChats] = useState([]);
    const [selectedChatClient, setSelectedChatClient] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [agentMessage, setAgentMessage] = useState('');
    const chatIntervalRef = useRef(null);

    // Modal State
    const [confirmingOrder, setConfirmingOrder] = useState(null);
    const [editItems, setEditItems] = useState([]);
    const [editCargo, setEditCargo] = useState(0);
    const [deliveryDate, setDeliveryDate] = useState(getTodayMexico());
    const [availableProducts, setAvailableProducts] = useState([]);
    const [selectedProductSku, setSelectedProductSku] = useState('');
    const [selectedProductPresCode, setSelectedProductPresCode] = useState('');
    const [receiptSale, setReceiptSale] = useState(null);
    const [receiptClient, setReceiptClient] = useState(null);
    const [receiptAutoSend, setReceiptAutoSend] = useState(false);

    useEffect(() => {
        loadProducts();
    }, []);

    // Cargar únicamente los pedidos del mes seleccionado (por defecto: mes actual)
    useEffect(() => {
        setDisplayLimit(36);
        loadOrders(monthFilter);
    }, [monthFilter]);

    // Handle incoming navigation from notifications or query params (?chat=...)
    useEffect(() => {
        const params = new URLSearchParams(location.search || '');
        const chatParam = params.get('chat');
        if (chatParam) {
            setViewMode('support');
            setSelectedChatClient(chatParam);
        } else if (location.state && location.state.openChat) {
            setViewMode('support');
            setSelectedChatClient(location.state.openChat);
        }
    }, [location]);

    // Poll for chats list (both in orders and support mode so badge stays updated)
    useEffect(() => {
        loadActiveChats();
        const interval = setInterval(loadActiveChats, 6000);
        return () => clearInterval(interval);
    }, [viewMode]);

    // Poll for messages when a chat is selected
    useEffect(() => {
        if (selectedChatClient) {
            loadChatHistory(selectedChatClient);
            chatIntervalRef.current = setInterval(() => loadChatHistory(selectedChatClient), 3000);
        } else {
            if (chatIntervalRef.current) clearInterval(chatIntervalRef.current);
            setChatMessages([]);
        }
        return () => { if (chatIntervalRef.current) clearInterval(chatIntervalRef.current); };
    }, [selectedChatClient]);

    async function loadProducts() {
        try {
            const response = await fetch(`${API_URL}/products/list.php`, { headers: await getShopAuthHeaders() });
            const data = await response.json();
            if (data.success) {
                setAvailableProducts(data.data);
            }
        } catch (error) {
            console.error('Error loading products:', error);
        }
    }

    async function loadOrders(targetMonth = monthFilter) {
        setLoading(true);
        setOrdersError('');
        setOrdersWarning('');

        const activeMonth = typeof targetMonth === 'string' ? targetMonth : monthFilter;

        // Calcular rango de fechas para consultar SOLO el mes solicitado en la base de datos
        let startIso = null;
        let endIso = null;
        if (activeMonth && activeMonth !== 'all' && /^\d{4}-\d{2}$/.test(activeMonth)) {
            const [y, m] = activeMonth.split('-').map(Number);
            // Margen de 1 día en UTC para cubrir diferencia horaria con America/Mexico_City
            startIso = new Date(Date.UTC(y, m - 1, 0, 0, 0, 0)).toISOString();
            endIso = new Date(Date.UTC(y, m, 2, 23, 59, 59)).toISOString();
        }

        let registeredCodesSet = new Set();

        const shopOrdersRequest = async () => {
            const monthQuery = activeMonth && activeMonth !== 'all' ? `?month=${encodeURIComponent(activeMonth)}` : '';
            const response = await fetch(`${API_URL}/televenta/orders-list.php${monthQuery}`, { headers: await getShopAuthHeaders() });
            const data = await response.json();
            if (!response.ok || !data.success || !Array.isArray(data.data)) {
                throw new Error(data.error || `No se pudieron cargar los pedidos de tienda (HTTP ${response.status}).`);
            }
            if (Array.isArray(data.registered_shop_codes)) {
                registeredCodesSet = new Set(data.registered_shop_codes.map(c => String(c || '').trim().toUpperCase()));
            }
            const shopOrders = data.data.map(order => ({
                ...order,
                source: 'shop',
                is_shop_registered: Boolean(order.is_shop_registered || registeredCodesSet.has(String(order.client_code || '').trim().toUpperCase())),
                created_by_name: order.client_name ? `${order.client_name} (Cliente)` : `Cliente Online (${order.client_code})`,
                created_by_role: 'Cliente Web',
                created_by_type: 'client'
            }));
            // Solo consultar clientes que aún no traigan nombre desde el JOIN del backend
            const missingCodes = [...new Set(
                shopOrders
                    .filter(o => !o.client_name && o.client_code)
                    .map(o => String(o.client_code))
            )];
            if (missingCodes.length) {
                try {
                    const { getClientsByCodes } = await import('@/repositories/clientsRepository');
                    const clients = await getClientsByCodes(missingCodes);
                    const clientByCode = new Map((clients || []).map(client => [
                        String(client.client_code || '').trim().toUpperCase(),
                        client
                    ]));
                    shopOrders.forEach(order => {
                        const cl = clientByCode.get(String(order.client_code || '').trim().toUpperCase());
                        if (!cl) return;
                        order.sales_route = cl?.sales_route || cl?.salesRoute || order.sales_route || '';
                        order.client_name = cl?.business_name || cl?.commercial_name || cl?.name || order.client_name || '';
                        order.phone = cl?.phone || cl?.telefono || order.phone || '';
                        if (order.client_name) {
                            order.created_by_name = `${order.client_name} (Cliente)`;
                        }
                    });
                } catch (clientError) {
                    console.warn('No se pudieron cargar rutas o nombres de clientes de tienda:', clientError);
                }
            }
            return shopOrders;
        };

        const preventasRequest = async () => {
            let query = supabase
                .from('preventa')
                .select('id, client_id, user_id, total_amount, status, created_at')
                .order('created_at', { ascending: false });

            let preventas = [];
            if (startIso && endIso) {
                const [monthRes, activeRes] = await Promise.all([
                    supabase
                        .from('preventa')
                        .select('id, client_id, user_id, total_amount, status, created_at')
                        .gte('created_at', startIso)
                        .lte('created_at', endIso)
                        .order('created_at', { ascending: false })
                        .limit(300),
                    supabase
                        .from('preventa')
                        .select('id, client_id, user_id, total_amount, status, created_at')
                        .in('status', ['pendiente', 'confirmado', 'cargado', 'en_ruta'])
                        .order('created_at', { ascending: false })
                        .limit(150)
                ]);
                if (monthRes.error) throw monthRes.error;
                const byId = new Map();
                (monthRes.data || []).forEach(r => byId.set(r.id, r));
                (activeRes.data || []).forEach(r => { if (!byId.has(r.id)) byId.set(r.id, r); });
                preventas = Array.from(byId.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            } else {
                const { data, error: preventasError } = await query.limit(200);
                if (preventasError) throw preventasError;
                preventas = data || [];
            }
            // Cargar overrides de precios, cantidades y estatus de preventas desde MySQL SIEMPRE
            // (incluso si Supabase devuelve 0 preventas o falla por RLS)
            let overridesByPreventa = {};
            try {
                const ovResp = await fetch(`${API_URL}/televenta/preventa-overrides.php`, { headers: await getShopAuthHeaders() });
                const ovData = await ovResp.json().catch(() => ({}));
                if (ovResp.ok && ovData.success && ovData.data) {
                    overridesByPreventa = ovData.data;
                }
            } catch (ovErr) {
                console.warn('No se pudieron consultar overrides de preventas:', ovErr);
            }

            if (!preventas?.length && Object.keys(overridesByPreventa).length === 0) return [];

            const clientIds = [...new Set(preventas.map(order => order.client_id).filter(Boolean))];
            const userIds = [...new Set(preventas.map(order => order.user_id).filter(Boolean))];
            const preventaIds = preventas.map(order => order.id);

            const [{ data: allItems, error: itemsError }, clients, profilesResult] = await Promise.all([
                supabase.from('preventa_items').select('*').in('preventa_id', preventaIds),
                (async () => {
                    if (!clientIds.length) return [];
                    try {
                        const { getClientsByIds } = await import('@/repositories/clientsRepository');
                        const clientsById = [];
                        const chunkSize = 40;
                        for (let index = 0; index < clientIds.length; index += chunkSize) {
                            const chunk = clientIds.slice(index, index + chunkSize);
                            const repoRows = await getClientsByIds(chunk).catch(() => []);
                            if (Array.isArray(repoRows) && repoRows.length > 0) {
                                clientsById.push(...repoRows);
                            }
                        }
                        return clientsById;
                    } catch (clientError) {
                        console.warn('No se pudieron cargar nombres de clientes para las preventas:', clientError);
                        return [];
                    }
                })(),
                (async () => {
                    if (!userIds.length) return { data: [] };
                    try {
                        // In Supabase profiles table, the user's name is stored in column 'name'
                        return await supabase.from('profiles').select('id, name, email, role').in('id', userIds);
                    } catch (pErr) {
                        console.warn('No se pudieron consultar perfiles de creadores:', pErr);
                        return { data: [] };
                    }
                })()
            ]);
            if (itemsError) throw itemsError;

            const profileById = new Map((profilesResult?.data || []).map(p => [p.id, p]));

            const normalizeSku = value => String(value || '').trim().toUpperCase();
            const skus = [...new Set((allItems || []).map(item => String(item.cve_marca || '').trim()).filter(Boolean))];
            let descriptionsBySku = new Map();
            if (skus.length) {
                const [pricesResult, descriptionsResult] = await Promise.all([
                    supabase.from('precios').select('cve_marca, des_marca').in('cve_marca', skus),
                    supabase.from('sku_descripcion').select('cve_marca, descripcion').in('cve_marca', skus)
                ]);
                if (pricesResult.error) console.warn('No se pudieron cargar nombres desde precios:', pricesResult.error);
                if (descriptionsResult.error) console.warn('No se pudieron cargar nombres desde sku_descripcion:', descriptionsResult.error);

                (descriptionsResult.data || []).forEach(product => {
                    const sku = normalizeSku(product.cve_marca);
                    const description = String(product.descripcion || '').trim();
                    if (sku && description) descriptionsBySku.set(sku, description);
                });
                (pricesResult.data || []).forEach(product => {
                    const sku = normalizeSku(product.cve_marca);
                    const description = String(product.des_marca || '').trim();
                    if (sku && description) descriptionsBySku.set(sku, description);
                });
            }

            const clientById = new Map((clients || []).map(client => [client.id, client]));
            const itemsByPreventa = new Map();
            (allItems || []).forEach(item => {
                const current = itemsByPreventa.get(item.preventa_id) || [];
                const sku = String(item.cve_marca || '').trim();
                const savedDescription = String(item.des_marca || '').trim();
                current.push({
                    sku,
                    product_name: savedDescription || descriptionsBySku.get(normalizeSku(sku)) || sku,
                    quantity: Number(item.quantity) || 0,
                    unit_price: Number(item.unit_price) || 0,
                    subtotal: Number(item.total_price) || (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
                });
                itemsByPreventa.set(item.preventa_id, current);
            });

            const mappedPreventas = (preventas || []).map(order => {
                const client = clientById.get(order.client_id);
                const profile = profileById.get(order.user_id);
                const ov = overridesByPreventa[order.id] || null;
                // Correctly resolve the creator's full name from profiles.name
                const creatorName = profile?.name || profile?.email || (order.user_id ? 'Usuario' : 'Preventista');
                const creatorRole = profile?.role || 'preventa';

                const rawStatus = String(ov?.status || order.status || 'pendiente').toLowerCase();
                const shopStatus = (rawStatus === 'entregado' || rawStatus === 'delivered') ? 'delivered'
                    : (rawStatus === 'rechazado' || rawStatus === 'cancelled') ? 'cancelled'
                    : rawStatus === 'parcial' ? 'partial'
                    : ['cargado', 'en_ruta', 'confirmed', 'confirmado'].includes(rawStatus) ? 'confirmed'
                    : 'pending';

                const finalItems = Array.isArray(ov?.items) && ov.items.length > 0
                    ? ov.items
                    : (itemsByPreventa.get(order.id) || []);
                const finalTotal = ov?.total_amount != null
                    ? Number(ov.total_amount)
                    : (Number(order.total_amount) || 0);

                return {
                    id: order.id,
                    order_number: `PREV-${String(order.id).slice(0, 8).toUpperCase()}`,
                    client_code: client?.client_code || ov?.client_code || order.client_id,
                    client_name: client?.business_name || client?.commercial_name || client?.name || ov?.client_name || (ov?.client_code ? `Cliente ${ov.client_code}` : ''),
                    phone: client?.phone || client?.telefono || ov?.phone || '',
                    total_amount: finalTotal,
                    cargo: Number(ov?.cargo) || 0,
                    sales_route: client?.sales_route || client?.salesRoute || ov?.sales_route || '',
                    status: shopStatus,
                    created_at: order.created_at,
                    delivery_date: ov?.delivery_date || null,
                    notes: ov?.notes || 'Pedido generado desde el simulador de Televenta',
                    items: finalItems,
                    source: 'preventa',
                    created_by_name: creatorName,
                    created_by_role: creatorRole,
                    created_by_type: 'staff',
                    created_by_email: profile?.email || '',
                    _needsMysqlSync: (shopStatus === 'pending' || shopStatus === 'confirmed') && (!ov || !ov.client_code) && Boolean(client?.client_code) && finalItems.length > 0
                };
            });

            // Agregar preventas que existan en shop_preventa_overrides (MySQL) aunque Supabase no las haya devuelto
            const seenPids = new Set(mappedPreventas.map(p => String(p.id)));
            Object.entries(overridesByPreventa).forEach(([pid, ov]) => {
                if (!pid || seenPids.has(String(pid)) || !ov) return;
                const rawSt = String(ov.status || 'pending').toLowerCase();
                if (['rechazado', 'cancelled'].includes(rawSt)) return;
                const normSt = ['entregado', 'delivered'].includes(rawSt)
                    ? 'delivered'
                    : ['confirmed', 'confirmado', 'cargado', 'en_ruta'].includes(rawSt)
                        ? 'confirmed'
                        : 'pending';
                const ovItems = Array.isArray(ov.items) ? ov.items.map(it => ({
                    sku: it.sku || it.cve_marca || '',
                    product_name: it.product_name || it.des_marca || it.sku || 'Producto',
                    quantity: Number(it.quantity) || 1,
                    presentation_code: it.presentation_code || null,
                    presentation_label: it.presentation_label || null,
                    base_quantity: it.base_quantity ?? (Number(it.quantity) || 1),
                    unit_price: Number(it.unit_price ?? it.price) || 0,
                    subtotal: Number(it.subtotal ?? it.total_price) || ((Number(it.quantity) || 1) * (Number(it.unit_price ?? it.price) || 0))
                })) : [];
                mappedPreventas.push({
                    id: pid,
                    order_number: `TV-${String(pid).slice(0, 8).toUpperCase()}`,
                    client_code: ov.client_code || '',
                    client_name: ov.client_name || (ov.client_code ? `Cliente ${ov.client_code}` : 'Cliente Preventa'),
                    phone: ov.phone || '',
                    sales_route: ov.sales_route || '',
                    created_at: ov.created_at || ov.updated_at || new Date().toISOString(),
                    delivery_date: ov.delivery_date || null,
                    status: normSt,
                    total_amount: ov.total_amount !== null && ov.total_amount !== undefined
                        ? Number(ov.total_amount)
                        : ovItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0),
                    cargo: Number(ov.cargo) || 0,
                    notes: ov.notes || 'Pedido levantado por Televenta en llamada',
                    items: ovItems,
                    source: 'preventa',
                    created_by_name: 'Televenta / Preventa',
                    created_by_role: 'televenta',
                    _needsMysqlSync: false
                });
            });

            // Enriquecer nombres de clientes faltantes usando getClientsByCodes (MySQL)
            const missingPrevCodes = [...new Set(
                mappedPreventas
                    .filter(p => p.client_code && (!p.client_name || p.client_name.startsWith('Cliente ')))
                    .map(p => String(p.client_code).trim())
            )];
            if (missingPrevCodes.length > 0) {
                try {
                    const { getClientsByCodes } = await import('@/repositories/clientsRepository');
                    const extraClients = await getClientsByCodes(missingPrevCodes);
                    const byCode = new Map((extraClients || []).map(c => [String(c.client_code || '').trim().toUpperCase(), c]));
                    mappedPreventas.forEach(p => {
                        const cl = byCode.get(String(p.client_code || '').trim().toUpperCase());
                        if (!cl) return;
                        p.client_name = cl.business_name || cl.commercial_name || cl.name || p.client_name;
                        p.phone = p.phone || cl.phone || cl.telefono || '';
                        p.sales_route = p.sales_route || cl.sales_route || cl.salesRoute || '';
                    });
                } catch (_) {}
            }

            // Sincronizar en segundo plano preventas pendientes/confirmadas hacia MySQL para que el cliente las vea en cervezasfinas.com.mx/orders
            const toSync = mappedPreventas.filter(p => p._needsMysqlSync).slice(0, 25);
            if (toSync.length > 0) {
                (async () => {
                    try {
                        const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
                        for (const p of toSync) {
                            await fetch(`${API_URL}/televenta/update-preventa.php`, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify({
                                    preventa_id: p.id,
                                    client_code: String(p.client_code),
                                    status: p.status,
                                    delivery_date: p.delivery_date,
                                    notes: p.notes,
                                    items: p.items
                                })
                            }).catch(() => {});
                        }
                    } catch (_) {}
                })();
            }

            return mappedPreventas;
        };

        try {
            const [shopResult, preventasResult] = await Promise.allSettled([shopOrdersRequest(), preventasRequest()]);
            const loadedOrders = [];
            const errors = [];

            if (shopResult.status === 'fulfilled') loadedOrders.push(...shopResult.value);
            else errors.push(`Pedidos de tienda: ${shopResult.reason?.message || 'error de consulta'}`);

            if (preventasResult.status === 'fulfilled') {
                const prevs = preventasResult.value.map(p => ({
                    ...p,
                    is_shop_registered: registeredCodesSet.has(String(p.client_code || '').trim().toUpperCase())
                }));
                loadedOrders.push(...prevs);
            } else {
                errors.push(`Preventas del simulador: ${preventasResult.reason?.message || 'error de consulta'}`);
            }

            loadedOrders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            setOrders(loadedOrders);
            if (loadedOrders.length === 0 && errors.length) setOrdersError(errors.join(' · '));
            else if (errors.length) setOrdersWarning(`No se cargó una de las fuentes. ${errors.join(' · ')}`);
        } catch (error) {
            console.error('Error loading orders:', error);
            setOrders([]);
            setOrdersError(error.message || 'Error al consultar los pedidos.');
        } finally {
            setLoading(false);
        }
    }

    async function loadActiveChats() {
        try {
            const response = await fetch(`${API_URL}/televenta/chat/list.php`, { headers: await getShopAuthHeaders() });
            const data = await response.json();
            if (data.success) {
                setActiveChats(data.data);
            }
        } catch (error) {
            console.error('Error loading active chats:', error);
        }
    }

    async function loadChatHistory(clientCode) {
        try {
            const response = await fetch(`${API_URL}/televenta/chat/history.php?client_code=${clientCode}`, { headers: await getShopAuthHeaders() });
            const data = await response.json();
            if (data.success) {
                setChatMessages(data.data);
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    async function sendAgentMessage(e) {
        e.preventDefault();
        if (!agentMessage.trim() || !selectedChatClient) return;

        try {
            const response = await fetch(`${API_URL}/televenta/chat/send.php`, {
                method: 'POST',
                headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    client_code: selectedChatClient,
                    message: agentMessage
                })
            });

            const data = await response.json();
            if (data.success) {
                setAgentMessage('');
                if (data.whatsapp_sent) {
                    toast({
                        title: '💬 Enviado al WhatsApp del cliente',
                        description: 'Tu respuesta fue entregada directamente en la conversación oficial de WhatsApp.',
                    });
                }
                loadChatHistory(selectedChatClient);
                loadActiveChats();
            } else {
                alert('Error enviando mensaje: ' + data.error);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    async function resumeBotForClient(clientCode) {
        if (!clientCode) return;
        try {
            const response = await fetch(`${API_URL}/televenta/chat/send.php`, {
                method: 'POST',
                headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    client_code: clientCode,
                    action: 'resume_bot'
                })
            });
            const data = await response.json();
            if (data.success) {
                toast({
                    title: '🤖 Bot IA Reactivado',
                    description: 'El cliente ha sido devuelto al asistente automático de pedidos en WhatsApp.',
                });
                loadChatHistory(clientCode);
                loadActiveChats();
            }
        } catch (error) {
            console.error('Error reactivando bot:', error);
        }
    }

    function openReceiptForOrder(order, autoSend = false, overrideItems = null, overrideTotal = null, overrideDeliveryDate = null, overrideCargo = null) {
        if (!order) return;
        try {
            const rawItems = overrideItems || order.items || [];
            const ticketItems = rawItems.map(i => {
                const baseName = i.name || i.product_name || i.des_marca || i.sku || 'Producto';
                const presTag = i.presentation_label ? ` [${i.presentation_label}]` : ' [Caja]';
                const fullLabel = baseName.includes('[') ? baseName : `${baseName}${presTag}`;
                return {
                    cve_marca: i.sku || i.cve_marca || '',
                    des_marca: fullLabel,
                    name: fullLabel,
                    presentation_label: i.presentation_label || 'Caja',
                    quantity: Number(i.quantity) || 1,
                    price: Number(i.unit_price ?? i.price) || (Number(i.subtotal || 0) / Math.max(1, Number(i.quantity) || 1))
                };
            });

            const computedTotal = overrideTotal != null
                ? Number(overrideTotal)
                : (Number(order.total_amount) || ticketItems.reduce((sum, it) => sum + (it.quantity * it.price), 0));

            const initialClient = {
                client_code: order.client_code || '',
                name: order.client_name || `Cliente ${order.client_code || ''}`,
                business_name: order.client_name || `Cliente ${order.client_code || ''}`,
                phone: order.phone || '',
                is_shop_registered: Boolean(order.is_shop_registered)
            };

            // Abrir el modal de inmediato sin bloquear la interfaz
            setReceiptAutoSend(Boolean(autoSend));
            setReceiptClient(initialClient);
            setReceiptSale({
                id: order.order_number || order.id,
                preventaId: order.order_number || order.id,
                totalAmount: computedTotal,
                cargo: Number(overrideCargo ?? order.cargo ?? 0) || 0,
                items: ticketItems,
                delivery_date: overrideDeliveryDate || order.delivery_date || null,
                created_at: order.created_at || new Date().toISOString()
            });

            // Solo si falta el teléfono o nombre del cliente, enriquecer en segundo plano sin trabar la UI
            if (order.client_code && (!order.phone || !order.client_name)) {
                getClientByCode(order.client_code)
                    .then(clientData => {
                        if (!clientData) return;
                        setReceiptClient(prev => {
                            if (!prev || prev.client_code !== (order.client_code || '')) return prev;
                            return {
                                ...prev,
                                ...clientData,
                                client_code: clientData.client_code || prev.client_code,
                                name: clientData.business_name || clientData.name || prev.name,
                                business_name: clientData.business_name || clientData.name || prev.business_name,
                                phone: clientData.phone || clientData.telefono || prev.phone
                            };
                        });
                    })
                    .catch(() => {});
            }
        } catch (err) {
            console.error('Error abriendo ticket del pedido:', err);
            toast({
                title: 'Error al generar ticket',
                description: 'No se pudo preparar la vista previa del ticket.',
                variant: 'destructive'
            });
        }
    }

    function openConfirmModal(order) {
        setConfirmingOrder(order);
        setEditItems(order.items.map(i => ({
            id: i.id || null,
            sku: i.sku,
            name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price || 0,
            presentation_code: i.presentation_code || null,
            presentation_label: i.presentation_label || null,
            base_quantity: i.base_quantity ?? null
        })));
        setDeliveryDate(order.delivery_date ? new Date(order.delivery_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setEditCargo(Number(order.cargo) || 0);
        setSelectedProductSku('');
        setSelectedProductPresCode('');
    }

    function handleAddProduct() {
        if (!selectedProductSku) return;
        const product = availableProducts.find(p => p.sku == selectedProductSku);
        if (!product) return;

        const presentations = Array.isArray(product.presentations) ? product.presentations : [];
        const chosenPres = presentations.find(pr => pr.code === selectedProductPresCode)
            || presentations.find(pr => Number(pr.is_default) === 1)
            || presentations[0]
            || null;
        const presCode = chosenPres?.code || null;
        const presLabel = chosenPres?.label || null;
        const divisor = chosenPres ? Math.max(0.0001, Number(chosenPres.divisor) || 1) : 1;
        const unitPrice = chosenPres
            ? Number(chosenPres.unit_price ?? product.priceData?.unit_price ?? product.base_price ?? 0)
            : Number(product.priceData?.unit_price ?? product.base_price ?? 0);

        const existingIdx = editItems.findIndex(i =>
            i.sku == product.sku && (i.presentation_code || null) === presCode
        );
        if (existingIdx >= 0) {
            const newItems = [...editItems];
            const nextQty = (Number(newItems[existingIdx].quantity) || 0) + 1;
            newItems[existingIdx] = {
                ...newItems[existingIdx],
                quantity: nextQty,
                base_quantity: Number((nextQty / divisor).toFixed(4))
            };
            setEditItems(newItems);
        } else {
            setEditItems([...editItems, {
                sku: product.sku,
                name: product.name,
                quantity: 1,
                unit_price: unitPrice,
                presentation_code: presCode,
                presentation_label: presLabel,
                base_quantity: Number((1 / divisor).toFixed(4))
            }]);
        }
        setSelectedProductSku('');
        setSelectedProductPresCode('');
    }

    async function handleDeliverOrder(order) {
        const isRegisteredInShop = Boolean(order.is_shop_registered);
        const confirmMsg = isRegisteredInShop
            ? '¿Marcar este pedido como entregado? Se otorgarán puntos al cliente (registrado en UM6 SHOP).'
            : '¿Marcar este pedido como entregado? (Este cliente NO está registrado en UM6 SHOP, por lo que no se entregarán puntos).';
        if (!confirm(confirmMsg)) return;

        setProcessing(order.id);
        try {
            if (order.source === 'preventa') {
                await deliverPreventa(order.id);

                if (!isRegisteredInShop) {
                    alert('Preventa marcada como entregada. (Sin puntos: el cliente no está registrado en UM6 SHOP).');
                    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'delivered' } : o));
                    loadOrders();
                    return;
                }

                try {
                    const points = await awardPreventaPoints(order.id, order);
                    if (points?.skipped) {
                        alert('Preventa marcada como entregada. (Sin puntos: el cliente no está registrado en UM6 SHOP).');
                    } else {
                        alert(`Preventa entregada con éxito. Puntos acreditados al cliente: ${points.points_awarded ?? 0}`);
                    }
                } catch (pointsError) {
                    console.error('No se pudieron acreditar los puntos de la preventa de inmediato:', pointsError);
                    try {
                        const { addPendingOperation } = await import('@/sync/syncService');
                        await addPendingOperation({
                            entity_type: 'preventa_points',
                            operation: 'award',
                            payload: { preventa_id: order.id },
                            created_at: new Date().toISOString()
                        });
                        alert('Preventa entregada. La acreditación de puntos quedó encolada para reintento automático.');
                    } catch (queueError) {
                        console.error('No se pudo encolar el crédito de puntos:', queueError);
                        alert('La preventa se marcó como entregada, pero hubo un detalle al acreditar los puntos.');
                    }
                }
                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'delivered' } : o));
                loadOrders();
                return;
            }

            const shopOrderId = Number(order.id);
            const orderNumber = String(order.order_number || '').trim();
            if ((!Number.isInteger(shopOrderId) || shopOrderId <= 0) && !orderNumber) {
                throw new Error(`El pedido ${orderNumber} no tiene un ID numérico válido.`);
            }

            const response = await fetch(`${API_URL}/televenta/deliver-order.php`, {
                method: 'POST',
                headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    order_id: Number.isInteger(shopOrderId) ? shopOrderId : 0,
                    order_number: orderNumber
                })
            });

            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                if (data.data?.skipped || !isRegisteredInShop) {
                    alert('Pedido marcado como entregado. (Sin puntos: el cliente no está registrado en UM6 SHOP).');
                } else {
                    alert(`Pedido entregado con éxito. Puntos otorgados: ${data.data?.points_awarded ?? 0}`);
                }
                loadOrders();
            } else {
                console.error('Respuesta de deliver-order.php:', response.status, data.details || data);
                throw new Error(data.error || data.details || `No se pudo marcar como entregado (HTTP ${response.status}).`);
            }
        } catch (error) {
            console.error('Error marcando pedido como entregado:', error);
            alert(`Error: ${error.message || 'Error desconocido'}`);
        } finally {
            setProcessing(null);
        }
    }

    async function submitConfirmation() {
        if (!confirmingOrder) return;
        const activeItems = (editItems || []).filter(i => (Number(i.quantity) || 0) > 0);
        if (activeItems.length === 0) {
            alert('No puedes confirmar un pedido sin productos con cantidad mayor a 0.');
            return;
        }
        setProcessing(confirmingOrder.id);

        try {
            let data = { success: false };
            const cargoVal = Math.max(0, Number(editCargo) || 0);
            const itemsSum = activeItems.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)), 0);
            const finalOrderTotal = itemsSum + cargoVal;

            if (confirmingOrder.source === 'preventa') {
                const response = await fetch(`${API_URL}/televenta/update-preventa.php`, {
                    method: 'POST',
                    headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        preventa_id: confirmingOrder.id,
                        client_code: confirmingOrder.client_code || '',
                        delivery_date: deliveryDate,
                        status: 'confirmed',
                        cargo: cargoVal,
                        items: activeItems
                    })
                });
                data = await response.json().catch(() => ({}));

                // Intentar también actualizar en Supabase si el usuario tiene permiso directo
                try {
                    await supabase.from('preventa').update({ total_amount: finalOrderTotal, cargo: cargoVal }).eq('id', confirmingOrder.id);
                    for (const it of activeItems) {
                        await supabase
                            .from('preventa_items')
                            .update({
                                quantity: Number(it.quantity) || 0,
                                unit_price: Number(it.unit_price) || 0,
                                total_price: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
                            })
                            .eq('preventa_id', confirmingOrder.id)
                            .eq('cve_marca', it.sku);
                    }
                } catch (sbErr) {
                    console.warn('Warning updating preventa in Supabase directly:', sbErr);
                }
            } else {
                const response = await fetch(`${API_URL}/televenta/confirm-order.php`, {
                    method: 'POST',
                    headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        order_id: confirmingOrder.id,
                        order_number: confirmingOrder.order_number || '',
                        delivery_date: deliveryDate,
                        cargo: cargoVal,
                        items: editItems
                    })
                });
                data = await response.json().catch(() => ({}));
            }

            if (data.success) {
                await openReceiptForOrder(confirmingOrder, false, activeItems, finalOrderTotal, deliveryDate, cargoVal);

                setConfirmingOrder(null);
                loadOrders();
            } else {
                alert('Error: ' + (data.error || 'No se pudo actualizar el pedido'));
            }
        } catch (error) {
            alert('Error al confirmar el pedido');
        } finally {
            setProcessing(null);
        }
    }

    const salesRoutes = useMemo(() => {
        return [...new Set(orders
            .map(order => String(order.sales_route || '').trim())
            .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    }, [orders]);

    const mexicoOrderDay = value => {
        if (!value) return '';
        const str = String(value);
        // Fast path for ISO strings if needed, or shared formatter
        const date = new Date(str);
        if (Number.isNaN(date.getTime())) return '';
        return MEXICO_DAY_FORMATTER.format(date);
    };

    const mexicoOrderMonth = value => {
        const day = mexicoOrderDay(value);
        return day ? day.slice(0, 7) : '';
    };

    const formatRelativeTime = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const diffMs = Date.now() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Hace unos segundos';
        if (diffMin < 60) return `Hace ${diffMin} min`;
        const diffHrs = Math.floor(diffMin / 60);
        if (diffHrs < 24) return `Hace ${diffHrs} h`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays === 1) return 'Ayer';
        if (diffDays < 30) return `Hace ${diffDays} días`;
        return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Filter and sort orders (Always Newest First by default!)
    const visibleOrders = useMemo(() => {
        const filtered = orders.filter(order => {
            const orderMonth = mexicoOrderMonth(order.created_at);
            const matchesMonth = !monthFilter || monthFilter === 'all' || orderMonth === monthFilter;

            const orderDay = mexicoOrderDay(order.created_at);
            const matchesDate = !orderDateFilter || orderDay === orderDateFilter;
            
            const route = String(order.sales_route || '').trim();
            const matchesRoute = !salesRouteFilter
                || (salesRouteFilter === '__no_route__' ? !route : route === salesRouteFilter);
            
            const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
            const matchesSource = sourceFilter === 'all' || order.source === sourceFilter;

            const searchLower = searchTerm.trim().toLowerCase();
            const matchesSearch = !searchLower || (
                String(order.order_number || '').toLowerCase().includes(searchLower) ||
                String(order.client_code || '').toLowerCase().includes(searchLower) ||
                String(order.client_name || '').toLowerCase().includes(searchLower) ||
                String(order.created_by_name || '').toLowerCase().includes(searchLower) ||
                String(order.sales_route || '').toLowerCase().includes(searchLower) ||
                String(order.phone || '').toLowerCase().includes(searchLower)
            );

            return matchesMonth && matchesDate && matchesRoute && matchesStatus && matchesSource && matchesSearch;
        });

        return [...filtered].sort((a, b) => {
            const timeA = new Date(a.created_at || 0).getTime() || 0;
            const timeB = new Date(b.created_at || 0).getTime() || 0;
            const idDiff = (Number(b.id) || 0) - (Number(a.id) || 0);

            if (sortBy === 'pending_first') {
                const aPend = a.status === 'pending' ? 1 : 0;
                const bPend = b.status === 'pending' ? 1 : 0;
                if (bPend !== aPend) return bPend - aPend;
                return (timeB - timeA) || idDiff;
            }
            if (sortBy === 'highest_amount') {
                const diffAmt = (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0);
                if (diffAmt !== 0) return diffAmt;
                return (timeB - timeA) || idDiff;
            }
            // Default: 'newest' -> Newest orders first
            return (timeB - timeA) || idDiff;
        });
    }, [orders, monthFilter, orderDateFilter, salesRouteFilter, statusFilter, sourceFilter, searchTerm, sortBy]);

    // KPI Counters for currently filtered scope (e.g. Current Month)
    const kpis = useMemo(() => {
        // Calculate based on the selected month
        const scopedOrders = orders.filter(order => {
            const orderMonth = mexicoOrderMonth(order.created_at);
            return !monthFilter || monthFilter === 'all' || orderMonth === monthFilter;
        });

        const total = scopedOrders.length;
        const pending = scopedOrders.filter(o => o.status === 'pending').length;
        const confirmed = scopedOrders.filter(o => o.status === 'confirmed').length;
        const delivered = scopedOrders.filter(o => o.status === 'delivered').length;
        const totalAmount = scopedOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        return { total, pending, confirmed, delivered, totalAmount };
    }, [orders, monthFilter]);

    const getStatusBadge = (status) => {
        const badges = {
            pending: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: Clock, text: 'Pendiente' },
            confirmed: { color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: CheckCircle, text: 'Confirmado' },
            delivered: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle, text: 'Entregado' },
            partial: { color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', icon: Clock, text: 'Entrega parcial' },
            cancelled: { color: 'bg-rose-500/15 text-rose-400 border-rose-500/30', icon: XCircle, text: 'Cancelado' },
        };

        const badge = badges[status] || badges.pending;
        const Icon = badge.icon;

        return (
            <Badge className={`${badge.color} border flex items-center gap-1 font-semibold text-xs px-2.5 py-0.5`}>
                <Icon className="w-3.5 h-3.5" />
                {badge.text}
            </Badge>
        );
    };

    return (
        <div className="container mx-auto p-4 md:p-6 max-w-7xl relative space-y-6">
            <Helmet>
                <title>Pedidos de Tienda y Televenta | Cervezas Finas</title>
            </Helmet>

            {/* Header controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Pedidos & Televenta</h1>
                    <p className="text-muted-foreground text-sm mt-1">Gestión de pedidos de tienda online y preventas con trazabilidad del preventista creador.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        variant={viewMode === 'orders' ? 'default' : 'outline'}
                        onClick={() => setViewMode('orders')}
                        className="font-medium"
                    >
                        <Package className="w-4 h-4 mr-2" />
                        Pedidos ({visibleOrders.length})
                    </Button>
                    <Button
                        variant={viewMode === 'support' ? 'default' : 'outline'}
                        onClick={() => setViewMode('support')}
                        className={viewMode === 'support' ? "bg-blue-600 hover:bg-blue-700 text-white" : "font-medium"}
                    >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Soporte
                        {activeChats.some(c => c.unread_count > 0) && (
                            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                                {activeChats.reduce((sum, c) => sum + parseInt(c.unread_count || 0), 0)}
                            </span>
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => navigate('/televenta/atencion-cliente')}
                        className="font-bold border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/40"
                    >
                        <UserCheck className="w-4 h-4 mr-2" />
                        Centro de Ayuda 360°
                    </Button>
                    <Button onClick={loadOrders} variant="outline" size="icon" title="Recargar pedidos">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {viewMode === 'orders' ? (
                <div className="space-y-6">
                    {/* KPI Summary Cards with High Contrast & Dark Theme Support */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                        <Card className="shadow-md border border-border border-l-4 border-l-primary bg-card">
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Total Pedidos</p>
                                <p className="text-2xl font-black mt-1 text-foreground">{kpis.total}</p>
                            </CardContent>
                        </Card>
                        <Card className="shadow-md border border-border border-l-4 border-l-amber-500 bg-card">
                            <CardContent className="p-4">
                                <p className="text-xs text-amber-500 dark:text-amber-400 font-bold uppercase tracking-wider">Pendientes</p>
                                <p className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-1">{kpis.pending}</p>
                            </CardContent>
                        </Card>
                        <Card className="shadow-md border border-border border-l-4 border-l-blue-500 bg-card">
                            <CardContent className="p-4">
                                <p className="text-xs text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider">Confirmados</p>
                                <p className="text-2xl font-black text-blue-500 dark:text-blue-400 mt-1">{kpis.confirmed}</p>
                            </CardContent>
                        </Card>
                        <Card className="shadow-md border border-border border-l-4 border-l-emerald-500 bg-card">
                            <CardContent className="p-4">
                                <p className="text-xs text-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-wider">Entregados</p>
                                <p className="text-2xl font-black text-emerald-500 dark:text-emerald-400 mt-1">{kpis.delivered}</p>
                            </CardContent>
                        </Card>
                        <Card className="shadow-md border border-border border-l-4 border-l-purple-500 bg-card col-span-2 lg:col-span-1">
                            <CardContent className="p-4">
                                <p className="text-xs text-purple-400 font-bold uppercase tracking-wider">Monto Total</p>
                                <p className="text-xl md:text-2xl font-black text-purple-400 dark:text-purple-300 mt-1 truncate">
                                    ${kpis.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Modern Filter Bar */}
                    <Card className="shadow-md border-border bg-card">
                        <CardContent className="p-4 space-y-4">
                            {/* Row 1: Search + Quick Source Filter Tabs */}
                            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                                {/* Search input */}
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por #pedido, cliente, o preventista / creador..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="h-10 w-full pl-9 pr-4 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    {searchTerm && (
                                        <button 
                                            onClick={() => setSearchTerm('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Source Toggle (Todas, Tienda, Preventa) */}
                                <div className="flex rounded-md border border-border p-1 bg-muted/30 self-start md:self-auto">
                                    <button
                                        onClick={() => setSourceFilter('all')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${sourceFilter === 'all' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Todas ({orders.length})
                                    </button>
                                    <button
                                        onClick={() => setSourceFilter('preventa')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1 ${sourceFilter === 'preventa' ? 'bg-background shadow text-purple-400 font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        <Smartphone className="w-3.5 h-3.5" />
                                        Preventas ({orders.filter(o => o.source === 'preventa').length})
                                    </button>
                                    <button
                                        onClick={() => setSourceFilter('shop')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1 ${sourceFilter === 'shop' ? 'bg-background shadow text-blue-400 font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        <ShoppingCart className="w-3.5 h-3.5" />
                                        Tienda Online ({orders.filter(o => o.source === 'shop').length})
                                    </button>
                                </div>
                            </div>

                            {/* Row 2: Month & Date Quick Selector + Sort Order */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant={monthFilter === getCurrentMonthMexico() && !orderDateFilter ? 'default' : 'outline'}
                                        onClick={() => { setMonthFilter(getCurrentMonthMexico()); setOrderDateFilter(''); }}
                                        className="h-8 text-xs font-bold"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                                        Mes actual ({getCurrentMonthMexico()})
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant={monthFilter === getPreviousMonthMexico() && !orderDateFilter ? 'default' : 'outline'}
                                        onClick={() => { setMonthFilter(getPreviousMonthMexico()); setOrderDateFilter(''); }}
                                        className="h-8 text-xs font-medium"
                                    >
                                        Mes pasado ({getPreviousMonthMexico()})
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant={orderDateFilter === getCurrentDayMexico() ? 'default' : 'outline'}
                                        onClick={() => {
                                            if (monthFilter !== getCurrentMonthMexico()) setMonthFilter(getCurrentMonthMexico());
                                            setOrderDateFilter(getCurrentDayMexico());
                                        }}
                                        className="h-8 text-xs font-medium"
                                    >
                                        Solo Hoy
                                    </Button>

                                    <div className="flex items-center gap-1.5 bg-muted/40 px-2.5 py-1 rounded-md border border-border">
                                        <Calendar className="w-3.5 h-3.5 text-primary" />
                                        <input
                                            type="month"
                                            value={monthFilter === 'all' ? '' : monthFilter}
                                            onChange={e => {
                                                setMonthFilter(e.target.value || getCurrentMonthMexico());
                                                setOrderDateFilter('');
                                            }}
                                            className="h-6 rounded border border-input bg-background px-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                </div>

                                {/* Status Tabs */}
                                <div className="flex flex-wrap gap-1.5">
                                    <Button
                                        size="sm"
                                        variant={statusFilter === 'all' ? 'default' : 'outline'}
                                        onClick={() => setStatusFilter('all')}
                                        className="h-8 text-xs font-medium"
                                    >
                                        Todos
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={statusFilter === 'pending' ? 'default' : 'outline'}
                                        onClick={() => setStatusFilter('pending')}
                                        className={`h-8 text-xs font-medium ${statusFilter !== 'pending' && kpis.pending > 0 ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' : ''}`}
                                    >
                                        Pendientes ({kpis.pending})
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={statusFilter === 'confirmed' ? 'default' : 'outline'}
                                        onClick={() => setStatusFilter('confirmed')}
                                        className="h-8 text-xs font-medium"
                                    >
                                        Confirmados ({kpis.confirmed})
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={statusFilter === 'delivered' ? 'default' : 'outline'}
                                        onClick={() => setStatusFilter('delivered')}
                                        className="h-8 text-xs font-medium"
                                    >
                                        Entregados ({kpis.delivered})
                                    </Button>
                                </div>
                            </div>

                            {/* Row 3: Secondary Filters: Sort Order, Exact Day, Route, Reset */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border">
                                <label className="space-y-1 text-xs">
                                    <span className="font-semibold text-muted-foreground flex items-center gap-1">
                                        <ArrowUpDown className="w-3.5 h-3.5 text-primary" /> Ordenar pedidos por:
                                    </span>
                                    <select
                                        value={sortBy}
                                        onChange={event => setSortBy(event.target.value)}
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold text-foreground"
                                    >
                                        <option value="newest">⚡ Más nuevos primero (Recientes arriba)</option>
                                        <option value="pending_first">⏳ Pendientes primero y luego más nuevos</option>
                                        <option value="highest_amount">💰 Mayor monto primero</option>
                                    </select>
                                </label>

                                <label className="space-y-1 text-xs">
                                    <span className="font-semibold text-muted-foreground">Filtrar por día exacto:</span>
                                    <input
                                        type="date"
                                        value={orderDateFilter}
                                        onChange={event => setOrderDateFilter(event.target.value)}
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground"
                                    />
                                </label>

                                <label className="space-y-1 text-xs">
                                    <span className="font-semibold text-muted-foreground">Filtrar por ruta de ventas:</span>
                                    <select
                                        value={salesRouteFilter}
                                        onChange={event => setSalesRouteFilter(event.target.value)}
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground"
                                    >
                                        <option value="">Todas las rutas</option>
                                        {salesRoutes.map(route => <option key={route} value={route}>{route}</option>)}
                                        {orders.some(order => !String(order.sales_route || '').trim()) && (
                                            <option value="__no_route__">Sin ruta asignada</option>
                                        )}
                                    </select>
                                </label>

                                <div className="flex items-end">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => { 
                                            setMonthFilter(getCurrentMonthMexico());
                                            setOrderDateFilter(''); 
                                            setSalesRouteFilter(''); 
                                            setSearchTerm(''); 
                                            setStatusFilter('all'); 
                                            setSourceFilter('all');
                                            setSortBy('newest');
                                        }}
                                        className="text-xs text-muted-foreground hover:text-foreground h-9 w-full sm:w-auto"
                                    >
                                        Restablecer al Mes Actual
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Orders List Content */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-muted-foreground text-sm">Cargando pedidos y preventas...</p>
                        </div>
                    ) : visibleOrders.length === 0 ? (
                        <Card className="shadow-md border-border bg-card">
                            <CardContent className="py-16 text-center">
                                {orders.length === 0 && ordersError ? (
                                    <>
                                        <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
                                        <p className="font-semibold text-lg text-destructive">No se pudieron cargar los pedidos</p>
                                        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{ordersError}</p>
                                        <Button className="mt-4" variant="outline" onClick={loadOrders}>Reintentar consulta</Button>
                                    </>
                                ) : (
                                    <>
                                        <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4 opacity-40" />
                                        <p className="text-lg font-semibold text-foreground">
                                            No hay pedidos para los filtros seleccionados
                                        </p>
                                        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                                            {monthFilter !== 'all' ? `Consultando mes: ${monthFilter}. ` : ''}
                                            Puedes consultar el mes pasado o limpiar los filtros de búsqueda.
                                        </p>
                                        <div className="flex justify-center gap-2 mt-4">
                                            <Button 
                                                variant="outline" 
                                                onClick={() => { setMonthFilter(getPreviousMonthMexico()); setOrderDateFilter(''); setSearchTerm(''); setStatusFilter('all'); setSourceFilter('all'); setSortBy('newest'); }}
                                            >
                                                Ver Mes Pasado ({getPreviousMonthMexico()})
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                onClick={() => { setMonthFilter(getCurrentMonthMexico()); setOrderDateFilter(''); setSearchTerm(''); setStatusFilter('all'); setSourceFilter('all'); setSortBy('newest'); }}
                                            >
                                                Mes Actual ({getCurrentMonthMexico()})
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {ordersWarning && (
                                <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>{ordersWarning}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap justify-between items-center gap-2 text-xs font-semibold text-muted-foreground px-1">
                                <span className="flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                    Mostrando {Math.min(displayLimit, visibleOrders.length)} de {visibleOrders.length} {visibleOrders.length === 1 ? 'pedido' : 'pedidos'} del mes <strong className="text-primary">{monthFilter}</strong>
                                </span>
                                <span className="text-muted-foreground">El ticket se genera únicamente al consultarlo en cada tarjeta</span>
                            </div>

                            {/* Grid de Cards estilo Clientes */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {visibleOrders.slice(0, displayLimit).map((order, orderIndex) => {
                                    const cardKey = `${order.source || 'shop'}-${order.id || order.order_number || orderIndex}`;
                                    const isPreventa = order.source === 'preventa';
                                    const isToday = mexicoOrderDay(order.created_at) === getCurrentDayMexico();
                                    const relativeTime = formatRelativeTime(order.created_at);
                                    const isExpanded = Boolean(expandedCards[cardKey]);
                                    const totalBoxes = (order.items || []).reduce((sum, it) => sum + (Number(it.base_quantity ?? it.quantity) || 0), 0);
                                    const itemsList = order.items || [];
                                    const previewItems = isExpanded ? itemsList : itemsList.slice(0, 2);

                                    return (
                                        <div
                                            key={cardKey}
                                            className="rounded-xl border border-slate-800 bg-slate-900/90 hover:border-slate-700 transition-all duration-150 shadow-md flex flex-col justify-between overflow-hidden"
                                        >
                                            {/* Franja superior de color según origen */}
                                            <div
                                                className="h-1.5 w-full"
                                                style={{ backgroundColor: isPreventa ? '#a855f7' : '#3b82f6' }}
                                            />

                                            <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                                                {/* 1. Encabezado de la Card de Cliente */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <h3
                                                                className="font-extrabold text-base text-white uppercase tracking-tight truncate flex items-center gap-1.5"
                                                                title={order.client_name || `Cliente ${order.client_code}`}
                                                            >
                                                                <Store className="w-4 h-4 text-amber-400 shrink-0" />
                                                                <span className="truncate">
                                                                    {order.client_name || `CLIENTE ${order.client_code || ''}`}
                                                                </span>
                                                            </h3>
                                                            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400 mt-0.5">
                                                                <span>
                                                                    Código: <strong className="text-slate-200 font-mono">{order.client_code || '---'}</strong>
                                                                </span>
                                                                {order.sales_route && (
                                                                    <span>
                                                                        • Ruta: <strong className="text-emerald-400">{order.sales_route}</strong>
                                                                    </span>
                                                                )}
                                                                <span>
                                                                    • Tel: <strong className="text-slate-300 font-mono">{order.phone || 'No disponible'}</strong>
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0">
                                                            {getStatusBadge(order.status)}
                                                        </div>
                                                    </div>

                                                    {/* Badges de Pedido, Fecha y Origen */}
                                                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                                                            #{order.order_number}
                                                        </span>

                                                        {isToday && (
                                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                                🔥 HOY
                                                            </span>
                                                        )}

                                                        {isPreventa ? (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                                                Preventa
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                                                UM6 SHOP
                                                            </span>
                                                        )}

                                                        {order.is_shop_registered ? (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Cliente registrado en UM6 SHOP: sí acumula puntos">
                                                                ⭐ Shop (Puntos)
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700" title="Cliente no registrado en UM6 SHOP: no acumula puntos">
                                                                Sin Shop (0 pts)
                                                            </span>
                                                        )}

                                                        <span className="text-[11px] text-slate-400 ml-auto flex items-center gap-1">
                                                            <Clock className="w-3 h-3 text-slate-500" />
                                                            {relativeTime || new Date(order.created_at).toLocaleDateString('es-MX')}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* 2. Resumen compacto estilo Card de Cliente (Cajas, Monto y Preventista) */}
                                                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs">
                                                    <div>
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                                                            Volumen Pedido
                                                        </span>
                                                        <span className="text-sm font-black text-white">
                                                            {totalBoxes} {totalBoxes === 1 ? 'caja' : 'cajas'}
                                                        </span>
                                                        <span className="text-[11px] text-slate-400 block truncate" title={order.created_by_name}>
                                                            👤 {order.created_by_name || 'Preventista'}
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                                                            Total Pedido
                                                        </span>
                                                        <span className="text-base font-black text-emerald-400 font-mono">
                                                            ${parseFloat(order.total_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 block">
                                                            {new Date(order.created_at).toLocaleString('es-MX', {
                                                                timeZone: 'America/Mexico_City',
                                                                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* 3. Lista compacta de productos (2 visibles + botón desplegable) */}
                                                <div className="space-y-1 text-xs">
                                                    <div className="divide-y divide-slate-800/70 rounded-lg border border-slate-800/80 bg-slate-950/40 px-2.5 py-1">
                                                        {previewItems.map((item, idx) => (
                                                            <div key={idx} className="py-1 flex items-center justify-between gap-2">
                                                                <span className="truncate text-slate-200 font-medium flex items-center gap-1.5 min-w-0">
                                                                    <strong className="text-emerald-400 font-mono shrink-0">{item.quantity}×</strong>
                                                                    <span className="truncate">{item.product_name || item.sku}</span>
                                                                    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                                                        item.presentation_label
                                                                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                                                            : 'bg-slate-800 text-slate-300 border-slate-700'
                                                                    }`}>
                                                                        {item.presentation_label || 'Caja'}
                                                                    </span>
                                                                </span>
                                                                <span className="font-mono text-slate-300 shrink-0 text-[11px]">
                                                                    ${(Number(item.subtotal ?? item.total_price) || (Number(item.quantity || 0) * Number(item.unit_price || 0))).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {itemsList.length === 0 && (
                                                            <div className="py-1 text-slate-500 italic">Sin desglose de productos</div>
                                                        )}
                                                    </div>

                                                    {itemsList.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedCards(prev => ({ ...prev, [cardKey]: !prev[cardKey] }))}
                                                            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 w-full text-left px-1 pt-0.5"
                                                        >
                                                            {isExpanded
                                                                ? '▲ Ocultar productos'
                                                                : `▼ Ver los ${itemsList.length - 2} productos restantes (${itemsList.length} en total)`}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* 4. Botones de Acción de la Card de Cliente */}
                                                <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
                                                    <div className="grid grid-cols-3 gap-1.5">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => openReceiptForOrder(order, false)}
                                                            className="h-8 text-xs font-bold border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-white px-2"
                                                        >
                                                            <FileDown className="w-3.5 h-3.5 mr-1 text-amber-400 shrink-0" />
                                                            Ticket
                                                        </Button>

                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => openReceiptForOrder(order, true)}
                                                            className="h-8 text-xs bg-[#25D366] hover:bg-[#1ebe57] text-slate-950 font-extrabold px-2"
                                                        >
                                                            <Share2 className="w-3.5 h-3.5 mr-1 shrink-0" />
                                                            WhatsApp
                                                        </Button>

                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => navigate(`/televenta/atencion-cliente?client=${encodeURIComponent(order.client_code || '')}`)}
                                                            className="h-8 text-xs font-bold border-indigo-500/40 bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 px-2"
                                                            title="Abrir expediente completo 360°, cambiar contraseña, desvincular teléfono o ver historial"
                                                        >
                                                            <UserCheck className="w-3.5 h-3.5 mr-1 shrink-0" />
                                                            Ficha 360°
                                                        </Button>
                                                    </div>

                                                    {['pending', 'confirmed'].includes(order.status) && (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <Button
                                                                type="button"
                                                                onClick={() => openConfirmModal(order)}
                                                                disabled={processing === order.id}
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 text-xs font-semibold border-slate-700 text-slate-200 hover:bg-slate-800"
                                                            >
                                                                <CheckCircle className="w-3.5 h-3.5 mr-1 text-blue-400" />
                                                                {isPreventa ? 'Editar' : 'Confirmar'}
                                                            </Button>

                                                            <Button
                                                                type="button"
                                                                onClick={() => handleDeliverOrder(order)}
                                                                disabled={processing === order.id}
                                                                size="sm"
                                                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                                            >
                                                                {processing === order.id ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                                                                ) : (
                                                                    <Package className="w-3.5 h-3.5 mr-1" />
                                                                )}
                                                                Entregar
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {visibleOrders.length > displayLimit && (
                                <div className="flex justify-center pt-4 pb-6">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setDisplayLimit(prev => prev + 40)}
                                        className="font-bold px-6 border-primary/40 hover:bg-primary/10"
                                    >
                                        Mostrar más pedidos ({visibleOrders.length - displayLimit} restantes)
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                // SUPPORT CHAT VIEW (CONECTADO EN TIEMPO REAL CON WHATSAPP OFICIAL)
                <div className="h-[640px] border border-border rounded-xl overflow-hidden flex bg-card text-card-foreground shadow-lg">
                    {/* Sidebar List */}
                    <div className="w-1/3 border-r border-border bg-muted/20 overflow-y-auto flex flex-col">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
                            <div>
                                <h3 className="font-bold text-foreground">Chats de Soporte y WhatsApp</h3>
                                <p className="text-[11px] text-muted-foreground">Responde directo al WhatsApp del cliente</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={loadActiveChats} title="Actualizar chats">
                                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </div>
                        {activeChats.length === 0 ? (
                            <p className="p-6 text-muted-foreground text-sm text-center">No hay conversaciones activas</p>
                        ) : (
                            activeChats.map(chat => {
                                const isHumanMode = chat.bot_stage === 'HUMAN';
                                return (
                                    <div
                                        key={chat.client_code}
                                        onClick={() => setSelectedChatClient(chat.client_code)}
                                        className={`p-3.5 cursor-pointer hover:bg-muted/40 transition-colors border-b border-border ${
                                            selectedChatClient === chat.client_code ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                                        }`}
                                    >
                                        <div className="flex justify-between items-start gap-2 mb-1">
                                            <span className="font-bold text-foreground text-sm truncate">{chat.client_name}</span>
                                            {Number(chat.unread_count) > 0 && (
                                                <span className="bg-emerald-500 text-slate-950 text-[11px] px-2 py-0.5 rounded-full font-extrabold shrink-0">
                                                    {chat.unread_count}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                {chat.client_code}
                                            </span>
                                            {chat.whatsapp_phone && (
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                                    <Phone className="w-2.5 h-2.5" />
                                                    {chat.whatsapp_phone}
                                                </span>
                                            )}
                                            {isHumanMode && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
                                                    🙋‍♂️ Pide Asesor
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-xs text-muted-foreground truncate">{chat.last_message}</p>
                                        <p className="text-[10px] text-muted-foreground mt-1 text-right">
                                            {chat.last_activity ? new Date(chat.last_activity).toLocaleString('es-MX') : ''}
                                        </p>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 flex flex-col bg-background">
                        {selectedChatClient ? (() => {
                            const currentChat = activeChats.find(c => c.client_code === selectedChatClient) || {};
                            const isHumanMode = currentChat.bot_stage === 'HUMAN';

                            return (
                                <>
                                    <div className="p-4 border-b border-border bg-muted/30 flex flex-wrap justify-between items-center gap-2">
                                        <div>
                                            <h3 className="font-bold text-foreground flex items-center gap-2">
                                                <User className="w-5 h-5 text-primary" />
                                                <span>{currentChat.client_name || selectedChatClient}</span>
                                                <span className="text-xs font-mono text-muted-foreground">({selectedChatClient})</span>
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1 text-xs">
                                                {currentChat.whatsapp_phone ? (
                                                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                                                        🟢 Conectado al WhatsApp oficial ({currentChat.whatsapp_phone}) — Tus respuestas llegan directo a su chat
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">Chat web de tienda</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {isHumanMode ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => resumeBotForClient(selectedChatClient)}
                                                    className="text-xs border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/15 font-semibold"
                                                >
                                                    🤖 Devolver al Bot IA
                                                </Button>
                                            ) : currentChat.whatsapp_phone ? (
                                                <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                                                    🤖 Bot IA Activo (Al responder tomarás el control humano)
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {chatMessages.map((msg, idx) => (
                                            <div key={idx} className={`flex ${msg.sender_type === 'agent' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[75%] rounded-xl px-4 py-2.5 shadow-sm ${msg.sender_type === 'agent'
                                                    ? 'bg-primary text-primary-foreground font-medium'
                                                    : 'bg-muted text-foreground border border-border'
                                                    }`}>
                                                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                                    <p className="text-[10px] opacity-70 mt-1 text-right">
                                                        {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={chatIntervalRef} />
                                    </div>

                                    <form onSubmit={sendAgentMessage} className="p-4 border-t border-border bg-muted/20 flex gap-2">
                                        <input
                                            type="text"
                                            value={agentMessage}
                                            onChange={e => setAgentMessage(e.target.value)}
                                            placeholder={
                                                currentChat.whatsapp_phone
                                                    ? `Escribe aquí para responder directo al WhatsApp (${currentChat.whatsapp_phone})...`
                                                    : "Escribe una respuesta..."
                                            }
                                            className="flex-1 bg-background border border-input text-foreground rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                                        />
                                        <Button type="submit" disabled={!agentMessage.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 gap-1.5">
                                            <Send className="w-4 h-4" />
                                            Enviar
                                        </Button>
                                    </form>
                                </>
                            );
                        })() : (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                                <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                                <p className="text-sm font-semibold text-foreground">Selecciona una conversación para responder</p>
                                <p className="text-xs text-muted-foreground max-w-md mt-1">
                                    Cualquier mensaje que envíes aquí llegará directamente al mismo chat de WhatsApp donde el cliente escribió al Bot.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal Overlay para confirmación */}
            {confirmingOrder && createPortal(
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-2 sm:p-4 backdrop-blur-sm">
                    <div className="bg-card text-card-foreground border border-border rounded-xl max-w-xl w-[95vw] shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center px-4 py-3 border-b border-border shrink-0">
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold text-foreground truncate">Confirmar Pedido</h2>
                                <p className="text-muted-foreground text-xs truncate">#{confirmingOrder.order_number}</p>
                            </div>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground shrink-0" onClick={() => setConfirmingOrder(null)}>
                                <XCircle className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-foreground">Fecha de Entrega</label>
                                <input
                                    type="date"
                                    className="w-full border border-input rounded-lg px-2.5 py-1.5 text-sm bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
                                    value={deliveryDate}
                                    onChange={e => setDeliveryDate(e.target.value)}
                                />
                            </div>
                            <div className="min-w-0">
                                <label className="block text-xs font-semibold mb-1 text-foreground">Agregar Producto</label>
                                <div className="flex gap-1.5 min-w-0">
                                    <select
                                        className="flex-1 min-w-0 w-full border border-input rounded-lg px-2.5 py-1.5 bg-background text-foreground text-xs focus:ring-2 focus:ring-primary outline-none truncate"
                                        value={selectedProductSku}
                                        onChange={e => {
                                            const skuVal = e.target.value;
                                            setSelectedProductSku(skuVal);
                                            const found = availableProducts.find(p => p.sku == skuVal);
                                            const presList = Array.isArray(found?.presentations) ? found.presentations : [];
                                            const defPres = presList.find(pr => Number(pr.is_default) === 1) || presList[0];
                                            setSelectedProductPresCode(defPres?.code || '');
                                        }}
                                    >
                                        <option value="">Seleccionar producto...</option>
                                        {availableProducts.map(p => (
                                            <option key={p.sku} value={p.sku}>{p.name}</option>
                                        ))}
                                    </select>
                                    {(() => {
                                        const selProd = availableProducts.find(p => p.sku == selectedProductSku);
                                        const presList = Array.isArray(selProd?.presentations) ? selProd.presentations : [];
                                        if (presList.length === 0) return null;
                                        return (
                                            <select
                                                className="w-32 shrink-0 border border-input rounded-lg px-2 py-1.5 bg-background text-foreground text-xs focus:ring-2 focus:ring-primary outline-none"
                                                value={selectedProductPresCode}
                                                onChange={e => setSelectedProductPresCode(e.target.value)}
                                            >
                                                {presList.map(pr => (
                                                    <option key={pr.code} value={pr.code}>{pr.label}</option>
                                                ))}
                                            </select>
                                        );
                                    })()}
                                    <Button onClick={handleAddProduct} disabled={!selectedProductSku} size="sm" className="px-3 shrink-0">
                                        +
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2 text-sm text-foreground flex items-center gap-1.5">
                                <Package className="w-4 h-4 text-primary" />
                                Productos del Pedido
                            </h3>
                            <div className="border border-border rounded-xl overflow-x-auto bg-muted/10">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted text-muted-foreground text-left uppercase text-[10px] tracking-wider">
                                        <tr>
                                            <th className="px-2.5 py-2">Producto</th>
                                            <th className="px-2 py-2 text-center">Cant.</th>
                                            <th className="px-2 py-2 text-center">Precio ($)</th>
                                            <th className="px-2.5 py-2 text-right">Subtotal</th>
                                            <th className="px-2 py-2 text-center"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {editItems.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-2.5 py-2">
                                                    <p className="font-semibold text-foreground text-xs leading-tight">{item.name || item.sku}</p>
                                                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                                        <span className="text-[10px] text-muted-foreground font-mono">{item.sku}</span>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                                            item.presentation_label
                                                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                                                                : 'bg-muted text-muted-foreground border-border'
                                                        }`}>
                                                            {item.presentation_label || 'Caja'}
                                                        </span>
                                                        {item.base_quantity && Number(item.base_quantity) !== Number(item.quantity) && (
                                                            <span className="text-[10px] text-sky-400 font-mono">
                                                                (eq. {Number(item.base_quantity).toFixed(2)} cajas)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2">
                                                    <div className="flex items-center justify-center gap-1.5 bg-background w-fit mx-auto rounded-lg p-0.5 border border-border">
                                                        <button
                                                            className="w-6 h-6 rounded bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center font-bold transition-colors"
                                                            onClick={() => {
                                                                const newItems = [...editItems];
                                                                if (newItems[idx].quantity > 0) {
                                                                    newItems[idx] = { ...newItems[idx], quantity: newItems[idx].quantity - 1 };
                                                                }
                                                                setEditItems(newItems);
                                                            }}
                                                        >-</button>
                                                        <span className="w-6 text-center font-mono text-foreground font-bold">{item.quantity}</span>
                                                        <button
                                                            className="w-6 h-6 rounded bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center font-bold transition-colors"
                                                            onClick={() => {
                                                                const newItems = [...editItems];
                                                                newItems[idx] = { ...newItems[idx], quantity: (newItems[idx].quantity || 0) + 1 };
                                                                setEditItems(newItems);
                                                            }}
                                                        >+</button>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2 text-center">
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        <span className="text-muted-foreground text-[10px] font-mono">$</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            className="w-20 text-right border border-input rounded-lg px-1.5 py-1 bg-background text-foreground font-mono text-xs focus:ring-1 focus:ring-primary outline-none"
                                                            value={item.unit_price}
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                const newItems = [...editItems];
                                                                newItems[idx] = { ...newItems[idx], unit_price: val };
                                                                setEditItems(newItems);
                                                            }}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-2.5 py-2 text-right text-foreground font-mono font-bold whitespace-nowrap">
                                                    ${(item.quantity * (item.unit_price || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-2 py-2 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditItems(editItems.filter((_, i) => i !== idx));
                                                        }}
                                                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-500/10 rounded-lg transition-colors"
                                                        title="Quitar producto sin stock"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {editItems.length === 0 && (
                                            <tr>
                                                <td colSpan="5" className="p-6 text-center text-muted-foreground">No hay productos en la lista</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-3 px-3 py-2 bg-muted/20 rounded-xl border border-border">
                                <span className="text-xs font-semibold text-muted-foreground">Cargo manual / Envase ($):</span>
                                <div className="flex items-center gap-1 bg-background border border-input rounded-lg px-2 py-1">
                                    <span className="text-xs text-muted-foreground font-mono">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={editCargo}
                                        onChange={e => setEditCargo(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))}
                                        className="w-20 text-right bg-transparent text-foreground font-mono text-xs font-bold focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center mt-2 p-3 bg-muted/40 rounded-xl border border-border">
                                <div className="text-xs font-medium text-muted-foreground">
                                    Total recalculado del pedido:
                                </div>
                                <div className="text-lg font-bold font-mono text-emerald-500">
                                    ${(editItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0) + (Number(editCargo) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                        </div>

                        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0 bg-card">
                            <Button variant="outline" size="sm" onClick={() => setConfirmingOrder(null)}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={submitConfirmation} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                                {processing ? <Loader2 className="animate-spin w-4 h-4 mr-1.5" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                                Confirmar y Ver Ticket
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {receiptSale && (
                <ReceiptModal
                    open={!!receiptSale}
                    onOpenChange={(open) => {
                        if (!open) {
                            setReceiptSale(null);
                            setReceiptClient(null);
                            setReceiptAutoSend(false);
                        }
                    }}
                    saleData={receiptSale}
                    client={receiptClient}
                    autoSendWhatsApp={receiptAutoSend}
                />
            )}
        </div>
    );
}
