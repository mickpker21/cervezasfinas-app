import React from 'react';
import InteractiveMap from '@/components/common/InteractiveMap';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';

const VisitsMap = ({ visits }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="heineken-card p-4 md:p-6 h-full flex flex-col"
    >
      <h2 className="text-xl font-bold text-white mb-4 flex items-center shrink-0">
        <MapPin className="w-6 h-6 mr-2 text-green-400" />
        Mapa de Visitas
      </h2>
      <div className="flex-grow min-h-[400px] lg:min-h-0">
        <InteractiveMap items={visits} />
      </div>
    </motion.div>
  );
};

export default VisitsMap;