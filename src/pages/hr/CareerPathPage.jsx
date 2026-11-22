import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  TrendingUp,
  Map,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Star,
  Award,
  Clock,
  ArrowDown,
  Info,
  Building
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const CAREER_TRACKS = [
  {
    id: 'comercial', name: 'Track Comercial', icon: '📊',
    color: 'from-emerald-500 to-teal-600',
    levels: [
      { level: 1, title: 'Promotor de Ventas', salary_min: 8000, salary_max: 10000, years: 0,
        skills: ['Conocimiento de Producto', 'Servicio al Cliente'], certs: [], min_perf: null },
      { level: 2, title: 'Vendedor Jr.', salary_min: 11000, salary_max: 14000, years: 1,
        skills: ['Manejo de Autoventa', 'Técnicas de Venta', 'Licencia Tipo B'], certs: ['DC-3'], min_perf: 70 },
      { level: 3, title: 'Vendedor Sr.', salary_min: 15000, salary_max: 20000, years: 2,
        skills: ['Negociación', 'Liderazgo básico', 'Excel Básico'], certs: ['DC-3'], min_perf: 80 },
      { level: 4, title: 'Supervisor de Ruta', salary_min: 18000, salary_max: 25000, years: 4,
        skills: ['Liderazgo', 'Excel Avanzado', 'Trabajo en Equipo'], certs: ['DC-3', 'Liderazgo'], min_perf: 85 },
      { level: 5, title: 'Gerente Comercial', salary_min: 25000, salary_max: 40000, years: 6,
        skills: ['Liderazgo avanzado', 'Power BI', 'Gestión de equipos'], certs: ['Diplomado Comercial'], min_perf: 90 },
      { level: 6, title: 'Director Comercial', salary_min: 45000, salary_max: 80000, years: 10,
        skills: ['Estrategia', 'Presupuestos', 'Inglés Avanzado'], certs: ['MBA o equivalente'], min_perf: 95 },
    ]
  },
  {
    id: 'logistico', name: 'Track Logístico', icon: '🚚',
    color: 'from-blue-500 to-cyan-600',
    levels: [
      { level: 1, title: 'Auxiliar de Almacén', salary_min: 7000, salary_max: 9000, years: 0, skills: ['Trabajo en Equipo'], certs: [], min_perf: null },
      { level: 2, title: 'Almacenista', salary_min: 9000, salary_max: 12000, years: 1, skills: ['Montacargas', 'Excel Básico'], certs: ['Montacargas'], min_perf: 75 },
      { level: 3, title: 'Auxiliar Logístico', salary_min: 12000, salary_max: 16000, years: 2, skills: ['ERP', 'Excel Avanzado'], certs: ['DC-3'], min_perf: 80 },
      { level: 4, title: 'Jefe de Almacén', salary_min: 16000, salary_max: 22000, years: 4, skills: ['Liderazgo', 'ERP'], certs: [], min_perf: 85 },
      { level: 5, title: 'Coordinador Logístico', salary_min: 22000, salary_max: 35000, years: 6, skills: ['Power BI', 'Gestión Inventarios'], certs: [], min_perf: 90 },
    ]
  },
  {
    id: 'administrativo', name: 'Track Administrativo', icon: '🏢',
    color: 'from-violet-500 to-purple-600',
    levels: [
      { level: 1, title: 'Aux. Administrativo', salary_min: 8000, salary_max: 10000, years: 0, skills: ['Excel Básico'], certs: [], min_perf: null },
      { level: 2, title: 'Analista', salary_min: 12000, salary_max: 16000, years: 1, skills: ['Excel Avanzado', 'ERP'], certs: [], min_perf: 75 },
      { level: 3, title: 'Coordinador', salary_min: 16000, salary_max: 22000, years: 3, skills: ['Liderazgo', 'Power BI'], certs: [], min_perf: 80 },
      { level: 4, title: 'Gerente Administrativo', salary_min: 25000, salary_max: 40000, years: 6, skills: ['Estrategia', 'Presupuestos'], certs: [], min_perf: 85 },
    ]
  },
];

