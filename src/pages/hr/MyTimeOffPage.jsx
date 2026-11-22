import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Calendar, Plus, Clock, FileText, CheckCircle, XCircle } from 'lucide-react';
import { uploadPhoto } from '@/lib/uploadService';

const MyTimeOffPage = () => {
  const { session } = useSupabaseAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form state
  const [type, setType] = useState('VACACIONES');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session?.user?.id) {
      fetchRequests();
    }
  }, [session]);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hr_time_off_requests')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRequests(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason) {
      setError('Por favor, completa los campos obligatorios.');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      let proof_url = null;
      if (file) {
        proof_url = await uploadPhoto(file, 'rrhh-docs');
      }

      const { error: insertError } = await supabase
        .from('hr_time_off_requests')
        .insert({
          user_id: session.user.id,
          type,
          start_date: startDate,
          end_date: endDate,
          reason,
          proof_url,
          status: 'PENDIENTE'
        });

      if (insertError) {
        setError('Error al crear la solicitud: ' + insertError.message);
      } else {
        setIsModalOpen(false);
        resetForm();
        fetchRequests();
      }
    } catch (err) {
      console.error('Error al enviar la solicitud:', err);
      setError('Error inesperado al enviar: ' + (err.message || 'Desconocido'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setType('VACACIONES');
    setStartDate('');
    setEndDate('');
    setReason('');
    setFile(null);
    setError('');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDIENTE':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-900\/40 text-yellow-400 flex items-center gap-1"><Clock size={12} /> PENDIENTE</span>;
      case 'APROBADO':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900\/40 text-green-400 flex items-center gap-1"><CheckCircle size={12} /> APROBADO</span>;
      case 'RECHAZADO':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-900\/40 text-red-400 flex items-center gap-1"><XCircle size={12} /> RECHAZADO</span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-100">{status}</span>;
    }
  };

  return (
    <>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Calendar className="text-blue-600" />
            Mis Vacaciones y Permisos
          </h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus size={18} />
            Nueva Solicitud
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-8 text-center text-slate-400">
            No tienes solicitudes de permisos registradas.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {requests.map((req) => (
              <div key={req.id} className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-5 hover:shadow-md transition">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-slate-100">{req.type}</h3>
                  {getStatusBadge(req.status)}
                </div>
                <div className="text-sm text-slate-300 space-y-2">
                  <p><strong>Desde:</strong> {new Date(req.start_date).toLocaleDateString()}</p>
                  <p><strong>Hasta:</strong> {new Date(req.end_date).toLocaleDateString()}</p>
                  <p className="line-clamp-2"><strong>Motivo:</strong> {req.reason}</p>
                  {req.proof_url && (
                    <a
                      href={req.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 mt-2 inline-flex"
                    >
                      <FileText size={14} /> Ver comprobante
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl shadow-lg max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Nueva Solicitud</h2>
            
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Tipo de Permiso</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full p-2 bg-slate-800 text-slate-100 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                >
                  <option className="bg-slate-800 text-slate-100" value="VACACIONES">Vacaciones</option>
                  <option className="bg-slate-800 text-slate-100" value="ENFERMEDAD">Enfermedad</option>
                  <option className="bg-slate-800 text-slate-100" value="PERMISO_PERSONAL">Permiso Personal</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2 bg-slate-800 text-slate-100 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Fecha Fin</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2 bg-slate-800 text-slate-100 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Motivo</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-2 bg-slate-800 text-slate-100 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                  placeholder="Explica brevemente el motivo..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Comprobante (opcional)</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  accept="image/*,.pdf"
                />
                <p className="text-xs text-slate-400 mt-1">Imágenes o PDF. Máx 5MB.</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg transition"
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Enviando...' : 'Enviar Solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default MyTimeOffPage;
