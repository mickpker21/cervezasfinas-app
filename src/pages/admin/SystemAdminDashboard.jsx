import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Users, Edit, Search, ShieldAlert, CheckCircle, Database, Building } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import BranchesSettingsDialog from '@/components/admin/users/BranchesSettingsDialog';

export default function SystemAdminDashboard() {
    const { toast } = useToast();
    const [profiles, setProfiles] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isBranchesModalOpen, setIsBranchesModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [editData, setEditData] = useState({
        role: '',
        ruta: '',
        branch_id: '',
        assigned_zones: '' // we'll edit as comma separated string
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch branches
            const { data: bData } = await supabase.from('branches').select('id, name');
            if (bData) setBranches(bData);

            // Fetch profiles
            // Assuming the RLS allows 'sistemas' to select all profiles
            const { data: pData, error } = await supabase
                .from('profiles')
                .select('id, email, name, role, ruta, branch_id, assigned_zones, created_at, phone')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            if (pData) setProfiles(pData);
        } catch (error) {
            console.error("Error fetching system data:", error);
            toast({ title: 'Error de Acceso', description: error.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const openEditModal = (userProfile) => {
        setSelectedUser(userProfile);
        setEditData({
            role: userProfile.role || '',
            ruta: userProfile.ruta || '',
            branch_id: userProfile.branch_id?.toString() || '',
            assigned_zones: userProfile.assigned_zones ? userProfile.assigned_zones.join(', ') : ''
        });
        setIsEditModalOpen(true);
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        try {
            // Convert comma separated string to array
            const zonesArray = editData.assigned_zones 
                ? editData.assigned_zones.split(',').map(z => z.trim()).filter(z => z.length > 0)
                : null;

            const updatePayload = {
                role: editData.role.toLowerCase(),
                ruta: editData.ruta.toUpperCase(),
                branch_id: editData.branch_id ? parseInt(editData.branch_id) : null,
                assigned_zones: zonesArray
            };

            const { error } = await supabase
                .from('profiles')
                .update(updatePayload)
                .eq('id', selectedUser.id);

            if (error) throw error;

            toast({ title: 'Usuario Actualizado', description: 'Los cambios se han guardado exitosamente en la base de datos.' });
            setIsEditModalOpen(false);
            fetchData();
        } catch (error) {
            console.error("Error updating profile:", error);
            toast({ title: 'Error al actualizar', description: error.message, variant: 'destructive' });
        }
    };

    const filteredProfiles = profiles.filter(p => 
        (p.email || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.role || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getBranchName = (id) => {
        const branch = branches.find(b => b.id === id);
        return branch ? branch.name : 'Sin Bodega';
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            <Helmet>
                <title>Gestor de Usuarios - Sistemas</title>
            </Helmet>

            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-orange-500 flex items-center gap-2">
                        <Database className="h-8 w-8 text-red-500" />
                        Control Maestro de Usuarios
                    </h1>
                    <p className="text-slate-400 mt-1">Configuración profunda de perfiles, roles y jerarquías del sistema.</p>
                </div>
                
                <div className="relative w-full md:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input 
                        placeholder="Buscar por ID, nombre, correo o rol..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-full md:w-80 bg-slate-900 border-slate-700"
                    />
                </div>
                
                <Button 
                    onClick={() => setIsBranchesModalOpen(true)} 
                    className="bg-orange-600 hover:bg-orange-700 text-white w-full md:w-auto"
                >
                    <Building className="mr-2 h-4 w-4" /> Catálogo de Bodegas
                </Button>
            </header>

            <Card className="bg-slate-900 border-slate-800 shadow-2xl">
                <CardHeader className="border-b border-slate-800">
                    <CardTitle className="text-white flex items-center gap-2">
                        <Users className="h-5 w-5 text-indigo-400" />
                        Directorio de Cuentas ({filteredProfiles.length})
                    </CardTitle>
                    <CardDescription className="text-slate-400">Las modificaciones aquí afectan de inmediato el acceso de los usuarios.</CardDescription>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-950/50">
                            <TableRow className="border-slate-800">
                                <TableHead className="text-slate-400">Usuario</TableHead>
                                <TableHead className="text-slate-400">Rol Sistema</TableHead>
                                <TableHead className="text-slate-400">Bodega Base</TableHead>
                                <TableHead className="text-slate-400">Ruta (Fuerza Ventas)</TableHead>
                                <TableHead className="text-center text-slate-400">Zonas (Supervisor)</TableHead>
                                <TableHead className="text-right text-slate-400">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-500">Cargando base de datos de usuarios...</TableCell></TableRow>
                            ) : filteredProfiles.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-500">No se encontraron usuarios.</TableCell></TableRow>
                            ) : (
                                filteredProfiles.map(p => (
                                    <TableRow key={p.id} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                                        <TableCell>
                                            <div className="font-bold text-white">{p.name || 'Sin Nombre'}</div>
                                            <div className="text-xs text-slate-400">{p.email || p.id}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-slate-950 border-indigo-500/30 text-indigo-400 uppercase tracking-wider text-[10px]">
                                                {p.role || 'GUEST'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-300">
                                            {getBranchName(p.branch_id)}
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono text-emerald-400 font-bold">{p.ruta || 'N/A'}</span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {p.assigned_zones && p.assigned_zones.length > 0 ? (
                                                <div className="flex gap-1 flex-wrap justify-center">
                                                    {p.assigned_zones.map(z => (
                                                        <Badge key={z} className="bg-slate-800 text-xs text-slate-300 border-slate-700">{z}</Badge>
                                                    ))}
                                                </div>
                                            ) : <span className="text-slate-600">-</span>}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                size="sm" 
                                                variant="secondary"
                                                onClick={() => openEditModal(p)}
                                                className="bg-slate-800 hover:bg-slate-700 text-white"
                                            >
                                                <Edit className="h-4 w-4 mr-2 text-indigo-400" /> Editar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit User Modal */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5 text-red-500" />
                            Editar Permisos: {selectedUser?.name || selectedUser?.email || 'Usuario'}
                        </DialogTitle>
                        <p className="text-xs text-slate-400 font-mono mt-1">ID: {selectedUser?.id}</p>
                    </DialogHeader>
                    
                    <form onSubmit={handleUpdateUser} className="space-y-6 mt-4">
                        
                        <div className="space-y-2">
                            <Label className="text-slate-300">Rol del Sistema</Label>
                            <select 
                                required 
                                value={editData.role} 
                                onChange={e => setEditData({...editData, role: e.target.value})} 
                                className="w-full bg-slate-950 border border-slate-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Selecciona un rol...</option>
                                <option value="admin">Administrador Total (Admin)</option>
                                <option value="sistemas">Sistemas (SysAdmin)</option>
                                <option value="sistemashop">Sistema Shop (Control 100% Tienda)</option>
                                <option value="gerente">Gerente General</option>
                                <option value="operaciones">Jefe de Operaciones</option>
                                <option value="supervisor">Supervisor de Zona</option>
                                <option value="autoventa">Vendedor (Autoventa)</option>
                                <option value="preventa">Vendedor (Preventa)</option>
                                <option value="chofer">Chofer de Reparto</option>
                                <option value="almacenista">Almacenista</option>
                                <option value="kiosko">Kiosco RRHH</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Bodega / Sucursal Base</Label>
                                <select 
                                    value={editData.branch_id} 
                                    onChange={e => setEditData({...editData, branch_id: e.target.value})} 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">(Global / Sin Bodega)</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Ruta Asignada</Label>
                                <Input 
                                    value={editData.ruta} 
                                    onChange={e => setEditData({...editData, ruta: e.target.value})} 
                                    placeholder="Ej. RUTA 1" 
                                    className="bg-slate-950 border-slate-700 font-mono text-emerald-400"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-300">Zonas Asignadas (Para Supervisores)</Label>
                            <Input 
                                value={editData.assigned_zones} 
                                onChange={e => setEditData({...editData, assigned_zones: e.target.value})} 
                                placeholder="Ej. ZONA SUR, ZONA NORTE, RUTA 1" 
                                className="bg-slate-950 border-slate-700 font-mono"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">Separar múltiples rutas o zonas con comas.</p>
                        </div>

                        <DialogFooter className="mt-8 border-t border-slate-800 pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)} className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800">
                                Cancelar
                            </Button>
                            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" /> Aplicar Cambios
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <BranchesSettingsDialog 
                isOpen={isBranchesModalOpen} 
                onClose={() => setIsBranchesModalOpen(false)} 
                onSaveSuccess={fetchData} 
            />

        </div>
    );
}
