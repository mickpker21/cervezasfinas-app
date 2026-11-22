// src/pages/rrhh/JobPostingManager.jsx
// CRUD de vacantes + constructor de cuestionario + foto de requisitos
import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
    Plus, Trash2, Edit2, X, Save, Upload, Eye, ToggleLeft, ToggleRight,
    Briefcase, ChevronDown, ChevronUp, Loader2, ArrowLeft
} from 'lucide-react';

const AREAS = ['Almacén', 'Transporte', 'Ventas', 'Supervisión', 'Administración', 'Operaciones'];
const POSITIONS = [
    'Jefe de Almacén', 'Ayudante de Almacén', 'Chofer Torton', 'Chofer Repartidor', 'Ayudante de Reparto',
    'Autoventa', 'CallCenter', 'Supervisor', 'Jefe de Ventas', 'Auxiliar Administrativo', 'Gerente',
    'Coordinador Trade', 'Coordinador Cambaceo', 'Cambaceador', 'Conquistador', 'Preventa',
    'Auxiliar RRHH', 'RRHH', 'Jefe de Operaciones', 'Auxiliar de Operaciones', 'Jefe de Trade'
];
const QUESTION_TYPES = [
    { value: 'yes_no', label: 'Sí / No' },
    { value: 'multiple_choice', label: 'Opción múltiple' },
    { value: 'text', label: 'Texto libre' },
    { value: 'scale', label: 'Escala 1–5' },
    { value: 'number', label: 'Número' },
];

const BLANK_JOB = {
    position_title: '', area: '', department: '', description: '', requirements: '',
    salary_min: '', salary_max: '', contract_type: 'Tiempo Completo', location: '', vacancies: 1, status: 'activa'
};

const BLANK_QUESTION = { question_text: '', question_type: 'yes_no', is_required: true, sort_order: 0, options: [], disqualifiers: [] };

