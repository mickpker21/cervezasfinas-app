import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/network";
import { useToast } from "@/components/ui/use-toast";
import { FixedSizeList as List } from "@/lib/react-window-wrapper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table-component";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Trash2, Package, X } from "lucide-react";
import { getLocalProducts } from "@/repositories/productsRepository";
import { getLocalPricingRules } from "@/repositories/pricingRepository";
import { getTruckInventory } from "@/repositories/inventoryRepository";
import { createDirectSale, createPreventa } from "@/repositories/directSalesRepository";
import { fetchShopProducts, saveClientCustomPrices } from "@/repositories/shopRepository";
import { api, API_URL, getShopAuthHeaders } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { calculateProductPrice } from '@/lib/pricingEngine';
import PremiumTicket from "@/components/PremiumTicket";
import { useTicketGenerator } from "@/hooks/useTicketGenerator";
import { getProductImageUrl } from "@/lib/imageCatalog";

// Versión normal: precios + descripciones + imágenes (con fallback offline)
const fetchCombinedProductData = async (priceLevel) => {
  try {
    const { data: baseProducts, error: baseError } = await withTimeout(
      supabase.from("precios").select("*"),
      3000 // 3s timeout for products in simulator
    );

    if (baseError) throw baseError;

    return baseProducts.map((p) => ({
      ...p,
      cve_marca: p.cve_marca || p.sku,
      des_marca: p.des_marca || p.name,
      price: Number(p.price || p.current_price || p.precio || 0),
      originalPrice: Number(p.price || p.current_price || p.precio || 0),
      hasPromo: false
    }));

  } catch (e) {
    console.warn("Error fetching online products, using offline fallback", e);
    const local = await getLocalProducts();
    // Fallback Mapping: Ensure we map local columns to what component expects
    // Local DB has 'price' (base price).
    return (local || []).map(p => ({
      cve_marca: p.cve_marca,
      des_marca: p.des_marca,
      price: Number(p.price || p.current_price || p.precio || 0),
      originalPrice: Number(p.price || p.current_price || p.precio || 0),
      image_url: p.image_url,
      hasPromo: false,
      returnable_factor: p.returnable_factor || 0,
      current_price: Number(p.price || p.current_price || 0) // Needed for normalization later
    }));
  }
};

// Versión básica
const fetchBasicProductData = async () => {
  try {
    let allData = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("precios")
        .select("*")
        .range(from, from + PAGE_SIZE - 1);
        
      if (error) throw error;
      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }

      // Safety break to prevent infinite loops if API behaves weirdly
      if (from > 10000) hasMore = false;
    }

    return allData.map((p) => ({
      ...p,
      cve_marca: p.cve_marca || p.sku,
      des_marca: p.des_marca || p.name,
      originalPrice: Number(p.price || p.current_price || p.precio || 0),
      hasPromo: false,
    }));
  } catch (e) {
    console.warn("Error fetching basic products online, using offline fallback", e);
    const local = await getLocalProducts();
    return (local || []).map(p => ({
      cve_marca: p.cve_marca,
      des_marca: p.des_marca,
      price: Number(p.price || p.current_price || p.precio || 0),
      originalPrice: Number(p.price || p.current_price || p.precio || 0),
      image_url: p.image_url,
      hasPromo: false
    }));
  }
};

import ReceiptModal from "@/components/ReceiptModal";
import { BluetoothPrinterService } from "@/services/BluetoothPrinterService";

