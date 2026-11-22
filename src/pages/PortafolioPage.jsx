import React from 'react';
import { Link } from 'react-router-dom';

const PortafolioPage = () => {
  const imageFiles = [
    "102.png", "105.png", "144.png", "1591.png", "1596.png", "1645.png",
    "1657.png", "1681.png", "1682.png", "1697.png", "1749.png", "1780.png",
    "1793.png", "2073.png", "22.png", "2306.png", "2381.png", "2386.png",
    "24.png", "2586.png", "2625.png", "2634.png", "2713.png", "3006.PNG",
    "301.png", "306.png", "307.png", "309.png", "31.png", "3195.png",
    "3206.png", "3207.png", "3208.png", "3210.png", "3248.png", "3251.png",
    "3253.png", "3276.png", "33.png", "380.png", "4008.png", "4097.png",
    "4115.png", "4182.png", "4183.png", "4186.png", "4187.png", "4195.png",
    "4196.png", "4197.png", "4199.png", "4239.png", "424.png", "4240.png",
    "426.png", "43.png", "4440.png", "4485.png", "4486.png", "4508.png",
    "4536.png", "4694.png", "4770.png", "4773.png", "5035.png", "5172.png",
    "5175.png", "5177.png", "62.png", "66.png", "711.png", "726.png",
    "775.png", "782.png", "783.png", "83.png", "99.png"
  ];

  const images = imageFiles.map(file => `/portafolio/${file}`);

  return (
    <div className="bg-gray-800 text-white min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
            <h1 className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                Nuestro Portafolio
            </h1>
            <p className="text-lg text-gray-400 mt-3">Una selección de nuestros trabajos más recientes.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {images.map((image, index) => (
            <div key={index} className="bg-gray-700 rounded-lg overflow-hidden shadow-2xl transform hover:scale-105 transition-transform duration-300">
              <img src={image} alt={`Proyecto ${index + 1}`} className="w-full h-64 object-cover" />
            </div>
          ))}
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

export default PortafolioPage;
