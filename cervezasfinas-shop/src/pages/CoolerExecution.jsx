import React, { useState, useEffect } from 'react';
import { api, API_URL } from '../lib/api';
import { Loader2, Camera, CheckCircle, Image as ImageIcon, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DirectCameraModal from '../components/DirectCameraModal';

function compressImage(file, maxWidth = 1280, quality = 0.8) {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) {
            resolve(file);
            return;
        }
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            let { width, height } = img;
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file);
                        return;
                    }
                    const compressedFile = new File(
                        [blob],
                        file.name.replace(/\.[^.]+$/, '.jpg'),
                        { type: 'image/jpeg', lastModified: Date.now() }
                    );
                    resolve(compressedFile);
                },
                'image/jpeg',
                quality
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file);
        };
        img.src = objectUrl;
    });
}

function resolveCoolerPhotoUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:')) {
        return rawUrl;
    }
    const clean = rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl;
    if (clean.startsWith('/assets/cooler_refs/')) {
        return 'https://cervezasfinas.com/api' + clean;
    }
    return 'https://cervezasfinas.com' + clean;
}

export default function CoolerExecution() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [referencePhotos, setReferencePhotos] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [compressing, setCompressing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);

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

    async function handleCameraCapture(file, dataUrl) {
        if (!file) return;
        setCompressing(true);
        try {
            const optimized = await compressImage(file, 1280, 0.8);
            setSelectedFile(optimized);
            if (dataUrl) {
                setPreviewUrl(dataUrl);
            } else {
                const reader = new FileReader();
                reader.onloadend = () => setPreviewUrl(reader.result);
                reader.readAsDataURL(optimized);
            }
        } catch (error) {
            console.error('Error compressing camera image:', error);
            setSelectedFile(file);
            if (dataUrl) setPreviewUrl(dataUrl);
        } finally {
            setCompressing(false);
        }
    }

    async function handleSubmit() {
        if (!selectedFile) return;

        setUploading(true);
        try {
            // 1. Upload photo file
            const formData = new FormData();
            formData.append('image', selectedFile);
            formData.append('photo', selectedFile);

            const token = localStorage.getItem('shop_token');
            const uploadResRaw = await fetch(`${API_URL}/cooler/upload.php`, {
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

            if (!response.success) {
                throw new Error(response.error || 'No se pudo registrar la foto para revisión');
            }
            setSuccess(true);
        } catch (error) {
            alert('Error al subir la foto: ' + error.message);
        } finally {
            setUploading(false);
        }
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-200">
                    <CheckCircle className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
                    <h1 className="text-2xl font-black text-gray-900 mb-2">¡Foto de Enfriador Enviada!</h1>
                    <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                        Tu foto ha sido enviada correctamente. El equipo de Televenta la revisará y te otorgará puntos según el acomodo y la calidad de la ejecución.
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={() => navigate('/points')}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors"
                        >
                            Ver Mis Puntos
                        </button>
                        <button
                            onClick={() => {
                                setSuccess(false);
                                setSelectedFile(null);
                                setPreviewUrl(null);
                            }}
                            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl transition-colors border border-gray-200"
                        >
                            Subir Otra Foto
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-6 sm:py-8 text-gray-900">
            <div className="container mx-auto px-4 max-w-5xl">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => navigate('/catalog')}
                        className="p-2.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm rounded-full transition-colors"
                        title="Regresar al catálogo"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-800" />
                    </button>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Ejecución de Enfriador</h1>
                        <p className="text-xs text-gray-500 font-medium">Sube una foto de tu enfriador y gana puntos lealtad</p>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-5 sm:gap-6 lg:gap-8">
                    {/* Reference Photos */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <ImageIcon className="w-5 h-5 text-emerald-600" />
                            Fotos Guía de Referencia
                        </h2>
                        <p className="text-xs sm:text-sm text-gray-600 mb-4 leading-relaxed">
                            Acomoda las cervezas en tu enfriador siguiendo este ejemplo oficial para asegurar tus puntos de bonificación.
                        </p>

                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                            </div>
                        ) : referencePhotos.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                                <p className="text-gray-600 font-semibold text-sm">
                                    No hay fotos de referencia disponibles
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                                {referencePhotos.map((photo) => {
                                    const fullUrl = resolveCoolerPhotoUrl(photo.photo_url || photo.image_url);
                                    return (
                                        <div key={photo.id} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 shadow-xs">
                                            <a href={fullUrl} target="_blank" rel="noopener noreferrer" title="Toca para ver imagen completa">
                                                <img
                                                    src={fullUrl}
                                                    alt={photo.title || 'Referencia de enfriador'}
                                                    className="w-full h-56 object-contain bg-white p-2"
                                                />
                                            </a>
                                            {photo.title && (
                                                <div className="p-3 bg-white border-t border-gray-200">
                                                    <p className="font-bold text-gray-900 text-sm">{photo.title}</p>
                                                    {photo.description && (
                                                        <p className="text-xs text-gray-600 mt-1">
                                                            {photo.description}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Upload Section */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6 flex flex-col justify-between">
                        <div>
                            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                                <Camera className="w-5 h-5 text-emerald-600" />
                                Tomar Foto en Vivo
                            </h2>
                            <p className="text-xs sm:text-sm text-gray-600 mb-4 leading-relaxed">
                                Toma una fotografía clara de frente a tu enfriador directamente con la cámara (no se permiten fotos de galería).
                            </p>

                            {previewUrl ? (
                                <div className="mb-4">
                                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-100">
                                        <img
                                            src={previewUrl}
                                            alt="Preview"
                                            className="w-full h-64 object-contain"
                                        />
                                    </div>
                                    <div className="mt-2.5 flex items-center justify-between text-xs text-gray-500">
                                        <span>
                                            Foto lista {selectedFile ? `(${Math.round(selectedFile.size / 1024)} KB optimizado)` : ''}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedFile(null);
                                                setPreviewUrl(null);
                                                setCameraOpen(true);
                                            }}
                                            className="text-xs text-red-600 hover:underline font-bold"
                                        >
                                            Tomar otra foto
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setCameraOpen(true)}
                                    disabled={compressing}
                                    className="block w-full mb-4 text-left"
                                >
                                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 sm:p-12 text-center hover:border-emerald-500 hover:bg-emerald-50/20 cursor-pointer transition-all bg-gray-50">
                                        {compressing ? (
                                            <Loader2 className="w-12 h-12 mx-auto text-emerald-600 animate-spin mb-3" />
                                        ) : (
                                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3 text-emerald-700">
                                                <Camera className="w-7 h-7" />
                                            </div>
                                        )}
                                        <p className="text-gray-800 font-bold text-sm sm:text-base mb-1">
                                            {compressing ? 'Optimizando foto...' : 'Abrir Cámara Directa'}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            Solo captura en vivo · Compresión automática para cuidar tus datos
                                        </p>
                                    </div>
                                </button>
                            )}

                            {/* Tips Card */}
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5 text-xs text-emerald-900">
                                <div className="flex gap-2.5 items-start">
                                    <AlertCircle className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold mb-1">Requisitos para recibir tus puntos:</p>
                                        <ul className="list-disc list-inside space-y-0.5 text-emerald-800">
                                            <li>Enfriador limpio y ordenado</li>
                                            <li>Marcas oficiales UM6 SHOP visibles de frente</li>
                                            <li>Buena iluminación, sin reflejos excesivos ni movimiento</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={!selectedFile || uploading || compressing}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-md shadow-emerald-700/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base active:scale-[0.98]"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Enviando para Revisión...
                                </>
                            ) : (
                                <>
                                    <Camera className="w-5 h-5" />
                                    Enviar Foto para Puntos
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <DirectCameraModal
                isOpen={cameraOpen}
                onClose={() => setCameraOpen(false)}
                onCapture={handleCameraCapture}
                title="Foto de Enfriador (Solo Cámara)"
            />
        </div>
    );
}
