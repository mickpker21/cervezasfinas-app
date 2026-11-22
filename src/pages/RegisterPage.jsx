
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Link, useNavigate } from 'react-router-dom';

const RegisterPage = () => {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        name: '',
        role: 'conquista',
        route: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const { signUp } = useSupabaseAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            toast({
                title: 'Error de registro',
                description: 'Las contraseñas no coinciden.',
                variant: 'destructive',
            });
            return;
        }
        if (!formData.route) {
            toast({
                title: 'Error de registro',
                description: 'Debes ingresar el número de ruta.',
                variant: 'destructive',
            });
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const { error } = await signUp({
            email: formData.email,
            password: formData.password,
            options: {
                data: {
                    name: formData.name,
                    role: formData.role,
                    route: formData.route
                }
            }
        });

        if (error) {
            toast({
                title: 'Error de registro',
                description: error.message || 'Ocurrió un error al registrar el usuario.',
                variant: 'destructive',
            });
        } else {
            toast({
                title: '¡Registro exitoso!',
                description: 'Revisa tu correo para confirmar tu cuenta.',
            });
            navigate('/');
        }
        setIsLoading(false);
    };

    return (
        <>
            <Helmet>
                <title>Registro - Cervezas Finas</title>
                <meta name="description" content="Página de registro para el CRM de Cervezas Finas." />
            </Helmet>

            <div className="min-h-screen bg-background px-2 py-4 md:p-6 flex justify-center overflow-x-hidden">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="w-full flex justify-center"
                >
                    <Card className="w-full max-w-[98vw] sm:max-w-sm md:max-w-lg heineken-card shadow-lg rounded-2xl border border-green-700 bg-opacity-90 mx-1 flex flex-col">
                        <CardHeader className="text-center pb-2 px-2">
                            <div className="flex justify-center mb-2 md:mb-4">
                                <img
                                    alt="Cervezas Finas Logo"
                                    className="h-10 sm:h-12 md:h-16 w-auto"
                                    src="/logo2.jpeg"
                                />
                            </div>
                            <CardTitle className="text-lg sm:text-xl md:text-2xl text-white">Crear una cuenta</CardTitle>
                            <CardDescription className="text-green-200 text-xs sm:text-sm md:text-base">
                                Únete al equipo de Cervezas Finas
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="px-2 sm:px-4 overflow-y-auto scrollbar-thin scrollbar-thumb-green-600 scrollbar-track-gray-200" style={{ maxHeight: '75vh' }}>
                            <form onSubmit={handleSubmit} className="space-y-4" id="register-form">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="name" className="text-white text-sm">Nombre Completo</Label>
                                        <Input
                                            id="name"
                                            name="name"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            className="heineken-input text-sm py-2"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="route" className="text-white text-sm">Número de Ruta</Label>
                                        <Input
                                            id="route"
                                            name="route"
                                            value={formData.route}
                                            onChange={e => setFormData({ ...formData, route: e.target.value })}
                                            required
                                            className="heineken-input text-sm py-2"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="email" className="text-white text-sm">Email</Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        required
                                        className="heineken-input text-sm py-2"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="password" className="text-white text-sm">Contraseña</Label>
                                        <Input
                                            id="password"
                                            name="password"
                                            type="password"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            required
                                            className="heineken-input text-sm py-2"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="confirmPassword" className="text-white text-sm">Confirmar Contraseña</Label>
                                        <Input
                                            id="confirmPassword"
                                            name="confirmPassword"
                                            type="password"
                                            value={formData.confirmPassword}
                                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                            required
                                            className="heineken-input text-sm py-2"
                                        />
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <Button
                                        type="submit"
                                        form="register-form"
                                        className="w-full heineken-button py-2 text-base"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? 'Registrando...' : 'Crear Cuenta'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>

                        <CardFooter className="flex justify-center pt-4">
                            <p className="text-xs md:text-sm text-gray-400">
                                ¿Ya tienes una cuenta?{' '}
                                <Link to="/" className="font-semibold text-green-400 hover:text-green-300">
                                    Inicia Sesión
                                </Link>
                            </p>
                        </CardFooter>
                    </Card>
                </motion.div>

                {/* Botones flotantes móviles */}
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-4 w-[90vw] max-w-md justify-center md:hidden pointer-events-auto">
                    <button
                        type="button"
                        className="bg-green-600 text-white rounded-full shadow-lg px-5 py-2 text-base font-semibold w-1/2"
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    >
                        Subir
                    </button>
                    <button
                        type="button"
                        className="bg-green-600 text-white rounded-full shadow-lg px-5 py-2 text-base font-semibold w-1/2"
                        onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                    >
                        Bajar
                    </button>
                </div>
            </div>
        </>
    );
};

export default RegisterPage;