export default function JobPostingManager() {
    const navigate = useNavigate();
    const { user } = useSupabaseAuth();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expandedJob, setExpandedJob] = useState(null); // jobId being edited
    const [form, setForm] = useState(BLANK_JOB);
    const [questions, setQuestions] = useState([]);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const loadJobs = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await supabase.from('job_postings').select('*, job_questionnaires(count)').order('created_at', { ascending: false });
            setJobs(data || []);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, []);

    useEffect(() => { loadJobs(); }, [loadJobs]);

    const startCreate = () => {
        setForm(BLANK_JOB);
        setQuestions([]);
        setImageFile(null);
        setImagePreview('');
        setExpandedJob(null);
        setIsCreating(true);
    };

    const startEdit = async (job) => {
        setIsCreating(false);
        setForm({ ...job, salary_min: job.salary_min || '', salary_max: job.salary_max || '' });
        setImagePreview(job.requirements_image_url || '');
        setExpandedJob(job.id);
        // Load questions
        const { data: qData } = await supabase.from('job_questionnaires')
            .select('*, job_questionnaire_options(*), job_questionnaire_disqualifiers(*)')
            .eq('job_posting_id', job.id).order('sort_order');
        setQuestions((qData || []).map(q => ({
            ...q,
            options: (q.job_questionnaire_options || []).map(o => o.option_text),
            disqualifiers: (q.job_questionnaire_disqualifiers || []).map(d => ({ answer: d.disqualifying_answer, reason: d.reason })),
        })));
    };

    const uploadImage = async (file) => {
        const ext = file.name.split('.').pop();
        const path = `job-requirements/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('job-requirements').upload(path, file, { upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('job-requirements').getPublicUrl(path);
        return publicUrl;
    };

    const handleSave = async () => {
        if (!form.position_title || !form.area) return alert('Completa el título y área.');
        setSaving(true);
        try {
            let imageUrl = form.requirements_image_url || null;
            if (imageFile) imageUrl = await uploadImage(imageFile);

            const payload = {
                position_title: form.position_title, area: form.area, department: form.department || null,
                description: form.description || null, requirements: form.requirements || null,
                requirements_image_url: imageUrl,
                salary_min: form.salary_min ? Number(form.salary_min) : null,
                salary_max: form.salary_max ? Number(form.salary_max) : null,
                contract_type: form.contract_type, location: form.location || null,
                vacancies: Number(form.vacancies) || 1, status: form.status,
                created_by: user?.id, updated_at: new Date().toISOString(),
            };

            let jobId = expandedJob;
            if (isCreating) {
                const { data: newJob, error } = await supabase.from('job_postings').insert(payload).select().single();
                if (error) throw error;
                jobId = newJob.id;
            } else {
                const { error } = await supabase.from('job_postings').update(payload).eq('id', jobId);
                if (error) throw error;
            }

            // Save questionnaire: delete old, insert new
            if (!isCreating) {
                await supabase.from('job_questionnaires').delete().eq('job_posting_id', jobId);
            }
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const { data: qRow, error: qErr } = await supabase.from('job_questionnaires').insert({
                    job_posting_id: jobId, question_text: q.question_text,
                    question_type: q.question_type, is_required: q.is_required, sort_order: i
                }).select().single();
                if (qErr) continue;
                // Options
                if (q.question_type === 'multiple_choice' && q.options?.length) {
                    await supabase.from('job_questionnaire_options').insert(
                        q.options.map((opt, oi) => ({ question_id: qRow.id, option_text: opt, sort_order: oi }))
                    );
                }
                // Disqualifiers
                if (q.disqualifiers?.length) {
                    await supabase.from('job_questionnaire_disqualifiers').insert(
                        q.disqualifiers.map(d => ({ question_id: qRow.id, disqualifying_answer: d.answer, reason: d.reason || null }))
                    );
                }
            }

            setIsCreating(false);
            setExpandedJob(null);
            await loadJobs();
        } catch (e) {
            console.error('[JobPostingManager] Save error:', e);
            alert('Error al guardar: ' + e.message);
        } finally { setSaving(false); }
    };

    const handleToggleStatus = async (job) => {
        const newStatus = job.status === 'activa' ? 'pausada' : 'activa';
        await supabase.from('job_postings').update({ status: newStatus }).eq('id', job.id);
        await loadJobs();
    };

    const handleDelete = async (jobId) => {
        if (!confirm('¿Eliminar esta vacante? Se perderán todos los candidatos asociados.')) return;
        await supabase.from('job_postings').delete().eq('id', jobId);
        await loadJobs();
    };

    const addQuestion = () => setQuestions(qs => [...qs, { ...BLANK_QUESTION, id: `new_${Date.now()}` }]);

    const updateQuestion = (idx, field, val) => setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, [field]: val } : q));
    const removeQuestion = (idx) => setQuestions(qs => qs.filter((_, i) => i !== idx));

    const addOption = (qi) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, options: [...(q.options || []), ''] } : q));
    const updateOption = (qi, oi, val) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, options: q.options.map((o, j) => j === oi ? val : o) } : q));
    const removeOption = (qi, oi) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, options: q.options.filter((_, j) => j !== oi) } : q));

    const addDisqualifier = (qi) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, disqualifiers: [...(q.disqualifiers || []), { answer: '', reason: '' }] } : q));
    const updateDisqualifier = (qi, di, field, val) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, disqualifiers: q.disqualifiers.map((d, j) => j === di ? { ...d, [field]: val } : d) } : q));
    const removeDisqualifier = (qi, di) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, disqualifiers: q.disqualifiers.filter((_, j) => j !== di) } : q));

    const showForm = isCreating || !!expandedJob;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
            <Helmet><title>Gestión de Vacantes | RRHH</title></Helmet>

            <button onClick={() => navigate('/rrhh/recruitment')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 text-sm transition-colors">
                <ArrowLeft className="h-4 w-4" /> Reclutamiento
            </button>

            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold text-white">Gestión de Vacantes</h1>
                <Button onClick={startCreate} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="h-4 w-4 mr-2" /> Nueva Vacante
                </Button>
            </div>

            {/* Form: Create / Edit */}
            {showForm && (
                <Card className="bg-white/5 border-white/10 mb-8">
                    <CardHeader>
                        <CardTitle className="text-white text-lg">{isCreating ? 'Nueva Vacante' : 'Editar Vacante'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Datos básicos */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300 text-sm mb-1 block">Puesto *</Label>
                                <Select value={form.position_title} onValueChange={v => setForm(f => ({ ...f, position_title: v }))}>
                                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                        <SelectValue placeholder="Selecciona puesto" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-slate-300 text-sm mb-1 block">Área *</Label>
                                <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v }))}>
                                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Área" /></SelectTrigger>
                                    <SelectContent>{AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-slate-300 text-sm mb-1 block">Sueldo desde</Label>
                                <Input type="number" placeholder="Ej: 8000" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
                            </div>
                            <div>
                                <Label className="text-slate-300 text-sm mb-1 block">Sueldo hasta</Label>
                                <Input type="number" placeholder="Ej: 12000" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
                            </div>
                            <div>
                                <Label className="text-slate-300 text-sm mb-1 block">Tipo de contrato</Label>
                                <Select value={form.contract_type} onValueChange={v => setForm(f => ({ ...f, contract_type: v }))}>
                                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {['Tiempo Completo', 'Medio Tiempo', 'Por proyecto', 'Temporal'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-slate-300 text-sm mb-1 block">Ubicación</Label>
                                <Input placeholder="Ej: Monterrey, NL" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
                            </div>
                            <div>
                                <Label className="text-slate-300 text-sm mb-1 block">Vacantes disponibles</Label>
                                <Input type="number" min={1} value={form.vacancies} onChange={e => setForm(f => ({ ...f, vacancies: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
                            </div>
                            <div>
                                <Label className="text-slate-300 text-sm mb-1 block">Estado</Label>
                                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="activa">Activa</SelectItem>
                                        <SelectItem value="pausada">Pausada</SelectItem>
                                        <SelectItem value="cerrada">Cerrada</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300 text-sm mb-1 block">Descripción del puesto</Label>
                            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-white/5 border-white/10 text-white" rows={3} placeholder="Describe las responsabilidades del puesto..." />
                        </div>
                        <div>
                            <Label className="text-slate-300 text-sm mb-1 block">Requisitos (texto)</Label>
                            <Textarea value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} className="bg-white/5 border-white/10 text-white" rows={3} placeholder="Experiencia mínima, escolaridad, habilidades..." />
                        </div>

                        {/* Foto de requisitos */}
                        <div>
                            <Label className="text-slate-300 text-sm mb-2 block">Imagen de Requisitos</Label>
                            {imagePreview && <img src={imagePreview} alt="Requisitos" className="w-full max-h-48 object-contain rounded-xl border border-white/10 mb-3 bg-black/30" />}
                            <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-white/20 hover:border-emerald-500/50 cursor-pointer transition-all bg-white/5 hover:bg-white/10">
                                <Upload className="h-5 w-5 text-emerald-400" />
                                <span className="text-slate-300 text-sm">{imageFile ? imageFile.name : 'Subir imagen de requisitos (JPG, PNG)'}</span>
                                <input type="file" accept="image/*" className="hidden" onChange={e => {
                                    const file = e.target.files[0];
                                    if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
                                }} />
                            </label>
                        </div>

                        {/* Cuestionario */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-white font-semibold">Cuestionario de Preselección</h3>
                                <Button onClick={addQuestion} size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/5">
                                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar Pregunta
                                </Button>
                            </div>
                            {questions.length === 0 && <p className="text-slate-500 text-sm mb-4">Sin preguntas. Agrega preguntas para filtrar candidatos.</p>}
                            <div className="space-y-4">
                                {questions.map((q, qi) => (
                                    <div key={q.id || qi} className="bg-black/20 rounded-xl border border-white/10 p-4 space-y-3">
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder={`Pregunta ${qi + 1}...`}
                                                value={q.question_text}
                                                onChange={e => updateQuestion(qi, 'question_text', e.target.value)}
                                                className="bg-white/5 border-white/10 text-white flex-1"
                                            />
                                            <Select value={q.question_type} onValueChange={v => updateQuestion(qi, 'question_type', v)}>
                                                <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {QUESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <Button size="icon" variant="ghost" onClick={() => removeQuestion(qi)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox" id={`req_${qi}`} checked={q.is_required} onChange={e => updateQuestion(qi, 'is_required', e.target.checked)} className="rounded" />
                                            <label htmlFor={`req_${qi}`} className="text-slate-300 text-xs">Obligatoria</label>
                                        </div>

                                        {/* Opciones múltiple */}
                                        {q.question_type === 'multiple_choice' && (
                                            <div className="space-y-2">
                                                <p className="text-slate-500 text-xs">Opciones:</p>
                                                {(q.options || []).map((opt, oi) => (
                                                    <div key={oi} className="flex gap-2">
                                                        <Input value={opt} onChange={e => updateOption(qi, oi, e.target.value)} placeholder={`Opción ${oi + 1}`} className="bg-white/5 border-white/10 text-white text-sm" />
                                                        <Button size="icon" variant="ghost" onClick={() => removeOption(qi, oi)} className="text-red-400 shrink-0"><X className="h-3.5 w-3.5" /></Button>
                                                    </div>
                                                ))}
                                                <Button size="sm" variant="ghost" onClick={() => addOption(qi)} className="text-slate-400 hover:text-white text-xs"><Plus className="h-3 w-3 mr-1" />Agregar opción</Button>
                                            </div>
                                        )}

                                        {/* Descalificadores */}
                                        <div className="space-y-2 border-t border-white/5 pt-2">
                                            <p className="text-slate-500 text-xs">Respuestas descalificadoras:</p>
                                            {(q.disqualifiers || []).map((dq, di) => (
                                                <div key={di} className="flex gap-2">
                                                    <Input value={dq.answer} onChange={e => updateDisqualifier(qi, di, 'answer', e.target.value)} placeholder='Respuesta que descalifica (ej: "no")' className="bg-red-900/10 border-red-500/20 text-white text-xs flex-1" />
                                                    <Input value={dq.reason} onChange={e => updateDisqualifier(qi, di, 'reason', e.target.value)} placeholder="Motivo" className="bg-white/5 border-white/10 text-white text-xs flex-1" />
                                                    <Button size="icon" variant="ghost" onClick={() => removeDisqualifier(qi, di)} className="text-red-400 shrink-0"><X className="h-3.5 w-3.5" /></Button>
                                                </div>
                                            ))}
                                            <Button size="sm" variant="ghost" onClick={() => addDisqualifier(qi)} className="text-red-400 hover:text-red-300 text-xs"><Plus className="h-3 w-3 mr-1" />Añadir descalificador</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex gap-3 pt-2">
                            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Guardar Vacante
                            </Button>
                            <Button variant="outline" onClick={() => { setIsCreating(false); setExpandedJob(null); }} className="border-white/10 text-white hover:bg-white/5">
                                Cancelar
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Lista de vacantes */}
            {loading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 border border-white/10 animate-pulse" />)}</div>
            ) : jobs.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No hay vacantes aún.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {jobs.map(job => (
                        <div key={job.id} className="flex items-center gap-4 bg-white/5 border border-white/10 hover:border-white/20 rounded-xl px-4 py-3 transition-all group">
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-medium truncate">{job.position_title}</p>
                                <p className="text-slate-400 text-sm">{job.area} · {job.vacancies} vacante{job.vacancies !== 1 ? 's' : ''}</p>
                            </div>
                            <span className={`text-xs px-2.5 py-1 rounded-full border ${job.status === 'activa' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                                {job.status}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="icon" variant="ghost" onClick={() => navigate(`/careers/${job.id}`)} className="text-slate-400 hover:text-white" title="Vista pública">
                                    <Eye className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => startEdit(job)} className="text-slate-400 hover:text-white" title="Editar">
                                    <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => handleToggleStatus(job)} className="text-slate-400 hover:text-white" title="Activar/Pausar">
                                    {job.status === 'activa' ? <ToggleRight className="h-4 w-4 text-emerald-400" /> : <ToggleLeft className="h-4 w-4" />}
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => handleDelete(job.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10" title="Eliminar">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
