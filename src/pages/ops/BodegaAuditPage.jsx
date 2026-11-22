import React, { useState, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCheck, User, Warehouse, Clock, Calendar,
  Save, ChevronRight, ChevronDown, CheckCircle2, AlertCircle,
  Eraser, Download, RefreshCw, Loader2
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
    id: 'inicio_operacion',
    title: 'ACTIVIDADES AL INICIO DE LA OPERACIÓN',
    color: 'emerald',
    items: [
      { id: 'b_q1', text: '¿El trabajador llegó a tiempo o a su jornada laboral?' },
      { id: 'b_q2', text: '¿El trabajador usa su uniforme?' },
      { id: 'b_q3', text: '¿Realiza la limpieza diariamente y mantiene en orden su oficina y lugar de trabajo?' },
      { id: 'b_q4', text: '¿Se asegura que su personal tenga limpio y ordenado su almacén?' },
      { id: 'b_q5', text: '¿Tiene sus documentos y reportes ordenados, clasificados y en buen estado?' },
      { id: 'b_q6', text: '¿Verifica el conteo y las condiciones en que se encuentre el producto, unidades, así como el área de trabajo, notificando a su jefe inmediato?' },
      { id: 'b_q7', text: '¿Asegura que todas las unidades salgan a tiempo y lleven los pedidos correctos en excelentes en fallas?' },
    ]
  },
  {
    id: 'operaciones',
    title: 'ACTIVIDADES OPERATIVAS',
    color: 'blue',
    items: [
      { id: 'b_q8', text: '¿El trabajador se asegura que en su almacén se realicen correctas maniobras salvaguardando la seguridad del producto y de su personal a cargo?' },
      { id: 'b_q9', text: '¿Cuenta con el EPP adecuado al realizar sus operaciones y se asegura de que su personal lo use?' },
      { id: 'b_q10', text: '¿El trabajador se asegura de que sus compañeros y jefes acatando las indicaciones de trabajo en tiempo y forma?' },
      { id: 'b_q11', text: '¿El trabajador da las indicaciones de manera correcta asegurándose que se les acaten?' },
      { id: 'b_q12', text: '¿El operador tiene conocimiento de sus productos, descuentos, productos BI e información necesaria para el correcto funcionamiento del sistema pdt?' },
      { id: 'b_q13', text: '¿El trabajador se asegura que su inventario esté ordenado y clasificado, respetando el sistema FIFO?' },
      { id: 'b_q14', text: '¿Delimita y asigna los lugares para sus productos, materiales y unidades?' },
      { id: 'b_q15', text: '¿Se asegura que tanto él como sus trabajadores realicen acciones seguras y cuiden sin cuidado el montacargas así como otras unidades o herramientas?' },
      { id: 'b_q16', text: '¿Se asegura que el personal realice una limpieza a la semana por lo menos de sus unidades?' },
      { id: 'b_q17', text: '¿Se asegura que los baños estén limpios y que la persona responsable los limpie de manera habitual?' },
      { id: 'b_q18', text: '¿Notifica a su jefe inmediato de cualquier problema o reporte que él se presente o que su personal le haga saber?' },
      { id: 'b_q19', text: '¿Lleva un reporte con evidencia de las mermas y devoluciones, notifica de manera inmediata a su superior?' },
    ]
  },
  {
    id: 'cierre',
    title: 'ACTIVIDADES AL CIERRE DE LA OPERACIÓN',
    color: 'purple',
    items: [
      { id: 'b_q20', text: '¿Se asegura que el envase devuelto esté en condiciones correctas y/o que su personal lo realice correctamente?' },
      { id: 'b_q21', text: '¿Realiza un reporte con envase devuelto, asegurando faltantes o sobrantes y documentando estos movimientos por escrito?' },
      { id: 'b_q22', text: '¿Se asegura que su personal o él mismo, revisan en todo momento que las rutas suban a sus unidades el producto pedido y las cantidades correctas, que se haga una inspección visual en todo momento, anotando y reportando a su jefe cualquier problema?' },
      { id: 'b_q23', text: '¿Realiza de manera correcta las liquidaciones y cualquier movimiento de efectivo, de manera segura y llevando un reporte de todos esos movimientos?' },
      { id: 'b_q24', text: '¿Realiza el pago de nóminas, servicios, cuotas y cualquier otro gasto debidamente así como resguardando la evidencia necesaria como respaldo?' },
      { id: 'b_q25', text: '¿Conoce y tiene un protocolo de seguridad y manejo de efectivo?' },
      { id: 'b_q26', text: '¿Realiza sus inventarios diariamente, sus reportes y documentación entregándolo en tiempo y forma?' },
    ]
  }
];

const SECTION_COLORS = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', head: [0, 130, 72] },
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', head: [37, 99, 235] },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', head: [126, 34, 206] },
};

