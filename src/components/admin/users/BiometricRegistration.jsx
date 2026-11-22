import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Camera, Save, X, RefreshCw } from 'lucide-react';
import { supabase } from '@/supabaseClient';

const BiometricRegistration = ({ userId, onComplete, onCancel }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [descriptor, setDescriptor] = useState(null);
    const { toast } = useToast();

    useEffect(() => {
        const loadModels = async () => {
            const MODEL_URL = '/models';
            try {
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);
                startVideo();
            } catch (e) {
                console.error("Error loading FaceAPI models", e);
                toast({ title: "Error", description: "No se pudieron cargar los modelos biométricos.", variant: "destructive" });
            }
        };
        loadModels();

        return () => {
            stopVideo();
        };
    }, []);

    const startVideo = () => {
        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: 'user' } })
            .then((stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            })
            .catch((err) => console.error(err));
    };

    const stopVideo = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }
    };

    const handleCapture = async () => {
        if (!videoRef.current || detecting) return;
        setDetecting(true);

        try {
            // Detect face using Tiny Face Detector
            const detection = await faceapi.detectSingleFace(
                videoRef.current,
                new faceapi.TinyFaceDetectorOptions()
            )
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                setDescriptor(detection.descriptor);
                toast({ title: "Rostro Detectado", description: "Biometría capturada exitosamente.", className: "bg-green-600 text-white" });
            } else {
                toast({ title: "No se detectó rostro", description: "Asegúrese de tener buena iluminación y mirar de frente.", variant: "destructive" });
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Fallo en la detección facial.", variant: "destructive" });
        } finally {
            setDetecting(false);
        }
    };

    const handleSave = async () => {
        if (!descriptor) return;

        try {
            // Arrays cannot be stored directly easily in some SQL setups without specific types, 
            // but Supabase/Postgres supports JSONB or float arrays. 
            // We will store as JSON array for simplicity and compatibility.
            const descriptorArray = Array.from(descriptor);

            console.log("DEBUG: Saving biometrics...", { userId, descriptorLength: descriptorArray.length });

            const { data, error, count } = await supabase
                .from('hr_employees')
                .update({
                    face_descriptor: descriptorArray,
                    biometrics_updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select(); // Select to verify update occurred

            console.log("DEBUG: Supabase Update Result:", { data, error, count });

            if (error) throw error;

            if (!data || data.length === 0) {
                console.warn("DEBUG: No rows updated. Check if userId matches any hr_employee.");
                toast({ title: "Advertencia", description: "No se encontró el empleado para guardar.", variant: "warning" });
                return;
            }

            toast({ title: "Guardado", description: "Perfil biométrico actualizado correctamente." });
            onComplete();
        } catch (e) {
            console.error(e);
            toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto bg-slate-900 border-slate-700">
            <CardContent className="p-4 space-y-4">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden border-2 border-slate-600">
                    {!modelsLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center text-white gap-2">
                            <RefreshCw className="animate-spin" /> Cargando modelos...
                        </div>
                    )}
                    <video ref={videoRef} autoPlay muted className="w-full h-full object-cover" />
                    <canvas ref={canvasRef} className="absolute inset-0" />
                </div>

                <div className="flex gap-2 justify-between">
                    <Button variant="outline" onClick={onCancel} className="flex-1 border-slate-600 text-slate-300">
                        <X className="w-4 h-4 mr-2" /> Cancelar
                    </Button>

                    {!descriptor ? (
                        <Button
                            onClick={handleCapture}
                            disabled={!modelsLoaded || detecting}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {detecting ? <RefreshCw className="animate-spin mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                            Capturar
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSave}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Guardar Biometría
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default BiometricRegistration;
