import React, { useState, useRef } from 'react';
import {
    Star, Gift, Sparkles, Check, Minus, Plus, Trash2, ShoppingCart,
    RotateCw, RotateCcw, Building2, Tag, Package, Maximize2
} from 'lucide-react';

function extractProductSpecs(product, brandName) {
    const rawName = String(product?.name || '');
    const upperName = rawName.toUpperCase();
    const upperBrand = String(brandName || product?.brand || '').toUpperCase().trim();

    // 1. EMPRESA
    let company = String(product?.company || product?.empresa || product?.manufacturer || '').trim();
    if (!company) {
        if (/HEINEKEN|TECATE|INDIO|DOS EQUIS|XX|SOL|BOHEMIA|CARTA BLANCA|AMSTEL|SUPERIOR|STRONGBOW|COORS|MILLER|AFFLIGEM|NOCHE BUENA|KLÖSTER|KLOSTER|LADRÓN/i.test(`${upperBrand} ${upperName}`)) {
            company = 'HEINEKEN MÉXICO';
        } else if (/CORONA|MODELO|VICTORIA|PACIFICO|PACÍFICO|STELLA|MICHELOB|BUD/i.test(`${upperBrand} ${upperName}`)) {
            company = 'GRUPO MODELO';
        } else if (/COCA|SPRITE|FANTA|CIEL|SIDRAL|TOPO CHICO|POWERADE|DEL VALLE/i.test(`${upperBrand} ${upperName}`)) {
            company = 'COCA-COLA FEMSA';
        } else {
            company = 'CERVEZAS FINAS';
        }
    }

    // 2. MARCA
    const brand = String(brandName || product?.brand || '').trim() || 'Cervezas Finas';

    // 3. PRESENTACIÓN (Envase / tipo)
    let packaging = String(product?.presentation || product?.presentacion || product?.packaging || '').trim();
    if (!packaging) {
        if (/\bBARRIL\b|\bKEG\b/i.test(upperName)) packaging = 'Barril';
        else if (/\bLATA\b|\bLATON\b|\bLATÓN\b|\bBOTE\b|\bCAN\b|\bL\s+(?:190|210|250|330|355|473|710)\b/i.test(upperName)) packaging = 'Lata';
        else if (/\bRETORNABLE\b|\bRET\b|\bCAGUAMA\b|\bCAGUAMON\b|\bCAGUAMÓN\b|\bMEDIA\b|\bCUARTO\b|\bFAMILIAR\b/i.test(upperName)) packaging = 'Botella Retornable';
        else if (/\bNO RETORNABLE\b|\bNR\b|\bBOTELLA\b|\bVIDRIO\b|\bAMPOLLETA\b/i.test(upperName)) packaging = 'Botella No Retornable';
        else if (/\bPET\b/i.test(upperName)) packaging = 'Botella PET';
        else if (product?.category) packaging = String(product.category).trim();
        else packaging = 'Caja Estándar';
    }

    // 4. TAMAÑO (Volumen / contenido)
    let size = String(product?.size || product?.tamano || product?.tamaño || product?.volume || '').trim();
    if (!size) {
        const sizeMatch = rawName.match(/\b(\d+(?:[.,]\d+)?\s*(?:ML|L|LT|LTS|OZ|GR|G|KG))\b/i);
        if (sizeMatch) {
            size = sizeMatch[1].replace(/\s+/g, ' ').toUpperCase();
        } else {
            // Detectar volúmenes típicos escritos sin unidad (ej. "AMSTEL ULTRA 4x6 NR 355", "L 473", "325")
            const mlCodeMatch = upperName.match(/\b(190|210|235|250|300|325|330|355|473|500|710|940|1000|1200)\b/);
            if (mlCodeMatch) {
                const mlVal = Number(mlCodeMatch[1]);
                size = mlVal >= 1000 ? `${(mlVal / 1000).toFixed(mlVal % 1000 === 0 ? 0 : 1)} L` : `${mlVal} ML`;
            } else if (/\bCAGUAM[OÓ]N\b/i.test(upperName)) {
                size = '1.2 L';
            } else if (/\bCAGUAMA\b/i.test(upperName)) {
                size = '940 ML';
            } else if (/\bLAT[OÓ]N\b/i.test(upperName)) {
                size = '473 ML';
            } else if (/\bMEDIA\b/i.test(upperName)) {
                size = '355 ML';
            } else if (/\bCUARTO\b|\bAMPOLLETA\b/i.test(upperName)) {
                size = '210 ML';
            } else {
                size = 'Estándar';
            }
        }
    }

    return { company, brand, packaging, size };
}

