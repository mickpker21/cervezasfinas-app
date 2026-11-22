import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  Award, 
  CheckCircle2, 
  AlertCircle, 
  BarChart, 
  Grid as GridIcon, 
  Layers, 
  GraduationCap, 
  Plus, 
  Search, 
  ShieldCheck, 
  ShieldAlert,
  Loader2
} from 'lucide-react';

const SKILLS_CATALOG = [
  { name: 'Manejo de Autoventa', category: 'OPERATIVO' },
  { name: 'Sistema ERP', category: 'TECNICO' },
  { name: 'Excel Avanzado', category: 'TECNICO' },
  { name: 'Power BI', category: 'TECNICO' },
  { name: 'Manejo de Montacargas', category: 'OPERATIVO' },
  { name: 'Licencia Tipo B', category: 'LICENCIA' },
  { name: 'Licencia Tipo C (camión)', category: 'LICENCIA' },
  { name: 'Liderazgo', category: 'SOFT_SKILL' },
  { name: 'Negociación', category: 'SOFT_SKILL' },
  { name: 'Servicio al Cliente', category: 'SOFT_SKILL' },
  { name: 'Inglés Básico', category: 'IDIOMA' },
  { name: 'Inglés Avanzado', category: 'IDIOMA' },
  { name: 'DC-3 (Capacitación)', category: 'CERTIFICACION' },
  { name: 'NOM-035', category: 'CERTIFICACION' },
  { name: 'Conocimiento de Producto (Cerveza)', category: 'TECNICO' },
];

const DEMO_EMPLOYEE_SKILLS = [
  { 
    id: 'emp-1',
    employee: 'Carlos Martínez', 
    position: 'Chofer Repartidor',
    skills: [
      { name: 'Manejo de Autoventa', level: 4, verified: true },
      { name: 'Licencia Tipo B', level: 4, verified: true },
      { name: 'Técnicas de Venta', level: 3, verified: false },
      { name: 'Conocimiento de Producto (Cerveza)', level: 4, verified: true },
      { name: 'Excel Avanzado', level: 2, verified: false },
    ]
  },
  { 
    id: 'emp-2',
    employee: 'Ana Rodríguez', 
    position: 'Gerente Comercial',
    skills: [
      { name: 'Liderazgo', level: 3, verified: true },
      { name: 'Excel Avanzado', level: 4, verified: true },
      { name: 'NOM-035', level: 3, verified: true },
      { name: 'Power BI', level: 2, verified: false },
    ]
  },
  { 
    id: 'emp-3',
    employee: 'Juan Pérez', 
    position: 'Montacarguista',
    skills: [
      { name: 'Manejo de Montacargas', level: 4, verified: true },
      { name: 'DC-3 (Capacitación)', level: 4, verified: true },
      { name: 'Sistema ERP', level: 1, verified: false },
    ]
  },
];

const DEMO_JOB_GAPS = [
  {
    position: 'Chofer Repartidor',
    required: ['Licencia Tipo B', 'Manejo de Autoventa', 'Servicio al Cliente'],
    employees: [
      { name: 'Carlos Martínez', missing: ['Servicio al Cliente'] }
    ]
  },
  {
    position: 'Montacarguista',
    required: ['Manejo de Montacargas', 'DC-3 (Capacitación)'],
    employees: [
      { name: 'Juan Pérez', missing: [] }
    ]
  }
];

