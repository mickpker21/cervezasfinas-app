import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { DollarSign, TrendingUp, AlertCircle, Target, CheckCircle2, XCircle, Clock, Download, ArrowLeft, Loader2 } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { calculateUserPayroll } from '@/repositories/hrPayrollService';

const fmt = (n) => n?.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }) ?? '$0.00';
const pct = (v, t) => t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0;

export default function CommissionsPage() {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (user?.id) loadPayroll();
  }, [user, selectedMonth]);

  const loadPayroll = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await calculateUserPayroll(user.id, selectedMonth);
      setPayroll(result);
    } catch (e) {
      console.error('CommissionsPage error:', e);
      setError('No se pudo calcular la nómina. Verifica que tengas configuración salarial asignada.');
    } finally {
      setLoading(false);
    }
  };

  const totalEstimated = payroll
    ? (payroll.base_salary || 0) + (payroll.kpis || []).reduce((acc, k) => acc + (k.achieved ? (k.bonus || 0) : 0), 0)
    : 0;

  const totalPossible = payroll
    ? (payroll.base_salary || 0) + (payroll.kpis || []).reduce((acc, k) => acc + (k.bonus || 0), 0)
    : 0;

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const progressPct = Math.round((dayOfMonth / daysInMonth) * 100);

  return (
    <div className="min-h-screen bg-[#1a1c2e] pb-20">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900/40 via-[#1a2744] to-[#1a1c2e] border-b border-white/10">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-emerald-400 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Regresar
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Mis Comisiones</h1>
              <p className="text-white/50 text-sm">Corte al día {dayOfMonth} de {daysInMonth} · Mes {selectedMonth}</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="month"
                value={selectedMonth}
                max={new Date().toISOString().slice(0, 7)}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-400"
              />
              <button className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-sm rounded-lg border border-white/15 transition">
                <Download className="w-4 h-4" /> Recibo
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-white/40">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Calculando nómina…</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-5 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-semibold text-sm mb-1">Error al cargar comisiones</p>
              <p className="text-red-300/70 text-sm">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && payroll && (
          <>
            {/* Resumen Principal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="sm:col-span-3 rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-700/20 border border-emerald-500/30 p-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div>
                    <p className="text-emerald-300/70 text-xs font-bold uppercase tracking-wider mb-1">Estimado del Mes</p>
                    <div className="text-4xl font-black text-white">{fmt(totalEstimated)}</div>
                    <p className="text-white/40 text-sm mt-1">Máximo posible: {fmt(totalPossible)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm text-white/50">Avance del mes</div>
                    <div className="w-40 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="text-xs text-white/40">Día {dayOfMonth} / {daysInMonth}</div>
                  </div>
                </div>
              </motion.div>

              {/* Salario Base */}
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="rounded-xl bg-[#2a2c44] border border-white/10 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-sky-400" />
                  <span className="text-white/60 text-xs font-bold uppercase tracking-wider">Salario Base</span>
                </div>
                <div className="text-2xl font-bold text-white">{fmt(payroll.base_salary)}</div>
                <div className="text-xs text-white/40 mt-1">Garantizado</div>
              </motion.div>

              {/* Bonos Ganados */}
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="rounded-xl bg-[#2a2c44] border border-white/10 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span className="text-white/60 text-xs font-bold uppercase tracking-wider">Bonos KPI</span>
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {fmt((payroll.kpis || []).reduce((acc, k) => acc + (k.achieved ? (k.bonus || 0) : 0), 0))}
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {(payroll.kpis || []).filter(k => k.achieved).length}/{(payroll.kpis || []).length} KPIs alcanzados
                </div>
              </motion.div>

              {/* Porcentaje del máximo */}
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="rounded-xl bg-[#2a2c44] border border-white/10 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                  <span className="text-white/60 text-xs font-bold uppercase tracking-wider">% Aprovechado</span>
                </div>
                <div className="text-2xl font-bold text-violet-400">
                  {pct(totalEstimated, totalPossible)}%
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-400 to-purple-500" style={{ width: `${pct(totalEstimated, totalPossible)}%` }} />
                </div>
              </motion.div>
            </div>

            {/* Desglose por KPI */}
            {(payroll.kpis || []).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="rounded-2xl bg-[#2a2c44] border border-white/10 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="text-white font-semibold text-sm">Desglose de KPIs</h2>
                </div>
                <div className="divide-y divide-white/5">
                  {payroll.kpis.map((kpi, i) => (
                    <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {kpi.achieved
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          : <XCircle className="w-4 h-4 text-red-400/70 shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {kpi.custom_name || kpi.type}
                          </div>
                          <div className="text-xs text-white/40">
                            Meta: {kpi.target} · Actual: {kpi.current ?? '—'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-bold ${kpi.achieved ? 'text-emerald-400' : 'text-white/30'}`}>
                          {kpi.achieved ? fmt(kpi.bonus) : fmt(0)}
                        </div>
                        {!kpi.achieved && (
                          <div className="text-xs text-white/20">Potencial: {fmt(kpi.bonus)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 bg-white/3 border-t border-white/10 flex justify-between items-center">
                  <span className="text-white/60 text-sm font-medium">Total del Periodo</span>
                  <span className="text-emerald-400 font-black text-lg">{fmt(totalEstimated)}</span>
                </div>
              </motion.div>
            )}

            {/* Aviso de corte */}
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 flex gap-3 items-start">
              <Clock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-blue-300/80 text-sm">
                El cálculo final se realizará el último día del mes. Los montos mostrados son estimaciones basadas en el corte al día {dayOfMonth}.
                Los KPIs manuales pueden ser ajustados por RRHH.
              </p>
            </div>
          </>
        )}

        {!loading && !error && !payroll && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-10 h-10 text-white/20 mb-3" />
            <p className="text-white/40 text-sm">No se encontró configuración salarial para tu perfil.</p>
            <p className="text-white/25 text-xs mt-1">Contacta a RRHH para que configuren tu esquema de comisiones.</p>
          </div>
        )}
      </div>
    </div>
  );
}
