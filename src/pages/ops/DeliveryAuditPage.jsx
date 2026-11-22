import React, { useState, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ClipboardCheck, 
  User, 
  Truck, 
  Clock, 
  Calendar, 
  Save, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  AlertCircle,
  Eraser,
  Download,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';
import SignatureCanvas from 'react-signature-canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const QUESTIONS = [
  {
    id: 'pre_route',
    title: 'ACTIVIDADES ANTES DE SALIR A RUTA',
    items: [
      { id: 'q1', text: '¿Contar con licencia de conducir vigente y verificar se encuentren en el vehículo tarjeta de circulación y documento de seguro del vehículo?' },
      { id: 'q2', text: '¿Revisar estado mecánico de la unidad (combustible, llantas, luces, niveles de fluidos)?' },
      { id: 'q3', text: '¿Verificar que la caja de seguridad esté operativa y cerrando correctamente?' },
      { id: 'q4', text: '¿Revisar funcionamiento de cámaras (grabación activa y visibilidad correcta) (si aplica)?' },
    ]
  },
  {
    id: 'operational',
    title: 'OPERATIVOS',
    items: [
      { id: 'q5', text: '¿Cerrar completamente las cortinas o puertas de acceso al producto cuando se realicen entregas y mantener contacto visual con el vehículo en todo momento?' },
      { id: 'q6', text: '¿Respeta el límite de velocidad (85 km/h)?' },
      { id: 'q7', text: '¿Utilizar el cinturón de seguridad al conducir?' },
      { id: 'q8', text: '¿Prohibido el uso del celular al manejar y evitar distracciones?' },
      { id: 'q9', text: '¿Utilizar correctamente las luces preventivas (direccionales e intermitentes)?' },
      { id: 'q10', text: '¿Llevar solo el efectivo necesario ($500 pesos en billetes de baja denominación)?' },
    ]
  },
  {
    id: 'on_route',
    title: 'ACTIVIDADES EN RUTA',
    items: [
      { id: 'q11', text: '¿No desviarse de la ruta establecida sin autorización?' },
      { id: 'q12', text: '¿Evaluar el entorno antes de bajar de la unidad y después de realizar la entrega?' },
      { id: 'q13', text: '¿Realizar entregas rápidas y sin distracciones?' },
      { id: 'q14', text: '¿Estacionarse en lugares visibles y concurridos al hacer entregas?' },
      { id: 'q15', text: '¿Colocar el dinero de venta en la caja de seguridad inmediatamente después de cada cobro?' },
      { id: 'q16', text: '¿No contar dinero en vía pública?' },
    ]
  }
];