const mockUserStats = {
  years: 1.5,
  skills: ['Conocimiento de Producto', 'Servicio al Cliente', 'Manejo de Autoventa', 'Técnicas de Venta', 'Excel Básico'],
  certs: ['DC-3'],
  perf: 82
};

export default function CareerPathPage() {
  const { user } = useSupabaseAuth();
  const [activeTab, setActiveTab] = useState('miruta');
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  
  // Track assigned to user (mocking logic)
  const currentTrackId = 'comercial';
  const currentLevelIndex = 1; // 0-based, so level 2 (Vendedor Jr.)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Attempt to fetch something just to check DB connection
        const { data, error } = await supabase.from('profiles').select('*').limit(5);
        if (error) throw error;
        setEmployees(data || []);
      } catch (err) {
        console.warn('DB Error, using demo mode', err);
        setIsDemo(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatCurrency = (val) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

  const calculateProgress = (levelReq, stats) => {
    let total = 0;
    let met = 0;
    
    // Years
    total++;
    if (stats.years >= levelReq.years) met++;
    
    // Perf
    if (levelReq.min_perf !== null) {
      total++;
      if (stats.perf >= levelReq.min_perf) met++;
    }
    
    // Skills
    levelReq.skills.forEach(s => {
      total++;
      if (stats.skills.includes(s)) met++;
    });
    
    // Certs
    levelReq.certs.forEach(c => {
      total++;
      if (stats.certs.includes(c)) met++;
    });
    
    return Math.round((met / total) * 100) || 0;
  };

  const renderMyRoute = () => {
    const track = CAREER_TRACKS.find(t => t.id === currentTrackId);
    if (!track) return null;

    return (
      <div className="space-y-6">
        <div className="bg-[#2a2c44] rounded-xl p-6 shadow-lg border border-white/5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
                Mi Ruta de Crecimiento: {track.name}
              </h2>
              <p className="text-white/60 mt-1">Sigue tu progreso y descubre qué necesitas para el siguiente nivel.</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-white/60">Posición Actual</div>
              <div className="text-lg font-bold text-emerald-400">{track.levels[currentLevelIndex].title}</div>
            </div>
          </div>
        </div>

        <div className="relative py-8">
          {/* Vertical line connecting boxes */}
          <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-1 bg-white/10 -translate-x-1/2 rounded-full hidden md:block"></div>
          <div className="absolute left-8 top-0 bottom-0 w-1 bg-white/10 rounded-full md:hidden"></div>

          <div className="space-y-8 relative">
            {track.levels.map((level, idx) => {
              const status = idx < currentLevelIndex ? 'completed' 
                           : idx === currentLevelIndex ? 'current'
                           : idx === currentLevelIndex + 1 ? 'next'
                           : 'future';
              
              const isLeft = idx % 2 === 0;

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={level.level}
                  className={`flex flex-col md:flex-row items-center gap-6 w-full ${isLeft ? 'md:flex-row-reverse' : ''}`}
                >
                  {/* Spacer for alternating layout on desktop */}
                  <div className="hidden md:block md:w-1/2"></div>
                  
                  {/* Center Node */}
                  <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full border-4 shadow-xl shrink-0 absolute md:static left-0 md:translate-x-0 ${
                    status === 'completed' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' :
                    status === 'current' ? 'bg-[#2a2c44] border-emerald-400 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]' :
                    status === 'next' ? 'bg-[#2a2c44] border-blue-400 text-blue-400' :
                    'bg-[#2a2c44] border-white/20 text-white/40'
                  }`}>
                    {status === 'completed' ? <CheckCircle2 className="w-8 h-8" /> : <span className="text-xl font-bold">{level.level}</span>}
                  </div>

                  {/* Card content */}
                  <Card className={`w-full md:w-1/2 ml-16 md:ml-0 bg-[#2a2c44] border-0 shadow-lg relative ${
                    status === 'current' ? 'ring-2 ring-emerald-500/50' : 
                    status === 'completed' ? 'opacity-70' :
                    status === 'future' ? 'opacity-50 grayscale-[50%]' : ''
                  }`}>
                    {status === 'current' && (
                      <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-500 text-xs font-bold rounded-bl-lg rounded-tr-lg">ACTUAL</div>
                    )}
                    {status === 'next' && (
                      <div className="absolute top-0 right-0 px-3 py-1 bg-blue-500 text-xs font-bold rounded-bl-lg rounded-tr-lg">SIGUIENTE META</div>
                    )}
                    
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xl text-white">{level.title}</CardTitle>
                      <CardDescription className="text-white/60">
                        {formatCurrency(level.salary_min)} - {formatCurrency(level.salary_max)}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="space-y-4">
                        {status === 'next' && (
                          <div className="mb-4">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-white/80">Progreso para promoción</span>
                              <span className="text-emerald-400 font-bold">{calculateProgress(level, mockUserStats)}%</span>
                            </div>
                            <Progress value={calculateProgress(level, mockUserStats)} className="h-2 bg-black/40" indicatorClassName="bg-emerald-500" />
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div>
                            <h4 className="text-white/50 mb-2 flex items-center gap-1"><Clock className="w-4 h-4"/> Experiencia</h4>
                            <div className="flex items-center gap-2">
                              {status === 'next' ? (
                                mockUserStats.years >= level.years ? <CheckCircle2 className="w-4 h-4 text-emerald-500"/> : <XCircle className="w-4 h-4 text-red-400"/>
                              ) : null}
                              <span className="text-white/80">{level.years} {level.years === 1 ? 'año' : 'años'}</span>
                            </div>
                          </div>
                          
                          {level.min_perf && (
                            <div>
                              <h4 className="text-white/50 mb-2 flex items-center gap-1"><Star className="w-4 h-4"/> Eval. Desempeño</h4>
                              <div className="flex items-center gap-2">
                                {status === 'next' ? (
                                  mockUserStats.perf >= level.min_perf ? <CheckCircle2 className="w-4 h-4 text-emerald-500"/> : <XCircle className="w-4 h-4 text-red-400"/>
                                ) : null}
                                <span className="text-white/80">Mínimo {level.min_perf}%</span>
                              </div>
                            </div>
                          )}

                          <div className="sm:col-span-2">
                            <h4 className="text-white/50 mb-2 flex items-center gap-1"><Briefcase className="w-4 h-4"/> Habilidades Requeridas</h4>
                            <div className="flex flex-wrap gap-2">
                              {level.skills.map(s => {
                                const hasSkill = mockUserStats.skills.includes(s);
                                return (
                                  <Badge key={s} variant="outline" className={`${
                                    status === 'next' ? (hasSkill ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400') : 'border-white/10 text-white/70'
                                  } bg-black/20`}>
                                    {s}
                                  </Badge>
                                )
                              })}
                            </div>
                          </div>

                          {level.certs.length > 0 && (
                            <div className="sm:col-span-2">
                              <h4 className="text-white/50 mb-2 flex items-center gap-1"><Award className="w-4 h-4"/> Certificaciones</h4>
                              <div className="flex flex-wrap gap-2">
                                {level.certs.map(c => {
                                  const hasCert = mockUserStats.certs.includes(c);
                                  return (
                                    <Badge key={c} variant="outline" className={`${
                                      status === 'next' ? (hasCert ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400') : 'border-white/10 text-white/70'
                                    } bg-black/20`}>
                                      {c}
                                    </Badge>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                    {status === 'next' && (
                      <CardFooter className="bg-white/5 pt-4">
                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2">
                          <Info className="w-4 h-4" /> Ver Gap Analysis Detallado
                        </Button>
                      </CardFooter>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderTracks = () => {
    return (
      <div className="space-y-6">
        {!selectedTrackId ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CAREER_TRACKS.map(track => (
              <Card key={track.id} className="bg-[#2a2c44] border-0 shadow-lg hover:ring-2 hover:ring-emerald-500/50 transition-all cursor-pointer group" onClick={() => setSelectedTrackId(track.id)}>
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${track.color} flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform`}>
                    {track.icon}
                  </div>
                  <CardTitle className="text-white">{track.name}</CardTitle>
                  <CardDescription className="text-white/60">{track.levels.length} niveles en la ruta</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-white/70">
                    <div className="flex justify-between">
                      <span>Nivel Inicial</span>
                      <span className="font-medium text-white">{track.levels[0].title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Nivel Máximo</span>
                      <span className="font-medium text-white">{track.levels[track.levels.length-1].title}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="ghost" className="w-full text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-2">
                    Explorar Track <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Button variant="ghost" onClick={() => setSelectedTrackId(null)} className="mb-6 text-white/70 hover:text-white">
              &larr; Volver a Tracks
            </Button>
            <div className="bg-[#2a2c44] p-6 rounded-xl">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <span className="text-3xl">{CAREER_TRACKS.find(t=>t.id===selectedTrackId)?.icon}</span>
                {CAREER_TRACKS.find(t=>t.id===selectedTrackId)?.name}
              </h2>
              <div className="grid gap-4">
                {CAREER_TRACKS.find(t=>t.id===selectedTrackId)?.levels.map(level => (
                  <div key={level.level} className="bg-black/20 p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-white">
                        {level.level}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{level.title}</h3>
                        <p className="text-sm text-white/60">{formatCurrency(level.salary_min)} - {formatCurrency(level.salary_max)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {level.skills.slice(0,3).map(s => <Badge key={s} variant="secondary" className="bg-white/10">{s}</Badge>)}
                      {level.skills.length > 3 && <Badge variant="secondary" className="bg-white/10">+{level.skills.length - 3}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  const renderMobility = () => (
    <div className="space-y-6">
      <Card className="bg-[#2a2c44] border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            Talento Listo para Promoción
          </CardTitle>
          <CardDescription className="text-white/60">Empleados que han superado el 90% de requisitos para su siguiente nivel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-white/50 border border-dashed border-white/10 rounded-lg">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No hay candidatos listos para promoción en este momento.</p>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-[#2a2c44] border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Building className="w-5 h-5 text-blue-400" />
            Vacantes Internas Activas
          </CardTitle>
          <CardDescription className="text-white/60">Oportunidades de movimiento lateral o promoción</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
             <div className="bg-black/20 p-4 rounded-lg flex justify-between items-center border border-white/5">
                <div>
                  <h4 className="text-white font-medium">Coordinador Logístico (Guadalajara)</h4>
                  <p className="text-sm text-white/60">Track Logístico • Nivel 5</p>
                </div>
                <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-400 hover:bg-emerald-500/10">Aplicar</Button>
             </div>
             <div className="bg-black/20 p-4 rounded-lg flex justify-between items-center border border-white/5">
                <div>
                  <h4 className="text-white font-medium">Supervisor de Ruta (Monterrey)</h4>
                  <p className="text-sm text-white/60">Track Comercial • Nivel 4</p>
                </div>
                <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-400 hover:bg-emerald-500/10">Aplicar</Button>
             </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1a1c2e] pb-12">
      {/* Header Premium */}
      <div className="bg-gradient-to-r from-sky-600 to-indigo-700 pb-24 pt-8 px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Map className="w-8 h-8" />
                Career Path & Movilidad
              </h1>
              <p className="text-indigo-100 mt-2 text-lg">Visualiza tu ruta de crecimiento y gestiona el desarrollo del talento</p>
            </div>
            {isDemo && (
              <Badge variant="secondary" className="bg-orange-500/20 text-orange-200 border border-orange-500/50">
                MODO DEMO
              </Badge>
            )}
          </div>

          <div className="flex gap-2 mt-8 overflow-x-auto pb-2">
            {[
              { id: 'miruta', label: 'Mi Ruta', icon: <Map className="w-4 h-4" /> },
              { id: 'tracks', label: 'Tracks de Carrera', icon: <TrendingUp className="w-4 h-4" /> },
              { id: 'movilidad', label: 'Movilidad Interna', icon: <Users className="w-4 h-4" /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'bg-white text-indigo-900 shadow-lg' 
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 lg:px-8 -mt-16 relative z-10">
        {loading ? (
          <div className="space-y-4">
            <div className="h-40 bg-[#2a2c44] rounded-xl animate-pulse"></div>
            <div className="h-64 bg-[#2a2c44] rounded-xl animate-pulse"></div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'miruta' && renderMyRoute()}
              {activeTab === 'tracks' && renderTracks()}
              {activeTab === 'movilidad' && renderMobility()}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
