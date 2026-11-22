import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Phone, Loader2, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network } from '@capacitor/network';
import { isOnline } from '@/lib/network';

export default function MandatoryPhoneModal() {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let active = true;
        let networkListener = null;
        const hasPhone = Boolean(user?.user_metadata?.phone || user?.profile?.phone);

        const refreshVisibility = async () => {
            const online = await isOnline().catch(() => false);
            if (active) setOpen(Boolean(user && !hasPhone && online));
        };

        refreshVisibility();
        window.addEventListener('online', refreshVisibility);
        window.addEventListener('offline', refreshVisibility);
        Network.addListener('networkStatusChange', refreshVisibility)
            .then((listener) => {
                if (active) networkListener = listener;
                else listener.remove();
            })
            .catch(() => {});

        return () => {
            active = false;
            window.removeEventListener('online', refreshVisibility);
            window.removeEventListener('offline', refreshVisibility);
            networkListener?.remove();
        };
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validation: 10 digits
        const cleanPhone = phone.replace(/\s/g, '');
        if (!/^\d{10}$/.test(cleanPhone)) {
            toast({
                title: "Número inválido",
                description: "Por favor ingresa un número de 10 dígitos.",
                variant: "destructive"
            });
            return;
        }

        setLoading(true);
        try {
            // 1. Update profiles table
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ phone: cleanPhone })
                .eq('id', user.id);

            if (profileError) throw profileError;

            // 2. Update auth metadata to sync session immediately
            const { error: authError } = await supabase.auth.updateUser({
                data: { phone: cleanPhone }
            });

            if (authError) throw authError;

            toast({
                title: "¡Listo!",
                description: "Tu número ha sido registrado correctamente.",
            });
            
            setOpen(false);
        } catch (error) {
            console.error('[MandatoryPhoneModal] Error:', error);
            toast({
                title: "Error",
                description: "No se pudo guardar el teléfono. Intenta de nuevo.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent className="sm:max-w-[400px] bg-slate-900/95 border border-slate-800 backdrop-blur-xl shadow-2xl rounded-3xl p-0 overflow-hidden">
                <div className="bg-gradient-to-br from-emerald-600/20 to-cyan-600/20 p-6">
                    <DialogHeader className="mb-4">
                        <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-4 border border-emerald-500/30">
                            <Phone className="w-6 h-6 text-emerald-400" />
                        </div>
                        <DialogTitle className="text-2xl font-bold text-white">Actualización de Perfil</DialogTitle>
                        <DialogDescription className="text-slate-300 text-sm mt-2 leading-relaxed">
                            ¡Hola! Para poder contactarte y notificarte sobre tus tickets asignados, necesitamos tu número de WhatsApp de 10 dígitos.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                Número Celular (WhatsApp)
                            </Label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">+52</span>
                                <Input
                                    id="phone"
                                    type="tel"
                                    placeholder="55 1234 5678"
                                    value={phone}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        if (val.length <= 10) setPhone(val);
                                    }}
                                    className="pl-12 bg-slate-950/50 border-slate-700/50 text-white rounded-2xl h-12 focus:ring-emerald-500/50 focus:border-emerald-500/50 placeholder:text-slate-600"
                                    required
                                    autoFocus
                                />
                            </div>
                            <p className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-1">
                                <span className="w-1 h-1 bg-emerald-500 rounded-full"></span>
                                Solo números, sin espacios ni guiones.
                            </p>
                        </div>

                        <Button 
                            type="submit" 
                            disabled={loading || phone.length < 10}
                            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <Save className="w-5 h-5 mr-2" />
                                    Guardar y Continuar
                                </>
                            )}
                        </Button>
                    </form>
                </div>
                
                <div className="bg-slate-950/30 p-4 border-t border-slate-800/50 text-center">
                    <p className="text-[11px] text-slate-500 italic">
                        Esta información es requerida para el funcionamiento del sistema Helpdesk.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
