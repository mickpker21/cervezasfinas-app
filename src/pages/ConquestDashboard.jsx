import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Users, MapPin, Calendar, Star, TrendingUp, Target, Search, Trophy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '../supabaseClient';
import SyncButton from '@/components/SyncButton';
import { getClients } from '@/repositories/clientsRepository';
import { getAllVisits } from '@/repositories/visitsRepository';
import { getGoals } from '@/repositories/goalsRepository';
import { getSalesBySku } from '@/repositories/salesRepository'; // Correct source for Historical Volume
import DonutProgress from '@/components/DonutProgress';
import ComparativeSalesChart from '@/components/ComparativeSalesChart';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';


// Helper to format history data for the chart
const processHistoryData = (salesData) => {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Initialize standard structure
  const monthlyData = months.map((m, i) => ({
    month: m,
    monthIndex: i + 1,
    current: 0,
    previous: 0
  }));

  salesData.forEach(s => {
    const d = new Date(s.fecha || s.period_date); // Support both fields
    const year = d.getFullYear();
    const monthIdx = d.getMonth(); // 0-11

    // Sum HL
    const hl = Number(s.htls_total || 0);

    if (year === currentYear) {
      monthlyData[monthIdx].current += hl;
    } else if (year === prevYear) {
      monthlyData[monthIdx].previous += hl;
    }
  });

  return monthlyData;
};

// Componente Reloj
const DashboardClock = React.memo(() => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-white/60 text-sm font-mono bg-white/5 px-3 py-1 rounded-full border border-white/10">
      {now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} — {now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
    </div>
  );
});

