import React, { useState, useEffect, useRef } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';
import { awardPreventaPoints } from '@/lib/preventaPoints';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTruckInventory } from '@/repositories/inventoryRepository';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Package, Truck, Calendar, MapPin, CheckCircle, PenTool, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import SignatureCanvas from 'react-signature-canvas';
import StartOfDayWrapper from '@/components/StartOfDayWrapper';

const DeliveryDashboard = () => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    const [inventory, setInventory] = useState({});
    const [skuNames, setSkuNames] = useState({});
    const [pendingDeliveries, setPendingDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);

    // Signature Modal State
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const sigCanvas = useRef(null);

    // Reject Modal State
    const [rejectOrder, setRejectOrder] = useState(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    const openRejectModal = (order) => {
        setRejectOrder(order);
        setRejectReason('');
        setShowRejectModal(true);
    };

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Truck Inventory
            const stock = await getTruckInventory(user.id);
            setInventory(stock);

            // 2. Fetch SKU Names
            const { data: prices } = await supabase.from('precios').select('cve_marca, des_marca');
            const names = {};
            if (prices) {
                prices.forEach(p => names[p.cve_marca] = p.des_marca);
            }
            setSkuNames(names);

            // 3. Fetch Pending Deliveries
            const userRoute = user?.user_metadata?.route || 'RUTA 1'; 
            
            const { getClientsPaged } = await import('@/repositories/clientsRepository');
            const { data: clientsData } = await getClientsPaged({ page: 1, pageSize: 5000, filters: { sales_route: userRoute }});
            const clientMap = {};
            (clientsData || []).forEach(c => clientMap[c.id] = c);
            const clientIds = Object.keys(clientMap);

            if (clientIds.length > 0) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 2);
                
                const { data: preventas } = await supabase
                    .from('preventa')
                    .select('id, client_id, total_amount, created_at, status')
                    .in('client_id', clientIds)
                    .or('status.eq.pendiente,status.is.null,status.eq.cargado')
                    .gte('created_at', yesterday.toISOString())
                    .order('created_at', { ascending: false });

                const enriched = (preventas || []).map(p => ({
                    ...p,
                    client_name: clientMap[p.client_id]?.name || 'Desconocido'
                }));
                setPendingDeliveries(enriched);
            }
        } catch (error) {
            console.error("Error loading delivery dashboard:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) fetchDashboardData();
    }, [user]);

    const openSignatureModal = (preventa) => {
        setSelectedOrder(preventa);
        setShowSignatureModal(true);
    };

    const handleClearSignature = () => {
        if (sigCanvas.current) {
            sigCanvas.current.clear();
        }
    };

    const handleConfirmDelivery = async () => {
        if (!selectedOrder) return;
        
        if (sigCanvas.current && sigCanvas.current.isEmpty()) {
            toast({ title: 'Atención', description: 'El cliente debe firmar de recibido.', variant: 'destructive' });
            return;
        }

        const signatureBase64 = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');

        try {
            // Get items for this order to deduct from truck inventory
            const { data: items, error: itemsError } = await supabase.from('preventa_items').select('cve_marca, quantity').eq('preventa_id', selectedOrder.id);
            if (itemsError) throw itemsError;
            
            // Deduct from local/Supabase truck inventory
            for (const item of (items || [])) {
                const sku = item.cve_marca;
                const qty = Number(item.quantity) || 0;
                
                const { data: currentStock } = await supabase.from('truck_inventory').select('quantity').eq('user_id', user.id).eq('cve_marca', sku).maybeSingle();
                const currentQty = currentStock ? currentStock.quantity : 0;
                const newQty = Math.max(0, currentQty - qty);

                await supabase.from('truck_inventory').upsert({
                    user_id: user.id,
                    cve_marca: sku,
                    quantity: newQty,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, cve_marca' });
            }

            // Mark order as completed and save signature
            const { error: deliveryError } = await supabase.from('preventa').update({ 
                status: 'entregado',
                delivered_at: new Date().toISOString(),
                signature: signatureBase64
            }).eq('id', selectedOrder.id);
            if (deliveryError) throw deliveryError;

            let pointsPending = false;
            try {
                await awardPreventaPoints(selectedOrder.id);
            } catch (pointsError) {
                console.error('[DeliveryDashboard] Points award deferred:', pointsError);
                const { addPendingOperation } = await import('@/sync/syncService');
                await addPendingOperation({
                    entity_type: 'preventa_points',
                    operation: 'award',
                    payload: { preventa_id: selectedOrder.id },
                    created_at: new Date().toISOString()
                });
                pointsPending = true;
            }
            
            toast({ title: 'Pedido Entregado', description: pointsPending
                ? `Pedido de ${selectedOrder.client_name} entregado. Los puntos quedaron pendientes de sincronización.`
                : `Pedido de ${selectedOrder.client_name} entregado; los puntos se acreditaron al cliente.`, className: 'bg-green-600 text-white' });
            setShowSignatureModal(false);
            setSelectedOrder(null);
            fetchDashboardData();
        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'No se pudo completar la entrega.', variant: 'destructive' });
        }
    };

    const handleRejectDelivery = async (preventaId, reason) => {
        if (!reason || !reason.trim()) {
            toast({ title: 'Motivo Requerido', description: 'Por favor ingresa la razón del rechazo.', variant: 'destructive' });
            return;
        }

        try {
            await supabase.from('preventa').update({
                status: 'rechazado',
                rechazado_reason: reason.trim(),
                delivered_at: null
            }).eq('id', preventaId);

            toast({
                title: 'Pedido Rechazado ⛔',
                description: 'El pedido fue marcado como rechazado. El producto permanecerá en tu camión para devolución a almacén.',
                className: 'bg-amber-600 text-white border-none'
            });
            fetchDashboardData();
        } catch (error) {
            console.error('[DeliveryDashboard] Error rejecting delivery:', error);
            toast({ title: 'Error', description: 'Fallo al procesar el rechazo del pedido.', variant: 'destructive' });
        }
    };

    const totalBoxes = Object.values(inventory).reduce((a, b) => a + b, 0);

    return (
        <StartOfDayWrapper requiredFor={['chofer']}>
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 pb-24 relative">
            <header className="mb-6">
                <h1 className="text-3xl md:text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-600 flex items-center gap-2">
                    <Truck className="h-8 w-8 text-green-500" />
                    Mi Ruta (Reparto)
                </h1>
                <p className="text-slate-400 mt-1">Gestión de entregas y control de carga a bordo.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Inventory on Board */}
                <div className="lg:col-span-1">
                    <Card className="bg-slate-900 border-slate-800 shadow-xl">
                        <CardHeader className="bg-slate-800/50 border-b border-slate-800">
                            <CardTitle className="flex items-center gap-2 text-green-400">
                                <Package className="h-5 w-5" />
                                Carga a Bordo
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-6 text-center text-slate-500">Cargando inventario...</div>
                            ) : totalBoxes === 0 ? (
                                <div className="p-6 text-center text-slate-500">El camión está vacío.</div>
                            ) : (
                                <div className="max-h-[60vh] overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-slate-800/50">
                                                <TableHead className="text-slate-400">Producto</TableHead>
                                                <TableHead className="text-right text-slate-400">Cajas</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Object.entries(inventory).map(([sku, qty]) => {
                                                if (qty <= 0) return null;
                                                return (
                                                    <TableRow key={sku} className="border-slate-800 hover:bg-slate-800/50">
                                                        <TableCell>
                                                            <div className="font-medium">{skuNames[sku] || sku}</div>
                                                            <div className="text-xs text-slate-500">{sku}</div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-green-400 font-bold text-lg">
                                                            {qty}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                    <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-950/50">
                                        <span className="text-slate-400 font-medium">Total Cajas:</span>
                                        <span className="text-2xl font-black text-white">{totalBoxes}</span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Pending Deliveries */}
                <div className="lg:col-span-2">
                    <Card className="bg-slate-900 border-slate-800 shadow-xl">
                        <CardHeader className="bg-slate-800/50 border-b border-slate-800">
                            <CardTitle className="flex items-center gap-2 text-blue-400">
                                <MapPin className="h-5 w-5" />
                                Entregas Programadas
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-6 text-center text-slate-500">Cargando entregas...</div>
                            ) : pendingDeliveries.length === 0 ? (
                                <div className="p-6 text-center text-slate-500">No hay entregas pendientes para tu ruta.</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-slate-800 hover:bg-slate-800/50">
                                            <TableHead className="text-slate-400">Cliente</TableHead>
                                            <TableHead className="text-slate-400">Fecha Preventa</TableHead>
                                            <TableHead className="text-right text-slate-400">Monto</TableHead>
                                            <TableHead className="text-center text-slate-400">Acción</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingDeliveries.map(p => (
                                            <TableRow key={p.id} className="border-slate-800 hover:bg-slate-800/50">
                                                <TableCell className="font-medium text-slate-200">
                                                    {p.client_name}
                                                </TableCell>
                                                <TableCell className="text-slate-400 text-sm">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {new Date(p.created_at).toLocaleDateString()}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right text-emerald-400 font-medium">
                                                    ${Number(p.total_amount || 0).toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <Button 
                                                            size="sm" 
                                                            className="bg-emerald-600 hover:bg-emerald-500 text-white"
                                                            onClick={() => openSignatureModal(p)}
                                                        >
                                                            <PenTool className="h-4 w-4 mr-1" /> Entregar
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline"
                                                            className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                                                            onClick={() => openRejectModal(p)}
                                                        >
                                                            <X className="h-4 w-4 mr-1" /> Rechazar
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Signature Modal Overlay */}
            {showSignatureModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md bg-slate-900 border-emerald-500/30 shadow-2xl shadow-emerald-900/20">
                        <CardHeader className="flex flex-row justify-between items-center border-b border-slate-800 pb-4">
                            <CardTitle className="text-emerald-400 flex items-center gap-2">
                                <PenTool className="h-5 w-5" /> Firma de Conformidad
                            </CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setShowSignatureModal(false)} className="text-slate-400 hover:text-white">
                                <X className="h-5 w-5" />
                            </Button>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-white">{selectedOrder?.client_name}</h3>
                                <p className="text-slate-400 text-sm">Total a pagar: <span className="text-emerald-400 font-bold">${Number(selectedOrder?.total_amount || 0).toFixed(2)}</span></p>
                            </div>
                            
                            <div className="bg-white rounded-lg overflow-hidden border-2 border-slate-300 relative">
                                <SignatureCanvas 
                                    ref={sigCanvas}
                                    penColor="black"
                                    canvasProps={{ className: 'w-full h-48 bg-white cursor-crosshair' }}
                                />
                            </div>
                            <div className="flex justify-between items-center">
                                <Button variant="outline" size="sm" onClick={handleClearSignature} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                                    Borrar
                                </Button>
                                <Button onClick={handleConfirmDelivery} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
                                    <CheckCircle className="h-4 w-4 mr-2" /> Aceptar y Entregar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Reject Modal Overlay */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md bg-slate-900 border-red-500/30 shadow-2xl shadow-red-900/20">
                        <CardHeader className="flex flex-row justify-between items-center border-b border-slate-800 pb-4">
                            <CardTitle className="text-red-400 flex items-center gap-2">
                                <X className="h-5 w-5" /> Rechazo de Pedido
                            </CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-white">
                                <X className="h-5 w-5" />
                            </Button>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-white">{rejectOrder?.client_name}</h3>
                                <p className="text-slate-400 text-xs mt-1">El producto rechazado volverá en tu camión para liquidación en almacén.</p>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Motivo del Rechazo *</label>
                                <textarea
                                    value={rejectReason}
                                    onChange={e => setRejectReason(e.target.value)}
                                    placeholder="Ej: Cliente cerrado, Falta de efectivo, Negocio cambió de opinión..."
                                    rows={3}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-red-500 focus:outline-none"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" size="sm" onClick={() => setShowRejectModal(false)} className="border-slate-700 text-slate-300">
                                    Cancelar
                                </Button>
                                <Button
                                    size="sm"
                                    className="bg-red-600 hover:bg-red-500 text-white font-bold"
                                    onClick={async () => {
                                        await handleRejectDelivery(rejectOrder.id, rejectReason);
                                        setShowRejectModal(false);
                                    }}
                                >
                                    Confirmar Rechazo
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
        </StartOfDayWrapper>
    );
};

export default DeliveryDashboard;
