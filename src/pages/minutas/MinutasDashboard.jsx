// src/pages/minutas/MinutasDashboard.jsx
// Vista de usuario — Mis actividades de minutas
import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  getMyMinutaItems, updateMinutaItemStatus, uploadEvidence
} from '@/repositories/minutaRepository';
import {
  ClipboardList, Clock, CheckCircle2, XCircle, Eye, Upload,
  Calendar, Camera, Image as ImageIcon, AlertTriangle, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: Clock, dot: 'bg-amber-400' },
  en_progreso: { label: 'En progreso', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: Clock, dot: 'bg-blue-400' },
  evidencia_enviada: { label: 'Evidencia enviada', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30', icon: Eye, dot: 'bg-violet-400' },
  aprobada: { label: 'Cumplida ✓', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: CheckCircle2, dot: 'bg-emerald-400' },
  rechazada: { label: 'Rechazada', color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: XCircle, dot: 'bg-red-400' },
};

export default function MinutasDashboard() {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const { toast } = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pendientes'); // pendientes | todas | aprobadas

  // Evidence upload
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Gallery
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryUrls, setGalleryUrls] = useState([]);

  useEffect(() => {
    if (user?.id) loadItems();
  }, [user]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getMyMinutaItems(user.id);
      setItems(data);
    } catch (e) {
      console.error('[MinutasDashboard] Error:', e);
    } finally {
      setLoading(false);
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    const total = items.length;
    const pendientes = items.filter(i => i.status === 'pendiente' || i.status === 'en_progreso').length;
    const enviadas = items.filter(i => i.status === 'evidencia_enviada').length;
    const aprobadas = items.filter(i => i.status === 'aprobada').length;
    const rechazadas = items.filter(i => i.status === 'rechazada').length;
    return { total, pendientes, enviadas, aprobadas, rechazadas };
  }, [items]);

  // Filtered items
  const filtered = useMemo(() => {
    switch (filter) {
      case 'pendientes':
        return items.filter(i => ['pendiente', 'en_progreso', 'rechazada'].includes(i.status));
      case 'enviadas':
        return items.filter(i => i.status === 'evidencia_enviada');
      case 'aprobadas':
        return items.filter(i => i.status === 'aprobada');
      default:
        return items;
    }
  }, [items, filter]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setEvidenceFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleUploadEvidence = async () => {
    if (!evidenceFile || !selectedItem) {
      toast({ title: 'Error', description: 'Selecciona una foto como evidencia.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Upload photo
      await uploadEvidence(selectedItem.id, evidenceFile);

      // Update notes if any
      if (evidenceNotes.trim()) {
        await updateMinutaItemStatus(selectedItem.id, 'evidencia_enviada', evidenceNotes.trim());
      }

      toast({ title: 'Evidencia enviada', description: 'Tu evidencia ha sido enviada para revisión.' });
      setUploadDialogOpen(false);
      resetUploadForm();
      loadItems();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo subir la evidencia.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setEvidenceFile(null);
    setEvidenceNotes('');
    setPreviewUrl(null);
    setSelectedItem(null);
  };

  const handleStartProgress = async (item) => {
    try {
      await updateMinutaItemStatus(item.id, 'en_progreso');
      toast({ title: 'En progreso', description: 'La actividad se ha marcado como en progreso.' });
      loadItems();
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estatus.', variant: 'destructive' });
    }
  };

  const openUploadDialog = (item) => {
    setSelectedItem(item);
    setUploadDialogOpen(true);
  };

  const openGallery = (urls) => {
    setGalleryUrls(urls || []);
    setGalleryOpen(true);
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toISOString().slice(0, 10));
  };

  const KPIS = [
    { label: 'Total', value: kpis.total, icon: FileText, gradient: 'from-slate-600 to-slate-700' },
    { label: 'Pendientes', value: kpis.pendientes, icon: Clock, gradient: 'from-amber-600 to-amber-700' },
    { label: 'En revisión', value: kpis.enviadas, icon: Eye, gradient: 'from-violet-600 to-violet-700' },
    { label: 'Cumplidas', value: kpis.aprobadas, icon: CheckCircle2, gradient: 'from-emerald-600 to-emerald-700' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <Helmet><title>Mis Minutas | Cervezas Finas</title></Helmet>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-cyan-400" />
          Mis Minutas
        </h1>
        <p className="text-slate-400 mt-1">Actividades asignadas, evidencia y seguimiento</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {KPIS.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className={`bg-gradient-to-br ${kpi.gradient} border-0 shadow-lg text-white`}>
              <CardContent className="p-5">
                <kpi.icon className="h-5 w-5 opacity-75 mb-2" />
                <p className="text-2xl font-bold">{loading ? '—' : kpi.value}</p>
                <p className="text-xs opacity-80">{kpi.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: 'pendientes', label: `Pendientes (${kpis.pendientes})` },
          { key: 'enviadas', label: `En revisión (${kpis.enviadas})` },
          { key: 'aprobadas', label: `Cumplidas (${kpis.aprobadas})` },
          { key: 'todas', label: `Todas (${kpis.total})` },
        ].map(tab => (
          <Button
            key={tab.key}
            variant={filter === tab.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(tab.key)}
            className={filter === tab.key
              ? 'bg-cyan-600 text-white'
              : 'border-white/10 text-slate-400 hover:bg-white/5'
            }
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-16 text-slate-400">
            <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
            Cargando actividades...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-600 mb-4" />
            <p className="text-slate-400">
              {filter === 'pendientes' ? '¡No tienes actividades pendientes!' : 'No hay actividades en esta categoría.'}
            </p>
          </div>
        ) : (
          filtered.map((item, idx) => {
            const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pendiente;
            const StatusIcon = config.icon;
            const overdue = isOverdue(item.due_date) && !['aprobada'].includes(item.status);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
              >
                <Card className={`bg-white/5 border-white/10 hover:border-white/20 transition-all ${overdue ? 'border-red-500/30' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Left: Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                          <h3 className="text-white font-semibold truncate">{item.title}</h3>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${config.color}`}>
                            {config.label}
                          </span>
                          {overdue && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-red-500/20 text-red-300 border-red-500/30 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Vencida
                            </span>
                          )}
                        </div>

                        {item.description && (
                          <p className="text-sm text-slate-400 mb-2 line-clamp-2">{item.description}</p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                          {item.minuta && (
                            <span className="flex items-center gap-1">
                              <ClipboardList className="h-3 w-3" />
                              {item.minuta.title}
                            </span>
                          )}
                          {item.due_date && (
                            <span className={`flex items-center gap-1 ${overdue ? 'text-red-400' : ''}`}>
                              <Calendar className="h-3 w-3" />
                              Límite: {format(new Date(item.due_date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
                            </span>
                          )}
                          {item.evidence_urls?.length > 0 && (
                            <button
                              onClick={() => openGallery(item.evidence_urls)}
                              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
                            >
                              <ImageIcon className="h-3 w-3" />
                              {item.evidence_urls.length} foto(s)
                            </button>
                          )}
                          {item.status === 'aprobada' && item.approver && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Aprobada por: {item.approver.name || item.approver.email}
                            </span>
                          )}
                        </div>

                        {/* Rejection reason */}
                        {item.status === 'rechazada' && item.rejection_reason && (
                          <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                            <p className="text-xs text-red-300">
                              <XCircle className="h-3 w-3 inline mr-1" />
                              Motivo de rechazo: {item.rejection_reason}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'pendiente' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStartProgress(item)}
                            className="border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
                          >
                            <Clock className="h-4 w-4 mr-1" /> Iniciar
                          </Button>
                        )}
                        {['pendiente', 'en_progreso', 'rechazada'].includes(item.status) && (
                          <Button
                            size="sm"
                            onClick={() => openUploadDialog(item)}
                            className="bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white"
                          >
                            <Camera className="h-4 w-4 mr-1" /> Subir Evidencia
                          </Button>
                        )}
                        {item.status === 'evidencia_enviada' && (
                          <span className="text-xs text-violet-300 italic">Esperando revisión...</span>
                        )}
                        {item.minuta && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/minutas/${item.minuta_id}`)}
                            className="text-slate-400 hover:text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Dialog: Upload Evidence */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => { if (!open) { setUploadDialogOpen(false); resetUploadForm(); } }}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Camera className="h-5 w-5 text-cyan-400" /> Subir Evidencia
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedItem?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* File input */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Foto de evidencia *</Label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                  id="evidence-file"
                />
                <label
                  htmlFor="evidence-file"
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
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Notas de cumplimiento</Label>
              <textarea
                placeholder="Describe cómo se cumplió la actividad..."
                className="w-full bg-slate-800 border border-white/10 rounded-md p-3 text-white text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                value={evidenceNotes}
                onChange={e => setEvidenceNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setUploadDialogOpen(false); resetUploadForm(); }} className="text-slate-400">
              Cancelar
            </Button>
            <Button
              onClick={handleUploadEvidence}
              disabled={!evidenceFile || uploading}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" /> Enviar Evidencia
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Photo Gallery */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-cyan-400" /> Evidencia Fotográfica
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {galleryUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={url}
                  alt={`Evidencia ${i + 1}`}
                  className="w-full rounded-xl border border-white/10 hover:border-cyan-500/50 transition-all cursor-zoom-in"
                />
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
