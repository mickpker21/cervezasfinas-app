import { supabase } from '@/supabaseClient';

export const defaultEvaluationConfig = {
  weights: {
    surtido: 10,
    planograma: 10,
    exterior: 20,
    interior: 10,
    capacidad: 20,
    frio: 30,
  },
  thresholds: {
    surtidoMinPercent: 80,
    interiorMinElements: 3,
    capacidadMin: 10,
    capacidadMax: 100,
  },
  presentaciones: ['1¼', '12oz', '16oz', '355ml', '473ml', '710ml', '1L', '1.2L', '1.5L', '2L', '3L'],
  zonas: ['Oaxaca', 'Serdan', 'Izucar', 'Chilchotla', 'Palmarito'],
  presentacionesByZona: {
    // Default: usar presentaciones por marca (coinciden con imágenes en /public/brands/<slug>.png)
    'Oaxaca': [
      'Heineken', 'Tecate', 'Tecate Light', 'Dos Equis Lager', 'Dos Equis Ambar', 'Indio'
    ],
    'Serdan': [
      'Heineken', 'Tecate', 'Tecate Light', 'Dos Equis Lager', 'Dos Equis Ambar', 'Indio'
    ],
    'Izucar': [
      'Heineken', 'Tecate', 'Tecate Light', 'Dos Equis Lager', 'Dos Equis Ambar', 'Indio'
    ],
    'Chilchotla': [
      'Heineken', 'Tecate', 'Tecate Light', 'Dos Equis Lager', 'Dos Equis Ambar', 'Indio'
    ],
    'Palmarito': [
      'Heineken', 'Tecate', 'Tecate Light', 'Dos Equis Lager', 'Dos Equis Ambar', 'Indio'
    ]
  },
  tiposCliente: ['Bronce', 'Plata', 'Oro', 'Platino', 'Titanio'],
  estadosNegocio: ['Abierto', 'Cerrado', 'Enrejado'],
  elementosExterior: ['Banderola', 'Vinil', 'Lona', 'Letrero luminoso'],
  elementosInterior: ['Porta poster 1', 'Porta poster 2', 'Porta poster 3', 'Cooler blade', 'Refricalco', 'Preciador'],
  scoringMode: 'threshold', // 'threshold' (Todo o nada) | 'proportional' (Proporcional al % cumplido)
  allowedCapsByLevel: {
    Bronce: ['144'],
    Plata: ['144', '192', '320'],
    Oro: ['144', '192', '320', '376'],
    Platino: ['144', '192', '320', '376', '500', '552'],
    Titanio: ['144', '192', '320', '376', '500', '552', '900', '1350'],
  },
  onboardConfig: {
    weights: {
      checklist: 10,
      purchases: 30,
      steps: 20,
      execution: 40,
    },
    redistributeIfNoCooler: true,
    evaluationRouting: {
      routeToCoolerEval: true,
      routeOxxoToEval: true,
      autoDetectOxxo: true,
      routeModernToEval: true,
      returnToVisitOnComplete: true,
    },
    checklistItems: [
      { key: 'vehicle_clean', label: 'Vehículo limpio y ordenado', subtitle: 'Cabina y área de carga limpias', active: true },
      { key: 'uniform_ok', label: 'Vendedor uniformado', subtitle: 'Identificación, camisa y gorra CF', active: true },
      { key: 'vehicle_status_ok', label: 'Estado del vehículo OK', subtitle: 'Niveles, llantas y herramientas', active: true },
      { key: 'mobile_printer_ok', label: 'Equipo móvil / Impresora listos', subtitle: 'Batería, papel térmico y catálogo sincronizado', active: true },
      { key: 'route_plan_ok', label: 'Plan del día y metas claras', subtitle: 'Conoce su meta de HL, efectividad y prioridades', active: true },
    ],
    visitSteps: [
      { key: 'greeting', label: '¿Saludó por nombre y actitud comercial?', active: true },
      { key: 'stock_check', label: '¿Revisó inventario físico y enfriador?', active: true },
      { key: 'negotiation', label: '¿Negoció con dueño / ofreció promos?', active: true },
      { key: 'pop_updated', label: '¿Ejecutó / actualizó P.O.P. al día?', active: true },
    ],
  },
  modernChannelConfig: {
    weights: {
      surtido: 15,
      precios: 5,
      promos: 15,
      impulso_primera: 10,
      impulso_flanqueo: 10,
      impulso_zero: 10,
      impulso_enfriador: 5,
      destino_cerveza: 15,
      destino_bas: 15,
    },
    frescuraPenalty: 5,
    materialExtraPoints: 2,
    maxScoreWithExtras: 110,
    beerShareTargetPct: 41,
    brandRulesText: 'TECATE, INDIO, CARTA BLANCA',
  },
  oxxoConfig: {
    weights: {
      surtido: 15,
      precios: 5,
      promos: 15,
      impulso_primera: 10,
      impulso_flanqueo: 10,
      impulso_zero: 10,
      impulso_enfriador: 5,
      destino_cerveza: 15,
      destino_bas: 15,
    },
    frescuraPenalty: 5,
    materialExtraPoints: 2,
    maxScoreWithExtras: 110,
    beerShareTargetPct: 45,
    brandRulesText: 'TECATE, TECATE LIGHT, INDIO, DOS EQUIS, HEINEKEN',
  },
};

