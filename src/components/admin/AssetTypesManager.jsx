import React, { useState, useEffect } from 'react';
import { getAssetTypes, addAssetType, deleteAssetType } from '@/repositories/metadataRepository';
import { Loader2, Plus, Trash2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

const AssetTypesManager = ({ onClose, onUpdate, isAdmin }) => {
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newType, setNewType] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fetchTypes = async () => {
        setLoading(true);
        try {
            const data = await getAssetTypes();
            setTypes(data || []);
        } catch (e) {
            setError('Error al cargar tipos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTypes();
    }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newType.trim()) return;
        
        setSubmitting(true);
        setError('');
        setSuccess('');
        
        try {
            await addAssetType(newType.trim());
            setNewType('');
            setSuccess('Tipo agregado con éxito.');
            await fetchTypes();
            if (onUpdate) onUpdate();
        } catch (e) {
            setError('Error al agregar tipo.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (name) => {
        if (!window.confirm(`¿Estás seguro de eliminar el tipo "${name}"? Esto podría afectar la visualización de activos existentes con este tipo.`)) return;
        
        setSubmitting(true);
        setError('');
        setSuccess('');
        
        try {
            await deleteAssetType(name);
            setSuccess('Tipo eliminado.');
            await fetchTypes();
            if (onUpdate) onUpdate();
        } catch (e) {
            setError('Error al eliminar tipo.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                    <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                        <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
                        Tipos de Activos
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {isAdmin && (
                        <form onSubmit={handleAdd} className="flex gap-2">
                            <input 
                                type="text" 
                                value={newType}
                                onChange={(e) => setNewType(e.target.value.toUpperCase())}
                                placeholder="NUEVO TIPO (EJ: MUEBLE)"
                                className="flex-grow bg-gray-950 border border-gray-800 rounded-2xl px-4 py-3 text-xs font-bold text-white focus:border-emerald-500 outline-none transition-all"
                                disabled={submitting}
                            />
                            <Button 
                                type="submit" 
                                disabled={submitting || !newType.trim()}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl px-4 py-3 h-auto"
                            >
                                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                            </Button>
                        </form>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    {success && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold">
                            <CheckCircle2 size={14} /> {success}
                        </div>
                    )}

                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="animate-spin text-blue-500" />
                            </div>
                        ) : types.length > 0 ? (
                            types.map(t => (
                                <div key={t} className="flex justify-between items-center bg-gray-950/50 p-4 rounded-2xl border border-gray-800 group hover:border-gray-700 transition-all">
                                    <span className="text-xs font-black text-gray-300 tracking-wider">{t}</span>
                                    {isAdmin && (
                                        <button 
                                            onClick={() => handleDelete(t)}
                                            className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                            disabled={submitting}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10 text-gray-600 text-xs font-bold uppercase italic">
                                No hay tipos registrados
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-gray-950/50 border-t border-gray-800">
                    <p className="text-[10px] text-gray-500 text-center font-bold uppercase tracking-widest">
                        Estos tipos aparecerán en filtros y registros de nuevos activos
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default AssetTypesManager;
