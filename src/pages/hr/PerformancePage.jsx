import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Target, MessageSquare, Calendar, Smile, Plus, AlertCircle, CheckCircle2, Clock, Star, Award, Zap, ChevronRight } from 'lucide-react';

const DEMO_OKRS = [
  { id: 1, objective: 'Aumentar volumen ventas zona Sur', quarter: 'Q1', status: 'EN_PROCESO',
    key_results: [
      { description: 'Alcanzar 1,200 HL en enero', target: 1200, current: 980, unit: 'HL' },
      { description: 'Incorporar 15 clientes nuevos', target: 15, current: 11, unit: 'clientes' },
      { description: 'Mantener evaluación PDV > 85%', target: 85, current: 88, unit: '%' },
    ]},
  { id: 2, objective: 'Reducir rotación de personal', quarter: 'Q1', status: 'EN_RIESGO',
    key_results: [
      { description: 'Rotación < 5% mensual', target: 5, current: 7.2, unit: '%' },
      { description: 'Onboardings < 7 días', target: 7, current: 9, unit: 'días' },
    ]},
];

const DEMO_FEEDBACK = [
  { id: 1, from: 'Luis Hernández', to: 'Carlos Martínez', type: 'RECONOCIMIENTO', badge: '⭐', content: 'Excelente resultado, superó su meta por 15%!', date: '2024-01-22' },
  { id: 2, from: 'Ana Torres (RRHH)', to: 'Pedro López', type: 'FEEDBACK', content: 'Necesitas mejorar puntualidad en rutas', date: '2024-01-20' },
  { id: 3, from: 'Director Comercial', to: 'Equipo Oaxaca', type: 'RECONOCIMIENTO', badge: '🎯', content: 'Mejor resultado de toda la empresa este mes!', date: '2024-01-19' },
];

const DEMO_1ON1S = [
  { id: 1, participants: 'María González / Juan Pérez', date: '2024-02-15', status: 'PROGRAMADO', notes: 'Revisión de metas Q1 y bloqueos en zona Norte.' },
  { id: 2, participants: 'María González / Ana Torres', date: '2024-01-10', status: 'REALIZADO', notes: 'Feedback positivo sobre nuevo sistema de rutas.' }
];

const DEMO_CHECKINS = [
  { id: 1, date: '2024-01-26', mood: 4, achievements: 'Cierre de 3 nuevos clientes', blockers: 'Falta de stock de producto X' },
  { id: 2, date: '2024-01-19', mood: 5, achievements: 'Superé meta semanal por 10%', blockers: 'Ninguno' }
];

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.1 } },
  exit: { opacity: 0, y: -20 }
};

const cardVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3 } }
};

