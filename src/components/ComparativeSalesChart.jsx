import React from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#2a2f47]/95 backdrop-blur-md border border-white/10 p-4 rounded-lg shadow-xl text-white">
                <p className="text-sm font-bold mb-2 text-white/70">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-sm font-medium">
                            {entry.name}: <span className="font-bold text-white">{Number(entry.value).toLocaleString('es-MX')} HL</span>
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export default function ComparativeSalesChart({ data, currentYear, prevYear, xAxisKey = "month" }) {
    // Los datos ya vienen acumulados día a día
    // Buscar el último punto donde el año ACTUAL (current) tenga datos
    let lastIndexWithData = -1;
    for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].current > 0) {  // Solo buscar en el año actual
            lastIndexWithData = i;
            break;
        }
    }

    // El último punto del año actual ya contiene el acumulado YTD
    // Comparar con el mismo punto del año anterior
    const totalCurrent = lastIndexWithData >= 0 ? (data[lastIndexWithData].current || 0) : 0;
    const totalPrev = lastIndexWithData >= 0 ? (data[lastIndexWithData].previous || 0) : 0;

    // Crecimiento YTD
    const growth = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0;
    const isPositive = growth >= 0;

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 shrink-0">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-emerald-500" />
                        Comparativo
                    </h3>
                    <p className="text-sm text-white/60">
                        {prevYear} vs {currentYear} (Hectolitros)
                    </p>
                </div>

                <div className="flex items-center gap-4 bg-black/30 rounded-lg p-2 px-4 border border-white/10">
                    <div className="text-right">
                        <p className="text-xs text-white/50 uppercase tracking-wider font-semibold">Crecimiento YTD</p>
                        <div className={`text-lg font-bold flex items-center justify-end gap-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            {Math.abs(growth).toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorPrev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                        <XAxis
                            dataKey={xAxisKey}
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value) => `${value} HL`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />

                        <Area
                            type="monotone"
                            dataKey="previous"
                            name={`Año ${prevYear}`}
                            stroke="#94a3b8"
                            fillOpacity={1}
                            fill="url(#colorPrev)"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                        />
                        <Area
                            type="monotone"
                            dataKey="current"
                            name={`Año ${currentYear}`}
                            stroke="#fbbf24"
                            fillOpacity={1}
                            fill="url(#colorCurrent)"
                            strokeWidth={3}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
