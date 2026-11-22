import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, Loader2, Minimize2, Maximize2, Wifi, Plus } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { fetchContextForMessage } from '@/services/sofiaDataService';

// ─── Configuración de IA ───────────────────────────────────────────────────
// Groq: 100% gratis, 6000 RPM, sin tarjeta de crédito
// Obtén tu key en: https://console.groq.com → API Keys
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Modelos disponibles en Groq (en orden de preferencia)
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',   // El más capaz
  'llama3-8b-8192',            // Más rápido y ligero
  'gemma2-9b-it',              // Alternativa Google
];
// ───────────────────────────────────────────────────────────────────────────

// Mapa completo del CRM: módulos, rutas y descripción
const CRM_KNOWLEDGE = `
=== PLATAFORMA: CRM Cervezas Finas (Distribuidora Heineken México) ===

## MÓDULOS GLOBALES (disponibles según rol)
- **Directorio de Clientes** (/clients): Base de datos completa de PDVs. Busca por nombre, código, zona, ruta. Puedes ver historial de ventas, metas, evaluaciones y ubicación GPS de cada cliente. Haz clic en un cliente para ver su ficha completa con gráficas de ventas, simulator de precios y actividad reciente.
- **Mapa de Cobertura** (/supervisor/mapa-clientes, /gerente/mapa-clientes): Visualización geoespacial de todos los PDVs en un mapa interactivo. Colores indican status de visita o cumplimiento de meta. Filtra por zona, ruta, marca o estatus.
- **Bitácora de Visitas** (/visits, /supervisor/visitas): Registro cronológico de visitas geolocalizadas con foto de evidencia, comentarios y firma. Cada visita muestra hora de entrada/salida y distancia al PDV.
- **Simulador de Ventas** (/clients/:id/simulator): Calcula el precio final de productos para un cliente específico según su lista de precios, descuentos y reglas de pricing.
- **Mis Tickets / Helpdesk** (/mis-tickets, /admin/helpdesk): Sistema de soporte interno. Crea tickets para reportar problemas técnicos, solicitar accesos, o escalar incidencias.
- **Directorio Interno** (/directorio): Directorio de contactos del equipo comercial con teléfonos, roles y áreas.
- **Utilidades** (/utilidades): Herramientas de uso general: calculadoras, convertidores y recursos operativos.

## MÓDULO ADMIN (/admin/*)
- **Control Central** (/admin/dashboard): Vista global del sistema. KPIs en tiempo real: ventas actuales de ruta, visitas del día, clientes nuevos, comparativo vs año anterior. Acceso a todos los módulos.
- **Panel de Control** (/admin/panel): Configuración master del sistema.
- **Gestión de Usuarios** (/admin/users): CRUD completo de usuarios. Asigna roles, rutas, zonas y permisos. Activa o desactiva cuentas.
- **Gestión de Clientes** (/admin/clients): Administración completa del catálogo de PDVs.
- **Importación de Ventas** (/admin/sales-import): Carga masiva de ventas desde archivos CSV/Excel del sistema UM6 o Heineken.
- **Metas y Objetivos** (/admin/metas): Configuración de metas mensuales por ruta, asesor o zona (en HL y MXN).
- **Evaluaciones** (/admin/evaluations, /admin/evaluation-config): Evaluaciones de PDV con checklist personalizable. Configura criterios, pesos y frecuencia.
- **Inventario de Activos** (/admin/inventory): Control de enfriadores, refrigeradores y equipos instalados en PDVs.
- **Órdenes de Trabajo** (/admin/work-orders): Gestión de instalaciones, mantenimientos y retiros de activos en PDVs.
- **Almacenes** (/admin/warehouses): Inventario por almacén/bodega.
- **Alertas de Activos** (/admin/asset-alerts): Notificaciones automáticas de activos sin movimiento o con anomalías.
- **Comparativo de Ventas** (/admin/comparative-sales): Análisis año vs año por SKU, ruta o zona.
- **Reportes Conquista** (/admin/conquest-reports): KPIs del programa de captación de nuevos clientes.
- **Configuración de Precios** (/admin/price-upload): Carga y gestión de listas de precios por segmento.
- **Marcas** (/admin/brands): Catálogo de marcas y familia de productos Heineken disponibles.
- **Tienda** (/admin/shop): Gestión del catálogo de productos para el canal de venta directa.
- **Anuncios** (/admin/announcements): Publicación de comunicados internos para el equipo.
- **Minutas** (/admin/minutas): Registro y seguimiento de minutas de reuniones.
- **RRHH Dashboard** (/admin/hr-dashboard): Panel de recursos humanos con KPIs de plantilla.
- **Geo Auditoría** (/admin/geo-audit): Auditoría de ubicaciones GPS de visitas.
- **Configuración de Puntos** (/admin/points-config): Programa de puntos/incentivos para asesores.
- **Imágenes SKU** (/admin/sku-images): Gestión de fotografías de productos.
- **Portafolio** (/admin/portafolio): Contenido del portafolio de productos para clientes externos.
- **Notificaciones Push** (/admin/push-broadcast): Envío masivo de notificaciones push a usuarios del CRM.

## MÓDULO TELEVENTA (/televenta/*)
- **Dashboard Televenta** (/televenta/dashboard): KPIs del área: llamadas realizadas, clientes contactados, pedidos generados, comparativo semanal y mensual.
- **Llamadas** (/televenta/llamadas): Registro de llamadas a clientes. Busca cliente, selecciona motivo (pedido, seguimiento, queja) y agrega notas. Historial cronológico.
- **Nuevos Clientes** (/televenta/new-clients): Formulario de alta de PDV nuevo. Captura nombre, dirección, RFC, giro, contacto y zona.
- **Tercerizados** (/televenta/tercerizados): Panel de seguimiento de la promoción de tercerizados. Muestra lista de clientes en promo, fecha de alta, avance de compra mensual vs meta de 5 HTL, y estatus (Completado/Sin Compra/Pendiente). Haz clic en un cliente para ver su historial de ventas detallado.
- **Órdenes Autoventa** (/televenta/autoventa-orders): Pedidos generados por el canal autoventa que requieren gestión telefónica.
- **Órdenes Tienda** (/televenta/shop-orders): Pedidos del canal e-commerce/tienda que requieren confirmación.
- **Ejecuciones Cooler** (/televenta/cooler-executions): Seguimiento de ejecuciones de enfriadores en PDVs asignados a televenta.
- **Redenciones** (/televenta/redemptions): Gestión de canjes de puntos o promociones especiales.
- **Monitoreo de Rutas** (/televenta/monitoring): Vista en tiempo real de asesores en ruta para soporte telefónico.
- **Órdenes de Trabajo** (/televenta/work-orders): Solicitudes de instalación/retiro de equipos que gestiona televenta.
- **Helpdesk** (/televenta/helpdesk): Tickets de soporte del área de televenta.

## MÓDULO SUPERVISOR (/supervisor/*)
- **Dashboard Supervisor** (/supervisor/dashboard): KPIs del equipo a cargo: cobertura de visitas, avance de metas por asesor, clientes sin visita, y alertas del día.
- **Clientes** (/supervisor/clients): Directorio de clientes de las rutas bajo su supervisión.
- **Visitas** (/supervisor/visitas): Bitácora de visitas de todos los asesores supervisados.
- **Mapa de Clientes** (/supervisor/mapa-clientes): Mapa con ubicación y status de todos los PDVs del equipo.
- **Evaluaciones** (/supervisor/evaluations): Evaluaciones de PDV realizadas por su equipo o pendientes.
- **Scorecard** (/supervisor/scorecard): Indicadores de desempeño por asesor: venta HL, cobertura, nuevos clientes, cumplimiento de meta.
- **Censos** (/supervisor/censos): Levantamiento de información de PDVs (existencias, exhibición, equipo frío).
- **Plan de Trabajo** (/supervisor/work-plan): Planificación semanal de actividades del equipo.
- **Supervisión On-Board** (/supervisor/onboard-supervision): Acompaña virtualmente a un asesor durante su ruta en tiempo real.

## MÓDULO GERENTE (/gerente/*)
- **Dashboard Gerencial** (/gerente/dashboard): Vista ejecutiva con KPIs de toda la operación comercial.
- **Clientes** (/gerente/clients): Directorio completo de clientes para análisis gerencial.
- **Mapa** (/gerente/mapa-clientes): Cobertura geográfica de toda la distribución.
- **Llamadas** (/gerente/calls): Registro y seguimiento de llamadas clave.
- **Módulo UM6** (/gerente/um6): Gestión y análisis del canal moderno (UM6/autoservicio).

## MÓDULO CONQUISTA (/conquista/*)
- **Dashboard Conquista** (/conquista/dashboard): KPIs del programa de captación: nuevos PDVs visitados, convertidos, pipeline activo.
- **Mapa Conquista** (/conquista/mapa): Mapa de prospectos y nuevos clientes con status de conversión.
- **Ranking** (/conquista/ranking): Tabla de posiciones de asesores conquista por clientes nuevos captados.

## MÓDULO AUTOVENTA (/autoventa/*)
- **Dashboard Autoventa** (/autoventa/dashboard): KPIs del día: ventas en HL, importe, clientes visitados vs ruta.
- **Clientes** (/autoventa/clients): Lista de clientes en la ruta del día con status de visita.
- **Ventas** (/autoventa/sales): Registro de ventas realizadas durante la sesión del día.
- **Inventario** (/autoventa/inventory): Stock disponible en el camión en tiempo real.
- **Pedidos** (/autoventa/orders): Pedidos pendientes de entrega.
- **Solicitud de Stock** (/autoventa/request): Solicita reabastecimiento de producto al almacén.
- **Sesión de Ventas** (/autoventa/session): Modo de venta activa en PDV.

## MÓDULO INSTALADOR (/installer/*)
- **Dashboard Instalador** (/installer/dashboard): Órdenes de trabajo asignadas del día con prioridad y ubicación.
- **Mapa de Servicios** (/installer/services-map): Mapa con las ubicaciones de los PDVs donde debe ejecutar órdenes.
- **Ejecutar Orden** (/installer/order/:id): Pantalla de ejecución de una orden: captura fotos de antes/después, escanea QR del equipo, firma del PDV y cierre.
- **Agregar Activo** (/installer/add-asset): Registra un activo nuevo (enfriador/refrigerador) al sistema con sus datos de serie y ubicación.

## MÓDULO WAREHOUSE (/warehouse/*)
- **Dashboard Almacén** (/warehouse/dashboard): Inventario general y movimientos del día.
- **Carga de Camión** (/warehouse/load): Registro de producto cargado a cada camión de autoventa.
- **Auditoría de Stock** (/warehouse/audit): Conteo físico de inventario.
- **Historial** (/warehouse/history): Movimientos históricos del almacén.

## MÓDULO ASESOR DINÁMICO (/asesor-dinamico/*)
- Asesor con ruta flexible. Módulos: Dashboard, Clientes, Visitas, Ruta del día, Mapa.

## MÓDULO RRHH (/rrhh/*)
- **Reclutamiento** (/rrhh/recruitment): Pipeline de candidatos por posición.
- **Vacantes** (/rrhh/jobs): Gestión de publicaciones de empleo.
- **Canal Moderno** (/evaluacion/canal-moderno): Evaluaciones específicas para el canal moderno.

## FUNCIONES COMUNES
- **Sincronización**: El sistema trabaja offline-first. Cuando hay internet sincroniza automáticamente. El ícono de WiFi muestra el estado de conexión.
- **Búsqueda de clientes**: En cualquier módulo de clientes, escribe nombre, código o dirección en el buscador. Puedes filtrar por zona, ruta o estatus.
- **Exportar datos**: En tablas con el ícono de descarga puedes exportar a Excel o CSV.
- **Notificaciones**: El ícono de campana muestra alertas y avisos del sistema.
- **Modo oscuro**: La plataforma usa diseño oscuro por defecto para mejor visibilidad en campo.
`;

