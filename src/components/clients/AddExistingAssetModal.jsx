import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import SmartBarcodeScanner from '@/components/SmartBarcodeScanner';
import { Camera } from 'lucide-react';

const AddExistingAssetModal = ({ client, onClose, onSuccess }) => {
    const [serial, setSerial] = useState('');
    const [brand, setBrand] = useState('');
    const [model, setModel] = useState('');
    const [assetType, setAssetType] = useState('');
    const [notes, setNotes] = useState('');
    const [assetTypes, setAssetTypes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchAssetTypes = async () => {
            const { data, error } = await supabase
                .from('asset_types')
                .select('name')
                .order('name');
            if (error) {
                console.error('Error fetching asset types:', error);
            } else {
                setAssetTypes(data.map(t => t.name));
            }
        };
        fetchAssetTypes();
    }, []);

    const filteredAssetTypes = useMemo(() => {
        if (!searchTerm) {
            return assetTypes;
        }
        return assetTypes.filter(type =>
            type.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [assetTypes, searchTerm]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!serial || !assetType || !brand || !model) {
            setError('El número de serie, marca, modelo y tipo de activo son obligatorios.');
            return;
        }
        setLoading(true);
        setError('');

        try {
            // Step 1: Create the asset
            const { data: assetData, error: assetError } = await supabase
                .from('assets')
                .insert({
                    serial: serial,
                    brand: brand,
                    model: model,
                    type: assetType,
                    status: 'EN_USO',
                    notes: notes,
                })
                .select()
                .single();

            if (assetError) {
                throw assetError;
            }

            // Step 2: Create an installation record to link asset to client
            const { error: installationError } = await supabase
                .from('installations')
                .insert({
                    asset_id: assetData.id,
                    client_id: client.id,
                    asset_type: assetType, // <<< FIX: Added asset_type
                    action: 'INSTALAR',
                    status: 'COMPLETADA',
                    finished_at: new Date().toISOString(),
                });

            if (installationError) {
                await supabase.from('assets').delete().eq('id', assetData.id);
                throw new Error(`El activo fue creado, pero falló al registrar el historial: ${installationError.message}`);
            }

            setLoading(false);
            onSuccess();
        } catch (err) {
            setLoading(false);
            setError(`Error al registrar el activo: ${err.message}`);
            console.error(err);
        }
    };

    const handleScan = (err, result) => {
        if (result) {
            setSerial(result.text);
            setShowScanner(false);
        }
        if (err) {
            console.error(err);
        }
    };

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Registrar Activo Existente en Cliente</DialogTitle>
                    <DialogDescription>
                        Añada un activo que ya se encuentra físicamente con el cliente pero que no está en el sistema.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-sm text-gray-400 mb-4">
                        Cliente: <span className="font-semibold text-gray-200">{client.name}</span>
                    </p>
                <SmartBarcodeScanner
                        open={showScanner}
                        onDetected={(text) => { setSerial(text); setShowScanner(false); }}
                        onClose={() => setShowScanner(false)}
                    />
                        <form id="add-asset-form" onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label htmlFor="serial">Número de Serie</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="serial"
                                        value={serial}
                                        onChange={(e) => setSerial(e.target.value)}
                                        placeholder="Ej: FRIO-12345"
                                        required
                                    />
                                    <Button type="button" variant="outline" onClick={() => setShowScanner(true)}>
                                        <Camera className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="brand">Marca</Label>
                                <Input
                                    id="brand"
                                    value={brand}
                                    onChange={(e) => setBrand(e.target.value)}
                                    placeholder="Ej: Torrey"
                                    required
                                />
                            </div>
                             <div>
                                <Label htmlFor="model">Modelo</Label>
                                <Input
                                    id="model"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    placeholder="Ej: TVC-123"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="asset-type">Tipo de Activo</Label>
                                <Select onValueChange={setAssetType} value={assetType} required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccione un tipo" />
                                    </SelectTrigger>
                                    <SelectContent style={{ zIndex: 9999 }}>
                                        <Input
                                            placeholder="Buscar tipo de activo..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="mb-2"
                                        />
                                        {filteredAssetTypes.map(type => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="notes">Notas (Opcional)</Label>
                                <Textarea
                                    id="notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Cualquier información adicional sobre el activo"
                                />
                            </div>
                        </form>
                    {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">Cancelar</Button>
                    </DialogClose>
                    <Button type="submit" form="add-asset-form" disabled={loading}>
                        {loading ? 'Registrando...' : 'Registrar Activo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AddExistingAssetModal;
