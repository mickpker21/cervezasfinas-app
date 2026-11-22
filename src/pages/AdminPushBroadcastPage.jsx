import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, Users, AlertTriangle, Bell, Briefcase, Building2, UserCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { pushService } from '@/lib/pushService';
import { supabase } from '@/supabaseClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getShopAuthHeaders, API_URL } from '@/lib/api';

export default function AdminPushBroadcastPage({ defaultRole = null, isEmbedded = false }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState(defaultRole || 'all');
  const [jobTitle, setJobTitle] = useState('all_jobs');
  const [department, setDepartment] = useState('all_depts');
  
  const [departments, setDepartments] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([
    { id: 'shop_clients', label: '🛒 Clientes Shop (App Móvil)', color: 'bg-emerald-600' },
    { id: 'all', label: '👥 Todos los Colaboradores (CRM)', color: 'bg-emerald-500' }
  ]);

  const [activeTab, setActiveTab] = useState('roles');

  const [formData, setFormData] = useState({
    title: '',
    body: '',
    url: ''
  });

  const [shopStats, setShopStats] = useState({ devices: null, clients: null, loading: false });

  const loadShopStats = async () => {
    try {
      const endpoint = `${API_URL || '/api/shop'}/notifications/stats.php`;
      const res = await fetch(endpoint, {
        headers: await getShopAuthHeaders()
      });
      const data = await res.json();
      if (data && data.success) {
        setShopStats({ devices: data.devices, clients: data.clients, loading: false });
      }
    } catch (e) {
      console.warn("Could not load shop push stats:", e);
    }
  };

  useEffect(() => {
    if (selectedRole === 'shop_clients') {
      loadShopStats();
    }
  }, [selectedRole]);

  useEffect(() => {
    if (defaultRole) {
      setSelectedRole(defaultRole);
    }
  }, [defaultRole]);

  useEffect(() => {
    const loadFilters = async () => {
      setLoading(true);
      try {
        let d = [], j = [], t = [];
        try {
          const resD = await supabase.from('departments').select('*');
          d = resD.data || [];
        } catch (e) {
          console.warn("Could not load departments:", e);
        }
        try {
          const resJ = await supabase.from('job_titles').select('*');
          j = resJ.data || [];
        } catch (e) {
          console.warn("Could not load job_titles:", e);
        }
        try {
          const resT = await supabase.from('user_types').select('*');
          t = resT.data || [];
        } catch (e) {
          console.warn("Could not load user_types:", e);
        }
        
        setDepartments(d.map(item => ({ name: item.name || item.title || item.department_name || String(item) })).filter(x => x.name));
        setJobTitles(j.map(item => ({ name: item.name || item.title || item.job_name || String(item) })).filter(x => x.name));
        
        const colorMap = {
          'admin': 'bg-red-600',
          'administrador': 'bg-red-600',
          'supervisor': 'bg-amber-500',
          'asesor-dinamico': 'bg-blue-500',
          'asesor dinamico': 'bg-blue-500',
          'conquista': 'bg-orange-500',
          'televenta': 'bg-pink-500',
          'installer': 'bg-purple-500',
          'instalador': 'bg-purple-500',
          'analista': 'bg-indigo-500',
          'gerente': 'bg-slate-700',
          'warehouse': 'bg-cyan-600',
          'almacenista': 'bg-cyan-600',
          'autoventa': 'bg-lime-600',
          'chofer': 'bg-lime-600',
          'rh': 'bg-rose-500',
          'rrhh': 'bg-rose-500'
        };

        const dynamicRoles = [
          { id: 'shop_clients', label: '🛒 Clientes Shop (App Móvil)', color: 'bg-emerald-600' },
          { id: 'all', label: '👥 Todos los Colaboradores (CRM)', color: 'bg-emerald-500' },
          ...(t || []).map(type => {
            const typeId = type.type_name || type.id || type.name;
            const typeLabel = type.type_name || type.name || type.id || 'Rol';
            return {
              id: typeId,
              label: typeLabel,
              color: colorMap[String(typeId).toLowerCase()] || colorMap[String(typeLabel).toLowerCase()] || 'bg-slate-500'
            };
          })
        ];
        
        setAvailableRoles(dynamicRoles);
      } catch (e) {
        console.error("Error loading filters:", e);
      }
      setLoading(false);
    };
    loadFilters();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) {
      toast({ title: "Campos incompletos", description: "El título y el mensaje son obligatorios.", variant: "destructive" });
      return;
    }

    // Construir descripción de la audiencia para el confirm
    let audienceDesc = "";
    if (activeTab === 'roles') {
        audienceDesc = availableRoles.find(r => r.id === selectedRole)?.label || selectedRole;
    } else if (activeTab === 'jobs') {
        audienceDesc = jobTitle === 'all_jobs' ? "Todos los Puestos" : `Puesto: ${jobTitle}`;
    } else {
        audienceDesc = department === 'all_depts' ? "Todos los Deptos" : `Depto: ${department}`;
    }

    if (!confirm(`¿Estás seguro de enviar esta notificación a: ${audienceDesc}?`)) return;

    // Preparar filtros finales según el tab activo
    const finalRole = activeTab === 'roles' ? selectedRole : 'all';
    const finalJob = activeTab === 'jobs' && jobTitle !== 'all_jobs' ? jobTitle : null;
    const finalDept = activeTab === 'depts' && department !== 'all_depts' ? department : null;

    setLoading(true);
    try {
      const result = await pushService.broadcast(
        formData.title, 
        formData.body, 
        formData.url, 
        finalRole, 
        finalJob, 
        finalDept
      );
      if (result.success) {
        const details = result.data ? ` (Enviadas: ${result.data.sent ?? 0}, Errores: ${result.data.errors ?? 0})` : '';
        toast({ title: "¡Enviado!", description: `Se enviaron las notificaciones con éxito.${details}` });
        setFormData({ title: '', body: '', url: '' });
      } else {
        const errorMsg = typeof result.error === 'object' ? (result.error.message || JSON.stringify(result.error)) : String(result.error);
        toast({ 
          title: "Error", 
          description: errorMsg || "No se pudieron enviar las notificaciones.", 
          variant: "destructive" 
        });
      }
    } catch (err) {
      toast({ title: "Error fatal", description: "Error de conexión con el servidor.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`w-full max-w-5xl mx-auto ${isEmbedded ? 'pb-8' : 'pb-20'}`}>
      {!isEmbedded && (
        <Helmet>
          <title>Notificaciones Globales - Admin</title>
        </Helmet>
      )}

      {!isEmbedded ? (
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-amber-500/20 rounded-2xl">
            <Zap className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Transmisión Global</h1>
            <p className="text-slate-400">Envía notificaciones push segmentadas por Rol, Puesto o Departamento.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 rounded-xl border border-rose-500/30">
              <Bell className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Notificaciones Push Masivas</h2>
              <p className="text-xs text-gray-400">Emisión en tiempo real vía Firebase Cloud Messaging (FCM v1)</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            FCM v1 Activo
          </span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card className="bg-slate-900/50 border-white/10 overflow-hidden shadow-2xl">
            <CardHeader className="border-b border-white/5 bg-white/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="w-5 h-5 text-green-400" />
                Nueva Notificación
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSend} className="space-y-8">
                
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    Seleccionar Audiencia
                  </label>
                  
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid grid-cols-3 bg-slate-950/50 border border-white/10 p-1 h-12">
                      <TabsTrigger value="roles" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2">
                        <UserCircle className="w-4 h-4" /> Roles
                      </TabsTrigger>
                      <TabsTrigger value="jobs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2">
                        <Briefcase className="w-4 h-4" /> Puestos
                      </TabsTrigger>
                      <TabsTrigger value="depts" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2">
                        <Building2 className="w-4 h-4" /> Deptos
                      </TabsTrigger>
                    </TabsList>

                    <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/5 min-h-[160px]">
                      <TabsContent value="roles" className="mt-0">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {availableRoles.map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => setSelectedRole(role.id)}
                              className={`px-3 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                selectedRole === role.id 
                                  ? 'bg-indigo-500/20 border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                                  : 'bg-transparent border-white/5 text-slate-500 hover:border-white/10'
                              }`}
                            >
                              <div className={`w-2 h-2 rounded-full mb-2 mx-auto ${role.color}`} />
                              {role.label}
                            </button>
                          ))}
                        </div>
                      </TabsContent>

                      <TabsContent value="jobs" className="mt-0">
                         <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setJobTitle('all_jobs')}
                              className={`px-3 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                jobTitle === 'all_jobs' 
                                  ? 'bg-indigo-500/20 border-indigo-500 text-white' 
                                  : 'bg-transparent border-white/5 text-slate-500'
                              }`}
                            >
                              <div className="w-2 h-2 rounded-full mb-2 mx-auto bg-emerald-500" />
                              Todos los Puestos
                            </button>
                            {jobTitles.map((j) => (
                              <button
                                key={j.name}
                                type="button"
                                onClick={() => setJobTitle(j.name)}
                                className={`px-3 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                  jobTitle === j.name 
                                    ? 'bg-indigo-500/20 border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                                    : 'bg-transparent border-white/5 text-slate-500 hover:border-white/10'
                                }`}
                              >
                                <div className="w-2 h-2 rounded-full mb-2 mx-auto bg-slate-400" />
                                {j.name}
                              </button>
                            ))}
                         </div>
                      </TabsContent>

                      <TabsContent value="depts" className="mt-0">
                         <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setDepartment('all_depts')}
                              className={`px-3 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                department === 'all_depts' 
                                  ? 'bg-indigo-500/20 border-indigo-500 text-white' 
                                  : 'bg-transparent border-white/5 text-slate-500'
                              }`}
                            >
                              <div className="w-2 h-2 rounded-full mb-2 mx-auto bg-emerald-500" />
                              Todos los Deptos
                            </button>
                            {departments.map((d) => (
                              <button
                                key={d.name}
                                type="button"
                                onClick={() => setDepartment(d.name)}
                                className={`px-3 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                  department === d.name 
                                    ? 'bg-indigo-500/20 border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                                    : 'bg-transparent border-white/5 text-slate-500 hover:border-white/10'
                                }`}
                              >
                                <div className="w-2 h-2 rounded-full mb-2 mx-auto bg-slate-400" />
                                {d.name}
                              </button>
                            ))}
                         </div>
                      </TabsContent>
                    </div>
                  </Tabs>

                  {selectedRole === 'shop_clients' && (
                    <div className={`mt-4 p-4 rounded-xl border text-xs leading-relaxed transition-all ${
                      shopStats.devices === 0 
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : shopStats.devices > 0 
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300'
                    }`}>
                      <div className="flex items-start gap-2.5">
                        <div className="text-base shrink-0 mt-0.5">
                          {shopStats.devices === 0 ? '⚠️' : shopStats.devices > 0 ? '📱' : '⏳'}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-sm mb-1 flex items-center justify-between">
                            <span>
                              {shopStats.devices === null ? (
                                'Verificando dispositivos móviles con la App...'
                              ) : shopStats.devices === 0 ? (
                                '0 Dispositivos Móviles Registrados con la App'
                              ) : (
                                `${shopStats.devices} Dispositivo(s) Registrado(s) (${shopStats.clients} cliente(s))`
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={loadShopStats}
                              className="text-[10px] text-slate-400 hover:text-white underline ml-2"
                            >
                              Actualizar
                            </button>
                          </div>
                          {shopStats.devices === 0 ? (
                            <p className="text-amber-200/90 text-xs">
                              Para que las notificaciones lleguen al teléfono, el cliente debe tener instalada la <strong>App Móvil (APK)</strong> con su sesión iniciada y permisos de notificación otorgados en Android.
                              <br className="my-1" />
                              <span className="text-slate-400 text-[11px]">
                                * Si tienes la sesión abierta en un navegador web (Chrome/Safari en PC o móvil), el navegador no genera token FCM nativo sin la aplicación instalada.
                              </span>
                            </p>
                          ) : (
                            <p className="text-emerald-300/90 text-xs">
                              Esta notificación push se transmitirá instantáneamente a los {shopStats.devices} dispositivo(s) móviles vía Firebase Cloud Messaging (FCM v1).
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Título de la Notificación</label>
                    <Input 
                      placeholder="Ej: ¡Nuevo Comunicado Importante!" 
                      value={formData.title}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      className="bg-slate-950/50 border-white/10 text-white h-12 focus:border-indigo-500 transition-all"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Mensaje (Cuerpo)</label>
                    <Textarea 
                      placeholder="Escribe aquí lo que aparecerá en el celular del usuario..." 
                      value={formData.body}
                      onChange={e => setFormData({...formData, body: e.target.value})}
                      className="bg-slate-950/50 border-white/10 text-white min-h-[140px] focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">URL de Destino (Opcional)</label>
                    <Input 
                      placeholder="Ej: /admin/helpdesk" 
                      value={formData.url}
                      onChange={e => setFormData({...formData, url: e.target.value})}
                      className="bg-slate-950/50 border-white/10 text-white h-12 focus:border-indigo-500 transition-all"
                    />
                    <p className="text-[10px] text-slate-500 italic">Si el usuario toca la notificación, se abrirá esta página.</p>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-8 rounded-2xl transition-all shadow-xl shadow-indigo-900/30 text-lg uppercase tracking-widest"
                >
                  {loading ? "Enviando..." : "Enviar Notificación Ahora"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-amber-500/10 border-amber-500/20 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                SISTEMA CRÍTICO
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                Esta acción enviará una alerta push inmediata a los dispositivos móviles. No se puede deshacer.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                Resumen de Audiencia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-black text-white uppercase break-words">
                {activeTab === 'roles' ? (availableRoles.find(r => r.id === selectedRole)?.label) : 
                 activeTab === 'jobs' ? (jobTitle === 'all_jobs' ? 'Cualquier Puesto' : jobTitle) :
                 (department === 'all_depts' ? 'Cualquier Depto' : department)}
              </div>
              <p className="text-[10px] text-slate-500 mt-2 uppercase font-bold tracking-tighter">
                Segmentación activa por {activeTab === 'roles' ? 'Rol' : activeTab === 'jobs' ? 'Puesto' : 'Departamento'}
              </p>
            </CardContent>
          </Card>

          <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-900/80 via-purple-900/80 to-slate-900 border border-white/10 relative overflow-hidden group shadow-2xl backdrop-blur-md">
            <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <Bell className="w-40 h-40 text-white" />
            </div>
            <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Vista Previa Móvil
            </h4>
            <div className="bg-slate-950/80 rounded-2xl p-4 border border-white/10 shadow-inner">
               <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 bg-red-600 rounded flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">★</span>
                  </div>
                  <div className="text-[9px] text-indigo-300 font-black uppercase tracking-tighter">Cervezas Finas</div>
               </div>
               <div className="text-xs font-bold text-white mb-1 line-clamp-1">{formData.title || "Título de la notificación"}</div>
               <div className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{formData.body || "El contenido del mensaje aparecerá aquí en el dispositivo del colaborador..."}</div>
            </div>
            <div className="mt-4 flex justify-center">
                <div className="w-12 h-1 bg-white/20 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
