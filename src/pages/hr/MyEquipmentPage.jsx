import React, { useState, useEffect } from 'react';
import { supabase } from '@/mysqlClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Smartphone, Truck, Shirt, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';

const MyEquipmentPage = () => {
  const { user } = useSupabaseAuth();
  const [equipmentList, setEquipmentList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchMyEquipment();
    }
  }, [user]);

  const fetchMyEquipment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hr_employee_equipment')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      setEquipmentList(data || []);
    } catch (error) {
      console.error('Error fetching equipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIconForType = (type) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('celular') || t.includes('teléfono') || t.includes('smartphone')) return <Smartphone className="w-8 h-8 text-blue-500" />;
    if (t.includes('vehículo') || t.includes('auto') || t.includes('carro')) return <Truck className="w-8 h-8 text-orange-500" />;
    if (t.includes('uniforme') || t.includes('ropa') || t.includes('camisa')) return <Shirt className="w-8 h-8 text-green-500" />;
    return <ShieldCheck className="w-8 h-8 text-indigo-500" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (equipmentList.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold text-white mb-8">Mis Equipos</h1>
        <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 p-12 text-center">
          <div className="mx-auto w-24 h-24 bg-slate-950/50 rounded-full flex items-center justify-center mb-6">
            <ShieldCheck className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">No tienes equipos asignados</h2>
          <p className="text-slate-400 max-w-md mx-auto">
            Actualmente no hay ningún equipo o herramienta de trabajo registrada a tu nombre en el sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Mis Equipos Asignados</h1>
        <p className="text-slate-400 mt-2">Gestiona y revisa el equipo de trabajo que tienes bajo tu resguardo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {equipmentList.map((item) => (
          <div 
            key={item.id} 
            className="group bg-slate-900 rounded-2xl border border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-slate-950/50 rounded-xl group-hover:bg-indigo-50 transition-colors duration-200">
                  {getIconForType(item.tipo_equipo)}
                </div>
                <div className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Activo
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-white mb-1">{item.nombre_equipo || item.tipo_equipo}</h3>
              <p className="text-sm font-medium text-indigo-600 mb-4">{item.marca} {item.modelo}</p>
              
              <div className="space-y-3">
                {item.imei && (
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">IMEI</span>
                    <span className="text-sm text-white">{item.imei}</span>
                  </div>
                )}
                {item.numero_serie && (
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">No. Serie</span>
                    <span className="text-sm text-white">{item.numero_serie}</span>
                  </div>
                )}
                {item.descripcion && (
                  <div className="flex flex-col pt-2 border-t border-gray-50">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Detalles</span>
                    <span className="text-sm text-slate-200 line-clamp-2">{item.descripcion}</span>
                  </div>
                )}
                <div className="flex flex-col pt-2 border-t border-gray-50">
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Fecha Asignación</span>
                  <span className="text-sm text-white">
                    {item.fecha_asignacion ? new Date(item.fecha_asignacion).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
            
            {item.responsiva_url && (
              <div className="px-6 py-4 bg-slate-950/50 border-t border-slate-800">
                <a
                  href={item.responsiva_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-slate-900 border border-slate-700 text-slate-200 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200"
                >
                  <FileText className="w-4 h-4" />
                  Ver Responsiva Firmada
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyEquipmentPage;
