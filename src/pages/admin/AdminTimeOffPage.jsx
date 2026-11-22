import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { 
  CheckCircle, 
  XCircle, 
  FileText, 
  Filter, 
  Clock, 
  AlertCircle,
  Search
} from 'lucide-react';

const AdminTimeOffPage = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('Todos'); // Todos, pending, approved, rejected
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    fetchCurrentUser();
    fetchRequests();
  }, []);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('hr_time_off_requests')
        .select(`
          *,
          hr_employees:employee_id(first_name, last_name, job_title)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error("Error fetching time off requests:", err);
      setError('Error al cargar las solicitudes. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    if (!currentUser) {
      alert("No se pudo identificar al usuario actual.");
      return;
    }

    try {
      const { error } = await supabase
        .from('hr_time_off_requests')
        .update({ 
          status: newStatus,
          approver_id: currentUser.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      
      // Actualizar estado local
      setRequests(requests.map(req => 
        req.id === id ? { ...req, status: newStatus, approver_id: currentUser.id } : req
      ));
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Error al actualizar el estado de la solicitud.");
    }
  };

  const filteredRequests = requests.filter(req => {
    if (filterStatus === 'Todos') return true;
    return req.status === filterStatus;
  });

  const getStatusBadge = (status) => {
    switch(status) {
      case 'APROBADO':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-900\/40 text-green-400 flex items-center gap-1 w-max"><CheckCircle size={14}/> Aprobado</span>;
      case 'RECHAZADO':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-900\/40 text-red-400 flex items-center gap-1 w-max"><XCircle size={14}/> Rechazado</span>;
      case 'PENDIENTE':
      default:
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-900\/40 text-yellow-400 flex items-center gap-1 w-max"><Clock size={14}/> Pendiente</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-950/50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Bandeja de Permisos</h1>
            <p className="text-slate-400 mt-1">Gestiona las solicitudes de permisos y vacaciones del equipo</p>
          </div>
          
          <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-lg shadow-sm border border-slate-700 w-full sm:w-auto">
            <Filter size={18} className="text-gray-400 ml-2" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-900 border-none text-sm focus:ring-0 cursor-pointer text-slate-200 outline-none pr-4"
            >
              <option className="bg-slate-800 text-slate-100" value="Todos">Todos los estados</option>
              <option className="bg-slate-800 text-slate-100" value="PENDIENTE">Pendientes</option>
              <option className="bg-slate-800 text-slate-100" value="APROBADO">Aprobados</option>
              <option className="bg-slate-800 text-slate-100" value="RECHAZADO">Rechazados</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="text-red-500 mt-0.5" size={20} />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-700 border-t-blue-600 mb-4"></div>
              <p className="text-slate-400">Cargando solicitudes...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="bg-slate-800 p-4 rounded-full mb-4">
                <Search size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-white">No hay solicitudes</h3>
              <p className="text-slate-400 mt-1">No se encontraron solicitudes con el filtro actual.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-700 text-sm text-slate-400">
                    <th className="py-4 px-6 font-medium">Empleado</th>
                    <th className="py-4 px-6 font-medium">Tipo</th>
                    <th className="py-4 px-6 font-medium">Fechas</th>
                    <th className="py-4 px-6 font-medium">Motivo</th>
                    <th className="py-4 px-6 font-medium text-center">Justificante</th>
                    <th className="py-4 px-6 font-medium">Estado</th>
                    <th className="py-4 px-6 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm text-slate-200">
                  {filteredRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-950/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-medium text-white">
                          {req.hr_employees ? `${req.hr_employees.first_name} ${req.hr_employees.last_name}` : 'Usuario Desconocido'}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {req.hr_employees?.job_title || 'Empleado'}
                        </div>
                      </td>
                      <td className="py-4 px-6 capitalize">
                        {req.type?.replace('_', ' ')}
                      </td>
                      <td className="py-4 px-6">
                        <div className="whitespace-nowrap">Del: <span className="font-medium">{req.start_date}</span></div>
                        <div className="whitespace-nowrap">Al: <span className="font-medium">{req.end_date}</span></div>
                      </td>
                      <td className="py-4 px-6 max-w-xs truncate" title={req.reason}>
                        {req.reason || '-'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {req.proof_url ? (
                          <a 
                            href={req.proof_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                            title="Ver justificante"
                          >
                            <FileText size={18} />
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        {getStatusBadge(req.status)}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {req.status === 'PENDIENTE' ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleUpdateStatus(req.id, 'APROBADO')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                            >
                              <CheckCircle size={14} /> Aprobar
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(req.id, 'RECHAZADO')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                            >
                              <XCircle size={14} /> Rechazar
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">
                            {req.status === 'APROBADO' ? 'Aprobado' : 'Rechazado'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminTimeOffPage;
