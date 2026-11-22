import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

/**
 * Hook for calculating real street routes using OSRM Public API.
 * OSRM expects coordinates in [longitude, latitude] format.
 */
export function useMapRouting() {
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeSummary, setRouteSummary] = useState(null);
  const [isRouting, setIsRouting] = useState(false);
  const { toast } = useToast();

  const calculateRoute = useCallback(async (startCoords, endCoords) => {
    if (!startCoords || !endCoords) {
        toast({
            title: "Error de Ubicación",
            description: "No se puede calcular la ruta sin la ubicación de inicio y destino.",
            variant: "destructive"
        });
        return;
    }

    setIsRouting(true);
    setRouteCoords(null);
    setRouteSummary(null);

    try {
      // OSRM coordinates format: lng,lat
      const start = `${startCoords.lng},${startCoords.lat}`;
      const end = `${endCoords.lng},${endCoords.lat}`;
      
      const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        setRouteCoords(coordinates);
        
        setRouteSummary({
            distance: route.distance, // in meters
            duration: route.duration  // in seconds
        });
      } else {
        throw new Error(data.message || "No se pudo calcular la ruta.");
      }
    } catch (error) {
      console.error("OSRM Routing Error:", error);
      toast({
        title: "Error de Enrutamiento",
        description: "Hubo un problema al calcular la ruta real por calles. Verifica tu conexión.",
        variant: "destructive"
      });
    } finally {
      setIsRouting(false);
    }
  }, [toast]);

  const clearRoute = useCallback(() => {
    setRouteCoords(null);
    setRouteSummary(null);
  }, []);

  return {
    routeCoords,
    routeSummary,
    isRouting,
    calculateRoute,
    clearRoute
  };
}
