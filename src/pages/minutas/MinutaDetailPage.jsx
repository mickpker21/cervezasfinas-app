// src/pages/minutas/MinutaDetailPage.jsx
// Detalle de una minuta con aprobación/rechazo de evidencia
import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  getMinutaById, approveItem, rejectItem, uploadEvidence,
  updateMinutaItemStatus, deleteMinutaItem
} from '@/repositories/minutaRepository';
import {
  ClipboardList, Clock, CheckCircle2, XCircle, Eye, Upload,
  Calendar, Camera, Image as ImageIcon, AlertTriangle, ArrowLeft,
  User, Trash2, ChevronDown, ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', dot: 'bg-amber-400', textColor: 'text-amber-300' },
  en_progreso: { label: 'En progreso', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', dot: 'bg-blue-400', textColor: 'text-blue-300' },
  evidencia_enviada: { label: 'Evidencia enviada', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30', dot: 'bg-violet-400', textColor: 'text-violet-300' },
  aprobada: { label: 'Cumplida ✓', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400', textColor: 'text-emerald-300' },
  rechazada: { label: 'Rechazada', color: 'bg-red-500/20 text-red-300 border-red-500/30', dot: 'bg-red-400', textColor: 'text-red-300' },
};

export default function MinutaDetailPage() {
  const { minutaId } = useParams();
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const { toast } = useToast();

  const [minuta, setMinuta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState(new Set());

  // Rejection
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingItemId, setRejectingItemId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Evidence upload (for assigned user)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Gallery
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryUrls, setGalleryUrls] = useState([]);

  // Role check
  const userRole = useMemo(() => {
    const rawType = user?.user_metadata?.type
      || user?.user_metadata?.role
      || (user?.app_metadata?.roles && user.app_metadata.roles[0])
      || '';
    return rawType.toString().toLowerCase().replace(/[\s_-]/g, '');
  }, [user]);

  const isAdminOrAnalyst = useMemo(() => {
    return ['admin', 'administrador', 'analista'].includes(userRole);
  }, [userRole]);

  useEffect(() => {
    if (minutaId) loadMinuta();
  }, [minutaId]);

  const loadMinuta = async () => {
    setLoading(true);
    try {
      const data = await getMinutaById(minutaId);
      setMinuta(data);
    } catch (e) {
      console.error('[MinutaDetail] Error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    if (!minuta?.minuta_items) return { total: 0, pendientes: 0, evidencia: 0, aprobadas: 0, rechazadas: 0, progress: 0 };
    const items = minuta.minuta_items;
    const total = items.length;
    const pendientes = items.filter(i => ['pendiente', 'en_progreso'].includes(i.status)).length;
    const evidencia = items.filter(i => i.status === 'evidencia_enviada').length;
    const aprobadas = items.filter(i => i.status === 'aprobada').length;
    const rechazadas = items.filter(i => i.status === 'rechazada').length;
    const progress = total > 0 ? Math.round((aprobadas / total) * 100) : 0;
    return { total, pendientes, evidencia, aprobadas, rechazadas, progress };
  }, [minuta]);

  const toggleExpand = (id) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleApprove = async (itemId) => {
    try {
      await approveItem(itemId, user.id);
      toast({ title: 'Aprobada', description: 'La evidencia ha sido aprobada. La actividad se marca como cumplida.' });
      loadMinuta();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo aprobar.', variant: 'destructive' });
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast({ title: 'Error', description: 'Indica el motivo del rechazo.', variant: 'destructive' });
      return;
    }
    try {
      await rejectItem(rejectingItemId, rejectReason.trim());
      toast({ title: 'Rechazada', description: 'La evidencia ha sido rechazada. El usuario deberá volver a subir.' });
      setRejectDialogOpen(false);
      setRejectReason('');
      setRejectingItemId(null);
      loadMinuta();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo rechazar.', variant: 'destructive' });
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm('¿Eliminar esta actividad?')) return;
    try {
      await deleteMinutaItem(itemId);
      toast({ title: 'Eliminada', description: 'La actividad ha sido eliminada.' });
      loadMinuta();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo eliminar.', variant: 'destructive' });
    }
  };

  // Evidence upload handlers
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setEvidenceFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadEvidence = async () => {
    if (!evidenceFile || !selectedItem) return;
    setUploading(true);
    try {
      await uploadEvidence(selectedItem.id, evidenceFile);
      if (evidenceNotes.trim()) {
        await updateMinutaItemStatus(selectedItem.id, 'evidencia_enviada', evidenceNotes.trim());
      }
      toast({ title: 'Evidencia enviada', description: 'Tu evidencia ha sido enviada para revisión.' });
      setUploadDialogOpen(false);
      setEvidenceFile(null);
      setEvidenceNotes('');
      setPreviewUrl(null);
      setSelectedItem(null);
      loadMinuta();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo subir la evidencia.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toISOString().slice(0, 10));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Cargando minuta...</p>
        </div>
      </div>
    );
  }

  if (!minuta) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <p className="text-slate-400">No se encontró la minuta.</p>
          <Button onClick={() => navigate(-1)} className="mt-4 bg-cyan-600">Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <Helmet><title>{minuta.title} | Minutas</title></Helmet>

      {/* Back + Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-white mb-4 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-white">{minuta.title}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                minuta.status === 'activa' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
              }`}>
                {minuta.status === 'activa' ? 'Activa' : 'Cerrada'}
              </span>
            </div>
            {minuta.description && <p className="text-slate-400 text-sm">{minuta.description}</p>}
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
              {minuta.creator && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" /> Creada por: {minuta.creator.name || minuta.creator.email}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(minuta.created_at), 'dd MMM yyyy HH:mm', { locale: es })}
              </span>
            </div>
          </div>

          {/* Progress badge */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center min-w-[140px]">
            <p className="text-3xl font-black text-cyan-400">{stats.progress}%</p>
            <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mt-1">Cumplimiento</p>
            <div className="w-full h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-300' },
          { label: 'Pendientes', value: stats.pendientes, color: 'text-amber-300' },
          { label: 'Por Revisar', value: stats.evidencia, color: 'text-violet-300' },
          { label: 'Aprobadas', value: stats.aprobadas, color: 'text-emerald-300' },
          { label: 'Rechazadas', value: stats.rechazadas, color: 'text-red-300' },
        ].map(s => (
          <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
          <ClipboardList className="h-5 w-5 text-cyan-400" />
          Actividades ({stats.total})
        </h2>

        {(minuta.minuta_items || []).length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <ClipboardList className="h-10 w-10 mx-auto text-slate-600 mb-3" />
            <p>No hay actividades en esta minuta.</p>
          </div>
        ) : (
          (minuta.minuta_items || [])
            .sort((a, b) => {
              const order = { evidencia_enviada: 0, pendiente: 1, en_progreso: 2, rechazada: 3, aprobada: 4 };
              return (order[a.status] ?? 5) - (order[b.status] ?? 5);
            })
            .map((item, idx) => {
              const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pendiente;
              const expanded = expandedItems.has(item.id);
              const overdue = isOverdue(item.due_date) && !['aprobada'].includes(item.status);
              const isAssignedToMe = item.assigned_to === user?.id;
              const canUpload = isAssignedToMe && ['pendiente', 'en_progreso', 'rechazada'].includes(item.status) && minuta.status === 'activa';
              const canReview = isAdminOrAnalyst && item.status === 'evidencia_enviada';

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <Card className={`bg-white/5 border-white/10 overflow-hidden transition-all ${overdue ? 'border-red-500/20' : ''} ${canReview ? 'border-violet-500/20 shadow-lg shadow-violet-900/10' : ''}`}>
                    <CardContent className="p-0">
                      {/* Main row */}
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => toggleExpand(item.id)}
                      >
                        <div className={`w-3 h-3 rounded-full shrink-0 ${config.dot}`} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-semibold">{item.title}</h3>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${config.color}`}>
                              {config.label}
                            </span>
                            {overdue && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                                <AlertTriangle className="h-3 w-3 inline mr-0.5" />Vencida
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            {item.assignee && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {item.assignee.name || item.assignee.email}
                              </span>
                            )}
                            {item.due_date && (
                              <span className={`flex items-center gap-1 ${overdue ? 'text-red-400' : ''}`}>
                                <Calendar className="h-3 w-3" />
                                {format(new Date(item.due_date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
                              </span>
                            )}
                            {item.evidence_urls?.length > 0 && (
                              <span className="flex items-center gap-1 text-cyan-400">
                                <ImageIcon className="h-3 w-3" /> {item.evidence_urls.length} foto(s)
                              </span>
                            )}
                          </div>
                        </div>

                        {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                      </div>

                      {/* Expanded content */}
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          className="border-t border-white/5 p-4 bg-slate-900/50"
                        >
                          {item.description && (
                            <p className="text-sm text-slate-400 mb-4">{item.description}</p>
                          )}

                          {/* Evidence photos */}
                          {item.evidence_urls?.length > 0 && (
                            <div className="mb-4">
                              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Evidencia Fotográfica</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {item.evidence_urls.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                                    <img
                                      src={url}
                                      alt={`Evidencia ${i + 1}`}
                                      className="w-full h-32 rounded-lg border border-white/10 object-cover hover:border-cyan-500/50 transition-all cursor-zoom-in"
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Evidence notes */}
                          {item.evidence_notes && (
                            <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-1">Notas del usuario</p>
                              <p className="text-sm text-slate-300">{item.evidence_notes}</p>
                            </div>
                          )}

                          {/* Rejection reason */}
                          {item.rejection_reason && (
                            <div className="mb-4 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                              <p className="text-xs font-bold uppercase text-red-400 tracking-wider mb-1">Motivo de rechazo</p>
                              <p className="text-sm text-red-300">{item.rejection_reason}</p>
                            </div>
                          )}

                          {/* Approval info */}
                          {item.status === 'aprobada' && item.approver && (
                            <div className="mb-4 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                              <p className="text-sm text-emerald-300 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Aprobada por {item.approver.name || item.approver.email}
                                {item.approved_at && ` el ${format(new Date(item.approved_at), 'dd MMM yyyy HH:mm', { locale: es })}`}
                              </p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Review actions (admin/analista) */}
                            {canReview && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(item.id)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setRejectingItemId(item.id); setRejectDialogOpen(true); }}
                                  className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                                >
                                  <XCircle className="h-4 w-4 mr-1" /> Rechazar
                                </Button>
                              </>
                            )}

                            {/* Upload (assigned user) */}
                            {canUpload && (
                              <Button
                                size="sm"
                                onClick={() => { setSelectedItem(item); setUploadDialogOpen(true); }}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                              >
                                <Camera className="h-4 w-4 mr-1" /> Subir Evidencia
                              </Button>
                            )}

                            {/* Delete (admin only) */}
                            {isAdminOrAnalyst && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(item.id)}
                                className="text-slate-500 hover:text-red-400 ml-auto"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
        )}
      </div>

      {/* Dialog: Reject */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-300">
              <XCircle className="h-5 w-5" /> Rechazar Evidencia
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Indica el motivo para que el usuario corrija y vuelva a subir.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Motivo del rechazo *</Label>
            <textarea
              placeholder="Ej: La foto no muestra claramente el cumplimiento..."
              className="w-full mt-2 bg-slate-800 border border-white/10 rounded-md p-3 text-white text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setRejectDialogOpen(false); setRejectReason(''); }} className="text-slate-400">
              Cancelar
            </Button>
            <Button onClick={handleReject} className="bg-red-600 hover:bg-red-500 text-white px-8">
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Upload Evidence */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => { if (!open) { setUploadDialogOpen(false); setEvidenceFile(null); setEvidenceNotes(''); setPreviewUrl(null); } }}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-cyan-400" /> Subir Evidencia
            </DialogTitle>
            <DialogDescription className="text-slate-400">{selectedItem?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Foto *</Label>
              <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" id="detail-evidence-file" />
              <label
                htmlFor="detail-evidence-file"
                className="flex flex-col items-center justify-center w-full h-40 bg-slate-800 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-cyan-500/50 transition-colors"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="h-full rounded-xl object-contain" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-500 mb-2" />
                    <span className="text-sm text-slate-400">Toca para tomar o seleccionar foto</span>
                  </>
                )}
              </label>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Notas</Label>
              <textarea
                placeholder="Describe cómo se cumplió..."
                className="w-full bg-slate-800 border border-white/10 rounded-md p-3 text-white text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                value={evidenceNotes}
                onChange={e => setEvidenceNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setUploadDialogOpen(false); setEvidenceFile(null); setPreviewUrl(null); }} className="text-slate-400">Cancelar</Button>
            <Button onClick={handleUploadEvidence} disabled={!evidenceFile || uploading} className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 disabled:opacity-50">
              {uploading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Subiendo...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Enviar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