// Construye el system prompt ultra-enfocado en el CRM
function buildSystemPrompt(userName, role, currentPage) {
  const r = role.toLowerCase();
  
  let accessibleModules = '';
  
  if (r.includes('admin')) {
    accessibleModules = `Como ADMINISTRADOR tienes acceso TOTAL al sistema: todos los módulos de Admin, gestión de usuarios, configuraciones globales, reportes, inventario de activos, RRHH, y todos los dashboards operativos.`;
  } else if (r.includes('supervisor')) {
    accessibleModules = `Como SUPERVISOR tienes acceso a: Dashboard Supervisor, Clientes (tus rutas), Visitas de tu equipo, Mapa de Clientes, Evaluaciones, Scorecard, Censos, Plan de Trabajo, y Supervisión On-Board. NO tienes acceso a configuraciones globales ni gestión de usuarios.`;
  } else if (r.includes('gerente')) {
    accessibleModules = `Como GERENTE tienes acceso a: Dashboard Gerencial, Clientes, Mapa de Cobertura, Llamadas y Módulo UM6. Acceso de solo lectura a los KPIs globales.`;
  } else if (r.includes('televenta')) {
    accessibleModules = `Como TELEVENTA tienes acceso a: Dashboard Televenta, Llamadas, Nuevos Clientes, Panel de Tercerizados, Órdenes Autoventa, Órdenes Tienda, Ejecuciones Cooler, Redenciones, Monitoreo de Rutas, Órdenes de Trabajo y Helpdesk. NO tienes acceso a RRHH, configuraciones globales, ni datos financieros de otras áreas.`;
  } else if (r.includes('conquista')) {
    accessibleModules = `Como CONQUISTA tienes acceso a: Dashboard Conquista, Mapa de Prospectos y Ranking de Asesores. Tu objetivo es captar nuevos PDVs.`;
  } else if (r.includes('autoventa') || r.includes('chofer')) {
    accessibleModules = `Como AUTOVENTA tienes acceso a: Dashboard del día, Clientes de tu ruta, Ventas, Inventario del camión, Pedidos, Solicitud de Stock y Sesión de Ventas.`;
  } else if (r.includes('instalador')) {
    accessibleModules = `Como INSTALADOR tienes acceso a: Dashboard con tus órdenes del día, Mapa de Servicios, Ejecución de Órdenes (fotos, QR, firma) y Registro de Activos. NO puedes ver ventas ni indicadores comerciales.`;
  } else if (r.includes('warehouse') || r.includes('almacen') || r.includes('bodega')) {
    accessibleModules = `Como WAREHOUSE tienes acceso a: Dashboard de Almacén, Carga de Camión, Auditoría de Stock e Historial de movimientos.`;
  } else if (r.includes('coortrade')) {
    accessibleModules = `Como COORTRADE tienes acceso a: Dashboard, Clientes, Visitas, Mapa, Comparativo de Ventas, Scorecard y Evaluaciones.`;
  } else if (r.includes('jefeum6')) {
    accessibleModules = `Como JEFE UM6 tienes acceso a: Dashboard UM6, Clientes Canal Moderno, Ranking de Ventas UM6 y Simulador de precios.`;
  } else {
    accessibleModules = `Como usuario del sistema, tienes acceso básico a la plataforma. Consulta con tu administrador para conocer tus permisos específicos.`;
  }

  return `Eres "Sofía", la asistente virtual EXCLUSIVA del CRM de Cervezas Finas (distribuidora Heineken México).

USUARIO: ${userName} | ROL: ${role}${currentPage ? ` | PÁGINA ACTUAL: ${currentPage}` : ''}

ACCESO DEL USUARIO:
${accessibleModules}

REGLAS ABSOLUTAS — DEBES SEGUIRLAS SIN EXCEPCIÓN:
1. SOLO responde preguntas relacionadas con la plataforma CRM de Cervezas Finas, sus módulos, funciones, navegación y operación.
2. Si alguien pregunta algo que NO tiene relación con el CRM (política, deportes, recetas, código externo, etc.), responde: "Solo puedo ayudarte con preguntas relacionadas con el CRM de Cervezas Finas 😊"
3. Usa SIEMPRE formato Markdown: **negritas**, listas con -, emojis relevantes.
4. Sé conciso. Máximo 5-6 puntos por respuesta. Si la pregunta es simple, responde en 1-2 líneas.
5. Cuando menciones una sección, indica la ruta de navegación entre paréntesis ej: (menú → Clientes).
6. Si no sabes algo específico del CRM, di: "Para esta duda específica te recomiendo contactar a soporte en /mis-tickets"
7. Nunca inventes funciones que no existen en el sistema.

CONOCIMIENTO DEL SISTEMA:
${CRM_KNOWLEDGE}`;
}

