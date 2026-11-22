import React from 'react';
import { 
  X, Phone, MapPin, Hash, Truck, Snowflake, 
  Store, ClipboardCheck, Edit, History, ExternalLink, Navigation, Loader2 
} from 'lucide-react';

export const ClientDetailsPremium = ({ 
  client, 
  onClose, 
  onRegisterVisit, 
  onEdit, 
  isFlagged,
  visitList: VisitList,
  onNavigate,
  isRouting
}) => {
  if (!client) return null;

  const hasCooler = !!(
    (Array.isArray(client.cooler_serials) ? client.cooler_serials.length > 0 : client.cooler_serials) || 
    client.has_cooler || 
    client.enfriador
  );
  const hasFacade = !!(
    (Array.isArray(client.facade_serials) ? client.facade_serials.length > 0 : client.facade_serials) ||
    client.has_facade || 
    client.fachada
  );
  const gecStatus = client.gec || client.gec_status || "N/A";

  return (
    <div className="relative overflow-hidden bg-slate-950 text-white rounded-3xl shadow-2xl border border-white/10 max-w-md w-full animate-in fade-in zoom-in duration-300">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl -mr-16 -mt-16 rounded-full"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 blur-3xl -ml-16 -mb-16 rounded-full"></div>

      {/* Header with Title and Close */}
      <div className="relative p-6 pb-4 flex items-start justify-between border-b border-white/5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider rounded-full border border-emerald-500/30">
              Cliente Verificado
            </span>
            {isFlagged && (
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider rounded-full border border-red-500/30 animate-pulse">
                🚩 Sin Venta
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black tracking-tight leading-tight uppercase">
            {client.business_name || client.name}
          </h2>
          <div className="flex items-center gap-1.5 text-white/50 text-sm mt-1">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{client.address || "Dirección no disponible"}</span>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
        {/* Quick Stats/Badges Row */}
        <div className="p-6 pt-4 grid grid-cols-3 gap-3">
          <div className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${hasCooler ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/10 text-white/30'}`}>
            <Snowflake className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-bold uppercase">Enfriador</span>
            <span className="text-[9px] opacity-70">{hasCooler ? 'Sí' : 'No'}</span>
          </div>
          <div className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${hasFacade ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-white/30'}`}>
            <Store className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-bold uppercase">Fachada</span>
            <span className="text-[9px] opacity-70">{hasFacade ? 'Sí' : 'No'}</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <ClipboardCheck className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-bold uppercase">GEC</span>
            <span className="text-[9px] opacity-70 font-mono">{gecStatus}</span>
          </div>
        </div>

        {/* Main Details Section */}
        <div className="px-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/40 text-[11px] font-bold uppercase tracking-wider">
                <Hash className="w-3 h-3" /> Código Cliente
              </div>
              <div className="text-sm font-mono text-emerald-400">{client.client_code || "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/40 text-[11px] font-bold uppercase tracking-wider">
                <Truck className="w-3 h-3" /> Ruta Asignada
              </div>
              <div className="text-sm font-bold">Ruta {client.sales_route || client.route || "—"}</div>
            </div>
          </div>

          {client.phone && client.phone !== "0" && (
            <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 group-hover:scale-110 transition-transform">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-white/40 font-bold uppercase">Teléfono de Contacto</div>
                  <div className="text-sm font-medium">{client.phone}</div>
                </div>
              </div>
              <a 
                href={`tel:${client.phone}`}
                className="p-2 bg-emerald-500 text-white rounded-lg shadow-lg hover:bg-emerald-600 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Detailed Assets Section */}
          {client.detailed_assets && client.detailed_assets.length > 0 && (
             <div className="p-3 bg-white/5 rounded-xl border border-white/5">
               <div className="text-[10px] text-white/40 font-bold uppercase mb-2">Equipos Registrados ({client.detailed_assets.length})</div>
               <div className="space-y-2">
                 {client.detailed_assets.map((asset, idx) => (
                   <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                      <div className="flex flex-col">
                        <span className="font-mono text-emerald-400">{asset.asset_serial || asset.serial || "S/N"}</span>
                        <span className="text-[10px] text-white/40 uppercase">{asset.asset_type || "Activo"}</span>
                      </div>
                      <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] rounded uppercase font-bold">
                        {asset.action || "Instalado"}
                      </span>
                   </div>
                 ))}
               </div>
             </div>
          )}
        </div>

        {/* History / Visits Section */}
        <div className="mt-6 p-6 bg-white/[0.02] border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">Últimas Visitas</h3>
          </div>
          <div className="max-h-40 overflow-y-auto custom-scrollbar">
             {VisitList && <VisitList clientId={client.id} compact />}
          </div>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="p-6 flex flex-wrap gap-3">
        <button
          onClick={() => onRegisterVisit(client)}
          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl shadow-xl shadow-emerald-900/20 transition-all active:scale-[0.98]"
        >
          <ClipboardCheck className="w-5 h-5" /> Registrar Visita
        </button>
        
        {onNavigate && (
          <button
            onClick={() => onNavigate(client)}
            disabled={isRouting}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold rounded-2xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98]"
          >
            {isRouting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
            {isRouting ? "Trazando..." : "Navegar Aquí"}
          </button>
        )}
        
        {onEdit && (
          <button
            onClick={() => onEdit(client)}
            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl border border-white/10 transition-all"
            title="Editar Cliente"
          >
            <Edit className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
