import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Printer, CheckCircle } from 'lucide-react';

const TicketReceipt = ({ open, onClose, sale, items, client, userName }) => {
    if (!sale) return null;

    const total = Number(sale.total_amount || 0);
    const date = new Date(sale.created_at).toLocaleString('es-MX');

    const handleShare = async () => {
        const text = `
🧾 *TICKET DE VENTA*
📅 ${date}
👤 Cliente: ${client?.name || 'Cliente Mostrador'}
🚚 Vendedor: ${userName}

${items.map(i => `${i.quantity} x ${i.des_marca} ($${i.price})`).join('\n')}

💰 *TOTAL: $${total.toFixed(2)}*

Gracias por su compra.
        `.trim();

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Ticket de Venta',
                    text: text,
                });
            } catch (err) {
                console.log('Error sharing', err);
            }
        } else {
            // WhatsApp fallback
            const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm sm:max-w-md bg-white">
                <DialogHeader className="text-center">
                    <div className="mx-auto bg-green-100 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-2">
                        <CheckCircle className="text-green-600" />
                    </div>
                    <DialogTitle className="text-center text-xl">¡Venta Exitosa!</DialogTitle>
                    <DialogDescription className="text-center">
                        La venta ha sido registrada correctamente.
                    </DialogDescription>
                </DialogHeader>

                <div id="ticket-content" className="border-t border-b py-4 my-2 text-sm font-mono bg-gray-50 p-4 rounded">
                    <div className="text-center font-bold mb-2">CERVEZAS FINAS</div>
                    <div className="flex justify-between"><span>Folio:</span> <span>{sale.id.slice(0, 8)}</span></div>
                    <div className="flex justify-between"><span>Fecha:</span> <span>{date}</span></div>
                    <div className="flex justify-between"><span>Cliente:</span> <span>{client?.name?.slice(0, 20)}</span></div>
                    <hr className="my-2 border-dashed" />
                    <div className="space-y-2">
                        {items.map((item, idx) => {
                            const breakdown = item.breakdown || [];
                            const isReturnable = item.returnableFactor >= 1.0 || item.es_retornable;
                            return (
                                <div key={idx} className="border-b border-gray-200/60 pb-1.5">
                                    <div className="flex justify-between font-semibold">
                                        <span>{item.quantity} x {item.des_marca?.slice(0, 24)}</span>
                                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                    {breakdown.length > 0 && (
                                        <div className="text-[11px] text-gray-500 pl-2 space-y-0.5 mt-0.5">
                                            {item.originalPrice && item.originalPrice > item.price && (
                                                <div className="flex justify-between">
                                                    <span>Precio lista:</span>
                                                    <span>${(item.originalPrice * item.quantity).toFixed(2)}</span>
                                                </div>
                                            )}
                                            {breakdown.map((b, bi) => (
                                                <div key={bi} className="flex justify-between text-emerald-700">
                                                    <span>• {b.label}:</span>
                                                    <span>{b.amount < 0 || b.type.includes('discount') || b.type === 'promotion' ? '-' : '+'}${(Math.abs(b.amount) * item.quantity).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {isReturnable && (
                                        <div className="text-[11px] text-amber-700 font-medium pl-2">
                                            ♻️ Envases a retornar: {item.quantity}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <hr className="my-2 border-dashed" />
                    {sale.gec_discount > 0 && (
                        <div className="flex justify-between text-xs text-emerald-700">
                            <span>Desc. GEC Total:</span>
                            <span>-${Number(sale.gec_discount).toFixed(2)}</span>
                        </div>
                    )}
                    {sale.promo_discount > 0 && (
                        <div className="flex justify-between text-xs text-emerald-700">
                            <span>Desc. Promo Total:</span>
                            <span>-${Number(sale.promo_discount).toFixed(2)}</span>
                        </div>
                    )}
                    {sale.cargo > 0 && (
                        <div className="flex justify-between text-xs text-amber-700">
                            <span>Cargo Envases Total:</span>
                            <span>+${Number(sale.cargo).toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-lg mt-1">
                        <span>TOTAL</span>
                        <span>${total.toFixed(2)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                    <Button variant="outline" className="w-full gap-2" onClick={handlePrint}>
                        <Printer size={16} /> Imprimir
                    </Button>
                    <Button className="w-full gap-2 bg-green-600 hover:bg-green-700" onClick={handleShare}>
                        <Share2 size={16} /> Compartir
                    </Button>
                </div>

                <Button variant="ghost" className="w-full mt-2" onClick={onClose}>
                    Cerrar
                </Button>
            </DialogContent>
        </Dialog>
    );
};

export default TicketReceipt;
