import React from 'react';
import { format } from 'date-fns';

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

export default function EvaluationDetailViewer({ evaluation }) {
  if (!evaluation) return null;
  const evaluationType = evaluation.tipo || evaluation.type;

  return (
    <div className="p-1">
      {evaluationType === 'PDV'
        ? renderPdvDetails(evaluation)
        : renderCanalModernoDetails(evaluation)}
    </div>
  );
}
