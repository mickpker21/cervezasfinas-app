import React, { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, FolderOpen, AlertTriangle, MapPin } from 'lucide-react';
import UserDialog from '@/components/admin/users/UserDialog';
import UserTypesDialog from '@/components/admin/users/UserTypesDialog';
import UsersTable from '@/components/admin/users/UsersTable';
import SupervisorRoutesDialog from '@/components/admin/users/SupervisorRoutesDialog';
import UserStats from '@/components/admin/users/UserStats';
import HRSettingsDialog from '@/components/admin/users/HRSettingsDialog';
import ZonasRutasCatalogDialog from '@/components/admin/users/ZonasRutasCatalogDialog';
import { supabase } from '../supabaseClient';
import { deleteAdminUser } from '@/services/adminUsersApi';
import BiometricRegistration from '@/components/admin/users/BiometricRegistration';
import HRDocuments from '@/pages/hr/HRDocuments';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function AdminUsersPage() {
  const { user, roleType } = useSupabaseAuth();

  // 🛡️ SECURITY GUARD: Exclusivo para administradores y sistemas
  const rawRole = roleType || user?.profile?.role || user?.user_metadata?.type || user?.user_metadata?.role || '';
  const normalizedRole = rawRole.toString().trim().toLowerCase().replace(/[_-]/g, ' ');
  const isAdmin = normalizedRole === 'admin' || normalizedRole === 'administrador' || normalizedRole === 'sistemas';

  if (user && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [userTypes, setUserTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isTypesDialogOpen, setIsTypesDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [routesDialogOpen, setRoutesDialogOpen] = useState(false);
  const [routesUser, setRoutesUser] = useState(null);
  const [biometricUser, setBiometricUser] = useState(null);
  const [docsUser, setDocsUser] = useState(null);
  const [isHRSettingsOpen, setIsHRSettingsOpen] = useState(false);
  const [isZonasCatalogOpen, setIsZonasCatalogOpen] = useState(false);
  
  const fetchUsersAndTypes = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*');
      const { data: types } = await supabase.from('user_types').select('*');
      
      // Intentar cargar departamentos y puestos (fallo silencioso si no existen aún)
      const { data: depts } = await supabase.from('departments').select('*').order('name');
      const { data: jobs } = await supabase.from('job_titles').select('*').order('name');
      const { data: wh } = await supabase.from('warehouses').select('*').order('name');
      
      if (profilesError) {
        console.error('Error al obtener usuarios:', profilesError);
      }
      
      setUsers(profiles || []);
      setUserTypes(types || []);
      setDepartments(depts || []);
      setJobTitles(jobs || []);
      setWarehouses(wh || []);

    } catch (err) {
      console.error('Error inesperado en fetchUsersAndTypes:', err);
      setError(err.message || 'Error al cargar datos');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!AdminUsersPage._loggedMount) {
      console.log('Montando AdminUsersPage, ejecutando fetchUsersAndTypes');
      AdminUsersPage._loggedMount = true;
    }
    fetchUsersAndTypes();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = (searchTerm || '').toLowerCase();
    return users.filter(user =>
      String(user.email || '').toLowerCase().includes(q) ||
      String(user.name || '').toLowerCase().includes(q) ||
      String(user.role || '').toLowerCase().includes(q) ||
      String(user.route || '').toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  const handleEditUser = (user) => {
    setEditingUser(user);
    setIsUserDialogOpen(true);
  };

  const handleManageRoutes = (user) => {
    setRoutesUser(user);
    setRoutesDialogOpen(true);
  };

  const handleDeleteUser = async (userId) => {
    const userToDelete = users.find(u => u.id === userId);
    if (userToDelete?.role && userToDelete.role.toLowerCase() === 'admin') {
      toast({ title: "Error", description: "No se puede eliminar al administrador.", variant: "destructive" });
      return;
    }

    try {
      await deleteAdminUser(userId);
      toast({ title: "Usuario eliminado", description: "El usuario ha sido eliminado." });
      fetchUsersAndTypes();
    } catch (error) {
      toast({ title: "Error", description: error.message || "No se pudo eliminar el usuario.", variant: "destructive" });
    }
  };

  const handleUserDialogClose = () => {
    setEditingUser(null);
    setIsUserDialogOpen(false);
  };

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="p-4 rounded-full bg-red-50 dark:bg-red-950/30 mb-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Error al cargar datos</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-xs">{error}</p>
      <button onClick={() => { setError(null); fetchUsersAndTypes(); }} className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Reintentar</button>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Gestión de Usuarios - Admin</title>
        <meta name="description" content="Administración de usuarios del sistema." />
      </Helmet>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-white">Gestión de Usuarios</h1>
          <div className="flex space-x-3 w-full md:w-auto">
            <Button onClick={() => setIsZonasCatalogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white flex-1 md:flex-none">
              <MapPin className="w-4 h-4 mr-2" /> Catálogo Zonas
            </Button>
            <Button onClick={() => setIsTypesDialogOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white flex-1 md:flex-none">
              Tipos
            </Button>
            <Button onClick={() => setIsHRSettingsOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 md:flex-none">
              Estructura RH
            </Button>
            <Button onClick={() => { setEditingUser(null); setIsUserDialogOpen(true); }} className="heineken-button flex-1 md:flex-none">
              <Plus className="w-4 h-4 mr-2" /> Agregar Usuario
            </Button>
          </div>
        </motion.div>

        <UserStats users={users} userTypes={userTypes} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="heineken-card p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-green-400 w-4 h-4" />
            <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="heineken-input pl-10" placeholder="Buscar por nombre, ruta o tipo..." />
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-12 text-white">Cargando usuarios...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-white">No hay usuarios para mostrar.</div>
        ) : (
          <UsersTable
            users={filteredUsers}
            onEdit={handleEditUser}
            onDelete={handleDeleteUser}
            onManageRoutes={handleManageRoutes}
            onRegisterBiometrics={(user) => setBiometricUser(user)}
            onViewDocs={(user) => setDocsUser(user)}
          />
        )}

        <UserDialog
          isOpen={isUserDialogOpen}
          onClose={handleUserDialogClose}
          editingUser={editingUser}
          userTypes={userTypes}
          departments={departments}
          jobTitles={jobTitles}
          warehouses={warehouses}
          onSaveSuccess={fetchUsersAndTypes}
          allUsers={users}
        />
        <UserTypesDialog
          isOpen={isTypesDialogOpen}
          onClose={() => setIsTypesDialogOpen(false)}
          userTypes={userTypes}
          onSaveSuccess={fetchUsersAndTypes}
        />
        <HRSettingsDialog
          isOpen={isHRSettingsOpen}
          onClose={() => setIsHRSettingsOpen(false)}
          onSaveSuccess={fetchUsersAndTypes}
        />
        <ZonasRutasCatalogDialog
          isOpen={isZonasCatalogOpen}
          onClose={() => setIsZonasCatalogOpen(false)}
        />

        <SupervisorRoutesDialog
          isOpen={routesDialogOpen}
          onClose={() => { setRoutesDialogOpen(false); setRoutesUser(null); }}
          supervisor={routesUser}
        />

        <Dialog open={!!biometricUser} onOpenChange={(open) => !open && setBiometricUser(null)}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle>Registro Biométrico</DialogTitle>
              <DialogDescription className="text-slate-400">
                Capture y registre el rostro de {biometricUser?.name}
              </DialogDescription>
            </DialogHeader>
            {biometricUser && (
              <BiometricRegistration
                userId={biometricUser.id}
                onComplete={() => { setBiometricUser(null); fetchUsersAndTypes(); }}
                onCancel={() => setBiometricUser(null)}
              />
            )}
          </DialogContent>
        </Dialog>
        {/* Docs Modal */}
        <Dialog open={!!docsUser} onOpenChange={(open) => !open && setDocsUser(null)}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-rose-400" />
                Expediente — {docsUser?.name || docsUser?.email}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Documentos registrados para este empleado. Solo visibles por RRHH y Administración.
              </DialogDescription>
            </DialogHeader>
            {docsUser && (
              <HRDocuments
                employees={users}
                currentUser={null}
                preselectedUserId={docsUser.id}
              />
            )}
          </DialogContent>
        </Dialog>

      </div>
    </>
  );
}