import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  Target, 
  Award, 
  ChevronRight,
  ShieldAlert,
  Battery,
  BatteryFull,
  BatteryMedium,
  BatteryWarning,
  Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/supabaseClient';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// DEMO DATA
const DEMO_9BOX = [
  { name: 'Carlos M.', performance: 3, potential: 3 },
  { name: 'Ana R.', performance: 3, potential: 2 },
  { name: 'Pedro L.', performance: 2, potential: 3 },
  { name: 'María G.', performance: 2, potential: 2 },
  { name: 'Luis H.', performance: 1, potential: 2 },
  { name: 'Rosa T.', performance: 3, potential: 1 },
  { name: 'Juan C.', performance: 1, potential: 1 },
  { name: 'Elena V.', performance: 2, potential: 1 },
  { name: 'Diego S.', performance: 1, potential: 3 }
];

const DEMO_CRITICAL = [
  { 
    position: 'Gerente Comercial Zona Sur', 
    current: 'Luis Hernández', 
    flight_risk: 'ALTO', 
    bench: 1,
    successors: [{ name: 'Carlos Martínez', readiness: 'EN_6_MESES' }] 
  },
  { 
    position: 'Supervisor Oaxaca', 
    current: 'Ana Torres', 
    flight_risk: 'BAJO', 
    bench: 2,
    successors: [
      { name: 'Pedro López', readiness: 'LISTO_AHORA' }, 
      { name: 'María García', readiness: 'EN_12_MESES' }
    ] 
  },
  { 
    position: 'Jefe de Almacén', 
    current: 'Roberto Guzmán', 
    flight_risk: 'MEDIO', 
    bench: 0, 
    successors: [] 
  },
];