// Utilidad para parsear Markdown básico (negritas y saltos de línea)
const parseMarkdown = (text) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="text-white font-bold">{part.slice(2, -2)}</strong>;
    }
    return (
      <span key={index}>
        {part.split('\n').map((line, i, arr) => (
          <React.Fragment key={i}>{line}{i < arr.length - 1 && <br />}</React.Fragment>
        ))}
      </span>
    );
  });
};

// Llama a la API de Groq con historial completo de conversación
// history = array de { role: 'user'|'assistant', content: string }
async function callGroq(enrichedMsg, systemPrompt, history = []) {
  if (!GROQ_KEY || GROQ_KEY.startsWith('gsk_TU_')) {
    return '**⚠️ API Key de Sofía no configurada.**\n\n**Instrucciones para el Admin:**\n1. Ve a [console.groq.com](https://console.groq.com) y crea una cuenta gratis.\n2. Genera una API Key.\n3. Agrégala al archivo `.env`: `VITE_GROQ_API_KEY=gsk_tu_clave_aqui`\n4. Reinicia el servidor de desarrollo.';
  }

  // Construir el array de mensajes: system + historial previo + mensaje actual
  // Limitamos a los últimos 12 mensajes para no exceder tokens
  const MAX_HISTORY = 12;
  const trimmedHistory = history.slice(-MAX_HISTORY).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory,
    { role: 'user',   content: enrichedMsg },
  ];

  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: messagesPayload,
          temperature: 0.4,
          max_tokens: 800,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return data?.choices?.[0]?.message?.content
          ?? 'Lo siento, no pude generar una respuesta. Intenta de nuevo.';
      }

      const errData = await res.json().catch(() => ({}));
      const errMsg  = errData?.error?.message ?? `HTTP ${res.status}`;
      console.warn(`[Sofía] Modelo ${model} falló (${res.status}): ${errMsg}`);

    } catch (err) {
      console.warn(`[Sofía] Error de red con modelo ${model}:`, err.message);
    }
  }

  throw new Error('Todos los modelos de Groq fallaron.');
}

