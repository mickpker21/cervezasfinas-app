/**
 * sofiaDataService.js
 * Detecta la intención del usuario y consulta los repositorios existentes
 * para darle a Sofía datos reales del CRM como contexto.
 */

import { getSalesBySku } from '@/repositories/salesRepository';
import { getGoals, getAllGoals } from '@/repositories/goalsRepository';
import { getTercerizados } from '@/repositories/tercerizadosRepository';
import { getAllVisits } from '@/repositories/visitsRepository';
import { getAllEvaluations } from '@/repositories/evaluationsRepository';
import { getClientsPaged } from '@/repositories/clientsRepository';
import { getAllSupervisions } from '@/repositories/onboardSupervisionRepository';

// ─── Utilidades de fecha ────────────────────────────────────────────────────
function getMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  return { from, to };
}

function getTodayRange() {
  const today = new Date().toISOString().split('T')[0];
  return { from: today, to: today };
}

function getWeekRange() {
  const now  = new Date();
  const day  = now.getDay(); // 0=Dom
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Lunes
  const from = new Date(now.setDate(diff)).toISOString().split('T')[0];
  const to   = new Date().toISOString().split('T')[0];
  return { from, to };
}

// ─── Detección de intención ─────────────────────────────────────────────────
const INTENTS = {
  ventas: {
    keywords: ['venta', 'ventas', 'vendí', 'vendimos', 'hl', 'hectolitro', 'importe', 'monto', 'factura', 'facturé', 'facturamos', 'cuanto vendí', 'cuanto vendimos'],
    fetch: fetchSalesContext,
  },
  comparativo: {
    keywords: ['comparativo', 'vs año', 'año pasado', 'año anterior', 'comparar ventas', 'tendencia', 'crecimiento'],
    fetch: fetchComparativeContext,
  },
  metas: {
    keywords: ['meta', 'metas', 'objetivo', 'avance', 'cumplimiento', 'porcentaje', '% de', 'cuánto me falta', 'alcanzar'],
    fetch: fetchGoalsContext,
  },
  tercerizados: {
    keywords: ['tercerizado', 'tercerizados', 'promo', 'promoción', 'cinco hl', '5 hl', 'avance promo', 'clientes promo'],
    fetch: fetchTercerizadosContext,
  },
  visitas: {
    keywords: ['visita', 'visitas', 'visité', 'visitamos', 'cobertura', 'cuántos clientes visité', 'bitácora', 'fui a'],
    fetch: fetchVisitsContext,
  },
  clientes: {
    keywords: ['cliente', 'clientes', 'activos', 'inactivos', 'pdv', 'puntos de venta', 'cuántos clientes', 'mi cartera'],
    fetch: fetchClientsContext,
  },
  evaluaciones: {
    keywords: ['evaluación', 'evaluaciones', 'evalué', 'checklist', 'pdv evaluado', 'calificación', 'puntaje', 'evaluación pdv'],
    fetch: fetchEvaluationsContext,
  },
  supervisiones: {
    keywords: ['supervisión', 'supervisiones', 'supervisé', 'abordo', 'a bordo', 'onboard', 'acompañé', 'recorrido', 'supervisión a bordo'],
    fetch: fetchSupervisionsContext,
  },
};

/**
 * Detecta la intención principal del mensaje del usuario.
 * Retorna null si no detecta ninguna intención de datos.
 */
export function detectIntent(userMsg) {
  const msg = userMsg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [intent, config] of Object.entries(INTENTS)) {
    if (config.keywords.some(kw => msg.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return intent;
    }
  }
  return null;
}

/**
 * Función principal: detecta intención y fetcha los datos relevantes.
 * Retorna un string con el contexto de datos para pasarle a Groq.
 */
export async function fetchContextForMessage(userMsg, user) {
  const intent = detectIntent(userMsg);
  if (!intent) return null;

  try {
    const fetcher = INTENTS[intent].fetch;
    const context = await fetcher(user);
    return context;
  } catch (err) {
    console.warn(`[SofíaData] Error obteniendo datos para intención "${intent}":`, err);
    return `[Nota: Intenté obtener datos de ${intent} pero ocurrió un error de conexión. Responde basándote en tu conocimiento general del módulo.]`;
  }
}

