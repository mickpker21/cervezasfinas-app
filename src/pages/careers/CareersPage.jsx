// src/pages/careers/CareersPage.jsx
// Portal público de vacantes (sin autenticación necesaria)
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase, MapPin, Clock, Users, Search, ChevronRight, Building2, ChevronLeft, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const AREA_COLORS = {
    'Almacén': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'Transporte': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    'Ventas': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    'Supervisión': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    'Administración': 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    'Operaciones': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

export default function CareersPage() {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [areaFilter, setAreaFilter] = useState('__ALL__');

    useEffect(() => {
        const fetchJobs = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('job_postings')
                    .select('id, position_title, area, department, description, salary_min, salary_max, contract_type, location, vacancies, requirements_image_url, created_at')
                    .eq('status', 'activa')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setJobs(data || []);
            } catch (e) {
                console.error('[CareersPage] Error loading jobs:', e);
                setJobs([]);
            } finally {
                setLoading(false);
            }
        };
        fetchJobs();
    }, []);

    const areas = ['__ALL__', ...Array.from(new Set(jobs.map(j => j.area).filter(Boolean)))];

    const filtered = jobs.filter(j => {
        const matchesSearch = !searchTerm ||
            j.position_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            j.area?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesArea = areaFilter === '__ALL__' || j.area === areaFilter;
        return matchesSearch && matchesArea;
    });

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <Helmet>
                <title>Trabaja con Nosotros | Cervezas Finas</title>
                <meta name="description" content="Conoce nuestras vacantes disponibles y únete al equipo de Cervezas Finas." />
            </Helmet>

            {/* Sticky back nav */}
            <div className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-xl border-b border-white/10">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors group"
                    >
                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Regresar
                    </button>
                    <div className="h-4 w-px bg-white/20" />
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">Bolsa de Trabajo</span>
                </div>
            </div>

            {/* Hero */}
            <div className="relative overflow-hidden bg-gradient-to-r from-emerald-900/40 via-slate-900 to-blue-900/40 border-b border-white/10 py-16 px-6 text-center">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <Building2 className="h-8 w-8 text-emerald-400" />
                        <span className="text-emerald-400 font-semibold text-lg tracking-wide uppercase">Cervezas Finas</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">Trabaja con Nosotros</h1>
                    <p className="text-slate-300 text-lg max-w-xl mx-auto">
                        Únete a un equipo en crecimiento. Vacantes abiertas para distintas áreas.
                    </p>
                </motion.div>
            </div>

            {/* Filtros */}
            <div className="max-w-5xl mx-auto px-4 pt-10 pb-4">
                <div className="flex flex-col md:flex-row gap-3 mb-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar vacante o área..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {areas.map(area => (
                            <button
                                key={area}
                                onClick={() => setAreaFilter(area)}
                                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${areaFilter === area
                                        ? 'bg-emerald-500 border-emerald-400 text-white'
                                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                                    }`}
                            >
                                {area === '__ALL__' ? 'Todas' : area}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Job Cards */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="animate-pulse bg-white/5 rounded-2xl h-48 border border-white/10" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center text-slate-400 py-20">
                        <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg">No hay vacantes disponibles en este momento.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {filtered.map((job, idx) => (
                            <motion.div
                                key={job.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => navigate(`/careers/${job.id}`)}
                                className="group relative cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/40 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-900/20"
                            >
                                {job.requirements_image_url && (
                                    <div className="w-full h-32 rounded-xl overflow-hidden mb-4">
                                        <img src={job.requirements_image_url} alt="Requisitos" className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                                    </div>
                                )}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-lg font-bold text-white truncate">{job.position_title}</h2>
                                        <p className="text-slate-400 text-sm mt-1 line-clamp-2">{job.description}</p>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 shrink-0 transition-colors mt-1" />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${AREA_COLORS[job.area] || 'bg-white/10 text-slate-300 border-white/20'}`}>
                                        {job.area}
                                    </span>
                                    {job.contract_type && (
                                        <span className="flex items-center gap-1 text-xs text-slate-400">
                                            <Clock className="h-3 w-3" /> {job.contract_type}
                                        </span>
                                    )}
                                    {job.location && (
                                        <span className="flex items-center gap-1 text-xs text-slate-400">
                                            <MapPin className="h-3 w-3" /> {job.location}
                                        </span>
                                    )}
                                    {job.vacancies > 1 && (
                                        <span className="flex items-center gap-1 text-xs text-slate-400">
                                            <Users className="h-3 w-3" /> {job.vacancies} vacantes
                                        </span>
                                    )}
                                </div>

                                {(job.salary_min || job.salary_max) && (
                                    <p className="text-emerald-400 font-semibold text-sm mt-3">
                                        ${job.salary_min?.toLocaleString()} – ${job.salary_max?.toLocaleString()} / mes
                                    </p>
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}

                <p className="text-center text-slate-500 text-sm mt-10 pb-4">
                    {filtered.length > 0 && `Mostrando ${filtered.length} vacante${filtered.length !== 1 ? 's' : ''}`}
                </p>
            </div>

            {/* Legal footer */}
            <div className="border-t border-white/10 py-6 px-4 mt-4">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-emerald-500/60" />
                        <span>© {new Date().getFullYear()} Cervezas Finas de Ciudad Serdán S.A. de C.V.</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/terminos')}
                            className="hover:text-slate-300 transition-colors underline underline-offset-2"
                        >
                            Términos y Condiciones
                        </button>
                        <span>·</span>
                        <button
                            onClick={() => navigate('/aviso-privacidad')}
                            className="hover:text-slate-300 transition-colors underline underline-offset-2"
                        >
                            Aviso de Privacidad
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
