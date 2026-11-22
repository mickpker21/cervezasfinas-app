import React from 'react';
import { Download, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function UpdateModal({ update, onClose }) {
  if (!update || !update.hasUpdate) return null;

  const handleDownload = () => {
    if (update.url) {
      window.open(update.url, '_blank');
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md" hideClose={update.force}>
        <DialogHeader>
          <DialogTitle className="flex items-center text-emerald-700 text-xl gap-2">
            <Download className="h-6 w-6" />
            ¡Actualización Disponible!
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            Hay una nueva versión de Cervezas Finas (<strong>v{update.version}</strong>) lista para descargar.
          </DialogDescription>
        </DialogHeader>
        
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-md my-4 text-sm border border-emerald-100">
          <p className="font-semibold mb-1">Novedades:</p>
          <p>{update.notes || 'Mejoras de rendimiento y correcciones de errores.'}</p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
          {!update.force && (
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              <X className="w-4 h-4 mr-2" />
              Más tarde
            </Button>
          )}
          <Button 
            onClick={handleDownload} 
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar e Instalar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
