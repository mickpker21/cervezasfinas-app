import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../../supabaseClient';

export default function UserTypesDialog({ isOpen, onClose, userTypes, onSaveSuccess }) {
  const { toast } = useToast();
  const [newUserTypeName, setNewUserTypeName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddUserType = async () => {
    if (!newUserTypeName.trim()) {
      toast({ title: "Error", description: "El nombre no puede estar vacío.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const typeKey = newUserTypeName.trim();
    
    const { error } = await supabase.from('user_types').insert([{ type_name: typeKey, permissions: {} }]);

    if (error) {
      toast({ title: "Error", description: "Este tipo de usuario ya existe.", variant: "destructive" });
    } else {
      toast({ title: "¡Tipo agregado!", description: `${newUserTypeName} ha sido agregado.` });
      setNewUserTypeName('');
      onSaveSuccess();
    }
    setLoading(false);
  };

  const handleDeleteUserType = async (typeIdToDelete) => {
    setLoading(true);
    const typeToDelete = userTypes.find(t => t.id === typeIdToDelete);

  const protectedTypes = ['admin', 'conquista', 'asesor_dinamico', 'televenta'];
    if (protectedTypes.includes(typeToDelete?.type_name)) {
        toast({ title: "Error", description: "No se puede eliminar un tipo de usuario protegido.", variant: "destructive" });
        setLoading(false);
        return;
    }

    const { data: usersWithThisType, error: usersError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', typeToDelete.type_name)
      .limit(1);

    if (usersError || usersWithThisType.length > 0) {
      toast({ title: "Error", description: "No se puede eliminar. Asegúrate que no haya usuarios con este tipo.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error: deleteError } = await supabase.from('user_types').delete().eq('id', typeIdToDelete);
    
    if (deleteError) {
      toast({ title: "Error", description: "No se pudo eliminar el tipo de usuario.", variant: "destructive" });
    } else {
      toast({ title: "Tipo eliminado", description: "El tipo de usuario ha sido eliminado." });
      onSaveSuccess();
    }
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-green-900 border-green-700" aria-describedby="dialog-desc-user-types">
        <div id="dialog-desc-user-types" className="sr-only">Formulario de tipos de usuario</div>
        <DialogHeader>
          <DialogTitle className="text-white">Gestionar Tipos de Usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex space-x-2">
            <Input value={newUserTypeName} onChange={(e) => setNewUserTypeName(e.target.value)} className="heineken-input flex-1" placeholder="Nuevo tipo de usuario" />
            <Button onClick={handleAddUserType} className="heineken-button" disabled={loading}>{loading ? 'Agregando...' : 'Agregar'}</Button>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Tipos existentes:</Label>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {userTypes.map((type) => (
                <div key={type.id} className="flex items-center justify-between bg-white/5 p-2 rounded">
                  <span className="text-white">{type.type_name}</span>
                  <Button size="sm" variant="outline" onClick={() => handleDeleteUserType(type.id)} className="bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30" disabled={loading}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}