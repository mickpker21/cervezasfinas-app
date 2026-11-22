import React from 'react';
import { LocateFixed, ZoomOut, Crosshair, Filter, Search } from "lucide-react";

export const MapToolbar = ({
  geoMsg,
  secureCtx,
  filters,
  setFilters,
  routeFilter,
  setRouteFilter,
  routeOptions,
  followMe,
  setFollowMe,
  lastUpdate,
  getAndCenter,
  fitAllClients,
  userPos,
  totalNearby,
  totalFiltered,
  mapSearch,
  setMapSearch,
  allowManualPick,
  setPickManual
}) => {
  return (
    <div className="relative w-full bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-3 mb-2">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow-md">
            <LocateFixed className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-white font-bold text-xs">Filtros</h3>
        </div>

        <div className="flex-1 max-w-md mx-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input 
                    type="text" 
                    placeholder="Buscar por nombre o código..."
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/30 focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
                />
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {allowManualPick && (
            <button
              type="button"
              onClick={() => setPickManual(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 transition-all duration-200 shadow-lg hover:shadow-xl"
              title="Colocar mi ubicación manualmente"
            >
              <Crosshair className="w-4 h-4" /> Elegir
            </button>
          )}

          <button
            type="button"
            onClick={getAndCenter}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <LocateFixed className="w-4 h-4" /> Centrar en Mí
          </button>

          <button
            type="button"
            onClick={fitAllClients}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 transition-all duration-200 shadow-lg"
          >
            <ZoomOut className="w-4 h-4" /> Ver Todos
          </button>
        </div>
      </div>

      {/* Warning Message */}
      {(!!geoMsg || !secureCtx) && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs backdrop-blur-sm">
          <div className="mt-0.5">⚠️</div>
          <div className="flex-1">
            {geoMsg || "El sitio no es seguro (usa HTTPS o localhost) para geolocalización automática."}
          </div>
        </div>
      )}

      {/* Filters Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-stretch">
        {/* Exclusivity Filters */}
        <div className="col-span-2 md:col-span-2 lg:col-span-2 bg-white/5 p-3 rounded-xl border border-white/10">
          <div className="flex items-center gap-1.5 mb-2">
            <Filter className="w-3.5 h-3.5 text-white/70" />
            <span className="text-[11px] font-semibold text-white/90">Exclusividad</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { key: "competencia", label: "Comp.", color: "#2563eb" },
              { key: "exclusivo", label: "Excl.", color: "#16a34a" },
              { key: "mixto", label: "Mixto", color: "#eab308" },
            ].map(({ key, label, color }) => (
              <label
                key={key}
                className={`flex flex-col items-center justify-center gap-1 px-1 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer transition-all duration-200 ${filters[key]
                  ? "bg-white/20 border border-white/40 shadow-sm"
                  : "bg-white/5 border border-white/10 hover:bg-white/10"
                  }`}
              >
                <input
                  type="checkbox"
                  checked={!!filters[key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
                  className="sr-only"
                />
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ background: color }}
                />
                <span className="text-white truncate w-full text-center leading-tight">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Route Filter */}
        <div className="col-span-1 bg-white/5 p-3 rounded-xl border border-white/10 flex flex-col justify-center">
          <label className="block text-[11px] font-semibold text-white/90 mb-2">Filtrar Ruta</label>
          <select
            className="w-full px-2 py-1.5 text-[11px] bg-slate-800 border border-white/20 rounded-md text-white outline-none"
            value={routeFilter ?? ""}
            onChange={(e) => setRouteFilter(e.target.value || null)}
          >
            <option value="">Todas</option>
            {routeOptions.map((r) => (
              <option key={r} value={r}>
                Ruta {r}
              </option>
            ))}
          </select>
        </div>

        {/* Follow Me Toggle */}
        <div className="col-span-1 bg-white/5 p-3 rounded-xl border border-white/10 flex flex-col justify-center items-center">
          <label className="flex flex-col items-center gap-2 cursor-pointer group mb-1">
            <span className="text-[11px] font-medium text-white/90 text-center">Seguir GPS</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={followMe}
                onChange={(e) => setFollowMe(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-white/20 rounded-full peer-checked:bg-gradient-to-r peer-checked:from-emerald-500 peer-checked:to-teal-600 transition-all duration-300 shadow-inner"></div>
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-300 peer-checked:translate-x-5 shadow-sm"></div>
            </div>
          </label>
          {lastUpdate && (
            <p className="text-[9px] text-white/50 w-full text-center">Act. {lastUpdate}</p>
          )}
        </div>

        {/* Stats */}
        <div className="col-span-2 md:col-span-4 lg:col-span-1 flex items-center justify-center bg-white/5 rounded-xl border border-white/10 px-3">
            <div className="text-[10px] text-white/60 text-center leading-tight">
               <span className="font-bold text-emerald-400">{totalNearby}</span> / <span className="font-bold text-white/90">{totalFiltered}</span>
               <br/>Clientes
            </div>
        </div>
      </div>
    </div>
  );
};
