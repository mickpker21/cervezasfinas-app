import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/supabaseClient';
import { Map, Plus, Trash2, Save, MapPin, Truck, Crosshair, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TIPO_VENTAS = 'ventas';
const TIPO_REPARTO = 'reparto';
const TIPO_CONQUISTA = 'conquista';

export default function ZonasRutasCatalogDialog({ isOpen, onClose }) {
  const { toast } = useToast();
  const [zonas, setZonas] = useState({});
  const [loading, setLoading] = useState(true);
  const [newZonaName, setNewZonaName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      // Intentamos traer tipo_ruta. Si da error porque no existe la columna, lo manejamos.
      const { data, error } = await supabase.from('zonas_rutas').select('id, zona, ruta, tipo_ruta').order('zona');
      
      if (error) {
        // Fallback: Si tipo_ruta no existe, pedimos solo zona y ruta
        if (error.message.includes('tipo_ruta')) {
          console.warn("Columna tipo_ruta no existe, obteniendo sin ella");
          const { data: fallbackData } = await supabase.from('zonas_rutas').select('id, zona, ruta').order('zona');
          if (fallbackData) processData(fallbackData);
        } else {
          throw error;
        }
      } else {
        processData(data);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "No se pudo cargar el catálogo.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const processData = (data) => {
    const grouped = {};
    (data || []).forEach(row => {
      if (!row.zona) return;
      if (!grouped[row.zona]) {
        grouped[row.zona] = { ventas: [], reparto: [], conquista: [] };
      }
      if (row.ruta) {
        // Asignar tipo_ruta o ventas por defecto
        const tipo = row.tipo_ruta || TIPO_VENTAS;
        if (grouped[row.zona][tipo]) {
          grouped[row.zona][tipo].push({ id: row.id, name: row.ruta });
        } else {
          // Fallback if bad data
          grouped[row.zona][TIPO_VENTAS].push({ id: row.id, name: row.ruta });
        }
      }
    });
    setZonas(grouped);
  };

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  const handleAddZona = () => {
    const trimmed = newZonaName.trim().toUpperCase();
    if (!trimmed) return;
    if (zonas[trimmed]) {
      toast({ title: "Atención", description: "La zona ya existe." });
      return;
    }
    setZonas({ ...zonas, [trimmed]: { ventas: [], reparto: [], conquista: [] } });
    setNewZonaName("");
  };

  const handleDeleteZona = async (zonaName) => {
    if (!confirm(`¿Eliminar la zona ${zonaName} y TODAS sus rutas?`)) return;
    
    try {
      const { error } = await supabase.from('zonas_rutas').delete().eq('zona', zonaName);
      if (error) throw error;
      
      const newZonas = { ...zonas };
      delete newZonas[zonaName];
      setZonas(newZonas);
      toast({ title: "Zona Eliminada" });
    } catch (e) {
      toast({ title: "Error", description: "No se pudo eliminar la zona.", variant: "destructive" });
    }
  };

  const handleAddRuta = async (zonaName, tipo) => {
    const rutaName = prompt(`Ingrese nombre de la nueva ruta de ${tipo} para ${zonaName}:`);
    if (!rutaName || !rutaName.trim()) return;
    const cleanRuta = rutaName.trim().toUpperCase();

    try {
      // Upsert para actualizar tipo_ruta o insertar nuevo
      const { data, error } = await supabase.from('zonas_rutas').upsert(
        { zona: zonaName, ruta: cleanRuta, tipo_ruta: tipo },
        { onConflict: 'zona,ruta', select: 'id, zona, ruta, tipo_ruta' }
      );

      if (error) {
        // Fallback si tipo_ruta no existe en BD
        if (error.message.includes('tipo_ruta')) {
          toast({ title: "Error de Base de Datos", description: "Falta la columna 'tipo_ruta' en Supabase. Corre el script SQL.", variant: "destructive" });
          return;
        }
        throw error;
      }

      loadData(); // Recargar para obtener el ID real
      toast({ title: "Ruta agregada" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "No se pudo agregar la ruta.", variant: "destructive" });
    }
  };

  const handleDeleteRuta = async (id, rutaName) => {
    if (!confirm(`¿Quitar la ruta ${rutaName}?`)) return;
    try {
      const { error } = await supabase.from('zonas_rutas').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (e) {
      toast({ title: "Error", description: "No se pudo eliminar la ruta.", variant: "destructive" });
    }
  };

  const filteredZonas = Object.keys(zonas).filter(z => z.toLowerCase().includes(searchTerm.toLowerCase())).sort();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-[#1e213a] text-white border-none shadow-2xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Map className="text-green-400" /> Catálogo de Zonas y Rutas
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Define qué rutas de Ventas, Reparto y Conquista pertenecen a cada Zona Comercial.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 my-2">
          <Input 
            value={newZonaName} 
            onChange={e => setNewZonaName(e.target.value)}
            placeholder="NUEVA ZONA..."
            className="bg-black/20 border-white/10 uppercase"
            onKeyDown={(e) => e.key === 'Enter' && handleAddZona()}
          />
          <Button onClick={handleAddZona} className="bg-green-600 hover:bg-green-500 text-white">
            <Plus className="w-4 h-4 mr-1" /> Crear Zona
          </Button>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar zona..."
            className="pl-9 bg-black/40 border-white/10"
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-4">
          {loading ? (
            <div className="text-center py-10 text-slate-500">Cargando catálogo...</div>
          ) : (
            <AnimatePresence>
              {filteredZonas.map(zona => (
                <motion.div key={zona} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/10">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <MapPin className="text-amber-500 w-5 h-5" /> {zona}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteZona(zona)} className="text-red-400 hover:text-red-300 hover:bg-red-500/20">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Ventas */}
                    <div className="bg-black/20 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-green-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> Ventas
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => handleAddRuta(zona, TIPO_VENTAS)} className="h-6 w-6 p-0 text-white/50 hover:text-white">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {zonas[zona].ventas.map(r => (
                          <span key={r.id} className="bg-green-500/20 text-green-300 text-xs px-2 py-1 rounded-md flex items-center gap-1">
                            {r.name}
                            <Trash2 className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => handleDeleteRuta(r.id, r.name)} />
                          </span>
                        ))}
                        {zonas[zona].ventas.length === 0 && <span className="text-xs text-white/20">Sin rutas</span>}
                      </div>
                    </div>

                    {/* Reparto */}
                    <div className="bg-black/20 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-blue-400 flex items-center gap-1">
                          <Truck className="w-3 h-3" /> Reparto
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => handleAddRuta(zona, TIPO_REPARTO)} className="h-6 w-6 p-0 text-white/50 hover:text-white">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {zonas[zona].reparto.map(r => (
                          <span key={r.id} className="bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-md flex items-center gap-1">
                            {r.name}
                            <Trash2 className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => handleDeleteRuta(r.id, r.name)} />
                          </span>
                        ))}
                        {zonas[zona].reparto.length === 0 && <span className="text-xs text-white/20">Sin rutas</span>}
                      </div>
                    </div>

                    {/* Conquista */}
                    <div className="bg-black/20 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-purple-400 flex items-center gap-1">
                          <Crosshair className="w-3 h-3" /> Conquista
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => handleAddRuta(zona, TIPO_CONQUISTA)} className="h-6 w-6 p-0 text-white/50 hover:text-white">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {zonas[zona].conquista.map(r => (
                          <span key={r.id} className="bg-purple-500/20 text-purple-300 text-xs px-2 py-1 rounded-md flex items-center gap-1">
                            {r.name}
                            <Trash2 className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => handleDeleteRuta(r.id, r.name)} />
                          </span>
                        ))}
                        {zonas[zona].conquista.length === 0 && <span className="text-xs text-white/20">Sin rutas</span>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
