import React, { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { getClients } from '@/repositories/clientsRepository';
import { getAllEvaluations } from '@/repositories/evaluationsRepository';
import { importClientsApi } from '@/lib/mysqlClients';
import { importEvaluationsPDVApi } from '@/lib/mysqlEvaluations';
import { 
  AlertCircle, CheckCircle2, Search, Filter, 
  ArrowRight, Snowflake, Package, User, 
  Calendar, MapPin, RefreshCw, X, Save
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const ALL_COOLER_CAPS = ['144', '192', '320', '376', '500', '552', '900', '1350'];

export default function AdminAssetAlertsPage() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [zonaFilter, setZonaFilter] = useState('__all__');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [editingSerials, setEditingSerials] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const normalizeCode = (code) => String(code || '').trim().replace(/^0+/, '');

  const findClientForAlert = (allClients, ev) => {
    if (!allClients || !allClients.length) return null;

    const evId = String(ev.client_id || ev.payload?.client_id || '').trim();
    const evCode = String(ev.client_code || ev.payload?.client_code || ev.payload?.cve_cliente || '').trim();
    const normEvCode = normalizeCode(evCode || evId);

    return allClients.find(c => {
      const cId = String(c.id || '').trim();
      const cCode = String(c.client_code || c.cve_cliente || '').trim();
      const normCCode = normalizeCode(cCode);

      if (cId && evId && cId === evId) return true;
      if (cCode && evCode && cCode === evCode) return true;
      if (normCCode && normEvCode && normCCode === normEvCode) return true;
      if (normCCode && evId && normCCode === normalizeCode(evId)) return true;
      if (cId && normEvCode && normalizeCode(cId) === normEvCode) return true;

      return false;
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [allClients, allEvals] = await Promise.all([
        getClients(),
        getAllEvaluations()
      ]);
      setClients(allClients || []);
      setEvaluations(allEvals || []);
      
      // Process Alerts
      const discrepancyAlerts = [];
      console.log(`[AdminAssetAlerts] Processing ${allEvals.length} evaluations against ${allClients.length} clients`);
      
      (allEvals || []).forEach(ev => {
        if (ev.tipo !== 'PDV') return;
        
        const payload = ev.payload || {};
        if (payload.alert_discarded) return; // Skip discarded alerts

        const currSerials = payload.cooler_serials || [];
        const prevSerials = payload.prev_serials || [];
        
        // Simple comparison: length or contents
        const hasDiff = currSerials.length !== prevSerials.length || 
                        currSerials.some(s => !prevSerials.includes(s));
        
        if (hasDiff) {
          const client = findClientForAlert(allClients, ev);

          if (!client && ev.client_id) {
            console.warn(`[AdminAssetAlerts] Could not match client for evaluation ${ev.id}. ID: ${ev.client_id}, Code: ${ev.client_code}`);
          }

          // Check if we already updated the client's profile to match what was scanned
          let clientSerials = [];
          if (client && client.cooler_serials) {
            try {
              clientSerials = Array.isArray(client.cooler_serials) 
                ? client.cooler_serials 
                : JSON.parse(client.cooler_serials);
            } catch (e) {
              clientSerials = [];
            }
          }

          const isAlreadyProcessed = client && 
            currSerials.length === clientSerials.length && 
            currSerials.every(s => clientSerials.includes(s));

          if (!isAlreadyProcessed) {
            discrepancyAlerts.push({
              id: ev.id,
              date: ev.fecha,
              client_id: client?.id || ev.client_id,
              client_name: client?.business_name || client?.name || client?.razon_social || `Cliente #${client?.client_code || ev.client_code || ev.client_id || 'N/A'}`,
              client_code: client?.client_code || client?.cve_cliente || ev.client_code || ev.client_id || 'N/A',
              zona: ev.zona || client?.zona_comercial || 'N/A',
              evaluator: ev.evaluator_name || 'Desconocido',
              scanned: currSerials,
              previous: prevSerials,
              sizes: payload.cooler_sizes || []
            });
          }
        }
      });
      
      setAlerts(discrepancyAlerts.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (err) {
      console.error('[AdminAssetAlerts] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      const matchesSearch = a.client_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            a.client_code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesZona = zonaFilter === '__all__' || a.zona === zonaFilter;
      return matchesSearch && matchesZona;
    });
  }, [alerts, searchTerm, zonaFilter]);

  const zones = useMemo(() => {
    const set = new Set(alerts.map(a => a.zona).filter(Boolean));
    return Array.from(set).sort();
  }, [alerts]);

  const handleOpenValidate = (alert) => {
    setSelectedAlert(alert);
    // Initialize editing serials with sizes
    const initial = alert.scanned.map((s, i) => ({
      serial: s,
      size: alert.sizes[i] || ''
    }));
    setEditingSerials(initial);
    setIsModalOpen(true);
    setActionMessage(null);
  };

  const handleDiscardAlert = async () => {
    if (!selectedAlert) return;
    setIsSaving(true);
    setActionMessage(null);
    try {
      const ev = evaluations.find(e => e.id === selectedAlert.id);
      if (ev) {
        // Update payload to ignore this alert permanently
        const updatedPayload = { ...ev.payload, alert_discarded: true };
        const updatedEv = { ...ev, payload: updatedPayload };
        await importEvaluationsPDVApi([updatedEv]);
      }
      
      setActionMessage({ type: 'success', text: 'Alerta descartada permanentemente.' });
      setAlerts(prev => prev.filter(a => a.id !== selectedAlert.id));
      
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedAlert(null);
      }, 1500);
    } catch (err) {
      setActionMessage({ type: 'error', text: `Error: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveUpdate = async () => {
    if (!selectedAlert) return;
    setIsSaving(true);
    setActionMessage(null);
    try {
      let client = findClientForAlert(clients, selectedAlert);
      if (!client && (selectedAlert.client_id || selectedAlert.client_code)) {
        try {
          const { getClientById } = await import('@/repositories/clientsRepository');
          client = await getClientById(selectedAlert.client_code || selectedAlert.client_id);
        } catch (e) {}
      }

      if (!client) throw new Error('Cliente no encontrado en el sistema');

      const payload = {
        ...client,
        cooler_serials: editingSerials.map(s => s.serial).filter(Boolean),
        enfriador: editingSerials[0]?.size || client.enfriador,
        updated_at: new Date().toISOString()
      };

      const res = await importClientsApi([payload]);
      if (res.errors && res.errors.length > 0) throw new Error(res.errors[0]);

      setActionMessage({ type: 'success', text: 'Inventario de cliente actualizado correctamente.' });
      
      // Remove alert from list
      setAlerts(prev => prev.filter(a => a.id !== selectedAlert.id));
      
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedAlert(null);
      }, 1500);
    } catch (err) {
      setActionMessage({ type: 'error', text: `Error: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mb-4 text-blue-500" />
        <p className="animate-pulse">Analizando discrepancias de inventario...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Helmet><title>Alertas de Equipos · Control de Activos</title></Helmet>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Snowflake className="w-7 h-7 text-blue-400" />
            Alertas de Equipos Frios
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gesti&oacute;n de discrepancias detectadas durante evaluaciones PDV</p>
        </div>
        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 py-1 px-3">
          {alerts.length} Alertas detectadas
        </Badge>
      </div>

      {/* Filters Hub */}
      <Card className="bg-slate-900/40 border-white/5 backdrop-blur-sm shadow-xl">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input 
              placeholder="Buscar por cliente o c&oacute;digo..." 
              className="pl-10 bg-white/5 border-white/10 text-slate-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Select value={zonaFilter} onValueChange={setZonaFilter}>
              <SelectTrigger className="pl-10 bg-white/5 border-white/10 text-slate-200">
                <SelectValue placeholder="Todas las zonas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas las zonas</SelectItem>
                {zones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" /> Actualizar Datos
          </Button>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card className="bg-slate-900/40 border-white/5 backdrop-blur-sm shadow-2xl overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-white/5 text-slate-400 text-[10px] uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold">Cliente / Evaluador</th>
                  <th className="px-6 py-4 font-semibold">Zona</th>
                  <th className="px-6 py-4 font-semibold">Anterior</th>
                  <th className="px-6 py-4 font-semibold">Escaneado</th>
                  <th className="px-6 py-4 font-semibold text-center">Acci&oacute;n</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredAlerts.length > 0 ? filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center text-blue-400 mt-1">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-100">{alert.client_name}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[9px] py-0 px-1 border-white/10 text-slate-400 uppercase">{alert.client_code}</Badge>
                            <span className="flex items-center gap-1"><User className="w-3 h-3" /> {alert.evaluator}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {format(new Date(alert.date), 'dd MMM')}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 border border-white/5 uppercase">
                        {alert.zona}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {alert.previous.length > 0 ? alert.previous.map((s, i) => (
                          <span key={i} className="text-[10px] text-slate-500 line-through decoration-slate-600">{s}</span>
                        )) : <span className="text-slate-600 italic text-xs">Ninguno</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {alert.scanned.map((s, i) => (
                          <span key={i} className="text-[10px] text-emerald-400 font-mono bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 w-fit">
                            {s} {alert.sizes[i] ? `(${alert.sizes[i]})` : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button 
                        size="sm" 
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-8"
                        onClick={() => handleOpenValidate(alert)}
                      >
                        Validar y Cargar
                      </Button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="py-24 text-center">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500/20 mx-auto mb-4" />
                      <p className="text-slate-500 italic">No hay discrepancias pendientes para procesar.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Validation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-[#0f172a] border-white/10 text-slate-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
              <Package className="w-5 h-5 text-blue-400" />
              Validación de Equipos
            </DialogTitle>
            <CardDescription className="text-slate-500">
              Confirma los números de serie y sus capacidades para {selectedAlert?.client_name}.
            </CardDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {editingSerials.map((item, idx) => (
              <div key={idx} className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/5 border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Equipo #{idx + 1}</span>
                  <Badge variant="outline" className="text-[9px] border-emerald-500/20 text-emerald-400">NUEVO DETECTADO</Badge>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-400">N&uacute;mero de Serie</Label>
                    <Input 
                      value={item.serial} 
                      onChange={(e) => {
                        const next = [...editingSerials];
                        next[idx].serial = e.target.value;
                        setEditingSerials(next);
                      }}
                      className="bg-slate-900 border-white/5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-400">Capacidad (HL/Canastillas)</Label>
                    <Select 
                      value={item.size} 
                      onValueChange={(val) => {
                        const next = [...editingSerials];
                        next[idx].size = val;
                        setEditingSerials(next);
                      }}
                    >
                      <SelectTrigger className="bg-slate-900 border-white/5">
                        <SelectValue placeholder="Selecciona tama&ntilde;o" />
                      </SelectTrigger>
                      <SelectContent className="z-[10001]">
                        {ALL_COOLER_CAPS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}

            {editingSerials.length === 0 && (
              <div className="text-center py-6 text-slate-500 italic">
                No hay equipos detectados en esta evaluaci&oacute;n.
              </div>
            )}

            {actionMessage && (
              <div className={`p-3 rounded-lg flex items-center gap-3 text-sm ${
                actionMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {actionMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                {actionMessage.text}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="outline" 
              className="border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 mr-auto"
              onClick={handleDiscardAlert}
              disabled={isSaving}
            >
              Ignorar Alerta
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
              onClick={handleSaveUpdate}
              disabled={isSaving}
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Actualizar Ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
