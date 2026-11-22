import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { uploadPhoto } from '@/lib/uploadService';
import { Trash2, Upload, Megaphone, CalendarPlus, Image as ImageIcon } from 'lucide-react';

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  // Form State
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "No se pudieron cargar los anuncios", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      
      if (error) throw error;
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_active: !currentStatus } : a));
    } catch (err) {
      toast({ title: "Error", description: "No se pudo actualizar el estado", variant: "destructive" });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este anuncio?')) return;
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      toast({ title: "Eliminado", description: "El anuncio fue borrado" });
    } catch (err) {
      toast({ title: "Error", description: "No se pudo borrar", variant: "destructive" });
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!file || !startDate || !endDate) {
      toast({ title: "Faltan datos", description: "Sube una imagen y define las fechas", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // 1. Subir a hostinger
      const url = await uploadPhoto(file, 'anuncios');
      if (!url) throw new Error("Fallo la subida de imagen al servidor FTP/Hostinger");

      // 2. Guardar a supabase
      const { error } = await supabase.from('announcements').insert({
        title: title || 'Anuncio Corporativo',
        image_url: url,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        is_active: true
      });

      if (error) throw error;

      toast({ title: "Éxito", description: "Anuncio creado perfectamente" });
      
      // Limpiar Form
      setFile(null);
      setPreview(null);
      setTitle('');
      setStartDate('');
      setEndDate('');
      document.getElementById('file-upload').value = '';
      
      fetchAnnouncements();
    } catch (err) {
      console.error(err);
      toast({ title: "Error al crear", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="bg-emerald-500/20 p-3 rounded-full">
          <Megaphone className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Anuncios Corporativos</h1>
          <p className="text-slate-400">Gestiona los pop-ups informativos que aparecen al inicio de la app.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CREATE FORM */}
        <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-indigo-400"/>
            Nuevo Anuncio
          </h2>
          
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label className="text-slate-300">Imagen (Poster)</Label>
              <Input 
                id="file-upload"
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="bg-slate-800 border-slate-700 text-white file:text-emerald-400" 
              />
              {preview && (
                <div className="mt-2 rounded-xl overflow-hidden border border-slate-700">
                  <img src={preview} alt="Vista previa" className="w-full h-auto object-cover max-h-48" />
                </div>
              )}
            </div>

            <div>
              <Label className="text-slate-300">Título Interno</Label>
              <Input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="Ej. Feliz Navidad..."
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-300">Fecha de Inicio</Label>
              <Input 
                type="datetime-local" 
                required
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-300">Fecha de Fin (Vencimiento)</Label>
              <Input 
                type="datetime-local" 
                required
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <Button type="submit" disabled={uploading || !file} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-4">
              {uploading ? 'Subiendo...' : 'Publicar Anuncio'}
            </Button>
          </form>
        </div>

        {/* LIST */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Anuncios Historicos</h2>
          {loading ? (
            <div className="text-slate-400">Cargando...</div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-10 bg-slate-800/50 rounded-xl border border-dashed border-slate-600">
              <ImageIcon className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400">No hay anuncios configurados</p>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((a) => {
                const isExpired = new Date(a.end_date) < new Date();
                const statusColor = a.is_active && !isExpired ? 'bg-emerald-500/20 text-emerald-400' : 
                                  !a.is_active ? 'bg-slate-800 text-slate-400' : 'bg-amber-500/20 text-amber-400';
                return (
                  <div key={a.id} className="flex flex-col sm:flex-row gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <img src={a.image_url} alt={a.title} className="w-full sm:w-32 h-24 object-cover rounded-lg bg-slate-900 shrink-0" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-white font-medium truncate">{a.title}</h3>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor}`}>
                          {!a.is_active ? 'Apagado' : isExpired ? 'Vencido' : 'Activo'}
                        </span>
                      </div>
                      
                      <div className="text-sm text-slate-400 grid grid-cols-2 gap-2 mt-2">
                         <div><span className="text-slate-500">Inicia:</span><br/>{new Date(a.start_date).toLocaleString()}</div>
                         <div><span className="text-slate-500">Termina:</span><br/>{new Date(a.end_date).toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-slate-700 pt-4 sm:pt-0 sm:pl-4">
                       <div className="flex items-center gap-2 mb-0 sm:mb-4">
                         <Label className="text-xs text-slate-400">Activo</Label>
                         <Checkbox 
                            checked={a.is_active} 
                            onCheckedChange={() => handleToggleActive(a.id, a.is_active)} 
                         />
                       </div>
                       <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} className="text-red-400 hover:bg-red-500/10 hover:text-red-300">
                         <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                       </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
