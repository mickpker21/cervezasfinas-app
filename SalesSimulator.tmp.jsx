import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, Trash2 } from 'lucide-react';

// Unificamos la obtención de datos para reducir las llamadas a la DB
async function fetchCombinedProductData(priceLevel) {
  if (!priceLevel) return [];

  // 1. Obtener precios para el nivel de cliente
  const { data: priceData, error: priceError } = await supabase
    .from('precios')
    .select(`cve_marca, des_marca, ${priceLevel}`);

  if (priceError) throw priceError;

  // 2. Obtener todas las imágenes de SKU
  const { data: imageData, error: imageError } = await supabase
    .from('sku_images')
    .select('sku, image_url');

  if (imageError) {
    console.warn('No se pudieron cargar las imágenes de SKU:', imageError);
  }

  const imagesBySku = (imageData || []).reduce((acc, img) => {
    if (img.sku) acc[img.sku] = img.image_url;
    return acc;
  }, {});

  // 3. Combinar precios e imágenes
  return priceData
    .map(p => ({
      ...p,
      price: p[priceLevel],
      imageUrl: imagesBySku[p.cve_marca]
    }))
    .filter(p => p.price != null);
}

const SalesSimulator = ({ client }) => {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const clientPriceLevel = useMemo(() => {
    // CORRECCIÓN: Volver a usar 'level' en lugar de 'nivel_precio'
    return client?.level?.toLowerCase() || 'bronce';
  }, [client]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const productData = await fetchCombinedProductData(clientPriceLevel);
        setProducts(productData);
      } catch (error) {
        console.error('Error al cargar productos:', error);
        toast({ title: 'Error', description: `No se pudieron cargar los productos: ${error.message}`, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [clientPriceLevel, toast]);

  const addToCart = (product) => {
    setCart(currentCart => {
      const existingItem = currentCart.find(item => item.cve_marca === product.cve_marca);
      if (existingItem) {
        return currentCart.map(item =>
          item.cve_marca === product.cve_marca ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...currentCart, { ...product, quantity: 1 }];
      }
    });
  };

  const updateQuantity = (cve_marca, quantity) => {
    const numQuantity = Number(quantity);
    if (numQuantity > 0) {
      setCart(cart.map(item => item.cve_marca === cve_marca ? { ...item, quantity: numQuantity } : item));
    } else {
      removeFromCart(cve_marca);
    }
  };

  const removeFromCart = (cve_marca) => {
    setCart(cart.filter(item => item.cve_marca !== cve_marca));
  };

  const filteredProducts = useMemo(() =>
    products.filter(p =>
      p.des_marca?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.cve_marca?.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  [products, searchTerm]);

  const cartTotal = useMemo(() =>
    cart.reduce((total, item) => total + (item.price * item.quantity), 0),
  [cart]);

  const savePreventa = async () => {
    if (cart.length === 0) {
      toast({ title: "Carrito vacío", description: "Añade productos antes de guardar.", variant: "destructive" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const preventa = {
      user_id: user.id,
      client_id: client.id,
      total_amount: cartTotal,
    };

    const { data: preventaData, error: preventaError } = await supabase
      .from('preventa')
      .insert(preventa)
      .select('id')
      .single();

    if (preventaError) {
      console.error("Error al guardar la preventa:", preventaError);
      toast({ title: "Error", description: `No se pudo guardar la simulación: ${preventaError.message}`, variant: "destructive" });
      return;
    }

    const preventaItems = cart.map(item => ({
      preventa_id: preventaData.id,
      cve_marca: item.cve_marca,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
    }));

    const { error: itemsError } = await supabase.from('preventa_items').insert(preventaItems);

    if (itemsError) {
      console.error("Error al guardar los items de la preventa:", itemsError);
      toast({ title: "Error", description: `Se guardó la simulación pero no los productos: ${itemsError.message}`, variant: "destructive" });
    } else {
      toast({ title: "¡Guardado!", description: "La simulación se ha guardado correctamente." });
      setCart([]);
    }
  };

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
      <div className="md:col-span-2 flex flex-col">
        <h1 className="text-2xl font-bold mb-4">Simulador de Venta</h1>
        <Card className="flex-grow flex flex-col">
          <CardHeader>
            <CardTitle>Cliente: {client.name} (Nivel: <span className="capitalize">{clientPriceLevel}</span>)</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col">
            <Input
              placeholder="Buscar producto por nombre o código..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="mb-4"
            />
            {loading ? <p>Cargando productos...</p> : (
              <div className="flex-grow overflow-y-auto" style={{ height: 'calc(100vh - 22rem)' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-24 text-right">Precio</TableHead>
                      <TableHead className="w-24 text-center">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map(product => (
                      <TableRow key={product.cve_marca}>
                        <TableCell>
                          <div className="flex items-center gap-4">
                            <img
                              src={product.imageUrl || 'https://placehold.co/64x64/eee/ccc?text=?'}
                              alt={product.des_marca}
                              className="w-12 h-12 object-contain rounded-md bg-white p-1"
                            />
                            <div>
                              <p className="font-medium">{product.des_marca}</p>
                              <p className="text-sm text-gray-500">{product.cve_marca}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">${product.price?.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" onClick={() => addToCart(product)}><ShoppingCart className="h-4 w-4"/></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Carrito</h2>
        <Card>
          <CardContent className="pt-6">
            {cart.length === 0 ? (
              <p className="text-gray-500">El carrito está vacío.</p>
            ) : (
              <div className="flex flex-col h-full">
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
                  {cart.map(item => (
                    <div key={item.cve_marca} className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium">{item.des_marca}</p>
                        <p className="text-sm">${item.price?.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.cve_marca, e.target.value)}
                          className="w-16 h-9 text-center"
                        />
                        <Button variant="destructive" size="icon" onClick={() => removeFromCart(item.cve_marca)}><Trash2 className="h-4 w-4"/></Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-4 border-t">
                  <div className="text-lg font-bold flex justify-between mb-4">
                    <span>Total:</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <Button className="w-full" onClick={savePreventa}>Guardar Simulación</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SalesSimulator;
