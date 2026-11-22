// src/components/SkuEquivalenciasDialog.jsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  getSkuEquivalenciasList, 
  saveSkuEquivalencia, 
  deleteSkuEquivalencia, 
  getSkuEquivalencias 
} from '@/repositories/metadataRepository';
import { GitMerge, Plus, Trash2, Search, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';

export default function SkuEquivalenciasDialog({ open, onOpenChange, onSaved }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  
  // Form state
  const [skuOrigen, setSkuOrigen] = useState("");
  const [skuCanonico, setSkuCanonico] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadList = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const data = await getSkuEquivalenciasList();
      setList(data || []);
    } catch (err) {
      setErrorMsg("Error cargando la lista de equivalencias");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadList();
      setSkuOrigen("");
      setSkuCanonico("");
      setDescripcion("");
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [open]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!skuOrigen.trim() || !skuCanonico.trim()) {
      setErrorMsg("Por favor ingresa tanto el código alterno como el oficial.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      await saveSkuEquivalencia(skuOrigen.trim(), skuCanonico.trim(), descripcion.trim());
      setSuccessMsg(`Homologado: ${skuOrigen.toUpperCase()} ➜ ${skuCanonico.toUpperCase()}`);
      setSkuOrigen("");
      setSkuCanonico("");
      setDescripcion("");
      await loadList();
      // Forzar recarga del mapa en caché
      const updatedMap = await getSkuEquivalencias(true);
      if (onSaved) onSaved(updatedMap);
    } catch (err) {
      setErrorMsg(err.message || "Error al guardar equivalencia");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, origen) => {
    if (!window.confirm(`¿Eliminar la homologación para el código ${origen}?`)) return;
    try {
      await deleteSkuEquivalencia(id, origen);
      await loadList();
      const updatedMap = await getSkuEquivalencias(true);
      if (onSaved) onSaved(updatedMap);
    } catch (err) {
      alert("Error eliminando: " + err.message);
    }
  };

  const filteredList = list.filter(item => {
    const q = search.toLowerCase();
    return (
      (item.sku_origen || "").toLowerCase().includes(q) ||
      (item.sku_canonico || "").toLowerCase().includes(q) ||
      (item.descripcion || "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#1e2030] text-white border-white/10 max-h-[85vh] flex flex-col p-6">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white">
                Homologación de Códigos / SKUs
              </DialogTitle>
              <DialogDescription className="text-white/60 text-xs mt-0.5">
                Unifica los códigos del sistema alterno o legacy para consolidar las ventas y la participación por SKU.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Formulario de Alta Rápida */}
        <form onSubmit={handleSave} className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-3 mt-2">
          <div className="text-xs font-semibold text-white/80 uppercase tracking-wider flex items-center justify-between">
            <span>Nueva Equivalencia</span>
            {successMsg && (
              <span className="text-emerald-400 flex items-center gap-1 font-normal lowercase">
                <CheckCircle className="w-3.5 h-3.5" /> {successMsg}
              </span>
            )}
            {errorMsg && (
              <span className="text-rose-400 flex items-center gap-1 font-normal lowercase">
                <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-white/60 block mb-1">Código Sistema Alterno</label>
              <Input
                placeholder="Ej. CF-940 o 40102"
                value={skuOrigen}
                onChange={(e) => setSkuOrigen(e.target.value.toUpperCase())}
                className="bg-black/30 border-white/20 text-white placeholder-white/30 text-xs h-9"
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 block mb-1">Código Oficial (Canónico)</label>
              <Input
                placeholder="Ej. 102"
                value={skuCanonico}
                onChange={(e) => setSkuCanonico(e.target.value.toUpperCase())}
                className="bg-black/30 border-white/20 text-white placeholder-white/30 text-xs h-9"
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 block mb-1">Descripción / Producto</label>
              <Input
                placeholder="Corona Familiar 940ml"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="bg-black/30 border-white/20 text-white placeholder-white/30 text-xs h-9"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 px-4 font-medium"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {submitting ? "Guardando..." : "Vincular Código"}
            </Button>
          </div>
        </form>

        {/* Buscador y Contador */}
        <div className="flex items-center justify-between gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <Input
              placeholder="Buscar por código alterno, oficial o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-black/20 border-white/10 text-white placeholder-white/30 pl-8 text-xs h-8"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadList}
            disabled={loading}
            className="text-white/60 hover:text-white h-8 px-2"
            title="Recargar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Lista de Equivalencias */}
        <div className="flex-1 overflow-y-auto mt-2 pr-1 space-y-1.5 custom-scrollbar min-h-[180px]">
          {loading ? (
            <div className="text-center py-8 text-white/40 text-xs">Cargando homologaciones...</div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-8 text-white/40 text-xs border border-dashed border-white/10 rounded-lg">
              {search ? "No se encontraron equivalencias con esa búsqueda." : "Aún no hay códigos vinculados. Agrega el primero arriba."}
            </div>
          ) : (
            filteredList.map((item) => (
              <div
                key={item.id || item.sku_origen}
                className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded text-xs">
                    {item.sku_origen}
                  </div>
                  <span className="text-white/40 text-xs">➔</span>
                  <div className="font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs">
                    {item.sku_canonico}
                  </div>
                  {item.descripcion && (
                    <span className="text-xs text-white/70 font-medium ml-2 truncate max-w-[200px] sm:max-w-[280px]">
                      {item.descripcion}
                    </span>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(item.id, item.sku_origen)}
                  className="text-white/40 hover:text-rose-400 hover:bg-rose-500/10 h-7 w-7 p-0"
                  title="Eliminar vinculación"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
