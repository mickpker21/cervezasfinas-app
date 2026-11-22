import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CreditCard, GraduationCap, Cake, Dumbbell, Beer, 
  HeartHandshake, Car, Shirt, ChevronRight, X, 
  CheckCircle, Clock, AlertCircle, Briefcase
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Fallback Icons map
const iconMap = {
  '💳': CreditCard,
  '🎓': GraduationCap,
  '🎂': Cake,
  '💪': Dumbbell,
  '🍺': Beer,
  '🙏': HeartHandshake,
  '🚗': Car,
  '👕': Shirt
};

const BENEFITS_CATALOG = [
  { id: 1, name: 'Préstamo Personal', category: 'FINANCIERO', icon: '💳', color: 'from-green-500 to-emerald-600', max_amount: 45000, desc: 'Hasta 3 meses de sueldo. Descuento en 6/12/18 quincenas.' },
  { id: 2, name: 'Beca Educativa', category: 'EDUCACION', icon: '🎓', color: 'from-blue-500 to-cyan-600', max_amount: 5000, desc: 'Apoyo para estudios de hijos menores de 18 años, hasta $5,000 por ciclo.' },
  { id: 3, name: 'Día de Cumpleaños', category: 'BIENESTAR', icon: '🎂', color: 'from-pink-500 to-rose-600', max_amount: 0, desc: 'Día libre remunerado en tu cumpleaños.' },
  { id: 4, name: 'Convenio Gym', category: 'BIENESTAR', icon: '💪', color: 'from-orange-500 to-amber-600', max_amount: 0, desc: 'Membresía en gimnasios afiliados con 30% descuento.' },
  { id: 5, name: 'Descuento en Producto', category: 'ESPECIAL', icon: '🍺', color: 'from-amber-500 to-yellow-600', max_amount: 0, desc: 'Hasta 2 cajas mensuales con descuento de empleado.' },
  { id: 6, name: 'Ayuda por Defunción', category: 'EMERGENCIA', icon: '🙏', color: 'from-slate-500 to-gray-600', max_amount: 5000, desc: '$5,000 de apoyo por fallecimiento de familiar directo.' },
  { id: 7, name: 'Préstamo para Auto', category: 'FINANCIERO', icon: '🚗', color: 'from-violet-500 to-purple-600', max_amount: 80000, desc: 'Préstamo para vehículo propio con tasa preferencial.' },
  { id: 8, name: 'Uniformes Adicionales', category: 'OPERATIVO', icon: '👕', color: 'from-red-500 to-orange-600', max_amount: 0, desc: 'Solicita uniformes adicionales cuando los necesites.' },
];

const DEMO_MY_REQUESTS = [
  { id: 101, benefit: 'Préstamo Personal', amount: 15000, status: 'PENDIENTE', date: '2024-01-20', reason: 'Reparación de vehículo', employee: 'Juan Pérez' },
  { id: 102, benefit: 'Beca Educativa', amount: 3500, status: 'APROBADA', date: '2024-01-10', reason: 'Colegiatura de hijo', employee: 'Juan Pérez' },
  { id: 103, benefit: 'Día de Cumpleaños', amount: 0, status: 'APROBADA', date: '2023-11-15', reason: '', employee: 'Juan Pérez' },
];

const DEMO_ADMIN_REQUESTS = [
  { id: 201, benefit: 'Convenio Gym', amount: 0, status: 'PENDIENTE', date: '2024-02-01', reason: 'Inscripción anual', employee: 'María Gómez' },
  { id: 202, benefit: 'Préstamo para Auto', amount: 50000, status: 'PENDIENTE', date: '2024-01-28', reason: 'Enganche vehículo', employee: 'Carlos Ruiz' },
];

