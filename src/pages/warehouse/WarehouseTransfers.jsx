import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Truck, ArrowRight, CheckCircle, XCircle, Plus, Search, AlertCircle, Package } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { supabase } from '@/supabaseClient'; 

export default function WarehouseTransfers() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  
  const [userRole, setUserRole] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventoryMap, setInventoryMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isNewTransferModalOpen, setIsNewTransferModalOpen] = useState(false);
  const [isFactoryMode, setIsFactoryMode] = useState(false);
  const [newTransfer, setNewTransfer] = useState({ destination_branch_id: '', items: [] });
  const [selectedProductSku, setSelectedProductSku] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState('');

  useEffect(() => {
    if (!user) return;
    const role = user?.user_metadata?.role || user?.user_metadata?.type || '';
    setUserRole(role);

    const init = async () => {
      const { data: bData } = await supabase.from('branches').select('id, name').order('name');
      setBranches(bData || []);

      let defaultBranch = '';
      if (role === 'sistemas' || role === 'admin') {
         defaultBranch = bData?.length > 0 ? bData[0].id : '';
      } else {
         const { data: profile } = await supabase.from('profiles').select('branch_id').eq('id', user.id).single();
         defaultBranch = profile?.branch_id || (bData?.length > 0 ? bData[0].id : '');
      }
      setSelectedBranch(defaultBranch);
      
      const { data: pData } = await supabase.from('products').select('*');
      setProducts(pData || []);
    };
    init();
  }, [user]);

  const fetchTransfers = async () => {
    if (!selectedBranch) return;
    setLoading(true);

    // Fetch incoming and outgoing
    const { data: tData, error } = await supabase
        .from('warehouse_transfers')
        .select(`
            *,
            origin:branches!origin_branch_id(name),
            destination:branches!destination_branch_id(name),
            items:warehouse_transfer_items(product_sku, quantity)
        `)
        .or(`origin_branch_id.eq.${selectedBranch},destination_branch_id.eq.${selectedBranch}`)
        .order('created_at', { ascending: false });
        
    setTransfers(tData || []);

    const { data: invData } = await supabase.from('warehouse_inventory').select('product_sku, quantity').eq('branch_id', selectedBranch);
    const invMap = {};
    (invData || []).forEach(i => { invMap[i.product_sku] = i.quantity; });
    setInventoryMap(invMap);

    setLoading(false);
  };

  useEffect(() => {
    fetchTransfers();
  }, [selectedBranch]);

  const handleAddItem = () => {
    if (!selectedProductSku || !selectedQuantity || parseInt(selectedQuantity) <= 0) return;
    
    const qty = parseInt(selectedQuantity);
    
    if (!isFactoryMode) {
        const available = inventoryMap[selectedProductSku] || 0;
        if (qty > available) {
            toast({ title: 'Stock Insuficiente', description: `Solo tienes ${available} unidades en esta bodega.`, variant: 'destructive' });
            return;
        }
    }

    // Check if already in list
    const existing = newTransfer.items.find(i => i.sku === selectedProductSku);
    if (existing) {
        toast({ title: 'Atención', description: 'El SKU ya está en la lista. Ajusta la cantidad eliminando y agregando de nuevo.', variant: 'destructive' });
        return;
    }

    setNewTransfer({
        ...newTransfer,
        items: [...newTransfer.items, { sku: selectedProductSku, quantity: qty }]
    });
    setSelectedProductSku('');
    setSelectedQuantity('');
  };

  const handleRemoveItem = (sku) => {
    setNewTransfer({
        ...newTransfer,
        items: newTransfer.items.filter(i => i.sku !== sku)
    });
  };

  const handleCreateTransfer = async () => {
    if (!newTransfer.destination_branch_id || newTransfer.items.length === 0) {
        toast({ title: 'Error', description: 'Selecciona una bodega destino y al menos un producto.', variant: 'destructive' });
        return;
    }

    if (newTransfer.destination_branch_id === selectedBranch) {
        toast({ title: 'Error', description: 'No puedes hacer un traspaso a la misma bodega.', variant: 'destructive' });
        return;
    }

    // 1. Create Transfer Header
    const originBranch = isFactoryMode ? null : selectedBranch;
    const { data: transferData, error: headerError } = await supabase.from('warehouse_transfers').insert([
        {
            origin_branch_id: originBranch,
            destination_branch_id: newTransfer.destination_branch_id,
            status: 'PENDING',
            created_by: user.id
        }
    ]).select().single();

    if (headerError) {
        toast({ title: 'Error', description: headerError.message, variant: 'destructive' });
        return;
    }

    // 2. Insert Items
    const itemsToInsert = newTransfer.items.map(item => ({
        transfer_id: transferData.id,
        product_sku: item.sku,
        quantity: item.quantity
    }));

    const { error: itemsError } = await supabase.from('warehouse_transfer_items').insert(itemsToInsert);
    
    if (itemsError) {
        toast({ title: 'Error al guardar partidas', description: itemsError.message, variant: 'destructive' });
        return;
    }

    toast({ title: 'Traspaso Creado', description: 'El traspaso está PENDIENTE de ser recibido por la otra bodega.' });
    setIsNewTransferModalOpen(false);
    setNewTransfer({ destination_branch_id: '', items: [] });
    fetchTransfers();
  };

  const handleAcceptTransfer = async (transfer) => {
      const msg = transfer.origin_branch_id === null 
          ? '¿Confirmas que has recibido la mercancía de la FÁBRICA? Se inyectará el inventario a tu bodega.'
          : '¿Confirmas que has recibido físicamente esta mercancía? Se descontará de la bodega origen y se sumará a tu bodega actual.';
      if (!window.confirm(msg)) return;

      try {
          // 1. Mark transfer as received
          await supabase.from('warehouse_transfers').update({ 
              status: 'RECEIVED', 
              received_by: user.id, 
              received_at: new Date().toISOString() 
          }).eq('id', transfer.id);

          for (const item of transfer.items) {
             // 2. Deduct from origin branch (ONLY IF NOT FROM FACTORY)
             if (transfer.origin_branch_id) {
                 const { data: currentOrigin } = await supabase.from('warehouse_inventory').select('quantity').eq('branch_id', transfer.origin_branch_id).eq('product_sku', item.product_sku).single();
                 const originQty = (currentOrigin?.quantity || 0) - item.quantity;
                 
                 await supabase.from('warehouse_inventory').upsert({
                     branch_id: transfer.origin_branch_id,
                     product_sku: item.product_sku,
                     quantity: originQty < 0 ? 0 : originQty,
                     last_updated: new Date().toISOString()
                 }, { onConflict: 'branch_id,product_sku' });

                 await supabase.from('warehouse_transactions').insert([
                     { branch_id: transfer.origin_branch_id, product_sku: item.product_sku, type: 'TRASPASO_SALIDA', quantity: -item.quantity, reference_id: transfer.id, created_by: user.id }
                 ]);
             }

             // 3. Add to destination branch (local)
             const { data: currentDest } = await supabase.from('warehouse_inventory').select('quantity').eq('branch_id', selectedBranch).eq('product_sku', item.product_sku).single();
             const destQty = (currentDest?.quantity || 0) + item.quantity;

             await supabase.from('warehouse_inventory').upsert({
                branch_id: selectedBranch,
                product_sku: item.product_sku,
                quantity: destQty,
                last_updated: new Date().toISOString()
             }, { onConflict: 'branch_id,product_sku' });

             // 4. Log transactions in kardex
             const inType = transfer.origin_branch_id === null ? 'INGRESO_FABRICA' : 'TRASPASO_ENTRADA';
             await supabase.from('warehouse_transactions').insert([
                 { branch_id: selectedBranch, product_sku: item.product_sku, type: inType, quantity: item.quantity, reference_id: transfer.id, created_by: user.id }
             ]);
          }

          toast({ title: 'Traspaso Recibido', description: 'El inventario ha sido actualizado.' });
          fetchTransfers();
      } catch (err) {
          toast({ title: 'Error crítico', description: err.message, variant: 'destructive' });
      }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <Helmet>
        <title>Traspasos - Titán ERP</title>
      </Helmet>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">Traspasos de Mercancía <Truck className="h-6 w-6 text-indigo-600"/></h1>
          <p className="text-slate-500">Gestión de envíos y recepciones entre sucursales.</p>
        </div>
        
        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
           {(userRole === 'sistemas' || userRole === 'admin') && (
             <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
               <span className="text-xs font-bold text-slate-500 px-2 uppercase tracking-wider">Bodega Actual:</span>
               <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                 <SelectTrigger className="w-48 bg-white border-slate-300 h-8">
                   <SelectValue placeholder="Seleccionar..." />
                 </SelectTrigger>
                 <SelectContent>
                   {branches.map(b => (
                     <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           )}

          <div className="flex flex-wrap gap-2 mt-2 md:mt-0 justify-end">
            {(userRole === 'sistemas' || userRole === 'admin') && (
              <Button onClick={() => { setIsFactoryMode(true); setIsNewTransferModalOpen(true); }} className="bg-amber-600 hover:bg-amber-700">
                <Truck className="w-4 h-4 mr-2" />
                Generar Envío desde Planta
              </Button>
            )}
            <Button onClick={() => { setIsFactoryMode(false); setIsNewTransferModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700">
              <ArrowRight className="w-4 h-4 mr-2" />
              Nuevo Traspaso Saliente
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Bandeja de Entrada */}
          <Card className="border-emerald-100 shadow-sm">
             <CardHeader className="bg-emerald-50 border-b border-emerald-100">
                 <CardTitle className="text-emerald-900 flex items-center gap-2"><ArrowRight className="h-5 w-5 transform rotate-90"/> Traspasos Entrantes</CardTitle>
             </CardHeader>
             <CardContent className="p-0">
                {loading ? <div className="p-6 text-center text-slate-500">Cargando...</div> : (
                    <ul className="divide-y divide-slate-100">
                       {transfers.filter(t => t.destination_branch_id === selectedBranch).map(t => (
                           <li key={t.id} className="p-4 hover:bg-slate-50 transition-colors">
                               <div className="flex justify-between items-start mb-2">
                                   <div>
                                       <span className={`inline-block px-2 py-1 text-xs font-bold rounded-full mb-2 ${t.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                           {t.status === 'PENDING' ? 'PENDIENTE (En Camino)' : 'RECIBIDO'}
                                       </span>
                                       <p className="text-sm font-semibold text-slate-800">
                                           Desde: {t.origin_branch_id === null ? <span className="text-amber-600 font-bold">FÁBRICA / PROVEEDOR EXTERNO</span> : (t.origin?.name || 'Desconocida')}
                                       </p>
                                       <p className="text-xs text-slate-500">Fecha: {new Date(t.created_at).toLocaleString()}</p>
                                   </div>
                                   {t.status === 'PENDING' && (
                                       <Button size="sm" onClick={() => handleAcceptTransfer(t)} className="bg-emerald-600 hover:bg-emerald-700">
                                           <CheckCircle className="w-4 h-4 mr-1" /> Recibir
                                       </Button>
                                   )}
                               </div>
                               <div className="bg-white border rounded p-2 text-xs">
                                   <p className="font-bold mb-1 text-slate-700">Artículos:</p>
                                   {t.items.map((i, idx) => (
                                       <div key={idx} className="flex justify-between border-b border-slate-50 py-1 last:border-0">
                                           <span className="text-slate-600">{i.product_sku}</span>
                                           <span className="font-bold">{i.quantity} unid.</span>
                                       </div>
                                   ))}
                               </div>
                           </li>
                       ))}
                       {transfers.filter(t => t.destination_branch_id === selectedBranch).length === 0 && (
                           <div className="p-6 text-center text-slate-500 text-sm">No tienes traspasos entrantes.</div>
                       )}
                    </ul>
                )}
             </CardContent>
          </Card>

          {/* Bandeja de Salida */}
          <Card className="border-indigo-100 shadow-sm">
             <CardHeader className="bg-indigo-50 border-b border-indigo-100">
                 <CardTitle className="text-indigo-900 flex items-center gap-2"><ArrowRight className="h-5 w-5"/> Traspasos Emitidos</CardTitle>
             </CardHeader>
             <CardContent className="p-0">
                {loading ? <div className="p-6 text-center text-slate-500">Cargando...</div> : (
                    <ul className="divide-y divide-slate-100">
                       {transfers.filter(t => t.origin_branch_id === selectedBranch).map(t => (
                           <li key={t.id} className="p-4 hover:bg-slate-50 transition-colors">
                               <div className="flex justify-between items-start mb-2">
                                   <div>
                                       <span className={`inline-block px-2 py-1 text-xs font-bold rounded-full mb-2 ${t.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                           {t.status === 'PENDING' ? 'ESPERANDO RECEPCIÓN' : 'RECIBIDO POR DESTINO'}
                                       </span>
                                       <p className="text-sm font-semibold text-slate-800">Para: {t.destination?.name || 'Desconocida'}</p>
                                       <p className="text-xs text-slate-500">Emitido: {new Date(t.created_at).toLocaleString()}</p>
                                   </div>
                               </div>
                               <div className="bg-white border rounded p-2 text-xs">
                                   <p className="font-bold mb-1 text-slate-700">Artículos enviados:</p>
                                   {t.items.map((i, idx) => (
                                       <div key={idx} className="flex justify-between border-b border-slate-50 py-1 last:border-0">
                                           <span className="text-slate-600">{i.product_sku}</span>
                                           <span className="font-bold text-indigo-700">{i.quantity} unid.</span>
                                       </div>
                                   ))}
                               </div>
                           </li>
                       ))}
                       {transfers.filter(t => t.origin_branch_id === selectedBranch).length === 0 && (
                           <div className="p-6 text-center text-slate-500 text-sm">No has emitido traspasos recientes.</div>
                       )}
                    </ul>
                )}
             </CardContent>
          </Card>
      </div>

      <Dialog open={isNewTransferModalOpen} onOpenChange={setIsNewTransferModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isFactoryMode ? 'Emitir Envío desde PLANTA' : 'Emitir Nuevo Traspaso'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bodega Destino</Label>
              <Select value={newTransfer.destination_branch_id} onValueChange={v => setNewTransfer({...newTransfer, destination_branch_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecciona adónde enviar la mercancía..." /></SelectTrigger>
                <SelectContent>
                  {branches.filter(b => b.id !== selectedBranch).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-md border border-slate-200">
                <Label className="mb-2 block">Agregar Artículos al Traspaso</Label>
                <div className="flex gap-2 mb-4">
                    <div className="flex-1 flex flex-col gap-1">
                      <Select value={selectedProductSku} onValueChange={setSelectedProductSku}>
                          <SelectTrigger><SelectValue placeholder="SKU Producto..." /></SelectTrigger>
                          <SelectContent>
                          {products.map(p => (
                              <SelectItem key={p.sku} value={p.sku}>
                                {p.sku} - {p.name} {!isFactoryMode && `(Disp: ${inventoryMap[p.sku] || 0})`}
                              </SelectItem>
                          ))}
                          </SelectContent>
                      </Select>
                      {selectedProductSku && !isFactoryMode && (
                          <span className="text-xs text-slate-500 ml-1">Disponible: <strong className="text-emerald-600">{inventoryMap[selectedProductSku] || 0}</strong></span>
                      )}
                    </div>
                    <Input type="number" placeholder="Cant." className="w-24 h-10" value={selectedQuantity} onChange={e => setSelectedQuantity(e.target.value)} />
                    <Button onClick={handleAddItem} variant="secondary" className="h-10"><Plus className="w-4 h-4"/></Button>
                </div>

                {newTransfer.items.length > 0 && (
                    <div className="bg-white border rounded p-2">
                        <table className="w-full text-sm">
                            <thead><tr className="border-b text-left text-slate-500"><th className="pb-1">SKU</th><th className="pb-1">Cant.</th><th></th></tr></thead>
                            <tbody>
                                {newTransfer.items.map(item => (
                                    <tr key={item.sku} className="border-b last:border-0">
                                        <td className="py-1 font-medium">{item.sku}</td>
                                        <td className="py-1">{item.quantity}</td>
                                        <td className="py-1 text-right">
                                            <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(item.sku)} className="text-red-500 h-6 px-2"><XCircle className="w-3 h-3"/></Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-amber-50 p-3 rounded text-amber-800 text-sm flex gap-2 items-start border border-amber-200">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>Al emitir el traspaso, este quedará en estado <strong>PENDIENTE</strong>. El inventario se descontará de tu bodega solo hasta que la bodega destino lo confirme de recibido.</p>
            </div>
            
            <DialogFooter className="pt-4">
              <Button variant="ghost" onClick={() => setIsNewTransferModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateTransfer} className="bg-indigo-600 hover:bg-indigo-700">Emitir Traspaso</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
