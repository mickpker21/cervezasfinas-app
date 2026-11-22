import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Megaphone, TrendingUp, BarChart2, Star, Target, PieChart, Users, Calendar, MapPin, Tag } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';

const mockActivationsData = [
  { name: 'Lun', ejecutadas: 12, meta: 15 },
  { name: 'Mar', ejecutadas: 19, meta: 15 },
  { name: 'Mié', ejecutadas: 15, meta: 15 },
  { name: 'Jue', ejecutadas: 22, meta: 20 },
  { name: 'Vie', ejecutadas: 28, meta: 25 },
  { name: 'Sáb', ejecutadas: 35, meta: 30 },
  { name: 'Dom', ejecutadas: 10, meta: 10 },
];

const mockShareOfShelf = [
  { name: 'Cervezas Finas', value: 45 },
  { name: 'Competencia A', value: 30 },
  { name: 'Competencia B', value: 15 },
  { name: 'Otros', value: 10 },
];
const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#64748b'];

const mockPromotionsData = [
  { zona: 'Norte', efectividad: 85, presupuesto: 12000 },
  { zona: 'Sur', efectividad: 62, presupuesto: 8500 },
  { zona: 'Centro', efectividad: 91, presupuesto: 15000 },
  { zona: 'Occidente', efectividad: 74, presupuesto: 10000 },
];

export default function GerenteTradeDashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-6">
      <Helmet>
        <title>Panel Gerencia Trade - Cervezas Finas</title>
      </Helmet>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Megaphone className="text-emerald-500 w-8 h-8" /> Gerencia Trade Marketing
          </h1>
          <p className="text-slate-400">Panel ejecutivo: Promociones, Share of Shelf y Activaciones.</p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/coortrade/dashboard')}>
                <Target className="w-4 h-4 mr-2 text-blue-400" /> Operación CoorTrade
            </Button>
            <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/coortrade/promotions')}>
                <Tag className="w-4 h-4 mr-2 text-emerald-400" /> Promociones Activas
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Calendar className="w-4 h-4 mr-2" /> Nueva Activación
            </Button>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-400">Activaciones Mensuales</CardTitle>
            <Star className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">142</div>
            <p className="text-xs text-emerald-400 mt-1 flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> +12% vs mes anterior</p>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-400">Share of Shelf Global</CardTitle>
            <PieChart className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">45.0%</div>
            <p className="text-xs text-emerald-400 mt-1 flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> +2.5 pts vs Q1</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-400">Efectividad Promociones</CardTitle>
            <Target className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">78.5%</div>
            <p className="text-xs text-slate-400 mt-1">Cumplimiento vs meta volumen</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-400">Alcance de Impactos</CardTitle>
            <Users className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">85.4K</div>
            <p className="text-xs text-emerald-400 mt-1 flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> Consumidores contactados</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Activations Trend */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Activaciones en Punto de Venta (PDV)</CardTitle>
            <CardDescription className="text-slate-400">Ejecutadas vs Meta (Últimos 7 días)</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockActivationsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEjecutadas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Legend />
                <Area type="monotone" dataKey="meta" stroke="#64748b" fill="none" strokeDasharray="5 5" name="Meta" />
                <Area type="monotone" dataKey="ejecutadas" stroke="#10b981" fillOpacity={1} fill="url(#colorEjecutadas)" name="Ejecutadas" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Share of Shelf */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Share of Shelf (Participación en Anaquel)</CardTitle>
            <CardDescription className="text-slate-400">Consolidado Nacional (%)</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={mockShareOfShelf}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  label={({name, value}) => `${name} ${value}%`}
                  labelLine={false}
                >
                  {mockShareOfShelf.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>

      {/* Bottom Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Promos by zone */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Efectividad de Promociones por Zona</CardTitle>
            <CardDescription className="text-slate-400">% de incremento vs línea base</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockPromotionsData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis dataKey="zona" type="category" stroke="#94a3b8" />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  cursor={{fill: '#334155', opacity: 0.4}}
                />
                <Bar dataKey="efectividad" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="% Efectividad" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Últimas Activaciones Registradas</CardTitle>
            <CardDescription className="text-slate-400">Fotografías y reportes de Trade Marketing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { zone: 'Norte - MTY', client: 'Supermercado del Rey', type: 'Exhibición Adicional', status: 'Excelente', date: 'Hace 2 horas' },
                { zone: 'Sur - CUN', client: 'Minisuper La Playa', type: 'Degustación', status: 'Buena', date: 'Hace 4 horas' },
                { zone: 'Centro - CDMX', client: 'Abarrotes El Sol', type: 'Colocación POP', status: 'Regular', date: 'Hace 5 horas' },
                { zone: 'Occidente - GDL', client: 'Licores VIP', type: 'Cabecera', status: 'Excelente', date: 'Hace 8 horas' },
              ].map((act, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{act.client}</h4>
                      <p className="text-xs text-slate-400">{act.type} • {act.zone}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                      act.status === 'Excelente' ? 'bg-emerald-500/20 text-emerald-400' :
                      act.status === 'Buena' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      {act.status}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1">{act.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

    </div>
  );
}

