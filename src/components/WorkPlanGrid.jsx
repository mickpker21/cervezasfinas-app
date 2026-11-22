import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
    Plus, 
    MoreHorizontal,
    MapPin,
    Users,
    BookOpen,
    Target,
    ChevronLeft,
    ChevronRight,
    Calendar,
    Clock,
    Activity,
    CheckCircle2,
    XCircle,
    MinusCircle,
    PauseCircle,
    Trash2,
    Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
    'X': { color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Programado' },
    'A': { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Asistencia/Ejecutado' },
    'N': { color: 'text-red-400', bg: 'bg-red-400/10', label: 'No Realizado' },
    'D': { color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Descanso' },
    // Legacy support
    'P': { color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Programado' },
    'E': { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Ejecutado' },
};

const getIconForType = (type) => {
    const t = (type || '').toUpperCase();
    if (t.includes('RUTA')) return MapPin;
    if (t.includes('BORDAJE')) return Users;
    if (t.includes('CAPA')) return BookOpen;
    if (t.includes('COACH')) return Target;
    return MoreHorizontal;
};

const WorkPlanGrid = ({ 
    monthYear, 
    activities, 
    onRecordClick, 
    onAddActivity,
    onDeleteActivity,
    readOnly = false,
    isAdminOrHR = false
}) => {
    // Current date for locking logic
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);
    // Generate days of the month grouped by weeks
    const weeks = useMemo(() => {
        if (!monthYear) return [];
        const [year, month] = monthYear.split('-').map(Number);
        const dayOne = new Date(year, month - 1, 1);
        
        // Find if the first day is Monday or not to align weeks
        // getDay() returns 0 for Sunday, 1 for Monday, etc.
        // We want 1-indexed Monday = 1, Sunday = 7
        const firstDayIdx = dayOne.getDay() === 0 ? 7 : dayOne.getDay();
        
        const result = [];
        let currentWeek = { label: 'SEMANA 1', days: [] };
        
        const date = new Date(dayOne);
        let weekCounter = 1;
        
        while (date.getMonth() === month - 1) {
            currentWeek.days.push(new Date(date));
            
            // If it's Sunday or end of month, close the week
            if (date.getDay() === 0 || new Date(date.getTime() + 86400000).getMonth() !== month - 1) {
                // Format range: (DD/MM - DD/MM)
                const start = currentWeek.days[0];
                const end = currentWeek.days[currentWeek.days.length - 1];
                const startStr = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
                const endStr = `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`;
                
                currentWeek.label = `SEMANA ${weekCounter}`;
                currentWeek.range = `${startStr} - ${endStr}`;
                
                result.push(currentWeek);
                if (date.getMonth() === month - 1 && new Date(date.getTime() + 86400000).getMonth() === month - 1) {
                    weekCounter++;
                    currentWeek = { label: `SEMANA ${weekCounter}`, days: [] };
                }
            }
            date.setDate(date.getDate() + 1);
        }
        
        return result;
    }, [monthYear]);

    const getStatusForDay = (activity, date) => {
        const dateStr = date.toISOString().split('T')[0];
        const record = activity.records?.find(r => r.day_date === dateStr);
        return record?.status || null;
    };

    const isWeekend = (date) => {
        const day = date.getDay();
        return day === 0 || day === 6;
    };

    const isCellLocked = (date) => {
        if (isAdminOrHR) return false;
        if (readOnly) return true;
        const cellDate = new Date(date);
        cellDate.setHours(0, 0, 0, 0);
        return cellDate < today;
    };

    const canDeleteActivity = (activity) => {
        if (isAdminOrHR) return true;
        // Cannot delete if it has records in past days
        return !(activity.records || []).some(r => {
            const recDate = new Date(r.day_date + 'T00:00:00');
            return recDate < today && ['X', 'A', 'N', 'P', 'E'].includes(r.status);
        });
    };

    return (
        <div className="w-full h-full">
            <div className="w-full custom-scrollbar">
                <table className="min-w-full border-collapse border-spacing-0">
                    <thead>
                        {/* Top Header: Weeks */}
                        <tr className="border-b border-white/10 bg-slate-950/20">
                            <th className="sticky left-0 z-30 bg-slate-900/95 p-2 text-center min-w-[120px] border-r border-white/10" rowSpan={2}>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actividad</span>
                            </th>
                            {weeks.map((week, idx) => (
                                <th 
                                    key={idx} 
                                    colSpan={week.days.length}
                                    className="p-2 text-center border-r border-white/10 bg-slate-800/40"
                                >
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] font-black text-white tracking-[0.2em] uppercase">{week.label}</span>
                                        <span className="text-[8px] font-bold text-cyan-400/60 tracking-wider mt-0.5">{week.range}</span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                        {/* Subheader: Days (L M M J V S D) */}
                        <tr className="border-b border-white/10 bg-slate-950/40">
                            {weeks.map((week) => (
                                week.days.map((date, i) => {
                                    const locked = isCellLocked(date);
                                    return (
                                        <th 
                                            key={`${date.toISOString()}`} 
                                            className={cn(
                                                "p-1 text-center min-w-[28px] border-r border-white/5 transition-colors",
                                                isWeekend(date) ? "bg-amber-500/5" : "",
                                                locked ? "opacity-40" : "bg-cyan-500/5"
                                            )}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span className={cn(
                                                    "text-[9px] uppercase font-black",
                                                    locked ? "text-slate-500" : "text-cyan-400"
                                                )}>
                                                    {date.toLocaleDateString('es-ES', { weekday: 'narrow' })}
                                                </span>
                                                <span className={cn(
                                                    "text-sm font-black tracking-tighter",
                                                    locked ? "text-slate-600" : "text-white"
                                                )}>
                                                    {date.getDate()}
                                                </span>
                                                {locked && <Lock size={8} className="text-slate-700 mt-0.5" />}
                                            </div>
                                        </th>
                                    );
                                })
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {activities.map((activity) => {
                            const Icon = getIconForType(activity.type);
                            return (
                                <tr key={activity.id} className="group hover:bg-white/[0.02] transition-colors border-b border-white/5">
                                    {/* Activity Info + Duration */}
                                    <td className="sticky left-0 z-20 bg-slate-900/95 backdrop-blur-md p-2 border-r border-white/10 shadow-[4px_0_10px_rgba(0,0,0,0.3)]">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 transition-colors flex-shrink-0">
                                                        <Icon size={10} />
                                                    </div>
                                                    <span className="text-[10px] font-black text-white uppercase tracking-tight truncate">{activity.target || activity.type}</span>
                                                </div>
                                                {canDeleteActivity(activity) && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onDeleteActivity(activity); }}
                                                        className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-all flex-shrink-0"
                                                        title="Eliminar Actividad"
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="bg-slate-950/50 rounded px-1.5 py-0.5 border border-white/5 inline-block w-fit">
                                                <span className="text-[8px] font-mono text-cyan-400/80 uppercase">
                                                    {activity.duration || '06:30 A 18:00'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    {weeks.map((week) => (
                                        week.days.map((date) => {
                                            const status = getStatusForDay(activity, date);
                                            const normalizedStatus = status === 'P' ? 'X' : (status === 'E' ? 'A' : status);
                                            const Config = STATUS_CONFIG[normalizedStatus];
                                            const locked = isCellLocked(date);

                                            return (
                                                <td 
                                                    key={`${date.toISOString()}`} 
                                                    onClick={() => !locked && !readOnly && onRecordClick(activity, date, status)}
                                                    className={cn(
                                                        "p-0 text-center border-r border-white/5 relative h-10 transition-colors",
                                                        !locked && !readOnly ? "cursor-pointer hover:bg-white/[0.05]" : "cursor-default",
                                                        isWeekend(date) ? "bg-amber-500/[0.02]" : "",
                                                        locked && "bg-slate-950/20"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "w-full h-full flex items-center justify-center",
                                                        locked && "opacity-50 grayscale-[0.5]"
                                                    )}>
                                                        {Config ? (
                                                            <div className={cn(
                                                                "w-5 h-5 rounded flex items-center justify-center text-[10px] font-black",
                                                                Config.bg, Config.color
                                                            )}>
                                                                {normalizedStatus}
                                                            </div>
                                                        ) : (
                                                            <div className="w-5 h-5 flex items-center justify-center opacity-10">
                                                                <div className="w-0.5 h-0.5 rounded-full bg-slate-600" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })
                                    ))}
                                </tr>
                            );
                        })}
                        
                        {!readOnly && (
                            <tr>
                                    <td colSpan={100} className="p-0 border-none bg-slate-900/30">
                                        <button 
                                            onClick={onAddActivity}
                                            className="w-full p-2 flex items-center justify-center gap-2 text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/5 transition-all group border-t border-white/5"
                                        >
                                            <Plus size={12} className="group-hover:rotate-90 transition-transform" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Agregar Actividad</span>
                                        </button>
                                    </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div className="p-3 bg-slate-950/80 border-t border-white/10 flex flex-wrap items-center gap-6 justify-center">
                {['X', 'A', 'N', 'D'].map(key => {
                    const config = STATUS_CONFIG[key];
                    return (
                        <div key={key} className="flex items-center gap-2">
                            <div className={cn("w-5 h-5 rounded flex items-center justify-center text-[10px] font-black", config.bg, config.color)}>
                                {key}
                            </div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{config.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WorkPlanGrid;
