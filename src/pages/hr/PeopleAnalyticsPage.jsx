import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, 
  Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  BrainCircuit, 
  TrendingUp, 
  Users, 
  UserMinus, 
  AlertTriangle, 
  Activity,
  Briefcase,
  BadgeAlert,
  Loader2
} from 'lucide-react';
import { supabase } from '@/supabaseClient';

// Datos simulados (Mock Data) para Modo Demo
const MOCK_HEADCOUNT_FORECAST = [
  { month: 'Ene', actual: 1200, forecast: 1200 },
  { month: 'Feb', actual: 1215, forecast: 1220 },
  { month: 'Mar', actual: 1230, forecast: 1235 },
  { month: 'Abr', actual: 1225, forecast: 1250 },
  { month: 'May', actual: null, forecast: 1265 },
  { month: 'Jun', actual: null, forecast: 1280 },
];

const MOCK_FLIGHT_RISK = [
  { department: 'Ingeniería', highRisk: 12, mediumRisk: 25, lowRisk: 150 },
  { department: 'Ventas', highRisk: 8, mediumRisk: 30, lowRisk: 120 },
  { department: 'Marketing', highRisk: 4, mediumRisk: 15, lowRisk: 80 },
  { department: 'RRHH', highRisk: 2, mediumRisk: 5, lowRisk: 40 },
];

const MOCK_DIVERSITY = [
  { name: 'Mujeres', value: 45 },
  { name: 'Hombres', value: 52 },
  { name: 'No binario', value: 3 },
];
const DIVERSITY_COLORS = ['#8b5cf6', '#3b82f6', '#10b981'];

const MOCK_ABSENTEEISM = [
  { week: 'Sem 1', rate: 2.1 },
  { week: 'Sem 2', rate: 2.3 },
  { week: 'Sem 3', rate: 1.8 },
  { week: 'Sem 4', rate: 3.5 },
  { week: 'Sem 5', rate: 2.0 },
];

export default function PeopleAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      // Intenta leer de Supabase
      const { data: snapshots, error } = await supabase
        .from('hr_analytics_snapshots')
        .select('*')
        .limit(1)
        .single();

      if (error || !snapshots) {
        throw new Error('No hay datos o hubo un error al obtenerlos');
      }
      
      setData(snapshots);
      setIsDemoMode(false);
    } catch (err) {
      console.warn("Entrando en MODO DEMO:", err.message);
      setIsDemoMode(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1a1c2e]">
        <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-white p-6 md:p-10 font-sans">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 flex items-center gap-3">
            <BrainCircuit className="text-purple-500 h-8 w-8" />
            People Analytics & AI
          </h1>
          <p className="text-gray-400 mt-2">Enterprise Intelligence & Predictive Insights</p>
        </div>
        
        {isDemoMode && (
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 text-orange-400 rounded-full border border-orange-500/30">
            <BadgeAlert className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-wide">MODO DEMO</span>
          </div>
        )}
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard 
          title="Riesgo de Rotación (Q3)" 
          value="12.4%" 
          trend="+1.2%" 
          trendUp={false}
          icon={<UserMinus className="h-6 w-6 text-pink-500" />}
        />
        <KPICard 
          title="Forecast de Headcount" 
          value="1,280" 
          trend="+55" 
          trendUp={true}
          icon={<Users className="h-6 w-6 text-blue-500" />}
        />
        <KPICard 
          title="Índice de Productividad" 
          value="88/100" 
          trend="+3.4" 
          trendUp={true}
          icon={<Activity className="h-6 w-6 text-green-500" />}
        />
        <KPICard 
          title="Predicción Jubilaciones (1A)" 
          value="45 Empleados" 
          trend="Atención" 
          trendUp={false}
          icon={<AlertTriangle className="h-6 w-6 text-yellow-500" />}
        />
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Headcount Forecast */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#2a2c44] p-6 rounded-2xl border border-gray-700/50 shadow-xl lg:col-span-2"
        >
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="text-blue-400 h-5 w-5" />
              Forecast de Headcount (Proyección a futuro)
            </h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_HEADCOUNT_FORECAST}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="month" stroke="#9ca3af" axisLine={false} tickLine={false} />
                <YAxis stroke="#9ca3af" axisLine={false} tickLine={false} domain={['dataMin - 50', 'dataMax + 50']} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                  itemStyle={{ color: '#e5e7eb' }}
                />
                <Legend />
                <Area type="monotone" dataKey="actual" name="Headcount Real" stroke="#3b82f6" fillOpacity={1} fill="url(#colorActual)" />
                <Area type="monotone" dataKey="forecast" name="Proyección AI" stroke="#8b5cf6" strokeDasharray="5 5" fillOpacity={1} fill="url(#colorForecast)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Diversity Overview */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#2a2c44] p-6 rounded-2xl border border-gray-700/50 shadow-xl"
        >
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Users className="text-emerald-400 h-5 w-5" />
            Diversidad
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={MOCK_DIVERSITY}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {MOCK_DIVERSITY.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={DIVERSITY_COLORS[index % DIVERSITY_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Flight Risk by Department */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#2a2c44] p-6 rounded-2xl border border-gray-700/50 shadow-xl"
        >
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <AlertTriangle className="text-pink-400 h-5 w-5" />
            Modelos Predictivos: Flight Risk
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_FLIGHT_RISK} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={true} vertical={false} />
                <XAxis type="number" stroke="#9ca3af" />
                <YAxis dataKey="department" type="category" stroke="#9ca3af" width={100} axisLine={false} tickLine={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                  cursor={{ fill: '#374151', opacity: 0.4 }}
                />
                <Legend />
                <Bar dataKey="highRisk" name="Riesgo Alto" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="mediumRisk" name="Riesgo Medio" stackId="a" fill="#f59e0b" />
                <Bar dataKey="lowRisk" name="Riesgo Bajo" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Absenteeism Trend */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#2a2c44] p-6 rounded-2xl border border-gray-700/50 shadow-xl"
        >
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Briefcase className="text-orange-400 h-5 w-5" />
            Ausentismo (Últimas 5 Semanas)
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MOCK_ABSENTEEISM}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="week" stroke="#9ca3af" axisLine={false} tickLine={false} />
                <YAxis stroke="#9ca3af" axisLine={false} tickLine={false} domain={[0, 'dataMax + 1']} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="rate" 
                  name="Tasa de Ausentismo (%)"
                  stroke="#f97316" 
                  strokeWidth={3}
                  dot={{ r: 6, fill: '#1f2937', stroke: '#f97316', strokeWidth: 2 }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>
    </div>
  );
}

function KPICard({ title, value, trend, trendUp, icon }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-[#2a2c44] p-6 rounded-2xl border border-gray-700/50 shadow-lg flex flex-col justify-between"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-[#1a1c2e] rounded-xl border border-gray-700/30">
          {icon}
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${
          trendUp ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {trend}
        </div>
      </div>
      <div>
        <h4 className="text-gray-400 text-sm font-medium mb-1">{title}</h4>
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      </div>
    </motion.div>
  );
}
