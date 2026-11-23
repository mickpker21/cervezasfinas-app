import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { 
  ClipboardList, Camera, MapPin, Save, Loader2, FileText, ChevronLeft, CheckCircle2, User
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { fetchCustomSurveyTemplates, saveCustomSurveyResponse } from '@/lib/mysqlCustomSurveys';
import { supabase } from '@/supabaseClient';
import SignatureCanvas from 'react-signature-canvas';
import { Geolocation } from '@capacitor/geolocation';
import { uploadPhoto } from '@/lib/uploadService';
import { DirectCameraModal } from '@/components/common/DirectCameraModal';

export default function DynamicSurveyPage() {
  const { clientId, templateId } = useParams();
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const { toast } = useToast();

  const [template, setTemplate] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form State
  const [responses, setResponses] = useState({});
  const [gpsLocation, setGpsLocation] = useState(null);
  const [photos, setPhotos] = useState({});
  const [activeCameraFieldId, setActiveCameraFieldId] = useState(null);
  
  // Refs
  const signatureRef = useRef(null);
  const fileInputRefs = useRef({});

  useEffect(() => {
    async function load() {
      try {
        // Load Template
        const templates = await fetchCustomSurveyTemplates(true);
        const t = templates.find(x => x.id === templateId);
        if (t) setTemplate(t);
        else {
          toast({ title: "Error", description: "Encuesta no encontrada", variant: "destructive" });
          navigate(-1);
          return;
        }

        // Load Client
        const { data: clientData, error: clientError } = await supabase
          .from('padron_clientes')
          .select('id, name, business_name, store_type')
          .eq('id', clientId)
          .single();
          
        if (clientData) setClient(clientData);

      } catch (e) {
        toast({ title: "Error", description: "No se pudo cargar la encuesta", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [templateId, clientId]);

  const handleResponseChange = (fieldId, value) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleCaptureGps = async () => {
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      toast({ title: "GPS Capturado", description: "Ubicación guardada correctamente." });
    } catch (e) {
      toast({ title: "Error GPS", description: "No se pudo obtener la ubicación.", variant: "destructive" });
    }
  };

  const handlePhotoUpload = async (fieldId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast({ title: "Subiendo...", description: "Cargando fotografía" });
      const url = await uploadPhoto(file, 'visitas-fotos');
      if (url) {
        setPhotos(prev => ({ ...prev, [fieldId]: url }));
        toast({ title: "Éxito", description: "Foto cargada." });
      }
    } catch (err) {
      toast({ title: "Error", description: "No se pudo subir la foto", variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    // Check required fields based on schema
    const schema = template.schema_json || [];
    for (const section of schema) {
      for (const field of section.fields || []) {
        if (field.required) {
          if (field.type === 'photo' && !photos[field.id]) {
            toast({ title: "Aviso", description: `Falta fotografía requerida: ${field.label}`, variant: "warning" });
            return;
          }
          if (field.type !== 'photo' && !responses[field.id]) {
            toast({ title: "Aviso", description: `Pregunta requerida sin responder: ${field.label}`, variant: "warning" });
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      let signatureUrl = null;
      if (signatureRef.current && !signatureRef.current.isEmpty()) {
        const sigBase64 = signatureRef.current.getCanvas().toDataURL('image/png');
        // Para simplificar, si la firma es muy grande, deberíamos subirla al bucket. 
        // Aquí la guardamos directo si es ligera o la convertimos.
        signatureUrl = sigBase64; 
      }

      await saveCustomSurveyResponse({
        template_id: template.id,
        supervisor_id: user?.id,
        client_id: clientId,
        responses: responses,
        gps_location: gpsLocation,
        multimedia: {
          ...photos,
          signature: signatureUrl
        }
      });

      setSuccess(true);
      setTimeout(() => navigate(-1), 2000);
    } catch (e) {
      toast({ title: "Error", description: e.message || "Fallo al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!template) return null;

  if (success) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mb-6">
          <div className="w-24 h-24 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-12 h-12 text-cyan-400" />
          </div>
        </motion.div>
        <h2 className="text-3xl font-bold text-white mb-2">Encuesta Enviada</h2>
        <p className="text-slate-400">Tus respuestas han sido registradas exitosamente.</p>
      </div>
    );
  }

  const schema = template.schema_json || [];

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <Helmet><title>{template.title} | Cervezas Finas</title></Helmet>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6 px-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-slate-400">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div className="p-3 bg-cyan-500/20 rounded-2xl">
          <ClipboardList className="w-8 h-8 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{template.title}</h1>
          <p className="text-slate-400 text-sm">{template.description}</p>
        </div>
      </div>

      <div className="px-4 space-y-6">
        
        {/* Client Info */}
        <Card className="bg-slate-900/60 border-slate-800/60 overflow-hidden">
            <div className="bg-cyan-500/10 border-b border-cyan-500/20 p-4 flex items-center gap-3">
                <User className="w-5 h-5 text-cyan-400" />
                <div>
                    <p className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Cliente a Encuestar</p>
                    <p className="text-lg font-bold text-white">{client?.name || client?.business_name || 'Desconocido'}</p>
                    <p className="text-xs text-slate-400">ID: {clientId} • {client?.store_type || 'N/A'}</p>
                </div>
            </div>
        </Card>

        {schema.map((section, idx) => (
          <Card key={idx} className="bg-slate-900/60 border-slate-800/60">
            <CardHeader>
              <CardTitle className="text-white">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(section.fields || []).map(field => (
                <div key={field.id} className="space-y-2 border-b border-slate-800/50 pb-4 last:border-0">
                  <Label className="text-slate-300 text-base">
                    {field.label} {field.required && <span className="text-red-400">*</span>}
                  </Label>
                  
                  {field.type === 'text' && (
                    <Textarea 
                      value={responses[field.id] || ''}
                      onChange={e => handleResponseChange(field.id, e.target.value)}
                      className="bg-slate-800/50 border-slate-700 text-white"
                      placeholder="Respuesta libre..."
                    />
                  )}

                  {field.type === 'boolean' && (
                    <Select value={responses[field.id] || ''} onValueChange={v => handleResponseChange(field.id, v)}>
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                        <SelectValue placeholder="Seleccione Sí / No" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="si">Sí</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {field.type === 'select' && (
                    <Select value={responses[field.id] || ''} onValueChange={v => handleResponseChange(field.id, v)}>
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                        <SelectValue placeholder="Seleccione una opción" />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {field.type === 'photo' && (
                    <div>
                      {photos[field.id] ? (
                        <div className="relative inline-block mt-2" onClick={() => setActiveCameraFieldId(field.id)}>
                          <img src={photos[field.id]} alt="Evidencia" className="w-32 h-32 object-cover rounded-xl border border-slate-700 cursor-pointer" />
                          <div className="absolute -top-2 -right-2 bg-emerald-500 rounded-full p-1">
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center gap-4">
                          <Button type="button" variant="outline" className="border-slate-700 bg-slate-800/50 text-slate-300" onClick={() => setActiveCameraFieldId(field.id)}>
                            <Camera className="w-4 h-4 mr-2" /> Abrir Cámara
                          </Button>
                        </div>
                      )}
                      <DirectCameraModal
                        open={activeCameraFieldId === field.id}
                        onClose={() => setActiveCameraFieldId(null)}
                        title={field.label || 'Tomar Foto'}
                        onCapture={(file) => {
                          if (file) handlePhotoUpload(field.id, { target: { files: [file] } });
                        }}
                      />
                    </div>
                  )}

                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card className="bg-slate-900/60 border-slate-800/60">
          <CardHeader>
            <CardTitle className="text-white">Verificaciones Extra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-slate-300">Ubicación GPS</Label>
              <div className="flex items-center gap-4">
                <Button variant={gpsLocation ? "success" : "outline"} className={!gpsLocation ? "border-slate-700 bg-slate-800/50 text-slate-300" : ""} onClick={handleCaptureGps}>
                  <MapPin className="w-4 h-4 mr-2" /> 
                  {gpsLocation ? "Capturado" : "Registrar Ubicación Actual"}
                </Button>
                {gpsLocation && <span className="text-xs text-cyan-400">Lat: {gpsLocation.lat.toFixed(4)}, Lng: {gpsLocation.lng.toFixed(4)}</span>}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Firma de Conformidad</Label>
              <div className="bg-white rounded-xl border-2 border-slate-700 overflow-hidden touch-none">
                <SignatureCanvas 
                  ref={signatureRef}
                  canvasProps={{ width: 400, height: 150, className: 'w-full h-[150px]' }}
                  backgroundColor="#ffffff"
                  penColor="#0f172a"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => signatureRef.current?.clear()} className="text-slate-400 mt-2">
                Limpiar Firma
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button 
          className="w-full h-14 text-lg bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)]"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Save className="w-6 h-6 mr-2" /> Enviar Encuesta</>}
        </Button>
      </div>
    </div>
  );
}
