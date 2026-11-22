import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  Users, Clock, FileText, BarChart3, Briefcase, Calendar,
  Target, Star, Heart, BookOpen, TrendingUp, Shield,
  Workflow, UserMinus, Brain, Gift, MessageSquare,
  MapPin, Trophy, ArrowUpRight, AlertCircle, CheckCircle2,
  Building2, Zap, ChevronRight, Layers, Bot
} from 'lucide-react';

// ── Módulos del HRIS ────────────────────────────────────────────────────────
const HR_MODULES = [
  {
    group: 'Gestión de Personal',
    icon: Users,
    color: 'from-emerald-500 to-teal-600',
    modules: [
      { label: 'Empleados', path: '/admin/hr/employees', icon: Users, desc: 'Directorio y expedientes', status: 'active' },
      { label: 'Onboarding', path: '/hr/onboarding', icon: Workflow, desc: 'Flujos de alta con tareas por área', status: 'active' },
      { label: 'Offboarding', path: '/hr/offboarding', icon: UserMinus, desc: 'Control de bajas y checklist', status: 'active' },
      { label: 'Service Center', path: '/hr/hrsd', icon: BookOpen, desc: 'Tickets y catálogo de servicios RH', status: 'new' },
    ]
  },
  {
    group: 'Desempeño y Talento',
    icon: Target,
    color: 'from-violet-500 to-purple-600',
    modules: [
      { label: 'Performance', path: '/hr/performance', icon: Target, desc: 'OKRs, Feedback y Check-ins', status: 'active' },
      { label: 'Skills', path: '/hr/skills', icon: Brain, desc: 'Inventario de habilidades', status: 'active' },
      { label: 'Sucesión', path: '/hr/succession', icon: Trophy, desc: '9-Box y posiciones críticas', status: 'active' },
      { label: 'Universidad (LMS)', path: '/hr/lms', icon: BookOpen, desc: 'Cursos y rutas de aprendizaje', status: 'new' },
    ]
  },
  {
    group: 'Compensaciones y Beneficios',
    icon: Gift,
    color: 'from-amber-500 to-orange-600',
    modules: [
      { label: 'Nómina', path: '/admin/hr-dashboard', icon: BarChart3, desc: 'Cálculo y configuración salarial', status: 'active' },
      { label: 'Comisiones', path: '/hr/commissions', icon: TrendingUp, desc: 'Consulta de comisiones', status: 'active' },
      { label: 'Beneficios', path: '/hr/benefits', icon: Gift, desc: 'Portal de solicitud de beneficios', status: 'active' },
      { label: 'Career Path', path: '/hr/careers', icon: TrendingUp, desc: 'Ruta de crecimiento salarial', status: 'active' },
    ]
  },
  {
    group: 'Asistencia y Tiempo',
    icon: Clock,
    color: 'from-sky-500 to-blue-600',
    modules: [
      { label: 'Kiosco Biométrico', path: '/kiosk', icon: Zap, desc: 'Registro facial de asistencia', status: 'active' },
      { label: 'Vacaciones', path: '/hr/my-time-off', icon: Calendar, desc: 'Solicitudes de tiempo libre', status: 'active' },
      { label: 'Planes de Trabajo', path: '/hr/work-plans', icon: Briefcase, desc: 'Monitoreo de supervisores', status: 'active' },
      { label: 'Calendario', path: '/hr/calendar', icon: Calendar, desc: 'Eventos corporativos y festivos', status: 'active' },
    ]
  },
  {
    group: 'Clima y Experiencia',
    icon: Heart,
    color: 'from-pink-500 to-rose-600',
    modules: [
      { label: 'Portal EXP', path: '/hr/exp', icon: Heart, desc: 'Feed corporativo y Wellbeing', status: 'new' },
      { label: 'Encuestas Pulse', path: '/hr/surveys', icon: MessageSquare, desc: 'eNPS y clima laboral', status: 'active' },
      { label: 'Reclutamiento', path: '/rrhh/recruitment', icon: Star, desc: 'Pipeline ATS de candidatos', status: 'active' },
      { label: 'Vacantes', path: '/rrhh/jobs', icon: Briefcase, desc: 'Gestión de vacantes internas', status: 'active' },
    ]
  },
  {
    group: 'Compliance y Auditoría',
    icon: Shield,
    color: 'from-slate-500 to-gray-700',
    modules: [
      { label: 'Compliance (EHS)', path: '/hr/compliance', icon: Shield, desc: 'Auditoría, Sindicato y NOM-035', status: 'new' },
      { label: 'Config Studio', path: '/hr/config', icon: Building2, desc: 'Workflow & Report Builder', status: 'new' },
      { label: 'Integraciones', path: '/hr/integrations', icon: Layers, desc: 'API Gateway, SAP, IAM Security', status: 'new' },
    ]
  },
  {
    group: 'Analítica e IA',
    icon: BarChart3,
    color: 'from-cyan-500 to-teal-600',
    modules: [
      { label: 'Dashboard Comercial', path: '/hr/hub', icon: BarChart3, desc: 'KPIs y gamificación de ventas', status: 'active' },
      { label: 'People Analytics', path: '/hr/analytics', icon: Brain, desc: 'IA Predictiva y Headcount', status: 'new' },
      { label: 'AI Native Platform', path: '/hr/ai', icon: Bot, desc: 'Copilot HR y Agentes Autónomos', status: 'new' },
    ]
  },
];

