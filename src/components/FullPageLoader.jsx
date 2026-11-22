import React from 'react';
import { motion } from 'framer-motion';

const FullPageLoader = () => {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white">
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5],
                }}
                transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="mb-4"
            >
                <img
                    src="/logo.png"
                    alt="Cervezas Finas"
                    className="w-24 h-24 object-contain opacity-80"
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
            </motion.div>

            <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-t-4 border-green-500"
                ></motion.div>
            </div>

            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-6 text-sm text-slate-400 font-medium tracking-wider"
            >
                CARGANDO SISTEMA...
            </motion.p>
        </div>
    );
};

export default FullPageLoader;
