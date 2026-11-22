import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  LogOut,
  CheckCircle2,
  AlertCircle,
  FileText,
  Key,
  Monitor,
  UserX,
  Calendar,
  Clock,
  Briefcase,
  User,
  Activity,
  X,
  MessageSquare,
  Plus,
  Loader2,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const DEFAULT_CHECKLIST = {
  EQUIPO: [
    { id: 'eq_1', label: 'Laptop / Computadora', done: false },
    { id: 'eq_2', label: 'Celular corporativo', done: false },
    { id: 'eq_3', label: 'Radio de comunicación', done: false },
    { id: 'eq_4', label: 'Uniformes y equipo de protección', done: false },
    { id: 'eq_5', label: 'Herramientas de trabajo', done: false },
    { id: 'eq_6', label: 'Llaves de oficinas / bodegas', done: false },
    { id: 'eq_7', label: 'Vehículo o credenciales de transporte', done: false },
    { id: 'eq_8', label: 'Tarjeta corporativa / Viáticos', done: false },
  ],
  ACCESOS: [
    { id: 'acc_1', label: 'Bloqueo de Correo corporativo', done: false },
    { id: 'acc_2', label: 'Revocar VPN y accesos remotos', done: false },
    { id: 'acc_3', label: 'Baja del sistema ERP / Nómina', done: false },
    { id: 'acc_4', label: 'Baja del CRM de ventas', done: false },
    { id: 'acc_5', label: 'Baja de la App de campo', done: false },
    { id: 'acc_6', label: 'Desactivación de Huella / Biométrico Kiosco', done: false },
    { id: 'acc_7', label: 'Google / Microsoft 365 Admin', done: false },
  ],
  DOCUMENTOS: [
    { id: 'doc_1', label: 'Calculo de Finiquito / Liquidación', done: false },
    { id: 'doc_2', label: 'Finiquito firmado y ratificado', done: false },
    { id: 'doc_3', label: 'Carta no adeudo de activos', done: false },
    { id: 'doc_4', label: 'Baja del IMSS generada', done: false },
    { id: 'doc_5', label: 'Constancia laboral emitida', done: false },
  ]
};

