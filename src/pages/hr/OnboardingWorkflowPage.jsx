import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  UserPlus, 
  UserMinus, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Briefcase, 
  MonitorSmartphone, 
  ShoppingCart, 
  ShieldCheck, 
  UserCheck,
  ChevronRight,
  ListTodo
} from 'lucide-react';

const DEMO_INSTANCES = [
  { id: 1, employee_name: 'Carlos Martínez', type: 'ONBOARDING', started_at: '2024-01-15', progress: 65, status: 'EN_PROCESO', days: 5 },
  { id: 2, employee_name: 'Ana Rodríguez', type: 'ONBOARDING', started_at: '2024-01-20', progress: 30, status: 'EN_PROCESO', days: 2 },
  { id: 3, employee_name: 'Pedro López', type: 'OFFBOARDING', started_at: '2024-01-18', progress: 80, status: 'EN_PROCESO', days: 7 },
  { id: 4, employee_name: 'Sofía Castro', type: 'ONBOARDING', started_at: '2024-01-10', progress: 100, status: 'COMPLETADO', days: 12 },
  { id: 5, employee_name: 'Miguel Torres', type: 'ONBOARDING', started_at: '2023-12-20', progress: 45, status: 'CON_RETRASO', days: 35 },
];

const DEMO_TASKS = {
  RH: [
    { id: 101, name: 'Crear expediente', sla_days: 1, status: 'COMPLETADO', responsible: 'Ana HR' },
    { id: 102, name: 'Firmar contrato', sla_days: 2, status: 'COMPLETADO', responsible: 'Ana HR' },
    { id: 103, name: 'Alta IMSS', sla_days: 3, status: 'EN_PROCESO', responsible: 'Carlos Payroll' },
    { id: 104, name: 'Registrar datos bancarios', sla_days: 3, status: 'PENDIENTE', responsible: 'Carlos Payroll' },
  ],
  TI: [
    { id: 201, name: 'Crear correo corporativo', sla_days: 2, status: 'COMPLETADO', responsible: 'Soporte TI' },
    { id: 202, name: 'Configurar laptop', sla_days: 4, status: 'EN_PROCESO', responsible: 'Soporte TI' },
    { id: 203, name: 'Accesos ERP', sla_days: 5, status: 'PENDIENTE', responsible: 'Admin Sistemas' },
    { id: 204, name: 'Configuración VPN', sla_days: 5, status: 'PENDIENTE', responsible: 'Redes TI' },
  ],
  Compras: [
    { id: 301, name: 'Uniformes', sla_days: 7, status: 'EN_PROCESO', responsible: 'Almacén' },
    { id: 302, name: 'Equipo de seguridad', sla_days: 5, status: 'PENDIENTE', responsible: 'Almacén' },
    { id: 303, name: 'Herramienta de trabajo', sla_days: 5, status: 'PENDIENTE', responsible: 'Almacén' },
  ],
  Seguridad: [
    { id: 401, name: 'Impresión de Gafete', sla_days: 2, status: 'PENDIENTE', responsible: 'Control de Acceso' },
    { id: 402, name: 'Alta en biométricos', sla_days: 2, status: 'PENDIENTE', responsible: 'Control de Acceso' },
    { id: 403, name: 'Capacitación seguridad industrial', sla_days: 10, status: 'PENDIENTE', responsible: 'Seguridad' },
  ],
  Jefe: [
    { id: 501, name: 'Presentación equipo', sla_days: 1, status: 'PENDIENTE', responsible: 'Jefe Directo' },
    { id: 502, name: 'Asignación de Mentor', sla_days: 2, status: 'PENDIENTE', responsible: 'Jefe Directo' },
    { id: 503, name: 'Plan 30-60-90 días', sla_days: 5, status: 'PENDIENTE', responsible: 'Jefe Directo' },
    { id: 504, name: 'Primera evaluación (30 días)', sla_days: 30, status: 'PENDIENTE', responsible: 'Jefe Directo' },
  ]
};

