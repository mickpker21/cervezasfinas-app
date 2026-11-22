// src/pages/rrhh/ApplicantDetailPage.jsx
// Vista completa de un candidato: datos, pipeline, documentos, estudio socioeconómico
import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    ArrowLeft, User, Phone, Mail, MapPin, FileText, AlertTriangle,
    CheckCircle2, Clock, MessageSquare, Download, ExternalLink, Loader2,
    ChevronRight, Activity, ClipboardList
} from 'lucide-react';

const PIPELINE_STAGES = [
    { key: 'nueva', label: 'Nueva' },
    { key: 'revisada', label: 'Revisada' },
    { key: 'preseleccionada', label: 'Preseleccionada' },
    { key: 'contactada', label: 'Contactada' },
    { key: 'entrevista_1', label: 'Entrevista 1' },
    { key: 'entrevista_2', label: 'Entrevista 2' },
    { key: 'estudio_socioeconomico', label: 'Estudio Socioeconómico' },
    { key: 'examen_medico', label: 'Examen Médico' },
    { key: 'oferta', label: 'Oferta' },
    { key: 'contratada', label: 'Contratad@' },
    { key: 'rechazada', label: 'Rechazad@' },
];

const STAGE_COLORS = {
    nueva: 'bg-blue-500', revisada: 'bg-slate-500', preseleccionada: 'bg-violet-500',
    contactada: 'bg-yellow-500', entrevista_1: 'bg-orange-500', entrevista_2: 'bg-orange-600',
    estudio_socioeconomico: 'bg-cyan-500', examen_medico: 'bg-pink-500',
    oferta: 'bg-emerald-400', contratada: 'bg-green-500', rechazada: 'bg-red-500',
};

