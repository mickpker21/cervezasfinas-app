import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/supabaseClient';
import { Save, Plus, Trash2, Clock, DollarSign, Target } from 'lucide-react';
import { savePayrollConfig, getPayrollConfig } from '@/repositories/hrPayrollService';

const KPI_TYPES = [
    { id: 'sales_volume', label: 'Volumen de Ventas (HL)' },
    { id: 'effective_clients', label: 'Efectividad (Clientes con Compra)' },
    { id: 'attendance', label: 'Asistencia Perfecta (%)' },
    { id: 'evaluation', label: 'Calificación en Evaluaciones (Promedio)' },
    { id: 'custom', label: 'Personalizado (Manual)' }
];

export default function HRPayrollConfig({ employees, onUpdate }) {
    const { toast } = useToast();
    const [selectedUserId, setSelectedUserId] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Config state
    const [shiftStartTime, setShiftStartTime] = useState('08:00');
    const [baseSalary, setBaseSalary] = useState('');
    const [kpis, setKpis] = useState([]);

    useEffect(() => {
        const loadConfig = async () => {
            if (selectedUserId) {
                const emp = employees.find(e => e.id === selectedUserId);
                if (emp) {
                    const config = await getPayrollConfig(emp.id, emp.payroll_config);
                    setShiftStartTime(config.shift_start_time || '08:00');
                    setBaseSalary(config.base_salary || '');
                    setKpis(config.kpis || []);
                }
            }
        };
        loadConfig();
    }, [selectedUserId, employees]);

    const addKpi = () => {
        setKpis([...kpis, { type: 'sales_volume', target: '', bonus: '', customName: '' }]);
    };

    const removeKpi = (index) => {
        setKpis(kpis.filter((_, i) => i !== index));
    };

    const updateKpi = (index, field, value) => {
        const newKpis = [...kpis];
        newKpis[index][field] = value;
        setKpis(newKpis);
    };

    const handleSave = async () => {
        if (!selectedUserId) return;
        setLoading(true);

        const payroll_config = {
            shift_start_time: shiftStartTime,
            base_salary: Number(baseSalary) || 0,
            kpis: kpis.map(k => ({
                ...k,
                target: Number(k.target) || 0,
                bonus: Number(k.bonus) || 0
            }))
        };

        try {
            await savePayrollConfig(selectedUserId, payroll_config);
            // Intento secundario de guardado en la nube
            supabase.from('profiles').update({ payroll_config }).eq('id', selectedUserId).then(() => {});

            toast({ title: "Configuración Guardada", description: "La configuración salarial se ha actualizado correctamente." });
            if (onUpdate) onUpdate(); // Trigger parent refresh
        } catch (error) {
            console.error("Error updating payroll config", error);
            toast({ title: "Error", description: "No se pudo guardar la configuración.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const selectedEmp = employees.find(e => e.id === selectedUserId);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
                <Card className="bg-slate-800/80 backdrop-blur border-slate-700 shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center">
                            <Target className="mr-2 h-5 w-5 text-emerald-400" /> Selección de Empleado
                        </CardTitle>
                        <CardDescription className="text-slate-400">Elige a un usuario para configurar su esquema salarial.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Label className="text-xs text-slate-300 uppercase tracking-wider mb-2 block">Empleado</Label>
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700 text-white max-h-60">
                                {employees.map(emp => (
                                    <SelectItem key={emp.id} value={emp.id} className="focus:bg-emerald-600/20">
                                        {emp.name} ({emp.role})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
            </div>

            <div className="lg:col-span-2">
                {selectedUserId ? (
                    <Card className="bg-slate-800/80 backdrop-blur border-slate-700 shadow-xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                            <DollarSign className="w-64 h-64" />
                        </div>
                        <CardHeader className="border-b border-slate-700/50 bg-slate-800/50">
                            <CardTitle className="text-xl text-white">Esquema de {selectedEmp?.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-8 relative z-10">
                            
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-300 uppercase font-semibold flex items-center">
                                        <Clock className="w-3 h-3 mr-1 text-blue-400"/> Hora de Entrada Oficial
                                    </Label>
                                    <Input 
                                        type="time" 
                                        value={shiftStartTime} 
                                        onChange={(e) => setShiftStartTime(e.target.value)}
                                        className="bg-slate-900 border-slate-700 text-white text-lg"
                                    />
                                    <p className="text-[10px] text-slate-500">Se usará para calcular retardos.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-300 uppercase font-semibold flex items-center">
                                        <DollarSign className="w-3 h-3 mr-1 text-emerald-400"/> Salario Base (Mensual)
                                    </Label>
                                    <Input 
                                        type="number" 
                                        value={baseSalary} 
                                        onChange={(e) => setBaseSalary(e.target.value)}
                                        placeholder="0.00"
                                        className="bg-slate-900 border-slate-700 text-white text-lg"
                                    />
                                    <p className="text-[10px] text-slate-500">Monto fijo antes de bonos.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Indicadores de Desempeño (KPIs)</h3>
                                    <Button size="sm" variant="outline" className="h-8 border-emerald-600/50 text-emerald-400 hover:bg-emerald-600/10" onClick={addKpi}>
                                        <Plus className="w-4 h-4 mr-1" /> Añadir KPI
                                    </Button>
                                </div>

                                {kpis.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500 text-sm">
                                        No hay KPIs configurados para este usuario. Solo recibirá el salario base.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {kpis.map((kpi, idx) => (
                                            <div key={idx} className="flex gap-3 items-end bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                                <div className="flex-1 space-y-1">
                                                    <Label className="text-[10px] text-slate-400 uppercase">Métrica</Label>
                                                    <Select value={kpi.type} onValueChange={(v) => updateKpi(idx, 'type', v)}>
                                                        <SelectTrigger className="bg-slate-950 border-slate-700 h-9 text-sm text-slate-200">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                                            {KPI_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                {kpi.type === 'custom' && (
                                                    <div className="flex-1 space-y-1">
                                                        <Label className="text-[10px] text-slate-400 uppercase">Nombre KPI</Label>
                                                        <Input type="text" placeholder="Ej. Uniforme Limpio" value={kpi.customName || ''} onChange={(e) => updateKpi(idx, 'customName', e.target.value)} className="bg-slate-950 border-slate-700 h-9 text-sm text-white" />
                                                    </div>
                                                )}
                                                <div className="w-24 space-y-1">
                                                    <Label className="text-[10px] text-slate-400 uppercase">Meta (Target)</Label>
                                                    {(kpi.type === 'sales_volume' || kpi.type === 'effective_clients') ? (
                                                        <div className="h-9 px-3 py-2 bg-slate-800/50 text-slate-500 border border-slate-700 text-xs rounded-md flex items-center justify-center cursor-not-allowed" title="La meta se extrae automáticamente del módulo de Metas Globales">
                                                            Auto (Global)
                                                        </div>
                                                    ) : (
                                                        <Input type="number" value={kpi.target} onChange={(e) => updateKpi(idx, 'target', e.target.value)} className="bg-slate-950 border-slate-700 h-9 text-sm text-white" />
                                                    )}
                                                </div>
                                                <div className="w-32 space-y-1">
                                                    <Label className="text-[10px] text-slate-400 uppercase">Bono Económico</Label>
                                                    <Input type="number" value={kpi.bonus} onChange={(e) => updateKpi(idx, 'bonus', e.target.value)} className="bg-slate-950 border-slate-700 h-9 text-sm text-white" />
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-9 w-9 text-red-400 hover:bg-red-500/20 hover:text-red-300" onClick={() => removeKpi(idx)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button onClick={handleSave} disabled={loading} className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-8 shadow-lg shadow-emerald-500/20 border-0">
                                    <Save className="w-4 h-4 mr-2" /> Guardar Configuración
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-slate-700/50 rounded-2xl text-slate-500">
                        <Target className="w-16 h-16 mb-4 opacity-20" />
                        <p>Selecciona un empleado para configurar su esquema salarial y KPIs</p>
                    </div>
                )}
            </div>
        </div>
    );
}
