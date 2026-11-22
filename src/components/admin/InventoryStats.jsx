import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Archive, CheckCircle, Home } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const InventoryStats = () => {
    const [stats, setStats] = useState({
        total: 0,
        installed: 0,
        in_warehouse: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInventoryStats = async () => {
            setLoading(true);

            const { data, error } = await supabase
                .from('assets')
                .select('status', { count: 'exact' });

            if (error) {
                console.error("Error fetching inventory stats:", error);
            } else {
                const total = data.length;
                const installed = data.filter(a => a.status === 'INSTALADO').length;
                const in_warehouse = data.filter(a => a.status === 'EN_ALMACEN').length;
                setStats({ total, installed, in_warehouse });
            }
            setLoading(false);
        };

        fetchInventoryStats();
    }, []);

    if (loading) {
        return null; // Or a loading skeleton
    }

    return (
        <>
            <Card className="heineken-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-green-200">Total de Activos</CardTitle>
                    <Archive className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-white">{stats.total}</div>
                    <p className="text-xs text-muted-foreground">Activos totales en el sistema</p>
                </CardContent>
            </Card>
            <Card className="heineken-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-green-200">Activos Instalados</CardTitle>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-white">{stats.installed}</div>
                    <p className="text-xs text-muted-foreground">Activos actualmente en clientes</p>
                </CardContent>
            </Card>
            <Card className="heineken-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-green-200">Activos en Almacén</CardTitle>
                    <Home className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-white">{stats.in_warehouse}</div>
                    <p className="text-xs text-muted-foreground">Listos para ser instalados</p>
                </CardContent>
            </Card>
        </>
    );
};

export default InventoryStats;
