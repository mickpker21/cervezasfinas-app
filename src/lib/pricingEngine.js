/**
 * Pricing Engine
 * 
 * Replicates logic from `cervezasfinas-shop/api/products/calculate-price.php`
 * 
 * Priority:
 * 1. Special Price (Override)
 * 2. Promotions (Dollar Amount Discount)
 * 3. GEC Discount (Percentage of remaining)
 */

export function calculateProductPrice(product, client, pricingRules) {
    const { gec = [], promotions = [], specialPrices = [], surcharges = null } = pricingRules;

    // Base Price
    let basePrice = Number(product.price || 0);
    if (!basePrice && product.current_price) basePrice = Number(product.current_price);
    // Normalized returnable factor (1.0 = Returnable, 0.0 = Disposable)
    const isReturnable = Number(product.returnable_factor || 0) === 1.0;
    // Check if product is MULTIMARCA (no GEC, no cargo)
    const isMultimarca = (product.category || '').toUpperCase() === 'MULTIMARCA';

    let finalPrice = basePrice;
    let breakdown = [];
    let promoType = 'amount_off'; // 'amount_off' | 'nxm'
    let promoMeta = null; // { buy_n, pay_m }

    // 0. Context
    // Fix: Use Mexico Time for Date Comparisons to avoid premature expiry
    const today = new Date().toLocaleString('en-CA', { timeZone: 'America/Mexico_City', hour12: false }).split(',')[0];
    const clientCode = client?.client_code || client?.id || '';
    const sku = String(product.cve_marca || product.sku || '').trim();
    const clientZone = (client?.zona_comercial || '').toUpperCase();

    // 1. Special Price (Override)
    // 1. Special Price (Override)
    // Priority: Client Specific > Zone Specific

    // Sort logic handled here or assume list is mixed.
    // We iterate to find BEST match.
    let specialOverride = null;

    // A. Check Client Specific
    specialOverride = specialPrices.find(sp => {
        const matchClient = (sp.client_code || '').toUpperCase() === clientCode.toUpperCase();
        const matchSku = (sp.sku || '') == sku;
        const startValid = !sp.start_date || sp.start_date === '0000-00-00' || sp.start_date <= today;
        const endValid = !sp.end_date || sp.end_date === '0000-00-00' || sp.end_date >= today;
        // MUST have client_code to be specific
        return sp.client_code && matchClient && matchSku && startValid && endValid;
    });

    // B. Check Zone Specific (if not found specific)
    if (!specialOverride && clientZone) {
        specialOverride = specialPrices.find(sp => {
            const matchZone = (sp.zone || '').toUpperCase() === clientZone;
            const matchSku = (sp.sku || '') == sku;
            const startValid = !sp.start_date || sp.start_date === '0000-00-00' || sp.start_date <= today;
            const endValid = !sp.end_date || sp.end_date === '0000-00-00' || sp.end_date >= today;
            // MUST have zone and NOT have client_code (or match is empty)
            return sp.zone && matchZone && matchSku && startValid && endValid;
        });
    }

    if (specialOverride) {
        finalPrice = Number(specialOverride.special_price);
        breakdown.push({
            type: 'special_price',
            label: specialOverride.client_code ? 'Precio Especial (Cliente)' : `Precio Especial (Zona ${specialOverride.zone})`,
            amount: basePrice - finalPrice
        });
        // ✅ NO aplicar cargo cuando hay precio especial (ya incluido)
    } else {
        // 2. Promotions (Amount Off & NxM)
        let promoDiscountTotal = 0;
        let activeNxM = null;

        promotions.forEach(promo => {
            // Date Check
            const startValid = !promo.start_date || promo.start_date <= today;
            const endValid = !promo.end_date || promo.end_date >= today;
            if (!startValid || !endValid) return;

            // Zone Check (New)
            if (promo.zones) {
                const allowedZones = promo.zones.split(',').map(z => z.trim().toUpperCase());
                if (!allowedZones.includes(clientZone)) return;
            }

            // SKU Check
            const promoSkus = promo.skus ? String(promo.skus).split(',') : [];
            const matches = promoSkus.length === 0 || promoSkus.includes(String(sku));

            if (matches) {
                // Check Type
                if (promo.promo_type === 'nxm') {
                    // Just flag it, logic is in Cart
                    if (!activeNxM) activeNxM = promo; // Take first matching NxM
                } else {
                    // Amount Off
                    const amt = Number(promo.discount_amount);
                    promoDiscountTotal += amt;
                    breakdown.push({
                        type: 'promotion',
                        label: promo.name || 'Promoción',
                        amount: amt
                    });
                }
            }
        });

        // Apply Amount Off
        if (promoDiscountTotal > 0) {
            finalPrice = Math.max(0, finalPrice - promoDiscountTotal);
        }

        // Flag NxM
        if (activeNxM) {
            promoType = 'nxm';
            promoMeta = { buy_n: activeNxM.buy_n, pay_m: activeNxM.pay_m, name: activeNxM.name };
            breakdown.push({
                type: 'nxm',
                label: activeNxM.name || 'Promoción NxM',
                amount: 0,
                info: `${activeNxM.buy_n}x${activeNxM.pay_m}`
            });
        }

        // 3. GEC Discount (% Off) - Only if NOT Special Price
        // Skip GEC for MULTIMARCA products
        if (clientCode && !isMultimarca) {
            const clientGecLevel = (client.level || client.gec || 'Bronce');
            const gecRule = gec.find(g => {
                const name = (g.gec_level || g.nivel_gec || '').toUpperCase();
                const levelStr = String(clientGecLevel).toUpperCase();
                // Match by Name (e.g. "PLATINO") or ID (e.g. "4")
                return name === levelStr || String(g.id) === levelStr;
            });

            if (gecRule) {
                const percent = Number(gecRule.discount_percentage);
                if (percent > 0) {
                    const discountVal = finalPrice * (percent / 100);
                    finalPrice = Math.max(0, finalPrice - discountVal);
                    breakdown.push({
                        type: 'gec_discount',
                        label: `Nivel ${clientGecLevel} (${percent}%)`,
                        amount: discountVal,
                        percentage: percent
                    });
                }
            }
        }

        // 3.5 Trade Promotions (Phase 5) - Applied after GEC, as an extra % off
        const tradePromotions = pricingRules.tradePromotions || [];
        if (tradePromotions.length > 0) {
            tradePromotions.forEach(tp => {
                const percent = Number(tp.discount_percent);
                if (percent > 0) {
                    const discountVal = finalPrice * (percent / 100);
                    finalPrice = Math.max(0, finalPrice - discountVal);
                    breakdown.push({
                        type: 'trade_promotion',
                        label: `Trade: ${tp.name} (${percent}%)`,
                        amount: discountVal,
                        percentage: percent
                    });
                }
            });
        }

        // 4. Surcharges - Applied AFTER all discounts (ONLY when NO special price)
        // Skip cargo for MULTIMARCA products
        if (!isMultimarca) {
            let surchargeAmount = 0;

            // Try to use config from database (downloaded during sync)
            if (surcharges && typeof surcharges === 'object') {
                if (isReturnable) {
                    surchargeAmount = Number(surcharges.returnable_amount || 0);
                } else {
                    surchargeAmount = Number(surcharges.disposable_amount || 0);
                }
            }

            // Apply surcharge if configured
            if (surchargeAmount > 0) {
                finalPrice += surchargeAmount;
                breakdown.push({
                    type: 'surcharge',
                    label: isReturnable ? 'Cargo Envase' : 'Cargo Desechable',
                    amount: surchargeAmount
                });
            }
        }
    }

    return {
        basePrice,
        finalPrice: Number(finalPrice.toFixed(2)),
        originalPrice: basePrice,
        price: Number(finalPrice.toFixed(2)),
        hasPromo: finalPrice < basePrice || promoType === 'nxm', // Consider NxM as promo presence
        breakdown,
        promoType,
        promoMeta,
        returnableFactor: Number(product.returnable_factor || 0)
    };
}
