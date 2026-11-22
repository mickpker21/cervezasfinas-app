// src/pages/PreventaPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Eye, Calendar as CalendarIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getTodayMexico } from '@/lib/dateUtils';
import { format } from 'date-fns';

const PreventaPage = () => {
  const { toast } = useToast();
  const { user, isAdmin } = useSupabaseAuth();
  const navigate = useNavigate();

  const [preventas, setPreventas] = useState([]);
  const [loading, setLoading] = useState(true);
  const routeColumn = 'sales_route'; // Columna de ruta fijada

  // Filtros
  const [allRoutes, setAllRoutes] = useState([]);
  const [allSalespeople, setAllSalespeople] = useState([]); // Lista para el filtro de Admin
  const [selectedRoute, setSelectedRoute] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSalesperson, setSelectedSalesperson] = useState('');

  const userAllowedRoutes = useMemo(() => {
    const routes = user?.user_metadata?.route || [];
    const arr = Array.isArray(routes) ? routes : [routes];
    return arr.filter(Boolean).map(String);
  }, [user]);

  // Effect to fetch static filter data (for admins)
  useEffect(() => {
    const fetchAdminFilterData = async () => {
      if (isAdmin) {
        // Fetch salespeople for admin filter
        const { data: salespeopleData, error: salespeopleError } = await supabase.from('profiles').select('id, name').order('name', { ascending: true });
        if (salespeopleError) {
          console.error('Error fetching salespeople for filter:', salespeopleError);
        } else {
          setAllSalespeople(salespeopleData || []);
        }

        // Fetch all possible routes for admin filter
        try {
          const { getAvailableRoutes } = await import('@/repositories/routeRepository');
          const available = await getAvailableRoutes();
          
          let distinctRoutes = [];
          if (routeColumn === 'sales_route') {
            distinctRoutes = available.sales || [];
          } else if (routeColumn === 'internal_route') {
            distinctRoutes = available.internal || [];
          } else {
            // Default combine both if unknown column
            distinctRoutes = [...(available.sales || []), ...(available.internal || [])];
          }
          
          setAllRoutes([...new Set(distinctRoutes.map(String).filter(Boolean))].sort());
        } catch (error) {
          console.error('Error fetching routes:', error);
          setAllRoutes([]);
        }
      }
    };
    fetchAdminFilterData();
  }, [isAdmin, routeColumn]);

  // Main data fetching effect
  useEffect(() => {
    const fetchPreventasAndRelatedData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Preventa Data (Supabase) - NO JOIN with clients
        let query = supabase.from('preventa').select(`id, created_at, user_id, total_amount, client_id, status`).order('created_at', { ascending: false });

        if (selectedSalesperson) query = query.eq('user_id', selectedSalesperson);

        if (selectedDate) {
          const dayStart = format(selectedDate, 'yyyy-MM-dd 00:00:00');
          const dayEnd = format(selectedDate, 'yyyy-MM-dd 23:59:59');
          query = query.gte('created_at', dayStart).lte('created_at', dayEnd);
        }

        const { data: preventaData, error: preventaError } = await query;
        if (preventaError) throw preventaError;
        if (!preventaData) {
          setPreventas([]);
          setLoading(false);
          return;
        }

        // 2. Fetch only referenced clients through the same MySQL/local
        // repository used by PreventaDetailPage. This preserves its field
        // normalization and local-cache fallback when clients-read.php fails.
        const clientIds = [...new Set(preventaData.map(p => p.client_id).filter(Boolean))];
        let clientRows = [];
        if (clientIds.length > 0) {
          const { getClientsByIds } = await import('@/repositories/clientsRepository');
          clientRows = await getClientsByIds(clientIds);
        }
        const clientsMap = new Map(clientRows.map(c => [c.id, c]));

        // 3. Join in Memory
        let joinedData = preventaData.map(p => {
          const client = clientsMap.get(p.client_id) || {};
          // If client not found locally (e.g. fresh install without full sync), we show unknown or ID
          return {
            ...p,
            clients: {
              name: client.name || client.business_name || client.nom_negocio || 'Desconocido',
              client_code: client.client_code || '---',
              [routeColumn]: client.sales_route || client.internal_route || ''
            }
          };
        });

        // 4. Apply Filters (Client-side)

        // Filter by User Route (Metadata)
        if (!isAdmin && userAllowedRoutes.length > 0) {
          joinedData = joinedData.filter(p =>
            userAllowedRoutes.includes(String(p.clients[routeColumn])) || p.user_id === user?.id
          );
        }

        // Filter by Search Term
        if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          joinedData = joinedData.filter(p =>
            (p.clients.name || '').toLowerCase().includes(lowerTerm) ||
            (p.clients.client_code || '').toLowerCase().includes(lowerTerm)
          );
        }

        // Filter by Selected Route (UI)
        if (selectedRoute) {
          joinedData = joinedData.filter(p => String(p.clients[routeColumn]) === String(selectedRoute));
        }

        // Each row is a real order. Do not collapse distinct orders created
        // by the same seller for the same client within one second.
        const cleaned = joinedData;

        // For non-admins, dynamically generate route filter from the visible data
        if (!isAdmin) {
          const dynamicRoutes = [...new Set(cleaned.map(p => p.clients?.[routeColumn]).filter(Boolean))].map(String).sort();
          setAllRoutes(dynamicRoutes);
        }

        // Fetch User Names (Vendedores)
        const userIds = [...new Set(cleaned.map(p => p.user_id).filter(Boolean))];
        let userMap = {};
        if (userIds.length > 0) {
          const { data: usersData, error: usersError } = await supabase.from('profiles').select('id, name').in('id', userIds);
          if (usersError) {
            console.error('Error fetching users:', usersError);
          } else {
            userMap = (usersData || []).reduce((acc, u) => (acc[u.id] = u.name, acc), {});
          }
        }

        const enrichedPreventas = cleaned.map(p => ({
          ...p,
          vendedorName: userMap[p.user_id] || 'N/A',
        }));

        setPreventas(enrichedPreventas);

      } catch (error) {
        console.error('Error fetching data:', error);
        toast({ title: 'Error', description: `No se pudieron cargar las preventas: ${error.message}`, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchPreventasAndRelatedData();
  }, [toast, isAdmin, userAllowedRoutes, selectedRoute, searchTerm, selectedDate, selectedSalesperson, routeColumn]);

  const handleExportExcel = async () => {
    if (!preventas.length) {
      toast({
        title: 'Sin datos',
        description: 'No hay preventas para exportar con los filtros actuales.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const preventaIds = preventas.map((p) => p.id);
      const { data: items, error: itemsError } = await supabase
        .from('preventa_items')
        .select('preventa_id, cve_marca, quantity, unit_price, total_price')
        .in('preventa_id', preventaIds);

      if (itemsError) {
        console.error('Error fetching preventa_items for export:', itemsError);
        toast({
          title: 'Error',
          description: 'No se pudieron cargar los productos de las preventas.',
          variant: 'destructive',
        });
        return;
      }

      const skuSet = new Set((items || []).map((it) => it.cve_marca).filter(Boolean));
      let skuDescriptions = {};
      if (skuSet.size > 0) {
        const { data: skuRows, error: skuError } = await supabase
          .from('precios')
          .select('cve_marca, des_marca')
          .in('cve_marca', Array.from(skuSet));
        if (!skuError && Array.isArray(skuRows)) {
          skuDescriptions = skuRows.reduce((acc, row) => {
            acc[row.cve_marca] = row.des_marca || '';
            return acc;
          }, {});
        }
      }

      const preventaMap = preventas.reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});

      const headers = [
        'PreventaID',
        'Fecha',
        'Vendedor',
        'Client_Code',
        'Cliente',
        'Ruta',
        'SKU',
        'Producto',
        'Cantidad',
        'Precio Unitario',
        'Total Línea',
      ];

      const rows = (items || []).map((it) => {
        const parent = preventaMap[it.preventa_id] || {};
        const client = parent.clients || {};
        return [
          it.preventa_id,
          parent.created_at ? new Date(parent.created_at).toLocaleString('es-MX') : '',
          parent.vendedorName || '',
          client.client_code || '',
          client.name || '',
          client[routeColumn] || '',
          it.cve_marca || '',
          skuDescriptions[it.cve_marca] || '',
          Number(it.quantity ?? 0),
          typeof it.unit_price === 'number' ? it.unit_price.toFixed(2) : '',
          typeof it.total_price === 'number' ? it.total_price.toFixed(2) : '',
        ];
      });

      const escapeCsv = (value) => {
        const str = String(value ?? '');
        const escaped = str.replace(/"/g, '""');
        return `"${escaped}"`;
      };

      const csvContent = [headers, ...rows]
        .map((cols) => cols.map(escapeCsv).join(','))
        .join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const datePart = getTodayMexico(); // Mexico timezone
      link.href = url;
      link.download = `preventas_detalle_${datePart}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error inesperado al exportar preventas:', err);
      toast({
        title: 'Error',
        description: 'Ocurrió un problema al exportar las preventas.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Historial de Simulaciones</h1>
      <Card>
        <CardHeader>
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <CardTitle>Preventas Guardadas</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="md:ml-auto"
            >
              Exportar a Excel
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            <Input
              placeholder="Buscar por nombre de cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="lg:col-span-1"
            />
            {isAdmin && (
              <Select
                value={selectedSalesperson}
                onValueChange={(value) => setSelectedSalesperson(value === 'all-salespeople' ? '' : value)}
              >
                <SelectTrigger><SelectValue placeholder="Filtrar por vendedor..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-salespeople">Todos los vendedores</SelectItem>
                  {allSalespeople.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'PPP') : <span>Seleccionar fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                {selectedDate && <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelectedDate(null)}>Limpiar</Button>}
              </PopoverContent>
            </Popover>
            {allRoutes.length > 0 && (
              <Select
                value={selectedRoute}
                onValueChange={(value) => setSelectedRoute(value === 'all-routes' ? '' : value)}
              >
                <SelectTrigger><SelectValue placeholder="Filtrar por ruta..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-routes">Todas las rutas</SelectItem>
                  {allRoutes.map(route => <SelectItem key={route} value={route}>{route}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-center py-8">Cargando historial...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead className="text-right">Monto Total</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preventas.length > 0 ? (
                  preventas.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.created_at).toLocaleString()}</TableCell>
                      <TableCell>{p.vendedorName}</TableCell>
                      <TableCell>{p.clients?.name || 'N/A'}</TableCell>
                      <TableCell>{p.clients?.[routeColumn] || '—'}</TableCell>
                      <TableCell className="text-right">
                        {typeof p.total_amount === 'number' ? `$${p.total_amount.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/preventas/${p.id}`)}>
                          <Eye className="h-4 w-4 mr-2" /> Ver Detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      No se encontraron simulaciones con los filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PreventaPage;