// Opciones específicas para la UI de la página de Evaluaciones que el admin puede modificar
defaultEvaluationConfig.pageSettings = {
  // columnas en orden; usar '__details__' para la columna de acciones (Ver/Editar)
  columns: ['fecha', 'punto_venta', 'client_code', 'nivel', 'puntaje_total', 'nombre', '__details__'],
  // etiquetas mostradas en la tabla (clave -> etiqueta)
  columnLabels: {
    fecha: 'Fecha',
    punto_venta: 'Punto de venta',
    client_code: 'Código',
    nivel: 'Nivel',
    puntaje_total: 'Puntaje',
    nombre: 'Usuario',
    __details__: 'Detalles'
  },
  itemsLimit: 200,
  showScannerInDetail: true,
  showPhotos: true,
  photoKeys: ['photo_fachada', 'photo_interior', 'photo_enfriador']
};

// Preguntas por defecto (estructura editable desde admin)
defaultEvaluationConfig.questions = [
  { key: 'fecha', type: 'date', label: 'Fecha' },
  { key: 'punto_venta', type: 'text', label: 'Punto de Venta' },
  { key: 'tipo_cliente', type: 'select', label: 'Tipo de Cliente', options: defaultEvaluationConfig.tiposCliente },
  { key: 'surtido', type: 'checklist', label: 'Surtido', options: defaultEvaluationConfig.presentaciones },
  { key: 'planograma', type: 'checkbox_group', label: 'Planograma', options: ['huecos', 'invasion', 'cumplimiento'] },
  { key: 'comunicacion_exterior', type: 'multiselect', label: 'Comunicación Exterior (20%)', options: defaultEvaluationConfig.elementosExterior },
  // Nueva pregunta sencilla: fachada con elemento exterior? (Sí/No)
  { key: 'fachada_elemento_exterior', type: 'checkbox', label: 'Fachada con elemento exterior?' },
  { key: 'comunicacion_interior', type: 'multiselect', label: 'Comunicación Interior', options: defaultEvaluationConfig.elementosInterior },
  { key: 'capacidad_fria', type: 'checkbox_group', label: 'Capacidad Fría', options: ['cumple'] },
  { key: 'frio_optimo', type: 'checkbox', label: 'Frío en estado óptimo' }
];

import { kvStorage } from '@/services/kvStorage';

