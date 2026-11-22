import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import EvaluationDetailViewer from '@/components/EvaluationDetailViewer';

const PAGE_SIZE = 50;

export default function SupervisorEvaluationsPage() {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [dateRange, setDateRange] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case 'last7': return { startDate: format(subDays(now, 7), 'yyyy-MM-dd'), endDate: format(now, 'yyyy-MM-dd') };
      case 'last30': return { startDate: format(subDays(now, 30), 'yyyy-MM-dd'), endDate: format(now, 'yyyy-MM-dd') };
      case 'thisMonth': return { startDate: format(startOfMonth(now), 'yyyy-MM-dd'), endDate: format(endOfMonth(now), 'yyyy-MM-dd') };
      case 'thisYear': return { startDate: format(startOfYear(now), 'yyyy-MM-dd'), endDate: format(endOfYear(now), 'yyyy-MM-dd') };
      default: return { startDate: null, endDate: null };
    }
  }, [dateRange]);

  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      // evaluaciones_pdv is the real table; all_evaluations_view does not exist
      let query = supabase.from('evaluaciones_pdv').select('*', { count: 'exact' });

      if (startDate) query = query.gte('fecha', startDate);
      if (endDate) query = query.lte('fecha', endDate);

      if (typeFilter !== 'all') {
        query = query.eq('tipo', typeFilter === 'pdv' ? 'PDV' : 'Canal Moderno');
      }
      
      if (debouncedSearchTerm) {
        query = query.or(`punto_venta.ilike.%${debouncedSearchTerm}%,client_code.ilike.%${debouncedSearchTerm}%`);
      }

      const { data, error, count } = await query
        .range(from, to)
        .order('fecha', { ascending: false });

      if (error) throw error;

      const formattedData = (data || []).map(ev => ({
        id: ev.id || ev.composite_id,
        fecha: ev.fecha,
        punto_venta: ev.punto_venta || ev.client_name || '',
        client_code: ev.client_code,
        ruta: ev.client_route || ev.ruta,
        tipo: ev.tipo ?? ev.type,
        puntaje: ev.score ?? ev.puntaje,
        usuario: ev.evaluator_name || ev.usuario || '',
        payload: ev.payload
      }));

      setEvaluations(formattedData);
      setTotalCount(count || 0);

    } catch (error) {
      console.error('Error fetching evaluations:', error);
      setEvaluations([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearchTerm, startDate, endDate, typeFilter]);


  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <>
      <Helmet><title>Ver Evaluaciones</title></Helmet>
      <div className="container mx-auto py-8 text-white">
        <h1 className="text-2xl font-bold mb-6">Todas las Evaluaciones</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Input
            placeholder="Buscar por punto de venta, código, o evaluador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger><SelectValue placeholder="Filtrar por fecha" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fechas</SelectItem>
              <SelectItem value="last7">Últimos 7 días</SelectItem>
              <SelectItem value="last30">Últimos 30 días</SelectItem>
              <SelectItem value="thisMonth">Este mes</SelectItem>
              <SelectItem value="thisYear">Este año</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="pdv">PDV</SelectItem>
              <SelectItem value="canal_moderno">Canal Moderno</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center">Cargando...</div>
        ) : evaluations.length === 0 ? (
          <div className="text-center text-gray-400">No se encontraron evaluaciones.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Punto de Venta</th>
                  <th className="p-3">Codigo</th>
                  <th className="p-3">Ruta</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Puntaje</th>
                  <th className="p-3">Evaluador</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev) => (
                  <tr key={ev.id} className="border-b border-gray-700 hover:bg-gray-800">
                    <td className="p-3">{format(new Date(ev.fecha), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="p-3">{ev.punto_venta}</td>
                    <td className="p-3">{ev.client_code || 'Sin codigo'}</td>
                    <td className="p-3">{ev.ruta || 'Sin ruta'}</td>
                    <td className="p-3">{ev.tipo}</td>
                    <td className="p-3 font-bold">{ev.puntaje?.toFixed(2) ?? 'N/A'}</td>
                    <td className="p-3">{ev.usuario}</td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" onClick={() => setSelectedEvaluation(ev)}>
                        Ver Detalles
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-between items-center mt-6">
          <p className="text-sm text-gray-400">Mostrando {evaluations.length} de {totalCount} evaluaciones</p>
          <div className="flex gap-2">
            <Button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>
              Anterior
            </Button>
            <Button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages || loading}>
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {selectedEvaluation && (
        <Dialog open={!!selectedEvaluation} onOpenChange={() => setSelectedEvaluation(null)}>
          <DialogContent className="max-w-2xl bg-gray-900 text-white border-gray-700">
            <DialogHeader>
              <DialogTitle>Detalles de la Evaluación</DialogTitle>
              <DialogDescription>Tipo: {selectedEvaluation.tipo}</DialogDescription>
            </DialogHeader>
            <div className="mt-4 max-h-[70vh] overflow-y-auto p-1 pr-2">
              <EvaluationDetailViewer evaluation={selectedEvaluation} />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setSelectedEvaluation(null)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
