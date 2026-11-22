import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { ChevronLeft, Target, Eye, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAboutUsContent } from '@/repositories/portfolioRepository';

export default function NosotrosPublicPage() {
  const navigate = useNavigate();
  const [content, setContent] = useState({
    mision: '',
    vision: '',
    historia: '',
    descripcion: '',
    main_image: '',
    secondary_image: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getAboutUsContent();
      setContent(data);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <>
      <Helmet>
        <title>Nosotros - Cervezas Finas</title>
      </Helmet>
      
      <div className="min-h-screen bg-[#050B14] text-white relative overflow-x-hidden selection:bg-[#00cc4a]/30">
        {/* Abstract Backgrounds */}
        <div className="fixed inset-0 pointer-events-none">
          {/* Main gradient mesh */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#003312] via-[#050B14] to-[#020408]"></div>
          
          {/* Glowing orbs */}
          <motion.div 
            animate={{ 
              x: [0, 50, 0], 
              y: [0, 30, 0],
              scale: [1, 1.1, 1]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute top-[10%] -right-[10%] w-[600px] h-[600px] bg-[#00cc4a]/10 rounded-full blur-[120px]"
          />
          <motion.div 
            animate={{ 
              x: [0, -30, 0], 
              y: [0, -50, 0],
              scale: [1, 1.2, 1]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-10%] -left-[10%] w-[500px] h-[500px] bg-[#009938]/10 rounded-full blur-[100px]"
          />
        </div>

        {/* Header */}
        <header className="relative z-50 pt-8 pb-4 px-6 max-w-7xl mx-auto flex items-center justify-between">
          <button 
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
          >
            <div className="bg-white/5 p-2 rounded-full group-hover:bg-white/10 transition-colors">
               <ChevronLeft className="w-5 h-5" />
            </div>
            <span className="font-bold uppercase tracking-widest text-xs hidden sm:block">Regresar</span>
          </button>
          
          <img src="/logo.png" alt="Logo" className="h-10 md:h-12 drop-shadow-[0_0_15px_rgba(0,204,74,0.4)]" />
          
          <div className="w-[88px] sm:w-[100px]"></div> {/* Spacer */}
        </header>

        {loading ? (
           <div className="flex justify-center items-center h-[60vh] relative z-10">
              <div className="animate-spin w-12 h-12 border-4 border-[#00cc4a] border-t-transparent rounded-full"></div>
           </div>
        ) : (
          <main className="relative z-10 pb-32">
            
            {/* Hero Section */}
            <section className="px-6 pt-16 pb-20 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <motion.div 
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="space-y-8"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Conócenos
                </div>
                
                <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-[0.9]">
                  Cervezas <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ff88] to-[#009938]">Finas</span>
                </h1>
                
                <p className="text-lg text-slate-300 leading-relaxed max-w-xl font-medium border-l-2 border-[#00cc4a]/30 pl-6">
                  {content.descripcion || "Somos la distribuidora autorizada de Heineken México, comprometidos con llevar la mejor calidad a cada rincón."}
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative"
              >
                {/* Decorative Frame */}
                <div className="absolute inset-0 border border-white/10 rounded-[2.5rem] translate-x-4 translate-y-4"></div>
                <div className="relative rounded-[2rem] overflow-hidden aspect-[4/3] bg-[#0a1120] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  {content.main_image ? (
                    <img src={content.main_image} alt="Cervezas Finas" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col justify-center items-center text-slate-600 bg-[#0a1120] p-10 text-center">
                       <img src="/marcas.png" alt="Marcas" className="w-full h-full object-contain opacity-40 mix-blend-screen" />
                    </div>
                  )}
                  {/* Overlay Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#003312]/80 to-transparent mix-blend-overlay"></div>
                </div>
              </motion.div>
            </section>

            {/* Mision / Vision Cards */}
            <section className="px-6 py-20 bg-gradient-to-b from-transparent to-[#02050A]">
              <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Mision */}
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="bg-white/[0.02] border border-white/[0.05] p-10 rounded-[2rem] hover:bg-white/[0.04] hover:border-emerald-500/30 transition-all duration-500 group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00cc4a] to-[#006625] flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform">
                    <Target className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-3xl font-black uppercase tracking-tight mb-6">Nuestra Misión</h3>
                  <p className="text-slate-400 leading-relaxed text-lg">
                    {content.mision || "Brindar el mejor servicio de distribución, asegurando que nuestras marcas premium lleguen a nuestros clientes con la más alta calidad."}
                  </p>
                </motion.div>

                {/* Vision */}
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  className="bg-white/[0.02] border border-white/[0.05] p-10 rounded-[2rem] hover:bg-white/[0.04] hover:border-emerald-500/30 transition-all duration-500 group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00cc4a] to-[#006625] flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform">
                    <Eye className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-3xl font-black uppercase tracking-tight mb-6">Nuestra Visión</h3>
                  <p className="text-slate-400 leading-relaxed text-lg">
                    {content.vision || "Ser la empresa líder en distribución de bebidas en la región, reconocida por nuestra excelencia operativa y compromiso con el cliente."}
                  </p>
                </motion.div>
              </div>
            </section>

            {/* Historia Section */}
            <section className="px-6 py-24 max-w-7xl mx-auto">
              <div className="bg-gradient-to-br from-[#0D1624] to-[#0A111A] rounded-[3rem] p-8 md:p-16 border border-white/5 relative overflow-hidden">
                {/* Decorative Graphic */}
                <div className="absolute top-0 right-0 w-1/2 h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none"></div>
                <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#00cc4a]/10 rounded-full blur-[80px] pointer-events-none"></div>
                
                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
                  <div className="lg:col-span-2">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-1 bg-[#00cc4a] rounded-full"></div>
                      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#00cc4a]">Nuestra Historia</h2>
                    </div>
                    <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tight leading-none mb-8">
                      Forjando un <br /> <span className="text-white/50">Legado</span>
                    </h3>
                    {content.secondary_image && (
                       <img src={content.secondary_image} alt="Historia" className="rounded-3xl shadow-2xl border border-white/10 mt-8 max-w-full h-auto" />
                    )}
                  </div>
                  
                  <div className="lg:col-span-3 prose prose-invert prose-emerald prose-lg max-w-none">
                    <div className="text-slate-300 leading-loose whitespace-pre-wrap font-medium">
                      {content.historia || "Cervezas Finas ha sido parte integral de la comunidad, creciendo año con año para convertirse en el distribuidor de confianza de Heineken México en la región."}
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </main>
        )}
      </div>
    </>
  );
}
