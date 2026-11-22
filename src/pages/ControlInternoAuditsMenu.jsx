import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ClipboardCheck, FileText, ChevronRight, Loader2, Warehouse, Store, Award } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { fetchCustomAuditTemplates } from '@/lib/mysqlCustomAudits';

const STATIC_AUDITS = [
  {
    to: '/ops/delivery-audit',
    title: 'Auditoría de Reparto',
    description: 'Checklist de seguridad y operativos clásico',
    icon: ClipboardCheck,
    color: { bg: 'bg-blue-500/20', icon: 'text-blue-400', border: 'hover:border-blue-500/50' }
  },
  {
    to: '/control-interno/auditoria-puntos',
    title: 'Auditoría Puntos de Lealtad vs Ventas',
    description: 'Conciliación de puntos otorgados vs ventas_por_sku, canjes y top premios',
    icon: Award,
    color: { bg: 'bg-amber-500/20', icon: 'text-amber-400', border: 'hover:border-amber-500/50' }
  },
  {
    to: '/ops/bodega-audit',
    title: 'Check-List Encargado de Bodega',
    description: 'Actividades al inicio, operativas y cierre de bodega',
    icon: Warehouse,
    color: { bg: 'bg-emerald-500/20', icon: 'text-emerald-400', border: 'hover:border-emerald-500/50' }
  },
  {
    to: '/ops/um6-audit',
    title: 'Check-List UM6',
    description: 'Apertura, operación y cierre de Unidad de Mercado',
    icon: Store,
    color: { bg: 'bg-purple-500/20', icon: 'text-purple-400', border: 'hover:border-purple-500/50' }
  },
];

export default function ControlInternoAuditsMenu() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTemplates() {
      setLoading(true);
      try {
        const data = await fetchCustomAuditTemplates(false); // solo activos
        setTemplates(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, []);

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <Helmet><title>Auditorías Disponibles | Cervezas Finas</title></Helmet>

      <div className="flex items-center gap-4 mb-6 px-4">
        <div className="p-3 bg-emerald-500/20 rounded-2xl">
          <ClipboardCheck className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Auditorías Disponibles</h1>
          <p className="text-slate-400 text-sm">Selecciona el tipo de auditoría a realizar</p>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Auditorías estáticas (hardcoded) */}
        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Auditorías Estándar</p>
        {STATIC_AUDITS.map((audit, index) => {
          const Icon = audit.icon;
          return (
            <Link key={audit.to} to={audit.to}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card className={`bg-slate-900/60 border-slate-800/60 ${audit.color.border} transition-colors shadow-lg cursor-pointer`}>
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl ${audit.color.bg} flex items-center justify-center`}>
                        <Icon className={`w-6 h-6 ${audit.color.icon}`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{audit.title}</h3>
                        <p className="text-sm text-slate-400">{audit.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          );
        })}

        {/* Auditorías dinámicas (desde BD) */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : templates.length > 0 ? (
          <>
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mt-4 mb-2">Auditorías Personalizadas</p>
            {templates.map((t, index) => (
              <Link key={t.id} to={`/ops/custom-audit/${t.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (index + STATIC_AUDITS.length) * 0.06 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Card className="bg-slate-900/60 border-slate-800/60 hover:border-orange-500/50 transition-colors shadow-lg cursor-pointer">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-orange-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">{t.title}</h3>
                          <p className="text-sm text-slate-400">{t.description}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-500" />
                    </CardContent>
                  </Card>
                </motion.div>
              </Link>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
