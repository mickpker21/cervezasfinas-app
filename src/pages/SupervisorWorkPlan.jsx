import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { 
    Calendar, 
    Plus, 
    Save, 
    ChevronLeft, 
    ChevronRight, 
    Target, 
    TrendingUp,
    CheckCircle,
    Clock,
    User,
    Briefcase
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { 
    getWorkPlan,
    saveWorkPlan, 
    saveActivity, 
    saveRecord,
    getSupervisors,
    getAllWorkPlans,
    getProfileById
} from '@/repositories/workPlanRepository';
import WorkPlanGrid from '@/components/WorkPlanGrid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SupervisorWorkPlan = () => {
    const { user, supabase } = useSupabaseAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [plan, setPlan] = useState(null);
    const [profile, setProfile] = useState(() => user?.profile || null);
    const [monthYear, setMonthYear] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newActivity, setNewActivity] = useState({
        type: 'RUTA',
        target: '',
        startTime: '06:30',
        endTime: '18:00',
        notes: ''
    });

    const [selectedSupervisorId, setSelectedSupervisorId] = useState(() => user?.id || null);
    const [supervisors, setSupervisors] = useState([]);
    const [viewMode, setViewMode] = useState('overview'); // 'overview' or 'detail'
    const [allPlans, setAllPlans] = useState([]);

    const userRole = useMemo(() => {
        const rawType = profile?.role
            || user?.profile?.role
            || user?.user_metadata?.type
            || user?.user_metadata?.role
            || (user?.app_metadata?.roles && user.app_metadata.roles[0])
            || user?.raw_app_meta_data?.role
            || user?.raw_user_meta_data?.type
            || user?.role
            || '';
        return rawType.toString().toLowerCase();
    }, [user, profile]);

    const isAdminOrHR = useMemo(() => {
        return Boolean(userRole.match(/(admin|administrador|rh|recursos humanos|gerente|coordinador|coorcon|coortrade|analista)/));
    }, [userRole]);

    const displayedProfile = useMemo(() => {
        if (!isAdminOrHR || !selectedSupervisorId || selectedSupervisorId === user?.id) {
            return profile || user?.profile || null;
        }
        return supervisors.find(s => s.id === selectedSupervisorId) || null;
    }, [isAdminOrHR, selectedSupervisorId, supervisors, profile, user]);

    // Safety timeout to prevent infinite loading spinner
    useEffect(() => {
        const timer = setTimeout(() => {
            setLoading(false);
        }, 5000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (user) {
            if (user.profile && !profile) {
                setProfile(user.profile);
            }
            if (!selectedSupervisorId) {
                setSelectedSupervisorId(user.id);
            }
            loadProfile();
        } else {
            const timer = setTimeout(() => setLoading(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [user]);

    const loadProfile = async () => {
        try {
            const data = await getProfileById(user.id);
            if (data) {
                setProfile(data);
            } else if (user?.profile) {
                setProfile(user.profile);
            }
        } catch (e) {
            if (user?.profile) setProfile(user.profile);
        }
    };

    const loadSupervisors = async () => {
        setLoading(true);
        try {
            const [sups, plans] = await Promise.all([
                getSupervisors(),
                getAllWorkPlans(monthYear)
            ]);
            
            setSupervisors(sups || []);
            setAllPlans(plans || []);
        } catch (error) {
            console.error('[WorkPlan] Error loading supervisors overview:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPlan = async (supId) => {
        const targetId = supId || selectedSupervisorId || user?.id;
        if (!targetId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await getWorkPlan(targetId, monthYear);
            if (data) {
                setPlan(data);
            } else {
                setPlan({
                    id: crypto.randomUUID(),
                    supervisor_id: targetId,
                    month_year: monthYear,
                    status: 'DRAFT',
                    progress: 0,
                    activities: []
                });
            }
        } catch (error) {
            console.error('[WorkPlan] Error loading plan:', error);
            toast({
                title: "Error",
                description: "No se pudo cargar el plan de trabajo.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;

        if (!isAdminOrHR) {
            if (viewMode !== 'detail') setViewMode('detail');
            if (selectedSupervisorId !== user.id) setSelectedSupervisorId(user.id);
            loadPlan(user.id);
        } else {
            if (viewMode === 'detail') {
                loadPlan(selectedSupervisorId || user.id);
            } else {
                loadSupervisors();
            }
        }
    }, [user?.id, isAdminOrHR, monthYear, viewMode, selectedSupervisorId]);

    const handleRecordClick = async (activity, date, currentStatus) => {
        if (!plan) return;

        // Cycle through: null -> X -> A -> N -> D -> null
        const cycles = {
            [null]: 'X',
            'X': 'A',
            'A': 'N',
            'N': 'D',
            'D': null,
            // Legacy mapping
            'P': 'A',
            'E': 'N'
        };
        const nextStatus = cycles[currentStatus];
        const dateStr = date.toISOString().split('T')[0];

        const updatedRecord = {
            id: activity.records?.find(r => r.day_date === dateStr)?.id || crypto.randomUUID(),
            activity_id: activity.id,
            day_date: dateStr,
            status: nextStatus,
            updated_at: new Date().toISOString()
        };

        // Update UI optimistically
        const updatedActivities = plan.activities.map(act => {
            if (act.id === activity.id) {
                const existingRecords = act.records || [];
                const idx = existingRecords.findIndex(r => r.day_date === dateStr);
                let newRecords = [...existingRecords];
                if (nextStatus === null) {
                    newRecords = newRecords.filter(r => r.day_date !== dateStr);
                } else if (idx !== -1) {
                    newRecords[idx] = updatedRecord;
                } else {
                    newRecords.push(updatedRecord);
                }
                return { ...act, records: newRecords };
            }
            return act;
        });

        // Recalculate progress
        let totalP = 0;
        let totalE = 0;
        updatedActivities.forEach(act => {
            (act.records || []).forEach(r => {
                if (['X', 'A', 'N', 'P', 'E'].includes(r.status)) totalP++;
                if (['A', 'E'].includes(r.status)) totalE++;
            });
        });
        const nextProgress = totalP > 0 ? (totalE / totalP) * 100 : 0;

        setPlan({ ...plan, activities: updatedActivities, progress: nextProgress });

        // Persist
        try {
            await saveWorkPlan({ ...plan, progress: nextProgress });
            if (nextStatus) {
                await saveRecord(updatedRecord);
            } else {
                // Technically we should delete, but repository handles null/missing
            }
        } catch (error) {
            console.error('[WorkPlan] Error saving record:', error);
        }
    };

    const handleAddActivity = async () => {
        if (!newActivity.target && newActivity.type === 'RUTA') {
            toast({ title: "Campo requerido", description: "Por favor indica la ruta.", variant: "destructive" });
            return;
        }

        const activity = {
            id: crypto.randomUUID(),
            plan_id: plan.id,
            ...newActivity,
            duration: `${newActivity.startTime} A ${newActivity.endTime}`,
            created_at: new Date().toISOString(),
            records: []
        };

        setPlan(prev => ({
            ...prev,
            activities: [...prev.activities, activity]
        }));

        setIsAddDialogOpen(false);
        setNewActivity({ type: 'RUTA', target: '', startTime: '06:30', endTime: '18:00', notes: '' });

        try {
            await saveWorkPlan(plan);
            await saveActivity(activity);
        } catch (error) {
            console.error('[WorkPlan] Error saving activity:', error);
        }
    };

    const handleDeleteActivity = async (activity) => {
        if (!window.confirm('¿Estás seguro de eliminar esta actividad?')) return;

        setPlan(prev => ({
            ...prev,
            activities: prev.activities.filter(act => act.id !== activity.id)
        }));

        try {
            // Intentar eliminar en Supabase (si hay conexión)
            const { error } = await supabase
                .from('supervisor_work_plan_activities')
                .delete()
                .eq('id', activity.id);

            if (error) throw error;
            
            toast({
                title: "Actividad eliminada",
                description: "La actividad ha sido removida del plan."
            });
        } catch (error) {
            // Si falla (offline), igual se eliminó del estado local optimistamente
            // La próxima sincronización la eliminará en servidor
            console.warn('[WorkPlan] No se pudo eliminar en servidor (offline?):', error);
            toast({
                title: "Eliminado localmente",
                description: "Se sincronizará con el servidor cuando haya conexión."
            });
        }
    };

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
        <div className="min-h-screen bg-[#0f172a] text-slate-100 p-4 md:p-8 space-y-6">
            <Helmet><title>Calendario de Actividades | Cervezas Finas</title></Helmet>

            {/* Excel-style Header Table */}
            <div className="bg-slate-900/80 rounded-2xl border border-white/10 overflow-hidden shadow-2xl backdrop-blur-xl">
                <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="p-6 border-b md:border-b-0 md:border-r border-white/10 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                                <User size={24} />
                            </div>
                            <div>
                                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/70">Supervisor</h2>
                                {isAdminOrHR ? (
                                    <div className="mt-1 min-w-[200px]">
                                        <Select value={selectedSupervisorId || ''} onValueChange={setSelectedSupervisorId}>
                                            <SelectTrigger className="bg-slate-800 border-white/5 h-9 text-sm font-bold">
                                                <SelectValue placeholder="Seleccionar Supervisor" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                                {supervisors.map(sup => (
                                                    <SelectItem key={sup.id} value={sup.id} className="focus:bg-cyan-500/20">
                                                        {sup.full_name || sup.email}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : (
                                    <p className="text-xl font-black text-white">{displayedProfile?.full_name || displayedProfile?.email || 'Cargando...'}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                                <Briefcase size={22} />
                            </div>
                            <div>
                                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400/70">Puesto</h2>
                                <p className="text-sm font-bold text-slate-300">{displayedProfile?.role || 'SUPERVISOR DE VENTAS'}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6 flex flex-col justify-between gap-4 bg-slate-950/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/70">Período de Actividades</h2>
                                <div className="flex items-center gap-4 mt-2">
                                    <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} className="h-8 w-8 hover:bg-white/5">
                                        <ChevronLeft size={16} />
                                    </Button>
                                    <span className="text-sm font-black uppercase tracking-widest text-white min-w-[140px] text-center">
                                        {currentMonthLabel}
                                    </span>
                                    <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} className="h-8 w-8 hover:bg-white/5">
                                        <ChevronRight size={16} />
                                    </Button>
                                </div>
                            </div>
                            <div className="text-right">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/70">Cumplimiento</h2>
                                <p className="text-3xl font-black text-emerald-400">{Math.round(plan?.progress || 0)}%</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                                <span className="text-slate-500">Progreso Mensual</span>
                                <span className="text-cyan-400">{Math.round(plan?.progress || 0)}%</span>
                            </div>
                            <Progress value={plan?.progress || 0} className="h-1.5 bg-slate-800" indicatorClassName="bg-cyan-500" />
                        </div>
                    </div>
                </div>
            </div>

            {/* View Selector for Admin/HR */}
            {isAdminOrHR && (
                <div className="flex justify-end gap-2">
                    <Button 
                        variant={viewMode === 'overview' ? 'default' : 'outline'}
                        onClick={() => setViewMode('overview')}
                        className={cn(
                            "h-9 px-4 text-xs font-bold uppercase tracking-widest transition-all",
                            viewMode === 'overview' ? "bg-cyan-600 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"
                        )}
                    >
                        Vista General
                    </Button>
                    <Button 
                        variant={viewMode === 'detail' ? 'default' : 'outline'}
                        onClick={() => setViewMode('detail')}
                        disabled={!selectedSupervisorId}
                        className={cn(
                            "h-9 px-4 text-xs font-bold uppercase tracking-widest transition-all",
                            viewMode === 'detail' ? "bg-cyan-600 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"
                        )}
                    >
                        Detalle Individual
                    </Button>
                </div>
            )}

            {viewMode === 'overview' && isAdminOrHR ? (
                /* Overview Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {supervisors.map(sup => {
                        const supPlan = allPlans.find(p => p.supervisor_id === sup.id);
                        const progress = supPlan?.progress || 0;
                        
                        return (
                            <Card key={sup.id} className="bg-slate-900/50 border-white/5 hover:border-cyan-500/30 transition-all group overflow-hidden shadow-xl">
                                <CardContent className="p-6 space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/10 transition-colors">
                                            {sup.avatar_url ? (
                                                <img src={sup.avatar_url} alt="" className="w-full h-full rounded-2xl object-cover" />
                                            ) : (
                                                <User size={24} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-white truncate">{sup.full_name || sup.email}</h3>
                                            <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider truncate">{sup.role || 'SUPERVISOR'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-1.5 pt-2">
                                        <div className="flex justify-between text-[10px] font-black uppercase">
                                            <span className="text-slate-500">Cumplimiento</span>
                                            <span className={cn(progress >= 80 ? "text-emerald-400" : "text-cyan-400")}>
                                                {Math.round(progress)}%
                                            </span>
                                        </div>
                                        <Progress value={progress} className="h-1.5 bg-slate-800" indicatorClassName={cn(progress >= 80 ? "bg-emerald-500" : "bg-cyan-500")} />
                                    </div>

                                    <Button 
                                        className="w-full bg-slate-800 hover:bg-cyan-600 text-white text-[10px] font-black uppercase tracking-[0.2em] h-10 rounded-xl transition-all"
                                        onClick={() => {
                                            setSelectedSupervisorId(sup.id);
                                            setViewMode('detail');
                                        }}
                                    >
                                        Ver Plan de Trabajo
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                /* Individual Grid Section */
                <div className="w-full bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                    <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {loading ? (
                            <div className="h-96 flex flex-col items-center justify-center gap-4">
                                <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Sincronizando Plan...</span>
                            </div>
                        ) : (
                            <WorkPlanGrid 
                                monthYear={monthYear}
                                activities={plan?.activities || []}
                                onRecordClick={handleRecordClick}
                                onAddActivity={() => setIsAddDialogOpen(true)}
                                onDeleteActivity={handleDeleteActivity}
                                isAdminOrHR={isAdminOrHR}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Add Activity Dialog */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Nueva Actividad / Ruta</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Tipo de Actividad</Label>
                            <Input 
                                placeholder="Ej: RUTA, CAPACITACION, ABORDAJE..." 
                                className="bg-slate-800 border-white/5 h-11"
                                value={newActivity.type}
                                onChange={(e) => setNewActivity({...newActivity, type: e.target.value.toUpperCase()})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Objetivo / Ruta</Label>
                            <Input 
                                placeholder="Ej: Ruta 30 o Almacén Central" 
                                className="bg-slate-800 border-white/5 h-11"
                                value={newActivity.target}
                                onChange={(e) => setNewActivity({...newActivity, target: e.target.value.toUpperCase()})}
                            />
                        </div>
                        <div className="space-y-4 pt-2 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Horario de Actividad</Label>
                                <div className="flex gap-1.5">
                                    {[
                                        { label: 'Matutino', start: '06:30', end: '14:30' },
                                        { label: 'Vespertino', start: '14:30', end: '22:30' },
                                        { label: 'Completo', start: '06:30', end: '18:00' }
                                    ].map((shift) => (
                                        <button 
                                            key={shift.label}
                                            onClick={() => setNewActivity({...newActivity, startTime: shift.start, endTime: shift.end})}
                                            className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-400 transition-all border border-white/5"
                                        >
                                            {shift.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {/* START TIME WHEEL */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inicio: <span className="text-emerald-400">{newActivity.startTime}</span></span>
                                    </div>
                                    <div className="bg-slate-950/40 rounded-xl p-3 border border-white/5 shadow-inner">
                                        <div className="flex gap-3">
                                            {/* Hours */}
                                            <div className="flex-1 h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                                                {Array.from({length: 17}, (_, i) => String(i + 6).padStart(2, '0')).map(h => (
                                                    <button 
                                                        key={h}
                                                        onClick={() => setNewActivity({...newActivity, startTime: `${h}:${newActivity.startTime.split(':')[1]}`})}
                                                        className={cn(
                                                            "h-10 min-h-[40px] rounded-lg text-sm font-black transition-all",
                                                            newActivity.startTime.startsWith(h) ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20" : "text-slate-500 hover:bg-white/5"
                                                        )}
                                                    >
                                                        {h} <span className="text-[8px] opacity-60">HRS</span>
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Minutes */}
                                            <div className="w-12 h-32 flex flex-col gap-1">
                                                {['00', '15', '30', '45'].map(m => (
                                                    <button 
                                                        key={m}
                                                        onClick={() => setNewActivity({...newActivity, startTime: `${newActivity.startTime.split(':')[0]}:${m}`})}
                                                        className={cn(
                                                            "flex-1 rounded-lg text-[10px] font-black transition-all",
                                                            newActivity.startTime.endsWith(m) ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:bg-white/5"
                                                        )}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* END TIME WHEEL */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1 text-right justify-end">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fin: <span className="text-red-400">{newActivity.endTime}</span></span>
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                    </div>
                                    <div className="bg-slate-950/40 rounded-xl p-3 border border-white/5 shadow-inner">
                                        <div className="flex gap-3">
                                            {/* Hours */}
                                            <div className="flex-1 h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                                                {Array.from({length: 17}, (_, i) => String(i + 6).padStart(2, '0')).map(h => (
                                                    <button 
                                                        key={h}
                                                        onClick={() => setNewActivity({...newActivity, endTime: `${h}:${newActivity.endTime.split(':')[1]}`})}
                                                        className={cn(
                                                            "h-10 min-h-[40px] rounded-lg text-sm font-black transition-all",
                                                            newActivity.endTime.startsWith(h) ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20" : "text-slate-500 hover:bg-white/5"
                                                        )}
                                                    >
                                                        {h} <span className="text-[8px] opacity-60">HRS</span>
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Minutes */}
                                            <div className="w-12 h-32 flex flex-col gap-1">
                                                {['00', '15', '30', '45'].map(m => (
                                                    <button 
                                                        key={m}
                                                        onClick={() => setNewActivity({...newActivity, endTime: `${newActivity.endTime.split(':')[0]}:${m}`})}
                                                        className={cn(
                                                            "flex-1 rounded-lg text-[10px] font-black transition-all",
                                                            newActivity.endTime.endsWith(m) ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "text-slate-500 hover:bg-white/5"
                                                        )}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)} className="text-slate-400">Cancelar</Button>
                        <Button onClick={handleAddActivity} className="bg-cyan-600 hover:bg-cyan-500 text-white px-8">
                            Agregar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default SupervisorWorkPlan;
