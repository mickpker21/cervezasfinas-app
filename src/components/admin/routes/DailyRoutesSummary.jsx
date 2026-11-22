import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BarChart3, RefreshCcw } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { Button } from '@/components/ui/button';

/**
 * DailyRoutesSummary
 * Vista diaria de nuevos clientes y visitas agrupadas por ruta.
 */
export default function DailyRoutesSummary() {
  const todayStr = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(todayStr);
  const [routeFilter, setRouteFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clientsDaily, setClientsDaily] = useState([]); // [{id, internal_route}]
  const [visitsDaily, setVisitsDaily] = useState([]); // [{id, ruta}]

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Rango del día completo en UTC (ajustar si se requiere zona horaria local)
      const start = `${date}T00:00:00Z`;
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate()+1);
      const end = `${endDate.toISOString().slice(0,10)}T00:00:00Z`;

      const [visitsResp] = await Promise.all([
        supabase.from('visitas').select('id, ruta, fecha').eq('fecha', date)
      ]);

      const { fetchClientsApi } = await import('@/lib/mysqlClients');
      const clientsResp = await fetchClientsApi({ created_after: start, limit: 5000 });
      const clientsData = (clientsResp.rows || []).filter(c => c.created_at < end);

      if (visitsResp.error) throw visitsResp.error;

      setClientsDaily(clientsData);
      setVisitsDaily(visitsResp.data || []);
    } catch (e) {
      setError(e.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const allRoutes = useMemo(() => {
  const clientRoutes = clientsDaily.map(c => c.internal_route).filter(Boolean);
    const visitRoutes = visitsDaily.map(v => v.ruta).filter(Boolean);
    return Array.from(new Set([...clientRoutes, ...visitRoutes])).sort((a,b) => (a||'').localeCompare(b||''));
  }, [clientsDaily, visitsDaily]);

  const summaryRows = useMemo(() => {
    const counts = {};
    for (const c of clientsDaily) {
      const route = c.internal_route || 'Sin ruta';
      if (!counts[route]) counts[route] = { route, newClients: 0, visits: 0 };
      counts[route].newClients += 1;
    }
    for (const v of visitsDaily) {
      const route = v.ruta || 'Sin ruta';
      if (!counts[route]) counts[route] = { route, newClients: 0, visits: 0 };
      counts[route].visits += 1;
    }
    let rows = Object.values(counts);
    if (routeFilter) rows = rows.filter(r => r.route === routeFilter);
    return rows.sort((a,b) => (b.visits + b.newClients) - (a.visits + a.newClients));
  }, [clientsDaily, visitsDaily, routeFilter]);

  const totals = useMemo(() => summaryRows.reduce((acc,r) => {
    acc.newClients += r.newClients; acc.visits += r.visits; return acc; }, { newClients:0, visits:0 }), [summaryRows]);

  return (
    <Card className="heineken-card">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <CardTitle className="text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-green-400" /> Actividad por Ruta (Día)</CardTitle>
          <CardDescription className="text-green-200">Nuevos clientes y visitas por ruta en la fecha seleccionada.</CardDescription>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="flex flex-col">
            <label className="text-xs text-green-300 mb-1">Fecha</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="heineken-input" />
          </div>
            <div className="flex flex-col">
              <label className="text-xs text-green-300 mb-1">Ruta</label>
              <select value={routeFilter} onChange={e => setRouteFilter(e.target.value)} className="heineken-input">
                <option value="">Todas</option>
                {allRoutes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={loadData} disabled={loading} className="heineken-button w-full sm:w-auto">
                <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Actualizando' : 'Refrescar'}
              </Button>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="p-3 mb-4 rounded bg-red-500/20 text-red-200 text-sm">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-white/10">
                <th className="py-2 pr-4 text-white">Ruta</th>
                <th className="py-2 pr-4 text-white">Nuevos Clientes</th>
                <th className="py-2 pr-4 text-white">Visitas</th>
                <th className="py-2 pr-4 text-white">Total Actividad</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-6 text-center text-green-200">Cargando...</td></tr>
              ) : summaryRows.length ? (
                summaryRows.map(row => (
                  <tr key={row.route} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-4 font-medium text-white">{row.route}</td>
                    <td className="py-2 pr-4 text-green-200">{row.newClients}</td>
                    <td className="py-2 pr-4 text-green-200">{row.visits}</td>
                    <td className="py-2 pr-4 text-white font-semibold">{row.newClients + row.visits}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="py-6 text-center text-green-200">Sin datos para los filtros seleccionados.</td></tr>
              )}
            </tbody>
            {!loading && summaryRows.length > 0 && (
              <tfoot>
                <tr className="font-semibold bg-white/10">
                  <td className="py-2 pr-4 text-white">Totales</td>
                  <td className="py-2 pr-4 text-green-100">{totals.newClients}</td>
                  <td className="py-2 pr-4 text-green-100">{totals.visits}</td>
                  <td className="py-2 pr-4 text-white">{totals.newClients + totals.visits}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
