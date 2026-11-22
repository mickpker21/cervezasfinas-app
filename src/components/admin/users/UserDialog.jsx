import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { getAvailableRoutes } from '@/repositories/routeRepository';
import { createAdminUser, updateAdminUser } from '@/services/adminUsersApi';

function uniqSorted(arr) {
  return Array.from(new Set((arr || []).map((v) => String(v ?? '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

export default function UserDialog({ isOpen, onClose, editingUser, userTypes, departments = [], jobTitles = [], warehouses = [], onSaveSuccess, allUsers = [] }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingRoutesData, setLoadingRoutesData] = useState(false);
  const [availableZonas, setAvailableZonas] = useState([]);
  const [availableSalesRoutes, setAvailableSalesRoutes] = useState([]);
  const [availableConquistaRoutes, setAvailableConquistaRoutes] = useState([]);
  const [zonasRutasMap, setZonasRutasMap] = useState({});
  const [userData, setUserData] = useState({ 
    name: '', email: '', route: '', password: '', role: '', force_change_password: true, send_welcome_email: true,
    phone: '', job_title: '', department: '', employee_id: '', start_date: '', emergency_contact_name: '', emergency_contact_phone: '',
    reports_to: '', zona: '', warehouse_ids: [],
    allowed_zonas: [], allowed_sales_routes: [], allowed_routes: []
  });
  const [generatedTempPassword, setGeneratedTempPassword] = useState('');
  const baseTypeOptions = (userTypes && userTypes.length > 0)
    ? userTypes.map((t) => t.type_name).filter(Boolean)
    : ["asesor_dinamico", "conquista", "televenta", "admin", "sistemashop"];
  const dynamicTypeOptions = Array.from(new Set([...baseTypeOptions, "sistemashop"]));

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const loadZonesAndRoutes = async () => {
      setLoadingRoutesData(true);
      try {
        let zrRows = [];
        const { data: zrWithTipo, error: zrErr } = await supabase
          .from('zonas_rutas')
          .select('zona, ruta, tipo_ruta');
        if (!zrErr && Array.isArray(zrWithTipo)) {
          zrRows = zrWithTipo;
        } else {
          const { data: zrSimple } = await supabase.from('zonas_rutas').select('zona, ruta');
          zrRows = zrSimple || [];
        }

        const mapZR = {};
        const zonasList = [];
        zrRows.forEach((row) => {
          if (row.zona) zonasList.push(row.zona);
          if (row.zona && row.ruta) {
            if (!mapZR[row.zona]) mapZR[row.zona] = { ventas: [], reparto: [], conquista: [] };
            const tipo = row.tipo_ruta || 'ventas';
            if (mapZR[row.zona][tipo]) mapZR[row.zona][tipo].push(row.ruta);
            else mapZR[row.zona].ventas.push(row.ruta);
          }
        });

        const avail = await getAvailableRoutes().catch(() => ({ internal: [], sales: [] }));
        if (!active) return;
        setAvailableZonas(uniqSorted(zonasList));
        setAvailableSalesRoutes(uniqSorted(avail.sales || []));
        setAvailableConquistaRoutes(uniqSorted(avail.internal || []));
        setZonasRutasMap(mapZR);

        if (editingUser?.id) {
          const [zRes, rRes, srRes] = await Promise.all([
            supabase.from('supervisor_allowed_zonas').select('zona').eq('supervisor_id', editingUser.id),
            supabase.from('supervisor_allowed_routes').select('route').eq('supervisor_id', editingUser.id),
            supabase.from('supervisor_allowed_sales_routes').select('sales_route').eq('supervisor_id', editingUser.id),
          ]);
          if (!active) return;
          setUserData((prev) => ({
            ...prev,
            allowed_zonas: uniqSorted((zRes.data || []).map((x) => x.zona)),
            allowed_routes: uniqSorted((rRes.data || []).map((x) => x.route)),
            allowed_sales_routes: uniqSorted((srRes.data || []).map((x) => x.sales_route)),
          }));
        }
      } catch (e) {
        console.warn('Error cargando zonas/rutas en UserDialog:', e);
      } finally {
        if (active) setLoadingRoutesData(false);
      }
    };

    loadZonesAndRoutes();
    return () => { active = false; };
  }, [isOpen, editingUser?.id]);

  useEffect(() => {
    if (isOpen) {
    if (editingUser) {
        setUserData({
      name: editingUser.name || '',
      email: editingUser.email || '',
      route: editingUser.route || '',
      password: '',
      role: editingUser.role || '',
      phone: editingUser.phone || '',
      job_title: editingUser.job_title || '',
      department: editingUser.department || '',
      employee_id: editingUser.employee_id || '',
      start_date: editingUser.start_date || '',
      emergency_contact_name: editingUser.emergency_contact?.name || '',
      emergency_contact_phone: editingUser.emergency_contact?.phone || '',
      reports_to: editingUser.reports_to || '',
      zona: editingUser.zona || '',
      warehouse_ids: editingUser.warehouse_ids || [],
      allowed_zonas: [],
      allowed_sales_routes: [],
      allowed_routes: [],
      send_welcome_email: false
        });
      } else {
        resetForm();
      }
    }
  }, [editingUser, isOpen]);

  const resetForm = () => {
  setUserData({ 
    name: '', email: '', route: '', password: '', role: '', force_change_password: true, send_welcome_email: true,
    phone: '', job_title: '', department: '', employee_id: '', start_date: '', emergency_contact_name: '', emergency_contact_phone: '',
    reports_to: '', zona: '', warehouse_ids: [],
    allowed_zonas: [], allowed_sales_routes: [], allowed_routes: []
  });
  setGeneratedTempPassword('');
  };

  const toggleAllowedZona = (zona) => {
    setUserData((prev) => {
      const exists = prev.allowed_zonas.includes(zona);
      const nextZonas = exists
        ? prev.allowed_zonas.filter((z) => z !== zona)
        : uniqSorted([...prev.allowed_zonas, zona]);

      const linked = zonasRutasMap[zona];
      if (!linked) {
        return { ...prev, allowed_zonas: nextZonas };
      }

      const linkedSales = uniqSorted([...(linked.ventas || []), ...(linked.reparto || [])]);
      const linkedConquista = uniqSorted(linked.conquista || []);

      const nextSales = exists
        ? prev.allowed_sales_routes.filter((r) => !linkedSales.includes(r))
        : uniqSorted([...prev.allowed_sales_routes, ...linkedSales]);
      const nextConquista = exists
        ? prev.allowed_routes.filter((r) => !linkedConquista.includes(r))
        : uniqSorted([...prev.allowed_routes, ...linkedConquista]);

      return {
        ...prev,
        allowed_zonas: nextZonas,
        allowed_sales_routes: nextSales,
        allowed_routes: nextConquista,
      };
    });
  };

  const toggleAllowedItem = (field, value) => {
    setUserData((prev) => {
      const current = prev[field] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : uniqSorted([...current, value]);
      return { ...prev, [field]: next };
    });
  };

  const handleSubmit = async () => {
    if (!userData.email) {
      toast({ title: "Error", description: "Email es obligatorio.", variant: "destructive" });
      return;
    }
    // Validaciones básicas antes de enviar
    const emailOk = /.+@.+\..+/.test(userData.email);
    if (!emailOk) {
      toast({ title: 'Error', description: 'Email no válido.', variant: 'destructive' });
      return;
    }
    if (!editingUser && userData.password) {
      const pwd = userData.password || '';
      const pwdOk = pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /\d/.test(pwd);
      if (!pwdOk) {
        toast({ title: 'Error', description: 'Contraseña insegura. Usa mínimo 8 caracteres con mayúscula, minúscula y número.', variant: 'destructive' });
        return;
      }
    }
    // Validar rol obligatorio
    if (!userData.role || !String(userData.role).trim()) {
      toast({ title: 'Error', description: 'Selecciona el tipo de usuario.', variant: 'destructive' });
      return;
    }
    // Si es conquista, requerir ruta
    if (!editingUser && String(userData.role).toLowerCase() === 'conquista' && !String(userData.route || '').trim()) {
      toast({ title: 'Error', description: 'La ruta es obligatoria para usuarios Conquista (ej. R1).', variant: 'destructive' });
      return;
    }
    setLoading(true);
    // Traza para depurar envíos
    try {
      // eslint-disable-next-line no-console
      console.debug('[UI] UserDialog submit', { editing: Boolean(editingUser), email: userData.email, role: userData.role, hasPwd: Boolean(userData.password), route: userData.route });
    } catch (_) {}

    const payloadBody = {
      name: userData.name,
      email: userData.email,
      role: userData.role,
      type: userData.role,
      route: userData.route,
      password: userData.password,
      force_change_password: userData.force_change_password,
      send_welcome_email: userData.send_welcome_email,
      phone: userData.phone,
      job_title: userData.job_title,
      department: userData.department,
      employee_id: userData.employee_id,
      start_date: userData.start_date || null,
      emergency_contact: {
        name: userData.emergency_contact_name,
        phone: userData.emergency_contact_phone,
      },
      reports_to: userData.reports_to || null,
      zona: userData.zona,
      warehouse_ids: userData.warehouse_ids,
      allowed_zonas: userData.allowed_zonas,
      allowed_sales_routes: userData.allowed_sales_routes,
      allowed_routes: userData.allowed_routes,
    };

    if (editingUser) {
      try {
        await updateAdminUser({
          user_id: editingUser.id,
          ...payloadBody,
        });
        toast({
          title: "¡Usuario actualizado!",
          description: "Se actualizó el perfil, tipo/rol, ruta y credenciales en una sola operación.",
        });
      } catch (err) {
        toast({
          title: "Error al actualizar",
          description: err.message || "No se pudo actualizar el usuario.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
    } else {
      try {
        const res = await createAdminUser(payloadBody);
        const tempPwd = res?.data?.temp_password;
        const emailSent = res?.data?.email_sent;
        const emailError = res?.data?.email_error;

        if (!userData.password && tempPwd) {
          setGeneratedTempPassword(tempPwd);
        }

        if (userData.send_welcome_email && emailSent) {
          toast({
            title: "¡Usuario creado y correo enviado!",
            description: `Se creó a ${userData.name || userData.email} y se envió su correo de bienvenida.`,
          });
        } else if (tempPwd) {
          toast({
            title: "¡Usuario creado!",
            description: emailError
              ? `Contraseña temporal: ${tempPwd} (Aviso correo: ${emailError})`
              : `Contraseña temporal generada: ${tempPwd}`,
            duration: 10000,
          });
        } else {
          toast({
            title: "¡Usuario creado!",
            description: `${userData.name || userData.email} ha sido agregado correctamente.`,
          });
        }

        // Si se generó contraseña temporal y no se pudo enviar el correo, dejar el modal abierto para que la copie
        if (tempPwd && userData.send_welcome_email && !emailSent) {
          setLoading(false);
          onSaveSuccess();
          return;
        }
      } catch (err) {
        toast({
          title: "Error al crear usuario",
          description: err.message || "No se pudo crear el usuario.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onSaveSuccess();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-slate-950/80 backdrop-blur-2xl border-slate-800/80 shadow-2xl rounded-3xl" aria-describedby="dialog-desc-user-dialog">
        <DialogDescription id="dialog-desc-user-dialog" className="sr-only">Formulario de usuario</DialogDescription>
        <DialogHeader>
          <DialogTitle className="text-2xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 text-transparent bg-clip-text pb-2">
            {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4 max-h-[65vh] overflow-y-auto pr-3 custom-scrollbar">
          
          {/* SECCIÓN DATOS BÁSICOS */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 border-b border-slate-800 pb-2">Información de Acceso</h3>
            <div>
              <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1 block">Nombre Completo *</Label>
              <Input value={userData.name} onChange={(e) => setUserData({ ...userData, name: e.target.value })} className="bg-slate-900/60 border-slate-700/60 rounded-xl focus-visible:ring-emerald-500 text-white" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1 block">Correo Electrónico *</Label>
              <Input type="email" value={userData.email} onChange={(e) => setUserData({ ...userData, email: e.target.value })} className="bg-slate-900/60 border-slate-700/60 rounded-xl focus-visible:ring-emerald-500 text-white" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1 block">Número de Ruta (si aplica)</Label>
              <Input value={userData.route} onChange={(e) => setUserData({ ...userData, route: e.target.value })} className="bg-slate-900/60 border-slate-700/60 rounded-xl focus-visible:ring-emerald-500 text-white" disabled={editingUser?.role?.toLowerCase() === 'admin'} />
            </div>
          </div>
          
          {/* SECCIÓN EXPEDIENTE RH */}
          <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/50 shadow-inner">
             <Label className="text-emerald-400 font-bold mb-4 block flex items-center gap-2">
                <span className="w-1.5 h-4 bg-emerald-500 rounded-full inline-block"></span>
                Datos del Expediente (RH)
             </Label>
             <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[11px] font-medium text-slate-400 uppercase">Teléfono</Label>
                  <Input value={userData.phone} onChange={(e) => setUserData({ ...userData, phone: e.target.value })} className="bg-slate-950/50 border-slate-800 rounded-lg h-9 text-sm text-white focus-visible:ring-emerald-500" />
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-slate-400 uppercase">No. Empleado</Label>
                  <Input value={userData.employee_id} onChange={(e) => setUserData({ ...userData, employee_id: e.target.value })} className="bg-slate-950/50 border-slate-800 rounded-lg h-9 text-sm text-white focus-visible:ring-emerald-500" />
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-slate-400 uppercase">Puesto *</Label>
                  <Select value={userData.job_title} onValueChange={(v) => setUserData({ ...userData, job_title: v })}>
                    <SelectTrigger className="bg-slate-950/50 border-slate-800 rounded-lg h-9 text-sm text-white focus-visible:ring-emerald-500">
                      <SelectValue placeholder="Seleccionar puesto..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {jobTitles.length === 0 && <SelectItem value="loading" disabled>Cargando puestos...</SelectItem>}
                      {jobTitles.map(jt => (
                        <SelectItem key={jt.id} value={jt.name}>{jt.name}</SelectItem>
                      ))}
                      {userData.job_title && !jobTitles.find(j => j.name === userData.job_title) && (
                        <SelectItem value={userData.job_title}>{userData.job_title} (Anterior)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-slate-400 uppercase">Departamento *</Label>
                  <Select value={userData.department} onValueChange={(v) => setUserData({ ...userData, department: v })}>
                    <SelectTrigger className="bg-slate-950/50 border-slate-800 rounded-lg h-9 text-sm text-white focus-visible:ring-emerald-500">
                      <SelectValue placeholder="Seleccionar depto..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {departments.length === 0 && <SelectItem value="loading" disabled>Cargando deptos...</SelectItem>}
                      {departments.map(d => (
                        <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                      ))}
                      {userData.department && !departments.find(de => de.name === userData.department) && (
                        <SelectItem value={userData.department}>{userData.department} (Anterior)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-[11px] font-medium text-slate-400 uppercase">Zona / Bodega</Label>
                  <Select value={userData.zona} onValueChange={(v) => setUserData({ ...userData, zona: v })}>
                    <SelectTrigger className="bg-slate-950/50 border-slate-800 rounded-lg h-9 text-sm text-white focus-visible:ring-emerald-500">
                      <SelectValue placeholder="Seleccionar zona..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      <SelectItem value="PALMARITO">PALMARITO</SelectItem>
                      <SelectItem value="IZUCAR">IZUCAR</SelectItem>
                      <SelectItem value="OAXACA">OAXACA</SelectItem>
                      <SelectItem value="SERDAN">SERDAN</SelectItem>
                      <SelectItem value="GPE-CHILCHOTLA">GPE-CHILCHOTLA</SelectItem>
                      <SelectItem value="OFICINA_CENTRAL">OFICINA CENTRAL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-[11px] font-medium text-slate-400 uppercase">Fecha de Ingreso</Label>
                  <Input type="date" value={userData.start_date} onChange={(e) => setUserData({ ...userData, start_date: e.target.value })} className="bg-slate-950/50 border-slate-800 rounded-lg h-9 text-sm text-white focus-visible:ring-emerald-500" />
                </div>
                <div className="col-span-2 mt-2 bg-slate-950/30 p-3 rounded-xl border border-slate-800/40">
                  <Label className="text-xs text-cyan-400 font-semibold mb-2 block">Contacto de Emergencia</Label>
                  <div className="flex gap-3">
                    <Input placeholder="Nombre" value={userData.emergency_contact_name} onChange={(e) => setUserData({ ...userData, emergency_contact_name: e.target.value })} className="bg-slate-900/50 border-slate-800 rounded-lg h-9 text-sm text-white flex-1" />
                    <Input placeholder="Teléfono" value={userData.emergency_contact_phone} onChange={(e) => setUserData({ ...userData, emergency_contact_phone: e.target.value })} className="bg-slate-900/50 border-slate-800 rounded-lg h-9 text-sm text-white flex-1" />
                  </div>
                 <div className="col-span-2 mt-2">
                   <Label className="text-[11px] font-medium text-amber-400 uppercase">Jefe Directo (Reporta a)</Label>
                   <Select value={userData.reports_to || 'none'} onValueChange={(v) => setUserData({ ...userData, reports_to: v === 'none' ? '' : v })}>
                     <SelectTrigger className="bg-slate-950/50 border-slate-800 rounded-lg h-9 text-sm text-white focus-visible:ring-amber-500">
                       <SelectValue placeholder="Seleccionar jefe directo..." />
                     </SelectTrigger>
                     <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-60">
                       <SelectItem value="none" className="text-slate-400">Sin jefe directo</SelectItem>
                       {allUsers.filter(u => u.id !== editingUser?.id).map(u => (
                         <SelectItem key={u.id} value={u.id} className="text-slate-200 focus:bg-amber-600/20">
                           {u.name || u.email} {u.job_title ? `— ${u.job_title}` : ''}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
                </div>
             </div>
          </div>

          {/* SECCIÓN SEGURIDAD */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 border-b border-slate-800 pb-2">Seguridad y Permisos</h3>
            <div>
              <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1 block">Contraseña <span className="text-slate-500 lowercase normal-case">{editingUser ? '(Dejar en blanco para no cambiar)' : '(opcional, deja vacío para generar)'}</span></Label>
              <Input type="password" value={userData.password} onChange={(e) => setUserData({ ...userData, password: e.target.value })} className="bg-slate-900/60 border-slate-700/60 rounded-xl focus-visible:ring-emerald-500 text-white" />
            </div>
          {!editingUser && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input id="forceChangePwd" type="checkbox" checked={userData.force_change_password} onChange={(e)=> setUserData({ ...userData, force_change_password: e.target.checked })} />
                <Label htmlFor="forceChangePwd" className="text-white text-sm">Forzar cambio de contraseña al primer inicio</Label>
              </div>
              <div className="flex items-center gap-2">
                <input id="sendWelcomeEmail" type="checkbox" checked={userData.send_welcome_email} onChange={(e)=> setUserData({ ...userData, send_welcome_email: e.target.checked })} />
                <Label htmlFor="sendWelcomeEmail" className="text-emerald-300 text-sm">Enviar correo de bienvenida automático con credenciales</Label>
              </div>
            </div>
          )}
          {generatedTempPassword && !editingUser && (
            <div className="p-4 border border-emerald-500/30 rounded-xl bg-emerald-900/20 shadow-lg text-xs text-emerald-100 flex items-center justify-between mt-4">
              <div>
                <span className="opacity-70 mb-1 block uppercase font-bold tracking-wider text-[10px]">Contraseña Temporal</span>
                <code className="text-base font-black tracking-widest text-emerald-300">{generatedTempPassword}</code>
                <p className="text-[10px] opacity-70 mt-1">Entrégala al usuario y pídale cambiarla inmediatamente.</p>
              </div>
              <button
                type="button"
                className="bg-emerald-600/80 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                onClick={() => { navigator.clipboard.writeText(generatedTempPassword); toast({ title: 'Copiado', description: 'Contraseña temporal copiada al portapapeles.' }); }}
              >Copiar</button>
            </div>
          )}
          
          <div className="mb-2">
            <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1 block">Tipo de Usuario *</Label>
            <Select
              value={userData.role}
              onValueChange={(value) => setUserData({ ...userData, role: value })}
              disabled={editingUser?.role?.toLowerCase() === 'admin'}
            >
              <SelectTrigger className="bg-slate-900/60 border-slate-700/60 rounded-xl text-white">
                <SelectValue placeholder="Seleccionar tipo de usuario..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                {dynamicTypeOptions.map((type) => (
                  <SelectItem key={type} value={type} className="text-slate-200 focus:bg-emerald-600/20">{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="mb-2 pt-2">
            <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2 block">Acceso a Almacenes</Label>
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-3 max-h-40 overflow-y-auto custom-scrollbar space-y-2">
              {warehouses.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No hay almacenes disponibles.</p>
              ) : (
                warehouses.map(w => {
                  const isChecked = userData.warehouse_ids?.includes(w.id) || false;
                  return (
                    <label key={w.id} className="flex items-center space-x-2 cursor-pointer group">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 group-hover:border-slate-500'}`}>
                        {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{w.name}</span>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={isChecked}
                        onChange={(e) => {
                          const currentIds = userData.warehouse_ids || [];
                          const newIds = e.target.checked 
                            ? [...currentIds, w.id] 
                            : currentIds.filter(id => id !== w.id);
                          setUserData({ ...userData, warehouse_ids: newIds });
                        }}
                      />
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-1 leading-tight">Si no seleccionas ninguno, el usuario no tendrá acceso a un almacén específico (excepto Admins que ven todos).</p>
          </div>

          {/* SECCIÓN ZONAS Y RUTAS PERMITIDAS */}
          <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50 space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <Label className="text-cyan-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Zonas y Rutas Permitidas
              </Label>
              {loadingRoutesData && <span className="text-[11px] text-slate-400">Cargando catálogo...</span>}
            </div>

            <div>
              <span className="text-[11px] text-slate-400 font-semibold uppercase block mb-1.5">
                Zonas ({userData.allowed_zonas.length} seleccionadas)
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                {availableZonas.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">No hay zonas configuradas.</span>
                ) : (
                  availableZonas.map((z) => {
                    const selected = userData.allowed_zonas.includes(z);
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => toggleAllowedZona(z)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        {z}
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Al marcar una zona, se preseleccionan automáticamente sus rutas vinculadas.</p>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 font-semibold uppercase flex items-center gap-1 mb-1.5">
                <Navigation className="w-3 h-3" />
                Rutas de Venta / Reparto ({userData.allowed_sales_routes.length})
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                {availableSalesRoutes.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">Sin rutas de venta disponibles.</span>
                ) : (
                  availableSalesRoutes.map((r) => {
                    const selected = userData.allowed_sales_routes.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleAllowedItem('allowed_sales_routes', r)}
                        className={`px-2 py-0.5 rounded-md text-xs border transition-colors ${
                          selected
                            ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {availableConquistaRoutes.length > 0 && (
              <div>
                <span className="text-[11px] text-slate-400 font-semibold uppercase block mb-1.5">
                  Rutas de Conquista ({userData.allowed_routes.length})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                  {availableConquistaRoutes.map((r) => {
                    const selected = userData.allowed_routes.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleAllowedItem('allowed_routes', r)}
                        className={`px-2 py-0.5 rounded-md text-xs border transition-colors ${
                          selected
                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-slate-800/50">
          <Button variant="outline" onClick={onClose} className="rounded-xl border-slate-700/50 text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all">Cancelar</Button>
          <Button onClick={handleSubmit} className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold shadow-lg shadow-emerald-900/20 transition-all border-0" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {loading ? 'Guardando...' : (editingUser ? 'Actualizar Usuario' : 'Crear Perfil')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}