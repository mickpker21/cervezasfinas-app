import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Trash2, Plus, Loader2, Briefcase, Building2 } from 'lucide-react';
import { supabase } from '../../../supabaseClient';

export default function HRSettingsDialog({ isOpen, onClose, onSaveSuccess }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [newItem, setNewItem] = useState({ dept: '', job: '' });

  const fetchData = async () => {
    const { data: depts } = await supabase.from('departments').select('*').order('name');
    const { data: jobs } = await supabase.from('job_titles').select('*').order('name');
    setDepartments(depts || []);
    setJobTitles(jobs || []);
  };

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen]);

  const handleAdd = async (type) => {
    const value = type === 'dept' ? newItem.dept : newItem.job;
    const table = type === 'dept' ? 'departments' : 'job_titles';
    
    if (!value.trim()) return;

    setLoading(true);
    const { error } = await supabase.from(table).insert([{ name: value.trim().toUpperCase() }]);
    
    if (error) {
      toast({ title: "Error", description: "Ya existe o hubo un error.", variant: "destructive" });
    } else {
      toast({ title: "Agregado", description: "Registro creado con éxito." });
      setNewItem({ ...newItem, [type]: '' });
      fetchData();
      onSaveSuccess();
    }
    setLoading(false);
  };

  const handleDelete = async (table, id) => {
    if (!confirm("¿Eliminar este registro oficial?")) return;
    
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" });
    } else {
      fetchData();
      onSaveSuccess();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Building2 className="text-emerald-400" />
            Configuración de Estructura RH
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Define los Departamentos y Puestos oficiales para evitar errores de captura.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
          
          {/* Departamentos */}
          <div className="space-y-4">
            <Label className="text-emerald-400 font-bold flex items-center gap-2">
                <Building2 size={16} /> Departamentos
            </Label>
            <div className="flex gap-2">
              <Input 
                value={newItem.dept} 
                onChange={e => setNewItem({...newItem, dept: e.target.value})}
                placeholder="NUEVO DEPTO..."
                className="bg-slate-900 border-slate-800 text-xs h-9"
              />
              <Button onClick={() => handleAdd('dept')} size="sm" className="bg-emerald-600 hover:bg-emerald-500 h-9">
                <Plus size={16} />
              </Button>
            </div>
            <div className="bg-slate-900/50 rounded-xl border border-white/5 max-h-[250px] overflow-y-auto custom-scrollbar">
              {departments.map(d => (
                <div key={d.id} className="flex items-center justify-between p-2 border-b border-white/5 hover:bg-white/5 transition-colors">
                  <span className="text-xs font-medium text-slate-300">{d.name}</span>
                  <button onClick={() => handleDelete('departments', d.id)} className="text-slate-600 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Puestos */}
          <div className="space-y-4">
            <Label className="text-cyan-400 font-bold flex items-center gap-2">
                <Briefcase size={16} /> Puestos
            </Label>
            <div className="flex gap-2">
              <Input 
                value={newItem.job} 
                onChange={e => setNewItem({...newItem, job: e.target.value})}
                placeholder="NUEVO PUESTO..."
                className="bg-slate-900 border-slate-800 text-xs h-9"
              />
              <Button onClick={() => handleAdd('job')} size="sm" className="bg-cyan-600 hover:bg-cyan-500 h-9">
                <Plus size={16} />
              </Button>
            </div>
            <div className="bg-slate-900/50 rounded-xl border border-white/5 max-h-[250px] overflow-y-auto custom-scrollbar">
              {jobTitles.map(j => (
                <div key={j.id} className="flex items-center justify-between p-2 border-b border-white/5 hover:bg-white/5 transition-colors">
                  <span className="text-xs font-medium text-slate-300">{j.name}</span>
                  <button onClick={() => handleDelete('job_titles', j.id)} className="text-slate-600 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
