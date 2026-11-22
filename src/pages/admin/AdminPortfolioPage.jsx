import React, { useEffect, useState } from 'react';
import { getPortfolioItems, createPortfolioItem, deletePortfolioItem } from '@/repositories/portfolioRepository';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, Trash2, Video, Image as ImageIcon } from 'lucide-react';

export default function AdminPortfolioPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [historyText, setHistoryText] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    const data = await getPortfolioItems();
    setItems(data);
    setLoading(false);
  };

  const handleVideoChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  const handleThumbnailChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setThumbnailFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !videoFile) {
      toast({
        title: "Campos requeridos",
        description: "El título y el video son obligatorios.",
        variant: "destructive"
      });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('history_text', historyText);
      formData.append('video', videoFile);
      if (thumbnailFile) {
        formData.append('thumbnail', thumbnailFile);
      }

      await createPortfolioItem(formData);
      
      toast({ title: "Éxito", description: "Elemento agregado al portafolio." });
      setTitle('');
      setHistoryText('');
      setVideoFile(null);
      setThumbnailFile(null);
      // Reset file inputs visually
      document.getElementById('video-upload').value = "";
      document.getElementById('thumbnail-upload').value = "";
      loadItems();
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "No se pudo subir el archivo. Revisa el tamaño del video (upload_max_filesize).",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este elemento del portafolio?")) return;
    
    try {
      await deletePortfolioItem(id);
      toast({ title: "Eliminado", description: "El elemento ha sido removido." });
      loadItems();
    } catch (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Portafolio (Videos 9:16)</h1>
        <p className="text-muted-foreground">Administra los videos verticales y sus historias.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Formulary to add new */}
        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col gap-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-500" />
            Nuevo Elemento
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Título (Nombre del Producto)</label>
              <Input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="Ej. Heineken Silver" 
                required 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Historia / Descripción</label>
              <Textarea 
                value={historyText} 
                onChange={(e) => setHistoryText(e.target.value)} 
                placeholder="Escribe la historia aquí..." 
                className="h-32 resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Video className="w-4 h-4" /> Video (Obligatorio, Formato 9:16)
              </label>
              <Input 
                id="video-upload"
                type="file" 
                accept="video/mp4,video/webm" 
                onChange={handleVideoChange} 
                required 
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Recomendado: Archivos menores a 20MB. Formato vertical.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Póster / Imagen Previa (Opcional)
              </label>
              <Input 
                id="thumbnail-upload"
                type="file" 
                accept="image/*" 
                onChange={handleThumbnailChange} 
                className="cursor-pointer"
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {submitting ? "Subiendo..." : "Guardar Elemento"}
            </Button>
          </form>
        </div>

        {/* List of current items */}
        <div className="lg:col-span-2 bg-card border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-6">Elementos Actuales</h2>
          
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
              No hay elementos en el portafolio.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map(item => (
                <div key={item.id} className="border rounded-lg overflow-hidden flex flex-col bg-background relative group">
                  <div className="aspect-[9/16] bg-black relative">
                    <video 
                      src={item.video_url} 
                      poster={item.thumbnail_url} 
                      className="w-full h-full object-cover" 
                      controls 
                      muted
                    />
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-bold text-lg">{item.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-3 mt-1 flex-1">
                      {item.history_text || "Sin descripción"}
                    </p>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="mt-4 w-full"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
