import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Megaphone, Plus, Percent, CalendarDays, Target } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const TradePromotionsPage = () => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isCreating, setIsCreating] = useState(false);
    const [newPromo, setNewPromo] = useState({
        name: '', description: '', discount_percent: '', start_date: '', end_date: '', target_role: 'autoventa'
    });

    const fetchPromotions = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('trade_promotions').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setPromotions(data || []);
        } catch (error) {
            console.error("Error fetching promotions:", error);
            // Fallback for when the table doesn't exist yet (before migration script runs)
            if (error.code === '42P01') {
                toast({ title: 'Aviso', description: 'La tabla trade_promotions no existe. Ejecuta el script SQL de Fase 4.', variant: 'destructive' });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPromotions();
    }, []);

    const handleCreatePromotion = async (e) => {
        e.preventDefault();
        try {
            const { data, error } = await supabase.from('trade_promotions').insert({
                ...newPromo,
                created_by: user.id
            }).select();

            if (error) throw error;

            toast({ title: 'Éxito', description: 'Campaña creada correctamente.', className: 'bg-emerald-600 text-white' });
            setPromotions([data[0], ...promotions]);
            setIsCreating(false);
            setNewPromo({ name: '', description: '', discount_percent: '', start_date: '', end_date: '', target_role: 'autoventa' });
        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'No se pudo crear la campaña', variant: 'destructive' });
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            <Helmet>
                <title>Trade Marketing Promociones - Cervezas Finas</title>
            </Helmet>

            <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-500 flex items-center gap-2">
                        <Megaphone className="h-8 w-8 text-emerald-500" />
                        Campañas y Promociones
                    </h1>
                    <p className="text-slate-400">Gestión centralizada de descuentos y activaciones B2B.</p>
                </div>
                <Button onClick={() => setIsCreating(!isCreating)} className="bg-emerald-600 hover:bg-emerald-500 font-bold">
                    <Plus className="mr-2 h-4 w-4" /> Nueva Campaña
                </Button>
            </header>

            {isCreating && (
                <Card className="bg-slate-900 border-emerald-500/30 mb-8 shadow-xl shadow-emerald-900/20">
                    <CardHeader>
                        <CardTitle className="text-emerald-400">Crear Nueva Campaña</CardTitle>
                        <CardDescription className="text-slate-400">Define los parámetros del descuento comercial.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreatePromotion} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Nombre de Campaña</label>
                                    <Input required value={newPromo.name} onChange={e => setNewPromo({...newPromo, name: e.target.value})} placeholder="Ej. Buen Fin Cervezas" className="bg-slate-950 border-slate-700" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Descuento (%)</label>
                                    <div className="relative">
                                        <Percent className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                                        <Input required type="number" step="0.01" value={newPromo.discount_percent} onChange={e => setNewPromo({...newPromo, discount_percent: e.target.value})} placeholder="10.00" className="pl-10 bg-slate-950 border-slate-700" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Fecha de Inicio</label>
                                    <Input required type="date" value={newPromo.start_date} onChange={e => setNewPromo({...newPromo, start_date: e.target.value})} className="bg-slate-950 border-slate-700" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Fecha de Fin</label>
                                    <Input required type="date" value={newPromo.end_date} onChange={e => setNewPromo({...newPromo, end_date: e.target.value})} className="bg-slate-950 border-slate-700" />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-sm font-medium text-slate-300">Descripción / Condiciones</label>
                                    <Input required value={newPromo.description} onChange={e => setNewPromo({...newPromo, description: e.target.value})} placeholder="Solo aplica en compras mayores a 10 cajas..." className="bg-slate-950 border-slate-700" />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>Cancelar</Button>
                                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 font-bold">Guardar y Activar</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                <Table>
                    <TableHeader className="bg-slate-950/50">
                        <TableRow className="border-slate-800">
                            <TableHead className="text-slate-400">Campaña</TableHead>
                            <TableHead className="text-slate-400">Descuento</TableHead>
                            <TableHead className="text-slate-400">Vigencia</TableHead>
                            <TableHead className="text-slate-400">Estado</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">Cargando campañas...</TableCell></TableRow>
                        ) : promotions.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No hay campañas activas.</TableCell></TableRow>
                        ) : (
                            promotions.map(promo => (
                                <TableRow key={promo.id} className="border-slate-800 hover:bg-slate-800/50">
                                    <TableCell>
                                        <div className="font-bold text-white">{promo.name}</div>
                                        <div className="text-xs text-slate-500 max-w-md truncate">{promo.description}</div>
                                    </TableCell>
                                    <TableCell className="font-mono text-emerald-400 font-bold">
                                        {promo.discount_percent}%
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-300">
                                        <div className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {promo.start_date} al {promo.end_date}</div>
                                    </TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${promo.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-400'}`}>
                                            {promo.status}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default TradePromotionsPage;
