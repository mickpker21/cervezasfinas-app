// LiquidacionesReportPage.jsx
// Reporte Ejecutivo de Liquidaciones, Descuentos Otorgados y Control de Envases
// Roles permitidos: admin, sistemas, gerente
import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart2, DollarSign, RefreshCw, Calendar, Truck, AlertTriangle,
  CheckCircle2, Package, Search, Download, Filter, Percent, ArrowDownRight,
  ChevronLeft, ChevronRight, FileText, UserCheck, ShieldAlert
} from 'lucide-react';

export default function LiquidacionesReportPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();

  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [preventas, setPreventas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch liquidaciones del día seleccionado
      const { data: liqData, error: liqErr } = await supabase
        .from('liquidaciones')
        .select('*')
        .eq('fecha', dateFilter)
        .order('created_at', { ascending: false });

      if (liqErr) console.warn('[LiquidacionesReport] Error liquidaciones:', liqErr);
      setLiquidaciones(liqData || []);

      // 2. Fetch preventas del día para consolidados de descuentos
      const startDate = `${dateFilter}T00:00:00`;
      const endDate = `${dateFilter}T23:59:59`;

      const { data: prevData, error: prevErr } = await supabase
        .from('preventa')
        .select('id, client_id, total_amount, gec_discount, promo_discount, cargo, status, delivery_route, chofer_id')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (prevErr) console.warn('[LiquidacionesReport] Error preventas:', prevErr);
      setPreventas(prevData || []);

    } catch (e) {
      toast({ title: 'Error al cargar reporte', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateFilter]);

  // Consolidated Metrics
  const metrics = useMemo(() => {
    const totalSales = preventas.reduce((acc, p) => acc + Number(p.total_amount || 0), 0);
    const deliveredCount = preventas.filter(p => p.status === 'entregado').length;
    const rejectedCount = preventas.filter(p => p.status === 'rechazado').length;
    const totalGecDiscount = preventas.reduce((acc, p) => acc + Number(p.gec_discount || 0), 0);
    const totalPromoDiscount = preventas.reduce((acc, p) => acc + Number(p.promo_discount || 0), 0);
    const totalCargo = preventas.reduce((acc, p) => acc + Number(p.cargo || 0), 0);

    const totalCashCollected = liquidaciones.reduce((acc, l) => acc + Number(l.efectivo_recibido || 0), 0);
    const totalMissingCash = liquidaciones.reduce((acc, l) => acc + Math.abs(Math.min(0, Number(l.diferencia_efectivo || 0))), 0);
    const totalMissingBottles = liquidaciones.reduce((acc, l) => acc + Number(l.envases_faltantes || 0), 0);
    const totalBottleCharges = liquidaciones.reduce((acc, l) => acc + Number(l.cobro_envases_faltantes || 0), 0);

    return {
      totalSales,
      deliveredCount,
      rejectedCount,
      totalGecDiscount,
      totalPromoDiscount,
      totalDiscounts: totalGecDiscount + totalPromoDiscount,
      totalCargo,
      totalCashCollected,
      totalMissingCash,
      totalMissingBottles,
      totalBottleCharges
    };
  }, [preventas, liquidaciones]);

  const filteredLiquidaciones = useMemo(() => {
    if (!search.trim()) return liquidaciones;
    const q = search.toLowerCase();
    return liquidaciones.filter(l =>
      (l.delivery_route || '').toLowerCase().includes(q) ||
      (l.notas || '').toLowerCase().includes(q)
    );
  }, [liquidaciones, search]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6 space-y-6">
      <Helmet>
        <title>Reporte Ejecutivo de Liquidaciones | Cervezas Finas</title>
      </Helmet>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-900 border border-gray-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Reporte de Liquidaciones y Descuentos</h1>
            <p className="text-xs text-gray-400">Consolidado diario de ventas, arqueos, descuentos otorgados y faltantes de envase</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-950 border border-gray-700 px-3 py-1.5 rounded-xl text-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
            />
          </div>
          <Button onClick={loadData} variant="outline" size="sm" className="border-gray-700 text-gray-300 gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Ventas del Día */}
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Ventas Totales</p>
              <h3 className="text-2xl font-black text-white mt-1">${metrics.totalSales.toFixed(2)}</h3>
              <p className="text-xs text-green-400 mt-1">
                {metrics.deliveredCount} entregadas · <span className="text-amber-400">{metrics.rejectedCount} rechazadas</span>
              </p>
            </div>
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400">
              <DollarSign className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Descuentos Otorgados */}
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Descuentos Otorgados</p>
              <h3 className="text-2xl font-black text-amber-400 mt-1">${metrics.totalDiscounts.toFixed(2)}</h3>
              <p className="text-xs text-gray-400 mt-1">
                GEC: ${metrics.totalGecDiscount.toFixed(2)} · Promo: ${metrics.totalPromoDiscount.toFixed(2)}
              </p>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Percent className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Efectivo Faltante */}
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Faltante de Efectivo</p>
              <h3 className={`text-2xl font-black mt-1 ${metrics.totalMissingCash > 0 ? 'text-red-400' : 'text-green-400'}`}>
                ${metrics.totalMissingCash.toFixed(2)}
              </h3>
              <p className="text-xs text-gray-400 mt-1">En liquidaciones de rutas hoy</p>
            </div>
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Envases Faltantes */}
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Envases Faltantes</p>
              <h3 className="text-2xl font-black text-amber-300 mt-1">{metrics.totalMissingBottles} envases</h3>
              <p className="text-xs text-gray-400 mt-1">Cobro total: <span className="text-amber-400 font-semibold">${metrics.totalBottleCharges.toFixed(2)}</span></p>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Package className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail Table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-800 py-3">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-400" />
            Liquidaciones de Rutas del Día ({dateFilter})
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por ruta..."
              className="pl-9 h-8 bg-gray-950 border-gray-700 text-white text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs">
                  <th className="px-4 py-3 text-left">Ruta / Fecha</th>
                  <th className="px-4 py-3 text-right">Efectivo Esperado</th>
                  <th className="px-4 py-3 text-right">Efectivo Recibido</th>
                  <th className="px-4 py-3 text-right">Diferencia</th>
                  <th className="px-4 py-3 text-center">Envases Faltantes</th>
                  <th className="px-4 py-3 text-right">Cobro Envases</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-500">Cargando reporte...</td></tr>
                ) : filteredLiquidaciones.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-500">No hay liquidaciones registradas en esta fecha.</td></tr>
                ) : filteredLiquidaciones.map((l) => {
                  const diff = Number(l.diferencia_efectivo || 0);
                  const isOk = diff >= 0 && Number(l.envases_faltantes || 0) === 0;
                  return (
                    <tr key={l.id} className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{l.delivery_route || 'Sin Ruta'}</div>
                        <div className="text-xs text-gray-500">{new Date(l.created_at).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">
                        ${Number(l.efectivo_esperado || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-green-400 font-semibold">
                        ${Number(l.efectivo_recibido || 0).toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${diff < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {diff < 0 ? `-$${Math.abs(diff).toFixed(2)}` : `+$${diff.toFixed(2)}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {Number(l.envases_faltantes || 0) > 0 ? (
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                            ⚠️ {l.envases_faltantes} envases
                          </Badge>
                        ) : (
                          <span className="text-gray-500 text-xs">Completo</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-400">
                        ${Number(l.cobro_envases_faltantes || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isOk ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Cuadrada</Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Con Diferencias</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
