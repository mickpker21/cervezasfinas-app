import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package2, TrendingUp, Star, Gift, Camera, User, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AccountModal from './AccountModal';

export const SHOP_NAV_ITEMS = [
    { path: '/catalog', label: 'Catálogo', icon: Package2 },
    { path: '/orders', label: 'Pedidos', icon: TrendingUp },
    { path: '/points', label: 'Puntos', icon: Star, requiresPoints: true },
    { path: '/redeem', label: 'Canjear', icon: Gift, requiresPoints: true },
    { path: '/cooler-execution', label: 'Enfriador', icon: Camera, requiresPoints: true },
];

export function isPointsEnabledForUser(user) {
    if (!user) return true;
    if (user.points_enabled === undefined || user.points_enabled === null) return true;
    return Number(user.points_enabled) === 1;
}

export function getVisibleShopNavItems(user) {
    const canEarnPoints = isPointsEnabledForUser(user);
    return SHOP_NAV_ITEMS.filter(item => canEarnPoints || !item.requiresPoints);
}

export default function BottomNav() {
    const location = useLocation();
    const navigate = useNavigate();
    const { isAuthenticated, user, logout } = useAuth();
    const [isAccountOpen, setIsAccountOpen] = useState(false);

    if (!isAuthenticated) return null;
    if (['/login', '/verificar', '/terminos', '/privacidad'].includes(location.pathname)) return null;

    const isCatalogPage = location.pathname === '/catalog';
    const visibleNavItems = getVisibleShopNavItems(user);

    return (
        <>
            {/* En PC (md+): Barra de botones de opción compacta en la parte superior para páginas fuera de Catálogo */}
            {!isCatalogPage && (
                <div className="hidden md:block fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-green-800 via-green-700 to-green-800 shadow-md border-b border-white/10">
                    <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
                        <button
                            type="button"
                            onClick={() => navigate('/catalog')}
                            className="flex items-center gap-2.5 text-white hover:opacity-90 transition-opacity"
                        >
                            <img src="/logo.png" alt="Logo" className="h-9 w-auto object-contain rounded-lg" />
                            <span className="font-black text-base tracking-tight">Cervezas Finas Shop</span>
                        </button>

                        <div className="flex items-center gap-1 sm:gap-1.5 bg-black/20 p-1 rounded-full border border-white/15">
                            {visibleNavItems.map(item => {
                                const Icon = item.icon;
                                const active = location.pathname === item.path;
                                return (
                                    <button
                                        key={item.path}
                                        type="button"
                                        onClick={() => navigate(item.path)}
                                        title={item.label}
                                        className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                            active
                                                ? 'bg-white text-green-800 shadow-sm'
                                                : 'text-white/90 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5 shrink-0" />
                                        <span className="hidden lg:inline">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAccountOpen(true)}
                                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-2.5 lg:px-3 py-1.5 rounded-full text-xs font-bold border border-white/20 transition-all"
                                title="Editar teléfono o cambiar contraseña"
                            >
                                <User className="w-3.5 h-3.5" />
                                <span className="hidden lg:inline">Mi Cuenta ({user?.client_code})</span>
                                <span className="lg:hidden">{user?.client_code}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { logout(); navigate('/login'); }}
                                title="Cerrar sesión"
                                className="bg-red-500/20 hover:bg-red-500/30 p-1.5 rounded-full text-white border border-red-400/30 transition-all"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Espaciador en PC cuando no es Catálogo para la barra superior */}
            {!isCatalogPage && <div className="hidden md:block h-14" />}

            {/* En Teléfono (< md): Barra inferior de navegación */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
                <div className={`w-full max-w-lg mx-auto px-1 h-16 grid ${visibleNavItems.length === 2 ? 'grid-cols-2' : 'grid-cols-5'} items-center`}>
                    {visibleNavItems.map(item => {
                        const Icon = item.icon;
                        const active = location.pathname === item.path;
                        return (
                            <button
                                key={item.path}
                                type="button"
                                onClick={() => navigate(item.path)}
                                className={`flex flex-col items-center justify-center w-full min-w-0 py-1 px-0.5 rounded-xl transition-all ${
                                    active
                                        ? 'text-green-700 dark:text-green-400 font-bold scale-105'
                                        : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 font-medium'
                                }`}
                            >
                                <div
                                    className={`p-1.5 rounded-xl transition-colors ${
                                        active ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : ''
                                    }`}
                                >
                                    <Icon className="w-5 h-5 shrink-0" />
                                </div>
                                <span className="text-[10px] sm:text-xs leading-none mt-1 truncate max-w-full text-center px-0.5">
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </nav>

            <AccountModal isOpen={isAccountOpen} onClose={() => setIsAccountOpen(false)} />
        </>
    );
}
