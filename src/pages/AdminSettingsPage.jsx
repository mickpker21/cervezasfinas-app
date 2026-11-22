
import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';
import { APP_CURRENT_VERSION } from '@/services/updateService';
import { Save, Mail, Database, Download, Upload, Smartphone, UploadCloud, CheckCircle2, AlertTriangle, Info, Loader2, Package, ImageIcon } from 'lucide-react';

function bumpVersion(version) {
  if (!version) return '1.0.1';
  const parts = version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

const AdminSettingsPage = () => {
  const { user, roleType } = useSupabaseAuth();

  // 🛡️ SECURITY GUARD: Exclusivo para administradores y sistemas
  const rawRole = roleType || user?.profile?.role || user?.user_metadata?.type || user?.user_metadata?.role || '';
  const normalizedRole = rawRole.toString().trim().toLowerCase().replace(/[_-]/g, ' ');
  const isAdmin = normalizedRole === 'admin' || normalizedRole === 'administrador' || normalizedRole === 'sistemas';

  if (user && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const { toast } = useToast();
  const [notificationEmail, setNotificationEmail] = useState('');
  const [kioskPin, setKioskPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPin, setSavingPin] = useState(false);

  // OTA Updates State
  const [otaVersion, setOtaVersion] = useState('');
  const [otaFile, setOtaFile] = useState(null);
  const [uploadingOta, setUploadingOta] = useState(false);
  const [currentOta, setCurrentOta] = useState(null);

  // APK Upload State
  const [apkFile, setApkFile] = useState(null);
  const [apkNotes, setApkNotes] = useState('');
  const [uploadingApk, setUploadingApk] = useState(false);
  const [currentApk, setCurrentApk] = useState(null);

  // Wallpaper State
  const [homeWpFile, setHomeWpFile] = useState(null);
  const [lockWpFile, setLockWpFile] = useState(null);
  const [uploadingWp, setUploadingWp] = useState(false);
  const [currentHomeWp, setCurrentHomeWp] = useState(null);
  const [currentLockWp, setCurrentLockWp] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      setLoading(true);
      const { data } = await supabase
        .from('user_settings')
        .select('notification_email')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data && data.notification_email) {
        setNotificationEmail(data.notification_email);
      }

      const { data: globalData, error: globalError } = await supabase
        .from('global_settings')
        .select('value, key')
        .in('key', ['kiosk_pin', 'latest_ota_version', 'latest_apk_version', 'corporate_wallpaper_home', 'corporate_wallpaper_lock']);
      
      if (globalData) {
        globalData.forEach(item => {
          if (item.key === 'kiosk_pin') setKioskPin(String(item.value));
          if (item.key === 'latest_ota_version') {
            try {
              const parsed = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
              setCurrentOta(parsed);
              setOtaVersion(bumpVersion(parsed.version));
            } catch (e) {}
          }
          if (item.key === 'latest_apk_version') {
            try {
              const parsed = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
              setCurrentApk(parsed);
            } catch (e) {}
          }
          if (item.key === 'corporate_wallpaper_home') setCurrentHomeWp(item.value);
          if (item.key === 'corporate_wallpaper_lock') setCurrentLockWp(item.value);
        });
        
        // Ensure ota version is set if missing
        if (!globalData.find(i => i.key === 'latest_ota_version')) {
          setOtaVersion(bumpVersion(APP_CURRENT_VERSION));
        }
      } else if (globalError && globalError.code !== 'PGRST116') {
        console.error('Error fetching global settings:', globalError);
      }

      setLoading(false);
    };
    fetchSettings();
  }, [user]);

  const handleSaveSettings = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, notification_email: notificationEmail }, { onConflict: 'user_id' });
    if (!error) {
      toast({ title: '¡Configuración guardada!', description: 'El correo para notificaciones ha sido actualizado.' });
    } else {
      toast({ title: 'Error', description: 'No se pudo guardar la configuración.' });
    }
  };

  const handleSaveKioskPin = async () => {
    if (!kioskPin || kioskPin.trim() === '') {
      toast({ title: 'Error', description: 'El PIN no puede estar vacío.', variant: 'destructive' });
      return;
    }
    setSavingPin(true);
    const { error } = await supabase.from('global_settings').upsert({ key: 'kiosk_pin', value: kioskPin });
    setSavingPin(false);
    if (!error) {
      toast({ title: '¡PIN Actualizado!', description: 'El PIN del Kiosco de Asistencia ha sido modificado.' });
    } else {
      toast({ title: 'Error', description: 'No se pudo guardar el PIN.', variant: 'destructive' });
    }
  };

  // ─── OTA Upload ───
  const handleUploadOta = async () => {
    if (!otaVersion || !otaFile) {
      toast({ title: 'Error', description: 'Debes proporcionar una versión y un archivo ZIP.', variant: 'destructive' });
      return;
    }
    if (!otaFile.name.endsWith('.zip')) {
      toast({ title: 'Error', description: 'El archivo debe ser un .zip', variant: 'destructive' });
      return;
    }
    setUploadingOta(true);
    try {
      const fileName = `update-${otaVersion}-${Date.now()}.zip`;
      const { error: uploadError } = await supabase.storage
        .from('app-updates')
        .upload(fileName, otaFile, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error('El bucket "app-updates" no existe en Supabase Storage. Créalo y hazlo público.');
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage.from('app-updates').getPublicUrl(fileName);
      const otaPayload = { version: otaVersion, url: publicUrl, date: new Date().toISOString() };
      const { error: dbError } = await supabase.from('global_settings').upsert({ key: 'latest_ota_version', value: otaPayload });
      if (dbError) throw dbError;

      setCurrentOta(otaPayload);
      setOtaVersion(bumpVersion(otaVersion));
      setOtaFile(null);
      document.getElementById('ota-file').value = '';
      toast({ title: '¡Actualización OTA Publicada!', description: `v${otaVersion} se descargará en los dispositivos.`, className: "bg-emerald-600 text-white" });
    } catch (err) {
      console.error('OTA Upload Error:', err);
      toast({ title: 'Error subiendo OTA', description: err.message || 'Error desconocido', variant: 'destructive', duration: 8000 });
    } finally {
      setUploadingOta(false);
    }
  };

  // ─── APK Upload to Hostinger ───
  const handleUploadApk = async () => {
    if (!apkFile) {
      toast({ title: 'Error', description: 'Selecciona un archivo APK.', variant: 'destructive' });
      return;
    }
    if (!apkFile.name.endsWith('.apk')) {
      toast({ title: 'Error', description: 'El archivo debe ser un .apk', variant: 'destructive' });
      return;
    }
    setUploadingApk(true);
    try {
      const formData = new FormData();
      formData.append('apk', apkFile);
      formData.append('version', APP_CURRENT_VERSION);
      formData.append('notes', apkNotes || `Versión ${APP_CURRENT_VERSION}`);
      formData.append('force', 'false');

      const res = await fetch('https://cervezasfinas.com/api/upload_apk.php', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer cf-apk-upload-2026-secret' },
        body: formData
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);

      // Save metadata to Supabase too for the dashboard card
      const apkPayload = result.version || {
        version: APP_CURRENT_VERSION,
        url: `https://cervezasfinas.com/apps/cervezas-finas.apk`,
        notes: apkNotes || `Versión ${APP_CURRENT_VERSION}`,
        date: new Date().toISOString(),
        size: (apkFile.size / 1024 / 1024).toFixed(1) + ' MB'
      };
      await supabase.from('global_settings').upsert({ key: 'latest_apk_version', value: apkPayload });

      setCurrentApk(apkPayload);
      setApkFile(null);
      setApkNotes('');
      document.getElementById('apk-file').value = '';
      toast({ title: '¡APK Publicada en Hostinger!', description: `v${APP_CURRENT_VERSION} lista para descarga.`, className: "bg-emerald-600 text-white" });
    } catch (err) {
      console.error('APK Upload Error:', err);
      toast({ title: 'Error subiendo APK', description: err.message || 'Error desconocido', variant: 'destructive', duration: 8000 });
    } finally {
      setUploadingApk(false);
    }
  };

  // ─── Wallpaper Upload ───
  const handleUploadWallpaper = async (type) => {
    const file = type === 'home' ? homeWpFile : lockWpFile;
    if (!file) {
      toast({ title: 'Error', description: 'Selecciona una imagen primero.', variant: 'destructive' });
      return;
    }
    setUploadingWp(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `wallpapers/corporate_${type}_${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('app-updates')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('app-updates').getPublicUrl(fileName);
      
      const key = `corporate_wallpaper_${type}`;
      await supabase.from('global_settings').upsert({ key, value: publicUrl });

      if (type === 'home') {
        setCurrentHomeWp(publicUrl);
        setHomeWpFile(null);
        document.getElementById('wp-home-file').value = '';
      } else {
        setCurrentLockWp(publicUrl);
        setLockWpFile(null);
        document.getElementById('wp-lock-file').value = '';
      }

      toast({ title: '¡Fondo Actualizado!', description: `El fondo de ${type === 'home' ? 'inicio' : 'bloqueo'} se descargará en los teléfonos automáticamente.`, className: "bg-emerald-600 text-white" });
    } catch (err) {
      console.error('Wallpaper Upload Error:', err);
      toast({ title: 'Error', description: err.message || 'Error al subir la imagen', variant: 'destructive' });
    } finally {
      setUploadingWp(false);
    }
  };

  const otaIsNewer = currentOta?.version && otaVersion && (() => {
    const r = otaVersion.split('.').map(Number);
    const l = currentOta.version.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((r[i]||0) > (l[i]||0)) return true;
      if ((r[i]||0) < (l[i]||0)) return false;
    }
    return false;
  })();

  return (
    <>
      <Helmet>
        <title>Configuración - Admin</title>
        <meta name="description" content="Página de configuración para administradores." />
      </Helmet>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-white">Configuración del Sistema</h1>
          <p className="text-green-200 mt-1">Ajusta las configuraciones generales de la aplicación.</p>
        </motion.div>

        {/* Notifications */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="heineken-card">
            <CardHeader>
              <CardTitle className="flex items-center text-white"><Mail className="mr-3 text-green-400" />Configuración de Notificaciones</CardTitle>
              <CardDescription className="text-green-200">Correo electrónico para notificaciones de nuevos clientes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notification-email" className="text-white">Correo de Notificación</Label>
                <Input id="notification-email" type="email" placeholder="admin@cervezasfinas.com" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} className="heineken-input" disabled={loading} />
              </div>
              <Button onClick={handleSaveSettings} className="heineken-button" disabled={loading}>
                <Save className="w-4 h-4 mr-2" />{loading ? 'Guardando...' : 'Guardar Correo'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Kiosk */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="heineken-card border-orange-500/30">
            <CardHeader>
              <CardTitle className="flex items-center text-white"><Database className="mr-3 text-orange-400" />Seguridad del Kiosco</CardTitle>
              <CardDescription className="text-orange-200">PIN maestro para el Kiosco de Asistencia (RRHH).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="kiosk-pin" className="text-white">PIN del Kiosco</Label>
                <Input id="kiosk-pin" type="text" placeholder="Ej: 56765" value={kioskPin} onChange={(e) => setKioskPin(e.target.value)} className="heineken-input font-mono text-lg tracking-widest" disabled={loading || savingPin} maxLength={10} />
              </div>
              <Button onClick={handleSaveKioskPin} className="bg-orange-600 hover:bg-orange-700 text-white border-0" disabled={loading || savingPin}>
                <Save className="w-4 h-4 mr-2" />{savingPin ? 'Guardando...' : 'Guardar PIN'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Data */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="heineken-card">
            <CardHeader>
              <CardTitle className="flex items-center text-white"><Database className="mr-3 text-green-400" />Gestión de Datos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
              <Button onClick={() => toast({ title: "🚧 En construcción" })} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                <Download className="w-4 h-4 mr-2" /> Descargar Backup
              </Button>
              <Button onClick={() => toast({ title: "🚧 En construcción" })} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                <Upload className="w-4 h-4 mr-2" /> Importar Backup
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* ========== VERSION DASHBOARD ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-800/60 border border-slate-600/50 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Versión en Código</p>
              <p className="text-xl font-black text-white font-mono">v{APP_CURRENT_VERSION}</p>
              <p className="text-[10px] text-slate-500 mt-1">updateService.js + package.json</p>
            </div>
            <div className={`rounded-xl p-4 border ${currentOta ? 'bg-blue-950/40 border-blue-500/30' : 'bg-slate-800/60 border-slate-600/50'}`}>
              <p className="text-[10px] text-blue-400 uppercase tracking-wider font-bold mb-1">OTA en Servidor</p>
              <p className="text-xl font-black text-white font-mono">{currentOta ? `v${currentOta.version}` : '— sin publicar —'}</p>
              {currentOta?.date && <p className="text-[10px] text-slate-500 mt-1">{new Date(currentOta.date).toLocaleString()}</p>}
            </div>
            <div className={`rounded-xl p-4 border ${currentApk ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-slate-800/60 border-slate-600/50'}`}>
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold mb-1">APK en Servidor</p>
              <p className="text-xl font-black text-white font-mono">{currentApk ? `v${currentApk.version}` : '— sin publicar —'}</p>
              {currentApk?.date ? (
                <p className="text-[10px] text-slate-500 mt-1">{currentApk.size} · {new Date(currentApk.date).toLocaleString()}</p>
              ) : (
                <p className="text-[10px] text-slate-500 mt-1">Sube tu APK abajo</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ========== OTA UPDATES ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="heineken-card border-blue-500/30">
            <CardHeader>
              <CardTitle className="flex items-center text-white"><Smartphone className="mr-3 text-blue-400" />Actualización OTA (Over-The-Air)</CardTitle>
              <CardDescription className="text-blue-200">Actualiza código JS/CSS/HTML en dispositivos sin nuevo APK.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Instructions Collapsible */}
              <details className="bg-blue-950/30 border border-blue-500/20 rounded-xl">
                <summary className="px-4 py-3 text-sm text-blue-200 cursor-pointer flex items-center gap-2 font-medium">
                  <Info className="w-4 h-4 shrink-0" /> ¿Cómo generar el archivo ZIP para OTA?
                </summary>
                <div className="px-4 pb-4 text-sm text-blue-200 space-y-3">
                  <div className="bg-slate-900 rounded-lg p-3">
                    <p className="font-bold text-white mb-2">Generar el ZIP OTA (Windows)</p>
                    <p className="text-xs mb-2">Compila la web y crea el ZIP con rutas compatibles con Android:</p>
                    <code className="block bg-black/50 p-2 rounded text-xs text-green-300 whitespace-pre-wrap break-all">npm run build:ota</code>
                    <p className="text-xs mt-3 mb-2">Si ya existe un <code>dist/</code> actualizado:</p>
                    <code className="block bg-black/50 p-2 rounded text-xs text-green-300 whitespace-pre-wrap break-all">powershell -ExecutionPolicy Bypass -File .\build-ota.ps1 -SkipBuild -SkipSync</code>
                    <p className="text-xs mt-3">No uses <code>Compress-Archive</code>: Capgo puede rechazar las rutas Windows del ZIP con el error “Windows path not supported”.</p>
                  </div>
                </div>
              </details>

              {/* Upload Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ota-version" className="text-white">Nueva Versión</Label>
                  <div className="relative">
                    <Input id="ota-version" type="text" placeholder="1.0.5" value={otaVersion} onChange={(e) => setOtaVersion(e.target.value)} className="heineken-input font-mono" disabled={uploadingOta} />
                    {otaIsNewer && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />}
                    {otaVersion && !otaIsNewer && currentOta && <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />}
                  </div>
                  {otaVersion && !otaIsNewer && currentOta && (
                    <p className="text-[10px] text-amber-400">Debe ser mayor a v{currentOta.version}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ota-file" className="text-white">Archivo ZIP</Label>
                  <Input id="ota-file" type="file" accept=".zip" onChange={(e) => setOtaFile(e.target.files[0])} className="heineken-input file:text-white file:bg-slate-700 file:border-0 file:rounded-md cursor-pointer" disabled={uploadingOta} />
                  {otaFile && <p className="text-[10px] text-slate-400">{otaFile.name} · {(otaFile.size / 1024 / 1024).toFixed(2)} MB</p>}
                </div>
              </div>

              <Button onClick={handleUploadOta} className="bg-blue-600 hover:bg-blue-700 text-white border-0 w-full md:w-auto" disabled={uploadingOta || !otaFile || !otaVersion}>
                {uploadingOta ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Subiendo...</> : <><UploadCloud className="w-4 h-4 mr-2" /> Publicar OTA</>}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* ========== APK UPLOAD ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="heineken-card border-emerald-500/30">
            <CardHeader>
              <CardTitle className="flex items-center text-white"><Package className="mr-3 text-emerald-400" />Publicar APK (Android)</CardTitle>
              <CardDescription className="text-emerald-200">
                Sube la APK compilada para que los usuarios la descarguen desde Utilidades.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Current APK info */}
              {currentApk && (
                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-emerald-400 font-bold uppercase">APK actual publicada</p>
                    <p className="text-white font-mono font-bold">v{currentApk.version} <span className="text-slate-400 font-normal">· {currentApk.size}</span></p>
                    {currentApk.notes && <p className="text-[11px] text-slate-400 mt-1">{currentApk.notes}</p>}
                    {currentApk.date && <p className="text-[10px] text-slate-500 mt-1">{new Date(currentApk.date).toLocaleString()}</p>}
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" onClick={() => window.open(currentApk.url, '_blank')}>
                    <Download className="w-3 h-3 mr-1" /> Descargar
                  </Button>
                </div>
              )}

              {/* Auto-filled info */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Versión que se publicará:</span>
                  <span className="font-mono font-bold text-white">v{APP_CURRENT_VERSION}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Nombre del archivo en servidor:</span>
                  <span className="font-mono text-sm text-slate-300">cervezas-finas.apk</span>
                </div>
                <p className="text-[10px] text-amber-400/80">⚠️ La versión se toma automáticamente de updateService.js (v{APP_CURRENT_VERSION})</p>
              </div>

              {/* Upload Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apk-file" className="text-white">Archivo APK</Label>
                  <Input id="apk-file" type="file" accept=".apk" onChange={(e) => setApkFile(e.target.files[0])} className="heineken-input file:text-white file:bg-slate-700 file:border-0 file:rounded-md cursor-pointer" disabled={uploadingApk} />
                  {apkFile && <p className="text-[10px] text-slate-400">{apkFile.name} · {(apkFile.size / 1024 / 1024).toFixed(1)} MB</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apk-notes" className="text-white">Notas de la versión <span className="text-slate-500">(opcional)</span></Label>
                  <Input id="apk-notes" type="text" placeholder="Ej: Corrección de GPS, nuevo diseño..." value={apkNotes} onChange={(e) => setApkNotes(e.target.value)} className="heineken-input" disabled={uploadingApk} />
                </div>
              </div>

              <Button onClick={handleUploadApk} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 w-full md:w-auto" disabled={uploadingApk || !apkFile}>
                {uploadingApk ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Subiendo APK...</> : <><Package className="w-4 h-4 mr-2" /> Publicar APK v{APP_CURRENT_VERSION}</>}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* ========== WALLPAPER UPLOAD ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <Card className="heineken-card border-indigo-500/30">
            <CardHeader>
              <CardTitle className="flex items-center text-white"><ImageIcon className="mr-3 text-indigo-400" />Fondos de Pantalla (Android)</CardTitle>
              <CardDescription className="text-indigo-200">
                Sube la imagen que se pondrá de fondo automáticamente en los dispositivos al abrir la aplicación.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Home Screen Wallpaper */}
              <div className="space-y-4 border-b border-slate-700 pb-6">
                <h3 className="text-indigo-300 font-bold text-sm uppercase">Fondo de Inicio (Home)</h3>
                {currentHomeWp && (
                  <div className="flex items-center gap-4">
                    <img src={currentHomeWp} alt="Fondo Inicio" className="w-16 h-24 object-cover rounded-md border border-slate-600" />
                    <Button variant="outline" size="sm" className="border-indigo-500/30 text-indigo-400" onClick={() => window.open(currentHomeWp, '_blank')}>Ver Actual</Button>
                  </div>
                )}
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="wp-home-file" className="text-white">Imagen de Fondo (Inicio)</Label>
                    <Input id="wp-home-file" type="file" accept="image/*" onChange={(e) => setHomeWpFile(e.target.files[0])} className="heineken-input file:text-white file:bg-slate-700 file:border-0 file:rounded-md cursor-pointer" disabled={uploadingWp} />
                  </div>
                  <Button onClick={() => handleUploadWallpaper('home')} className="bg-indigo-600 hover:bg-indigo-700 text-white border-0" disabled={uploadingWp || !homeWpFile}>
                    {uploadingWp ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />} Subir Inicio
                  </Button>
                </div>
              </div>

              {/* Lock Screen Wallpaper */}
              <div className="space-y-4">
                <h3 className="text-indigo-300 font-bold text-sm uppercase">Fondo de Bloqueo (Lock Screen)</h3>
                {currentLockWp && (
                  <div className="flex items-center gap-4">
                    <img src={currentLockWp} alt="Fondo Bloqueo" className="w-16 h-24 object-cover rounded-md border border-slate-600" />
                    <Button variant="outline" size="sm" className="border-indigo-500/30 text-indigo-400" onClick={() => window.open(currentLockWp, '_blank')}>Ver Actual</Button>
                  </div>
                )}
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="wp-lock-file" className="text-white">Imagen de Fondo (Bloqueo)</Label>
                    <Input id="wp-lock-file" type="file" accept="image/*" onChange={(e) => setLockWpFile(e.target.files[0])} className="heineken-input file:text-white file:bg-slate-700 file:border-0 file:rounded-md cursor-pointer" disabled={uploadingWp} />
                  </div>
                  <Button onClick={() => handleUploadWallpaper('lock')} className="bg-indigo-600 hover:bg-indigo-700 text-white border-0" disabled={uploadingWp || !lockWpFile}>
                    {uploadingWp ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />} Subir Bloqueo
                  </Button>
                </div>
              </div>

            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default AdminSettingsPage;
