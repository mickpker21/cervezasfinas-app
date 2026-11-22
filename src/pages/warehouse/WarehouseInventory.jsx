import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Package, Search, Plus, ArrowDownUp, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { supabase } from '@/supabaseClient'; 

export default function WarehouseInventory() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [userRole, setUserRole] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  
  const [newProduct, setNewProduct] = useState({ sku: '', name: '', price: '', is_returnable: '0', returnable_container_sku: '' });
  const [movement, setMovement] = useState({ product_sku: '', type: 'INGRESO_FABRICA', quantity: '', reference: '' });

  useEffect(() => {
    if (!user) return;
    const role = user?.user_metadata?.role || user?.user_metadata?.type || '';
    setUserRole(role);

    const init = async () => {
      // 1. Fetch Branches
      const { data: bData } = await supabase.from('branches').select('id, name').order('name');
      setBranches(bData || []);

      let defaultBranch = '';
      if (role === 'sistemas' || role === 'admin') {
         defaultBranch = bData?.length > 0 ? bData[0].id : '';
      } else {
         // Get user's profile branch (assuming ruta or branch_id)
         const { data: profile } = await supabase.from('profiles').select('branch_id').eq('id', user.id).single();
         defaultBranch = profile?.branch_id || (bData?.length > 0 ? bData[0].id : '');
      }
      setSelectedBranch(defaultBranch);
    };
    init();
  }, [user]);

  const fetchData = async () => {
    if (!selectedBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    
    // Fetch Products
    const { data: pData } = await supabase.from('products').select('*');
    const prods = pData || [];

    // Fetch Inventory for Branch
    const { data: invData } = await supabase.from('warehouse_inventory').select('*').eq('branch_id', selectedBranch);
    const invMap = {};
    (invData || []).forEach(i => { invMap[i.product_sku] = i.quantity; });

    const merged = prods.map(p => ({
      ...p,
      quantity: invMap[p.sku] || 0
    }));

    setProducts(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [selectedBranch]);

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('products').insert([
        { 
          sku: newProduct.sku.trim(), 
          name: newProduct.name.trim(), 
          price: newProduct.price, 
          is_returnable: newProduct.is_returnable === '1',
          returnable_container_sku: newProduct.returnable_container_sku 
        }
    ]);
    if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
    }
    toast({ title: 'Producto Guardado', description: `El SKU ${newProduct.sku} se guardó exitosamente.` });
    setIsProductModalOpen(false);
    fetchData();
  };

  const handleSaveMovement = async (e) => {
    e.preventDefault();
    if (!selectedBranch) return;

    const qty = parseInt(movement.quantity);
    if (qty <= 0) return;

    let qtyMultiplier = 1;
    if (movement.type === 'MERMA' || movement.type === 'AJUSTE_NEGATIVO') {
      qtyMultiplier = -1;
    }

    const { error: txError } = await supabase.from('warehouse_transactions').insert([
      {
        branch_id: selectedBranch,
        product_sku: movement.product_sku,
        type: movement.type,
        quantity: qty * qtyMultiplier,
        reference_id: movement.reference || 'N/A',
        created_by: user.id
      }
    ]);

    if (txError) {
       toast({ title: 'Error', description: txError.message, variant: 'destructive' });
       return;
    }

    // Upsert Inventory
    const currentQty = products.find(p => p.sku === movement.product_sku)?.quantity || 0;
    const newQty = currentQty + (qty * qtyMultiplier);

    await supabase.from('warehouse_inventory').upsert({
       branch_id: selectedBranch,
       product_sku: movement.product_sku,
       quantity: newQty,
       last_updated: new Date().toISOString()
    }, { onConflict: 'branch_id,product_sku' });

    toast({ title: 'Movimiento Registrado', description: `Se registró ${movement.type} de ${movement.quantity} unidades.` });
    setIsMovementModalOpen(false);
    setMovement({ product_sku: '', type: 'INGRESO_PROVEEDOR', quantity: '', reference: '' });
    fetchData();
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    // Si no es sistemas/admin y no tiene stock, ocultarlo
    if (userRole !== 'sistemas' && userRole !== 'admin' && p.quantity <= 0) {
        return false;
    }
    
    return matchesSearch;
  });

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <Helmet>
        <title>Inventario Maestro - Titán ERP</title>
      </Helmet>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">Inventario Maestro <Package className="h-6 w-6 text-emerald-500"/></h1>
          <p className="text-slate-400">Catálogo global de SKUs y existencias actuales.</p>
        </div>
        
        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
             <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
               <span className="text-xs font-bold text-slate-400 px-2 uppercase tracking-wider">Bodega:</span>
               {(userRole === 'sistemas' || userRole === 'admin') ? (
                 <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                   <SelectTrigger className="w-48 bg-slate-900 border-slate-700 text-slate-200 h-8">
                     <SelectValue placeholder="Seleccionar..." />
                   </SelectTrigger>
                   <SelectContent>
                     {branches.map(b => (
                       <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               ) : (
                 <span className="px-2 font-medium text-slate-200 bg-slate-900 h-8 flex items-center rounded-md border border-slate-700 min-w-[12rem]">
                   {branches.find(b => b.id === selectedBranch)?.name || 'Cargando...'}
                 </span>
               )}
             </div>

          <div className="flex flex-wrap gap-2 mt-2 md:mt-0 justify-end">
             <Button variant="outline" onClick={() => setIsMovementModalOpen(true)} className="text-emerald-400 border-emerald-500 hover:bg-emerald-950 hover:text-emerald-300">
              <ArrowDownUp className="w-4 h-4 mr-2" />
              Kárdex / Ajuste
            </Button>
            {(userRole === 'sistemas' || userRole === 'admin') && (
              <Button onClick={() => setIsProductModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo SKU
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-lg shadow-sm border border-slate-800 mt-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-800/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Buscar por SKU o Nombre..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-950 border-slate-800 text-slate-200 w-full"
            />
          </div>
          <Button variant="ghost" className="text-slate-400 hover:text-emerald-400 hover:bg-slate-800">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold">SKU</th>
                <th className="px-6 py-3 font-semibold">Producto</th>
                <th className="px-6 py-3 font-semibold text-right">Precio Base</th>
                <th className="px-6 py-3 font-semibold text-center">Tipo</th>
                <th className="px-6 py-3 font-semibold text-right">Existencia FÍSICA</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((item, index) => (
                <tr key={item.id} className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors ${index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/30'}`}>
                  <td className="px-6 py-4 font-mono font-medium text-slate-200">{item.sku}</td>
                  <td className="px-6 py-4 font-semibold text-slate-100">{item.name}</td>
                  <td className="px-6 py-4 text-right text-slate-300">${Number(item.price).toFixed(2)}</td>
                  <td className="px-6 py-4 text-center">
                    {item.is_returnable ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/50 text-amber-400">
                        Retornable
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
                        Desechable / General
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-emerald-400 text-lg">
                    {item.quantity.toLocaleString('es-MX')}
                  </td>
                </tr>
              ))}
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-10 text-center text-slate-400">Cargando inventario...</td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-10 text-center text-slate-400">
                    No se encontraron productos en el inventario. Agrega SKUs nuevos usando el botón "Nuevo SKU".
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo Producto */}
      <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Nuevo Producto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveProduct} className="space-y-4">
            <div className="space-y-2">
              <Label>SKU (Código único)</Label>
              <Input required placeholder="Ej. CERV-001" value={newProduct.sku} onChange={e => setNewProduct({...newProduct, sku: e.target.value.toUpperCase()})} />
            </div>
            <div className="space-y-2">
              <Label>Nombre del Producto</Label>
              <Input required placeholder="Ej. Cerveza Clara 355ml" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Precio Base de Venta ($)</Label>
              <Input required type="number" step="0.01" placeholder="0.00" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>¿Es envase retornable?</Label>
              <Select value={newProduct.is_returnable} onValueChange={v => setNewProduct({...newProduct, is_returnable: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No (Desechable / Otro)</SelectItem>
                  <SelectItem value="1">Sí (Líquido en envase retornable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newProduct.is_returnable === '1' && (
              <div className="space-y-2 bg-amber-50 p-3 rounded border border-amber-200">
                <Label className="text-amber-900 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> SKU del Envase Vacío Asociado</Label>
                <Input placeholder="Ej. ENV-355" value={newProduct.returnable_container_sku} onChange={e => setNewProduct({...newProduct, returnable_container_sku: e.target.value.toUpperCase()})} />
                <p className="text-xs text-amber-700">Debe coincidir con el SKU del envase en el que se entrega este producto.</p>
              </div>
            )}
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsProductModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Guardar Producto</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Registrar Movimiento (Kárdex) */}
      <Dialog open={isMovementModalOpen} onOpenChange={setIsMovementModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento de Almacén</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveMovement} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Movimiento</Label>
              <Select value={movement.type} onValueChange={v => setMovement({...movement, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INGRESO_PROVEEDOR">Ingreso de Proveedor (+)</SelectItem>
                  <SelectItem value="AJUSTE_POSITIVO">Ajuste de Inventario (+)</SelectItem>
                  <SelectItem value="MERMA">Merma / Daño (-)</SelectItem>
                  <SelectItem value="AJUSTE_NEGATIVO">Ajuste Negativo (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SKU del Producto</Label>
              <Select value={movement.product_sku} onValueChange={v => setMovement({...movement, product_sku: v})}>
                <SelectTrigger><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.sku} value={p.sku}>{p.sku} - {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input required type="number" min="1" placeholder="0" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Referencia / Folio / Nota</Label>
              <Input placeholder="Ej. Factura F-10293" value={movement.reference} onChange={e => setMovement({...movement, reference: e.target.value})} />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsMovementModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Registrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
