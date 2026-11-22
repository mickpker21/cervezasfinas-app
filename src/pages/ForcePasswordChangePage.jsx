import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, CheckCircle2, AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function ForcePasswordChangePage() {
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const validate = () => {
    if (!pwd || !pwd2) return 'Ambos campos son obligatorios';
    if (pwd !== pwd2) return 'Las contraseñas no coinciden';
    if (pwd.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (!/[A-Z]/.test(pwd)) return 'Debe incluir al menos una mayúscula';
    if (!/[a-z]/.test(pwd)) return 'Debe incluir al menos una minúscula';
    if (!/\d/.test(pwd)) return 'Debe incluir al menos un número';
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setLoading(true); setError('');
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: pwd, data: { must_change_password: false } });
      if (updErr) throw new Error(updErr.message);
      
      // Llamar RPC para limpiar must_change_password y setear password_changed_at
      const { error: rpcErr } = await supabase.rpc('finish_password_change');
      if (rpcErr) console.warn('RPC finish_password_change error', rpcErr.message);
      
      setSuccess(true);
      await supabase.auth.refreshSession().catch(() => {});
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050B14] p-4 relative overflow-hidden font-sans">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00cc4a]/10 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] relative z-10"
      >
        <div className="bg-[#0D1624]/60 backdrop-blur-2xl border border-white/[0.08] p-8 md:p-10 rounded-[32px] shadow-2xl space-y-8">
          
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#00cc4a]/10 border border-[#00cc4a]/20 mb-4">
              <ShieldCheck className="w-8 h-8 text-[#00cc4a]" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Seguridad de la cuenta</h1>
            <p className="text-slate-400 text-sm">Debes establecer una contraseña segura para continuar con tu sesión.</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl flex items-center gap-2 text-red-500 text-xs"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
              {success && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#00cc4a]/10 border border-[#00cc4a]/30 p-4 rounded-xl flex flex-col items-center gap-2 text-[#00cc4a] text-center"
                >
                  <CheckCircle2 className="w-10 h-10 mb-1" />
                  <span className="font-bold">¡Contraseña actualizada!</span>
                  <span className="text-xs text-[#00cc4a]/80">Redirigiendo al panel principal...</span>
                </motion.div>
              )}
            </AnimatePresence>

            {!success && (
              <>
                <div className="space-y-4">
                  <div className="group space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Nueva Contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#00cc4a] transition-colors" />
                      <Input 
                        type="password" 
                        value={pwd} 
                        onChange={e=>setPwd(e.target.value)}
                        placeholder="••••••••"
                        className="h-14 pl-[3.2rem] rounded-2xl bg-[#0F1A2B] border-white/[0.05] focus:border-[#00cc4a]/50 text-white transition-all focus-visible:ring-0"
                      />
                    </div>
                  </div>

                  <div className="group space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Confirmar Contraseña</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#00cc4a] transition-colors" />
                      <Input 
                        type="password" 
                        value={pwd2} 
                        onChange={e=>setPwd2(e.target.value)}
                        placeholder="••••••••"
                        className="h-14 pl-[3.2rem] rounded-2xl bg-[#0F1A2B] border-white/[0.05] focus:border-[#00cc4a]/50 text-white transition-all focus-visible:ring-0"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/20 p-4 rounded-2xl space-y-2 border border-white/5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Requisitos:</p>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                    <Requirement met={pwd.length >= 8} text="8+ caracteres" />
                    <Requirement met={/[A-Z]/.test(pwd)} text="Mayúscula" />
                    <Requirement met={/[a-z]/.test(pwd)} text="Minúscula" />
                    <Requirement met={/\d/.test(pwd)} text="Número" />
                  </div>
                </div>

                <button 
                  disabled={loading} 
                  className="w-full h-14 bg-gradient-to-r from-[#00cc4a] to-[#00b341] hover:from-[#00ff5c] hover:to-[#00cc4a] disabled:opacity-50 text-white rounded-2xl text-[15px] font-bold shadow-[0_8px_32px_rgba(0,204,74,0.3)] transition-all active:scale-[0.98] mt-6 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Actualizar Contraseña</>
                  )}
                </button>
              </>
            )}
          </form>
        </div>

        <p className="text-center mt-8 text-slate-500 text-xs">
          Cervezas Finas © 2026 • Sistema de Protección de Datos
        </p>
      </motion.div>
    </div>
  );
}

function Requirement({ met, text }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${met ? 'bg-[#00cc4a]' : 'bg-slate-700'}`} />
      <span className={`text-[11px] ${met ? 'text-[#00cc4a] font-medium' : 'text-slate-500'}`}>{text}</span>
    </div>
  );
}
