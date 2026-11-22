import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/supabaseClient';
import { getEmployeeDocs, uploadEmployeeDoc, deleteEmployeeDoc, getSignedUrl, getAllEmployeeDocsWithExpiry } from '@/repositories/employeeDocsRepository';
import { useToast } from '@/components/ui/use-toast';
import { Upload, FileText, Trash2, Eye, AlertTriangle, CheckCircle, Clock, X, Download, FolderOpen } from 'lucide-react';

const CATEGORIES = [
  { id: 'identidad', label: '🪪 Identidad', color: 'blue' },
  { id: 'contrato', label: '📋 Contrato', color: 'emerald' },
  { id: 'fiscal', label: '💼 Fiscal', color: 'amber' },
  { id: 'medico', label: '🏥 Médico', color: 'rose' },
  { id: 'licencia', label: '🚗 Licencia', color: 'violet' },
  { id: 'titulo', label: '🎓 Título', color: 'cyan' },
  { id: 'otro', label: '📄 Otros', color: 'slate' },
];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / 86400000);
}

function ExpiryBadge({ expiresAt }) {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  if (days < 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">Vencido</span>;
  if (days <= 30) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Vence en {days}d</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Vigente</span>;
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ employeeId, uploadedBy, onClose, onSuccess }) {
  const { toast } = useToast();
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ name: '', category: 'identidad', expires_at: '' });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!meta.name) setMeta(m => ({ ...m, name: f.name.replace(/\.[^.]+$/, '') }));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); if (!meta.name) setMeta(m => ({ ...m, name: f.name.replace(/\.[^.]+$/, '') })); }
  };

  const handleSubmit = async () => {
    if (!file || !meta.name || !meta.category) {
      toast({ title: 'Campos requeridos', description: 'Selecciona archivo, nombre y categoría.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    // Simulate progress
    const timer = setInterval(() => setProgress(p => Math.min(p + 15, 85)), 200);
    try {
      await uploadEmployeeDoc(employeeId, file, meta, uploadedBy);
      clearInterval(timer); setProgress(100);
      toast({ title: 'Documento subido', description: `"${meta.name}" guardado correctamente.` });
      setTimeout(() => { onSuccess(); onClose(); }, 600);
    } catch (e) {
      clearInterval(timer); setProgress(0);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center p-5 border-b border-slate-700">
          <h3 className="text-white font-semibold text-lg">Subir Documento</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Drop Zone */}
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-xl p-6 text-center cursor-pointer transition-colors"
          >
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp" onChange={handleFile} />
            {file ? (
              <div className="text-emerald-400 text-sm font-medium">{file.name} <span className="text-slate-400">({formatSize(file.size)})</span></div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Arrastra o haz clic para seleccionar</p>
                <p className="text-slate-600 text-xs mt-1">PDF, PNG, JPG, DOC — máx 10MB</p>
              </>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Nombre del documento</label>
            <input value={meta.name} onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              placeholder="Ej: INE Frente, Contrato 2025..." />
          </div>

          {/* Categoría */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Categoría</label>
            <select value={meta.category} onChange={e => setMeta(m => ({ ...m, category: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          {/* Vencimiento */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Fecha de vencimiento <span className="text-slate-600">(opcional)</span></label>
            <input type="date" value={meta.expires_at} onChange={e => setMeta(m => ({ ...m, expires_at: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          {/* Progress */}
          {uploading && (
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <div className="p-5 border-t border-slate-700 flex gap-3 justify-end">
          <button onClick={onClose} disabled={uploading} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
          <button onClick={handleSubmit} disabled={uploading || !file}
            className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
            <Upload className="h-4 w-4" /> {uploading ? 'Subiendo...' : 'Subir Documento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
function PreviewModal({ doc, onClose }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSignedUrl(doc.file_path).then(u => { setUrl(u); setLoading(false); });
  }, [doc.file_path]);

  const isImage = doc.file_type?.startsWith('image/');
  const isPdf = doc.file_type === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-slate-700 shrink-0">
          <div>
            <h3 className="text-white font-semibold">{doc.name}</h3>
            <p className="text-slate-400 text-xs">{doc.file_name} · {formatSize(doc.file_size)}</p>
          </div>
          <div className="flex gap-2">
            {url && <a href={url} download={doc.file_name} target="_blank" rel="noreferrer"
              className="p-2 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-400 hover:text-white transition-colors"><Download className="h-4 w-4" /></a>}
            <button onClick={onClose} className="p-2 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white transition-colors"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px]">
          {loading ? (
            <div className="text-slate-400 text-sm animate-pulse">Cargando previsualización...</div>
          ) : !url ? (
            <div className="text-red-400 text-sm">No se pudo generar la URL de previsualización.</div>
          ) : isImage ? (
            <img src={url} alt={doc.name} className="max-w-full max-h-[60vh] rounded-lg object-contain" />
          ) : isPdf ? (
            <iframe src={url} title={doc.name} className="w-full h-[60vh] rounded-lg border border-slate-700" />
          ) : (
            <div className="text-center">
              <FileText className="h-16 w-16 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400 text-sm mb-4">Previsualización no disponible para este tipo de archivo.</p>
              <a href={url} download={doc.file_name} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors">
                Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────
function ExpiryAlertsPanel({ employees }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllEmployeeDocsWithExpiry().then(docs => {
      const enriched = docs.map(d => {
        const emp = employees.find(e => e.id === d.hr_employee_id);
        const nameFallback = d.hr_employees ? `${d.hr_employees.first_name} ${d.hr_employees.last_name}` : 'Empleado';
        return { ...d, employeeName: emp ? `${emp.first_name} ${emp.last_name}` : nameFallback, days: daysUntil(d.expires_at) };
      }).filter(d => d.days !== null && d.days <= 60).sort((a, b) => a.days - b.days);
      setAlerts(enriched);
      setLoading(false);
    });
  }, [employees]);

  if (loading) return null;
  if (alerts.length === 0) return (
    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4">
      <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
      <span className="text-emerald-400 text-sm">Todos los documentos están vigentes.</span>
    </div>
  );

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span className="text-amber-400 font-semibold text-sm">{alerts.length} documento(s) próximos a vencer o vencidos</span>
      </div>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {alerts.map(a => (
          <div key={a.id} className="flex items-center justify-between text-xs bg-slate-900/60 rounded-lg px-3 py-2">
            <div>
              <span className="text-white font-medium">{a.employeeName}</span>
              <span className="text-slate-400 ml-2">— {a.name}</span>
            </div>
            <ExpiryBadge expiresAt={a.expires_at} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HRDocuments({ employees, currentUser, preselectedUserId }) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState(preselectedUserId || '');
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [deletingId, setDeletingId] = useState(null);

  // Update if preselectedUserId changes (modal reopen)
  useEffect(() => {
    if (preselectedUserId) setSelectedUserId(preselectedUserId);
  }, [preselectedUserId]);

  const loadDocs = async (uid) => {
    if (!uid) return;
    setLoading(true);
    const data = await getEmployeeDocs(uid);
    setDocs(data);
    setLoading(false);
  };

  useEffect(() => { loadDocs(selectedUserId); }, [selectedUserId]);

  const handleDelete = async (doc) => {
    if (!confirm(`¿Eliminar "${doc.name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(doc.id);
    try {
      await deleteEmployeeDoc(doc.id, doc.file_path);
      toast({ title: 'Documento eliminado', description: `"${doc.name}" fue eliminado.` });
      setDocs(d => d.filter(x => x.id !== doc.id));
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setDeletingId(null); }
  };

  const filteredDocs = activeCategory === 'all' ? docs : docs.filter(d => d.category === activeCategory);
  const groupedByCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = docs.filter(d => d.category === cat.id);
    return acc;
  }, {});

  const getCatLabel = (id) => CATEGORIES.find(c => c.id === id)?.label || id;

  return (
    <div className="space-y-4">
      {/* Alerts panel (global, all employees) */}
      <ExpiryAlertsPanel employees={employees} />

      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex-1 max-w-xs">
          <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Empleado</label>
          <select
            value={selectedUserId}
            onChange={e => { setSelectedUserId(e.target.value); setActiveCategory('all'); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="">— Seleccionar empleado —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.job_title || 'Sin puesto'})</option>)}
          </select>
        </div>

        {selectedUserId && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors mt-5 sm:mt-0">
            <Upload className="h-4 w-4" /> Subir Documento
          </button>
        )}
      </div>

      {/* Category tabs */}
      {selectedUserId && docs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeCategory === 'all' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            Todos ({docs.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = groupedByCategory[cat.id]?.length || 0;
            if (count === 0) return null;
            return (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeCategory === cat.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Documents grid */}
      {!selectedUserId ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-14 w-14 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">Selecciona un empleado para ver sus documentos</p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-28 bg-slate-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-700 rounded-xl">
          <FileText className="h-12 w-12 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No hay documentos en esta categoría</p>
          <button onClick={() => setShowUpload(true)}
            className="mt-3 text-emerald-400 hover:text-emerald-300 text-sm flex items-center gap-1 transition-colors">
            <Upload className="h-3.5 w-3.5" /> Subir el primero
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 hover:border-slate-500 transition-colors">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{doc.name}</p>
                  <p className="text-slate-500 text-xs truncate mt-0.5">{doc.file_name}</p>
                </div>
                <span className="text-lg shrink-0">{getCatLabel(doc.category).split(' ')[0]}</span>
              </div>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-slate-400 bg-slate-900 rounded px-2 py-0.5">{getCatLabel(doc.category)}</span>
                {doc.file_size && <span className="text-[10px] text-slate-500">{formatSize(doc.file_size)}</span>}
                <ExpiryBadge expiresAt={doc.expires_at} />
              </div>

              {/* Upload date */}
              <p className="text-[10px] text-slate-600">
                Subido {new Date(doc.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>

              {/* Actions */}
              <div className="flex gap-2 mt-auto">
                <button onClick={() => setPreviewDoc(doc)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-xs transition-colors">
                  <Eye className="h-3.5 w-3.5" /> Ver
                </button>
                <button onClick={() => handleDelete(doc)} disabled={deletingId === doc.id}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-red-600/30 text-slate-400 hover:text-red-400 rounded-lg text-xs transition-colors disabled:opacity-40">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showUpload && (
        <UploadModal
          employeeId={selectedUserId}
          uploadedBy={currentUser?.id}
          onClose={() => setShowUpload(false)}
          onSuccess={() => loadDocs(selectedUserId)}
        />
      )}
      {previewDoc && <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
}
