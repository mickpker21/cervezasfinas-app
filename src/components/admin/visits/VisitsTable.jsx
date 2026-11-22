import React from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';

const VisitsTable = ({ visits, onViewDetails }) => {
  const getUserTypeLabel = (type) => {
    const t = String(type || '').toLowerCase();
    if (t === 'conquista') return 'Conquista';
    if (t === 'control-interno' || t === 'control interno') return 'Control Interno';
    return type || '—';
  };

  const getActionColor = (userType) => {
    const t = String(userType || '').toLowerCase();
    if (t === 'conquista') return 'bg-blue-500/20 text-blue-300';
    if (t === 'control-interno' || t === 'control interno') return 'bg-emerald-500/20 text-emerald-300';
    return 'bg-gray-500/20 text-gray-300';
  };

  if (!visits || visits.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12 heineken-card h-full flex flex-col justify-center items-center"
      >
        <MapPin className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">No se encontraron visitas</h3>
        <p className="text-green-200">Intenta ajustar los filtros de búsqueda.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="heineken-card overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-white/5 sticky top-0 z-10 hidden md:table-header-group">
            <tr>
              <th className="text-left p-4 text-white font-semibold text-sm">Cliente</th>
              <th className="text-left p-4 text-white font-semibold text-sm">Usuario</th>
              <th className="text-left p-4 text-white font-semibold text-sm">Fecha</th>
              <th className="text-left p-4 text-white font-semibold text-sm">Hora</th>
              <th className="text-left p-4 text-white font-semibold text-sm">Acción</th>
              <th className="text-left p-4 text-white font-semibold text-sm">Fachada</th>
              <th className="text-left p-4 text-white font-semibold text-sm">Interior</th>
              <th className="text-left p-4 text-white font-semibold text-sm">Enfriador</th>
              <th className="text-left p-4 text-white font-semibold text-sm">Detalles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 hidden md:table-row-group">
            {visits.map((visit, index) => (
              <motion.tr
                key={visit.id || index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 * index }}
                className="hover:bg-white/5"
              >
                <td className="p-4">
                  <div>
                    <p className="text-white font-medium truncate max-w-[200px]" title={visit.businessName}>
                      {visit.businessName}
                    </p>
                    <p className="text-white/50 text-[10px] uppercase font-mono mt-0.5">
                      {visit.clientCode ? `#${visit.clientCode}` : ''}
                    </p>
                    {/* Only show subtitle if different from title */}
                    {visit.clientName && visit.clientName !== visit.businessName && (
                      <p className="text-green-200/70 text-xs truncate max-w-[200px]">{visit.clientName}</p>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-white text-sm">{visit.userName}</p>
                    <p className="text-white/40 text-xs">Ruta: {visit.routeNumber}</p>
                  </div>
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-white font-medium text-sm">
                      {(() => {
                        if (!visit.visit_date) return 'Sin fecha';
                        const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(String(visit.visit_date));
                        const d = isoLike
                          ? new Date(String(visit.visit_date) + 'T00:00:00')
                          : new Date(visit.visit_date);
                        if (Number.isNaN(d.getTime())) return String(visit.visit_date);
                        return d.toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });
                      })()}
                    </p>
                  </div>
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-white text-sm">{visit.hora ? visit.hora.slice(0, 5) : '—'}</p>
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getActionColor(
                      visit.userRole,
                    )} border-opacity-20`}
                  >
                    {getUserTypeLabel(visit.userRole)}
                  </span>
                </td>
                <td className="p-4">
                  {visit.photoFachada ? (
                    <a
                      href={visit.photoFachada}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 underline"
                    >
                      Ver foto
                    </a>
                  ) : (
                    <span className="text-gray-400">Sin foto</span>
                  )}
                </td>
                <td className="p-4">
                  {visit.photoInterior ? (
                    <a
                      href={visit.photoInterior}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 underline"
                    >
                      Ver foto
                    </a>
                  ) : (
                    <span className="text-gray-400">Sin foto</span>
                  )}
                </td>
                <td className="p-4">
                  {visit.photoEnfriador ? (
                    <a
                      href={visit.photoEnfriador}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 underline"
                    >
                      Ver foto
                    </a>
                  ) : (
                    <span className="text-gray-400">Sin foto</span>
                  )}
                </td>
                <td className="p-4">
                  {onViewDetails && (
                    <button
                      type="button"
                      className="px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500"
                      onClick={() => onViewDetails(visit)}
                    >
                      Ver detalles
                    </button>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>

        {/* Mobile View: Cards */}
        <div className="md:hidden space-y-4 p-4">
          {visits.map((visit, index) => (
            <motion.div
              key={visit.id || index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 * index }}
              className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-white text-sm">{visit.businessName}</h4>
                  <p className="text-xs text-white/60">{visit.clientName}</p>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getActionColor(visit.userRole)}`}>
                  {getUserTypeLabel(visit.userRole)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
                <div>
                  <span className="block text-white/40 uppercase text-[9px]">Usuario</span>
                  {visit.userName} (Ruta {visit.routeNumber})
                </div>
                <div className="text-right">
                  <span className="block text-white/40 uppercase text-[9px]">Fecha</span>
                  {visit.visit_date} {visit.hora}
                </div>
              </div>

              <div className="flex gap-2 text-xs pt-2 border-t border-white/5 flex-wrap">
                {visit.photoFachada && <a href={visit.photoFachada} target="_blank" rel="noreferrer" className="text-green-400 hover:underline">Fachada</a>}
                {visit.photoInterior && <a href={visit.photoInterior} target="_blank" rel="noreferrer" className="text-green-400 hover:underline">Interior</a>}
                {visit.photoEnfriador && <a href={visit.photoEnfriador} target="_blank" rel="noreferrer" className="text-green-400 hover:underline">Enfriador</a>}
              </div>

              {onViewDetails && (
                <button
                  type="button"
                  className="w-full mt-2 py-2 text-xs rounded bg-white/10 text-white hover:bg-white/20 border border-white/10"
                  onClick={() => onViewDetails(visit)}
                >
                  Ver detalles completos
                </button>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default VisitsTable;

