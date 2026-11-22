import React, { useState, useEffect } from 'react'; // Force refresh
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import FullPageLoader from '@/components/FullPageLoader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Camera, Save, Lock, User, Briefcase, Phone, Mail, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Helmet } from 'react-helmet-async';

const UserProfile = () => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Profile State
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        phone: '',
        job_title: '',
        department: '',
        employee_id: '',
        start_date: '',
        photo_url: null
    });

    // Password Reset State
    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [changingPwd, setChangingPwd] = useState(false);

    useEffect(() => {
        if (user) loadProfile();
    }, [user]);

    const loadProfile = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            if (data) {
                setProfile({
                    ...data,
                    // Ensure fields are not null for inputs
                    phone: data.phone || '',
                    job_title: data.job_title || 'No asignado',
                    department: data.department || 'General',
                    employee_id: data.employee_id || 'N/A',
                    start_date: data.start_date || '',
                    photo_url: data.photo_url
                });
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            toast({ title: "Error", description: "No se pudo cargar el perfil.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    phone: profile.phone,
                    // Allow updating photo_url if managed elsewhere (e.g. upload)
                    photo_url: profile.photo_url
                })
                .eq('id', user.id);

            if (error) throw error;

            toast({ title: "Perfil actualizado", description: "Tus datos se han guardado correctamente." });
        } catch (error) {
            console.error('Error updating profile:', error);
            toast({ title: "Error", description: "No se pudo actualizar el perfil.", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handlePhotoUpload = async (event) => {
        try {
            setSaving(true);
            const file = event.target.files[0];
            if (!file) return;

            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload to 'avatars' bucket
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // Update Profile with new URL
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ photo_url: publicUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;

            setProfile(prev => ({ ...prev, photo_url: publicUrl }));
            toast({ title: "Foto actualizada", description: "Tu foto de perfil se ha subido correctamente." });

        } catch (error) {
            console.error('Error uploading photo:', error);
            toast({ title: "Error", description: "No se pudo subir la foto.", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        if (!passwords.currentPassword) {
            toast({ title: "Error", description: "Ingresa tu contraseña actual.", variant: "destructive" });
            return;
        }
        if (passwords.newPassword !== passwords.confirmPassword) {
            toast({ title: "Error", description: "Las contraseñas no coinciden.", variant: "destructive" });
            return;
        }
        if (passwords.newPassword.length < 6) {
            toast({ title: "Error", description: "La contraseña debe tener al menos 6 caracteres.", variant: "destructive" });
            return;
        }
        if (passwords.currentPassword === passwords.newPassword) {
            toast({ title: "Error", description: "La nueva contraseña debe ser diferente a la actual.", variant: "destructive" });
            return;
        }

        setChangingPwd(true);
        try {
            // Re-authenticate first so Supabase accepts the update
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: passwords.currentPassword
            });

            if (signInError) {
                toast({ title: "Contraseña actual incorrecta", description: "Verifica que tu contraseña actual sea correcta.", variant: "destructive" });
                return;
            }

            const { error } = await supabase.auth.updateUser({
                password: passwords.newPassword
            });

            if (error) throw error;

            toast({ title: "✅ Contraseña actualizada", description: "Tu contraseña ha sido cambiada exitosamente." });
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            console.error('Error resetting password:', error);
            const msg = error.message?.includes('Auth session missing')
                ? 'Tu sesión expiró. Cierra sesión y vuelve a entrar para cambiar la contraseña.'
                : error.message || 'No se pudo actualizar la contraseña.';
            toast({ title: "Error", description: msg, variant: "destructive" });
        } finally {
            setChangingPwd(false);
        }
    };

    if (loading) return <FullPageLoader />;

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 pb-20">
            <Helmet>
                <title>Mi Perfil - Cervezas Finas</title>
            </Helmet>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row gap-6 items-start">

                {/* Left Column: Photo & Basic Info */}
                <div className="w-full md:w-1/3 rounded-2xl border border-white/[0.08] bg-slate-900/70 backdrop-blur-md p-6 flex flex-col items-center text-center space-y-4">
                    <div className="relative group">
                        <Avatar className="w-32 h-32 border-4 border-slate-700 shadow-xl">
                            <AvatarImage src={profile.photo_url} className="object-cover" />
                            <AvatarFallback className="text-4xl bg-slate-800 text-emerald-400">
                                {profile.name?.charAt(0) || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        <label htmlFor="photo-upload" className="absolute bottom-0 right-0 bg-emerald-600 p-2 rounded-full text-white cursor-pointer hover:bg-emerald-500 shadow-lg transition-transform hover:scale-110">
                            <Camera className="w-5 h-5" />
                            <input
                                id="photo-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handlePhotoUpload}
                                disabled={saving}
                            />
                        </label>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                        <p className="text-sm text-slate-400">{profile.job_title}</p>
                        <span className="inline-block mt-2 px-3 py-1 bg-emerald-500/15 text-emerald-300 text-xs rounded-full font-medium border border-emerald-500/30">
                            {profile.role?.toUpperCase()}
                        </span>
                    </div>

                    <div className="w-full pt-4 border-t border-white/10 space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-400">ID Empleado</span>
                            <span className="font-mono font-medium text-slate-200">{profile.employee_id}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Departamento</span>
                            <span className="font-medium text-slate-200">{profile.department}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Ingreso</span>
                            <span className="font-medium text-slate-200">{profile.start_date || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                {/* Right Column: Edit Forms */}
                <div className="w-full md:w-2/3 space-y-6">
                    <Tabs defaultValue="personal" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-slate-900 border border-white/[0.08]">
                            <TabsTrigger value="personal" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-300 text-slate-400"><User className="w-4 h-4 mr-2" /> Datos Personales</TabsTrigger>
                            <TabsTrigger value="security" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-300 text-slate-400"><Lock className="w-4 h-4 mr-2" /> Seguridad</TabsTrigger>
                        </TabsList>

                        <TabsContent value="personal">
                            <div className="rounded-2xl border border-white/[0.08] bg-slate-900/70 backdrop-blur-md p-6 mt-2">
                                <h3 className="text-lg font-bold text-white mb-1">Información de Contacto</h3>
                                <p className="text-sm text-slate-400 mb-6">Actualiza tu información de contacto. Algunos campos son de solo lectura.</p>
                                <form onSubmit={handleProfileUpdate} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">Nombre Completo</label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                                <input value={profile.name} disabled className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800/60 border border-white/[0.08] text-slate-300 text-sm disabled:opacity-60 cursor-not-allowed" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">Correo Electrónico</label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                                <input value={profile.email} disabled className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800/60 border border-white/[0.08] text-slate-300 text-sm disabled:opacity-60 cursor-not-allowed" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">Departamento</label>
                                            <div className="relative">
                                                <Briefcase className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                                <input value={profile.department} disabled className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800/60 border border-white/[0.08] text-slate-300 text-sm disabled:opacity-60 cursor-not-allowed" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">Fecha Ingreso</label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                                <input value={profile.start_date} disabled className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800/60 border border-white/[0.08] text-slate-300 text-sm disabled:opacity-60 cursor-not-allowed" />
                                            </div>
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <label htmlFor="phone" className="text-xs font-medium text-slate-300 uppercase tracking-wide">Teléfono de Contacto</label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                                <input
                                                    id="phone"
                                                    value={profile.phone}
                                                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                                    placeholder="55 1234 5678"
                                                    className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800 border border-emerald-500/40 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                                                />
                                            </div>
                                            <p className="text-xs text-slate-500">Este número será visible para tu supervisor y RRHH en caso de emergencia.</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-4">
                                        <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-60">
                                            <Save className="w-4 h-4" />
                                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </TabsContent>

                        {/* Security Tab */}
                        <TabsContent value="security">
                            <div className="rounded-2xl border border-white/[0.08] bg-slate-900/70 backdrop-blur-md p-6 mt-2">
                                <h3 className="text-lg font-bold text-white mb-1">Seguridad de la Cuenta</h3>
                                <p className="text-sm text-slate-400 mb-6">Gestiona tu contraseña de acceso.</p>
                                <form onSubmit={handlePasswordReset} className="space-y-4 max-w-md">
                                    <div className="space-y-2">
                                        <label htmlFor="current-password" className="text-xs font-medium text-slate-300 uppercase tracking-wide">Contraseña Actual</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                            <input id="current-password" type="password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} placeholder="Tu contraseña actual" className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-400" autoComplete="current-password" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="new-password" className="text-xs font-medium text-slate-300 uppercase tracking-wide">Nueva Contraseña</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                            <input id="new-password" type="password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} placeholder="Mínimo 6 caracteres" className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-400" autoComplete="new-password" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="confirm-password" className="text-xs font-medium text-slate-300 uppercase tracking-wide">Confirmar Nueva Contraseña</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                            <input id="confirm-password" type="password" value={passwords.confirmPassword} onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })} placeholder="Repite la nueva contraseña" className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-400" autoComplete="new-password" />
                                        </div>
                                    </div>
                                    <div className="flex justify-start pt-4">
                                        <button type="submit" disabled={changingPwd} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-60">
                                            <Lock className="w-4 h-4" />
                                            {changingPwd ? 'Actualizando...' : 'Cambiar Contraseña'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

            </motion.div>
        </div>
    );
};

export default UserProfile;
