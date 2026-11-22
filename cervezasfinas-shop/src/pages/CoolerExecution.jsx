import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Loader2, Camera, CheckCircle, Image as ImageIcon, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CoolerExecution() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [referencePhotos, setReferencePhotos] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        loadReferencePhotos();
    }, []);

    async function loadReferencePhotos() {
        setLoading(true);
        try {
            const response = await api.get('/cooler/reference-photos.php');
            if (response.success) {
                setReferencePhotos(response.data);
            }
        } catch (error) {
            console.error('Error loading reference photos:', error);
        } finally {
            setLoading(false);
        }
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result);
            };
            reader.readAsDataURL(file);
        }
    }

    async function handleSubmit() {
        if (!selectedFile) {
            alert('Por favor selecciona una foto');
            return;
        }

        setUploading(true);
        try {
            // 1. Upload photo first
            const formData = new FormData();
            formData.append('image', selectedFile);

            // Use raw fetch to handle FormData correctly (api.js forces JSON)
            // We need to import API_URL if not available, or hardcode/construct it. 
            // Better to rely on the same base URL structure.
            const token = localStorage.getItem('shop_token');
            const uploadResRaw = await fetch('https://cervezasfinas.com/api/shop/cooler/upload.php', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const uploadRes = await uploadResRaw.json();

            if (!uploadRes.success) {
                throw new Error(uploadRes.error || 'Error subiendo imagen');
            }

            const photoUrl = uploadRes.url;

            // 2. Submit execution with real photo URL
            const response = await api.post('/cooler/submit.php', {
                photo_url: photoUrl
            });

            if (response.success) {
                setSuccess(true);
            }
        } catch (error) {
            alert('Error al subir la foto: ' + error.message);
        } finally {
            setUploading(false);
        }
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
                    <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-2">¡Foto Enviada!</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Tu foto ha sido enviada correctamente. Televenta la revisará y te otorgará puntos según la calidad de la ejecución.
                    </p>
                    <div className="space-y-2">
                        <button
                            onClick={() => navigate('/points')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                        >
                            Ver Mis Puntos
                        </button>
                        <button
                            onClick={() => {
                                setSuccess(false);
                                setSelectedFile(null);
                                setPreviewUrl(null);
                            }}
                            className="w-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold py-3 rounded-lg transition-colors"
                        >
                            Subir Otra Foto
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
            <div className="container mx-auto px-4 max-w-4xl">
                <button
                    onClick={() => navigate('/catalog')}
                    className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-green-600 transition-colors font-medium"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Regresar al Catálogo
                </button>
                <h1 className="text-3xl font-bold mb-2">Ejecución de Enfriador</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                    Sube una foto de tu enfriador ejecutado correctamente y gana puntos
                </p>

                <div className="grid lg:grid-cols-2 gap-8">
                    {/* Reference Photos */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <ImageIcon className="w-5 h-5" />
                            Fotos de Referencia
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Revisa estas fotos de ejemplo para saber cómo debe verse una buena ejecución
                        </p>

                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            </div>
                        ) : referencePhotos.length === 0 ? (
                            <p className="text-center py-8 text-gray-500">
                                No hay fotos de referencia disponibles
                            </p>
                        ) : (
                            <div className="space-y-4 max-h-96 overflow-y-auto">
                                {referencePhotos.map((photo) => (
                                    <div key={photo.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                                        <img
                                            src={photo.photo_url}
                                            alt={photo.title}
                                            className="w-full h-48 object-cover"
                                        />
                                        {photo.title && (
                                            <div className="p-3">
                                                <p className="font-semibold">{photo.title}</p>
                                                {photo.description && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                        {photo.description}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Upload Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Camera className="w-5 h-5" />
                            Subir Tu Foto
                        </h2>

                        {previewUrl ? (
                            <div className="mb-4">
                                <img
                                    src={previewUrl}
                                    alt="Preview"
                                    className="w-full h-64 object-cover rounded-lg"
                                />
                                <button
                                    onClick={() => {
                                        setSelectedFile(null);
                                        setPreviewUrl(null);
                                    }}
                                    className="mt-2 text-sm text-red-600 hover:underline"
                                >
                                    Elegir otra foto
                                </button>
                            </div>
                        ) : (
                            <label className="block mb-4">
                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center hover:border-blue-500 cursor-pointer transition-colors">
                                    <Camera className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                                    <p className="text-gray-600 dark:text-gray-400 mb-1">
                                        Click para seleccionar una foto
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        JPG, PNG hasta 10MB
                                    </p>
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                            </label>
                        )}

                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                            <div className="flex gap-2">
                                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-800 dark:text-blue-300">
                                    <p className="font-semibold mb-1">Consejos para una buena foto:</p>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Asegúrate de que el enfriador esté limpio</li>
                                        <li>Todos los productos deben ser visibles</li>
                                        <li>Buena iluminación</li>
                                        <li>Foto nítida y sin movimiento</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={!selectedFile || uploading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                <>
                                    <Camera className="w-5 h-5" />
                                    Enviar Foto
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
