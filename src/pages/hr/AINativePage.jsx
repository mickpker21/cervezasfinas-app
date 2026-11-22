import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, Sparkles, Search, MessageSquare, Shield, 
  Cpu, FileText, Zap, CheckCircle2, AlertTriangle, 
  ArrowRight, RefreshCw, BarChart2, Users, FileSearch
} from 'lucide-react';
import { supabase } from '@/mysqlClient';

const AINativePage = () => {
  const [activeTab, setActiveTab] = useState('copilot');
  const [query, setQuery] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'ai', text: 'Hola, soy el Asistente Copilot de HCM. ¿En qué puedo ayudarte hoy? Puedo analizar rotación de personal, resumir expedientes o redactar descripciones de puesto.' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Mock Agents
  const agents = [
    { id: 1, name: 'Agente de Onboarding', status: 'Activo', tasks_today: 14, efficiency: '98%', icon: Users, color: 'text-emerald-400 bg-emerald-400/10' },
    { id: 2, name: 'Agente de Reclutamiento', status: 'Activo', tasks_today: 42, efficiency: '94%', icon: Search, color: 'text-purple-400 bg-purple-400/10' },
    { id: 3, name: 'Agente de Soporte HRSD', status: 'Activo', tasks_today: 89, efficiency: '99%', icon: MessageSquare, color: 'text-blue-400 bg-blue-400/10' },
    { id: 4, name: 'Analista de Riesgo de Salida', status: 'Idle', tasks_today: 5, efficiency: '91%', icon: AlertTriangle, color: 'text-amber-400 bg-amber-400/10' }
  ];

  // Mock Semantic Search Results
  const searchResults = [
    { title: 'Política de Teletrabajo 2026.pdf', relevance: '96%', excerpt: '...los colaboradores en modalidad híbrida deben registrar su asistencia a través del portal...' },
    { title: 'Manual de Beneficios y Prestaciones.docx', relevance: '89%', excerpt: '...el seguro de gastos médicos mayores cubre a dependientes directos previa aprobación...' },
    { title: 'Reglamento Interior de Trabajo.pdf', relevance: '84%', excerpt: '...el periodo vacacional debe solicitarse con al menos 15 días de anticipación...' }
  ];

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMsg = query;
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setQuery('');
    setIsTyping(true);

    setTimeout(() => {
      let reply = 'He analizado tu solicitud en la base de conocimientos. ';
      if (userMsg.toLowerCase().includes('vacaciones')) {
        reply += 'De acuerdo con el Reglamento Interior, la política de vacaciones requiere 15 días de anticipación y aprobación de tu supervisor directo.';
      } else if (userMsg.toLowerCase().includes('rotacion') || userMsg.toLowerCase().includes('rotación')) {
        reply += 'El modelo predictivo sugiere que la rotación en la Zona Sur ha disminuido un 2.4% este trimestre gracias al nuevo programa de beneficios.';
      } else {
        reply += `Procesé "${userMsg}". No encontré anomalías en los registros recientes de MySQL.`;
      }
      setChatMessages(prev => [...prev, { sender: 'ai', text: reply }]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-purple-900/40 via-indigo-900/40 to-slate-900/60 p-6 rounded-2xl border border-purple-500/20 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 rounded-xl border border-purple-500/30 text-purple-400">
              <Sparkles className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Volumen XIX — AI Native Platform
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  IA Autónoma
                </span>
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                Capa transversal de Inteligencia Artificial, Agentes Autónomos y Búsqueda Semántica
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('copilot')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'copilot' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700'}`}
          >
            Copilot HR
          </button>
          <button 
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'agents' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700'}`}
          >
            Agentes Autónomos
          </button>
          <button 
            onClick={() => setActiveTab('semantic')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'semantic' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700'}`}
          >
            Búsqueda Semántica
          </button>
        </div>
      </div>

      {/* TAB 1: COPILOT HR */}
      {activeTab === 'copilot' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#2a2c44] rounded-2xl p-6 border border-slate-700/50 flex flex-col h-[550px]">
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-purple-400" />
                <span className="font-semibold text-white">Copilot Conversacional HCM</span>
              </div>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Modelo Llama 3 / GPT-4 Connected
              </span>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {chatMessages.map((msg, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] p-4 rounded-2xl ${msg.sender === 'user' ? 'bg-purple-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'}`}>
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 text-slate-400 text-xs flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Procesando consulta en MySQL & Vector Store...
                  </div>
                </div>
              )}
            </div>

            {/* Form Input */}
            <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
              <input
                type="text"
                placeholder="Pregunta sobre políticas, sugerencias de vacantes, análisis de datos..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
              <button 
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-white px-5 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
              >
                Enviar <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* Prompt Templates & Quick Actions */}
          <div className="space-y-6">
            <div className="bg-[#2a2c44] rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" /> Prompts Rápidos
              </h3>
              <div className="space-y-3">
                {[
                  '¿Cuáles son los puestos con mayor riesgo de rotación este mes?',
                  'Generar borrador de contrato para Desarrollador Senior.',
                  'Resumir política de reembolso de viáticos en rutas.'
                ].map((promptText, i) => (
                  <button 
                    key={i}
                    onClick={() => setQuery(promptText)}
                    className="w-full text-left p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-xs text-slate-300 transition-all hover:border-purple-500/40"
                  >
                    "{promptText}"
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#2a2c44] rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-400" /> Uso de Recursos IA
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Consultas Hoy</span>
                  <span className="text-white font-medium">1,240 / 10,000</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full w-[12.4%]" />
                </div>
                <div className="flex justify-between text-slate-400 pt-2">
                  <span>Latencia Promedio</span>
                  <span className="text-emerald-400 font-medium">240ms</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AGENTES AUTÓNOMOS */}
      {activeTab === 'agents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <div key={agent.id} className="bg-[#2a2c44] rounded-2xl p-6 border border-slate-700/50 space-y-4">
                <div className="flex justify-between items-start">
                  <div className={`p-3 rounded-xl ${agent.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${agent.status === 'Activo' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-slate-700 text-slate-400'}`}>
                    {agent.status}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-white">{agent.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">Automatización autónoma basada en eventos de MySQL.</p>
                </div>
                <div className="pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Tareas Hoy</span>
                    <span className="text-slate-200 font-semibold">{agent.tasks_today}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Eficiencia</span>
                    <span className="text-emerald-400 font-semibold">{agent.efficiency}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: BÚSQUEDA SEMÁNTICA */}
      {activeTab === 'semantic' && (
        <div className="bg-[#2a2c44] rounded-2xl p-6 border border-slate-700/50 space-y-6">
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3">
            <FileSearch className="h-5 w-5 text-purple-400" />
            <input 
              type="text" 
              placeholder="Buscar en todos los documentos, políticas y expedientes de la empresa..."
              className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resultados Semánticos Relacionados</h3>
            {searchResults.map((res, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                    <FileText className="h-4 w-4" /> {res.title}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                    Relevancia: {res.relevance}
                  </span>
                </div>
                <p className="text-xs text-slate-400 italic">"{res.excerpt}"</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AINativePage;