const CATEGORY_COLORS = {
  'OPERATIVO': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'TECNICO': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'LICENCIA': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'SOFT_SKILL': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'IDIOMA': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'CERTIFICACION': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const SkillLevelBars = ({ level }) => {
  return (
    <div className="flex space-x-1 w-24">
      {[1, 2, 3, 4].map((bar) => {
        let bgColor = 'bg-slate-700';
        if (bar <= level) {
          if (level === 1) bgColor = 'bg-rose-500';
          else if (level === 2) bgColor = 'bg-amber-500';
          else if (level === 3) bgColor = 'bg-lime-500';
          else bgColor = 'bg-emerald-500';
        }
        return (
          <div key={bar} className={`h-2 flex-1 rounded-sm ${bgColor} transition-colors duration-300`} />
        );
      })}
    </div>
  );
};

export default function SkillsManagementPage() {
  const { session } = useSupabaseAuth();
  const [activeTab, setActiveTab] = useState('inventory');
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [jobGaps, setJobGaps] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Intentar cargar de Supabase
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, role');
        
      const { data: skillsData, error: skillsError } = await supabase
        .from('hr_skills_catalog')
        .select('*');
        
      if (profilesError || skillsError || !profilesData || profilesData.length === 0) {
        throw new Error("Tablas no existen o sin datos");
      }
      
      // Si hay datos, procesarlos (simplificado para demo)
      setEmployees(profilesData.map(p => ({
        id: p.id,
        employee: p.full_name || 'Usuario',
        position: p.role || 'Empleado',
        skills: [] // Aquí se cargarían de hr_employee_skills
      })));
      setCatalog(skillsData);
      setIsDemoMode(false);
      
    } catch (err) {
      console.log('Usando datos de demostración para Skills');
      setEmployees(DEMO_EMPLOYEE_SKILLS);
      if (DEMO_EMPLOYEE_SKILLS.length > 0) {
        setSelectedEmployeeId(DEMO_EMPLOYEE_SKILLS[0].id);
      }
      setCatalog(SKILLS_CATALOG);
      setJobGaps(DEMO_JOB_GAPS);
      setIsDemoMode(true);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

  const TABS = [
    { id: 'inventory', label: 'Inventario', icon: Layers },
    { id: 'catalog', label: 'Catálogo', icon: Brain },
    { id: 'gap', label: 'Gap Analysis', icon: BarChart },
    { id: 'heatmap', label: 'Mapa de Calor', icon: GridIcon },
  ];

  const renderTabContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-white/50">
          <Loader2 className="w-12 h-12 animate-spin mb-4 text-cyan-500" />
          <p>Cargando datos de habilidades...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'inventory':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <Card className="bg-[#2a2c44] border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                  <div className="w-full md:w-1/3">
                    <label className="block text-sm font-medium text-white/60 mb-2">Seleccionar Empleado</label>
                    <select 
                      className="w-full bg-[#1a1c2e] border border-white/10 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    >
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.employee} - {emp.position}</option>
                      ))}
                    </select>
                  </div>
                  <Button className="bg-emerald-500 hover:bg-emerald-600 text-white border-0">
                    <Plus className="w-4 h-4 mr-2" /> Agregar Skill
                  </Button>
                </div>

                {selectedEmployee && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedEmployee.skills.map((skill, idx) => (
                      <motion.div 
                        key={idx}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-[#1a1c2e] rounded-xl p-5 border border-white/5 hover:border-emerald-500/30 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-white font-medium pr-4">{skill.name}</h4>
                          {skill.verified ? (
                            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                          ) : (
                            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-auto">
                          <span className="text-sm text-white/50">Nivel {skill.level}</span>
                          <SkillLevelBars level={skill.level} />
                        </div>
                      </motion.div>
                    ))}
                    {selectedEmployee.skills.length === 0 && (
                      <div className="col-span-full py-12 text-center text-white/50">
                        <Award className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No hay habilidades registradas para este empleado.</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );

      case 'catalog':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <Card className="bg-[#2a2c44] border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                <CardTitle className="text-white flex items-center">
                  <Brain className="w-5 h-5 mr-2 text-cyan-400" /> Catálogo Maestro
                </CardTitle>
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 h-9">
                  <Plus className="w-4 h-4 mr-2" /> Nueva
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-white/80">
                    <thead className="bg-black/20 text-white/60">
                      <tr>
                        <th className="px-6 py-4 font-medium">Habilidad</th>
                        <th className="px-6 py-4 font-medium">Categoría</th>
                        <th className="px-6 py-4 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {catalog.map((item, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 font-medium text-white">{item.name}</td>
                          <td className="px-6 py-4">
                            <Badge className={`${CATEGORY_COLORS[item.category] || 'bg-slate-500/20'} border`}>
                              {item.category}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="ghost" size="sm" className="text-white/60 hover:text-white">
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );

      case 'gap':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {jobGaps.map((job, idx) => (
              <Card key={idx} className="bg-[#2a2c44] border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-white flex items-center justify-between">
                    <span>{job.position}</span>
                    <Badge variant="outline" className="text-cyan-400 border-cyan-400/30">
                      {job.required.length} Skills Requeridos
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {job.required.map(req => (
                      <Badge key={req} className="bg-slate-800 text-slate-300 border-slate-700">{req}</Badge>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {job.employees.map((emp, empIdx) => (
                      <div key={empIdx} className="bg-[#1a1c2e] p-4 rounded-lg flex items-center justify-between border border-white/5">
                        <span className="text-white">{emp.name}</span>
                        {emp.missing.length === 0 ? (
                          <div className="flex items-center text-emerald-400 text-sm">
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Sin Gaps
                          </div>
                        ) : (
                          <div className="flex items-center text-rose-400 text-sm gap-2">
                            <AlertCircle className="w-4 h-4" /> 
                            Falta: {emp.missing.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        );

      case 'heatmap':
        // Determinar top skills para el heatmap
        const topSkills = ['Manejo de Autoventa', 'Excel Avanzado', 'Liderazgo', 'NOM-035', 'Licencia Tipo B'];
        
        return (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          >
            <Card className="bg-[#2a2c44] border-0 shadow-lg overflow-hidden">
              <CardHeader>
                <CardTitle className="text-white">Matriz de Competencias Críticas</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-4 text-left font-medium text-white/60 border-b border-white/10 min-w-[150px]">Empleado</th>
                      {topSkills.map(skill => (
                        <th key={skill} className="p-4 text-center font-medium text-white/60 border-b border-white/10">
                          <div className="writing-vertical-rl transform -rotate-180 h-32 flex items-center justify-center whitespace-nowrap">
                            {skill}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {employees.map(emp => (
                      <tr key={emp.id} className="hover:bg-white/5">
                        <td className="p-4 text-white font-medium">{emp.employee}</td>
                        {topSkills.map(skillName => {
                          const hasSkill = emp.skills.find(s => s.name === skillName);
                          return (
                            <td key={skillName} className="p-4 text-center">
                              <div className="flex justify-center">
                                {hasSkill ? (
                                  <div className="w-6 h-6 rounded-md bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)] flex items-center justify-center" title={`Nivel ${hasSkill.level}`}>
                                    <CheckCircle2 className="w-4 h-4 text-white" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-md bg-white/5 border border-white/10" />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </motion.div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1c2e] p-6 text-slate-200">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-700 p-8 shadow-xl">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <GraduationCap className="w-32 h-32" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">Skills Management</h1>
                {isDemoMode && (
                  <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-0 shadow-lg">
                    MODO DEMO
                  </Badge>
                )}
              </div>
              <p className="text-cyan-100 max-w-2xl text-lg">
                Inventario de habilidades, certificaciones y análisis de brechas.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 bg-[#2a2c44] p-1.5 rounded-xl border border-white/5">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                  isActive 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-emerald-400' : 'text-white/40'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {renderTabContent()}
        </AnimatePresence>

      </div>
    </div>
  );
}