export default function ProductCard3D({
    product,
    productBrandName,
    presentations,
    selectedPres,
    cartKey,
    cartQty,
    qty,
    numericQty,
    isEditingNewPositiveQty,
    price,
    originalPrice,
    isRealPromo,
    isSpecialPrice,
    isFrequent,
    showPrices,
    showSubUnitOverlay,
    imageUrl,
    placeholderSvg,
    apiUrl,
    onSelectPresentation,
    onUpdateQuantity,
    onSetDirectQuantity,
    onNormalizeQuantityOnBlur,
    onAddToCart,
    onRemoveFromCart
}) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const leaveTimerRef = useRef(null);

    const specs = extractProductSpecs(product, productBrandName);

    const canHoverDesktop = () =>
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const handleMouseEnter = () => {
        if (!canHoverDesktop()) return;
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }
        setIsFlipped(true);
    };

    const handleMouseLeave = () => {
        if (!canHoverDesktop()) return;
        if (isInputFocused) return;
        leaveTimerRef.current = setTimeout(() => {
            setIsFlipped(false);
        }, 140);
    };

    const toggleFlip = (e) => {
        if (e) e.stopPropagation();
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }
        setIsFlipped((prev) => !prev);
    };

    const displayPresentations = presentations.length > 0
        ? presentations
        : [{ code: 'CAJA', label: 'Por Caja', unit_price: price, divisor: 1 }];

    const specRows = [
        { icon: Building2, label: 'Empresa', value: specs.company },
        { icon: Tag, label: 'Marca', value: specs.brand },
        { icon: Package, label: 'Presentación', value: specs.packaging },
        { icon: Maximize2, label: 'Tamaño', value: specs.size }
    ];

    return (
        <div
            data-product-brand={productBrandName}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="perspective-1200 relative w-full h-[390px] sm:h-[325px] select-none"
        >
            <div
                className="shop-card-3d-inner preserve-3d relative w-full h-full"
                style={{
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                }}
            >
                {/* ==================== CARA FRONTAL (3D SHOWCASE) ==================== */}
                <div
                    onClick={toggleFlip}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleFlip(e);
                        }
                    }}
                    className={`backface-hidden absolute inset-0 rounded-[22px] overflow-hidden cursor-pointer flex flex-col bg-white transition-all duration-300 ${
                        cartQty > 0
                            ? 'border-[2.5px] border-emerald-500 shadow-[0_18px_38px_-8px_rgba(16,185,129,0.48)] ring-4 ring-emerald-400/30'
                            : 'border border-slate-200/80 shadow-[0_10px_26px_-12px_rgba(15,23,42,0.16)]'
                    }`}
                >
                    {/* Banda superior destacada cuando el producto ya está en el carrito */}
                    {cartQty > 0 && (
                        <div className="relative z-30 w-full bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600 text-white px-3 py-1 flex items-center justify-center gap-1.5 shadow-sm">
                            <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" />
                            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">
                                {cartQty} en carrito
                            </span>
                        </div>
                    )}

                    {/* Badges superiores */}
                    <div className={`absolute ${cartQty > 0 ? 'top-9' : 'top-2.5'} left-2.5 z-10 flex flex-col gap-1 items-start max-w-[65%]`}>
                        {showPrices && isSpecialPrice && (
                            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[9px] sm:text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
                                <Star className="w-2.5 h-2.5 fill-current" />
                                PRECIO ESPECIAL
                            </div>
                        )}
                        {showPrices && isRealPromo && !isSpecialPrice && (
                            <div className="bg-gradient-to-r from-rose-600 to-red-500 text-white text-[9px] sm:text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
                                <Gift className="w-2.5 h-2.5" />
                                PROMO
                            </div>
                        )}
                        {isFrequent && (
                            <div className="bg-amber-500/95 text-white text-[9px] sm:text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" />
                                FRECUENTE
                            </div>
                        )}
                    </div>

                    {/* Escenario del producto (aspect-[4/5] exacto para que el recuadro rojo de piezas encaje sobre el original) */}
                    <div className="relative flex-1 flex items-center justify-center p-1.5 bg-white overflow-hidden">
                        <div className="relative aspect-[4/5] h-full max-w-full flex items-center justify-center">
                            <img
                                src={imageUrl}
                                alt={product.name}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-contain mix-blend-multiply"
                                onError={(e) => {
                                    const img = e.currentTarget;
                                    if (!img.dataset.triedPhpFallback && product.has_photo !== false) {
                                        img.dataset.triedPhpFallback = '1';
                                        img.src = `${apiUrl}/products/image.php?sku=${encodeURIComponent(product.sku)}&_v=2`;
                                        return;
                                    }
                                    img.onerror = null;
                                    img.src = placeholderSvg;
                                }}
                            />
                            {showSubUnitOverlay && (
                                <div className="absolute top-[7%] right-[9%] w-[38%] h-[40%] bg-[#D90416] text-white rounded-[12px] sm:rounded-[15px] border-[1.5px] border-[#1e3a8a]/75 shadow-md flex flex-col items-center justify-center p-0.5 text-center pointer-events-none z-[5]">
                                    {Number(selectedPres.pieces_count) > 0 ? (
                                        <>
                                            <span className="text-[14px] sm:text-xl font-black leading-none tracking-tight">
                                                {selectedPres.pieces_count}
                                            </span>
                                            <span className="text-[6.5px] sm:text-[8px] font-extrabold uppercase tracking-wider mt-0.5 leading-none">
                                                PIEZAS
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-[8.5px] sm:text-[10px] font-black uppercase leading-tight px-0.5">
                                            {selectedPres.label}
                                        </span>
                                    )}
                                    <span className="mt-0.5 bg-white text-[#D90416] text-[6px] sm:text-[7.5px] font-black uppercase px-1 py-0.5 rounded leading-none max-w-[92%] truncate">
                                        {selectedPres.sub_label || selectedPres.label}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pie de tarjeta frontal */}
                    <div className={`p-2 sm:p-3 border-t flex flex-col gap-1 transition-colors ${
                        cartQty > 0 ? 'bg-emerald-50/80 border-emerald-200' : 'bg-white border-slate-100'
                    }`}>
                        <div className="flex items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded-md truncate">
                                {specs.brand}
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 shrink-0">
                                {specs.size}
                            </span>
                        </div>

                        <h3 className="font-extrabold text-slate-800 text-[11px] sm:text-xs leading-snug line-clamp-2 min-h-[28px] sm:min-h-[32px]">
                            {product.name}
                        </h3>

                        {/* EN TELÉFONO (< sm): Selector directo de Paquetes/Piezas + Precio + Cantidad y Agregar desde el principio */}
                        <div className="sm:hidden space-y-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
                            {presentations.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {presentations.map((pres) => {
                                        const isActivePres = selectedPres?.code === pres.code;
                                        return (
                                            <button
                                                key={pres.code}
                                                type="button"
                                                onClick={() => onSelectPresentation(product.sku, pres.code)}
                                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border leading-tight whitespace-nowrap transition-all ${
                                                    isActivePres
                                                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                                                        : 'bg-slate-50 text-slate-700 border-slate-200'
                                                }`}
                                            >
                                                {pres.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-1">
                                {showPrices ? (
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-sm font-black text-slate-900">
                                            ${parseFloat(price || 0).toFixed(2)}
                                        </span>
                                        {isRealPromo && parseFloat(originalPrice) > parseFloat(price) && (
                                            <span className="text-[9px] text-slate-400 line-through">
                                                ${parseFloat(originalPrice).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 truncate">
                                        Precio Televenta
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={toggleFlip}
                                    aria-label="Ver detalles"
                                    title="Ver detalles del producto"
                                    className="w-6 h-6 inline-flex items-center justify-center text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 border border-emerald-200 rounded-full shrink-0 transition-all"
                                >
                                    <RotateCw className="w-3 h-3" />
                                </button>
                            </div>

                            <div className="grid grid-cols-[1fr_auto] items-center gap-1 w-full">
                                <div className={`flex items-center min-w-0 justify-between rounded-lg border px-0.5 h-8 ${
                                    cartQty > 0 ? 'bg-white border-emerald-300' : 'bg-slate-50 border-slate-200'
                                }`}>
                                    <button
                                        type="button"
                                        onClick={() => onUpdateQuantity(product, -1, selectedPres)}
                                        className="w-6 h-full flex items-center justify-center text-slate-500 active:text-rose-600 shrink-0"
                                    >
                                        <Minus className="w-3 h-3" />
                                    </button>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={qty}
                                        onChange={(e) => onSetDirectQuantity(cartKey, e.target.value)}
                                        onBlur={() => onNormalizeQuantityOnBlur(product, selectedPres)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.currentTarget.blur();
                                                onAddToCart(product, numericQty, selectedPres);
                                            }
                                        }}
                                        className={`font-black text-xs w-full max-w-[38px] text-center bg-transparent focus:outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                            cartQty > 0 ? 'text-emerald-700' : 'text-slate-800'
                                        }`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onUpdateQuantity(product, 1, selectedPres)}
                                        className="w-6 h-full flex items-center justify-center text-slate-500 active:text-emerald-600 shrink-0"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                </div>

                                {cartQty > 0 && !isEditingNewPositiveQty ? (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveFromCart(cartKey)}
                                        title="Eliminar del carrito"
                                        className="bg-rose-500 active:bg-rose-600 text-white h-8 w-8 rounded-lg flex items-center justify-center shadow-sm shrink-0"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onAddToCart(product, numericQty, selectedPres)}
                                        title={isEditingNewPositiveQty ? 'Actualizar cantidad' : 'Agregar al carrito'}
                                        className="bg-emerald-600 active:bg-emerald-700 text-white h-8 w-8 rounded-lg flex items-center justify-center shadow-sm shrink-0"
                                    >
                                        {isEditingNewPositiveQty ? (
                                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                        ) : (
                                            <ShoppingCart className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* EN PC (sm+): Precio + CTA (al pasar el ratón gira en 3D con detalles y controles) */}
                        <div className="hidden sm:flex items-center justify-between gap-2 pt-0.5">
                            {showPrices ? (
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-base sm:text-xl font-black text-slate-900">
                                        ${parseFloat(price || 0).toFixed(2)}
                                    </span>
                                    {isRealPromo && parseFloat(originalPrice) > parseFloat(price) && (
                                        <span className="text-[10px] sm:text-xs text-slate-400 line-through font-medium">
                                            ${parseFloat(originalPrice).toFixed(2)}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                    Precio Televenta
                                </span>
                            )}

                            {cartQty > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-emerald-600 px-2.5 py-1 rounded-lg shadow-sm shrink-0">
                                    <Check className="w-3 h-3 stroke-[3]" /> En carrito ({cartQty})
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg shrink-0">
                                    Pedir <RotateCw className="w-3 h-3" />
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ==================== CARA TRASERA (FICHA EN FILAS + PEDIDO) ==================== */}
                <div
                    className={`backface-hidden rotate-y-180 absolute inset-0 rounded-[22px] overflow-hidden flex flex-col cursor-pointer bg-gradient-to-br from-[#041d13] via-[#072f1f] to-[#0a442d] text-white ${
                        cartQty > 0
                            ? 'border-[2.5px] border-emerald-400 ring-4 ring-emerald-400/25 shadow-[0_20px_44px_-10px_rgba(16,185,129,0.5)]'
                            : 'border border-emerald-400/35 shadow-[0_20px_42px_-12px_rgba(4,29,19,0.65)]'
                    }`}
                    onClick={toggleFlip}
                >
                    <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-emerald-400/15 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-teal-400/10 blur-2xl" />

                    {/* Cabecera trasera */}
                    <div className="relative z-10 px-2.5 pt-2 pb-1.5 border-b border-white/10 flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                            <p className="text-[9px] font-mono font-bold text-emerald-300/90 uppercase tracking-wider leading-none">
                                SKU #{product.sku}
                            </p>
                            <h4 className="text-[11px] font-black text-white leading-tight line-clamp-1 mt-0.5" title={product.name}>
                                {product.name}
                            </h4>
                        </div>
                        <button
                            type="button"
                            onClick={toggleFlip}
                            aria-label="Volver a la foto"
                            title="Volver a la foto"
                            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-emerald-100 text-[9px] font-bold border border-white/15 transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            <span className="hidden sm:inline">Foto</span>
                        </button>
                    </div>

                    {/* Lista en FILAS compactas: EMPRESA, MARCA, PRESENTACIÓN, TAMAÑO (en móvil solo ícono a la izquierda para más espacio) */}
                    <div className="relative z-10 px-2.5 py-1 space-y-1">
                        {specRows.map(({ icon: Icon, label, value }) => (
                            <div
                                key={label}
                                title={`${label}: ${value}`}
                                className="flex items-center justify-between gap-1.5 rounded-md bg-white/[0.07] border border-white/10 px-2 py-[3px] backdrop-blur-sm"
                            >
                                <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-wider text-emerald-300/90 shrink-0">
                                    <Icon className="w-3 h-3 sm:w-2.5 sm:h-2.5 shrink-0 text-emerald-400" />
                                    <span className="hidden sm:inline">{label}</span>
                                </span>
                                <span
                                    className="text-[10px] font-extrabold text-white text-right truncate"
                                    title={value}
                                >
                                    {value}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Selector de Formato de Compra (aprovecha todo el espacio disponible sin cortarse ni dejar hueco vacío) */}
                    <div
                        className="relative z-10 flex-1 min-h-0 flex flex-col px-2.5 pt-1 pb-1.5 cursor-default"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-200/80 mb-1 shrink-0">
                            Formato de compra
                        </p>
                        <div className="flex flex-wrap content-start gap-1 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                            {displayPresentations.map((pres) => {
                                const isActivePres = selectedPres
                                    ? selectedPres.code === pres.code
                                    : pres.code === 'CAJA';
                                return (
                                    <button
                                        key={pres.code}
                                        type="button"
                                        onClick={() => {
                                            if (presentations.length > 0) {
                                                onSelectPresentation(product.sku, pres.code);
                                            }
                                        }}
                                        className={`text-[9px] sm:text-[9.5px] font-extrabold px-2 py-1 rounded-md border leading-tight whitespace-nowrap transition-all ${
                                            isActivePres
                                                ? 'bg-emerald-500 text-white border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.45)]'
                                                : 'bg-white/10 text-emerald-100 border-white/15 hover:bg-white/20'
                                        }`}
                                    >
                                        {pres.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Precio activo + Cantidad + Botón Carrito (no voltea la tarjeta al tocar) */}
                    <div
                        className="relative z-10 mt-auto px-2.5 pb-2.5 pt-1.5 border-t border-white/10 bg-black/25 cursor-default"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-1 mb-1">
                            {showPrices ? (
                                <div className="flex items-baseline gap-1 min-w-0">
                                    <span className="text-sm sm:text-base font-black text-emerald-300">
                                        ${parseFloat(price || 0).toFixed(2)}
                                    </span>
                                    <span className="text-[9px] text-emerald-100/70 font-semibold truncate">
                                        / {selectedPres?.label || 'Caja'}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[9.5px] font-bold text-amber-300 truncate">
                                    Precio asignado por Televenta
                                </span>
                            )}
                            {cartQty > 0 && (
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-emerald-200 shrink-0">
                                    ✓ {cartQty}
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-[1fr_auto] items-center gap-1.5 w-full">
                            {/* Control - cantidad + */}
                            <div className="flex items-center min-w-0 justify-between bg-white/12 border border-white/20 rounded-lg px-0.5 h-8">
                                <button
                                    type="button"
                                    onClick={() => onUpdateQuantity(product, -1, selectedPres)}
                                    className="w-6 h-full flex items-center justify-center text-emerald-200 hover:text-rose-300 transition-colors shrink-0 rounded-md hover:bg-white/10"
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    value={qty}
                                    onFocus={() => setIsInputFocused(true)}
                                    onChange={(e) => onSetDirectQuantity(cartKey, e.target.value)}
                                    onBlur={() => {
                                        setIsInputFocused(false);
                                        onNormalizeQuantityOnBlur(product, selectedPres);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                            onAddToCart(product, numericQty, selectedPres);
                                        }
                                    }}
                                    className="font-black text-xs w-full max-w-[42px] text-center bg-transparent text-white focus:outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => onUpdateQuantity(product, 1, selectedPres)}
                                    className="w-6 h-full flex items-center justify-center text-emerald-200 hover:text-emerald-300 transition-colors shrink-0 rounded-md hover:bg-white/10"
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>

                            {cartQty > 0 && !isEditingNewPositiveQty ? (
                                <button
                                    type="button"
                                    onClick={() => onRemoveFromCart(cartKey)}
                                    title="Eliminar del carrito"
                                    className="bg-rose-500 hover:bg-rose-600 text-white h-8 w-9 rounded-lg flex items-center justify-center font-bold text-xs shadow-lg shadow-rose-900/30 active:scale-95 transition-all shrink-0"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onAddToCart(product, numericQty, selectedPres)}
                                    title={isEditingNewPositiveQty ? 'Actualizar cantidad' : 'Agregar al carrito'}
                                    className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white h-8 px-2.5 rounded-lg flex items-center justify-center gap-1 font-extrabold text-[10px] shadow-lg shadow-emerald-950/50 active:scale-95 transition-all shrink-0"
                                >
                                    {isEditingNewPositiveQty ? (
                                        <>
                                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                            <span>OK</span>
                                        </>
                                    ) : (
                                        <>
                                            <ShoppingCart className="w-3.5 h-3.5" />
                                            <span>Agregar</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
