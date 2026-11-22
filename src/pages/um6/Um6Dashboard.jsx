import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart,
  Boxes,
  ClipboardList,
  Image,
  ScanLine,
  Sparkles,
  Camera,
  BarChart3,
  Loader2,
  Trash2,
  Plus,
  PackageSearch,
  CheckCircle2,
  Check
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { um6Api } from '@/lib/um6Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { BarcodeScanner } from '@/components/um6/BarcodeScanner';

const TABS = [
  { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { id: 'inventario', label: 'Inventario', icon: Boxes },
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
  { id: 'planograma', label: 'Planograma', icon: Image }
];

const statusStyles = {
  IN_TRANSIT: 'text-yellow-300',
  SENT: 'text-yellow-300',
  RECEIVED: 'text-green-400',
  REJECTED: 'text-red-400',
  DRAFT: 'text-gray-300'
};

const emptySummary = () => ({
  totals: { units: 0, lineItems: 0, tickets: 0 },
  topProducts: []
});

const matchesProductSearchTerm = (item = {}, normalizedTerm) => {
  if (!normalizedTerm) return true;
  const fields = [
    item.name,
    item.sku,
    item.barcode,
    item.product_id,
    item.productId
  ];
  return fields.some((value) => {
    if (value === undefined || value === null) return false;
    return String(value).toLowerCase().includes(normalizedTerm);
  });
};

export default function Um6Dashboard() {
  const { getAccessToken, user } = useSupabaseAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [planogram, setPlanogram] = useState(null);
  const [salesSummary, setSalesSummary] = useState(emptySummary());
  const [activeTab, setActiveTab] = useState('ventas');

  const [productDialog, setProductDialog] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [saleReference, setSaleReference] = useState('');
  const [saleItems, setSaleItems] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [saleQuantity, setSaleQuantity] = useState('1');
  const [submittingSale, setSubmittingSale] = useState(false);

  const [orderDetail, setOrderDetail] = useState(null);
  const [acceptingOrderId, setAcceptingOrderId] = useState(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('');
  const [lastScan, setLastScan] = useState('');
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [validationDraft, setValidationDraft] = useState({});
  const [validationFilter, setValidationFilter] = useState('');
  const [validationNotes, setValidationNotes] = useState('');
  const [validationResult, setValidationResult] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No pudimos validar tu sesión');

      const [storeData, inventoryData, ordersData, summaryData] = await Promise.all([
        um6Api.getStore(token),
        um6Api.getInventory(token),
        um6Api.listOrders(token),
        um6Api.getSalesSummary(token).catch(() => emptySummary())
      ]);

      setStore(storeData);
      setInventory(inventoryData?.items || []);
      setOrders(ordersData || []);
      setSalesSummary(summaryData || emptySummary());

      try {
        const planogramData = await um6Api.getLatestPlanogram(token);
        setPlanogram(planogramData);
      } catch (err) {
        if (err?.status === 404) {
          setPlanogram(null);
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error al cargar el POS',
        description: error.message || 'Intenta nuevamente',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredInventory = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return inventory;
    return inventory.filter((item) => matchesProductSearchTerm(item, term));
  }, [inventory, productSearch]);

  const pendingOrders = useMemo(
    () => orders.filter((order) => ['IN_TRANSIT', 'SENT'].includes(order.status)),
    [orders]
  );

  const historicOrders = useMemo(
    () => orders.filter((order) => !['IN_TRANSIT', 'SENT'].includes(order.status)),
    [orders]
  );

  const lowStock = useMemo(
    () =>
      inventory.filter(
        (item) =>
          item.min_level != null && Number(item.on_hand ?? 0) <= Number(item.min_level ?? 0)
      ),
    [inventory]
  );

  const saleTotalUnits = useMemo(
    () =>
      saleItems.reduce((acc, item) => acc + Number(item.quantity || 0), 0),
    [saleItems]
  );

  const addProductToSale = (product, quantity = 1) => {
    const safeQuantity = Number(quantity);
    if (!safeQuantity || safeQuantity <= 0) {
      toast({ title: 'Cantidad inválida', variant: 'destructive' });
      return;
    }

    setSaleItems((prev) => {
      const existing = prev.find((item) => item.product_id === product.product_id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.product_id
            ? { ...item, quantity: Number(item.quantity) + safeQuantity }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.product_id,
          name: product.name,
          sku: product.sku,
          quantity: safeQuantity
        }
      ];
    });
  };

  const handleSaleSubmit = async () => {
    if (!saleItems.length) {
      toast({ title: 'Agrega al menos un producto', variant: 'destructive' });
      return;
    }
    setSubmittingSale(true);
    try {
      const token = await getAccessToken();
      await um6Api.registerSale(token, {
        reference: saleReference || undefined,
        items: saleItems.map((item) => ({
          productId: item.product_id,
          quantity: Number(item.quantity)
        }))
      });
      toast({ title: 'Venta registrada', description: 'Inventario actualizado' });
      setSaleItems([]);
      setSaleReference('');
      setSelectedProduct(null);
      setSaleQuantity('1');
      fetchAll();
    } catch (error) {
      toast({
        title: 'No pudimos registrar la venta',
        description: error.message || 'Intenta de nuevo',
        variant: 'destructive'
      });
    } finally {
      setSubmittingSale(false);
    }
  };

  const handleAcceptOrder = async (orderId) => {
    setAcceptingOrderId(orderId);
    try {
      const token = await getAccessToken();
      await um6Api.acceptOrder(token, orderId);
      toast({ title: 'Pedido recibido', description: 'Inventario actualizado' });
      fetchAll();
    } catch (error) {
      toast({
        title: 'No se pudo aceptar el pedido',
        description: error.message || 'Intenta nuevamente',
        variant: 'destructive'
      });
    } finally {
      setAcceptingOrderId(null);
      setOrderDetail(null);
    }
  };

  const handleScannerDetected = useCallback(
    (code) => {
      if (!code) return;
      const normalized = String(code).trim().toLowerCase();
      if (!normalized || normalized === lastScan) return;
      setLastScan(normalized);

      const found = inventory.find(
        (item) => (item.sku || '').toLowerCase() === normalized
      );

      if (!found) {
        setScannerMessage(`No encontramos un producto con el código ${code}`);
        toast({
          title: 'Producto no registrado',
          description: `${code} no está en tu inventario`,
          variant: 'destructive'
        });
        return;
      }

      addProductToSale(found, 1);
      setScannerMessage(`Se agregó ${found.name}`);
      setScannerOpen(false);
    },
    [inventory, lastScan, toast]
  );

  const resetValidationSession = () => {
    setValidationDraft({});
    setValidationFilter('');
    setValidationNotes('');
    setValidationResult(null);
  };

  const startInventoryValidation = () => {
    if (!inventory.length) {
      toast({
        title: 'Inventario no disponible',
        description: 'Aún no recibimos productos para este PDV.',
        variant: 'destructive'
      });
      return;
    }
    const seed = {};
    inventory.forEach((item) => {
      seed[item.product_id] = '';
    });
    setValidationDraft(seed);
    setValidationNotes('');
    setValidationFilter('');
    setValidationResult(null);
    setValidationDialogOpen(true);
  };

  useEffect(() => {
    if (!validationDialogOpen) return;
    setValidationDraft((prev) => {
      const next = {};
      inventory.forEach((item) => {
        next[item.product_id] = Object.prototype.hasOwnProperty.call(prev, item.product_id)
          ? prev[item.product_id]
          : '';
      });
      return next;
    });
  }, [inventory, validationDialogOpen]);

  const updateValidationCount = (productId, value) => {
    setValidationDraft((prev) => ({
      ...prev,
      [productId]: value
    }));
  };

  const fillValidationCounts = () => {
    setValidationDraft((prev) => {
      const next = { ...prev };
      inventory.forEach((item) => {
        const key = item.product_id;
        if (next[key] === undefined || next[key] === '') {
          next[key] = String(Number(item.on_hand ?? 0));
        }
      });
      return next;
    });
  };

  const clearValidationCounts = () => {
    const cleared = {};
    inventory.forEach((item) => {
      cleared[item.product_id] = '';
    });
    setValidationDraft(cleared);
    setValidationResult(null);
  };

  const validationTotals = useMemo(() => {
    const totals = {
      total: inventory.length,
      captured: 0,
      matched: 0,
      short: 0,
      over: 0
    };
    inventory.forEach((item) => {
      const raw = validationDraft[item.product_id];
      if (raw === undefined || raw === '') return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      totals.captured += 1;
      const delta = parsed - Number(item.on_hand ?? 0);
      if (delta === 0) totals.matched += 1;
      else if (delta > 0) totals.over += 1;
      else totals.short += 1;
    });
    totals.pending = Math.max(0, totals.total - totals.captured);
    return totals;
  }, [inventory, validationDraft]);

  const validationEntries = useMemo(() => {
    const term = validationFilter.trim().toLowerCase();
    return inventory
      .filter((item) => matchesProductSearchTerm(item, term))
      .map((item) => {
        const raw = Object.prototype.hasOwnProperty.call(validationDraft, item.product_id)
          ? validationDraft[item.product_id]
          : '';
        const hasValue = raw !== '' && raw !== undefined;
        const parsed = hasValue ? Number(raw) : null;
        const isValid = hasValue && Number.isFinite(parsed);
        const expected = Number(item.on_hand ?? 0);
        const counted = isValid ? parsed : null;
        const delta = counted !== null ? counted - expected : null;
        let status = 'pending';
        if (isValid) {
          if (delta === 0) status = 'matched';
          else if (delta > 0) status = 'over';
          else status = 'short';
        }
        return {
          productId: item.product_id,
          sku: item.sku,
          name: item.name,
          expected,
          counted,
          delta,
          status,
          countedRaw: hasValue ? String(raw) : ''
        };
      });
  }, [inventory, validationDraft, validationFilter]);

  const handleInventoryValidationSubmit = async () => {
    if (!inventory.length) {
      toast({
        title: 'Inventario no disponible',
        description: 'No hay productos para validar.',
        variant: 'destructive'
      });
      return;
    }

    const rows = inventory
      .map((item) => {
        const raw = validationDraft[item.product_id];
        if (raw === undefined || raw === '') return null;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return null;
        const expected = Number(item.on_hand ?? 0);
        const delta = parsed - expected;
        return {
          productId: item.product_id,
          name: item.name,
          sku: item.sku,
          expected,
          counted: parsed,
          delta,
          status: delta === 0 ? 'matched' : delta > 0 ? 'over' : 'short'
        };
      })
      .filter(Boolean);

    if (!rows.length) {
      toast({
        title: 'Captura los conteos',
        description: 'Ingresa al menos un producto antes de validar.',
        variant: 'destructive'
      });
      return;
    }

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === 'matched') acc.matched += 1;
        if (row.status === 'short') acc.short += 1;
        if (row.status === 'over') acc.over += 1;
        acc.delta += row.delta;
        return acc;
      },
      { total: 0, matched: 0, short: 0, over: 0, delta: 0 }
    );

    try {
      const token = await getAccessToken();
      await um6Api.createInventoryValidation(token, {
        storeCode: store.code,
        notes: validationNotes.trim(),
        result: { rows, summary }
      });

      setValidationResult({
        rows,
        summary,
        notes: validationNotes.trim(),
        completedAt: new Date().toISOString()
      });

      toast({
        title: 'Validación enviada',
        description: `Se revisaron ${summary.total} productos. Control Interno ha sido notificado.`
      });
    } catch (error) {
      console.error('Error submitting validation:', error);
      toast({
        title: 'Error al enviar',
        description: 'No se pudo guardar la validación. Intenta nuevamente.',
        variant: 'destructive'
      });
    }
  };

  const closeValidationDialog = () => {
    setValidationDialogOpen(false);
    resetValidationSession();
  };

  const renderSummaryCard = (title, value, description, Icon) => (
    <Card className="bg-white/5 backdrop-blur border-white/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
        <CardTitle className="text-xs font-medium text-gray-300">{title}</CardTitle>
        <Icon className="h-4 w-4 text-emerald-300" />
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-[10px] text-gray-400">{description}</p>
      </CardContent>
    </Card>
  );

  const tabButton = (tab) => (
    <button
      key={tab.id}
      type="button"
      onClick={() => setActiveTab(tab.id)}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${activeTab === tab.id
        ? 'border-emerald-300 bg-emerald-400/10 text-white'
        : 'border-white/10 text-gray-300 hover:border-emerald-200/60'
        }`}
    >
      <tab.icon className="h-4 w-4" />
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{tab.label}</p>
        <p className="text-xs font-semibold text-white">{tab.id === 'ventas' ? 'POS UM6' : tab.label}</p>
      </div>
    </button>
  );

  const SaleBuilder = () => (
    <div className="grid gap-2 lg:grid-cols-5 h-full">
      <Card className="lg:col-span-3 border-white/10 bg-white/5 backdrop-blur flex flex-col">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-white text-sm">
            <Sparkles className="h-4 w-4 text-emerald-300" />
            Flujo de venta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3 flex-1 flex flex-col">
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[180px]">
              <Input
                placeholder="Busca por nombre o SKU"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="bg-black/20 border-white/10 h-8 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setProductDialog(true)} className="h-8 text-xs">
              <PackageSearch className="mr-2 h-3 w-3" />
              Explorar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setScannerMessage(''); setScannerOpen(true); }} className="h-8 text-xs">
              <ScanLine className="mr-2 h-3 w-3" />
              Escanear
            </Button>
          </div>

          {selectedProduct ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Producto seleccionado</p>
                <h3 className="text-sm font-semibold text-white">{selectedProduct.name}</h3>
                <p className="text-[10px] text-gray-500">SKU {selectedProduct.sku}</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={saleQuantity}
                  onChange={(e) => setSaleQuantity(e.target.value)}
                  className="w-20 bg-black/40 border-white/10 h-8 text-sm"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    addProductToSale(selectedProduct, Number(saleQuantity || 1));
                    setSaleQuantity('1');
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Agregar
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-gray-400">
              Selecciona un producto para comenzar.
            </div>
          )}

          <Textarea
            placeholder="Referencia del ticket (opcional)"
            value={saleReference}
            onChange={(e) => setSaleReference(e.target.value)}
            className="bg-black/20 border-white/10 min-h-[40px] h-10 text-xs py-2"
          />

          <div className="rounded-xl border border-white/10 bg-black/30 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-white/5 px-3 py-2 shrink-0">
              <p className="text-xs font-semibold text-white">Productos en la venta</p>
              <span className="text-[10px] text-gray-400">
                {saleItems.length} art · {saleTotalUnits} uds
              </span>
            </div>
            {saleItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400 flex-1 flex items-center justify-center">
                Aún no agregas ningún producto.
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-xs">
                  <thead className="text-left text-[10px] uppercase text-gray-400 sticky top-0 bg-black/40 backdrop-blur">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Cant</th>
                      <th className="px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleItems.map((item) => (
                      <tr key={item.product_id} className="border-t border-white/5">
                        <td className="px-3 py-1 font-semibold truncate max-w-[120px]">{item.name}</td>
                        <td className="px-3 py-1 text-gray-400">{item.sku}</td>
                        <td className="px-3 py-1 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={item.quantity}
                            onChange={(e) =>
                              setSaleItems((prev) =>
                                prev.map((entry) =>
                                  entry.product_id === item.product_id
                                    ? { ...entry, quantity: Number(e.target.value || 0) }
                                    : entry
                                )
                              )
                            }
                            className="w-16 bg-black/30 border-white/10 h-6 text-xs text-right inline-block"
                          />
                        </td>
                        <td className="px-3 py-1 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              setSaleItems((prev) =>
                                prev.filter((entry) => entry.product_id !== item.product_id)
                              )
                            }
                          >
                            <Trash2 className="h-3 w-3 text-red-300" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between shrink-0">
            <p className="text-xs text-gray-400">
              Total: <span className="font-semibold text-white">{saleTotalUnits} uds</span>
            </p>
            <Button
              size="sm"
              onClick={handleSaleSubmit}
              disabled={saleItems.length === 0 || submittingSale}
              className="h-8 text-xs"
            >
              {submittingSale ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Registrar venta
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 border-white/10 bg-gradient-to-b from-emerald-500/10 to-cyan-500/10 text-white flex flex-col">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4" />
            Ventas del día
          </CardTitle>
          <p className="text-[10px] text-white/70">
            Actualizado al registrar venta.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 p-3 flex-1 overflow-y-auto">
          <div className="grid gap-2 sm:grid-cols-2">
            {renderSummaryCard(
              'Unidades',
              `${salesSummary.totals.units} uds`,
              `${salesSummary.totals.tickets} tickets`,
              ShoppingCart
            )}
            {renderSummaryCard(
              'Líneas',
              salesSummary.totals.lineItems,
              'Totales hoy',
              BarChart3
            )}
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-white/80">
              Productos estrella
            </p>
            <ul className="mt-2 space-y-1">
              {salesSummary.topProducts.length === 0 ? (
                <li className="text-xs text-white/60">Sin ventas hoy.</li>
              ) : (
                salesSummary.topProducts.map((product) => (
                  <li
                    key={product.productId}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                  >
                    <div>
                      <p className="text-xs font-semibold">{product.name}</p>
                      <p className="text-[10px] text-white/60">SKU {product.sku}</p>
                    </div>
                    <span className="text-xs font-bold">{product.units} uds</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const InventoryView = () => (
    <div className="space-y-2 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-white">Inventario disponible</h3>
          <p className="text-[10px] text-gray-400">
            Confirma que el conteo físico coincide con lo registrado en UM6.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={startInventoryValidation}
          disabled={!inventory.length}
          className="min-w-[160px] h-8 text-xs"
        >
          <CheckCircle2 className="mr-2 h-3 w-3" />
          Validar inventario
        </Button>
      </div>
      {lowStock.length > 0 && (
        <div className="rounded-xl border border-orange-400/40 bg-orange-500/10 p-2 text-xs text-orange-100 shrink-0">
          <p className="font-semibold">Alerta de mínimos</p>
          <p className="opacity-80">
            {lowStock.length} productos están por debajo de su mínimo. Refuerza pronto.
          </p>
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 overflow-y-auto flex-1 content-start">
        {inventory.length === 0 ? (
          <Card className="border-white/10 bg-white/5 p-4 text-center text-xs text-gray-400 md:col-span-2 xl:col-span-3">
            Aún no hay productos registrados en tu inventario.
          </Card>
        ) : (
          inventory.map((item) => (
            <Card
              key={item.product_id}
              className="border-white/10 bg-white/5 backdrop-blur transition hover:border-emerald-200/40"
            >
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm text-white truncate">{item.name}</CardTitle>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">SKU {item.sku}</p>
              </CardHeader>
              <CardContent className="space-y-1 p-3 pt-0 text-xs text-gray-300">
                <div className="flex items-center justify-between">
                  <span>Disponible</span>
                  <span className="text-lg font-semibold text-white">
                    {Number(item.on_hand ?? 0).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>Máx {item.max_level ?? '-'}</span>
                  <span>Mín {item.min_level ?? '-'}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  const OrdersView = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white">Pedidos en ruta</h3>
        <p className="text-sm text-gray-400">
          Acepta los pedidos una vez que llegue el camión para sumar al inventario.
        </p>
        <div className="mt-4 grid gap-4">
          {pendingOrders.length === 0 && (
            <Card className="border-white/10 bg-white/5 p-4 text-sm text-gray-400">
              No tienes pedidos en tránsito por ahora.
            </Card>
          )}
          {pendingOrders.map((order) => (
            <Card key={order.id} className="border-white/10 bg-white/5">
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-400 uppercase tracking-wide">Pedido</p>
                    <p className="text-xl font-semibold text-white">#{order.id}</p>
                  </div>
                  <p className={`text-sm font-semibold ${statusStyles[order.status] || 'text-gray-300'}`}>
                    {order.status}
                  </p>
                </div>
                <ul className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
                  {order.items?.map((item) => (
                    <li key={item.product_id} className="flex justify-between">
                      <span>{item.name || item.product_id}</span>
                      <span className="font-semibold">{item.quantity}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setOrderDetail(order)}
                    className="flex-1"
                  >
                    Ver detalle
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => handleAcceptOrder(order.id)}
                    disabled={acceptingOrderId === order.id}
                  >
                    {acceptingOrderId === order.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Aceptar pedido
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white">Histórico</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {historicOrders.length === 0 && (
            <Card className="border-white/10 bg-white/5 p-4 text-sm text-gray-400">
              No hay pedidos históricos todavía.
            </Card>
          )}
          {historicOrders.map((order) => (
            <Card key={order.id} className="border-white/10 bg-black/30">
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span>#{order.id}</span>
                  <span>{new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <p className={`text-sm font-semibold ${statusStyles[order.status] || 'text-gray-300'}`}>
                  {order.status}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  const PlanogramView = () => (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Image className="h-5 w-5 text-emerald-300" />
          Planograma UM6
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-gray-300">
        {planogram ? (
          <>
            <p>
              Versión <strong>{planogram.version}</strong> ·{' '}
              {new Date(planogram.uploaded_at).toLocaleString()}
            </p>
            <a
              href={planogram.file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-emerald-300 underline"
            >
              Abrir planograma
            </a>
            <p className="text-xs text-gray-400">
              Asegúrate de replicar el acomodo para evitar ajustes.
            </p>
          </>
        ) : (
          <p className="text-gray-400">Tu gerente aún no ha cargado un planograma.</p>
        )}
      </CardContent>
    </Card>
  );

  const renderCurrentTab = () => {
    if (activeTab === 'inventario') return <InventoryView />;
    if (activeTab === 'pedidos') return <OrdersView />;
    if (activeTab === 'planograma') return <PlanogramView />;
    return <SaleBuilder />;
  };

  return (
    <div className="space-y-2 text-white h-[calc(100vh-2rem)] flex flex-col">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent p-3 shadow-xl shadow-emerald-500/10 shrink-0">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">POS UM6</p>
              <h1 className="text-xl font-black text-white leading-tight">
                {store ? store.name : 'Cargando PDV'}
              </h1>
              <p className="text-xs text-gray-300">
                Ruta: {user?.user_metadata?.route_number || user?.user_metadata?.route || '---'}
              </p>
            </div>
            <div className="h-8 w-px bg-white/10 mx-2 hidden lg:block"></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="h-8 text-xs">
                <Loader2 className={`mr-2 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 flex-1 max-w-3xl">
            {renderSummaryCard(
              'Ventas (hoy)',
              `${salesSummary.totals.units} uds`,
              `${salesSummary.totals.tickets} tickets`,
              ShoppingCart
            )}
            {renderSummaryCard(
              'Alertas',
              lowStock.length,
              'Mínimos',
              Camera
            )}
            {renderSummaryCard(
              'Pedidos',
              pendingOrders.length,
              'Activos',
              ClipboardList
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-2 md:grid-cols-4 shrink-0">{TABS.map((tab) => tabButton(tab))}</div>

      {renderCurrentTab()}

      <Dialog
        open={validationDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeValidationDialog();
          }
        }}
      >
        <DialogContent className="max-w-5xl border border-white/10 bg-[#030712] text-white">
          <DialogHeader>
            <DialogTitle>Validación de inventario</DialogTitle>
            <DialogDescription className="text-gray-400">
              Compara las existencias físicas contra lo registrado en UM6. Este registro solo vive
              en tu navegador.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-400">Productos</p>
                <p className="text-xl font-semibold text-white">{validationTotals.total}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-400">Conteos capturados</p>
                <p className="text-xl font-semibold text-white">{validationTotals.captured}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-400">Pendientes</p>
                <p className="text-xl font-semibold text-white">{validationTotals.pending}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-400">Diferencias</p>
                <p className="text-xl font-semibold text-white">
                  {validationTotals.short + validationTotals.over}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Buscar por nombre, SKU o código de barras"
                value={validationFilter}
                onChange={(e) => setValidationFilter(e.target.value)}
                className="flex-1 min-w-[220px] bg-black/30 border-white/10"
              />
              <Button
                variant="outline"
                onClick={fillValidationCounts}
                disabled={!inventory.length}
              >
                Usar stock del sistema
              </Button>
              <Button variant="ghost" onClick={clearValidationCounts}>
                Limpiar conteos
              </Button>
            </div>

            <div className="max-h-[360px] overflow-y-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Stock (UM6)</th>
                    <th className="px-3 py-2 text-right">Conteo físico</th>
                    <th className="px-3 py-2 text-right">Diferencia</th>
                    <th className="px-3 py-2 text-right">Estado</th>
                    <th className="px-3 py-2 text-right">Atajos</th>
                  </tr>
                </thead>
                <tbody>
                  {validationEntries.length === 0 ? (
                    <tr>
                      <td className="p-4 text-center text-gray-400" colSpan={6}>
                        {inventory.length === 0
                          ? 'No hay productos para validar.'
                          : 'Sin resultados para tu búsqueda.'}
                      </td>
                    </tr>
                  ) : (
                    validationEntries.map((entry) => {
                      const delta =
                        entry.delta == null
                          ? '—'
                          : entry.delta > 0
                            ? `+${entry.delta}`
                            : entry.delta;
                      const statusClasses =
                        entry.status === 'matched'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : entry.status === 'short'
                            ? 'bg-red-500/10 text-red-300'
                            : entry.status === 'over'
                              ? 'bg-orange-500/10 text-orange-300'
                              : 'bg-white/5 text-gray-400';
                      const statusLabel =
                        entry.status === 'matched'
                          ? 'Coincide'
                          : entry.status === 'short'
                            ? 'Faltante'
                            : entry.status === 'over'
                              ? 'Sobrante'
                              : 'Pendiente';
                      return (
                        <tr key={entry.productId} className="border-b border-white/5">
                          <td className="px-3 py-2">
                            <p className="font-semibold text-white">{entry.name}</p>
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              SKU {entry.sku}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-300">
                            {Number(entry.expected).toFixed(0)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={entry.countedRaw ?? ''}
                              onChange={(e) =>
                                updateValidationCount(entry.productId, e.target.value)
                              }
                              className="bg-black/40 border-white/10 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={`font-semibold ${entry.delta == null
                                ? 'text-gray-400'
                                : entry.delta === 0
                                  ? 'text-emerald-300'
                                  : entry.delta > 0
                                    ? 'text-orange-300'
                                    : 'text-red-300'
                                }`}
                            >
                              {delta}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClasses}`}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                updateValidationCount(
                                  entry.productId,
                                  String(entry.expected ?? 0)
                                )
                              }
                              title="Marcar como coincide"
                            >
                              <Check className="h-4 w-4 text-emerald-300" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <Textarea
              placeholder="Notas u observaciones (opcional)"
              value={validationNotes}
              onChange={(e) => setValidationNotes(e.target.value)}
              className="bg-black/30 border-white/10"
            />

            {validationResult && (
              <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/5 p-4 text-sm text-white">
                <p className="font-semibold">Última validación</p>
                <p className="text-xs text-emerald-200">
                  Generada el {new Date(validationResult.completedAt).toLocaleString()}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-4 text-center text-xs uppercase tracking-wide text-gray-300">
                  <div className="rounded-xl border border-white/10 p-2">
                    <p className="text-lg font-semibold text-white">
                      {validationResult.summary.total}
                    </p>
                    <p>Total contados</p>
                  </div>
                  <div className="rounded-xl border border-white/10 p-2">
                    <p className="text-lg font-semibold text-emerald-300">
                      {validationResult.summary.matched}
                    </p>
                    <p>Coinciden</p>
                  </div>
                  <div className="rounded-xl border border-white/10 p-2">
                    <p className="text-lg font-semibold text-red-300">
                      {validationResult.summary.short}
                    </p>
                    <p>Faltantes</p>
                  </div>
                  <div className="rounded-xl border border-white/10 p-2">
                    <p className="text-lg font-semibold text-orange-300">
                      {validationResult.summary.over}
                    </p>
                    <p>Sobrantes</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-300">
                  Diferencia total:{' '}
                  <span
                    className={`font-semibold ${validationResult.summary.delta === 0
                      ? 'text-emerald-300'
                      : validationResult.summary.delta > 0
                        ? 'text-orange-300'
                        : 'text-red-300'
                      }`}
                  >
                    {validationResult.summary.delta > 0
                      ? `+${validationResult.summary.delta}`
                      : validationResult.summary.delta}
                  </span>
                </p>
                {validationResult.notes && (
                  <p className="mt-2 text-xs text-gray-200">Notas: {validationResult.notes}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeValidationDialog}>
              Cerrar
            </Button>
            <Button onClick={handleInventoryValidationSubmit} disabled={!inventory.length}>
              Generar resumen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent className="max-w-3xl bg-gray-950 text-white">
          <DialogHeader>
            <DialogTitle>Inventario disponible</DialogTitle>
            <DialogDescription>
              Selecciona un producto para agregarlo al ticket.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Buscar por nombre, SKU o código de barras"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="bg-black/30 border-white/10"
          />
          <div className="max-h-[360px] overflow-y-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-gray-400" colSpan={4}>
                      Sin resultados.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => (
                    <tr key={item.product_id} className="border-b border-white/5">
                      <td className="px-3 py-2 font-semibold">{item.name}</td>
                      <td className="px-3 py-2 text-gray-300">{item.sku}</td>
                      <td className="px-3 py-2 text-right">
                        {Number(item.on_hand ?? 0).toFixed(0)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedProduct(item);
                            setProductDialog(false);
                          }}
                        >
                          Seleccionar
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="max-w-2xl bg-gray-950 text-white">
          <DialogHeader>
            <DialogTitle>Escanear código de barras</DialogTitle>
            <DialogDescription>Permite que la cámara detecte automáticamente el SKU.</DialogDescription>
          </DialogHeader>
          {scannerMessage && (
            <p className="mb-2 text-sm text-emerald-300">{scannerMessage}</p>
          )}
          <BarcodeScanner
            active={scannerOpen}
            onDetected={handleScannerDetected}
            onError={(error) => setScannerMessage(error?.message || 'No pudimos escanear')}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScannerOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!orderDetail} onOpenChange={(open) => !open && setOrderDetail(null)}>
        <DialogContent className="max-w-lg bg-gray-950 text-white">
          <DialogHeader>
            <DialogTitle>Pedido #{orderDetail?.id}</DialogTitle>
            <DialogDescription>
              {orderDetail && new Date(orderDetail.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {orderDetail && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between text-xs uppercase">
                <span>Estatus:</span>
                <span className={statusStyles[orderDetail.status] || 'text-gray-300'}>
                  {orderDetail.status}
                </span>
              </div>
              <ul className="space-y-1 rounded border border-white/10 p-3">
                {orderDetail.items?.map((item) => (
                  <li key={item.product_id} className="flex justify-between">
                    <span>{item.name || item.product_id}</span>
                    <span className="font-semibold">{item.quantity}</span>
                  </li>
                ))}
              </ul>
              {orderDetail.notes && (
                <p className="text-xs text-gray-400">Notas: {orderDetail.notes}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOrderDetail(null)}>
              Cerrar
            </Button>
            {orderDetail && ['IN_TRANSIT', 'SENT'].includes(orderDetail.status) && (
              <Button
                onClick={() => handleAcceptOrder(orderDetail.id)}
                disabled={acceptingOrderId === orderDetail.id}
              >
                {acceptingOrderId === orderDetail.id ? 'Procesando...' : 'Aceptar pedido'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