export default function CopilotChat() {
  const { user } = useSupabaseAuth();
  const [isOpen,     setIsOpen]     = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages,   setMessages]   = useState([
    {
      role: 'assistant',
      content: `¡Hola! Soy **Sofía**, tu asistente virtual especializada en Cervezas Finas.\n\n¿En qué te puedo ayudar hoy?`
    }
  ]);
  const [input,     setInput]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const userRole = (
    user?.user_metadata?.type  ||
    user?.user_metadata?.role  ||
    user?.app_metadata?.roles?.[0] ||
    user?.role ||
    'Usuario'
  );
  const userName = user?.user_metadata?.name || user?.email || 'Usuario';

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');

    // Capturamos el historial ANTES de agregar el nuevo mensaje del usuario
    // (messages todavía no tiene el mensaje nuevo en este punto)
    const historySnapshot = [...messages];

    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const currentPage = window.location.pathname;
      const systemPrompt = buildSystemPrompt(userName, userRole, currentPage);

      // Detectar si el usuario pregunta por datos reales del CRM
      const dataContext = await fetchContextForMessage(userMsg, user).catch(() => null);

      // Si hay datos reales, los incluimos en el mensaje al modelo
      const enrichedMsg = dataContext
        ? `${userMsg}\n\n[DATOS REALES DEL SISTEMA PARA RESPONDER ESTA PREGUNTA]:\n${dataContext}\n\nUsa estos datos reales para dar una respuesta precisa y específica.`
        : userMsg;

      // Pasamos el historial previo para que Sofía mantenga el contexto
      // Excluimos el mensaje de bienvenida inicial (index 0) para ahorrar tokens
      const conversationHistory = historySnapshot.slice(1);

      const reply = await callGroq(enrichedMsg, systemPrompt, conversationHistory);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error('[Sofía] Error:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '**Error de conexión** 😔\n\nNo pude conectarme con la IA. Verifica tu internet e inténtalo de nuevo.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      {/* ── Botón flotante ── */}
      <AnimatePresence>
        {!isOpen && (
          <>
          <AnimatePresence>
            {isToolsMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className="fixed bottom-24 right-6 z-[9999] w-56 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl"
                role="menu"
                aria-label="Herramientas rápidas"
              >
                <button
                  onClick={() => { setIsOpen(true); setIsToolsMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/10"
                  role="menuitem"
                >
                  <Sparkles className="h-5 w-5 text-violet-300" />
                  <span>Sofía</span>
                </button>
                <button
                  onClick={() => {
                    window.dispatchEvent(new Event('open-offline-monitor'));
                    setIsToolsMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/10"
                  role="menuitem"
                >
                  <Wifi className="h-5 w-5 text-emerald-300" />
                  <span>Modo offline</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsToolsMenuOpen((open) => !open)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-full shadow-2xl flex items-center justify-center text-white ring-4 ring-slate-900/50 hover:shadow-indigo-500/40 transition-shadow"
            aria-label="Abrir herramientas rápidas"
            aria-expanded={isToolsMenuOpen}
          >
            <Plus className="w-6 h-6" />
          </motion.button>
          </>
        )}
      </AnimatePresence>

      {/* ── Ventana de chat ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 20,   scale: 0.95, transition: { duration: 0.2 } }}
            className={`fixed z-50 flex flex-col bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-300 ${
              isExpanded
                ? 'bottom-0 right-0 w-full h-full md:bottom-6 md:right-6 md:w-[600px] md:h-[80vh] md:rounded-2xl'
                : 'bottom-0 right-0 w-full h-[85vh] sm:bottom-6 sm:right-6 sm:w-[380px] sm:h-[520px] sm:max-h-[72vh] sm:rounded-2xl'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm leading-tight">Sofía</h3>
                  <p className="text-emerald-400 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    En línea
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsExpanded(v => !v)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors hidden sm:block"
                  aria-label={isExpanded ? 'Minimizar' : 'Expandir'}
                >
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                  aria-label="Cerrar chat"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => {
                const isAI = msg.role === 'assistant';
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isAI ? 'justify-start' : 'justify-end'} gap-2`}
                  >
                    {isAI && (
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex flex-shrink-0 items-center justify-center mt-1">
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                      </div>
                    )}
                    <div className={`px-4 py-2.5 max-w-[85%] text-sm shadow-sm leading-relaxed ${
                      isAI
                        ? 'bg-slate-800/80 text-slate-300 rounded-2xl rounded-tl-sm border border-white/5'
                        : 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm'
                    }`}>
                      {parseMarkdown(msg.content)}
                    </div>
                  </motion.div>
                );
              })}

              {isLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex flex-shrink-0 items-center justify-center mt-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                  </div>
                  <div className="px-4 py-3 bg-slate-800/80 rounded-2xl rounded-tl-sm border border-white/5 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span className="text-xs text-slate-400">Pensando...</span>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-slate-800/90 border-t border-white/5 shrink-0">
              <div className="relative flex items-end">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pregúntame algo..."
                  rows={1}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 bottom-2 p-2 bg-indigo-600 text-white rounded-lg disabled:opacity-40 disabled:bg-slate-700 hover:bg-indigo-500 transition-colors"
                  aria-label="Enviar mensaje"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-center text-[9px] text-slate-500 uppercase tracking-widest mt-2">
                IA Generativa · Sofía puede cometer errores
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
