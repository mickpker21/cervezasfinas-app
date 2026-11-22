import React, { useCallback, useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { um6Api } from '@/lib/um6Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Search, Store, ClipboardCheck, AlertTriangle, Loader2, Eye } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export default function InternalControlPage() {
    const { getAccessToken, user } = useSupabaseAuth();
    const { toast } = useToast();

    const [stores, setStores] = useState([]);
    const [loadingStores, setLoadingStores] = useState(true);
    const [storeSearch, setStoreSearch] = useState('');
    const [selectedStore, setSelectedStore] = useState(null);

    const [validations, setValidations] = useState([]);
    const [loadingValidations, setLoadingValidations] = useState(false);
    const [selectedValidation, setSelectedValidation] = useState(null);

    const [inventory, setInventory] = useState([]);
    const [loadingInventory, setLoadingInventory] = useState(false);

    const fetchStores = useCallback(async () => {
        setLoadingStores(true);
        try {
            const token = await getAccessToken();
            const data = await um6Api.listStores(token);
            setStores(data || []);
        } catch (error) {
            toast({ title: 'Error cargando tiendas', description: error.message, variant: 'destructive' });
        } finally {
            setLoadingStores(false);
        }
    }, [getAccessToken, toast]);

    useEffect(() => {
        fetchStores();
    }, [fetchStores]);

    const handleSelectStore = async (store) => {
        setSelectedStore(store);
        setValidations([]);
        setInventory([]);
        setLoadingValidations(true);
        setLoadingInventory(true);

        try {
            const token = await getAccessToken();

            // Cargar validaciones
            const validationsData = await um6Api.getStoreValidations(token, store.code).catch(() => []);
            setValidations(validationsData);

            // Cargar inventario actual
            const inventoryData = await um6Api.getInventory(token, store.code).catch(() => ({ items: [] }));
            setInventory(inventoryData.items || []);

            // Registrar auditoría
            await um6Api.createAuditLog(token, {
                action: 'VIEW_STORE_DETAILS',
                targetStoreCode: store.code,
                details: `Usuario ${user.email} revisó la tienda ${store.code}`
            }).catch(console.error);

        } catch (error) {
            toast({ title: 'Error cargando detalles', description: error.message, variant: 'destructive' });
        } finally {
            setLoadingValidations(false);
            setLoadingInventory(false);
        }
    };

    const filteredStores = stores.filter(s =>
        s.name.toLowerCase().includes(storeSearch.toLowerCase()) ||
        s.code.toLowerCase().includes(storeSearch.toLowerCase())
    );

    return (
        <div className="p-6 min-h-screen bg-gray-950 text-white space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        Control Interno
                    </h1>
                    <p className="text-gray-400">Auditoría y validación de inventarios</p>
                </div>
                <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Buscar tienda..."
                        value={storeSearch}
                        onChange={(e) => setStoreSearch(e.target.value)}
                        className="pl-8 bg-gray-900 border-gray-800"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Lista de Tiendas */}
                <Card className="lg:col-span-4 bg-gray-900 border-gray-800 h-[calc(100vh-12rem)] flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                            <Store className="h-5 w-5 text-emerald-500" />
                            Tiendas ({filteredStores.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-0">
                        {loadingStores ? (
                            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-emerald-500" /></div>
                        ) : (
                            <div className="divide-y divide-gray-800">
                                {filteredStores.map(store => (
                                    <button
                                        key={store.code}
                                        onClick={() => handleSelectStore(store)}
                                        className={`w-full text-left p-4 hover:bg-gray-800 transition-colors ${selectedStore?.code === store.code ? 'bg-gray-800 border-l-4 border-emerald-500' : ''}`}
                                    >
                                        <div className="font-medium text-gray-200">{store.name}</div>
                                        <div className="text-sm text-gray-500">{store.code}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Detalles de la Tienda */}
                <div className="lg:col-span-8 space-y-6">
                    {selectedStore ? (
                        <>
                            {/* Historial de Validaciones */}
                            <Card className="bg-gray-900 border-gray-800">
                                <CardHeader>
                                    <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                                        <ClipboardCheck className="h-5 w-5 text-cyan-500" />
                                        Historial de Validaciones
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {loadingValidations ? (
                                        <div className="flex justify-center p-4"><Loader2 className="animate-spin text-cyan-500" /></div>
                                    ) : validations.length === 0 ? (
                                        <div className="text-center p-8 text-gray-500">No hay validaciones registradas.</div>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="border-gray-800 hover:bg-transparent">
                                                    <TableHead className="text-gray-400">Fecha</TableHead>
                                                    <TableHead className="text-gray-400">Usuario</TableHead>
                                                    <TableHead className="text-gray-400">Estado</TableHead>
                                                    <TableHead className="text-right text-gray-400">Acción</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {validations.map(val => (
                                                    <TableRow key={val.id} className="border-gray-800 hover:bg-gray-800/50">
                                                        <TableCell className="text-gray-300">
                                                            {new Date(val.validation_date).toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="text-gray-300">{val.user_id}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={val.status === 'COMPLETED' ? 'default' : 'destructive'} className={val.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : ''}>
                                                                {val.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="sm" onClick={() => setSelectedValidation(val)}>
                                                                <Eye className="h-4 w-4 text-cyan-400" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Inventario Actual */}
                            <Card className="bg-gray-900 border-gray-800">
                                <CardHeader>
                                    <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                                        <Store className="h-5 w-5 text-purple-500" />
                                        Inventario en Vivo
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {loadingInventory ? (
                                        <div className="flex justify-center p-4"><Loader2 className="animate-spin text-purple-500" /></div>
                                    ) : inventory.length === 0 ? (
                                        <div className="text-center p-8 text-gray-500">Inventario vacío.</div>
                                    ) : (
                                        <div className="max-h-96 overflow-y-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="border-gray-800 hover:bg-transparent">
                                                        <TableHead className="text-gray-400">Producto</TableHead>
                                                        <TableHead className="text-gray-400">SKU</TableHead>
                                                        <TableHead className="text-right text-gray-400">Stock</TableHead>
                                                        <TableHead className="text-right text-gray-400">Niveles</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {inventory.map(item => (
                                                        <TableRow key={item.product_id} className="border-gray-800 hover:bg-gray-800/50">
                                                            <TableCell className="font-medium text-gray-200">{item.name}</TableCell>
                                                            <TableCell className="text-gray-400">{item.sku}</TableCell>
                                                            <TableCell className="text-right font-bold text-emerald-400">
                                                                {Number(item.on_hand).toFixed(0)}
                                                            </TableCell>
                                                            <TableCell className="text-right text-xs text-gray-500">
                                                                Min: {item.min_level || '-'} / Max: {item.max_level || '-'}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/50">
                            <Store className="h-16 w-16 mb-4 opacity-20" />
                            <p className="text-lg">Selecciona una tienda para auditar</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Dialogo de Detalle de Validación */}
            <Dialog open={!!selectedValidation} onOpenChange={() => setSelectedValidation(null)}>
                <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Detalle de Validación</DialogTitle>
                    </DialogHeader>
                    {selectedValidation && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500">Tienda:</span> <span className="text-white">{selectedValidation.store_code}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Fecha:</span> <span className="text-white">{new Date(selectedValidation.validation_date).toLocaleString()}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-gray-500">Notas:</span> <p className="text-gray-300 mt-1">{selectedValidation.notes || 'Sin notas'}</p>
                                </div>
                            </div>

                            <div className="border rounded-md border-gray-800 overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-gray-800">
                                        <TableRow className="border-gray-700">
                                            <TableHead className="text-gray-300">Producto</TableHead>
                                            <TableHead className="text-right text-gray-300">Esperado</TableHead>
                                            <TableHead className="text-right text-gray-300">Contado</TableHead>
                                            <TableHead className="text-right text-gray-300">Dif</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedValidation.result_json?.rows?.map((row, idx) => (
                                            <TableRow key={idx} className="border-gray-800">
                                                <TableCell className="text-gray-300">{row.name}</TableCell>
                                                <TableCell className="text-right text-gray-400">{row.expected}</TableCell>
                                                <TableCell className="text-right text-white font-medium">{row.counted}</TableCell>
                                                <TableCell className={`text-right font-bold ${row.delta === 0 ? 'text-gray-500' : row.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {row.delta > 0 ? '+' : ''}{row.delta}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
