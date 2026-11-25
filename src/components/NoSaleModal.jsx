import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createVisit } from '@/repositories/visitsRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Camera, MapPin, XCircle } from 'lucide-react';
import { getCurrentPositionSafe } from '@/lib/geolocation';
import { DirectCameraField } from '@/components/common/DirectCameraModal';
import { getTodayMexico, getMexicoTimeString, getNowMexico } from '@/lib/dateUtils';

const NO_SALE_REASONS = [
    "Cerrado",
    "No tiene dinero",
    "Tiene suficiente stock",
    "Encargado no está",
    "Precio alto",
    "Otro"
];

const NoSaleModal = ({ isOpen, onClose, client, onSuccess }) => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();

    const [reason, setReason] = useState("");
    const [notes, setNotes] = useState("");
    const [photoFachada, setPhotoFachada] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState(null);

    const handleSubmit = async () => {
        if (!reason) {
            toast({ title: "Falta motivo", description: "Selecciona una razón para la no-venta.", variant: "destructive" });
            return;
        }
        if (!photoFachada) {
            toast({ title: "Falta fotografía", description: "Toma una foto de la fachada para registrar la visita.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            // Optional: Capture location automatically if possible or require it
            // For speed in Autoventa, we might skip strict geo-fencing for No-Sale unless required.
            // But good to have coordinates.
            let coords = location;
            if (!coords) {
                try {
                    const pos = await getCurrentPositionSafe();
                    coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                } catch (e) {
                    console.warn("Could not get location for no-sale", e);
                }
            }

            const photoData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('No se pudo leer la foto seleccionada.'));
                reader.readAsDataURL(photoFachada);
            });

            const visitData = {
                client_id: client?.id,
                cliente_nombre: client?.business_name || client?.name,
                user_id: user.id,
                fecha: getTodayMexico(),
                hora: getMexicoTimeString(),
                motivo: `No Venta - ${reason}`,
                notes: notes,
                photo_fachada: photoData,
                lat: coords?.lat,
                lng: coords?.lng,
                created_at: getNowMexico()
            };

            await createVisit(visitData);

            toast({ title: "Registrado", description: "Visita sin venta registrada correctamente.", className: "bg-green-600 text-white" });
            if (onSuccess) onSuccess();
            onClose();
            setPhotoFachada(null);
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "No se pudo registrar.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setReason("");
            setNotes("");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-slate-900 text-slate-100 border-slate-700">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-500">
                        <XCircle /> Reportar No Venta
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Registra por qué no se realizó la venta en {client?.business_name || "este cliente"}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-slate-200">Motivo Principal</Label>
                        <Select onValueChange={setReason} value={reason}>
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                                <SelectValue placeholder="Seleccionar motivo..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 z-[10000]">
                                {NO_SALE_REASONS.map(r => (
                                    <SelectItem key={r} value={r} className="focus:bg-slate-700 focus:text-slate-100">{r}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-200">Comentarios Adicionales</Label>
                        <Input
                            placeholder="Detalles opcionales..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <DirectCameraField
                            label="Foto de fachada (obligatoria)"
                            required
                            file={photoFachada}
                            onCapture={(file) => setPhotoFachada(file)}
                        />
                    </div>
                </div>

                <DialogFooter className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting || !reason || !photoFachada} className="bg-red-600 hover:bg-red-700 text-white">
                        {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : "Registrar No Venta"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default NoSaleModal;
