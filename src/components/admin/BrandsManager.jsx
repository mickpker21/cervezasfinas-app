import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Upload, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getShopAuthHeaders } from '@/lib/api';

// Ajustar URL según entorno
const API_URL = '/api/shop/brands';
// const API_URL = 'http://localhost/cervezasfinas-shop/api/brands';

export default function BrandsManager() {
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingBrand, setEditingBrand] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        logo_url: '',
        color_gradient: 'from-gray-500 to-gray-700',
        display_order: 0
    });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        loadBrands();
    }, []);

    const loadBrands = async () => {
        try {
            const response = await fetch(`${API_URL}/list.php?all=true`);
            const result = await response.json();
            if (result.success) {
                setBrands(result.data);
            }
        } catch (error) {
            console.error('Error loading brands:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const authHeaders = await getShopAuthHeaders();
            const endpoint = editingBrand ? `${API_URL}/update.php` : `${API_URL}/create.php`;
            const body = editingBrand ? { ...formData, id: editingBrand.id } : formData;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify(body)
            });

            const result = await response.json();
            if (result.success) {
                loadBrands();
                closeModal();
            } else {
                alert('Error: ' + result.error);
            }
        } catch (error) {
            console.error('Error saving brand:', error);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro de eliminar esta marca?')) return;

        try {
            const authHeaders = await getShopAuthHeaders();
            const response = await fetch(`${API_URL}/delete.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify({ id })
            });

            if (response.ok) {
                loadBrands();
            }
        } catch (error) {
            console.error('Error deleting brand:', error);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formDataUpload = new FormData();
        formDataUpload.append('logo', file);

        try {
            const authHeaders = await getShopAuthHeaders();
            const response = await fetch(`${API_URL}/upload.php`, {
                method: 'POST',
                headers: {
                    ...authHeaders
                },
                body: formDataUpload
            });
            const result = await response.json();

            if (result.success) {
                setFormData(prev => ({ ...prev, logo_url: result.url }));
            } else {
                alert('Error subiendo imagen: ' + result.error);
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Error al subir imagen');
        } finally {
            setUploading(false);
        }
    };

    const openModal = (brand = null) => {
        if (brand) {
            setEditingBrand(brand);
            setFormData({
                name: brand.name,
                logo_url: brand.logo_url,
                color_gradient: brand.color_gradient,
                display_order: brand.display_order
            });
        } else {
            setEditingBrand(null);
            setFormData({
                name: '',
                logo_url: '',
                color_gradient: 'from-gray-500 to-gray-700',
                display_order: brands.length + 1
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingBrand(null);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Gestión de Marcas</h2>
                <Button onClick={() => openModal()} className="bg-green-600 hover:bg-green-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Marca
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {brands.map((brand) => (
                    <Card key={brand.id} className="bg-gray-800 border-gray-700 overflow-hidden">
                        <div className={`h-24 bg-gradient-to-br ${brand.color_gradient} relative flex items-center justify-center`}>
                            {brand.logo_url && !brand.logo_url.startsWith('http') && !brand.logo_url.startsWith('/') ? (
                                <span className="text-4xl">{brand.logo_url}</span>
                            ) : (
                                <img
                                    src={brand.logo_url ? (brand.logo_url.startsWith('http') ? brand.logo_url : (brand.logo_url.startsWith('/') ? brand.logo_url : '/' + brand.logo_url)) : `${API_URL}/image.php?name=${encodeURIComponent(brand.name)}`}
                                    alt={brand.name}
                                    className="h-16 w-16 object-contain drop-shadow-lg"
                                    onError={(e) => {
                                        const fallback = `${API_URL}/image.php?name=${encodeURIComponent(brand.name)}`;
                                        if (e.target.src !== fallback) {
                                            e.target.src = fallback;
                                        }
                                    }}
                                />
                            )}
                            {!brand.is_active && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <span className="text-red-500 font-bold border border-red-500 px-2 py-1 rounded">INACTIVO</span>
                                </div>
                            )}
                        </div>
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-lg text-white">{brand.name}</h3>
                                    <p className="text-xs text-gray-400">Orden: {brand.display_order}</p>
                                    <p className="text-xs text-gray-500 truncate max-w-[200px]">{brand.color_gradient}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => openModal(brand)} className="hover:bg-gray-700">
                                        <Edit className="w-4 h-4 text-blue-400" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(brand.id)} className="hover:bg-gray-700">
                                        <Trash2 className="w-4 h-4 text-red-400" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white">
                                {editingBrand ? 'Editar Marca' : 'Nueva Marca'}
                            </h3>
                            <button onClick={closeModal} className="text-gray-400 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label className="text-gray-300">Nombre</Label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-white"
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-gray-300">Logo (Emoji o Imagen)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={formData.logo_url}
                                        onChange={e => setFormData({ ...formData, logo_url: e.target.value })}
                                        className="bg-gray-800 border-gray-700 text-white flex-1"
                                        placeholder="🍺 o URL"
                                    />
                                    <div className="relative">
                                        <input
                                            type="file"
                                            onChange={handleFileUpload}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            accept="image/*"
                                        />
                                        <Button type="button" variant="outline" className="px-3" disabled={uploading}>
                                            <Upload className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                                {uploading && <p className="text-xs text-yellow-500 mt-1">Subiendo imagen...</p>}
                            </div>

                            <div>
                                <Label className="text-gray-300">Gradiente (Tailwind classes)</Label>
                                <Input
                                    value={formData.color_gradient}
                                    onChange={e => setFormData({ ...formData, color_gradient: e.target.value })}
                                    className="bg-gray-800 border-gray-700 text-white"
                                    placeholder="from-color-400 to-color-600"
                                />
                                <div className={`h-8 mt-2 rounded ${formData.color_gradient} border border-gray-600`}></div>
                            </div>

                            <div>
                                <Label className="text-gray-300">Orden</Label>
                                <Input
                                    type="number"
                                    value={formData.display_order}
                                    onChange={e => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                                    className="bg-gray-800 border-gray-700 text-white"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <Button type="button" variant="ghost" onClick={closeModal} className="text-gray-300">
                                    Cancelar
                                </Button>
                                <Button type="submit" className="bg-green-600 hover:bg-green-700">
                                    <Save className="w-4 h-4 mr-2" />
                                    Guardar
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
