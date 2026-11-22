import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Users, ScanFace, FolderOpen } from 'lucide-react';

export default function UsersTable({ users, onEdit, onDelete, onManageRoutes, onRegisterBiometrics, onViewDocs }) {
  const getUserRoleLabel = (role) => {
    return role ? role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A';
  }

  const getUserRoleColor = (role) => {
    const colors = {
      'admin': 'bg-red-600',
      'conquista': 'bg-blue-600',
      'asesor-dinamico': 'bg-purple-600',
      'asesor_dinamico': 'bg-purple-600',
      'televenta': 'bg-orange-600'
    };
    return colors[role] || 'bg-gray-600';
  }

  if (!users || users.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 heineken-card">
        <Users className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">No se encontraron usuarios</h3>
        <p className="text-green-200">Intenta con otros términos de búsqueda o agrega nuevos usuarios.</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="heineken-card overflow-hidden">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-4 text-white font-semibold">Nombre</th>
              <th className="text-left p-4 text-white font-semibold">Email</th>
              <th className="text-left p-4 text-white font-semibold">Ruta</th>
              <th className="text-left p-4 text-white font-semibold">Rol</th>
              <th className="text-left p-4 text-white font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <motion.tr key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 * index }} className="border-t border-white/10 hover:bg-white/5">
                <td className="p-4">
                  <div>
                    <p className="text-white">{user.name || '—'}</p>
                  </div>
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-white font-medium">{user.email}</p>
                  </div>
                </td>
                <td className="p-4"><span className="text-white font-mono">{user.route}</span></td>
                <td className="p-4"><span className={`px-2 py-1 rounded text-white text-xs font-bold ${getUserRoleColor(user.role)}`}>{getUserRoleLabel(user.role)}</span></td>
                <td className="p-4">
                  <div className="flex space-x-2">
                  <Button size="sm" variant="outline" onClick={() => onEdit(user)} className="bg-white/10 border-white/30 text-white hover:bg-white/20"><Edit className="w-4 h-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => onManageRoutes?.(user)} className="bg-blue-500/20 border-blue-500/30 text-blue-300 hover:bg-blue-500/30">Rutas</Button>
                    <Button size="sm" variant="outline" onClick={() => onRegisterBiometrics?.(user)} className="bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30" title="Registro Facial"><ScanFace className="w-4 h-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => onViewDocs?.(user)} className="bg-rose-500/20 border-rose-500/30 text-rose-300 hover:bg-rose-500/30" title="Ver Documentos"><FolderOpen className="w-4 h-4" /></Button>
                    {user.role !== 'admin' && (
                      <Button size="sm" variant="outline" onClick={() => onDelete(user.id)} className="bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30"><Trash2 className="w-4 h-4" /></Button>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4 p-4">
        {users.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
            className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white font-semibold text-lg">{user.name || '—'}</p>
                <p className="text-white/60 text-sm">{user.email}</p>
              </div>
              <span className={`px-2 py-1 rounded text-white text-xs font-bold ${getUserRoleColor(user.role)}`}>
                {getUserRoleLabel(user.role)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm text-white/70">
              <div className="bg-white/5 p-2 rounded">
                <span className="block text-xs uppercase text-white/40">Ruta</span>
                <span className="font-mono">{user.route || 'N/A'}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-white/10">
              <Button size="sm" variant="outline" onClick={() => onEdit(user)} className="flex-1 bg-white/10 border-white/30 text-white hover:bg-white/20">
                <Edit className="w-4 h-4 mr-2" /> Editar
              </Button>
              <Button size="sm" variant="outline" onClick={() => onManageRoutes?.(user)} className="flex-1 bg-blue-500/20 border-blue-500/30 text-blue-300 hover:bg-blue-500/30">
                Rutas
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRegisterBiometrics?.(user)} className="flex-0 bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30">
                <ScanFace className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => onViewDocs?.(user)} className="flex-0 bg-rose-500/20 border-rose-500/30 text-rose-300 hover:bg-rose-500/30" title="Documentos">
                <FolderOpen className="w-4 h-4" />
              </Button>
              {user.role !== 'admin' && (
                <Button size="sm" variant="outline" onClick={() => onDelete(user.id)} className="flex-0 bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}