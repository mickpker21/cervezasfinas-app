import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ClipboardList, ChevronRight, Loader2 } from 'lucide-react';
import { fetchCustomSurveyTemplates } from '@/lib/mysqlCustomSurveys';

const STATIC_SURVEY_TYPES = [
  {
    id: 'CENSO_SUPERVISOR',
    label: 'Censo Supervisor',
    description: 'Inventario de enfriadores: modelo, serie, posición e invasión.',
    icon: '🧊',
    color: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30',
    textColor: 'text-cyan-300',
  }
];

export default function SurveyPanelSelector({ open, client, onClose, onSelect }) {
  const [dynamicSurveys, setDynamicSurveys] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadSurveys();
    }
  }, [open]);

  async function loadSurveys() {
    setLoading(true);
    try {
      const data = await fetchCustomSurveyTemplates(false); // solo activas
      setDynamicSurveys(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-slate-950 border-l border-white/10 flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-emerald-400" />
                  <span className="text-white font-bold text-sm">Encuestas</span>
                </div>
                {client && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">
                    {client.name || client.business_name}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-4">
                Selecciona el tipo de encuesta
              </p>

              {STATIC_SURVEY_TYPES.map((type) => (
                <motion.button
                  key={type.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelect(type.id)}
                  className={`w-full p-4 rounded-2xl border bg-gradient-to-br ${type.color} text-left flex items-center gap-4 group transition-all hover:brightness-110`}
                >
                  <span className="text-3xl">{type.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold text-sm ${type.textColor}`}>{type.label}</div>
                    <div className="text-xs text-white/40 mt-0.5 leading-tight">{type.description}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0" />
                </motion.button>
              ))}

              {loading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                </div>
              )}

              {!loading && dynamicSurveys.map((type) => (
                <motion.button
                  key={type.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelect(type.id)}
                  className={`w-full p-4 rounded-2xl border bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border-indigo-500/30 text-left flex items-center gap-4 group transition-all hover:brightness-110`}
                >
                  <span className="text-3xl">📝</span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold text-sm text-indigo-300`}>{type.title}</div>
                    <div className="text-xs text-white/40 mt-0.5 leading-tight">{type.description}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0" />
                </motion.button>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-white/5 text-center">
              <p className="text-[10px] text-slate-600">
                Se requiere geolocalización para realizar encuestas
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
