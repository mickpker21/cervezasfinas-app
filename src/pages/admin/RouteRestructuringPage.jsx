import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap, Rectangle, Polygon } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Map, Users, TrendingUp, BarChart2, RefreshCw, Layers,
  ChevronDown, ChevronUp, X, Check, Download, Package,
  CalendarDays, Route, AlertCircle, Info, Filter, Hexagon, Maximize2, Minimize2, Eye, EyeOff
} from 'lucide-react';
import { fetchVentasPorSku } from '@/lib/mysqlVentasPorSku';
import { fetchAllClientsOnline } from '@/repositories/clientsRepository';
import 'leaflet/dist/leaflet.css';

// ── Color por ruta usando mapa (llamar con colorMap) ────────────────────────────────────
function getRouteColor(routeName, colorMap) {
  if (!routeName || routeName === 'Sin ruta' || routeName === 'Sin Ruta') return '#94a3b8';
  if (colorMap && colorMap[routeName]) return colorMap[routeName];
  // Fallback: deterministic but not great for similar names
  let hash = 5381;
  for (let i = 0; i < routeName.length; i++) {
    hash = ((hash << 5) + hash) ^ routeName.charCodeAt(i);
    hash = hash & 0x7fffffff;
  }
  return `hsl(${hash % 360}, 75%, 52%)`;
}

// ── Build color map with golden-ratio hue distribution ──────────────────────────────
function buildColorMap(routeNames) {
  const GOLDEN = 0.618033988749895;
  const map = {};
  const sorted = [...routeNames].sort((a, b) => a.localeCompare(b));
  sorted.forEach((name, i) => {
    const hue = Math.floor(((i * GOLDEN) % 1) * 360);
    const sat = 72 + (i % 3) * 6; // alternates between 72%, 78%, 84%
    const lit = 48 + (i % 2) * 6; // alternates between 48%, 54%
    map[name] = `hsl(${hue}, ${sat}%, ${lit}%)`;
  });
  return map;
}

// ── Convex Hull para Polígonos de Ruta ─────────────────────────────────────────
function getConvexHull(points) {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) lower.pop();
    lower.push(sorted[i]);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) upper.pop();
    upper.push(sorted[i]);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// ── Leaflet lasso (rectangle draw) ────────────────────────────────────────────