// ─── Fetchers por intención ──────────────────────────────────────────────────

async function fetchSalesContext(user) {
  const { from, to } = getMonthRange();
  const role = (user?.user_metadata?.type || user?.user_metadata?.role || user?.role || '').toLowerCase();
  const GLOBAL_ROLES = ['admin', 'analista', 'gerente', 'coortrade', 'supervisor', 'control'];
  const isGlobal = GLOBAL_ROLES.some(r => role.includes(r));
  // Admins y roles globales ven TODAS las rutas (salesRoute=null = sin filtro)
  const salesRoute = isGlobal ? null : (user?.user_metadata?.sales_route || user?.user_metadata?.route || null);

  const sales = await getSalesBySku({ from, to, salesRoute });

  if (!sales || sales.length === 0) {
    return `[DATOS DE VENTAS - Mes actual (${from} al ${to})]\nNo hay ventas registradas en el sistema para este período todavía.`;
  }

  // Agregar totales
  const totalHL   = sales.reduce((sum, s) => sum + (parseFloat(s.hl)      || 0), 0);
  const totalMXN  = sales.reduce((sum, s) => sum + (parseFloat(s.importe) || 0), 0);

  // Top 5 SKUs por HL
  const skuMap = {};
  for (const s of sales) {
    const sku = s.nombre_producto || s.sku || s.producto || 'Sin nombre';
    if (!skuMap[sku]) skuMap[sku] = { hl: 0, importe: 0, unidades: 0 };
    skuMap[sku].hl      += parseFloat(s.hl)       || 0;
    skuMap[sku].importe += parseFloat(s.importe)  || 0;
    skuMap[sku].unidades+= parseInt(s.cantidad)   || 0;
  }
  const top5 = Object.entries(skuMap)
    .sort((a, b) => b[1].hl - a[1].hl)
    .slice(0, 5)
    .map(([sku, d]) => `  - ${sku}: ${d.hl.toFixed(2)} HL / $${d.importe.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN`)
    .join('\n');

  return `[DATOS REALES DE VENTAS - ${from} al ${to}]
Total HL vendidos: ${totalHL.toFixed(2)} HL
Total en importe:  $${totalMXN.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
Registros de venta: ${sales.length}
Top 5 productos por HL:
${top5}`;
}

async function fetchComparativeContext(user) {
  const { from, to } = getMonthRange();
  const now      = new Date();
  const prevYear = now.getFullYear() - 1;
  const fromPrev = new Date(prevYear, now.getMonth(), 1).toISOString().split('T')[0];
  const toPrev   = new Date(prevYear, now.getMonth() + 1, 0).toISOString().split('T')[0];
  const role = (user?.user_metadata?.type || user?.user_metadata?.role || user?.role || '').toLowerCase();
  const GLOBAL_ROLES = ['admin', 'analista', 'gerente', 'coortrade', 'supervisor', 'control'];
  const isGlobal = GLOBAL_ROLES.some(r => role.includes(r));
  const salesRoute = isGlobal ? null : (user?.user_metadata?.sales_route || null);

  const [current, previous] = await Promise.all([
    getSalesBySku({ from, to, salesRoute }).catch(() => []),
    getSalesBySku({ from: fromPrev, to: toPrev, salesRoute }).catch(() => []),
  ]);

  const totalHLCurrent  = current.reduce((s, r) => s + (parseFloat(r.hl) || 0), 0);
  const totalHLPrevious = previous.reduce((s, r) => s + (parseFloat(r.hl) || 0), 0);
  const diffHL  = totalHLCurrent - totalHLPrevious;
  const pct     = totalHLPrevious > 0 ? ((diffHL / totalHLPrevious) * 100).toFixed(1) : 'N/A';
  const tendencia = diffHL >= 0 ? '📈 CRECIMIENTO' : '📉 CAÍDA';

  return `[COMPARATIVO DE VENTAS]
Período actual  (${from} → ${to}):       ${totalHLCurrent.toFixed(2)} HL
Período anterior(${fromPrev} → ${toPrev}): ${totalHLPrevious.toFixed(2)} HL
Diferencia: ${diffHL >= 0 ? '+' : ''}${diffHL.toFixed(2)} HL (${pct}%)
Tendencia: ${tendencia}`;
}

