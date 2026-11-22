import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { uploadPhoto } from '@/lib/uploadService';
import {
  Plus,
  Search,
  Upload,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  X,
  RefreshCcw,
  User,
  Tag,
  Hash,
  AlignLeft
} from 'lucide-react';

export default function AdminEmployeeEquipment() {
  const [equipments, setEquipments] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  
  const [formData, setFormData] = useState({
    employee_id: '',
    equipment_type: 'CELULAR',
    serial_number: '',
    details: '',
  });

  const equipmentTypes = ['CELULAR', 'VEHICULO', 'UNIFORME', 'COMPUTADORA', 'HERRAMIENTA', 'OTRO'];
  const statusOptions = ['ASIGNADO', 'DEVUELTO', 'PERDIDO', 'DAÑADO'];

  useEffect(() => {
    fetchEquipments();
    fetchEmployeesList();
  }, []);

  const fetchEquipments = async () => {
    try {
      const { data, error } = await supabase
        .from('hr_employee_equipment')
        .select(`
          *,
          hr_employees:employee_id(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEquipments(data || []);
    } catch (error) {
      console.error('Error fetching equipment:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeesList = async () => {
    try {
      const { data, error } = await supabase
        .from('hr_employees')
        .select('id, first_name, last_name')
        .order('first_name');

      if (error) throw error;
      setEmployeesList(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error.message);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.employee_id) {
      alert('Por favor selecciona un empleado.');
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('hr_employee_equipment')
        .insert([{
          ...formData,
          status: 'ASIGNADO'
        }]);

      if (error) throw error;
      
      setIsModalOpen(false);
      setFormData({
        employee_id: '',
        equipment_type: 'CELULAR',
        serial_number: '',
        details: '',
      });
      fetchEquipments();
    } catch (error) {
      console.error('Error asignando equipo:', error.message);
      alert('Error al asignar el equipo.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('hr_employee_equipment')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      fetchEquipments();
    } catch (error) {
      console.error('Error updating status:', error.message);
      alert('Error al actualizar el estado.');
    }
  };

  const handleUploadResponsiva = async (e, id) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPdf(true);
    try {
      const url = await uploadPhoto(file, 'rrhh-docs');
      
      if (url) {
        const { error } = await supabase
          .from('hr_employee_equipment')
          .update({ responsiva_url: url })
          .eq('id', id);

        if (error) throw error;
        fetchEquipments();
      }
    } catch (error) {
      console.error('Error uploading responsiva:', error.message);
      alert('Error al subir el documento responsiva.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const filteredEquipments = equipments.filter(eq => {
    const fullName = eq.hr_employees ? `${eq.hr_employees.first_name} ${eq.hr_employees.last_name}`.toLowerCase() : '';
    return fullName.includes(searchTerm.toLowerCase()) ||
      eq.equipment_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.serial_number?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ASIGNADO': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'DEVUELTO': return <RefreshCcw className="w-4 h-4 text-blue-500" />;
      case 'DAÑADO': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'PERDIDO': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <CheckCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'ASIGNADO': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'DEVUELTO': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'DAÑADO': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'PERDIDO': return 'bg-red-900\/40 text-red-400 border-red-200';
      default: return 'bg-slate-800 text-slate-100 border-slate-700';
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Gestión de Equipos</h1>
          <p className="text-slate-400 text-sm mt-1">Administra la asignación y devolución de equipos a empleados.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Asignar Nuevo Equipo
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-800">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por empleado, tipo o número de serie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* Equipments Table */}
      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800">
                <th className="p-4 font-semibold text-slate-300 text-sm">Empleado</th>
                <th className="p-4 font-semibold text-slate-300 text-sm">Equipo</th>
                <th className="p-4 font-semibold text-slate-300 text-sm">Detalles</th>
                <th className="p-4 font-semibold text-slate-300 text-sm">Estado</th>
                <th className="p-4 font-semibold text-slate-300 text-sm">Responsiva (PDF)</th>
                <th className="p-4 font-semibold text-slate-300 text-sm text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    Cargando equipos...
                  </td>
                </tr>
              ) : filteredEquipments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    No se encontraron equipos asignados.
                  </td>
                </tr>
              ) : (
                filteredEquipments.map((eq) => (
                  <tr key={eq.id} className="hover:bg-slate-950/50/50 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-white">
                        {eq.hr_employees ? `${eq.hr_employees.first_name} ${eq.hr_employees.last_name}` : 'Desconocido'}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Asignado: {new Date(eq.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700">
                        {eq.equipment_type}
                      </div>
                      {eq.serial_number && (
                        <div className="text-xs text-slate-400 mt-1 font-mono">
                          SN: {eq.serial_number}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-300 max-w-xs truncate">
                      {eq.details || '-'}
                    </td>
                    <td className="p-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass(eq.status)}`}>
                        {getStatusIcon(eq.status)}
                        {eq.status}
                      </div>
                    </td>
                    <td className="p-4">
                      {eq.responsiva_url ? (
                        <a 
                          href={eq.responsiva_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                        >
                          <FileText className="w-4 h-4" />
                          Ver PDF
                        </a>
                      ) : (
                        <div className="relative">
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => handleUploadResponsiva(e, eq.id)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={uploadingPdf}
                          />
                          <button 
                            disabled={uploadingPdf}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-gray-200 rounded-md transition-colors border border-slate-700"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {uploadingPdf ? 'Subiendo...' : 'Subir Responsiva'}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={eq.status}
                          onChange={(e) => handleStatusChange(eq.id, e.target.value)}
                          className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-900 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                        >
                          {statusOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Asignar Equipo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-800">
              <h2 className="text-xl font-semibold text-white">Asignar Nuevo Equipo</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-slate-300 transition-colors p-1 rounded-full hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" /> Empleado
                </label>
                <select
                  name="employee_id"
                  value={formData.employee_id}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-700 rounded-lg focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                >
                  <option value="">Selecciona un empleado</option>
                  {employeesList.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-400" /> Tipo de Equipo
                  </label>
                  <select
                    name="equipment_type"
                    value={formData.equipment_type}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-700 rounded-lg focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                  >
                    {equipmentTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-gray-400" /> Número de Serie
                  </label>
                  <input
                    type="text"
                    name="serial_number"
                    value={formData.serial_number}
                    onChange={handleInputChange}
                    placeholder="Ej. SN-12345"
                    className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-700 rounded-lg focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  <AlignLeft className="w-4 h-4 text-gray-400" /> Detalles Adicionales
                </label>
                <textarea
                  name="details"
                  value={formData.details}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Marca, modelo, condiciones de entrega..."
                  className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-700 rounded-lg focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm resize-none"
                ></textarea>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Asignar Equipo'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
