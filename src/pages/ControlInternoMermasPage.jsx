import React, { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PackageMinus, Plus, Search, DollarSign, Calendar, MapPin, Tag } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';

export default function ControlInternoMermasPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [mermas, setMermas] = useState([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'));

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    tipo: 'merma',
    causa: 'rotura',
    origen: 'bodega',
    ruta: '',
    zona: '',
    sku: '',
    descripcion_producto: '',
    cantidad: '',
    unidad: 'cajas',
    valor_unitario: '',
    descripcion: ''
  });

  const isJefe = user?.user_metadata?.type === 'jefe-control-interno' || user?.user_metadata?.type === 'jefe control interno';

  useEffect(() => {
    loadMermas();
  }, [user, monthFilter]);

  const loadMermas = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [year, month] = monthFilter.split('-');
      const d = new Date(year, month - 1, 1);
      const start = startOfMonth(d).toISOString();
      const end = endOfMonth(d).toISOString();

      let query = supabase
        .from('ci_mermas')
        .select('*')
        .gte('fecha', start)
        .lte('fecha', end)
        .order('fecha', { ascending: false });

      if (!isJefe) {
        query = query.eq('auditor_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMermas(data || []);
    } catch (error) {
      console.error("Error loading mermas:", error);
      toast({ title: 'Error', description: 'No se pudieron cargar las mermas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filteredMermas = useMemo(() => {
    return mermas.filter(m => 
      (m.descripcion_producto?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (m.sku?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (m.ruta?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [mermas, searchTerm]);

  const stats = useMemo(() => {
    let totalValor = 0;
    let totalItems = 0;
    filteredMermas.forEach(m => {
      totalValor += Number(m.valor_total || 0);
      totalItems += Number(m.cantidad || 0);
    });
    return { totalValor, totalItems };
  }, [filteredMermas]);

  const openModal = () => {
    setFormData({
      fecha: format(new Date(), 'yyyy-MM-dd'),
      tipo: 'merma',
      causa: 'rotura',
      origen: 'bodega',
      ruta: user?.user_metadata?.route || '',
      zona: user?.user_metadata?.zona || '',
      sku: '',
      descripcion_producto: '',
      cantidad: '',
      unidad: 'cajas',
      valor_unitario: '',
      descripcion: ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.descripcion_producto || !formData.cantidad || !formData.valor_unitario) {
      toast({ title: 'Faltan datos', description: 'Producto, cantidad y valor son obligatorios.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const cantidad = Number(formData.cantidad);
      const unitario = Number(formData.valor_unitario);
      const valor_total = cantidad * unitario;

      const payload = {
        ...formData,
        cantidad,
        valor_unitario: unitario,
        valor_total,
        auditor_id: user.id,
        auditor_nombre: user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || 'Auditor'
      };

      const { error } = await supabase.from('ci_mermas').insert([payload]);
      if (error) throw error;
      
      toast({ title: 'Éxito', description: 'Registro guardado correctamente.' });
      setIsModalOpen(false);
      loadMermas();
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: 'Error', description: 'No se pudo guardar el registro', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getColorByTipo = (tipo) => {
    switch (tipo) {
      case 'faltante': return 'bg-red-100 text-red-800 border-red-200';
      case 'devolucion': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-6">
      <Helmet>
        <title>Mermas y Faltantes | Cervezas Finas</title>
      </Helmet>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <PackageMinus className="h-8 w-8 text-orange-500" />
            Mermas y Faltantes
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Registro transaccional de pérdidas de inventario.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openModal} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Registro
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 border-orange-100 dark:border-orange-900">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest">Valor Total Mensual</p>
              <p className="text-4xl font-black text-gray-900 dark:text-white mt-1">
                ${stats.totalValor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="h-14 w-14 rounded-full bg-orange-200 dark:bg-orange-900/50 flex items-center justify-center">
              <DollarSign className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Volumen de Artículos</p>
              <p className="text-4xl font-black text-gray-900 dark:text-white mt-1">
                {stats.totalItems.toLocaleString()} <span className="text-lg font-medium text-gray-400">unidades</span>
              </p>
            </div>
            <div className="h-14 w-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <PackageMinus className="h-8 w-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar por producto, SKU, ruta..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full md:w-auto">
              <Input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full md:w-48"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            </div>
          ) : filteredMermas.length === 0 ? (
            <div className="text-center py-12 px-4 text-gray-500">
              <PackageMinus className="mx-auto h-12 w-12 opacity-20 mb-3" />
              <p>No hay registros de mermas en este periodo.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                  <tr>
                    <th className="p-4 font-semibold">Fecha</th>
                    <th className="p-4 font-semibold">Producto</th>
                    <th className="p-4 font-semibold">Tipo/Causa</th>
                    <th className="p-4 font-semibold">Origen</th>
                    <th className="p-4 font-semibold text-right">Cantidad</th>
                    <th className="p-4 font-semibold text-right">Valor Total</th>
                    <th className="p-4 font-semibold">Auditor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredMermas.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="p-4 text-gray-500">
                        {format(new Date(m.fecha), 'dd MMM yyyy', { locale: es })}
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{m.descripcion_producto}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{m.sku || 'SIN SKU'}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1 flex-wrap w-32">
                          <Badge variant="outline" className={`uppercase text-[9px] ${getColorByTipo(m.tipo)}`}>{m.tipo}</Badge>
                          <Badge variant="secondary" className="uppercase text-[9px]">{m.causa}</Badge>
                        </div>
                      </td>
                      <td className="p-4 text-gray-500 capitalize">
                        {m.origen} {m.ruta ? `(${m.ruta})` : ''}
                      </td>
                      <td className="p-4 text-right font-medium">
                        {m.cantidad} <span className="text-xs font-normal text-gray-400">{m.unidad}</span>
                      </td>
                      <td className="p-4 text-right font-bold text-red-600 dark:text-red-400">
                        ${Number(m.valor_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-gray-500 text-xs">
                        {m.auditor_nombre}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageMinus className="h-5 w-5 text-orange-500" />
              Registrar Merma / Faltante
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Incidencia</Label>
                <Select value={formData.tipo} onValueChange={v => setFormData({...formData, tipo: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merma">Merma (Daño)</SelectItem>
                    <SelectItem value="faltante">Faltante de Inventario</SelectItem>
                    <SelectItem value="devolucion">Devolución Anómala</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Origen</Label>
                <Select value={formData.origen} onValueChange={v => setFormData({...formData, origen: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bodega">Bodega</SelectItem>
                    <SelectItem value="camion">Camión / Reparto</SelectItem>
                    <SelectItem value="um6">UM6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Causa Principal</Label>
                <Select value={formData.causa} onValueChange={v => setFormData({...formData, causa: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rotura">Rotura / Quebradura</SelectItem>
                    <SelectItem value="robo">Robo / Extravío</SelectItem>
                    <SelectItem value="caducidad">Caducidad</SelectItem>
                    <SelectItem value="calidad">Problema de Calidad</SelectItem>
                    <SelectItem value="proceso">Error de Proceso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ruta (Si aplica)</Label>
                <Input value={formData.ruta} onChange={e => setFormData({...formData, ruta: e.target.value})} placeholder="Ej: RUTA 10" />
              </div>
              <div className="space-y-2">
                <Label>SKU (Opcional)</Label>
                <Input value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} placeholder="Ej: 12345" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descripción del Producto *</Label>
              <Input value={formData.descripcion_producto} onChange={e => setFormData({...formData, descripcion_producto: e.target.value})} placeholder="Ej: Corona Extra 355ml" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cantidad *</Label>
                <Input type="number" min="0" step="0.1" value={formData.cantidad} onChange={e => setFormData({...formData, cantidad: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Unidad</Label>
                <Select value={formData.unidad} onValueChange={v => setFormData({...formData, unidad: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cajas">Cajas</SelectItem>
                    <SelectItem value="botellas">Botellas sueltas</SelectItem>
                    <SelectItem value="litros">Litros / Barril</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor Unitario ($) *</Label>
                <Input type="number" min="0" step="0.01" value={formData.valor_unitario} onChange={e => setFormData({...formData, valor_unitario: e.target.value})} />
              </div>
            </div>
            
            <div className="p-3 bg-gray-50 dark:bg-gray-900 border rounded-lg flex justify-between items-center">
              <span className="font-semibold text-gray-500">Valor Total Estimado:</span>
              <span className="text-xl font-bold text-red-500">
                ${(Number(formData.cantidad || 0) * Number(formData.valor_unitario || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Comentarios Adicionales</Label>
              <Textarea value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} placeholder="Detalles de cómo ocurrió..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Registrar Pérdida'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
