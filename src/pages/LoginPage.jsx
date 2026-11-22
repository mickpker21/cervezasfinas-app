import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isOnline } from "@/lib/network";
import { Eye, EyeOff, Lock, Mail, ShoppingBag, Users, Sparkles, Briefcase, Video, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { kvStorage } from "@/services/kvStorage";
import { supabase } from "@/supabaseClient";
import { APP_CURRENT_VERSION } from "@/services/updateService";

// ── Login gallery images ──────────────────────────────────────────────────────
// IMPORTANTE: las imágenes permanecen en public/login/.
// Vite genera las URLs de los archivos encontrados en esa carpeta durante el build.
// Así no dependemos de nombres concretos: cualquier PNG/JPG/JPEG/WEBP/GIF/SVG
// que agregues a public/login/ podrá entrar automáticamente a la galería.
const LOGIN_IMAGE_FILES = import.meta.glob(
  "/public/login/*.{png,jpg,jpeg,webp,gif,svg,PNG,JPG,JPEG,WEBP,GIF,SVG}",
  {
    eager: true,
    query: "?url",
    import: "default",
  }
);

const getFileName = (path) => path.split("/").pop() || path;

const BRAND_NAMES_MAP = {
  "22": "Heineken Original",
  "24": "Bohemia Cristal",
  "62": "Tecate Original",
  "83": "Dos Equis Ultra",
  "99": "Sol Especial",
  "102": "Heineken 0.0",
  "144": "Bohemia Clásica",
  "cf lat 355": "Cervezas Finas Selección",
};

const getImageName = (path) => {
  const clean = getFileName(path)
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (BRAND_NAMES_MAP[clean]) {
    return BRAND_NAMES_MAP[clean];
  }
  return clean.toUpperCase();
};

const getImageColor = (name, index) => {
  const colors = [
    { color: "#00a550", glow: "rgba(0,165,80,0.6)" },
    { color: "#00ff88", glow: "rgba(0,255,136,0.5)" },
    { color: "#f5a623", glow: "rgba(245,166,35,0.55)" },
    { color: "#e53935", glow: "rgba(229,57,53,0.55)" },
    { color: "#3b82f6", glow: "rgba(59,130,246,0.55)" },
    { color: "#b8860b", glow: "rgba(184,134,11,0.6)" },
  ];

  const lower = name.toLowerCase();

  if (lower.includes("heineken")) {
    return { color: "#00ff88", glow: "rgba(0,255,136,0.65)" };
  }
  if (lower.includes("sol")) {
    return { color: "#f5a623", glow: "rgba(245,166,35,0.65)" };
  }
  if (lower.includes("tecate")) {
    return { color: "#e53935", glow: "rgba(229,57,53,0.65)" };
  }
  if (lower.includes("xx") || lower.includes("dos equis")) {
    return { color: "#d4af37", glow: "rgba(212,175,55,0.65)" };
  }
  if (lower.includes("bohemia")) {
    return { color: "#00e676", glow: "rgba(0,230,118,0.65)" };
  }

  return colors[index % colors.length];
};

const BRAND_SLIDES = Object.entries(LOGIN_IMAGE_FILES)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
  .map(([path, src], index) => {
    const name = getImageName(path);
    const { color, glow } = getImageColor(name, index);

    return {
      src,
      name,
      color,
      glow,
    };
  });

// ── Brand Gallery – 3D Stage Carousel (60 FPS Ultra-Fluid) ───────────────────
function BrandGallery() {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(0);
  const total = BRAND_SLIDES.length;

  // Auto-advance smoothly every 4.5s (pauses on hover)
  useEffect(() => {
    if (!total || isPaused) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % total);
    }, 4500);
    return () => clearInterval(timer);
  }, [total, isPaused]);

  if (!total) {
    return (
      <div className="relative w-full h-full min-h-[300px] rounded-[24px] overflow-hidden border border-white/10 bg-white/[0.02] flex items-center justify-center">
        <div className="text-center px-8">
          <div className="text-3xl mb-3">🍺</div>
          <p className="text-white font-bold">Galería de marcas</p>
          <p className="text-slate-500 text-xs mt-2">Agrega cualquier imagen en public/login/</p>
        </div>
      </div>
    );
  }

  const go = (dir) => {
    setCurrent((prev) => (prev + dir + total) % total);
  };

  const frontSlide = BRAND_SLIDES[current];
  const prevIdx = (current - 1 + total) % total;
  const nextIdx = (current + 1) % total;

  const items = [
    { slide: BRAND_SLIDES[prevIdx], pos: -1, idx: prevIdx },
    { slide: BRAND_SLIDES[nextIdx], pos: 1, idx: nextIdx },
    { slide: frontSlide, pos: 0, idx: current },
  ];

  return (
    <div
      className="relative w-full h-full min-h-[340px] flex flex-col select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        setIsPaused(true);
      }}
      onTouchEnd={(e) => {
        const diff = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(diff) > 40) {
          go(diff > 0 ? -1 : 1);
        }
        setIsPaused(false);
      }}
    >
      {/* Stage Container */}
      <div
        className="relative flex-1 min-h-0 rounded-[28px] overflow-hidden border border-white/10"
        style={{
          background: "linear-gradient(180deg, #030810 0%, #020509 70%, #010204 100%)",
          boxShadow: `0 0 60px ${frontSlide.color}22, inset 0 0 80px rgba(0,0,0,0.85)`,
          transition: "box-shadow 0.8s ease-out",
        }}
      >
        {/* Ambient Dynamic Spotlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 45%, ${frontSlide.color}28 0%, ${frontSlide.color}08 40%, transparent 72%)`,
            transition: "background 0.8s ease-out",
          }}
        />

        {/* Reflective Pedestal Floor */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[28%] pointer-events-none z-10"
          style={{
            background: "linear-gradient(to bottom, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.8) 40%, #010204 100%)",
            borderTop: `1px solid ${frontSlide.color}33`,
            transition: "border-color 0.8s ease",
          }}
        />

        {/* HUD Tech Corner Accents */}
        <div className="absolute top-3.5 left-3.5 w-6 h-6 border-t-2 border-l-2 border-[#00ff88]/40 rounded-tl-lg pointer-events-none z-30" />
        <div className="absolute top-3.5 right-3.5 w-6 h-6 border-t-2 border-r-2 border-[#00ff88]/40 rounded-tr-lg pointer-events-none z-30" />
        <div className="absolute bottom-3.5 left-3.5 w-6 h-6 border-b-2 border-l-2 border-[#00ff88]/40 rounded-bl-lg pointer-events-none z-30" />
        <div className="absolute bottom-3.5 right-3.5 w-6 h-6 border-b-2 border-r-2 border-[#00ff88]/40 rounded-br-lg pointer-events-none z-30" />

        {/* Top Badges */}
        <div className="absolute top-4 left-5 z-30 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="text-[10px] font-mono text-[#00ff88]/80 tracking-[0.25em] uppercase font-bold">
            Heineken México
          </span>
        </div>

        <div className="absolute top-4 right-5 z-30 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <span className="text-[10px] font-mono text-slate-400 font-semibold">
            {String(current + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
        </div>

        {/* 3D Bottle Stage */}
        <div className="absolute inset-0 flex items-center justify-center z-20 overflow-hidden pt-4 pb-14" style={{ perspective: "1000px" }}>
          {items.map(({ slide, pos, idx }) => {
            const isCenter = pos === 0;

            // Pre-computed GPU-friendly transform styles
            let transform = "translate3d(0, 0, 0) scale(1)";
            let opacity = 1;
            let zIndex = 30;
            let filter = `drop-shadow(0 0 28px ${slide.color}55) drop-shadow(0 15px 30px rgba(0,0,0,0.7))`;

            if (pos === -1) {
              transform = "translate3d(-170px, 12px, -90px) scale(0.72) rotateY(22deg)";
              opacity = 0.38;
              zIndex = 10;
              filter = "brightness(0.65) drop-shadow(0 10px 20px rgba(0,0,0,0.8))";
            } else if (pos === 1) {
              transform = "translate3d(170px, 12px, -90px) scale(0.72) rotateY(-22deg)";
              opacity = 0.38;
              zIndex = 10;
              filter = "brightness(0.65) drop-shadow(0 10px 20px rgba(0,0,0,0.8))";
            }

            return (
              <div
                key={slide.src + idx}
                onClick={() => !isCenter && go(pos)}
                className={`absolute flex flex-col items-center justify-center ${
                  !isCenter ? "cursor-pointer hover:opacity-70 transition-opacity" : ""
                }`}
                style={{
                  width: "160px",
                  height: "62%",
                  zIndex,
                  transform,
                  opacity,
                  transition: "transform 0.55s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease, filter 0.5s ease",
                  willChange: "transform, opacity",
                  transformStyle: "preserve-3d",
                }}
              >
                {/* Main Product Image */}
                <div className="relative w-full h-[80%] flex items-end justify-center">
                  <img
                    src={slide.src}
                    alt={slide.name}
                    className="max-h-full max-w-full object-contain pointer-events-none select-none"
                    style={{
                      filter,
                      transform: isCenter ? "translateZ(30px)" : "none",
                    }}
                    draggable={false}
                    loading="eager"
                  />
                </div>

                {/* Lightweight Subdued Reflection */}
                <div
                  className="w-full h-[20%] flex items-start justify-center overflow-hidden pointer-events-none"
                  style={{
                    opacity: isCenter ? 0.22 : 0.08,
                    maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 80%)",
                    WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 80%)",
                  }}
                >
                  <img
                    src={slide.src}
                    alt=""
                    className="max-h-full max-w-full object-contain select-none -scale-y-100"
                    draggable={false}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Central Brand Information Badge */}
        <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center justify-center z-30 pointer-events-none">
          <div
            className="px-5 py-1.5 rounded-full backdrop-blur-xl border text-[11px] font-black uppercase tracking-[0.25em] text-center shadow-2xl transition-all duration-500"
            style={{
              background: `linear-gradient(135deg, ${frontSlide.color}20 0%, rgba(10,15,25,0.7) 100%)`,
              borderColor: `${frontSlide.color}55`,
              color: frontSlide.color,
              boxShadow: `0 0 25px ${frontSlide.color}35`,
            }}
          >
            {frontSlide.name}
          </div>
        </div>

        {/* Bottom Pagination Dots */}
        <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5">
          {BRAND_SLIDES.map((item, i) => (
            <button
              key={item.name + i}
              type="button"
              aria-label={`Ver ${item.name}`}
              onClick={() => setCurrent(i)}
              className="transition-all duration-300 rounded-full cursor-pointer"
              style={{
                width: i === current ? 20 : 6,
                height: 5,
                background: i === current ? frontSlide.color : "rgba(255,255,255,0.2)",
                boxShadow: i === current ? `0 0 10px ${frontSlide.color}` : "none",
              }}
            />
          ))}
        </div>
      </div>

      {/* Floating Side Arrows */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-3 z-40 pointer-events-none">
        <button
          type="button"
          aria-label="Imagen anterior"
          onClick={() => go(-1)}
          className="pointer-events-auto w-10 h-10 rounded-full bg-black/60 border border-white/15 backdrop-blur-xl flex items-center justify-center text-[#00ff88] hover:text-white hover:bg-[#00cc4a]/20 hover:border-[#00ff88]/40 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black/50"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          aria-label="Imagen siguiente"
          onClick={() => go(1)}
          className="pointer-events-auto w-10 h-10 rounded-full bg-black/60 border border-white/15 backdrop-blur-xl flex items-center justify-center text-[#00ff88] hover:text-white hover:bg-[#00cc4a]/20 hover:border-[#00ff88]/40 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black/50"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ── Main LoginPage ───────────────────────────────────────────────────────────
export default function LoginPage() {
  const { signIn, session, loading, resetPassword, verifyOtpRecovery } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // State for Selection Mode vs Login Mode
  const [showLogin, setShowLogin] = useState(Capacitor.isNativePlatform());

  const navigate = useNavigate();

  // Redirigir si ya hay una sesión activa
  useEffect(() => {
    if (!loading && session) {
      if (session?.user?.user_metadata?.must_change_password) {
        navigate("/force-password-change", { replace: true });
        return;
      }
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        isOnline().then(online => {
          navigate(online ? "/sync-initial" : "/", { replace: true });
        }).catch(() => {
          navigate("/", { replace: true });
        });
      } else {
        navigate("/", { replace: true });
      }
    }
  }, [session, loading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSubmitting(true);
    try {
      const { data, error } = await signIn({ email, password });
      if (error) {
        setErrorMsg(error.message || "No se pudo iniciar sesión.");
      } else {
        const online = await isOnline().catch(() => false);
        if (online && data?.user?.id) {
          try {
            const { data: profile } = await supabase.from('profiles').select('route, ruta').eq('id', data.user.id).single();
            const route = profile?.route || profile?.ruta || data.user.user_metadata?.route || "";
            if (route) {
              await kvStorage.setItem(`advisor_user_route_${data.user.id}`, String(route));
            }
            if (Capacitor.isNativePlatform()) {
              const { NotificationService } = await import("@/services/NotificationService");
              await NotificationService.init(data.user.id);
            }
          } catch (e) { console.warn('[Login] Failed to cache route or init push', e); }
        }
        if (data?.user?.user_metadata?.must_change_password) {
          navigate("/force-password-change", { replace: true });
          return;
        }
        const isNative = Capacitor.isNativePlatform();
        navigate(isNative && online ? "/sync-initial" : "/", { replace: true });
      }
    } catch (err) {
      setErrorMsg("Error inesperado al iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setErrorMsg("Ingresa tu correo en el campo de arriba para enviarte el código.");
      return;
    }
    setResetSent(false);
    setResetLoading(true);
    setErrorMsg("");
    try {
      const { error } = await resetPassword(email);
      if (error) {
        setErrorMsg(error.message);
      } else {
        setResetSent(true);
        setErrorMsg("");
      }
    } catch (err) {
      setErrorMsg("Error al enviar el código de recuperación.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpToken || otpToken.length < 6) {
      setErrorMsg("Ingresa el código de 6 dígitos que recibiste.");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setErrorMsg("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setVerifyingOtp(true);
    setErrorMsg("");
    try {
      const { data, error: otpError } = await verifyOtpRecovery(email, otpToken);
      if (otpError) {
        setErrorMsg("Código inválido o expirado. Intenta de nuevo.");
        setVerifyingOtp(false);
        return;
      }
      const { error: updError } = await supabase.auth.updateUser({ password: newPassword });
      if (updError) {
        setErrorMsg(updError.message);
      } else {
        setResetSent(false);
        setOtpToken("");
        setNewPassword("");
        setErrorMsg("¡Contraseña actualizada! Ahora puedes iniciar sesión.");
      }
    } catch (err) {
      setErrorMsg("Error al procesar la recuperación.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  if (loading || session) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#050B14]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-[#00cc4a] text-lg flex items-center gap-2 font-semibold"
        >
          <Sparkles className="w-5 h-5 animate-pulse" />
          Cargando...
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Acceso - Cervezas Finas</title>
        <meta name="description" content="Página de acceso para Cervezas Finas." />
      </Helmet>

      <div className="h-screen w-full flex bg-[#03060C] text-slate-100 overflow-hidden font-sans">

        {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
        <div className="hidden lg:flex lg:w-[60%] xl:w-[62%] relative flex-col p-6 lg:p-7 xl:p-8 overflow-hidden bg-gradient-to-br from-[#060f1a] to-[#010407]">

          {/* Futuristic Grid & Ambient Glows */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
            <div
              className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full pointer-events-none opacity-40"
              style={{ background: "radial-gradient(circle, rgba(0,204,74,0.15) 0%, transparent 70%)" }}
            />
            <div
              className="absolute bottom-0 right-0 w-[450px] h-[450px] rounded-full pointer-events-none opacity-30"
              style={{ background: "radial-gradient(circle, rgba(0,100,255,0.12) 0%, transparent 70%)" }}
            />
          </div>


          {/* Top nav buttons */}
          <div className="relative z-50 shrink-0 mb-4 flex flex-wrap gap-2.5">
            <NavButton icon={<Briefcase className="w-4 h-4" />} label="Únete a" title="Bolsa de Trabajo" color="emerald" onClick={() => navigate('/careers')} />
            <NavButton icon={<Video className="w-4 h-4" />} label="Nuestras Marcas" title="Portafolio" color="blue" onClick={() => navigate('/portafolio')} />
            <NavButton icon={<Info className="w-4 h-4" />} label="Conócenos" title="Nosotros" color="purple" onClick={() => navigate('/nosotros')} />
          </div>

          {/* Title + Gallery */}
          <div className="relative z-10 flex-1 flex flex-col min-h-0 gap-4">
            {/* Headline */}
            <div className="shrink-0">
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-[10px] font-black uppercase tracking-[0.4em] text-[#00cc4a]/60 mb-1"
              >
                Distribuidor Autorizado
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-2xl xl:text-3xl font-extrabold text-white leading-tight uppercase"
              >
                Cervezas Finas{" "}
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#00ff88] to-[#00cc4a] text-lg xl:text-xl mt-0.5">
                  de Ciudad Serdán · Heineken México
                </span>
              </motion.h1>
            </div>

            {/* ── BRAND GALLERY ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="flex-1 min-h-0"
            >
              <BrandGallery />
            </motion.div>
          </div>
        </div>

        {/* ── RIGHT PANEL (Form) ───────────────────────────────────────────── */}
        <div className="w-full lg:w-[40%] xl:w-[38%] flex items-center justify-center px-5 py-5 sm:px-6 relative z-20 overflow-y-auto"
          style={{ background: "linear-gradient(135deg, #02050A 0%, #040C14 100%)", boxShadow: "-20px 0 60px rgba(0,0,0,0.6)" }}
        >
          {/* Mobile glow blobs */}
          <div className="absolute inset-0 lg:hidden pointer-events-none">
            <div className="absolute -top-32 -left-32 w-64 h-64 rounded-full bg-[#00cc4a]/15 blur-3xl" />
            <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full bg-[#00cc4a]/10 blur-3xl" />
          </div>


          <div className="w-full max-w-[390px] relative z-10 py-1">

            {/* Mobile Header con Logo */}
            <div className="lg:hidden flex flex-col items-center gap-3 mb-5 sm:mb-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex justify-center"
              >
                <img src="/logo.png" alt="Cervezas Finas Logo" className="h-14 sm:h-16 drop-shadow-[0_0_15px_rgba(0,180,60,0.4)]" />
              </motion.div>
              <button
                onClick={() => navigate('/careers')}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/15 border border-emerald-500/40 rounded-full text-xs font-black uppercase tracking-[0.2em] text-emerald-400 shadow-[0_0_15px_rgba(0,204,74,0.2)] active:scale-95 transition-all"
              >
                <Briefcase className="w-3.5 h-3.5" />
                Bolsa de Trabajo
              </button>
            </div>

            <AnimatePresence mode="wait">
              {!showLogin && !Capacitor.isNativePlatform() ? (

                /* ── MODULE SELECTION ── */
                <motion.div
                  key="selection"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 text-center"
                >
                  <div>
                    <img src="/logo.png" alt="Cervezas Finas Logo" className="h-12 mx-auto drop-shadow-[0_0_15px_rgba(0,180,60,0.35)] mb-3 object-contain" />
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#00cc4a]/60 mb-1">Sistema Interno</p>
                    <h2 className="text-3xl font-extrabold text-white uppercase leading-tight">Bienvenido</h2>
                    <p className="text-slate-400 text-sm font-medium mt-1">Selecciona tu perfil de acceso</p>
                  </div>

                  {/* Divider line */}
                  <div className="h-px bg-gradient-to-r from-transparent via-[#00cc4a]/30 to-transparent" />

                  <div className="space-y-4">
                    <SelectionCard
                      icon={<ShoppingBag className="w-6 h-6 text-slate-300" />}
                      title="Soy Cliente"
                      subtitle="Ir a la tienda en línea"
                      bgColor="#0D1624"
                      hoverColor="#131F33"
                      iconBg="#1A263B"
                      onClick={() => window.location.href = 'https://cervezasfinas.com.mx'}
                    />
                    <SelectionCard
                      icon={<Users className="w-6 h-6 text-white" />}
                      title="Soy Colaborador"
                      subtitle="Acceso al sistema interno"
                      gradient="from-[#00cc4a] to-[#009938]"
                      hoverGradient="from-[#00e653] to-[#00b34d]"
                      glowColor="rgba(0,204,74,0.3)"
                      iconBg="rgba(255,255,255,0.2)"
                      onClick={() => setShowLogin(true)}
                    />
                  </div>
                </motion.div>

              ) : (

                /* ── LOGIN FORM ── */
                <motion.div
                  key="login"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Desktop header above form */}
                  <div className="hidden lg:flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00cc4a] shadow-[0_0_8px_#00cc4a]" />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#00cc4a]/70">Sistema</p>
                        <p className="text-xs font-bold text-white/90">Cervezas Finas</p>
                      </div>
                    </div>
                    <img src="/logo.png" alt="Cervezas Finas Logo" className="h-9 drop-shadow-[0_0_12px_rgba(0,180,60,0.35)] object-contain" />
                  </div>
                   {/* Encabezado grande eliminado para aprovechar mejor el espacio vertical. */}

{/* Glassmorphism form card */}
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 backdrop-blur-xl shadow-2xl">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <AnimatePresence>
                        {errorMsg && (
                          <motion.div
                            initial={{ opacity: 0, y: -8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -8, height: 0 }}
                            className="bg-red-500/10 border border-red-500/40 text-red-400 px-4 py-3 rounded-2xl text-sm font-medium"
                          >
                            {errorMsg}
                          </motion.div>
                        )}
                        {resetSent && (
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-green-500/10 border border-green-500/40 text-green-400 px-4 py-3 rounded-2xl text-sm font-medium"
                          >
                            ¡Enviado! Revisa tu correo (incluyendo spam) para el enlace de recuperación.
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {resetSent ? (
                        /* ── OTP SECTION ── */
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="space-y-5"
                        >
                          <div className="flex flex-col items-center text-center space-y-3 pb-2">
                            <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20">
                              <Sparkles className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                              <h3 className="text-xl font-black text-white uppercase tracking-tight">Verificación</h3>
                              <p className="text-slate-400 text-xs mt-1 px-2 leading-relaxed">
                                Hemos enviado un código de seguridad a tu correo institucional.
                              </p>
                            </div>
                          </div>

                          <ModernLabel>Código OTP</ModernLabel>
                          <Input
                            type="text"
                            placeholder="0 0 0 0 0 0"
                            maxLength={6}
                            value={otpToken}
                            onChange={(e) => setOtpToken(e.target.value)}
                            className="w-full bg-[#050B14] border-slate-800 text-[#00ff88] text-center tracking-[0.8em] h-16 rounded-2xl focus:border-[#00cc4a]/50 focus:ring-1 focus:ring-[#00cc4a]/20 transition-all text-2xl font-black shadow-inner"
                          />

                          <ModernLabel>Nueva Contraseña</ModernLabel>
                          <div className="relative flex items-center">
                            <Lock className="absolute left-4 w-5 h-5 text-slate-500" />
                            <Input
                              type={showPwd ? "text" : "password"}
                              placeholder="Min. 8 caracteres"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full bg-[#050B14] border-slate-800 text-white h-14 pl-12 pr-12 rounded-2xl focus:border-[#00cc4a]/50 focus:ring-1 focus:ring-[#00cc4a]/20 transition-all"
                            />
                            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-4 text-slate-500 hover:text-white transition-colors">
                              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>

                          <GreenButton onClick={handleVerifyOtp} loading={verifyingOtp} label="Restablecer Acceso" />
                          <button type="button" onClick={() => setResetSent(false)} className="w-full text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-colors py-2">
                            Volver al inicio
                          </button>
                        </motion.div>
                      ) : (
                        /* ── NORMAL LOGIN ── */
                        <div className="space-y-4">
                          {/* Email */}
                          <div className="space-y-2">
                            <ModernLabel>Correo Electrónico</ModernLabel>
                            <div className="relative flex items-center group">
                              <Mail className="absolute left-4 w-5 h-5 text-slate-500 group-focus-within:text-[#00cc4a] transition-colors" />
                              <Input
                                id="email" type="email" placeholder="tu@correo.com"
                                value={email} onChange={(e) => setEmail(e.target.value)} required
                                className="w-full bg-[#0B1422] border-transparent text-white placeholder:text-slate-600 h-12 pl-12 pr-4 rounded-xl focus:bg-[#101c30] focus:border-[#00cc4a]/40 focus-visible:ring-1 focus-visible:ring-[#00cc4a]/30 transition-all text-[15px] font-medium"
                              />
                            </div>
                          </div>

                          {/* Password */}
                          <div className="space-y-2">
                            <ModernLabel>Contraseña</ModernLabel>
                            <div className="relative flex items-center group">
                              <Lock className="absolute left-4 w-5 h-5 text-slate-500 group-focus-within:text-[#00cc4a] transition-colors" />
                              <Input
                                id="password" type={showPwd ? "text" : "password"} placeholder="••••••••"
                                value={password} onChange={(e) => setPassword(e.target.value)} required
                                className="w-full bg-[#0B1422] border-transparent text-white placeholder:text-slate-600 h-12 pl-12 pr-12 rounded-xl focus:bg-[#101c30] focus:border-[#00cc4a]/40 focus-visible:ring-1 focus-visible:ring-[#00cc4a]/30 transition-all text-[15px] font-medium"
                              />
                              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-4 text-slate-500 hover:text-white transition-colors p-1">
                                {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                              </button>
                            </div>
                            <div className="flex justify-end">
                              <button type="button" onClick={handleResetPassword} disabled={resetLoading}
                                className="text-xs text-[#00cc4a]/70 hover:text-[#00ff88] transition-colors font-semibold mt-1"
                              >
                                {resetLoading ? "Enviando código..." : "¿Olvidaste tu contraseña?"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!resetSent && (
                        <div className="pt-1">
                          <Button
                            type="submit"
                            className="w-full h-12 bg-gradient-to-r from-[#00cc4a] to-[#009938] hover:from-[#00e653] hover:to-[#00b34d] text-white text-[15px] font-bold rounded-2xl shadow-[0_8px_30px_rgba(0,204,74,0.25)] hover:shadow-[0_8px_40px_rgba(0,204,74,0.4)] transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                            disabled={submitting}
                          >
                            {submitting ? (
                              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
                            ) : "Ingresar →"}
                          </Button>
                        </div>
                      )}
                    </form>
                  </div>

                  {/* Back & Legal */}
                  <div className="flex flex-col items-center gap-2.5 mt-4">
                    {!Capacitor.isNativePlatform() && (
                      <button
                        type="button"
                        onClick={() => setShowLogin(false)}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs font-semibold transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Regresar al inicio
                      </button>
                    )}
                    <p className="text-[11px] text-slate-600 text-center">
                      Al ingresar aceptas nuestros{" "}
                      <button
                        type="button"
                        onClick={() => navigate('/terminos')}
                        className="text-[#00cc4a]/70 cursor-pointer hover:text-[#00cc4a] transition-colors hover:underline"
                      >
                        Términos y Condiciones
                      </button>
                      {" "}y el{" "}
                      <button
                        type="button"
                        onClick={() => navigate('/aviso-privacidad')}
                        className="text-[#00cc4a]/70 cursor-pointer hover:text-[#00cc4a] transition-colors hover:underline"
                      >
                        Aviso de Privacidad
                      </button>
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Version badge */}
            <div className="flex justify-center mt-3">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1624]/90 border border-[#00cc4a]/20 text-[11px] font-semibold text-slate-400 shadow-lg backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00cc4a] animate-pulse" />
                <span className="font-mono text-[#00cc4a] font-bold">v{APP_CURRENT_VERSION}</span>
                <span className="text-slate-600">•</span>
                <span>Enterprise Release</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Small helper components ─────────────────────────────────────────────────

function ModernLabel({ children }) {
  return (
    <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 block ml-0.5">
      {children}
    </label>
  );
}

function GreenButton({ onClick, loading, label, type = "button" }) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={loading}
      className="w-full h-12 bg-gradient-to-r from-[#00cc4a] to-[#009938] hover:from-[#00ff88] hover:to-[#00cc4a] text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-[0_10px_30px_rgba(0,204,74,0.2)] transition-all hover:scale-[1.01] active:scale-[0.98]"
    >
      {loading ? (
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
      ) : label}
    </Button>
  );
}

function NavButton({ icon, label, title, color, onClick }) {
  const colors = {
    emerald: { bg: "bg-emerald-500/10 hover:bg-emerald-500/20", border: "border-emerald-500/30 hover:border-emerald-500/60", text: "text-emerald-400", glow: "rgba(0,204,74,0.1)" },
    blue:    { bg: "bg-blue-500/10 hover:bg-blue-500/20",       border: "border-blue-500/30 hover:border-blue-500/60",       text: "text-blue-400",    glow: "rgba(0,100,255,0.1)" },
    purple:  { bg: "bg-purple-500/10 hover:bg-purple-500/20",   border: "border-purple-500/30 hover:border-purple-500/60",   text: "text-purple-400",  glow: "rgba(150,0,255,0.1)" },
  }[color];

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 ${colors.bg} border ${colors.border} rounded-2xl transition-all group backdrop-blur-xl`}
      style={{ boxShadow: `0 0 20px ${colors.glow}` }}
    >
      <span className={`${colors.text} group-hover:scale-110 transition-transform`}>{icon}</span>
      <div className="flex flex-col items-start leading-none">
        <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${colors.text}/70 mb-0.5`}>{label}</span>
        <span className="text-xs font-black uppercase tracking-widest text-white transition-colors">{title}</span>
      </div>
    </button>
  );
}

function SelectionCard({ icon, title, subtitle, bgColor, hoverColor, gradient, hoverGradient, glowColor, iconBg, onClick }) {
  const isGradient = !!gradient;
  return (
    <button
      onClick={onClick}
      className={`w-full text-white py-5 px-6 rounded-[20px] flex items-center gap-4 transition-all duration-300 group ${
        isGradient
          ? `bg-gradient-to-r ${gradient} hover:${hoverGradient} shadow-[0_4px_25px_${glowColor}]`
          : "ring-1 ring-white/5 shadow-lg"
      }`}
      style={isGradient ? {} : { background: bgColor }}
      onMouseEnter={!isGradient ? (e) => { e.currentTarget.style.background = hoverColor; } : undefined}
      onMouseLeave={!isGradient ? (e) => { e.currentTarget.style.background = bgColor; } : undefined}
    >
      <div
        className="p-3 rounded-xl group-hover:scale-110 transition-transform"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="flex flex-col items-start">
        <span className="text-lg font-bold">{title}</span>
        <span className={`text-sm ${isGradient ? "text-white/80" : "text-slate-400"}`}>{subtitle}</span>
      </div>
    </button>
  );
}