async function fetchGoalsContext(user) {
  const { from, to } = getMonthRange();
  const role = (user?.user_metadata?.type || user?.user_metadata?.role || user?.role || '').toLowerCase();
  const GLOBAL_ROLES = ['admin', 'analista', 'gerente', 'coortrade', 'supervisor', 'control'];
  const isGlobal = GLOBAL_ROLES.some(r => role.includes(r));
  // Roles globales ven metas de TODAS las rutas
  const salesRoute = isGlobal ? null : (user?.user_metadata?.sales_route || null);

  const goals = await (salesRoute
    ? getGoals({ salesRoute, from, to })
    : getAllGoals({ from, to })
  );

  if (!goals || goals.length === 0) {
    return `[METAS - Mes actual (${from} al ${to})]\nNo hay metas configuradas en el sistema para este período.`;
  }

  const lines = goals.slice(0, 10).map(g => {
    const metaHL  = parseFloat(g.meta_hl  || g.hl_goal   || 0);
    const realHL  = parseFloat(g.real_hl  || g.hl_actual || 0);
    const pct     = metaHL > 0 ? ((realHL / metaHL) * 100).toFixed(1) : '—';
    const ruta    = g.sales_route || g.ruta || g.route || '—';
    return `  - Ruta ${ruta}: ${realHL.toFixed(1)} / ${metaHL.toFixed(1)} HL (${pct}%)`;
  });

  return `[DATOS REALES DE METAS - ${from} al ${to}]
${lines.join('\n')}
(Mostrando ${Math.min(goals.length, 10)} de ${goals.length} rutas)`;
}

async function fetchTercerizadosContext() {
  const data = await getTercerizados();

  if (!data || data.length === 0) {
    return `[TERCERIZADOS]\nNo hay clientes en la promoción de tercerizados actualmente.`;
  }

  const completados = data.filter(t => parseFloat(t.hl_mes || t.compras_hl || 0) >= 5);
  const sinCompra   = data.filter(t => parseFloat(t.hl_mes || t.compras_hl || 0) === 0);
  const enProgreso  = data.length - completados.length - sinCompra.length;

  const muestra = data.slice(0, 8).map(t => {
    const nombre = t.nombre_negocio || t.nombre || t.client_name || '—';
    const hl     = parseFloat(t.hl_mes || t.compras_hl || 0).toFixed(1);
    const estado = parseFloat(hl) >= 5 ? '✅' : parseFloat(hl) === 0 ? '❌' : '🔄';
    return `  ${estado} ${nombre}: ${hl} HL / 5 HL meta`;
  });

  return `[DATOS REALES DE TERCERIZADOS]
Total en promo: ${data.length} clientes
✅ Completados (≥5 HL): ${completados.length}
🔄 En progreso:         ${enProgreso}
❌ Sin compra (0 HL):   ${sinCompra.length}

Muestra de clientes:
${muestra.join('\n')}`;
}

async function fetchVisitsContext() {
  const visits = await getAllVisits();

  if (!visits || visits.length === 0) {
    return `[VISITAS]\nNo hay visitas registradas en el sistema actualmente.`;
  }

  const today     = new Date().toISOString().split('T')[0];
  const thisWeek  = getWeekRange();

  const visitasHoy    = visits.filter(v => (v.created_at || v.fecha || '').startsWith(today));
  const visitasSemana = visits.filter(v => {
    const fecha = (v.created_at || v.fecha || '').split('T')[0];
    return fecha >= thisWeek.from && fecha <= thisWeek.to;
  });

  return `[DATOS REALES DE VISITAS]
Total en sistema:        ${visits.length} visitas
Hoy (${today}):          ${visitasHoy.length} visitas
Esta semana:             ${visitasSemana.length} visitas
Última visita registrada: ${(visits[0]?.created_at || visits[0]?.fecha || '—').split('T')[0]}`;
}

