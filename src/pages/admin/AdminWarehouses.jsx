
import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Loader2, PlusCircle, Edit, Save, X, Warehouse } from 'lucide-react';

const AdminWarehouses = () => {
    const [warehouses, setWarehouses] = useState([]);
    const [installers, setInstallers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingRowId, setEditingRowId] = useState(null);
    const [newWarehouseName, setNewWarehouseName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: warehousesData, error: warehousesError } = await supabase
                    .from('warehouses')
                    .select('id, name, owner_profile, profiles(id, name)'); // CORREGIDO: de full_name a name

                if (warehousesError) throw warehousesError;
                setWarehouses(warehousesData);

                const { data: installersData, error: installersError } = await supabase
                    .from('profiles')
                    .select('id, name') // CORREGIDO: de full_name a name
                    .in('role', ['installer', 'instalador']);

                if (installersError) throw installersError;
                setInstallers(installersData);

            } catch (err) {
                setError(`Error al cargar datos: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newWarehouseName.trim()) {
            setError('El nombre del almacén no puede estar vacío.');
            return;
        }
        setSubmitting(true);
        setError('');

        try {
            const { data: newWarehouse, error } = await supabase
                .from('warehouses')
                .insert({ name: newWarehouseName.trim() })
                .select('id, name, owner_profile, profiles(id, name)') // CORREGIDO: de full_name a name
                .single();

            if (error) throw error;
            
            setWarehouses(prev => [...prev, newWarehouse]);
            setNewWarehouseName('');

        } catch (err) {
            setError(`Error al crear el almacén: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateOwner = async (warehouseId, newOwnerId) => {
        setSubmitting(true);
        const ownerToSet = newOwnerId === '' ? null : newOwnerId;

        try {
            const { data: updatedWarehouse, error } = await supabase
                .from('warehouses')
                .update({ owner_profile: ownerToSet })
                .eq('id', warehouseId)
                .select('id, name, owner_profile, profiles(id, name)') // CORREGIDO: de full_name a name
                .single();

            if (error) throw error;

            setWarehouses(warehouses.map(w => w.id === warehouseId ? updatedWarehouse : w));
            setEditingRowId(null); // Exit editing mode

        } catch (err) {
            setError(`Error al actualizar el propietario: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };
    
    if (loading) {
        return <div className="p-4 text-center text-white flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /><span className="ml-3">Cargando Almacenes...</span></div>;
    }

    return (
        <div className="p-4 md:p-6 bg-gray-900 text-white min-h-screen">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <Warehouse className="h-8 w-8 text-green-400"/>
                    <h1 className="text-3xl font-bold text-white">Gestión de Almacenes</h1>
                </div>

                {/* --- Create Warehouse Form --- */}
                <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Crear Nuevo Almacén</h2>
                    <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4">
                        <input
                            type="text"
                            value={newWarehouseName}
                            onChange={(e) => setNewWarehouseName(e.target.value)}
                            placeholder="Nombre del nuevo almacén (ej: Camioneta 1)"
                            className="flex-grow bg-gray-700 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500"
                            disabled={submitting}
                        />
                        <button type="submit" disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md flex items-center justify-center gap-2 disabled:opacity-50">
                            {submitting && !editingRowId ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlusCircle className="h-5 w-5"/>}
                            Crear
                        </button>
                    </form>
                </div>
                
                {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md text-center my-4">{error}</div>}

                {/* --- Warehouses Table --- */}
                <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="p-4 font-semibold">Nombre del Almacén</th>
                                <th className="p-4 font-semibold">Propietario (Instalador)</th>
                                <th className="p-4 font-semibold text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {warehouses.map(w => (
                                <tr key={w.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                    <td className="p-4">{w.name}</td>
                                    <td className="p-4">
                                        {editingRowId === w.id ? (
                                            <select
                                                defaultValue={w.owner_profile || ''}
                                                onChange={(e) => handleUpdateOwner(w.id, e.target.value)}
                                                className="bg-gray-600 border border-gray-500 rounded-md py-1 px-2 focus:outline-none focus:ring-green-500 focus:border-green-500"
                                            >
                                                <option value="">-- Sin Asignar --</option>
                                                {installers.map(i => (
                                                    <option key={i.id} value={i.id}>{i.name}</option> // CORREGIDO: de full_name a name
                                                ))}
                                            </select>
                                        ) : (
                                            w.profiles?.name || <span className="text-gray-400">Sin Asignar</span> // CORREGIDO: de full_name a name
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingRowId === w.id ? (
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => setEditingRowId(null)} className="p-2 text-gray-400 hover:text-white"><X className="h-5 w-5"/></button>
                                            </div>
                                        ) : (
                                            <button onClick={() => { setEditingRowId(w.id); setError(''); }} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-md flex items-center gap-2 disabled:opacity-50">
                                                <Edit className="h-4 w-4"/>
                                                Asignar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {warehouses.length === 0 && (
                        <div className="text-center p-6 text-gray-400">No hay almacenes creados.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminWarehouses;
