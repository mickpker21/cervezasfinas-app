import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '../supabaseClient';
import { fetchAllClientsOnline } from '@/repositories/clientsRepository';

export default function AdminConquestReports() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ visits: 0, newClients: 0, modifiedClients: 0, sales: 0 });
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rangeError, setRangeError] = useState('');

  // Assumptions:
  // - 'internal_route' on clients maps the client to a conquista route.
  // - visitas.ruta contains the route string.
  // - client_sales.period_date is YYYY-MM-DD and amount is numeric.
  // If your schema differs, I can adapt the queries.

  const validateRange = (s, e) => {
    if (!s || !e) return false;
    const sd = new Date(s);
    const ed = new Date(e);
    if (sd > ed) {
      setRangeError('La fecha de inicio debe ser anterior o igual a la fecha final');
      return false;
    }
    setRangeError('');
    return true;
  };

  const fetchReports = async (startStr = null, endStr = null) => {
    setLoading(true);
    try {
      const now = new Date();
      const defaultMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const periodStartStr = startStr || startDate || defaultMonthStart;
      const periodEndStr = endStr || endDate || now.toISOString().slice(0, 10);
      const periodStart = new Date(periodStartStr);
      const periodEnd = new Date(periodEndStr);
      // Ensure periodEnd is inclusive of the whole day (23:59:59)
      periodEnd.setHours(23, 59, 59, 999);

      // 1) Fetch clients (MySQL source via repository)
      const allClients = await fetchAllClientsOnline(null, null, true);
      const clients = Array.isArray(allClients) ? allClients : [];

      const updateFieldCandidates = ['updated_at', 'updatedat', 'modified_at', 'updatedAt', 'last_modified', 'last_update'];
      const detectedUpdateField = updateFieldCandidates.find(f => clients.some(c => Object.prototype.hasOwnProperty.call(c, f)));

      // 1.1) Fetch routes with designated users from profiles
      const { data: profiles } = await supabase.from('profiles').select('name, route').not('route', 'is', null);
      const userByRouteMap = {};
      if (profiles) {
        profiles.forEach(p => {
          if (p.route) {
            const cleanRoute = String(p.route).trim().toUpperCase();
            userByRouteMap[cleanRoute] = p.name;
          }
        });
      }

      const clientsById = {};
      const routesSet = new Set();
      const internalRoutesSet = new Set(); // To track which are conquest routes
      const routeNamesMap = {}; // Map code -> resolved name

      clients.forEach(c => {
        clientsById[c.id] = c;
        if (c.internal_route) {
          const cleanInternal = String(c.internal_route).trim().toUpperCase();
          routesSet.add(cleanInternal);
          internalRoutesSet.add(cleanInternal);
        }
      });

      // 2) Clients created/modified in period
      const createdInRange = clients.filter(c => {
        if (!c || !c.created_at) return false;
        const created = new Date(c.created_at);
        return created >= periodStart && created <= periodEnd;
      });
      const modifiedInRange = clients.filter(c => {
        if (!detectedUpdateField) return false;
        const updatedRaw = c[detectedUpdateField];
        if (!updatedRaw) return false;
        const updated = new Date(updatedRaw);
        const created = c.created_at ? new Date(c.created_at) : null;
        if (updated < periodStart || updated > periodEnd) return false;
        if (!created) return true;
        return updated.getTime() !== created.getTime();
      });

      // Normalize client codes to stripped strings to avoid mismatch (e.g. '00123' vs '123')
      const normalizeCode = (val) => String(val || "").replace(/^0+/, "").trim();

      const affectedClientCodes = new Set([
        ...createdInRange.map(c => normalizeCode(c.client_code || c.cve_cliente)),
        ...modifiedInRange.map(c => normalizeCode(c.client_code || c.cve_cliente))
      ]);

      // 3) Fetch visits in period (Supabase)
      const { data: visitas } = await supabase
        .from('visitas')
        .select('id, ruta, fecha')
        .gte('fecha', periodStartStr)
        .lte('fecha', periodEndStr);
      const visitsArr = Array.isArray(visitas) ? visitas : [];
      visitsArr.forEach(v => { if (v.ruta) routesSet.add(v.ruta); });

      // 4) Fetch Sales from MySQL (ventas_por_sku)
      // We use HTLs (Hectoliters) as requested
      const API_BASE = "/api";
      const salesUrl = `${API_BASE}/ventas-por-sku-read.php?from=${periodStartStr}&to=${periodEndStr}&aggregate=true`;

      const salesRes = await fetch(salesUrl);
      const salesJson = await salesRes.json();
      const salesRows = Array.isArray(salesJson.rows) ? salesJson.rows : [];

      const salesByRoute = {};

      salesRows.forEach(s => {
        const routeCode = s.ruta;
        const routeName = s.ruta_resuelta || routeCode;
        const clientCodeFromSale = normalizeCode(s.cve_cliente || s.client_id);
        const htlVal = Number(s.htls || s.htls_total || 0);

        // Save route name mapping
        if (routeCode) {
          routesSet.add(routeCode);
          routeNamesMap[routeCode] = routeName;
        }

        // Match normalized codes
        if (affectedClientCodes.has(clientCodeFromSale)) {
          salesByRoute[routeCode] = (salesByRoute[routeCode] || 0) + htlVal;
        }
      });

      // Aggregate per route
      const routes = Array.from(routesSet).sort();
      const reportRows = routes.map(routeCode => {
        const cleanCode = String(routeCode).trim().toUpperCase();
        const visits = visitsArr.filter(v => String(v.ruta || "").trim().toUpperCase() === cleanCode).length;
        const newClients = createdInRange.filter(c => String(c.internal_route || "").trim().toUpperCase() === cleanCode).length;
        const modifiedClients = modifiedInRange.filter(c => String(c.internal_route || "").trim().toUpperCase() === cleanCode).length;
        const sales = salesByRoute[routeCode] || 0;
        
        let routeName = routeNamesMap[routeCode] || routeCode;
        
        // If it's NOT a designated internal route from clients, and we have a user name, prepend it
        if (!internalRoutesSet.has(cleanCode)) {
          const userName = userByRouteMap[cleanCode];
          if (userName) {
            routeName = `${userName} (${routeName})`;
          } else {
            routeName = `Ventas: ${routeName}`;
          }
        }

        return {
          route: routeName,
          routeCode,
          visits,
          newClients,
          modifiedClients,
          sales
        };
      });

      // Totals
      const totalsCalc = reportRows.reduce((acc, r) => {
        acc.visits += r.visits;
        acc.newClients += r.newClients;
        acc.modifiedClients += r.modifiedClients;
        acc.sales += r.sales;
        return acc;
      }, { visits: 0, newClients: 0, modifiedClients: 0, sales: 0 });

      setRows(reportRows);
      setTotals(totalsCalc);
    } catch (e) {
      console.error('Failed to load conquest reports', e);
      setRows([]);
      setTotals({ visits: 0, newClients: 0, modifiedClients: 0, sales: 0 });
    }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

const exportCSV = () => {
  if (!validateRange(startDate, endDate)) return;
  const header = ['Ruta', 'Visitas', 'Clientes nuevos', 'Clientes modificados', 'Venta'];
  // Mejorar encabezados en español para claridad
  const headerEs = ['Ruta', 'Visitas (mes)', 'Clientes dados de alta', 'Clientes modificados', 'Venta (HL)'];
  const lines = [header.join(',')];
  rows.forEach(r => {
    const line = [
      `"${r.route}"`,
      r.visits,
      r.newClients,
      r.modifiedClients,
      r.sales.toFixed(3),
    ].join(',');
    lines.push(line);
  });
  const totalsLine = [
    'TOTAL', totals.visits, totals.newClients, totals.modifiedClients, totals.sales.toFixed(3)
  ].join(',');
  lines.push(totalsLine);
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conquest_reports_${startDate}_to_${endDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

return (
  <div className="p-6">
    <Helmet>
      <title>Reportes Conquista - Admin</title>
    </Helmet>
    <div className="max-w-6xl mx-auto">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Reportes por Conquista - Mes actual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">Rango:</div>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border px-2 py-1 rounded text-sm" />
              <span className="text-sm">→</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border px-2 py-1 rounded text-sm" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { if (validateRange(startDate, endDate)) fetchReports(startDate, endDate); }} disabled={loading || !!rangeError}>{loading ? 'Actualizando...' : 'Actualizar'}</Button>
              <Button size="sm" variant="outline" onClick={exportCSV} disabled={rows.length === 0 || !!rangeError}>Exportar CSV</Button>
            </div>
          </div>
          {rangeError && <div className="text-sm text-red-400 mb-2">{rangeError}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1">Ruta</th>
                  <th className="text-right px-2 py-1">Visitas (mes)</th>
                  <th className="text-right px-2 py-1">Clientes nuevos</th>
                  <th className="text-right px-2 py-1">Clientes modificados</th>
                  <th className="text-right px-2 py-1">Venta (clientes mod/alta)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.route} className="odd:bg-muted">
                    <td className="px-2 py-1">{r.route}</td>
                    <td className="px-2 py-1 text-right">{r.visits}</td>
                    <td className="px-2 py-1 text-right">{r.newClients}</td>
                    <td className="px-2 py-1 text-right">{r.modifiedClients}</td>
                    <td className="px-2 py-1 text-right">{r.sales.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="px-2 py-2 font-bold">TOTAL</td>
                  <td className="px-2 py-2 text-right font-bold">{totals.visits}</td>
                  <td className="px-2 py-2 text-right font-bold">{totals.newClients}</td>
                  <td className="px-2 py-2 text-right font-bold">{totals.modifiedClients}</td>
                  <td className="px-2 py-2 text-right font-bold">{totals.sales.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);
}