async function fetchClientsContext(user) {
  const userId = user?.id;
  const result = await getClientsPaged({ page: 1, pageSize: 1, filters: {}, userId });

  const total    = result?.count ?? result?.data?.length ?? 0;
  const activos  = result?.data?.filter(c => c.status === 'activo' || c.activo === 1 || c.activo === '1').length ?? 0;

  return `[DATOS REALES DE CLIENTES]
Total de clientes en el sistema: ${total.toLocaleString()}
(Nota: Para detalle de activos/inactivos abre el Directorio de Clientes en /clients y aplica el filtro de estatus)`;
}

async function fetchEvaluationsContext() {
  const { from, to } = getMonthRange();
  const evals = await getAllEvaluations({ from, to });

  if (!evals || evals.length === 0) {
    return `[EVALUACIONES - Mes actual]\nNo hay evaluaciones registradas en el período ${from} al ${to}.`;
  }

  const promedioScore = evals
    .filter(e => e.puntaje_total || e.score)
    .reduce((sum, e, _, arr) => sum + (parseFloat(e.puntaje_total || e.score) / arr.length), 0);

  const porTipo = evals.reduce((acc, e) => {
    const tipo = e.tipo || e.type || 'PDV';
    acc[tipo] = (acc[tipo] || 0) + 1;
    return acc;
  }, {});

  const tipoLines = Object.entries(porTipo).map(([t, c]) => `  - ${t}: ${c}`).join('\n');

  return `[DATOS REALES DE EVALUACIONES - ${from} al ${to}]
Total evaluaciones: ${evals.length}
Puntaje promedio:   ${promedioScore.toFixed(1)}%
Por tipo:
${tipoLines}`;
}

async function fetchSupervisionsContext(user) {
  const role = (
    user?.user_metadata?.type ||
    user?.user_metadata?.role ||
    user?.app_metadata?.roles?.[0] ||
    user?.role || ''
  ).toLowerCase();

  // Admins, analistas, gerentes y coortrade ven TODAS las supervisiones
  const GLOBAL_ROLES = ['admin', 'analista', 'gerente', 'coortrade', 'jefeum6', 'control'];
  const isGlobal = GLOBAL_ROLES.some(r => role.includes(r));
  const supervisorId = isGlobal ? 'all' : (user?.id || 'all');

  const supervisions = await getAllSupervisions(supervisorId);

  if (!supervisions || supervisions.length === 0) {
    return `[SUPERVISIONES A BORDO]\nNo hay supervisiones a bordo registradas para este usuario.`;
  }

  const completadas = supervisions.filter(s => s.status === 'completed');
  const enProceso   = supervisions.filter(s => s.status === 'draft');
  const promedioScore = completadas.length > 0
    ? (completadas.reduce((sum, s) => sum + (parseFloat(s.score) || 0), 0) / completadas.length).toFixed(1)
    : '—';

  const muestra = completadas.slice(0, 5).map(s => {
    const vendedor = s.vendedor_name || '—';
    const ruta     = s.route_name    || '—';
    const score    = parseFloat(s.score || 0).toFixed(1);
    const fecha    = (s.start_at || '').split('T')[0];
    const visitas  = s.visits?.length ?? 0;
    return `  - ${fecha} | ${vendedor} (${ruta}): ${score}% | ${visitas} PDVs visitados`;
  });

  return `[DATOS REALES DE SUPERVISIONES A BORDO]
Total supervisiones: ${supervisions.length}
Completadas:         ${completadas.length}
En proceso:          ${enProceso.length}
Score promedio:      ${promedioScore}%

Últimas supervisiones completadas:
${muestra.join('\n') || '  Sin datos'}`;
}