export default function PerformancePage() {
  const { user } = useSupabaseAuth();
  
  const [activeTab, setActiveTab] = useState('okrs');
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  
  const [okrs, setOkrs] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [oneOnOnes, setOneOnOnes] = useState([]);
  const [checkins, setCheckins] = useState([]);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    setIsDemo(false);
    try {
      const { data: okrData, error: okrError } = await supabase.from('hr_okrs').select('*, hr_okr_key_results(*)');
      
      if (okrError) {
        throw new Error("Tables likely do not exist yet");
      }
      
      setOkrs(okrData || []);
      
      const { data: feedData } = await supabase.from('hr_feedback').select('*').order('date', { ascending: false });
      setFeedback(feedData || []);

      const { data: oneOnOneData } = await supabase.from('hr_one_on_ones').select('*').order('date', { ascending: false });
      setOneOnOnes(oneOnOneData || []);

      const { data: checkinData } = await supabase.from('hr_checkins').select('*').order('date', { ascending: false });
      setCheckins(checkinData || []);
      
    } catch (err) {
      console.log('Using DEMO data for Performance Page:', err);
      setIsDemo(true);
      setOkrs(DEMO_OKRS);
      setFeedback(DEMO_FEEDBACK);
      setOneOnOnes(DEMO_1ON1S);
      setCheckins(DEMO_CHECKINS);
    } finally {
      setLoading(false);
    }
  };

  const renderProgressBar = (current, target, isRisk) => {
    const percentage = Math.min(100, Math.max(0, (current / target) * 100));
    return (
      <div className="w-full bg-slate-700 rounded-full h-2.5 mt-2 overflow-hidden">
        <motion.div 
          className={`h-2.5 rounded-full ${isRisk ? 'bg-red-500' : 'bg-emerald-500'}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-white p-6 pb-24">
      <motion.div 
        className="max-w-7xl mx-auto space-y-8"
        variants={pageVariants}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-violet-600 to-purple-700 p-8 shadow-2xl shadow-purple-900/20">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white tracking-tight">Performance & Feedback</h1>
                {isDemo && (
                  <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/50 hover:bg-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                    MODO DEMO
                  </Badge>
                )}
              </div>
              <p className="text-purple-100/80 max-w-xl">
                Gestión continua de desempeño. Alinea objetivos, da reconocimiento y mantén conversaciones significativas.
              </p>
            </div>
            <div className="flex gap-3">
              <Button className="bg-white/10 hover:bg-white/20 text-white border-0">
                Ver Mi Perfil
              </Button>
            </div>
          </div>
          <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10">
             <Target className="w-64 h-64" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"
            />
          </div>
        ) : (
          <Tabs defaultValue="okrs" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-[#2a2c44] border-b border-white/5 p-1 rounded-xl flex space-x-2">
              <TabsTrigger value="okrs" className="data-[state=active]:bg-[#1a1c2e] data-[state=active]:text-emerald-400 rounded-lg py-2.5 px-4 flex-1 md:flex-none flex items-center gap-2">
                <Target className="w-4 h-4" /> <span className="hidden md:inline">OKRs</span>
              </TabsTrigger>
              <TabsTrigger value="feedback" className="data-[state=active]:bg-[#1a1c2e] data-[state=active]:text-emerald-400 rounded-lg py-2.5 px-4 flex-1 md:flex-none flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> <span className="hidden md:inline">Feedback</span>
              </TabsTrigger>
              <TabsTrigger value="oneonones" className="data-[state=active]:bg-[#1a1c2e] data-[state=active]:text-emerald-400 rounded-lg py-2.5 px-4 flex-1 md:flex-none flex items-center gap-2">
                <Calendar className="w-4 h-4" /> <span className="hidden md:inline">One-on-Ones</span>
              </TabsTrigger>
              <TabsTrigger value="checkins" className="data-[state=active]:bg-[#1a1c2e] data-[state=active]:text-emerald-400 rounded-lg py-2.5 px-4 flex-1 md:flex-none flex items-center gap-2">
                <Smile className="w-4 h-4" /> <span className="hidden md:inline">Check-ins</span>
              </TabsTrigger>
            </TabsList>

            {/* OKRs Tab */}
            <TabsContent value="okrs" className="mt-6 space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <select className="bg-[#2a2c44] border border-white/10 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5">
                    <option>Q1 2024</option>
                    <option>Q2 2024</option>
                    <option>Q3 2024</option>
                    <option>Q4 2024</option>
                  </select>
                </div>
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                  <Plus className="w-4 h-4 mr-2" /> Agregar OKR
                </Button>
              </div>

              <AnimatePresence>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {okrs.map((okr, index) => (
                    <motion.div key={okr.id} variants={cardVariants} initial="initial" animate="animate" exit="exit" custom={index}>
                      <Card className="bg-[#2a2c44] border-0 shadow-lg h-full border-t-2 border-t-transparent hover:border-t-emerald-500 transition-colors">
                        <CardHeader className="pb-3 flex flex-row justify-between items-start">
                          <div>
                            <Badge className="bg-purple-500/20 text-purple-400 mb-2">{okr.quarter}</Badge>
                            <CardTitle className="text-lg text-white leading-tight">{okr.objective}</CardTitle>
                          </div>
                          {okr.status === 'EN_RIESGO' ? (
                            <Badge variant="destructive" className="bg-red-500/20 text-red-400 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> En Riesgo
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {okr.status.replace('_', ' ')}
                            </Badge>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4 mt-2">
                            {okr.key_results?.map((kr, idx) => {
                              const isRisk = okr.status === 'EN_RIESGO' && (kr.current / kr.target) < 0.6;
                              return (
                                <div key={idx} className="bg-[#1a1c2e] rounded-lg p-3">
                                  <div className="flex justify-between text-sm mb-1">
                                    <span className="text-white/80">{kr.description}</span>
                                    <span className="text-emerald-400 font-medium">
                                      {kr.current} / {kr.target} {kr.unit}
                                    </span>
                                  </div>
                                  {renderProgressBar(kr.current, kr.target, isRisk)}
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            </TabsContent>

            {/* Feedback Tab */}
            <TabsContent value="feedback" className="mt-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">Muro de Reconocimiento</h2>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Star className="w-4 h-4 mr-2" /> Dar Feedback
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {feedback.map((item, index) => (
                  <motion.div key={item.id || index} variants={cardVariants} initial="initial" animate="animate">
                    <Card className="bg-[#2a2c44] border-0 shadow-lg relative overflow-hidden group">
                      <div className={`absolute top-0 left-0 w-1 h-full ${item.type === 'RECONOCIMIENTO' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                              {item.from.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{item.from}</p>
                              <p className="text-xs text-white/50">{item.date}</p>
                            </div>
                          </div>
                          {item.badge && <span className="text-2xl" title={item.type}>{item.badge}</span>}
                        </div>
                        
                        <div className="bg-[#1a1c2e] rounded-lg p-4 mb-4">
                          <p className="text-white/90 text-sm">"{item.content}"</p>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-white/60">
                          <span>Para:</span>
                          <span className="text-emerald-400">{item.to}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </TabsContent>

            {/* One on Ones Tab */}
            <TabsContent value="oneonones" className="mt-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">Mis One-on-Ones</h2>
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                  <Calendar className="w-4 h-4 mr-2" /> Programar
                </Button>
              </div>

              <div className="bg-[#2a2c44] rounded-xl overflow-hidden border border-white/5">
                <div className="divide-y divide-white/10">
                  {oneOnOnes.map((session, i) => (
                    <motion.div 
                      key={session.id || i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${session.status === 'PROGRAMADO' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {session.status === 'PROGRAMADO' ? <Clock className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="text-white font-medium">{session.participants}</h4>
                          <p className="text-sm text-white/60 mt-1">{session.date} • {session.status}</p>
                        </div>
                      </div>
                      <div className="flex-1 max-w-md bg-[#1a1c2e] p-3 rounded-lg">
                        <p className="text-sm text-white/80 line-clamp-2">{session.notes}</p>
                      </div>
                      <Button variant="ghost" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 self-start md:self-center">
                        Ver Detalles <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Check-ins Tab */}
            <TabsContent value="checkins" className="mt-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-4">
                  <Card className="bg-[#2a2c44] border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-lg text-white">Check-in Semanal</CardTitle>
                      <CardDescription className="text-white/60">¿Cómo te sientes esta semana?</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <label className="text-sm text-white/80 mb-3 block">1. Tu ánimo</label>
                        <div className="flex justify-between">
                          {[1, 2, 3, 4, 5].map((mood) => (
                            <motion.button 
                              key={mood}
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                              className="text-3xl grayscale hover:grayscale-0 transition-all focus:grayscale-0 focus:scale-125"
                            >
                              {mood === 1 ? '😫' : mood === 2 ? '😕' : mood === 3 ? '😐' : mood === 4 ? '🙂' : '🤩'}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-white/80 mb-2 block">2. Mayor logro de la semana</label>
                        <textarea className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg p-3 text-white text-sm focus:ring-emerald-500 focus:border-emerald-500" rows={2} placeholder="Escribe aquí..."></textarea>
                      </div>
                      <div>
                        <label className="text-sm text-white/80 mb-2 block">3. ¿Algún bloqueador?</label>
                        <textarea className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg p-3 text-white text-sm focus:ring-emerald-500 focus:border-emerald-500" rows={2} placeholder="Escribe aquí..."></textarea>
                      </div>
                      <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                        Enviar Check-in
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-2">
                  <h3 className="text-lg font-medium text-white mb-4">Historial Reciente</h3>
                  <div className="space-y-4">
                    {checkins.map((checkin, i) => (
                      <motion.div 
                        key={checkin.id || i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-[#2a2c44] p-5 rounded-xl border border-white/5 flex flex-col md:flex-row gap-6"
                      >
                        <div className="flex flex-col items-center justify-center min-w-[80px] bg-[#1a1c2e] p-3 rounded-lg">
                          <span className="text-4xl">
                            {checkin.mood === 1 ? '😫' : checkin.mood === 2 ? '😕' : checkin.mood === 3 ? '😐' : checkin.mood === 4 ? '🙂' : '🤩'}
                          </span>
                          <span className="text-xs text-white/50 mt-2">{checkin.date}</span>
                        </div>
                        <div className="flex-1 space-y-3">
                          <div>
                            <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider mb-1">Logro</p>
                            <p className="text-sm text-white/90">{checkin.achievements}</p>
                          </div>
                          <div>
                            <p className="text-xs text-orange-400 font-medium uppercase tracking-wider mb-1">Bloqueador</p>
                            <p className="text-sm text-white/80">{checkin.blockers}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

          </Tabs>
        )}
      </motion.div>
    </div>
  );
}
