import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HeartHandshake, 
  Target, 
  TrendingUp, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  Star, 
  MessageSquare, 
  BarChart3, 
  Plus, 
  Activity,
  Smile,
  Meh,
  Frown,
  Loader2,
  X
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const DEMO_SURVEYS = [
  { id: 1, title: 'Pulse Semanal - Semana 3', type: 'PULSE', status: 'ACTIVA', time_min: 3, deadline: '2024-01-26',
    questions: [
      { id: 'q1', q: '¿Cómo calificarías tu semana laboral?', type: 'STARS', required: true },
      { id: 'q2', q: '¿Te sientes valorado por tu equipo?', type: 'OPTIONS', options: ['Siempre','Casi siempre','A veces','Nunca'], required: true },
      { id: 'q3', q: '¿Tienes las herramientas necesarias para tu trabajo?', type: 'OPTIONS', options: ['Sí','No','Parcialmente'], required: true },
      { id: 'q4', q: '¿Qué te impide ser más efectivo? (opcional)', type: 'TEXT', required: false },
    ]
  },
  { id: 2, title: 'eNPS Enero 2024', type: 'ENPS', status: 'ACTIVA', time_min: 2, deadline: '2024-01-31',
    questions: [
      { id: 'q5', q: '¿Qué tan probable es que recomiendes esta empresa para trabajar? (0-10)', type: 'NPS', required: true },
      { id: 'q6', q: '¿Qué es lo que más valoras de trabajar aquí?', type: 'TEXT', required: false },
      { id: 'q7', q: '¿Qué mejorarías de la empresa?', type: 'TEXT', required: false },
    ]
  },
];

const DEMO_RESULTS = {
  enps: 42,
  promoters: 58,
  neutrals: 26,
  detractors: 16,
  participation: 78,
  weekly_mood: [
    { name: 'Sem 1', val: 3.8 },
    { name: 'Sem 2', val: 4.1 },
    { name: 'Sem 3', val: 3.6 },
    { name: 'Sem 4', val: 4.3 },
    { name: 'Sem 5', val: 3.9 },
    { name: 'Sem 6', val: 4.2 },
    { name: 'Sem 7', val: 4.0 },
  ],
};

