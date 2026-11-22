import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

// Esta página es ahora una copia de la del supervisor para unificar la vista.
export default function AdminEvaluationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    try {
      // Construir queries base
      let pdvQuery = supabase.from('evaluaciones_pdv').select('*');
      let canalModernoQuery = supabase.from('evaluaciones').select('*').eq('tipo', 'CANAL MODERNO');

      // Aplicar filtros de búsqueda y fecha a ambas queries
      if (q && q.trim()) {
        const term = `%${q.trim()}%`;
        pdvQuery = pdvQuery.or(`punto_venta.ilike.${term},nombre.ilike.${term}`);
        canalModernoQuery = canalModernoQuery.or(`cadena.ilike.${term},evaluator_name.ilike.${term}`);
      }
      if (fromDate) {
        pdvQuery = pdvQuery.gte('fecha', fromDate);
        canalModernoQuery = canalModernoQuery.gte('fecha', fromDate);
      }
      if (toDate) {
        pdvQuery = pdvQuery.lte('fecha', toDate);
        canalModernoQuery = canalModernoQuery.lte('fecha', toDate);
      }

      // Ejecutar ambas queries en paralelo
      const [pdvResult, canalModernoResult] = await Promise.all([
        pdvQuery.order('fecha', { ascending: false }).limit(200),
        canalModernoQuery.order('fecha', { ascending: false }).limit(200),
      ]);

      if (pdvResult.error) throw pdvResult.error;
      if (canalModernoResult.error) throw canalModernoResult.error;

      // Normalizar datos de evaluaciones PDV
      const pdvItems = (pdvResult.data || []).map(r => ({
        id: `pdv-${r.id}`,
        fecha: String(r.fecha || r.created_at || '').slice(0, 16),
        punto_venta: r.puntoVenta || r.punto_venta || '—',
        nivel: r.nivel || r.tipoCliente || r.tipo_cliente || 'PDV',
        puntaje: r.puntajeTotal ?? r.puntaje_total ?? '—',
        usuario: r.nombre || r.user_id || '—',
      }));

      // Normalizar datos de evaluaciones de Canal Moderno
      const canalModernoItems = (canalModernoResult.data || []).map(r => ({
        id: `cm-${r.id}`,
        fecha: String(r.fecha || r.timestamp || '').slice(0, 16),
        punto_venta: r.cadena || '—',
        nivel: r.tipo || 'Canal Moderno',
        puntaje: r.score_final ?? '—',
        usuario: r.evaluator_name || '—',
      }));

      // Combinar y ordenar
      const combinedItems = [...pdvItems, ...canalModernoItems];
      combinedItems.sort((a, b) => {
        const dateA = a.fecha ? new Date(a.fecha) : null;
        const dateB = b.fecha ? new Date(b.fecha) : null;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1; 
        if (!dateB) return -1;
        return dateB - dateA;
      });

      setItems(combinedItems);

    } catch (e) {
      console.error('Error cargando evaluaciones:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []); // Carga inicial

  const exportCSV = () => {
    try {
      setExporting(true);
      const headers = ['id', 'fecha', 'punto_venta', 'nivel', 'puntaje', 'usuario'];
      const escape = (val) => {
        const s = String(val ?? '');
        return /[\",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const rows = items.map(r => ({
        id: r.id,
        fecha: r.fecha,
        punto_venta: r.punto_venta,
        nivel: r.nivel,
        puntaje: r.puntaje,
        usuario: r.usuario,
      }));
      const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `evaluaciones_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Evaluaciones - Admin</title></Helmet>
      <h1 className="text-2xl font-bold text-white">Evaluaciones</h1>

      <Card className="heineken-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-white text-black w-56" />
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-white text-black w-40" />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-white text-black w-40" />
            <Button onClick={fetchRows} disabled={loading} className="heineken-button">{loading ? 'Cargando...' : 'Aplicar filtros'}</Button>
            <Button variant="outline" onClick={exportCSV} disabled={!items.length || exporting} className="bg-white text-black border border-gray-300 hover:bg-gray-100">Exportar CSV</Button>
          </div>

          <div className="overflow-auto max-h-[60vh] border border-white/10 rounded">
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-white sticky top-0">
                <tr>
                  <th className="p-2 text-left w-32">Fecha</th>
                  <th className="p-2 text-left">Punto de venta / Cadena</th>
                  <th className="p-2 text-left w-32">Tipo</th>
                  <th className="p-2 text-right w-28">Puntaje</th>
                  <th className="p-2 text-left w-40">Usuario</th>
                </tr>
              </thead>
              <tbody className="text-white/90">
                {items.map((r) => (
                  <tr key={r.id} className="odd:bg-white/5">
                    <td className="p-2">{r.fecha}</td>
                    <td className="p-2">{r.punto_venta}</td>
                    <td className="p-2">{r.nivel}</td>
                    <td className="p-2 text-right">{r.puntaje}</td>
                    <td className="p-2">{r.usuario}</td>
                  </tr>
                ))}
                {!items.length && !loading && (
                  <tr>
                    <td className="p-2 text-center text-white/70" colSpan={5}>Sin resultados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
