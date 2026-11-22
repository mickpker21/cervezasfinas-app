// src/pages/rrhh/RecruitmentDashboard.jsx
// Dashboard principal de reclutamiento para RRHH/Admin
import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Users, Briefcase, TrendingUp, CheckCircle2, XCircle,
    Clock, Plus, Eye, ChevronRight, Search, Filter, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const PIPELINE_STAGES = [
    { key: 'nueva', label: 'Nueva', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    { key: 'revisada', label: 'Revisada', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    { key: 'preseleccionada', label: 'Preseleccionada', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
    { key: 'contactada', label: 'Contactada', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    { key: 'entrevista_1', label: 'Entrevista 1', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    { key: 'entrevista_2', label: 'Entrevista 2', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    { key: 'estudio_socioeconomico', label: 'Est. Socioeconómico', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    { key: 'examen_medico', label: 'Examen Médico', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
    { key: 'oferta', label: 'Oferta', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    { key: 'contratada', label: 'Contratad@', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
    { key: 'rechazada', label: 'Rechazad@', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
];

const getStageStyle = (status) => PIPELINE_STAGES.find(s => s.key === status) || PIPELINE_STAGES[0];

export default function RecruitmentDashboard() {
    const navigate = useNavigate();
    const [applications, setApplications] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('__ALL__');
    const [jobFilter, setJobFilter] = useState('__ALL__');

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [{ data: apps }, { data: jobsData }] = await Promise.all([
                    supabase
                        .from('job_applications')
                        .select('*, job_postings(position_title, area)')
                        .order('created_at', { ascending: false }),
                    supabase.from('job_postings').select('id, position_title, area, status').order('created_at', { ascending: false })
                ]);
                setApplications(apps || []);
                setJobs(jobsData || []);
            } catch (e) {
                console.error('[RecruitmentDashboard] Error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // KPIs
    const kpis = useMemo(() => {
        const total = applications.length;
        const activeJobs = jobs.filter(j => j.status === 'activa').length;
        const inProcess = applications.filter(a => !['contratada', 'rechazada', 'nueva'].includes(a.pipeline_status)).length;
        const hired = applications.filter(a => a.pipeline_status === 'contratada').length;
        const rejected = applications.filter(a => a.pipeline_status === 'rechazada').length;
        const disqualified = applications.filter(a => a.is_disqualified).length;
        const today = new Date().toISOString().slice(0, 10);
        const todayApps = applications.filter(a => a.created_at?.slice(0, 10) === today).length;
        return { total, activeJobs, inProcess, hired, rejected, disqualified, todayApps };
    }, [applications, jobs]);

    // Filtro
    const filtered = useMemo(() => {
        return applications.filter(a => {
            const name = (a.full_name || '').toLowerCase();
            const pos = (a.job_postings?.position_title || '').toLowerCase();
            const matchSearch = !searchTerm || name.includes(searchTerm.toLowerCase()) || pos.includes(searchTerm.toLowerCase());
            const matchStatus = statusFilter === '__ALL__' || a.pipeline_status === statusFilter;
            const matchJob = jobFilter === '__ALL__' || a.job_posting_id === jobFilter;
            return matchSearch && matchStatus && matchJob;
        });
    }, [applications, searchTerm, statusFilter, jobFilter]);

    const KPIS = [
        { label: 'Postulaciones Total', value: kpis.total, icon: Users, color: 'from-blue-600 to-blue-700', shadow: 'shadow-blue-900/30' },
        { label: 'Hoy', value: kpis.todayApps, icon: Clock, color: 'from-slate-600 to-slate-700', shadow: 'shadow-slate-900/30' },
        { label: 'En Proceso', value: kpis.inProcess, icon: TrendingUp, color: 'from-violet-600 to-violet-700', shadow: 'shadow-violet-900/30' },
        { label: 'Contratad@s', value: kpis.hired, icon: CheckCircle2, color: 'from-emerald-600 to-emerald-700', shadow: 'shadow-emerald-900/30' },
        { label: 'Vacantes Activas', value: kpis.activeJobs, icon: Briefcase, color: 'from-orange-600 to-orange-700', shadow: 'shadow-orange-900/30' },
        { label: 'Descalificados', value: kpis.disqualified, icon: AlertTriangle, color: 'from-red-600 to-red-700', shadow: 'shadow-red-900/30' },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
            <Helmet><title>Reclutamiento | RRHH</title></Helmet>

            {/* Header */}
            <div className="flex items-start md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Reclutamiento</h1>
                    <p className="text-slate-400 mt-1">Gestión de candidatos y vacantes</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => navigate('/rrhh/jobs')}
                        className="border-white/10 text-white hover:bg-white/5"
                    >
                        <Briefcase className="h-4 w-4 mr-2" /> Vacantes
                    </Button>
                    <Button
                        onClick={() => navigate('/rrhh/jobs/new')}
                        className="bg-emerald-600 hover:bg-emerald-700"
                    >
                        <Plus className="h-4 w-4 mr-2" /> Nueva Vacante
                    </Button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                {KPIS.map((kpi, i) => (
                    <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                        <Card className={`bg-gradient-to-br ${kpi.color} border-0 shadow-lg ${kpi.shadow} text-white`}>
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-2">
                                    <kpi.icon className="h-5 w-5 opacity-75" />
                                </div>
                                <p className="text-2xl font-bold">{loading ? '—' : kpi.value}</p>
                                <p className="text-xs opacity-80 mt-0.5">{kpi.label}</p>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Pipeline Funnel (simple bar) */}
            <Card className="bg-white/5 border-white/10 mb-6">
                <CardHeader><CardTitle className="text-white text-base">Distribución por Etapa</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {PIPELINE_STAGES.map(stage => {
                            const count = applications.filter(a => a.pipeline_status === stage.key).length;
                            if (!count) return null;
                            return (
                                <button
                                    key={stage.key}
                                    onClick={() => setStatusFilter(stage.key === statusFilter ? '__ALL__' : stage.key)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${stage.color} ${statusFilter === stage.key ? 'ring-1 ring-white/30' : 'opacity-80 hover:opacity-100'}`}
                                >
                                    {stage.label}
                                    <span className="bg-white/20 rounded-full px-2 py-0.5">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Filtros de búsqueda */}
            <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Buscar candidato o puesto..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 bg-white/5 border-white/10 text-white"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48 bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Etapa" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__ALL__">Todas las etapas</SelectItem>
                        {PIPELINE_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={jobFilter} onValueChange={setJobFilter}>
                    <SelectTrigger className="w-52 bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Vacante" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__ALL__">Todas las vacantes</SelectItem>
                        {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.position_title}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {/* Tabla de candidatos */}
            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">Cargando...</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-8 text-center">
                            <Users className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                            <p className="text-slate-400">No se encontraron postulaciones.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-white/5 border-b border-white/10">
                                    <tr>
                                        {['Candidato', 'Vacante', 'Teléfono', 'Score', 'Etapa', 'Fecha', ''].map(h => (
                                            <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filtered.map(app => {
                                        const stage = getStageStyle(app.pipeline_status);
                                        return (
                                            <tr key={app.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-4 py-3">
                                                    <p className="text-white font-medium">{app.full_name}</p>
                                                    {app.is_disqualified && <p className="text-red-400 text-xs flex items-center gap-1 mt-0.5"><AlertTriangle className="h-3 w-3" />Descalificado</p>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-slate-300">{app.job_postings?.position_title || '—'}</p>
                                                    <p className="text-slate-500 text-xs">{app.job_postings?.area}</p>
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">{app.phone}</td>
                                                <td className="px-4 py-3">
                                                    {app.auto_score != null && (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${app.auto_score >= 70 ? 'bg-emerald-400' : app.auto_score >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                                                    style={{ width: `${app.auto_score}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-slate-300 text-xs">{app.auto_score}%</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-xs font-medium px-2 py-1 rounded-full border ${stage.color}`}>{stage.label}</span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs">
                                                    {app.created_at ? format(new Date(app.created_at), 'dd MMM yyyy', { locale: es }) : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Button
                                                        size="sm" variant="ghost"
                                                        onClick={() => navigate(`/rrhh/applicants/${app.id}`)}
                                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-all"
                                                    >
                                                        <Eye className="h-4 w-4 mr-1" /> Ver
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
            <p className="text-slate-500 text-xs mt-3">Mostrando {filtered.length} de {applications.length} candidatos</p>
        </div>
    );
}
