import React, { useState, useEffect, useCallback } from 'react';
import { Printer, Bluetooth, BluetoothSearching, BluetoothConnected, AlertTriangle, CheckCircle2, Save, Zap, ChevronDown, Info, Wifi, WifiOff } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { PRINTER_BRANDS, getPrinterProfile, getGroupedPrinterBrands, DEFAULT_PRINTER_CONFIG } from '@/lib/printerProfiles';
import { getUserPrinterConfig, saveUserPrinterConfig, cacheDeviceId } from '@/repositories/printerRepository';
import { BluetoothPrinterService } from '@/services/BluetoothPrinterService';
import { Capacitor } from '@capacitor/core';

export default function PrinterSettingsPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();

  const [config, setConfig] = useState(DEFAULT_PRINTER_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [groupedBrands] = useState(() => getGroupedPrinterBrands());

  // Cargar config guardada
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const saved = await getUserPrinterConfig(user?.id);
        if (saved) setConfig(saved);
      } catch (e) {
        console.warn('Error cargando config de impresora:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
    // Sincronizar estado de conexion
    setIsConnected(BluetoothPrinterService.isConnected);
  }, [user?.id]);

  // Cuando cambia la marca, auto-rellenar UUIDs y paper width
  const handleBrandChange = useCallback((brandId) => {
    const profile = getPrinterProfile(brandId);
    setConfig(prev => ({
      ...prev,
      brand: brandId,
      paperWidth: profile.paperWidth,
      charWidth: profile.charWidth,
      bleServiceUuid: profile.bleServiceUuid,
      bleCharUuid: profile.bleCharUuid || '',
      connectionType: profile.connectionType,
    }));
  }, []);

  const currentProfile = getPrinterProfile(config.brand);

  // Conectar y escanear BLE
  const handleConnect = async () => {
    if (currentProfile.connectionType === 'spp') {
      toast({
        title: 'Impresora SPP',
        description: 'Esta impresora usa Bluetooth clasico. Emparejala en Configuracion > Bluetooth de tu dispositivo y luego ingresa la MAC manualmente.',
        variant: 'default',
      });
      return;
    }

    setConnecting(true);
    try {
      // Actualizar UUIDs en el servicio segun la marca seleccionada
      BluetoothPrinterService.SERVICE_UUID = config.bleServiceUuid;
      BluetoothPrinterService.CHARACTERISTIC_UUID = config.bleCharUuid;

      const connected = await BluetoothPrinterService.connect();
      if (connected) {
        setIsConnected(true);
        // Guardar device ID en cache
        const deviceId = BluetoothPrinterService.device?.deviceId || BluetoothPrinterService.device?.id;
        if (deviceId) {
          await cacheDeviceId(deviceId);
          setConfig(prev => ({ ...prev, deviceId }));
        }
        toast({ title: 'Conectado', description: 'Impresora conectada exitosamente.', variant: 'default' });
      }
    } catch (e) {
      toast({ title: 'Error de conexion', description: e.message || 'No se pudo conectar.', variant: 'destructive' });
      setIsConnected(false);
    } finally {
      setConnecting(false);
    }
  };

  // Imprimir ticket de prueba
  const handleTestPrint = async () => {
    if (!isConnected) {
      toast({ title: 'Sin conexion', description: 'Conecta la impresora primero.', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      await BluetoothPrinterService.printTestTicket(config);
      toast({ title: 'Prueba enviada', description: 'Ticket de prueba enviado a la impresora.', variant: 'default' });
    } catch (e) {
      toast({ title: 'Error al imprimir', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  // Guardar configuracion
  const handleSave = async () => {
    setSaving(true);
    try {
      await saveUserPrinterConfig(user?.id, config);
      toast({ title: 'Guardado', description: 'Configuracion de impresora guardada correctamente.', variant: 'default' });
    } catch (e) {
      toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 pb-24">
      {/* Header */}
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-8 mt-2">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Printer size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Configuracion de Impresora</h1>
            <p className="text-sm text-slate-400">Bluetooth termica</p>
          </div>
          {/* Estado de conexion */}
          <div className="ml-auto">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <BluetoothConnected size={12} /> Conectada
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                <Bluetooth size={12} /> Sin conectar
              </span>
            )}
          </div>
        </div>

        {/* Aviso SPP */}
        {currentProfile.warning && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex gap-3">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300 leading-relaxed">{currentProfile.warning}</p>
          </div>
        )}

        {/* Tarjeta: Marca */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4 shadow-lg">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Marca de Impresora</h2>

          <div className="relative">
            <select
              value={config.brand}
              onChange={e => handleBrandChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
            >
              {Object.entries(groupedBrands).map(([group, brands]) => (
                <optgroup key={group} label={`--- ${group} ---`}>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Modelos comunes */}
          {currentProfile.models?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {currentProfile.models.map(m => (
                <span key={m} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">{m}</span>
              ))}
            </div>
          )}

          {/* Tipo de conexion badge */}
          <div className="mt-3 flex items-center gap-2">
            {currentProfile.connectionType === 'ble' ? (
              <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full border border-blue-500/20">
                <Bluetooth size={10} /> BLE (Bluetooth LE)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20">
                <Wifi size={10} /> SPP (Bluetooth Clasico)
              </span>
            )}
            <span className="text-xs text-slate-500">Papel: {currentProfile.paperWidth}mm · {currentProfile.charWidth} car/linea</span>
          </div>
        </div>

        {/* Tarjeta: Modelo (opcional) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4 shadow-lg">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Modelo (opcional)</h2>
          <input
            type="text"
            placeholder="Ej. ZQ310, RPP02, TM-T20..."
            value={config.model || ''}
            onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Tarjeta: MAC / ID del dispositivo */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Direccion MAC / ID</h2>
            <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded-full border border-slate-700">
              {Capacitor.isNativePlatform() ? 'Android/iOS' : 'Web'}
            </span>
          </div>
          <input
            type="text"
            placeholder={currentProfile.connectionType === 'spp' ? 'AA:BB:CC:DD:EE:FF' : 'Se detecta automaticamente al conectar'}
            value={config.deviceId || ''}
            onChange={e => setConfig(prev => ({ ...prev, deviceId: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-mono"
          />
          <p className="mt-2 text-xs text-slate-500">
            {currentProfile.connectionType === 'ble'
              ? 'Para BLE: usa el boton "Conectar" para detectar automaticamente.'
              : 'Para SPP: ingresa la MAC manualmente (ver en Configuracion > Bluetooth de Android).'}
          </p>
        </div>

        {/* Tarjeta: UUIDs BLE (avanzado, solo si es BLE) */}
        {currentProfile.connectionType === 'ble' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">UUIDs BLE (avanzado)</h2>
              <Info size={14} className="text-slate-500" />
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Service UUID</label>
                <input
                  type="text"
                  value={config.bleServiceUuid || ''}
                  onChange={e => setConfig(prev => ({ ...prev, bleServiceUuid: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Characteristic UUID</label>
                <input
                  type="text"
                  value={config.bleCharUuid || ''}
                  onChange={e => setConfig(prev => ({ ...prev, bleCharUuid: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {/* Botones de accion */}
        <div className="space-y-3 mt-6">
          {/* Conectar */}
          {currentProfile.connectionType === 'ble' ? (
            <button
              onClick={handleConnect}
              disabled={connecting || isConnected}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition-all
                bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                shadow-lg shadow-blue-500/20"
            >
              {connecting ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Buscando...</>
              ) : isConnected ? (
                <><BluetoothConnected size={18} /> Conectada</>
              ) : (
                <><BluetoothSearching size={18} /> Escanear y Conectar</>
              )}
            </button>
          ) : (
            <div className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
              <AlertTriangle size={18} className="flex-shrink-0" />
              <span>Empareja manualmente en Configuracion &gt; Bluetooth de Android, luego guarda la MAC arriba.</span>
            </div>
          )}

          {/* Test print */}
          <button
            onClick={handleTestPrint}
            disabled={!isConnected || testing}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition-all
              bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? (
              <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Imprimiendo...</>
            ) : (
              <><Printer size={18} /> Imprimir Ticket de Prueba</>
            )}
          </button>

          {/* Guardar */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm transition-all
              bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400
              shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Guardando...</>
            ) : (
              <><Save size={18} /> Guardar Configuracion</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
