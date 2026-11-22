import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { 
    Users, 
    Calendar, 
    TrendingUp, 
    ChevronLeft, 
    ChevronRight,
    Eye,
    CheckCircle2,
    Clock,
    Search,
    Filter,
    ArrowUpRight,
    Download
} from 'lucide-react';
import { 
    getAllWorkPlans, 
    getSupervisors,
    getWorkPlan
} from '@/repositories/workPlanRepository';
import WorkPlanGrid from '@/components/WorkPlanGrid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle 
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const HRWorkPlansDashboard = () => {
    const [monthYear, setMonthYear] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [loading, setLoading] = useState(true);
    const [supervisors, setSupervisors] = useState([]);
    const [plans, setPlans] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // For detail view
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        loadData();
    }, [monthYear]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [supList, planList] = await Promise.all([
                getSupervisors(),
                getAllWorkPlans(monthYear)
            ]);
            setSupervisors(supList);
            setPlans(planList);
        } catch (error) {
            console.error('[HR] Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetail = async (plan, supervisor) => {
        setLoadingDetail(true);
        setIsDetailOpen(true);
        try {
            // Plan from getAllWorkPlans might not have activities/records nested depending on query
            // So we fetch the full plan for this specific user
            const fullPlan = await getWorkPlan(supervisor.id, monthYear);
            setSelectedPlan(fullPlan || {
                activities: [],
                month_year: monthYear,
                supervisor: supervisor
            });
        } catch (error) {
            console.error('[HR] Error loading plan detail:', error);
        } finally {
            setLoadingDetail(false);
        }
    };

    const filteredSupervisors = useMemo(() => {
        return supervisors.filter(s => 
            (s.full_name || s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.email || '').toLowerCase().includes(searchTerm.toLowerCase())
        ).map(s => {
            const plan = plans.find(p => p.supervisor_id === s.id);
            return { ...s, plan };
        });
    }, [supervisors, plans, searchTerm]);

    const stats = useMemo(() => {
        const total = supervisors.length;
        const withPlan = plans.length;
        const avgProgress = plans.length > 0 
            ? plans.reduce((acc, p) => acc + (p.progress || 0), 0) / plans.length 
            : 0;
        return { total, withPlan, avgProgress };
    }, [supervisors, plans]);

    const changeMonth = (offset) => {
        const [y, m] = monthYear.split('-').map(Number);
        const d = new Date(y, m - 1 + offset, 1);
        setMonthYear(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const currentMonthLabel = useMemo(() => {
        const [y, m] = monthYear.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    }, [monthYear]);

    return (
        <div className="min-h-screen bg-[#020617] text-slate-100 p-4 md:p-8 space-y-8">
            <Helmet><title>Dashboard Planes de Trabajo | Cervezas Finas</title></Helmet>

            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
                        <div className="p-3 bg-cyan-600 rounded-2xl shadow-lg shadow-cyan-900/40">
                            <TrendingUp size={32} />
                        </div>
                        Monitoreo de Supervisores
                    </h1>
                    <p className="text-slate-400 text-sm font-medium ml-1">Seguimiento mensual de planes de trabajo y ejecución.</p>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center bg-slate-900/80 rounded-2xl border border-white/5 p-1 backdrop-blur-xl shadow-xl">
                        <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} className="hover:bg-white/5 rounded-xl text-slate-400">
                            <ChevronLeft size={20} />
                        </Button>
                        <div className="px-6 text-xs font-black uppercase tracking-[0.2em] text-white min-w-[180px] text-center">
                            {currentMonthLabel}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} className="hover:bg-white/5 rounded-xl text-slate-400">
                            <ChevronRight size={20} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl overflow-hidden group">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Supervisores Totales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-black text-white">{stats.total}</span>
                            <Users size={20} className="text-cyan-500" />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase">Personal en campo activo</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl overflow-hidden group">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Planes Entregados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-black text-white">{stats.withPlan}</span>
                            <span className="text-xl font-bold text-slate-500">/ {stats.total}</span>
                        </div>
                        <Progress value={(stats.withPlan / stats.total) * 100} className="h-1.5 mt-3 bg-slate-800" indicatorClassName="bg-emerald-500" />
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl overflow-hidden group">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Promedio de Avance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-black text-white">{Math.round(stats.avgProgress)}%</span>
                            <div className="p-1 bg-cyan-500/10 rounded-lg">
                                <TrendingUp size={20} className="text-cyan-400" />
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase">Ejecución global mensual</p>
                    </CardContent>
                </Card>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/60 p-4 rounded-2xl border border-white/5 backdrop-blur-xl">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <Input 
                        placeholder="Buscar supervisor..." 
                        className="pl-10 bg-slate-950/50 border-white/5 text-white h-11 rounded-xl focus:ring-cyan-500/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" className="text-xs font-bold uppercase tracking-widest text-slate-400 gap-2 hover:bg-white/5">
                        <Filter size={14} /> Filtros
                    </Button>
                    <Button variant="ghost" className="text-xs font-bold uppercase tracking-widest text-slate-400 gap-2 hover:bg-white/5">
                        <Download size={14} /> Exportar
                    </Button>
                </div>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-48 rounded-3xl bg-slate-900/50 border border-white/5 animate-pulse" />
                    ))
                ) : filteredSupervisors.length === 0 ? (
                    <div className="col-span-full py-20 text-center space-y-4">
                        <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto text-slate-700">
                            <Search size={40} />
                        </div>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No se encontraron supervisores</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {filteredSupervisors.map((s, idx) => (
                            <motion.div
                                key={s.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                            >
                                <Card className="bg-slate-900/40 border-white/5 hover:border-cyan-500/30 transition-all group relative overflow-hidden h-full flex flex-col">
                                    <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-opacity">
                                        <Users size={80} className="text-white" />
                                    </div>
                                    
                                    <CardHeader className="relative z-10 pb-2">
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1">
                                                <Badge className="bg-slate-800 text-[10px] text-slate-400 border-none font-bold uppercase tracking-tighter">
                                                    {s.role || 'SUPERVISOR'}
                                                </Badge>
                                                <h3 className="text-xl font-black text-white truncate">{s.full_name || s.name || 'Sin Nombre'}</h3>
                                                <p className="text-xs text-slate-500 font-medium truncate">{s.email}</p>
                                            </div>
                                            <div className="flex items-center gap-1 bg-slate-950/50 p-1.5 rounded-xl border border-white/5">
                                                <div className={cn("w-2 h-2 rounded-full", s.plan ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                                                <span className="text-[10px] font-black uppercase text-slate-400">{s.plan ? 'ACTIVO' : 'SIN PLAN'}</span>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="relative z-10 flex-1 flex flex-col justify-end space-y-6 pt-4">
                                        {s.plan ? (
                                            <div className="space-y-4">
                                                <div className="flex items-end justify-between">
                                                    <div>
                                                        <div className="text-2xl font-black text-white">{Math.round(s.plan.progress)}%</div>
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avance de Ejecución</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs font-bold text-slate-300">{(s.plan.status || 'DRAFT').toUpperCase()}</div>
                                                        <div className="text-[10px] text-slate-500 uppercase">Estado</div>
                                                    </div>
                                                </div>
                                                <Progress value={s.plan.progress} className="h-1 bg-slate-800" indicatorClassName="bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)]" />
                                                
                                                <Button 
                                                    onClick={() => handleViewDetail(s.plan, s)}
                                                    className="w-full bg-slate-800/80 hover:bg-cyan-600 text-white rounded-xl h-11 font-bold shadow-xl border border-white/5 gap-2 group/btn"
                                                >
                                                    <Eye size={16} /> 
                                                    Ver Detalle del Plan
                                                    <ArrowUpRight size={14} className="opacity-0 group-hover/btn:opacity-100 group-hover/btn:translate-x-1 transition-all" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6 text-center space-y-3">
                                                <Clock className="mx-auto text-red-400" size={24} />
                                                <p className="text-xs font-bold text-red-200/70 uppercase leading-relaxed">No ha registrado plan para {currentMonthLabel}</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Detail Dialog */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-7xl max-h-[95vh] bg-[#0f172a] border-white/10 text-white overflow-hidden flex flex-col p-4 md:p-6">
                    <DialogHeader className="shrink-0 flex flex-row items-center justify-between">
                        <div>
                            <DialogTitle className="text-2xl font-black flex items-center gap-3">
                                <span>Plan de {selectedPlan?.supervisor?.name || 'Supervisor'}</span>
                                <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-[10px] uppercase">{currentMonthLabel}</Badge>
                            </DialogTitle>
                            <p className="text-sm text-slate-400 mt-1">Vista de solo lectura del plan de trabajo mensual.</p>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto custom-scrollbar mt-6">
                        {loadingDetail ? (
                            <div className="h-96 flex flex-col items-center justify-center gap-4">
                                <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cargando actividades...</p>
                            </div>
                        ) : selectedPlan ? (
                            <WorkPlanGrid 
                                monthYear={monthYear}
                                activities={selectedPlan.activities || []}
                                readOnly={true}
                            />
                        ) : (
                            <div className="text-center py-20 bg-slate-900/40 rounded-3xl border border-white/5">
                                <p className="text-slate-500 font-bold uppercase text-xs">Sin información disponible</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const cn = (...classes) => classes.filter(Boolean).join(' ');

export default HRWorkPlansDashboard;
