import React from 'react';
import { Link } from 'react-router-dom';

const NosotrosPage = () => {
  return (
    <div className="bg-gray-800 text-white min-h-screen p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">Sobre Nosotros</h1>
        <p className="text-lg text-gray-400 mb-8">
          Somos un equipo de desarrolladores, diseñadores y estrategas apasionados por la tecnología y la innovación. Nuestro objetivo es transformar tus ideas en soluciones digitales de alto impacto que impulsen el crecimiento de tu negocio.
        </p>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-purple-400 mb-2">Nuestra Misión</h2>
            <p className="text-gray-300">
              Crear experiencias digitales excepcionales que conecten con las personas, simplifiquen procesos y generen valor tangible para nuestros clientes. Nos comprometemos con la calidad, la creatividad y la excelencia en cada proyecto que emprendemos.
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-bold text-purple-400 mb-2">Nuestro Equipo</h2>
            <p className="text-gray-300">
              Contamos con un equipo multidisciplinario con una amplia experiencia en el desarrollo de software, diseño de interfaces, gestión de proyectos y estrategias de marketing digital. Nos mantenemos en constante aprendizaje para estar a la vanguardia de las últimas tendencias y tecnologías.
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-bold text-purple-400 mb-2">¿Por Qué Elegirnos?</h2>
            <p className="text-gray-300">
              Entendemos que cada proyecto es único. Por eso, trabajamos de cerca contigo para entender tus necesidades y ofrecerte soluciones a medida. Nuestra comunicación es transparente, nuestro proceso es ágil y nuestro compromiso es total.
            </p>
          </div>
        </div>
        <div className="text-center mt-20">
          <Link to="/" className="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver al Inicio
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NosotrosPage;
