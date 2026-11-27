import React, { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { analyzePdvCoolerWithAI, analyzeModernChannelWithAI } from '@/services/aiCoolerEvaluationService';
import { updateEvaluationAdmin } from '@/repositories/evaluationsRepository';

const Section = ({ title, children }) => (
  <div className="mb-6 bg-gray-800/50 p-4 rounded-lg">
    <h3 className="text-lg font-semibold mb-3 text-green-400 border-b border-gray-600 pb-2">{title}</h3>
    {children}
  </div>
);

const InfoItem = ({ label, value }) => (
  <div className="flex justify-between py-1 text-sm">
    <span className="text-gray-400 font-medium">{label}:</span>
    <span className="text-right">{value || 'N/A'}</span>
  </div>
);

const fixUrl = (url) => {
  if (!url) return '';
  let finalUrl = url;

  // 1. Verificar si es relativo y agregar dominio
  if (!finalUrl.startsWith('http')) {
    if (finalUrl.startsWith('/')) {
      finalUrl = `https://cervezasfinas.com${finalUrl}`;
    } else {
      finalUrl = `https://cervezasfinas.com/${finalUrl}`;
    }
  }

  // 2. Corregir path: Asegurar que apunte a /api/uploads si está en uploads
  if (finalUrl.includes('/uploads/') && !finalUrl.includes('/api/uploads/')) {
    finalUrl = finalUrl.replace('/uploads/', '/api/uploads/');
  }

  // 3. Corregir error conocido: URL terminada en punto (falta extensión)
  // Se asume jpg por defecto para fotos de cámara
  if (finalUrl.endsWith('.')) {
    finalUrl += 'jpg';
  }

  return finalUrl;
};

const ImageGallery = ({ photos }) => {
  if (!photos || photos.length === 0) {
    return <p className="text-sm text-gray-500">No hay fotos para esta evaluación.</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {photos.map((photo, index) => {
        const fullUrl = fixUrl(photo.url);
        return (
          <a key={index} href={fullUrl} target="_blank" rel="noopener noreferrer" className="aspect-square block bg-gray-700 rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
            <img
              src={fullUrl}
              alt={`Evaluación foto ${index + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                console.error(`Error loading image: ${fullUrl}`);
                e.target.style.display = 'none';
                e.target.parentElement.classList.add('flex', 'flex-col', 'items-center', 'justify-center', 'text-xs', 'text-gray-400', 'p-2', 'text-center', 'break-all');
                e.target.parentElement.innerHTML = `<span class="text-red-500 font-bold mb-1">Error</span><span class="text-[10px] leading-tight">${fullUrl}</span>`;
              }}
            />
          </a>
        );
      })}
    </div>
  );
};

const renderPdvDetails = (evaluation) => {
  console.log('[EvaluationDetailViewer] PDV evaluation:', evaluation);

  // FUSIONAR datos: Prioridad al payload, pero mantener datos de la raíz (donde están los campos planos)
  const mergedData = { ...evaluation, ...(evaluation.payload || {}) };
  console.log('[EvaluationDetailViewer] PDV mergedData:', mergedData);

  // Mantener compatibilidad con el resto del código que usa 'payload'
  const payload = mergedData;

  let details = mergedData.criterios || [];

  // Fallback 1: Intentar obtener criterios del payload directo
  if (!details.length && payload.surtido) {
    const rawFields = [
      payload.surtido,
      payload.planograma,
      payload.comunicacion_exterior,
      payload.comunicacion_interior,
      payload.capacidad_fria
    ];

    details = rawFields.filter(item =>
      item &&
      typeof item === 'object' &&
      item.nombre // Asegurar que parece un criterio válido
    );
  }

  // Fallback 2: Intentar obtener criterios de las columnas directas del evaluation
  if (!details.length) {
    const rawFields = [
      evaluation.surtido,
      evaluation.planograma,
      evaluation.comunicacion_exterior,
      evaluation.comunicacion_interior,
      evaluation.capacidad_fria
    ];

    details = rawFields.filter(item =>
      item &&
      typeof item === 'object' &&
      item.nombre
    );
  }

  console.log('[EvaluationDetailViewer] PDV criterios:', details);

  // Buscar fotos en múltiples ubicaciones
  let photos = payload.fotos || [];

  // Si no hay fotos en payload.fotos, buscar en las propiedades individuales
  if (!photos.length) {
    const photoUrls = [
      payload.photo_fachada,
      payload.photo_interior,
      payload.photo_enfriador,
      evaluation.photo_fachada,
      evaluation.photo_interior,
      evaluation.photo_enfriador
    ].filter(Boolean);

    photos = photoUrls.map(url => ({ url }));
  }

  console.log('[EvaluationDetailViewer] PDV photos:', photos);

  // Extraer datos de información general
  const puntoVenta = payload.punto_venta || evaluation.punto_venta || 'N/A';
  const clientCode = payload.client_code || evaluation.client_code || 'N/A';
  const clientRoute = payload.client_route || evaluation.client_route || evaluation.ruta || 'N/A';
  const evaluador = payload.nombre || payload.evaluator_name || evaluation.evaluator_name || 'N/A';
  const fecha = payload.fecha || evaluation.fecha;
  const puntajeTotal = payload.puntaje_total ?? payload.score ?? evaluation.puntaje_total ?? evaluation.score;

  return (
    <>
      <Section title="Informacion General">
        <InfoItem label="Punto de Venta" value={puntoVenta} />
        <InfoItem label="Codigo de Cliente" value={clientCode} />
        <InfoItem label="Ruta" value={clientRoute} />
        <InfoItem label="Evaluador" value={evaluador} />
        <InfoItem label="Fecha" value={fecha ? format(new Date(fecha), 'dd/MM/yyyy HH:mm') : 'N/A'} />
        <InfoItem label="Puntaje Total" value={puntajeTotal !== undefined ? puntajeTotal.toFixed(2) : 'N/A'} />
      </Section>

      <Section title="Detalles de Evaluación">
        {details.length > 0 ? (
          <div className="space-y-2">
            {details.map((item, index) => (
              <div key={index} className="text-sm p-2 bg-gray-700/60 rounded">
                <p className="font-semibold">{item.nombre}: <span className="font-bold text-green-400">{item.puntos} pts</span></p>
                {item.respuesta && <p className="text-xs text-gray-300">Respuesta: {item.respuesta}</p>}
              </div>
            ))}
          </div>
        ) : (
          /* Lógica para mostrar campos planos si no hay criterios JSON */
          <div className="space-y-4">
            {/* Grupo: Negocio */}
            {(payload.estado_negocio || payload.nivel || payload.productividad) && (
              <div className="bg-gray-700/40 p-3 rounded-lg">
                <h4 className="text-green-400 font-semibold mb-2 text-sm uppercase tracking-wider">Negocio</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {payload.estado_negocio && <p><span className="text-gray-400">Estado:</span> {payload.estado_negocio}</p>}
                  {payload.nivel && <p><span className="text-gray-400">Nivel:</span> {payload.nivel}</p>}
                  {payload.productividad && <p><span className="text-gray-400">Productividad:</span> {payload.productividad}</p>}
                </div>
              </div>
            )}

            {/* Grupo: Surtido y Planograma */}
            {(payload.surtido_porcentaje || payload.presentaciones || payload.sku_individual || payload.sku_familiar || payload.invasion || payload.huecos) && (
              <div className="bg-gray-700/40 p-3 rounded-lg">
                <h4 className="text-green-400 font-semibold mb-2 text-sm uppercase tracking-wider">Surtido y Planograma</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {payload.surtido_porcentaje !== undefined && <p><span className="text-gray-400">Surtido:</span> {payload.surtido_porcentaje}%</p>}
                  {payload.presentaciones && payload.presentaciones.length > 0 && (
                    <div>
                      <span className="text-gray-400">Presentaciones:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {payload.presentaciones.map((p, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-900/50 text-blue-200 rounded text-xs">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {payload.sku_individual && <p><span className="text-gray-400">SKU Individual:</span> {payload.sku_individual}</p>}
                  {payload.sku_familiar && <p><span className="text-gray-400">SKU Familiar:</span> {payload.sku_familiar}</p>}
                  {payload.invasion && <p><span className="text-gray-400">Invasión:</span> {payload.invasion}</p>}
                  {payload.huecos && <p><span className="text-gray-400">Huecos:</span> {payload.huecos}</p>}
                  {payload.indispensable_planograma !== undefined && <p><span className="text-gray-400">Indispensable Planograma:</span> {payload.indispensable_planograma ? 'Sí' : 'No'}</p>}
                </div>
              </div>
            )}

            {/* Grupo: Exterior */}
            {(payload.fachada_banderola || payload.cumple_exterior !== undefined || (payload.elementos_exterior && payload.elementos_exterior.length > 0)) && (
              <div className="bg-gray-700/40 p-3 rounded-lg">
                <h4 className="text-green-400 font-semibold mb-2 text-sm uppercase tracking-wider">Exterior</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {payload.fachada_banderola && <p><span className="text-gray-400">Fachada/Banderola:</span> {payload.fachada_banderola}</p>}
                  {payload.cumple_exterior !== undefined && <p><span className="text-gray-400">Cumple Exterior:</span> {payload.cumple_exterior ? 'Sí' : 'No'}</p>}
                  {payload.indispensable_exterior !== undefined && <p><span className="text-gray-400">Indispensable Exterior:</span> {payload.indispensable_exterior ? 'Sí' : 'No'}</p>}
                  {payload.elementos_exterior && payload.elementos_exterior.length > 0 && (
                    <div>
                      <span className="text-gray-400">Elementos Exterior:</span>
                      <ul className="list-disc list-inside pl-2 mt-1 text-gray-300 text-xs">
                        {payload.elementos_exterior.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Grupo: Interior */}
            {(payload.cumple_interior !== undefined || (payload.elementos_interior && payload.elementos_interior.length > 0)) && (
              <div className="bg-gray-700/40 p-3 rounded-lg">
                <h4 className="text-green-400 font-semibold mb-2 text-sm uppercase tracking-wider">Interior</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {payload.cumple_interior !== undefined && <p><span className="text-gray-400">Cumple Interior:</span> {payload.cumple_interior ? 'Sí' : 'No'}</p>}
                  {payload.elementos_interior && payload.elementos_interior.length > 0 && (
                    <div>
                      <span className="text-gray-400">Elementos Interior:</span>
                      <ul className="list-disc list-inside pl-2 mt-1 text-gray-300 text-xs">
                        {payload.elementos_interior.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Grupo: Enfriador */}
            {(payload.enfriador_primera_pos || payload.enfriador_funciona || payload.cumple_capacidad !== undefined || payload.cooler_count) && (
              <div className="bg-gray-700/40 p-3 rounded-lg">
                <h4 className="text-green-400 font-semibold mb-2 text-sm uppercase tracking-wider">Enfriador</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {payload.enfriador_primera_pos && <p><span className="text-gray-400">Primera Posición:</span> {payload.enfriador_primera_pos}</p>}
                  {payload.enfriador_funciona && <p><span className="text-gray-400">Funciona:</span> {payload.enfriador_funciona}</p>}
                  {payload.cumple_capacidad !== undefined && <p><span className="text-gray-400">Cumple Capacidad:</span> {payload.cumple_capacidad ? 'Sí' : 'No'}</p>}
                  {(payload.capacidad_actual || payload.capacidad_max) && (
                    <p><span className="text-gray-400">Capacidad:</span> {payload.capacidad_actual || '?'} / {payload.capacidad_max || '?'}</p>
                  )}
                  {payload.cooler_count && <p><span className="text-gray-400">Conteo Coolers:</span> {payload.cooler_count}</p>}
                  {payload.cooler_sizes && <p><span className="text-gray-400">Tamaños:</span> {payload.cooler_sizes}</p>}
                  {payload.cooler_serials && <p><span className="text-gray-400">Seriales:</span> {payload.cooler_serials}</p>}
                </div>
              </div>
            )}

            {/* Mensaje si no hay nada */}
            {!(payload.estado_negocio || payload.surtido_porcentaje || payload.fachada_banderola || payload.cumple_interior || payload.enfriador_primera_pos) && (
              <p className="text-sm text-gray-400">No hay detalles específicos disponibles para esta evaluación.</p>
            )}
          </div>
        )}
      </Section>

      <Section title="Fotografías">
        <ImageGallery photos={photos} />
      </Section>

      {(payload.ai_mode || payload.ai_evaluation) && (
        <Section title="🤖 Dictamen de Inteligencia Artificial">
          {payload.ai_evaluation ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-emerald-400 font-bold">
                  Motor: {payload.ai_evaluation._provider || 'Visión IA'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                  Confianza IA: {payload.ai_evaluation.confianza_ia || 95}%
                </span>
              </div>
              {payload.ai_evaluation.resumen_ejecutivo && (
                <p className="text-gray-200 bg-gray-900/60 p-2.5 rounded border border-gray-700">
                  {payload.ai_evaluation.resumen_ejecutivo}
                </p>
              )}
              {Array.isArray(payload.ai_evaluation.analisis_parrillas) && payload.ai_evaluation.analisis_parrillas.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-cyan-400 uppercase">Análisis por Parrilla:</span>
                  {payload.ai_evaluation.analisis_parrillas.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 text-xs bg-gray-900/50 px-2.5 py-1.5 rounded">
                      <span className="font-bold text-white">Parrilla {p.parrilla || idx + 1}:</span>
                      <span className="text-gray-300 flex-1">{p.detectado}</span>
                      <span className={p.cumple ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {p.cumple ? '✓ OK' : '⚠ Revisar'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-400">
              ⏳ Capturada en modo Offline — pendiente de análisis IA al sincronizar.
            </p>
          )}
        </Section>
      )}
    </>
  );
};

const renderCanalModernoDetails = (evaluation) => {
  console.log('[EvaluationDetailViewer] CM evaluation:', evaluation);

  // FUSIONAR datos: Prioridad al payload, pero mantener datos de la raíz
  const mergedData = { ...evaluation, ...(evaluation.payload || {}) };
  const payload = mergedData;
  console.log('[EvaluationDetailViewer] CM mergedData:', mergedData);

  // Buscar fotos en múltiples ubicaciones
  let photos = payload.photos || [];

  if (!photos.length) {
    const photoUrls = [
      payload.photo_fachada,
      payload.photo_destino,
      payload.photo_impulso,
      evaluation.photo_fachada,
      evaluation.photo_destino,
      evaluation.photo_impulso,
      ...(payload.photoUrls || []),
      ...(evaluation.photo_urls || [])
    ].filter(Boolean);

    photos = photoUrls;
  }

  // Extraer datos de información general (Soporte para estructura nueva y vieja)
  const storeInfo = payload.storeInfo || {};
  const puntoVenta = storeInfo.nombre || payload.punto_venta || payload.nombre_tienda || evaluation.punto_venta || evaluation.nombre_tienda || 'N/A';
  const clientCode = storeInfo.client_code || payload.client_code || evaluation.client_code || 'N/A';
  const clientRoute = payload.client_route || evaluation.client_route || evaluation.ruta || 'N/A';
  const cadena = payload.cadena || evaluation.cadena || 'N/A';
  const formato = payload.formato || evaluation.formato || 'N/A';
  const evaluador = storeInfo.evaluador || payload.evaluator_name || payload.nombre || evaluation.evaluator_name || 'N/A';
  const fecha = storeInfo.fecha || payload.fecha || evaluation.fecha;

  // Resultados (Detalles OK / Mal)
  let resultados = payload.resultados || {};

  // Si resultados es un string, intentar parsearlo
  if (typeof resultados === 'string') {
    try {
      resultados = JSON.parse(resultados);
    } catch (e) {
      console.error('Error parsing resultados JSON:', e);
      resultados = {};
    }
  }

  const detallesOk = resultados.detallesOk || [];
  const detallesMal = resultados.detallesMal || [];

  // Score - Búsqueda exhaustiva
  let scoreFinal = payload.score_final ?? payload.score ?? evaluation.score_final ?? evaluation.score;

  if (scoreFinal === undefined || scoreFinal === null) {
    if (resultados && resultados.scoreFinal !== undefined) {
      scoreFinal = resultados.scoreFinal;
    } else if (payload.resultados && payload.resultados.scoreFinal !== undefined) {
      scoreFinal = payload.resultados.scoreFinal;
    }
  }

  console.log('[EvaluationDetailViewer] CM Extracted:', { scoreFinal, detallesOk, detallesMal, resultados });

  // Secciones (Formato antiguo)
  const sections = payload.sections || evaluation.sections || [];

  return (
    <>
      <Section title="Informacion General">
        <InfoItem label="Punto de Venta" value={puntoVenta} />
        <InfoItem label="Codigo de Cliente" value={clientCode} />
        <InfoItem label="Ruta" value={clientRoute} />
        <InfoItem label="Cadena" value={cadena} />
        <InfoItem label="Formato" value={formato} />
        <InfoItem label="Evaluador" value={evaluador} />
        <InfoItem label="Fecha" value={fecha ? format(new Date(fecha), 'dd/MM/yyyy HH:mm') : 'N/A'} />
        <InfoItem label="Score Final" value={scoreFinal !== undefined ? Number(scoreFinal).toFixed(2) : 'N/A'} />
      </Section>

      {/* Formato Nuevo: Resultados OK / Mal */}
      {(detallesOk.length > 0 || detallesMal.length > 0) && (
        <Section title="Resultados de Evaluación">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {detallesOk.length > 0 && (
              <div className="bg-green-900/20 p-3 rounded border border-green-800/50">
                <h4 className="text-green-400 font-semibold mb-2 flex items-center">
                  <span className="mr-2">✓</span> Cumple
                </h4>
                <ul className="space-y-1">
                  {detallesOk.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start">
                      <span className="mr-2 mt-1 w-1 h-1 bg-green-500 rounded-full flex-shrink-0"></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detallesMal.length > 0 && (
              <div className="bg-red-900/20 p-3 rounded border border-red-800/50">
                <h4 className="text-red-400 font-semibold mb-2 flex items-center">
                  <span className="mr-2">✗</span> No Cumple
                </h4>
                <ul className="space-y-1">
                  {detallesMal.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start">
                      <span className="mr-2 mt-1 w-1 h-1 bg-red-500 rounded-full flex-shrink-0"></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Formato Antiguo: Secciones */}
      {sections.length > 0 && (
        <Section title="Detalles por Sección">
          {sections.map(sec => (
            <div key={sec.id} className="mb-3">
              <h4 className="font-semibold text-md text-green-300">{sec.title} ({sec.score_final?.toFixed(2)}%)</h4>
              <div className="pl-2 border-l-2 border-gray-700 mt-1 space-y-1">
                {sec.questions.map(q => (
                  <div key={q.id} className="text-sm">
                    <p>{q.pregunta}: <span className="font-bold">{q.respuesta ? 'Sí' : 'No'}</span></p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Criterios Desglosados (Si existen y no hay secciones/resultados claros) */}
      {payload.criterios && !sections.length && !detallesOk.length && !detallesMal.length && (
        <Section title="Criterios">
          <div className="grid grid-cols-1 gap-3">
            {Object.entries(payload.criterios).map(([key, value]) => (
              <div key={key} className="bg-gray-700/40 p-3 rounded">
                <h4 className="text-green-400 font-semibold capitalize mb-1">{key}</h4>
                <div className="text-sm text-gray-300">
                  {Object.entries(value).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      <span className={v === true ? 'text-green-400' : v === false ? 'text-red-400' : ''}>
                        {v === true ? 'Sí' : v === false ? 'No' : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Fotografías">
        <ImageGallery photos={photos.map(p => typeof p === 'string' ? { url: p } : p)} />
      </Section>

      {(payload.ai_mode || payload.ai_evaluation) && (
        <Section title="🤖 Dictamen de Inteligencia Artificial">
          {payload.ai_evaluation ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-bold">
                  Motor: {payload.ai_evaluation._provider || 'Visión IA'}
                </span>
                <span className="text-xs text-emerald-300 font-bold">
                  Confianza IA: {payload.ai_evaluation.confianza_ia || 94}%
                </span>
              </div>
              {payload.ai_evaluation.resumen_ejecutivo && (
                <p className="text-gray-200">{payload.ai_evaluation.resumen_ejecutivo}</p>
              )}
              {Array.isArray(payload.ai_evaluation.hallazgos_ia) && payload.ai_evaluation.hallazgos_ia.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-gray-300 space-y-1">
                  {payload.ai_evaluation.hallazgos_ia.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-400">
              ⏳ Capturada en modo Offline — pendiente de análisis IA al sincronizar.
            </p>
          )}
        </Section>
      )}

      {/* DEBUG: Mostrar JSON crudo si no hay detalles detectados */}
      {(!detallesOk.length && !detallesMal.length && !sections.length && !payload.criterios) && (
        <div className="mt-8 p-4 bg-gray-900 rounded border border-gray-700">
          <h4 className="text-red-400 font-bold mb-2">Modo Depuración: Datos Crudos</h4>
          <p className="text-xs text-gray-400 mb-2">No se detectaron detalles con la estructura esperada. A continuación se muestran los datos recibidos:</p>
          <pre className="text-xs text-green-500 overflow-auto max-h-60 whitespace-pre-wrap">
            {JSON.stringify(mergedData, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
};

export default function EvaluationDetailViewer({ evaluation, onEvaluationUpdated }) {
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [liveEval, setLiveEval] = useState(evaluation);

  if (!liveEval) return null;
  const evaluationType = liveEval.tipo || liveEval.type;
  const isPdv = (evaluationType || '').toUpperCase() === 'PDV';
  const payload = typeof liveEval.payload === 'string' ? JSON.parse(liveEval.payload || '{}') : (liveEval.payload || {});

  const handleRunAdminAiAudit = async () => {
    setAuditing(true);
    setAuditError('');
    try {
      let aiRes = null;
      if (isPdv) {
        const f1 = fixUrl(payload.photo_fachada || liveEval.photo_fachada || payload.fotos?.[0]?.url);
        const f2 = fixUrl(payload.photo_interior || liveEval.photo_interior || payload.fotos?.[1]?.url);
        const f3 = fixUrl(payload.photo_enfriador || liveEval.photo_enfriador || payload.fotos?.[2]?.url);
        aiRes = await analyzePdvCoolerWithAI({
          fotoFachada: f1,
          fotoInterior: f2,
          fotoEnfriador: f3,
          coolerSize: payload.ai_planogram_size || payload.capacidad_actual || '376',
          clientLevel: payload.nivel || 'Oro',
        });
      } else {
        const isOxxo = String(payload.tipo || liveEval.tipo || payload.cadena || '').toUpperCase().includes('OXXO');
        const pList = payload.photoUrls || payload.photos || [];
        const f1 = fixUrl(payload.photo_fachada || liveEval.photo_fachada || pList[0]);
        const f2 = fixUrl(payload.photo_destino || liveEval.photo_destino || pList[1]);
        const f3 = fixUrl(payload.photo_impulso || liveEval.photo_impulso || pList[2]);
        aiRes = await analyzeModernChannelWithAI({
          photoFachada: f1,
          photoDestino: f2,
          photoImpulso: f3,
          isOxxo,
          targetBeerPct: isOxxo ? 45 : 41,
        });
      }

      if (aiRes) {
        await updateEvaluationAdmin(liveEval, {
          ai_mode: true,
          ai_status: 'audited_by_admin',
          ai_evaluation: aiRes,
        });
        const nextPayload = { ...payload, ai_mode: true, ai_status: 'audited_by_admin', ai_evaluation: aiRes };
        const updatedObj = { ...liveEval, payload: nextPayload };
        setLiveEval(updatedObj);
        if (onEvaluationUpdated) onEvaluationUpdated(updatedObj);
      }
    } catch (err) {
      console.error('[EvaluationDetailViewer] AI Audit Error:', err);
      setAuditError(err?.message || 'No se pudieron analizar las fotografías con IA.');
    } finally {
      setAuditing(false);
    }
  };

  // Semáforo de Auditoría IA vs Supervisor (para validación de pago de comisiones)
  const aiEval = payload.ai_evaluation;
  let auditBadge = null;
  if (aiEval) {
    const supInvasion = String(payload.invasion || 'no').toLowerCase();
    const aiInvasion = String(aiEval.invasion || 'no').toLowerCase();
    const supHuecos = String(payload.huecos || 'no').toLowerCase();
    const aiHuecos = String(aiEval.huecos || 'no').toLowerCase();
    const hasPhotoFraud = aiEval.fotos_validas === false;
    const hasDiscrepancy =
      hasPhotoFraud ||
      (aiInvasion === 'si' && supInvasion === 'no') ||
      (aiHuecos === 'si' && supHuecos === 'no');

    auditBadge = hasDiscrepancy ? (
      <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-red-300 uppercase">🔴 Discrepancia Detectada por Auditoría IA</div>
          <p className="mt-0.5">
            {hasPhotoFraud
              ? (aiEval.alerta_fraude || 'Fotografía inválida o borrosa detectada por IA.')
              : `La IA detectó en las fotos: Invasión=${aiInvasion.toUpperCase()} (${aiEval.detalle_invasion || ''}), Huecos=${aiHuecos.toUpperCase()} (${aiEval.detalle_huecos || ''}), mientras que en el formulario se reportó Invasión=${supInvasion.toUpperCase()}, Huecos=${supHuecos.toUpperCase()}.`}
          </p>
        </div>
      </div>
    ) : (
      <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="font-bold text-emerald-300 uppercase">🟢 Ejecución Verificada por IA (Apta para Pago)</div>
            <p className="text-slate-300">Las fotografías coinciden con los criterios de evaluación sin alertas de invasión ni fraude.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-1">
      {/* Barra Superior de Auditoría IA Bajo Demanda */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900/90 border border-cyan-500/30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <div>
            <div className="text-xs font-bold text-white">Auditoría de Enfriador y Ejecución con IA</div>
            <div className="text-[11px] text-slate-400">
              {aiEval ? `Auditada con ${aiEval._provider || 'Visión IA'}` : 'Puedes auditar las 3 fotos de esta evaluación con IA en cualquier momento'}
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleRunAdminAiAudit}
          disabled={auditing}
          className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs"
        >
          {auditing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Auditando Fotos...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {aiEval ? '🔄 Re-Auditar Fotos con IA' : '🤖 Auditar Fotos con IA'}
            </>
          )}
        </Button>
      </div>

      {auditError && (
        <div className="mb-4 p-2.5 rounded-lg bg-red-900/30 border border-red-500/40 text-xs text-red-300">
          ⚠️ {auditError}
        </div>
      )}

      {auditBadge}

      {isPdv
        ? renderPdvDetails(liveEval)
        : renderCanalModernoDetails(liveEval)}
    </div>
  );
}