function Section({ title, icon: Icon, children }) {
    return (
        <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
                <CardTitle className="text-white text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-emerald-400" /> {title}
                </CardTitle>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

function InfoRow({ label, value }) {
    return (
        <div className="flex gap-4 py-1.5 border-b border-white/5 last:border-0">
            <span className="text-slate-500 text-sm w-40 shrink-0">{label}</span>
            <span className="text-slate-200 text-sm break-all">{value || '—'}</span>
        </div>
    );
}

export default function ApplicantDetailPage() {
    const { applicantId } = useParams();
    const navigate = useNavigate();
    const { user } = useSupabaseAuth();

    const [app, setApp] = useState(null);
    const [answers, setAnswers] = useState([]);
    const [docs, setDocs] = useState([]);
    const [events, setEvents] = useState([]);
    const [socio, setSocio] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [newStatus, setNewStatus] = useState('');
    const [activeTab, setActiveTab] = useState('info');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [{ data: appData }, { data: answersData }, { data: docsData }, { data: eventsData }, { data: socioData }] = await Promise.all([
                supabase.from('job_applications').select('*, job_postings(position_title, area, description)').eq('id', applicantId).single(),
                supabase.from('job_application_answers').select('*').eq('application_id', applicantId).order('created_at'),
                supabase.from('job_application_documents').select('*').eq('application_id', applicantId),
                supabase.from('job_pipeline_events').select('*').eq('application_id', applicantId).order('created_at', { ascending: false }),
                supabase.from('job_socioeconomic_studies').select('*').eq('application_id', applicantId).maybeSingle()
            ]);
            setApp(appData);
            setAnswers(answersData || []);
            setDocs(docsData || []);
            setEvents(eventsData || []);
            setSocio(socioData);
            setNewStatus(appData?.pipeline_status || 'nueva');
        } catch (e) {
            console.error('[ApplicantDetailPage]', e);
        } finally {
            setLoading(false);
        }
    }, [applicantId]);

    useEffect(() => { load(); }, [load]);

    const handleStatusChange = async () => {
        if (!newStatus || newStatus === app?.pipeline_status) return;
        setSaving(true);
        try {
            const old = app.pipeline_status;
            await supabase.from('job_applications').update({ pipeline_status: newStatus, updated_at: new Date().toISOString() }).eq('id', applicantId);
            await supabase.from('job_pipeline_events').insert({
                application_id: applicantId,
                event_type: 'cambio_status',
                description: `Etapa cambiada de "${old}" a "${newStatus}"`,
                old_status: old,
                new_status: newStatus,
                created_by: user?.id,
            });
            await load();
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        setSaving(true);
        try {
            await supabase.from('job_pipeline_events').insert({
                application_id: applicantId,
                event_type: 'nota',
                description: noteText.trim(),
                created_by: user?.id,
            });
            setNoteText('');
            await load();
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    const handleReject = async () => {
        if (!confirm('¿Rechazar este candidato?')) return;
        setSaving(true);
        try {
            await supabase.from('job_applications').update({ pipeline_status: 'rechazada', is_disqualified: true, updated_at: new Date().toISOString() }).eq('id', applicantId);
            await supabase.from('job_pipeline_events').insert({
                application_id: applicantId, event_type: 'rechazo',
                description: 'Candidato rechazado por RRHH', new_status: 'rechazada', created_by: user?.id,
            });
            await load();
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-emerald-400 animate-spin" />
        </div>
    );

    if (!app) return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
            <p>Candidato no encontrado.</p>
            <Button variant="outline" onClick={() => navigate('/rrhh/recruitment')}>Regresar</Button>
        </div>
    );

    const stageColor = STAGE_COLORS[app.pipeline_status] || 'bg-slate-500';
    const TABS = [
        { key: 'info', label: 'Datos', icon: User },
        { key: 'answers', label: 'Cuestionario', icon: ClipboardList },
        { key: 'docs', label: 'Documentos', icon: FileText },
        { key: 'socio', label: 'Est. Socioeconómico', icon: Activity },
        { key: 'timeline', label: 'Historial', icon: Clock },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
            <Helmet><title>{app.full_name} | Candidato</title></Helmet>

            {/* Back */}
            <button onClick={() => navigate('/rrhh/recruitment')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors text-sm">
                <ArrowLeft className="h-4 w-4" /> Reclutamiento
            </button>

            {/* Header del candidato */}
            <div className="flex flex-col md:flex-row items-start justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-bold text-white">{app.full_name}</h1>
                        {app.is_disqualified && (
                            <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-full">
                                <AlertTriangle className="h-3 w-3" /> Descalificado
                            </span>
                        )}
                    </div>
                    <p className="text-slate-400">{app.job_postings?.position_title} · {app.job_postings?.area}</p>
                    <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-white text-xs font-medium ${stageColor}`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-white/70" />
                        {PIPELINE_STAGES.find(s => s.key === app.pipeline_status)?.label || app.pipeline_status}
                    </div>
                    {app.auto_score != null && (
                        <p className="text-slate-400 text-sm mt-1">Score: <span className={`font-bold ${app.auto_score >= 70 ? 'text-emerald-400' : app.auto_score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{app.auto_score}/100</span></p>
                    )}
                </div>

                {/* Pipeline actions */}
                <div className="flex flex-col gap-2 w-full md:w-auto min-w-[240px]">
                    <div className="flex gap-2">
                        <Select value={newStatus} onValueChange={setNewStatus}>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white flex-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PIPELINE_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button onClick={handleStatusChange} disabled={saving || newStatus === app.pipeline_status} size="sm" className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </Button>
                    </div>
                    {app.pipeline_status !== 'rechazada' && (
                        <Button onClick={handleReject} variant="outline" size="sm" disabled={saving} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                            <XCircle className="h-3.5 w-3.5 mr-1.5" /> Rechazar Candidato
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <tab.icon className="h-3.5 w-3.5" /> {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB: Datos */}
            {activeTab === 'info' && (
                <Section title="Datos Personales" icon={User}>
                    <InfoRow label="Nombre completo" value={app.full_name} />
                    <InfoRow label="Teléfono" value={app.phone} />
                    <InfoRow label="Email" value={app.email} />
                    <InfoRow label="CURP" value={app.curp} />
                    <InfoRow label="Edad" value={app.age ? `${app.age} años` : null} />
                    <InfoRow label="Ciudad" value={app.city} />
                    <InfoRow label="Postulado el" value={app.created_at ? format(new Date(app.created_at), "dd 'de' MMMM yyyy, HH:mm", { locale: es }) : null} />
                    {app.disqualification_reason && (
                        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">
                            <p className="font-semibold mb-1">Motivo de descalificación:</p>
                            <p>{app.disqualification_reason}</p>
                        </div>
                    )}
                </Section>
            )}

            {/* TAB: Cuestionario */}
            {activeTab === 'answers' && (
                <Section title="Respuestas del Cuestionario" icon={ClipboardList}>
                    {answers.length === 0 ? (
                        <p className="text-slate-400 text-sm">Sin respuestas registradas.</p>
                    ) : (
                        <div className="space-y-4">
                            {answers.map((a, i) => (
                                <div key={a.id} className="border-b border-white/5 pb-3 last:border-0">
                                    <p className="text-slate-400 text-xs mb-1">{i + 1}. {a.question_text}</p>
                                    <p className="text-white text-sm font-medium">{a.answer_text || '(sin respuesta)'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            )}

            {/* TAB: Documentos */}
            {activeTab === 'docs' && (
                <Section title="Documentos Adjuntos" icon={FileText}>
                    {docs.length === 0 ? (
                        <p className="text-slate-400 text-sm">No se han subido documentos.</p>
                    ) : (
                        <div className="space-y-3">
                            {docs.map(doc => (
                                <div key={doc.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                                    <div>
                                        <p className="text-white text-sm font-medium capitalize">{doc.document_type.replace(/_/g, ' ')}</p>
                                        <p className="text-slate-400 text-xs">{doc.document_name}</p>
                                    </div>
                                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            )}

            {/* TAB: Socioeconómico */}
            {activeTab === 'socio' && (
                <div className="space-y-4">
                    {!socio ? (
                        <Card className="bg-white/5 border-white/10 p-8 text-center">
                            <Activity className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                            <p className="text-slate-400 mb-4">Estudio socioeconómico aún no realizado.</p>
                            <Button onClick={() => navigate(`/rrhh/applicants/${applicantId}/socioeconomic`)} className="bg-emerald-600 hover:bg-emerald-700">
                                Iniciar Estudio
                            </Button>
                        </Card>
                    ) : (
                        <Section title="Estudio Socioeconómico" icon={Activity}>
                            {/* Sección 1: Datos generales */}
                            <h4 className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-2 mt-1">Datos Generales</h4>
                            <InfoRow label="Estado civil" value={socio.marital_status} />
                            <InfoRow label="Domicilio" value={socio.address} />
                            <InfoRow label="Tipo de vivienda" value={socio.address_type} />
                            <InfoRow label="Años en domicilio" value={socio.years_at_address} />
                            <h4 className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-2 mt-4">Composición Familiar</h4>
                            <InfoRow label="Personas en hogar" value={socio.household_members} />
                            <InfoRow label="Dependientes económicos" value={socio.dependents} />
                            <InfoRow label="¿Es jefe del hogar?" value={socio.is_breadwinner ? 'Sí' : 'No'} />
                            <h4 className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-2 mt-4">Situación Económica</h4>
                            <InfoRow label="Ingreso personal" value={socio.personal_income ? `$${Number(socio.personal_income).toLocaleString()}` : null} />
                            <InfoRow label="Ingreso familiar" value={socio.family_income ? `$${Number(socio.family_income).toLocaleString()}` : null} />
                            <InfoRow label="Gastos fijos" value={socio.monthly_expenses ? `$${Number(socio.monthly_expenses).toLocaleString()}` : null} />
                            <InfoRow label="Deudas activas" value={socio.has_active_debts ? `Sí — ${socio.debt_details || ''}` : 'No'} />
                            <InfoRow label="Cuenta bancaria" value={socio.has_bank_account ? 'Sí' : 'No'} />
                            <h4 className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-2 mt-4">Referencias</h4>
                            <InfoRow label="Ref. Familiar 1" value={socio.family_ref_1_name ? `${socio.family_ref_1_name} (${socio.family_ref_1_relation}) — ${socio.family_ref_1_phone}` : null} />
                            <InfoRow label="Ref. Familiar 2" value={socio.family_ref_2_name ? `${socio.family_ref_2_name} (${socio.family_ref_2_relation}) — ${socio.family_ref_2_phone}` : null} />
                            <InfoRow label="Ref. Laboral 1" value={socio.work_ref_1_name ? `${socio.work_ref_1_name} — ${socio.work_ref_1_company} — ${socio.work_ref_1_phone}` : null} />
                            <InfoRow label="Ref. Laboral 2" value={socio.work_ref_2_name ? `${socio.work_ref_2_name} — ${socio.work_ref_2_company} — ${socio.work_ref_2_phone}` : null} />
                            <h4 className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-2 mt-4">Antecedentes</h4>
                            <InfoRow label="Procesos legales" value={socio.has_legal_issues ? 'Sí' : 'No'} />
                            <InfoRow label="Condición de salud" value={socio.has_health_conditions ? `Sí — ${socio.health_condition_details || ''}` : 'No'} />
                            <InfoRow label="Último empleador" value={socio.last_employer} />
                            <InfoRow label="Motivo de salida" value={socio.reason_for_leaving} />
                        </Section>
                    )}
                </div>
            )}

            {/* TAB: Historial */}
            {activeTab === 'timeline' && (
                <div className="space-y-4">
                    {/* Agregar nota */}
                    <Card className="bg-white/5 border-white/10">
                        <CardContent className="pt-4">
                            <Label className="text-slate-300 text-sm mb-2 block">Agregar Nota / Evento</Label>
                            <div className="flex gap-2">
                                <Textarea
                                    placeholder="Escribe una nota, resultado de entrevista, observación..."
                                    value={noteText}
                                    onChange={e => setNoteText(e.target.value)}
                                    className="bg-white/5 border-white/10 text-white resize-none"
                                    rows={2}
                                />
                                <Button onClick={handleAddNote} disabled={saving || !noteText.trim()} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Timeline */}
                    {events.length === 0 ? (
                        <p className="text-slate-400 text-center py-8">Sin eventos registrados.</p>
                    ) : (
                        <div className="space-y-3">
                            {events.map(evt => (
                                <motion.div key={evt.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex gap-3 bg-white/5 border border-white/10 rounded-xl p-4"
                                >
                                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${evt.event_type === 'rechazo' ? 'bg-red-400' :
                                            evt.event_type === 'nota' ? 'bg-blue-400' :
                                                evt.event_type === 'cambio_status' ? 'bg-emerald-400' : 'bg-slate-500'
                                        }`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm">{evt.description}</p>
                                        <p className="text-slate-500 text-xs mt-1">
                                            {evt.created_at ? format(new Date(evt.created_at), "dd MMM yyyy, HH:mm", { locale: es }) : ''} · {evt.event_type}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Needed for the reject button
function XCircle({ className }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
        </svg>
    );
}
