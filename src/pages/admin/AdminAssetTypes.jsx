import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PlusCircle, Trash2, Loader2, AlertCircle } from 'lucide-react';

const AdminAssetTypes = () => {
  const [assetTypes, setAssetTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAssetTypes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('asset_types')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching asset types:', error);
      setError('No se pudieron cargar los tipos de activo.');
    } else {
      setAssetTypes(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAssetTypes();
  }, [fetchAssetTypes]);

  const handleAddAssetType = async () => {
    if (!newTypeName.trim()) {
      alert('El nombre del tipo de activo no puede estar vacío.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from('asset_types')
      .insert([{ name: newTypeName.trim(), description: newTypeDescription.trim() }]);

    if (error) {
      console.error('Error adding asset type:', error);
      alert('Error al añadir el tipo de activo: ' + error.message);
    } else {
      setIsAddModalOpen(false);
      setNewTypeName('');
      setNewTypeDescription('');
      await fetchAssetTypes();
    }
    setSubmitting(false);
  };

  const handleDeleteAssetType = async (typeId) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este tipo de activo? Esta acción no se puede deshacer.')) {
      return;
    }

    const { error } = await supabase.from('asset_types').delete().eq('id', typeId);

    if (error) {
      console.error('Error deleting asset type:', error);
      alert('Error al eliminar el tipo de activo. Es posible que esté siendo utilizado por algún activo existente.');
    } else {
      await fetchAssetTypes();
    }
  };

  if (loading) return <div className="p-4 text-center">Cargando...</div>;
  if (error) return <div className="p-4 text-red-500 text-center">{error}</div>;

  return (
    <>
      <div className="p-6 bg-gray-900 text-white min-h-screen">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Gestionar Tipos de Activo</h1>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Tipo de Activo
          </Button>
        </div>

        <div className="bg-gray-800 rounded-lg shadow overflow-hidden">
          <ul className="divide-y divide-gray-700">
            {assetTypes.map((type) => (
              <li key={type.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-lg">{type.name}</p>
                  <p className="text-sm text-gray-400">{type.description || 'Sin descripción'}</p>
                </div>
                <Button variant="destructive" size="icon" onClick={() => handleDeleteAssetType(type.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
           {assetTypes.length === 0 && (
             <div className="text-center py-12">
               <AlertCircle className="mx-auto h-12 w-12 text-gray-500" />
               <h3 className="mt-2 text-lg">No hay tipos de activo</h3>
               <p className="mt-1 text-sm text-gray-400">
                 Usa el botón para añadir el primer tipo de activo.
               </p>
             </div>
           )}
        </div>
      </div>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Añadir Nuevo Tipo de Activo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nombre
              </Label>
              <Input
                id="name"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                className="col-span-3 bg-gray-700 border-gray-600"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Descripción
              </Label>
              <Input
                id="description"
                value={newTypeDescription}
                onChange={(e) => setNewTypeDescription(e.target.value)}
                className="col-span-3 bg-gray-700 border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddAssetType} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminAssetTypes;