export default function ConquestDashboard() {
  const [monthlyClients, setMonthlyClients] = useState([]);
  const [monthlySales, setMonthlySales] = useState({}); // Stores Volume (HL)
  const [monthlyClientsCount, setMonthlyClientsCount] = useState(0);
  const [monthlyTotalSales, setMonthlyTotalSales] = useState(0); // Total HL
  const [monthlyMeta, setMonthlyMeta] = useState(0);
  const [monthlyMetaClientes, setMonthlyMetaClientes] = useState(0);
  const [monthlyMetaClientes1HL, setMonthlyMetaClientes1HL] = useState(0);
  const [loadingMonthly, setLoadingMonthly] = useState(true);
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalClients: 0,
    visitsToday: 0,
    newClientsThisWeek: 0,
    clientsThisMonth: 0,
    visitsThisMonth: 0,
    averageClientLevel: 'N/A',
    clientsWithPurchase: 0,
    clientsWithPurchase1HL: 0
  });

  // History Modal State
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);


  const handleClientClick = async (client) => {
    setSelectedClient(client);
    setHistoryOpen(true);
    setLoadingHistory(true);
    setHistoryData([]);

    try {
      // Detect route again or use state if available (better to be safe)
      const { detectUserRoute } = await import('@/repositories/routeRepository');
      const route = await detectUserRoute(user);

      if (route) {
        const currentYear = new Date().getFullYear();
        const fromDate = `${currentYear - 1}-01-01`; // Start of prev year
        const toDate = new Date().toISOString().slice(0, 10);

        // Fetch generic sales for route (or specific client filter if Repo supported it, but we do route filter then memory)
        // Note: salesRepository getSalesBySku fetches by Route. 
        // We'll fetch ALL for route in that range and filter in memory.
        // PROD OPTIMIZATION: ideally backend supports client_id filtering.
        const rawSales = await getSalesBySku({
          salesRoute: route,
          from: fromDate,
          to: toDate
        });

        // Filter for THIS specific client
        // Match by ID if possible, or client_code. 
        // salesRepository returns mixed fields depending on source.
        // Usually cve_cliente (code). Client object has client_code.
        const clientCode = String(client.client_code || '').trim();

        const clientSales = rawSales.filter(s => {
          const sCode = String(s.cve_cliente || '').trim();
          return sCode === clientCode;
        });

        const processed = processHistoryData(clientSales);
        setHistoryData(processed);
      }
    } catch (err) {
      console.error("Error loading history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const [loading, setLoading] = useState(true);

  // Función para cargar stats y clientes
  const fetchStats = async () => {
    if (!user) return;

    setLoadingMonthly(true);
    let monthlyClientsArr = [];

    let salesMap = {}; // client_id -> { volume: 0, lastDate: null }
    let metaValue = 0;
    let metaClientes = 0;
    let metaClientes1HL = 0;

    let clientsWithPurchaseCount = 0;
    let clientsWithPurchase1HLCount = 0;

    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const today = now;
      const monthStartStr = monthStart.toISOString().slice(0, 10);
      const todayStr = today.toISOString().slice(0, 10);

      // 1. Obtener perfil y ruta (Robust)
      const { detectUserRoute } = await import('@/repositories/routeRepository');
      const route = await detectUserRoute(user);

      // 2. Clientes (Force online check by passing route)
      const allClients = await getClients(route);
      const routeStr = String(route || '').trim().toLowerCase();

      const clientsRoute = allClients.filter(c => {
        if (!route) return false;
        return String(c.internal_route || '').toLowerCase().trim() == routeStr ||
          String(c.sales_route || '').toLowerCase().trim() == routeStr;
      });

      // 3. Obtener Ventas (Volumen Histórico + Ventas Recientes en Vivo)

      // A) Histórico (Volume HL) - Fuente: salesRepository (MySQL/LocalCache)
      //    Esto nos da el avance REAL de volumen confirmado por el sistema central.
      let historicalSales = [];
      if (route) {
        try {
          historicalSales = await getSalesBySku({
            salesRoute: route,
            from: monthStartStr,
            to: todayStr
          });
        } catch (err) {
          console.warn('Error fetching historical sales', err);
        }
      }

      // B) Ventas en Vivo (Direct Sales) - Fuente: Supabase direct_sales
      //    Esto nos dice quién compró AHORA (útil para "Clients with Purchase" status)
      let recentBuyers = new Set();
      try {
        const { data: directSales } = await supabase
          .from('direct_sales')
          .select('client_id, total_amount')
          .eq('user_id', user.id)
          .gte('created_at', `${monthStartStr}T00:00:00`);

        if (directSales) {
          directSales.forEach(ds => recentBuyers.add(ds.client_id));
        }
      } catch (err) {
        console.warn('Error fetching direct sales', err);
      }

      // 4. Mapear Volumen por Cliente
      //    Nota: historicalSales tiene campos: cve_cliente, htls_total
      //    Necesitamos matchear cve_cliente con `client_code` de nuestros clientes, O `client_id` si el sistema lo soportara.
      //    Asumamos que historicalSales trae `cve_cliente` que corresponde a `client_code` local.

      // Crear mapa de `client_code` -> `client_id` para asignación rápida
      const codeToIdMap = {};
      clientsRoute.forEach(c => {
        if (c.client_code) codeToIdMap[String(c.client_code)] = c.id;
        // Fallback por si acaso el historical trae ID interno (menos probable en sistemas legacy)
      });

      // Llenar salesMap con VOLUMEN (HL)
      historicalSales.forEach(s => {
        // En salesRepository: `cve_cliente` es el código
        const clientId = codeToIdMap[String(s.cve_cliente)];
        if (clientId) {
          if (!salesMap[clientId]) {
            salesMap[clientId] = { volume: 0, lastDate: null };
          }
          salesMap[clientId].volume += Number(s.htls_total || 0);

          // Check date/track max
          const sDate = s.period_date || s.fecha;
          if (sDate) {
            if (!salesMap[clientId].lastDate || sDate > salesMap[clientId].lastDate) {
              salesMap[clientId].lastDate = sDate;
            }
          }
        }
      });

      // Calcular KPIs globales
      const totalRouteVolume = Object.values(salesMap).reduce((acc, val) => acc + (val.volume || 0), 0);

      // Clients with Purchase: 
      // Union of (Clients with Historical Volume > 0) AND (Clients in recentBuyers)
      const allClientsWithActivity = new Set([...Object.keys(salesMap), ...recentBuyers]);

      clientsWithPurchaseCount = 0;
      clientsWithPurchase1HLCount = 0;

      // Iteramos clientes de la ruta para contar
      clientsRoute.forEach(c => {
        const data = salesMap[c.id] || { volume: 0 };
        const volume = data.volume;
        const hasDirectPurchase = recentBuyers.has(c.id);

        if (volume > 0 || hasDirectPurchase) {
          clientsWithPurchaseCount++;
        }

        if (volume >= 1) {
          clientsWithPurchase1HLCount++;
        }
      });

      // 5. Filtrar Lista "Recientes" (Creados, Modificados o Con Ventas)
      console.log('----------------------------------------------------');
      console.log('📊 [DASHBOARD DEBUG] Start Filtering');
      console.log('   Route:', route);
      console.log('   Total Clients Fetched:', allClients.length);
      console.log('   Clients in Route:', clientsRoute.length);
      console.log('   Date Filter:', monthStartStr, 'to', todayStr);

      monthlyClientsArr = (clientsRoute || []).filter(c => {
        const created = new Date(c.created_at);
        const updated = c.updated_at ? new Date(c.updated_at) : created;

        const isCreated = created >= monthStart && created <= today;
        const isUpdated = updated >= monthStart && updated <= today;

        // OLD LOGIC: const hasSales = (salesMap[c.id] || 0) > 0 || recentBuyers.has(c.id);
        const volume = (salesMap[c.id]?.volume || 0);
        const hasSales = volume > 0 || recentBuyers.has(c.id);

        // NEW FILTER REQUIREMENT: Only Clients with Sales > 0
        // We override the complexity. User wants ONLY sales list.
        return hasSales;

        // OLD COMPLEX FILTER (Commented out for ref)
        /* 
        const pass = isCreated || isUpdated || hasSales;
        return pass;
        */

        // Log failures for first 5 clients to debug
        if (!pass && monthlyClientsArr.length < 5) {
          console.log(`   ❌ Filtered Out: ${c.name} (${c.id})`);
          console.log(`      Created: ${created.toISOString()} (IsCreated: ${isCreated})`);
          console.log(`      Updated: ${updated.toISOString()} (IsUpdated: ${isUpdated})`);
          console.log(`      HasSales: ${hasSales}`);
        }

        return pass;
      });
      console.log('   ✅ Accepted for List:', monthlyClientsArr.length);

      // Actualizamos estado
      setMonthlyClientsCount(monthlyClientsArr.length);
      setMonthlyTotalSales(totalRouteVolume);

      setMonthlySales(salesMap); // Map of ID -> { volume, lastDate }

      // Meta
      if (route) {
        const metasData = await getGoals({
          salesRoute: route,
          from: monthStartStr,
          to: todayStr
        });
        if (metasData && metasData.length > 0) {
          const latestMeta = metasData.reduce((latest, curr) => {
            return new Date(curr.period_date) > new Date(latest.period_date) ? curr : latest;
          }, metasData[0]);
          metaValue = latestMeta.meta || 0;
          metaClientes = latestMeta.meta_clientes || 0;
          metaClientes1HL = latestMeta.meta_clientes_1htl || 0;
        }
      }

      // Stats adicionales
      const allVisits = await getAllVisits();
      const visitsSafe = allVisits.filter(v =>
        v.user_id === user.id && v.fecha >= monthStartStr && v.fecha <= todayStr
      );

      const visitsToday = visitsSafe.filter(v => v.fecha === todayStr).length;
      const visitsThisMonth = visitsSafe.length;

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const newClientsThisWeek = clientsRoute.filter(c => new Date(c.created_at) > oneWeekAgo).length;
      const clientsThisMonth = clientsRoute.filter(c => {
        const d = new Date(c.created_at);
        return d >= new Date(now.getFullYear(), now.getMonth(), 1);
      }).length;

      // Nivel
      const levelValueMap = { BRONCE: 1, PLATA: 2, ORO: 3, PLATINO: 4, TITANIO: 5 };
      const displayLevels = ['Bronce', 'Plata', 'Oro', 'Platino', 'Titanio'];
      const totalLevel = clientsRoute.reduce((sum, c) => sum + (levelValueMap[String(c.level).toUpperCase()] || 0), 0);
      const avg = clientsRoute.length ? totalLevel / clientsRoute.length : 0;
      const rounded = Math.max(1, Math.min(5, Math.round(avg || 0)));
      const avgLabels = rounded > 0 ? displayLevels[rounded - 1] : 'N/A';

      setStats({
        totalClients: clientsRoute.length,
        visitsToday,
        newClientsThisWeek,
        clientsThisMonth,
        visitsThisMonth,
        averageClientLevel: avgLabels,
        clientsWithPurchase: clientsWithPurchaseCount,
        clientsWithPurchase1HL: clientsWithPurchase1HLCount
      });

    } catch (e) {
      console.error('Error fetching monthly stats', e);
      setMonthlyClients([]);
      setMonthlySales({});
    }
    setMonthlyMeta(metaValue);
    setMonthlyMetaClientes(metaClientes);
    setMonthlyMetaClientes1HL(metaClientes1HL);
    setLoadingMonthly(false);
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab visible, refreshing dashboard...');
        fetchStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line
  }, [user?.id]);

  // Cálculo de porcentaje para Donut
  const metaVolumen = monthlyMeta || 0;
  const currentVolumen = monthlyTotalSales || 0;
  const percentVolumen = metaVolumen > 0 ? Math.min(100, Math.round((currentVolumen / metaVolumen) * 100)) : 0;

  // Porcentajes para nuevas donuts
  const percentClientes = monthlyMetaClientes > 0 ? Math.min(100, Math.round((stats.clientsWithPurchase / monthlyMetaClientes) * 100)) : 0;
  const percentClientes1HL = monthlyMetaClientes1HL > 0 ? Math.min(100, Math.round((stats.clientsWithPurchase1HL / monthlyMetaClientes1HL) * 100)) : 0;



  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
    </div>
  }

  return (
    <>
      <Helmet>
        <title>Conquista - Cervezas Finas</title>
        <meta name="description" content="Dashboard de prospección y conquista" />
      </Helmet>

      <div className="space-y-6 max-w-[1600px] mx-auto pb-10">

        {/* HEADER */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard Conquista</h1>
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-full border border-amber-500/30">
                HUNTER
              </span>
            </div>
            <p className="text-white/60">Bienvenido, <span className="text-emerald-400 font-medium">{user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario'}</span>. Aquí está tu resumen de prospección.</p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" className="bg-white/5 border-white/10 text-white hover:bg-white/10" onClick={() => navigate('/conquista/ranking')}>
              <Trophy className="w-4 h-4 mr-2 text-yellow-500" /> Ranking
            </Button>
            <DashboardClock />
            <SyncButton variant="outline" size="sm" showLabel={false} />
          </div>
        </motion.div>

        {/* TOP METRICS & GOALS */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* MAIN GOAL: VOLUME */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="md:col-span-4 lg:col-span-3">
            <Card className="heineken-card h-full relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 to-transparent pointer-events-none" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                  <Target className="w-4 h-4" /> Meta Volumen (HL)
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center pt-2">
                <div className="w-40 h-40 scale-110 mb-2 flex items-center justify-center">
                  <DonutProgress
                    value={percentVolumen}
                    // size prop ignored by component
                    // strokeWidth prop ignored by component
                    colorClass="text-emerald-500"
                    bgClass="text-emerald-900/30"
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">{percentVolumen}%</div>
                      <div className="text-[10px] text-white/50 uppercase tracking-wider">Avance</div>
                    </div>
                  </DonutProgress>
                </div>
                <div className="flex justify-between w-full px-4 text-xs mt-4 border-t border-white/5 pt-3">
                  <div className="text-center">
                    <div className="text-white/50">Actual</div>
                    <div className="text-emerald-400 font-bold text-sm">{currentVolumen.toFixed(2)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/50">Meta</div>
                    <div className="text-white font-bold text-sm">{metaVolumen.toFixed(0)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* SECONDARY METRICS */}
          <div className="md:col-span-8 lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* Clientes Con Compra */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="heineken-card h-full flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-amber-300 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Clientes con Compra
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center pt-2">
                  <div className="w-40 h-40 scale-110 mb-2 flex items-center justify-center">
                    <DonutProgress
                      value={percentClientes}
                      colorClass="text-amber-500"
                      bgClass="text-amber-900/30"
                    >
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white">{percentClientes}%</div>
                        <div className="text-[9px] text-white/50 uppercase tracking-wider">Logro</div>
                      </div>
                    </DonutProgress>
                  </div>
                  <div className="flex justify-between w-full px-2 text-xs mt-2 border-t border-white/5 pt-2">
                    <div className="text-center">
                      <div className="text-white/50 text-[10px]">Actual</div>
                      <div className="text-amber-400 font-bold text-sm">{stats.clientsWithPurchase}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-white/50 text-[10px]">Meta</div>
                      <div className="text-white font-bold text-sm">{monthlyMetaClientes}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Clientes > 1 HL */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="heineken-card h-full flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-purple-300 flex items-center gap-2">
                    <Star className="w-4 h-4" /> Clientes {'>'} 1 HL
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center pt-2">
                  <div className="w-40 h-40 scale-110 mb-2 flex items-center justify-center">
                    <DonutProgress
                      value={percentClientes1HL}
                      colorClass="text-purple-500"
                      bgClass="text-purple-900/30"
                    >
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white">{percentClientes1HL}%</div>
                        <div className="text-[9px] text-white/50 uppercase tracking-wider">Logro</div>
                      </div>
                    </DonutProgress>
                  </div>
                  <div className="flex justify-between w-full px-2 text-xs mt-2 border-t border-white/5 pt-2">
                    <div className="text-center">
                      <div className="text-white/50 text-[10px]">Actual</div>
                      <div className="text-purple-400 font-bold text-sm">{stats.clientsWithPurchase1HL}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-white/50 text-[10px]">Meta</div>
                      <div className="text-white font-bold text-sm">{monthlyMetaClientes1HL}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Clientes Nuevos */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <Card className="heineken-card h-full flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-300 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Clientes Nuevos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-white mb-1">{stats.clientsThisMonth}</div>
                  <p className="text-xs text-white/60">Registrados mes</p>
                  <div className="mt-2 text-[10px] text-white/50">
                    +{stats.newClientsThisWeek} esta semana
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Total y Visitas */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Card className="heineken-card h-full flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                    <Search className="w-4 h-4" /> Resumen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/50">Cartera:</span>
                    <span className="font-bold text-white">{stats.totalClients}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/50">Visitas Mes:</span>
                    <span className="font-bold text-white">{stats.visitsThisMonth}</span>
                  </div>
                  <div className="flex justify-between items-center bg-white/5 p-1 rounded">
                    <span className="text-xs text-white/50">Visitas Hoy:</span>
                    <span className="font-bold text-emerald-400">{stats.visitsToday}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

          </div>
        </div>

        {/* LISTA COMPLETA (SIN MAPA) */}
        <div className="flex flex-col">
          <Card className="heineken-card flex-1 flex flex-col min-h-[500px]">
            <CardHeader className="py-4 border-b border-white/10 bg-slate-900/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-white">Clientes con Venta en el Mes</CardTitle>
                <Button size="icon" variant="ghost" onClick={fetchStats} disabled={loadingMonthly} className="h-8 w-8 text-white/50 hover:text-white">
                  <TrendingUp className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-white/50">Clientes que han comprado este mes</p>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-0 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {loadingMonthly ? (
                <div className="p-12 text-center text-white/50 animate-pulse">Cargando análisis de cartera...</div>
              ) : monthlyClients.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Calendar className="w-8 h-8 text-white/20" />
                  </div>
                  <p className="text-white/60 text-lg">Sin ventas registradas</p>
                  <div className="text-white/30 text-sm mt-1 max-w-md text-center">
                    <p>Ningún cliente de tu ruta ha comprado aún este mes.</p>
                    {stats.totalClients > 0 && (
                      <p className="mt-2 font-mono text-emerald-400/70 border border-emerald-500/20 rounded px-2 py-1 bg-emerald-500/5">
                        Total Clientes en Cartera: {stats.totalClients}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 bg-slate-900/50 p-1">
                  {monthlyClients.map(c => {
                    const data = monthlySales[c.id] || { volume: 0, lastDate: null };
                    const venta = data.volume;
                    const lastDate = data.lastDate;

                    const isNew = new Date(c.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    const hasHighVol = venta >= 1;

                    return (
                      <div key={c.id} className="p-4 bg-slate-800/40 hover:bg-white/5 transition-colors cursor-pointer group rounded border border-white/5" onClick={() => handleClientClick(c)}>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-white text-sm group-hover:text-emerald-300 transition-colors truncate pr-2">{c.name}</h3>
                          <div className="flex gap-1 shrink-0">
                            {isNew && <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded font-bold">NUEVO</span>}
                            {hasHighVol && <span className="bg-purple-500/20 text-purple-300 text-[9px] px-1.5 py-0.5 rounded font-bold">+1 HL</span>}
                          </div>
                        </div>
                        <div className="flex justify-between items-end">
                          <div className="text-xs text-white/40 flex flex-col">
                            <span>Última Compra:</span>
                            <span className="text-white/60">{lastDate ? new Date(lastDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : 'N/A'}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-white/50">Venta Mes</div>
                            <div className={`text-lg font-mono font-bold ${venta > 0 ? 'text-white' : 'text-white/30'}`}>
                              {venta.toFixed(2)} <span className="text-[10px] text-white/50">HL</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
            <div className="p-3 bg-white/5 border-t border-white/10 text-center flex justify-center gap-4">
              <Button variant="link" className="text-emerald-400 text-xs h-auto p-0" onClick={() => navigate('/clients')}>
                Ir al Directorio Completo ({stats.totalClients})
              </Button>
              <div className="w-px h-4 bg-white/20 self-center"></div>
              <Button variant="link" className="text-amber-400 text-xs h-auto p-0" onClick={() => navigate('/conquista/mapa')}>
                Abrir Mapa
              </Button>
            </div>
          </Card>
        </div>

      </div>

      {/* COMPARATIVE CHART MODAL */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-4xl bg-[#1e2337] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>{selectedClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="h-[400px] w-full mt-4">
            {loadingHistory ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
              </div>
            ) : (
              <ComparativeSalesChart
                data={historyData}
                currentYear={new Date().getFullYear()}
                prevYear={new Date().getFullYear() - 1}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
