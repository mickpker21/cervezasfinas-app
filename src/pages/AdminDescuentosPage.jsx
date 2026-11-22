// AdminDescuentosPage.jsx
// Gestión completa de descuentos:
//  A) GEC % — por nivel (Bronce, Plata, Oro, Platino, Titanio, Titanio 2)
//  B) Promociones — por pesos (amount_off) o regalo NxM, por SKU y zona
//  C) Precios Fijos — precio especial por cliente, ruta o zona
//  D) Cargos — cargo retornable y desechable global
// Roles: admin, sistemas
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Tag, Percent, DollarSign, Gift, Target, Plus, Edit2, Trash2, Save,
  Loader2, RefreshCw, Search, CheckCircle2, AlertTriangle, X, Package,
  Users, MapPin, Route, User, ToggleLeft, ToggleRight, Calendar
} from 'lucide-react';

// ── Config ───────────────────────────────────────────────────────────────────
const ADMIN_API = '/api/shop/admin';

// Todos los endpoints admin exigen sesión de Supabase con rol autorizado

const fetchAPI = async (endpoint, opts = {}) => {
  const res = await fetch(`${ADMIN_API}${endpoint}`, { ...opts, headers: await getShopAuthHeaders(opts.headers || {}) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const postJSON = async (endpoint, data, method = 'POST') => {
  const res = await fetch(`${ADMIN_API}${endpoint}`, {
    method,
    headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const deleteAPI = async (endpoint) => {
  const res = await fetch(`${ADMIN_API}${endpoint}`, { method: 'DELETE', headers: await getShopAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// GEC Levels
const GEC_LEVELS = [
  { key: 'Bronce', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  { key: 'Plata',  color: 'text-gray-300',   bg: 'bg-gray-500/10',   border: 'border-gray-500/30' },
  { key: 'Oro',    color: 'text-yellow-400',  bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  { key: 'Platino',color: 'text-cyan-400',    bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30' },
  { key: 'Titanio',color: 'text-violet-400',  bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  { key: 'Titanio 2', color: 'text-pink-400', bg: 'bg-pink-500/10',   border: 'border-pink-500/30' },
];

const SCOPE_LABELS = {
  client_code: { label: 'Cliente Específico', icon: User, priority: 1, color: 'text-blue-400' },
  sales_route:  { label: 'Ruta de Ventas',    icon: Route, priority: 2, color: 'text-green-400' },
  zone:         { label: 'Zona Comercial',    icon: MapPin, priority: 3, color: 'text-amber-400' },
};

// ── Sección A: GEC Discounts ─────────────────────────────────────────────────
function GECSection({ canEdit }) {
  const { toast } = useToast();
  const [gec, setGec] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAPI('/gec-discounts-manage.php');
      setGec(res.data || []);
    } catch (e) {
      toast({ title: 'Error cargando GEC', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (item, newPct) => {
    if (isNaN(newPct) || newPct < 0 || newPct > 100) {
      toast({ title: 'Porcentaje inválido', description: 'Debe estar entre 0 y 100', variant: 'destructive' });
      return;
    }
    setSaving(item.id);
    try {
      await postJSON('/gec-discounts-manage.php', { id: item.id, discount_percentage: newPct });
      setGec(prev => prev.map(g => g.id === item.id ? { ...g, discount_percentage: newPct } : g));
      toast({ title: '✅ GEC actualizado', description: `${item.nivel_gec || item.gec_level}: ${newPct}%` });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>;

  // Sub-componente para cada nivel GEC (necesita useState propio => componente separado)
  const GecCard = ({ level, item, canEdit, onSave, isSaving }) => {
    const pct = parseFloat(item.discount_percentage);
    const [localPct, setLocalPct] = React.useState(pct);
    const dirty = localPct !== pct;

    return (
      <motion.div
        key={level.key}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-2xl border ${level.border} ${level.bg} p-5`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Percent className={`w-5 h-5 ${level.color}`} />
            <span className={`font-bold text-lg ${level.color}`}>{level.key}</span>
          </div>
          <Badge className={`${level.bg} ${level.border} ${level.color} border text-base font-bold px-3`}>
            {pct}%
          </Badge>
        </div>

        {canEdit ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={localPct}
                onChange={e => setLocalPct(parseFloat(e.target.value) || 0)}
                className="bg-gray-900/60 border-gray-600 text-white pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
            <Button
              size="sm"
              onClick={() => onSave(item, localPct)}
              disabled={!dirty || isSaving}
              className={`gap-1 ${dirty ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-700 text-gray-500'} text-white`}
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          </div>
        ) : (
          <div className={`text-3xl font-black ${level.color}`}>{pct}%</div>
        )}
        <p className="text-xs text-gray-500 mt-2">Descuento aplicado sobre precio después de promo</p>
      </motion.div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-sm text-gray-400">
        <p className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <strong className="text-amber-300">El descuento GEC aplica a TODOS los SKUs</strong>
        </p>
        <p>Se aplica después de la promoción por pesos: <code className="text-amber-300 bg-gray-800 px-1 rounded">Precio Final = (Precio Lista - Promo$) × (1 - %GEC)</code></p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GEC_LEVELS.map(level => {
          const item = gec.find(g => (g.nivel_gec || g.gec_level || '').toLowerCase() === level.key.toLowerCase());
          if (!item) return null;
          return (
            <GecCard
              key={level.key}
              level={level}
              item={item}
              canEdit={canEdit}
              onSave={handleSave}
              isSaving={saving === item.id}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Sección B: Promociones ────────────────────────────────────────────────────
const EMPTY_PROMO = {
  id: null, name: '', discount_amount: '', start_date: '', end_date: '',
  is_active: 1, zones: '', promo_type: 'amount_off', buy_n: '', pay_m: '', skus: []
};

function PromosSection({ canEdit, allSkus }) {
  const { toast } = useToast();
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_PROMO);
  const [saving, setSaving] = useState(false);
  const [skuSearch, setSkuSearch] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAPI('/promotions-manage.php');
      setPromos(res.data || []);
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY_PROMO); setSkuSearch(''); setModal(true); };
  const openEdit = (p) => {
    setForm({
      id: p.id,
      name: p.name || '',
      discount_amount: p.discount_amount ?? '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      is_active: p.is_active ?? 1,
      zones: p.zones || '',
      promo_type: p.promo_type || 'amount_off',
      buy_n: p.buy_n || '',
      pay_m: p.pay_m || '',
      skus: Array.isArray(p.skus) ? p.skus : [],
    });
    setSkuSearch('');
    setModal(true);
  };

  const toggleSku = (sku) => {
    setForm(f => ({
      ...f,
      skus: f.skus.includes(sku) ? f.skus.filter(s => s !== sku) : [...f.skus, sku]
    }));
  };

  const handleSave = async () => {
    if (!form.name) { toast({ title: 'Nombre requerido', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const res = await postJSON('/promotions-manage.php', {
        id: form.id,
        name: form.name,
        discount_amount: parseFloat(form.discount_amount) || 0,
        start_date: form.start_date,
        end_date: form.end_date,
        is_active: form.is_active,
        zones: form.zones || null,
        promo_type: form.promo_type,
        buy_n: parseInt(form.buy_n) || 0,
        pay_m: parseInt(form.pay_m) || 0,
        skus: form.skus,
      });
      if (!res.success) throw new Error(res.error);
      toast({ title: '✅ Promoción guardada', description: form.name });
      setModal(false);
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`¿Eliminar la promoción "${name}"?`)) return;
    try {
      await deleteAPI(`/promotions-manage.php?id=${id}`);
      toast({ title: 'Promoción eliminada' });
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const filtered = promos.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSkus = allSkus.filter(p =>
    !skuSearch || p.sku?.includes(skuSearch) || p.name?.toLowerCase().includes(skuSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar promoción..."
            className="pl-9 bg-gray-900 border-gray-700 text-white placeholder-gray-500" />
        </div>
        {canEdit && (
          <Button onClick={openNew} size="sm" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2">
            <Plus className="w-4 h-4" /> Nueva Promoción
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No hay promociones configuradas.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const isActive = p.is_active && p.end_date >= today;
            const isNxM = p.promo_type === 'nxm';
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-gray-900 border rounded-xl p-4 flex items-start gap-4 ${
                  isActive ? 'border-green-500/30' : 'border-gray-800 opacity-60'
                }`}
              >
                <div className={`p-2 rounded-xl flex-shrink-0 ${isNxM ? 'bg-purple-500/10' : 'bg-green-500/10'}`}>
                  {isNxM ? <Gift className="w-5 h-5 text-purple-400" /> : <DollarSign className="w-5 h-5 text-green-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{p.name}</span>
                    {isActive
                      ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Activa</Badge>
                      : <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-xs">Inactiva/Vencida</Badge>}
                    <Badge className={`text-xs ${isNxM ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-green-500/20 text-green-300 border-green-500/30'}`}>
                      {isNxM ? `${p.buy_n}×${p.pay_m}` : `-$${parseFloat(p.discount_amount).toFixed(2)}`}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                    <span>📅 {p.start_date} → {p.end_date}</span>
                    {p.zones && <span>🗺 {p.zones}</span>}
                    {Array.isArray(p.skus) && p.skus.length > 0 && (
                      <span>📦 {p.skus.length} SKU{p.skus.length > 1 ? 's' : ''}: {p.skus.slice(0, 3).join(', ')}{p.skus.length > 3 ? `…` : ''}</span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal Promo */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-amber-400" />
              {form.id ? 'Editar Promoción' : 'Nueva Promoción'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Nombre */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Nombre de la Promoción *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                placeholder="Ej: CLAMATO MEDIA LATA ENE-FEB"
                className="bg-gray-800 border-gray-600 text-white" />
            </div>

            {/* Tipo */}
            <div>
              <Label className="text-gray-300 mb-2 block">Tipo de Descuento</Label>
              <div className="flex gap-3">
                {[
                  { val: 'amount_off', label: '💵 Por Pesos', desc: 'Resta un monto fijo del precio' },
                  { val: 'nxm', label: '🎁 NxM (Regalo)', desc: 'Compra N, paga M (ej. 3x2)' },
                ].map(opt => (
                  <button key={opt.val} type="button"
                    onClick={() => setForm(f => ({...f, promo_type: opt.val}))}
                    className={`flex-1 p-3 rounded-xl text-left border transition-all ${
                      form.promo_type === opt.val
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-semibold text-sm">{opt.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Monto / NxM */}
            {form.promo_type === 'amount_off' ? (
              <div>
                <Label className="text-gray-300 mb-1.5 block">Descuento por Pesos ($)</Label>
                <Input type="number" step="0.01" min="0" value={form.discount_amount}
                  onChange={e => setForm(f => ({...f, discount_amount: e.target.value}))}
                  placeholder="Ej: 18.00"
                  className="bg-gray-800 border-gray-600 text-white" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300 mb-1.5 block">Compra (N)</Label>
                  <Input type="number" min="1" value={form.buy_n}
                    onChange={e => setForm(f => ({...f, buy_n: e.target.value}))}
                    placeholder="Ej: 3"
                    className="bg-gray-800 border-gray-600 text-white" />
                </div>
                <div>
                  <Label className="text-gray-300 mb-1.5 block">Paga (M)</Label>
                  <Input type="number" min="1" value={form.pay_m}
                    onChange={e => setForm(f => ({...f, pay_m: e.target.value}))}
                    placeholder="Ej: 2 (llevas 3, pagas 2)"
                    className="bg-gray-800 border-gray-600 text-white" />
                </div>
              </div>
            )}

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 mb-1.5 block">Fecha Inicio</Label>
                <Input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({...f, start_date: e.target.value}))}
                  className="bg-gray-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-300 mb-1.5 block">Fecha Fin</Label>
                <Input type="date" value={form.end_date}
                  onChange={e => setForm(f => ({...f, end_date: e.target.value}))}
                  className="bg-gray-800 border-gray-600 text-white" />
              </div>
            </div>

            {/* Zonas */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Zonas (separadas por coma, vacío = todas)</Label>
              <Input value={form.zones} onChange={e => setForm(f => ({...f, zones: e.target.value}))}
                placeholder="Ej: PALMARITO, CENTRO — dejar vacío para todas"
                className="bg-gray-800 border-gray-600 text-white" />
            </div>

            {/* Estado */}
            <div className="flex items-center gap-3">
              <Label className="text-gray-300">Estado:</Label>
              {[{ val: 1, label: '✅ Activa' }, { val: 0, label: '⛔ Inactiva' }].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setForm(f => ({...f, is_active: opt.val}))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                    form.is_active === opt.val
                      ? 'bg-green-500/20 border-green-500 text-green-300'
                      : 'bg-gray-800 border-gray-600 text-gray-400'
                  }`}
                >{opt.label}</button>
              ))}
            </div>

            {/* SKUs */}
            <div>
              <Label className="text-gray-300 mb-2 block">
                SKUs que aplica
                {form.skus.length > 0 && (
                  <Badge className="ml-2 bg-amber-500/20 text-amber-300 border-amber-500/30">{form.skus.length} seleccionados</Badge>
                )}
              </Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <Input value={skuSearch} onChange={e => setSkuSearch(e.target.value)}
                  placeholder="Buscar SKU..."
                  className="pl-8 bg-gray-800 border-gray-600 text-white text-sm h-8" />
              </div>
              <div className="max-h-40 overflow-y-auto border border-gray-700 rounded-lg bg-gray-950 p-2 space-y-1">
                {filteredSkus.slice(0, 50).map(p => (
                  <label key={p.sku} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.skus.includes(p.sku)}
                      onChange={() => toggleSku(p.sku)}
                      className="accent-amber-500"
                    />
                    <span className="text-amber-400 font-mono text-xs w-12 flex-shrink-0">{p.sku}</span>
                    <span className="text-gray-300 text-xs truncate">{p.name}</span>
                  </label>
                ))}
                {filteredSkus.length === 0 && <p className="text-gray-500 text-xs text-center py-2">Sin resultados</p>}
              </div>
              {form.skus.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.skus.map(s => (
                    <Badge key={s} className="bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1 text-xs">
                      {s}
                      <button onClick={() => toggleSku(s)}><X className="w-2.5 h-2.5" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="border-gray-600 text-gray-300">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sección C: Precios Fijos ──────────────────────────────────────────────────
const EMPTY_SP = { id: null, client_code: '', zone: '', sales_route: '', sku: '', special_price: '', start_date: '', end_date: '', is_active: 1, scope: 'client_code' };

function SpecialPricesSection({ canEdit, allSkus }) {
  const { toast } = useToast();
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_SP);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAPI('/special-prices-manage.php');
      setPrices(res.data || []);
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY_SP); setModal(true); };
  const openEdit = (p) => {
    const scope = p.client_code ? 'client_code' : p.sales_route ? 'sales_route' : 'zone';
    setForm({
      id: p.id, client_code: p.client_code || '', zone: p.zone || '',
      sales_route: p.sales_route || '', sku: p.sku || '',
      special_price: p.special_price ?? '', start_date: p.start_date || '',
      end_date: p.end_date || '', is_active: p.is_active ?? 1, scope,
    });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.sku || !form.special_price) {
      toast({ title: 'SKU y Precio son requeridos', variant: 'destructive' });
      return;
    }
    const scopeVal = form[form.scope];
    if (!scopeVal) {
      toast({ title: 'Debes especificar el valor del alcance (cliente, ruta o zona)', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: form.id,
        sku: form.sku,
        special_price: parseFloat(form.special_price),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_active: form.is_active,
        client_code: form.scope === 'client_code' ? form.client_code : null,
        sales_route: form.scope === 'sales_route' ? form.sales_route : null,
        zone: form.scope === 'zone' ? form.zone : null,
      };
      const res = await postJSON('/special-prices-manage.php', payload);
      if (!res.success) throw new Error(res.error);
      toast({ title: '✅ Precio especial guardado' });
      setModal(false);
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este precio especial?')) return;
    try {
      await deleteAPI(`/special-prices-manage.php?id=${id}`);
      toast({ title: 'Eliminado' });
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const filtered = prices.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.sku?.includes(q) || p.client_code?.includes(q) ||
           p.zone?.toLowerCase().includes(q) || p.sales_route?.toLowerCase().includes(q);
  });

  const getScopeInfo = (p) => {
    if (p.client_code) return { scope: 'client_code', val: p.client_code };
    if (p.sales_route) return { scope: 'sales_route', val: p.sales_route };
    return { scope: 'zone', val: p.zone };
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-sm text-gray-400">
        <p className="flex items-center gap-2 font-semibold text-white mb-1">
          <Target className="w-4 h-4 text-amber-400" />
          Prioridad: Cliente {'>'}  Ruta {'>'} Zona
        </p>
        <p>Cuando existe precio fijo, se ignoran promociones y GEC. El precio fijo ES el precio final.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar SKU, cliente, zona, ruta..."
            className="pl-9 bg-gray-900 border-gray-700 text-white placeholder-gray-500" />
        </div>
        {canEdit && (
          <Button onClick={openNew} size="sm" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2">
            <Plus className="w-4 h-4" /> Nuevo Precio Fijo
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No hay precios fijos configurados.</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Alcance</th>
                <th className="px-4 py-3 text-right">Precio Fijo</th>
                <th className="px-4 py-3 text-center">Vigencia</th>
                <th className="px-4 py-3 text-center">Estado</th>
                {canEdit && <th className="px-4 py-3 text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const { scope, val } = getScopeInfo(p);
                const scopeInfo = SCOPE_LABELS[scope];
                const ScopeIcon = scopeInfo.icon;
                return (
                  <tr key={p.id} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                    <td className="px-4 py-3 font-mono text-amber-400 font-semibold">{p.sku}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge className={`${scopeInfo.color} bg-gray-800 border border-gray-700 gap-1 text-xs`}>
                          <ScopeIcon className="w-3 h-3" />
                          {scopeInfo.label}
                        </Badge>
                        <span className="text-gray-300 text-sm">{val}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-400 text-base">
                      ${parseFloat(p.special_price).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">
                      {p.start_date ? `${p.start_date} → ${p.end_date || '∞'}` : 'Sin límite'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.is_active
                        ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Activo</Badge>
                        : <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-xs">Inactivo</Badge>}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Precio Fijo */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              {form.id ? 'Editar Precio Fijo' : 'Nuevo Precio Fijo'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* SKU */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">SKU *</Label>
              <select
                value={form.sku}
                onChange={e => setForm(f => ({...f, sku: e.target.value}))}
                className="w-full bg-gray-800 border border-gray-600 text-white rounded-md px-3 py-2 text-sm"
              >
                <option value="">-- Seleccionar SKU --</option>
                {allSkus.map(p => (
                  <option key={p.sku} value={p.sku}>{p.sku} — {p.name}</option>
                ))}
              </select>
            </div>

            {/* Precio */}
            <div>
              <Label className="text-gray-300 mb-1.5 block">Precio Fijo ($) *</Label>
              <Input type="number" step="0.01" min="0" value={form.special_price}
                onChange={e => setForm(f => ({...f, special_price: e.target.value}))}
                placeholder="Este precio reemplaza TODO: lista + descuentos"
                className="bg-gray-800 border-gray-600 text-white" />
            </div>

            {/* Scope */}
            <div>
              <Label className="text-gray-300 mb-2 block">Aplica a *</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(SCOPE_LABELS).map(([key, s]) => {
                  const Icon = s.icon;
                  return (
                    <button key={key} type="button"
                      onClick={() => setForm(f => ({...f, scope: key}))}
                      className={`p-2.5 rounded-xl text-center border text-xs font-medium transition-all ${
                        form.scope === key
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <Icon className="w-4 h-4 mx-auto mb-1" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2">
                <Input
                  value={form[form.scope]}
                  onChange={e => setForm(f => ({...f, [f.scope]: e.target.value}))}
                  placeholder={
                    form.scope === 'client_code' ? 'Código de cliente (ej: 1005)' :
                    form.scope === 'sales_route' ? 'Ruta de ventas (ej: RUTA 5)' :
                    'Zona comercial (ej: PALMARITO)'
                  }
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 mb-1.5 block">Fecha Inicio</Label>
                <Input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({...f, start_date: e.target.value}))}
                  className="bg-gray-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-300 mb-1.5 block">Fecha Fin</Label>
                <Input type="date" value={form.end_date}
                  onChange={e => setForm(f => ({...f, end_date: e.target.value}))}
                  className="bg-gray-800 border-gray-600 text-white" />
              </div>
            </div>

            {/* Estado */}
            <div className="flex items-center gap-3">
              <Label className="text-gray-300">Estado:</Label>
              {[{ val: 1, label: '✅ Activo' }, { val: 0, label: '⛔ Inactivo' }].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setForm(f => ({...f, is_active: opt.val}))}
                  className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                    form.is_active === opt.val
                      ? 'bg-green-500/20 border-green-500 text-green-300'
                      : 'bg-gray-800 border-gray-600 text-gray-400'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="border-gray-600 text-gray-300">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sección D: Cargos ─────────────────────────────────────────────────────────
function SurchargesSection({ canEdit }) {
  const { toast } = useToast();
  const [data, setData] = useState({ returnable_amount: 0, disposable_amount: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState({ returnable_amount: '', disposable_amount: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAPI('/surcharges-manage.php');
      const s = (res.data || [])[0] || {};
      setData(s);
      setLocal({ returnable_amount: s.returnable_amount ?? '', disposable_amount: s.disposable_amount ?? '' });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await postJSON('/surcharges-manage.php', {
        returnable_amount: parseFloat(local.returnable_amount) || 0,
        disposable_amount: parseFloat(local.disposable_amount) || 0,
      });
      if (!res.success) throw new Error(res.error);
      toast({ title: '✅ Cargos actualizados' });
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>;

  const dirty = parseFloat(local.returnable_amount) !== parseFloat(data.returnable_amount) ||
                parseFloat(local.disposable_amount) !== parseFloat(data.disposable_amount);

  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-sm text-gray-400">
        <p className="text-white font-semibold mb-1 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber-400" />
          Cargo Global por Envase
        </p>
        <p>Este monto se suma al precio final de CADA producto según su tipo de envase. Para el precio del envase individual en liquidación, edítalo por SKU en Gestión de SKUs.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { key: 'returnable_amount', label: '♻️ Cargo Envase Retornable', desc: 'Se suma al precio de SKUs retornables', color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
          { key: 'disposable_amount', label: '🗑️ Cargo Envase Desechable', desc: 'Se suma al precio de SKUs desechables', color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10' },
        ].map(item => (
          <div key={item.key} className={`rounded-2xl border ${item.border} ${item.bg} p-5`}>
            <div className="mb-3">
              <div className={`font-bold ${item.color} text-sm mb-0.5`}>{item.label}</div>
              <div className="text-gray-500 text-xs">{item.desc}</div>
            </div>
            {canEdit ? (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={local[item.key]}
                  onChange={e => setLocal(l => ({...l, [item.key]: e.target.value}))}
                  className="pl-7 bg-gray-900/60 border-gray-600 text-white text-lg font-bold"
                />
              </div>
            ) : (
              <div className={`text-3xl font-black ${item.color}`}>
                ${parseFloat(data[item.key] || 0).toFixed(2)}
              </div>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <Button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`gap-2 ${dirty ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-gray-700 text-gray-500'} font-semibold`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar Cargos
        </Button>
      )}
    </div>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────────
export default function AdminDescuentosPage() {
  const { user } = useSupabaseAuth();
  const role = user?.user_metadata?.role || user?.user_metadata?.type || '';
  const canEdit = ['admin', 'sistemas', 'administrador'].includes(role.toLowerCase());

  const [allSkus, setAllSkus] = useState([]);

  useEffect(() => {
    // Cargar catálogo de SKUs para los selectores de promociones / precios fijos
    fetch('/api/shop/admin/products-manage.php')
      .then(r => r.json())
      .then(res => setAllSkus(res.data || []))
      .catch(() => {});
  }, []);

  const tabs = [
    { id: 'gec',       label: 'GEC %',          icon: Percent,    desc: 'Descuento por nivel de cliente' },
    { id: 'promos',    label: 'Promociones',     icon: Gift,       desc: 'Por pesos o regalo NxM' },
    { id: 'especiales', label: 'Precios Fijos',  icon: Target,     desc: 'Por cliente, ruta o zona' },
    { id: 'cargos',    label: 'Cargos',          icon: DollarSign, desc: 'Cargo de envase global' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>Gestión de Descuentos | Cervezas Finas</title>
      </Helmet>

      {/* Header */}
      <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
            <Tag className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Gestión de Descuentos</h1>
            <p className="text-xs text-gray-400">
              Motor de precios: Precio Fijo → Promo$ → GEC% → Cargos
            </p>
          </div>
          {!canEdit && (
            <Badge className="ml-auto bg-gray-700 text-gray-400 border-gray-600">Solo lectura</Badge>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="gec">
          <TabsList className="bg-gray-900 border border-gray-800 p-1 rounded-xl mb-6 flex gap-1 flex-wrap h-auto">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="gec">
            <GECSection canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="promos">
            <PromosSection canEdit={canEdit} allSkus={allSkus} />
          </TabsContent>
          <TabsContent value="especiales">
            <SpecialPricesSection canEdit={canEdit} allSkus={allSkus} />
          </TabsContent>
          <TabsContent value="cargos">
            <SurchargesSection canEdit={canEdit} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
