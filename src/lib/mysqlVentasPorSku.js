import { Capacitor } from '@capacitor/core';
import { resilientFetch } from './network';

// En APK (Nativo) usamos URL absoluta
const API_BASE = Capacitor.isNativePlatform() ? "https://cervezasfinas.com/api" : "/api";

/**
 * Lee filas de ventas_por_sku desde MySQL vía PHP.
 * Parámetros opcionales:
 *  - from: fecha mínima (YYYY-MM-DD)
 *  - to: fecha máxima inclusiva (YYYY-MM-DD) si no se usa nextFrom
 *  - nextFrom: fecha exclusiva superior (YYYY-MM-DD) para rangos tipo [from, nextFrom)
 *  - zona: filtro de zona (string); si es "__ALL__", no se filtra.
 */
export async function fetchVentasPorSku({ from, to, nextFrom, zona, salesRoute, ruta, sales_routes, rutas, cve_cliente, cve_clientes } = {}) {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (nextFrom) params.append("nextFrom", nextFrom);
  else if (to) params.append("to", to);
  if (zona && zona !== "__ALL__") params.append("zona", zona);
  if (cve_cliente) params.append("cve_cliente", cve_cliente);
  if (cve_clientes) params.append("cve_clientes", Array.isArray(cve_clientes) ? cve_clientes.join(',') : cve_clientes);

  const routeVal = salesRoute || ruta;
  if (routeVal && routeVal !== "__ALL__") params.append("ruta", routeVal);
  if (sales_routes) params.append("sales_routes", Array.isArray(sales_routes) ? sales_routes.join(',') : sales_routes);
  if (rutas) params.append("rutas", Array.isArray(rutas) ? rutas.join(',') : rutas);

  // Usamos un timestamp para "burlar" el caché sin causar problemas de CORS (preflight)
  const timestamp = new Date().getTime();
  const url = `${API_BASE}/ventas-por-sku-read.php?${params.toString()}&_t=${timestamp}`;
  const res = await resilientFetch(url, { method: "GET" }, { timeout: 60000 }); // Longer timeout for sales
  const json = await res.json();
  return Array.isArray(json.rows) ? json.rows : [];
}

