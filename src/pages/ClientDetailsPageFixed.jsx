import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { getClientById, deleteClient, updateClient, getClientByCode } from '@/repositories/clientsRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Spinner from '@/components/Spinner';
import { Helmet } from 'react-helmet-async';
import ClientVisitsList from '@/components/ClientVisitsList';
import ClientEvaluationsList from '@/components/ClientEvaluationsList';
import ClientAssetsList from '@/components/ClientAssetsList';
import { Button } from '@/components/ui/button';
import {
  ShoppingCart,
  Building2,
  MapPin,
  Phone,
  Mail,
  Tag,
  TruckIcon,
  Award,
  Star,
  ArrowLeft,
  FileText,
  Loader2,
  Trash2,
  Edit,
  PenLine,
  RotateCcw,
  CheckCircle
} from 'lucide-react';
import { generateClientPdf } from '@/lib/pdfGenerator';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import ClientForm from '@/components/ClientForm';

function ClientDetailsPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useSupabaseAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  // State for code-transfer confirmation flow
  const [codeConflict, setCodeConflict] = useState(null); // { conflictingClient, pendingFormData }
  const [isTransferring, setIsTransferring] = useState(false);

  // Signature modal state
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const signatureCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPos = useRef(null);

  // Determine back path based on role
  const getBackPath = () => {
    if (!user) return '/clients';
    
    // Logic extracted from App.jsx to identify role
    const type = (user.user_metadata && user.user_metadata.type) || (user.user_metadata && user.user_metadata.role) || null;
    const appRoles = (user.app_metadata && user.app_metadata.roles) || [];
    const role = type || (appRoles.length ? appRoles[0] : null);
    const normalizedRole = (role || '').toString().trim().toLowerCase().replace(/_/g, ' ');

    switch (normalizedRole) {
      case 'admin':
      case 'administrador':
        return '/admin/clients';
      case 'supervisor':
        return '/supervisor/clients';
      case 'gerente':
      case 'gerencia':
        return '/gerente/clients';
      case 'autoventa':
      case 'chofer':
        return '/autoventa/clients';
      case 'coortrade':
        return '/coortrade/clients';
      case 'asesor-dinamico':
      case 'asesor dinamico':
        return '/asesor-dinamico/clientes';
      default:
        return '/clients';
    }
  };

  const backPath = getBackPath();

  const fetchClient = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const data = await getClientById(clientId);
      if (!data) throw new Error('Cliente no encontrado');

      // ── Validar que el cliente pertenece a la ruta/zona del usuario ──────────
      // Admin, sistemas, supervisor y gerente pueden ver cualquier cliente.
      const roleRaw = (user?.user_metadata?.type || user?.user_metadata?.role || '').toLowerCase();
      const isAdminLike = ['admin', 'administrador', 'sistemas', 'supervisor', 'gerente',
        'gerencia', 'control interno', 'control-interno', 'jefe operaciones'].some(r => roleRaw.includes(r));

      if (!isAdminLike && user) {
        const { detectUserRoute } = await import('@/repositories/routeRepository');
        const userRoute = await detectUserRoute(user);
        if (userRoute) {
          const norm = (v) => String(v || '').trim().toLowerCase();
          const clientRoutes = [data.sales_route, data.internal_route, data.ruta, data.route].map(norm);
          const hasAccess = clientRoutes.some(r => r && (r === norm(userRoute) || r.includes(norm(userRoute))));
          if (!hasAccess) {
            console.warn('[ClientDetails] Acceso denegado: cliente fuera de la ruta del usuario.');
            navigate(getBackPath(), { replace: true });
            return;
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      setClient(data);
    } catch (err) {
      console.error('Error fetching client:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  // Open signature modal instead of generating PDF directly
  const handleDownloadPdf = () => {
    if (!client) return;
    setHasSignature(false);
    setIsSignatureModalOpen(true);
    // Clear canvas after modal opens (needs a tick for ref to be ready)
    setTimeout(() => {
      const canvas = signatureCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }, 100);
  };

  // Canvas drawing helpers
  const getCanvasPos = useCallback((e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e) => {
    e.preventDefault();
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getCanvasPos(e, canvas);
  }, [getCanvasPos]);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pos = getCanvasPos(e, canvas);
    ctx.beginPath();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasSignature(true);
  }, [isDrawing, getCanvasPos]);

  const stopDrawing = useCallback((e) => {
    e?.preventDefault();
    setIsDrawing(false);
    lastPos.current = null;
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }, []);

  const generatePdfWithSignature = async () => {
    if (!client) return;
    setPdfLoading(true);
    setIsSignatureModalOpen(false);
    toast({ title: 'Generando PDF...', description: 'Preparando hoja de alta premium.' });
    try {
      let signatureDataUrl = null;
      if (hasSignature && signatureCanvasRef.current) {
        signatureDataUrl = signatureCanvasRef.current.toDataURL('image/png');
      }
      const pdfResult = await generateClientPdf(client, signatureDataUrl);

      if (pdfResult?.success) {
        if (pdfResult.uri) {
          toast({
            title: pdfResult.shared !== false ? 'PDF Compartido' : 'PDF Guardado',
            description: pdfResult.shared !== false
              ? `Se compartió ${pdfResult.filename}`
              : `Archivo guardado en caché: ${pdfResult.filename}`
          });
        } else {
          toast({ title: 'PDF Generado', description: 'La descarga ha comenzado.' });
        }
      } else {
        toast({
          title: 'Error al generar PDF',
          description: pdfResult?.error || 'No se pudo generar el PDF.',
          variant: 'destructive'
        });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudo generar el PDF.', variant: 'destructive' });
    } finally {
      setPdfLoading(false);
    }
  };



  const handleUpdate = async (formData) => {
    const newCode = (formData.client_code || '').trim();
    const oldCode = (client.client_code || '').trim();

    // If the code changed, check if it belongs to another client
    if (newCode && newCode !== oldCode) {
      try {
        const existing = await getClientByCode(newCode);
        if (existing && String(existing.id) !== String(clientId)) {
          // Code belongs to a different client — ask user to confirm transfer
          setCodeConflict({ conflictingClient: existing, pendingFormData: formData });
          return; // Pause until user decides
        }
      } catch (e) {
        // Not found or error — proceed normally
      }
    }

    await doSave(formData);
  };

  const doSave = async (formData) => {
    try {
      await updateClient(clientId, formData);
      toast({ title: 'Cliente actualizado', description: 'Los cambios se han guardado correctamente.' });
      setIsEditDialogOpen(false);
      fetchClient();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudo actualizar el cliente.', variant: 'destructive' });
    }
  };

  const handleConfirmTransfer = async () => {
    if (!codeConflict) return;
    setIsTransferring(true);
    try {
      // 1. Clear the code from the conflicting client
      await updateClient(codeConflict.conflictingClient.id, { client_code: null });
      // 2. Save the current client with the transferred code
      await doSave(codeConflict.pendingFormData);
      toast({
        title: 'Código transferido',
        description: `El código fue desasignado de "${codeConflict.conflictingClient.business_name || codeConflict.conflictingClient.name}" y asignado a este cliente.`
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error al transferir', description: e.message, variant: 'destructive' });
    } finally {
      setCodeConflict(null);
      setIsTransferring(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteClient(clientId);
      toast({ title: 'Cliente eliminado', description: 'El cliente ha sido eliminado correctamente.' });
      navigate('/clients');
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudo eliminar el cliente.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
  }

  if (error) {
    return <div className="text-red-500 text-center mt-8">Error: {error}</div>;
  }

  if (!client) {
    return <div className="text-center mt-8">Cliente no encontrado.</div>;
  }

  // Helper para obtener badge de nivel
  const getLevelBadge = (level) => {
    const badges = {
      'ORO': { color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: '🥇' },
      'PLATA': { color: 'bg-gray-100 text-gray-800 border-gray-300', icon: '🥈' },
      'BRONCE': { color: 'bg-amber-100 text-amber-800 border-amber-300', icon: '🥉' },
      'PLATINO': { color: 'bg-slate-100 text-slate-800 border-slate-300', icon: '💎' },
      'TITANIO': { color: 'bg-blue-100 text-blue-900 border-blue-300', icon: '⚡' }
    };
    const badge = badges[level?.toUpperCase()] || badges['BRONCE'];
    return badge;
  };

  const levelBadge = getLevelBadge(client.level);

  return (
    <div className="min-h-screen bg-gray-950">
      <Helmet>
        <title>Detalles de {client.name}</title>
      </Helmet>

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4 py-8">
          <Link to={backPath}>
            <Button variant="ghost" className="text-white hover:bg-blue-700 mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Clientes
            </Button>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/10 backdrop-blur-sm rounded-xl">
                <Building2 className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold">{client.business_name || client.name}</h1>
                <p className="text-blue-100 text-sm mt-1">
                  {client.name} • {client.client_code || 'Sin código'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {/* Edit Button */}
              <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20">
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-white">Editar Cliente</DialogTitle>
                    <DialogDescription className="text-gray-400">
                      Modifique el código de cliente. Los demás campos son de solo lectura.
                    </DialogDescription>
                  </DialogHeader>
                  <ClientForm initialData={client} onSubmit={handleUpdate} />
                </DialogContent>
              </Dialog>

              {/* Delete Button REMOVED as per request */}

              {/* PDF Download Button */}
              <Button
                variant="secondary"
                className="bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
              >
                {pdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Descargar Hoja
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Nivel */}
          <Card className="bg-gray-900 border-2 border-yellow-500/30 hover:border-yellow-500/50 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-2">Nivel GEC</p>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 ${levelBadge.color} font-semibold text-base`}>
                    <span>{levelBadge.icon}</span>
                    <span>{client.level || 'N/A'}</span>
                  </div>
                </div>
                <Award className="h-10 w-10 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          {/* Tipo */}
          <Card className="bg-gray-900 border-2 border-blue-500/30 hover:border-blue-500/50 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-2">Tipo de Cliente</p>
                  <p className="text-lg font-semibold capitalize text-white">{client.client_type || 'N/A'}</p>
                </div>
                <Building2 className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          {/* Exclusividad */}
          <Card className="bg-gray-900 border-2 border-green-500/30 hover:border-green-500/50 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-2">Condición</p>
                  <p className="text-lg font-semibold text-white">{client.exclusivity || 'N/A'}</p>
                </div>
                <Star className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Información Detallada */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Información de Contacto */}
          <Card className="bg-gray-900 border-2 border-green-500/30">
            <CardHeader className="border-b border-gray-800">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Phone className="h-5 w-5 text-green-500" />
                Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 mb-1">Teléfono</p>
                  <p className="font-medium text-white">{client.phone || 'No disponible'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 mb-1">Email</p>
                  <p className="font-medium text-sm text-white break-all">{client.email || '[email protected]'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 mb-1">Dirección Completa</p>
                  <p className="font-medium text-sm text-white">{client.address || 'No disponible'}</p>
                  {client.colony && <p className="text-xs text-gray-400 mt-1">Col. {client.colony} CP {client.postal_code}</p>}
                  {client.cross_street && <p className="text-xs text-gray-400">Entre: {client.cross_street}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información Comercial y Fiscal */}
          <Card className="bg-gray-900 border-2 border-blue-500/30">
            <CardHeader className="border-b border-gray-800">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Tag className="h-5 w-5 text-blue-500" />
                Comercial y Fiscal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <p className="text-xs text-gray-400 mb-1">Datos Fiscales</p>
                <div className="p-2 bg-slate-800/50 rounded border border-slate-700">
                  <p className="font-mono text-sm text-white">{client.rfc || 'Sin RFC'}</p>
                  <p className="text-xs text-gray-300 truncate">{client.fiscal_name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Código</p>
                  <p className="font-medium font-mono text-white">{client.client_code || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Zona</p>
                  <p className="font-medium text-white">{client.zona_comercial || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configuración de Venta */}
          <Card className="bg-gray-900 border-2 border-indigo-500/30">
            <CardHeader className="border-b border-gray-800">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <TruckIcon className="h-5 w-5 text-indigo-500" />
                Logística y Venta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Modalidad</p>
                  <p className="font-medium text-white">{client.sales_modality || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Ritmo</p>
                  <p className="font-medium text-white">{client.ritmo || '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Rutas</p>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-indigo-900/50 rounded text-xs border border-indigo-500/30 text-indigo-200">Venta: {client.sales_route || 'N/A'}</span>
                  <span className="px-2 py-1 bg-purple-900/50 rounded text-xs border border-purple-500/30 text-purple-200">Conq: {client.internal_route || 'N/A'}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Días de Visita</p>
                <p className="text-xs text-white">{client.visit_days ? String(client.visit_days).split(',').join(', ') : 'No asignados'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Equipos, Visitas y Evaluaciones */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ClientAssetsList client_id={clientId} />
          <ClientVisitsList client_id={clientId} />
          <ClientEvaluationsList client_id={clientId} />
        </div>
      </div>

      {/* Code Transfer Confirmation Dialog */}
      <AlertDialog open={!!codeConflict} onOpenChange={(open) => { if (!open) setCodeConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Código ya asignado a otro cliente</AlertDialogTitle>
            <AlertDialogDescription>
              El código <strong className="text-white font-mono">{codeConflict?.pendingFormData?.client_code}</strong> pertenece actualmente a{' '}
              <strong className="text-white">"{codeConflict?.conflictingClient?.business_name || codeConflict?.conflictingClient?.name}"</strong>.
              <br /><br />
              ¿Deseas quitar el código de ese cliente y asignárselo a <strong className="text-white">"{client?.business_name || client?.name}"</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCodeConflict(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmTransfer}
              disabled={isTransferring}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {isTransferring ? 'Transfiriendo...' : 'Sí, transferir código'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Signature Modal */}
      <Dialog open={isSignatureModalOpen} onOpenChange={setIsSignatureModalOpen}>
        <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <PenLine className="h-5 w-5 text-emerald-400" />
              Firma del Solicitante
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Dibuja la firma del solicitante en el área de abajo. Puedes omitirla y generar el PDF sin firma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Signature canvas */}
            <div className="relative border-2 border-dashed border-gray-600 rounded-lg overflow-hidden bg-white">
              <canvas
                ref={signatureCanvasRef}
                width={400}
                height={160}
                className="w-full touch-none cursor-crosshair block"
                style={{ background: '#ffffff' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              {!hasSignature && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-gray-400 text-sm select-none">Firma aquí...</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={clearSignature}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Limpiar
              </Button>
              {hasSignature && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Firma capturada
                </span>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={generatePdfWithSignature}
              className="text-gray-400 hover:text-gray-200"
              disabled={pdfLoading}
            >
              {pdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sin firma
            </Button>
            <Button
              onClick={generatePdfWithSignature}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={pdfLoading}
            >
              {pdfLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClientDetailsPage;
