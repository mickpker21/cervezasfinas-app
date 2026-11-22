import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Image, CheckCircle, XCircle, Star } from 'lucide-react';
import { API_URL, getShopAuthHeaders } from '@/lib/api';

export default function TeleventaCoolerExecutions() {
    const [executions, setExecutions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(null);
    const [selectedExecution, setSelectedExecution] = useState(null);
    const [points, setPoints] = useState(50);

    const resolveCoolerPhoto = (url) => {
        if (!url) return '';
        let clean = String(url).trim();
        if (clean.includes('/uploads/coolers/') && !clean.includes('/api/uploads/coolers/')) {
            clean = clean.replace('/uploads/coolers/', '/api/uploads/coolers/');
        }
        if (clean.startsWith('http://') || clean.startsWith('https://')) {
            return clean.replace('https://cervezasfinas.com.mx/', 'https://cervezasfinas.com/');
        }
        return `https://cervezasfinas.com${clean.startsWith('/') ? '' : '/'}${clean}`;
    };

    useEffect(() => {
        loadExecutions();
    }, []);

    async function loadExecutions() {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/televenta/executions-list.php`, { headers: await getShopAuthHeaders() });
            const data = await response.json();

            if (data.success) {
                const list = (data.data || []).map((item, idx) => ({
                    ...item,
                    _uiKey: item.id > 0 ? `id_${item.id}` : `row_${idx}_${item.client_code}_${item.created_at}`,
                    photo_url: resolveCoolerPhoto(item.photo_url)
                }));
                setExecutions(list);
            }
        } catch (error) {
            console.error('Error loading executions:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleApprove() {
        if (!selectedExecution) return;
        const pts = Number.isFinite(Number(points)) ? Math.max(0, Math.round(Number(points))) : 0;
        if (pts < 0 || pts > 100000) {
            alert('Los puntos deben ser un número válido mayor o igual a 0');
            return;
        }

        const procKey = selectedExecution._uiKey || selectedExecution.id;
        setProcessing(procKey);
        try {
            const response = await fetch(`${API_URL}/televenta/approve-execution.php`, {
                method: 'POST',
                headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    execution_id: Number(selectedExecution.id) || 0,
                    client_code: selectedExecution.client_code,
                    photo_url: selectedExecution.photo_url,
                    points_awarded: pts
                })
            });

            const data = await response.json();
            if (data.success) {
                alert(`Ejecución aprobada. ${pts} puntos otorgados`);
                setSelectedExecution(null);
                loadExecutions();
            } else {
                alert('Error: ' + (data.error || 'No se pudo aprobar la ejecución'));
            }
        } catch (error) {
            alert('Error aprobando ejecución');
        } finally {
            setProcessing(null);
        }
    }

    async function handleReject() {
        if (!selectedExecution) return;
        if (!confirm('¿Rechazar esta ejecución?')) return;

        const procKey = selectedExecution._uiKey || selectedExecution.id;
        setProcessing(procKey);
        try {
            const response = await fetch(`${API_URL}/televenta/reject-execution.php`, {
                method: 'POST',
                headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    execution_id: Number(selectedExecution.id) || 0,
                    client_code: selectedExecution.client_code,
                    photo_url: selectedExecution.photo_url
                })
            });

            const data = await response.json();
            if (data.success) {
                alert('Ejecución rechazada');
                setSelectedExecution(null);
                loadExecutions();
            } else {
                alert('Error: ' + (data.error || 'No se pudo rechazar la ejecución'));
            }
        } catch (error) {
            alert('Error rechazando ejecución');
        } finally {
            setProcessing(null);
        }
    }

    const getStatusBadge = (status) => {
        const badges = {
            pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pendiente' },
            approved: { color: 'bg-green-100 text-green-800', text: 'Aprobado' },
            rejected: { color: 'bg-red-100 text-red-800', text: 'Rechazado' },
        };

        const badge = badges[status] || badges.pending;
        return <Badge className={badge.color}>{badge.text}</Badge>;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Ejecuciones de Enfriador</h1>
                    <p className="text-muted-foreground">Evalúa las fotos y otorga puntos</p>
                </div>
                <Button onClick={loadExecutions} variant="outline">
                    Actualizar
                </Button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Lista de Ejecuciones */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Ejecuciones Pendientes</h2>
                    {executions.filter(e => e.status === 'pending').length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Image className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <p className="text-muted-foreground">No hay ejecuciones pendientes</p>
                            </CardContent>
                        </Card>
                    ) : (
                        executions.filter(e => e.status === 'pending').map((execution) => (
                            <Card
                                key={execution._uiKey || execution.id}
                                className={`cursor-pointer hover:border-primary ${(selectedExecution?._uiKey || selectedExecution?.id) === (execution._uiKey || execution.id) ? 'border-primary' : ''
                                    }`}
                                onClick={() => {
                                    setSelectedExecution(execution);
                                    setPoints(50);
                                }}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-4">
                                        <img
                                            src={resolveCoolerPhoto(execution.photo_url)}
                                            alt="Cooler"
                                            className="w-24 h-24 object-cover rounded"
                                        />
                                        <div className="flex-1">
                                            <p className="font-semibold">Cliente: {execution.client_code}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(execution.created_at).toLocaleDateString('es-MX')}
                                            </p>
                                            {getStatusBadge(execution.status)}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}

                    {/* Historial */}
                    <h2 className="text-xl font-semibold mt-8">Historial</h2>
                    <div className="space-y-2">
                        {executions.filter(e => e.status !== 'pending').slice(0, 5).map((execution) => (
                            <div key={execution._uiKey || execution.id} className="flex items-center justify-between p-3 border rounded">
                                <div>
                                    <p className="text-sm font-medium">{execution.client_code}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(execution.created_at).toLocaleDateString('es-MX')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    {getStatusBadge(execution.status)}
                                    {execution.points_awarded > 0 && (
                                        <p className="text-sm font-semibold mt-1">
                                            {execution.points_awarded} pts
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Panel de Evaluación */}
                <div>
                    {selectedExecution ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Evaluar Ejecución</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Foto Grande */}
                                <img
                                    src={resolveCoolerPhoto(selectedExecution.photo_url)}
                                    alt="Cooler execution"
                                    className="w-full rounded-lg"
                                />

                                <div>
                                    <p className="text-sm text-muted-foreground">Cliente</p>
                                    <p className="font-semibold">{selectedExecution.client_code}</p>
                                </div>

                                <div>
                                    <p className="text-sm text-muted-foreground">Fecha</p>
                                    <p className="font-semibold">
                                        {new Date(selectedExecution.created_at).toLocaleDateString('es-MX')}
                                    </p>
                                </div>

                                {/* Input de Puntos */}
                                <div>
                                    <Label htmlFor="points">Puntos a Otorgar</Label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Input
                                            id="points"
                                            type="number"
                                            min="0"
                                            max="100000"
                                            value={points}
                                            onChange={(e) => setPoints(e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
                                        />
                                        <Star className="w-5 h-5 text-yellow-500" />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Evalúa la calidad de la ejecución
                                    </p>
                                </div>

                                {/* Acciones */}
                                <div className="flex gap-2">
                                    <Button
                                        onClick={handleApprove}
                                        disabled={processing === (selectedExecution._uiKey || selectedExecution.id)}
                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                    >
                                        {processing === (selectedExecution._uiKey || selectedExecution.id) ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : (
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                        )}
                                        Aprobar
                                    </Button>
                                    <Button
                                        onClick={handleReject}
                                        disabled={processing === (selectedExecution._uiKey || selectedExecution.id)}
                                        variant="destructive"
                                        className="flex-1"
                                    >
                                        {processing === (selectedExecution._uiKey || selectedExecution.id) ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : (
                                            <XCircle className="w-4 h-4 mr-2" />
                                        )}
                                        Rechazar
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Image className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <p className="text-muted-foreground">
                                    Selecciona una ejecución para evaluar
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