function LassoSelector({ onSelect, allClients, active }) {
  const map = useMap();
  const drawRef = useRef(null);
  const startRef = useRef(null);
  const rectRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    const container = map.getContainer();

    function onMouseDown(e) {
      if (e.button !== 0) return;
      const latlng = map.mouseEventToLatLng(e);
      startRef.current = latlng;
      map.dragging.disable();
      drawRef.current = true;
      rectRef.current = L.rectangle([latlng, latlng], { color: "#3b82f6", weight: 1 }).addTo(map);
    }

    function onMouseMove(e) {
      if (!drawRef.current || !startRef.current) return;
      const latlng = map.mouseEventToLatLng(e);
      const bounds = [[startRef.current.lat, startRef.current.lng], [latlng.lat, latlng.lng]];
      if (rectRef.current) {
        rectRef.current.setBounds(bounds);
      }
    }

    function onMouseUp(e) {
      if (!drawRef.current || !startRef.current) return;
      const endLatLng = map.mouseEventToLatLng(e);
      const minLat = Math.min(startRef.current.lat, endLatLng.lat);
      const maxLat = Math.max(startRef.current.lat, endLatLng.lat);
      const minLng = Math.min(startRef.current.lng, endLatLng.lng);
      const maxLng = Math.max(startRef.current.lng, endLatLng.lng);

      const selected = allClients.filter(c => {
        const lat = parseFloat(c.lat);
        const lng = parseFloat(c.lng);
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });

      onSelect(selected.map(c => c.id));
      drawRef.current = false;
      startRef.current = null;
      if (rectRef.current) {
        map.removeLayer(rectRef.current);
        rectRef.current = null;
      }
      map.dragging.enable();
    }

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseup', onMouseUp);
      map.dragging.enable();
      if (rectRef.current) map.removeLayer(rectRef.current);
    };
  }, [active, map, allClients, onSelect]);

  return null;
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function RouteRestructuringPage() {
  const [clients, setClients] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState(new Set());
  const [selectedRoutes, setSelectedRoutes] = useState(new Set());
  const [lassoActive, setLassoActive] = useState(false);
  const [expandedRoutes, setExpandedRoutes] = useState(new Set());

  const [activeFilterRoutes, setActiveFilterRoutes] = useState(new Set());
  const [activeFilterZones, setActiveFilterZones] = useState(new Set());
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterTab, setFilterTab] = useState('routes');

  const [pendingChanges, setPendingChanges] = useState({});
  const [newRouteInput, setNewRouteInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPolygons, setShowPolygons] = useState(false);
  const [bottomPanelView, setBottomPanelView] = useState('selected');
  const [salesPeriodMode, setSalesPeriodMode] = useState('avg3'); // 'avg3' | 'month'
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [gpsSearch, setGpsSearch] = useState('');
  const [selectedSearch, setSelectedSearch] = useState('');
  const [showAddClientPanel, setShowAddClientPanel] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [clientSearchResults, setClientSearchResults] = useState([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [addClientRoute, setAddClientRoute] = useState('');
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [hiddenRoutes, setHiddenRoutes] = useState(new Set());

  const mapRef = useRef(null);

  const simulatedClients = useMemo(() => {
    if (Object.keys(pendingChanges).length === 0) return clients;
    return clients.map(c => {
      if (pendingChanges[c.id]) {
        return { ...c, sales_route: pendingChanges[c.id].toUpperCase(), _original_route: c.sales_route };
      }
      return c;
    });
  }, [clients, pendingChanges]);

  // ── Load Data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // 1. Fetch clients first so they appear on the map immediately
        let clientData = [];
        try {
          clientData = await fetchAllClientsOnline();
        } catch (clientErr) {
          console.warn('[RouteRestructuring] Error loading clients:', clientErr);
        }

        // Normalizar coordenadas igual que en AdminClientsMapPage
        const toNumber = (v) => {
          if (typeof v === 'number') return isFinite(v) ? v : null;
          if (typeof v === 'string') { const n = parseFloat(v); return isFinite(n) ? n : null; }
          return null;
        };
        const normalize = (c) => {
          let lat = null, lng = null;
          let val = c?.coords;
          if (typeof val === 'string') {
            try { val = JSON.parse(val); } catch (e) { /* noop */ }
          }
          if (Array.isArray(val) && val.length >= 2) {
            lat = toNumber(val[0]); lng = toNumber(val[1]);
          } else if (val && typeof val === 'object') {
            lat = toNumber(val.lat ?? val.latitude ?? val.Lat ?? val.latitud);
            lng = toNumber(val.lng ?? val.longitude ?? val.Lng ?? val.longitud);
          } else {
            lat = toNumber(c.lat ?? c.latitude ?? c.latitud);
            lng = toNumber(c.lng ?? c.longitude ?? c.longitud);
          }
          if (lat != null && lng != null && lat !== 0 && lng !== 0) {
            return { ...c, lat, lng, sales_route: c.sales_route || c.internal_route || c.delivery_route };
          }
          return null;
        };

        const validClients = (clientData || []).map(normalize).filter(c => c !== null);
        setClients(validClients);

        // 2. Try fetching sales data
        try {
          const allSalesData = await fetchVentasPorSku({});
          let recentSales = [];
          if (allSalesData && allSalesData.length > 0) {
            // Find the most recent month in the data
            const allMonths = allSalesData.map(s => s.period_date).filter(Boolean).sort();
            if (allMonths.length > 0) {
              // Get the 3 complete months BEFORE the latest month
              const uniqueMonths = [...new Set(allSalesData.map(s => s.period_date?.slice(0, 7)).filter(Boolean))].sort();
              if (uniqueMonths.length >= 2) {
                // Take the last 3 complete months (excluding any partial current month if needed)
                const last3 = uniqueMonths.slice(-3);
                recentSales = allSalesData.filter(s => s.period_date && last3.some(m => s.period_date.startsWith(m)));
              } else {
                recentSales = allSalesData;
              }
            }
          }
          setSalesRows(recentSales);
        } catch (salesErr) {
          console.warn('[RouteRestructuring] Error loading sales data:', salesErr.message);
        }

        setIsDemoMode(false);
      } catch (err) {
        console.warn('[RouteRestructuring] General Error:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Build route polygons ─────────────────────────────────────────────────────
  const routePolygons = useMemo(() => {
    if (!showPolygons) return {};
    const map = {};
    simulatedClients.forEach(c => {
      if (!c.sales_route || !c.lat || !c.lng) return;
      if (!map[c.sales_route]) map[c.sales_route] = [];
      map[c.sales_route].push([parseFloat(c.lat), parseFloat(c.lng)]);
    });
    const polygons = {};
    for (const [route, pts] of Object.entries(map)) {
      if (pts.length > 2) {
        polygons[route] = getConvexHull(pts);
      }
    }
    return polygons;
  }, [simulatedClients, showPolygons]);


  // ── Available months in data ────────────────────────────────────────────────
  const availableMonths = useMemo(() => {
    return [...new Set(salesRows.map(r => r.period_date?.slice(0, 7)).filter(Boolean))].sort();
  }, [salesRows]);

  // ── Aggregate sales per client (respects period filter) ─────────────────────
  const salesByClient = useMemo(() => {
    const rows = salesPeriodMode === 'month' && selectedMonth
      ? salesRows.filter(r => r.period_date?.startsWith(selectedMonth))
      : salesRows;

    const map = {};
    rows.forEach(row => {
      const key = row.cve_cliente || row.client_code;
      if (!key) return;
      if (!map[key]) map[key] = { total: 0, months: new Set(), htls: 0, hasData: true };
      map[key].total += parseFloat(row.venta || 0);
      map[key].htls += parseFloat(row.htls_total || 0);
      if (row.period_date) map[key].months.add(row.period_date.slice(0, 7));
    });
    const result = {};
    Object.entries(map).forEach(([key, val]) => {
      const months = salesPeriodMode === 'month' ? 1 : Math.max(val.months.size, 1);
      result[key] = {
        avgMonthly: val.total / months,
        avgHlMonthly: val.htls / months,
        totalMonths: val.months.size,
        hasData: true,
      };
    });
    return result;
  }, [salesRows, salesPeriodMode, selectedMonth]);

  // ── Compute unique zones and routes ─────────────────────────────────────────
  const allAvailableRoutes = useMemo(() => [...new Set(simulatedClients.map(c => c.sales_route || 'Sin Ruta').filter(Boolean))].sort((a,b) => a.localeCompare(b)), [simulatedClients]);
  const allAvailableZones = useMemo(() => [...new Set(simulatedClients.map(c => c.zona_comercial || c.zona || 'Sin Zona').filter(Boolean))].sort((a,b) => a.localeCompare(b)), [simulatedClients]);

  // ── Route color map (golden ratio — max visual contrast between adjacent routes) ──────
  const routeColorMap = useMemo(() => buildColorMap(allAvailableRoutes), [allAvailableRoutes]);

  const rc = useCallback((routeName) => getRouteColor(routeName, routeColorMap), [routeColorMap]);

  // ── Filtered Clients (what is actually rendered and analyzed) ───────────────
  const filteredClients = useMemo(() => {
    if (activeFilterRoutes.size === 0 && activeFilterZones.size === 0) return []; // Show nothing if no filter to prevent lag
    return simulatedClients.filter(c => {
      const routeStr = c.sales_route || 'Sin Ruta';
      const zoneStr = c.zona_comercial || c.zona || 'Sin Zona';
      if (activeFilterRoutes.size > 0 && activeFilterZones.size > 0) {
        return activeFilterRoutes.has(routeStr) || activeFilterZones.has(zoneStr);
      }
      if (activeFilterRoutes.size > 0) return activeFilterRoutes.has(routeStr);
      if (activeFilterZones.size > 0) return activeFilterZones.has(zoneStr);
      return false;
    });
  }, [simulatedClients, activeFilterRoutes, activeFilterZones]);

  // ── Clients without geolocation (must be after filteredClients) ────────────────────
  const clientsWithoutGps = useMemo(() => {
    return filteredClients.filter(c => !parseFloat(c.lat) || !parseFloat(c.lng));
  }, [filteredClients]);


  // ── Aggregate stats per route (enhanced) ───────────────────────────────────
  const routeStats = useMemo(() => {
    const map = {};
    filteredClients.forEach(c => {
      const route = c.sales_route;
      if (!route) return;
      if (!map[route]) map[route] = { clientCount: 0, totalAvgSales: 0, totalAvgHl: 0, activeCount: 0, noGpsCount: 0, clients: [] };
      const saleKey = c.client_code || c.id;
      const sales = salesByClient[saleKey] || { avgMonthly: 0, avgHlMonthly: 0 };
      map[route].clientCount++;
      map[route].totalAvgSales += sales.avgMonthly;
      map[route].totalAvgHl += sales.avgHlMonthly;
      if (sales.hasData) map[route].activeCount++;
      if (!parseFloat(c.lat) || !parseFloat(c.lng)) map[route].noGpsCount++;
      map[route].clients.push(c);
    });

    // Trend: compare last month vs prev month using raw salesRows
    const monthsSorted = [...new Set(salesRows.map(r => r.period_date?.slice(0,7)).filter(Boolean))].sort();
    const lastMonth = monthsSorted[monthsSorted.length - 1];
    const prevMonth = monthsSorted[monthsSorted.length - 2];

    return Object.fromEntries(
      Object.entries(map).map(([route, stats]) => {
        // Calculate trend for this route
        let trend = null;
        if (lastMonth && prevMonth) {
          const clientKeys = new Set(stats.clients.map(c => c.client_code || c.id));
          const lastHl = salesRows
            .filter(r => r.period_date?.startsWith(lastMonth) && clientKeys.has(r.cve_cliente || r.client_code))
            .reduce((s, r) => s + parseFloat(r.htls_total || 0), 0);
          const prevHl = salesRows
            .filter(r => r.period_date?.startsWith(prevMonth) && clientKeys.has(r.cve_cliente || r.client_code))
            .reduce((s, r) => s + parseFloat(r.htls_total || 0), 0);
          trend = prevHl > 0 ? ((lastHl - prevHl) / prevHl) * 100 : null;
        }
        return [
          route,
          {
            ...stats,
            avgMonthlySales: stats.totalAvgSales,
            avgMonthlyHl: stats.totalAvgHl,
            clientsPerDay: (stats.clientCount / 26).toFixed(1),
            avgHlPerClient: stats.clientCount > 0 ? stats.totalAvgHl / stats.clientCount : 0,
            effectivenessRate: stats.clientCount > 0 ? (stats.activeCount / stats.clientCount) * 100 : 0,
            trend,
          }
        ];
      })
    );
  }, [filteredClients, salesByClient, salesRows]);

  const sortedRoutes = useMemo(() =>
    Object.keys(routeStats).sort((a, b) => a.localeCompare(b)),
    [routeStats]
  );

  // ── Selection logic ───────────────────────────────────────────────────────────
  const toggleClient = useCallback((id) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleRoute = useCallback((route) => {
    setSelectedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(route)) {
        next.delete(route);
        // Also deselect all clients of that route
        setSelectedClientIds(prevC => {
          const nextC = new Set(prevC);
          filteredClients.filter(c => c.sales_route === route).forEach(c => nextC.delete(c.id));
          return nextC;
        });
      } else {
        next.add(route);
        // Also select all clients of that route
        setSelectedClientIds(prevC => {
          const nextC = new Set(prevC);
          filteredClients.filter(c => c.sales_route === route).forEach(c => nextC.add(c.id));
          return nextC;
        });
      }
      return next;
    });
  }, [filteredClients]);

  const toggleRouteVisibility = useCallback((route, e) => {
    if (e) e.stopPropagation();
    setHiddenRoutes(prev => {
      const next = new Set(prev);
      if (next.has(route)) next.delete(route);
      else next.add(route);
      return next;
    });
  }, []);

  const handleLassoSelect = useCallback((ids) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  const clearSelection = () => {
    setSelectedClientIds(new Set());
    setSelectedRoutes(new Set());
  };

  // ── Selected clients with their data ─────────────────────────────────────────
  const selectedClients = useMemo(() =>
    filteredClients.filter(c => selectedClientIds.has(c.id)).map(c => ({
      ...c,
      sales: salesByClient[c.client_code || c.id] || { avgMonthly: 0, avgHlMonthly: 0 },
    })),
    [filteredClients, selectedClientIds, salesByClient]
  );

  // ── Summary panel stats ───────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalClients = selectedClients.length;
    const totalAvgSales = selectedClients.reduce((s, c) => s + (c.sales?.avgMonthly || 0), 0);
    const totalAvgHl = selectedClients.reduce((s, c) => s + (c.sales?.avgHlMonthly || 0), 0);
    const routesInvolved = new Set(selectedClients.map(c => c.sales_route).filter(Boolean));
    return {
      routes: routesInvolved.size,
      clients: totalClients,
      avgMonthlySales: totalAvgSales,
      avgMonthlyHl: totalAvgHl,
      clientsPerDay: totalClients > 0 ? (totalClients / 26).toFixed(1) : '0.0',
      avgHlPerClient: totalClients > 0 ? totalAvgHl / totalClients : 0,
    };
  }, [selectedClients]);

  // ── Map center ────────────────────────────────────────────────────────────────
  const mapCenter = useMemo(() => {
    const list = filteredClients.length > 0 ? filteredClients : simulatedClients;
    if (list.length === 0) return [19.42, -99.13];
    const lats = list.map(c => parseFloat(c.lat)).filter(Boolean);
    const lngs = list.map(c => parseFloat(c.lng)).filter(Boolean);
    if (lats.length === 0 || lngs.length === 0) return [19.42, -99.13];
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ];
  }, [simulatedClients, filteredClients]);

  const handleCenterMap = useCallback(() => {
    if (mapRef.current) {
      const list = filteredClients.length > 0 ? filteredClients : simulatedClients;
      if (list.length === 0) return;
      const lats = list.map(c => parseFloat(c.lat)).filter(Boolean);
      const lngs = list.map(c => parseFloat(c.lng)).filter(Boolean);
      if (lats.length === 0 || lngs.length === 0) return;
      
      const bounds = L.latLngBounds(
        L.latLng(Math.min(...lats), Math.min(...lngs)),
        L.latLng(Math.max(...lats), Math.max(...lngs))
      );
      mapRef.current.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
    }
  }, [filteredClients, simulatedClients]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [mapFullscreen]);

  const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1c2e]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-blue-500 mx-auto" />
          <p className="text-slate-400 text-sm">Cargando clientes y ventas (últimos 3 meses)…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={mapFullscreen ? "fixed inset-0 z-[99999] bg-[#1a1c2e] text-white flex flex-col overflow-hidden" : "h-screen flex flex-col bg-[#1a1c2e] text-white overflow-hidden"}>
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#12141f] border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <Route className="text-blue-400 h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Reestructurador de Rutas</h1>
            <p className="text-xs text-slate-400">Selecciona clientes en el mapa · Últimos 3 meses de venta</p>
          </div>
          {isDemoMode && (
            <span className="bg-orange-500/20 text-orange-300 text-xs px-2 py-0.5 rounded-full border border-orange-500/30 font-medium">
              MODO DEMO
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <Filter size={14} /> Filtrar Mapa {(activeFilterRoutes.size > 0 || activeFilterZones.size > 0) && <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>}
            </button>
            
            {showFilterMenu && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-[#1a1c2e] border border-slate-700 rounded-xl shadow-2xl z-[2000] flex flex-col max-h-[400px] overflow-hidden">
                <div className="flex px-3 pt-3 gap-2 border-b border-slate-700/50 pb-2">
                  <button onClick={() => setFilterTab('routes')} className={`text-xs font-medium px-2 py-1 rounded ${filterTab === 'routes' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Rutas</button>
                  <button onClick={() => setFilterTab('zones')} className={`text-xs font-medium px-2 py-1 rounded ${filterTab === 'zones' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Zonas</button>
                  <button onClick={() => { setActiveFilterRoutes(new Set()); setActiveFilterZones(new Set()); }} className="ml-auto text-xs text-red-400 hover:text-red-300 px-2 py-1">Limpiar</button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {filterTab === 'routes' && allAvailableRoutes.map(r => (
                    <label key={r} className="flex items-center gap-2 p-1.5 hover:bg-white/5 rounded cursor-pointer">
                      <input type="checkbox" checked={activeFilterRoutes.has(r)} onChange={(e) => {
                        const next = new Set(activeFilterRoutes);
                        if (e.target.checked) next.add(r); else next.delete(r);
                        setActiveFilterRoutes(next);
                      }} className="accent-blue-500" />
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: rc(r) }} />
                      <span className="text-xs text-slate-300 truncate">{r}</span>
                    </label>
                  ))}
                  {filterTab === 'zones' && allAvailableZones.map(z => (
                    <label key={z} className="flex items-center gap-2 p-1.5 hover:bg-white/5 rounded cursor-pointer">
                      <input type="checkbox" checked={activeFilterZones.has(z)} onChange={(e) => {
                        const next = new Set(activeFilterZones);
                        if (e.target.checked) next.add(z); else next.delete(z);
                        setActiveFilterZones(next);
                      }} className="accent-blue-500" />
                      <span className="text-xs text-slate-300 truncate">{z}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-1 py-0.5">
            <button
              onClick={() => setSalesPeriodMode('avg3')}
              className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${ salesPeriodMode === 'avg3' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white' }`}
            >Prom. 3M</button>
            <button
              onClick={() => { setSalesPeriodMode('month'); if (!selectedMonth && availableMonths.length) setSelectedMonth(availableMonths[availableMonths.length - 1]); }}
              className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${ salesPeriodMode === 'month' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white' }`}
            >Mes</button>
            {salesPeriodMode === 'month' && (
              <select
                value={selectedMonth || ''}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-transparent text-[10px] text-blue-300 border-none outline-none ml-1 cursor-pointer"
              >
                {availableMonths.map(m => <option key={m} value={m} className="bg-[#1a1c2e]">{m}</option>)}
              </select>
            )}
          </div>
          <button
            onClick={() => setLassoActive(l => !l)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
              lassoActive
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'bg-purple-600/20 border-purple-500/30 text-purple-300 hover:bg-purple-600/30'
            }`}
          >
            {lassoActive ? '✓ Dibujando Área' : '□ Selec. por Área'}
          </button>
          <button
            onClick={() => setShowPolygons(p => !p)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
              showPolygons
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30'
            }`}
          >
            {showPolygons ? 'Ocultar Polígonos' : 'Mostrar Polígonos'}
          </button>
          <button
            onClick={handleCenterMap}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
            title="Centrar mapa en los clientes actuales"
          >
            Centrar
          </button>
          {selectedClientIds.size > 0 && (
            <button onClick={clearSelection} className="text-xs px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 hover:bg-red-600/30 transition-all">
              <X size={12} className="inline mr-1" /> Limpiar ({selectedClientIds.size})
            </button>
          )}
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────────────── */}
      <div className={`flex flex-1 overflow-hidden transition-all duration-300`}>

        {/* ── LEFT: MAP ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Map */}
          <div className="flex-1 relative">
            <MapContainer
              center={mapCenter}
              zoom={12}
              ref={mapRef}
              style={{ height: '100%', width: '100%', background: '#1a1c2e' }}
              zoomControl={true}
            >
              <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <LassoSelector
                active={lassoActive}
                allClients={filteredClients.filter(c => !hiddenRoutes.has(c.sales_route))}
                onSelect={handleLassoSelect}
              />
              {filteredClients.map(client => {
                const lat = parseFloat(client.lat);
                const lng = parseFloat(client.lng);
                if (!lat || !lng) return null;
                if (hiddenRoutes.has(client.sales_route)) return null;
                const isSelected = selectedClientIds.has(client.id);
                const color = rc(client.sales_route);
                const saleKey = client.client_code || client.id;
                const sales = salesByClient[saleKey];
                return (
                  <CircleMarker
                    key={client.id}
                    center={[lat, lng]}
                    radius={isSelected ? 9 : 6}
                    pathOptions={{
                      color: isSelected ? '#ffffff' : color,
                      fillColor: color,
                      fillOpacity: isSelected ? 1 : 0.75,
                      weight: isSelected ? 2.5 : 1,
                    }}
                    eventHandlers={{
                      click: () => !lassoActive && toggleClient(client.id),
                    }}
                  >
                    <Popup className="custom-popup">
                      <div className="text-xs p-1 min-w-[140px] bg-[#1a1c2e] text-white">
                        <p className="font-bold truncate mb-1">{client.name}</p>
                        {sales && <p className="text-emerald-400 mb-2">Vol: {sales.avgHlMonthly.toFixed(1)} HL/mes</p>}
                        
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-400">Asignar Ruta:</label>
                          <input
                            type="text"
                            key={client.id + (client.sales_route || '')}
                            defaultValue={client.sales_route || ''}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = e.target.value.trim().toUpperCase();
                                if (val) setPendingChanges(prev => ({ ...prev, [client.id]: val }));
                                e.target.blur();
                              }
                            }}
                            onBlur={(e) => {
                              const val = e.target.value.trim().toUpperCase();
                              if (val && val !== client.sales_route) {
                                setPendingChanges(prev => ({ ...prev, [client.id]: val }));
                              }
                            }}
                            className="bg-[#12141f] border border-slate-600 rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500 uppercase"
                            placeholder="Ej. RUTA-01"
                          />
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
              {showPolygons && Object.entries(routePolygons).map(([route, hull]) => {
                if (hiddenRoutes.has(route)) return null;
                return (
                  <Polygon
                    key={`poly-${route}`}
                    positions={hull}
                    pathOptions={{
                      color: rc(route),
                      fillColor: rc(route),
                      fillOpacity: 0.15,
                      weight: 2
                    }}
                  />
                );
              })}
            </MapContainer>

            {/* Floating Bulk Assignment Panel */}
            {selectedClients.length > 0 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#12141f]/95 backdrop-blur-md rounded-xl p-3 shadow-2xl z-[1000] flex items-center gap-4 border border-blue-500/50">
                <div className="flex flex-col">
                  <span className="text-white font-bold text-sm">{selectedClients.length} seleccionados</span>
                  <span className="text-blue-300 text-[10px]">Asignar ruta a todos</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Ej. RUTA-01"
                    value={newRouteInput}
                    onChange={(e) => setNewRouteInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (!newRouteInput.trim()) return;
                        setPendingChanges(prev => {
                          const next = { ...prev };
                          selectedClients.forEach(c => {
                            next[c.id] = newRouteInput.trim();
                          });
                          return next;
                        });
                        setNewRouteInput('');
                      }
                    }}
                    className="bg-black/50 border border-blue-500/30 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-400 w-28 uppercase text-center font-medium"
                  />
                  <button
                    onClick={() => {
                      if (!newRouteInput.trim()) return;
                      setPendingChanges(prev => {
                        const next = { ...prev };
                        selectedClients.forEach(c => {
                          next[c.id] = newRouteInput.trim();
                        });
                        return next;
                      });
                      setNewRouteInput('');
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs rounded font-medium shadow-lg transition-colors"
                  >
                    Asignar
                  </button>
                </div>
              </div>
            )}

            {/* Empty state message on map */}
            {filteredClients.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center z-[1000] pointer-events-none">
                <div className="bg-black/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-slate-700/50 shadow-2xl text-center pointer-events-auto">
                  <Filter size={32} className="text-blue-500 mx-auto mb-3" />
                  <p className="text-white font-medium text-lg">El mapa está vacío</p>
                  <p className="text-slate-400 text-sm mt-1 max-w-xs">
                    Para evitar sobrecargar tu navegador, usa el botón "Filtrar Mapa" en la barra superior para cargar rutas o zonas específicas.
                  </p>
                </div>
              </div>
            )}

            {/* Map legend */}
            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg p-2.5 text-xs z-[1000] max-h-40 overflow-y-auto">
              <p className="text-slate-400 font-medium mb-1.5">Rutas</p>
              {sortedRoutes.filter(route => !hiddenRoutes.has(route)).map(route => (
                <div key={route} className="flex items-center gap-1.5 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rc(route) }} />
                  <span className="text-slate-300 truncate max-w-[100px]">{route}</span>
                </div>
              ))}
            </div>

            {/* Add Client Button + Fullscreen Button */}
            <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
              <button
                onClick={() => setMapFullscreen(f => !f)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all shadow-lg flex items-center gap-1.5 ${
                  mapFullscreen
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-[#12141f]/90 border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
                title={mapFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              >
                {mapFullscreen ? (
                  <>
                    <Minimize2 size={14} /> Salir Pantalla Completa
                  </>
                ) : (
                  <>
                    <Maximize2 size={14} /> Pantalla Completa
                  </>
                )}
              </button>
              <button
                onClick={() => { setShowAddClientPanel(p => !p); setClientSearchQuery(''); setClientSearchResults([]); }}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all shadow-lg ${
                  showAddClientPanel ? 'bg-green-600 border-green-500 text-white' : 'bg-[#12141f]/90 border-slate-600 text-green-300 hover:bg-green-600/20'
                }`}
              >
                {showAddClientPanel ? '✕ Cerrar' : '+ Agregar Clientes'}
              </button>
            </div>

            {/* Add Client Search Panel */}
            {showAddClientPanel && (
              <div className="absolute top-12 right-3 z-[1000] w-80 bg-[#12141f]/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-96">
                <div className="p-3 border-b border-slate-700/50">
                  <p className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                    <Users size={13} className="text-green-400" /> Agregar Clientes al Análisis
                  </p>
                  <input
                    type="text"
                    placeholder="Buscar por nombre, código o colonia…"
                    value={clientSearchQuery}
                    onChange={async (e) => {
                      const q = e.target.value;
                      setClientSearchQuery(q);
                      if (q.trim().length < 2) { setClientSearchResults([]); return; }
                      setClientSearchLoading(true);
                      try {
                        const { fetchClientsApi } = await import('@/lib/mysqlClients');
                        const res = await fetchClientsApi({ search: q.trim(), limit: 20 });
                        const rows = (res.rows || []);
                        // Exclude clients already in the map
                        const existing = new Set(clients.map(c => String(c.id)));
                        setClientSearchResults(rows.filter(r => !existing.has(String(r.id))));
                      } catch {
                        setClientSearchResults([]);
                      } finally {
                        setClientSearchLoading(false);
                      }
                    }}
                    className="w-full bg-[#1a1c2e] border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green-500 placeholder-slate-600"
                    autoFocus
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-slate-400">Asignar ruta:</span>
                    <input
                      type="text"
                      value={addClientRoute}
                      onChange={e => setAddClientRoute(e.target.value.toUpperCase())}
                      placeholder="Ej. RUTA-01"
                      className="flex-1 bg-[#1a1c2e] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-green-500 uppercase"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2">
                  {clientSearchLoading && (
                    <div className="flex items-center justify-center h-16 text-slate-500 text-xs">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-blue-500 mr-2" /> Buscando…
                    </div>
                  )}
                  {!clientSearchLoading && clientSearchResults.length === 0 && clientSearchQuery.length >= 2 && (
                    <p className="text-slate-500 text-xs text-center py-4">Sin resultados fuera del mapa actual.</p>
                  )}
                  {!clientSearchLoading && clientSearchQuery.length < 2 && (
                    <p className="text-slate-600 text-[10px] text-center py-4">Escribe al menos 2 caracteres para buscar clientes que no están en el mapa.</p>
                  )}
                  {clientSearchResults.map(c => (
                    <div key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium truncate">{c.name || c.business_name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{c.client_code} · {c.colony || c.city || '—'} · Ruta: {c.sales_route || '—'}</p>
                      </div>
                      <button
                        onClick={() => {
                          const route = addClientRoute.trim() || c.sales_route || '';
                          const norm = (v) => { const n = parseFloat(v); return isFinite(n) && n !== 0 ? n : null; };
                          const lat = norm(c.lat ?? c.latitud ?? c.latitude);
                          const lng = norm(c.lng ?? c.longitud ?? c.longitude ?? c.lon);
                          const newClient = { ...c, lat, lng, sales_route: route || c.sales_route };
                          setClients(prev => [newClient, ...prev]);
                          if (route) setPendingChanges(prev => ({ ...prev, [c.id]: route }));
                          setClientSearchResults(prev => prev.filter(r => r.id !== c.id));
                          if (route) setActiveFilterRoutes(prev => { const n = new Set(prev); n.add(route); return n; });
                        }}
                        className="text-[10px] bg-green-600/20 hover:bg-green-600 border border-green-600/40 text-green-400 hover:text-white px-2 py-0.5 rounded transition-all whitespace-nowrap"
                      >
                        + Agregar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── CLIENT TABLE (bottom panel) ──────────────────────────────── */}
          {!mapFullscreen && <div className="h-48 border-t border-slate-700/50 bg-[#12141f] flex-shrink-0 overflow-hidden flex flex-col">
            <div className="px-3 pt-2 flex items-center justify-between border-b border-slate-700/40">
              <div className="flex gap-4">
                <button
                  onClick={() => setBottomPanelView('selected')}
                  className={`text-xs font-semibold flex items-center gap-1.5 pb-1.5 ${bottomPanelView === 'selected' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300 transition-colors'}`}
                >
                  <Users size={13} /> Seleccionados
                  <span className="bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded text-[10px]">{selectedClients.length}</span>
                </button>
                <button
                  onClick={() => setBottomPanelView('no-gps')}
                  className={`text-xs font-semibold flex items-center gap-1.5 pb-1.5 ${bottomPanelView === 'no-gps' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300 transition-colors'}`}
                >
                  <AlertCircle size={13} /> Sin Geolocalización
                  <span className="bg-amber-600/30 text-amber-300 px-1.5 py-0.5 rounded text-[10px]">{clientsWithoutGps.length}</span>
                </button>
              </div>

              {/* GPS Search bar & Selected search bar */}
              {bottomPanelView === 'no-gps' && (
                <div className="pb-1">
                  <input
                    type="text"
                    placeholder="Buscar por nombre, código o colonia…"
                    value={gpsSearch}
                    onChange={e => setGpsSearch(e.target.value)}
                    className="bg-[#1a1c2e] border border-amber-700/30 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 w-52 placeholder-slate-600"
                  />
                </div>
              )}
              {bottomPanelView === 'selected' && (
                <div className="pb-1">
                  <input
                    type="text"
                    placeholder="Buscar por nombre, código o colonia…"
                    value={selectedSearch}
                    onChange={e => setSelectedSearch(e.target.value)}
                    className="bg-[#1a1c2e] border border-blue-700/30 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 w-52 placeholder-slate-600"
                  />
                </div>
              )}
              
              {((bottomPanelView === 'selected' && selectedClients.length > 0) || (bottomPanelView === 'no-gps' && clientsWithoutGps.length > 0)) && (
                <div className="flex items-center gap-4 pb-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nueva Ruta (ej. RUTA-01)"
                      value={newRouteInput}
                      onChange={(e) => setNewRouteInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (!newRouteInput.trim()) return;
                          const targetClients = bottomPanelView === 'selected' ? selectedClients : clientsWithoutGps;
                          setPendingChanges(prev => {
                            const next = { ...prev };
                            targetClients.forEach(c => {
                              next[c.id] = newRouteInput.trim();
                            });
                            return next;
                          });
                          setNewRouteInput('');
                        }
                      }}
                      className="bg-[#1a1c2e] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 w-36 uppercase"
                    />
                    <button
                      onClick={() => {
                        if (!newRouteInput.trim()) return;
                        const targetClients = bottomPanelView === 'selected' ? selectedClients : clientsWithoutGps;
                        setPendingChanges(prev => {
                          const next = { ...prev };
                          targetClients.forEach(c => {
                            next[c.id] = newRouteInput.trim();
                          });
                          return next;
                        });
                        setNewRouteInput('');
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-1 rounded transition-colors"
                    >
                      Asignar
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Volumen total selección: <span className="text-green-400 font-medium">{summary.avgMonthlyHl.toFixed(1)} HL/mes</span>
                  </p>
                </div>
              )}
            </div>
            <div className="overflow-auto flex-1">
              {(() => {
                const filterQ = bottomPanelView === 'selected' ? selectedSearch.toLowerCase().trim() : gpsSearch.toLowerCase().trim();
                const displayedClients = bottomPanelView === 'selected'
                  ? (filterQ
                    ? selectedClients.filter(c =>
                        (c.name || '').toLowerCase().includes(filterQ) ||
                        (c.business_name || '').toLowerCase().includes(filterQ) ||
                        (c.client_code || '').toLowerCase().includes(filterQ) ||
                        (c.colony || '').toLowerCase().includes(filterQ)
                      )
                    : selectedClients)
                  : (filterQ
                    ? clientsWithoutGps.filter(c =>
                        (c.name || '').toLowerCase().includes(filterQ) ||
                        (c.client_code || '').toLowerCase().includes(filterQ) ||
                        (c.colony || '').toLowerCase().includes(filterQ)
                      )
                    : clientsWithoutGps);
                if (displayedClients.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-full text-slate-500 text-xs gap-2">
                      <Info size={14} />
                      {bottomPanelView === 'selected'
                        ? 'Haz clic en marcadores o selecciona rutas del panel para ver clientes aquí'
                        : 'No hay clientes sin coordenadas en los filtros actuales.'}
                    </div>
                  );
                }
                return (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#12141f]">
                      <tr className="text-slate-400 text-left">
                        <th className="px-3 py-1.5 font-medium">Cliente / Nombre Comercial</th>
                        <th className="px-3 py-1.5 font-medium">Ruta</th>
                        <th className="px-3 py-1.5 font-medium">Colonia</th>
                        <th className="px-3 py-1.5 font-medium text-right">Volumen Prom./Mes</th>
                        <th className="px-3 py-1.5 font-medium text-right">Meses c/datos</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedClients.map(c => (
                        <tr key={c.id} className="border-t border-slate-700/30 hover:bg-white/5 transition-colors">
                          <td className="px-3 py-1.5 max-w-[180px]">
                            <p className="text-white font-medium truncate">{c.name || c.business_name || '—'}</p>
                            {c.business_name && c.business_name !== c.name && (
                              <p className="text-[10px] text-slate-500 truncate">{c.client_code} · {c.business_name}</p>
                            )}
                            {(!c.business_name || c.business_name === c.name) && (
                              <p className="text-[10px] text-slate-500">{c.client_code}</p>
                            )}
                          </td>
                          <td className="px-3 py-1.5 flex items-center gap-1.5">
                            <input
                              type="text"
                              key={c.id + (c.sales_route || '')}
                              defaultValue={c.sales_route || ''}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const val = e.target.value.trim().toUpperCase();
                                  if (val) setPendingChanges(prev => ({ ...prev, [c.id]: val }));
                                  e.target.blur();
                                }
                              }}
                              onBlur={(e) => {
                                const val = e.target.value.trim().toUpperCase();
                                if (val && val !== c.sales_route) {
                                  setPendingChanges(prev => ({ ...prev, [c.id]: val }));
                                }
                              }}
                              className="bg-[#1a1c2e] border border-slate-700/50 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-blue-500 w-20 uppercase font-medium"
                              style={{ color: rc(c.sales_route) }}
                            />
                            {c._original_route && c._original_route !== c.sales_route && (
                              <span className="text-[9px] text-amber-500 line-through truncate max-w-[40px]">{c._original_route}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-slate-400 truncate max-w-[120px]">{c.colony || c.city || '—'}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-400 font-medium">
                            {c.sales?.avgHlMonthly > 0 ? `${c.sales.avgHlMonthly.toFixed(1)} HL` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-400">{c.sales?.totalMonths || 0}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              {bottomPanelView === 'selected' && (
                                <button
                                  onClick={() => toggleClient(c.id)}
                                  title="Deseleccionar"
                                  className="text-slate-500 hover:text-amber-400 transition-colors"
                                >
                                  <X size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setClients(prev => prev.filter(cl => cl.id !== c.id));
                                  setSelectedClientIds(prev => { const n = new Set(prev); n.delete(c.id); return n; });
                                  setPendingChanges(prev => { const n = { ...prev }; delete n[c.id]; return n; });
                                }}
                                title="Quitar del mapa/análisis"
                                className="text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded"
                              >
                                <X size={11} /> <span className="text-[9px]">Quitar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>}
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        {!mapFullscreen && <div className="w-72 flex-shrink-0 bg-[#12141f] border-l border-slate-700/50 flex flex-col overflow-hidden">

          {/* Global Summary */}
          <div className="p-3 border-b border-slate-700/50 flex-shrink-0">
            <p className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <BarChart2 size={13} className="text-purple-400" /> Resumen Global
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Rutas', value: summary.routes, icon: Route, color: 'text-blue-400' },
                { label: 'Clientes', value: summary.clients, icon: Users, color: 'text-green-400' },
                { label: 'Clientes/Día', value: summary.clientsPerDay, icon: CalendarDays, color: 'text-amber-400', sub: 'Lun–Sáb' },
                { label: 'Volumen/Mes', value: summary.avgMonthlyHl > 0 ? `${summary.avgMonthlyHl.toFixed(1)} HL` : '—', icon: TrendingUp, color: 'text-emerald-400' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-[#1a1c2e] rounded-lg p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <kpi.icon size={11} className={kpi.color} />
                    <p className="text-[10px] text-slate-400">{kpi.label}</p>
                  </div>
                  <p className={`text-base font-bold ${kpi.color}`}>{kpi.value}</p>
                  {kpi.sub && <p className="text-[9px] text-slate-500">{kpi.sub}</p>}
                </div>
              ))}
            </div>
            {summary.avgMonthlyHl > 0 && (
              <div className="mt-2 bg-blue-600/10 rounded-lg p-2 border border-blue-500/20">
                <p className="text-[10px] text-slate-400">Volumen prom. por cliente</p>
                <p className="text-sm font-bold text-blue-300">{summary.avgHlPerClient.toFixed(2)} HL/mes</p>
              </div>
            )}
          </div>

          {/* Route List */}
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider px-1 mb-2 font-medium">
              Rutas ({sortedRoutes.length}) — Selecciona para comparar
            </p>
            <AnimatePresence>
              {sortedRoutes.map(route => {
                const stats = routeStats[route];
                const color = rc(route);
                const isSelected = selectedRoutes.has(route);
                const isExpanded = expandedRoutes.has(route);
                const isHidden = hiddenRoutes.has(route);
                return (
                  <motion.div
                    key={route}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-1.5 rounded-lg border transition-all overflow-hidden ${
                      isHidden ? 'opacity-50 bg-black/20' : isSelected ? 'bg-white/5' : 'border-slate-700/50 hover:border-slate-600/50'
                    }`}
                    style={{
                      borderColor: color,
                      borderLeftWidth: '3px',
                    }}
                  >
                    {/* Route header row */}
                    <div
                      className="flex items-center gap-2 p-2 cursor-pointer"
                      onClick={() => toggleRoute(route)}
                    >
                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 transition-all ${isSelected ? 'ring-2 ring-white/40' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold truncate ${isHidden ? 'text-slate-400 line-through' : 'text-white'}`}>{route}</p>
                        <p className="text-[10px] text-slate-400">{stats.clientCount} clientes · {stats.clientsPerDay}/día</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {Object.keys(pendingChanges).some(id => simulatedClients.find(c => c.id === id && c.sales_route === route)) && (
                          <span className="bg-amber-500/20 text-amber-300 text-[9px] px-1.5 py-0.5 rounded border border-amber-500/30">
                            Modificado
                          </span>
                        )}
                        {isSelected && <Check size={11} className="text-emerald-400" />}
                        <button
                          onClick={(e) => toggleRouteVisibility(route, e)}
                          className="p-1 text-slate-400 hover:text-white transition-colors"
                          title={isHidden ? 'Mostrar en el mapa' : 'Ocultar del mapa'}
                        >
                          {isHidden ? <EyeOff size={13} className="text-slate-500" /> : <Eye size={13} className="text-blue-400 hover:text-blue-300" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedRoutes(prev => {
                              const next = new Set(prev);
                              if (next.has(route)) next.delete(route); else next.add(route);
                              return next;
                            });
                          }}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      </div>
                    </div>

                    {/* KPI details (expanded) */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-2 pb-2 space-y-1.5"
                        >
                          <div className="bg-black/30 rounded-md p-2 space-y-1.5">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">Volumen prom./mes</span>
                              <span className="text-emerald-400 font-medium">{stats.avgMonthlyHl.toFixed(1)} HL</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">HL por cliente</span>
                              <span className="text-blue-300 font-medium">{stats.avgHlPerClient.toFixed(2)} HL</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">Clientes totales</span>
                              <span className="text-white font-medium">{stats.clientCount}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">Activos (con venta)</span>
                              <span className="text-green-400 font-medium">{stats.activeCount} <span className="text-slate-500">/ {stats.clientCount}</span></span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">% Efectividad</span>
                              <span className={`font-medium ${stats.effectivenessRate >= 70 ? 'text-green-400' : stats.effectivenessRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                {stats.effectivenessRate.toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">Tendencia MoM</span>
                              <span className={`font-medium ${stats.trend === null ? 'text-slate-500' : stats.trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {stats.trend === null ? 'N/A' : `${stats.trend >= 0 ? '+' : ''}${stats.trend.toFixed(1)}%`}
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">Sin GPS</span>
                              <span className={`font-medium ${stats.noGpsCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                {stats.noGpsCount}
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">Clientes/día</span>
                              <span className="text-amber-400 font-medium">{stats.clientsPerDay} <span className="text-slate-500">(Lun–Sáb)</span></span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Save / Export buttons */}
          <div className="p-2 border-t border-slate-700/50 flex-shrink-0 space-y-2">
            {Object.keys(pendingChanges).length > 0 && (
              <button
                disabled={isSaving}
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    // Update Supabase
                    const updates = Object.entries(pendingChanges).map(([id, newRoute]) => ({
                      id,
                      sales_route: newRoute,
                    }));
                    
                    const { supabase } = await import('@/supabaseClient');
                    const { error } = await supabase.from('clients').upsert(updates);
                    if (error) throw error;
                    
                    // On success, we commit the changes locally to avoid a full reload
                    setClients(prev => prev.map(c => {
                      if (pendingChanges[c.id]) {
                        return { ...c, sales_route: pendingChanges[c.id] };
                      }
                      return c;
                    }));
                    setPendingChanges({});
                  } catch (err) {
                    console.error('[RouteRestructuring] Error saving routes:', err);
                    alert('Error al guardar: ' + err.message);
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="w-full text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 flex items-center justify-center gap-1.5 transition-all font-medium"
              >
                {isSaving ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                ) : (
                  <>Guardar Cambios BD ({Object.keys(pendingChanges).length})</>
                )}
              </button>
            )}

            {selectedClients.length > 0 && (
              <button
                onClick={() => {
                  const csv = [
                    'Cliente,Código,Ruta Nueva,Ruta Anterior,Colonia,Ciudad,Volumen Prom HL/Mes',
                    ...selectedClients.map(c =>
                      `"${c.name}","${c.client_code || c.id}","${c.sales_route || ''}","${c._original_route || c.sales_route || ''}","${c.colony || ''}","${c.city || ''}","${(c.sales?.avgHlMonthly || 0).toFixed(2)}"`
                    )
                  ].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url;
                  a.download = `reestructura-rutas-${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
                }}
                className="w-full text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg py-2 flex items-center justify-center gap-1.5 transition-all font-medium"
              >
                <Download size={13} /> Exportar selección CSV ({selectedClients.length})
              </button>
            )}
          </div>
        </div>}
      </div>
    </div>
  );
}
