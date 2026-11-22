import React, { useEffect, useState } from 'react';
import { getAboutUsContent, updateAboutUsContent } from '@/repositories/portfolioRepository';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Save, Image as ImageIcon } from 'lucide-react';

export default function AdminAboutUsPage() {
  const [content, setContent] = useState({
    mision: '',
    vision: '',
    historia: '',
    descripcion: '',
    main_image: '',
    secondary_image: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [files, setFiles] = useState({
    main_image: null,
    secondary_image: null
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getAboutUsContent();
    setContent(prev => ({ ...prev, ...data }));
    setLoading(false);
  };

  const handleTextChange = (field, value) => {
    setContent(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (field, e) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => ({ ...prev, [field]: e.target.files[0] }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData();
      
      // Append texts
      ['mision', 'vision', 'historia', 'descripcion'].forEach(field => {
        formData.append(field, content[field] || '');
      });

      // Append files
      if (files.main_image) formData.append('main_image', files.main_image);
      if (files.secondary_image) formData.append('secondary_image', files.secondary_image);

      await updateAboutUsContent(formData);
      
      toast({ title: "Guardado", description: "La información ha sido actualizada exitosamente." });
      // Clear file inputs so we don't resend
      setFiles({ main_image: null, secondary_image: null });
      document.getElementById('main_image_input').value = "";
      document.getElementById('secondary_image_input').value = "";
      
      loadData(); // reload to get new image URLs
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la información.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Nosotros (Información de la Empresa)</h1>
        <p className="text-muted-foreground">Administra los textos e imágenes de la sección pública "Nosotros".</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-card border rounded-xl p-6 md:p-8 shadow-sm">
        
        {/* Texts Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold border-b pb-2">Textos Principales</h2>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold">Descripción Corta (Hero Section)</label>
            <Textarea 
              value={content.descripcion} 
              onChange={(e) => handleTextChange('descripcion', e.target.value)} 
              placeholder="Descripción breve de la empresa..." 
              className="h-24 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Misión</label>
              <Textarea 
                value={content.mision} 
                onChange={(e) => handleTextChange('mision', e.target.value)} 
                className="h-32 resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Visión</label>
              <Textarea 
                value={content.vision} 
                onChange={(e) => handleTextChange('vision', e.target.value)} 
                className="h-32 resize-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Nuestra Historia (Texto Largo)</label>
            <Textarea 
              value={content.historia} 
              onChange={(e) => handleTextChange('historia', e.target.value)} 
              className="h-64 resize-y"
            />
          </div>
        </div>

        {/* Images Section */}
        <div className="space-y-6 pt-6">
          <h2 className="text-xl font-semibold border-b pb-2">Imágenes</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Main Image */}
            <div className="space-y-4 bg-muted/20 p-4 rounded-lg border">
              <div className="space-y-1">
                <label className="text-sm font-semibold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Imagen Principal (Hero)
                </label>
                <p className="text-xs text-muted-foreground">Formato apaisado recomendado.</p>
              </div>
              
              {content.main_image && (
                <div className="aspect-video rounded-md overflow-hidden bg-black/5 border relative group">
                  <img src={content.main_image} alt="Principal" className="w-full h-full object-cover" />
                </div>
              )}
              
              <Input 
                id="main_image_input"
                type="file" 
                accept="image/*" 
                onChange={(e) => handleFileChange('main_image', e)} 
                className="cursor-pointer bg-background"
              />
            </div>

            {/* Secondary Image */}
            <div className="space-y-4 bg-muted/20 p-4 rounded-lg border">
              <div className="space-y-1">
                <label className="text-sm font-semibold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Imagen Secundaria (Historia)
                </label>
                <p className="text-xs text-muted-foreground">Formato cuadrado o retrato recomendado.</p>
              </div>
              
              {content.secondary_image && (
                <div className="aspect-square w-1/2 mx-auto rounded-md overflow-hidden bg-black/5 border relative group">
                  <img src={content.secondary_image} alt="Secundaria" className="w-full h-full object-cover" />
                </div>
              )}
              
              <Input 
                id="secondary_image_input"
                type="file" 
                accept="image/*" 
                onChange={(e) => handleFileChange('secondary_image', e)} 
                className="cursor-pointer bg-background"
              />
            </div>

          </div>
        </div>

        <div className="pt-6 border-t flex justify-end">
          <Button type="submit" disabled={saving} size="lg" className="w-full sm:w-auto min-w-[200px]">
            {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
            {saving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
