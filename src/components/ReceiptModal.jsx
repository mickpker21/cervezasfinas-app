import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Printer, X, Download, Copy, FileDown, Award, Loader2 } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';
import { API_URL, getShopAuthHeaders } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

// Cache del logo en memoria para que el renderizado en Canvas sea instantáneo (<10ms)
let cachedLogoImg = null;
function loadLogoImage() {
    if (cachedLogoImg && cachedLogoImg.complete && cachedLogoImg.naturalWidth > 0) {
        return Promise.resolve(cachedLogoImg);
    }
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), 1200);
        img.onload = () => {
            clearTimeout(timer);
            cachedLogoImg = img;
            resolve(img);
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        img.src = '/logo2.png';
    });
}

// Convierte el QRCodeSVG del DOM en una imagen lista para dibujar en Canvas
function renderSvgElementToImage(svgElement) {
    if (!svgElement) return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            const serializer = new XMLSerializer();
            let svgString = serializer.serializeToString(svgElement);
            if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
                svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            const timer = setTimeout(() => {
                URL.revokeObjectURL(url);
                resolve(null);
            }, 800);
            img.onload = () => {
                clearTimeout(timer);
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                clearTimeout(timer);
                URL.revokeObjectURL(url);
                resolve(null);
            };
            img.src = url;
        } catch (e) {
            resolve(null);
        }
    });
}

// Divide texto largo en líneas que caben en maxWidth
function wrapCanvasText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        if (ctx.measureText(testLine).width <= maxWidth) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = words[i];
        }
    }
    lines.push(currentLine);
    return lines;
}

/**
 * Renderizador Nativo 2D de Ticket de 80mm.
 * NO usa html2canvas -> Cero congelamientos del navegador, <15ms de ejecución y centrado matemático exacto.
 */