export default function DeliveryAuditPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('pre_route');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  
  // Signature Refs
  const driverSigRef = useRef(null);
  const auditorSigRef = useRef(null);

  // Form State
  const [auditData, setAuditData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    ruta: '',
    hora_inicio: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    hora_termino: '',
    auditor_nombre: user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || user?.email || '',
    repartidor_nombre: '',
    respuestas: {}, // { q1: { val: 'si', obs: '' }, ... }
    observaciones_generales: ''
  });

  // Initialize responses and check pending
  useEffect(() => {
    const loadDraftAndCheck = async () => {
      // 1. Cargar borrador si existe
      const { value } = await Preferences.get({ key: 'audit_draft' });
      if (value) {
        try {
          const draft = JSON.parse(value);
          setAuditData(prev => ({ ...prev, ...draft }));
          // Si el borrador tiene respuestas, marcamos la sección correspondiente como activa
          if (draft.ruta || draft.repartidor_nombre) setActiveSection('pre_route');
        } catch (e) { console.error("Error al cargar borrador", e); }
      } else {
        // Inicialización por defecto si no hay borrador
        const initialResp = {};
        QUESTIONS.forEach(section => {
          section.items.forEach(item => {
            initialResp[item.id] = { val: null, obs: '' };
          });
        });
        setAuditData(prev => ({ ...prev, respuestas: initialResp }));
      }

      // 2. Revisar pendientes de sincronizar
      checkPendingAudits();
    };

    loadDraftAndCheck();
  }, []);

  // Auto-guardado de borrador
  useEffect(() => {
    const saveDraft = async () => {
      // Solo guardamos si hay algo escrito para no sobreescribir con datos vacíos al inicio
      if (auditData.ruta || auditData.repartidor_nombre || Object.values(auditData.respuestas).some(r => r.val !== null)) {
        await Preferences.set({
          key: 'audit_draft',
          value: JSON.stringify(auditData)
        });
      }
    };
    saveDraft();
  }, [auditData]);

  const checkPendingAudits = async () => {
    try {
      let keys = [];
      if (Capacitor.isNativePlatform()) {
        const result = await Preferences.getKeys();
        keys = result.keys;
      } else {
        // Fallback para Web (Vite)
        keys = Object.keys(localStorage);
      }
      const pending = keys.filter(k => k.startsWith('pending_audit_'));
      setPendingCount(pending.length);
    } catch (e) {
      console.warn("Error al revisar pendientes:", e);
    }
  };

  const resetForm = () => {
    const initialResp = {};
    QUESTIONS.forEach(section => {
      section.items.forEach(item => {
        initialResp[item.id] = { val: null, obs: '' };
      });
    });
    setAuditData({
      fecha: new Date().toISOString().split('T')[0],
      ruta: '',
      repartidor_nombre: '',
      respuestas: initialResp,
      observaciones_generales: ''
    });
    setPdfUrl(null);
    setActiveSection('pre_route');
    // Forzar limpieza de firmas si existen refs
    if (driverSigRef.current) driverSigRef.current.clear();
    if (auditorSigRef.current) auditorSigRef.current.clear();
  };

  const syncPendingAudits = async () => {
    let keys = [];
    if (Capacitor.isNativePlatform()) {
      const result = await Preferences.getKeys();
      keys = result.keys;
    } else {
      keys = Object.keys(localStorage);
    }
    const pendingKeys = keys.filter(k => k.startsWith('pending_audit_'));
    
    if (pendingKeys.length === 0) return;

    setLoading(true);
    let successCount = 0;

    for (const key of pendingKeys) {
      try {
        const { value } = await Preferences.get({ key });
        const data = JSON.parse(value);
        
        // Intentar subir PDF si existe blob (o regenerarlo)
        // Por simplicidad, aquí intentamos subir los datos a la DB primero
        const { error: dbError } = await supabase.from('delivery_audits').insert([{
          fecha: data.fecha,
          ruta: data.ruta,
          hora_inicio: data.hora_inicio,
          hora_termino: data.hora_termino,
          auditor_id: user.id,
          repartidor_nombre: data.repartidor_nombre,
          respuestas: data.respuestas,
          observaciones_generales: data.observaciones_generales,
          firma_repartidor: data.firma_repartidor,
          firma_auditor: data.firma_auditor,
          pdf_url: data.pdf_url // Si se alcanzó a generar antes de fallar el internet
        }]);

        if (!dbError) {
          await Preferences.remove({ key });
          successCount++;
        }
      } catch (err) {
        console.error("Error sincronizando auditoría:", err);
      }
    }

    setLoading(false);
    checkPendingAudits();
    if (successCount > 0) {
      toast({ title: "Sincronización completa", description: `Se subieron ${successCount} auditorías pendientes.` });
    }
  };

  const handleResponse = (id, val) => {
    setAuditData(prev => ({
      ...prev,
      respuestas: {
        ...prev.respuestas,
        [id]: { ...prev.respuestas[id], val }
      }
    }));
  };

  const handleObservation = (id, obs) => {
    setAuditData(prev => ({
      ...prev,
      respuestas: {
        ...prev.respuestas,
        [id]: { ...prev.respuestas[id], obs }
      }
    }));
  };

  const isSectionComplete = (sectionId) => {
    const section = QUESTIONS.find(s => s.id === sectionId);
    if (!section) return false;
    return section.items.every(item => auditData.respuestas[item.id]?.val !== null);
  };

  const validateForm = () => {
    if (!auditData.ruta || !auditData.repartidor_nombre) {
      toast({ title: "Datos incompletos", description: "Ruta y Repartidor son obligatorios.", variant: "destructive" });
      return false;
    }
    
    const missing = Object.keys(auditData.respuestas).find(id => auditData.respuestas[id].val === null);
    if (missing) {
      toast({ title: "Checklist incompleto", description: "Por favor contesta todas las preguntas.", variant: "destructive" });
      return false;
    }

    if (driverSigRef.current.isEmpty()) {
      toast({ title: "Firma faltante", description: "El repartidor debe firmar la auditoría.", variant: "destructive" });
      return false;
    }

    return true;
  };

  const generatePDF = async (finalData, driverSig, auditorSig) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(0, 130, 72); // Green Heineken
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("CERVEZAS FINAS DE CIUDAD SERDÁN S.A. DE C.V.", pageWidth / 2, 12, { align: 'center' });
    doc.setFontSize(10);
    doc.text("CHECK-LIST DE SEGURIDAD - RUTA DE REPARTOS", pageWidth / 2, 22, { align: 'center' });

    // General Data Table
    autoTable(doc, {
      startY: 32,
      body: [
        ['FECHA:', finalData.fecha, 'REPARTIDOR:', finalData.repartidor_nombre],
        ['RUTA:', finalData.ruta, 'AUDITOR:', finalData.auditor_nombre],
        ['H. INICIO:', finalData.hora_inicio, 'H. TÉRMINO:', finalData.hora_termino || '-'],
      ],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 70 }, 2: { cellWidth: 25 }, 3: { cellWidth: 70 } }
    });

    // Questions Sections
    let currentY = doc.lastAutoTable.finalY + 5;

    QUESTIONS.forEach(section => {
      doc.setFillColor(245, 245, 245);
      doc.rect(14, currentY, pageWidth - 28, 6, 'F');
      doc.setTextColor(0, 100, 50);
      doc.setFontSize(8);
      doc.text(section.title, 16, currentY + 4);
      
      const rows = section.items.map(item => [
        item.text,
        finalData.respuestas[item.id].val === 'si' ? 'SÍ' : 'NO',
        finalData.respuestas[item.id].obs || ''
      ]);

      autoTable(doc, {
        startY: currentY + 6,
        head: [['DESCRIPCIÓN', 'SI/NO', 'OBSERVACIONES']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [0, 130, 72], textColor: [255, 255, 255], fontSize: 6 },
        styles: { fontSize: 6, cellPadding: 1 },
        columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 15 }, 2: { cellWidth: 60 } }
      });
      currentY = doc.lastAutoTable.finalY + 3;
    });

    // Signatures (Compact)
    currentY += 5;
    if (currentY > 260) currentY = 250; // Ajuste final para evitar salto de hoja
    
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text("FIRMA DEL REPARTIDOR", 55, currentY + 30, { align: 'center' });
    doc.line(30, currentY + 25, 80, currentY + 25);
    doc.addImage(driverSig, 'PNG', 35, currentY, 35, 20);

    doc.text("FIRMA DEL AUDITOR", 155, currentY + 30, { align: 'center' });
    doc.line(130, currentY + 25, 180, currentY + 25);
    if (auditorSig) doc.addImage(auditorSig, 'PNG', 135, currentY, 35, 20);

    return doc.output('blob');
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const driverSig = driverSigRef.current.getCanvas().toDataURL('image/png');
      const auditorSig = auditorSigRef.current.isEmpty() ? null : auditorSigRef.current.getCanvas().toDataURL('image/png');
      
      const finalTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const fullData = { ...auditData, hora_termino: finalTime };

      // 1. GUARDADO NATIVO INMEDIATO (Seguridad total)
      const storageKey = `pending_audit_${Date.now()}`;
      await Preferences.set({
        key: storageKey,
        value: JSON.stringify({
          ...fullData,
          firma_repartidor: driverSig,
          firma_auditor: auditorSig
        })
      });

      // 2. INTENTAR SUBIR (Si hay internet)
      try {
        // Generate PDF Blob
        const pdfBlob = await generatePDF(fullData, driverSig, auditorSig);
        
        // Upload PDF to Supabase Storage
        const fileName = `audit_${Date.now()}.pdf`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(`auditorias/${fileName}`, pdfBlob);

        let publicUrl = null;
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(`auditorias/${fileName}`);
          publicUrl = urlData.publicUrl;
        }

        // Save to DB
        const { error: dbError } = await supabase.from('delivery_audits').insert([{
          fecha: fullData.fecha,
          ruta: fullData.ruta,
          hora_inicio: fullData.hora_inicio,
          hora_termino: finalTime,
          auditor_id: user.id,
          repartidor_nombre: fullData.repartidor_nombre,
          respuestas: fullData.respuestas,
          observaciones_generales: fullData.observaciones_generales,
          firma_repartidor: driverSig,
          firma_auditor: auditorSig,
          pdf_url: publicUrl
        }]);

        if (dbError) throw dbError;

        // Si llegó aquí, todo se guardó en la nube, borramos el local
        await Preferences.remove({ key: storageKey });
        await Preferences.remove({ key: 'audit_draft' });
        setPdfUrl(publicUrl);
        toast({ title: "¡Guardado en la nube!", description: "La auditoría se ha registrado correctamente." });
        
        // REINICIAR FORMULARIO DESPUÉS DE 2 SEGUNDOS (para que vean el éxito)
        setTimeout(() => {
          resetForm();
        }, 2000);
        
      } catch (uploadErr) {
        console.warn("Fallo de conexión, auditoría guardada localmente:", uploadErr);
        await Preferences.remove({ key: 'audit_draft' });
        toast({ 
          title: "Modo Offline", 
          description: "No hay internet. La auditoría se guardó en el teléfono y se sincronizará luego.",
          variant: "warning" 
        });
        setPendingCount(prev => prev + 1);
        setPdfUrl("offline"); 

        // REINICIAR TAMBIÉN EN OFFLINE
        setTimeout(() => {
          resetForm();
        }, 2000);
      }
      
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "No se pudo guardar la auditoría.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <Helmet><title>Auditoría de Reparto | Cervezas Finas</title></Helmet>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6 px-4">
        <div className="p-3 bg-emerald-500/20 rounded-2xl">
          <ClipboardCheck className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Auditoría de Reparto</h1>
          <p className="text-slate-400 text-sm">Checklist de seguridad y operativos</p>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="mx-4 mb-6 p-4 bg-amber-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
            <div>
              <p className="text-amber-200 text-sm font-bold">Tienes {pendingCount} auditorías pendientes</p>
              <p className="text-amber-200/60 text-[10px]">Se guardaron mientras no tenías señal.</p>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={syncPendingAudits}
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold"
          >
            Sincronizar ahora
          </Button>
        </div>
      )}

      <div className="space-y-4 px-4">
        {/* Datos Generales */}
        <Card className="bg-slate-900/50 border-white/10">
          <CardHeader className="py-4 border-b border-white/5">
            <CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4 text-emerald-400"/> Datos Generales</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Repartidor</Label>
              <Input 
                placeholder="Nombre completo" 
                value={auditData.repartidor_nombre}
                onChange={e => setAuditData({...auditData, repartidor_nombre: e.target.value})}
                className="bg-slate-950/50 border-white/10 text-white" 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Ruta / Camión</Label>
              <Input 
                placeholder="Ej: RUTA 01 / C-05" 
                value={auditData.ruta}
                onChange={e => setAuditData({...auditData, ruta: e.target.value})}
                className="bg-slate-950/50 border-white/10 text-white" 
              />
            </div>
            <div className="flex gap-4">
               <div className="flex-1 space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-slate-500">H. Inicio</Label>
                <div className="flex items-center gap-2 text-white text-sm bg-slate-950/50 p-2 rounded-md border border-white/5">
                  <Clock size={14} className="text-emerald-400"/> {auditData.hora_inicio}
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-slate-500">Fecha</Label>
                <div className="flex items-center gap-2 text-white text-sm bg-slate-950/50 p-2 rounded-md border border-white/5">
                  <Calendar size={14} className="text-emerald-400"/> {auditData.fecha}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Auditor</Label>
              <div className="flex items-center gap-2 text-white text-sm bg-slate-950/50 p-2 rounded-md border border-white/5">
                <User size={14} className="text-emerald-400"/> {auditData.auditor_nombre}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        {QUESTIONS.map((section) => (
          <Card key={section.id} className="bg-slate-900/50 border-white/10 overflow-hidden">
            <button 
              onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{section.title}</span>
                {isSectionComplete(section.id) && (
                  <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    <CheckCircle2 size={10} className="text-emerald-400" />
                    <span className="text-[9px] font-bold text-emerald-400">COMPLETADO</span>
                  </div>
                )}
              </div>
              {activeSection === section.id ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
            </button>
            <AnimatePresence>
              {activeSection === section.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <CardContent className="pt-4 space-y-6">
                    {section.items.map((item) => (
                      <div key={item.id} className="space-y-3 pb-4 border-b border-white/5 last:border-0">
                        <p className="text-sm text-slate-200 leading-relaxed">{item.text}</p>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => handleResponse(item.id, 'si')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                              auditData.respuestas[item.id]?.val === 'si'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            <CheckCircle2 size={14}/> SÍ
                          </button>
                          <button
                            onClick={() => handleResponse(item.id, 'no')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                              auditData.respuestas[item.id]?.val === 'no'
                                ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            <AlertCircle size={14}/> NO
                          </button>
                          <Input 
                            placeholder="Observación..."
                            value={auditData.respuestas[item.id]?.obs || ''}
                            onChange={e => handleObservation(item.id, e.target.value)}
                            className="bg-slate-950/30 border-white/5 text-xs h-8 flex-1 min-w-[150px]"
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        ))}

        {/* Firmas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <Card className="bg-slate-900/50 border-white/10">
            <CardHeader className="py-3 border-b border-white/5 flex flex-row items-center justify-between">
              <CardTitle className="text-xs uppercase text-slate-400">Firma Repartidor *</CardTitle>
              <button onClick={() => driverSigRef.current.clear()} className="text-slate-600 hover:text-white"><Eraser size={14}/></button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-white rounded-b-lg">
                <SignatureCanvas 
                  ref={driverSigRef}
                  penColor='black'
                  canvasProps={{className: "w-full h-40"}}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-white/10">
            <CardHeader className="py-3 border-b border-white/5 flex flex-row items-center justify-between">
              <CardTitle className="text-xs uppercase text-slate-400">Firma Auditor (Opcional)</CardTitle>
              <button onClick={() => auditorSigRef.current.clear()} className="text-slate-600 hover:text-white"><Eraser size={14}/></button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-white rounded-b-lg">
                <SignatureCanvas 
                  ref={auditorSigRef}
                  penColor='black'
                  canvasProps={{className: "w-full h-40"}}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Observaciones Generales */}
        <Card className="bg-slate-900/50 border-white/10">
          <CardContent className="pt-4">
            <Label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block">Observaciones Generales</Label>
            <Textarea 
              placeholder="Notas adicionales sobre la auditoría..."
              value={auditData.observaciones_generales}
              onChange={e => setAuditData({...auditData, observaciones_generales: e.target.value})}
              className="bg-slate-950/50 border-white/10 text-white min-h-[100px]"
            />
          </CardContent>
        </Card>

        {/* Acciones */}
        <div className="pt-6 flex flex-col gap-3">
          {!pdfUrl ? (
            <Button 
              onClick={handleSave} 
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-14 rounded-2xl text-lg font-bold shadow-xl shadow-emerald-600/20"
            >
              {loading ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
              Finalizar y Guardar Auditoría
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="text-emerald-400 w-6 h-6"/>
                <p className="text-emerald-100 text-sm font-medium">Auditoría guardada con éxito.</p>
              </div>
              <Button 
                asChild
                className="w-full bg-slate-800 hover:bg-slate-700 text-white h-14 rounded-2xl text-lg font-bold"
              >
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2"/> Descargar PDF
                </a>
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()}
                className="w-full border-white/10 text-slate-400"
              >
                Realizar otra auditoría
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Loader2(props) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}
