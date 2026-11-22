import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { CheckCircle, DollarSign, PackageOpen, Printer, Truck } from 'lucide-react';
import { getTruckInventory } from '@/repositories/inventoryRepository';

const RouteLiquidationPage = () => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Inventory State
    const [expectedStock, setExpectedStock] = useState({});
    const [physicalStock, setPhysicalStock] = useState({});
    const [emptyContainers, setEmptyContainers] = useState({});
    const [skuNames, setSkuNames] = useState({});
    
    // Financial State
    const [completedOrders, setCompletedOrders] = useState([]);
    const [expectedCash, setExpectedCash] = useState(0);
    const [actualCash, setActualCash] = useState('');
    
    const [liquidationComplete, setLiquidationComplete] = useState(false);

    useEffect(() => {
        const fetchDrivers = async () => {
            const { data } = await supabase.from('profiles').select('id, name, role, email, branch_id');
            if (data) {
                // Filter by role, and then by branch if user has one (assuming Admin can see all, Almacenista sees only their branch)
                const userBranch = user?.profile?.branch_id;
                const isAdmin = user?.user_metadata?.role === 'admin' || user?.user_metadata?.role === 'operaciones';
                
                const filtered = data.filter(p => {
                    const isDriver = p.role === 'autoventa' || p.role === 'chofer' || p.email === 'chofer@demo.com';
                    if (!isDriver) return false;
                    if (isAdmin || !userBranch) return true; // Admins or users without branch see all
                    return p.branch_id === userBranch; // Almacenistas see only their branch
                });
                setDrivers(filtered);
            }

            const { data: prices } = await supabase.from('precios').select('cve_marca, des_marca');
            const names = {};
            if (prices) {
                prices.forEach(p => names[p.cve_marca] = p.des_marca);
            }
            setSkuNames(names);
        };
        fetchDrivers();
    }, []);

    useEffect(() => {
        if (!selectedDriver) {
            setExpectedStock({});
            setPhysicalStock({});
            setCompletedOrders([]);
            setExpectedCash(0);
            setLiquidationComplete(false);
            return;
        }

        const fetchLiquidationData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Expected Physical Stock (Truck Inventory after deliveries)
                const stockMap = await getTruckInventory(selectedDriver);
                setExpectedStock(stockMap);
                setPhysicalStock({ ...stockMap }); // Pre-fill with expected

                // 2. Fetch Delivered Orders for THIS driver today
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // ✅ FIX P2: Filtrar por driver_id del chofer seleccionado
                const { data: preventas } = await supabase
                    .from('preventa')
                    .select('id, client_id, total_amount, created_at, driver_id')
                    .eq('driver_id', selectedDriver)          // ← filtro por chofer
                    .gte('created_at', today.toISOString());
                
                setCompletedOrders(preventas || []);
                const cash = (preventas || []).reduce((acc, p) => acc + (Number(p.total_amount) || 0), 0);
                setExpectedCash(cash);
                
                // 3. ✅ FIX P4: Calcular envase retornable usando is_returnable de DB (no heurística de texto)
                if (preventas && preventas.length > 0) {
                    const preventaIds = preventas.map(p => p.id);
                    const { data: items } = await supabase
                        .from('preventa_items')
                        .select('cve_marca, quantity')
                        .in('preventa_id', preventaIds);

                    // Obtener qué SKUs son retornables desde la tabla products
                    const skusInItems = [...new Set((items || []).map(i => i.cve_marca))];
                    const { data: returnableProducts } = await supabase
                        .from('products')
                        .select('sku')
                        .in('sku', skusInItems)
                        .eq('is_returnable', true);
                    
                    const returnableSkus = new Set((returnableProducts || []).map(p => p.sku));

                    // Fallback: si products no tiene datos, usar heurística de texto
                    let expectedEmptyBoxes = 0;
                    (items || []).forEach(item => {
                        const sku = (item.cve_marca || '').toUpperCase();
                        const isReturnableByDb = returnableSkus.has(item.cve_marca);
                        const isReturnableByText = sku.includes('RET') || sku.includes('MED') || sku.includes('CAG') || sku.includes('CARTON');
                        if (isReturnableByDb || isReturnableByText) {
                            expectedEmptyBoxes += Number(item.quantity) || 0;
                        }
                    });
                    
                    setEmptyContainers({ expected: expectedEmptyBoxes, actualCartons: '', actualPallets: '' });
                } else {
                    setEmptyContainers({ expected: 0, actualCartons: '', actualPallets: '' });
                }

            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchLiquidationData();
    }, [selectedDriver, drivers]);

    const handleConfirmLiquidation = async () => {
        const cashDiff = Number(actualCash) - expectedCash;
        if (cashDiff < 0 && !confirm(`Faltan $${Math.abs(cashDiff).toFixed(2)} en caja. ¿Deseas aprobar la liquidación con faltante?`)) {
            return;
        }

        const emptyDiff = Number(emptyContainers.actualCartons) - emptyContainers.expected;
        if (emptyDiff < 0 && !confirm(`Faltan ${Math.abs(emptyDiff)} cartones vacíos según lo entregado hoy. ¿Aprobar liquidación con deuda de envase?`)) {
            return;
        }

        setLoading(true);
        try {
            // ✅ FIX P1: Obtener la bodega del almacenista para regresar el sobrante
            let branchId = user?.profile?.branch_id || null;
            if (!branchId && user?.id) {
                const { data: profile } = await supabase.from('profiles').select('branch_id').eq('id', user.id).single();
                branchId = profile?.branch_id || null;
            }

            // ✅ FIX P1: REGRESAR SOBRANTE A BODEGA antes de vaciar el camión
            if (branchId && Object.keys(physicalStock).length > 0) {
                for (const [sku, qty] of Object.entries(physicalStock)) {
                    const returnQty = Number(qty) || 0;
                    if (returnQty <= 0) continue;

                    // Sumar el sobrante al warehouse_inventory de la bodega
                    const { data: current } = await supabase
                        .from('warehouse_inventory')
                        .select('quantity')
                        .eq('branch_id', branchId)
                        .eq('product_sku', sku)
                        .maybeSingle();

                    const newQty = (current?.quantity || 0) + returnQty;

                    await supabase.from('warehouse_inventory').upsert({
                        branch_id: branchId,
                        product_sku: sku,
                        quantity: newQty,
                        last_updated: new Date().toISOString()
                    }, { onConflict: 'branch_id,product_sku' });

                    // ✅ FIX P1: Registrar en warehouse_transactions (kárdex de bodega)
                    await supabase.from('warehouse_transactions').insert({
                        branch_id: branchId,
                        product_sku: sku,
                        type: 'RETORNO_LIQUIDACION',
                        quantity: returnQty,
                        reference_id: selectedDriver,
                        created_by: user.id
                    });
                }
            }

            // 1. Vaciar el camión DESPUÉS de regresar el sobrante
            await supabase.from('truck_inventory').delete().eq('user_id', selectedDriver);

            // 2. Mark route as Liquidated
            await supabase.from('inventory_audits').insert({
                driver_id: selectedDriver,
                auditor_id: user.id,
                cve_marca: 'LIQUIDACION_CAJA',
                system_qty: expectedCash,
                physical_qty: Number(actualCash) || 0,
                created_at: new Date().toISOString()
            });

            await supabase.from('inventory_audits').insert({
                driver_id: selectedDriver,
                auditor_id: user.id,
                cve_marca: 'LIQUIDACION_ENVASE',
                system_qty: emptyContainers.expected,
                physical_qty: Number(emptyContainers.actualCartons) || 0,
                created_at: new Date().toISOString()
            });

            toast({ title: 'Liquidación Aprobada', description: 'El sobrante ha sido regresado a bodega y el viaje cerrado.', className: 'bg-emerald-600 text-white' });
            setLiquidationComplete(true);
        } catch (e) {
            console.error(e);
            toast({ title: 'Error', description: 'Fallo al liquidar.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans print:bg-white print:text-black">
            <header className="mb-8 flex justify-between items-end print:hidden">
                <div>
                    <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-500">
                        Liquidación de Ruta
                    </h1>
                    <p className="text-slate-400">Recepción de valores y envase físico.</p>
                </div>
                {selectedDriver && !liquidationComplete && (
                    <Button variant="outline" onClick={() => window.print()} className="gap-2 border-slate-700 hover:bg-slate-800 text-slate-300">
                        <Printer size={16} /> Imprimir Pre-Liquidación
                    </Button>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-1 space-y-6 print:hidden">
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-lg">Seleccionar Chofer</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                                <SelectTrigger className="bg-slate-950 border-slate-700">
                                    <SelectValue placeholder="Chofer..." />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    {drivers.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.name || d.email}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>

                    {liquidationComplete && (
                        <div className="bg-emerald-900/20 text-emerald-400 p-6 rounded-xl border border-emerald-900/50 text-center shadow-lg">
                            <CheckCircle className="mx-auto h-12 w-12 mb-2" />
                            <h3 className="font-bold text-lg mb-1">Viaje Liquidado</h3>
                            <p className="text-sm opacity-80">El camión está vacío y el efectivo ingresado en caja.</p>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-3 space-y-6">
                    {selectedDriver && !liquidationComplete && (
                        <>
                            {/* CAJA / EFECTIVO */}
                            <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-emerald-500">
                                <CardHeader className="border-b border-slate-800 pb-4">
                                    <CardTitle className="flex items-center gap-2 text-emerald-400">
                                        <DollarSign className="h-5 w-5" /> Liquidación de Caja
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                                        <div className="text-center w-full">
                                            <p className="text-slate-400 mb-1 text-sm">Ventas Entregadas</p>
                                            <p className="text-3xl font-black text-white">{completedOrders.length}</p>
                                        </div>
                                        <div className="text-center w-full">
                                            <p className="text-slate-400 mb-1 text-sm">Efectivo Esperado</p>
                                            <p className="text-3xl font-black text-emerald-400">${expectedCash.toFixed(2)}</p>
                                        </div>
                                        <div className="w-full">
                                            <label className="block text-slate-400 mb-1 text-sm text-center">Efectivo Físico Entregado</label>
                                            <Input 
                                                type="number" 
                                                className="text-center text-2xl h-14 bg-slate-950 border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20 font-bold"
                                                value={actualCash}
                                                onChange={(e) => setActualCash(e.target.value)}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    {actualCash !== '' && (
                                        <div className={`mt-4 text-center font-bold ${(Number(actualCash) - expectedCash) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            Diferencia: ${(Number(actualCash) - expectedCash).toFixed(2)}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* ALMACEN / FÍSICO */}
                            <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-blue-500">
                                <CardHeader className="border-b border-slate-800 pb-4">
                                    <CardTitle className="flex items-center gap-2 text-blue-400">
                                        <PackageOpen className="h-5 w-5" /> Devolución Física a Almacén
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6 p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-950">
                                            <TableRow className="border-slate-800 hover:bg-slate-950">
                                                <TableHead className="text-slate-400">SKU</TableHead>
                                                <TableHead className="text-slate-400">Producto</TableHead>
                                                <TableHead className="text-center text-slate-400">Retorno Esperado</TableHead>
                                                <TableHead className="text-center text-slate-400">Retorno Físico</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Object.keys(expectedStock).map(sku => (
                                                <TableRow key={sku} className="border-slate-800">
                                                    <TableCell className="font-mono text-slate-500">{sku}</TableCell>
                                                    <TableCell className="font-medium">{skuNames[sku] || sku}</TableCell>
                                                    <TableCell className="text-center text-lg">{expectedStock[sku]}</TableCell>
                                                    <TableCell className="text-center w-32">
                                                        <Input 
                                                            type="number" 
                                                            className="text-center font-bold bg-slate-950 border-slate-700"
                                                            value={physicalStock[sku] ?? ''}
                                                            onChange={(e) => setPhysicalStock({...physicalStock, [sku]: Number(e.target.value)})}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {Object.keys(expectedStock).length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center text-slate-500 py-6">El camión no tiene mercancía a bordo.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                            {/* ENVASE (Returnable) */}
                            <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-amber-500">
                                <CardHeader className="border-b border-slate-800 pb-4">
                                    <CardTitle className="flex items-center gap-2 text-amber-400">
                                        <Truck className="h-5 w-5" /> Retorno de Envase Vacío
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-4">
                                        <div className="text-center w-full">
                                            <p className="text-slate-400 mb-1 text-sm">Cartones Esperados</p>
                                            <p className="text-3xl font-black text-amber-400">{emptyContainers.expected || 0}</p>
                                        </div>
                                        <div className="w-full">
                                            <label className="block text-slate-400 mb-1 text-sm text-center">Cartones Físicos Entregados</label>
                                            <Input 
                                                type="number" 
                                                placeholder="Ej. 50" 
                                                className="text-center text-2xl h-14 bg-slate-950 border-slate-700 focus:border-amber-500 font-bold"
                                                value={emptyContainers.actualCartons}
                                                onChange={(e) => setEmptyContainers({...emptyContainers, actualCartons: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    {emptyContainers.actualCartons !== '' && (
                                        <div className={`text-center font-bold ${(Number(emptyContainers.actualCartons) - emptyContainers.expected) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            Diferencia: {Number(emptyContainers.actualCartons) - emptyContainers.expected}
                                        </div>
                                    )}
                                    <div className="flex gap-4 items-end mt-4">
                                        <div className="flex-1">
                                            <label className="text-sm text-slate-400">Tarimas Retornadas (Opcional)</label>
                                            <Input 
                                                type="number" 
                                                placeholder="Ej. 4" 
                                                className="bg-slate-950 border-slate-700" 
                                                value={emptyContainers.actualPallets}
                                                onChange={(e) => setEmptyContainers({...emptyContainers, actualPallets: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-4">Nota: El sistema calculó el envase esperado con base en los pedidos de productos retornables (CAG, MED, RET) que fueron marcados como entregados hoy.</p>
                                </CardContent>
                            </Card>

                            <div className="flex justify-end pt-4 print:hidden">
                                <Button 
                                    size="lg" 
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 shadow-lg shadow-emerald-900/50"
                                    onClick={handleConfirmLiquidation}
                                    disabled={loading || actualCash === ''}
                                >
                                    {loading ? 'Procesando...' : 'Aprobar Liquidación'}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RouteLiquidationPage;
