import L from 'leaflet';

export const createClusterCustomIcon = function (cluster) {
  const count = cluster.getChildCount();
  let size = 'small';
  if (count > 10) size = 'medium';
  if (count > 100) size = 'large';

  return L.divIcon({
    html: `<div><span>${count}</span></div>`,
    className: `marker-cluster-custom marker-cluster-${size}`,
    iconSize: L.point(40, 40, true),
  });
};

export const EX_COLORS = {
  competencia: "#2563eb",
  exclusivo: "#16a34a",
  mixto: "#eab308",
};

export const DEFAULT_DOT = "#6b7280";

const iconCache = new Map();

export function toSet(maybe) {
  if (!maybe) return null;
  if (maybe instanceof Set) return maybe;
  if (Array.isArray(maybe)) return new Set(maybe.map(String));
  return null;
}

export function isFlagged(item, flaggedCodesSet, flaggedIdsSet) {
  if (!item) return false;
  if (item.no_sales_with_asset || item.flag_no_sales) return true;

  const code = item.client_code ?? item.codigo ?? null;
  if (code && flaggedCodesSet?.has(String(code))) return true;

  const id = item.id ?? item.clientId ?? item.client_id ?? null;
  if (id && flaggedIdsSet?.has(String(id))) return true;

  return false;
}

export function getDotIcon(exclusivityRaw, routeRaw, flagged = false, customColor = null) {
  const ex = String(exclusivityRaw || "").trim().toLowerCase();
  const fill = customColor || EX_COLORS[ex] || DEFAULT_DOT;

  let routeTxt = routeRaw == null ? "" : String(routeRaw).trim();
  if (routeTxt.length > 3) routeTxt = routeTxt.slice(0, 3);

  const key = `dot:${fill}:${routeTxt}:${flagged ? "F" : "-"}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const html = `
  <span style="
    position:relative;
    display:grid;place-items:center;
    width:32px;height:32px;border-radius:50%;
    background:linear-gradient(135deg, ${fill} 0%, ${fill}dd 100%);
    border:3px solid #fff;
    box-shadow:0 4px 12px rgba(0,0,0,.25), 0 2px 6px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.3);
    color:#fff;font-weight:800;font-size:11px;line-height:1;
    text-shadow:0 1px 3px rgba(0,0,0,.5);
    transition: transform 0.2s ease;
    cursor: pointer;
  ">
    <span style="position:relative;z-index:2;">${routeTxt || ""}</span>
    ${flagged
      ? `<span title="Sin venta este mes con equipo" style="
      position:absolute; top:-8px; right:-8px;
      width:20px;height:20px;
      background:linear-gradient(135deg, #ef4444, #dc2626);
      border:2px solid #fff;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:11px; line-height:1;
      box-shadow:0 2px 8px rgba(239,68,68,0.4);
      z-index:3;
    ">🚩</span>`
      : ""
    }
    <span style="
      position:absolute;
      inset:0;
      border-radius:50%;
      background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), transparent 60%);
      pointer-events:none;
    "></span>
  </span>`;

  const icon = L.divIcon({
    className: "bg-transparent border-none cmp-marker-dot-premium",
    html: html.trim(),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
  iconCache.set(key, icon);
  return icon;
}

export function humanMeters(m) {
  if (m == null) return "";
  if (m < 950) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function normalizeCoords(coords, row) {
  const toNum = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  let c = coords;
  if (typeof c === "string") {
    try {
      const parsed = JSON.parse(c);
      if (parsed) c = parsed;
    } catch (e) {
      const sep = c.includes(",") ? "," : c.includes(";") ? ";" : null;
      if (sep) {
        const [a, b] = c.split(sep).map((s) => s.trim());
        const lat = toNum(a);
        const lng = toNum(b);
        if (lat != null && lng != null) return { lat, lng };
      }
    }
  }
  if (Array.isArray(c) && c.length >= 2) {
    const lat = toNum(c[0]);
    const lng = toNum(c[1]);
    if (lat != null && lng != null) return { lat, lng };
  }
  if (c && typeof c === "object") {
    const lat = toNum(c.lat ?? c.latitude ?? c.latitud ?? c.Lat);
    const lng = toNum(c.lng ?? c.longitude ?? c.longitud ?? c.Lng);
    if (lat != null && lng != null) return { lat, lng };
  }
  if (row && typeof row === "object") {
    const lat = toNum(row.lat ?? row.latitude ?? row.latitud);
    const lng = toNum(row.lng ?? row.longitude ?? row.longitud);
    if (lat != null && lng != null) return { lat, lng };
  }
  return null;
}