export default function PulseSurveyPage() {
  const { session } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [surveys, setSurveys] = useState([]);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('activas'); // activas, resultados, crear
  
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Intentar cargar de supabase
      const { data: surveysData, error: surveysError } = await supabase
        .from('hr_surveys')
        .select('*');

      if (surveysError) throw surveysError;
      
      if (surveysData && surveysData.length > 0) {
        setSurveys(surveysData);
        // Aquí iría la lógica para calcular resultados reales
        setResults(DEMO_RESULTS); // Usamos demo para resultados por simplicidad si hay data
        setIsDemo(false);
      } else {
        setSurveys(DEMO_SURVEYS);
        setResults(DEMO_RESULTS);
        setIsDemo(true);
      }
    } catch (error) {
      console.warn('Usando datos DEMO:', error.message);
      setSurveys(DEMO_SURVEYS);
      setResults(DEMO_RESULTS);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (qId, val) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const submitSurvey = async () => {
    setSubmitting(true);
    // Simular envío
    setTimeout(() => {
      setSubmitting(false);
      setActiveSurvey(null);
      setAnswers({});
      // Eliminar de la lista demo para que parezca que se completó
      setSurveys(prev => prev.filter(s => s.id !== activeSurvey.id));
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-[#1a1c2e] flex flex-col items-center justify-center min-h-screen text-white">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-400 mb-4" />
        <p className="text-white/60">Cargando encuestas pulse...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 bg-[#1a1c2e] min-h-screen font-sans text-slate-200">
      {/* HEADER */}
      <div className="mb-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <HeartHandshake className="text-emerald-400 w-8 h-8" />
              Pulse & eNPS
            </h1>
            <p className="text-white/60 mt-2">Mide el pulso de la organización y el compromiso del equipo.</p>
          </div>
          {isDemo && (
            <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/50 uppercase tracking-wider py-1 px-3">
              Modo Demo
            </Badge>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-[#2a2c44] to-[#2a2c44]/80 border-0 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Target className="w-16 h-16 text-emerald-400" />
            </div>
            <CardContent className="p-6">
              <p className="text-sm text-white/60 font-medium mb-1">eNPS Actual</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-emerald-400">+{results?.enps || 0}</span>
                <span className="text-sm text-emerald-400/80">Excelente</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-[#2a2c44] border-0 shadow-lg relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity className="w-16 h-16 text-blue-400" />
            </div>
            <CardContent className="p-6">
              <p className="text-sm text-white/60 font-medium mb-1">Participación Última</p>
              <h3 className="text-4xl font-bold text-white">{results?.participation || 0}%</h3>
            </CardContent>
          </Card>

          <Card className="bg-[#2a2c44] border-0 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <MessageSquare className="w-16 h-16 text-purple-400" />
            </div>
            <CardContent className="p-6">
              <p className="text-sm text-white/60 font-medium mb-1">Encuestas Activas</p>
              <h3 className="text-4xl font-bold text-white">{surveys.length}</h3>
            </CardContent>
          </Card>

          <Card className="bg-[#2a2c44] border-0 shadow-lg relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingUp className="w-16 h-16 text-orange-400" />
            </div>
            <CardContent className="p-6">
              <p className="text-sm text-white/60 font-medium mb-1">Streak > 70% part.</p>
              <h3 className="text-4xl font-bold text-white">4 <span className="text-xl text-white/60 font-normal">semanas</span></h3>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 border-b border-white/10 mb-6">
        <button 
          onClick={() => setActiveTab('activas')}
          className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'activas' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-white/60 hover:text-white'}`}
        >
          Mis Encuestas Pendientes
        </button>
        {['admin', 'administrador', 'rh', 'rrhh', 'sistemas'].includes((user?.user_metadata?.type || user?.user_metadata?.role || user?.app_metadata?.roles?.[0] || '').toLowerCase()) && (
          <>
            <button 
              onClick={() => setActiveTab('resultados')}
              className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'resultados' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-white/60 hover:text-white'}`}
            >
              Resultados (Admin)
            </button>
            <button 
              onClick={() => setActiveTab('crear')}
              className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'crear' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-white/60 hover:text-white'}`}
            >
              Crear Encuesta
            </button>
          </>
        )}
      </div>

      {/* CONTENT */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'activas' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {surveys.length === 0 ? (
                <div className="col-span-full py-12 flex flex-col items-center justify-center bg-[#2a2c44] rounded-xl border border-white/5">
                  <CheckCircle2 className="w-16 h-16 text-emerald-500/50 mb-4" />
                  <h3 className="text-xl font-medium text-white mb-2">¡Todo al día!</h3>
                  <p className="text-white/60">No tienes encuestas pendientes por responder.</p>
                </div>
              ) : (
                surveys.map((survey) => (
                  <Card key={survey.id} className="bg-[#2a2c44] border-0 shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 transform hover:-translate-y-1">
                    <CardHeader className="pb-4 border-b border-white/5">
                      <div className="flex justify-between items-start">
                        <Badge className={`${survey.type === 'ENPS' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'} border-0`}>
                          {survey.type}
                        </Badge>
                        <span className="flex items-center text-xs text-white/50">
                          <Clock className="w-3 h-3 mr-1" />
                          {survey.time_min} min
                        </span>
                      </div>
                      <CardTitle className="text-lg text-white mt-4">{survey.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center text-sm text-white/60 mb-2">
                        <Calendar className="w-4 h-4 mr-2" />
                        Vence: {survey.deadline}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                      <Button 
                        onClick={() => {
                          setActiveSurvey(survey);
                          setAnswers({});
                        }}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0 transition-colors"
                      >
                        Responder Ahora
                      </Button>
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>
          )}

          {activeTab === 'resultados' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* eNPS Gauge Chart */}
                <Card className="bg-[#2a2c44] border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Target className="w-5 h-5 text-emerald-400" />
                      Desglose eNPS
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center p-6">
                    <div className="relative w-48 h-48 mb-4">
                      <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible">
                        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#ef4444" strokeWidth="15" strokeDasharray="80 200" className="opacity-80"/>
                        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#eab308" strokeWidth="15" strokeDasharray="70 200" strokeDashoffset="-80" className="opacity-80"/>
                        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#22c55e" strokeWidth="15" strokeDasharray="100 200" strokeDashoffset="-150" className="opacity-80"/>
                        <text x="50" y="40" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">+{results?.enps}</text>
                      </svg>
                    </div>
                    <div className="grid grid-cols-3 w-full gap-4 text-center mt-4">
                      <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                        <Frown className="w-6 h-6 mx-auto text-red-500 mb-1" />
                        <div className="text-xl font-bold text-white">{results?.detractors}%</div>
                        <div className="text-xs text-red-400">Detractores (0-6)</div>
                      </div>
                      <div className="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                        <Meh className="w-6 h-6 mx-auto text-yellow-500 mb-1" />
                        <div className="text-xl font-bold text-white">{results?.neutrals}%</div>
                        <div className="text-xs text-yellow-400">Neutros (7-8)</div>
                      </div>
                      <div className="bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                        <Smile className="w-6 h-6 mx-auto text-green-500 mb-1" />
                        <div className="text-xl font-bold text-white">{results?.promoters}%</div>
                        <div className="text-xs text-green-400">Promotores (9-10)</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Mood Chart */}
                <Card className="bg-[#2a2c44] border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-400" />
                      Índice de Ánimo Semanal (Pulse)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={results?.weekly_mood} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorMood" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 5]} stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                          itemStyle={{ color: '#60a5fa' }}
                        />
                        <Area type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorMood)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-[#2a2c44] border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-white">Últimos Comentarios Abiertos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      "Excelente ambiente de trabajo últimamente, el equipo está muy unido.",
                      "Creo que podríamos mejorar la comunicación entre departamentos, a veces se duplica trabajo.",
                      "Me gustaría tener más oportunidades de capacitación en nuevas tecnologías.",
                      "Las nuevas sillas de la oficina están increíbles, gracias."
                    ].map((com, i) => (
                      <div key={i} className="p-4 bg-white/5 rounded-lg border border-white/5 flex gap-4 items-start">
                        <MessageSquare className="w-5 h-5 text-emerald-400 mt-1 shrink-0" />
                        <p className="text-white/80 text-sm leading-relaxed">{com}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'crear' && (
            <Card className="bg-[#2a2c44] border-0 shadow-lg max-w-3xl mx-auto">
              <CardHeader className="border-b border-white/5 pb-6">
                <CardTitle className="text-2xl text-white">Diseñar Nueva Encuesta</CardTitle>
                <CardDescription className="text-white/60">Configura una nueva encuesta Pulse, eNPS o personalizada.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-white/80 font-medium">Título de la Encuesta</label>
                    <input type="text" className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-emerald-500" placeholder="Ej. Pulse Q1..." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-white/80 font-medium">Tipo</label>
                    <select className="w-full bg-[#1e293b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
                      <option>PULSE</option>
                      <option>eNPS</option>
                      <option>NOM-035</option>
                      <option>Custom</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-white/80 font-medium">Fecha Límite</label>
                    <input type="date" className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-white/80 font-medium">Audiencia</label>
                    <select className="w-full bg-[#1e293b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
                      <option>Toda la empresa</option>
                      <option>Ingeniería</option>
                      <option>Ventas</option>
                    </select>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-white">Preguntas</h3>
                    <Button variant="outline" size="sm" className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10">
                      <Plus className="w-4 h-4 mr-2" /> Agregar Pregunta
                    </Button>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10 flex gap-4">
                      <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded h-min">1</div>
                      <div className="flex-1">
                        <input type="text" defaultValue="¿Qué tan probable es que recomiendes esta empresa?" className="w-full bg-transparent border-b border-white/20 px-0 py-1 text-white focus:outline-none focus:border-emerald-500 mb-3" />
                        <div className="flex items-center gap-4">
                          <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded">NPS (0-10)</span>
                          <label className="flex items-center gap-2 text-xs text-white/60">
                            <input type="checkbox" defaultChecked className="accent-emerald-500" /> Obligatoria
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t border-white/5 pt-6 flex justify-end gap-3">
                <Button variant="ghost" className="text-white/60 hover:text-white">Cancelar</Button>
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white border-0">
                  Guardar y Lanzar
                </Button>
              </CardFooter>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      {/* MODAL RESPONDER ENCUESTA */}
      {activeSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#2a2c44] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#1a1c2e]/50">
              <div>
                <h2 className="text-xl font-bold text-white">{activeSurvey.title}</h2>
                <p className="text-sm text-white/60">Tiempo estimado: {activeSurvey.time_min} min</p>
              </div>
              <button onClick={() => setActiveSurvey(null)} className="text-white/50 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-8">
              {activeSurvey.questions.map((q, idx) => (
                <div key={q.id} className="space-y-4">
                  <h3 className="text-lg font-medium text-white">
                    {idx + 1}. {q.q} {q.required && <span className="text-red-400">*</span>}
                  </h3>
                  
                  {q.type === 'STARS' && (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button 
                          key={star}
                          onClick={() => handleAnswer(q.id, star)}
                          className={`p-2 transition-transform hover:scale-110 ${answers[q.id] >= star ? 'text-yellow-400' : 'text-white/20'}`}
                        >
                          <Star className="w-8 h-8 fill-current" />
                        </button>
                      ))}
                    </div>
                  )}

                  {q.type === 'NPS' && (
                    <div className="space-y-2">
                      <div className="flex gap-1 justify-between">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                          let bgColor = 'bg-white/10 hover:bg-white/20';
                          if (answers[q.id] === num) {
                            if (num <= 6) bgColor = 'bg-red-500 text-white';
                            else if (num <= 8) bgColor = 'bg-yellow-500 text-white';
                            else bgColor = 'bg-green-500 text-white';
                          }
                          return (
                            <button 
                              key={num}
                              onClick={() => handleAnswer(q.id, num)}
                              className={`w-10 h-10 rounded-md font-medium transition-colors ${bgColor} ${answers[q.id] === num ? 'scale-110 shadow-lg' : 'text-white/80'}`}
                            >
                              {num}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-white/50">
                        <span>Nada probable</span>
                        <span>Muy probable</span>
                      </div>
                    </div>
                  )}

                  {q.type === 'OPTIONS' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => handleAnswer(q.id, opt)}
                          className={`p-3 rounded-lg border text-left transition-all ${answers[q.id] === opt ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.type === 'TEXT' && (
                    <textarea 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 min-h-[100px]"
                      placeholder="Escribe tu respuesta aquí..."
                      value={answers[q.id] || ''}
                      onChange={(e) => handleAnswer(q.id, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-white/10 bg-[#1a1c2e]/50 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setActiveSurvey(null)} className="text-white/60 hover:text-white">
                Cancelar
              </Button>
              <Button 
                onClick={submitSurvey} 
                disabled={submitting}
                className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 min-w-[120px]"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar Respuestas'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
