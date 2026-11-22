import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { 
  ArrowLeft, User, Briefcase, ShieldAlert, 
  Link as LinkIcon, Unlink, Activity, AlertCircle, 
  FileCheck, FolderOpen, Fingerprint, Building2, MapPin,
  Save, Edit2, Users, Shield
} from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import HRDocuments from '../hr/HRDocuments';
import BiometricRegistration from '../../components/admin/users/BiometricRegistration';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ZONA_OPTIONS = ['PALMARITO','IZUCAR','OAXACA','SERDAN','GPE-CHILCHOTLA','OFICINA_CENTRAL'];

const AdminEmployeeDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user: currentUser } = useSupabaseAuth();

  const [activeTab, setActiveTab] = useState('info');

  // Linking
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [linking, setLinking] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');

  // Access edit (profiles table)
  const [editingAccess, setEditingAccess] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessForm, setAccessForm] = useState({ reports_to: '', zona: '', warehouse_ids: [], route: '' });
  const [allProfiles, setAllProfiles] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // Info edit (hr_employees table)
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    first_name:'', last_name:'', employee_number:'',
    department:'', job_title:'', phone:'',
    emergency_contact:'', rfc:'', curp:'', nss:'', hire_date:''
  });
  const [departments, setDepartments] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);

  // History form
  const [addingHistory, setAddingHistory] = useState(false);
  const [historyForm, setHistoryForm] = useState({ event_type:'CAMBIO_PUESTO', description:'', event_date: new Date().toISOString().split('T')[0] });

  // Termination form
  const [terminating, setTerminating] = useState(false);
  const [terminationForm, setTerminationForm] = useState({ reason:'', description:'', event_date: new Date().toISOString().split('T')[0] });

  useEffect(() => { fetchEmployeeData(); fetchAuxData(); }, [id]);

  const fetchAuxData = async () => {
    const [{ data: wh }, { data: depts }, { data: jobs }, { data: profs }] = await Promise.all([
      supabase.from('warehouses').select('id, name').order('name'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('job_titles').select('*').order('name'),
      supabase.from('profiles').select('id, name, email, role, job_title').eq('is_active', true).order('name')
    ]);
    if (wh) setWarehouses(wh);
    if (depts) setDepartments(depts);
    if (jobs) setJobTitles(jobs);
    if (profs) setAllProfiles(profs);
  };

  const fetchEmployeeData = async () => {
    try {
      setLoading(true);
      const { data, error: empError } = await supabase
        .from('hr_employees')
        .select('*, profiles(id, email, role, name, reports_to, zona, warehouse_ids, route)')
        .eq('id', id)
        .single();
      if (empError) throw empError;
      setEmployee(data);
      setInfoForm({
        first_name: data.first_name||'', last_name: data.last_name||'',
        employee_number: data.employee_number||'', department: data.department||'',
        job_title: data.job_title||'', phone: data.phone||'',
        emergency_contact: data.emergency_contact||'', rfc: data.rfc||'',
        curp: data.curp||'', nss: data.nss||'', hire_date: data.hire_date||''
      });
      if (data.profiles) {
        setAccessForm({
          reports_to: data.profiles.reports_to||'',
          zona: data.profiles.zona||'',
          warehouse_ids: data.profiles.warehouse_ids||[],
          route: data.profiles.route||''
        });
      }
      const { data: histData } = await supabase.from('hr_employee_history').select('*').eq('employee_id', id).order('event_date', { ascending: false });
      setHistory(histData||[]);
      if (!data.active_profile_id) {
        const { data: profs } = await supabase.from('profiles').select('id, email, role, name').eq('is_active', true).order('email');
        setAvailableProfiles(profs||[]);
      }
    } catch (err) {
      console.error(err);
      setError('Error cargando el expediente del empleado.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    try {
      const { error: upErr } = await supabase.from('hr_employees').update({
        first_name: infoForm.first_name, last_name: infoForm.last_name,
        employee_number: infoForm.employee_number||null, department: infoForm.department,
        job_title: infoForm.job_title, phone: infoForm.phone||null,
        emergency_contact: infoForm.emergency_contact||null, rfc: infoForm.rfc||null,
        curp: infoForm.curp||null, nss: infoForm.nss||null, hire_date: infoForm.hire_date||null
      }).eq('id', id);
      if (upErr) throw upErr;

      // Si el empleado tiene perfil vinculado, sincronizar el nombre al profile
      if (employee?.active_profile_id && (infoForm.first_name || infoForm.last_name)) {
        const fullName = [infoForm.first_name, infoForm.last_name].filter(Boolean).join(' ');
        await supabase.from('profiles').update({ name: fullName }).eq('id', employee.active_profile_id);
      }

      setEditingInfo(false);
      await fetchEmployeeData();
    } catch (err) { alert('Error guardando datos: ' + err.message); }
    finally { setSavingInfo(false); }
  };

  const handleSaveAccess = async () => {
    if (!employee?.active_profile_id) return;
    setSavingAccess(true);
    try {
      const { error: upErr } = await supabase.from('profiles').update({
        reports_to: accessForm.reports_to||null,
        zona: accessForm.zona||null,
        warehouse_ids: accessForm.warehouse_ids,
        route: accessForm.route||null
      }).eq('id', employee.active_profile_id);
      if (upErr) throw upErr;
      setEditingAccess(false);
      await fetchEmployeeData();
    } catch (err) { alert('Error guardando permisos: ' + err.message); }
    finally { setSavingAccess(false); }
  };

  const handleLinkProfile = async () => {
    if (!selectedProfileId) return;
    setLinking(true);
    try {
      const { error: e } = await supabase.from('hr_employees').update({ active_profile_id: selectedProfileId }).eq('id', id);
      if (e) throw e;

      // Sincronizar nombre del expediente → profile si el profile no tiene nombre configurado
      const linkedProfile = availableProfiles.find(p => p.id === selectedProfileId);
      const employeeName = [employee?.first_name, employee?.last_name].filter(Boolean).join(' ');
      const profileHasName = linkedProfile?.name && linkedProfile.name.trim().length > 1;
      if (employeeName && !profileHasName) {
        await supabase.from('profiles').update({ name: employeeName }).eq('id', selectedProfileId);
      }

      await fetchEmployeeData();
    } catch (err) { alert('Error vinculando la cuenta.'); }
    finally { setLinking(false); }
  };

  const handleUnlinkProfile = async () => {
    if (!window.confirm('¿Seguro que deseas desvincular esta cuenta del empleado?')) return;
    setLinking(true);
    try {
      const { error: e } = await supabase.from('hr_employees').update({ active_profile_id: null }).eq('id', id);
      if (e) throw e;
      await fetchEmployeeData();
    } catch (err) { alert('Error desvinculando la cuenta.'); }
    finally { setLinking(false); }
  };

  const handleAddHistory = async (e) => {
    e.preventDefault(); setAddingHistory(true);
    try {
      const { error: e } = await supabase.from('hr_employee_history').insert([{ employee_id: id, ...historyForm }]);
      if (e) throw e;
      setHistoryForm({ event_type:'CAMBIO_PUESTO', description:'', event_date: new Date().toISOString().split('T')[0] });
      await fetchEmployeeData();
    } catch (err) { alert('Error agregando registro al historial.'); }
    finally { setAddingHistory(false); }
  };

  const handleTerminateEmployee = async (e) => {
    e.preventDefault();
    if (!window.confirm('🚨 PRECAUCIÓN: Dar de baja al empleado desactivará su cuenta y cerrará su sesión. ¿Estás seguro?')) return;
    setTerminating(true);
    try {
      await supabase.from('hr_employee_history').insert([{ employee_id: id, event_type:'LIQUIDACION', description:`Motivo: ${terminationForm.reason}. ${terminationForm.description}`, event_date: terminationForm.event_date }]);
      if (employee.active_profile_id) await supabase.from('profiles').update({ is_active: false }).eq('id', employee.active_profile_id);
      await supabase.from('hr_employees').update({ status:'BAJA', active_profile_id: null }).eq('id', id);
      await fetchEmployeeData();
      alert('Empleado dado de baja. La cuenta ha sido bloqueada.');
      setActiveTab('info');
    } catch (err) { alert('Error durante el proceso de baja.'); }
    finally { setTerminating(false); }
  };

  const [reactivating, setReactivating] = useState(false);
  const handleReactivateEmployee = async () => {
    if (!window.confirm('¿Confirmas que deseas REACTIVAR a este empleado y cambiar su estatus a ACTIVO?')) return;
    setReactivating(true);
    try {
      await supabase.from('hr_employees').update({ status: 'ACTIVO' }).eq('id', id);
      await supabase.from('hr_employee_history').insert([{
        employee_id: id,
        event_type: 'REINGRESO',
        description: 'Reactivación de empleado / Reingreso por RRHH',
        event_date: new Date().toISOString().split('T')[0]
      }]);
      if (employee.active_profile_id) {
        await supabase.from('profiles').update({ is_active: true }).eq('id', employee.active_profile_id);
      }
      await fetchEmployeeData();
      alert('✅ Empleado reactivado exitosamente.');
    } catch (err) {
      console.error('Error reactivando empleado:', err);
      alert('Error durante la reactivación: ' + (err.message || 'Inténtalo de nuevo.'));
    } finally {
      setReactivating(false);
    }
  };

  const toggleWarehouse = (whId) => {
    const current = accessForm.warehouse_ids||[];
    setAccessForm(p => ({ ...p, warehouse_ids: current.includes(whId) ? current.filter(x=>x!==whId) : [...current, whId] }));
  };

  const fieldCls = "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
  const readCls = "text-sm text-slate-200 font-medium";
  const labelCls = "text-xs text-slate-500 mb-1";

  if (loading) return <div className="p-8 text-center text-slate-400">Cargando expediente...</div>;
  if (error || !employee) return <div className="p-8 text-center text-red-400">{error||'Empleado no encontrado'}</div>;

  const linkedProfile = employee.profiles;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
          <ArrowLeft size={20}/>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            {employee.first_name} {employee.last_name}
            {employee.status === 'ACTIVO' && <span className="text-xs px-2.5 py-1 bg-emerald-900/40 text-emerald-400 rounded-full border border-emerald-800/50">Activo</span>}
            {(employee.status === 'BAJA' || employee.status === 'INACTIVO') && (
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 bg-red-900/40 text-red-400 rounded-full border border-red-800/50">Baja</span>
                <button
                  onClick={handleReactivateEmployee}
                  disabled={reactivating}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1"
                >
                  <UserCheck size={14} />
                  {reactivating ? 'Reactivando...' : 'Reactivar Empleado'}
                </button>
              </div>
            )}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {employee.job_title} • {employee.department} • Ingreso: {employee.hire_date ? new Date(employee.hire_date).toLocaleDateString() : 'N/A'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 overflow-x-auto">
        {[
          { id:'info', label:'Información', icon: User },
          { id:'access', label:'Acceso y Permisos', icon: Shield },
          { id:'docs', label:'Expediente', icon: FolderOpen },
          { id:'biometric', label:'Biométrico', icon: Fingerprint },
          { id:'history', label:'Historial', icon: Activity },
          { id:'termination', label:'Baja', icon: ShieldAlert }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <tab.icon size={15}/>{tab.label}
          </button>
        ))}
      </div>

      <div className="pt-2">

        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2"><User size={18} className="text-indigo-400"/> Datos del Empleado</h2>
              {employee.status !== 'BAJA' && (
                editingInfo ? (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingInfo(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancelar</button>
                    <button onClick={handleSaveInfo} disabled={savingInfo} className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50">
                      <Save size={13}/>{savingInfo ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setEditingInfo(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700">
                    <Edit2 size={13}/> Editar
                  </button>
                )
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <div><div className={labelCls}>Nombre(s)</div>{editingInfo ? <input value={infoForm.first_name} onChange={e=>setInfoForm(p=>({...p,first_name:e.target.value}))} className={fieldCls}/> : <div className={readCls}>{employee.first_name}</div>}</div>
              <div><div className={labelCls}>Apellidos</div>{editingInfo ? <input value={infoForm.last_name} onChange={e=>setInfoForm(p=>({...p,last_name:e.target.value}))} className={fieldCls}/> : <div className={readCls}>{employee.last_name}</div>}</div>
              <div><div className={labelCls}>Número de Empleado</div>{editingInfo ? <input value={infoForm.employee_number} onChange={e=>setInfoForm(p=>({...p,employee_number:e.target.value}))} className={fieldCls}/> : <div className={readCls}>{employee.employee_number||'Sin asignar'}</div>}</div>
              <div><div className={labelCls}>Departamento</div>{editingInfo ? (
                <Select value={infoForm.department} onValueChange={v=>setInfoForm(p=>({...p,department:v}))}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 h-9 text-sm text-white"><SelectValue placeholder="Seleccionar..."/></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">{departments.map(d=><SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : <div className={readCls}>{employee.department||'-'}</div>}</div>
              <div><div className={labelCls}>Puesto</div>{editingInfo ? (
                <Select value={infoForm.job_title} onValueChange={v=>setInfoForm(p=>({...p,job_title:v}))}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 h-9 text-sm text-white"><SelectValue placeholder="Seleccionar..."/></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">{jobTitles.map(j=><SelectItem key={j.id} value={j.name}>{j.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : <div className={readCls}>{employee.job_title||'-'}</div>}</div>
              <div><div className={labelCls}>Fecha de Ingreso</div>{editingInfo ? <input type="date" value={infoForm.hire_date} onChange={e=>setInfoForm(p=>({...p,hire_date:e.target.value}))} className={fieldCls}/> : <div className={readCls}>{employee.hire_date ? new Date(employee.hire_date).toLocaleDateString() : '-'}</div>}</div>
              <div><div className={labelCls}>Teléfono</div>{editingInfo ? <input value={infoForm.phone} onChange={e=>setInfoForm(p=>({...p,phone:e.target.value}))} className={fieldCls}/> : <div className={readCls}>{employee.phone||'-'}</div>}</div>
              <div className="col-span-2"><div className={labelCls}>Contacto de Emergencia</div>{editingInfo ? <input value={infoForm.emergency_contact} onChange={e=>setInfoForm(p=>({...p,emergency_contact:e.target.value}))} className={fieldCls} placeholder="Nombre y teléfono"/> : <div className={readCls}>{employee.emergency_contact||'-'}</div>}</div>
              <div><div className={labelCls}>RFC</div>{editingInfo ? <input value={infoForm.rfc} onChange={e=>setInfoForm(p=>({...p,rfc:e.target.value.toUpperCase()}))} className={fieldCls} placeholder="13 caracteres"/> : <div className={readCls}>{employee.rfc||'No registrado'}</div>}</div>
              <div><div className={labelCls}>CURP</div>{editingInfo ? <input value={infoForm.curp} onChange={e=>setInfoForm(p=>({...p,curp:e.target.value.toUpperCase()}))} className={fieldCls} placeholder="18 caracteres"/> : <div className={readCls}>{employee.curp||'No registrado'}</div>}</div>
              <div><div className={labelCls}>NSS</div>{editingInfo ? <input value={infoForm.nss} onChange={e=>setInfoForm(p=>({...p,nss:e.target.value}))} className={fieldCls} placeholder="11 dígitos"/> : <div className={readCls}>{employee.nss||'No registrado'}</div>}</div>
            </div>
          </div>
        )}

        {/* ACCESS TAB */}
        {activeTab === 'access' && (
          <div className="space-y-6">
            {/* Cuenta vinculada */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2"><LinkIcon size={18} className="text-indigo-400"/> Cuenta de Acceso al Sistema</h2>
              {linkedProfile ? (
                <div className="p-4 bg-emerald-900/20 border border-emerald-900/50 rounded-xl flex justify-between items-start">
                  <div>
                    <div className="text-emerald-400 text-sm font-semibold mb-1 flex items-center gap-2"><LinkIcon size={14}/> Cuenta Vinculada</div>
                    <div className="text-white font-medium">{linkedProfile.email}</div>
                    <div className="text-xs text-slate-400 mt-1 uppercase">{linkedProfile.role}</div>
                    <p className="text-xs text-slate-500 mt-2">El empleado hereda el historial (clientes, rutas) de esta cuenta.</p>
                  </div>
                  {employee.status !== 'BAJA' && (
                    <button onClick={handleUnlinkProfile} disabled={linking} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors" title="Desvincular"><Unlink size={16}/></button>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
                  <div className="text-slate-300 text-sm font-medium">El empleado no tiene acceso a la App.</div>
                  {employee.status !== 'BAJA' && (
                    <div className="flex gap-2">
                      <select value={selectedProfileId} onChange={e=>setSelectedProfileId(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">Seleccionar cuenta existente...</option>
                        {availableProfiles.map(p=><option key={p.id} value={p.id}>{p.email} ({p.role})</option>)}
                      </select>
                      <button onClick={handleLinkProfile} disabled={!selectedProfileId||linking} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">Vincular</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Permisos operativos */}
            {linkedProfile ? (
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-5">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Shield size={18} className="text-amber-400"/> Permisos Operativos</h2>
                  {employee.status !== 'BAJA' && (
                    editingAccess ? (
                      <div className="flex gap-2">
                        <button onClick={()=>setEditingAccess(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancelar</button>
                        <button onClick={handleSaveAccess} disabled={savingAccess} className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50">
                          <Save size={13}/>{savingAccess?'Guardando...':'Guardar Permisos'}
                        </button>
                      </div>
                    ) : (
                      <button onClick={()=>setEditingAccess(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700">
                        <Edit2 size={13}/> Editar Permisos
                      </button>
                    )
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Jefe Directo */}
                  <div>
                    <div className="text-xs text-amber-400 font-semibold mb-2 uppercase flex items-center gap-1"><Users size={12}/> Jefe Directo (Reporta a)</div>
                    {editingAccess ? (
                      <Select value={accessForm.reports_to||'none'} onValueChange={v=>setAccessForm(p=>({...p,reports_to:v==='none'?'':v}))}>
                        <SelectTrigger className="bg-slate-950 border-slate-700 h-9 text-sm text-white"><SelectValue placeholder="Sin jefe directo"/></SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-56">
                          <SelectItem value="none" className="text-slate-400">Sin jefe directo</SelectItem>
                          {allProfiles.filter(p=>p.id!==employee.active_profile_id).map(p=>(
                            <SelectItem key={p.id} value={p.id}>{p.name||p.email}{p.job_title?` — ${p.job_title}`:''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className={readCls}>
                        {linkedProfile.reports_to
                          ? (allProfiles.find(p=>p.id===linkedProfile.reports_to)?.name || allProfiles.find(p=>p.id===linkedProfile.reports_to)?.email || 'Cuenta vinculada')
                          : <span className="text-slate-500 italic">No asignado</span>}
                      </div>
                    )}
                  </div>
                  {/* Zona */}
                  <div>
                    <div className="text-xs text-slate-500 mb-2 uppercase flex items-center gap-1"><MapPin size={12}/> Zona Operativa</div>
                    {editingAccess ? (
                      <Select value={accessForm.zona||'none'} onValueChange={v=>setAccessForm(p=>({...p,zona:v==='none'?'':v}))}>
                        <SelectTrigger className="bg-slate-950 border-slate-700 h-9 text-sm text-white"><SelectValue placeholder="Sin zona asignada"/></SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="none" className="text-slate-400">Sin zona</SelectItem>
                          {ZONA_OPTIONS.map(z=><SelectItem key={z} value={z}>{z}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : <div className={readCls}>{linkedProfile.zona||<span className="text-slate-500 italic">No asignada</span>}</div>}
                  </div>
                  {/* Ruta */}
                  <div>
                    <div className="text-xs text-slate-500 mb-2 uppercase flex items-center gap-1"><Briefcase size={12}/> Ruta (Conquista / Asesor)</div>
                    {editingAccess ? <input value={accessForm.route} onChange={e=>setAccessForm(p=>({...p,route:e.target.value}))} className={fieldCls} placeholder="Ej. R1, R5..."/> : <div className={readCls}>{linkedProfile.route||<span className="text-slate-500 italic">Sin ruta</span>}</div>}
                  </div>
                </div>
                {/* Bodegas */}
                <div>
                  <div className="text-xs text-slate-500 mb-3 uppercase flex items-center gap-1"><Building2 size={12}/> Acceso a Almacenes / Bodegas</div>
                  {editingAccess ? (
                    <div className="bg-slate-950/60 border border-slate-700 rounded-xl p-3 max-h-44 overflow-y-auto space-y-2">
                      {warehouses.length===0 ? <p className="text-xs text-slate-500 italic">No hay almacenes configurados.</p> : warehouses.map(w=>{
                        const isChecked = accessForm.warehouse_ids?.includes(w.id)||false;
                        return (
                          <label key={w.id} className="flex items-center space-x-2 cursor-pointer group">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked?'bg-indigo-500 border-indigo-500':'border-slate-600 group-hover:border-slate-500'}`}>
                              {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                            </div>
                            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{w.name}</span>
                            <input type="checkbox" className="hidden" checked={isChecked} onChange={()=>toggleWarehouse(w.id)}/>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(linkedProfile.warehouse_ids||[]).length===0 ? <span className="text-xs text-slate-500 italic">Sin bodegas asignadas</span>
                        : (linkedProfile.warehouse_ids||[]).map(wId=>{
                          const wh=warehouses.find(w=>w.id===wId);
                          return wh?<span key={wId} className="px-2.5 py-1 text-xs bg-indigo-900/30 text-indigo-300 rounded-full border border-indigo-800/50">{wh.name}</span>:null;
                        })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/50 border border-dashed border-slate-700 rounded-2xl p-8 text-center text-slate-500">
                <Shield size={32} className="mx-auto mb-3 opacity-40"/>
                <p className="text-sm">Vincula primero una cuenta de acceso para configurar los permisos operativos.</p>
              </div>
            )}
          </div>
        )}

        {/* DOCS TAB */}
        {activeTab === 'docs' && (
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6"><FolderOpen size={18} className="text-indigo-400"/> Expediente Digital</h2>
            <HRDocuments employees={[employee]} currentUser={currentUser} preselectedUserId={employee.id}/>
          </div>
        )}

        {/* BIOMETRIC TAB */}
        {activeTab === 'biometric' && (
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6"><Fingerprint size={18} className="text-indigo-400"/> Registro de Huella / Rostro</h2>
            <BiometricRegistration userId={employee.id} onComplete={()=>alert('Biometría guardada correctamente')} onCancel={()=>setActiveTab('info')}/>
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/50"><h3 className="font-semibold text-white">Línea de Tiempo</h3></div>
              <div className="p-6">
                {history.length===0 ? <div className="text-center text-slate-500 py-8">No hay registros en el historial.</div> : (
                  <div className="space-y-4">
                    {history.map(item=>(
                      <div key={item.id} className="flex items-start gap-4">
                        <div className="w-9 h-9 rounded-full border-2 border-slate-700 bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                          {item.event_type==='INGRESO' && <User size={15} className="text-emerald-400"/>}
                          {item.event_type==='ACTA_ADMINISTRATIVA' && <AlertCircle size={15} className="text-amber-400"/>}
                          {item.event_type==='LIQUIDACION' && <ShieldAlert size={15} className="text-red-400"/>}
                          {item.event_type==='CAMBIO_PUESTO' && <Briefcase size={15} className="text-blue-400"/>}
                          {!['INGRESO','ACTA_ADMINISTRATIVA','LIQUIDACION','CAMBIO_PUESTO'].includes(item.event_type) && <FileCheck size={15}/>}
                        </div>
                        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-bold text-slate-200 text-sm">{item.event_type.replace(/_/g,' ')}</div>
                            <time className="text-xs text-indigo-400">{new Date(item.event_date).toLocaleDateString()}</time>
                          </div>
                          <div className="text-slate-400 text-sm">{item.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {employee.status !== 'BAJA' && (
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm h-max sticky top-6">
                <h3 className="font-semibold text-white mb-4">Agregar Registro</h3>
                <form onSubmit={handleAddHistory} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Tipo de Evento</label>
                    <select value={historyForm.event_type} onChange={e=>setHistoryForm(p=>({...p,event_type:e.target.value}))} className={fieldCls}>
                      <option value="CAMBIO_PUESTO">Ascenso / Cambio Puesto</option>
                      <option value="ACTA_ADMINISTRATIVA">Acta Administrativa</option>
                      <option value="AMONESTACION">Amonestación</option>
                      <option value="CAPACITACION">Capacitación</option>
                      <option value="OTRO">Otro</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Fecha</label>
                    <input type="date" required value={historyForm.event_date} onChange={e=>setHistoryForm(p=>({...p,event_date:e.target.value}))} className={fieldCls}/>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Descripción / Detalles</label>
                    <textarea required rows="3" value={historyForm.description} onChange={e=>setHistoryForm(p=>({...p,description:e.target.value}))} className={`${fieldCls} resize-none`}/>
                  </div>
                  <button type="submit" disabled={addingHistory} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-700 disabled:opacity-50">
                    {addingHistory?'Guardando...':'Guardar Registro'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TERMINATION TAB */}
        {activeTab === 'termination' && (
          <div className="max-w-2xl">
            {(employee.status === 'BAJA' || employee.status === 'INACTIVO') ? (
              <div className="bg-red-900/10 border border-red-900/30 p-6 rounded-2xl flex flex-col gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-red-900/20 rounded-xl text-red-500 shrink-0"><ShieldAlert size={24}/></div>
                  <div>
                    <h3 className="text-lg font-semibold text-red-400 mb-1">Empleado Liquidado / Dado de Baja</h3>
                    <p className="text-slate-400 text-sm mb-2">Su cuenta fue bloqueada y desvinculada para evitar accesos no autorizados.</p>
                    <p className="text-slate-300 text-sm">Puedes reactivar su expediente en cualquier momento haciendo clic abajo.</p>
                  </div>
                </div>
                <div className="pt-3 border-t border-red-900/30 flex justify-end">
                  <button
                    onClick={handleReactivateEmployee}
                    disabled={reactivating}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    <UserCheck size={18} />
                    {reactivating ? 'Reactivando Empleado...' : 'Reactivar Empleado / Dar de Alta'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 p-6 rounded-2xl border border-red-900/30 shadow-sm space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-red-400 flex items-center gap-2 mb-2"><ShieldAlert size={20}/> Proceso de Baja Definitiva</h2>
                  <p className="text-slate-400 text-sm">Al ejecutar este proceso, el empleado pasará a INACTIVO y su cuenta de sistema será <strong>bloqueada inmediatamente</strong>.</p>
                </div>
                <form onSubmit={handleTerminateEmployee} className="space-y-4 bg-slate-950/50 p-6 rounded-xl border border-slate-800">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Motivo de Baja *</label>
                    <select required value={terminationForm.reason} onChange={e=>setTerminationForm(p=>({...p,reason:e.target.value}))} className={fieldCls}>
                      <option value="">Seleccionar motivo...</option>
                      <option value="Renuncia Voluntaria">Renuncia Voluntaria</option>
                      <option value="Despido Justificado">Despido Justificado</option>
                      <option value="Recorte de Personal">Recorte de Personal</option>
                      <option value="Fin de Contrato">Fin de Contrato</option>
                      <option value="Abandono de Trabajo">Abandono de Trabajo</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Fecha Efectiva de Baja *</label>
                    <input type="date" required value={terminationForm.event_date} onChange={e=>setTerminationForm(p=>({...p,event_date:e.target.value}))} className={fieldCls}/>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Comentarios / Notas de Finiquito</label>
                    <textarea required rows="4" placeholder="Agrega comentarios sobre el desempeño y si es recontratable..." value={terminationForm.description} onChange={e=>setTerminationForm(p=>({...p,description:e.target.value}))} className={`${fieldCls} resize-none`}/>
                  </div>
                  <div className="pt-4 border-t border-slate-800">
                    <button type="submit" disabled={terminating} className="w-full py-2.5 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white text-sm font-bold rounded-lg transition-colors border border-red-900/50 hover:border-red-600 disabled:opacity-50">
                      {terminating?'Procesando Baja...':'Confirmar Baja y Bloquear Accesos'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminEmployeeDetailPage;

