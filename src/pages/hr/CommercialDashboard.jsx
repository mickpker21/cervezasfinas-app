import React, { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getPerformanceSummary, getUserGamificationParams } from '@/repositories/hrRepository';
import FullPageLoader from '@/components/FullPageLoader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from "@/components/ui/progress"; // Assuming we have this, or I will use standard HTML
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge"; // Assuming this exists or I will use div
import { Trophy, TrendingUp, Users, MapPin, DollarSign, Calendar } from 'lucide-react';

const CommercialDashboard = () => {
    const { user } = useSupabaseAuth();
    const [loading, setLoading] = useState(true);
    const [performance, setPerformance] = useState(null);
    const [gamification, setGamification] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            if (!user) return;
            try {
                // Mock period: Current Month
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

                const [perfData, gameData] = await Promise.all([
                    getPerformanceSummary(user.id, { start, end }),
                    getUserGamificationParams(user.id)
                ]);

                setPerformance(perfData);
                setGamification(gameData);
            } catch (e) {
                console.error("Error loading HR data", e);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [user]);

    if (loading) return <FullPageLoader />;

    return (
        <div className="p-4 space-y-6 bg-slate-50 min-h-screen pb-20">
            {/* Header / Gamification Banner */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">Hola, {user.user_metadata?.full_name || 'Vendedor'}</h1>
                        <p className="opacity-90 flex items-center gap-2">
                            <Badge variant="secondary" className="bg-yellow-400 text-black font-bold">
                                Nivel {gamification?.level || 1}
                            </Badge>
                            <span>{gamification?.xp || 0} XP</span>
                        </p>
                    </div>
                    <Trophy className="h-12 w-12 text-yellow-300 animate-pulse" />
                </div>
                {/* Progress to next level */}
                <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1 opacity-80">
                        <span>Progreso de Nivel</span>
                        <span>{Math.round(gamification?.levelProgress || 0)}%</span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full">
                        <div
                            className="h-full bg-yellow-400 rounded-full transition-all duration-1000"
                            style={{ width: `${gamification?.levelProgress || 0}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Main KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Volume Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Volumen vs Meta</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Number(performance?.volume?.current || 0).toFixed(1)} <span className="text-sm font-normal text-muted-foreground">htl</span></div>
                        <p className="text-xs text-muted-foreground mb-3">
                            Meta: {Number(performance?.volume?.target || 0).toFixed(1)} htl
                        </p>
                        <Progress value={performance?.volume?.percent} className="h-2" />
                        <p className="text-xs text-right mt-1 font-bold text-blue-600">
                            {Number(performance?.volume?.percent || 0).toFixed(1)}%
                        </p>
                    </CardContent>
                </Card>

                {/* Execution Card (Visits vs Planned) */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ejecución (Visitas)</CardTitle>
                        <MapPin className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Number(performance?.execution?.percent || 0).toFixed(0)}%</div>
                        <p className="text-xs text-muted-foreground mb-3">
                            {performance?.execution?.visited} de {performance?.execution?.planned} visitas hoy
                        </p>
                        <Progress value={performance?.execution?.percent} className="h-2" />
                    </CardContent>
                </Card>
            </div>

            {/* Client Coverage Section */}
            <div className="grid grid-cols-1 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Clientes con Compra</CardTitle>
                        <Users className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-2xl font-bold">{performance?.clients?.buying}</div>
                                <p className="text-xs text-muted-foreground">
                                    Clientes con venta este mes
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-bold text-blue-600">
                                    {Number(performance?.clients?.active_percent || 0).toFixed(0)}%
                                </span>
                                <p className="text-xs text-muted-foreground">Cobertura</p>
                            </div>
                        </div>
                        <Progress value={performance?.clients?.active_percent} className="h-2 mt-3" />
                    </CardContent>
                </Card>

                {/* Tabs for detailed sections */}
                <Tabs defaultValue="ranking" className="w-full">
                    <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="ranking">Ranking</TabsTrigger>
                        <TabsTrigger value="history">Historial</TabsTrigger>
                    </TabsList>
                    <TabsContent value="ranking">
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-700 font-bold">1</div>
                                        <div>
                                            <p className="font-medium">Carlos Ruiz</p>
                                            <p className="text-xs text-muted-foreground">Ruta 102</p>
                                        </div>
                                    </div>
                                    <span className="font-bold text-green-600">112%</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-200 text-blue-800 font-bold">4</div>
                                        <div>
                                            <p className="font-medium">Tú (Javier)</p>
                                            <p className="text-xs text-muted-foreground">Ruta 101</p>
                                        </div>
                                    </div>
                                    <span className="font-bold text-blue-600">{performance?.volume?.percent.toFixed(0)}%</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold">5</div>
                                        <div>
                                            <p className="font-medium">Ana López</p>
                                            <p className="text-xs text-muted-foreground">Ruta 105</p>
                                        </div>
                                    </div>
                                    <span className="font-bold text-slate-600">88%</span>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="history">
                        <div className="text-center p-8 text-muted-foreground">
                            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-20" />
                            <p>No hay historial previo disponible.</p>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default CommercialDashboard;