// Helper hook to measure container size
const useContainerSize = () => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = React.useRef(null);

  useEffect(() => {
    const updateSize = () => {
      if (ref.current) {
        setSize({
          width: ref.current.offsetWidth,
          height: ref.current.offsetHeight
        });
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    // Tiny delay to ensure layout is settled
    setTimeout(updateSize, 100);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return [ref, size];
};

const SalesSimulator = ({
  client,
  onOrderSaved,
  onCancel,
  hidePriceInfo = false,
  limitToStock = false,
  user,
  isTeleventa = false,
  allowPriceEdit = undefined
}) => {
  const [productListRef, listSize] = useContainerSize();
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedPresBySku, setSelectedPresBySku] = useState({});
  const [manualCargo, setManualCargo] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [inventory, setInventory] = useState({});
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  // [NEW] Hook for Ticket Generation
  const { ticketRef, generateAndShare } = useTicketGenerator();

  const clientPriceLevel = useMemo(
    () => (client?.gec || client?.level || "bronce").toLowerCase(),
    [client]
  );

  const [pricingRules, setPricingRules] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  useEffect(() => {
    let active = true;
    if (user?.id) {
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle().then(({ data }) => {
        if (active && data?.role) setCurrentUserRole(data.role);
      });
    }
    return () => { active = false; };
  }, [user?.id]);

  const isTeleventaMode = Boolean(
    isTeleventa ||
    allowPriceEdit ||
    currentUserRole === 'televenta' ||
    (typeof window !== 'undefined' && window.location.search.includes('from=televenta'))
  );

  // Solo Televenta puede editar precios. Autoventa (chofer) y Preventa (asesor-dinamico/preventa) usan estrictamente el motor de precios
  const canEditPrice = isTeleventaMode && !limitToStock && currentUserRole !== 'chofer' && currentUserRole !== 'asesor-dinamico';

  useEffect(() => {
    let cancelled = false;
    // Cargar reglas de precios y stock local si aplica
    getLocalPricingRules().then(rules => {
      if (!cancelled) {
        console.log(`%c[SIMULATOR] Pricing Rules Set: GEC=${rules.gec?.length || 0}, Promos=${rules.promotions?.length || 0}`, "color: #2ecc71; font-weight: bold;");
        setPricingRules(rules);
      }
    });

    if (limitToStock && user?.id) {
      getTruckInventory(user.id)
        .then(inv => {
          if (!cancelled) {
            console.log('[SalesSimulator] Inventory loaded:', Object.keys(inv).length);
            setInventory(inv);
          }
        })
        .catch(e => console.error('[SalesSimulator] Stock load error:', e));
    }

    return () => { cancelled = true; };
  }, [limitToStock, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const fetchProducts = async () => {
      setLoading(true);
      console.log(`[SIMULATOR] Starting product fetch for: ${client?.name} (${client?.id})`);
      
      try {
        // 1. Get Base Local Products (Catalog)
        const localProducts = await getLocalProducts();
        console.log(`[SIMULATOR] 1. Local products found: ${localProducts?.length || 0}`);

        // 2. Try to get Client-Specific Prices from MySQL (Shop API)
        let shopProducts = [];
        const effectiveClientCode = client?.client_code || client?.id;

        if (!hidePriceInfo && effectiveClientCode) {
          try {
            console.log(`[SIMULATOR] 2. Querying Shop API with identifier: ${effectiveClientCode}`);
            shopProducts = await fetchShopProducts(effectiveClientCode);
            console.log(`[SIMULATOR] 2. Shop API returned: ${shopProducts?.length || 0} products`);
          } catch (e) {
            console.warn("[SIMULATOR] Shop API fallback failed", e);
          }
        }

        // 2.3 Cargar precios del pedido anterior guardado en Supabase (preventa / preventa_items)
        let lastOrderPrices = {};
        if (client?.id) {
          try {
            const { data: lastPreventas } = await supabase
              .from('preventa')
              .select('id, created_at, preventa_items(cve_marca, unit_price)')
              .eq('client_id', client.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (lastPreventas?.preventa_items && Array.isArray(lastPreventas.preventa_items)) {
              lastPreventas.preventa_items.forEach((pi) => {
                const sku = String(pi.cve_marca || '').trim();
                const price = Number(pi.unit_price);
                if (sku && Number.isFinite(price) && price > 0) {
                  lastOrderPrices[sku] = price;
                }
              });
            }
          } catch (e) {
            console.warn('[SIMULATOR] Could not load last order prices from Supabase:', e);
          }
        }

        // 2.5 Try to fetch Global Catalog from Supabase (as a final source of truth for SKUs)
        let basicProducts = [];
        try {
          console.log(`[SIMULATOR] 3. Querying Global Supabase Catalog...`);
          basicProducts = await fetchBasicProductData();
          console.log(`[SIMULATOR] 3. Global Catalog returned: ${basicProducts?.length || 0} products`);
        } catch (e) {
          console.warn("[SIMULATOR] Supabase Catalog fallback failed", e);
        }

        if (!pricingRules) {
           console.log("[SIMULATOR] ⚠️ Waiting for Pricing Rules before final mapping...");
           return; 
        }

        // 3. Create Maps for fast lookup
        const shopMap = new Map();
        (shopProducts || []).forEach(sp => {
           const code = String(sp.cve_marca || sp.sku || "").trim();
           if (code) shopMap.set(code, sp);
        });

        const basicMap = new Map();
        (basicProducts || []).forEach(bp => {
           const code = String(bp.cve_marca || bp.sku || "").trim();
           if (code) basicMap.set(code, bp);
        });

        const localMap = new Map();
        (localProducts || []).forEach(lp => {
          const code = String(lp.cve_marca || lp.sku || "").trim();
          if (code) localMap.set(code, lp);
        });

        // 4. Merge & Calculate
        // En modo Televenta mostrar ÚNICAMENTE los SKUs activos de la Shop (evita SKUs obsoletos/inactivos)
        const allKeys = (isTeleventa && shopMap.size > 0)
          ? new Set([...shopMap.keys()])
          : new Set([
              ...localMap.keys(), 
              ...shopMap.keys(),
              ...basicMap.keys()
            ]);
        
        console.log(`[SIMULATOR] 4. Merging complete. Unique SKUs: ${allKeys.size}`);

        const hydrated = Array.from(allKeys).map(skuKey => {
          const p = localMap.get(skuKey);
          const shopItem = shopMap.get(skuKey);
          const basicItem = basicMap.get(skuKey);

          // 4.1 Determine the Base Price (Catalog Price)
          // Priority: Local > Basic > Shop Original
          const basePrice = Number(
            p?.price || 
            p?.current_price || 
            basicItem?.price || 
            basicItem?.current_price || 
            shopItem?.originalPrice || 
            shopItem?.price || 
            0
          );

          // 4.2 Create the normalized item for calculation
          const baseProduct = p ? { ...p } : (basicItem || {
            cve_marca: skuKey,
            des_marca: shopItem?.des_marca || shopItem?.name || `SKU ${skuKey}`,
            is_new: true,
            display: 1,
            returnable_factor: shopItem?.returnable_factor || basicItem?.returnable_factor || 0
          });

          const pNormal = { 
            ...baseProduct, 
            price: basePrice, 
            current_price: basePrice 
          };

          // 4.3 RUN Local calculation logic
          const localCalc = calculateProductPrice(pNormal, client, pricingRules);

          // 4.4 Decide between Local, Server, and Previous Saved Price
          let finalItem = null;

          const serverPrice = shopItem ? Number(shopItem.price) : null;
          const serverOriginal = shopItem ? Number(shopItem.originalPrice || shopItem.price) : basePrice;
          const serverBreakdown = shopItem && Array.isArray(shopItem._pricingBreakdown) ? shopItem._pricingBreakdown : [];
          const serverHasSpecial = serverBreakdown.some(b => b.type === 'special_price' || b.label === 'Precio Especial');
          const lastSavedPrice = lastOrderPrices[skuKey];

          if (serverHasSpecial && serverPrice !== null && serverPrice > 0) {
            // El cliente tiene precio especial/guardado directamente en MySQL
            finalItem = {
              ...pNormal,
              price: serverPrice,
              originalPrice: serverOriginal,
              hasPromo: serverPrice < serverOriginal,
              isPreviousSavedPrice: true,
              _pricingBreakdown: serverBreakdown
            };
          } else if (lastSavedPrice != null && lastSavedPrice > 0) {
            // Precio del último pedido guardado en Supabase para este cliente
            finalItem = {
              ...pNormal,
              price: lastSavedPrice,
              originalPrice: basePrice,
              hasPromo: lastSavedPrice < basePrice,
              isPreviousSavedPrice: true,
              _pricingBreakdown: [
                { type: 'special_price', label: 'Precio Anterior Guardado', amount: Math.max(0, basePrice - lastSavedPrice) }
              ]
            };
          } else if (shopItem) {
            const serverIsBetter = serverPrice !== null && serverPrice < (localCalc.finalPrice - 0.05);
            const serverIsEqualWithBreakdown = serverPrice !== null && Math.abs(serverPrice - localCalc.finalPrice) < 0.1 && serverBreakdown.length > 0;

            if (serverIsBetter || serverIsEqualWithBreakdown) {
              const finalBreakdown = serverBreakdown.length > 0 ? [...serverBreakdown] : [];
              if (finalBreakdown.length === 0 && serverPrice < serverOriginal) {
                 finalBreakdown.push({ type: 'promotion', label: 'Precio Shop', amount: serverOriginal - serverPrice });
              }

              finalItem = {
                ...pNormal,
                price: serverPrice,
                originalPrice: serverOriginal,
                hasPromo: serverPrice < serverOriginal || !!shopItem.hasPromo,
                _pricingBreakdown: finalBreakdown
              };
            }
          }

          // 4.5 Fallback to Local Calc (if Shop missing or Shop is more expensive)
          if (!finalItem) {
            finalItem = {
              ...pNormal,
              price: localCalc.finalPrice,
              originalPrice: localCalc.basePrice,
              hasPromo: localCalc.hasPromo || (localCalc.finalPrice < localCalc.basePrice),
              _pricingBreakdown: localCalc.breakdown
            };
          }

          return {
            ...finalItem,
            presentations: Array.isArray(shopItem?.presentations) ? shopItem.presentations : [],
            imageUrl: shopItem?.imageUrl || pNormal.image_url || null,
            photo_url: shopItem?.photo_url || null,
          };
        });

        if (!cancelled) setProducts(hydrated);
      } catch (error) {
        console.error("Error al cargar productos en simulador:", error);
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProducts();

    return () => { cancelled = true; };
  }, [client?.client_code, client?.level, hidePriceInfo, toast, pricingRules]);

  const getSimCartKey = (itemOrSku, presCode = "") => {
    if (itemOrSku && typeof itemOrSku === "object") {
      const code = itemOrSku.presentation_code || presCode || "";
      return code ? `${itemOrSku.cve_marca}__${code}` : String(itemOrSku.cve_marca || "");
    }
    return presCode ? `${itemOrSku}__${presCode}` : String(itemOrSku || "");
  };

  const getSelectedPresentation = (product) => {
    const list = Array.isArray(product?.presentations) ? product.presentations : [];
    if (list.length === 0) return null;
    const chosenCode = selectedPresBySku[product.cve_marca];
    if (chosenCode) {
      const found = list.find((pr) => pr.code === chosenCode);
      if (found) return found;
    }
    return list.find((pr) => Number(pr.is_default) === 1) || list[0];
  };

  const getEffectiveProductPrice = (product, pres) => {
    if (!pres) return Number(product.price) || 0;
    const custom = pres.custom_price != null && pres.custom_price !== "" ? Number(pres.custom_price) : 0;
    if (custom > 0) return custom;
    const div = Math.max(0.0001, Number(pres.divisor) || 1);
    if (pres.unit_price != null && Number(pres.unit_price) > 0 && !product.customPriceEdited) {
      return Number(pres.unit_price);
    }
    return Math.round(((Number(product.price) || 0) / div) * 100) / 100;
  };

  const addToCart = (product, presentation = null) => {
    const pres = presentation || getSelectedPresentation(product);
    const presCode = pres?.code || null;
    const presLabel = pres?.label || null;
    const divisor = pres ? Math.max(0.0001, Number(pres.divisor) || 1) : 1;
    const cartKey = getSimCartKey(product.cve_marca, presCode || "");
    const unitPrice = getEffectiveProductPrice(product, pres);
    const currentStock = limitToStock ? (inventory[product.cve_marca] || 0) : Infinity;

    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => getSimCartKey(item) === cartKey);
      const currentQty = existingItem ? existingItem.quantity : 0;

      if (currentQty + 1 > currentStock) {
        toast({ title: "Stock Insuficiente", description: `Solo tienes ${currentStock} disponibles.`, variant: "destructive", duration: 2000 });
        return currentCart;
      }

      if (existingItem) {
        return currentCart.map((item) => {
          if (getSimCartKey(item) !== cartKey) return item;
          const nextQty = item.quantity + 1;
          return {
            ...item,
            quantity: nextQty,
            base_quantity: Number((nextQty / divisor).toFixed(4)),
          };
        });
      }
      return [
        ...currentCart,
        {
          ...product,
          price: unitPrice,
          presentation_code: presCode,
          presentation_label: presLabel,
          presentation_divisor: divisor,
          base_quantity: Number((1 / divisor).toFixed(4)),
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (cartKeyOrSku, quantity, isBlur = false) => {
    if (quantity === '' && !isBlur) {
      setCart((current) =>
        current.map((item) => {
          if (getSimCartKey(item) !== cartKeyOrSku && item.cve_marca !== cartKeyOrSku) return item;
          return { ...item, quantity: '' };
        })
      );
      return;
    }

    const numQuantity = Number(quantity);
    const targetItem = cart.find((item) => getSimCartKey(item) === cartKeyOrSku || item.cve_marca === cartKeyOrSku);
    const sku = targetItem ? targetItem.cve_marca : cartKeyOrSku;
    const currentStock = limitToStock ? (inventory[sku] || 0) : Infinity;

    if (numQuantity > currentStock) {
      toast({ title: "Stock Insuficiente", description: `No puedes agregar más de ${currentStock}.`, variant: "destructive", duration: 2000 });
      return;
    }

    if (numQuantity > 0) {
      setCart((current) =>
        current.map((item) => {
          if (getSimCartKey(item) !== cartKeyOrSku && item.cve_marca !== cartKeyOrSku) return item;
          const div = Math.max(0.0001, Number(item.presentation_divisor) || 1);
          return {
            ...item,
            quantity: numQuantity,
            base_quantity: Number((numQuantity / div).toFixed(4)),
          };
        })
      );
    } else if (isBlur) {
      setCart((current) =>
        current.map((item) => {
          if (getSimCartKey(item) !== cartKeyOrSku && item.cve_marca !== cartKeyOrSku) return item;
          const div = Math.max(0.0001, Number(item.presentation_divisor) || 1);
          return {
            ...item,
            quantity: 1,
            base_quantity: Number((1 / div).toFixed(4)),
          };
        })
      );
    } else {
      removeFromCart(cartKeyOrSku);
    }
  };

  const updatePrice = (cve_marca, newPriceRaw) => {
    const parsed = newPriceRaw === "" ? 0 : parseFloat(newPriceRaw);
    const validPrice = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

    setProducts((currentProducts) =>
      currentProducts.map((p) =>
        p.cve_marca === cve_marca ? { ...p, price: validPrice, customPriceEdited: true } : p
      )
    );

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.cve_marca === cve_marca ? { ...item, price: validPrice, customPriceEdited: true } : item
      )
    );
  };

  const removeFromCart = (cartKeyOrSku) => {
    setCart((current) => current.filter((item) => getSimCartKey(item) !== cartKeyOrSku && item.cve_marca !== cartKeyOrSku));
  };

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        const name = p.des_marca ? String(p.des_marca).toLowerCase() : "";
        const code = p.cve_marca ? String(p.cve_marca).toLowerCase() : "";
        const query = searchTerm.toLowerCase();
        return name.includes(query) || code.includes(query);
      }),
    [products, searchTerm]
  );

  const cartTotals = useMemo(() => {
    let total = 0;
    let boxes = 0;
    let totalGec = 0;
    let totalPromo = 0;
    let totalSurcharges = 0;

    cart.forEach(item => {
      const qty = item.quantity;
      boxes += Number(item.base_quantity ?? qty) || 0;
      total += (qty * item.price);

      // Si Televenta edita precios manualmente, NO aplicar descuentos ni cargos automáticos
      if (isTeleventaMode || canEditPrice || item.customPriceEdited) {
        return;
      }

      const breakdown = item._pricingBreakdown || [];
      breakdown.forEach(b => {
        if (b.type === 'gec_discount' || b.type === 'gec') totalGec += (Number(b.amount) * qty);
        else if (b.type === 'promotion' || b.type === 'promo' || b.type === 'trade_promotion') totalPromo += (Number(b.amount) * qty);
        else if (b.type === 'surcharge' || b.type === 'cargo') {
          totalSurcharges += (Number(b.amount) * qty);
        }
      });
    });

    const extraManualCargo = (isTeleventaMode || canEditPrice) ? Math.max(0, Number(manualCargo) || 0) : 0;
    total += extraManualCargo;
    totalSurcharges += extraManualCargo;

    return {
      total,
      boxes,
      totalGec,
      totalPromo,
      totalSurcharges
    };
  }, [cart, isTeleventaMode, canEditPrice, manualCargo]);

  const cartTotal = cartTotals.total;
  const cartTotalBoxes = cartTotals.boxes;

  const savePreventa = async () => {
    if (cart.length === 0) return;
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (!user) throw new Error('No usuario autenticado');

      let resultId = null;
      let resultOffline = false;

      if (limitToStock) {
        // AUTOVENTA (Direct Sale)
        const saleData = await createDirectSale(user.id, client, cart, cartTotal, { 
          gec: cartTotals.totalGec, 
          promo: cartTotals.totalPromo,
          cargo: cartTotals.totalSurcharges
        });
        resultId = saleData.id;
        resultOffline = saleData.offline;

      } else {
        // PREVENTA (Televenta)
        const preventaItems = cart.map((item) => ({
          cve_marca: item.cve_marca,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
        }));

        const result = await createPreventa(user.id, client.id, cartTotal, preventaItems, {
          gec_discount: cartTotals.totalGec,
          promo_discount: cartTotals.totalPromo,
          cargo: cartTotals.totalSurcharges
        });
        resultId = result.id;
        resultOffline = result.offline;

        // Si es Televenta, persistir precios en MySQL (shop_special_prices) para recordar el precio del cliente si no se ha movido
        const effectiveClientCode = client?.client_code || client?.id;
        if (effectiveClientCode && resultId) {
          try {
            await api.post('/televenta/update-preventa.php', {
              preventa_id: resultId,
              client_code: String(effectiveClientCode),
              client_name: client?.business_name || client?.name || String(effectiveClientCode),
              status: isTeleventaMode ? 'confirmed' : 'pending',
              total_amount: finalTotal,
              cargo: (isTeleventaMode || canEditPrice) ? Math.max(0, Number(manualCargo) || 0) : cartTotals.totalSurcharges,
              notes: isTeleventaMode ? 'Pedido registrado por Televenta en llamada' : 'Pedido levantado en Preventa',
              items: cart.map((item) => ({
                sku: item.cve_marca,
                product_name: item.des_marca || item.name || item.cve_marca,
                quantity: Number(item.quantity) || 1,
                unit_price: Number(item.price) || 0,
                presentation_code: item.presentation_code || null,
                presentation_label: item.presentation_label || null,
                base_quantity: item.base_quantity ?? Number(item.quantity) ?? 1
              }))
            });
          } catch (syncErr) {
            console.warn('[SIMULATOR] No se pudo sincronizar preventa hacia MySQL Shop:', syncErr);
          }
        }

        if (isTeleventaMode && effectiveClientCode) {
          try {
            const pricesToPersist = cart.map((item) => ({
              sku: item.cve_marca,
              price: Number(item.price) || 0
            }));
            await saveClientCustomPrices(effectiveClientCode, pricesToPersist);
          } catch (e) {
            console.warn('[SIMULATOR] Error guardando precios de cliente en MySQL:', e);
          }
        }
      }


      // Success handling for both
      if (resultId) {
        // Prepare post-save actions data
        const isManualPricing = Boolean(isTeleventaMode || canEditPrice);
        const originalTotal = cart.reduce((sum, item) => sum + (Number(item.originalPrice || item.price) * item.quantity), 0);
        const calculatedDiff = isManualPricing ? 0 : (originalTotal - (cartTotal - cartTotals.totalSurcharges));

        const saleDetails = {
          preventaId: resultId,
          items: cart.map((item) => {
            const baseName = item.des_marca || item.name || item.cve_marca || 'Producto';
            const presTag = item.presentation_label ? ` [${item.presentation_label}]` : ' [Caja]';
            const labeled = baseName.includes('[') ? baseName : `${baseName}${presTag}`;
            return {
              ...item,
              des_marca: labeled,
              name: labeled
            };
          }),
          totalAmount: cartTotal,
          discount: calculatedDiff > 0.01 ? calculatedDiff : 0,
          gecDiscount: isManualPricing ? 0 : cartTotals.totalGec,
          promoDiscount: isManualPricing ? 0 : cartTotals.totalPromo,
          cargo: cartTotals.totalSurcharges,
          client: client,
          created_at: new Date().toISOString()
        };
        setLastSale(saleDetails);

        toast({ title: "¡Guardado!", description: resultOffline ? "Guardado offline." : "Venta registrada exitosamente.", className: "bg-green-600 text-white" });
        setCart([]);
        setManualCargo(0);

        // Refresh inventory if needed
        if (limitToStock) {
          getTruckInventory(user.id).then(setInventory).catch(() => {});
        }

        // Si el componente padre maneja el post-guardado (ej. TeleventaPage abre ReceiptModal con autoSendWhatsApp)
        if (onOrderSaved) {
          await onOrderSaved({ 
            preventaId: resultId, 
            totalAmount: cartTotal, 
            totalBoxes: cartTotalBoxes, 
            items: saleDetails.items,
            saleDetails: saleDetails,
            offline: resultOffline 
          });
          return;
        }

        // 2. Auto-Print via Bluetooth if connected
        if (BluetoothPrinterService.isConnected) {
          try {
            await BluetoothPrinterService.printTicket(saleDetails, client);
            toast({ title: "Imprimiendo...", description: "Enviando ticket a impresora Bluetooth." });
          } catch (e) {
            console.error("Auto-print failed", e);
            toast({ title: "Error impresión BT", description: "Falló la impresión automática.", variant: "warning" });
          }
        }

        // 3. Open Receipt Modal with auto WhatsApp + PDF + QR
        setShowReceipt(true);
      }
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`p-4 grid grid-cols-1 md:grid-cols-3 gap-6 h-full ${onCancel ? 'min-h-[520px]' : 'min-h-screen'}`}>
      {/* Hidden Ticket Container */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <PremiumTicket ref={ticketRef} saleData={lastSale} client={client} user={user} />
      </div>

      <div className="md:col-span-2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground flex-wrap">
            {isTeleventaMode ? "Captura de Pedido (Televenta)" : "Simulador de Venta"}
            {limitToStock && <Badge className="bg-orange-600 text-white border-0">Autoventa (Stock Limitado)</Badge>}
            {canEditPrice && <Badge className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">Precio Editable</Badge>}
          </h1>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
        <Card className="flex flex-grow flex-col border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-card-foreground flex justify-between items-center">
              <span>Cliente: {client.name}</span>
              <span className="text-sm font-normal text-muted-foreground capitalize bg-secondary px-3 py-1 rounded-full">{clientPriceLevel}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-grow flex-col pt-4">
            <Input
              placeholder="Buscar producto por nombre o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-4 bg-muted/30 border-input text-foreground placeholder:text-muted-foreground focus:ring-primary"
            />
            {loading ? (
              <p className="text-muted-foreground text-center py-10">Cargando productos...</p>
            ) : (
              <div ref={productListRef} className="flex-grow overflow-hidden bg-slate-900/50 rounded-lg border border-slate-800" style={{ height: "calc(100vh - 22rem)", minHeight: "300px" }}>
                {/* Virtualized List Container */}
                {(listSize.height > 0 || true) && (
                  <List
                    height="100%"
                    itemCount={filteredProducts.length}
                    itemSize={90} // Approx row height
                    width="100%"
                  >
                    {({ index, style }) => {
                      const product = filteredProducts[index];
                      const available = limitToStock ? (inventory[product.cve_marca] || 0) : Infinity;
                      const inCart = cart.find(c => c.cve_marca === product.cve_marca)?.quantity || 0;
                      const remaining = available - inCart;
                      const isOutOfStock = limitToStock && remaining <= 0;

                      const selectedPres = getSelectedPresentation(product);
                      const displayPrice = getEffectiveProductPrice(product, selectedPres);
                      const presentations = Array.isArray(product.presentations) ? product.presentations : [];
                      const primaryImgSrc = (() => {
                        if (product.photo_url) return product.photo_url;
                        const raw = String(product.imageUrl || product.image_url || "").trim();
                        if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) return raw;
                        if (raw && raw !== "/placeholder.svg") {
                          const clean = raw.replace(/^\/+/, "");
                          if (clean.startsWith("assets/products/")) return `https://cervezasfinas.com/api/shop/${clean}`;
                          return `https://cervezasfinas.com/${clean}`;
                        }
                        return `https://cervezasfinas.com/portafolio/${encodeURIComponent(String(product.cve_marca || "").trim())}.png`;
                      })();

                      return (
                        <div style={style} className={`flex items-center justify-between border-b border-border p-2 ${isOutOfStock ? 'opacity-40 pointer-events-none' : 'hover:bg-muted/50'}`}>
                          {/* Product Info */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="h-12 w-12 rounded-lg bg-white/5 border border-white/10 p-1 flex items-center justify-center shrink-0">
                              <img
                                src={primaryImgSrc}
                                alt={product.des_marca}
                                className="max-h-full max-w-full object-contain"
                                onError={e => {
                                  const img = e.currentTarget;
                                  const sku = String(product.cve_marca || "").trim();
                                  if (!img.dataset.triedPortafolio && sku) {
                                    img.dataset.triedPortafolio = "1";
                                    img.src = `https://cervezasfinas.com/portafolio/${encodeURIComponent(sku)}.png`;
                                    return;
                                  }
                                  if (!img.dataset.triedPhp && sku) {
                                    img.dataset.triedPhp = "1";
                                    img.src = `${API_URL}/products/image.php?sku=${encodeURIComponent(sku)}&_v=2`;
                                    return;
                                  }
                                  img.onerror = null;
                                  img.src = getProductImageUrl(sku);
                                }}
                                loading="lazy"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-foreground text-sm leading-tight truncate">{product.des_marca}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">{product.cve_marca}</p>
                              {presentations.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {presentations.map(pr => {
                                    const active = selectedPres?.code === pr.code;
                                    return (
                                      <button
                                        key={pr.code}
                                        type="button"
                                        onClick={() => setSelectedPresBySku(prev => ({ ...prev, [product.cve_marca]: pr.code }))}
                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                                          active
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                        }`}
                                      >
                                        {pr.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              {limitToStock && (
                                <div className="flex items-center gap-2 mt-1.5">
                                  <Badge variant="outline" className={`text-[10px] h-5 border px-1.5 font-normal ${remaining > 0 ? "border-green-800 text-green-500 bg-green-500/10" : "border-red-800 text-red-500 bg-red-500/10"}`}>
                                    <Package className="w-3 h-3 mr-1" />
                                    {remaining > 0 ? `${remaining} Disp.` : 'Sin Stock'}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Price */}
                          {!hidePriceInfo && (
                            <div className="text-right px-2 flex flex-col items-end">
                              {product.hasPromo && (
                                <div className="flex flex-col items-end">
                                  {product.originalPrice > product.price && (
                                    <span className="text-[11px] text-muted-foreground line-through">${Number(product.originalPrice).toFixed(2)}</span>
                                  )}
                                  {product.promoType === 'nxm' && (
                                    <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-500 h-4 px-1 mb-0.5">
                                      {product.promoMeta?.name || '3x2'}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {product.isPreviousSavedPrice && (
                                <span className="text-[9px] text-sky-400 font-medium mb-0.5 tracking-tight">
                                  Guardado previo
                                </span>
                              )}
                              {canEditPrice && (!selectedPres || Number(selectedPres.divisor) <= 1) ? (
                                <div className="flex items-center gap-1 bg-background/80 border border-border rounded-md px-1.5 py-0.5 focus-within:ring-1 focus-within:ring-primary">
                                  <span className="text-xs text-muted-foreground font-mono">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={product.price}
                                    onChange={(e) => updatePrice(product.cve_marca, e.target.value)}
                                    title="Editar precio unitario (Televenta)"
                                    className="w-20 text-right bg-transparent text-foreground font-semibold text-sm font-mono focus:outline-none rounded"
                                  />
                                </div>
                              ) : (
                                <div className="text-sm font-bold font-mono text-foreground px-1 py-0.5">
                                  ${Number(displayPrice).toFixed(2)}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action */}
                          <div className="text-center pl-2">
                            <Button
                              size="sm"
                              onClick={() => addToCart(product, selectedPres)}
                              disabled={isOutOfStock}
                              className={`rounded-full w-8 h-8 p-0 ${isOutOfStock ? 'bg-muted text-muted-foreground' : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm'}`}
                            >
                              <ShoppingCart className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    }}
                  </List>
                )
                }
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold text-foreground">Carrito</h2>
        <Card className="flex flex-col border-border bg-card shadow-sm h-full max-h-[calc(100vh-6rem)]">
          <CardContent className="pt-6 flex-1 flex flex-col overflow-hidden">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                <ShoppingCart size={48} strokeWidth={1.5} className="opacity-20" />
                <p className="font-medium">El carrito está vacío.</p>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="overflow-y-auto pr-2 space-y-3" style={{ maxHeight: "calc(100vh - 22rem)" }}>
                  {cart.map((item) => {
                    const cartKey = getSimCartKey(item);
                    return (
                    <div key={cartKey} className="flex flex-col gap-2 p-3 rounded-xl bg-secondary/30 border border-white/5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-foreground truncate" title={item.des_marca}>{item.des_marca}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground font-mono">SKU: {item.cve_marca}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              item.presentation_label
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                                : 'bg-muted text-muted-foreground border-border'
                            }`}>
                              {item.presentation_label || 'Caja'}
                            </span>
                          </div>
                          {item.promoType === 'nxm' && (
                            <span className="text-[10px] text-emerald-400 block">
                              Promoción {item.promoMeta?.name}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFromCart(cartKey)}
                          className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-full shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                        {/* Cantidad */}
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground font-semibold mb-0.5">Cant.</span>
                          <div className="flex items-center gap-1 bg-background rounded-lg border border-border p-0.5 shadow-sm">
                            <Input
                              type="number"
                              min="1"
                              max={limitToStock ? (inventory[item.cve_marca] || 999) : 999}
                              value={item.quantity ?? ''}
                              onChange={(e) => updateQuantity(cartKey, e.target.value, false)}
                              onBlur={(e) => updateQuantity(cartKey, e.target.value, true)}
                              className="h-7 w-14 text-center border-none bg-transparent p-0 text-sm font-bold text-foreground focus-visible:ring-0"
                            />
                          </div>
                        </div>

                        {/* Precio Unitario */}
                        {!hidePriceInfo && (
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground font-semibold mb-0.5">
                              {canEditPrice ? "Precio c/u ($)" : "Precio Unitario"}
                            </span>
                            {canEditPrice ? (
                              <div className="flex items-center gap-1 bg-background rounded-lg border border-border px-2 py-0.5 shadow-sm focus-within:ring-1 focus-within:ring-primary">
                                <span className="text-xs text-muted-foreground font-mono">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.price}
                                  onChange={(e) => updatePrice(item.cve_marca, e.target.value)}
                                  className="h-6 w-20 text-right border-none bg-transparent p-0 text-sm font-mono font-bold text-foreground focus:outline-none"
                                />
                              </div>
                            ) : (
                              <div className="h-6 px-1 flex items-center text-sm font-mono font-bold text-foreground">
                                ${Number(item.price || 0).toFixed(2)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Subtotal */}
                        {!hidePriceInfo && (
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] text-muted-foreground font-semibold mb-0.5">Subtotal</span>
                            <p className="text-sm font-extrabold text-green-500 font-mono">
                              ${(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
                <div className="mt-auto border-t border-border pt-4 space-y-3">
                  {!hidePriceInfo && (isTeleventaMode || canEditPrice) && (
                    <div className="flex items-center justify-between gap-2 bg-secondary/30 px-3 py-2 rounded-lg border border-border">
                      <span className="text-xs font-semibold text-muted-foreground">Cargo manual / Envase ($)</span>
                      <div className="flex items-center gap-1 bg-background rounded border border-border px-2 py-0.5">
                        <span className="text-xs text-muted-foreground font-mono">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={manualCargo}
                          onChange={(e) => setManualCargo(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))}
                          className="h-6 w-20 text-right bg-transparent text-sm font-mono font-bold text-foreground focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{hidePriceInfo ? "Cajas totales" : "Total a Pagar"}</span>
                    <span className="text-2xl font-black text-foreground">{hidePriceInfo ? Number(cartTotalBoxes.toFixed(2)) : `$${cartTotal.toFixed(2)}`}</span>
                  </div>
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-6 rounded-xl shadow-lg"
                    onClick={savePreventa}
                    disabled={isSaving}
                  >
                    {isSaving ? "Guardando..." : "CONFIRMAR PEDIDO"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ReceiptModal
        open={showReceipt}
        onOpenChange={setShowReceipt}
        saleData={lastSale}
        client={client}
        autoSendWhatsApp={true}
      />
    </div>
  );
};

export default SalesSimulator;

