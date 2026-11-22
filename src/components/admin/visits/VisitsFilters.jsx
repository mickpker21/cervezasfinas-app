import React from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

const VisitsFilters = ({ filters, setFilters, routes }) => {
  const handleFilterChange = (key, value) => {
    const finalValue = ['all', '__all__'].includes(value) ? '' : value;
    setFilters(prev => ({ ...prev, [key]: finalValue }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white/5 p-4 rounded-lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            value={filters.searchTerm}
            onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
            className="w-full bg-gray-800 border-gray-700 text-white pl-10"
            placeholder="Buscar por cliente, usuario..."
          />
        </div>
        
        <Input
          type="date"
          value={filters.date}
          onChange={(e) => handleFilterChange('date', e.target.value)}
          className="w-full bg-gray-800 border-gray-700 text-white"
        />
        
        <Select value={filters.route || 'all'} onValueChange={(value) => handleFilterChange('route', value)}>
          <SelectTrigger className="w-full bg-gray-800 border-gray-700 text-white">
            <SelectValue placeholder="Filtrar por ruta (Sup.)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ruta Supervisor (Todas)</SelectItem>
            {routes.map(route => (
              <SelectItem key={route} value={route}>{`Ruta ${route}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </motion.div>
  );
};

export default VisitsFilters;
