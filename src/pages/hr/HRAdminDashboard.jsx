import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Clock, AlertTriangle, FileText, CheckCircle, XCircle, MonitorPlay, Calendar as CalendarIcon, DollarSign, Target, MapPin, Activity, Workflow, UserMinus, Brain, Gift, MessageSquare, TrendingUp, Trophy, Star, Shield, Grid, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAttendanceByDate } from '@/repositories/hrRepository';
import { calculateUserPayroll, toggleManualKpi } from '@/repositories/hrPayrollService';
import { supabase } from '@/supabaseClient';
import HRWorkPlansDashboard from './HRWorkPlansDashboard';
import HRPayrollConfig from './HRPayrollConfig';
import HRDocuments from './HRDocuments';
import { motion, AnimatePresence } from 'framer-motion';

import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const ZONES = ['TODAS', 'PALMARITO', 'IZUCAR', 'OAXACA', 'SERDAN', 'GPE-CHILCHOTLA', 'OFICINA_CENTRAL'];

export default function HRAdminDashboard() {
    const { user, loading: authLoading } = useSupabaseAuth();
    const [employees, setEmployees] = useState([]);
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Filters
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedZone, setSelectedZone] = useState('TODAS');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    // Payroll Data
    const [payrollData, setPayrollData] = useState([]);
    const [calculatingPayroll, setCalculatingPayroll] = useState(false);

    // Auth Check
    const type = (user?.user_metadata?.type) || (user?.user_metadata?.role) || null;
    const appRoles = (user?.app_metadata?.roles) || [];
    const role = type || (appRoles.length ? appRoles[0] : null);
    const normalizedRole = (role || '').toString().trim().toLowerCase();
    
    const isAuthorized = normalizedRole === 'rrhh' || normalizedRole === 'rh' || normalizedRole === 'admin' || normalizedRole === 'administrador';

    useEffect(() => {
        if (isAuthorized) {
            loadDashboardData();
        }
    }, [selectedDate, isAuthorized]);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('*');

            if (error) throw error;
            
            const parsedProfiles = (profiles || [])
                .filter(p => !p.name?.toUpperCase().includes('DEMO'))
                .map(p => {
                    if (typeof p.payroll_config === 'string') {
                        try {
                            p.payroll_config = JSON.parse(p.payroll_config);
                        } catch (e) {}
                    }
                    return p;
                });
            
            setEmployees(parsedProfiles);

            const attendance = await getAttendanceByDate(selectedDate);
            setAttendanceData(attendance || []);

        } catch (error) {
            console.error("Error loading HR Admin data", error);
        } finally {
            setLoading(false);
        }
    };

    const loadPayrollData = async () => {
        setCalculatingPayroll(true);
        try {
            const [year, month] = selectedMonth.split('-');
            const results = [];
            
            const filteredEmps = selectedZone === 'TODAS' ? employees : employees.filter(e => e.zona === selectedZone);
            
            for (const emp of filteredEmps) {
                const payroll = await calculateUserPayroll(emp, parseInt(year), parseInt(month));
                results.push(payroll);
            }
            
            setPayrollData(results);
        } catch (error) {
            console.error("Error calculating payroll", error);
        } finally {
            setCalculatingPayroll(false);
        }
    };

    const filteredEmployees = selectedZone === 'TODAS' ? employees : employees.filter(e => e.zona === selectedZone);
    const totalEmployees = filteredEmployees.length;

    let presentCount = 0;
    let lateCount = 0;

    filteredEmployees.forEach(emp => {
        const checkIn = attendanceData.find(a => a.user_id === emp.id && a.type === 'check_in');
        if (checkIn) {
            presentCount++;
            const config = emp.payroll_config || {};
            const shiftStart = config.shift_start_time || '08:00';
            
            const checkInTime = new Date(checkIn.timestamp);
            const [shiftHour, shiftMin] = shiftStart.split(':').map(Number);
            
            const limit = new Date(checkInTime);
            limit.setHours(shiftHour, shiftMin, 0, 0);

            if (checkInTime > limit) {
                lateCount++;
            }
        }
    });

    const presentismPercent = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;
    const totalEstimatedPayroll = payrollData.reduce((acc, curr) => acc + curr.totalPay, 0);

    const getAttendanceStatusBadge = (emp) => {
        const checkIn = attendanceData.find(a => a.user_id === emp.id && a.type === 'check_in');
        if (!checkIn) return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-900/40 text-red-400 border border-red-800/50 flex items-center gap-1.5 w-max">Ausente</span>;

        const config = emp.payroll_config || {};
        const shiftStart = config.shift_start_time || '08:00';
        const time = new Date(checkIn.timestamp);
        const [shiftHour, shiftMin] = shiftStart.split(':').map(Number);
        
        const limit = new Date(time);
        limit.setHours(shiftHour, shiftMin, 0, 0);

        if (time > limit) return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-900/40 text-amber-400 border border-amber-800/50 flex items-center gap-1.5 w-max">Retardo</span>;
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 flex items-center gap-1.5 w-max">Puntual</span>;
    };

    if (authLoading) return <div className="p-8 text-center text-slate-400">Verificando accesos...</div>;
    if (!isAuthorized) {
        return (
            <div className="h-screen w-full flex items-center justify-center">
                <div className="text-center space-y-4">
                    <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
                    <h1 className="text-2xl font-bold text-white">Acceso Denegado</h1>
                    <p className="text-slate-400">Esta área es exclusiva para el personal de Recursos Humanos o Administración.</p>
                    <Button onClick={() => navigate('/')} variant="outline" className="mt-4 border-slate-700 text-slate-300">Volver al Inicio</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                            <Activity size={24} />
                        </div>
                        Centro de Comando RRHH
                    </h1>
                    <p className="text-slate-400 text-sm mt-2">Gestión inteligente de personal, asistencia y nómina.</p>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 px-3 py-1.5 w-full md:w-auto">
                        <MapPin className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
                        <Select value={selectedZone} onValueChange={setSelectedZone}>
                            <SelectTrigger className="w-full md:w-[160px] border-0 bg-transparent text-slate-200 focus:ring-0 shadow-none h-8 px-0 text-sm">
                                <SelectValue placeholder="Zona" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                {ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <button
                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors w-full md:w-auto shadow-sm"
                        onClick={() => navigate('/kiosk')}
                    >
                        <MonitorPlay size={18} />
                        Kiosco
                    </button>
                </div>
            </div>

            {/* === HRIS Enterprise Quick Access === */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-emerald-500/20 rounded-lg"><Grid className="w-4 h-4 text-emerald-400" /></div>
                        <h2 className="text-white font-semibold text-sm">Módulos HRIS Enterprise</h2>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">10 Nuevos</span>
                    </div>
                    <button onClick={() => navigate('/hr/hub')} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition">
                        Ver todos <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                    {[
                        { label: 'Onboarding', icon: Workflow, path: '/hr/onboarding', color: 'text-emerald-400' },
                        { label: 'Offboarding', icon: UserMinus, path: '/hr/offboarding', color: 'text-red-400' },
                        { label: 'Performance', icon: Target, path: '/hr/performance', color: 'text-violet-400' },
                        { label: 'Skills', icon: Brain, path: '/hr/skills', color: 'text-cyan-400' },
                        { label: 'Beneficios', icon: Gift, path: '/hr/benefits', color: 'text-amber-400' },
                        { label: 'Encuestas', icon: MessageSquare, path: '/hr/surveys', color: 'text-indigo-400' },
                        { label: 'Calendario', icon: CalendarIcon, path: '/hr/calendar', color: 'text-teal-400' },
                        { label: 'Sucesión', icon: Trophy, path: '/hr/succession', color: 'text-pink-400' },
                        { label: 'Career Path', icon: TrendingUp, path: '/hr/careers', color: 'text-sky-400' },
                        { label: 'Empleados', icon: Users, path: '/admin/hr/employees', color: 'text-blue-400' },
                        { label: 'Reclutamiento', icon: Star, path: '/rrhh/recruitment', color: 'text-rose-400' },
                        { label: 'Vacaciones', icon: CheckCircle, path: '/admin/hr/time-off', color: 'text-green-400' },
                    ].map((mod) => {
                        const Icon = mod.icon;
                        return (
                            <motion.button
                                key={mod.label}
                                whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}
                                onClick={() => navigate(mod.path)}
                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer group"
                            >
                                <div className="w-9 h-9 rounded-xl bg-slate-700/50 group-hover:bg-slate-700 flex items-center justify-center transition-colors">
                                    <Icon className={`w-4 h-4 ${mod.color}`} />
                                </div>
                                <span className="text-[10px] text-slate-400 group-hover:text-white text-center leading-tight transition-colors font-medium">{mod.label}</span>
                            </motion.button>
                        );
                    })}
                </div>
            </div>
            {/* === END HRIS Enterprise Quick Access === */}

            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Personal Activo</p>
                            <h3 className="text-3xl font-bold text-white mt-1">{totalEmployees}</h3>
                        </div>
                        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">En zona: {selectedZone}</p>
                </div>

                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Presentismo</p>
                            <h3 className="text-3xl font-bold text-white mt-1">{presentismPercent}%</h3>
                        </div>
                        <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-xs text-emerald-500/80 mt-2">{presentCount} asistencias hoy</p>
                </div>

                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Retardos</p>
                            <h3 className="text-3xl font-bold text-white mt-1">{lateCount}</h3>
                        </div>
                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-xs text-amber-500/80 mt-2">Requieren revisión</p>
                </div>

                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400">Nómina Estimada</p>
                            <h3 className="text-3xl font-bold text-white mt-1">${totalEstimatedPayroll.toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl">
                            <DollarSign className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Calculada en pestaña Comisiones</p>
                </div>
            </div>

            {/* Main Content Tabs */}
            <Tabs defaultValue="attendance" className="w-full">
                <TabsList className="bg-slate-900/50 border border-slate-800 p-1.5 rounded-xl mb-6 flex-wrap h-auto gap-1">
                    <TabsTrigger value="attendance" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-slate-400">Asistencia Histórica</TabsTrigger>
                    <TabsTrigger value="payroll_config" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-slate-400">Configuración Salarial</TabsTrigger>
                    <TabsTrigger value="commissions" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-slate-400" onClick={loadPayrollData}>Cálculo de Nómina</TabsTrigger>
                    <TabsTrigger value="workplans" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-slate-400">Planes de Trabajo</TabsTrigger>
                    <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-slate-400">📁 Documentos</TabsTrigger>
                </TabsList>

                {/* TAB: ASISTENCIA */}
                <TabsContent value="attendance">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                        <div className="border-b border-slate-800 p-4 sm:px-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <h2 className="text-lg font-semibold text-white flex items-center">
                                <Clock className="mr-2 w-5 h-5 text-indigo-400" />
                                Registro de Asistencia
                            </h2>
                            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                                <CalendarIcon className="w-4 h-4 ml-2 text-slate-500" />
                                <Input 
                                    type="date" 
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="bg-transparent border-0 text-slate-200 focus-visible:ring-0 w-auto text-sm"
                                />
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-950 border-b border-slate-800">
                                    <tr className="text-slate-400 font-medium text-xs uppercase tracking-wider">
                                        <th className="px-6 py-4">Empleado</th>
                                        <th className="px-6 py-4">Rol</th>
                                        <th className="px-6 py-4">Entrada</th>
                                        <th className="px-6 py-4">Salida</th>
                                        <th className="px-6 py-4">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    <AnimatePresence>
                                        {filteredEmployees.map((emp) => {
                                            const checkIn = attendanceData.find(a => a.user_id === emp.id && a.type === 'check_in');
                                            const checkOut = attendanceData.find(a => a.user_id === emp.id && a.type === 'check_out');

                                            const arrivalTime = checkIn ? new Date(checkIn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
                                            const exitTime = checkOut ? new Date(checkOut.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

                                            return (
                                                <motion.tr 
                                                    key={emp.id}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    className="hover:bg-slate-800/30 transition-colors"
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-white">{emp.name}</div>
                                                        {emp.zona && <div className="text-xs text-slate-500 mt-0.5">{emp.zona}</div>}
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-400 text-sm">{emp.role}</td>
                                                    <td className="px-6 py-4 text-slate-300 font-mono text-sm">{arrivalTime}</td>
                                                    <td className="px-6 py-4 text-slate-300 font-mono text-sm">{exitTime}</td>
                                                    <td className="px-6 py-4">{getAttendanceStatusBadge(emp)}</td>
                                                </motion.tr>
                                            );
                                        })}
                                    </AnimatePresence>
                                    {filteredEmployees.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-12 text-slate-500">
                                                No se encontraron empleados en esta zona.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </TabsContent>

                {/* TAB: CONFIGURACIÓN SALARIAL */}
                <TabsContent value="payroll_config">
                    <HRPayrollConfig employees={filteredEmployees} onUpdate={loadDashboardData} />
                </TabsContent>

                {/* TAB: MOTOR DE NÓMINA / COMISIONES */}
                <TabsContent value="commissions">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                        <div className="border-b border-slate-800 p-4 sm:px-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <h2 className="text-lg font-semibold text-white flex items-center">
                                <DollarSign className="mr-2 w-5 h-5 text-emerald-400" />
                                Motor de Comisiones Generadas
                            </h2>
                            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                                <CalendarIcon className="w-4 h-4 ml-2 text-slate-500" />
                                <Input 
                                    type="month" 
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="bg-transparent border-0 text-slate-200 focus-visible:ring-0 w-auto text-sm"
                                />
                                <button onClick={loadPayrollData} disabled={calculatingPayroll} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors ml-2">
                                    {calculatingPayroll ? 'Calculando...' : 'Recalcular'}
                                </button>
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-950 border-b border-slate-800">
                                    <tr className="text-slate-400 font-medium text-xs uppercase tracking-wider">
                                        <th className="px-6 py-4">Empleado</th>
                                        <th className="px-6 py-4">Salario Base</th>
                                        <th className="px-6 py-4">Progreso KPIs</th>
                                        <th className="px-6 py-4">Bono Generado</th>
                                        <th className="px-6 py-4 text-right">Total Nómina</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {payrollData.length === 0 && !calculatingPayroll && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-12 text-slate-500">
                                                Haz clic en Recalcular para obtener la nómina del mes seleccionado.
                                            </td>
                                        </tr>
                                    )}
                                    {payrollData.map((data) => (
                                        <tr key={data.user_id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-white">{data.user_name}</div>
                                                {data.zona && <div className="text-xs text-slate-500 mt-0.5">{data.zona}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-slate-300 font-mono">${data.baseSalary.toLocaleString()}</td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1.5 w-56">
                                                    {data.kpis.length === 0 ? (
                                                        <span className="text-xs text-slate-500">Sin KPIs configurados</span>
                                                    ) : (
                                                        data.kpis.map((kpi, idx) => (
                                                            <div key={idx} className="flex flex-col gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs">
                                                                <div className="flex justify-between items-center text-slate-300">
                                                                    <span className="font-medium text-[11px] uppercase tracking-wide">{kpi.type === 'custom' ? (kpi.customName || 'Manual') : kpi.type.replace('_', ' ')}</span>
                                                                    <span className={`font-bold ${kpi.isMet ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                                        {kpi.type !== 'sales_volume' && kpi.type !== 'effective_clients' && kpi.type !== 'attendance' && kpi.type !== 'evaluation' ? (
                                                                            kpi.isMet ? '1 / 1' : '0 / 1'
                                                                        ) : (
                                                                            `${kpi.achieved} / ${kpi.target}`
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                {kpi.type !== 'sales_volume' && kpi.type !== 'effective_clients' && kpi.type !== 'attendance' && kpi.type !== 'evaluation' ? (
                                                                    <button 
                                                                        onClick={async () => {
                                                                            const [y, m] = selectedMonth.split('-');
                                                                            const kpiName = kpi.type === 'custom' ? (kpi.customName || 'Manual') : kpi.type;
                                                                            await toggleManualKpi(data.user_id, y, m, kpiName, !kpi.isMet);
                                                                            loadPayrollData();
                                                                        }}
                                                                        className={`w-full px-2 py-1.5 rounded text-[10px] font-bold text-center border transition-colors ${kpi.isMet ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800/50 hover:bg-emerald-800/60' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
                                                                    >
                                                                        {kpi.isMet ? '✓ CUMPLIDO (Click para Quitar)' : '✗ PENDIENTE (Click para Cumplir)'}
                                                                    </button>
                                                                ) : (
                                                                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                                                                        <div className={`h-1.5 rounded-full ${kpi.isMet ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min((kpi.achieved / kpi.target) * 100, 100)}%` }}></div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-emerald-400 font-semibold font-mono">+${data.totalBonus.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-lg font-black text-white font-mono">${data.totalPay.toLocaleString()}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </TabsContent>

                {/* TAB: PLANES DE TRABAJO */}
                <TabsContent value="workplans">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 sm:p-4 overflow-hidden shadow-sm">
                        <HRWorkPlansDashboard />
                    </div>
                </TabsContent>

                {/* TAB: DOCUMENTOS */}
                <TabsContent value="documents">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                        <div className="border-b border-slate-800 p-4 sm:px-6 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span className="text-xl">📁</span>
                                Expediente Digital
                            </h2>
                            <span className="text-xs font-medium text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">Solo RRHH</span>
                        </div>
                        <div className="p-4 sm:p-6">
                            <HRDocuments employees={employees} currentUser={user} />
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

        </div>
    );
}
