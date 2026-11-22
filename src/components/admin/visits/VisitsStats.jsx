import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, User, Building } from 'lucide-react';

export default function VisitsStats({ visits = [], visitsByRole = {}, roleCardCounts = {} }) {
  const totalVisits = visits.length;

  const uniqueClients = useMemo(() => (
    new Set(visits.map(v => v.clientName).filter(Boolean)).size
  ), [visits]);

  const uniqueUsers = useMemo(() => (
    new Set(visits.map(v => v.userName).filter(Boolean)).size
  ), [visits]);

  const todayCount = useMemo(() => {
    const todayISO = new Date().toISOString().split('T')[0];
    return visits.filter(v => {
      if (!v.visit_date) return false;
      const d = new Date(v.visit_date);
      if (isNaN(d)) return false;
      return d.toISOString().split('T')[0] === todayISO;
    }).length;
  }, [visits]);

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {/* Total visitas */}
      <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
        <p className="text-sm text-zinc-400">Total Visitas</p>
        <p className="text-3xl font-extrabold mt-1">{totalVisits}</p>
      </div>

      {/* Conquista */}
      <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
        <p className="text-sm text-zinc-400">Conquista</p>
        <p className="text-3xl font-extrabold mt-1">{roleCardCounts['conquista'] ?? 0}</p>
      </div>

      {/* Asesor dinámico */}
      <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
        <p className="text-sm text-zinc-400">Asesor dinámico</p>
        <p className="text-3xl font-extrabold mt-1">{roleCardCounts['asesor dinamico'] ?? 0}</p>
      </div>

      {/* Control interno */}
      <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
        <p className="text-sm text-zinc-400">Control Interno</p>
        <p className="text-3xl font-extrabold mt-1">{roleCardCounts['control interno'] ?? 0}</p>
      </div>

      {/* Panel: Visitas por rol detallado */}
      <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 md:col-span-2">
        <p className="text-sm text-zinc-400 mb-2">Visitas por rol (detallado)</p>
        {Object.keys(visitsByRole).length === 0 ? (
          <p className="text-zinc-400 text-sm">Sin datos para los filtros actuales.</p>
        ) : (
          <ul className="space-y-1">
            {Object.entries(visitsByRole).map(([role, count]) => (
              <li key={role} className="flex justify-between">
                <span className="text-zinc-300">{role}</span>
                <span className="font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
