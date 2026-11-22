import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import Papa from 'papaparse';
import { Download } from 'lucide-react';

const VisitsHeader = ({ visits }) => {
  const { toast } = useToast();

  const handleExportVisits = () => {
    if (visits.length === 0) {
      toast({
        title: "No hay datos para exportar",
        description: "Ajusta los filtros si es necesario.",
        variant: "destructive",
      });
      return;
    }

    const getVisitAction = (visit) => {
      switch (visit.userType) {
        case 'asesor-dinamico':
          return visit.visitReason || 'Asesoría';
        case 'televenta':
          return visit.clientBought === 'Si' ? `Venta: ${visit.boxesBought} cajas` : 'Sin venta';
        default:
          return 'Visita regular';
      }
    };

    const csvData = visits.map(visit => ({
      'Fecha': visit.visitDate,
      'Hora': visit.visitTime,
      'Cliente': visit.clientName,
      'Negocio': visit.businessName,
      'Usuario': visit.userName,
      'Tipo Usuario': visit.userType,
      'Ruta': visit.routeNumber,
      'Acción': getVisitAction(visit),
      'Comentarios': visit.comments || '',
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `visitas_cervezas_finas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "¡Exportación exitosa!",
      description: "La base de visitas ha sido descargada.",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col md:flex-row items-start md:items-center justify-between"
    >
      <div>
        <h1 className="text-3xl font-bold text-white">Gestión de Visitas</h1>
        <p className="text-green-200 mt-1">Visualiza, filtra y exporta todas las visitas del sistema.</p>
      </div>
      <Button onClick={handleExportVisits} className="heineken-button mt-4 md:mt-0">
        <Download className="w-4 h-4 mr-2" />
        Exportar Excel
      </Button>
    </motion.div>
  );
};

export default VisitsHeader;