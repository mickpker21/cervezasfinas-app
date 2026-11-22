
import { useState, useEffect } from "react";
import { supabase } from "@/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from "@/components/ui/use-toast";

export default function ClientVisitsList({ clientId, clientCode, className }) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    // Guard: need at least one identifier to avoid fetching ALL visits
    if (!clientId && !clientCode) return;

    const fetchVisits = async () => {
      setLoading(true);
      try {
        const { getVisitsByClient } = await import('@/repositories/visitsRepository');
        const data = await getVisitsByClient(clientId, clientCode);
        // Ordenar por fecha descendente (el repo podría no garantizar orden)
        const sorted = (data || []).sort((a, b) => {
          const da = new Date(a.fecha || a.created_at).getTime();
          const db = new Date(b.fecha || b.created_at).getTime();
          return db - da;
        }).slice(0, 2);

        setVisits(sorted);
      } catch (error) {
        console.warn('[ClientVisitsList] Error fetching visits:', error);
        setVisits([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVisits();
  }, [clientId, clientCode, toast]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Cargando visitas...</div>;
  }

  return (
    <div className="mt-2">
      {visits.length === 0 ? (
        <div className="text-sm text-muted-foreground">Sin visitas recientes</div>
      ) : (
        <ul className={`text-xs space-y-1 ${className || 'text-gray-700'}`}>
          {visits.map(v => (
            <li key={v.id} className="border-b last:border-b-0 pb-1 cursor-pointer hover:crm-accent-soft-bg" onClick={() => setSelectedVisit(v)}>
              <span className="font-semibold">{v.fecha || new Date(v.created_at).toLocaleDateString()}</span>: {v.notes?.slice(0, 40)}{v.notes?.length > 40 ? '...' : ''}
            </li>
          ))}
        </ul>
      )}

      {/* Dialog para detalles de visita */}
      <Dialog open={!!selectedVisit} onOpenChange={open => { if (!open) setSelectedVisit(null); }}>
        <DialogContent aria-describedby="desc-visit-detail-dialog">
          <div id="desc-visit-detail-dialog" className="sr-only">Detalle completo de la visita seleccionada</div>
          <DialogHeader>
            <DialogTitle>Detalle de Visita</DialogTitle>
          </DialogHeader>
          {selectedVisit && (
            <div className="space-y-2">
              <div><b>Fecha:</b> {selectedVisit.fecha || new Date(selectedVisit.created_at).toLocaleDateString()}</div>
              <div className="space-y-4">
                {selectedVisit.photo_fachada && (
                  <div>
                    <b className="block text-xs mb-1">Fachada:</b>
                    <img
                      src={selectedVisit.photo_fachada}
                      alt="Foto fachada"
                      className="w-full h-auto max-h-64 object-contain border rounded bg-slate-100"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML += '<span class="text-xs text-red-500 italic">Error cargando imagen</span>';
                      }}
                    />
                  </div>
                )}
                {selectedVisit.photo_interior && (
                  <div>
                    <b className="block text-xs mb-1">Interior:</b>
                    <img
                      src={selectedVisit.photo_interior}
                      alt="Foto interior"
                      className="w-full h-auto max-h-64 object-contain border rounded bg-slate-100"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML += '<span class="text-xs text-red-500 italic">Error cargando imagen</span>';
                      }}
                    />
                  </div>
                )}
                {selectedVisit.photo_enfriador && (
                  <div>
                    <b className="block text-xs mb-1">Enfriador:</b>
                    <img
                      src={selectedVisit.photo_enfriador}
                      alt="Foto enfriador"
                      className="w-full h-auto max-h-64 object-contain border rounded bg-slate-100"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML += '<span class="text-xs text-red-500 italic">Error cargando imagen</span>';
                      }}
                    />
                  </div>
                )}
              </div>
              <div><b>Registrado por:</b> {selectedVisit.user_id}</div>
              <div><b>Creado:</b> {new Date(selectedVisit.created_at).toLocaleString()}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
