import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, ArrowDownToLine, Share, PlusSquare, Check } from 'lucide-react';

export default function InstallApkBanner() {
    const [dismissed, setDismissed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSModal, setShowIOSModal] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);

    useEffect(() => {
        // Detectar si está en móvil o tableta
        const ua = navigator.userAgent || '';
        const isTabletDevice = /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const mobileCheck = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || isTabletDevice;
        setIsMobile(mobileCheck);

        // Detectar si es iOS (iPhone / iPad)
        const iosCheck = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        setIsIOS(iosCheck);

        // Si ya fue cerrada en esta sesión
        if (sessionStorage.getItem('cf_shop_apk_banner_closed')) {
            setDismissed(true);
        }

        // PWA install prompt handler (Chrome/Android)
        const handleBeforeInstall = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    }, []);

    // Solo mostrar en navegadores móviles (no dentro de la app nativa ni en escritorio)
    if (dismissed || !isMobile) return null;

    // Si ya corre dentro de la APK (Capacitor o WebView Android) o modo standalone (PWA ya instalada)
    const isInsideApp = typeof window !== 'undefined' && (
        window.Capacitor?.isNativePlatform?.() ||
        window.matchMedia('(display-mode: standalone)').matches ||
        /wv|Capacitor/i.test(navigator.userAgent || '')
    );
    if (isInsideApp) {
        return null;
    }

    const handleDismiss = () => {
        setDismissed(true);
        sessionStorage.setItem('cf_shop_apk_banner_closed', '1');
    };

    const handleAction = async () => {
        // En iOS, no existe archivo APK: se guía al usuario para agregar a pantalla de inicio
        if (isIOS) {
            setShowIOSModal(true);
            return;
        }

        // En Android: descargar SIEMPRE la APK nativa directamente (prioridad sobre acceso directo PWA)
        const apkUrl = '/cervezasfinas-shop.apk';
        const link = document.createElement('a');
        link.href = apkUrl;
        link.download = 'cervezasfinas-shop.apk';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
            <div className="bg-gradient-to-r from-emerald-800 via-green-700 to-emerald-900 text-white px-3 sm:px-4 py-2.5 shadow-md flex items-center justify-between gap-3 border-b border-green-600/40 relative z-40">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20 p-1">
                        <img src="/logo.png" alt="CF" className="w-full h-full object-contain" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-black tracking-tight leading-tight truncate">
                            Instala la App de Cervezas Finas
                        </p>
                        <p className="text-[10px] text-green-200/90 leading-none truncate mt-0.5">
                            {isIOS ? 'Agrégala a tu pantalla de inicio' : 'Acceso directo más rápido y sin conexión'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={handleAction}
                        className="flex items-center gap-1.5 bg-white text-green-800 hover:bg-green-50 active:scale-95 text-xs font-black px-3 py-1.5 rounded-full shadow-md transition-all whitespace-nowrap"
                    >
                        {isIOS ? (
                            <>
                                <Share className="w-3.5 h-3.5 text-green-700" />
                                <span>Agregar App</span>
                            </>
                        ) : (
                            <>
                                <ArrowDownToLine className="w-3.5 h-3.5 text-green-700" />
                                <span>Instalar App</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleDismiss}
                        aria-label="Cerrar"
                        className="p-1 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Modal de instrucciones para iPhone / iPad (iOS) */}
            {showIOSModal && (
                <div
                    className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowIOSModal(false)}
                >
                    <div
                        className="bg-white rounded-3xl p-6 max-w-sm w-full text-gray-800 shadow-2xl border border-gray-100 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold">
                                    <Smartphone className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-extrabold text-gray-900 leading-tight">Instalar en tu iPhone / iPad</h3>
                                    <p className="text-[10px] text-gray-500">Sin descargar archivos externos</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowIOSModal(false)}
                                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="py-4 space-y-3.5 text-xs text-gray-700">
                            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-200/80">
                                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black shrink-0 text-xs">
                                    1
                                </div>
                                <div className="leading-snug">
                                    <p className="font-bold text-gray-900">Toca el botón Compartir</p>
                                    <p className="text-gray-500 mt-0.5 flex items-center gap-1">
                                        En la barra de Safari, busca el icono <Share className="w-3.5 h-3.5 text-blue-600 inline" />
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-200/80">
                                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black shrink-0 text-xs">
                                    2
                                </div>
                                <div className="leading-snug">
                                    <p className="font-bold text-gray-900">Agregar a Inicio</p>
                                    <p className="text-gray-500 mt-0.5 flex items-center gap-1">
                                        Desliza y presiona <PlusSquare className="w-3.5 h-3.5 text-emerald-600 inline" /> <strong>"Agregar a pantalla de inicio"</strong>.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-2xl border border-green-200/80 text-green-950">
                                <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] font-medium leading-relaxed">
                                    ¡Listo! La tienda se guardará como una App independiente en tu dispositivo con su propio icono y pantalla completa.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowIOSModal(false)}
                            className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-md transition-all"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