async function renderTicketCanvasNative({ saleData, client, pointsInfo, verificationCode, qrSvgElement }) {
    const scale = 2.5;
    const width = 320;
    const padX = 14;
    const contentW = width - padX * 2;
    const centerX = width / 2;
    const fontMono = '"Courier New", Courier, monospace';

    const [logoImg, qrImg] = await Promise.all([
        loadLogoImage(),
        renderSvgElementToImage(qrSvgElement)
    ]);

    const items = saleData?.items || [];
    const finalTotal = Number(saleData?.totalAmount || 0);
    const gecDisc = Number(saleData?.gecDiscount || saleData?.gec_discount || 0);
    const promoDisc = Number(saleData?.promoDiscount || saleData?.promo_discount || 0);
    const impliedDiscount = Number(saleData?.discount || (gecDisc + promoDisc) || 0);
    const cargo = Number(saleData?.cargo || 0);
    const subtotal = finalTotal - cargo + impliedDiscount;
    const totalDisplayDiscount = impliedDiscount;
    const orderDate = saleData?.created_at ? new Date(saleData.created_at) : new Date();

    const clientCode = client?.client_code || client?.code || client?.cve_cliente || '';
    const clientName = (client?.business_name || client?.name || 'Cliente Mostrador').toString().toUpperCase();
    const folioStr = (saleData?.preventaId || saleData?.id ? String(saleData.preventaId || saleData.id).slice(-8) : '---').toUpperCase();

    const isShopActive = Boolean(pointsInfo?.isActive);
    const balancePts = isShopActive ? Number(pointsInfo?.balance || 0) : 0;
    const earnedPts = isShopActive ? Number(pointsInfo?.pointsEarned ?? Math.floor(finalTotal)) : 0;
    const estimatedTotalPts = balancePts + earnedPts;

    // Canvas temporal para medir líneas de productos y calcular alto exacto
    const measureCanvas = document.createElement('canvas');
    const mCtx = measureCanvas.getContext('2d');
    mCtx.font = `bold 11px ${fontMono}`;

    const descColW = contentW - 30 - 54 - 58;
    const preparedItems = items.map((item) => {
        let savingsMsg = null;
        if (item.promoType === 'nxm' && item.promoMeta) {
            const { buy_n, pay_m } = item.promoMeta;
            if (buy_n > 0) {
                const freeGroups = Math.floor(item.quantity / buy_n);
                const freeUnits = freeGroups * (buy_n - pay_m);
                if (freeUnits > 0) savingsMsg = `(BONIF: ${freeUnits})`;
            }
        }
        const qty = Number(item.quantity || 1);
        const price = Number(item.price ?? item.unit_price ?? 0);
        const rawName = (item.des_marca || item.cve_marca || item.name || item.product_name || 'Producto').toString().toUpperCase();
        const lines = wrapCanvasText(mCtx, rawName, descColW);
        return { qty, price, total: qty * price, lines, savingsMsg };
    });

    const itemsHeight = preparedItems.reduce((acc, it) => {
        return acc + Math.max(1, it.lines.length) * 14 + (it.savingsMsg ? 12 : 0) + 10;
    }, 0);

    const logoH = logoImg ? Math.round((logoImg.naturalHeight / Math.max(1, logoImg.naturalWidth)) * 125) : 0;
    const totalHeight = Math.max(1800, 1150 + logoH + itemsHeight * 2);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(totalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, totalHeight);

    let y = 18;

    // 1. LOGO (en escala de grises estilo ticket térmico)
    if (logoImg && logoH > 0) {
        const logoW = 125;
        ctx.save();
        ctx.filter = 'grayscale(100%) contrast(115%)';
        ctx.drawImage(logoImg, centerX - logoW / 2, y, logoW, logoH);
        ctx.restore();
        y += logoH + 10;
    }

    // 2. TÍTULO
    ctx.fillStyle = '#000000';
    ctx.font = `900 15px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('UM6 SHOP · CERVEZAS FINAS', centerX, y);
    y += 16;

    // 3. BADGE NEGRO "PEDIDO CONFIRMADO" (Centrado matemático exacto)
    const badgeW = 190;
    const badgeH = 22;
    const badgeX = centerX - badgeW / 2;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(badgeX, y, badgeW, badgeH, 3);
    else ctx.rect(badgeX, y, badgeW, badgeH);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 11px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PEDIDO CONFIRMADO', centerX, y + badgeH / 2 + 0.5);
    y += badgeH + 12;

    // 4. DIRECCIÓN
    ctx.fillStyle = '#1f2937';
    ctx.font = `bold 11px ${fontMono}`;
    ctx.fillText('C. 5 Pte. 303, Col Centro,', centerX, y);
    y += 14;
    ctx.fillText('75520 Cdad. Serdán, Pue.', centerX, y);
    y += 14;
    ctx.fillText('Tel. 245 452 0134', centerX, y);
    y += 14;

    // 5. BARRA NEGRA "PEDIDO #..." (Centrado matemático exacto)
    const barH = 28;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(padX, y, contentW, barH, 3);
    else ctx.rect(padX, y, contentW, barH);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 15px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`PEDIDO #${folioStr}`, centerX, y + barH / 2 + 0.5);
    y += barH + 12;

    // 6. FECHA, HORA Y CLIENTE
    ctx.fillStyle = '#000000';
    ctx.font = `bold 11.5px ${fontMono}`;
    ctx.textAlign = 'left';
    ctx.fillText(orderDate.toLocaleDateString('es-MX'), padX, y);
    ctx.textAlign = 'right';
    ctx.fillText(orderDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), width - padX, y);
    y += 16;

    ctx.textAlign = 'left';
    ctx.font = `bold 11.5px ${fontMono}`;
    ctx.fillText(`CLIENTE: ${clientCode || 'MOSTRADOR'}${client?.level ? ` (${client.level})` : ''}`, padX, y);
    y += 15;

    ctx.font = `900 12.5px ${fontMono}`;
    const truncatedClient = clientName.length > 31 ? clientName.slice(0, 31) + '...' : clientName;
    ctx.fillText(truncatedClient, padX, y);
    y += 12;

    // Línea punteada
    const drawDashedLine = (yPos, color = '#000000', lineWidth = 1.2) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(padX, yPos);
        ctx.lineTo(width - padX, yPos);
        ctx.stroke();
        ctx.restore();
    };

    drawDashedLine(y, '#9ca3af', 1.2);
    y += 14;

    // 7. ENCABEZADO DE TABLA DE PRODUCTOS
    ctx.font = `900 11px ${fontMono}`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText('CANT', padX, y);
    ctx.fillText('DESCRIPCION', padX + 32, y);
    ctx.textAlign = 'right';
    ctx.fillText('PRECIO', width - padX - 60, y);
    ctx.fillText('IMPORTE', width - padX, y);
    y += 9;
    drawDashedLine(y, '#000000', 1.5);
    y += 13;

    // 8. FILAS DE PRODUCTOS
    preparedItems.forEach((it) => {
        ctx.fillStyle = '#000000';
        ctx.font = `bold 12px ${fontMono}`;
        ctx.textAlign = 'left';
        ctx.fillText(String(it.qty), padX, y);

        ctx.font = `bold 11px ${fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`$${it.price.toFixed(2)}`, width - padX - 60, y);
        ctx.fillText(`$${it.total.toFixed(2)}`, width - padX, y);

        ctx.textAlign = 'left';
        it.lines.forEach((line, idx) => {
            ctx.fillText(line, padX + 32, y + idx * 13);
        });
        y += Math.max(1, it.lines.length) * 13;

        if (it.savingsMsg) {
            ctx.font = `normal 9.5px ${fontMono}`;
            ctx.fillText(it.savingsMsg, padX + 32, y);
            y += 12;
        }

        y += 3;
        drawDashedLine(y, '#e5e7eb', 1);
        y += 10;
    });

    drawDashedLine(y, '#000000', 1.5);
    y += 14;

    // 9. TOTALES
    ctx.font = `bold 11.5px ${fontMono}`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText(`${items.length} artículos`, padX, y);

    ctx.textAlign = 'left';
    ctx.fillText('Subtotal:', width - padX - 135, y);
    ctx.textAlign = 'right';
    ctx.fillText(`$${subtotal.toFixed(2)}`, width - padX, y);
    y += 15;

    if (gecDisc > 0) {
        ctx.textAlign = 'left';
        ctx.fillText('Desc. GEC:', width - padX - 135, y);
        ctx.textAlign = 'right';
        ctx.fillText(`-$${gecDisc.toFixed(2)}`, width - padX, y);
        y += 15;
    }
    if (promoDisc > 0) {
        ctx.textAlign = 'left';
        ctx.fillText('Promoción:', width - padX - 135, y);
        ctx.textAlign = 'right';
        ctx.fillText(`-$${promoDisc.toFixed(2)}`, width - padX, y);
        y += 15;
    }
    if (totalDisplayDiscount - gecDisc - promoDisc > 0.01) {
        ctx.textAlign = 'left';
        ctx.fillText('Descuento:', width - padX - 135, y);
        ctx.textAlign = 'right';
        ctx.fillText(`-$${(totalDisplayDiscount - gecDisc - promoDisc).toFixed(2)}`, width - padX, y);
        y += 15;
    }
    if (cargo > 0) {
        ctx.textAlign = 'left';
        ctx.fillText('Cargos:', width - padX - 135, y);
        ctx.textAlign = 'right';
        ctx.fillText(`+$${cargo.toFixed(2)}`, width - padX, y);
        y += 15;
    }

    y += 4;
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width - padX - 165, y);
    ctx.lineTo(width - padX, y);
    ctx.stroke();
    ctx.restore();
    y += 16;

    ctx.font = `900 18px ${fontMono}`;
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL:', width - padX - 165, y);
    ctx.textAlign = 'right';
    ctx.fillText(`$${finalTotal.toFixed(2)}`, width - padX, y);
    y += 22;

    // 10. RECUADRO PROGRAMA DE LEALTAD UM6 SHOP (PUNTOS)
    const boxTop = y;
    const boxHeight = earnedPts > 0 ? 118 : 102;
    ctx.save();
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(padX, boxTop, contentW, boxHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(padX, boxTop, contentW, boxHeight);
    ctx.restore();

    y += 15;
    ctx.fillStyle = '#000000';
    ctx.font = `900 10.5px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText('★ PROGRAMA DE LEALTAD UM6 SHOP ★', centerX, y);
    y += 10;
    drawDashedLine(y, '#000000', 1);
    y += 14;

    ctx.font = `bold 11px ${fontMono}`;
    ctx.textAlign = 'left';
    ctx.fillText('PUNTOS ACUMULADOS:', padX + 10, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${balancePts.toLocaleString('es-MX')} PTS`, width - padX - 10, y);
    y += 16;

    if (earnedPts > 0) {
        ctx.textAlign = 'left';
        ctx.fillText('ESTE PEDIDO SUMA:', padX + 10, y);
        ctx.textAlign = 'right';
        ctx.fillText(`+${earnedPts.toLocaleString('es-MX')} PTS`, width - padX - 10, y);
        y += 16;
    }

    ctx.font = `900 11.5px ${fontMono}`;
    ctx.textAlign = 'left';
    ctx.fillText('NUEVO SALDO ESTIMADO:', padX + 10, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${estimatedTotalPts.toLocaleString('es-MX')} PTS`, width - padX - 10, y);
    y += 16;

    ctx.font = `bold 9.5px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText('¡Escanea el código QR o entra a', centerX, y);
    y += 12;
    ctx.fillText('cervezasfinas.com.mx para canjear tus puntos!', centerX, y);

    y = boxTop + boxHeight + 18;

    // 11. SITIO WEB Y CÓDIGO QR
    ctx.fillStyle = '#000000';
    ctx.font = `bold 11px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText('TIENDA EN LÍNEA & PEDIDOS', centerX, y);
    y += 15;
    ctx.font = `900 13.5px ${fontMono}`;
    ctx.fillText('www.cervezasfinas.com.mx', centerX, y);
    y += 14;

    if (qrImg) {
        const qrSize = 128;
        ctx.drawImage(qrImg, centerX - qrSize / 2, y, qrSize, qrSize);
        y += qrSize + 10;
    }

    ctx.font = `bold 9.5px ${fontMono}`;
    ctx.fillStyle = '#374151';
    ctx.fillText('Escanea el código QR para entrar a la página', centerX, y);
    y += 18;

    // 12. CÓDIGO DE VERIFICACIÓN Y CÓDIGO DE BARRAS
    ctx.fillStyle = '#000000';
    ctx.font = `bold 11px ${fontMono}`;
    ctx.fillText('Código de Verificación:', centerX, y);
    y += 16;
    ctx.font = `900 15px ${fontMono}`;
    ctx.fillText(verificationCode, centerX, y);
    y += 14;

    // Simulación de código de barras
    const barcodeW = 180;
    let bx = centerX - barcodeW / 2;
    for (let i = 0; i < 42; i++) {
        const bw = i % 3 === 0 ? 3 : 1.5;
        const bh = i % 2 === 0 ? 26 : 20;
        ctx.fillStyle = '#000000';
        ctx.fillRect(bx, y + (26 - bh), bw, bh);
        bx += bw + 2.2;
    }
    y += 38;

    ctx.font = `900 12px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText('¡GRACIAS POR SU COMPRA!', centerX, y);
    y += 28;

    // Recortar el canvas a la altura real utilizada con margen inferior limpio
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = canvas.width;
    finalCanvas.height = Math.ceil(y * scale);
    const fCtx = finalCanvas.getContext('2d');
    fCtx.fillStyle = '#ffffff';
    fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    fCtx.drawImage(canvas, 0, 0);

    return finalCanvas;
}

// 1. Ticket Content Component (Vista previa en pantalla e Impresión térmica 80mm)
const ReceiptTicket = ({ saleData, client, pointsInfo, verificationCode, qrContainerRef }) => {
    if (!saleData) return null;

    const items = saleData.items || [];
    const finalTotal = Number(saleData.totalAmount || 0);
    const gecDisc = Number(saleData.gecDiscount || saleData.gec_discount || 0);
    const promoDisc = Number(saleData.promoDiscount || saleData.promo_discount || 0);
    const impliedDiscount = Number(saleData.discount || (gecDisc + promoDisc) || 0);
    const cargo = Number(saleData.cargo || 0);

    const subtotal = finalTotal - cargo + impliedDiscount;
    const totalDisplayDiscount = impliedDiscount;
    const orderDate = saleData.created_at ? new Date(saleData.created_at) : new Date();

    const websiteUrl = 'https://cervezasfinas.com.mx';
    const clientCode = client?.client_code || client?.code || client?.cve_cliente || '';
    const folioStr = saleData.preventaId || saleData.id ? String(saleData.preventaId || saleData.id).slice(-8) : '---';

    const isShopActive = Boolean(pointsInfo?.isActive);
    const balancePts = isShopActive ? Number(pointsInfo?.balance || 0) : 0;
    const earnedPts = isShopActive ? Number(pointsInfo?.pointsEarned ?? Math.floor(finalTotal)) : 0;
    const estimatedTotalPts = balancePts + earnedPts;

    return (
        <div
            className="text-black font-bold font-mono text-xs leading-normal pt-2 px-1 w-full box-border"
            style={{ fontFamily: '"Courier New", Courier, monospace' }}
        >
            {/* HEADER */}
            <div className="flex flex-col items-center justify-center text-center mb-3 w-full">
                <img
                    src="/logo2.png"
                    alt="UM6 SHOP"
                    crossOrigin="anonymous"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="w-32 h-auto mb-2 grayscale mx-auto block"
                />

                <h2 className="font-extrabold text-[15px] uppercase tracking-tight text-center w-full leading-snug">
                    UM6 SHOP · CERVEZAS FINAS
                </h2>

                <div className="w-full flex justify-center my-1.5">
                    <svg width="190" height="22" viewBox="0 0 190 22" className="mx-auto block">
                        <rect x="0" y="0" width="190" height="22" rx="3" fill="#000000" />
                        <text
                            x="95"
                            y="11"
                            dy="0.35em"
                            fill="#ffffff"
                            fontSize="11"
                            fontWeight="900"
                            fontFamily="'Courier New', Courier, monospace"
                            textAnchor="middle"
                            letterSpacing="0.8"
                        >
                            PEDIDO CONFIRMADO
                        </text>
                    </svg>
                </div>

                <div className="text-[11px] mt-1 space-y-0.5 text-gray-800 text-center w-full">
                    <p className="text-center">C. 5 Pte. 303, Col Centro,</p>
                    <p className="text-center">75520 Cdad. Serdán, Pue.</p>
                    <p className="text-center">Tel. 245 452 0134</p>
                </div>
            </div>

            {/* INFO DEL PEDIDO */}
            <div className="mb-3 pb-2 border-b-2 border-dashed border-gray-400 w-full">
                <div className="w-full mb-2">
                    <svg width="100%" height="28" viewBox="0 0 280 28" className="w-full mx-auto block">
                        <rect x="0" y="0" width="280" height="28" rx="3" fill="#000000" />
                        <text
                            x="140"
                            y="14"
                            dy="0.35em"
                            fill="#ffffff"
                            fontSize="15"
                            fontWeight="900"
                            fontFamily="'Courier New', Courier, monospace"
                            textAnchor="middle"
                            letterSpacing="1.2"
                        >
                            {`PEDIDO #${folioStr}`}
                        </text>
                    </svg>
                </div>

                <div className="flex justify-between text-xs mb-1">
                    <span>{orderDate.toLocaleDateString('es-MX')}</span>
                    <span>{orderDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="uppercase mt-1.5 font-bold text-xs text-left">
                    Cliente: {clientCode || 'Mostrador'} {client?.level ? `(${client.level})` : ''}
                </p>
                <p className="font-extrabold truncate uppercase text-sm text-left">
                    {client?.business_name || client?.name || 'Cliente Mostrador'}
                </p>
            </div>

            {/* ITEMS LIST */}
            <div className="mb-3 w-full">
                <div className="flex font-bold text-xs border-b-2 border-dashed border-black pb-1.5 mb-1.5">
                    <span className="w-8 text-left">CANT</span>
                    <span className="flex-1 text-left px-1">DESCRIPCION</span>
                    <span className="w-16 text-right">PRECIO</span>
                    <span className="w-16 text-right">IMPORTE</span>
                </div>

                <div className="space-y-1">
                    {items.map((item, i) => {
                        let savingsMsg = null;
                        if (item.promoType === 'nxm' && item.promoMeta) {
                            const { buy_n, pay_m } = item.promoMeta;
                            if (buy_n > 0) {
                                const freeGroups = Math.floor(item.quantity / buy_n);
                                const freeUnits = freeGroups * (buy_n - pay_m);
                                if (freeUnits > 0) savingsMsg = `(BONIF: ${freeUnits})`;
                            }
                        }
                        const itemQty = Number(item.quantity || 1);
                        const itemPrice = Number(item.price ?? item.unit_price ?? 0);

                        return (
                            <div key={i} className="flex flex-col border-b border-dashed border-gray-200 pb-1.5 mb-1">
                                <div className="flex font-bold text-xs items-center">
                                    <span className="w-8 text-left text-sm">{itemQty}</span>
                                    <span className="flex-1 text-left px-1 uppercase leading-tight">
                                        {item.des_marca || item.cve_marca || item.name || item.product_name || 'Producto'}
                                        {savingsMsg && <span className="block text-[9px] font-normal">{savingsMsg}</span>}
                                    </span>
                                    <span className="w-16 text-right">${itemPrice.toFixed(2)}</span>
                                    <span className="w-16 text-right">${(itemPrice * itemQty).toFixed(2)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="border-b-2 border-dashed border-black mt-2"></div>
            </div>

            {/* TOTALS */}
            <div className="border-t border-dashed border-gray-300 pt-2 mb-4 w-full">
                <div className="flex justify-between mb-1.5 text-xs">
                    <span>{items.length} artículos</span>
                    <div className="text-right">
                        <div className="flex justify-between w-40 font-bold">
                            <span>Subtotal:</span>
                            <span>${subtotal.toFixed(2)}</span>
                        </div>

                        {gecDisc > 0 && (
                            <div className="flex justify-between w-40 font-bold text-gray-800">
                                <span>Desc. GEC:</span>
                                <span>-${gecDisc.toFixed(2)}</span>
                            </div>
                        )}

                        {promoDisc > 0 && (
                            <div className="flex justify-between w-40 font-bold text-gray-800">
                                <span>Promoción:</span>
                                <span>-${promoDisc.toFixed(2)}</span>
                            </div>
                        )}

                        {(totalDisplayDiscount - gecDisc - promoDisc) > 0.01 && (
                            <div className="flex justify-between w-40 font-bold">
                                <span>Descuento:</span>
                                <span>-${(totalDisplayDiscount - gecDisc - promoDisc).toFixed(2)}</span>
                            </div>
                        )}

                        {cargo > 0 && (
                            <div className="flex justify-between w-40 font-bold text-gray-800">
                                <span>Cargos:</span>
                                <span>+${cargo.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end mt-1.5">
                    <div className="flex justify-between w-48 text-xl font-black border-t-2 border-black pt-1.5">
                        <span>TOTAL:</span>
                        <span>${finalTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* SECCIÓN DE PROGRAMA DE LEALTAD (PUNTOS DEL CLIENTE) */}
            <div className="mb-4 pb-3 pt-2.5 px-3 border-2 border-dashed border-black bg-gray-50 text-left w-full box-border">
                <div className="text-center font-black text-[11px] uppercase tracking-wider mb-2 pb-1.5 border-b border-dashed border-black w-full">
                    ★ PROGRAMA DE LEALTAD UM6 SHOP ★
                </div>
                <div className="flex justify-between items-center text-xs mb-1">
                    <span>PUNTOS ACUMULADOS:</span>
                    <span className="font-extrabold">{balancePts.toLocaleString('es-MX')} PTS</span>
                </div>
                {earnedPts > 0 && (
                    <div className="flex justify-between items-center text-xs mb-1">
                        <span>ESTE PEDIDO SUMA:</span>
                        <span className="font-extrabold text-black">+{earnedPts.toLocaleString('es-MX')} PTS</span>
                    </div>
                )}
                <div className="flex justify-between items-center text-xs font-black border-t border-dashed border-gray-400 pt-1.5 mt-1">
                    <span>NUEVO SALDO ESTIMADO:</span>
                    <span>{estimatedTotalPts.toLocaleString('es-MX')} PTS</span>
                </div>
                <p className="text-[10px] text-center font-medium mt-2 leading-tight">
                    ¡Escanea el código QR o entra a cervezasfinas.com.mx para consultar y canjear tus puntos!
                </p>
            </div>

            {/* FOOTER & QR CODE */}
            <div className="text-center mt-4 space-y-3 w-full">
                <div className="text-center w-full">
                    <p className="font-bold text-[11px] uppercase tracking-wider mb-0.5 text-center">Tienda en Línea & Pedidos</p>
                    <p className="font-black text-sm text-black underline tracking-wide text-center">www.cervezasfinas.com.mx</p>
                </div>

                <div ref={qrContainerRef} className="flex flex-col items-center justify-center my-3 w-full">
                    <QRCodeSVG
                        value={websiteUrl}
                        size={130}
                        level={"M"}
                        includeMargin={true}
                    />
                    <p className="text-[10px] text-gray-700 mt-1 text-center">Escanea el código QR para entrar a la página</p>
                </div>

                <div className="text-center w-full">
                    <p className="text-[11px] font-bold text-center">Código de Verificación:</p>
                    <p className="font-mono font-black tracking-widest text-base text-black text-center">{verificationCode}</p>
                </div>

                <div className="h-8 w-3/4 mx-auto mt-2 overflow-hidden flex items-end justify-center gap-[2px] opacity-80">
                    {Array.from({ length: 40 }).map((_, i) => (
                        <div key={i} className="bg-black" style={{
                            width: i % 3 === 0 ? '3px' : '1px',
                            height: i % 2 === 0 ? '100%' : '75%'
                        }} />
                    ))}
                </div>
                <p className="font-black text-xs mt-2 uppercase tracking-wider text-center">¡GRACIAS POR SU COMPRA!</p>
            </div>
        </div>
    );
};

const PRINT_STYLES = `
    @media print {
        @page { margin: 0; size: auto; }
        html, body {
            visibility: hidden;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
        }
        body * { visibility: hidden; }
        #print-root, #print-root * {
            visibility: visible !important;
        }
        #print-root {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 76mm !important;
            margin: 0 auto !important;
            padding: 4px !important;
            background: white !important;
            z-index: 999999 !important;
            display: block !important;
        }
    }
`;

const ReceiptModal = ({ open, onOpenChange, saleData, client, autoSendWhatsApp = false }) => {
    if (!saleData) return null;

    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoadingPoints, setIsLoadingPoints] = useState(false);

    const qrContainerRef = useRef(null);
    const pointsPromiseRef = useRef(null);
    const autoSentForOrderRef = useRef(null);

    const clientCode = String(client?.client_code || client?.code || client?.cve_cliente || '').trim();
    const orderKey = String(saleData?.preventaId || saleData?.id || '');
    const initialTotal = Number(saleData?.totalAmount || 0);
    const initialBalance = Number(client?.points_balance || client?.points || 0) || 0;
    const initialIsRegistered = Boolean(client?.is_shop_registered);

    const [pointsInfo, setPointsInfo] = useState({
        isActive: initialIsRegistered,
        balance: initialIsRegistered ? initialBalance : 0,
        pointsEarned: initialIsRegistered ? Math.floor(initialTotal) : 0,
        loaded: false
    });

    const verificationCode = useMemo(() => {
        const id = saleData?.preventaId || saleData?.id || '000000';
        const dateStr = saleData?.created_at ? new Date(saleData.created_at).getDate() : new Date().getDate();
        const str = id.toString() + dateStr;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0').match(/.{1,4}/g).join('-');
    }, [saleData?.preventaId, saleData?.id, saleData?.created_at]);

    // Precargar logo una vez al montar
    useEffect(() => {
        loadLogoImage();
    }, []);

    // Consulta rápida con timeout de 2.2 segundos para verificar si el cliente está en la Shop y su saldo
    const fetchLivePointsQuick = async (code, totalAmount, fallbackBalance, fallbackIsRegistered) => {
        const earned = Math.floor(Number(totalAmount || 0));
        let resolved = {
            isActive: Boolean(fallbackIsRegistered),
            balance: fallbackIsRegistered ? (Number(fallbackBalance || 0) || 0) : 0,
            pointsEarned: fallbackIsRegistered ? earned : 0,
            loaded: true
        };

        if (!code) {
            setPointsInfo(resolved);
            return resolved;
        }

        setIsLoadingPoints(true);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2200);

        try {
            const headers = await getShopAuthHeaders();
            const res = await fetch(`${API_URL}/televenta/client-points.php?client_code=${encodeURIComponent(code)}`, {
                headers,
                signal: controller.signal
            });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                if (data && data.success) {
                    const isShopReg = Boolean(data.is_registered_in_shop ?? data.is_active);
                    resolved = {
                        isActive: isShopReg,
                        balance: isShopReg ? Number(data.points_balance || 0) : 0,
                        pointsEarned: isShopReg ? earned : 0,
                        loaded: true
                    };
                }
            }
        } catch (err) {
            // Timeout o sin red: respetar fallbackIsRegistered
        } finally {
            clearTimeout(timeoutId);
            setPointsInfo(resolved);
            setIsLoadingPoints(false);
        }

        return resolved;
    };

    // Cargar puntos únicamente cuando se abre el modal para un pedido
    useEffect(() => {
        if (!open) {
            autoSentForOrderRef.current = null;
            return;
        }

        const total = Number(saleData?.totalAmount || 0);
        const fallbackBal = Number(client?.points_balance || client?.points || 0) || 0;
        const fallbackReg = Boolean(client?.is_shop_registered);
        setPointsInfo({
            isActive: fallbackReg,
            balance: fallbackReg ? fallbackBal : 0,
            pointsEarned: fallbackReg ? Math.floor(total) : 0,
            loaded: false
        });

        const promise = fetchLivePointsQuick(clientCode, total, fallbackBal, fallbackReg);
        pointsPromiseRef.current = promise;

        if (autoSendWhatsApp && autoSentForOrderRef.current !== orderKey) {
            autoSentForOrderRef.current = orderKey;
            promise.then((pts) => {
                handleWhatsApp(pts);
            });
        }
    }, [open, orderKey, clientCode]);

    // Espera máximo 2.2s si los puntos aún están consultándose y devuelve los puntos listos
    const getReadyPoints = async () => {
        if (pointsInfo.loaded) return pointsInfo;
        if (pointsPromiseRef.current) {
            try {
                return await pointsPromiseRef.current;
            } catch (e) {}
        }
        return pointsInfo;
    };

    // Generar Canvas nativo instantáneo (<15ms, cero congelamiento)
    const generateCanvas = async (overridePoints = null) => {
        const effectivePoints = overridePoints || (await getReadyPoints());
        const svgEl = qrContainerRef.current ? qrContainerRef.current.querySelector('svg') : null;
        return await renderTicketCanvasNative({
            saleData,
            client,
            pointsInfo: effectivePoints,
            verificationCode,
            qrSvgElement: svgEl
        });
    };

    // 1. DESCARGAR TICKET EN FORMATO PDF (Instantáneo, con puntos y centrado exacto)
    const handleDownloadPdf = async () => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const canvas = await generateCanvas();
            if (!canvas) throw new Error("No se pudo generar el ticket");

            const imgData = canvas.toDataURL('image/png');
            const pdfWidthMm = 80;
            const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
            const finalPdfHeight = Math.max(120, Math.ceil(pdfHeightMm) + 4);

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [pdfWidthMm, finalPdfHeight]
            });

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, '', 'FAST');

            const folio = (saleData.preventaId || saleData.id || 'venta').toString().slice(-8);
            pdf.save(`Ticket-${folio}.pdf`);

            toast({
                title: "Ticket PDF descargado",
                description: `Ticket-${folio}.pdf generado con puntos y código QR.`
            });
        } catch (e) {
            console.error('[PDF Error]', e);
            toast({
                title: "Error al generar PDF",
                description: e.message || "No se pudo generar el documento PDF.",
                variant: "destructive"
            });
        } finally {
            setIsGenerating(false);
        }
    };

    // 2. DESCARGAR TICKET COMO IMAGEN PNG
    const handleDownloadImage = async () => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const canvas = await generateCanvas();
            if (!canvas) throw new Error("No se pudo renderizar el ticket");

            const folio = (saleData.preventaId || saleData.id || 'venta').toString().slice(-8);
            const link = document.createElement('a');
            link.download = `Ticket-${folio}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            toast({ title: "Ticket descargado", description: "Imagen PNG guardada en tu dispositivo." });
        } catch (e) {
            console.error('[Image Error]', e);
            toast({ title: "Error", description: "No se pudo guardar la imagen del ticket.", variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    // 3. COPIAR IMAGEN AL PORTAPAPELES
    const handleCopy = async () => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const canvas = await generateCanvas();
            if (!canvas) throw new Error("No se pudo renderizar el ticket");

            canvas.toBlob(async (blob) => {
                if (!blob) return;
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    toast({
                        title: "¡Ticket copiado!",
                        description: "Imagen lista en el portapapeles. Pégala con Ctrl + V en WhatsApp."
                    });
                } catch (err) {
                    toast({
                        title: "Error al copiar",
                        description: "Usa 'Descargar PDF' o 'Guardar Imagen'.",
                        variant: "warning"
                    });
                }
            });
        } catch (e) {
            toast({ title: "Error", description: "No se pudo copiar el ticket.", variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    // 4. ENVIAR POR WHATSAPP DIRECTO (Sin Cloud API; abre WhatsApp y copia la imagen del ticket al portapapeles)
    const handleWhatsApp = async (overridePoints = null) => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const effectivePoints = overridePoints || (await getReadyPoints());

            const phone = client?.phone || client?.telefono || '';
            const cleanPhone = phone.toString().replace(/[^0-9]/g, '');
            const finalPhone = cleanPhone.length === 10 ? `52${cleanPhone}` : cleanPhone;

            const total = Number(saleData.totalAmount || 0);
            const folio = (saleData.preventaId || saleData.id || '').toString().slice(-8);
            const dateStr = new Date(saleData.created_at || Date.now()).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
            const items = saleData.items || [];

            let itemsText = items.map(i => {
                const unitPrice = Number(i.price ?? i.unit_price ?? 0);
                const qty = Number(i.quantity || 1);
                return `• ${qty}x ${i.des_marca || i.cve_marca || i.name || i.product_name || 'Prod'} - $${(unitPrice * qty).toFixed(2)}`;
            }).join('\n');
            if (!itemsText) itemsText = `• Consumo registrado: $${total.toFixed(2)}`;

            const isShopActive = Boolean(effectivePoints?.isActive);
            const currentBalance = isShopActive ? Number(effectivePoints?.balance || 0) : 0;
            const earnedPoints = isShopActive ? Number(effectivePoints?.pointsEarned ?? Math.floor(total)) : 0;
            const estimatedNewBalance = currentBalance + earnedPoints;

            const pText = isShopActive
                ? (`\n⭐ *PROGRAMA DE LEALTAD UM6 SHOP*\n` +
                   `💎 Puntos acumulados actuales: *${currentBalance.toLocaleString('es-MX')} pts*\n` +
                   (earnedPoints > 0 ? `✨ Este pedido suma: *+${earnedPoints.toLocaleString('es-MX')} pts*\n` : '') +
                   `🎯 Nuevo saldo estimado: *${estimatedNewBalance.toLocaleString('es-MX')} pts*\n`)
                : (`\n⭐ *PROGRAMA DE LEALTAD UM6 SHOP*\n` +
                   `ℹ️ Solicita tu registro en *cervezasfinas.com.mx* para acumular puntos en tus compras.\n`);

            const messageText =
                `🍺 *UM6 SHOP · CERVEZAS FINAS*\n` +
                `🧾 *TICKET DE PEDIDO #${folio}*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📅 Fecha: ${dateStr}\n` +
                `👤 Cliente: *${client?.business_name || client?.name || 'Cliente'}*${clientCode ? ` (Cód: ${clientCode})` : ''}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📦 *PRODUCTOS:*\n${itemsText}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `💰 *TOTAL A PAGAR: $${total.toFixed(2)}*\n` +
                pText +
                `\n🌐 *Entra a nuestra tienda en línea o escanea el QR de tu ticket:*\nhttps://cervezasfinas.com.mx\n` +
                `\n¡Muchas gracias por su preferencia!`;

            const waUrl = finalPhone
                ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(messageText)}`
                : `https://wa.me/?text=${encodeURIComponent(messageText)}`;

            try {
                const canvas = await generateCanvas(effectivePoints);
                if (canvas) {
                    canvas.toBlob(async (blob) => {
                        if (blob && navigator.clipboard?.write) {
                            try {
                                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                                toast({
                                    title: "Ticket copiado al portapapeles",
                                    description: "Presiona Ctrl + V en el chat de WhatsApp para pegar también la imagen del ticket."
                                });
                            } catch (e) {}
                        }
                    });
                }
            } catch (err) {}

            window.open(waUrl, '_blank');
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleCloseModal = () => {
        setIsGenerating(false);
        if (onOpenChange) onOpenChange(false);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(nextOpen) => {
                if (!nextOpen) handleCloseModal();
                else if (onOpenChange) onOpenChange(true);
            }}>
                <DialogContent className="max-w-md w-[95vw] max-h-[92vh] flex flex-col bg-white text-black p-0 overflow-hidden no-print border-0 shadow-2xl">
                    {/* Header siempre visible en la parte superior */}
                    <DialogHeader className="px-4 py-3 border-b bg-slate-100 shrink-0">
                        <DialogTitle className="flex items-center justify-between text-slate-900 text-base">
                            <span className="flex items-center gap-2">
                                <Award className="w-5 h-5 text-emerald-600 shrink-0" />
                                <span>Ticket de Pedido</span>
                                {isLoadingPoints && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 ml-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Puntos...
                                    </span>
                                )}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleCloseModal}
                                className="h-8 px-2.5 text-xs font-bold border-slate-300 text-slate-800 hover:bg-red-50 hover:text-red-600 hover:border-red-300 gap-1"
                            >
                                <X size={16} />
                                Cerrar
                            </Button>
                        </DialogTitle>
                        <DialogDescription className="hidden">
                            Vista previa del ticket con formato de impresión y opciones de descarga.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Ticket Preview Scrollable Area */}
                    <div className="p-4 flex-1 min-h-0 overflow-y-auto bg-gray-100 flex justify-center">
                        <div id="ticket-preview" className="shadow-lg bg-white p-3.5 w-[80mm] h-fit">
                            <ReceiptTicket
                                saleData={saleData}
                                client={client}
                                pointsInfo={pointsInfo}
                                verificationCode={verificationCode}
                                qrContainerRef={qrContainerRef}
                            />
                        </div>
                    </div>

                    {/* Action Buttons Panel (Siempre visible abajo) */}
                    <div className="p-3.5 border-t bg-slate-900 flex flex-col gap-2 shrink-0">
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                onClick={handleDownloadPdf}
                                disabled={isGenerating}
                                className="w-full gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold h-10 shadow-md"
                            >
                                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                                Descargar PDF
                            </Button>

                            <Button
                                type="button"
                                onClick={handleDownloadImage}
                                disabled={isGenerating}
                                variant="outline"
                                className="w-full gap-2 border-white/20 text-white hover:bg-white/10 font-medium h-10"
                            >
                                <Download size={16} /> Guardar Imagen
                            </Button>
                        </div>

                        <Button
                            type="button"
                            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white font-bold h-10 shadow-md"
                            onClick={() => handleWhatsApp()}
                            disabled={isGenerating}
                        >
                            <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.764 0-3.18-2.587-5.766-5.764-5.766zm3.376 8.195c-.143.402-.821.747-1.126.797-.306.05-.697.086-1.118-.049-.244-.08-.545-.188-.934-.356-1.666-.719-2.735-2.434-2.818-2.544-.084-.11-.683-.906-.683-1.725s.42-.122.57-.133c.15-.011.33-.011.473-.011s.383-.053.585.445c.203.497.69 1.688.75 1.81.06.122.101.265.02.427s-.122.285-.244.426-.255.318-.363.427c-.11.11-.224.23-.095.452.128.223.57 1.139.943 1.472.48.428.887.561 1.218.728.33.167.525.143.722-.086.196-.228.843-.984 1.07-1.31.226-.326.452-.272.76-.159s1.956.924 2.292 1.092c.337.168.562.25.645.39.083.14.083.81-.06 1.212z"/>
                            </svg>
                            Enviar por WhatsApp
                        </Button>

                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                type="button"
                                onClick={handleCopy}
                                disabled={isGenerating}
                                variant="outline"
                                className="w-full gap-1 border-white/20 text-white hover:bg-white/10 text-xs h-9"
                            >
                                <Copy size={14} /> Copiar
                            </Button>
                            <Button
                                type="button"
                                onClick={handlePrint}
                                className="w-full gap-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9"
                            >
                                <Printer size={14} /> Imprimir
                            </Button>
                            <Button
                                type="button"
                                onClick={handleCloseModal}
                                variant="outline"
                                className="w-full gap-1 border-red-400/40 text-red-300 hover:bg-red-500/20 font-bold text-xs h-9"
                            >
                                <X size={14} /> Cerrar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dedicated Print View (Outside Modal) */}
            <div id="print-root" style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '80mm', backgroundColor: 'white' }}>
                <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
                <ReceiptTicket
                    saleData={saleData}
                    client={client}
                    pointsInfo={pointsInfo}
                    verificationCode={verificationCode}
                />
            </div>
        </>
    );
};

export default ReceiptModal;
