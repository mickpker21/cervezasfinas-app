import { useState, useMemo, useEffect } from 'react';

export function useMapFilters(validItems) {
  const [searchInput, setSearchInput] = useState("");
  const [mapSearch, setMapSearch] = useState("");
  const [routeFilter, setRouteFilter] = useState(null);
  const [exFilters, setExFilters] = useState({
    competencia: true,
    exclusivo: true,
    mixto: true,
  });

  // 1. Debounce Search
  useEffect(() => {
    const t = setTimeout(() => {
      setMapSearch(searchInput);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // 2. Index by Route (Optimization for 10k+)
  const routeIndex = useMemo(() => {
    const idx = new Map();
    validItems.forEach(item => {
      const route = String(item.sales_route ?? item.route ?? "SIN_RUTA").trim();
      if (!idx.has(route)) idx.set(route, []);
      idx.get(route).push(item);
    });
    return idx;
  }, [validItems]);

  // 3. Unique Routes for UI
  const routeOptions = useMemo(() => {
    return Array.from(routeIndex.keys())
      .filter(r => r !== "SIN_RUTA")
      .sort((a, b) => {
        const an = Number(a), bn = Number(b);
        if (!isNaN(an) && !isNaN(bn)) return an - bn;
        return a.localeCompare(b, "es");
      });
  }, [routeIndex]);

  // 4. Main Filtering Logic
  const filteredItems = useMemo(() => {
    // Start with subset if route filter is active
    let subset = routeFilter 
      ? (routeIndex.get(String(routeFilter)) || [])
      : validItems;

    const term = mapSearch.toLowerCase().trim();
    
    return subset.filter(item => {
      // Exclusivity Check
      const ex = String(item.exclusivity || "").trim().toLowerCase();
      if (ex === "competencia" && !exFilters.competencia) return false;
      if (ex === "exclusivo" && !exFilters.exclusivo) return false;
      if (ex === "mixto" && !exFilters.mixto) return false;
      if (!ex && !exFilters.competencia && !exFilters.exclusivo && !exFilters.mixto) return false;

      // Search Check
      if (term) {
        const name = (item.name || item.business_name || "").toLowerCase();
        const code = String(item.client_code || item.id || "").toLowerCase();
        if (!name.includes(term) && !code.includes(term)) return false;
      }

      return true;
    });
  }, [validItems, routeIndex, routeFilter, mapSearch, exFilters]);

  return {
    filteredItems,
    searchInput,
    setSearchInput,
    mapSearch,
    routeFilter,
    setRouteFilter,
    exFilters,
    setExFilters,
    routeOptions
  };
}
