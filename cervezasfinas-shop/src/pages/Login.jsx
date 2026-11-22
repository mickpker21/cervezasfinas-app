import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, User, LogIn, Eye, EyeOff } from 'lucide-react';

export default function Login() {
    const [clientCode, setClientCode] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login: authLogin } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await authLogin(clientCode, password);
            navigate('/catalog');
        } catch (err) {
            setError(err.message || 'Credenciales inválidas');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">

            {/* Split Card Container */}
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px] md:h-auto min-h-[500px]">

                {/* LEFT / TOP PANEL - BRANDING */}
                <div
                    className="w-full md:w-1/2 p-8 flex flex-col items-center justify-center text-white relative overflow-hidden bg-cover bg-center"
                    style={{ backgroundImage: "url('/inicio.png')" }}
                >
                    {/* Dark Overlay removed */}

                    <div className="relative z-10 flex flex-col items-center">
                        {/* Logo removed from here */}
                    </div>
                </div>

                {/* RIGHT / BOTTOM PANEL - FORM */}
                <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-white relative">

                    <div className="max-w-sm mx-auto w-full">
                        <div className="text-center mb-10">
                            <div className="mx-auto w-80 h-auto">
                                <img src="/logo3.png" alt="Cervezas Finas" className="w-full h-full object-contain" />
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="text-red-500 text-xs bg-red-50 border border-red-100 p-3 rounded-lg flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                    {error}
                                </div>
                            )}

                            {/* Client Code */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Código de Cliente</label>
                                <div className="relative group">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#059669] transition-colors">
                                        <User className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="text"
                                        value={clientCode}
                                        onChange={(e) => setClientCode(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 text-gray-800 rounded-xl focus:bg-white focus:border-[#059669] focus:ring-4 focus:ring-[#059669]/10 outline-none transition-all duration-200 placeholder-gray-400 font-medium"
                                        placeholder="Ej: CL-12345"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Contraseña</label>
                                <div className="relative group">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#059669] transition-colors">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 text-gray-800 rounded-xl focus:bg-white focus:border-[#059669] focus:ring-4 focus:ring-[#059669]/10 outline-none transition-all duration-200 placeholder-gray-400 font-medium"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Actions Component - Remember Me / Forgot Password */}
                            <div className="flex items-center justify-between text-xs">
                                <label className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-800">
                                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#059669] focus:ring-[#059669]" />
                                    <span>Recordarme</span>
                                </label>
                                <a href="#" className="font-semibold text-[#059669] hover:underline hover:text-[#047857]">
                                    ¿Olvidaste contraseña?
                                </a>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-600/20 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
                            >
                                {loading ? 'Validando...' : 'Iniciar Sesión'}
                            </button>
                        </form>
                    </div>

                    {/* Mobile Only Logo Overlay (Optional tweak if needed, usually hidden on desktop) */}
                </div>
            </div>
        </div>
    );
}
