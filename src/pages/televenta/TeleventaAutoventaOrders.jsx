import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import Layout from '@/components/Layout';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Download, Search, Truck } from 'lucide-react';
import * as XLSX from 'xlsx';

import ReceiptModal from '@/components/ReceiptModal';
import { Helmet } from 'react-helmet-async';
import { getTodayMexico } from '@/lib/dateUtils';
import { Eye } from 'lucide-react';

const TeleventaAutoventaOrders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(getTodayMexico()); // Mexico timezone
    const [search, setSearch] = useState('');
    const [productMap, setProductMap] = useState({});

    // Modal state
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, [dateFilter]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            // 1. Fetch direct_sales with items
            const { data: salesData, error: salesError } = await supabase
                .from('direct_sales')
                .select(`
                    *,
                    clients ( name, client_code, sales_route ),
                    direct_sales_items ( cve_marca, quantity, unit_price, total_price )
                `)
                .gte('created_at', `${dateFilter}T00:00:00`)
                .lte('created_at', `${dateFilter}T23:59:59`)
                .order('created_at', { ascending: false });

            if (salesError) throw salesError;

            // 2. Fetch profiles manually
            const userIds = [...new Set((salesData || []).map(o => o.user_id).filter(Boolean))];
            let userMap = {};

            if (userIds.length > 0) {
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, name, email')
                    .in('id', userIds);

                if (profilesData) {
                    userMap = profilesData.reduce((acc, p) => {
                        acc[p.id] = p;
                        return acc;
                    }, {});
                }
            }

            // 3. Fetch product descriptions
            // Gather all unique SKUs
            const allSkus = new Set();
            salesData.forEach(sale => {
                if (sale.direct_sales_items) {
                    sale.direct_sales_items.forEach(item => {
                        if (item.cve_marca) allSkus.add(item.cve_marca);
                    });
                }
            });

            const skusArray = Array.from(allSkus);
            let pMap = {};
            if (skusArray.length > 0) {
                const { data: productsData } = await supabase
                    .from('precios')
                    .select('cve_marca, des_marca')
                    .in('cve_marca', skusArray);

                if (productsData) {
                    pMap = productsData.reduce((acc, p) => {
                        acc[p.cve_marca] = p.des_marca;
                        return acc;
                    }, {});
                }
            }
            setProductMap(pMap);

            // 4. Merge data
            const enrichedSales = (salesData || []).map(sale => ({
                ...sale,
                profiles: userMap[sale.user_id] || { name: 'Desconocido', email: 'N/A' }
            }));

            setOrders(enrichedSales);
        } catch (error) {
            console.error("Error fetching autoventa orders:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        const exportData = [];

        orders.forEach(o => {
            const baseRow = {
                ID_Venta: o.id,
                Fecha: new Date(o.created_at).toLocaleDateString(),
                Hora: new Date(o.created_at).toLocaleTimeString(),
                Cliente: o.clients?.name || 'Desc.',
                Codigo_Cliente: o.clients?.client_code,
                Ruta: o.clients?.sales_route,
                Vendedor: o.profiles?.name || o.profiles?.email,
                Total_Venta: o.total_amount
            };

            if (o.direct_sales_items && o.direct_sales_items.length > 0) {
                o.direct_sales_items.forEach(item => {
                    exportData.push({
                        ...baseRow,
                        SKU: item.cve_marca,
                        Producto: productMap[item.cve_marca] || item.cve_marca,
                        Cantidad: item.quantity,
                        Precio_Unitario: item.unit_price,
                        PrecioVenta_Marca: item.unit_price, // Added per request
                        Subtotal_Linea: item.total_price
                    });
                });
            } else {
                // Should not happen for valid sales, but just in case
                exportData.push({
                    ...baseRow,
                    SKU: 'N/A',
                    Producto: 'Sin Items',
                    Cantidad: 0,
                    Precio_Unitario: 0,
                    PrecioVenta_Marca: 0,
                    Subtotal_Linea: 0
                });
            }
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        // Adjust column widths
        const wscols = [
            { wch: 10 }, // ID
            { wch: 12 }, // Fecha
            { wch: 10 }, // Hora
            { wch: 30 }, // Cliente
            { wch: 15 }, // Codigo
            { wch: 10 }, // Ruta
            { wch: 25 }, // Vendedor
            { wch: 12 }, // Total Venta
            { wch: 10 }, // SKU
            { wch: 35 }, // Producto
            { wch: 10 }, // Cantidad
            { wch: 12 }, // Precio Unitario
            { wch: 12 }, // PrecioVenta_Marca
            { wch: 12 }, // Subtotal
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DetalleAutoventa");
        XLSX.writeFile(wb, `Autoventa_Detalle_${dateFilter}.xlsx`);
    };

    const handleViewDetail = (order) => {
        // Prepare data for ReceiptModal
        const modalData = {
            ...order,
            totalAmount: order.total_amount,
            items: order.direct_sales_items?.map(item => ({
                ...item,
                price: item.unit_price,
                des_marca: productMap[item.cve_marca] || item.cve_marca
            }))
        };
        setSelectedOrder(modalData);
        setShowModal(true);
    };

    const filteredOrders = orders.filter(o => {
        const s = search.toLowerCase();
        return (
            (o.clients?.name || '').toLowerCase().includes(s) ||
            (o.profiles?.name || '').toLowerCase().includes(s) ||
            (o.profiles?.email || '').toLowerCase().includes(s)
        );
    });

    return (
        <div className="p-6 bg-[#1a1c2e] min-h-screen text-white font-sans">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                        <Truck className="text-blue-400" /> Pedidos Autoventa
                    </h1>
                    <p className="text-white/60">Monitoreo de ventas en ruta.</p>
                </div>
                <div className="flex gap-2">
                    <div className="flex items-center gap-2 bg-[#2a2c44] border border-white/10 rounded px-3">
                        <Calendar size={18} className="text-gray-400" />
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={e => setDateFilter(e.target.value)}
                            className="bg-transparent outline-none text-sm py-2 text-white placeholder-white/50"
                            style={{ colorScheme: 'dark' }}
                        />
                    </div>
                </div>
            </header>

            <Card className="mb-6 bg-[#2a2c44] border-white/5 shadow-lg">
                <CardContent className="p-4 flex gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 text-gray-400 h-4 w-4" />
                        <Input
                            placeholder="Buscar por cliente o vendedor..."
                            className="pl-9 bg-white/5 border-white/10 text-white placeholder-white/30 focus:border-blue-500"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleExport} variant="outline" className="gap-2 text-green-400 border-green-900/50 bg-green-900/20 hover:bg-green-900/40 hover:text-green-300">
                        <Download size={16} /> Exportar Detalle (Excel)
                    </Button>
                </CardContent>
            </Card>

            <Card className="bg-[#2a2c44] border-white/5 shadow-lg">
                <div className="rounded-md border border-white/5 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-white/5">
                            <TableRow className="border-white/5 hover:bg-white/5">
                                <TableHead className="text-white/70">ID</TableHead>
                                <TableHead className="text-white/70">Hora</TableHead>
                                <TableHead className="text-white/70">Vendedor</TableHead>
                                <TableHead className="text-white/70">Cliente</TableHead>
                                <TableHead className="text-white/70">Ruta</TableHead>
                                <TableHead className="text-right text-white/70">Monto</TableHead>
                                <TableHead className="text-center text-white/70">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow className="hover:bg-transparent"><TableCell colSpan={7} className="text-center py-8 text-white/50">Cargando...</TableCell></TableRow>
                            ) : filteredOrders.length === 0 ? (
                                <TableRow className="hover:bg-transparent"><TableCell colSpan={7} className="text-center py-8 text-white/40">No hay pedidos registrados en esta fecha.</TableCell></TableRow>
                            ) : (
                                filteredOrders.map((order) => (
                                    <TableRow key={order.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                        <TableCell className="font-mono text-xs text-white/50">{order.id.slice(0, 8)}...</TableCell>
                                        <TableCell className="text-white/80">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
                                        <TableCell>
                                            <div className="font-medium text-sm text-white">{order.profiles?.name || 'N/A'}</div>
                                            <div className="text-xs text-white/40">{order.profiles?.email}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium text-white">{order.clients?.name}</div>
                                            <div className="text-xs text-blue-400">{order.clients?.client_code}</div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="bg-white/10 px-2 py-1 rounded text-xs font-bold text-white/80">{order.clients?.sales_route || '-'}</span>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-green-400">
                                            ${Number(order.total_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleViewDetail(order)}
                                                className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8 p-0 rounded-full"
                                                title="Ver Detalle"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            <ReceiptModal
                open={showModal}
                onOpenChange={setShowModal}
                saleData={selectedOrder}
                client={selectedOrder?.clients}
            />
        </div>
    );
};

export default TeleventaAutoventaOrders;
