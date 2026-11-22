import React, { useMemo } from 'react';
import { Users, MapPin, Navigation, Info } from 'lucide-react';

export const NearbyClientsList = ({ clients, userPos, onSelectClient, humanMeters }) => {
  // Sort by distance if userPos exists
  const sortedClients = useMemo(() => {
    if (!userPos || !clients.length) return clients.slice(0, 20);
    
    return [...clients]
      .map(c => {
        const dist = Math.sqrt(
          Math.pow(c.coords.lat - userPos.lat, 2) + 
          Math.pow(c.coords.lng - userPos.lng, 2)
        ) * 111320; // Rough conversion to meters
        return { ...c, distance: dist };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 30); // Top 30 closest
  }, [clients, userPos]);

  if (!clients.length) return (
    <div className="p-8 text-center">
      <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
        <Users className="w-6 h-6 text-white/20" />
      </div>
      <p className="text-white/40 text-sm italic">No hay clientes en el radio seleccionado</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-emerald-500" />
          <h3 className="text-xs font-black uppercase tracking-widest text-white/80">Clientes Cercanos</h3>
        </div>
        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/30">
          {clients.length} Total
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {sortedClients.map((client) => (
          <button
            key={client.id}
            onClick={() => onSelectClient(client)}
            className="w-full group flex items-start gap-3 p-3 rounded-xl hover:bg-white/10 transition-all border border-transparent hover:border-white/10 text-left"
          >
            <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs shadow-lg transition-transform group-hover:scale-110 ${
              client.exclusivity === 'exclusivo' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              client.exclusivity === 'mixto' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              {client.sales_route || client.route || '?'}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                  {client.business_name || client.name}
                </h4>
                {client.distance && (
                  <span className="shrink-0 text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    {humanMeters(client.distance)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/40 truncate mt-0.5">
                {client.address}
              </p>
              <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] font-bold uppercase text-white/30 tracking-tighter">Click para ver detalles</span>
                <Info className="w-3 h-3 text-white/20" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
