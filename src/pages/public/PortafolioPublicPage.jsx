import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ChevronLeft, BookOpen, X, Plus, Sparkles,
  Beer, Star, Globe, Leaf, Award, ChevronDown, Search, ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPortfolioItems } from '@/repositories/portfolioRepository';

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',       label: 'Todo el Portafolio', icon: Sparkles, color: '#00cc4a', glow: 'rgba(0,204,74,0.5)' },
  { id: 'premium',   label: 'Premium & Global',   icon: Star,     color: '#00ff88', glow: 'rgba(0,255,136,0.5)' },
  { id: 'nacional',  label: 'Hecho en México',    icon: Beer,     color: '#f5a623', glow: 'rgba(245,166,35,0.5)' },
  { id: 'noalcohol', label: 'Sin Alcohol 0.0%',   icon: Leaf,     color: '#60d9fa', glow: 'rgba(96,217,250,0.5)' },
  { id: 'aliados',   label: 'Aliados & Sidras',   icon: Globe,    color: '#c084fc', glow: 'rgba(192,132,252,0.5)' },
  { id: 'custom',    label: 'Portafolio Local',   icon: Award,    color: '#fb923c', glow: 'rgba(251,146,60,0.5)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MARCAS FIJAS DE HEINEKEN MÉXICO (Con imágenes locales de alta resolución)
// ─────────────────────────────────────────────────────────────────────────────
const HEINEKEN_BRANDS = [
  // ── PREMIUM & GLOBAL ─────────────────────────────────────────────────────
  {
    id: 'h_heineken',
    category: 'premium',
    name: 'Heineken® Original',
    tagline: 'La cerveza más internacional del mundo',
    year: 1873,
    origin: 'Ámsterdam, Países Bajos',
    style: 'Lager Premium 100% Malta',
    presentation: 'Botella 355 ml / Lata',
    abv: '5.0%',
    color: '#00ff88',
    glow: 'rgba(0,255,136,0.6)',
    image: '/login/HEINEKEN.png',
    description: 'Elaborada desde 1873 con agua pura, cebada malteada, lúpulo seleccionado y la exclusiva levadura A-Yeast® de Heineken. Sabor puro, fresco y equilibrado con un amargor sutil inconfundible.',
    history: 'Fundada en Ámsterdam por Gerard Adriaan Heineken. Su receta invariable y la levadura A patentada le otorgan su distintivo perfil frutal que hoy se disfruta en más de 190 países de todo el planeta.',
    awards: ['Medalla de Oro — Monde Selection', 'Grand Prix — Exposición Universal de París'],
  },
  {
    id: 'h_heineken_silver',
    category: 'premium',
    name: 'Heineken® Silver',
    tagline: 'Filtrada en frío a −1°C. Extra suave.',
    year: 2021,
    origin: 'Países Bajos / México',
    style: 'Smooth Lager',
    presentation: 'Botella 355 ml NR',
    abv: '4.0%',
    color: '#34d399',
    glow: 'rgba(52,211,153,0.6)',
    image: '/portafolio/4187.png',
    description: 'Madurada a temperaturas bajo cero (−1°C) para lograr un final ultra fresco, suave y sin asperezas. Mantiene la esencia premium de Heineken pero con un perfil más ligero y fácil de tomar.',
    history: 'Desarrollada para las nuevas generaciones que buscan una experiencia cervecera refrescante, menos amarga y con menor graduación alcohólica pero sin perder calidad.',
    awards: ['Innovación Cervecera del Año'],
  },
  {
    id: 'h_dosxx_lager',
    category: 'premium',
    name: 'Dos Equis® XX Lager',
    tagline: 'Refrescante, balanceada y de carácter dorado',
    year: 1897,
    origin: 'Orizaba, Veracruz',
    style: 'Pale Lager Dorada',
    presentation: 'Botella 325 ml / Lata 12 oz',
    abv: '4.5%',
    color: '#d4af37',
    glow: 'rgba(212,175,55,0.65)',
    image: '/login/XX LAGER.png',
    description: 'Cerveza clara de color dorado brillante. De cuerpo ligero a medio, con notas de malta dulce y un toque limpio de lúpulo. Una de las marcas mexicanas de mayor exportación y prestigio mundial.',
    history: 'Creada por el maestro cervecero Wilhelm Hasse en Veracruz para conmemorar la llegada del siglo XX. La doble equis simboliza el número romano 20, marcando una era de modernidad y orgullo nacional.',
    awards: ['Gold Medal — Great American Beer Festival', 'World Beer Cup Silver'],
  },
  {
    id: 'h_dosxx_ambar',
    category: 'premium',
    name: 'Dos Equis® XX Ámbar',
    tagline: 'Maltas tostadas con perfil Vienna clásico',
    year: 1897,
    origin: 'Orizaba, Veracruz',
    style: 'Vienna Amber Lager',
    presentation: 'Botella 325 ml Premier',
    abv: '4.7%',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.65)',
    image: '/login/XX AMBAR.png',
    description: 'Una auténtica lager ámbar estilo Viena. Combina notas tostadas de caramelo, maltas oscuras y un sutil amargor que acompaña perfecto con cortes de carne y gastronomía mexicana de autor.',
    history: 'La receta original con la que nació la marca Siglo XX en 1897. Preserva el estilo tradicional europeo traído por maestros cerveceros que encontraron en el agua de Orizaba la pureza ideal.',
    awards: ['Monde Selection Gold Award'],
  },
  {
    id: 'h_amstel',
    category: 'premium',
    name: 'Amstel Ultra®',
    tagline: 'Low Carb. Solo 85 calorías por botella.',
    year: 1870,
    origin: 'Ámsterdam / México',
    style: 'Ultra Light European Lager',
    presentation: 'Botella 355 ml / Lata',
    abv: '4.0%',
    color: '#38bdf8',
    glow: 'rgba(56,189,248,0.6)',
    image: '/login/AMSTEL ULTRA.png',
    description: 'Pionera en la categoría ultra premium en México. Ofrece un sabor fresco y ligero con solo 2.4 g de carbohidratos y 85 kcal. Diseñada para un estilo de vida activo y balanceado.',
    history: 'Fundada a orillas del río Amstel en 1870. Su versión Ultra revolucionó el mercado mexicano al fusionar el sabor cervecero europeo con los más altos estándares de bajas calorías.',
    awards: ['Líder Nacional en Categoría Ultra Premium'],
  },

  // ── HECHO EN MÉXICO ───────────────────────────────────────────────────────
  {
    id: 'h_tecate_original',
    category: 'nacional',
    name: 'Tecate® Original',
    tagline: 'El sabor del norte. Carácter y autenticidad.',
    year: 1944,
    origin: 'Tecate, Baja California',
    style: 'Golden Lager',
    presentation: 'Botella Retornable / Lata 16 oz',
    abv: '4.5%',
    color: '#ef4444',
    glow: 'rgba(239,68,68,0.65)',
    image: '/login/TECATE ORIGINAL.png',
    description: 'Cerveza tipo lager con cuerpo firme, amargor moderado y aroma herbal limpio. Nacida en el corazón de Baja California, es sinónimo de reunión, carne asada y pasión deportiva mexicana.',
    history: 'Producida por primera vez en 1944 en Tecate, B.C. Fue la primera cerveza mexicana en ser comercializada en lata en 1949, transformando la industria cervecera de todo el continente.',
    awards: ['Sello de Oro a la Calidad Internacional'],
  },
  {
    id: 'h_tecate_light',
    category: 'nacional',
    name: 'Tecate® Light',
    tagline: 'Ligera pero con todo el sabor del norte',
    year: 1992,
    origin: 'México',
    style: 'Light Lager',
    presentation: 'Lata 16 oz / Botella 355 ml',
    abv: '3.9%',
    color: '#f87171',
    glow: 'rgba(248,113,113,0.55)',
    image: '/login/TECATE LIGTH.webp',
    description: 'La primera cerveza light nacida en México con verdadero sabor. Muy refrescante, de menor graduación y cuerpo ligero que sacia la sed en climas cálidos y momentos de convivencia.',
    history: 'Lanzada en 1992 para satisfacer al consumidor que buscaba tomar por más tiempo sin perder el carácter cervecero característico de la marca del águila.',
    awards: ['Cerveza Light #1 en Preferencia Regional'],
  },
  {
    id: 'h_indio',
    category: 'nacional',
    name: 'Indio® Clásica',
    tagline: 'Cerveza oscura. Carácter inconfundible.',
    year: 1941,
    origin: 'Monterrey, Nuevo León',
    style: 'Vienna Dark Lager',
    presentation: 'Caguamón 1.25 L / Media / Lata 12 oz',
    abv: '4.1%',
    color: '#b45309',
    glow: 'rgba(180,83,9,0.65)',
    image: '/portafolio/43.png',
    description: 'Elaborada con una mezcla de maltas rubias y caramelo tostado que le dan su característico color ámbar oscuro, aroma a malta y notas suaves de caramelo. Muy fácil de beber.',
    history: 'Originalmente llamada "Cerveza Cuauhtémoc", la gente comenzó a pedirla simplemente como "la del indio" por la efigie del emperador en su etiqueta. En 1905 adoptó formalmente el nombre Indio.',
    awards: ['Ícono de la Cultura Alternativa y Musical de México'],
  },
  {
    id: 'h_bohemia_clasica',
    category: 'nacional',
    name: 'Bohemia® Clásica',
    tagline: 'La máxima expresión del lúpulo Saaz',
    year: 1905,
    origin: 'Monterrey, Nuevo León',
    style: 'Bohemian Pilsner',
    presentation: 'Botella 355 ml NR 4x6',
    abv: '4.7%',
    color: '#10b981',
    glow: 'rgba(16,185,129,0.65)',
    image: '/portafolio/140116.png',
    description: 'Elaborada con lúpulo noble Saaz de la República Checa. Color dorado intenso, espuma densa y un aroma herbal y floral sofisticado. Para paladares que aprecian la alta maestría cervecera.',
    history: 'Inspirada en la histórica región cervecera de Bohemia. Desde 1905 representa el estándar más alto de la cervecería tradicional mexicana, siendo la más premiada internacionalmente.',
    awards: ['Múltiples Medallas de Oro — World Beer Cup', 'Monde Selection Gran Oro'],
  },
  {
    id: 'h_bohemia_oscura',
    category: 'nacional',
    name: 'Bohemia® Oscura',
    tagline: 'Vienna Style. Tostado perfecto y cuerpo sedoso.',
    year: 1905,
    origin: 'Monterrey, Nuevo León',
    style: 'Vienna Dark Lager',
    presentation: 'Botella 355 ml NR',
    abv: '4.9%',
    color: '#854d0e',
    glow: 'rgba(133,77,14,0.6)',
    image: '/portafolio/24.png',
    description: 'Color castaño brillante con reflejos caoba. Ofrece notas a café tostado, nueces y chocolate amargo equilibradas con un amargor suave y persistente. La mejor compañía gastronómica.',
    history: 'Parte de la familia de especialidades Bohemia, creada para exaltar la tradición culinaria y las grandes cenas de celebración.',
    awards: ['World Beer Awards — Mejor Cerveza Oscura Mexicana'],
  },
  {
    id: 'h_bohemia_cristal',
    category: 'nacional',
    name: 'Bohemia® Cristal',
    tagline: 'Brillante, ligera y ultra bebible',
    year: 2021,
    origin: 'México',
    style: 'Golden Bright Lager',
    presentation: 'Lata 16 oz / Botella 355 ml',
    abv: '4.5%',
    color: '#facc15',
    glow: 'rgba(250,204,21,0.6)',
    image: '/portafolio/4240.png',
    description: 'Una lager luminosa y cristalina elaborada con toques frutales y cuerpo ligero. Mantiene la sofisticación Bohemia con una frescura moderna pensada para tardes soleadas.',
    history: 'La innovación más reciente de Bohemia, presentada en su botella transparente que deja lucir su brillo dorado inmaculado.',
    awards: [],
  },
  {
    id: 'h_sol_clara',
    category: 'nacional',
    name: 'Sol® Original',
    tagline: 'Espíritu libre. El sabor del sol mexicano.',
    year: 1899,
    origin: 'Orizaba, Veracruz',
    style: 'Cerveza Clara Cristalina',
    presentation: 'Botella 355 ml / Cuarto / Media',
    abv: '4.5%',
    color: '#fbbf24',
    glow: 'rgba(251,191,36,0.65)',
    image: '/portafolio/307.png',
    description: 'Luminosa, refrescante y suave. Elaborada con agua de manantial del Pico de Orizaba, ofrece notas dulces de grano y un final limpio perfecto para acompañar con una rodaja de limón.',
    history: 'Nació en 1899 cuando un maestro cervecero vio un rayo de sol penetrar la caldera de cocción y decidió nombrar a la cerveza "El Sol". Símbolo de autenticidad mexicana en todo el mundo.',
    awards: ['Medalla de Plata — World Beer Awards'],
  },
  {
    id: 'h_sol_mezclas',
    category: 'nacional',
    name: 'Sol® Chelada & Clamato',
    tagline: 'La mezcla perfecta lista para tomar',
    year: 2007,
    origin: 'México',
    style: 'Cerveza Preparada / Chelada',
    presentation: 'Lata 16 oz / 24 oz',
    abv: '3.5%',
    color: '#ea580c',
    glow: 'rgba(234,88,12,0.6)',
    image: '/portafolio/4186.png',
    description: 'La auténtica receta mexicana de cerveza con limón, sal y condimentos (o Clamato®). Práctica, refrescante e ideal para el calor, la playa o el fin de semana sin complicaciones.',
    history: 'Pionera en envasar la tradición de las micheladas mexicanas en lata, manteniendo el balance exacto de ingredientes frescos.',
    awards: ['Líder en Categoría Ready-to-Drink Cerveza'],
  },
  {
    id: 'h_carta_blanca',
    category: 'nacional',
    name: 'Carta Blanca®',
    tagline: 'La cerveza que inició la historia cervecera de México',
    year: 1890,
    origin: 'Monterrey, Nuevo León',
    style: 'Lager Tradicional',
    presentation: 'Caguamita 300 ml / Lata 12 oz',
    abv: '4.5%',
    color: '#fef08a',
    glow: 'rgba(254,240,138,0.5)',
    image: '/portafolio/424.png',
    description: 'Cerveza clara de color paja brillante. Sabor nostálgico, fresco, con suave presencia de malta. La emblemática "caguamita" que ha acompañado generaciones de reuniones familiares.',
    history: 'La primera cerveza producida por Cervecería Cuauhtémoc en 1890. Ganadora de premios en Chicago 1893 y París 1900, colocó a México por primera vez en el mapa cervecero global.',
    awards: ['Medalla de Oro — Exposición Colombina de Chicago 1893', 'Gran Premio de París 1900'],
  },
  {
    id: 'h_superior',
    category: 'nacional',
    name: 'Superior®',
    tagline: 'La rubia superior. Calidad legendaria.',
    year: 1896,
    origin: 'Orizaba, Veracruz',
    style: 'Pilsner Mexicana',
    presentation: 'Caguama 1.25 L / Media 355 ml',
    abv: '4.5%',
    color: '#ca8a04',
    glow: 'rgba(202,138,4,0.6)',
    image: '/portafolio/309.png',
    description: 'Cerveza clara tipo Pilsner de gran tradición en el centro y sur del país. De color dorado profundo, sabor noble a malta y amargor equilibrado. Inconfundible botella grabada.',
    history: 'Conocida popularmente como "La Rubia Superior", inmortalizada por una de las campañas publicitarias más memorables de la época de oro de la televisión mexicana.',
    awards: ['Gran Tradición Mexicana'],
  },
  {
    id: 'h_noche_buena',
    category: 'nacional',
    name: 'Noche Buena®',
    tagline: 'Edición especial de invierno. Tradición navideña.',
    year: 1924,
    origin: 'Orizaba, Veracruz',
    style: 'Dark Bock Invernal (Estacional)',
    presentation: 'Botella 355 ml NR',
    abv: '5.9%',
    color: '#991b1b',
    glow: 'rgba(153,27,27,0.7)',
    image: '/portafolio/711.png',
    description: 'La primera cerveza tipo Bock hecha en México. Disponible exclusivamente entre octubre y diciembre. Color caoba oscuro, cuerpo robusto con aromas a pan horneado, frutos secos y ciruela.',
    history: 'Creada en 1924 por maestros cerveceros alemanes en Orizaba como un obsequio privado de Navidad para directivos y amigos. Su éxito fue tan abrumador que en 1938 comenzó a venderse al público.',
    awards: ['Cerveza Estacional Más Vendida de México', 'Monde Selection Gold'],
  },

  // ── SIN ALCOHOL 0.0% ──────────────────────────────────────────────────────
  {
    id: 'h_hk00_botella',
    category: 'noalcohol',
    name: 'Heineken® 0.0% Botella',
    tagline: '0.0% Alcohol. Ahora puedes en cualquier momento.',
    year: 2017,
    origin: 'Países Bajos / México',
    style: 'Non-Alcoholic Premium Lager',
    presentation: 'Botella 250 ml / 355 ml NR',
    abv: '0.03% (Sin Alcohol)',
    color: '#22c55e',
    glow: 'rgba(34,197,94,0.65)',
    image: '/portafolio/4486.png',
    description: 'Elaborada desde cero con los mismos ingredientes nobles que Heineken regular y destilada al vacío para retirar el alcohol suavemente. Sabor afrutado, malteado y 100% cervecero con solo 69 calorías.',
    history: 'Requirió más de 2 años de investigación de los maestros cerveceros de Ámsterdam para lograr que una cerveza sin alcohol tuviera el mismo estándar organoléptico de la receta de 1873.',
    awards: ['Mejor Cerveza Sin Alcohol del Mundo — World Beer Awards', 'Gold Quality Award'],
  },
  {
    id: 'h_hk00_lata',
    category: 'noalcohol',
    name: 'Heineken® 0.0% Lata Sleek',
    tagline: 'Llévala contigo. Sin límites ni compromisos.',
    year: 2019,
    origin: 'México',
    style: 'Non-Alcoholic Lager',
    presentation: 'Lata Sleek 355 ml',
    abv: '0.0% Alcohol',
    color: '#4ade80',
    glow: 'rgba(74,222,128,0.6)',
    image: '/portafolio/4485.png',
    description: 'Toda la experiencia cervecera en presentación de lata portátil. Ideal para almuerzos de trabajo, antes de manejar, rutinas deportivas o disfrutar con amigos en cualquier momento del día.',
    history: 'Líder indiscutible de la categoría sin alcohol en México y el mundo, impulsando un consumo responsable y un estilo de vida saludable.',
    awards: ['Líder en Consumo Responsable'],
  },

  // ── ALIADOS & SIDRAS ──────────────────────────────────────────────────────
  {
    id: 'h_strongbow_gold',
    category: 'aliados',
    name: 'Strongbow® Gold Apple',
    tagline: 'La sidra de manzana #1 del mundo. Servir con hielo.',
    year: 1960,
    origin: 'Herefordshire, Reino Unido',
    style: 'Apple Cider Semiseca',
    presentation: 'Botella 330 ml 1x12',
    abv: '4.5%',
    color: '#eab308',
    glow: 'rgba(234,179,8,0.65)',
    image: '/portafolio/99.png',
    description: 'Elaborada con una mezcla exclusiva de manzanas cultivadas en huertos británicos. Crujiente, burbujeante, con equilibrio perfecto entre acidez frutal y dulzura. Se disfruta servida sobre abundante hielo.',
    history: 'Nombrada en honor a Richard de Clare "Strongbow", legendario arquero británico. Es la sidra más vendida y respetada internacionalmente.',
    awards: ['Gold Medal — Monde Selection'],
  },
  {
    id: 'h_strongbow_rose',
    category: 'aliados',
    name: 'Strongbow® Apple Rosé',
    tagline: 'Manzanas de pulpa roja. Elegancia rosada.',
    year: 2018,
    origin: 'Reino Unido / Bélgica',
    style: 'Rosé Apple Cider',
    presentation: 'Botella 330 ml 12B',
    abv: '4.5%',
    color: '#f43f5e',
    glow: 'rgba(244,63,94,0.65)',
    image: '/portafolio/4694.png',
    description: 'Elaborada con manzanas de pulpa roja que le otorgan un tono rosado natural y un aroma frutal fresco y sofisticado. Menos dulce, más burbujeante y extraordinariamente refrescante.',
    history: 'Creada para competir con los mejores espumosos y vinos rosados en celebraciones casuales, terrazas y brunches.',
    awards: ['Premio al Mejor Diseño e Innovación de Bebidas'],
  },
  {
    id: 'h_strongbow_redberries',
    category: 'aliados',
    name: 'Strongbow® Red Berries',
    tagline: 'Manzana crujiente con explosión de frutos rojos',
    year: 2016,
    origin: 'Reino Unido',
    style: 'Fruit Cider',
    presentation: 'Botella 330 ml 12B',
    abv: '4.5%',
    color: '#ec4899',
    glow: 'rgba(236,72,153,0.65)',
    image: '/portafolio/4770.png',
    description: 'La frescura de la sidra de manzana infusionada con jugo natural de frambuesas, moras y grosellas rojas. Final dulce y floral que sorprende en cada sorbo.',
    history: 'Una de las combinaciones más aclamadas de la línea de sabores Strongbow en Europa y América Latina.',
    awards: [],
  },
  {
    id: 'h_strongbow_honey',
    category: 'aliados',
    name: 'Strongbow® Dark Fruit & Honey',
    tagline: 'Manzanas maduras y notas doradas de miel',
    year: 2017,
    origin: 'Reino Unido',
    style: 'Specialty Cider',
    presentation: 'Botella 330 ml 12B',
    abv: '4.5%',
    color: '#d97706',
    glow: 'rgba(217,119,6,0.65)',
    image: '/portafolio/4773.png',
    description: 'Un perfil cálido y aromático que combina el cuerpo de la manzana prensada con la suavidad de la miel natural. Ideal para quienes buscan un sabor suave, redondo y acogedor.',
    history: 'Inspirada en las recetas artesanales de los valles sidreros de Inglaterra.',
    awards: [],
  },
  {
    id: 'h_miller_highlife',
    category: 'aliados',
    name: 'Miller® High Life',
    tagline: 'The Champagne of Beers. Tradición desde 1903.',
    year: 1903,
    origin: 'Milwaukee, Wisconsin, EE.UU.',
    style: 'American Pilsner Dorada',
    presentation: 'Botella 12 oz 4x6 / Caguama 32 oz',
    abv: '4.6%',
    color: '#fbbf24',
    glow: 'rgba(251,191,36,0.6)',
    image: '/portafolio/380.png',
    description: 'Cerveza clara de alta carbonatación con efervescencia similar al champagne. De color dorado brillante, ligera, crisp y de trago fácil. Distribuida por la alianza Heineken.',
    history: 'Lanzada en la víspera de Año Nuevo de 1903 por Frederick Miller. Su icónica "Chica en la Luna" es uno de los símbolos cerveceros más reconocidos del mundo.',
    awards: ['The Champagne of Beers — Marca Registrada Histórica'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: TARJETA DE PRODUCTO
// ─────────────────────────────────────────────────────────────────────────────
function BrandCard({ brand, onSelect, index }) {
  const [imgError, setImgError] = useState(false);
  const cat = CATEGORIES.find(c => c.id === brand.category);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay: (index % 6) * 0.05, duration: 0.45 }}
      whileHover={{ y: -8 }}
      onClick={() => onSelect(brand)}
      className="group relative cursor-pointer select-none"
    >
      <div
        className="relative rounded-3xl overflow-hidden border transition-all duration-500 group-hover:shadow-2xl flex flex-col h-full"
        style={{
          background: 'linear-gradient(180deg, #07101b 0%, #03060a 100%)',
          borderColor: `${brand.color}25`,
          boxShadow: `0 10px 30px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Glow ambiental superior */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 30%, ${brand.glow.replace(/[\d.]+\)$/, '0.18)')} 0%, transparent 70%)`
          }}
        />

        {/* Badge de Categoría */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
          <span
            className="text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-full backdrop-blur-md"
            style={{
              background: `${brand.color}18`,
              color: brand.color,
              border: `1px solid ${brand.color}40`,
            }}
          >
            {cat?.label || 'Heineken'}
          </span>
        </div>

        {/* Graduación Alcohólica */}
        <div className="absolute top-3 right-3 z-10">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/50 border border-white/10 text-slate-300 backdrop-blur-md">
            {brand.abv}
          </span>
        </div>

        {/* ── HERO IMAGE CONTAINER (BOTELLA / LATA) ── */}
        <div className="relative h-64 w-full flex items-center justify-center p-4 pt-10 overflow-hidden">
          {/* Luz de piso reflectante */}
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-6 rounded-full blur-md opacity-40 group-hover:opacity-80 transition-opacity"
            style={{ background: brand.color }}
          />

          {!imgError ? (
            <img
              src={encodeURI(brand.image)}
              alt={brand.name}
              onError={() => setImgError(true)}
              className="max-h-56 max-w-full object-contain pointer-events-none select-none transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-2"
              style={{
                filter: `drop-shadow(0 15px 25px rgba(0,0,0,0.8)) drop-shadow(0 0 20px ${brand.glow.replace(/[\d.]+\)$/, '0.25)')})`
              }}
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500">
              <Beer className="w-12 h-12 mb-2" style={{ color: brand.color }} />
              <span className="text-xs font-bold text-white">{brand.name}</span>
            </div>
          )}
        </div>

        {/* ── INFO Y ESPECIFICACIONES ── */}
        <div className="p-5 pt-1 flex-1 flex flex-col justify-between relative z-10">
          <div>
            <h3 className="text-lg font-black text-white leading-tight mb-1 group-hover:text-[#00ff88] transition-colors">
              {brand.name}
            </h3>
            <p className="text-xs text-slate-400 line-clamp-1 mb-3">
              {brand.tagline}
            </p>

            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
              <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                {brand.style}
              </span>
              {brand.presentation && (
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                  {brand.presentation}
                </span>
              )}
            </div>
          </div>

          {/* Botón Explorar */}
          <div
            className="mt-4 w-full py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] flex items-center justify-center gap-1.5 transition-all duration-300"
            style={{
              background: `${brand.color}15`,
              color: brand.color,
              border: `1px solid ${brand.color}35`,
            }}
          >
            <span>Ver Historia y Detalles</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: TARJETA DE PRODUCTO LOCAL (CARGADO POR DB / ADMIN)
// ─────────────────────────────────────────────────────────────────────────────
function CustomCard({ item, onSelect, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay: (index % 4) * 0.06 }}
      whileHover={{ y: -6 }}
      onClick={() => onSelect(item)}
      className="group cursor-pointer relative"
    >
      <div className="relative rounded-3xl overflow-hidden border border-orange-500/25 bg-gradient-to-b from-[#0e0a05] to-[#040301] transition-all duration-500 hover:border-orange-500/60 hover:shadow-[0_10px_35px_rgba(251,146,60,0.25)] flex flex-col h-full">
        {item.thumbnail_url ? (
          <div className="h-60 overflow-hidden bg-black/40 flex items-center justify-center p-4">
            <img
              src={item.thumbnail_url}
              alt={item.title}
              className="max-h-52 max-w-full object-contain group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        ) : (
          <div className="h-60 flex items-center justify-center bg-orange-500/5">
            <Award className="w-12 h-12 text-orange-500/40" />
          </div>
        )}

        <div className="absolute top-3 left-3">
          <span className="text-[9px] font-black uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/40">
            Portafolio Local
          </span>
        </div>

        <div className="p-5 pt-2 flex-1 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-white leading-tight mb-1">{item.title}</h3>
            {item.description && (
              <p className="text-xs text-slate-400 line-clamp-2">{item.description}</p>
            )}
          </div>
          <div className="mt-4 w-full py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] text-center bg-orange-500/10 text-orange-400 border border-orange-500/30">
            Ver detalle
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE DETALLE
// ─────────────────────────────────────────────────────────────────────────────
function BrandModal({ brand, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!brand) return null;
  const isHeineken = !!brand.category;
  const cat = isHeineken ? CATEGORIES.find(c => c.id === brand.category) : null;
  const brandColor = brand.color || '#00cc4a';
  const brandGlow = brand.glow || 'rgba(0,204,74,0.5)';

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      {/* Modal Card */}
      <motion.div
        className="relative w-full sm:max-w-2xl bg-[#060e18] rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        initial={{ opacity: 0, y: 70 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
      >
        {/* Header con Showroom Glow */}
        <div
          className="relative h-44 shrink-0 flex items-center justify-center overflow-hidden"
          style={{ background: `linear-gradient(180deg, ${brandColor}22 0%, #060e18 100%)` }}
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2.5 rounded-full bg-black/40 hover:bg-black/70 border border-white/15 transition-colors text-white z-20"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Imagen Hero Central */}
          {brand.image && (
            <img
              src={encodeURI(brand.image)}
              alt={brand.name}
              className="max-h-40 max-w-full object-contain pointer-events-none drop-shadow-[0_15px_30px_rgba(0,0,0,0.9)]"
            />
          )}

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at 50% 60%, ${brandGlow.replace(/[\d.]+\)$/, '0.35)')} 0%, transparent 70%)`
            }}
          />
        </div>

        {/* Contenido scrolleable */}
        <div className="overflow-y-auto flex-1 px-6 sm:px-8 pb-8 pt-2">
          {/* Título y badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-2xl sm:text-3xl font-black text-white">{brand.name || brand.title}</h2>
            {isHeineken && cat && (
              <span
                className="text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full"
                style={{ background: `${brandColor}20`, color: brandColor, border: `1px solid ${brandColor}50` }}
              >
                {cat.label}
              </span>
            )}
          </div>

          <p className="text-sm font-semibold text-[#00ff88] mb-5">{brand.tagline}</p>

          {/* Ficha Técnica */}
          {isHeineken && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
              {[
                { label: 'Estilo', val: brand.style },
                { label: 'Alcohol (ABV)', val: brand.abv },
                { label: 'Origen', val: brand.origin },
                { label: 'Presentación', val: brand.presentation || 'Varias' },
              ].map(s => (
                <div key={s.label} className="bg-white/[0.04] rounded-2xl p-3 border border-white/10 text-center">
                  <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-1">{s.label}</div>
                  <div className="text-xs font-extrabold text-white truncate">{s.val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Descripción */}
          <div className="mb-5 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#00ff88] mb-2">Perfil de Sabor y Notas</h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              {isHeineken ? brand.description : (brand.description || brand.history_text || 'Sin descripción disponible.')}
            </p>
          </div>

          {/* Historia */}
          {isHeineken && brand.history && (
            <div className="mb-5 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2">Historia y Tradición</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{brand.history}</p>
            </div>
          )}

          {/* Premios y reconocimientos */}
          {isHeineken && brand.awards?.length > 0 && (
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Reconocimientos</h3>
              <div className="flex flex-wrap gap-2">
                {brand.awards.map(a => (
                  <span
                    key={a}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{ background: `${brandColor}15`, color: brandColor, border: `1px solid ${brandColor}30` }}
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Video (si es producto local con video) */}
          {!isHeineken && brand.video_url && (
            <div className="mt-4">
              <video
                src={brand.video_url}
                controls
                className="w-full rounded-2xl border border-white/10"
                poster={brand.thumbnail_url}
              />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function PortafolioPublicPage() {
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 320], [1, 0]);
  const heroY = useTransform(scrollY, [0, 320], [0, -50]);

  const [customItems, setCustomItems] = useState([]);
  const [loadingCustom, setLoadingCustom] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    getPortfolioItems().then(data => {
      setCustomItems(data || []);
      setLoadingCustom(false);
    });
  }, []);

  // Filtrado de marcas
  const heinekenFiltered = HEINEKEN_BRANDS.filter(b => {
    const matchCat = activeCategory === 'all' || b.category === activeCategory;
    const matchSearch = !searchTerm ||
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.style?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.tagline?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  const customFiltered = customItems.filter(b => {
    const matchCat = activeCategory === 'all' || activeCategory === 'custom';
    const matchSearch = !searchTerm ||
      (b.title || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  const totalResults = heinekenFiltered.length + customFiltered.length;

  return (
    <>
      <Helmet>
        <title>Portafolio Oficial — Cervezas Finas | Heineken México</title>
        <meta name="description" content="Catálogo completo de marcas premium, nacionales y artesanales de Heineken México distribuidas por Cervezas Finas." />
      </Helmet>

      <div className="min-h-screen bg-[#02050A] text-white overflow-x-hidden font-sans">

        {/* Fondos Neón Ambientales */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#00cc4a]/10 blur-[130px] rounded-full" />
          <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[150px] rounded-full" />
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:28px_28px] opacity-40" />
        </div>

        {/* Header Sticky */}
        <header className="sticky top-0 z-50 bg-[#02050A]/85 backdrop-blur-2xl border-b border-white/[0.08]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group shrink-0"
            >
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform text-[#00ff88]" />
              <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">Regresar</span>
            </button>

            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Cervezas Finas" className="h-9 drop-shadow-[0_0_12px_rgba(0,180,60,0.4)]" />
              <div className="h-6 w-px bg-white/10 hidden sm:block" />
              <span className="text-xs font-extrabold uppercase tracking-widest text-[#00ff88] hidden sm:block">
                Portafolio Oficial
              </span>
            </div>

            <button
              onClick={() => setShowSearch(s => !s)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/5 text-slate-300 hover:text-white hover:border-[#00ff88]/50 transition-all text-xs font-semibold"
            >
              <Search className="w-4 h-4 text-[#00ff88]" />
              <span className="hidden sm:inline">Buscar Cerveza</span>
            </button>
          </div>

          {/* Barra de Búsqueda Desplegable */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-white/[0.08] bg-[#050b14]/95"
              >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      autoFocus
                      placeholder="Buscar por marca (Heineken, Tecate, Bohemia, Sol, Indio, Strongbow...)"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/15 rounded-2xl pl-11 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00ff88]/50 transition-colors"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* ── HERO ── */}
        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative pt-16 pb-12 px-6 text-center max-w-4xl mx-auto z-10"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[#00ff88] text-[10px] font-black uppercase tracking-[0.25em] mb-5 shadow-[0_0_20px_rgba(0,255,136,0.2)]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Distribuidor Autorizado Heineken México
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-black uppercase leading-[0.95] tracking-tight mb-5"
          >
            Maestría Cervecera{' '}
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#00ff88] via-[#00cc4a] to-emerald-500 mt-2">
              Sin Fronteras
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
          >
            Desde las lagers doradas más premiadas del mundo hasta las recetas clásicas nacidas en México.
            Calidad garantizada en cada botella y lata.
          </motion.p>
        </motion.div>

        {/* ── FILTROS TIPO PÍLDORA (STICKY) ── */}
        <div className="sticky top-16 z-40 bg-[#02050A]/90 backdrop-blur-2xl border-b border-white/[0.08] py-3.5 px-4 shadow-xl">
          <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none">
            {CATEGORIES.map(cat => {
              const count = cat.id === 'all'
                ? HEINEKEN_BRANDS.length + customItems.length
                : cat.id === 'custom'
                ? customItems.length
                : HEINEKEN_BRANDS.filter(b => b.category === cat.id).length;

              if (count === 0 && cat.id === 'custom') return null;

              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all border"
                  style={isActive ? {
                    background: `${cat.color}25`,
                    color: cat.color,
                    borderColor: cat.color,
                    boxShadow: `0 0 20px ${cat.glow.replace(/[\d.]+\)$/, '0.4)')}`,
                  } : {
                    background: 'rgba(255,255,255,0.04)',
                    color: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CUADRÍCULA DE PRODUCTOS ── */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-20">

          {/* Marcas de Heineken México */}
          {heinekenFiltered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {heinekenFiltered.map((brand, i) => (
                <BrandCard
                  key={brand.id}
                  brand={brand}
                  onSelect={setSelectedBrand}
                  index={i}
                />
              ))}
            </div>
          )}

          {/* Sección de Portafolio Local (cargado dinámicamente) */}
          {(activeCategory === 'all' || activeCategory === 'custom') && (
            <div className="mt-20">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
                <span className="text-xs font-black uppercase tracking-[0.3em] text-orange-400 flex items-center gap-2">
                  <Award className="w-4 h-4 text-orange-400" />
                  Portafolio Local de Cervezas Finas
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
              </div>

              {loadingCustom ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-72 rounded-3xl bg-white/[0.03] animate-pulse border border-white/5" />
                  ))}
                </div>
              ) : customFiltered.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {customFiltered.map((item, i) => (
                    <CustomCard key={item.id} item={item} onSelect={setSelectedBrand} index={i} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 px-6 border border-dashed border-orange-500/20 rounded-3xl bg-orange-500/[0.02]">
                  <Award className="w-10 h-10 text-orange-500/30 mx-auto mb-3" />
                  <p className="text-slate-400 font-bold text-sm">Portafolio local disponible en almacén</p>
                  <p className="text-slate-600 text-xs mt-1">Los administradores pueden agregar nuevos productos y presentaciones desde el panel de gestión.</p>
                </div>
              )}
            </div>
          )}

          {/* Sin Resultados de Búsqueda */}
          {totalResults === 0 && (
            <div className="text-center py-24">
              <Search className="w-14 h-14 text-slate-700 mx-auto mb-4" />
              <h3 className="text-xl font-black text-white">No se encontraron productos</h3>
              <p className="text-slate-500 text-sm mt-1">
                No hay coincidencias para "{searchTerm}" en esta categoría.
              </p>
              <button
                onClick={() => { setSearchTerm(''); setActiveCategory('all'); }}
                className="mt-5 px-6 py-2.5 rounded-full bg-[#00ff88]/15 border border-[#00ff88]/40 text-[#00ff88] text-xs font-black uppercase tracking-widest hover:bg-[#00ff88]/25 transition-all"
              >
                Restablecer Filtros
              </button>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <footer className="border-t border-white/[0.08] py-12 px-6 bg-[#010307]">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Logo" className="h-7 opacity-60" />
              <span>
                © {new Date().getFullYear()} Cervezas Finas de Ciudad Serdán S.A. de C.V. — Distribuidor Autorizado Heineken México.
              </span>
            </div>
            <div className="flex items-center gap-6 text-slate-400">
              <button onClick={() => navigate('/terminos')} className="hover:text-white transition-colors underline underline-offset-4">
                Términos y Condiciones
              </button>
              <button onClick={() => navigate('/aviso-privacidad')} className="hover:text-white transition-colors underline underline-offset-4">
                Aviso de Privacidad
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* ── MODAL DE DETALLE ── */}
      <AnimatePresence>
        {selectedBrand && (
          <BrandModal brand={selectedBrand} onClose={() => setSelectedBrand(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