const GRID_LABELS = {
  '3-3': { title: 'ESTRELLA', desc: 'Alto Rendimiento / Alto Potencial', color: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' },
  '3-2': { title: 'Alto Rendimiento', desc: 'Alto Rendimiento / Potencial Medio', color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
  '3-1': { title: 'Experto', desc: 'Alto Rendimiento / Bajo Potencial', color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
  '2-3': { title: 'Alto Potencial Desaprovechado', desc: 'Rendimiento Medio / Alto Potencial', color: 'bg-amber-500/20 border-amber-500/50 text-amber-400' },
  '2-2': { title: 'Contribuidor Clave', desc: 'Rendimiento Medio / Potencial Medio', color: 'bg-blue-500/20 border-blue-500/50 text-blue-400' },
  '2-1': { title: 'Bien Situado', desc: 'Rendimiento Medio / Bajo Potencial', color: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
  '1-3': { title: 'Empleado Emergente', desc: 'Bajo Rendimiento / Alto Potencial', color: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
  '1-2': { title: 'Empleado Comprometido', desc: 'Bajo Rendimiento / Potencial Medio', color: 'bg-orange-500/20 border-orange-500/50 text-orange-400' },
  '1-1': { title: 'Bajo Rendimiento', desc: 'Bajo Rendimiento / Bajo Potencial', color: 'bg-red-500/20 border-red-500/50 text-red-400' },
};

export default function SuccessionPlanningPage() {
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [talentProfiles, setTalentProfiles] = useState([]);
  const [criticalPositions, setCriticalPositions] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: pError } = await supabase.from('hr_talent_profiles').select('*');
      const { data: positions, error: posError } = await supabase.from('hr_critical_positions').select('*');

      if (pError || !profiles || profiles.length === 0) {
        throw new Error('No profiles found');
      }

      setTalentProfiles(profiles);
      setCriticalPositions(positions || []);
      setDemoMode(false);
    } catch (error) {
      console.log('Using demo data for succession planning', error);
      setDemoMode(true);
      setTalentProfiles(DEMO_9BOX);
      setCriticalPositions(DEMO_CRITICAL);
    } finally {
      setLoading(false);
    }
  };

  const getReadinessColor = (readiness) => {
    switch (readiness) {
      case 'LISTO_AHORA': return 'bg-emerald-500/20 text-emerald-400';
      case 'EN_6_MESES': return 'bg-blue-500/20 text-blue-400';
      case 'EN_12_MESES': return 'bg-amber-500/20 text-amber-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getReadinessLabel = (readiness) => {
    switch (readiness) {
      case 'LISTO_AHORA': return 'Listo Ahora';
      case 'EN_6_MESES': return 'En 6 Meses';
      case 'EN_12_MESES': return 'En 1-2 Años';
      default: return readiness;
    }
  };

  const getRiskColor = (risk) => {
    if (risk === 'ALTO') return 'text-red-400';
    if (risk === 'MEDIO') return 'text-amber-400';
    return 'text-emerald-400';
  };

  const render9Box = () => {
    // 3x3 Grid: Y=Potential (3 to 1), X=Performance (1 to 3)
    const grid = [];
    for (let pot = 3; pot >= 1; pot--) {
      for (let perf = 1; perf <= 3; perf++) {
        const cellKey = `${perf}-${pot}`; // perf is X, pot is Y
        const cellInfo = GRID_LABELS[cellKey];
        const cellTalent = talentProfiles.filter(t => t.performance === perf && t.potential === pot);
        
        grid.push(
          <div key={cellKey} className={`p-4 rounded-xl border ${cellInfo.color} flex flex-col min-h-[160px] relative overflow-hidden group hover:scale-[1.02] transition-transform`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="z-10 flex flex-col h-full">
              <h3 className="font-bold text-sm mb-1">{cellInfo.title}</h3>
              <p className="text-[10px] opacity-70 mb-3">{cellInfo.desc}</p>
              <div className="flex-1 flex flex-wrap gap-2 content-start">
                {cellTalent.map((t, idx) => (
                  <Badge key={idx} variant="outline" className="bg-[#1a1c2e]/50 border-white/20 text-xs py-1 px-2 cursor-pointer hover:bg-white/10 transition-colors">
                    <Users className="w-3 h-3 mr-1 opacity-70" />
                    {t.name}
                  </Badge>
                ))}
                {cellTalent.length === 0 && (
                  <span className="text-xs opacity-40 italic">Sin empleados</span>
                )}
              </div>
            </div>
          </div>
        );
      }
    }

    return (
      <div className="grid grid-cols-[auto_1fr] gap-4 mt-6 overflow-x-auto min-w-[700px]">
        <div className="flex flex-col justify-center items-center -rotate-180" style={{ writingMode: 'vertical-rl' }}>
          <span className="text-white/60 text-sm font-medium tracking-widest uppercase">Potencial</span>
        </div>
        <div>
          <div className="grid grid-cols-3 gap-4">
            {grid}
          </div>
          <div className="flex justify-center mt-4">
            <span className="text-white/60 text-sm font-medium tracking-widest uppercase">Rendimiento</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a1c2e] p-4 md:p-8 font-sans text-slate-100 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-600 to-pink-700 p-6 md:p-10 shadow-2xl"
        >
          <div className="absolute top-0 right-0 p-4">
            {demoMode && (
              <Badge variant="outline" className="bg-orange-500/20 text-orange-200 border-orange-400/50 backdrop-blur-md">
                MODO DEMO
              </Badge>
            )}
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <Target className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Succession Planning
              </h1>
            </div>
            <p className="text-rose-100 text-lg max-w-2xl">
              Identifica, evalúa y desarrolla el talento clave para asegurar el futuro de la organización.
            </p>
          </div>
          
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-rose-400/30 rounded-full blur-2xl pointer-events-none" />
        </motion.div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500" />
          </div>
        ) : (
          <Tabs defaultValue="9box" className="w-full">
            <TabsList className="bg-[#2a2c44] border border-white/5 p-1 mb-6 flex-wrap h-auto">
              <TabsTrigger value="9box" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white">
                9-Box Grid
              </TabsTrigger>
              <TabsTrigger value="critical" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white">
                Posiciones Críticas
              </TabsTrigger>
              <TabsTrigger value="risk" className="data-[state=active]:bg-rose-600 data-[state=active]:text-white">
                Talento en Riesgo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="9box">
              <Card className="bg-[#2a2c44] border-0 shadow-xl overflow-hidden">
                <CardHeader className="border-b border-white/5 pb-4">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                    <div>
                      <CardTitle className="text-white text-xl flex items-center gap-2">
                        <Users className="w-5 h-5 text-rose-400" />
                        Mapa de Talento (9-Box Grid)
                      </CardTitle>
                      <CardDescription className="text-white/60">
                        Evaluación de desempeño histórico vs potencial futuro
                      </CardDescription>
                    </div>
                    <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                      <Plus className="w-4 h-4 mr-2" />
                      Ubicar Empleado
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 overflow-x-auto">
                  {render9Box()}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="critical">
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Posiciones Críticas</h2>
                    <p className="text-white/60">Puestos clave que requieren un plan de sucesión activo</p>
                  </div>
                  <Button className="bg-rose-600 hover:bg-rose-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Posición
                  </Button>
                </div>

                <div className="grid gap-4">
                  {criticalPositions.map((pos, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <Card className="bg-[#2a2c44] border border-white/5 hover:border-white/10 transition-colors">
                        <CardContent className="p-6">
                          <div className="flex flex-col lg:flex-row gap-6 justify-between">
                            
                            <div className="flex-1 space-y-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h3 className="text-xl font-bold text-white mb-1">{pos.position}</h3>
                                  <p className="text-white/60 flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Ocupante actual: <span className="text-white font-medium">{pos.current}</span>
                                  </p>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-xs text-white/50 mb-1">Riesgo de Salida</span>
                                  <div className={`flex items-center gap-1 font-bold ${getRiskColor(pos.flight_risk)}`}>
                                    <AlertTriangle className="w-4 h-4" />
                                    {pos.flight_risk}
                                  </div>
                                </div>
                              </div>
                              
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm font-medium text-white/80">Bench Strength (Sucesores)</span>
                                  <Badge variant="secondary" className="bg-white/10 hover:bg-white/20 text-white">
                                    {pos.bench} identificados
                                  </Badge>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden flex">
                                  <div className={`h-full ${pos.bench > 1 ? 'bg-emerald-500 w-full' : pos.bench === 1 ? 'bg-amber-500 w-1/2' : 'bg-red-500 w-0'}`} />
                                </div>
                              </div>
                            </div>

                            <div className="flex-1 lg:border-l border-white/10 lg:pl-6">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                                  <Award className="w-4 h-4 text-rose-400" />
                                  Sucesores Designados
                                </h4>
                                <Button size="sm" variant="ghost" className="h-8 text-rose-400 hover:text-rose-300 hover:bg-rose-400/10">
                                  Administrar
                                </Button>
                              </div>
                              
                              {pos.successors.length > 0 ? (
                                <div className="space-y-3">
                                  {pos.successors.map((suc, sIdx) => (
                                    <div key={sIdx} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                                      <span className="font-medium text-white">{suc.name}</span>
                                      <Badge variant="outline" className={`border-0 ${getReadinessColor(suc.readiness)}`}>
                                        {getReadinessLabel(suc.readiness)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center p-6 bg-red-500/5 rounded-lg border border-red-500/20 text-center">
                                  <ShieldAlert className="w-8 h-8 text-red-400 mb-2" />
                                  <p className="text-sm text-red-200">Riesgo crítico: No hay sucesores identificados</p>
                                  <Button size="sm" variant="outline" className="mt-3 bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20">
                                    Asignar Sucesor
                                  </Button>
                                </div>
                              )}
                            </div>

                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="risk">
              <Card className="bg-[#2a2c44] border-0 shadow-xl">
                <CardHeader className="border-b border-white/5">
                  <CardTitle className="text-white text-xl flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                    Talento en Riesgo de Fuga
                  </CardTitle>
                  <CardDescription className="text-white/60">
                    Empleados clave con alta probabilidad de dejar la empresa
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {demoMode ? (
                    <div className="grid md:grid-cols-2 gap-4">
                      {[
                        { name: 'Luis Hernández', role: 'Gerente Comercial', risk: 'Alto', reason: 'Salario bajo mercado, estancamiento', impact: 'Crítico' },
                        { name: 'Ana Torres', role: 'Supervisor', risk: 'Medio', reason: 'Falta de reconocimiento', impact: 'Alto' }
                      ].map((item, idx) => (
                        <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h4 className="font-bold text-lg text-white">{item.name}</h4>
                              <p className="text-sm text-white/60">{item.role}</p>
                            </div>
                            <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                              Riesgo {item.risk}
                            </Badge>
                          </div>
                          <div className="space-y-2 mt-4">
                            <div className="flex justify-between text-sm">
                              <span className="text-white/50">Motivo principal:</span>
                              <span className="text-white text-right max-w-[200px]">{item.reason}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-white/50">Impacto de salida:</span>
                              <span className="text-white">{item.impact}</span>
                            </div>
                          </div>
                          <Button className="w-full mt-4 bg-white/10 hover:bg-white/20 text-white" variant="ghost">
                            Ver Plan de Retención
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-white/60">No hay datos de riesgo de fuga disponibles.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
