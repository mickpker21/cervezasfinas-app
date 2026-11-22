import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Settings,
  Image,
  Wrench,
  Store,
  Sparkles,
  RefreshCw,
  PackagePlus,
  UploadCloud,
  Wand2,
  AlertTriangle,
  Loader2,
  Filter,
  ListChecks,
  ScanLine
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { um6Api } from '@/lib/um6Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarcodeScanner } from '@/components/um6/BarcodeScanner';

const TABS = [
  { id: 'resumen', label: 'Panel PDV', icon: ClipboardList },
  { id: 'pedidos', label: 'Pedidos', icon: Settings },
  { id: 'planogramas', label: 'Planogramas', icon: Image },
  { id: 'ajustes', label: 'Editor de productos', icon: ClipboardList },
];

const PRODUCT_IMAGE_EXTS = ['.jpg', '.png', '.jpeg', '.webp'];

  const movementOptions = [];

const statusStyles = {
  IN_TRANSIT: 'text-yellow-300',
  SENT: 'text-yellow-300',
  RECEIVED: 'text-green-400',
  REJECTED: 'text-red-400',
  DRAFT: 'text-gray-300'
};

const matchesProductSearchTerm = (item = {}, normalizedTerm) => {
  if (!normalizedTerm) return true;
  const fields = [
    item.name,
    item.display_name,
    item.commercial_name,
    item.sku,
    item.barcode,
    item.productId,
    item.product_id
  ];
  return fields.some((value) => {
    if (value === undefined || value === null) return false;
    return String(value).toLowerCase().includes(normalizedTerm);
  });
};
export default function Um6ManagerPage() {
  const { getAccessToken } = useSupabaseAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('resumen');

  const [stores, setStores] = useState([]);
  const [storeSearch, setStoreSearch] = useState('');
  const [loadingStores, setLoadingStores] = useState(true);

  const [storeCode, setStoreCode] = useState('');
  const [storeInfo, setStoreInfo] = useState(null);
  const [storeInventory, setStoreInventory] = useState([]);
  const [inventoryDraft, setInventoryDraft] = useState({});
  const [loadingStore, setLoadingStore] = useState(false);
  const [savingLevels, setSavingLevels] = useState(false);

  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('');
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({ storeCode: '', notes: '' });
  const [orderItems, setOrderItems] = useState([]);
  const [pendingItem, setPendingItem] = useState({ productId: '', quantity: '' });
  const [savingOrder, setSavingOrder] = useState(false);
  const [suggestingOrder, setSuggestingOrder] = useState(false);

  const [planograms, setPlanograms] = useState([]);
  const [planogramFilter, setPlanogramFilter] = useState('');
  const [savingPlanogram, setSavingPlanogram] = useState(false);
  const [planogramUpload, setPlanogramUpload] = useState({ storeCode: '', version: '', file: null });

  const [productCatalog, setProductCatalog] = useState([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productEditorForm, setProductEditorForm] = useState({
    productId: '',
    sku: '',
    name: '',
    barcode: '',
    defaultQuantity: '1'
  });
  const [editingProductId, setEditingProductId] = useState(null);

  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementForm, setMovementForm] = useState({
    storeCode: '',
    productId: '',
    quantity: '',
    type: 'ADJUSTMENT',
    reference: ''
  });
  const [savingMovement, setSavingMovement] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeScannerMessage, setBarcodeScannerMessage] = useState('');

  const [orderDetail, setOrderDetail] = useState(null);
  const [acceptingOrderId, setAcceptingOrderId] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const fetchStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const token = await getAccessToken();
      const data = await um6Api.listStores(token);
      setStores(data || []);
      if (!storeCode && data.length) {
        setStoreCode(data[0].code);
      }
    } catch (error) {
      toast({ title: 'No se pudieron cargar los PDV', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingStores(false);
    }
  }, [getAccessToken, storeCode, toast]);

  const loadStore = useCallback(
    async (code) => {
      if (!code) return;
      setLoadingStore(true);
      try {
        const token = await getAccessToken();
        const [storeData, inventoryData] = await Promise.all([
          um6Api.getStore(token, code),
          um6Api.getInventory(token, code)
        ]);
        setStoreInfo(storeData);
        const items = inventoryData.items || [];
        setStoreInventory(items);
        setInventoryDraft(
          items.reduce((acc, item) => {
            acc[item.product_id] = {
              minLevel: item.min_level != null ? String(item.min_level) : '',
              maxLevel: item.max_level != null ? String(item.max_level) : ''
            };
            return acc;
          }, {})
        );
      } catch (error) {
        setStoreInfo(null);
        setStoreInventory([]);
        toast({ title: 'No se pudo cargar el PDV', description: error.message, variant: 'destructive' });
      } finally {
        setLoadingStore(false);
      }
    },
    [getAccessToken, toast]
  );

  const fetchOrders = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const data = await um6Api.listOrders(token, orderFilter.trim() || undefined);
      setOrders(data || []);
    } catch (error) {
      toast({ title: 'No se pudieron cargar los pedidos', description: error.message, variant: 'destructive' });
    }
  }, [getAccessToken, orderFilter, toast]);

  const fetchPlanograms = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const data = await um6Api.listPlanograms(token, planogramFilter.trim() || undefined);
      setPlanograms(data || []);
    } catch (error) {
      toast({ title: 'No se pudieron cargar los planogramas', description: error.message, variant: 'destructive' });
    }
  }, [getAccessToken, planogramFilter, toast]);

  const fetchProductCatalog = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const data = await um6Api.listProducts(token, '');
      setProductCatalog(
        (data || []).map((row) => ({
          productId: String(row.id),
          sku: row.sku,
          name: row.name,
          barcode: row.barcode || '',
          defaultQuantity: '1'
        }))
      );
    } catch (error) {
      toast({
        title: 'No se pudo cargar el catálogo de productos',
        description: error.message || 'Intenta nuevamente',
        variant: 'destructive'
      });
    }
  }, [getAccessToken, toast]);

  useEffect(() => {
    if (!storeInventory.length) return;
    setProductCatalog((prev) => {
      const productMap = new Map(prev.map((product) => [String(product.productId), product]));
      let changed = false;
      storeInventory.forEach((item) => {
        const key = String(item.product_id ?? item.sku ?? Date.now());
        if (!productMap.has(key)) {
          productMap.set(key, {
            productId: key,
            sku: (item.sku || `SKU-${item.product_id ?? ''}`).toUpperCase(),
            name: item.name || `Producto ${item.product_id ?? ''}`,
            barcode: item.barcode || '',
            defaultQuantity: '1'
          });
          changed = true;
        }
      });
      return changed ? Array.from(productMap.values()) : prev;
    });
  }, [storeInventory]);
  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchPlanograms();
  }, [fetchPlanograms]);

  useEffect(() => {
    fetchProductCatalog();
  }, [fetchProductCatalog]);

  useEffect(() => {
    if (storeCode) {
      loadStore(storeCode);
      setOrderForm((prev) => ({ ...prev, storeCode }));
      setMovementForm((prev) => ({ ...prev, storeCode }));
      setPlanogramUpload((prev) => ({ ...prev, storeCode }));
    }
  }, [storeCode, loadStore]);
  useEffect(() => {
    if (!orderDialogOpen) {
      setCatalogSearch('');
    }
  }, [orderDialogOpen]);
  const filteredStores = useMemo(() => {
    const term = storeSearch.trim().toLowerCase();
    if (!term) return stores;
    return stores.filter(
      (store) =>
        store.code.toLowerCase().includes(term) || store.name.toLowerCase().includes(term)
    );
  }, [storeSearch, stores]);

  const lowStockItems = useMemo(
    () =>
      storeInventory.filter(
        (item) =>
          item.min_level != null &&
          Number(item.on_hand ?? 0) <= Number(item.min_level ?? 0)
      ),
    [storeInventory]
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) =>
        orderFilter.trim()
          ? order.store_code.toLowerCase().includes(orderFilter.trim().toLowerCase())
          : true
      ),
    [orderFilter, orders]
  );

  const planogramsByStore = useMemo(
    () =>
      planograms.filter((pg) =>
        planogramFilter.trim()
          ? pg.store_code.toLowerCase().includes(planogramFilter.trim().toLowerCase())
          : true
      ),
    [planogramFilter, planograms]
  );
  const filteredProductCatalog = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    if (!term) return productCatalog;
    return productCatalog.filter((product) => matchesProductSearchTerm(product, term));
  }, [catalogSearch, productCatalog]);

  const handleInventoryInputChange = (productId, field, value) => {
    setInventoryDraft((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const handleSaveLevels = async () => {
    if (!storeCode) {
      toast({ title: 'Selecciona un PDV primero', variant: 'destructive' });
      return;
    }
    const payloadItems = storeInventory
      .map((item) => {
        const draft = inventoryDraft[item.product_id] || {};
        const minLevel = draft.minLevel !== '' ? Number(draft.minLevel) : null;
        const maxLevel = draft.maxLevel !== '' ? Number(draft.maxLevel) : null;
        return {
          productId: item.product_id,
          minLevel,
          maxLevel
        };
      })
      .filter((entry) => entry.minLevel !== null || entry.maxLevel !== null);

    if (!payloadItems.length) {
      toast({ title: 'No hay cambios para guardar', variant: 'destructive' });
      return;
    }

    setSavingLevels(true);
    try {
      const token = await getAccessToken();
      await um6Api.updateInventoryLevels(token, { storeCode, items: payloadItems });
      toast({ title: 'Niveles guardados', description: 'Inventario actualizado' });
      loadStore(storeCode);
    } catch (error) {
      toast({ title: 'No se pudieron guardar los niveles', description: error.message, variant: 'destructive' });
    } finally {
      setSavingLevels(false);
    }
  };
  const handleSuggestedOrder = async () => {
    if (!storeCode) {
      toast({ title: 'Selecciona un PDV primero', variant: 'destructive' });
      return;
    }
    setSuggestingOrder(true);
    try {
      const token = await getAccessToken();
      const suggestion = await um6Api.getOrderSuggestion(token, storeCode);
      if (!suggestion.items?.length) {
        toast({ title: 'Todo en orden', description: 'El PDV está dentro de los niveles objetivo.' });
      } else {
        setOrderItems(
          suggestion.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity
          }))
        );
        setOrderForm({ storeCode, notes: 'Pedido sugerido automáticamente' });
        setActiveTab('pedidos');
      }
    } catch (error) {
      toast({ title: 'No pudimos generar el pedido', description: error.message, variant: 'destructive' });
    } finally {
      setSuggestingOrder(false);
    }
  };

  const handlePlanogramSubmit = async (event) => {
    event.preventDefault();
    if (!planogramUpload.storeCode || !planogramUpload.file) {
      toast({ title: 'Selecciona PDV y archivo', variant: 'destructive' });
      return;
    }
    setSavingPlanogram(true);
    try {
      const token = await getAccessToken();
      const formData = new FormData();
      formData.append('storeCode', planogramUpload.storeCode.trim());
      const versionValue = planogramUpload.version?.trim();
      if (versionValue) {
        formData.append('version', versionValue);
      }
      formData.append('file', planogramUpload.file);
      await um6Api.createPlanogram(token, formData);
      toast({ title: 'Planograma publicado', description: 'El PDV ya puede consultarlo.' });
      setPlanogramUpload({ storeCode, version: '', file: null });
      fetchPlanograms();
    } catch (error) {
      toast({ title: 'No se pudo subir el planograma', description: error.message, variant: 'destructive' });
    } finally {
      setSavingPlanogram(false);
    }
  };
  const appendOrderItem = (productIdValue, quantityValue) => {
    const productIdNumber = Number(productIdValue);
    const quantityNumber = Number(quantityValue);
    if (!productIdValue || Number.isNaN(productIdNumber)) {
      toast({ title: 'ID de producto inválido', variant: 'destructive' });
      return false;
    }
    if (!quantityValue || Number.isNaN(quantityNumber) || quantityNumber <= 0) {
      toast({ title: 'Cantidad inválida', variant: 'destructive' });
      return false;
    }
    setOrderItems((prev) => [
      ...prev,
      { productId: productIdNumber, quantity: quantityNumber }
    ]);
    return true;
  };

  const addItemToOrder = () => {
    if (!pendingItem.productId || !pendingItem.quantity) {
      toast({ title: 'Completa los campos del producto', variant: 'destructive' });
      return;
    }
    if (appendOrderItem(pendingItem.productId, pendingItem.quantity)) {
      setPendingItem({ productId: '', quantity: '' });
    }
  };

  const handleProductImageError = (event) => {
    const img = event.currentTarget;
    const sku = img.dataset.sku;
    const attempt = Number(img.dataset.attempt || 0);
    if (attempt < PRODUCT_IMAGE_EXTS.length - 1) {
      const nextAttempt = attempt + 1;
      img.dataset.attempt = String(nextAttempt);
      img.src = `/portafolio/${sku}${PRODUCT_IMAGE_EXTS[nextAttempt]}`;
    } else {
      img.src = '/placeholder-product.png';
    }
  };

  const resetProductEditor = () => {
    setProductEditorForm({ productId: '', sku: '', name: '', barcode: '', defaultQuantity: '1' });
    setEditingProductId(null);
  };

  const handleProductEditorSubmit = async (event) => {
    event.preventDefault();
    if (!productEditorForm.productId.trim() || !productEditorForm.name.trim() || !productEditorForm.sku.trim()) {
      toast({ title: 'Completa ID, SKU y nombre', variant: 'destructive' });
      return;
    }
    const normalizedProduct = {
      productId: productEditorForm.productId.trim(),
      sku: productEditorForm.sku.trim().toUpperCase(),
        name: productEditorForm.name.trim(),
        barcode: productEditorForm.barcode.trim(),
        defaultQuantity: productEditorForm.defaultQuantity && Number(productEditorForm.defaultQuantity) > 0
          ? String(productEditorForm.defaultQuantity)
          : '1'
      };
      setSavingProduct(true);
      try {
        const token = await getAccessToken();
        const payload = {
          id: editingProductId ? Number(editingProductId) : undefined,
          sku: normalizedProduct.sku,
          name: normalizedProduct.name,
          barcode: normalizedProduct.barcode || null,
          category: null,
          uom: 'caja',
          active: 1
        };

        // Evitar SKU duplicado en el cliente antes de llamar al backend
        if (!editingProductId) {
          const exists = productCatalog.some(
            (product) => String(product.sku).toUpperCase() === normalizedProduct.sku.toUpperCase()
          );
          if (exists) {
            toast({ title: 'Ese SKU ya existe en el catálogo', variant: 'destructive' });
            setSavingProduct(false);
            return;
          }
        }

        const saved = await um6Api.saveProduct(token, payload);
        const savedProduct = {
          productId: String(saved.id),
          sku: saved.sku,
          name: saved.name,
          barcode: saved.barcode || '',
          defaultQuantity: normalizedProduct.defaultQuantity
        };

        if (editingProductId) {
          setProductCatalog((prev) =>
            prev.map((product) =>
              String(product.productId) === String(editingProductId) ? savedProduct : product
            )
          );
          toast({ title: 'Producto actualizado' });
        } else {
          setProductCatalog((prev) => [...prev, savedProduct]);
          toast({ title: 'Producto agregado' });
        }
        resetProductEditor();
      } catch (error) {
        toast({
          title: 'No se pudo guardar el producto',
          description: error.message || 'Intenta nuevamente',
          variant: 'destructive'
        });
      } finally {
        setSavingProduct(false);
      }
  };

  const handleProductEditSelect = (product) => {
    setEditingProductId(product.productId);
    setProductEditorForm({
      productId: product.productId,
      sku: product.sku,
      name: product.name,
      barcode: product.barcode || '',
      defaultQuantity: product.defaultQuantity || '1'
    });
  };

  const openBarcodeScanner = () => {
    setBarcodeScannerMessage('');
    setBarcodeScannerOpen(true);
  };

  const handleBarcodeDetected = (rawCode) => {
    if (!rawCode) return;
    const normalized = String(rawCode).trim();
    if (!normalized) return;
    setProductEditorForm((prev) => ({ ...prev, barcode: normalized }));
    setBarcodeScannerMessage(`Código detectado: ${normalized}`);
    toast({ title: 'Código capturado', description: normalized });
    setBarcodeScannerOpen(false);
  };

  const handleProductDelete = (productId) => {
      (async () => {
        try {
          const token = await getAccessToken();
          await um6Api.deleteProduct(token, productId);
          setProductCatalog((prev) => prev.filter((product) => String(product.productId) !== String(productId)));
          if (String(editingProductId) === String(productId)) {
            resetProductEditor();
          }
          toast({ title: 'Producto eliminado' });
        } catch (error) {
          toast({
            title: 'No se pudo eliminar el producto',
            description: error.message || 'Intenta nuevamente',
            variant: 'destructive'
          });
        }
      })();
  };

  const handleOrderSubmit = async (event) => {
    event.preventDefault();
    if (!orderForm.storeCode || orderItems.length === 0) {
      toast({ title: 'Captura PDV y al menos un producto', variant: 'destructive' });
      return;
    }
    setSavingOrder(true);
    try {
      const token = await getAccessToken();
      await um6Api.createOrder(token, {
        storeCode: orderForm.storeCode.trim(),
        notes: orderForm.notes || undefined,
        items: orderItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      });
      toast({ title: 'Pedido creado', description: 'El PDV lo verá inmediatamente.' });
      setOrderItems([]);
      setOrderForm((prev) => ({ ...prev, notes: '' }));
      fetchOrders();
    } catch (error) {
      toast({ title: 'No se pudo crear el pedido', description: error.message, variant: 'destructive' });
    } finally {
      setSavingOrder(false);
    }
  };

  const removeOrderItem = (index) => {
    setOrderItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAcceptOrder = async (orderId) => {
    setAcceptingOrderId(orderId);
    try {
      const token = await getAccessToken();
      await um6Api.acceptOrder(token, orderId);
      toast({ title: 'Pedido marcado como entregado' });
      fetchOrders();
    } catch (error) {
      toast({ title: 'No se pudo actualizar el pedido', description: error.message, variant: 'destructive' });
    } finally {
      setAcceptingOrderId(null);
      setOrderDetail(null);
    }
  };

  const handleMovementSubmit = (event) => {
    if (event?.preventDefault) event.preventDefault();
    toast({
      title: 'Función no disponible',
      description: 'Los movimientos manuales solo se realizan desde el POS del PDV.',
      variant: 'destructive',
    });
  };

  const renderResumenTab = () => (
    <div className="space-y-6">
      <Card className="border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-transparent">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Explorador de PDV</p>
              <h2 className="text-2xl font-bold text-white">Selecciona un punto de venta</h2>
              <p className="text-sm text-gray-400">
                Controla inventario, planogramas y pedidos desde un solo sitio.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Buscar por código o nombre"
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                className="bg-black/40 border-white/10"
              />
              <Button variant="outline" onClick={fetchStores}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Recargar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loadingStores && (
              <div className="col-span-full rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-gray-400">
                Cargando PDVs...
              </div>
            )}
            {!loadingStores && filteredStores.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-gray-500">
                No encontramos PDVs con ese criterio.
              </div>
            )}
            {filteredStores.map((store) => (
              <button
                key={store.code}
                type="button"
                onClick={() => setStoreCode(store.code)}
                className={`rounded-2xl border p-4 text-left transition ${
                  storeCode === store.code
                    ? 'border-emerald-400 bg-emerald-500/10 text-white'
                    : 'border-white/10 bg-black/30 text-gray-300 hover:border-white/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">{store.code}</p>
                    <p className="text-lg font-semibold text-white">{store.name}</p>
                  </div>
                </div>
                {store.address && (
                  <p className="mt-2 text-xs text-gray-400 line-clamp-2">{store.address}</p>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      {storeCode && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2 border-white/10 bg-white/5">
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-white">Inventario por producto</CardTitle>
                <p className="text-sm text-gray-400">
                  Edita máximos/mínimos para alimentar el pedido sugerido.
                </p>
              </div>
              <Button onClick={handleSaveLevels} disabled={savingLevels}>
                {savingLevels && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar niveles
              </Button>
            </CardHeader>
            <CardContent className="max-h-[420px] overflow-auto rounded-2xl border border-white/10">
              {loadingStore ? (
                <div className="p-6 text-center text-sm text-gray-400">Cargando inventario...</div>
              ) : storeInventory.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  Este PDV aún no tiene inventario registrado.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-black/40 text-left text-xs uppercase text-gray-400 backdrop-blur">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="px-3 py-2 text-right">Mín</th>
                      <th className="px-3 py-2 text-right">Máx</th>
                      <th className="px-3 py-2 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeInventory.map((item) => {
                      const draft = inventoryDraft[item.product_id] || { minLevel: '', maxLevel: '' };
                      const onHand = Number(item.on_hand ?? 0);
                      const needsAttention = draft.minLevel !== '' && onHand <= Number(draft.minLevel);
                      return (
                        <tr key={item.product_id} className="border-t border-white/5 text-gray-200">
                          <td className="px-3 py-2">
                            <p className="font-semibold text-white">{item.name}</p>
                            <p className="text-xs text-gray-400">SKU {item.sku}</p>
                          </td>
                          <td className="px-3 py-2 text-right text-white">{onHand.toFixed(0)}</td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              value={draft.minLevel}
                              onChange={(e) => handleInventoryInputChange(item.product_id, 'minLevel', e.target.value)}
                              className="w-20 bg-black/30 border-white/10 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              value={draft.maxLevel}
                              onChange={(e) => handleInventoryInputChange(item.product_id, 'maxLevel', e.target.value)}
                              className="w-20 bg-black/30 border-white/10 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {needsAttention ? (
                              <span className="inline-flex items-center gap-1 text-xs text-orange-300">
                                <AlertTriangle className="h-3 w-3" />
                                Reponer
                              </span>
                            ) : (
                              <span className="text-xs text-emerald-300">OK</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  Acciones rápidas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full"
                  onClick={() => {
                    setOrderForm((prev) => ({ ...prev, storeCode }));
                    setActiveTab('pedidos');
                  }}
                >
                  <PackagePlus className="mr-2 h-4 w-4" />
                  Nuevo pedido
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={handleSuggestedOrder}
                  disabled={suggestingOrder}
                >
                  {suggestingOrder ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  Pedido sugerido
                </Button>
                <Button className="w-full hidden" variant="outline" onClick={() => setMovementDialogOpen(true)}>
                  <Wrench className="mr-2 h-4 w-4" />
                  Ajuste rápido
                </Button>
                <Button className="w-full" variant="ghost" onClick={() => setActiveTab('ajustes')}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Editor de productos
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Image className="h-4 w-4 text-emerald-300" />
                  Planograma
                </CardTitle>
                <p className="text-xs text-gray-400">Sube archivos directo al servidor.</p>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={handlePlanogramSubmit}>
                  <Input
                    placeholder="Código del PDV"
                    value={planogramUpload.storeCode}
                    onChange={(e) => setPlanogramUpload((prev) => ({ ...prev, storeCode: e.target.value.toUpperCase() }))}
                    className="bg-black/30 border-white/10"
                  />
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setPlanogramUpload((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
                    className="cursor-pointer bg-black/30 text-white file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500/20 file:px-3 file:py-1 file:text-sm file:text-emerald-200"
                  />
                  <Input
                    placeholder="Versión (opcional)"
                    value={planogramUpload.version}
                    onChange={(e) => setPlanogramUpload((prev) => ({ ...prev, version: e.target.value }))}
                    className="bg-black/30 border-white/10"
                  />
                  <Button type="submit" className="w-full" disabled={savingPlanogram}>
                    {savingPlanogram ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="mr-2 h-4 w-4" />
                    )}
                    Subir planograma
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-white">Alertas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-300">
                <p className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-emerald-300" />
                  {storeInventory.length} productos monitoreados
                </p>
                <p className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-300" />
                  {lowStockItems.length} requieren acción
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
  const pedidosTab = (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Filtrar por código de PDV"
          value={orderFilter}
          onChange={(e) => setOrderFilter(e.target.value)}
          className="max-w-xs bg-black/30 border-white/10"
        />
        <Button variant="outline" onClick={fetchOrders}>
          <Filter className="mr-2 h-4 w-4" />
          Aplicar
        </Button>
        <Button onClick={() => {
          setOrderForm((prev) => ({ ...prev, storeCode }));
          setOrderDialogOpen(true);
        }}>
          <PackagePlus className="mr-2 h-4 w-4" />
          Nuevo pedido
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {filteredOrders.length === 0 && (
          <Card className="border-white/10 bg-white/5 p-6 text-center text-sm text-gray-400 lg:col-span-2">
            Aún no hay pedidos.
          </Card>
        )}
        {filteredOrders.map((order) => (
          <Card
            key={order.id}
            className="border-white/10 bg-white/5 transition hover:border-emerald-200/60"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-white">#{order.id}</CardTitle>
                <p className="text-xs text-gray-400">{order.store_code}</p>
              </div>
              <p className={`text-xs font-semibold ${statusStyles[order.status] || 'text-gray-300'}`}>
                {order.status}
              </p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-300">
              <ul className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                {order.items?.map((item) => (
                  <li key={item.product_id} className="flex justify-between">
                    <span>{item.name || item.product_id}</span>
                    <span className="font-semibold">{item.quantity}</span>
                  </li>
                ))}
              </ul>
              {order.notes && <p className="text-xs text-gray-400">Notas: {order.notes}</p>}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setOrderDetail(order)}>
                  Ver
                </Button>
                {['IN_TRANSIT', 'SENT'].includes(order.status) && (
                  <Button
                    className="flex-1"
                    onClick={() => handleAcceptOrder(order.id)}
                    disabled={acceptingOrderId === order.id}
                  >
                    {acceptingOrderId === order.id ? 'Procesando...' : 'Confirmar entrega'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const planogramasTab = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Filtrar por código de PDV"
          value={planogramFilter}
          onChange={(e) => setPlanogramFilter(e.target.value)}
          className="max-w-xs bg-black/30 border-white/10"
        />
        <Button variant="outline" onClick={fetchPlanograms}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>
      <div className="grid gap-3">
        {planogramsByStore.length === 0 && (
          <Card className="border-white/10 bg-white/5 p-6 text-center text-sm text-gray-400">
            Sin planogramas registrados.
          </Card>
        )}
        {planogramsByStore.map((planogram) => (
          <Card key={planogram.id} className="border-white/10 bg-white/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-gray-300">
              <div>
                <p className="text-white font-semibold">{planogram.store_code}</p>
                <p className="text-xs text-gray-400">
                  Versión {planogram.version} · {new Date(planogram.uploaded_at).toLocaleString()}
                </p>
              </div>
              <a
                href={planogram.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-300 underline"
              >
                Abrir
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const ajustesTab = (
    <div className="space-y-4">
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Catálogo de productos</CardTitle>
          <p className="text-xs text-gray-400">
            Administra los productos disponibles para todos los pedidos.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-300">
          <div className="max-h-[240px] overflow-auto rounded-2xl border border-white/10">
            {productCatalog.length === 0 ? (
              <p className="p-4 text-center">Aún no hay productos registrados.</p>
            ) : (
              <table className="w-full text-left text-xs uppercase text-gray-400">
                <thead className="sticky top-0 bg-black/40 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Código de barras</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-gray-200">
                  {productCatalog.map((product) => {
                    const isEditing =
                      editingProductId !== null &&
                      String(editingProductId) === String(product.productId);
                    const rowClasses = [
                      "border-t border-white/5 transition-colors",
                      isEditing ? "bg-emerald-500/10 ring-1 ring-emerald-400/40" : "hover:bg-white/5"
                    ].join(" ");
                    return (
                      <tr key={product.productId} className={rowClasses}>
                        <td className="px-3 py-2">
                          {product.productId}
                          {isEditing && (
                            <span className="ml-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                              Editando
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{product.sku}</td>
                        <td className="px-3 py-2">{product.barcode || '—'}</td>
                        <td className="px-3 py-2">{product.name}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-emerald-300 hover:text-emerald-100"
                            onClick={() => handleProductEditSelect(product)}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-red-300 hover:text-red-100"
                            onClick={() => handleProductDelete(product.productId)}
                          >
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <form className="space-y-3" onSubmit={handleProductEditorSubmit}>
            {editingProductId && (
              <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                <p>
                  Editando producto #{editingProductId} —{' '}
                  <strong>{productEditorForm.name || 'Sin nombre'}</strong>
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                  {[
                    { label: 'ID', value: productEditorForm.productId || '—' },
                    { label: 'SKU', value: productEditorForm.sku || '—' },
                    { label: 'Código', value: productEditorForm.barcode || '—' },
                    { label: 'Cantidad', value: productEditorForm.defaultQuantity || '1' }
                  ].map((chip) => (
                    <span key={chip.label} className="rounded-full border border-emerald-400/50 px-2 py-0.5">
                      {chip.label}: {chip.value}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-gray-300">
                  ID del producto
                </Label>
                <Input
                  placeholder="ID del producto"
                  value={productEditorForm.productId}
                  onChange={(e) =>
                    setProductEditorForm((prev) => ({ ...prev, productId: e.target.value }))
                  }
                  className="bg-black/40 border-white/10"
                />
                <p className="text-[11px] text-gray-400">
                  Usa el mismo ID que en tu POS para evitar duplicados.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-gray-300">SKU</Label>
                <Input
                  placeholder="SKU"
                  value={productEditorForm.sku}
                  onChange={(e) =>
                    setProductEditorForm((prev) => ({ ...prev, sku: e.target.value }))
                  }
                  className="bg-black/40 border-white/10 uppercase"
                />
                <p className="text-[11px] text-gray-400">
                  Se guarda en mayúsculas automáticamente.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-gray-300">
                  Código de barras
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="EAN/UPC"
                    value={productEditorForm.barcode}
                    onChange={(e) =>
                      setProductEditorForm((prev) => ({ ...prev, barcode: e.target.value }))
                    }
                    className="bg-black/40 border-white/10 flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={openBarcodeScanner}
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    <ScanLine className="mr-2 h-4 w-4" />
                    Escanear
                  </Button>
                </div>
                <p className="text-[11px] text-gray-400">
                  Puedes escribirlo manualmente o capturarlo con la cámara.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-gray-300">
                  Cantidad por defecto
                </Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Cantidad por defecto"
                  value={productEditorForm.defaultQuantity}
                  onChange={(e) =>
                    setProductEditorForm((prev) => ({ ...prev, defaultQuantity: e.target.value }))
                  }
                  className="bg-black/40 border-white/10"
                />
                <p className="text-[11px] text-gray-400">
                  Se propone automáticamente al agregarlo a un pedido.
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-gray-300">
                Nombre comercial
              </Label>
              <Input
                placeholder="Nombre comercial"
                value={productEditorForm.name}
                onChange={(e) => setProductEditorForm((prev) => ({ ...prev, name: e.target.value }))}
                className="bg-black/40 border-white/10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {editingProductId && (
                <Button type="button" variant="outline" onClick={resetProductEditor}>
                  Cancelar edición
                </Button>
              )}
              <Button type="submit" className="min-w-[180px]">
                {editingProductId ? 'Actualizar producto' : 'Agregar producto'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 p-6 text-sm text-gray-300">
        <p className="text-white font-semibold">Movimientos manuales</p>
        <p className="text-xs text-gray-400">Úsalos solo cuando no puedas registrar la operación en el POS.</p>
        <Button className="mt-4" onClick={() => setMovementDialogOpen(true)}>
          <Wrench className="mr-2 h-4 w-4" />
          Registrar ajuste
        </Button>
      </Card>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'pedidos':
        return pedidosTab;
      case 'planogramas':
        return planogramasTab;
      case 'ajustes':
        return ajustesTab;
      case 'resumen':
      default:
        return renderResumenTab();
    }
  };

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Gerencia · UM6</p>
          <h1 className="text-3xl font-bold">Centro de control UM6</h1>
          <p className="text-sm text-gray-400">Gestiona inventario, planogramas y pedidos en un clic.</p>
        </div>
        <Button variant="outline" onClick={fetchStores}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refrescar todo
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
              activeTab === tab.id
                ? 'border-emerald-300 bg-emerald-500/10 text-white'
                : 'border-white/10 bg-black/30 text-gray-300 hover:border-white/30'
            }`}
          >
            <tab.icon className="h-5 w-5" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">{tab.label}</p>
              <p className="text-sm font-semibold text-white">
                {tab.id === 'resumen' && storeCode ? storeCode : tab.label}
              </p>
            </div>
          </button>
        ))}
      </div>

      {renderTabContent()}

      <Dialog
        open={orderDialogOpen}
        onOpenChange={(open) => {
          setOrderDialogOpen(open);
          if (!open) {
            setPendingItem({ productId: '', quantity: '' });
          }
        }}
      >
        <DialogContent className="w-full max-w-5xl border border-white/10 bg-[#030712] text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo pedido</DialogTitle>
            <DialogDescription className="text-gray-400">
              Captura los productos que necesita el PDV. Puedes agregar tantos artículos como necesites.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleOrderSubmit}>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-gray-400">Código del PDV</span>
              <Input
                value={orderForm.storeCode}
                onChange={(e) =>
                  setOrderForm((prev) => ({ ...prev, storeCode: e.target.value.toUpperCase() }))
                }
                placeholder="Ej. PDV001"
                className="bg-black/40 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-gray-400">Notas</span>
              <Textarea
                value={orderForm.notes}
                onChange={(e) => setOrderForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Instrucciones o comentarios para logística"
                className="min-h-[100px] bg-black/40 border-white/10"
              />
            </div>

            {productCatalog.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase text-gray-400">Catálogo disponible</p>
                  <Input
                    type="search"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Buscar por SKU, código de barras, ID o nombre"
                    className="min-w-[200px] flex-1 bg-black/40 border-white/10"
                  />
                </div>
                {filteredProductCatalog.length === 0 ? (
                  <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-gray-400">
                    No encontramos productos con ese criterio.
                  </p>
                ) : (
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                    {filteredProductCatalog.map((product) => (
                      <div
                        key={product.productId}
                        className="flex gap-3 rounded-xl border border-white/10 bg-black/30 p-3"
                      >
                        <img
                          src={`/portafolio/${product.sku}${PRODUCT_IMAGE_EXTS[0]}`}
                          data-sku={product.sku}
                          data-attempt="0"
                          onError={handleProductImageError}
                          alt={product.name}
                          className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                        />
                        <div className="flex flex-1 flex-col justify-between">
                          <div>
                            <p className="font-semibold text-white">{product.name}</p>
                            <p className="text-xs text-gray-400">{product.sku}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="justify-start text-emerald-300 hover:text-emerald-100"
                            onClick={() =>
                              appendOrderItem(product.productId, product.defaultQuantity || '1')
                            }
                          >
                            Añadir al pedido
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Productos</p>
                {orderItems.length > 0 && (
                  <span className="text-xs text-gray-400">{orderItems.length} artículos</span>
                )}
              </div>

              {orderItems.length === 0 ? (
                <p className="text-sm text-gray-400">Aún no agregas productos al pedido.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {orderItems.map((item, index) => (
                    <li
                      key={`${item.productId}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2"
                    >
                      <div className="text-gray-300">
                        <p className="font-semibold text-white">Producto #{item.productId}</p>
                        <p className="text-xs text-gray-400">Cantidad solicitada</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">{item.quantity}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-sm text-red-300 hover:text-red-100"
                          onClick={() => removeOrderItem(index)}
                        >
                          Quitar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="number"
                  min="1"
                  placeholder="ID producto"
                  value={pendingItem.productId}
                  onChange={(e) => setPendingItem((prev) => ({ ...prev, productId: e.target.value }))}
                  className="bg-black/40 border-white/10"
                />
                <Input
                  type="number"
                  min="1"
                  placeholder="Cantidad"
                  value={pendingItem.quantity}
                  onChange={(e) => setPendingItem((prev) => ({ ...prev, quantity: e.target.value }))}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <Button type="button" variant="secondary" className="w-full" onClick={addItemToOrder}>
                Agregar producto
              </Button>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setOrderDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={savingOrder || orderItems.length === 0}
              >
                {savingOrder ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Confirmar pedido'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(orderDetail)}
        onOpenChange={(open) => {
          if (!open) {
            setOrderDetail(null);
          }
        }}
      >
        <DialogContent className="max-w-lg border border-white/10 bg-[#030712] text-white">
          <DialogHeader>
            <DialogTitle>Detalle del pedido</DialogTitle>
            {orderDetail && (
              <DialogDescription className="text-gray-400">
                {orderDetail.store_code} · {orderDetail.items?.length || 0} productos
              </DialogDescription>
            )}
          </DialogHeader>
          {orderDetail && (
            <div className="space-y-4 text-sm text-gray-200">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <p className="text-xs text-gray-400">Fecha</p>
                <p className="font-semibold">
                  {new Date(orderDetail.created_at).toLocaleString()}
                </p>
              </div>
              {orderDetail.notes && (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <p className="text-xs text-gray-400">Notas</p>
                  <p>{orderDetail.notes}</p>
                </div>
              )}
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <p className="text-xs text-gray-400 mb-2">Productos</p>
                <ul className="space-y-2">
                  {orderDetail.items?.map((item) => (
                    <li key={item.product_id} className="flex items-center justify-between">
                      <span>{item.name || item.product_id}</span>
                      <span className="font-semibold">{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={barcodeScannerOpen}
        onOpenChange={(open) => {
          setBarcodeScannerOpen(open);
          if (!open) setBarcodeScannerMessage('');
        }}
      >
        <DialogContent className="max-w-2xl border border-white/10 bg-[#030712] text-white">
          <DialogHeader>
            <DialogTitle>Escanear código de barras</DialogTitle>
            <DialogDescription className="text-gray-400">
              Usa la cámara del dispositivo para capturar el código y llenarlo automáticamente.
            </DialogDescription>
          </DialogHeader>
          {barcodeScannerMessage && (
            <p className="mb-2 text-sm text-emerald-300">{barcodeScannerMessage}</p>
          )}
          <BarcodeScanner
            active={barcodeScannerOpen}
            onDetected={handleBarcodeDetected}
            onError={(error) =>
              setBarcodeScannerMessage(error?.message || 'No pudimos leer el código')
            }
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setBarcodeScannerOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent className="max-w-lg border border-white/10 bg-[#030712] text-white">
          <DialogHeader>
            <DialogTitle>Movimiento manual</DialogTitle>
            <DialogDescription className="text-gray-400">
              Ajusta existencias cuando no puedas registrar la operación en el POS.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleMovementSubmit}>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-gray-400">Código del PDV</span>
              <Input
                value={movementForm.storeCode}
                onChange={(e) =>
                  setMovementForm((prev) => ({ ...prev, storeCode: e.target.value.toUpperCase() }))
                }
                placeholder="Ej. PDV001"
                className="bg-black/40 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-gray-400">Tipo</span>
              <Select
                value={movementForm.type}
                onValueChange={(value) => setMovementForm((prev) => ({ ...prev, type: value }))}
              >
                <SelectTrigger className="bg-black/40 border-white/10 text-left">
                  <SelectValue placeholder="Selecciona tipo" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#030712] text-white">
                  {movementOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="number"
                min="1"
                placeholder="ID producto"
                value={movementForm.productId}
                onChange={(e) => setMovementForm((prev) => ({ ...prev, productId: e.target.value }))}
                className="bg-black/40 border-white/10"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Cantidad"
                value={movementForm.quantity}
                onChange={(e) => setMovementForm((prev) => ({ ...prev, quantity: e.target.value }))}
                className="bg-black/40 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-gray-400">Referencia (opcional)</span>
              <Input
                value={movementForm.reference}
                onChange={(e) => setMovementForm((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="Ej. Ajuste de inventario semanal"
                className="bg-black/40 border-white/10"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setMovementDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="w-full sm:w-auto" disabled={savingMovement}>
                {savingMovement ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  'Aplicar movimiento'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

