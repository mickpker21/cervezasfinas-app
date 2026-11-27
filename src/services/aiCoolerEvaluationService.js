// src/services/aiCoolerEvaluationService.js
import { kvStorage } from '@/services/kvStorage';

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

/**
 * Matriz Oficial de Planogramas por Tamaño/Modelo de Enfriador (Heineken México / Cervezas Finas)
 */
export const COOLER_PLANOGRAM_SPECS = {
  '144': {
    code: 'CCV144',
    title: 'Enfriador Compacto 1 Puerta (CCV 144)',
    doors: 1,
    shelvesCount: 3,
    allowedLevels: ['Bronce', 'Plata', 'Oro', 'Platino', 'Titanio'],
    shelves: [
      { shelf: 1, position: 'Parrilla 1 (Superior)', type: 'Individual (Lata/Latón 355ml-473ml)', brands: 'Tecate Roja, Tecate Light, Heineken' },
      { shelf: 2, position: 'Parrilla 2 (Media)', type: 'Individual (Botella Media / Cuartito 1¼ - 355ml)', brands: 'Dos Equis Lager, Indio, Heineken' },
      { shelf: 3, position: 'Parrilla 3 (Piso)', type: 'Familiar (Caguama / Mega 1L - 1.2L)', brands: 'Tecate, Indio, Dos Equis' },
    ],
  },
  '192': {
    code: 'CCV192',
    title: 'PDV Plata — Enfriador 1 Puerta 4 Parrillas (CCV 192)',
    doors: 1,
    shelvesCount: 4,
    allowedLevels: ['Plata', 'Oro', 'Platino', 'Titanio'],
    shelves: [
      { shelf: 1, position: 'Parrilla 1 (Superior)', type: 'Individual Lata/Latón', brands: 'Tecate Roja, Tecate Light' },
      { shelf: 2, position: 'Parrilla 2', type: 'Individual Lata/Latón Premium', brands: 'Heineken, Dos Equis Lager, Amstel Ultra' },
      { shelf: 3, position: 'Parrilla 3', type: 'Individual Botella (Media 355ml / Cuartito 1¼)', brands: 'Dos Equis Lager, Indio, Tecate' },
      { shelf: 4, position: 'Parrilla 4 (Piso)', type: 'Familiar (Caguama 940ml / Mega 1.2L)', brands: 'Tecate, Indio, Dos Equis Lager, Carta Blanca' },
    ],
  },
  '320': {
    code: 'CCV320',
    title: 'PDV Plata/Oro — Enfriador 1 Puerta 5 Parrillas (CCV 320)',
    doors: 1,
    shelvesCount: 5,
    allowedLevels: ['Plata', 'Oro', 'Platino', 'Titanio'],
    shelves: [
      { shelf: 1, position: 'Parrilla 1 (Superior)', type: 'Individual Lata/Latón', brands: 'Tecate Light, Amstel Ultra' },
      { shelf: 2, position: 'Parrilla 2', type: 'Individual Lata/Latón', brands: 'Tecate Roja' },
      { shelf: 3, position: 'Parrilla 3', type: 'Individual Lata/Latón', brands: 'Heineken, Dos Equis Lager, Indio' },
      { shelf: 4, position: 'Parrilla 4', type: 'Individual Botella (Media 355ml / Cuartito)', brands: 'Dos Equis Lager, Miller High Life' },
      { shelf: 5, position: 'Parrilla 5 (Piso)', type: 'Familiar (Caguama / Caguamón 1.2L)', brands: 'Tecate, Indio, Dos Equis' },
    ],
  },
  '376': {
    code: 'CCV376',
    title: 'PDV Oro — Enfriador 1 Puerta 6 Parrillas (CCV 376)',
    doors: 1,
    shelvesCount: 6,
    allowedLevels: ['Oro', 'Platino', 'Titanio'],
    shelves: [
      { shelf: 1, position: 'Parrilla 1 (Superior)', type: 'Individual Lata/Sleek', brands: 'Amstel Ultra, Heineken Silver / 0.0, Strongbow' },
      { shelf: 2, position: 'Parrilla 2', type: 'Individual Lata/Latón', brands: 'Tecate Light' },
      { shelf: 3, position: 'Parrilla 3', type: 'Individual Lata/Latón', brands: 'Tecate Roja' },
      { shelf: 4, position: 'Parrilla 4', type: 'Individual Lata/Latón', brands: 'Dos Equis Lager, Heineken, Indio' },
      { shelf: 5, position: 'Parrilla 5', type: 'Individual Botella Vidrio (Media 355ml / Cuartito)', brands: 'Dos Equis Lager, Indio, Miller High Life' },
      { shelf: 6, position: 'Parrilla 6 (Piso)', type: 'Familiar (Caguama / Mega 1.2L)', brands: 'Indio, Tecate Roja, Tecate Light, Dos Equis' },
    ],
  },
  '376_RET': {
    code: 'CCV376-RET',
    title: 'PDV Titanio — Enfriador Retornabilidad 5 Parrillas (CCV 376 Retornable)',
    doors: 1,
    shelvesCount: 5,
    allowedLevels: ['Titanio'],
    shelves: [
      { shelf: 1, position: 'Parrilla 1 (Superior)', type: 'Botella Retornable Individual (Media / Cuartito)', brands: 'Dos Equis Lager, Heineken' },
      { shelf: 2, position: 'Parrilla 2', type: 'Botella Retornable Individual (Media / Cuartito)', brands: 'Dos Equis Lager, Indio, Tecate' },
      { shelf: 3, position: 'Parrilla 3', type: 'Familiar Retornable (Caguama / Mega)', brands: 'Tecate Roja, Tecate Light' },
      { shelf: 4, position: 'Parrilla 4', type: 'Familiar Retornable (Caguama / Mega)', brands: 'Indio, Carta Blanca' },
      { shelf: 5, position: 'Parrilla 5 (Piso)', type: 'Familiar Retornable (Caguama / Mega)', brands: 'Dos Equis Lager, Indio' },
    ],
  },
  '500': {
    code: 'CCV500',
    title: 'PDV Platino — Enfriador 1 Puerta Cabezal Tecate 5 Parrillas (CCV 500)',
    doors: 1,
    shelvesCount: 5,
    allowedLevels: ['Platino', 'Titanio'],
    shelves: [
      { shelf: 1, position: 'Parrilla 1 (Superior)', type: 'Individual Lata/Latón', brands: 'Tecate Light, Amstel Ultra, Sol Clamato' },
      { shelf: 2, position: 'Parrilla 2', type: 'Individual Lata/Latón', brands: 'Tecate Roja, Tecate Light' },
      { shelf: 3, position: 'Parrilla 3', type: 'Individual Lata/Latón', brands: 'Amstel Ultra, Heineken, Dos Equis Lager' },
      { shelf: 4, position: 'Parrilla 4', type: 'Individual Botella Vidrio (Media 355ml / 710ml)', brands: 'Dos Equis Lager, Miller High Life, Heineken' },
      { shelf: 5, position: 'Parrilla 5 (Piso)', type: 'Familiar (Caguama / Mega 1.2L)', brands: 'Tecate Roja, Indio, Dos Equis Lager' },
    ],
  },
  '552': {
    code: 'CCV552',
    title: 'PDV Platino — Enfriador 1 Puerta Ancha 6 Parrillas (CCV 552)',
    doors: 1,
    shelvesCount: 6,
    allowedLevels: ['Platino', 'Titanio'],
    shelves: [
      { shelf: 1, position: 'Parrilla 1 (Superior)', type: 'Individual Lata/Sleek', brands: 'Amstel Ultra, Strongbow, Sol Mezclas' },
      { shelf: 2, position: 'Parrilla 2', type: 'Individual Lata/Latón', brands: 'Tecate Light' },
      { shelf: 3, position: 'Parrilla 3', type: 'Individual Lata/Latón', brands: 'Tecate Roja, Heineken, Dos Equis' },
      { shelf: 4, position: 'Parrilla 4', type: 'Individual Lata/Latón', brands: 'Amstel Ultra, Indio, Carta Blanca' },
      { shelf: 5, position: 'Parrilla 5', type: 'Individual Botella Vidrio (Media 355ml)', brands: 'Dos Equis Lager, Miller High Life' },
      { shelf: 6, position: 'Parrilla 6 (Piso)', type: 'Familiar (Caguama / Mega 1.2L)', brands: 'Tecate, Indio, Dos Equis Lager' },
    ],
  },
  '900': {
    code: 'CCV900',
    title: 'PDV Titanio — Enfriador 2 Puertas 5 Niveles (CCV 900)',
    doors: 2,
    shelvesCount: 5,
    allowedLevels: ['Titanio'],
    shelves: [
      { shelf: 1, position: 'Nivel 1 (Ambas Puertas - Superior)', type: 'Individual Lata/Latón', brands: 'Izq: Tecate Roja | Der: Heineken, Amstel Ultra, Strongbow' },
      { shelf: 2, position: 'Nivel 2 (Ambas Puertas)', type: 'Individual Lata/Latón', brands: 'Izq: Amstel Ultra, Tecate Roja | Der: Dos Equis, Miller, Tecate Light' },
      { shelf: 3, position: 'Nivel 3 (Ambas Puertas)', type: 'Individual Lata/Latón', brands: 'Izq: Amstel Ultra, Tecate | Der: Heineken, Dos Equis Lager' },
      { shelf: 4, position: 'Nivel 4 (Ambas Puertas)', type: 'Individual Botella Vidrio (Media 355ml / Cuartito)', brands: 'Dos Equis Lager, Miller High Life, Heineken' },
      { shelf: 5, position: 'Nivel 5 (Ambas Puertas - Piso)', type: 'Familiar (Caguama / Mega 1.2L)', brands: 'Indio, Tecate Roja, Tecate Light, Dos Equis Lager' },
    ],
  },
  '1350': {
    code: 'CCV1350',
    title: 'PDV Titanio — Enfriador 3 Puertas / Gran Volumen (CCV 1350)',
    doors: 3,
    shelvesCount: 5,
    allowedLevels: ['Titanio'],
    shelves: [
      { shelf: 1, position: 'Nivel 1 (Superior)', type: 'Individual Lata/Sleek Premium', brands: 'Heineken, Amstel Ultra, Strongbow, Tecate Light' },
      { shelf: 2, position: 'Nivel 2', type: 'Individual Lata/Latón', brands: 'Tecate Roja, Tecate Light' },
      { shelf: 3, position: 'Nivel 3', type: 'Individual Lata/Latón', brands: 'Dos Equis Lager, Indio, Carta Blanca' },
      { shelf: 4, position: 'Nivel 4', type: 'Individual Botella Vidrio (Media / Cuartito)', brands: 'Dos Equis Lager, Miller High Life, Heineken' },
      { shelf: 5, position: 'Nivel 5 (Piso)', type: 'Familiar (Caguama / Mega 1.2L / 12-Pack)', brands: 'Indio, Tecate, Dos Equis, Carta Blanca' },
    ],
  },
};