export async function syncEvaluationConfig() {
  try {
    const { data, error } = await supabase
      .from('evaluation_config')
      .select('config')
      .eq('id', 'default')
      .maybeSingle();

    if (error) throw error;
    if (data?.config) {
      await kvStorage.setItem('cached_eval_config', data.config);
      console.log('[evaluationConfig] Configuración sincronizada y cacheada.');
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[evaluationConfig] Fallo al sincronizar config:', e);
    return false;
  }
}

export async function loadEvaluationConfig() {
  try {
    const { data, error } = await supabase
      .from('evaluation_config')
      .select('config')
      .eq('id', 'default')
      .maybeSingle();

    let cfg = {};

    if (error || !data || !data.config) {
      // Intento de fallback a cache local
      try {
        const cached = await kvStorage.getItem('cached_eval_config');
        if (cached) {
          console.log('[evaluationConfig] Usando configuración en caché (Offline)');
          cfg = cached;
        } else {
          return defaultEvaluationConfig;
        }
      } catch (e) {
        return defaultEvaluationConfig;
      }
    } else {
      cfg = data.config || {};
      // Guardar en caché para futuro offline
      kvStorage.setItem('cached_eval_config', cfg).catch(() => { });
    }

    // Helper: convertir claves camelCase a snake_case para evitar requests con columnas inexistentes
    const toSnake = (s) => {
      if (!s || typeof s !== 'string') return s;
      // Primero reemplazar espacios y guiones por underscore
      let t = s.replace(/\s+/g, '_').replace(/-/g, '_');
      // Insertar underscore antes de mayúsculas y bajar a minúsculas
      t = t.replace(/([A-Z])/g, '_$1').toLowerCase();
      // Quitar posibles dobles guiones bajos
      t = t.replace(/__+/g, '_');
      // Trim underscores
      t = t.replace(/^_+|_+$/g, '');
      return t;
    };

    // Merge and normalize
    const merged = {
      ...defaultEvaluationConfig,
      ...cfg,
      weights: { ...defaultEvaluationConfig.weights, ...(cfg.weights || {}) },
      thresholds: { ...defaultEvaluationConfig.thresholds, ...(cfg.thresholds || {}) },
      presentacionesByZona: cfg.presentacionesByZona || defaultEvaluationConfig.presentacionesByZona || {},
      zonas: Array.isArray(cfg.zonas) ? cfg.zonas : defaultEvaluationConfig.zonas,
      scoringMode: cfg.scoringMode || defaultEvaluationConfig.scoringMode || 'threshold',
      allowedCapsByLevel: {
        ...defaultEvaluationConfig.allowedCapsByLevel,
        ...(cfg.allowedCapsByLevel || {}),
      },
      onboardConfig: {
        ...defaultEvaluationConfig.onboardConfig,
        ...(cfg.onboardConfig || {}),
        weights: {
          ...defaultEvaluationConfig.onboardConfig.weights,
          ...(cfg.onboardConfig?.weights || {}),
        },
        evaluationRouting: {
          ...defaultEvaluationConfig.onboardConfig.evaluationRouting,
          ...(cfg.onboardConfig?.evaluationRouting || {}),
        },
        checklistItems: Array.isArray(cfg.onboardConfig?.checklistItems) && cfg.onboardConfig.checklistItems.length > 0
          ? cfg.onboardConfig.checklistItems
          : defaultEvaluationConfig.onboardConfig.checklistItems,
        visitSteps: Array.isArray(cfg.onboardConfig?.visitSteps) && cfg.onboardConfig.visitSteps.length > 0
          ? cfg.onboardConfig.visitSteps
          : defaultEvaluationConfig.onboardConfig.visitSteps,
      },
      modernChannelConfig: {
        ...defaultEvaluationConfig.modernChannelConfig,
        ...(cfg.modernChannelConfig || {}),
        weights: {
          ...defaultEvaluationConfig.modernChannelConfig.weights,
          ...(cfg.modernChannelConfig?.weights || {}),
        },
      },
      oxxoConfig: {
        ...defaultEvaluationConfig.oxxoConfig,
        ...(cfg.oxxoConfig || {}),
        weights: {
          ...defaultEvaluationConfig.oxxoConfig.weights,
          ...(cfg.oxxoConfig?.weights || {}),
        },
      },
    };

    // Normalize pageSettings keys (columns, columnLabels, photoKeys)
    const rawPage = { ...(defaultEvaluationConfig.pageSettings || {}), ...(cfg.pageSettings || {}) };
    const normalizedPage = { ...rawPage };
    if (Array.isArray(rawPage.columns)) {
      normalizedPage.columns = rawPage.columns.map((c) => toSnake(String(c)));
    }
    if (rawPage.columnLabels && typeof rawPage.columnLabels === 'object') {
      const nl = {};
      Object.entries(rawPage.columnLabels).forEach(([k, v]) => {
        nl[toSnake(String(k))] = v;
      });
      normalizedPage.columnLabels = { ...(defaultEvaluationConfig.pageSettings.columnLabels || {}), ...nl };
    }
    if (Array.isArray(rawPage.photoKeys)) {
      normalizedPage.photoKeys = rawPage.photoKeys.map((k) => toSnake(String(k)));
    }

    // Normalize questions keys (avoid camelCase keys stored in config)
    const rawQuestions = Array.isArray(cfg.questions) ? cfg.questions : defaultEvaluationConfig.questions;
    const normalizedQuestions = rawQuestions.map((q) => ({ ...q, key: toSnake(String(q.key || '')) }));

    return {
      ...merged,
      // override pageSettings and questions with normalized versions
      pageSettings: normalizedPage,
      questions: normalizedQuestions,
    };
  } catch (e) {
    console.warn('[evaluationConfig] Error cargando config, intentando cache', e);
    // Fallback final a caché por si supabase lanza excepción (network error)
    try {
      const cached = await kvStorage.getItem('cached_eval_config');
      if (cached) return { ...defaultEvaluationConfig, ...cached, presentacionesByZona: cached.presentacionesByZona || defaultEvaluationConfig.presentacionesByZona };
    } catch (_) { }
    return defaultEvaluationConfig;
  }
}

export async function saveEvaluationConfig(config) {
  await kvStorage.setItem('cached_eval_config', config).catch(() => {});
  const payload = {
    id: 'default',
    config,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('evaluation_config')
    .upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  // Notificar a la app local que la configuración cambió
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('evaluation-config-updated'));
    }
  } catch (_) { }
  return true;
}

// Suscripción local basada en eventos del navegador
export function onEvaluationConfigUpdated(handler) {
  if (typeof window === 'undefined') return () => { };
  const fn = () => handler();
  window.addEventListener('evaluation-config-updated', fn);
  return () => window.removeEventListener('evaluation-config-updated', fn);
}

// Suscripción Realtime a cambios en la tabla evaluation_config (requiere Realtime activo en Supabase)
export function subscribeEvaluationConfig(callback) {
  try {
    const channel = supabase
      .channel('evaluation-config-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluation_config', filter: 'id=eq.default' }, () => {
        callback();
      })
      .subscribe();
    return () => {
      try { supabase.removeChannel(channel); } catch (_) { }
    };
  } catch (_) {
    return () => { };
  }
}
