import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Truck, CheckCircle, AlertTriangle, AlertCircle, Wrench, Fuel } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

export default function FleetDashboard() {
    const [vehicles, setVehicles] = useState([]);
    const [inspections, setInspections] = useState([]);
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('ALL');
    const [loading, setLoading] = useState(true);

    const { user } = useSupabaseAuth();
    const { toast } = useToast();

    // Modals state
    const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [isAddVehicleModalOpen, setIsAddVehicleModalOpen] = useState(false);
    
    const [fuelData, setFuelData] = useState({ vehicle_id: '', amount: '', mileage: '' });
    const [serviceData, setServiceData] = useState({ vehicle_id: '', type: 'SERVICE', amount: '', mileage: '', description: '' });
    const [vehicleData, setVehicleData] = useState({ plate: '', brand: '', model: '', year: new Date().getFullYear(), assigned_route: '', branch_id: '' });


    const fetchFleetData = async () => {
        setLoading(true);
        try {
            // Fetch Branches for filter
            const { data: bData } = await supabase.from('branches').select('*').order('name');
            if (bData) setBranches(bData);

            // Fetch Vehicles (with branch info if possible, though maybe not mapped natively without a join, let's just do a left join or mapping)
            const { data: vData } = await supabase.from('fleet_vehicles').select('*, branches(name)').order('id');
            if (vData) setVehicles(vData);

            // Fetch Today's Inspections
            const today = new Date().toISOString().split('T')[0];
            const { data: iData } = await supabase
                .from('fleet_inspections')
                .select('*, fleet_vehicles(plate, model, branch_id)')
                .eq('inspection_date', today);
            if (iData) setInspections(iData);

        } catch (error) {
            console.error("Error fetching fleet data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFleetData();
    }, []);

    const handleAddFuel = async (e) => {
        e.preventDefault();
        try {
            const { error } = await supabase.from('fleet_maintenance').insert({
                vehicle_id: fuelData.vehicle_id,
                type: 'FUEL',
                amount: parseFloat(fuelData.amount),
                mileage_at_event: parseInt(fuelData.mileage),
                reported_by: user.id
            });
            if (error) throw error;
            
            // Update vehicle mileage
            if (fuelData.mileage) {
                await supabase.from('fleet_vehicles')
                    .update({ current_mileage: parseInt(fuelData.mileage) })
                    .eq('id', fuelData.vehicle_id);
            }
            
            toast({ title: 'Éxito', description: 'Registro de combustible guardado.' });
            setIsFuelModalOpen(false);
            setFuelData({ vehicle_id: '', amount: '', mileage: '' });
            fetchFleetData();
        } catch (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    const handleAddService = async (e) => {
        e.preventDefault();
        try {
            const { error } = await supabase.from('fleet_maintenance').insert({
                vehicle_id: serviceData.vehicle_id,
                type: serviceData.type,
                amount: parseFloat(serviceData.amount),
                mileage_at_event: parseInt(serviceData.mileage),
                description: serviceData.description,
                reported_by: user.id
            });
            if (error) throw error;
            
            // Update vehicle mileage
            if (serviceData.mileage) {
                await supabase.from('fleet_vehicles')
                    .update({ current_mileage: parseInt(serviceData.mileage) })
                    .eq('id', serviceData.vehicle_id);
            }
            
            toast({ title: 'Éxito', description: 'Registro de servicio guardado.' });
            setIsServiceModalOpen(false);
            setServiceData({ vehicle_id: '', type: 'SERVICE', amount: '', mileage: '', description: '' });
            fetchFleetData();
        } catch (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    const handleAddVehicle = async (e) => {
        e.preventDefault();
        try {
            const { error } = await supabase.from('fleet_vehicles').insert({
                plate: vehicleData.plate.toUpperCase(),
                brand: vehicleData.brand,
                model: vehicleData.model,
                year: parseInt(vehicleData.year),
                assigned_route: vehicleData.assigned_route,
                branch_id: vehicleData.branch_id || null
            });
            if (error) throw error;
            
            toast({ title: 'Éxito', description: 'Vehículo registrado correctamente.' });
            setIsAddVehicleModalOpen(false);
            setVehicleData({ plate: '', brand: '', model: '', year: new Date().getFullYear(), assigned_route: '', branch_id: '' });
            fetchFleetData();
        } catch (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    const getInspectionStatus = (vehicleId) => {
        const ins = inspections.find(i => i.vehicle_id === vehicleId);
        if (!ins) return { status: 'PENDING', component: <Badge className="bg-slate-700">Sin Revisión</Badge> };
        if (ins.status === 'FAILED') return { status: 'FAILED', component: <Badge className="bg-red-600">Falló ({ins.damage_notes})</Badge> };
        if (ins.status === 'WARNING') return { status: 'WARNING', component: <Badge className="bg-amber-600">Advertencia</Badge> };
        return { status: 'PASSED', component: <Badge className="bg-emerald-600">Lista para ruta</Badge> };
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            <Helmet>
                <title>Panel de Flota - Cervezas Finas</title>
            </Helmet>

            <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 flex items-center gap-2">
                        <Truck className="h-8 w-8 text-blue-500" />
                        Control de Flota
                    </h1>
                    <p className="text-slate-400">Inspecciones vehiculares y mantenimiento (Start of Day).</p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <select 
                        value={selectedBranch} 
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white rounded p-2 text-sm"
                    >
                        <option value="ALL">Todas las Bodegas</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id.toString()}>{b.name}</option>
                        ))}
                    </select>
                    <Button onClick={() => setIsFuelModalOpen(true)} className="bg-slate-800 hover:bg-slate-700 text-white"><Fuel className="w-4 h-4 mr-2" /> Combustible</Button>
                    <Button onClick={() => setIsServiceModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 font-bold"><Wrench className="w-4 h-4 mr-2" /> Servicio</Button>
                    <Button onClick={() => setIsAddVehicleModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 font-bold">Nuevo Vehículo</Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Total Unidades</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-white">{vehicles.length}</div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Aprobadas Hoy</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-emerald-400">
                            {inspections.filter(i => i.status === 'PASSED').length}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-red-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Alertas Mecánicas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-red-400">
                            {inspections.filter(i => i.status === 'FAILED' || i.status === 'WARNING').length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-slate-900 border-slate-800 shadow-2xl">
                <CardHeader className="border-b border-slate-800">
                    <CardTitle className="text-white">Estado del Parque Vehicular</CardTitle>
                    <CardDescription className="text-slate-400">Mostrando última lectura de odómetro e inspección del día.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-950/50">
                            <TableRow className="border-slate-800">
                                <TableHead className="text-slate-400">Unidad</TableHead>
                                <TableHead className="text-slate-400">Ruta Asignada</TableHead>
                                <TableHead className="text-right text-slate-400">Odómetro Actual</TableHead>
                                <TableHead className="text-center text-slate-400">Inspección de Hoy</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">Cargando flota...</TableCell></TableRow>
                            ) : vehicles.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No hay vehículos registrados.</TableCell></TableRow>
                            ) : (
                                vehicles
                                    .filter(v => selectedBranch === 'ALL' || v.branch_id === parseInt(selectedBranch))
                                    .map(v => {
                                    const insData = getInspectionStatus(v.id);
                                    return (
                                        <TableRow key={v.id} className="border-slate-800 hover:bg-slate-800/50">
                                            <TableCell>
                                                <div className="font-bold text-white text-lg">{v.plate}</div>
                                                <div className="text-xs text-slate-500">{v.brand} {v.model} ({v.year})</div>
                                                {v.branches && <div className="text-[10px] text-indigo-400 mt-1">{v.branches.name}</div>}
                                            </TableCell>
                                            <TableCell className="font-medium text-slate-300">
                                                {v.assigned_route || 'Sin Asignar'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-blue-400 font-bold">
                                                {v.current_mileage.toLocaleString()} km
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {insData.component}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Fuel Modal */}
            <Dialog open={isFuelModalOpen} onOpenChange={setIsFuelModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Registrar Carga de Combustible</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddFuel} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Vehículo</Label>
                            <select required value={fuelData.vehicle_id} onChange={e => setFuelData({...fuelData, vehicle_id: e.target.value})} className="w-full bg-slate-900 border-slate-700 rounded p-2 text-white">
                                <option value="">Selecciona un vehículo...</option>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Costo ($)</Label>
                            <Input required type="number" step="0.01" value={fuelData.amount} onChange={e => setFuelData({...fuelData, amount: e.target.value})} placeholder="Ej. 850.50" />
                        </div>
                        <div className="space-y-2">
                            <Label>Odómetro (km)</Label>
                            <Input required type="number" value={fuelData.mileage} onChange={e => setFuelData({...fuelData, mileage: e.target.value})} placeholder="Kilometraje al cargar" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsFuelModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">Guardar</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Service Modal */}
            <Dialog open={isServiceModalOpen} onOpenChange={setIsServiceModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Registrar Mantenimiento/Servicio</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddService} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Vehículo</Label>
                            <select required value={serviceData.vehicle_id} onChange={e => setServiceData({...serviceData, vehicle_id: e.target.value})} className="w-full bg-slate-900 border-slate-700 rounded p-2 text-white">
                                <option value="">Selecciona un vehículo...</option>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tipo</Label>
                                <select required value={serviceData.type} onChange={e => setServiceData({...serviceData, type: e.target.value})} className="w-full bg-slate-900 border-slate-700 rounded p-2 text-white">
                                    <option value="SERVICE">Servicio Rutinario</option>
                                    <option value="REPAIR">Reparación</option>
                                    <option value="OTHER">Otro</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Costo ($)</Label>
                                <Input required type="number" step="0.01" value={serviceData.amount} onChange={e => setServiceData({...serviceData, amount: e.target.value})} placeholder="Costo total" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Odómetro (km)</Label>
                            <Input required type="number" value={serviceData.mileage} onChange={e => setServiceData({...serviceData, mileage: e.target.value})} placeholder="Kilometraje del servicio" />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripción Breve</Label>
                            <Input required value={serviceData.description} onChange={e => setServiceData({...serviceData, description: e.target.value})} placeholder="Ej. Cambio de aceite y filtros" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsServiceModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white">Guardar</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Add Vehicle Modal */}
            <Dialog open={isAddVehicleModalOpen} onOpenChange={setIsAddVehicleModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Alta de Nuevo Vehículo</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddVehicle} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Placas</Label>
                                <Input required value={vehicleData.plate} onChange={e => setVehicleData({...vehicleData, plate: e.target.value})} placeholder="Ej. XYZ-1234" />
                            </div>
                            <div className="space-y-2">
                                <Label>Bodega Base</Label>
                                <select required value={vehicleData.branch_id} onChange={e => setVehicleData({...vehicleData, branch_id: e.target.value})} className="w-full bg-slate-900 border-slate-700 rounded p-2 text-white">
                                    <option value="">Selecciona...</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Marca</Label>
                                <Input required value={vehicleData.brand} onChange={e => setVehicleData({...vehicleData, brand: e.target.value})} placeholder="Ej. Isuzu" />
                            </div>
                            <div className="space-y-2">
                                <Label>Modelo</Label>
                                <Input required value={vehicleData.model} onChange={e => setVehicleData({...vehicleData, model: e.target.value})} placeholder="Ej. Elf 300" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Año</Label>
                                <Input required type="number" value={vehicleData.year} onChange={e => setVehicleData({...vehicleData, year: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Ruta Asignada</Label>
                                <Input value={vehicleData.assigned_route} onChange={e => setVehicleData({...vehicleData, assigned_route: e.target.value})} placeholder="Ej. RUTA 1" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsAddVehicleModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">Registrar</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

        </div>
    );
}