/**
 * Convierte un File, Blob o URL/Base64 a un dataURL JPEG comprimido (máx 960px)
 * para que las 3 fotos viajen rápido y sin gastar tokens excesivos.
 */
export async function compressImageForAI(input, maxDim = 960, quality = 0.78) {
  if (!input) return null;

  let srcUrl = null;
  let revokeNeeded = false;

  if (typeof input === 'string') {
    srcUrl = input;
  } else if (input instanceof Blob || input instanceof File) {
    srcUrl = URL.createObjectURL(input);
    revokeNeeded = true;
  } else {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width || 800;
        let h = img.naturalHeight || img.height || 600;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (revokeNeeded && srcUrl) URL.revokeObjectURL(srcUrl);
        resolve(dataUrl);
      } catch (e) {
        if (revokeNeeded && srcUrl) URL.revokeObjectURL(srcUrl);
        resolve(typeof input === 'string' && input.startsWith('data:') ? input : null);
      }
    };
    img.onerror = () => {
      if (revokeNeeded && srcUrl) URL.revokeObjectURL(srcUrl);
      resolve(typeof input === 'string' && input.startsWith('data:') ? input : null);
    };
    img.src = srcUrl;
  });
}

function extractJsonFromText(rawText) {
  if (!rawText) return null;
  const text = String(rawText).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function getApiKeys() {
  let customGemini = '';
  let customGroq = '';
  try {
    customGemini = (await kvStorage.getItem('cf_custom_gemini_api_key')) || localStorage.getItem('cf_custom_gemini_api_key') || '';
    customGroq = (await kvStorage.getItem('cf_custom_groq_api_key')) || localStorage.getItem('cf_custom_groq_api_key') || '';
  } catch {}
  return {
    geminiKey: customGemini || GEMINI_KEY,
    groqKey: customGroq || GROQ_KEY,
  };
}

/**
 * Llama a Google Gemini Vision (2.5-flash / 2.0-flash / 1.5-flash) con las 3 imágenes en una sola petición.
 */
async function callGeminiVision(prompt, base64Images, apiKey) {
  if (!apiKey) throw new Error('NO_GEMINI_KEY');

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  const parts = [{ text: prompt }];

  for (const imgObj of base64Images) {
    if (!imgObj?.dataUrl) continue;
    const base64Clean = imgObj.dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    parts.push({ text: `[IMAGEN: ${imgObj.label}]` });
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: base64Clean,
      },
    });
  }

  let lastErr = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 180)}`);
      }

      const json = await res.json();
      const textOut = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || '';
      const parsed = extractJsonFromText(textOut);
      if (parsed) {
        return { ...parsed, _provider: `Google Gemini (${model})` };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gemini Vision no pudo responder.');
}

/**
 * Fallback automático a Groq Vision (Llama 4 Scout / Llama 3.2 Vision) gratis
 */
async function callGroqVision(prompt, base64Images, apiKey) {
  if (!apiKey) throw new Error('NO_GROQ_KEY');

  const models = [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama-3.2-90b-vision-preview',
    'llama-3.2-11b-vision-preview',
  ];

  const content = [{ type: 'text', text: prompt }];
  for (const imgObj of base64Images) {
    if (!imgObj?.dataUrl) continue;
    content.push({ type: 'text', text: `[IMAGEN: ${imgObj.label}]` });
    content.push({
      type: 'image_url',
      image_url: { url: imgObj.dataUrl },
    });
  }

  let lastErr = null;
  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1800,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Groq ${model} HTTP ${res.status}: ${errText.slice(0, 180)}`);
      }

      const json = await res.json();
      const textOut = json?.choices?.[0]?.message?.content || '';
      const parsed = extractJsonFromText(textOut);
      if (parsed) {
        return { ...parsed, _provider: `Groq Vision (${model})` };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Groq Vision no pudo responder.');
}