const DEPARTMENTS = [
  { id: 'RH', name: 'Recursos Humanos', icon: Briefcase, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
  { id: 'TI', name: 'Tecnología', icon: MonitorSmartphone, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
  { id: 'Compras', name: 'Compras y Almacén', icon: ShoppingCart, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  { id: 'Seguridad', name: 'Seguridad Integral', icon: ShieldCheck, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
  { id: 'Jefe', name: 'Operación / Jefatura', icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
];

export default function OnboardingWorkflowPage() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('hr_workflow_instances').select('*');
      
      if (error || !data || data.length === 0) {
        setInstances(DEMO_INSTANCES);
        setIsDemo(true);
      } else {
        setInstances(data);
        setIsDemo(false);
      }
    } catch (err) {
      console.error("Error fetching workflows:", err);
      setInstances(DEMO_INSTANCES);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'EN_PROCESO':
        return <Badge className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-0">En Proceso</Badge>;
      case 'COMPLETADO':
        return <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-0">Completado</Badge>;
      case 'CON_RETRASO':
        return <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-0">Con Retraso</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border-0">{status}</Badge>;
    }
  };

  const getTypeBadge = (type) => {
    return type === 'ONBOARDING' 
      ? <span className="flex items-center text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full"><UserPlus className="w-3 h-3 mr-1"/> Onboarding</span>
      : <span className="flex items-center text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded-full"><UserMinus className="w-3 h-3 mr-1"/> Offboarding</span>;
  };

  const getTaskStatusColor = (status) => {
    if (status === 'COMPLETADO') return 'text-emerald-400';
    if (status === 'EN_PROCESO') return 'text-blue-400';
    return 'text-gray-500';
  };

  const getTaskStatusIcon = (status) => {
    if (status === 'COMPLETADO') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === 'EN_PROCESO') return <Activity className="w-4 h-4 text-blue-400" />;
    return <Clock className="w-4 h-4 text-gray-500" />;
  };

  // KPIs
  const activeProcesses = instances.filter(i => i.status !== 'COMPLETADO').length;
  const delayedProcesses = instances.filter(i => i.status === 'CON_RETRASO').length;
  // Mock pending tasks today
  const pendingTasksToday = 14; 
  // Mock avg days
  const avgDays = 8.5;

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-white p-6 md:p-8 font-sans">
      
      {/* Header with KPIs */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 flex items-center">
              <Activity className="w-8 h-8 mr-3 text-emerald-400" />
              Workflow de Onboarding
            </h1>
            <p className="text-white/60 mt-2">Gestión y seguimiento de procesos de ingreso y salida</p>
          </div>
          {isDemo && (
            <Badge className="bg-orange-500 text-white border-0 mt-4 md:mt-0 shadow-[0_0_15px_rgba(249,115,22,0.3)]">
              MODO DEMO
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-[#2a2c44] border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Procesos Activos</p>
                  <p className="text-3xl font-bold text-white mt-1">{activeProcesses}</p>
                </div>
                <div className="bg-blue-500/20 p-3 rounded-full">
                  <Activity className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-[#2a2c44] border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Tareas Pendientes (Hoy)</p>
                  <p className="text-3xl font-bold text-white mt-1">{pendingTasksToday}</p>
                </div>
                <div className="bg-orange-500/20 p-3 rounded-full">
                  <ListTodo className="w-6 h-6 text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2a2c44] border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Procesos con Retraso</p>
                  <p className="text-3xl font-bold text-white mt-1">{delayedProcesses}</p>
                </div>
                <div className="bg-red-500/20 p-3 rounded-full">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2a2c44] border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Promedio Días Onboarding</p>
                  <p className="text-3xl font-bold text-white mt-1">{avgDays}</p>
                </div>
                <div className="bg-emerald-500/20 p-3 rounded-full">
                  <Clock className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* List of Processes */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <ListTodo className="w-5 h-5 mr-2 text-emerald-400" />
            Procesos Recientes
          </h2>
          
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="bg-[#2a2c44] border-0 animate-pulse">
                  <CardContent className="p-6 h-32"></CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              <AnimatePresence>
                {instances.map((instance, idx) => (
                  <motion.div
                    key={instance.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card 
                      className={`bg-[#2a2c44] border hover:border-emerald-500/50 cursor-pointer transition-all ${selectedInstance?.id === instance.id ? 'border-emerald-500' : 'border-transparent'}`}
                      onClick={() => setSelectedInstance(instance)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-semibold text-lg">{instance.employee_name}</h3>
                            <div className="mt-1">{getTypeBadge(instance.type)}</div>
                          </div>
                          {getStatusBadge(instance.status)}
                        </div>
                        
                        <div className="mt-4">
                          <div className="flex justify-between text-sm text-white/60 mb-1">
                            <span>Progreso</span>
                            <span>{instance.progress}%</span>
                          </div>
                          <div className="w-full bg-black/40 rounded-full h-1.5 mb-3">
                            <div 
                              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-1000"
                              style={{ width: `${instance.progress}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-xs text-white/40">
                            <span>Inicio: {instance.started_at}</span>
                            <span>{instance.days} días activos</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Process Detail */}
        <div className="lg:col-span-2">
          {selectedInstance ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={selectedInstance.id}
            >
              <Card className="bg-[#2a2c44] border-0 shadow-lg h-full min-h-[600px]">
                <CardHeader className="border-b border-white/5 pb-4 bg-gradient-to-r from-[#2a2c44] to-[#23253b] rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl text-emerald-400">
                        {selectedInstance.employee_name}
                      </CardTitle>
                      <p className="text-white/60 text-sm mt-1">
                        Workflow de {selectedInstance.type.toLowerCase()} • Iniciado el {selectedInstance.started_at}
                      </p>
                    </div>
                    <Button variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
                      Ver Expediente
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  
                  <div className="space-y-8">
                    {DEPARTMENTS.map((dept, idx) => {
                      const deptTasks = DEMO_TASKS[dept.id] || [];
                      const completedCount = deptTasks.filter(t => t.status === 'COMPLETADO').length;
                      const progress = deptTasks.length > 0 ? (completedCount / deptTasks.length) * 100 : 0;
                      
                      return (
                        <div key={dept.id} className="relative">
                          {idx !== DEPARTMENTS.length - 1 && (
                            <div className="absolute left-6 top-14 bottom-[-2rem] w-px bg-white/10" />
                          )}
                          
                          <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-xl ${dept.bg} ${dept.color} ${dept.border} border z-10 shadow-lg`}>
                              <dept.icon className="w-6 h-6" />
                            </div>
                            
                            <div className="flex-1 pt-1">
                              <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold text-lg">{dept.name}</h3>
                                <Badge className="bg-black/40 text-white/70 border-0">
                                  {completedCount} / {deptTasks.length} Tareas
                                </Badge>
                              </div>
                              
                              <div className="w-full bg-black/40 rounded-full h-1 mb-4">
                                <div 
                                  className={`h-1 rounded-full ${dept.color.replace('text-', 'bg-')}`}
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>

                              <div className="space-y-2">
                                {deptTasks.map(task => (
                                  <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/30 transition-colors border border-white/5 group">
                                    <div className="flex items-center gap-3">
                                      {getTaskStatusIcon(task.status)}
                                      <div>
                                        <p className="text-sm font-medium">{task.name}</p>
                                        <p className="text-xs text-white/50">Responsable: {task.responsible}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="text-xs text-white/40 flex items-center">
                                        <Clock className="w-3 h-3 mr-1" />
                                        SLA: {task.sla_days}d
                                      </span>
                                      {task.status !== 'COMPLETADO' && (
                                        <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                          Completar
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <Card className="bg-[#2a2c44] border-0 shadow-lg h-full min-h-[600px] flex items-center justify-center">
              <div className="text-center text-white/40">
                <Activity className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg">Selecciona un proceso para ver los detalles</p>
              </div>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}
