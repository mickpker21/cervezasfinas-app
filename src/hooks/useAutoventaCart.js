import { useState, useMemo, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { calculateProductPrice } from '@/lib/pricingEngine';
import { getTruckInventory } from '@/repositories/inventoryRepository';
import { createDirectSale } from '@/repositories/directSalesRepository';
import { getLocalPricingRules } from '@/repositories/pricingRepository';

export function useAutoventaCart(user, client) {
    const { toast } = useToast();
    const [cart, setCart] = useState([]);
    const [inventory, setInventory] = useState({});
    const [pricingRules, setPricingRules] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [totalGec, setTotalGec] = useState(0);

    // Helpers
    const loadInventory = () => {
        if (!user || !user.id) return;
        getTruckInventory(user.id).then(inv => {
            console.log('[Autoventa] Inventory Refreshed:', Object.keys(inv).length);
            setInventory(inv);
        }).catch(e => console.error('[Autoventa] Inventory Error:', e));
    };

    // Load Stock & Rules
    useEffect(() => {
        if (!user || !user.id) return;
        loadInventory();
        // 2. Load Pricing Rules
        getLocalPricingRules().then(rules => {
            console.log('[useAutoventaCart] 📋 Pricing Rules Loaded:', {
                gec: rules.gec?.length || 0,
                promotions: rules.promotions?.length || 0,
                specialPrices: rules.specialPrices?.length || 0,
                hasSurcharges: !!rules.surcharges
            });
            if (rules.gec?.length > 0) {
                console.log('[useAutoventaCart] GEC Levels:', rules.gec);
            }
            if (rules.promotions?.length > 0) {
                console.log('[useAutoventaCart] Active Promotions:', rules.promotions.map(p => p.name));
            }
            setPricingRules(rules);
        });
    }, [user]);

    // Add Item
    const addToCart = (product) => {
        // 🔍 DEBUG: Ver breakdown del producto al agregarlo
        console.log('🛒 [ADD TO CART]', product.cve_marca || product.sku);
        console.log('   Precio:', product.price);
        console.log('   Breakdown:', product._pricingBreakdown);

        const currentStock = (inventory[product.cve_marca] || 0);

        setCart((currentCart) => {
            const existingItem = currentCart.find((item) => item.cve_marca === product.cve_marca);
            const currentQty = existingItem ? existingItem.quantity : 0;

            if (currentQty + 1 > currentStock) {
                toast({
                    title: "Stock Insuficiente",
                    description: `Solo tienes ${currentStock} disponibles.`,
                    variant: "destructive",
                    duration: 2000
                });
                return currentCart;
            }

            // Calculate Price dynamically OR use Hydrated Price (from Session)
            let finalPrice, basePrice, breakdown, promoType, promoMeta;

            // Fix: Trust the Session-Hydrated Price/Breakdown if available to avoid discrepancies
            if (product._pricingBreakdown) {
                finalPrice = product.price;
                basePrice = product.originalPrice || product.price;
                breakdown = product._pricingBreakdown;
                // Preserve metadata if present
                promoType = product.promoType || 'custom_shop_price';
                promoMeta = product.promoMeta;
            } else {
                const calc = calculateProductPrice(product, client, pricingRules);
                finalPrice = calc.finalPrice;
                basePrice = calc.basePrice;
                breakdown = calc.breakdown;
                promoType = calc.promoType;
                promoMeta = calc.promoMeta;
            }

            const itemToAdd = {
                ...product,
                price: finalPrice,
                originalPrice: basePrice,
                promoType: promoType,
                promoMeta: promoMeta,
                _pricingBreakdown: breakdown,
                quantity: currentQty + 1
            };

            if (existingItem) {
                return currentCart.map((item) =>
                    item.cve_marca === product.cve_marca ? itemToAdd : item
                );
            }
            return [...currentCart, itemToAdd];
        });
    };

    // Remove / Update
    const updateQuantity = (cve_marca, quantity) => {
        const numQuantity = Number(quantity);
        const currentStock = (inventory[cve_marca] || 0);

        if (numQuantity > currentStock) {
            toast({
                title: "Stock Insuficiente",
                description: `No puedes agregar más de ${currentStock}.`,
                variant: "destructive",
                duration: 2000
            });
            return;
        }

        if (numQuantity > 0) {
            setCart((current) => current.map((item) => {
                if (item.cve_marca === cve_marca) {
                    // Recalculate generic logic if needed, but price is usually fixed per unit unless tiered
                    return { ...item, quantity: numQuantity };
                }
                return item;
            }));
        } else {
            setCart((current) => current.filter((item) => item.cve_marca !== cve_marca));
        }
    };

    // Calculate Totals (Memoized)
    const cartTotals = useMemo(() => {
        let total = 0;
        let totalBoxes = 0;
        let totalGec = 0;
        let totalPromo = 0;
        let totalSurcharges = 0;

        const processedCart = cart.map(item => {
            let itemTotal = item.quantity * item.price;

            // Accumulate Breakdown
            const qty = item.quantity;
            const breakdown = item._pricingBreakdown || [];
            if (Array.isArray(breakdown)) {
                breakdown.forEach(bd => {
                    if (bd.type === 'gec_discount') totalGec += (bd.amount * qty);
                    if (bd.type === 'promotion' || bd.type === 'special_price') totalPromo += (bd.amount * qty);
                    if (bd.type === 'surcharge') totalSurcharges += (bd.amount * qty);
                });
            }

            total += itemTotal;
            totalBoxes += Number(item.quantity);

            return { ...item, itemTotal };
        });

        return {
            total,
            totalBoxes,
            items: processedCart,
            totalGec,
            totalPromo,
            totalSurcharges
        };
    }, [cart]);

    // Save Sale
    const checkout = async (paymentTerm = 'CONTADO', paymentMethod = 'EFECTIVO', notes = '') => {
        if (isSaving || cart.length === 0) return null;
        setIsSaving(true);


        try {
            // Prepare Payload
            const saleData = {
                ...client,
                // Direct Sale specific fields
            };

            const productsPayload = cartTotals.items.map(p => ({
                cve_marca: p.cve_marca,
                quantity: p.quantity,
                price: p.price,
                originalPrice: p.originalPrice,
                total: p.itemTotal,
                promo_type: p.promoType // Include metadata for receipt
            }));

            // Calculate breakdown totals BEFORE saving
            let totalGec = 0;
            let totalPromo = 0;
            let totalSurcharges = 0;

            cart.forEach(item => {
                const qty = item.quantity;
                const breakdown = item._pricingBreakdown || [];
                if (Array.isArray(breakdown)) {
                    breakdown.forEach(bd => {
                        if (bd.type === 'gec_discount') totalGec += (bd.amount * qty);
                        if (bd.type === 'promotion' || bd.type === 'special_price') totalPromo += (bd.amount * qty);
                        if (bd.type === 'surcharge') totalSurcharges += (bd.amount * qty); // Sum surcharges
                    });
                }
            });

            // Prepare Cargo (Quantity only, as requested)
            // User requested "solo deberia de ser la cantidad"
            const cargoValue = totalSurcharges > 0 ? totalSurcharges.toFixed(2) : null;

            // 🔍 DEBUG: Log completo del checkout
            console.log('═══════════════════════════════════════════════════');
            console.log('🔍 [CHECKOUT DEBUG] Cálculo de descuentos');
            console.log('═══════════════════════════════════════════════════');
            console.log('📊 TOTALES CALCULADOS:');
            console.log('  GEC Discount:', totalGec.toFixed(2));
            console.log('  Promo Discount:', totalPromo.toFixed(2));
            console.log('  Cargo (Surcharge):', cargoValue || '0.00');
            console.log('  Total Amount:', cartTotals.total.toFixed(2));
            console.log('');
            console.log('📦 ITEMS EN CARRITO:', cart.length);
            cart.forEach((item, idx) => {
                console.log(`  [${idx + 1}] ${item.des_marca || item.cve_marca}`);
                console.log(`      Cantidad: ${item.quantity}`);
                console.log(`      Precio Unit: $${item.price?.toFixed(2) || '0.00'}`);
                console.log('      Breakdown:', item._pricingBreakdown);
            });
            console.log('═══════════════════════════════════════════════════');

            // Toast visual para el usuario
            toast({
                title: "🔍 Debug: Descuentos Calculados",
                description: `GEC: $${totalGec.toFixed(2)} | Promo: $${totalPromo.toFixed(2)} | Cargo: $${cargoValue || '0.00'}`,
                duration: 8000,
                variant: "default"
            });

            // Call Repository
            // Call Repository with correct positional arguments: (userId, client, items, total, discounts)
            const result = await createDirectSale(
                user.id,
                client,
                cartTotals.items,
                cartTotals.total, // Note: This total already INCLUDES surcharges if calculateProductPrice added them to item.price
                {
                    gec: totalGec > 0 ? totalGec.toFixed(2) : 0,
                    promo: totalPromo > 0 ? totalPromo.toFixed(2) : 0,
                    cargo: cargoValue // Pass numeric string "15.00"
                }
            );

            console.log('[useAutoventaCart] Checkout Details:', {
                totalGec: totalGec.toFixed(2),
                totalPromo: totalPromo.toFixed(2),
                cargoValue,
                totalAmount: cartTotals.total
            });

            // Refresh Local Inventory UI
            if (result) {
                loadInventory();
            }

            return result; // { success: true, saleId: ... }

        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "No se pudo guardar la venta.", variant: "destructive" });
            return null;
        } finally {
            setIsSaving(false);
        }
    };

    return {
        cart,
        inventory,
        addToCart,
        updateQuantity,
        cartTotals,
        checkout,
        isSaving,
        pricingRules
    };
}