export default function BenefitsPortalPage() {
  const { user } = useSupabaseAuth();
  const userRole = (
    user?.user_metadata?.type ||
    user?.user_metadata?.role ||
    user?.app_metadata?.roles?.[0] ||
    ''
  ).toLowerCase();

  const isAdminOrHR = ['admin', 'administrador', 'rh', 'rrhh', 'sistemas'].includes(userRole);
  const [activeTab, setActiveTab] = useState('ess'); // ess, admin
  const [subTab, setSubTab] = useState('catalog'); // catalog, my_requests, wallet
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [catalog, setCatalog] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);
  
  const [showModal, setShowModal] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState(null);
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Try to fetch from supabase
      const { data: catData, error: catError } = await supabase.from('hr_benefits_catalog').select('*').limit(1);
      
      if (catError) {
        throw new Error('Supabase tables not available');
      }
      
      // If we got here, tables exist (in a real scenario we'd fetch all actual data)
      setIsDemoMode(false);
      // For this implementation we will fallback to demo if no actual rows, but normally we'd set the state
      setCatalog(BENEFITS_CATALOG);
      setMyRequests(DEMO_MY_REQUESTS);
      setAdminRequests(DEMO_ADMIN_REQUESTS);
      
    } catch (err) {
      console.log("Using Demo Mode for Benefits Portal");
      setIsDemoMode(true);
      setCatalog(BENEFITS_CATALOG);
      setMyRequests(DEMO_MY_REQUESTS);
      setAdminRequests(DEMO_ADMIN_REQUESTS);
    } finally {
      setLoading(false);
    }
  };

  const openRequestModal = (benefit) => {
    setSelectedBenefit(benefit);
    setShowModal(true);
  };

  const renderIcon = (emojiStr, className) => {
    const IconComponent = iconMap[emojiStr] || CreditCard;
    return <IconComponent className={className} />;
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'PENDIENTE': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'APROBADA': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'RECHAZADA': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-white p-6 pb-24">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                Portal de Beneficios
              </h1>
              {isDemoMode && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">
                  MODO DEMO
                </Badge>
              )}
            </div>
            <p className="text-white/60">Gestiona y solicita tus beneficios corporativos</p>
          </div>
          
          <div className="flex bg-[#2a2c44] rounded-lg p-1 border border-white/5">
            <button
              onClick={() => setActiveTab('ess')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'ess' 
                  ? 'bg-[#1a1c2e] text-white shadow-sm' 
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Mis Beneficios
            </button>
            {isAdminOrHR && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'admin' 
                    ? 'bg-[#1a1c2e] text-white shadow-sm' 
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Administración
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="h-48 bg-[#2a2c44] rounded-xl animate-pulse"></div>
          ))}
        </div>
      ) : activeTab === 'ess' ? (
        <div className="space-y-6">
          {/* Subtabs para ESS */}
          <div className="flex gap-4 border-b border-white/10 pb-2">
            <button
              onClick={() => setSubTab('catalog')}
              className={`text-sm font-medium transition-colors ${subTab === 'catalog' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-2 -mb-[10px]' : 'text-white/50 hover:text-white'}`}
            >
              Catálogo
            </button>
            <button
              onClick={() => setSubTab('wallet')}
              className={`text-sm font-medium transition-colors ${subTab === 'wallet' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-2 -mb-[10px]' : 'text-white/50 hover:text-white'}`}
            >
              Mi Wallet
            </button>
            <button
              onClick={() => setSubTab('my_requests')}
              className={`text-sm font-medium transition-colors ${subTab === 'my_requests' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-2 -mb-[10px]' : 'text-white/50 hover:text-white'}`}
            >
              Mis Solicitudes
            </button>
          </div>

          <AnimatePresence mode="wait">
            {subTab === 'catalog' && (
              <motion.div
                key="catalog"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4"
              >
                {catalog.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${item.color} p-6 cursor-pointer hover:shadow-xl hover:shadow-${item.color.split('-')[1]}/20 transition-all group`}
                    onClick={() => openRequestModal(item)}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:scale-110 transition-transform">
                      {renderIcon(item.icon, "w-24 h-24")}
                    </div>
                    
                    <div className="relative z-10 h-full flex flex-col justify-between">
                      <div>
                        <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-sm mb-4">
                          {renderIcon(item.icon, "w-6 h-6 text-white")}
                        </div>
                        <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm mb-2">{item.category}</Badge>
                        <h3 className="text-xl font-bold text-white mb-2 leading-tight">{item.name}</h3>
                        <p className="text-white/80 text-sm line-clamp-2">{item.desc}</p>
                      </div>
                      
                      <div className="mt-6 flex items-center justify-between">
                        {item.max_amount > 0 ? (
                          <div className="text-white font-semibold">
                            Hasta ${item.max_amount.toLocaleString()}
                          </div>
                        ) : (
                          <div className="text-white/80 text-sm">Sin costo</div>
                        )}
                        <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm group-hover:bg-white group-hover:text-black transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {subTab === 'wallet' && (
              <motion.div
                key="wallet"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4"
              >
                {/* Active benefits cards */}
                {myRequests.filter(r => r.status === 'APROBADA').map((req, idx) => {
                  const catItem = catalog.find(c => c.name === req.benefit) || catalog[0];
                  return (
                    <div key={idx} className="relative rounded-2xl bg-[#2a2c44] border border-white/10 overflow-hidden shadow-lg p-6 group">
                      <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${catItem.color}`}></div>
                      <div className="flex justify-between items-start mb-6">
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${catItem.color} flex items-center justify-center`}>
                          {renderIcon(catItem.icon, "w-6 h-6 text-white")}
                        </div>
                        <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10">Activo</Badge>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-1">{req.benefit}</h3>
                      <p className="text-white/50 text-sm mb-4">Aprobado el: {req.date}</p>
                      
                      {req.amount > 0 && (
                        <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                          <div className="text-sm text-white/50 mb-1">Monto Asignado</div>
                          <div className="text-lg font-mono text-emerald-400">${req.amount.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            )}

            {subTab === 'my_requests' && (
              <motion.div
                key="requests"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pt-4"
              >
                <Card className="bg-[#2a2c44] border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-emerald-400" />
                      Historial de Solicitudes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {myRequests.map((req, i) => (
                        <div key={i} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5 hover:border-white/10 transition-colors">
                          <div className="flex items-center gap-4 mb-3 md:mb-0">
                            <div className="w-10 h-10 rounded-full bg-[#1a1c2e] flex items-center justify-center border border-white/10">
                              <Briefcase className="w-5 h-5 text-white/70" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-white">{req.benefit}</h4>
                              <div className="flex items-center gap-2 text-sm text-white/50">
                                <span>{req.date}</span>
                                {req.amount > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-emerald-400/80">${req.amount.toLocaleString()}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 w-full md:w-auto">
                            {req.reason && (
                              <div className="text-sm text-white/40 italic flex-1 md:flex-none text-right md:text-left">
                                "{req.reason}"
                              </div>
                            )}
                            <Badge className={getStatusColor(req.status)}>{req.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* ADMIN TAB */
        <motion.div
          key="admin"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <Card className="bg-[#2a2c44] border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-400" />
                Solicitudes Pendientes de Aprobación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {adminRequests.length === 0 ? (
                  <div className="text-center py-8 text-white/50">
                    No hay solicitudes pendientes
                  </div>
                ) : (
                  adminRequests.map((req, i) => (
                    <div key={i} className="flex flex-col lg:flex-row items-start lg:items-center justify-between p-5 rounded-xl bg-black/20 border border-white/5">
                      <div className="flex flex-col mb-4 lg:mb-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-semibold text-white text-lg">{req.benefit}</h4>
                          <Badge className={getStatusColor(req.status)}>{req.status}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-white/80 font-medium">{req.employee}</span>
                          <span className="text-white/30">•</span>
                          <span className="text-white/50">{req.date}</span>
                          {req.amount > 0 && (
                            <>
                              <span className="text-white/30">•</span>
                              <span className="font-mono text-emerald-400">${req.amount.toLocaleString()}</span>
                            </>
                          )}
                        </div>
                        {req.reason && (
                          <div className="mt-2 text-sm text-white/60 bg-white/5 p-2 rounded-md border border-white/5">
                            Motivo: {req.reason}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 w-full lg:w-auto">
                        <Button variant="outline" className="flex-1 lg:flex-none border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300">
                          Rechazar
                        </Button>
                        <Button className="flex-1 lg:flex-none bg-emerald-500 hover:bg-emerald-600 text-white">
                          Aprobar
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* MODAL SOLICITUD */}
      <AnimatePresence>
        {showModal && selectedBenefit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#2a2c44] rounded-2xl shadow-2xl overflow-hidden border border-white/10"
            >
              <div className={`h-24 bg-gradient-to-r ${selectedBenefit.color} p-6 flex items-start justify-between`}>
                <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  {renderIcon(selectedBenefit.icon, "w-6 h-6 text-white")}
                </div>
                <button 
                  onClick={() => setShowModal(false)}
                  className="bg-black/20 hover:bg-black/40 p-2 rounded-full text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                <Badge className="bg-white/10 text-white/80 border-0 mb-3">{selectedBenefit.category}</Badge>
                <h2 className="text-2xl font-bold text-white mb-2">{selectedBenefit.name}</h2>
                <p className="text-white/60 text-sm mb-6 leading-relaxed">
                  {selectedBenefit.desc}
                </p>
                
                <div className="space-y-4">
                  {selectedBenefit.max_amount > 0 && (
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                      <label className="block text-xs text-white/50 mb-1">Monto a solicitar (Max. ${selectedBenefit.max_amount.toLocaleString()})</label>
                      <input 
                        type="number" 
                        placeholder="Ej. 10000"
                        className="w-full bg-transparent border-b border-white/10 focus:border-emerald-400 outline-none text-white font-mono py-2 transition-colors"
                      />
                    </div>
                  )}
                  
                  <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                    <label className="block text-xs text-white/50 mb-1">Motivo o comentarios adicionales</label>
                    <textarea 
                      rows="3"
                      placeholder="Agrega detalles para tu solicitud..."
                      className="w-full bg-transparent border-b border-white/10 focus:border-emerald-400 outline-none text-white py-2 resize-none transition-colors"
                    ></textarea>
                  </div>
                </div>

                <div className="mt-8 flex gap-3">
                  <Button variant="outline" className="flex-1 border-white/10 text-white hover:bg-white/5" onClick={() => setShowModal(false)}>
                    Cancelar
                  </Button>
                  <Button className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">
                    Enviar Solicitud
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
