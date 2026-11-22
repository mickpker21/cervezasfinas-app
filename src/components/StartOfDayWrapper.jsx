import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ShieldCheck, Truck, CheckCircle2, AlertTriangle, PenTool } from 'lucide-react';

export default function StartOfDayWrapper({ children, requiredFor = ['autoventa', 'chofer'] }) {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    
    const [isChecked, setIsChecked] = useState(false);
    const [loading, setLoading] = useState(true);
    
    // Form State
    const [vehicles, setVehicles] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [mileage, setMileage] = useState('');
    const [checks, setChecks] = useState({ tires: false, lights: false, fluids: false, brakes: false });
    const [damageNotes, setDamageNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!user) return;
        
        const role = user.user_metadata?.role?.toLowerCase() || '';
        
        // If role doesn't require checklist, pass immediately
        if (!requiredFor.includes(role)) {
            setIsChecked(true);
            setLoading(false);
            return;
        }

        const checkTodayInspection = async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('fleet_inspections')
                    .select('id')
                    .eq('driver_id', user.id)
                    .eq('inspection_date', today)
                    .maybeSingle();

                if (data) {
                    setIsChecked(true);
                } else {
                    // Fetch vehicles for the dropdown
                    const { data: vData } = await supabase.from('fleet_vehicles').select('id, plate, brand, model').eq('status', 'ACTIVE');
                    setVehicles(vData || []);
                }
            } catch (err) {
                console.error("Error checking inspection:", err);
            } finally {
                setLoading(false);
            }
        };

        checkTodayInspection();
    }, [user, requiredFor]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!selectedVehicle || !mileage) {
            toast({ title: 'Faltan datos', description: 'Selecciona unidad y kilometraje.', variant: 'destructive' });
            return;
        }

        const allChecked = Object.values(checks).every(Boolean);
        if (!allChecked && !damageNotes) {
            toast({ title: 'Advertencia', description: 'Si un chequeo falló, debes agregar notas de daño.', variant: 'destructive' });
            return;
        }

        setSubmitting(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const status = allChecked ? 'PASSED' : (damageNotes ? 'WARNING' : 'FAILED');
            
            const { error } = await supabase.from('fleet_inspections').insert({
                vehicle_id: selectedVehicle,
                driver_id: user.id,
                inspection_date: today,
                mileage_start: Number(mileage),
                tires_ok: checks.tires,
                lights_ok: checks.lights,
                fluids_ok: checks.fluids,
                brakes_ok: checks.brakes,
                clean_ok: true,
                damage_notes: damageNotes,
                status: status
            });

            if (error) throw error;

            // Update Vehicle Mileage
            await supabase.from('fleet_vehicles').update({ current_mileage: Number(mileage) }).eq('id', selectedVehicle);

            toast({ title: 'Inspección Completada', description: 'Buen viaje y maneja con precaución.', className: 'bg-emerald-600 text-white' });
            setIsChecked(true);
        } catch (err) {
            console.error(err);
            toast({ title: 'Error', description: 'No se pudo guardar la inspección.', variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Verificando estatus operativo...</div>;
    }

    if (isChecked) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg bg-slate-900 border-slate-800 shadow-2xl border-t-4 border-t-amber-500">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto bg-amber-500/20 p-4 rounded-full w-20 h-20 flex items-center justify-center mb-4">
                        <ShieldCheck className="w-10 h-10 text-amber-500" />
                    </div>
                    <CardTitle className="text-2xl text-white">Inspección Diaria de Seguridad</CardTitle>
                    <CardDescription className="text-slate-400">Debes completar el checklist antes de iniciar tu ruta.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 space-y-2">
                                <label className="text-sm font-medium text-slate-300">Unidad Asignada</label>
                                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                    <SelectTrigger className="bg-slate-950 border-slate-700">
                                        <SelectValue placeholder="Selecciona tu camión..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700">
                                        {vehicles.map(v => (
                                            <SelectItem key={v.id} value={v.id.toString()}>
                                                {v.plate} - {v.brand} {v.model}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="col-span-2 space-y-2">
                                <label className="text-sm font-medium text-slate-300">Odómetro Inicial (km)</label>
                                <Input 
                                    type="number" 
                                    required 
                                    value={mileage} 
                                    onChange={e => setMileage(e.target.value)}
                                    placeholder="Ej. 45000" 
                                    className="bg-slate-950 border-slate-700 font-mono text-lg" 
                                />
                            </div>
                        </div>

                        <div className="space-y-3 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                            <h4 className="font-bold text-slate-200 mb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Revisión Física</h4>
                            
                            <label className="flex items-center justify-between p-2 hover:bg-slate-800 rounded cursor-pointer">
                                <span className="text-sm text-slate-300">Llantas en buen estado (Sin ponchaduras)</span>
                                <input type="checkbox" className="w-5 h-5 accent-emerald-500" checked={checks.tires} onChange={e => setChecks({...checks, tires: e.target.checked})} />
                            </label>
                            <label className="flex items-center justify-between p-2 hover:bg-slate-800 rounded cursor-pointer">
                                <span className="text-sm text-slate-300">Luces direccionales y faros funcionales</span>
                                <input type="checkbox" className="w-5 h-5 accent-emerald-500" checked={checks.lights} onChange={e => setChecks({...checks, lights: e.target.checked})} />
                            </label>
                            <label className="flex items-center justify-between p-2 hover:bg-slate-800 rounded cursor-pointer">
                                <span className="text-sm text-slate-300">Niveles de aceite y anticongelante OK</span>
                                <input type="checkbox" className="w-5 h-5 accent-emerald-500" checked={checks.fluids} onChange={e => setChecks({...checks, fluids: e.target.checked})} />
                            </label>
                            <label className="flex items-center justify-between p-2 hover:bg-slate-800 rounded cursor-pointer">
                                <span className="text-sm text-slate-300">Frenos responden correctamente</span>
                                <input type="checkbox" className="w-5 h-5 accent-emerald-500" checked={checks.brakes} onChange={e => setChecks({...checks, brakes: e.target.checked})} />
                            </label>
                        </div>

                        {(!Object.values(checks).every(Boolean)) && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <label className="text-sm font-medium text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="w-4 h-4" /> Hay fallas. Describe el problema:
                                </label>
                                <Input 
                                    required 
                                    value={damageNotes} 
                                    onChange={e => setDamageNotes(e.target.value)}
                                    placeholder="Ej. Llanta trasera baja, foco fundido..." 
                                    className="bg-amber-500/10 border-amber-500/50 focus-visible:ring-amber-500" 
                                />
                            </div>
                        )}

                        <Button 
                            type="submit" 
                            disabled={submitting}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 text-lg"
                        >
                            {submitting ? 'Guardando...' : 'Iniciar Ruta'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
