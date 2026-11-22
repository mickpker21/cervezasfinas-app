import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Trophy, Map as MapIcon, Users, BarChart2, Megaphone, Target, CheckCircle2, AlertTriangle, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

// Import Views
import SupervisorDashboard from '../SupervisorDashboard';
import ConquistaRankingPage from '../conquista/ConquistaRankingPage';

const mockRutasData = [
  { name: 'Ruta 01', visitados: 45, meta: 50 },
  { name: 'Ruta 02', visitados: 52, meta: 55 },
  { name: 'Ruta 03', visitados: 38, meta: 45 },
  { name: 'Ruta 04', visitados: 60, meta: 60 },
  { name: 'Ruta 05', visitados: 25, meta: 40 },
];

const mockEjecucionData = [
  { name: 'Lun', check: 85 },
  { name: 'Mar', check: 88 },
  { name: 'Mié', check: 82 },
  { name: 'Jue', check: 90 },
  { name: 'Vie', check: 95 },
  { name: 'Sáb', check: 98 },
];

export default function CoorTradeDashboard() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("resumen");

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            <Helmet>
                <title>Panel CoorTrade - Cervezas Finas</title>
            </Helmet>

            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                            <LayoutDashboard className="text-emerald-500 w-8 h-8" /> Panel de Coordinación Trade
                        </h1>
                        <p className="text-slate-400">Seguimiento operativo de rutas, conquista y cumplimiento de KPIs en campo.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/coortrade/clients')}>
                            <Users className="w-4 h-4 mr-2 text-blue-400" /> Clientes
                        </Button>
                        <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/coortrade/map')}>
                            <MapIcon className="w-4 h-4 mr-2 text-emerald-400" /> Mapa
                        </Button>
                        <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/coortrade/gps')}>
                            <MapIcon className="w-4 h-4 mr-2 text-cyan-400" /> GPS en Vivo
                        </Button>
                        <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/coortrade/promotions')}>
                            <Megaphone className="w-4 h-4 mr-2 text-emerald-400" /> Promociones
                        </Button>
                        <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/coortrade/comparative')}>
                            <BarChart2 className="w-4 h-4 mr-2 text-amber-400" /> Comparativo
                        </Button>
                        <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/coortrade/scorecard')}>
                            <Trophy className="w-4 h-4 mr-2 text-purple-400" /> Scorecard
                        </Button>
                    </div>
                </div>

                {/* Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList className="bg-slate-900 border border-slate-800 p-1 flex-wrap h-auto">
                        <TabsTrigger value="resumen" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                            <BarChart2 className="w-4 h-4 mr-2" /> Resumen Operativo
                        </TabsTrigger>
                        <TabsTrigger value="conquista" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                            <Trophy className="w-4 h-4 mr-2" /> Ranking Conquista
                        </TabsTrigger>
                        <TabsTrigger value="supervisor" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                            <LayoutDashboard className="w-4 h-4 mr-2" /> Seguimiento de Rutas
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="resumen" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Card className="bg-slate-900 border-slate-800">
                                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-slate-400">Rutas Activas</CardTitle>
                                    <Briefcase className="w-4 h-4 text-emerald-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">42 / 45</div>
                                    <p className="text-xs text-emerald-400 mt-1">93% de cobertura hoy</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-slate-900 border-slate-800">
                                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-slate-400">Auditorías Trade</CardTitle>
                                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">128</div>
                                    <p className="text-xs text-slate-400 mt-1">Realizadas esta semana</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-slate-900 border-slate-800">
                                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-slate-400">Cumplimiento Visual</CardTitle>
                                    <Target className="w-4 h-4 text-purple-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">88%</div>
                                    <p className="text-xs text-emerald-400 mt-1">+3% vs semana anterior</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-slate-900 border-slate-800">
                                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-slate-400">Alertas PDV</CardTitle>
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">14</div>
                                    <p className="text-xs text-amber-400 mt-1">Requieren atención inmediata</p>
                                </CardContent>
                            </Card>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="bg-slate-900 border-slate-800">
                                <CardHeader>
                                    <CardTitle className="text-lg text-white">Avance de Visitas por Ruta</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={mockRutasData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <RechartsTooltip 
                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                                cursor={{fill: '#334155', opacity: 0.4}}
                                            />
                                            <Legend />
                                            <Bar dataKey="visitados" fill="#3b82f6" name="Visitados" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="meta" fill="#334155" name="Meta" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-900 border-slate-800">
                                <CardHeader>
                                    <CardTitle className="text-lg text-white">Tendencia de Ejecución Perfecta (%)</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={mockEjecucionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorCheck" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} domain={[60, 100]} />
                                            <RechartsTooltip 
                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                            />
                                            <Area type="monotone" dataKey="check" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorCheck)" name="% Cumplimiento" strokeWidth={3} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="conquista" className="space-y-4">
                        <div className="border border-slate-800 rounded-lg overflow-hidden">
                            <ConquistaRankingPage />
                        </div>
                    </TabsContent>

                    <TabsContent value="supervisor" className="space-y-4">
                        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
                            <SupervisorDashboard />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
