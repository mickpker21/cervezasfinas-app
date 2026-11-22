import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Trash2, Save, GripVertical, Settings2, FileText, ArrowLeft, Loader2, ClipboardList
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { fetchCustomSurveyTemplates, saveCustomSurveyTemplate } from '@/lib/mysqlCustomSurveys';

const FIELD_TYPES = [
  { id: 'text', label: 'Texto Libre' },
  { id: 'boolean', label: 'Sí / No' },
  { id: 'select', label: 'Opción Múltiple' },
  { id: 'photo', label: 'Fotografía Requerida' }
];

export default function SurveyBuilder() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'editor'
  const [saving, setSaving] = useState(false);

  // Role check
  const userType = (user?.user_metadata?.type || '').toLowerCase().trim();
  const isAdmin = userType === 'admin' || userType === 'administrador' || userType === 'sistemas';

  // Editor State
  const [currentTemplate, setCurrentTemplate] = useState({
    id: null,
    title: '',
    description: '',
    is_active: 1,
    schema_json: []
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const data = await fetchCustomSurveyTemplates(true); // get all, including inactive
      setTemplates(data || []);
    } catch (e) {
      toast({ title: "Error", description: "No se pudieron cargar las encuestas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="text-center p-8 bg-slate-900 border border-red-500/30 rounded-2xl max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Acceso Denegado</h2>
          <p className="text-slate-400">Solo los administradores y el personal de sistemas tienen permiso para construir encuestas.</p>
        </div>
      </div>
    );
  }

  const handleCreateNew = () => {
    setCurrentTemplate({
      id: crypto.randomUUID(),
      title: 'Nueva Encuesta',
      description: '',
      is_active: 1,
      schema_json: [
        {
          title: 'Sección 1',
          fields: []
        }
      ]
    });
    setView('editor');
  };

  const handleEdit = (t) => {
    setCurrentTemplate(t);
    setView('editor');
  };

  const handleSave = async () => {
    if (!currentTemplate.title.trim()) {
      toast({ title: "Atención", description: "El título no puede estar vacío", variant: "warning" });
      return;
    }
    setSaving(true);
    try {
      await saveCustomSurveyTemplate({
        ...currentTemplate,
        created_by: user?.email || user?.id
      });
      toast({ title: "Guardado", description: "Encuesta guardada exitosamente" });
      setView('list');
      loadTemplates();
    } catch (e) {
      toast({ title: "Error", description: "No se pudo guardar la encuesta", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (t) => {
    try {
      await saveCustomSurveyTemplate({
        ...t,
        is_active: t.is_active ? 0 : 1
      });
      loadTemplates();
    } catch (e) {
      toast({ title: "Error", description: "No se pudo cambiar el estado", variant: "destructive" });
    }
  };

  // Editor Helpers
  const addSection = () => {
    setCurrentTemplate(prev => ({
      ...prev,
      schema_json: [...prev.schema_json, { title: 'Nueva Sección', fields: [] }]
    }));
  };

  const removeSection = (sIdx) => {
    setCurrentTemplate(prev => ({
      ...prev,
      schema_json: prev.schema_json.filter((_, i) => i !== sIdx)
    }));
  };

  const addField = (sIdx) => {
    setCurrentTemplate(prev => {
      const newSchema = [...prev.schema_json];
      newSchema[sIdx].fields.push({
        id: crypto.randomUUID().split('-')[0],
        type: 'text',
        label: 'Nueva Pregunta',
        required: false,
        options: []
      });
      return { ...prev, schema_json: newSchema };
    });
  };

  const updateField = (sIdx, fIdx, changes) => {
    setCurrentTemplate(prev => {
      const newSchema = [...prev.schema_json];
      newSchema[sIdx].fields[fIdx] = { ...newSchema[sIdx].fields[fIdx], ...changes };
      return { ...prev, schema_json: newSchema };
    });
  };

  const removeField = (sIdx, fIdx) => {
    setCurrentTemplate(prev => {
      const newSchema = [...prev.schema_json];
      newSchema[sIdx].fields = newSchema[sIdx].fields.filter((_, i) => i !== fIdx);
      return { ...prev, schema_json: newSchema };
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-24">
      <Helmet><title>Constructor de Encuestas | Cervezas Finas</title></Helmet>

      {view === 'list' ? (
        <div className="px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-cyan-500/20 rounded-2xl">
                <ClipboardList className="w-8 h-8 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Constructor de Encuestas</h1>
                <p className="text-slate-400 text-sm">Crea encuestas dinámicas para Supervisores</p>
              </div>
            </div>
            <Button onClick={handleCreateNew} className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl">
              <Plus className="w-5 h-5 mr-2" /> Nueva Encuesta
            </Button>
          </div>

          <div className="grid gap-4">
            {templates.map(t => (
              <Card key={t.id} className={`bg-slate-900/60 border-slate-800/60 transition-colors ${!t.is_active ? 'opacity-50' : ''}`}>
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        {t.title}
                        {!t.is_active && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Inactiva</span>}
                      </h3>
                      <p className="text-sm text-slate-400">{t.description || 'Sin descripción'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-slate-400 text-xs">Activa</Label>
                      <Switch checked={t.is_active === 1} onCheckedChange={() => handleToggleActive(t)} />
                    </div>
                    <Button variant="outline" className="border-slate-700 bg-slate-800/50 text-slate-300" onClick={() => handleEdit(t)}>
                      Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {templates.length === 0 && (
              <div className="text-center py-12 text-slate-500">No hay encuestas creadas aún.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4">
          <div className="flex items-center justify-between mb-6 sticky top-0 bg-slate-950/80 backdrop-blur-md py-4 z-10 border-b border-slate-800">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setView('list')} className="text-slate-400">
                <ArrowLeft className="w-6 h-6" />
              </Button>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {currentTemplate.id ? 'Editar Encuesta' : 'Nueva Encuesta'}
              </h1>
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl">
              {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
              Guardar Encuesta
            </Button>
          </div>

          <div className="space-y-6">
            <Card className="bg-slate-900/60 border-slate-800/60">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300 text-base">Título de la Encuesta</Label>
                  <Input 
                    value={currentTemplate.title} 
                    onChange={e => setCurrentTemplate({...currentTemplate, title: e.target.value})}
                    className="bg-slate-800/50 border-slate-700 text-white text-lg h-12"
                    placeholder="Ej. Censo de Enfriadores V2"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Descripción / Objetivo</Label>
                  <Textarea 
                    value={currentTemplate.description} 
                    onChange={e => setCurrentTemplate({...currentTemplate, description: e.target.value})}
                    className="bg-slate-800/50 border-slate-700 text-white"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {(currentTemplate.schema_json || []).map((section, sIdx) => (
                <Card key={sIdx} className="bg-slate-900/40 border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <Input 
                      value={section.title}
                      onChange={e => {
                        const newSchema = [...currentTemplate.schema_json];
                        newSchema[sIdx].title = e.target.value;
                        setCurrentTemplate({...currentTemplate, schema_json: newSchema});
                      }}
                      className="bg-transparent border-none text-xl font-bold text-cyan-400 px-0 focus-visible:ring-0"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeSection(sIdx)} className="text-red-400 hover:bg-red-500/20">
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <AnimatePresence>
                      {section.fields.map((field, fIdx) => (
                        <motion.div 
                          key={field.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex gap-4 items-start relative group"
                        >
                          <GripVertical className="w-5 h-5 text-slate-600 mt-2 cursor-move" />
                          <div className="flex-1 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs text-slate-400">Pregunta</Label>
                                <Input 
                                  value={field.label}
                                  onChange={e => updateField(sIdx, fIdx, { label: e.target.value })}
                                  className="bg-slate-900/50 border-slate-700 text-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-slate-400">Tipo de Respuesta</Label>
                                <Select value={field.type} onValueChange={v => updateField(sIdx, fIdx, { type: v })}>
                                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FIELD_TYPES.map(ft => (
                                      <SelectItem key={ft.id} value={ft.id}>{ft.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            
                            {field.type === 'select' && (
                              <div className="space-y-1 pl-2 border-l-2 border-cyan-500/30">
                                <Label className="text-xs text-slate-400">Opciones (separadas por coma)</Label>
                                <Input 
                                  value={(field.options || []).join(', ')}
                                  onChange={e => updateField(sIdx, fIdx, { options: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })}
                                  placeholder="Ej. Opción 1, Opción 2"
                                  className="bg-slate-900/50 border-slate-700 text-white"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={field.required} 
                                onCheckedChange={v => updateField(sIdx, fIdx, { required: v })}
                                id={`req-${field.id}`}
                              />
                              <Label htmlFor={`req-${field.id}`} className="text-sm text-slate-400">Campo Obligatorio</Label>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeField(sIdx, fIdx)} className="text-slate-500 hover:text-red-400 absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <Button variant="outline" onClick={() => addField(sIdx)} className="w-full border-dashed border-slate-700 text-slate-400 hover:text-white">
                      <Plus className="w-4 h-4 mr-2" /> Agregar Pregunta
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button variant="ghost" onClick={addSection} className="w-full h-14 border-2 border-dashed border-slate-700 text-slate-400 hover:bg-slate-800/50">
              <Plus className="w-5 h-5 mr-2" /> Agregar Nueva Sección
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
