import React from 'react';
import { motion } from 'framer-motion';
import { Users, UserCheck, Shield } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, color, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="heineken-card p-6"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-green-200 text-sm font-medium">{title}</p>
        <p className="text-3xl font-bold text-white">{value}</p>
      </div>
      <Icon className={`w-8 h-8 ${color}`} />
    </div>
  </motion.div>
);

export default function UserStats({ users, userTypes }) {
  const stats = {
    total: users.length,
    admins: users.filter(u => u.type === 'admin').length,
    active: users.filter(u => u.type !== 'admin').length,
    types: userTypes.length,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard title="Total Usuarios" value={stats.total} icon={Users} color="text-green-400" delay={0.1} />
      <StatCard title="Admins" value={stats.admins} icon={Shield} color="text-red-400" delay={0.2} />
      <StatCard title="Usuarios Activos" value={stats.active} icon={UserCheck} color="text-blue-400" delay={0.3} />
      <StatCard title="Tipos de Usuario" value={stats.types} icon={Users} color="text-purple-400" delay={0.4} />
    </div>
  );
}