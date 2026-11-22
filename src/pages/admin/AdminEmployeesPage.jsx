import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { 
  Users, Search, Plus, Filter, UserCheck, UserX, UserMinus, ChevronRight, UserCog, ScanFace, FolderOpen
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import BiometricRegistration from '@/components/admin/users/BiometricRegistration';
import HRDocuments from '@/pages/hr/HRDocuments';
import HRSettingsDialog from '@/components/admin/users/HRSettingsDialog';

const AdminEmployeesPage = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVOS'); // ACTIVOS, BAJAS, TODOS
  const [error, setError] = useState(null);

  const [departments, setDepartments] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);

  const [biometricUser, setBiometricUser] = useState(null);
  const [docsUser, setDocsUser] = useState(null);
  const [isHRSettingsOpen, setIsHRSettingsOpen] = useState(false);

  // Modal para alta rápida
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    employee_number: '',
    department: '',
    job_title: '',
    hire_date: new Date().toISOString().split('T')[0],
    phone: '',
    emergency_contact: '',
    curp: '',
    rfc: '',
    nss: ''
  });

  useEffect(() => {
    fetchEmployees();
  }, [statusFilter]);

  useEffect(() => {
    const fetchSelectOptions = async () => {
      try {
        const { data: depts } = await supabase.from('departments').select('*').order('name');
        const { data: jobs } = await supabase.from('job_titles').select('*').order('name');
        if (depts) setDepartments(depts);
        if (jobs) setJobTitles(jobs);
      } catch (err) {
        console.error('Error fetching select options:', err);
      }
    };
    fetchSelectOptions();
  }, []);

  // Obtiene el siguiente número de empleado disponible
  const getNextEmployeeNumber = async () => {
    try {
      const { data } = await supabase
        .from('hr_employees')
        .select('employee_number')
        .not('employee_number', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!data || data.length === 0) return '001';

      // Extraer solo los que son numéricos y encontrar el máximo
      const nums = data
        .map(e => parseInt(e.employee_number, 10))
        .filter(n => !isNaN(n));

      if (nums.length === 0) return '001';
      const next = Math.max(...nums) + 1;
      // Mantener el mismo número de dígitos que el último (ej. 001, 002...)
      const maxStr = String(Math.max(...nums));
      return String(next).padStart(maxStr.length, '0');
    } catch {
      return '';
    }
  };

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let query = supabase
        .from('hr_employees')
        .select(`
          *,
          profiles(email, role)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter === 'ACTIVOS') {
        query = query.in('status', ['ACTIVO', 'ONBOARDING']);
      } else if (statusFilter === 'BAJAS') {
        query = query.in('status', ['BAJA', 'INACTIVO']);
      }

      const { data, error: err } = await query;
      
      if (err) throw err;
      setEmployees(data || []);
    } catch (err) {
      console.error('Error fetching employees:', err.message);
      setError('Error al cargar la lista de empleados.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleReactivateEmployee = async (emp) => {
    if (!window.confirm(`¿Confirmas que deseas REACTIVAR a ${emp.first_name} ${emp.last_name} y cambiar su estatus a ACTIVO?`)) return;
    try {
      setLoading(true);
      await supabase.from('hr_employees').update({ status: 'ACTIVO' }).eq('id', emp.id);
      await supabase.from('hr_employee_history').insert([{
        employee_id: emp.id,
        event_type: 'REINGRESO',
        description: 'Reactivación de empleado / Reingreso por RRHH',
        event_date: new Date().toISOString().split('T')[0]
      }]);
      if (emp.active_profile_id) {
        await supabase.from('profiles').update({ is_active: true }).eq('id', emp.active_profile_id);
      }
      await fetchEmployees();
      alert(`✅ Empleado ${emp.first_name} ${emp.last_name} reactivado exitosamente.`);
    } catch (err) {
      console.error('Error reactivando empleado:', err);
      alert('Error al reactivar empleado: ' + (err.message || 'Inténtalo de nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Insertar empleado físico
      const { data: newEmployee, error: insertError } = await supabase
        .from('hr_employees')
        .insert([{
          first_name: formData.first_name,
          last_name: formData.last_name || '',
          employee_number: formData.employee_number || null,
          department: formData.department,
          job_title: formData.job_title,
          hire_date: formData.hire_date,
          phone: formData.phone || null,
          emergency_contact: formData.emergency_contact || null,
          curp: formData.curp || null,
          rfc: formData.rfc || null,
          nss: formData.nss || null,
          status: 'ACTIVO'
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. Registrar en historial el alta
      await supabase
        .from('hr_employee_history')
        .insert([{
          employee_id: newEmployee.id,
          event_type: 'INGRESO',
          event_date: formData.hire_date,
          description: `Alta en sistema como ${formData.job_title} en ${formData.department}`
        }]);

      setIsModalOpen(false);
      // Navegar a la ficha completa del empleado recién creado para que puedan subir documentos, biometría, rutas, etc.
      navigate(`/admin/hr/employees/${newEmployee.id}`);
    } catch (err) {
      console.error('Error creating employee:', err.message);
      alert('Error al crear empleado. Verifica que el número de empleado no esté repetido.');
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return fullName.includes(searchLower) || 
           (emp.employee_number && emp.employee_number.toLowerCase().includes(searchLower)) ||
           (emp.job_title && emp.job_title.toLowerCase().includes(searchLower));
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVO':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 flex items-center gap-1.5 w-max"><UserCheck size={14}/> Activo</span>;
      case 'ONBOARDING':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-900/40 text-blue-400 border border-blue-800/50 flex items-center gap-1.5 w-max"><UserCog size={14}/> En Proceso</span>;
      case 'BAJA':
      case 'INACTIVO':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-900/40 text-red-400 border border-red-800/50 flex items-center gap-1.5 w-max"><UserMinus size={14}/> Baja</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700 w-max">{status}</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Users size={24} />
            </div>
            Directorio de Personal
          </h1>
          <p className="text-slate-400 text-sm mt-2">Gestiona el expediente físico de tus empleados, altas y bajas.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={() => setIsHRSettingsOpen(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors w-full md:w-auto shadow-sm shadow-emerald-900/20"
          >
            Estructura RH
          </button>
          <button 
            onClick={async () => {
              const nextNum = await getNextEmployeeNumber();
              setFormData(prev => ({ ...prev, employee_number: nextNum }));
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors w-full md:w-auto shadow-sm shadow-indigo-900/20"
          >
            <Plus size={18} />
            Nuevo Empleado
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nombre, puesto o número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-200 placeholder:text-slate-600 text-sm"
          />
        </div>
        
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800 w-full md:w-auto overflow-x-auto shrink-0">
          {['ACTIVOS', 'BAJAS', 'TODOS'].map(filter => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                statusFilter === filter 
                  ? 'bg-slate-800 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {filter.charAt(0) + filter.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-xl flex items-start gap-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Employee List */}
      <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                <th className="p-4 font-medium">Empleado</th>
                <th className="p-4 font-medium">Puesto y Depto</th>
                <th className="p-4 font-medium">Ingreso</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium">Cuenta Vinculada</th>
                <th className="p-4 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">Cargando directorio...</td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500 flex flex-col items-center">
                    <UserX size={48} className="text-slate-700 mb-3" />
                    <p>No se encontraron empleados.</p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold border border-slate-700">
                          {emp.first_name.charAt(0)}{emp.last_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200">{emp.first_name} {emp.last_name}</div>
                          <div className="text-xs text-slate-500">#{emp.employee_number || 'Sin Num'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium text-slate-300">{emp.job_title || '-'}</div>
                      <div className="text-xs text-slate-500">{emp.department || '-'}</div>
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-4">
                      {getStatusBadge(emp.status)}
                    </td>
                    <td className="p-4">
                      {emp.active_profile_id ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-indigo-400 truncate max-w-[150px]" title={emp.profiles?.email}>
                            {emp.profiles?.email || 'Vinculado'}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase">{emp.profiles?.role}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">No vinculado</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(emp.status === 'BAJA' || emp.status === 'INACTIVO') && (
                          <button
                            onClick={() => handleReactivateEmployee(emp)}
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600 hover:text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                            title="Reactivar Empleado (Reingreso)"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Reactivar
                          </button>
                        )}
                        <button 
                          onClick={() => setBiometricUser(emp)}
                          className="p-1.5 bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 rounded-lg transition-colors border"
                          title="Registro Facial"
                        >
                          <ScanFace className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setDocsUser(emp)}
                          className="p-1.5 bg-rose-500/20 border-rose-500/30 text-rose-300 hover:bg-rose-500/30 rounded-lg transition-colors border"
                          title="Ver Documentos"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                        <Link 
                          to={`/admin/hr/employees/${emp.id}`}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-700 hover:border-slate-600"
                        >
                          Ficha
                          <ChevronRight size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Alta Rápida */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-950/50">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Plus className="text-indigo-500" /> Nuevo Empleado
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateEmployee} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">Nombre(s) *</label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">Apellidos *</label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">Nº de Empleado (Opcional)</label>
                <input
                  type="text"
                  name="employee_number"
                  value={formData.employee_number}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-slate-400 uppercase">Departamento</Label>
                  <Select 
                    value={formData.department} 
                    onValueChange={(v) => handleInputChange({ target: { name: 'department', value: v } })}
                  >
                    <SelectTrigger className="bg-slate-950/50 border-slate-800 rounded-lg h-10 text-sm text-white focus-visible:ring-indigo-500">
                      <SelectValue placeholder="Seleccionar depto..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {departments.length === 0 && <SelectItem value="loading" disabled>Cargando deptos...</SelectItem>}
                      {departments.map(d => (
                        <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-slate-400 uppercase">Puesto</Label>
                  <Select 
                    value={formData.job_title} 
                    onValueChange={(v) => handleInputChange({ target: { name: 'job_title', value: v } })}
                  >
                    <SelectTrigger className="bg-slate-950/50 border-slate-800 rounded-lg h-10 text-sm text-white focus-visible:ring-indigo-500">
                      <SelectValue placeholder="Seleccionar puesto..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {jobTitles.length === 0 && <SelectItem value="loading" disabled>Cargando puestos...</SelectItem>}
                      {jobTitles.map(j => (
                        <SelectItem key={j.id} value={j.name}>{j.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">Fecha de Ingreso *</label>
                <input
                  type="date"
                  name="hire_date"
                  required
                  value={formData.hire_date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">Teléfono</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="10 dígitos"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">Contacto de Emergencia</label>
                  <input
                    type="text"
                    name="emergency_contact"
                    value={formData.emergency_contact}
                    onChange={handleInputChange}
                    placeholder="Nombre y número"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">RFC</label>
                  <input
                    type="text"
                    name="rfc"
                    value={formData.rfc}
                    onChange={handleInputChange}
                    placeholder="13 caracteres"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">CURP</label>
                  <input
                    type="text"
                    name="curp"
                    value={formData.curp}
                    onChange={handleInputChange}
                    placeholder="18 caracteres"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">NSS</label>
                  <input
                    type="text"
                    name="nss"
                    value={formData.nss}
                    onChange={handleInputChange}
                    placeholder="11 dígitos"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Biometric Modal */}
      <Dialog open={!!biometricUser} onOpenChange={(open) => !open && setBiometricUser(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Registro Biométrico</DialogTitle>
            <DialogDescription className="text-slate-400">
              Capture y registre el rostro de {biometricUser?.first_name} {biometricUser?.last_name}
            </DialogDescription>
          </DialogHeader>
          {biometricUser && (
            <BiometricRegistration
              userId={biometricUser.id}
              onComplete={() => { setBiometricUser(null); fetchEmployees(); }}
              onCancel={() => setBiometricUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Docs Modal */}
      <Dialog open={!!docsUser} onOpenChange={(open) => !open && setDocsUser(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-rose-400" />
              Expediente — {docsUser?.first_name} {docsUser?.last_name}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Documentos registrados para este empleado. Solo visibles por RRHH y Administración.
            </DialogDescription>
          </DialogHeader>
          {docsUser && (
            <HRDocuments
              employees={employees}
              currentUser={null}
              preselectedUserId={docsUser.id}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* HR Settings Modal */}
      <HRSettingsDialog
        isOpen={isHRSettingsOpen}
        onClose={() => setIsHRSettingsOpen(false)}
        onSaveSuccess={() => {
          // Refrescar departamentos y puestos al cerrar
          const fetchSelectOptions = async () => {
            const { data: depts } = await supabase.from('departments').select('*').order('name');
            const { data: jobs } = await supabase.from('job_titles').select('*').order('name');
            if (depts) setDepartments(depts);
            if (jobs) setJobTitles(jobs);
          };
          fetchSelectOptions();
        }}
      />

    </div>
  );
};

export default AdminEmployeesPage;
