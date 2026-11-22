import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/supabaseClient';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table-component';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Helmet } from 'react-helmet-async';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getClientsByCodes, getClientsByIds } from '@/repositories/clientsRepository';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Phone, PhoneCall, PhoneMissed, ShoppingCart, TrendingUp, Users } from 'lucide-react';

// Devuelve todas las fechas (YYYY-MM-DD) de un mes YYYY-MM
const getDatesForMonth = (ym) => {
  if (!ym) return [];
  const [year, month] = ym.split('-').map((v) => Number(v));
  if (!year || !month) return [];
  const dates = [];
  const d = new Date(year, month - 1, 1);
  while (d.getFullYear() === year && d.getMonth() === month - 1) {
    const iso = d.toISOString().slice(0, 10);
    dates.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return dates;
};

const getCurrentMonthISO = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const fetchAllCalls = async (buildQueryFn) => {
  let allRows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const q = buildQueryFn().range(offset, offset + limit - 1);
    const { data, error } = await q;
    if (error) {
      console.warn('[GerenteCalls] error fetching calls chunk:', error);
      break;
    }
    if (!data || !data.length) break;
    allRows = allRows.concat(data);
    if (data.length < limit) break;
    offset += limit;
  }
  return allRows;
};

const GerenteCallsPage = () => {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthISO); // filtro por defecto: mes actual

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState([]);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [selectedUserName, setSelectedUserName] = useState('');

  // Calcular estadísticas globales
  const globalStats = useMemo(() => {
    const totals = stats.reduce(
      (acc, stat) => ({
        totalCalls: acc.totalCalls + (stat.total_calls || 0),
        answeredCalls: acc.answeredCalls + (stat.answered_calls || 0),
        unansweredCalls: acc.unansweredCalls + (stat.unanswered_calls || 0),
        totalBoxes: acc.totalBoxes + (stat.ventas_totales_cajas || 0),
      }),
      { totalCalls: 0, answeredCalls: 0, unansweredCalls: 0, totalBoxes: 0 }
    );

    const answerRate = totals.totalCalls > 0
      ? (totals.answeredCalls / totals.totalCalls) * 100
      : 0;

    const avgBoxesPerCall = totals.answeredCalls > 0
      ? totals.totalBoxes / totals.answeredCalls
      : 0;

    return {
      ...totals,
      answerRate,
      avgBoxesPerCall,
    };
  }, [stats]);

  // Cargar usuarios (de profiles y telesales_calls)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data: profiles } = await supabase.from('profiles').select('id, name, email');
        if (profiles && profiles.length > 0) {
          setUsers(profiles.map(p => ({ user_id: p.id, user_name: p.name || p.email || p.id })));
        } else {
          const { data: rpcUsers } = await supabase.rpc('get_all_users');
          setUsers(rpcUsers || []);
        }
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };
    fetchUsers();
  }, []);

  // Cargar estadísticas de rendimiento directamente de telesales_calls (sin limite de 1000)
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      try {
        const buildQuery = () => {
          let query = supabase.from('telesales_calls').select('*');
          if (selectedDate) {
            const startISO = `${selectedDate}T00:00:00.000Z`;
            const endISO = `${selectedDate}T23:59:59.999Z`;
            query = query.gte('call_time', startISO).lte('call_time', endISO);
          } else if (selectedMonth) {
            const [y, m] = selectedMonth.split('-').map(Number);
            const startISO = new Date(Date.UTC(y, m - 1, 1)).toISOString();
            const endISO = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
            query = query.gte('call_time', startISO).lte('call_time', endISO);
          }
          return query;
        };

        const rawCalls = await fetchAllCalls(buildQuery);

        // Fetch local calls fallback
        let localCalls = [];
        try {
          const raw = localStorage.getItem('televenta_saved_calls');
          if (raw) localCalls = JSON.parse(raw);
        } catch (e) {}

        // Combine DB calls and local calls
        const combinedMap = new Map();
        [...(rawCalls || []), ...localCalls].forEach(call => {
          const key = call.id || `${call.client_id}_${call.call_time}`;
          if (!combinedMap.has(key)) combinedMap.set(key, call);
        });
        const allCallsCombined = Array.from(combinedMap.values());

        // Fetch profiles mapping
        const { data: profiles } = await supabase.from('profiles').select('id, name, email');
        const profileNameMap = new Map();
        (profiles || []).forEach(p => profileNameMap.set(p.id, p.name || p.email));

        const byUser = new Map();

        allCallsCombined.forEach((call) => {
          const uId = call.user_id || 'unassigned';
          const userName = profileNameMap.get(uId) || call.user_name || uId;

          const prev = byUser.get(uId) || {
            user_id: uId,
            user_name: userName,
            total_calls: 0,
            answered_calls: 0,
            unanswered_calls: 0,
            ventas_totales_cajas: 0,
          };

          prev.total_calls += 1;
          if (call.answered) {
            prev.answered_calls += 1;
          } else {
            prev.unanswered_calls += 1;
          }
          prev.ventas_totales_cajas += Number(call.boxes_sold || 0);

          byUser.set(uId, prev);
        });

        const aggregated = Array.from(byUser.values()).map((row) => ({
          ...row,
          promedio_compra_cajas: row.answered_calls > 0 ? row.ventas_totales_cajas / row.answered_calls : 0,
        }));

        let filteredData = aggregated;
        if (selectedUser) {
          filteredData = aggregated.filter(
            (stat) => stat.user_id === selectedUser,
          );
        }
        setStats(filteredData);
      } catch (err) {
        console.error('Error fetching stats from telesales_calls:', err);
        try {
          const { data } = await supabase.rpc('get_all_users');
          setStats(data || []);
        } catch (rpcErr) {
          setError('No se pudieron cargar las estadísticas. ' + (err.message || ''));
          setStats([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedUser, selectedDate, selectedMonth]);

  const handleRowClick = async (userId, userName) => {
    setSelectedUserName(userName);
    setDialogLoading(true);
    setIsDialogOpen(true);

    try {
      const buildUserQuery = () => {
        let query = supabase.from('telesales_calls').select('*').eq('user_id', userId);
        if (selectedDate) {
          const startISO = `${selectedDate}T00:00:00.000Z`;
          const endISO = `${selectedDate}T23:59:59.999Z`;
          query = query.gte('call_time', startISO).lte('call_time', endISO);
        } else if (selectedMonth) {
          const [y, m] = selectedMonth.split('-').map(Number);
          const startISO = new Date(Date.UTC(y, m - 1, 1)).toISOString();
          const endISO = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
          query = query.gte('call_time', startISO).lte('call_time', endISO);
        }
        return query;
      };

      const dbCalls = await fetchAllCalls(buildUserQuery);

      let localCalls = [];
      try {
        const raw = localStorage.getItem('televenta_saved_calls');
        if (raw) localCalls = JSON.parse(raw);
      } catch (e) {}

      const userLocalCalls = localCalls.filter(c => c.user_id === userId);

      const mergedMap = new Map();
      [...dbCalls, ...userLocalCalls].forEach(c => {
        const key = c.id || `${c.client_id}_${c.call_time}`;
        mergedMap.set(key, c);
      });

      let allCalls = Array.from(mergedMap.values());

      if (error || !allCalls.length) {
        // Fallback to RPC if direct table returns empty or error
        const { data: rpcCalls } = await supabase.rpc('get_user_calls', {
          p_user_id: userId,
          p_filter_date: selectedDate || null,
        });
        if (rpcCalls && rpcCalls.length) allCalls = rpcCalls;
      }

      allCalls.sort(
        (a, b) =>
          new Date(a.call_time).getTime() - new Date(b.call_time).getTime(),
      );

      // --- ENRICHMENT START ---
      const uniqueCodes = [...new Set(allCalls.map(c => c.client_code || c.client_name).filter(Boolean))];
      const uniqueIds = [...new Set(allCalls.map(c => c.client_id).filter(Boolean))];
      
      console.log(`[GerenteCalls] Enriching ${allCalls.length} calls. Unique codes: ${uniqueCodes.length}, IDs: ${uniqueIds.length}`);

      if (uniqueCodes.length > 0 || uniqueIds.length > 0) {
        try {
          const [clientsByCode, clientsById] = await Promise.all([
            uniqueCodes.length > 0 ? getClientsByCodes(uniqueCodes) : Promise.resolve([]),
            uniqueIds.length > 0 ? getClientsByIds(uniqueIds) : Promise.resolve([])
          ]);
          
          console.log(`[GerenteCalls] Resolved ${clientsByCode.length} by code, ${clientsById.length} by ID`);

          const nameMap = new Map();
          const setter = (c) => {
            if (c.client_code) nameMap.set(String(c.client_code).trim(), c.business_name || c.name);
            if (c.id) nameMap.set(String(c.id).trim(), c.business_name || c.name);
          };
          clientsByCode.forEach(setter);
          clientsById.forEach(setter);
          
          allCalls = allCalls.map(call => {
            const rawValue = call.client_code || call.client_name || '';
            const code = String(rawValue).trim();
            const id = String(call.client_id || '').trim();
            const resolvedName = nameMap.get(id) || nameMap.get(code);
            
            return {
              ...call,
              client_code: code,
              client_name: resolvedName || code
            };
          });
        } catch (enrichErr) {
          console.error('[GerenteCalls] Error enriching call names:', enrichErr);
        }
      }
      // --- ENRICHMENT END ---

      setDialogContent(allCalls);
    } catch (err) {
      console.error('Error fetching user calls:', err);
      setDialogContent([]);
    }

    setDialogLoading(false);
  };

  const clearFilters = () => {
    setSelectedUser(null);
    setSelectedDate(null);
    setSelectedMonth('');
  };

  const downloadCSV = () => {
    if (stats.length === 0) return;

    const headers = [
      'Usuario',
      'Llamadas Realizadas',
      'Contestadas',
      'No Contestadas',
      'Efectividad (%)',
      'Ventas Totales (Cajas)',
      'Promedio de Compra',
    ];

    const rows = stats.map((stat) => {
      const effectiveness = stat.total_calls > 0
        ? (stat.answered_calls / stat.total_calls) * 100
        : 0;
      return [
        `"${stat.user_name || 'Desconocido'}"`,
        stat.total_calls,
        stat.answered_calls,
        stat.unanswered_calls,
        effectiveness.toFixed(1),
        stat.ventas_totales_cajas || 0,
        (stat.promedio_compra_cajas || 0).toFixed(2),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const fileName = `Reporte_Llamadas_${selectedDate || selectedMonth || 'General'}.csv`;
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadDetailCSV = () => {
    if (dialogContent.length === 0) return;

    const headers = [
      'Código Cliente',
      'Nombre Cliente',
      'Fecha y Hora',
      'Contestó',
      'Cajas Vendidas',
    ];

    const rows = dialogContent.map((call) => {
      const isResolved = call.client_name && call.client_name !== String(call.client_code);
      const name = isResolved ? call.client_name : 'Sin Nombre';
      
      return [
        `"${call.client_code || '—'}"`,
        `"${name}"`,
        `"${new Date(call.call_time).toLocaleString('es-MX')}"`,
        call.answered ? 'Sí' : 'No',
        call.boxes_sold || 0,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const safeName = (selectedUserName || 'Usuario').replace(/[^a-z0-9]/gi, '_');
    const fileName = `Detalle_Llamadas_${safeName}_${selectedDate || selectedMonth || 'General'}.csv`;
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getEffectivenessColor = (rate) => {
    if (rate >= 70) return 'text-green-600 bg-green-50 border-green-200';
    if (rate >= 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <Helmet>
        <title>Reporte de Llamadas - Gerencia</title>
      </Helmet>

      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            📞 Reporte de Llamadas
          </h1>
          <p className="text-slate-400">Monitorea el rendimiento de telemarketing en tiempo real</p>
        </div>
        <Button 
          onClick={downloadCSV} 
          disabled={stats.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 w-fit shadow-lg shadow-emerald-900/20"
        >
          <Download className="h-4 w-4" />
          Descargar Reporte (CSV)
        </Button>
      </div>

      {/* Tarjetas de Resumen Global */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium mb-1">Total Llamadas</p>
                <p className="text-3xl font-bold">{globalStats.totalCalls.toLocaleString()}</p>
              </div>
              <Phone className="h-12 w-12 text-blue-200 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium mb-1">Contestadas</p>
                <p className="text-3xl font-bold">{globalStats.answeredCalls.toLocaleString()}</p>
                <p className="text-emerald-100 text-xs mt-1">
                  {globalStats.answerRate.toFixed(1)}% efectividad
                </p>
              </div>
              <PhoneCall className="h-12 w-12 text-emerald-200 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium mb-1">No Contestadas</p>
                <p className="text-3xl font-bold">{globalStats.unansweredCalls.toLocaleString()}</p>
              </div>
              <PhoneMissed className="h-12 w-12 text-orange-200 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 border-0 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium mb-1">Cajas Vendidas</p>
                <p className="text-3xl font-bold">{globalStats.totalBoxes.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                <p className="text-purple-100 text-xs mt-1">
                  {globalStats.avgBoxesPerCall.toFixed(1)} promedio/llamada
                </p>
              </div>
              <ShoppingCart className="h-12 w-12 text-purple-200 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6 bg-slate-800/50 border-slate-700 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Filtros de Búsqueda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between space-y-4 md:space-y-0 gap-4">
            <div className="flex flex-col md:flex-row md:items-end space-y-4 md:space-y-0 md:space-x-4 flex-1">
              <div className="flex-1">
                <label
                  htmlFor="month-filter"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Mes
                </label>
                <Input
                  id="month-filter"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    if (e.target.value) setSelectedDate(null);
                  }}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="date-filter"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Fecha
                </label>
                <Input
                  id="date-filter"
                  type="date"
                  value={selectedDate || ''}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setSelectedDate(v);
                    if (v) setSelectedMonth('');
                  }}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="user-filter"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Usuario
                </label>
                <Select
                  onValueChange={setSelectedUser}
                  value={selectedUser || ''}
                >
                  <SelectTrigger id="user-filter" className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Todos los usuarios" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.user_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={clearFilters} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
              Limpiar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Rendimiento */}
      <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5" />
            Rendimiento por Usuario
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {error && (
            <p className="text-red-400 text-center py-8">{error}</p>
          )}
          {!loading && !error && stats.length === 0 && (
            <p className="text-slate-400 text-center py-8">No hay datos para mostrar con los filtros seleccionados.</p>
          )}
          {!loading && !error && stats.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Usuario</TableHead>
                    <TableHead className="text-right text-slate-300">Llamadas Realizadas</TableHead>
                    <TableHead className="text-right text-slate-300">Contestadas</TableHead>
                    <TableHead className="text-right text-slate-300">No Contestadas</TableHead>
                    <TableHead className="text-right text-slate-300">Efectividad</TableHead>
                    <TableHead className="text-right text-slate-300">Ventas Totales (Cajas)</TableHead>
                    <TableHead className="text-right text-slate-300">Promedio de Compra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((stat) => {
                    const effectiveness = stat.total_calls > 0
                      ? (stat.answered_calls / stat.total_calls) * 100
                      : 0;

                    return (
                      <TableRow
                        key={stat.user_id}
                        onClick={() => handleRowClick(stat.user_id, stat.user_name)}
                        className="cursor-pointer border-slate-700 hover:bg-slate-700/50 transition-colors"
                      >
                        <TableCell className="font-medium text-white">
                          {stat.user_name || 'Usuario desconocido'}
                        </TableCell>
                        <TableCell className="text-right text-slate-300">
                          {stat.total_calls}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-emerald-400 font-semibold">
                            {stat.answered_calls}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-orange-400 font-semibold">
                            {stat.unanswered_calls}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getEffectivenessColor(effectiveness)}`}>
                            {effectiveness.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-purple-400 font-semibold">
                            {(stat.ventas_totales_cajas || 0).toFixed(0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-slate-300">
                          {(stat.promedio_compra_cajas || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalles */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-full max-w-5xl bg-slate-800 border-slate-700 text-white">
          <DialogHeader className="flex flex-row items-center justify-between pr-8">
            <div className="flex-1">
              <DialogTitle className="text-xl">
                📋 Registro de Llamadas para {selectedUserName}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Detalles de las llamadas realizadas por el usuario seleccionado, incluyendo cliente, hora y resultado.
              </DialogDescription>
            </div>
            <Button 
              onClick={downloadDetailCSV} 
              disabled={dialogContent.length === 0}
              variant="outline"
              size="sm"
              className="bg-slate-700 border-slate-600 hover:bg-slate-600 text-white flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Descargar Detalles (CSV)
            </Button>
          </DialogHeader>
          {dialogLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300 w-[100px]">Código</TableHead>
                    <TableHead className="text-slate-300">Cliente</TableHead>
                    <TableHead className="text-slate-300">Fecha y Hora</TableHead>
                    <TableHead className="text-center text-slate-300">Contestó</TableHead>
                    <TableHead className="text-right text-slate-300">Cajas Vendidas</TableHead>
                    <TableHead className="text-slate-300 text-center">Grabación Audio (Hostinger)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dialogContent.length > 0 ? (
                    dialogContent.map((call, index) => {
                      // Separate code and name if they were concatenated
                      const isResolved = call.client_name && call.client_name !== String(call.client_code);
                      const durationStr = call.duration_seconds 
                        ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                        : null;
                      return (
                        <TableRow key={index} className="border-slate-700 hover:bg-slate-700/30">
                          <TableCell className="font-mono text-xs text-slate-400">
                            {call.client_code || '—'}
                          </TableCell>
                          <TableCell className="text-slate-200 font-medium">
                            {isResolved ? (call.client_name.split(' (')[0]) : 'Sin Nombre'}
                            {call.verified_by_apk && (
                              <span className="block text-[10px] font-bold text-emerald-400 mt-0.5">
                                📱 Verificado por APK
                              </span>
                            )}
                          </TableCell>
                        <TableCell className="text-slate-300 text-xs">
                          {new Date(call.call_time).toLocaleString('es-MX')}
                          {durationStr && (
                            <span className="block text-[10px] text-slate-400">
                              Duración: {durationStr}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {call.answered ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              ✓ Sí
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                              ✗ No
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-purple-400 font-semibold">
                            {call.boxes_sold || 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {call.audio_url ? (
                            <div className="flex flex-col items-center gap-1">
                              <audio controls src={call.audio_url} className="h-8 w-44 rounded" />
                              <a 
                                href={call.audio_url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-[10px] text-emerald-400 hover:underline"
                              >
                                Descargar MP3/M4A
                              </a>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Sin audio</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                  ) : (
                    <TableRow className="border-slate-700">
                      <TableCell colSpan="6" className="text-center text-slate-400 py-8">
                        No hay registros para mostrar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GerenteCallsPage;
