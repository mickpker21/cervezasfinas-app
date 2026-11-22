
import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Store, Landmark, MousePointerClick, Star, Quote, MessageCircle, Menu, X } from "lucide-react";

const Section = ({ children, className = "" }) => (
  <section className={`w-full max-w-7xl mx-auto px-4 md:px-6 ${className}`}>{children}</section>
);

export default function HomePage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col">
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur bg-gray-900/70 border-b border-white/10">
        <Section className="py-4 flex items-center justify-between">
          <Link to="/">
            <img src="/logo2.png" alt="Logo" className="h-12 md:h-20 w-auto invert hue-rotate-180 mix-blend-screen" />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-300">
            <Link to="/" className="hover:text-white">Inicio</Link>
            <Link to="/servicios" className="hover:text-white">Servicios</Link>
            <Link to="/portafolio" className="hover:text-white">Portafolio</Link>
            <Link to="/nosotros" className="hover:text-white">Nosotros</Link>
            <Link to="/contacto" className="hover:text-white">Contacto</Link>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="https://wa.me/2454504146"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-transform hover:scale-[1.02]"
            >
              Cotizar
            </a>
            <Link
              to="/login"
              className="hidden md:inline-flex bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition-transform hover:scale-[1.02]"
            >
              Ingresar
            </Link>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-gray-300 hover:text-white"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </Section>

        {/* Mobile Nav Overlay */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden absolute top-full left-0 w-full bg-gray-900 border-b border-white/10 shadow-2xl py-4 px-4 flex flex-col gap-4 text-center"
          >
            <Link to="/" className="text-gray-300 hover:text-white py-2" onClick={() => setIsMobileMenuOpen(false)}>Inicio</Link>
            <Link to="/servicios" className="text-gray-300 hover:text-white py-2" onClick={() => setIsMobileMenuOpen(false)}>Servicios</Link>
            <Link to="/portafolio" className="text-gray-300 hover:text-white py-2" onClick={() => setIsMobileMenuOpen(false)}>Portafolio</Link>
            <Link to="/nosotros" className="text-gray-300 hover:text-white py-2" onClick={() => setIsMobileMenuOpen(false)}>Nosotros</Link>
            <Link to="/contacto" className="text-gray-300 hover:text-white py-2" onClick={() => setIsMobileMenuOpen(false)}>Contacto</Link>
            <div className="flex flex-col gap-3 mt-2">
              <Link
                to="/login"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-lg"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Iniciar Sesión
              </Link>
              <a
                href="https://wa.me/2454504146"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-lg"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Cotizar WhatsApp
              </a>
            </div>
          </motion.div>
        )}
      </header>

      {/* HERO */}
      <Section className="flex-1 py-16 md:py-24 grid lg:grid-cols-2 gap-10 items-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="space-y-6">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-green-500">
            CERVEZAS FINAS DE CIUDAD SERDAN
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl">
            Innovación, diseño y tecnología para llevar tu proyecto al siguiente nivel. Exploramos, diseñamos y desarrollamos soluciones modernas, optimizadas y listas para convertir.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/portafolio"
              className="bg-emerald-600 hover:bg-emerald-700 font-semibold py-3 px-6 rounded-lg transition-transform hover:scale-105"
            >
              Ver Portafolio
            </Link>
            <Link
              to="/servicios"
              className="bg-gray-700 hover:bg-gray-600 font-semibold py-3 px-6 rounded-lg transition-transform hover:scale-105"
            >
              Nuestros Servicios
            </Link>
          </div>
          <div className="flex items-center gap-5 pt-4 text-sm text-gray-400">
            <div className="flex items-center gap-2"><Star className="h-5 w-5" /> 4.9/5 satisfacción</div>
            <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5" /> Soporte dedicado</div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="relative">
          <img src="/marcas.png" alt="Marcas" className="aspect-video rounded-2xl object-contain border border-white/10 shadow-2xl" />
          <div className="absolute -bottom-6 -left-6 bg-gray-800/70 border border-white/10 rounded-xl p-4 max-w-xs">
            <p className="text-sm text-gray-300">Marcas de calidad.</p>
          </div>
        </motion.div>
      </Section>

      {/* SERVICIOS */}
      <Section id="servicios" className="py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-extrabold">Desarrollo Web a Medida</h2>
          <p className="text-gray-400 mt-3 max-w-2xl mx-auto">Sitios institucionales, landing pages y tiendas online con tu identidad y listos para crecer.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <ServiceCard
            icon={<Landmark className="h-7 w-7" />}
            title="Sitio Institucional"
            desc="Comunica misión, visión y servicios con una arquitectura clara y SEO técnico base."
            to="/servicios"
          />
          <ServiceCard
            icon={<MousePointerClick className="h-7 w-7" />}
            title="Landing Page"
            desc="Onepage enfocada en conversión: secciones clave, formularios y métricas listas."
            to="/servicios"
          />
          <ServiceCard
            icon={<Store className="h-7 w-7" />}
            title="Tienda Online"
            desc="Ecommerce robusto, checkout fluido y administración sencilla para crecer."
            to="/servicios"
          />
        </div>
      </Section>

      {/* PORTAFOLIO TEASER */}
      <Section className="py-12">
        <div className="rounded-2xl border border-white/10 bg-gray-800/40 p-6 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h3 className="text-2xl md:text-3xl font-bold">Casos de éxito</h3>
            <p className="text-gray-400 mt-2 max-w-2xl">Resultados reales en distintos sectores. Optimización, diseño y soporte continuo.</p>
          </div>
          <Link
            to="/portafolio"
            className="inline-flex bg-emerald-600 hover:bg-emerald-700 font-semibold py-3 px-6 rounded-lg transition-transform hover:scale-105"
          >
            Ver Portfolio
          </Link>
        </div>
      </Section>

      {/* TESTIMONIOS */}
      <Section className="py-16">
        <h3 className="text-3xl md:text-4xl font-extrabold text-center">Nuestros clientes lo dicen</h3>
        <div className="mt-10 grid md:grid-cols-3 gap-6">
          {[
            {
              name: "Mafer M.",
              text:
                "Fueron súper atentos y pacientes con las ediciones. Me encantó cómo quedó.",
            },
            { name: "Rodrigo C.", text: "Excelente servicio y muy comprometidos con el trabajo." },
            { name: "Estefany B.", text: "Rápidos, pendientes y trabajo impecable. Súper recomendados." },
          ].map((t, i) => (
            <blockquote key={i} className="rounded-2xl border border-white/10 bg-gray-800/40 p-6">
              <Quote className="h-6 w-6 mb-4" />
              <p className="text-gray-200">{t.text}</p>
              <footer className="mt-4 text-sm text-gray-400">— {t.name}</footer>
            </blockquote>
          ))}
        </div>
      </Section>

      {/* CTA CONTACTO */}
      <Section id="contacto" className="py-16 md:py-24">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-emerald-600/20 to-green-600/20 p-8 md:p-12 text-center">
          <h3 className="text-3xl md:text-4xl font-extrabold">¿Listo para despegar?</h3>
          <p className="text-gray-200 mt-2">Cuéntanos tu idea y armamos una propuesta a medida.</p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <a
              href="https://wa.me/2454504146"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-500 hover:bg-green-600 font-semibold py-3 px-6 rounded-lg transition-transform hover:scale-105"
            >
              Hablar por WhatsApp
            </a>
            <Link
              to="/contacto"
              className="bg-gray-800 hover:bg-gray-700 font-semibold py-3 px-6 rounded-lg border border-white/10"
            >
              Formulario de contacto
            </Link>
          </div>
        </div>
      </Section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 mt-auto">
        <Section className="py-8 text-center text-sm text-gray-400">
          <p>© {new Date().getFullYear()} — Todos los derechos reservados.</p>
          <p className="mt-1">Diseño y Desarrollo web</p>
        </Section>
      </footer>

      {/* FAB WhatsApp */}
      <a
        href="https://wa.me/2454504146"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 text-white font-bold p-4 rounded-full shadow-lg transition-transform hover:scale-110"
        aria-label="Contactar por WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </a>
    </div>
  );
}

function ServiceCard({ icon, title, desc, to }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/10 bg-gray-800/40 p-6 hover:bg-gray-800/60 hover:shadow-xl hover:shadow-black/30 transition-all"
    >
      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-600/20 to-green-600/20 flex items-center justify-center border border-white/10">
        {icon}
      </div>
      <h4 className="mt-4 text-xl font-bold">{title}</h4>
      <p className="mt-2 text-gray-400">{desc}</p>
      <Link to={to} className="mt-4 inline-flex items-center gap-2 text-emerald-300 hover:text-green-300">
        Ver más
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h9.69L9.22 5.03a.75.75 0 011.06-1.06l5.5 5.5a.75.75 0 010 1.06l-5.5 5.5a.75.75 0 11-1.06-1.06l4.22-4.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
        </svg>
      </Link>
    </motion.article>
  );
}
