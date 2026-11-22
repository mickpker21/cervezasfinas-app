// src/pages/careers/JobDetailPage.jsx
// Detalle de vacante + formulario de postulación multi-paso
import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    ArrowLeft, ArrowRight, CheckCircle2, Briefcase, MapPin, Clock,
    Upload, FileText, Loader2, AlertCircle, User, Phone, Mail, Send
} from 'lucide-react';

const STEPS = ['Vacante', 'Datos personales', 'Cuestionario', 'Documentos', 'Confirmación'];

const REQUIRED_DOCS = [
    { key: 'cv', label: 'CV / Currículum Vitae', required: true },
    { key: 'ine_frente', label: 'INE (frente)', required: false },
    { key: 'ine_vuelta', label: 'INE (vuelta)', required: false },
];

function StepIndicator({ current, total, labels }) {
    return (
        <div className="flex items-center justify-between mb-8">
            {labels.map((label, i) => (
                <React.Fragment key={i}>
                    <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${i < current ? 'bg-emerald-500 border-emerald-500 text-white' :
                                i === current ? 'bg-white border-emerald-400 text-emerald-700' :
                                    'bg-transparent border-white/20 text-white/40'
                            }`}>
                            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                        </div>
                        <span className={`text-xs hidden md:block ${i === current ? 'text-white font-semibold' : 'text-slate-500'}`}>{label}</span>
                    </div>
                    {i < total - 1 && (
                        <div className={`flex-1 h-0.5 mx-2 transition-all ${i < current ? 'bg-emerald-500' : 'bg-white/10'}`} />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

export default function JobDetailPage() {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [job, setJob] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errors, setErrors] = useState({});

    // Step 2: Datos personales
    const [personal, setPersonal] = useState({
        full_name: '', phone: '', email: '', curp: '', age: '', city: ''
    });

    // Step 3: Respuestas cuestionario
    const [answers, setAnswers] = useState({});

    // Step 4: Documentos
    const [docFiles, setDocFiles] = useState({});
    const [uploadProgress, setUploadProgress] = useState({});
    const fileRefs = useRef({});

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [{ data: jobData }, { data: qData }] = await Promise.all([
                    supabase.from('job_postings').select('*').eq('id', jobId).single(),
                    supabase.from('job_questionnaires')
                        .select('*, job_questionnaire_options(*), job_questionnaire_disqualifiers(*)')
                        .eq('job_posting_id', jobId)
                        .order('sort_order')
                ]);
                setJob(jobData);
                setQuestions(qData || []);
            } catch (e) {
                console.error('[JobDetailPage] Error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [jobId]);

    const validateStep = () => {
        const e = {};
        if (step === 1) {
            if (!personal.full_name.trim()) e.full_name = 'Nombre requerido';
            if (!personal.phone.trim()) e.phone = 'Teléfono requerido';
        }
        if (step === 2) {
            questions.filter(q => q.is_required).forEach(q => {
                if (!answers[q.id] || String(answers[q.id]).trim() === '') {
                    e[q.id] = 'Campo requerido';
                }
            });
        }
        if (step === 3) {
            REQUIRED_DOCS.filter(d => d.required).forEach(d => {
                if (!docFiles[d.key]) e[d.key] = 'Documento requerido';
            });
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    // Detectar respuestas descalificadoras
    const checkDisqualifiers = () => {
        for (const q of questions) {
            const ans = String(answers[q.id] || '').trim().toLowerCase();
            for (const dq of (q.job_questionnaire_disqualifiers || [])) {
                if (ans === dq.disqualifying_answer.toLowerCase()) {
                    return { disqualified: true, reason: dq.reason || `Respuesta a: "${q.question_text}"` };
                }
            }
        }
        return { disqualified: false };
    };

    const handleNext = () => {
        if (!validateStep()) return;
        if (step === 2) {
            // Check disqualifiers before proceeding
            const { disqualified, reason } = checkDisqualifiers();
            if (disqualified) {
                // Aún puede avanzar pero se marcará como descalificado en BD
                setAnswers(prev => ({ ...prev, __disqualified: true, __disqualify_reason: reason }));
            }
        }
        setStep(s => Math.min(s + 1, STEPS.length - 1));
    };

    const handleBack = () => setStep(s => Math.max(s - 1, 0));

    const uploadDocument = async (applicationId, key, file) => {
        const ext = file.name.split('.').pop();
        const path = `applications/${applicationId}/${key}.${ext}`;
        setUploadProgress(p => ({ ...p, [key]: 'uploading' }));
        const { error } = await supabase.storage
            .from('recruitment-docs')
            .upload(path, file, { upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage
            .from('recruitment-docs')
            .getPublicUrl(path);
        setUploadProgress(p => ({ ...p, [key]: 'done' }));
        return publicUrl;
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const { disqualified, reason } = checkDisqualifiers();
            const autoScore = computeScore();

            const appId = crypto.randomUUID();
            const { error: appErr } = await supabase
                .from('job_applications')
                .insert({
                    id: appId,
                    job_posting_id: jobId,
                    full_name: personal.full_name,
                    email: personal.email || null,
                    phone: personal.phone,
                    curp: personal.curp || null,
                    age: personal.age ? Number(personal.age) : null,
                    city: personal.city || null,
                    pipeline_status: disqualified ? 'rechazada' : 'nueva',
                    is_disqualified: disqualified,
                    disqualification_reason: disqualified ? reason : null,
                    auto_score: autoScore,
                });
            if (appErr) throw appErr;

            // 2. Guardar respuestas
            const answerRows = questions.map(q => ({
                application_id: appId,
                question_id: q.id,
                question_text: q.question_text,
                answer_text: String(answers[q.id] || ''),
            }));
            if (answerRows.length) {
                await supabase.from('job_application_answers').insert(answerRows);
            }

            // 3. Subir documentos
            for (const [key, file] of Object.entries(docFiles)) {
                if (!file) continue;
                const url = await uploadDocument(appId, key, file);
                await supabase.from('job_application_documents').insert({
                    application_id: appId,
                    document_type: key,
                    document_name: file.name,
                    file_url: url,
                });
            }

            // 4. Registrar evento inicial
            await supabase.from('job_pipeline_events').insert({
                application_id: appId,
                event_type: 'nueva_postulacion',
                description: `Nueva postulación recibida. Score: ${autoScore}/100. ${disqualified ? `⚠️ Descalificado: ${reason}` : ''}`,
                new_status: disqualified ? 'rechazada' : 'nueva',
            });

            setSubmitted(true);
        } catch (e) {
            console.error('[JobDetailPage] Submit error:', e);
            setErrors({ submit: 'Ocurrió un error al enviar. Intenta de nuevo.' });
        } finally {
            setSubmitting(false);
        }
    };

    const computeScore = () => {
        // Simple heuristic: % de preguntas contestadas con respuestas no descalificadoras
        if (!questions.length) return 100;
        let score = 0;
        for (const q of questions) {
            const ans = answers[q.id];
            if (!ans || String(ans).trim() === '') continue;
            const isDisq = (q.job_questionnaire_disqualifiers || []).some(
                d => String(ans).trim().toLowerCase() === d.disqualifying_answer.toLowerCase()
            );
            if (!isDisq) score++;
        }
        return Math.round((score / questions.length) * 100);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-emerald-400 animate-spin" />
            </div>
        );
    }

    if (!job) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
                <AlertCircle className="h-12 w-12 text-red-400" />
                <p className="text-lg">Vacante no encontrada.</p>
                <Button variant="outline" onClick={() => navigate('/careers')}>Ver otras vacantes</Button>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 to-emerald-950 flex flex-col items-center justify-center text-white gap-6 p-8">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                    <CheckCircle2 className="h-20 w-20 text-emerald-400" />
                </motion.div>
                <h1 className="text-3xl font-bold text-center">¡Postulación Enviada!</h1>
                <p className="text-slate-300 text-center max-w-md">
                    Tu postulación para <strong>{job.position_title}</strong> ha sido recibida.
                    El equipo de RRHH la revisará a la brevedad y se pondrá en contacto contigo.
                </p>
                <Button onClick={() => navigate('/careers')} className="bg-emerald-600 hover:bg-emerald-700">
                    Ver más vacantes
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <Helmet>
                <title>{job.position_title} | Vacante</title>
            </Helmet>

            <div className="max-w-3xl mx-auto px-4 py-8">
                {/* Back */}
                <button onClick={() => navigate('/careers')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors text-sm">
                    <ArrowLeft className="h-4 w-4" /> Regresar a vacantes
                </button>

                {/* Step indicator */}
                <StepIndicator current={step} total={STEPS.length} labels={STEPS} />

                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* STEP 0: Job Info */}
                        {step === 0 && (
                            <div className="space-y-5">
                                {job.requirements_image_url && (
                                    <div className="rounded-2xl overflow-hidden h-56 w-full">
                                        <img src={job.requirements_image_url} alt="Requisitos" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                                    <h1 className="text-2xl font-bold text-white mb-2">{job.position_title}</h1>
                                    <div className="flex flex-wrap gap-3 mb-4">
                                        {job.area && <span className="text-sm bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30">{job.area}</span>}
                                        {job.contract_type && <span className="flex items-center gap-1 text-sm text-slate-400"><Clock className="h-3.5 w-3.5" />{job.contract_type}</span>}
                                        {job.location && <span className="flex items-center gap-1 text-sm text-slate-400"><MapPin className="h-3.5 w-3.5" />{job.location}</span>}
                                    </div>
                                    {(job.salary_min || job.salary_max) && (
                                        <p className="text-emerald-400 font-semibold mb-4">Sueldo: ${job.salary_min?.toLocaleString()} – ${job.salary_max?.toLocaleString()} / mes</p>
                                    )}
                                    {job.description && (
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Descripción</h3>
                                            <p className="text-slate-300 text-sm whitespace-pre-line">{job.description}</p>
                                        </div>
                                    )}
                                    {job.requirements && (
                                        <div className="mt-4">
                                            <h3 className="text-white font-semibold mb-2">Requisitos</h3>
                                            <p className="text-slate-300 text-sm whitespace-pre-line">{job.requirements}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* STEP 1: Datos personales */}
                        {step === 1 && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2"><User className="h-5 w-5 text-emerald-400" />Datos Personales</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { key: 'full_name', label: 'Nombre completo *', icon: User, placeholder: 'Nombre y apellidos' },
                                        { key: 'phone', label: 'Teléfono *', icon: Phone, placeholder: '10 dígitos' },
                                        { key: 'email', label: 'Correo electrónico', icon: Mail, placeholder: 'ejemplo@correo.com' },
                                        { key: 'city', label: 'Ciudad', icon: MapPin, placeholder: 'Ciudad de residencia' },
                                        { key: 'curp', label: 'CURP', icon: FileText, placeholder: 'CURP de 18 caracteres' },
                                        { key: 'age', label: 'Edad', icon: User, placeholder: 'Tu edad' },
                                    ].map(({ key, label, placeholder }) => (
                                        <div key={key}>
                                            <Label className="text-sm text-slate-300 mb-1 block">{label}</Label>
                                            <Input
                                                placeholder={placeholder}
                                                value={personal[key]}
                                                onChange={e => setPersonal(p => ({ ...p, [key]: e.target.value }))}
                                                className={`bg-white/5 border-white/10 text-white ${errors[key] ? 'border-red-500' : ''}`}
                                            />
                                            {errors[key] && <p className="text-red-400 text-xs mt-1">{errors[key]}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Cuestionario */}
                        {step === 2 && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Briefcase className="h-5 w-5 text-emerald-400" />
                                    Cuestionario de Preselección
                                </h2>
                                {questions.length === 0 ? (
                                    <p className="text-slate-400 text-center py-8">No hay preguntas configuradas para esta vacante aún.</p>
                                ) : (
                                    questions.map((q, qi) => (
                                        <div key={q.id} className="space-y-2">
                                            <Label className="text-sm text-slate-200 block font-medium">
                                                {qi + 1}. {q.question_text} {q.is_required && <span className="text-red-400">*</span>}
                                            </Label>
                                            {q.question_type === 'yes_no' && (
                                                <div className="flex gap-3">
                                                    {['Sí', 'No'].map(opt => (
                                                        <button
                                                            key={opt}
                                                            onClick={() => setAnswers(a => ({ ...a, [q.id]: opt.toLowerCase() }))}
                                                            className={`px-6 py-2.5 rounded-xl border transition-all text-sm font-medium ${answers[q.id] === opt.toLowerCase()
                                                                    ? 'bg-emerald-500 border-emerald-400 text-white'
                                                                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                                                                }`}
                                                        >{opt}</button>
                                                    ))}
                                                </div>
                                            )}
                                            {q.question_type === 'multiple_choice' && (
                                                <div className="flex flex-col gap-2">
                                                    {(q.job_questionnaire_options || []).sort((a, b) => a.sort_order - b.sort_order).map(opt => (
                                                        <button
                                                            key={opt.id}
                                                            onClick={() => setAnswers(a => ({ ...a, [q.id]: opt.option_text }))}
                                                            className={`text-left px-4 py-2.5 rounded-xl border transition-all text-sm ${answers[q.id] === opt.option_text
                                                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                                                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                                                                }`}
                                                        >{opt.option_text}</button>
                                                    ))}
                                                </div>
                                            )}
                                            {q.question_type === 'scale' && (
                                                <div className="flex gap-2 flex-wrap">
                                                    {[1, 2, 3, 4, 5].map(n => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setAnswers(a => ({ ...a, [q.id]: String(n) }))}
                                                            className={`w-10 h-10 rounded-lg border text-sm font-bold transition-all ${answers[q.id] === String(n)
                                                                    ? 'bg-emerald-500 border-emerald-400 text-white'
                                                                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                                                                }`}
                                                        >{n}</button>
                                                    ))}
                                                    <span className="self-center text-slate-500 text-xs ml-1">1 = Muy bajo, 5 = Experto</span>
                                                </div>
                                            )}
                                            {(q.question_type === 'text' || q.question_type === 'number') && (
                                                <Input
                                                    type={q.question_type === 'number' ? 'number' : 'text'}
                                                    placeholder="Tu respuesta..."
                                                    value={answers[q.id] || ''}
                                                    onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                                                    className={`bg-white/5 border-white/10 text-white ${errors[q.id] ? 'border-red-500' : ''}`}
                                                />
                                            )}
                                            {errors[q.id] && <p className="text-red-400 text-xs">{errors[q.id]}</p>}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* STEP 3: Documentos */}
                        {step === 3 && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Upload className="h-5 w-5 text-emerald-400" />
                                    Carga de Documentos
                                </h2>
                                <p className="text-slate-400 text-sm">Sube tus documentos en formato PDF o imagen (JPG, PNG). Los documentos marcados con * son obligatorios.</p>
                                {REQUIRED_DOCS.map(doc => (
                                    <div key={doc.key} className={`border rounded-xl p-4 transition-all ${docFiles[doc.key] ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-white font-medium text-sm">{doc.label} {doc.required && <span className="text-red-400">*</span>}</p>
                                                {docFiles[doc.key] && <p className="text-emerald-400 text-xs mt-1">✓ {docFiles[doc.key].name}</p>}
                                                {errors[doc.key] && <p className="text-red-400 text-xs mt-1">{errors[doc.key]}</p>}
                                            </div>
                                            <button
                                                onClick={() => fileRefs.current[doc.key]?.click()}
                                                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm border border-white/10 transition-all flex items-center gap-2"
                                            >
                                                <Upload className="h-3.5 w-3.5" />
                                                {docFiles[doc.key] ? 'Cambiar' : 'Subir'}
                                            </button>
                                        </div>
                                        <input
                                            ref={el => fileRefs.current[doc.key] = el}
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                                            className="hidden"
                                            onChange={e => {
                                                const file = e.target.files[0];
                                                if (file) setDocFiles(prev => ({ ...prev, [doc.key]: file }));
                                            }}
                                        />
                                    </div>
                                ))}
                                <p className="text-slate-500 text-xs">Al enviar tu postulación, aceptas que tus datos sean usados únicamente para el proceso de selección de acuerdo a nuestro aviso de privacidad.</p>
                            </div>
                        )}

                        {/* STEP 4: Confirmación */}
                        {step === 4 && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                                <h2 className="text-xl font-bold text-white">Confirma tu postulación</h2>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-slate-400">Vacante</span><span className="text-white font-medium">{job.position_title}</span></div>
                                    <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-slate-400">Nombre</span><span className="text-white font-medium">{personal.full_name}</span></div>
                                    <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-slate-400">Teléfono</span><span className="text-white font-medium">{personal.phone}</span></div>
                                    {personal.email && <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-slate-400">Email</span><span className="text-white font-medium">{personal.email}</span></div>}
                                    <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-slate-400">Documentos</span><span className="text-white font-medium">{Object.keys(docFiles).length} archivo(s)</span></div>
                                    <div className="flex justify-between py-1.5"><span className="text-slate-400">Cuestionario</span><span className="text-white font-medium">{Object.keys(answers).length} respuestas</span></div>
                                </div>
                                {errors.submit && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
                                        <AlertCircle className="h-4 w-4 shrink-0" /> {errors.submit}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Navigation */}
                <div className="flex justify-between mt-6 gap-3">
                    {step > 0 ? (
                        <Button variant="outline" onClick={handleBack} className="border-white/10 text-white hover:bg-white/5">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Anterior
                        </Button>
                    ) : <div />}

                    {step < STEPS.length - 1 ? (
                        <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 ml-auto">
                            Siguiente <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    ) : (
                        <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 ml-auto min-w-[140px]">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" />Enviar Postulación</>}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
