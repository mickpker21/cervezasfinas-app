import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Edit3, Trash2, Copy, CheckCircle2, Star, Eye, EyeOff, ChevronDown, ChevronRight, Save, Printer, AlertTriangle, ToggleLeft, ToggleRight, X, GripVertical } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { getAllTemplates, createTemplate, updateTemplate, activateTemplate, deleteTemplate, duplicateTemplate } from '@/repositories/ticketTemplatesRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

// ─── Vista previa del ticket ESC/POS ────────────────────────
function TicketPreview({ template }) {
  if (!template?.template_json) return null;
  const { sections = [], paperWidth = 58 } = template.template_json;
  const charWidth = paperWidth >= 80 ? 48 : 32;
  const sep = '─'.repeat(charWidth);

  return (
    <div className="font-mono text-[11px] bg-slate-950 border border-slate-700 rounded-xl p-4 overflow-auto max-h-[500px] whitespace-pre text-slate-300 leading-relaxed">
      {sections.filter(s => s.enabled).map(section => {
        if (section.type === 'header') {
          return (
            <div key={section.id}>
              {section.fields?.filter(f => f.enabled).map(f => {
                const val = f.value || '';
                const centered = val.padStart(Math.floor((charWidth + val.length) / 2)).padEnd(charWidth);
                if (f.type === 'bold_center_text') return <div key={f.id} className="text-white font-bold text-center">{val}</div>;
                if (f.type === 'image') return <div key={f.id} className="text-center text-slate-500">[LOGO]</div>;
                return <div key={f.id} className="text-center">{val}</div>;
              })}
              <div className="text-slate-600">{sep}</div>
            </div>
          );
        }
        if (section.type === 'order_info') {
          return (
            <div key={section.id}>
              {section.fields?.filter(f => f.enabled).map(f => (
                <div key={f.id}>{f.label ? `${f.label} ${f.value}` : f.value}</div>
              ))}
              <div className="text-slate-600">{sep}</div>
            </div>
          );
        }
        if (section.type === 'items_table') {
          const cols = section.columns || [];
          const header = cols.map(c => c.label.padEnd(c.width)).join('');
          return (
            <div key={section.id}>
              <div className="text-white font-bold">{header}</div>
              <div className="text-slate-600">{sep}</div>
              <div>{'2   '}{' Corona              '.substring(0, 19)}{'   $48.00'}</div>
              <div>{'3   '}{' Modelo Especial     '.substring(0, 19)}{'   $90.00'}</div>
              <div className="text-slate-600">{sep}</div>
            </div>
          );
        }
        if (section.type === 'totals') {
          return (
            <div key={section.id} className="text-right">
              {section.fields?.filter(f => f.enabled).map(f => {
                const line = f.type === 'total'
                  ? <div key={f.id} className="text-white font-bold">{f.label.padStart(20)}  $138.00</div>
                  : <div key={f.id}>{f.label.padStart(20)}  $138.00</div>;
                return line;
              })}
            </div>
          );
        }
        if (section.type === 'footer') {
          return (
            <div key={section.id}>
              <div className="text-slate-600">{sep}</div>
              {section.fields?.filter(f => f.enabled).map(f => {
                if (f.type === 'qr_code') return <div key={f.id} className="text-center text-slate-500">[QR CODE]</div>;
                if (f.type === 'verify_code') return <div key={f.id} className="text-center">{f.label}\nAB12-CD34</div>;
                if (f.type === 'bold_center_text') return <div key={f.id} className="text-white font-bold text-center">{f.value}</div>;
                return <div key={f.id} className="text-center">{f.value}</div>;
              })}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ─── Editor de una sección ────────────────────────────────────
function SectionEditor({ section, onChange }) {
  const [open, setOpen] = useState(true);

  const toggleField = (fieldId) => {
    const updated = {
      ...section,
      fields: section.fields?.map(f => f.id === fieldId ? { ...f, enabled: !f.enabled } : f),
    };
    onChange(updated);
  };

  const updateFieldValue = (fieldId, value) => {
    const updated = {
      ...section,
      fields: section.fields?.map(f => f.id === fieldId ? { ...f, value } : f),
    };
    onChange(updated);
  };

  const updateFieldLabel = (fieldId, label) => {
    const updated = {
      ...section,
      fields: section.fields?.map(f => f.id === fieldId ? { ...f, label } : f),
    };
    onChange(updated);
  };

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden mb-3">
      {/* Seccion header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onChange({ ...section, enabled: !section.enabled }); }}
            className={`w-8 h-4 rounded-full transition-colors relative ${section.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${section.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-sm font-semibold ${section.enabled ? 'text-white' : 'text-slate-500'}`}>
            {section.label || section.id}
          </span>
        </div>
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {/* Campos de la seccion */}
      {open && section.enabled && (
        <div className="p-4 bg-slate-900 space-y-2">
          {section.fields?.map(field => (
            <div key={field.id} className="flex items-start gap-3">
              {/* Toggle campo */}
              <button
                onClick={() => toggleField(field.id)}
                className={`mt-1 w-7 h-3.5 rounded-full transition-colors flex-shrink-0 relative ${field.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${field.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>

              {/* Contenido del campo */}
              <div className={`flex-1 min-w-0 ${!field.enabled ? 'opacity-40' : ''}`}>
                <div className="text-xs text-slate-500 mb-1 font-mono">{field.type} · {field.id}</div>
                {field.type === 'image' ? (
                  <div className="text-xs text-slate-400 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                    Logo: <span className="text-emerald-400 font-mono">{field.src}</span>
                  </div>
                ) : field.type === 'qr_code' || field.type === 'verify_code' ? (
                  <div className="text-xs text-slate-400 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                    {field.type === 'verify_code' ? (
                      <input
                        value={field.label || ''}
                        onChange={e => updateFieldLabel(field.id, e.target.value)}
                        className="bg-transparent text-white w-full focus:outline-none"
                        placeholder="Etiqueta..."
                      />
                    ) : (
                      <span className="text-slate-500">[{field.type.toUpperCase()}] Auto-generado</span>
                    )}
                  </div>
                ) : field.value !== undefined ? (
                  <div className="flex gap-2">
                    {field.label !== undefined && field.label !== '' && (
                      <input
                        value={field.label || ''}
                        onChange={e => updateFieldLabel(field.id, e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 w-28 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="Etiqueta"
                      />
                    )}
                    <input
                      value={field.value || ''}
                      onChange={e => updateFieldValue(field.id, e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white flex-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="Valor..."
                    />
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                    {field.label || field.id}
                    {field.conditional && <span className="ml-2 text-slate-600">(si {field.conditional})</span>}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Columnas de items */}
          {section.columns?.map(col => (
            <div key={col.id} className="flex items-center gap-3 text-xs text-slate-400 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
              <span className="font-mono w-12">{col.align}</span>
              <span className="text-slate-300">{col.label}</span>
              <span className="text-slate-500">ancho: {col.width}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal de edicion de plantilla ───────────────────────────
function TemplateEditorModal({ template, onSave, onClose }) {
  const [name, setName] = useState(template?.name || 'Nueva Plantilla');
  const [description, setDescription] = useState(template?.description || '');
  const [sections, setSections] = useState(
    template?.template_json?.sections || []
  );
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const updateSection = useCallback((idx, updated) => {
    setSections(prev => prev.map((s, i) => i === idx ? updated : s));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedTemplate = {
        ...template,
        name,
        description,
        template_json: { ...template.template_json, sections },
      };
      await onSave(updatedTemplate);
      onClose();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-auto">
      <div className="w-full max-w-5xl mt-4 mb-8">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header del modal */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
                <FileText size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Editor de Plantilla</h2>
                <p className="text-xs text-slate-400">{template?.is_default ? 'Plantilla predeterminada' : 'Personalizada'}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Panel izquierdo: editor */}
            <div className="p-6 overflow-auto max-h-[75vh] border-r border-slate-800">
              {/* Nombre y descripcion */}
              <div className="mb-5 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Nombre de la plantilla</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={template?.is_default}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Descripcion</label>
                  <input
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    placeholder="Descripcion opcional..."
                  />
                </div>
              </div>

              {/* Secciones */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Secciones del Ticket</h3>
                {sections.map((section, idx) => (
                  <SectionEditor
                    key={section.id}
                    section={section}
                    onChange={(updated) => updateSection(idx, updated)}
                  />
                ))}
              </div>
            </div>

            {/* Panel derecho: preview */}
            <div className="p-6 bg-slate-950">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Printer size={12} /> Vista Previa
              </h3>
              <TicketPreview
                template={{ ...template, template_json: { ...template?.template_json, sections } }}
              />
            </div>
          </div>

          {/* Footer con acciones */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
              Guardar Cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pagina principal ─────────────────────────────────────────
export default function TicketTemplatesPage() {
  const { toast } = useToast();
  const { user } = useSupabaseAuth();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [working, setWorking] = useState(false);

  const userRole = user?.user_metadata?.type || user?.user_metadata?.role || '';
  const canEdit = ['admin', 'administrador', 'sistemas', 'sistemas/ti', 'sistemas ti'].includes(userRole.toLowerCase());

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllTemplates();
      setTemplates(data);
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudieron cargar las plantillas.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleActivate = async (id) => {
    setWorking(true);
    try {
      await activateTemplate(id);
      await loadTemplates();
      toast({ title: 'Plantilla activada', description: 'Todos los usuarios usaran esta plantilla.', variant: 'default' });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleDuplicate = async (id) => {
    setWorking(true);
    try {
      await duplicateTemplate(id);
      await loadTemplates();
      toast({ title: 'Duplicada', description: 'Plantilla duplicada correctamente.', variant: 'default' });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta plantilla? Esta accion no se puede deshacer.')) return;
    setWorking(true);
    try {
      await deleteTemplate(id);
      await loadTemplates();
      toast({ title: 'Eliminada', description: 'Plantilla eliminada.', variant: 'default' });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleSaveTemplate = async (template) => {
    if (template.id && template.id !== 'new') {
      await updateTemplate(template.id, {
        name: template.name,
        description: template.description,
        template_json: template.template_json,
      });
    } else {
      await createTemplate(template);
    }
    await loadTemplates();
    toast({ title: 'Guardado', description: 'Plantilla guardada correctamente.' });
  };

  const handleNew = () => {
    const base = templates.find(t => t.is_default);
    setEditingTemplate({
      id: 'new',
      name: 'Nueva Plantilla',
      description: '',
      is_active: false,
      is_default: false,
      template_json: base?.template_json || { paperWidth: 58, charWidth: 32, sections: [] },
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 pb-24">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 mt-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <FileText size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Plantillas de Ticket</h1>
              <p className="text-sm text-slate-400">{templates.length} plantilla(s) · Solo admin y sistemas</p>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Plus size={16} /> Nueva Plantilla
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(tmpl => (
              <div
                key={tmpl.id}
                className={`bg-slate-900 rounded-2xl border transition-all ${
                  tmpl.is_active
                    ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header de la tarjeta */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-white">{tmpl.name}</h3>
                        {tmpl.is_default && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            <Star size={9} /> Predeterminada
                          </span>
                        )}
                        {tmpl.is_active && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <CheckCircle2 size={9} /> ACTIVA
                          </span>
                        )}
                      </div>
                      {tmpl.description && (
                        <p className="text-xs text-slate-400 truncate">{tmpl.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Preview mini */}
                  <div className="text-xs text-slate-500">
                    {tmpl.template_json?.sections?.filter(s => s.enabled).length || 0} secciones activas ·
                    Papel {tmpl.template_json?.paperWidth || 58}mm
                  </div>
                </div>

                {/* Acciones */}
                <div className="px-5 pb-5 flex items-center gap-2 flex-wrap">
                  {!tmpl.is_active && canEdit && (
                    <button
                      onClick={() => handleActivate(tmpl.id)}
                      disabled={working}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all disabled:opacity-50"
                    >
                      <CheckCircle2 size={12} /> Activar
                    </button>
                  )}
                  <button
                    onClick={() => setPreviewTemplate(tmpl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
                  >
                    <Eye size={12} /> Preview
                  </button>
                  {canEdit && (
                    <>
                      <button
                        onClick={() => setEditingTemplate(tmpl)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
                      >
                        <Edit3 size={12} /> Editar
                      </button>
                      <button
                        onClick={() => handleDuplicate(tmpl.id)}
                        disabled={working}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all disabled:opacity-50"
                      >
                        <Copy size={12} /> Duplicar
                      </button>
                      {!tmpl.is_default && (
                        <button
                          onClick={() => handleDelete(tmpl.id)}
                          disabled={working || tmpl.is_active}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all disabled:opacity-30"
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de edicion */}
      {editingTemplate && (
        <TemplateEditorModal
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      )}

      {/* Modal de preview */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="font-bold text-white">Preview: {previewTemplate.name}</h3>
              <button onClick={() => setPreviewTemplate(null)} className="text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <TicketPreview template={previewTemplate} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
