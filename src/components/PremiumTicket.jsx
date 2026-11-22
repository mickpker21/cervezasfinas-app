import React, { forwardRef } from 'react';
import { Beer, MapPin, Phone, Calendar, Hash, Globe, CheckCircle2, Award, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const PremiumTicket = forwardRef(({ saleData, client, user }, ref) => {
    if (!saleData || !client) return null;

    const {
        items = [],
        totalAmount = 0,
        preventaId = "---",
        created_at = new Date().toISOString()
    } = saleData;

    const totalBoxes = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
    const formattedDate = new Date(created_at).toLocaleString('es-MX', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const pointsEarned = Math.floor(Number(totalAmount || 0));
    const currentPoints = Number(client.points_balance || client.points || 0);
    const isLoyaltyActive = client.is_active !== 0 && client.is_active !== false;
    const websiteUrl = 'https://cervezasfinas.com.mx';

    return (
        <div ref={ref} className="w-[450px] bg-slate-900 text-white font-sans p-0 overflow-hidden relative" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* Background Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

            {/* Header Section */}
            <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 p-8 text-center border-b border-white/5">
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Beer size={32} className="text-white" />
                    </div>
                </div>
                <h1 className="text-2xl font-black tracking-tight mb-1 text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">
                    CERVEZAS FINAS
                </h1>
                <p className="text-slate-400 text-xs tracking-widest uppercase font-semibold">Experiencia Premium</p>
            </div>

            {/* Shapes Divider */}
            <div className="h-4 bg-slate-900 relative">
                <div className="absolute -top-2 left-0 right-0 flex justify-between px-2">
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className="w-4 h-4 bg-slate-900 rounded-full -mx-1"></div>
                    ))}
                </div>
            </div>

            <div className="p-8 pt-4 relative">
                {/* Order Info */}
                <div className="flex justify-between items-start mb-8 bg-slate-800/50 p-4 rounded-xl border border-white/5">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Pedido No.</span>
                        <span className="text-xl font-mono text-white font-bold tracking-tight">#{String(preventaId).slice(-6)}</span>
                    </div>
                    <div className="flex flex-col gap-1 text-right">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Fecha</span>
                        <span className="text-xs text-white font-medium">{formattedDate}</span>
                    </div>
                </div>

                {/* Client Info */}
                <div className="mb-8">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <CheckCircle2 size={12} className="text-emerald-500" />
                        Datos del Cliente
                    </h3>
                    <div className="pl-4 border-l-2 border-emerald-500/30 space-y-1">
                        <h2 className="text-lg font-bold text-white leading-tight">{client.business_name || client.name}</h2>
                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                            <MapPin size={10} />
                            <span className="truncate max-w-[280px]">{client.address || "Sin dirección registrada"}</span>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detalle de Compra</h3>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">{items.length} Items</span>
                    </div>

                    <div className="space-y-3">
                        {items.map((item, idx) => {
                            const breakdown = item.breakdown || [];
                            const isReturnable = item.returnableFactor >= 1.0 || item.es_retornable;
                            return (
                                <div key={idx} className="space-y-1">
                                    <div className="flex justify-between items-center group">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 border border-white/5 group-hover:border-emerald-500/30 transition-colors">
                                                {item.quantity}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-bold text-slate-200 truncate pr-2">{item.des_marca || item.cve_marca || item.name}</span>
                                                <span className="text-[10px] text-slate-500 font-mono">
                                                    {item.cve_marca}
                                                    {isReturnable && <span className="ml-2 text-amber-400 font-sans font-medium">♻️ Retornable</span>}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-bold text-white">${(item.price * item.quantity).toFixed(2)}</div>
                                            {item.price < (item.originalPrice || item.price) && (
                                                <div className="text-[10px] text-slate-500 line-through">${((item.originalPrice || item.price) * item.quantity).toFixed(2)}</div>
                                            )}
                                        </div>
                                    </div>
                                    {breakdown.length > 0 && (
                                        <div className="pl-11 pr-2 space-y-0.5">
                                            {breakdown.map((b, bi) => (
                                                <div key={bi} className="flex justify-between text-[10px] text-emerald-400/90 font-mono">
                                                    <span>↳ {b.label}</span>
                                                    <span>{b.amount < 0 || b.type.includes('discount') || b.type === 'promotion' ? '-' : '+'}${(Math.abs(b.amount) * item.quantity).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Totals Section */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Beer size={120} />
                    </div>

                    <div className="relative z-10 space-y-2">
                        <div className="flex justify-between items-center text-sm text-slate-400">
                            <span>Total Cajas</span>
                            <span className="font-mono font-bold">{totalBoxes}</span>
                        </div>
                        {items.some(i => i.returnableFactor >= 1.0 || i.es_retornable) && (
                            <div className="flex justify-between items-center text-xs text-amber-400">
                                <span>♻️ Total Envases a Retornar</span>
                                <span className="font-mono font-bold">
                                    {items.reduce((acc, i) => (i.returnableFactor >= 1.0 || i.es_retornable) ? acc + (Number(i.quantity) || 0) : acc, 0)} envases
                                </span>
                            </div>
                        )}
                        <div className="h-px bg-white/10 my-2"></div>
                        <div className="flex justify-between items-end">
                            <span className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-1">Total a Pagar</span>
                            <span className="text-3xl font-black text-emerald-400 tracking-tight">${Number(totalAmount).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Programa de Lealtad (Puntos) */}
                {isLoyaltyActive && (
                    <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-purple-950/60 to-indigo-950/60 border border-purple-500/30">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-purple-300 uppercase flex items-center gap-1.5">
                                <Award size={14} className="text-purple-400" />
                                Programa de Lealtad
                            </span>
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-semibold border border-purple-500/30">
                                Activo
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-slate-300">
                            <span>Saldo actual:</span>
                            <span className="font-bold text-white font-mono">{currentPoints.toLocaleString('es-MX')} pts</span>
                        </div>
                        {pointsEarned > 0 && (
                            <div className="flex justify-between items-center text-xs text-emerald-400 mt-1">
                                <span>Puntos de esta compra:</span>
                                <span className="font-bold font-mono">+{pointsEarned.toLocaleString('es-MX')} pts</span>
                            </div>
                        )}
                    </div>
                )}

                {/* QR Code & Website Section */}
                <div className="mt-6 pt-4 border-t border-white/10 flex flex-col items-center text-center">
                    <p className="text-xs font-semibold text-slate-300 mb-1">Visítanos y haz tus pedidos en línea</p>
                    <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-emerald-400 hover:underline mb-3">
                        www.cervezasfinas.com.mx
                    </a>
                    <div className="p-2.5 bg-white rounded-xl shadow-lg">
                        <QRCodeSVG
                            value={websiteUrl}
                            size={120}
                            level="M"
                            includeMargin={false}
                        />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1.5">Escanea para ingresar a la tienda</span>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center space-y-2">
                    <p className="text-[10px] text-slate-500 max-w-[240px] mx-auto leading-relaxed">
                        Gracias por su preferencia. Este ticket es un comprobante digital de su pedido.
                    </p>
                    <p className="text-[10px] text-emerald-500/50 font-mono mt-1">
                        Cervezas Finas · Calidad y Servicio
                    </p>
                </div>
            </div>

            {/* Decorative Bottom Bar */}
            <div className="h-2 bg-gradient-to-r from-emerald-500 to-blue-500"></div>
        </div>
    );
});

export default PremiumTicket;