export default function BodegaAuditPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('inicio_operacion');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  const empleadoSigRef = useRef(null);
  const auditorSigRef = useRef(null);

  const [auditData, setAuditData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    bodega: '',
    empleado_nombre: '',
    hora_inicio: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    auditor_nombre: user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || user?.email || '',
    respuestas: {},
    observaciones_generales: ''
  });

  useEffect(() => {
    const initRespuestas = () => {
      const initialResp = {};
      QUESTIONS.forEach(section => {
        section.items.forEach(item => {
          initialResp[item.id] = { val: null, obs: '' };
        });
      });
      setAuditData(prev => ({ ...prev, respuestas: initialResp }));
    };
    initRespuestas();
    checkPendingAudits();
  }, []);

  const checkPendingAudits = async () => {
    try {
      let keys = Capacitor.isNativePlatform()
        ? (await Preferences.getKeys()).keys
        : Object.keys(localStorage);
      setPendingCount(keys.filter(k => k.startsWith('pending_bodega_audit_')).length);
    } catch (e) { console.warn(e); }
  };

  const handleResponse = (id, val) => {
    setAuditData(prev => ({
      ...prev,
      respuestas: { ...prev.respuestas, [id]: { ...prev.respuestas[id], val } }
    }));
  };

  const handleObservation = (id, obs) => {
    setAuditData(prev => ({
      ...prev,
      respuestas: { ...prev.respuestas, [id]: { ...prev.respuestas[id], obs } }
    }));
  };

  const isSectionComplete = (sectionId) => {
    const section = QUESTIONS.find(s => s.id === sectionId);
    if (!section) return false;
    return section.items.every(item => auditData.respuestas[item.id]?.val !== null);
  };

  const totalItems = QUESTIONS.reduce((a, s) => a + s.items.length, 0);
  const answeredItems = Object.values(auditData.respuestas).filter(r => r.val !== null).length;
  const progress = totalItems > 0 ? Math.round((answeredItems / totalItems) * 100) : 0;

  const validateForm = () => {
    if (!auditData.empleado_nombre || !auditData.bodega) {
      toast({ title: 'Datos incompletos', description: 'Nombre del empleado y bodega son obligatorios.', variant: 'destructive' });
      return false;
    }
    const missing = Object.keys(auditData.respuestas).find(id => auditData.respuestas[id].val === null);
    if (missing) {
      toast({ title: 'Checklist incompleto', description: 'Por favor contesta todas las preguntas.', variant: 'destructive' });
      return false;
    }
    if (empleadoSigRef.current?.isEmpty()) {
      toast({ title: 'Firma faltante', description: 'El empleado debe firmar la auditoría.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const generatePDF = async (finalData, empleadoSig, auditorSig) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(0, 130, 72);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('CERVEZAS FINAS DE CIUDAD SERDÁN S.A. DE C.V.', pageWidth / 2, 11, { align: 'center' });
    doc.setFontSize(9);
    doc.text('CHECK-LIST DE TAREAS — ENCARGADO DE BODEGA', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(7);
    doc.text('Dpto. Control Interno-Auditorías', pageWidth / 2, 27, { align: 'center' });

    autoTable(doc, {
      startY: 33,
      body: [
        ['FECHA:', finalData.fecha, 'EMPLEADO:', finalData.empleado_nombre],
        ['BODEGA:', finalData.bodega, 'AUDITOR:', finalData.auditor_nombre],
      ],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 70 }, 2: { cellWidth: 22 }, 3: { cellWidth: 70 } }
    });

    let currentY = doc.lastAutoTable.finalY + 5;

    QUESTIONS.forEach((section, idx) => {
      const colors = [[0,130,72],[37,99,235],[126,34,206]];
      const [r,g,b] = colors[idx] || [100,100,100];
      doc.setFillColor(r, g, b);
      doc.rect(14, currentY, pageWidth - 28, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(section.title, 16, currentY + 4);

      const rows = section.items.map(item => [
        item.text,
        finalData.respuestas[item.id]?.val === 'si' ? 'SÍ' : 'NO',
        finalData.respuestas[item.id]?.obs || ''
      ]);

      autoTable(doc, {
        startY: currentY + 6,
        head: [['DESCRIPCIÓN', 'SI / NO', 'OBSERVACIONES']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [r, g, b], textColor: [255,255,255], fontSize: 6 },
        styles: { fontSize: 6, cellPadding: 1 },
        columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 15 }, 2: { cellWidth: 60 } }
      });
      currentY = doc.lastAutoTable.finalY + 3;
    });

    // Signatures
    currentY += 8;
    if (currentY > 255) { doc.addPage(); currentY = 20; }
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text('FIRMA DEL EMPLEADO', 55, currentY + 32, { align: 'center' });
    doc.line(30, currentY + 27, 80, currentY + 27);
    doc.addImage(empleadoSig, 'PNG', 35, currentY, 35, 22);

    doc.text('FIRMA DEL AUDITOR', 155, currentY + 32, { align: 'center' });
    doc.line(130, currentY + 27, 180, currentY + 27);
    if (auditorSig) doc.addImage(auditorSig, 'PNG', 135, currentY, 35, 22);

    return doc.output('blob');
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const empleadoSig = empleadoSigRef.current.getCanvas().toDataURL('image/png');
      const auditorSig = auditorSigRef.current?.isEmpty() ? null : auditorSigRef.current.getCanvas().toDataURL('image/png');
      const finalTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const fullData = { ...auditData, hora_termino: finalTime };

      const storageKey = `pending_bodega_audit_${Date.now()}`;
      await Preferences.set({ key: storageKey, value: JSON.stringify({ ...fullData, firma_empleado: empleadoSig, firma_auditor: auditorSig }) });

      try {
        const pdfBlob = await generatePDF(fullData, empleadoSig, auditorSig);
        const fileName = `bodega_audit_${Date.now()}.pdf`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(`auditorias/bodega/${fileName}`, pdfBlob);

        let publicUrl = null;
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(`auditorias/bodega/${fileName}`);
          publicUrl = urlData.publicUrl;
        }

        const { error: dbError } = await supabase.from('control_interno_audits').insert([{
          tipo: 'bodega',
          fecha: fullData.fecha,
          bodega: fullData.bodega,
          empleado_nombre: fullData.empleado_nombre,
          hora_inicio: fullData.hora_inicio,
          hora_termino: finalTime,
          auditor_id: user.id,
          auditor_nombre: fullData.auditor_nombre,
          respuestas: fullData.respuestas,
          observaciones_generales: fullData.observaciones_generales,
          firma_empleado: empleadoSig,
          firma_auditor: auditorSig,
          pdf_url: publicUrl
        }]);

        if (dbError) throw dbError;
        await Preferences.remove({ key: storageKey });
        setPdfUrl(publicUrl);
        toast({ title: '¡Guardado en la nube!', description: 'La auditoría de bodega se registró correctamente.' });
        setTimeout(() => setPdfUrl('done'), 2000);
      } catch (uploadErr) {
        console.warn('Offline, guardando localmente:', uploadErr);
        toast({ title: 'Modo Offline', description: 'Sin internet. Se guardará y sincronizará luego.', variant: 'warning' });
        setPendingCount(prev => prev + 1);
        setPdfUrl('offline');
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'No se pudo guardar la auditoría.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    const initialResp = {};
    QUESTIONS.forEach(s => s.items.forEach(item => { initialResp[item.id] = { val: null, obs: '' }; }));
    setAuditData({
      fecha: new Date().toISOString().split('T')[0],
      bodega: '',
      empleado_nombre: '',
      hora_inicio: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      auditor_nombre: user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || user?.email || '',
      respuestas: initialResp,
      observaciones_generales: ''
    });
    setPdfUrl(null);
    setActiveSection('inicio_operacion');
    empleadoSigRef.current?.clear();
    auditorSigRef.current?.clear();
  };

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <Helmet><title>Auditoría Encargado de Bodega | Cervezas Finas</title></Helmet>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6 px-4 pt-2">
        <div className="p-3 bg-emerald-500/20 rounded-2xl">
          <Warehouse className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Check-List Encargado de Bodega</h1>
          <p className="text-slate-400 text-sm">Auditoría de Control Interno — Tareas Operativas</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-4 mb-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>{answeredItems} de {totalItems} preguntas respondidas</span>
          <span className="font-bold text-emerald-400">{progress}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="mx-4 mb-6 p-4 bg-amber-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
            <div>
              <p className="text-amber-200 text-sm font-bold">{pendingCount} auditorías pendientes</p>
              <p className="text-amber-200/60 text-[10px]">Sin conexión al guardar.</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4 px-4">
        {/* Datos Generales */}
        <Card className="bg-slate-900/50 border-white/10">
          <CardHeader className="py-4 border-b border-white/5">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-400" /> Datos Generales
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Empleado (Encargado de Bodega)</Label>
              <Input
                placeholder="Nombre completo"
                value={auditData.empleado_nombre}
                onChange={e => setAuditData({ ...auditData, empleado_nombre: e.target.value })}
                className="bg-slate-950/50 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Bodega</Label>
              <Input
                placeholder="Nombre / Código de Bodega"
                value={auditData.bodega}
                onChange={e => setAuditData({ ...auditData, bodega: e.target.value })}
                className="bg-slate-950/50 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Fecha</Label>
              <div className="flex items-center gap-2 text-white text-sm bg-slate-950/50 p-2 rounded-md border border-white/5">
                <Calendar size={14} className="text-emerald-400" /> {auditData.fecha}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Auditor (Control Interno)</Label>
              <div className="flex items-center gap-2 text-white text-sm bg-slate-950/50 p-2 rounded-md border border-white/5">
                <User size={14} className="text-emerald-400" /> {auditData.auditor_nombre}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checklist Sections */}
        {QUESTIONS.map((section) => {
          const clr = SECTION_COLORS[section.color];
          const isOpen = activeSection === section.id;
          const complete = isSectionComplete(section.id);
          return (
            <Card key={section.id} className="bg-slate-900/50 border-white/10 overflow-hidden">
              <button
                onClick={() => setActiveSection(isOpen ? null : section.id)}
                className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${clr.bg} border ${clr.border}`}>
                    <ClipboardCheck className={`w-4 h-4 ${clr.text}`} />
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-widest ${clr.text}`}>{section.title}</span>
                  {complete && (
                    <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <CheckCircle2 size={10} className="text-emerald-400" />
                      <span className="text-[9px] font-bold text-emerald-400">COMPLETO</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {section.items.filter(i => auditData.respuestas[i.id]?.val !== null).length}/{section.items.length}
                  </span>
                  {isOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                </div>
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CardContent className="pt-4 space-y-5">
                      {section.items.map((item, idx) => {
                        const resp = auditData.respuestas[item.id];
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className="space-y-3 pb-4 border-b border-white/5 last:border-0"
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-[10px] font-bold text-slate-600 mt-0.5 w-5 shrink-0">{idx + 1}.</span>
                              <p className="text-sm text-slate-200 leading-relaxed">{item.text}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 pl-8">
                              <button
                                onClick={() => handleResponse(item.id, 'si')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                  resp?.val === 'si'
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-105'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                              >
                                <CheckCircle2 size={13} /> SÍ
                              </button>
                              <button
                                onClick={() => handleResponse(item.id, 'no')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                  resp?.val === 'no'
                                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/20 scale-105'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                              >
                                <AlertCircle size={13} /> NO
                              </button>
                              <Input
                                placeholder="Observación (opcional)..."
                                value={resp?.obs || ''}
                                onChange={e => handleObservation(item.id, e.target.value)}
                                className="bg-slate-950/30 border-white/5 text-xs h-8 flex-1 min-w-[150px]"
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}

        {/* Firmas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <Card className="bg-slate-900/50 border-white/10">
            <CardHeader className="py-3 border-b border-white/5 flex flex-row items-center justify-between">
              <CardTitle className="text-xs uppercase text-slate-400">Firma del Empleado *</CardTitle>
              <button onClick={() => empleadoSigRef.current?.clear()} className="text-slate-600 hover:text-white transition-colors">
                <Eraser size={14} />
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-white rounded-b-lg">
                <SignatureCanvas
                  ref={empleadoSigRef}
                  penColor="black"
                  canvasProps={{ className: 'w-full h-40' }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-white/10">
            <CardHeader className="py-3 border-b border-white/5 flex flex-row items-center justify-between">
              <CardTitle className="text-xs uppercase text-slate-400">Firma del Auditor (Opcional)</CardTitle>
              <button onClick={() => auditorSigRef.current?.clear()} className="text-slate-600 hover:text-white transition-colors">
                <Eraser size={14} />
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-white rounded-b-lg">
                <SignatureCanvas
                  ref={auditorSigRef}
                  penColor="black"
                  canvasProps={{ className: 'w-full h-40' }}
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
              onChange={e => setAuditData({ ...auditData, observaciones_generales: e.target.value })}
              className="bg-slate-950/50 border-white/10 text-white min-h-[100px]"
            />
          </CardContent>
        </Card>

        {/* Acción */}
        <div className="pt-6 flex flex-col gap-3">
          {!pdfUrl ? (
            <Button
              onClick={handleSave}
              disabled={loading || progress < 100}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-14 rounded-2xl text-lg font-bold shadow-xl shadow-emerald-600/20 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin mr-2 w-5 h-5" /> : <Save className="mr-2 w-5 h-5" />}
              {progress < 100 ? `Completa todas las preguntas (${progress}%)` : 'Finalizar y Guardar Auditoría'}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="text-emerald-400 w-6 h-6 shrink-0" />
                <p className="text-emerald-100 text-sm font-medium">
                  {pdfUrl === 'offline' ? 'Auditoría guardada localmente. Se sincronizará cuando haya internet.' : '¡Auditoría guardada exitosamente en la nube!'}
                </p>
              </div>
              {pdfUrl !== 'offline' && pdfUrl !== 'done' && (
                <Button asChild className="w-full bg-slate-800 hover:bg-slate-700 text-white h-12 rounded-2xl font-bold">
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 w-4 h-4" /> Descargar PDF
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={resetForm} className="w-full border-white/10 text-slate-400">
                Realizar otra auditoría
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