// ── Badge de estado ──────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  if (status === 'active') return null;
  if (status === 'new') return (
    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 ml-1">Nuevo</span>
  );
  if (status === 'soon') return (
    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/5 text-white/30 border border-white/10 ml-1">Próximo</span>
  );
};

// ── Tarjeta de módulo ────────────────────────────────────────────────────────
const ModuleCard = ({ mod, navigate }) => {
  const Icon = mod.icon;
  const isDisabled = mod.status === 'soon';

  return (
    <motion.button
      whileHover={!isDisabled ? { scale: 1.03, y: -2 } : {}}
      whileTap={!isDisabled ? { scale: 0.97 } : {}}
      onClick={() => !isDisabled && navigate(mod.path)}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 flex items-center gap-3 group ${
        isDisabled
          ? 'bg-white/3 border-white/5 cursor-not-allowed opacity-50'
          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 cursor-pointer'
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        isDisabled ? 'bg-white/5' : 'bg-white/10 group-hover:bg-white/15 transition-colors'
      }`}>
        <Icon className="w-4 h-4 text-white/70" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap">
          <span className={`text-sm font-semibold truncate ${isDisabled ? 'text-white/30' : 'text-white'}`}>
            {mod.label}
          </span>
          <StatusBadge status={mod.status} />
        </div>
        <div className="text-[11px] text-white/40 truncate leading-tight">{mod.desc}</div>
      </div>
      {!isDisabled && (
        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 shrink-0 transition-colors" />
      )}
    </motion.button>
  );
};

// ── Componente principal ─────────────────────────────────────────────────────
export default function HRHubPage() {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const [stats, setStats] = useState({ employees: 0, onboarding: 0, pending_docs: 0, surveys: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [{ count: empCount }, { count: docsExpiring }] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('employee_documents')
          .select('id', { count: 'exact', head: true })
          .lte('expires_at', new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      let onboardingCount = 0;
      try {
        const { count } = await supabase
          .from('hr_workflow_instances')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'EN_PROCESO');
        onboardingCount = count || 0;
      } catch (_) {}

      setStats({
        employees: empCount || 0,
        onboarding: onboardingCount,
        pending_docs: docsExpiring || 0,
        surveys: 2,
      });
    } catch (e) {
      console.error('HRHub stats error:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  const QUICK_STATS = [
    { label: 'Empleados Activos', value: stats.employees, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Onboardings Activos', value: stats.onboarding, icon: Workflow, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { label: 'Docs por Vencer', value: stats.pending_docs, icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/10', alert: stats.pending_docs > 0 },
    { label: 'Encuestas Activas', value: stats.surveys, icon: MessageSquare, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  ];

  const newModuleCount = HR_MODULES.flatMap(g => g.modules).filter(m => m.status === 'new').length;
  const totalModuleCount = HR_MODULES.flatMap(g => g.modules).filter(m => m.status !== 'soon').length;

  return (
    <div className="min-h-screen bg-[#1a1c2e]">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1e2d3d] via-[#1a2744] to-[#1a1c2e] border-b border-white/10">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-blue-500 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="text-white/50 text-sm font-medium uppercase tracking-widest">HRIS Enterprise</span>
              </div>
              <h1 className="text-3xl font-bold text-white mb-1">Centro de Recursos Humanos</h1>
              <p className="text-white/50 text-sm">
                {totalModuleCount} módulos activos · {newModuleCount} módulos nuevos · Sistema integrado de gestión de talento
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={() => navigate('/admin/hr/employees')}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2 shadow-lg"
              >
                <Users className="w-4 h-4" /> Ver Empleados
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={() => navigate('/admin/hr-dashboard')}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2 border border-white/15"
              >
                <BarChart3 className="w-4 h-4" /> Dashboard RRHH
              </motion.button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {QUICK_STATS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={`rounded-xl p-4 border ${s.alert ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    {s.alert && <AlertCircle className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <div className={`text-2xl font-bold ${s.color}`}>
                    {loadingStats ? '…' : s.value.toLocaleString('es-MX')}
                  </div>
                  <div className="text-[11px] text-white/50 mt-0.5">{s.label}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Módulos Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {HR_MODULES.map((group, gi) => {
          const GroupIcon = group.icon;
          return (
            <motion.div
              key={group.group}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.07 }}
            >
              {/* Group Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${group.color} flex items-center justify-center shadow-md`}>
                  <GroupIcon className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-white font-semibold text-base">{group.group}</h2>
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-white/30 text-xs">
                  {group.modules.filter(m => m.status === 'active').length} activos · {group.modules.filter(m => m.status === 'new').length} nuevos
                </span>
              </div>

              {/* Module Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {group.modules.map((mod, mi) => (
                  <ModuleCard key={mod.label} mod={mod} navigate={navigate} />
                ))}
              </div>
            </motion.div>
          );
        })}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          className="rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 p-6 flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div>
            <div className="text-white font-bold text-lg mb-1">¿Faltan módulos en tu empresa?</div>
            <div className="text-white/50 text-sm">
              Los módulos marcados como <span className="text-white/70 font-medium">"Próximo"</span> están en desarrollo.
              Contacta a soporte para priorizar funcionalidades.
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300 text-xs font-bold">{totalModuleCount} módulos disponibles</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <AlertCircle className="w-4 h-4 text-white/30" />
              <span className="text-white/30 text-xs font-medium">
                {HR_MODULES.flatMap(g => g.modules).filter(m => m.status === 'soon').length} próximos
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
