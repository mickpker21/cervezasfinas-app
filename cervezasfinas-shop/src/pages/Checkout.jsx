import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import CheckoutStepper from '../components/CheckoutStepper';
import { Trash2, ArrowLeft, ArrowRight, Check, Package, AlertCircle, PartyPopper, Info } from 'lucide-react';

const STEPS = [
    { id: 1, label: 'Revisar' },
    { id: 2, label: 'Retornables' },
    { id: 3, label: 'Última revisión' },
    { id: 4, label: 'Completo' }
];

export default function Checkout() {
    const [currentStep, setCurrentStep] = useState(1);
    const [notes, setNotes] = useState('');
    const [returnables, setReturnables] = useState(0);
    const [loading, setLoading] = useState(false);
    const [orderNumber, setOrderNumber] = useState('');
    const { items, removeItem, updateQuantity, clearCart, getTotal, refreshCart } = useCart();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Calculate required returnables based on factor
    const requiredReturnables = items.reduce((sum, item) => {
        const factor = parseFloat(item.returnable_factor || 0);
        return sum + (item.quantity * factor);
    }, 0);

    // Set initial returnables to required amount when entering step 2
    useEffect(() => {
        if (currentStep === 2 && returnables === 0) {
            setReturnables(Math.ceil(requiredReturnables));
        }
    }, [currentStep, requiredReturnables]);

    // Refresh prices on mount to ensure Special Prices/Promos are up to date
    useEffect(() => {
        refreshCart();
    }, []);

    // Refresh prices on mount to ensure Special Prices/Promos are up to date
    useEffect(() => {
        refreshCart();
    }, []);

    const handleCreateOrder = async () => {
        setLoading(true);
        try {
            const orderItems = items.map(item => ({
                sku: item.sku,
                quantity: item.quantity,
                unit_price: Number(item.priceData?.unit_price || item.base_price || 0),
                discount_applied: 0,
                subtotal: Number(item.priceData?.unit_price || item.base_price || 0) * item.quantity
            }));

            const finalNotes = returnables > 0
                ? `${notes}\n[Retornables Entregados: ${returnables} (Requeridos: ${requiredReturnables})]`
                : notes;

            const response = await api.post('/orders/create.php', {
                items: orderItems,
                notes: finalNotes
            });

            setOrderNumber(response.data.order_number);
            setCurrentStep(4);
            clearCart();
        } catch (error) {
            // Si el error es 409 (Conflict), significa que la orden ya fue confirmada/creada.
            // Podemos asumir éxito y continuar.
            if (error.message && error.message.includes('already confirmed')) {
                console.log('Orden ya confirmada, procediendo...');
                setOrderNumber(orderNumber || 'CONFIRMADO'); // Fallback si no tenemos el número
                setCurrentStep(4);
                clearCart();
            } else {
                console.error('Error creating order:', error);
                alert('Error al crear el pedido. Intenta de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };

    const goToStep = (step) => {
        if (step >= 1 && step <= 4) {
            setCurrentStep(step);
        }
    };

    const canProceed = () => {
        if (currentStep === 1) return items.length > 0;
        return true;
    };

    // Step 1: Review Cart
    const renderStep1 = () => (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Revisemos tu pedido</h2>

            {items.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-semibold">Tu carrito está vacío</p>
                    <button
                        onClick={() => navigate('/catalog')}
                        className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                    >
                        Ir al catálogo
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {items.map((item) => {
                        const price = Number(item.priceData?.unit_price || item.base_price || 0);
                        return (
                            <div key={item.sku} className="bg-white rounded-xl shadow-md p-4 flex items-center gap-4">
                                {/* Product Image */}
                                <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="w-10 h-10 text-gray-400" />
                                    )}
                                </div>

                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900">{item.name}</h3>
                                    <p className="text-sm text-gray-500">{item.sku}</p>
                                    <p className="text-lg font-bold text-green-600 mt-1">
                                        ${price.toFixed(2)} x {item.quantity} = ${(price * item.quantity).toFixed(2)}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateQuantity(item.sku, item.quantity - 1)}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <span className="text-xl font-bold">-</span>
                                    </button>
                                    <span className="w-12 text-center font-bold">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity(item.sku, item.quantity + 1)}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <span className="text-xl font-bold">+</span>
                                    </button>
                                </div>

                                <button
                                    onClick={() => removeItem(item.sku)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        );
                    })}

                    <div className="bg-green-50 rounded-xl p-6 border-2 border-green-200">
                        <div className="flex justify-between items-center text-2xl font-black text-green-700">
                            <span>Total:</span>
                            <span>${getTotal().toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // Step 2: Returnables
    const renderStep2 = () => {
        const returnableItems = items.filter(item => parseFloat(item.returnable_factor || 0) > 0);

        return (
            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Envases Retornables</h2>

                {returnableItems.length > 0 ? (
                    <div className="bg-white rounded-xl shadow-md overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-100">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                <Info className="w-5 h-5 text-blue-500" />
                                Productos que requieren envase
                            </h3>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {returnableItems.map(item => {
                                const factor = parseFloat(item.returnable_factor);
                                const required = item.quantity * factor;
                                return (
                                    <div key={item.sku} className="p-4 flex items-center gap-4">
                                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                                            {item.image_url ? (
                                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <Package className="w-6 h-6 text-gray-400" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900">{item.name}</p>
                                            <p className="text-sm text-gray-500">Factor: {factor} x {item.quantity} u.</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-bold text-lg text-blue-600">{required}</span>
                                            <span className="text-xs text-gray-500">envases</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="p-4 bg-blue-50 flex justify-between items-center">
                            <span className="font-bold text-blue-800">Total Requerido:</span>
                            <span className="font-black text-xl text-blue-800">{requiredReturnables} envases</span>
                        </div>
                    </div>
                ) : (
                    <div className="bg-green-50 p-4 rounded-xl text-green-800 flex items-center gap-2">
                        <Check className="w-5 h-5" />
                        No hay productos que requieran envase en este pedido.
                    </div>
                )}

                <div className="bg-white rounded-xl p-6 shadow-md border-2 border-blue-100">
                    <AlertCircle className="w-12 h-12 text-blue-600 mb-4" />
                    <p className="text-gray-700 mb-4 font-medium">
                        Envases a entregar (calculado automáticamente):
                    </p>
                    <div className="flex items-center gap-4">
                        <div className="flex-1 px-4 py-3 bg-gray-100 border-2 border-gray-200 rounded-lg text-lg font-semibold text-gray-700">
                            {returnables}
                        </div>
                        <span className="font-bold text-gray-500">Envases</span>
                    </div>
                    <p className="text-blue-600 text-sm mt-2 font-medium">
                        * Se entregarán los envases requeridos para este pedido.
                    </p>
                </div>
            </div>
        );
    };

    // Step 3: Final Review
    const renderStep3 = () => (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Última Revisión</h2>

            <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-bold text-gray-800">Detalle del Pedido</h3>
                </div>
                <div className="divide-y divide-gray-100">
                    {items.map((item) => {
                        const unitPrice = Number(item.priceData?.unit_price || item.base_price || 0);
                        const finalPrice = Number(item.priceData?.unit_price || unitPrice);
                        const subtotal = finalPrice * item.quantity;
                        const hasDiscount = unitPrice > finalPrice;

                        return (
                            <div key={item.sku} className="p-4 flex gap-4">
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="w-8 h-8 text-gray-400" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-gray-900">{item.name}</h4>
                                            <p className="text-xs text-gray-500">{item.sku}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-gray-900">${subtotal.toFixed(2)}</p>
                                            {hasDiscount && (
                                                <p className="text-xs text-green-600 font-medium">Ahorraste: ${(unitPrice * item.quantity - subtotal).toFixed(2)}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-2 flex justify-between items-center text-sm">
                                        <span className="text-gray-600">{item.quantity} unidades</span>
                                        <div className="flex items-center gap-2">
                                            {hasDiscount && (
                                                <span className="text-gray-400 line-through text-xs">${unitPrice.toFixed(2)}</span>
                                            )}
                                            <span className="font-medium text-gray-900">${finalPrice.toFixed(2)} c/u</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="bg-gray-50 p-6 space-y-3 border-t border-gray-200">
                    {(() => {
                        // Calculate Totals securely from breakdown
                        const summary = items.reduce((acc, item) => {
                            // Support both 'breakdown' (new) and 'discounts_applied' (old cache)
                            const breakdown = item.priceData?.breakdown || item.priceData?.discounts_applied || [];

                            // Base Subtotal (Original Price * Qty)
                            const originalParams = item.priceData?.original_price
                                ? Number(item.priceData.original_price)
                                : Number(item.base_price);

                            acc.subtotal += originalParams * item.quantity;

                            // Surcharges
                            const surcharge = breakdown
                                .filter(b => b.type === 'surcharge')
                                .reduce((sum, b) => sum + Number(b.amount), 0);
                            acc.surcharges += surcharge * item.quantity;

                            // Discounts (Promos + GEC + Special Price)
                            // Note: Special Price is difference between Base and Special
                            const discount = breakdown
                                .filter(b => ['promotion', 'gec_discount', 'special_price'].includes(b.type))
                                .reduce((sum, b) => sum + Number(b.amount), 0);
                            acc.discounts += discount * item.quantity;

                            return acc;
                        }, { subtotal: 0, surcharges: 0, discounts: 0 });

                        // Recalculate Final Total to be exact
                        const calculatedTotal = summary.subtotal + summary.surcharges - summary.discounts;

                        return (
                            <>
                                <div className="flex justify-between text-gray-600">
                                    <span>Subtotal</span>
                                    <span>${summary.subtotal.toFixed(2)}</span>
                                </div>

                                {summary.discounts > 0 && (
                                    <div className="flex justify-between text-green-600 font-medium">
                                        <span>Descuentos aplicados</span>
                                        <span>-${summary.discounts.toFixed(2)}</span>
                                    </div>
                                )}

                                {summary.surcharges > 0 && (
                                    <div className="flex justify-between text-orange-600 font-medium">
                                        <span>Cargos (Envase/Desechable)</span>
                                        <span>+${summary.surcharges.toFixed(2)}</span>
                                    </div>
                                )}

                                {requiredReturnables > 0 && (
                                    <div className="flex justify-between text-blue-600 font-medium pt-2 border-t border-gray-200">
                                        <span>Envases requeridos</span>
                                        <span>{requiredReturnables}</span>
                                    </div>
                                )}

                                <div className="flex justify-between text-2xl font-black text-gray-900 pt-2 border-t border-gray-200">
                                    <span>Total a Pagar</span>
                                    <span>${calculatedTotal.toFixed(2)}</span>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="font-bold text-gray-700 mb-4">Información Adicional</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block font-bold text-gray-700 mb-2">
                            Envases a entregar
                        </label>
                        <div className="bg-gray-100 p-3 rounded-lg font-medium text-gray-900">
                            {returnables} envases
                        </div>
                    </div>

                    <div>
                        <label className="block font-bold text-gray-700 mb-2">
                            Notas
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            rows="2"
                            placeholder="Instrucciones especiales..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    // Step 4: Success
    const renderStep4 = () => (
        <div className="text-center py-12 space-y-6">
            <PartyPopper className="w-24 h-24 text-green-600 mx-auto" />
            <h2 className="text-3xl font-black text-gray-900">¡Pedido Creado!</h2>
            <div className="bg-green-50 rounded-2xl p-8 border-2 border-green-200 max-w-md mx-auto">
                <p className="text-gray-700 mb-2">Tu número de pedido es:</p>
                <p className="text-3xl font-black text-green-700">{orderNumber}</p>
            </div>
            <p className="text-gray-600">
                Televenta confirmará tu pedido pronto y te notificará la fecha de entrega.
            </p>
            <div className="flex gap-4 justify-center">
                <button
                    onClick={() => navigate('/catalog')}
                    className="bg-gray-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-gray-700 transition-colors"
                >
                    Seguir comprando
                </button>
                <button
                    onClick={() => navigate('/orders')}
                    className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-green-700 transition-colors"
                >
                    Ver mis pedidos
                </button>
            </div>
        </div>
    );

    const renderCurrentStep = () => {
        switch (currentStep) {
            case 1:
                return renderStep1();
            case 2:
                return renderStep2();
            case 3:
                return renderStep3();
            case 4:
                return renderStep4();
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-green-50/30">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-800 to-green-700 text-white py-6">
                <div className="max-w-7xl mx-auto px-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate('/catalog')}
                        className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black">Checkout</h1>
                        <p className="text-green-100">Cliente: {user?.client_code}</p>
                    </div>
                </div>
            </div>

            {/* Stepper */}
            <div className="bg-white shadow-sm">
                <CheckoutStepper currentStep={currentStep} steps={STEPS} />
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                {renderCurrentStep()}

                {/* Navigation */}
                {currentStep < 4 && (
                    <div className="flex gap-4 mt-8">
                        {currentStep > 1 && (
                            <button
                                onClick={() => goToStep(currentStep - 1)}
                                className="flex items-center gap-2 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                                Anterior
                            </button>
                        )}

                        <button
                            onClick={() => {
                                if (currentStep === 3) {
                                    handleCreateOrder();
                                } else {
                                    goToStep(currentStep + 1);
                                }
                            }}
                            disabled={!canProceed() || loading}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                'Procesando...'
                            ) : currentStep === 3 ? (
                                <>
                                    <Check className="w-5 h-5" />
                                    Confirmar Pedido
                                </>
                            ) : (
                                <>
                                    Siguiente
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