export default function OffboardingPage() {
  const [offboardings, setOffboardings] = useState([]);
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const { toast } = useToast();

  // Modal Iniciar Baja
  const [isBajaModalOpen, setIsBajaModalOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [bajaReason, setBajaReason] = useState('RENUNCIA');
  const [bajaDate, setBajaDate] = useState(new Date().toISOString().split('T')[0]);
  const [bajaNotes, setBajaNotes] = useState('');
  const [submittingBaja, setSubmittingBaja] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const getChecklistForProcess = (processId) => {
    try {
      const saved = localStorage.getItem(`offboarding_checklist_${processId}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_CHECKLIST;
  };

  const calculateProgressFromChecklist = (ck) => {
    if (!ck) return 0;
    let total = 0;
    let done = 0;
    Object.keys(ck).forEach(cat => {
      (ck[cat] || []).forEach(item => {
        total++;
        if (item.done) done++;
      });
    });
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Obtener todos los perfiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*');

      if (error) throw error;

      const all = profiles || [];

      // Empleados activos
      const actives = all.filter(p => p.status !== 'BAJA' && p.status !== 'INACTIVO');
      setActiveEmployees(actives);

      // Empleados en Baja o Inactivos
      const bajas = all.filter(p => p.status === 'BAJA' || p.status === 'INACTIVO');

      // Intentar leer de hr_offboarding_processes si existe
      let extraProcesses = [];
      try {
        const { data: procData } = await supabase.from('hr_offboarding_processes').select('*');
        if (procData && procData.length > 0) {
          extraProcesses = procData;
        }
      } catch (e) {}

      // Mapear procesos reales
      const mappedProcesses = bajas.map(emp => {
        const procId = emp.id;
        const ck = getChecklistForProcess(procId);
        const progress = calculateProgressFromChecklist(ck);
        const dateStr = emp.baja_date || (emp.updated_at ? emp.updated_at.split('T')[0] : 'Reciente');

        return {
          id: emp.id,
          name: emp.name || emp.email || `Empleado #${emp.id.slice(0, 6)}`,
          title: emp.role || 'Empleado',
          reason: emp.baja_reason || 'RENUNCIA',
          date: dateStr,
          progress: progress,
          days_remaining: 0,
          status: emp.status,
          empData: emp
        };
      });

      // Unir procesos
      setOffboardings(mappedProcesses);
    } catch (err) {
      console.error('[OffboardingPage] Error fetching data:', err);
      toast({
        title: 'Error de carga',
        description: 'No se pudieron cargar los datos de empleados.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProcess = (proc) => {
    setSelectedProcess(proc);
    const ck = getChecklistForProcess(proc.id);
    setChecklist(ck);
  };

  const toggleChecklistItem = (category, itemId) => {
    if (!selectedProcess) return;

    const newChecklist = {
      ...checklist,
      [category]: checklist[category].map(item =>
        item.id === itemId ? { ...item, done: !item.done } : item
      )
    };

    setChecklist(newChecklist);

    // Guardar en localStorage
    try {
      localStorage.setItem(`offboarding_checklist_${selectedProcess.id}`, JSON.stringify(newChecklist));
    } catch (e) {}

    // Recalcular progreso en la lista
    const newProgress = calculateProgressFromChecklist(newChecklist);
    setOffboardings(prev => prev.map(p => p.id === selectedProcess.id ? { ...p, progress: newProgress } : p));
  };

  const handleStartBajaProcess = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) {
      toast({ title: 'Selecciona un empleado', variant: 'destructive' });
      return;
    }

    setSubmittingBaja(true);
    try {
      const empToBaja = activeEmployees.find(e => e.id === selectedEmpId);
      const empName = empToBaja?.name || empToBaja?.email || 'Empleado';

      // 1. Actualizar estado a BAJA en profiles
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          status: 'BAJA',
          baja_reason: bajaReason,
          baja_date: bajaDate,
          baja_notes: bajaNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedEmpId);

      if (profileErr) throw profileErr;

      // 2. Registrar en hr_history
      await supabase.from('hr_history').insert({
        user_id: selectedEmpId,
        event_type: 'BAJA',
        description: `Baja procesada desde Offboarding (${bajaReason}). Nota: ${bajaNotes || 'Sin comentarios'}`
      }).catch(() => {});

      // 3. Inicializar checklist
      localStorage.setItem(`offboarding_checklist_${selectedEmpId}`, JSON.stringify(DEFAULT_CHECKLIST));

      toast({
        title: 'Proceso de Baja Iniciado',
        description: `Se procesó la baja de ${empName} correctamente.`
      });

      setIsBajaModalOpen(false);
      setSelectedEmpId('');
      setBajaNotes('');
      fetchData();
    } catch (err) {
      console.error('Error procesando baja:', err);
      toast({
        title: 'Error al procesar baja',
        description: err.message || 'No se pudo actualizar el registro del empleado.',
        variant: 'destructive'
      });
    } finally {
      setSubmittingBaja(false);
    }
  };

  const getReasonColor = (reason) => {
    switch (reason) {
      case 'RENUNCIA': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'DESPIDO': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'FIN_CONTRATO': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-[#1a1c2e] text-slate-300 border-slate-700';
    }
  };

  // KPIs
  const totalBajas = offboardings.length;
  const inProgressBajas = offboardings.filter(p => p.progress < 100).length;
  const completedBajas = offboardings.filter(p => p.progress === 100).length;
  const renunciasCount = offboardings.filter(p => p.reason === 'RENUNCIA').length;
  const renunciasPercent = totalBajas > 0 ? Math.round((renunciasCount / totalBajas) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1c2e] p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-emerald-400">
          <Loader2 className="w-12 h-12 animate-spin" />
          <p className="text-xl font-semibold">Cargando expediente de offboarding...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-white p-6 pb-24 lg:p-8 font-sans">
      {/* Header Section */}
      <div className="relative mb-8 p-8 rounded-2xl bg-gradient-to-br from-red-700 to-orange-700 overflow-hidden shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <UserX className="w-48 h-48" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold tracking-tight text-white">
                Offboarding & Control de Bajas
              </h1>
            </div>
            <p className="text-red-100 text-lg max-w-xl">
              Gestión formal de desvinculaciones, devolución de activos, accesos y encuestas de salida.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button onClick={fetchData} variant="outline" className="border-white/20 text-white hover:bg-white/10">
              <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
            </Button>
            <Button onClick={() => setIsBajaModalOpen(true)} className="bg-white text-red-700 hover:bg-gray-100 font-semibold gap-2 shadow-lg">
              <Plus className="w-5 h-5" />
              Iniciar Proceso de Baja
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="bg-[#2a2c44] border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-500/20 rounded-xl">
                <Activity className="w-6 h-6 text-red-400" />
              </div>
            </div>
            <div>
              <p className="text-white/60 text-sm font-medium mb-1">Bajas en Proceso</p>
              <h3 className="text-3xl font-bold text-white">{inProgressBajas}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#2a2c44] border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
            <div>
              <p className="text-white/60 text-sm font-medium mb-1">Checklists Completados</p>
              <h3 className="text-3xl font-bold text-white">{completedBajas}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#2a2c44] border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <div>
              <p className="text-white/60 text-sm font-medium mb-1">Total Bajas Registradas</p>
              <h3 className="text-3xl font-bold text-white">{totalBajas}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#2a2c44] border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <AlertCircle className="w-6 h-6 text-purple-400" />
              </div>
            </div>
            <div>
              <p className="text-white/60 text-sm font-medium mb-1">Tasa de Renuncias Voluntarias</p>
              <h3 className="text-3xl font-bold text-white">{renunciasPercent}%</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Lista de Procesos */}
        <div className="xl:col-span-2 space-y-4">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-emerald-400" />
            Expedientes de Baja ({offboardings.length})
          </h2>

          {offboardings.length === 0 ? (
            <Card className="bg-[#2a2c44] border-0 text-center p-12">
              <UserX className="w-16 h-16 text-slate-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white">No hay empleados dados de baja</h3>
              <p className="text-slate-400 text-sm mt-2">Todos los empleados en plantilla están en estado ACTIVO.</p>
              <Button onClick={() => setIsBajaModalOpen(true)} className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4 mr-2" /> Iniciar una Baja
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {offboardings.map((process) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={process.id}
                >
                  <Card
                    className={`bg-[#2a2c44] border border-white/5 cursor-pointer transition-all hover:bg-[#323554] ${selectedProcess?.id === process.id ? 'ring-2 ring-emerald-500' : ''}`}
                    onClick={() => handleSelectProcess(process)}
                  >
                    <CardContent className="p-5">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-[#1a1c2e] flex items-center justify-center text-xl font-bold text-white border border-white/10">
                            {process.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="text-lg font-semibold text-white">{process.name}</h4>
                            <div className="flex items-center gap-2 text-white/60 text-sm">
                              <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> {process.title}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                          <div className="flex items-center gap-2 w-full md:justify-end">
                            <Badge variant="outline" className={getReasonColor(process.reason)}>
                              {process.reason.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline" className="bg-[#1a1c2e] text-white/80 border-white/10">
                              <Calendar className="w-3 h-3 mr-1" /> {process.date}
                            </Badge>
                          </div>

                          <div className="w-full md:w-48">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-white/60">Entrega de Activos</span>
                              <span className="text-emerald-400 font-bold">{process.progress}%</span>
                            </div>
                            <div className="w-full h-2 bg-[#1a1c2e] rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-emerald-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${process.progress}%` }}
                                transition={{ duration: 1 }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Panel Lateral - Checklist */}
        <div className="xl:col-span-1">
          <AnimatePresence mode="wait">
            {selectedProcess ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="sticky top-6"
              >
                <Card className="bg-[#2a2c44] border-0 shadow-lg">
                  <CardHeader className="border-b border-white/10 pb-4 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-xl text-white">Checklist de Recepción</CardTitle>
                      <p className="text-sm text-white/60">{selectedProcess.name}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedProcess(null)} className="text-white/60 hover:text-white">
                      <X className="w-5 h-5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-y-auto p-4 space-y-6 custom-scrollbar">

                      {/* EQUIPO */}
                      <div>
                        <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <Monitor className="w-4 h-4" /> Recuperación Equipo
                        </h3>
                        <div className="space-y-2">
                          {checklist.EQUIPO.map(item => (
                            <div key={item.id} className="flex items-center gap-3 bg-[#1a1c2e] p-3 rounded-lg border border-white/5 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleChecklistItem('EQUIPO', item.id)}>
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'}`}>
                                {item.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                              <span className={`text-sm ${item.done ? 'text-white/40 line-through' : 'text-white/80'}`}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ACCESOS */}
                      <div>
                        <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <Key className="w-4 h-4" /> Bajas de Accesos
                        </h3>
                        <div className="space-y-2">
                          {checklist.ACCESOS.map(item => (
                            <div key={item.id} className="flex items-center gap-3 bg-[#1a1c2e] p-3 rounded-lg border border-white/5 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleChecklistItem('ACCESOS', item.id)}>
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'}`}>
                                {item.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                              <span className={`text-sm ${item.done ? 'text-white/40 line-through' : 'text-white/80'}`}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* DOCUMENTOS */}
                      <div>
                        <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <FileText className="w-4 h-4" /> Documentación y Finiquito
                        </h3>
                        <div className="space-y-2">
                          {checklist.DOCUMENTOS.map(item => (
                            <div key={item.id} className="flex items-center gap-3 bg-[#1a1c2e] p-3 rounded-lg border border-white/5 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleChecklistItem('DOCUMENTOS', item.id)}>
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'}`}>
                                {item.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                              <span className={`text-sm ${item.done ? 'text-white/40 line-through' : 'text-white/80'}`}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center p-8 bg-[#2a2c44]/50 border border-white/5 rounded-2xl border-dashed min-h-[400px]"
              >
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <User className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/60 font-medium">Selecciona un empleado para ver y actualizar su checklist de entrega</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal Iniciar Proceso de Baja */}
      <Dialog open={isBajaModalOpen} onOpenChange={setIsBajaModalOpen}>
        <DialogContent className="bg-[#1e2035] border border-white/10 text-white max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
              <UserX className="w-5 h-5 text-red-400" /> Iniciar Proceso de Baja
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Selecciona el empleado activo y registra el motivo formal de desvinculación.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleStartBajaProcess} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Empleado Activo *</label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="w-full bg-[#141526] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
                required
              >
                <option value="">-- Selecciona un empleado --</option>
                {activeEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name || emp.email} ({emp.role || 'Sin rol'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Motivo de Baja *</label>
              <select
                value={bajaReason}
                onChange={(e) => setBajaReason(e.target.value)}
                className="w-full bg-[#141526] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
              >
                <option value="RENUNCIA">Renuncia Voluntaria</option>
                <option value="DESPIDO">Despido Justificado / Reestructuración</option>
                <option value="FIN_CONTRATO">Fin de Contrato</option>
                <option value="JUBILACION">Jubilación / Retiro</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Fecha Efectiva *</label>
              <input
                type="date"
                value={bajaDate}
                onChange={(e) => setBajaDate(e.target.value)}
                className="w-full bg-[#141526] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Observaciones / Encuesta de Salida</label>
              <textarea
                value={bajaNotes}
                onChange={(e) => setBajaNotes(e.target.value)}
                rows={3}
                placeholder="Motivos expresados por el empleado o detalles del finiquito..."
                className="w-full bg-[#141526] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500 placeholder:text-slate-600"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsBajaModalOpen(false)} className="text-slate-400 hover:text-white">
                Cancelar
              </Button>
              <Button type="submit" disabled={submittingBaja} className="bg-red-600 hover:bg-red-700 text-white font-semibold">
                {submittingBaja ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
                Confirmar Baja
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