/**
 * Evalúa con IA las 3 fotos de un Enfriador PDV tradicional según su tamaño (144, 192, 320, 376, 500, 552, 900, 1350)
 * y el nivel del cliente (Bronce, Plata, Oro, Platino, Titanio).
 */
export async function analyzePdvCoolerWithAI({
  fotoFachada,
  fotoInterior,
  fotoEnfriador,
  coolerSize = '376',
  clientLevel = 'Oro',
  availablePresentaciones = [],
}) {
  const [imgFachada, imgInterior, imgEnfriador] = await Promise.all([
    compressImageForAI(fotoFachada),
    compressImageForAI(fotoInterior),
    compressImageForAI(fotoEnfriador),
  ]);

  const spec = COOLER_PLANOGRAM_SPECS[coolerSize] || COOLER_PLANOGRAM_SPECS['376'];
  const shelvesText = spec.shelves
    .map((s) => `- ${s.position}: Debe contener ${s.type} (${s.brands})`)
    .join('\n');

  const presList = availablePresentaciones.length > 0
    ? availablePresentaciones.join(', ')
    : 'Heineken, Tecate, Tecate Light, Dos Equis Lager, Dos Equis Ambar, Indio, Carta Blanca, Amstel Ultra, Miller High Life, StrongBow';

  const prompt = `Eres el Auditor Oficial de Ejecución Comercial e Inteligencia Artificial de Cervezas Finas (Distribuidora Heineken México).
Tu dictamen se utiliza para el PAGO DE COMISIONES de vendedores y supervisores, por lo que debes ser 100% OBJETIVO, ESTRICTO y PRECISO.

DATOS DEL PUNTO DE VENTA Y ENFRIADOR A EVALUAR:
- Nivel del Cliente: "${clientLevel || 'Oro'}"
- Modelo/Capacidad del Enfriador seleccionado: "${spec.title}" (Capacidad: ${coolerSize}, Puertas esperadas: ${spec.doors}, Parrillas esperadas: ${spec.shelvesCount})
- ACOMODO OFICIAL POR PARRILLA (PLANOGRAMA DE ARRIBA HACIA ABAJO):
${shelvesText}

REGLAS ESTRICTAS DE AUDITORÍA HEINEKEN:
1. VALIDACIÓN DE FOTOS REALES: Verifica que las 3 fotos (FACHADA, INTERIOR, ENFRIADOR) sean fotografías reales de un punto de venta y un enfriador comercial. Si alguna foto es negra, borrosa extrema, tomada a una pantalla, al piso o repetida, marca "fotos_validas": false y detállalo en "alerta_fraude".
2. PLANOGRAMA (10% - INDISPENSABLE):
   - "invasion": "si" si hay CUALQUIER producto que NO sea de Heineken México dentro del enfriador (ej. Corona, Victoria, Modelo, Bud Light, Coca-Cola, Pepsi, refrescos, jugos, aguas, leche, comida, bolsas). Si solo hay productos Heineken México, es "no".
   - "huecos": "si" si hay espacios vacíos notorios en el frente de las parrillas donde caben latas o botellas. Si las parrillas están bien abastecidas al frente, es "no".
   - "skuIndividual": "si" si se observan al menos 2 SKUs de calibre individual (latas, latones, cuartitos o medias botellas 355ml) en las parrillas superiores. De lo contrario "no".
   - "skuFamiliar": "si" si se observa al menos 1 SKU familiar (Caguama, Caguamón/Mega 1L/1.2L o 12-pack) en la parrilla inferior (piso). De lo contrario "no".
   - "acomodoPorParrillaOk": true si los individuales están arriba y las caguamas/familiares están en el piso inferior respetando la estructura del enfriador ${spec.code}.
3. SURTIDO (10%):
   - De esta lista oficial de marcas/presentaciones: [${presList}], devuelve en "presentaciones_detectadas" ÚNICAMENTE los nombres exactos de la lista que sí se alcanzan a distinguir dentro del enfriador.
   - "enfriadorPrimeraPos": "si" si en la foto de interior/enfriador el equipo está visible y accesible al cliente (primera posición); "no" si está escondido tras rejas o bodega.
4. COMUNICACIÓN EXTERIOR (20% - Foto Fachada):
   - "estadoNegocio": "Abierto", "Cerrado" o "Enrejado".
   - "fachadaBanderola": "si" si la fachada tiene comunicación exterior de Heineken/Tecate/Dos Equis/Indio (Banderola, Vinil, Lona, Letrero luminoso o fachada pintada oficial); "no" si no tiene nada.
   - "elementosExterior": lista de elementos visibles entre ["Banderola", "Vinil", "Lona", "Letrero luminoso"].
5. COMUNICACIÓN INTERIOR (10% - Foto Interior y Enfriador):
   - "elementosInterior": lista de elementos POP visibles entre ["Porta poster 1", "Porta poster 2", "Porta poster 3", "Cooler blade", "Refricalco", "Preciador"].
6. CAPACIDAD Y FRÍO (50%):
   - "puertas_detectadas": número de puertas que ves en el enfriador.
   - "parrillas_detectadas": número de niveles/parrillas que ves en el enfriador.
   - "capacidad_estimada": capacidad que mejor coincide visualmente entre ["144", "192", "320", "376", "500", "552", "900", "1350"].
   - "productividad": "Bueno" (llenado >= 70% con producto Heineken), "Regular" (llenado 40%-69%) o "Malo" (< 40%).
   - "enfriadorFunciona": "si" si el enfriador se ve encendido/iluminado o operando como refrigerador activo; "no" si se ve apagado/desconectado o usado como alacena seca.

Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "fotos_validas": true,
  "alerta_fraude": "",
  "confianza_ia": 95,
  "estadoNegocio": "Abierto",
  "enfriadorPrimeraPos": "si",
  "presentaciones_detectadas": ["Tecate", "Tecate Light", "Dos Equis Lager", "Indio", "Heineken"],
  "invasion": "no",
  "detalle_invasion": "Sin invasión detectada",
  "huecos": "no",
  "detalle_huecos": "Parrillas completas al frente",
  "skuIndividual": "si",
  "skuFamiliar": "si",
  "acomodoPorParrillaOk": true,
  "fachadaBanderola": "si",
  "elementosExterior": ["Banderola", "Lona"],
  "elementosInterior": ["Cooler blade", "Refricalco", "Preciador"],
  "productividad": "Bueno",
  "enfriadorFunciona": "si",
  "puertas_detectadas": 1,
  "parrillas_detectadas": 6,
  "capacidad_estimada": "${coolerSize}",
  "analisis_parrillas": [
    { "parrilla": 1, "esperado": "Individual Lata", "detectado": "Latas Tecate Light bien acomodadas", "cumple": true },
    { "parrilla": 2, "esperado": "Individual Lata", "detectado": "Latas Tecate Roja completas", "cumple": true }
  ],
  "resumen_ejecutivo": "Enfriador CCV376 bien ejecutado, sin invasión y con caguamas en piso."
}`;

  const images = [
    { label: 'FOTO 1 - FACHADA EXTERIOR DEL NEGOCIO', dataUrl: imgFachada },
    { label: 'FOTO 2 - INTERIOR DEL NEGOCIO Y COMUNICACIÓN POP', dataUrl: imgInterior },
    { label: 'FOTO 3 - INTERIOR DEL ENFRIADOR Y PARRILLAS', dataUrl: imgEnfriador },
  ].filter((x) => Boolean(x.dataUrl));

  if (images.length === 0) {
    throw new Error('Debes capturar las fotografías antes de analizar con IA.');
  }

  const { geminiKey, groqKey } = await getApiKeys();

  // Intentar primero Gemini Vision (1,500 gratis/día) y si falla o no hay key, Groq Vision (Llama 4 Scout gratis)
  try {
    return await callGeminiVision(prompt, images, geminiKey);
  } catch (geminiErr) {
    console.warn('[AI Cooler Eval] Gemini falló, usando respaldo Groq Vision:', geminiErr?.message);
    return await callGroqVision(prompt, images, groqKey);
  }
}

