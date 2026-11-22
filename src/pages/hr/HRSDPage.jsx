import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, FileText, LifeBuoy, Clock, BookOpen, ChevronRight, 
  Activity, AlertCircle, CheckCircle, Clock3, AlertTriangle, PlusCircle,
  HelpCircle, Shield, Briefcase
} from 'lucide-react';

// Attempt to import Supabase client. If it fails or is undefined, we'll catch it in the fetch.
// eslint-disable-next-line
import { supabase } from '@/supabaseClient';

const mockTickets = [
  { id: 'T-1042', subject: 'Duda sobre cálculo de vacaciones', status: 'Open', priority: 'Medium', created_at: '2026-07-25', sla_status: 'On Track' },
  { id: 'T-1041', subject: 'Error en el sistema de nómina', status: 'In Progress', priority: 'High', created_at: '2026-07-24', sla_status: 'Breaching Soon' },
  { id: 'T-1039', subject: 'Solicitud de carta patronal', status: 'Resolved', priority: 'Low', created_at: '2026-07-22', sla_status: 'Met' },
];

const mockCatalog = [
  { id: 1, title: 'Cartas y Constancias', icon: FileText, desc: 'Cartas laborales, constancias de sueldo' },
  { id: 2, title: 'Nómina y Beneficios', icon: Briefcase, desc: 'Cambios de cuenta, dudas de pago' },
  { id: 3, title: 'Soporte TI', icon: Shield, desc: 'Accesos, reseteo de contraseñas' },
  { id: 4, title: 'Recursos Humanos', icon: HelpCircle, desc: 'Políticas, vacaciones, permisos' },
];

const mockFaqs = [
  { id: 1, question: '¿Cómo solicito mis vacaciones?', answer: 'Puedes solicitarlas a través del módulo de Tiempo y Asistencia, requiere aprobación de tu jefe directo.', category: 'Vacaciones' },
  { id: 2, question: '¿Cuándo se paga la prima vacacional?', answer: 'Se deposita en la primera quincena posterior a tu aniversario en la empresa.', category: 'Beneficios' },
  { id: 3, question: '¿Cómo actualizo mi cuenta bancaria?', answer: 'Levanta un ticket en la categoría "Nómina y Beneficios" adjuntando tu estado de cuenta.', category: 'Nómina' },
];

export default function HRSDPage() {
  const [tickets, setTickets] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tickets');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    let useDemo = false;

    try {
      if (!supabase) throw new Error('Supabase client not found');
      
      const { data: ticketsData, error: ticketsError } = await supabase.from('hr_tickets').select('*');
      if (ticketsError) throw ticketsError;
      
      const { data: catalogData, error: catalogError } = await supabase.from('hr_service_catalog').select('*');
      if (catalogError) throw catalogError;

      if (ticketsData && ticketsData.length > 0) {
        setTickets(ticketsData);
        setCatalog(catalogData || []);
        setFaqs(mockFaqs); // Assuming FAQs are static or from another table
      } else {
        useDemo = true;
      }
    } catch (error) {
      console.warn('Failed to fetch from Supabase, using mock data:', error);
      useDemo = true;
    }

    if (useDemo) {
      setIsDemoMode(true);
      setTickets(mockTickets);
      setCatalog(mockCatalog);
      setFaqs(mockFaqs);
    }
    
    setLoading(false);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Open': return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'In Progress': return <Clock3 className="w-4 h-4 text-blue-400" />;
      case 'Resolved': return <CheckCircle className="w-4 h-4 text-green-400" />;
      default: return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  const getSLAColor = (sla) => {
    switch (sla) {
      case 'On Track': return 'text-green-400 bg-green-400/10';
      case 'Breaching Soon': return 'text-orange-400 bg-orange-400/10';
      case 'Breached': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1c2e] text-white flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
          <Activity className="w-8 h-8 text-blue-500" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-slate-200 p-6 font-sans">
      
      {/* Header Section */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <LifeBuoy className="w-8 h-8 text-blue-500" />
            HR Service Delivery
          </h1>
          <p className="text-slate-400 mt-1">Centro Global de Servicios para Empleados</p>
        </div>

        {isDemoMode && (
          <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 px-4 py-2 rounded-full text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            Modo Demo Activado
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (Tickets & SLAs) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Quick Stats / SLAs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <motion.div whileHover={{ y: -2 }} className="bg-[#2a2c44] p-5 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">Tickets Abiertos</span>
                <LifeBuoy className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-2xl font-semibold text-white">{tickets.filter(t => t.status !== 'Resolved').length}</span>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} className="bg-[#2a2c44] p-5 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">SLA de Respuesta</span>
                <Clock className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-2xl font-semibold text-white">98%</span>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} className="bg-[#2a2c44] p-5 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">Satisfacción (CSAT)</span>
                <Activity className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-2xl font-semibold text-white">4.8/5.0</span>
            </motion.div>
          </div>

          {/* Tickets List */}
          <div className="bg-[#2a2c44] rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Mis Tickets Recientes
              </h2>
              <button className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">
                <PlusCircle className="w-4 h-4" />
                Nuevo Ticket
              </button>
            </div>
            <div className="divide-y divide-white/5">
              {tickets.map((ticket, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={ticket.id} 
                  className="p-5 hover:bg-white/[0.02] transition-colors cursor-pointer group flex flex-col sm:flex-row justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-medium text-slate-400">{ticket.id}</span>
                      <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">{ticket.subject}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        {getStatusIcon(ticket.status)} {ticket.status}
                      </span>
                      <span>Creado: {ticket.created_at}</span>
                    </div>
                  </div>
                  <div className="flex items-center sm:flex-col sm:items-end gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      ticket.priority === 'High' ? 'bg-red-500/10 text-red-400' : 
                      ticket.priority === 'Medium' ? 'bg-yellow-500/10 text-yellow-400' : 
                      'bg-green-500/10 text-green-400'
                    }`}>
                      {ticket.priority} Priority
                    </span>
                    {ticket.sla_status && (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getSLAColor(ticket.sla_status)}`}>
                        SLA: {ticket.sla_status}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column (Catalog & KB) */}
        <div className="space-y-6">
          
          {/* Service Catalog */}
          <div className="bg-[#2a2c44] rounded-2xl border border-white/5 p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Catálogo de Servicios</h2>
            <div className="grid grid-cols-1 gap-3">
              {catalog.map((service, idx) => {
                const Icon = service.icon || FileText;
                return (
                  <motion.div 
                    whileHover={{ scale: 1.02 }}
                    key={service.id || idx}
                    className="p-3 rounded-xl bg-[#1a1c2e] border border-white/5 flex items-center gap-3 cursor-pointer hover:border-blue-500/50 transition-colors"
                  >
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-white">{service.title}</h3>
                      <p className="text-xs text-slate-400">{service.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Knowledge Base */}
          <div className="bg-[#2a2c44] rounded-2xl border border-white/5 p-5">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-400" />
              Base de Conocimiento
            </h2>
            
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar FAQs..." 
                className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="space-y-3">
              {faqs.map((faq) => (
                <div key={faq.id} className="p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer border border-transparent hover:border-white/5">
                  <span className="text-xs font-medium text-purple-400 mb-1 block">{faq.category}</span>
                  <h3 className="text-sm font-medium text-slate-200">{faq.question}</h3>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
