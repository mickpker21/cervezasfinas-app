import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Trash2, Plus, Building } from 'lucide-react';
import { supabase } from '@/supabaseClient';

export default function BranchesSettingsDialog({ isOpen, onClose, onSaveSuccess }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [newBranch, setNewBranch] = useState('');

  const fetchData = async () => {
    const { data } = await supabase.from('branches').select('*').order('name');
    setBranches(data || []);
  };

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen]);

  const handleAdd = async () => {
    if (!newBranch.trim()) return;

    setLoading(true);
    const { error } = await supabase.from('branches').insert([{ name: newBranch.trim().toUpperCase() }]);
    
    if (error) {
      toast({ title: "Error", description: "Ya existe o hubo un error al crear la bodega.", variant: "destructive" });
    } else {
      toast({ title: "Agregada", description: "Bodega base creada con éxito." });
      setNewBranch('');
      fetchData();
      if (onSaveSuccess) onSaveSuccess();
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar esta bodega base? Esto puede afectar a los usuarios o vehículos asignados a ella.")) return;
    
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar la bodega.", variant: "destructive" });
    } else {
      fetchData();
      if (onSaveSuccess) onSaveSuccess();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Building className="text-orange-500" />
            Catálogo de Bodegas / Sucursales
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Agrega las bodegas base de tu empresa (ej. PALMARITO, IZÚCAR, CENTRAL). 
            Estas bodegas se usan para asignar a usuarios y flotillas.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <Label className="text-orange-400 font-bold flex items-center gap-2">
              <Building size={16} /> Agregar Nueva Bodega
          </Label>
          <div className="flex gap-2">
            <Input 
              value={newBranch} 
              onChange={e => setNewBranch(e.target.value)}
              placeholder="NOMBRE DE BODEGA..."
              className="bg-slate-900 border-slate-800 text-sm h-10"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={loading} size="sm" className="bg-orange-600 hover:bg-orange-500 h-10 px-4">
              <Plus size={18} />
            </Button>
          </div>

          <div className="bg-slate-900/50 rounded-xl border border-white/5 max-h-[300px] overflow-y-auto mt-4 custom-scrollbar">
            {branches.length === 0 && <div className="p-4 text-center text-slate-500 text-sm">No hay bodegas registradas.</div>}
            {branches.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 border-b border-white/5 hover:bg-white/5 transition-colors">
                <span className="text-sm font-medium text-slate-200">{b.name}</span>
                <button onClick={() => handleDelete(b.id)} className="text-slate-500 hover:text-red-400 p-2 rounded-md hover:bg-red-400/10 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
