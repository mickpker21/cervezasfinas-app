import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PredictiveSalesWidget({ currentVolume, meta, daysElapsed, totalDays }) {
    // Simple Linear Projection: (Current / Elapsed) * Total
    // This assumes linear sales distribution, which is a good baseline approximation.
    const dailyRunRate = daysElapsed > 0 ? currentVolume / daysElapsed : 0;
    const projectedVolume = dailyRunRate * totalDays;
    const progress = meta > 0 ? (currentVolume / meta) * 100 : 0;
    const projectedProgress = meta > 0 ? (projectedVolume / meta) * 100 : 0;

    const isAtRisk = projectedProgress < 95; // Risk threshold < 95% of goal
    const isOnTrack = projectedProgress >= 100;

    return (
        <Card className="heineken-card h-full relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950 pointer-events-none" />
            <CardHeader className="pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center justify-between">
                    <span>Proyección de Cierre</span>
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
                <div className="flex items-baseline gap-2 mb-1">
                    <span className={`text-2xl font-bold ${isOnTrack ? 'text-emerald-400' : isAtRisk ? 'text-red-400' : 'text-yellow-400'}`}>
                        {projectedVolume.toFixed(1)} HL
                    </span>
                    <span className="text-xs text-white/50">Estimado</span>
                </div>

                <div className="space-y-2 mt-3">
                    {/* Progress Bar with Marker */}
                    <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        {/* Actual Progress */}
                        <div className="absolute top-0 left-0 h-full bg-white/30" style={{ width: `${Math.min(100, progress)}%` }} />
                        {/* Projected Progress - Dashed or different color if projection > current */}
                        {projectedProgress > progress && (
                            <div className="absolute top-0 left-0 h-full bg-emerald-500/30 border-r-2 border-emerald-500/50" style={{ width: `${Math.min(100, projectedProgress)}%`, left: 0 }} />
                        )}
                    </div>

                    <div className="flex justify-between text-[10px] text-white/40 uppercase font-bold tracking-wider">
                        <span>Hoy: {currentVolume.toFixed(1)}</span>
                        <span className={isOnTrack ? "text-emerald-500" : isAtRisk ? "text-red-500" : "text-yellow-500"}>
                            {projectedProgress.toFixed(0)}% Meta
                        </span>
                    </div>
                </div>

                {/* Insight / Alert */}
                <div className={`mt-4 p-2 rounded border text-xs flex items-center gap-2 ${isOnTrack
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : isAtRisk
                            ? 'bg-red-500/10 border-red-500/20 text-red-300'
                            : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                    }`}>
                    {isOnTrack ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span>
                        {isOnTrack
                            ? "¡Excelente ritmo! Superarás la meta."
                            : isAtRisk
                                ? `Riesgo: Faltan ${(meta - projectedVolume).toFixed(1)} HL para cumplir.`
                                : "Ritmo aceptable, pero no te confíes."}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}
