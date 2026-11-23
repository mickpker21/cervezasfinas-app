import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { Helmet } from "react-helmet-async";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isOnline } from "@/lib/network";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  Users,
  ShoppingBag,
  Sparkles,
  Briefcase,
  Video,
  Info,
  ArrowRight,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { kvStorage } from "@/services/kvStorage";
import { supabase } from "@/supabaseClient";
import { APP_CURRENT_VERSION } from "@/services/updateService";
import loginAvatar from "@/assets/login-avatar.jpg";

export default function LoginPage() {
  const { signIn, session, loading, resetPassword, verifyOtpRecovery } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [otpToken, setOtpToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Ask whether user is Client or Staff before showing the login form (on web)
  const [showLogin, setShowLogin] = useState(Capacitor.isNativePlatform());

  const navigate = useNavigate();

  // Load remembered email if saved
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem("cf_remembered_email");
      if (savedEmail) setEmail(savedEmail);
    } catch (e) {}
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && session) {
      if (session?.user?.user_metadata?.must_change_password) {
        navigate("/force-password-change", { replace: true });
        return;
      }
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        isOnline()
          .then((online) => {
            navigate(online ? "/sync-initial" : "/", { replace: true });
          })
          .catch(() => {
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
      try {
        if (rememberMe && email) {
          localStorage.setItem("cf_remembered_email", email);
        } else {
          localStorage.removeItem("cf_remembered_email");
        }
      } catch (e) {}

      const { data, error } = await signIn({ email, password });
      if (error) {
        setErrorMsg(error.message || "No se pudo iniciar sesión.");
      } else {
        const online = await isOnline().catch(() => false);
        if (online && data?.user?.id) {
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("route, ruta")
              .eq("id", data.user.id)
              .single();
            const route = profile?.route || profile?.ruta || data.user.user_metadata?.route || "";
            if (route) {
              await kvStorage.setItem(`advisor_user_route_${data.user.id}`, String(route));
            }
            if (Capacitor.isNativePlatform()) {
              const { NotificationService } = await import("@/services/NotificationService");
              await NotificationService.init(data.user.id);
            }
          } catch (e) {
            console.warn("[Login] Failed to cache route or init push", e);
          }
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
      setErrorMsg("Ingresa tu correo en el campo de usuario para enviarte el código.");
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
      const { error: otpError } = await verifyOtpRecovery(email, otpToken);
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
      <div className="flex justify-center items-center h-screen bg-[#04101c]">
        <div className="text-[#00e676] text-lg flex items-center gap-2 font-semibold">
          <Sparkles className="w-5 h-5 animate-spin" />
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Acceso - Cervezas Finas</title>
        <meta name="description" content="Página de acceso para Cervezas Finas." />
      </Helmet>

      {/* Lightweight GPU-only keyframe styles for 60 FPS smoothness */}
      <style>{`
        @keyframes cfWaveFloat {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -10px, 0) scale(1.02); }
        }
        @keyframes cfPulseSlow {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.9; }
        }
        .cf-wave-float {
          animation: cfWaveFloat 7s ease-in-out infinite;
          will-change: transform;
        }
        .cf-pulse-slow {
          animation: cfPulseSlow 5s ease-in-out infinite;
          will-change: opacity;
        }
      `}</style>

      {/* OUTER GRADIENT BACKDROP (Heineken Emerald + Deep Teal + Midnight Navy) */}
      <div
        className="min-h-screen w-full flex items-center justify-center p-3 sm:p-6 md:p-10 font-sans select-none overflow-y-auto"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, #00b85c 0%, transparent 45%), radial-gradient(circle at 85% 80%, #007a3d 0%, transparent 50%), linear-gradient(135deg, #032215 0%, #053822 45%, #031926 100%)",
        }}
      >
        {/* MAIN FLOATING LOGIN CARD */}
        <div
          className="relative w-full max-w-[1080px] min-h-[580px] rounded-[28px] overflow-hidden flex flex-col justify-between border border-emerald-400/20"
          style={{
            background: "linear-gradient(145deg, #071324 0%, #050d1a 55%, #040914 100%)",
            boxShadow: "0 30px 80px -15px rgba(0, 0, 0, 0.75), 0 0 50px rgba(0, 204, 74, 0.14)",
          }}
        >
          {/* ── TOP NAVIGATION BAR INSIDE CARD ── */}
          <header className="relative z-30 flex items-center justify-between px-6 sm:px-10 pt-6 pb-2">
            {/* Brand Logo */}
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Cervezas Finas"
                className="h-9 sm:h-10 w-auto object-contain"
              />
              <div className="leading-tight">
                <span className="block text-xs sm:text-sm font-black tracking-[0.18em] text-white uppercase">
                  Cervezas Finas
                </span>
                <span className="block text-[9px] font-bold tracking-[0.25em] text-[#00e676] uppercase">
                  Heineken México
                </span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-7 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
              <button
                type="button"
                onClick={() => navigate("/nosotros")}
                className="hover:text-[#00ff88] transition-colors"
              >
                Nosotros
              </button>
              <button
                type="button"
                onClick={() => navigate("/portafolio")}
                className="hover:text-[#00ff88] transition-colors"
              >
                Portafolio
              </button>
              <button
                type="button"
                onClick={() => navigate("/careers")}
                className="hover:text-[#00ff88] transition-colors"
              >
                Vacantes
              </button>
              <a
                href="https://cervezasfinas.com.mx"
                className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#00e676] to-[#00b85c] text-[#04120b] font-black tracking-[0.15em] text-[10px] shadow-[0_0_20px_rgba(0,230,118,0.35)] hover:brightness-110 transition-all"
              >
                Tienda en Línea
              </a>
            </nav>

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white"
              aria-label="Menú"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </header>

          {/* Mobile Dropdown Nav */}
          {mobileMenuOpen && (
            <div className="md:hidden relative z-30 mx-6 mt-2 p-4 rounded-2xl bg-[#09182c] border border-emerald-500/20 flex flex-wrap items-center justify-center gap-3 text-xs font-bold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => navigate("/nosotros")}
                className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-200 flex items-center gap-1.5"
              >
                <Info className="w-3.5 h-3.5 text-emerald-400" /> Nosotros
              </button>
              <button
                type="button"
                onClick={() => navigate("/portafolio")}
                className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-200 flex items-center gap-1.5"
              >
                <Video className="w-3.5 h-3.5 text-emerald-400" /> Portafolio
              </button>
              <button
                type="button"
                onClick={() => navigate("/careers")}
                className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-200 flex items-center gap-1.5"
              >
                <Briefcase className="w-3.5 h-3.5 text-emerald-400" /> Vacantes
              </button>
              <a
                href="https://cervezasfinas.com.mx"
                className="px-3.5 py-1.5 rounded-lg bg-[#00cc4a] text-slate-950 font-black flex items-center gap-1.5"
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Tienda Clientes
              </a>
            </div>
          )}

          {/* ── MAIN BODY: LEFT FORM/SELECTOR + RIGHT FLUID WAVE HERO ── */}
          <div className="relative z-20 flex-1 grid grid-cols-1 lg:grid-cols-12 items-center px-6 sm:px-10 py-6 gap-8">
            {/* LEFT COLUMN: PROFILE SELECTOR OR (AVATAR + LOGIN FORM) (5 cols on lg) */}
            <div className="lg:col-span-5 flex flex-col items-center w-full max-w-[350px] mx-auto">
              {!showLogin && !Capacitor.isNativePlatform() ? (
                /* ── STEP 1: CLIENT vs STAFF PROFILE SELECTION (Without Collaborator Avatar) ── */
                <div className="w-full space-y-4 text-center py-4">
                  <div className="mb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00e676] mb-1">
                      Portal de Acceso
                    </p>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                      Selecciona tu perfil
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      ¿Eres cliente o personal de Cervezas Finas?
                    </p>
                  </div>

                  {/* Option 1: Soy Cliente -> Shop */}
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "https://cervezasfinas.com.mx";
                    }}
                    className="w-full py-4 px-5 rounded-full bg-[#09192e] hover:bg-[#0d223d] border border-emerald-500/35 hover:border-[#00ff88] text-white flex items-center justify-between transition-all group shadow-lg"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#00ff88] group-hover:scale-105 transition-transform">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <span className="block text-sm font-black tracking-wide text-white">
                          SOY CLIENTE
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          Ir a la Tienda en Línea
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#00ff88] group-hover:translate-x-0.5 transition-all" />
                  </button>

                  {/* Option 2: Soy Personal / Colaborador -> Internal Login */}
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg("");
                      setShowLogin(true);
                    }}
                    className="w-full py-4 px-5 rounded-full bg-gradient-to-r from-[#00ff88] via-[#00cc4a] to-[#009938] text-[#03140a] flex items-center justify-between transition-all group shadow-[0_8px_25px_rgba(0,204,74,0.35)] hover:brightness-110 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-[#03140a]/15 flex items-center justify-center text-[#03140a] group-hover:scale-105 transition-transform">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <span className="block text-sm font-black tracking-wide text-[#03140a]">
                          SOY PERSONAL / COLABORADOR
                        </span>
                        <span className="block text-[11px] font-semibold text-[#03140a]/80">
                          Acceso al Sistema Interno CRM
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#03140a] group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              ) : (
                /* ── STEP 2: STAFF LOGIN / OTP FORM (With Collaborator Avatar) ── */
                <div className="w-full flex flex-col items-center">
                  {/* Glowing Double-Ring Heineken Collaborator Avatar */}
                  <div className="relative mb-6 flex items-center justify-center">
                    <div
                      className="w-28 h-28 rounded-full p-1.5 flex items-center justify-center border-2 border-[#00e676]/85 bg-[#061526]"
                      style={{
                        boxShadow:
                          "0 0 28px rgba(0, 230, 118, 0.35), inset 0 0 18px rgba(0, 230, 118, 0.2)",
                      }}
                    >
                      <img
                        src={loginAvatar}
                        alt="Colaborador Cervezas Finas"
                        className="w-full h-full rounded-full object-cover border border-[#00e676]/40"
                        draggable={false}
                      />
                    </div>
                  </div>
                  {errorMsg && (
                    <div className="w-full mb-4 bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-2.5 rounded-2xl text-xs font-semibold text-center">
                      {errorMsg}
                    </div>
                  )}

                  {resetSent && (
                    <div className="w-full mb-4 bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-2xl text-xs font-semibold text-center">
                      ¡Código enviado! Revisa tu correo (incluyendo spam).
                    </div>
                  )}

                  {resetSent ? (
                    /* ── OTP RECOVERY FORM ── */
                    <form onSubmit={handleVerifyOtp} className="w-full space-y-4">
                      <div className="text-center space-y-1">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">
                          Verificar Código OTP
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Ingresa los 6 dígitos enviados a tu correo
                        </p>
                      </div>

                      <Input
                        type="text"
                        placeholder="0 0 0 0 0 0"
                        maxLength={6}
                        value={otpToken}
                        onChange={(e) => setOtpToken(e.target.value)}
                        className="w-full bg-[#09182c] border-[#00e676]/40 text-[#00ff88] text-center tracking-[0.6em] h-12 rounded-full focus:border-[#00ff88] text-lg font-black"
                      />

                      <div className="relative flex items-center">
                        <Lock className="absolute left-4 w-4 h-4 text-[#00e676]/70" />
                        <Input
                          type={showPwd ? "text" : "password"}
                          placeholder="Nueva contraseña (mín. 8)"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full bg-[#09182c]/90 border-[#00e676]/35 text-white h-11 pl-11 pr-10 rounded-full text-xs focus:border-[#00ff88]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(!showPwd)}
                          className="absolute right-4 text-slate-400 hover:text-white"
                        >
                          {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      <Button
                        type="submit"
                        disabled={verifyingOtp}
                        className="w-full h-11 rounded-full bg-gradient-to-r from-[#00ff88] via-[#00cc4a] to-[#009938] text-[#03140a] font-black text-xs uppercase tracking-[0.2em] shadow-[0_6px_25px_rgba(0,204,74,0.35)] hover:brightness-110 transition-all"
                      >
                        {verifyingOtp ? "Verificando..." : "Actualizar Contraseña"}
                      </Button>

                      <button
                        type="button"
                        onClick={() => setResetSent(false)}
                        className="w-full text-slate-400 hover:text-white text-[11px] font-bold uppercase tracking-widest py-1"
                      >
                        Volver al Login
                      </button>
                    </form>
                  ) : (
                    /* ── PILL-SHAPED LOGIN FORM ── */
                    <form onSubmit={handleLogin} className="w-full space-y-3.5">
                      {/* Username / Email Pill */}
                      <div className="relative flex items-center">
                        <User className="absolute left-4 w-4 h-4 text-[#00e676]/80 pointer-events-none" />
                        <input
                          id="email"
                          type="email"
                          placeholder="CORREO ELECTRÓNICO"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="w-full h-11 pl-11 pr-4 rounded-full bg-[#08172a]/90 border border-[#00e676]/40 text-white placeholder:text-slate-400/70 placeholder:text-[10px] placeholder:tracking-[0.2em] placeholder:font-bold text-xs font-medium focus:outline-none focus:border-[#00ff88] focus:shadow-[0_0_15px_rgba(0,230,118,0.2)] transition-colors"
                        />
                      </div>

                      {/* Password Pill */}
                      <div className="relative flex items-center">
                        <Lock className="absolute left-4 w-4 h-4 text-[#00e676]/80 pointer-events-none" />
                        <input
                          id="password"
                          type={showPwd ? "text" : "password"}
                          placeholder="CONTRASEÑA"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="w-full h-11 pl-11 pr-11 rounded-full bg-[#08172a]/90 border border-[#00e676]/40 text-white placeholder:text-slate-400/70 placeholder:text-[10px] placeholder:tracking-[0.2em] placeholder:font-bold text-xs font-medium focus:outline-none focus:border-[#00ff88] focus:shadow-[0_0_15px_rgba(0,230,118,0.2)] transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(!showPwd)}
                          className="absolute right-4 text-slate-400 hover:text-white transition-colors"
                          tabIndex={-1}
                        >
                          {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Submit Pill Button */}
                      <div className="pt-1">
                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full h-11 rounded-full bg-gradient-to-r from-[#00ff88] via-[#00cc4a] to-[#009938] text-[#03140a] font-black text-xs uppercase tracking-[0.25em] shadow-[0_8px_25px_rgba(0,204,74,0.35)] hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center"
                        >
                          {submitting ? (
                            <div className="w-5 h-5 border-2 border-[#03140a]/30 border-t-[#03140a] rounded-full animate-spin" />
                          ) : (
                            "INGRESAR"
                          )}
                        </button>
                      </div>

                      {/* Remember Me & Forgot Password Row */}
                      <div className="flex items-center justify-between pt-1.5 px-1 text-[11px]">
                        <label className="flex items-center gap-2 text-slate-400 hover:text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="rounded border-emerald-500/40 bg-[#08172a] text-[#00cc4a] focus:ring-0 w-3.5 h-3.5 accent-[#00cc4a]"
                          />
                          <span>Recordarme</span>
                        </label>

                        <button
                          type="button"
                          onClick={handleResetPassword}
                          disabled={resetLoading}
                          className="text-slate-400 hover:text-[#00ff88] transition-colors italic"
                        >
                          {resetLoading ? "Enviando..." : "¿Olvidaste tu contraseña?"}
                        </button>
                      </div>

                      {!Capacitor.isNativePlatform() && (
                        <div className="pt-2 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setErrorMsg("");
                              setShowLogin(false);
                            }}
                            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-[#00ff88] text-xs font-bold transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Cambiar perfil (Cliente / Personal)
                          </button>
                        </div>
                      )}
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: ULTRA-FLUID 3D VECTOR WAVE & "Bienvenido." HERO (7 cols on lg) */}
            <div className="lg:col-span-7 relative flex flex-col justify-center items-center lg:items-end text-center lg:text-right min-h-[260px] sm:min-h-[360px] px-2 sm:px-6">
              {/* Vertical Divider on Desktop */}
              <div className="hidden lg:block absolute left-0 top-6 bottom-6 w-px bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent" />

              {/* GPU-Accelerated Fluid 3D Ribbon Wave SVG */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                <svg
                  viewBox="0 0 700 500"
                  className="w-full h-full max-w-[650px] cf-wave-float opacity-95"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="cfRibbonMain" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#004d26" stopOpacity="0.15" />
                      <stop offset="35%" stopColor="#00a550" stopOpacity="0.75" />
                      <stop offset="70%" stopColor="#00e676" stopOpacity="0.95" />
                      <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.8" />
                    </linearGradient>
                    <linearGradient id="cfRibbonSecondary" x1="10%" y1="90%" x2="90%" y2="10%">
                      <stop offset="0%" stopColor="#002b18" stopOpacity="0.1" />
                      <stop offset="50%" stopColor="#00cc4a" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#00ff88" stopOpacity="0.85" />
                    </linearGradient>
                    <radialGradient id="cfCoreGlow" cx="45%" cy="48%" r="45%">
                      <stop offset="0%" stopColor="#00e676" stopOpacity="0.28" />
                      <stop offset="60%" stopColor="#00994d" stopOpacity="0.08" />
                      <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Soft Ambient Halo */}
                  <circle cx="320" cy="240" r="210" fill="url(#cfCoreGlow)" className="cf-pulse-slow" />

                  {/* Background Flowing Ribbon */}
                  <path
                    d="M 40 390 C 150 410, 170 120, 290 130 C 400 140, 340 330, 460 280 C 550 240, 590 100, 660 60 C 590 170, 540 360, 410 350 C 290 340, 330 200, 240 210 C 160 220, 140 380, 40 390 Z"
                    fill="url(#cfRibbonSecondary)"
                  />

                  {/* Main 3D S-Curve Ribbon */}
                  <path
                    d="M 70 360 C 175 370, 180 95, 310 105 C 425 115, 355 305, 470 250 C 555 210, 575 95, 640 45 C 585 155, 535 320, 425 315 C 315 310, 350 165, 260 175 C 185 185, 160 350, 70 360 Z"
                    fill="url(#cfRibbonMain)"
                  />

                  {/* Crisp Neon Highlight Edge */}
                  <path
                    d="M 85 350 C 185 355, 190 110, 312 118 C 420 125, 360 295, 468 245 C 545 208, 575 100, 635 52"
                    stroke="#a7f3d0"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeOpacity="0.65"
                  />

                  {/* Decorative Tech Dots */}
                  <circle cx="145" cy="215" r="2.5" fill="#00ff88" fillOpacity="0.7" />
                  <circle cx="165" cy="195" r="2" fill="#00ff88" fillOpacity="0.45" />
                  <circle cx="185" cy="178" r="2" fill="#00ff88" fillOpacity="0.3" />
                  <circle cx="385" cy="340" r="3" fill="#00d4ff" fillOpacity="0.5" />
                  <circle cx="495" cy="145" r="2.5" fill="#00ff88" fillOpacity="0.6" />
                </svg>
              </div>

              {/* Foreground Typography ("Bienvenido.") */}
              <div className="relative z-10 max-w-[420px] space-y-3 mt-16 lg:mt-8">
                <span className="inline-block text-[10px] font-black uppercase tracking-[0.35em] text-[#00ff88] bg-[#00e676]/10 border border-[#00e676]/30 px-3 py-1 rounded-full">
                  Distribuidor Autorizado
                </span>
                <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black text-white tracking-tight leading-none">
                  Bienvenido<span className="text-[#00ff88]">.</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-300/85 leading-relaxed font-medium">
                  Plataforma corporativa de gestión comercial, supervisión en ruta, televenta y ejecución en punto de venta de{" "}
                  <span className="text-white font-bold">Cervezas Finas de Ciudad Serdán</span>.
                </p>

                {/* Client Store CTA */}
                <div className="pt-4 flex items-center justify-center lg:justify-end gap-2 text-xs">
                  <span className="text-slate-400">¿Eres cliente?</span>
                  <a
                    href="https://cervezasfinas.com.mx"
                    className="inline-flex items-center gap-1 font-black uppercase tracking-wider text-[#00ff88] hover:underline"
                  >
                    Ir a la tienda <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* ── BOTTOM FOOTER BAR INSIDE CARD ── */}
          <footer className="relative z-20 px-6 sm:px-10 py-3.5 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
            <div>
              Al ingresar aceptas nuestros{" "}
              <button
                type="button"
                onClick={() => navigate("/terminos")}
                className="text-emerald-400/80 hover:text-emerald-300 hover:underline"
              >
                Términos y Condiciones
              </button>{" "}
              y el{" "}
              <button
                type="button"
                onClick={() => navigate("/aviso-privacidad")}
                className="text-emerald-400/80 hover:text-emerald-300 hover:underline"
              >
                Aviso de Privacidad
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00e676]" />
              <span className="font-mono text-emerald-400 font-bold">v{APP_CURRENT_VERSION}</span>
              <span>•</span>
              <span>Enterprise Release</span>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
