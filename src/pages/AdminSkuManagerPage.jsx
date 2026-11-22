// AdminSkuManagerPage.jsx
// Gestión completa de SKUs: CRUD sobre shop_products (MySQL via PHP)
// + Sync a Supabase
// Roles permitidos: admin, sistemas
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getShopAuthHeaders } from '@/lib/api';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import {
  Package, Search, Plus, Edit2, Eye, EyeOff, RefreshCw, Upload,
  ChevronLeft, ChevronRight, RotateCcw, X, ImageIcon, Save, Loader2,
  AlertTriangle, CheckCircle2, ArrowUpDown, Tag, Building2, Layers
} from 'lucide-react';

// ── Config ────────────────────────────────────────────────────────────────────
const SHOP_API = '/api/shop';
const ADMIN_API = `${SHOP_API}/admin`;
const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────
const api = async (endpoint, opts = {}) => {
  const res = await fetch(`${ADMIN_API}${endpoint}`, {
    ...opts,
    headers: await getShopAuthHeaders(opts.headers || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const postForm = async (endpoint, formData) => {
  const res = await fetch(`${ADMIN_API}${endpoint}`, {
    method: 'POST',
    headers: await getShopAuthHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const postJson = async (endpoint, data, method = 'POST') => {
  const res = await fetch(`${ADMIN_API}${endpoint}`, {
    method,
    headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const EMPTY_FORM = {
  id: null,
  sku: '',
  name: '',
  description: '',
  base_price: '',
  categoria: '',
  empresa: '',
  precio_envase: '',
  returnable_factor: '0',
  is_active: 1,
  image_url: '',
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function AdminSkuManagerPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const role = user?.user_metadata?.role || user?.user_metadata?.type || '';
  const canEdit = ['admin', 'sistemas', 'administrador'].includes(role.toLowerCase());

  // Data
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Filters / Pagination
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // 'all' | '1' | '0'
  const [filterRetornable, setFilterRetornable] = useState('all');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await api('/products-manage.php');
      setProducts(res.data || []);
    } catch (e) {
      toast({ title: 'Error cargando SKUs', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProducts(); }, []);

  // ── Filtered + Sorted + Paginated ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...products];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(p =>
        p.sku?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.empresa?.toLowerCase().includes(q)
      );
    }
    if (filterActive !== 'all') {
      rows = rows.filter(p => String(p.is_active) === filterActive);
    }
    if (filterRetornable !== 'all') {
      const isRet = filterRetornable === '1';
      rows = rows.filter(p => (parseFloat(p.returnable_factor) >= 1.0) === isRet);
    }
    // Sort
    rows.sort((a, b) => {
      let va = a[sortField] ?? '';
      let vb = b[sortField] ?? '';
      if (sortField === 'base_price' || sortField === 'precio_envase') {
        va = parseFloat(va) || 0;
        vb = parseFloat(vb) || 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [products, search, filterActive, filterRetornable, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openNew = () => {
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setForm({
      id: p.id,
      sku: p.sku || '',
      name: p.name || '',
      description: p.description || '',
      base_price: p.base_price ?? '',
      categoria: p.category || '',
      empresa: p.empresa || '',
      precio_envase: p.precio_envase ?? '',
      returnable_factor: String(parseFloat(p.returnable_factor) >= 1.0 ? '1' : '0'),
      is_active: p.is_active ?? 1,
      image_url: p.image_url || '',
    });
    setImageFile(null);
    setImagePreview(p.image_url || '');
    setModalOpen(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!form.sku || !form.name || !form.base_price) {
      toast({ title: 'Campos requeridos', description: 'SKU, Nombre y Precio Lista son obligatorios.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('action', form.id ? 'update' : 'create');
      fd.append('sku', form.sku);
      fd.append('name', form.name);
      fd.append('description', form.description);
      fd.append('base_price', form.base_price);
      fd.append('category', form.categoria);
      fd.append('empresa', form.empresa);
      fd.append('precio_envase', form.precio_envase || '0');
      fd.append('returnable_factor', form.returnable_factor === '1' ? '1.0' : '0.0');
      fd.append('is_active', form.is_active);
      fd.append('current_image_url', form.image_url);
      if (form.id) fd.append('id', form.id);
      if (imageFile) fd.append('image', imageFile);

      const res = await postForm('/products-manage.php', fd);
      if (!res.success) throw new Error(res.error || 'Error al guardar');

      toast({ title: form.id ? '✅ SKU actualizado' : '✅ SKU creado', description: form.name });
      setModalOpen(false);
      await loadProducts();
    } catch (e) {
      toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    try {
      const fd = new FormData();
      fd.append('action', 'toggle_active');
      fd.append('id', p.id);
      fd.append('is_active', p.is_active ? '0' : '1');
      await postForm('/products-manage.php', fd);
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: x.is_active ? 0 : 1 } : x));
      toast({ title: p.is_active ? 'SKU desactivado' : 'SKU activado', description: p.name });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── Sync Supabase ─────────────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await postJson('/sync-to-supabase.php', {});
      if (!res.success) throw new Error(res.error || 'Error en sync');
      toast({
        title: '🔄 Sincronización exitosa',
        description: res.message,
      });
    } catch (e) {
      toast({ title: 'Error de sync', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const SortBtn = ({ field, label }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 hover:text-blue-400 transition-colors font-medium"
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-blue-400' : 'opacity-40'}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>Gestión de SKUs | Cervezas Finas</title>
      </Helmet>

      {/* Header */}
      <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Package className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Gestión de SKUs</h1>
              <p className="text-xs text-gray-400">{filtered.length} productos · MySQL → Supabase sincronizado</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10 gap-2"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync Supabase
            </Button>
            {canEdit && (
              <Button
                size="sm"
                onClick={openNew}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2"
              >
                <Plus className="w-4 h-4" />
                Nuevo SKU
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar SKU, nombre, marca, empresa..."
              className="pl-9 bg-gray-900 border-gray-700 text-white placeholder-gray-500"
            />
          </div>
          <select
            value={filterActive}
            onChange={e => { setFilterActive(e.target.value); setPage(1); }}
            className="bg-gray-900 border border-gray-700 text-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">Todos</option>
            <option value="1">Activos</option>
            <option value="0">Inactivos</option>
          </select>
          <select
            value={filterRetornable}
            onChange={e => { setFilterRetornable(e.target.value); setPage(1); }}
            className="bg-gray-900 border border-gray-700 text-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">Todos los envases</option>
            <option value="1">Retornables</option>
            <option value="0">No retornables</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setFilterActive('all'); setFilterRetornable('all'); setPage(1); }}
            className="text-gray-400 hover:text-gray-200"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Limpiar
          </Button>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total SKUs', value: products.length, color: 'text-blue-400' },
            { label: 'Activos', value: products.filter(p => p.is_active).length, color: 'text-green-400' },
            { label: 'Retornables', value: products.filter(p => parseFloat(p.returnable_factor) >= 1.0).length, color: 'text-amber-400' },
            { label: 'Inactivos', value: products.filter(p => !p.is_active).length, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
              <Layers className={`w-4 h-4 ${s.color}`} />
              <div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="px-4 py-3 text-left w-16">Img</th>
                  <th className="px-4 py-3 text-left"><SortBtn field="sku" label="SKU" /></th>
                  <th className="px-4 py-3 text-left"><SortBtn field="name" label="Nombre" /></th>
                  <th className="px-4 py-3 text-left"><SortBtn field="category" label="Marca" /></th>
                  <th className="px-4 py-3 text-left"><SortBtn field="empresa" label="Empresa" /></th>
                  <th className="px-4 py-3 text-right"><SortBtn field="base_price" label="Precio Lista" /></th>
                  <th className="px-4 py-3 text-right"><SortBtn field="precio_envase" label="P. Envase" /></th>
                  <th className="px-4 py-3 text-center">Retornable</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  {canEdit && <th className="px-4 py-3 text-center">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto mb-2" />
                    <div className="text-gray-500 text-sm">Cargando SKUs...</div>
                  </td></tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={10} className="py-16 text-center text-gray-500">
                    No se encontraron productos con los filtros actuales.
                  </td></tr>
                ) : paginated.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors"
                  >
                    {/* Image */}
                    <td className="px-4 py-2">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-10 h-10 object-contain rounded-lg bg-gray-800"
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-gray-600" />
                        </div>
                      )}
                    </td>
                    {/* SKU */}
                    <td className="px-4 py-2 font-mono text-amber-400 font-semibold">{p.sku}</td>
                    {/* Name */}
                    <td className="px-4 py-2 text-gray-200 max-w-xs">
                      <div className="truncate" title={p.name}>{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-gray-500 truncate">{p.description}</div>
                      )}
                    </td>
                    {/* Marca */}
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="border-blue-500/30 text-blue-300 text-xs">
                        {p.category || '—'}
                      </Badge>
                    </td>
                    {/* Empresa */}
                    <td className="px-4 py-2 text-gray-400 text-xs">{p.empresa || '—'}</td>
                    {/* Precio Lista */}
                    <td className="px-4 py-2 text-right font-semibold text-green-400">
                      ${parseFloat(p.base_price || 0).toFixed(2)}
                    </td>
                    {/* Precio Envase */}
                    <td className="px-4 py-2 text-right text-gray-400 text-xs">
                      {parseFloat(p.precio_envase || 0) > 0
                        ? `$${parseFloat(p.precio_envase).toFixed(2)}`
                        : '—'}
                    </td>
                    {/* Retornable */}
                    <td className="px-4 py-2 text-center">
                      {parseFloat(p.returnable_factor) >= 1.0 ? (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">♻️ Retornable</Badge>
                      ) : (
                        <span className="text-gray-600 text-xs">No</span>
                      )}
                    </td>
                    {/* Estado */}
                    <td className="px-4 py-2 text-center">
                      {p.is_active ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Activo</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Inactivo</Badge>
                      )}
                    </td>
                    {/* Actions */}
                    {canEdit && (
                      <td className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => toggleActive(p)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              p.is_active
                                ? 'hover:bg-red-500/20 text-red-400'
                                : 'hover:bg-green-500/20 text-green-400'
                            }`}
                            title={p.is_active ? 'Desactivar' : 'Activar'}
                          >
                            {p.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    )}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 text-sm text-gray-400">
              <span>Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-gray-400"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-white font-medium">{page} / {totalPages}</span>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="text-gray-400"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Crear/Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Package className="w-5 h-5 text-amber-400" />
              {form.id ? 'Editar SKU' : 'Nuevo SKU'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* SKU */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Código SKU *</Label>
              <Input
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                disabled={!!form.id}
                placeholder="Ej: 4197"
                className="bg-gray-800 border-gray-600 text-white disabled:opacity-50"
              />
            </div>

            {/* Nombre */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Nombre / Descripción *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: HEINEKEN NR 24B 355ML"
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>

            {/* Precio Lista */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Precio de Lista * ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.base_price}
                onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))}
                placeholder="0.00"
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>

            {/* Precio Envase */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Precio Envase ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.precio_envase}
                onChange={e => setForm(f => ({ ...f, precio_envase: e.target.value }))}
                placeholder="0.00 — cobrar en liquidación si falta"
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>

            {/* Marca (category) */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Marca</Label>
              <Input
                value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                placeholder="Ej: HEINEKEN, CARTA BLANCA..."
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>

            {/* Empresa */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Empresa</Label>
              <Input
                value={form.empresa}
                onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                placeholder="Ej: HEINEKEN México, Grupo Modelo..."
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>

            {/* Descripción larga */}
            <div className="sm:col-span-2">
              <Label className="text-gray-300 mb-1.5 block">Descripción adicional</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descripción adicional opcional"
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>

            {/* Retornable */}
            <div className="flex items-center gap-4">
              <Label className="text-gray-300">Envase Retornable</Label>
              <div className="flex items-center gap-3">
                {[{ val: '1', label: '♻️ Sí' }, { val: '0', label: '🗑️ No' }].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, returnable_factor: opt.val }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                      form.returnable_factor === opt.val
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Estado */}
            <div className="flex items-center gap-4">
              <Label className="text-gray-300">Estado</Label>
              <div className="flex items-center gap-3">
                {[{ val: 1, label: '✅ Activo' }, { val: 0, label: '⛔ Inactivo' }].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_active: opt.val }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                      form.is_active === opt.val
                        ? 'bg-green-500/20 border-green-500 text-green-300'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Imagen */}
            <div className="sm:col-span-2">
              <Label className="text-gray-300 mb-1.5 block">Imagen del Producto</Label>
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="w-24 h-24 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {imagePreview ? (
                    <img src={imagePreview} alt="preview" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-gray-600" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    value={form.image_url}
                    onChange={e => { setForm(f => ({ ...f, image_url: e.target.value })); setImagePreview(e.target.value); }}
                    placeholder="URL de imagen existente"
                    className="bg-gray-800 border-gray-600 text-white text-sm"
                  />
                  <div className="text-gray-500 text-xs">— o —</div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    className="border-gray-600 text-gray-300 hover:bg-gray-800 gap-2"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Subir archivo
                  </Button>
                  {imageFile && (
                    <p className="text-xs text-green-400">📎 {imageFile.name}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="border-gray-600 text-gray-300">Cancelar</Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {form.id ? 'Guardar Cambios' : 'Crear SKU'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
