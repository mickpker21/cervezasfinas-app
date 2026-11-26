import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { fetchVentasPorSku } from '@/lib/mysqlVentasPorSku';
import { Newspaper, Download, Smartphone, Upload, FileText, Users } from 'lucide-react';
import { APP_CURRENT_VERSION, getDisplayAppVersion } from '@/services/updateService';

const SALES_EXPORT_COLUMNS = [
  'id', 'period_date', 'ruta', 'cve_cliente', 'client_id', 'num_remision', 'cve_venta',
  'cve_marca', 'unidades', 'unidades_obsequio', 'precio_venta_marca', 'descuento',
  'sobreprecio_ingreso', 'sobreprecio_abono', 'ieps_venta', 'iva_venta', 'ruta_express',
  'fecha_alta', 'sobreprecio_ahorro', 'sobreprecio_np', 'sobreprecio_envase',
  'precio_compra_marca', 'ieps_compra', 'iva_compra', 'margen_operacion',
  'importe_margen_operacion', 'venta', 'descuento_col', 'sp', 'htls', 'htls_total',
  'vta_cajas', 'producto', 'created_at', 'zona', 'updated_at', 'ruta_resuelta', 'zona_u'
];

const isYYYYMM = (value) => /^\d{4}-\d{2}$/.test(String(value || ''));
const startFromYYYYMM = (ym) => (isYYYYMM(ym) ? `${ym}-01` : null);
const nextFromYYYYMM = (ym) => {
  if (!isYYYYMM(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const UtilidadesPage = () => {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [boletines, setBoletines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [downloadPeriod, setDownloadPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [downloadZona, setDownloadZona] = useState('');
  const [downloadingSales, setDownloadingSales] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [showIosGuide, setShowIosGuide] = useState(false);

  const downloadPeriodRange = useMemo(() => {
    if (!isYYYYMM(downloadPeriod)) return null;
    return {
      from: startFromYYYYMM(downloadPeriod),
      nextFrom: nextFromYYYYMM(downloadPeriod)
    };
  }, [downloadPeriod]);

  useEffect(() => {
    if (user) {
      const rawType =
        user?.user_metadata?.type ||
        user?.user_metadata?.role ||
        (user?.app_metadata?.roles && user.app_metadata.roles[0]) ||
        user?.raw_app_meta_data?.role ||
        user?.raw_user_meta_data?.type ||
        user?.role ||
        '';
      const role = String(rawType || '').toLowerCase().trim();
      setIsAdmin(role === 'admin' || role === 'administrador');
    }
  }, [user]);

  const fetchBoletines = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('boletines')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBoletines(data);
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar los boletines.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoletines();
  }, [fetchBoletines]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !title) {
      toast({ title: 'Error', description: 'Por favor, completa todos los campos.', variant: 'destructive' });
      return;
    }

    try {
      setUploading(true);
      const fileName = `${uuidv4()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('boletines')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('boletines')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase.from('boletines').insert([
        {
          title,
          file_name: file.name,
          file_path: publicUrlData.publicUrl,
          user_id: user.id,
        },
      ]);

      if (insertError) throw insertError;

      toast({ title: 'Éxito', description: 'Archivo subido correctamente.' });
      setTitle('');
      setFile(null);
      fetchBoletines();
    } catch (error) {
      toast({ title: 'Error', description: 'Hubo un error al subir el archivo.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadSalesCsv = useCallback(async () => {
    if (!downloadPeriodRange?.from || !downloadPeriodRange?.nextFrom) {
      setDownloadStatus('Selecciona un período válido (YYYY-MM).');
      return;
    }
    setDownloadingSales(true);
    setDownloadStatus('');
    try {
      const rowsAll = await fetchVentasPorSku({
        from: downloadPeriodRange.from,
        nextFrom: downloadPeriodRange.nextFrom,
        zona: downloadZona.trim() || undefined,
      });
      const rows = rowsAll || [];
      if (!rows.length) {
        setDownloadStatus('No hay ventas registradas para ese período.');
        return;
      }
      const toCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        return `"${String(value).replace(/"/g, '""')}"`;
      };
      const csvLines = [SALES_EXPORT_COLUMNS.join(',')];
      rows.forEach((row) => {
        csvLines.push(SALES_EXPORT_COLUMNS.map((key) => toCsvValue(row?.[key])).join(','));
      });
      const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const zonaLabel = downloadZona.trim() ? downloadZona.trim() : 'todas';
      const baseName = `ventas_${downloadPeriod}_${zonaLabel}`;
      const fileName = baseName.replace(/[^a-zA-Z0-9._-]+/g, '_') + '.csv';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      setDownloadStatus(`Archivo generado con ${rows.length} filas.`);
    } catch (error) {
      console.error(error);
      setDownloadStatus('No pudimos generar el archivo. Intenta nuevamente.');
    } finally {
      setDownloadingSales(false);
    }
  }, [downloadPeriodRange, downloadZona, downloadPeriod]);

  const handleDownload = async (filePath) => {
    try {
      const { data, error } = await supabase.storage.from('boletines').download(filePath.split('boletines/')[1]);
      if (error) throw error;
      const blob = new Blob([data], { type: data.type });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('-').slice(1).join('-');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo descargar el archivo.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-3xl font-bold text-white mb-6">Utilidades</h1>

      <div className="grid gap-6 md:grid-cols-3">
        {/* APK DOWNLOAD SECTION */}
        <Card className="heineken-card border-emerald-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              <Smartphone className="w-5 h-5" />
              Aplicación Android
            </CardTitle>
            <CardDescription>
              Descarga la última versión de la App (APK) para instalar en tu dispositivo.
              <br/>
              <span className="font-mono text-emerald-500 mt-1 inline-block">Versión Instalada: v{getDisplayAppVersion()}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
            <div className="p-4 bg-emerald-500/10 rounded-full">
              <Smartphone className="w-12 h-12 text-emerald-500" />
            </div>
            <div className="text-center w-full">
              <p className="text-sm text-slate-400 mb-4">Asegúrate de permitir la instalación desde fuentes desconocidas.</p>
              <Button 
                size="lg" 
                className="heineken-button w-full"
                onClick={async () => {
                  try {
                    // 1. Try Supabase global_settings first
                    const { data } = await supabase.from('global_settings').select('value').eq('key', 'latest_apk_version').single();
                    if (data?.value) {
                      const apk = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                      if (apk.url) { window.open(apk.url, '_blank'); return; }
                    }
                  } catch (e) {}
                  try {
                    // 2. Try version.json on Hostinger
                    const res = await fetch(`/apps/version.json?_t=${Date.now()}`, { cache: 'no-store' });
                    if (res.ok) {
                      const manifest = await res.json();
                      if (manifest.url) { window.open(manifest.url, '_blank'); return; }
                    }
                  } catch (e) {}
                  // 3. Fallback to fixed name
                  window.open('/apps/cervezas-finas.apk', '_blank');
                }}
              >
                <Download className="w-5 h-5 mr-2" />
                Descargar APK (Android)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* IOS DOWNLOAD SECTION */}
        <Card className="heineken-card border-cyan-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-400">
              <Smartphone className="w-5 h-5" />
              Aplicación iOS (iPhone / iPad)
            </CardTitle>
            <CardDescription>
              Descarga el paquete nativo (.IPA) o instala directo en la pantalla de inicio de tu iPhone.
              <br/>
              <span className="font-mono text-cyan-400 mt-1 inline-block">Versión iOS: v{APP_CURRENT_VERSION}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
            <div className="p-4 bg-cyan-500/10 rounded-full">
              <Smartphone className="w-12 h-12 text-cyan-400" />
            </div>
            <div className="text-center w-full space-y-2.5">
              <p className="text-sm text-slate-400 mb-2">
                Compatible con iPhone y iPad (iOS 15.5 o superior) con actualizaciones OTA.
              </p>
              <Button
                size="lg"
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                onClick={async () => {
                  try {
                    const { data } = await supabase.from('global_settings').select('value').eq('key', 'latest_ipa_version').single();
                    if (data?.value) {
                      const ipa = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                      if (ipa.url) { window.open(ipa.url, '_blank'); return; }
                    }
                  } catch (e) {}
                  try {
                    const res = await fetch(`/apps/version-ios.json?_t=${Date.now()}`, { cache: 'no-store' });
                    if (res.ok) {
                      const manifest = await res.json();
                      if (manifest.url) { window.open(manifest.url, '_blank'); return; }
                    }
                  } catch (e) {}
                  try {
                    const headRes = await fetch('/apps/cervezas-finas.ipa', { method: 'HEAD' });
                    if (headRes.ok && !(headRes.headers.get('content-type') || '').includes('text/html')) {
                      window.open('/apps/cervezas-finas.ipa', '_blank');
                      return;
                    }
                  } catch (e) {}
                  window.open('https://github.com/mickpker21/cervezasfinas-app/releases/download/ios-latest/CervezasFinasCRM-iOS.ipa', '_blank');
                }}
              >
                <Download className="w-5 h-5 mr-2" />
                Descargar IPA (iPhone / iPad)
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowIosGuide((v) => !v)}
                className="w-full border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-xs"
              >
                {showIosGuide ? 'Ocultar pasos de instalación en iPhone' : '¿Cómo instalar desde mi iPhone?'}
              </Button>

              {showIosGuide && (
                <div className="mt-2 p-3 rounded-xl bg-slate-950/90 border border-cyan-500/30 text-left text-xs text-slate-300 space-y-2">
                  <div>
                    <p className="font-bold text-cyan-400">Opción A — Instalar directo desde Safari (Sin cables):</p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-[11px] text-slate-300 mt-1">
                      <li>Abre esta página en <strong>Safari</strong> desde tu iPhone.</li>
                      <li>Toca el icono <strong>Compartir [↑]</strong> en la barra inferior.</li>
                      <li>Elige <strong>&quot;Agregar a inicio&quot;</strong> y toca <strong>Agregar</strong>.</li>
                    </ol>
                  </div>
                  <div className="pt-1.5 border-t border-white/10">
                    <p className="font-bold text-emerald-400">Opción B — Instalar archivo .IPA nativo:</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Descarga el botón <strong>Descargar IPA</strong> de arriba e instálalo con <strong>Sideloadly</strong> (desde PC), <strong>AltStore</strong> o <strong>Scarlet/Feather</strong> en tu iPhone.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SALES EXPORT SECTION */}
        <Card className="heineken-card border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-400">
              <FileText className="w-5 h-5" />
              Exportar Ventas
            </CardTitle>
            <CardDescription>Generar archivo CSV de ventas por período y zona.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">Período (YYYY-MM)</label>
                <Input
                  type="month"
                  className="bg-slate-800 border-white/10 text-white"
                  value={isYYYYMM(downloadPeriod) ? downloadPeriod : ''}
                  onChange={(e) => setDownloadPeriod(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">Zona (opcional)</label>
                <Input
                  placeholder="Ej. OAXACA"
                  className="bg-slate-800 border-white/10 text-white"
                  value={downloadZona}
                  onChange={(e) => setDownloadZona(e.target.value)}
                />
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleDownloadSalesCsv}
                disabled={downloadingSales || !downloadPeriodRange}
              >
                {downloadingSales ? 'Generando...' : 'Descargar CSV'}
              </Button>
            </div>
            {downloadStatus && (
              <p className="text-xs text-blue-400 text-center">{downloadStatus}</p>
            )}
          </CardContent>
        </Card>

        {/* DIRECTORY SECTION */}
        <Card className="heineken-card border-cyan-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-400">
              <Users className="w-5 h-5" />
              Directorio de Empleados
            </CardTitle>
            <CardDescription>Consulta la información de contacto y posición de todos los colaboradores.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
            <div className="p-4 bg-cyan-500/10 rounded-full">
              <Users className="w-12 h-12 text-cyan-500" />
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-4">Busca por nombre, departamento o puesto. Incluye jefe directo.</p>
              <Button 
                size="lg" 
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold"
                onClick={() => navigate('/directorio')}
              >
                <Users className="w-5 h-5 mr-2" />
                Ver Directorio
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card className="heineken-card border-purple-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-400">
              <Upload className="w-5 h-5" />
              Gestión de Archivos / Boletines
            </CardTitle>
            <CardDescription>Sube nuevos comunicados o archivos de utilidad para la fuerza de venta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  type="text"
                  placeholder="Título del archivo o boletín"
                  className="bg-slate-800 border-white/10 text-white"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={uploading}
                />
                <Input
                  type="file"
                  className="bg-slate-800 border-white/10 text-white"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white" disabled={uploading}>
                  {uploading ? 'Subiendo...' : 'Publicar Archivo'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-emerald-500" />
          Boletines y Documentos Recientes
        </h2>
        
        {loading ? (
          <p className="text-slate-500">Cargando archivos...</p>
        ) : boletines.length === 0 ? (
          <p className="text-slate-500 text-sm">No hay documentos publicados.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {boletines.map((boletin) => (
              <Card key={boletin.id} className="bg-slate-900 border-white/5 hover:border-emerald-500/50 transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-white">{boletin.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500 mb-4 truncate">{boletin.file_name}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-white/10 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/30"
                    onClick={() => handleDownload(boletin.file_path)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UtilidadesPage;
