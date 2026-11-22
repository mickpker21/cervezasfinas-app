import React, { useState, useEffect } from 'react';
import { createClient, updateClient } from '@/repositories/clientsRepository';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '../../supabaseClient';

const levels = ['Bronce', 'Plata', 'Oro', 'Platino', 'Titanio'];
const exclusivities = ['Mixto', 'Competencia', 'Exclusivo'];
const businessTypes = ['Centro de consumo', 'Punto de venta', 'Otro'];

export default function ClientDialog({ isOpen, onClose, editingClient, onSaveSuccess }) {
  const { toast } = useToast();
  const [clientData, setClientData] = useState({
    name: '', business_name: '', type: '', address: '', level: '',
    exclusivity: '', internal_route: '', sales_route: '', phone: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingClient) {
      setClientData({
        name: editingClient.name || '',
        business_name: editingClient.business_name || '',
        type: editingClient.type || '',
        address: editingClient.address || '',
        level: editingClient.level || '',
        exclusivity: editingClient.exclusivity || '',
        internal_route: editingClient.internal_route || '',
        sales_route: editingClient.sales_route || '',
        phone: editingClient.phone || '',
      });
    } else {
      setClientData({
        name: '', business_name: '', type: '', address: '', level: '',
        exclusivity: '', internal_route: '', sales_route: '', phone: '',
      });
    }
  }, [editingClient, isOpen]);

  const resetForm = () => {
    setClientData({
      name: '', business_name: '', type: '', address: '', level: '',
      exclusivity: '', internal_route: '', sales_route: '', phone: '',
    });
  };

  const handleSave = async () => {
    if (!clientData.name || !clientData.business_name) {
      toast({ title: "Error", description: "El nombre del cliente y del negocio son obligatorios.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (editingClient) {
        await updateClient(editingClient.id, clientData);
        toast({ title: "¡Cliente actualizado!", description: "Los datos del cliente han sido guardados." });
        onSaveSuccess();
        onClose();
      } else {
        await createClient(clientData);
        toast({ title: "¡Cliente agregado!", description: "El cliente ha sido registrado." });
        onSaveSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Error saving client:', error);
      toast({ title: "Error", description: "No se pudo guardar el cliente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setClientData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-green-900 border-green-700 text-white max-w-3xl h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-green-600 scrollbar-track-gray-200 flex flex-col" aria-describedby="dialog-desc-client-dialog">
        <div id="dialog-desc-client-dialog" className="sr-only">Formulario de cliente</div>
        <DialogHeader>
          <DialogTitle>{editingClient ? 'Editar Cliente' : 'Agregar Cliente'}</DialogTitle>
          <DialogDescription className="text-green-200">
            {editingClient ? 'Modifica los detalles del cliente. Los cambios se guardarán en la base de datos.' : 'Completa los datos para registrar un nuevo cliente.'}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-green-600 scrollbar-track-gray-200 px-4 flex-grow">
          <form className="space-y-4" id="client-dialog-scroll-area">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre Cliente</Label>
                <Input id="name" value={clientData.name || ''} onChange={(e) => handleChange('name', e.target.value)} className="heineken-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessName">Nombre Negocio</Label>
                <Input id="businessName" value={clientData.business_name || ''} onChange={(e) => handleChange('business_name', e.target.value)} className="heineken-input" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" value={clientData.address || ''} onChange={(e) => handleChange('address', e.target.value)} className="heineken-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" value={clientData.phone || ''} onChange={(e) => handleChange('phone', e.target.value)} className="heineken-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internalRoute">Ruta Interna</Label>
                <Input id="internalRoute" value={clientData.internal_route || ''} onChange={(e) => handleChange('internal_route', e.target.value)} className="heineken-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salesRoute">Ruta Venta</Label>
                <Input id="salesRoute" value={clientData.sales_route || ''} onChange={(e) => handleChange('sales_route', e.target.value)} className="heineken-input" />
              </div>
              <div className="space-y-2">
                <Label>Giro</Label>
                <Select value={clientData.type} onValueChange={(value) => handleChange('type', value)}>
                  <SelectTrigger className="heineken-input"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {businessTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nivel</Label>
                <Select value={clientData.level} onValueChange={(value) => handleChange('level', value)}>
                  <SelectTrigger className="heineken-input"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {levels.map(level => <SelectItem key={level} value={level}>{level}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condición</Label>
                <Select value={clientData.exclusivity} onValueChange={(value) => handleChange('exclusivity', value)}>
                  <SelectTrigger className="heineken-input"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {exclusivities.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onClose} className="bg-white/10 border-white/30 text-white hover:bg-white/20">Cancelar</Button>
              <Button onClick={handleSave} className="heineken-button" disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
            {/* Botones flotantes para subir y bajar en móviles dentro del área scrollable */}
            <div className="md:hidden sticky bottom-2 left-0 w-full flex justify-center gap-4 z-40 pointer-events-auto">
              <button
                type="button"
                className="bg-green-600 text-white rounded-full shadow-lg px-5 py-2 text-base font-semibold"
                onClick={() => {
                  const area = document.getElementById('client-dialog-scroll-area');
                  if (area) area.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Subir
              </button>
              <button
                type="button"
                className="bg-green-600 text-white rounded-full shadow-lg px-5 py-2 text-base font-semibold"
                onClick={() => {
                  const area = document.getElementById('client-dialog-scroll-area');
                  if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
                }}
              >
                Bajar
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}