/**
 * Evalúa con IA las 3 fotos de OXXO o Canal Moderno (Fachada, Anaquel/Cuarto Frío Destino, Exhibición Impulso)
 */
export async function analyzeModernChannelWithAI({
  photoFachada,
  photoDestino,
  photoImpulso,
  isOxxo = false,
  targetBeerPct = 41,
}) {
  const [imgFachada, imgDestino, imgImpulso] = await Promise.all([
    compressImageForAI(photoFachada),
    compressImageForAI(photoDestino),
    compressImageForAI(photoImpulso),
  ]);

  const channelName = isOxxo ? 'Cadena OXXO' : 'Canal Moderno (Autoservicio)';
  const prompt = `Eres el Auditor Oficial de Ejecución Comercial e IA de Cervezas Finas (Heineken México) para ${channelName}.
Analiza las 3 fotografías obligatorias:
1. FOTO 1 (Fachada / Frontal de tienda)
2. FOTO 2 (Destino / Anaquel o Cuarto Frío de Cerveza)
3. FOTO 3 (Impulso / Exhibición adicional, cabecera o flanqueo)

Evalúa objetivamente y devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "fotos_validas": true,
  "alerta_fraude": "",
  "confianza_ia": 94,
  "surtido": {
    "cervezaCompleta": true,
    "otrasCatCompleta": true,
    "frescuraOk": true
  },
  "precios": {
    "preciosVisibles": true
  },
  "promos": {
    "tableroVigente": true,
    "papeletaCadena": true
  },
  "impulso": {
    "primera": { "presente": true, "reglaOk": true, "precioVisible": true, "promoVisible": true, "materialEjec": true },
    "flanqueo": { "presente": true, "reglaOk": true, "precioVisible": true, "promoVisible": false, "materialEjec": false },
    "zero": { "na": false, "presente": true, "reglaOk": true, "precioVisible": true, "promoVisible": false, "materialEjec": false },
    "enfriador": { "na": false, "presente": true, "reglaOk": true, "precioVisible": true, "promoVisible": true, "materialEjec": true }
  },
  "destino": {
    "cerveza": { "participacion": ${targetBeerPct}, "precioVisible": true, "promoVisible": true, "materialEjec": true },
    "bas": { "participacion": 40, "precioVisible": true, "promoVisible": true, "materialEjec": false }
  },
  "hallazgos_ia": [
    "Cuarto frío / anaquel con participación estimada de marcas Heineken y precios visibles.",
    "Exhibición de impulso detectada con material POP."
  ],
  "resumen_ejecutivo": "Ejecución en ${channelName} verificada por IA."
}`;

  const images = [
    { label: 'FOTO 1 - FACHADA / FRONTAL TIENDA', dataUrl: imgFachada },
    { label: 'FOTO 2 - DESTINO / ANAQUEL / CUARTO FRÍO', dataUrl: imgDestino },
    { label: 'FOTO 3 - IMPULSO / EXHIBICIÓN ADICIONAL', dataUrl: imgImpulso },
  ].filter((x) => Boolean(x.dataUrl));

  if (images.length === 0) {
    throw new Error('Debes capturar las 3 fotografías antes de analizar con IA.');
  }

  const { geminiKey, groqKey } = await getApiKeys();

  try {
    return await callGeminiVision(prompt, images, geminiKey);
  } catch (geminiErr) {
    console.warn('[AI Modern Eval] Gemini falló, usando respaldo Groq Vision:', geminiErr?.message);
    return await callGroqVision(prompt, images, groqKey);
  }
}
