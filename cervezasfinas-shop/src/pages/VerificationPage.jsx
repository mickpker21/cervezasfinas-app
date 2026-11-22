import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle2, XCircle, Package, ArrowRight } from 'lucide-react';

const VerificationPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const id = searchParams.get('id');
    const [loading, setLoading] = useState(true);
    const [sale, setSale] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id) {
            setError("Código inválido");
            setLoading(false);
            return;
        }

        const fetchSale = async () => {
            try {
                // 1. Fetch Sale Header & Items
                // Table is 'direct_sales' based on repository
                const { data: saleData, error: saleError } = await supabase
                    .from('direct_sales')
                    .select('*, direct_sales_items(*)')
                    .eq('id', id)
                    .single();

                if (saleError) throw saleError;

                let finalItems = [];
                // Map direct_sales_items to expected structure
                if (saleData && saleData.direct_sales_items) {
                    finalItems = saleData.direct_sales_items;
                }

                // 2. Fetch Product Names from 'precios' catalog if items exist
                if (finalItems.length > 0) {
                    const skus = finalItems.map(i => i.cve_marca).filter(Boolean);
                    if (skus.length > 0) {
                        const { data: products } = await supabase
                            .from('precios')
                            .select('cve_marca, des_marca')
                            .in('cve_marca', skus);

                        // Merge descriptions
                        finalItems = finalItems.map(item => {
                            const prod = products?.find(p => p.cve_marca === item.cve_marca);
                            return {
                                ...item,
                                des_marca: prod?.des_marca || item.des_marca || 'Producto Desconocido'
                            };
                        });
                    }
                }

                saleData.items = finalItems;
                setSale(saleData);
            } catch (err) {
                console.error("Verification error:", err);
                setError("Pedido no encontrado");
            } finally {
                setLoading(false);
            }
        };

        fetchSale();
    }, [id]);

    // Re-generate the hash to verify match
    const getVerificationCode = (saleData) => {
        if (!saleData) return '---';
        const vid = saleData.preventaId || saleData.id || '000000';
        const dateStr = saleData.created_at ? new Date(saleData.created_at).getDate() : new Date().getDate();
        const str = vid.toString() + dateStr;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0').match(/.{1,4}/g).join('-');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#1a1c2e] flex items-center justify-center text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (error || !sale) {
        return (
            <div className="min-h-screen bg-[#1a1c2e] flex flex-col items-center justify-center text-white p-4">
                <XCircle className="w-24 h-24 text-red-500 mb-4" />
                <h1 className="text-2xl font-bold mb-2">Verificación Fallida</h1>
                <p className="text-gray-400 mb-8">{error || "No pudimos localizar este pedido."}</p>
                <button
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg font-bold transition-colors"
                    onClick={() => navigate('/')}
                >
                    Volver al Inicio
                </button>
            </div>
        );
    }

    const verificationCode = getVerificationCode(sale);

    return (
        <div className="min-h-screen bg-[#1a1c2e] text-white p-6 flex flex-col items-center">
            <div className="w-full max-w-md bg-[#2a2c44] rounded-2xl p-8 shadow-2xl border border-white/10 mt-10">
                <div className="flex justify-center mb-6">
                    <div className="bg-green-500/20 p-4 rounded-full">
                        <CheckCircle2 className="w-16 h-16 text-green-500" />
                    </div>
                </div>

                <h1 className="text-center text-2xl font-bold mb-1">Pedido Verificado</h1>
                <p className="text-center text-gray-400 text-sm mb-8">La autenticidad de este ticket ha sido confirmada.</p>

                <div className="space-y-4">
                    <div className="bg-[#1a1c2e] p-4 rounded-xl border border-white/5">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Código de Verificación</p>
                        <p className="text-xl font-mono font-bold tracking-widest text-blue-400">{verificationCode}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#1a1c2e] p-4 rounded-xl border border-white/5">
                            <p className="text-xs text-gray-500 uppercase mb-1">Total</p>
                            <p className="text-lg font-bold">${Number(sale.total_amount || sale.totalAmount).toFixed(2)}</p>
                        </div>
                        <div className="bg-[#1a1c2e] p-4 rounded-xl border border-white/5">
                            <p className="text-xs text-gray-500 uppercase mb-1">Fecha</p>
                            <p className="text-sm font-bold">{new Date(sale.created_at).toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="bg-[#1a1c2e] p-4 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                            <Package size={16} className="text-gray-400" />
                            <p className="text-xs text-gray-500 uppercase">Detalle ({sale.items?.length || 0} artículos)</p>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {sale.items?.map((item, i) => (
                                <div key={i} className="flex justify-between text-sm border-b border-white/5 pb-1 last:border-0">
                                    <span className="text-gray-300 truncate pr-4">{item.des_marca || item.cve_marca || 'Producto'}</span>
                                    <span className="font-mono text-gray-500">x{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex flex-col gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                    >
                        Ir a la Tienda <ArrowRight size={18} />
                    </button>
                </div>

                <div className="mt-8 text-center">
                    <p className="text-xs text-gray-500">Cervezas Finas Shop</p>
                </div>
            </div>
        </div>
    );
};

export default VerificationPage;
