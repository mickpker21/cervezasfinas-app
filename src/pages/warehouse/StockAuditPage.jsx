import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { getTruckInventory, performAudit, adjustInventoryFromAudit } from '@/repositories/inventoryRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Printer } from 'lucide-react';

const StockAuditPage = () => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();


    const [isAuthorized, setIsAuthorized] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    // Missing States
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [auditItems, setAuditItems] = useState([]);
    const [auditComplete, setAuditComplete] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchDrivers = async () => {
            if (!user) return;
            
            // Auto-authorize if user is already an almacenista or admin
            const userRole = user?.profile?.role || user?.user_metadata?.type || user?.app_metadata?.roles?.[0] || '';
            const allowedRoles = ['almacenista', 'ALMACENISTA', 'admin', 'ADMIN', 'sistemas', 'gerente', 'operaciones'];
            if (allowedRoles.includes(userRole.toLowerCase())) {
                setIsAuthorized(true);
            }

            const { data } = await supabase.from('profiles').select('id, name, role, email, branch_id');
            if (data) {
                const currentUserProfile = data.find(p => p.id === user.id);
                const isDriver = currentUserProfile?.role === 'chofer' || currentUserProfile?.role === 'autoventa';

                if (isDriver) {
                    setDrivers([currentUserProfile]);
                    setSelectedDriver(currentUserProfile.id);
                } else {
                    let filtered = data.filter(p => p.role === 'autoventa' || p.role === 'chofer' || p.email === 'chofer@demo.com');
                    
                    // Enforce branch isolation
                    if (user?.profile?.branch_id) {
                        filtered = filtered.filter(p => p.branch_id === user.profile.branch_id);
                    }
                    
                    setDrivers(filtered);
                }
            }
        };
        fetchDrivers();
    }, [user]);

    useEffect(() => {
        if (!selectedDriver) {
            setAuditItems([]);
            setAuditComplete(false);
            return;
        }
        loadSystemStock();
    }, [selectedDriver]);

    const loadSystemStock = async () => {
        setLoading(true);
        try {
            // 1. Get Stock
            const stockMap = await getTruckInventory(selectedDriver);
            // 2. Get Product Names
            const skus = Object.keys(stockMap);
            let products = {};
            if (skus.length > 0) {
                const { data } = await supabase.from('precios').select('cve_marca, des_marca').in('cve_marca', skus);
                (data || []).forEach(p => products[p.cve_marca] = p.des_marca);
            }

            const items = skus.map(sku => ({
                sku,
                des_marca: products[sku] || sku,
                systemQty: stockMap[sku],
                physicalQty: stockMap[sku], // Default to system freq
                diff: 0
            }));

            setAuditItems(items);
            setAuditComplete(false);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handlePhysicalUpdate = (sku, val) => {
        const qty = parseInt(val) || 0;
        setAuditItems(prev => prev.map(p => {
            if (p.sku === sku) {
                return { ...p, physicalQty: qty, diff: qty - p.systemQty };
            }
            return p;
        }));
    };

    const saveAudit = async (adjustInventory = false) => {
        if (!selectedDriver) return;

        try {
            setLoading(true);
            const auditData = auditItems.map(i => ({ sku: i.sku, physicalQty: i.physicalQty }));
            const records = await performAudit(selectedDriver, user.id, auditData);

            if (adjustInventory) {
                await adjustInventoryFromAudit(records);
                toast({ title: "Inventario Ajustado", description: "El sistema ahora coincide con el conteo físico." });
                await loadSystemStock(); // reload
            } else {
                toast({ title: "Auditoría Guardada", description: "Se ha registrado el conteo físico." });
                setAuditComplete(true);
            }

        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Fallo al guardar auditoría", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const printAudit = () => {
        window.print();
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setAuthLoading(true);

        try {
            // 1. Authenticate with Supabase
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) throw authError;

            // 2. Check role from user metadata
            const userRole = authData.user?.app_metadata?.role ||
                authData.user?.user_metadata?.type;

            // 3. Validate role (almacenista or admin)
            const allowedRoles = ['almacenista', 'ALMACENISTA', 'admin', 'ADMIN'];
            if (!allowedRoles.includes(userRole)) {
                // Also check profiles table as fallback
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', authData.user.id)
                    .single();

                const profileRole = profile?.role;
                if (!allowedRoles.includes(profileRole)) {
                    throw new Error('Tu usuario no tiene permisos de almacén');
                }
            }

            // ✅ Authorized
            setIsAuthorized(true);
            toast({
                title: "Acceso concedido",
                description: `Bienvenido, ${authData.user.email}`,
                className: "bg-green-600 text-white"
            });

        } catch (error) {
            console.error('Auth error:', error);
            toast({
                title: "Acceso Denegado",
                description: error.message || "Credenciales incorrectas o sin permisos de almacén",
                variant: "destructive"
            });
            setEmail('');
            setPassword('');
        } finally {
            setAuthLoading(false);
        }
    };

    if (!isAuthorized) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
                <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center">
                    <div className="bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Printer className="text-blue-500 w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Acceso a Almacén</h1>
                    <p className="text-slate-400 mb-8">Inicie sesión con sus credenciales para continuar con la auditoría.</p>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <Input
                            type="email"
                            placeholder="Email del almacenista"
                            className="h-12 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                        <Input
                            type="password"
                            placeholder="Contraseña"
                            className="h-12 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                        <Button
                            type="submit"
                            className="w-full h-12 bg-blue-600 hover:bg-blue-700 font-bold text-lg"
                            disabled={authLoading || !email || !password}
                        >
                            {authLoading ? 'Verificando...' : 'Iniciar Sesión'}
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
            {/* Print Styles Global Reset for this page only if needed, usually Tailwind print: classes suffice */}

            {/* --- INTERFACE (Hidden on Print) --- */}
            <div className="print:hidden">
                <header className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 mb-2">
                            Auditoría de Inventario
                        </h1>
                        <p className="text-slate-400">Validación física de producto al regreso de ruta.</p>
                    </div>
                    <Button variant="ghost" onClick={() => setIsAuthorized(false)} className="text-slate-500 hover:text-white">Bloquear</Button>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Control Panel */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-lg">
                            <label className="block text-sm font-medium mb-3 text-slate-300">Seleccionar Ruta/Chofer</label>
                            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                                <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-200">
                                    <SelectValue placeholder="Seleccionar..." />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                                    {drivers.map(d => (
                                        <SelectItem key={d.id} value={d.id} className="focus:bg-slate-800 focus:text-white">
                                            {d.name || d.id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {!selectedDriver && (
                                <div className="mt-4 p-4 bg-slate-950/50 rounded-lg border border-slate-800 text-sm text-slate-500 text-center">
                                    Selecciona un chofer para cargar su inventario actual.
                                </div>
                            )}
                        </div>

                        {auditComplete && (
                            <div className="bg-green-900/20 text-green-400 p-4 rounded-xl border border-green-900/50 text-center">
                                <h3 className="font-bold mb-1">¡Auditoría Completada!</h3>
                                <p className="text-sm opacity-80">El inventario ha sido verificado.</p>
                            </div>
                        )}
                    </div>

                    {/* Audit Table / Report UI */}
                    <div className="lg:col-span-3">
                        {selectedDriver ? (
                            <div id="audit-section-ui" className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-2xl">
                                <div className="flex justify-between items-start mb-8 border-b border-slate-800 pb-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-white mb-1">Reporte de Cierre</h2>
                                        <div className="text-sm text-slate-400 space-y-1">
                                            <p><span className="font-semibold text-slate-300">Vendedor:</span> {drivers.find(d => d.id === selectedDriver)?.name || selectedDriver}</p>
                                            <p><span className="font-semibold text-slate-300">Auditor:</span> {user?.email}</p>
                                            <p><span className="font-semibold text-slate-300">Fecha:</span> {new Date().toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" onClick={printAudit} className="gap-2 border-slate-700 hover:bg-slate-800 text-slate-300">
                                        <Printer size={16} /> Imprimir
                                    </Button>
                                </div>

                                <div className="overflow-x-auto rounded-lg border border-slate-800">
                                    <Table>
                                        <TableHeader className="bg-slate-950">
                                            <TableRow className="border-slate-800 hover:bg-slate-950">
                                                <TableHead className="text-slate-400 font-bold">SKU</TableHead>
                                                <TableHead className="text-slate-400 font-bold">Producto</TableHead>
                                                <TableHead className="text-center text-slate-400 font-bold bg-slate-900/50">Sistema</TableHead>
                                                <TableHead className="text-center w-32 text-slate-400 font-bold bg-blue-900/10">Físico</TableHead>
                                                <TableHead className="text-center text-slate-400 font-bold">Diferencia</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {auditItems.map(item => (
                                                <TableRow key={item.sku} className={`border-slate-800 transition-colors ${item.diff !== 0 ? 'bg-red-900/10 hover:bg-red-900/20' : 'hover:bg-slate-800/50'}`}>
                                                    <TableCell className="font-mono text-xs text-slate-500">{item.sku}</TableCell>
                                                    <TableCell className="font-medium text-slate-300">{item.des_marca}</TableCell>
                                                    <TableCell className="text-center text-slate-400 bg-slate-950/30 font-mono text-lg">{item.systemQty}</TableCell>
                                                    <TableCell className="text-center bg-blue-900/5 p-1">
                                                        <Input
                                                            type="number"
                                                            value={item.physicalQty}
                                                            onChange={e => handlePhysicalUpdate(item.sku, e.target.value)}
                                                            className={`text-center h-9 bg-slate-950 border-slate-700 text-slate-100 font-bold mx-auto w-24 focus:ring-blue-500 ${item.diff !== 0 ? 'border-red-500 text-red-400' : ''}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className={`text-center font-bold text-lg ${item.diff < 0 ? 'text-red-400' : (item.diff > 0 ? 'text-blue-400' : 'text-slate-600')}`}>
                                                        {item.diff > 0 ? `+${item.diff}` : item.diff}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="mt-8 flex flex-col sm:flex-row justify-end gap-4 border-t border-slate-800 pt-6">
                                    <Button
                                        variant="secondary"
                                        onClick={() => saveAudit(false)}
                                        disabled={loading}
                                        className="bg-slate-800 text-slate-200 hover:bg-slate-700"
                                    >
                                        Solo Guardar Reporte
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={() => saveAudit(true)}
                                        disabled={loading}
                                        className="bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20"
                                    >
                                        Finalizar y AJUSTAR Inventario
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-slate-600 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/50 h-96">
                                <Printer size={48} className="mb-4 opacity-50" />
                                <h3 className="text-xl font-bold mb-2">Esperando selección</h3>
                                <p>Selecciona un vendedor del panel izquierdo para comenzar la auditoría.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- PRINT TEMPLATE (Ticket Format) --- */}
            {selectedDriver && (
                <div className="hidden print:block font-mono text-black p-4 max-w-sm mx-auto">
                    <div className="text-center font-bold mb-2 text-xl">CERVEZAS FINAS</div>
                    <div className="text-center text-sm mb-4">AUDITORÍA DE INVENTARIO</div>

                    <div className="text-xs space-y-1 mb-4">
                        <div className="flex justify-between"><span>Fecha:</span> <span>{new Date().toLocaleString('es-MX')}</span></div>
                        <div className="flex justify-between"><span>Vend:</span> <span>{drivers.find(d => d.id === selectedDriver)?.name || 'Desc'}</span></div>
                        <div className="flex justify-between"><span>Auditor:</span> <span>{user?.email?.split('@')[0]}</span></div>
                    </div>

                    <hr className="my-2 border-black border-dashed" />

                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between font-bold border-b border-black pb-1 mb-2">
                            <span>PROD</span>
                            <span>SYS / FIS / DIF</span>
                        </div>
                        {auditItems.map(item => (
                            <div key={item.sku} className="mb-2">
                                <div className="font-bold">{item.des_marca}</div>
                                <div className="flex justify-between text-gray-600">
                                    <span>{item.sku}</span>
                                    <span className="font-bold text-black">
                                        {item.systemQty} / {item.physicalQty} / {item.diff > 0 ? `+${item.diff}` : item.diff}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <hr className="my-4 border-black border-dashed" />

                    <div className="mt-8 pt-8 border-t border-black border-dashed">
                        <div className="text-center text-xs mb-8">Firma Auditor</div>
                        <div className="h-8 border-b border-black mx-12"></div>
                    </div>
                    <div className="mt-8 pt-8 border-t border-black border-dashed">
                        <div className="text-center text-xs mb-8">Firma Chofer/Vendedor</div>
                        <div className="h-8 border-b border-black mx-12"></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockAuditPage;
