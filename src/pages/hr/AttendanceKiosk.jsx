import React, { useState, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Camera, Lock, CheckCircle, User, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';
import { recordAttendance, getLastAttendance } from '@/repositories/hrRepository';
import { supabase } from '@/mysqlClient';
import { getDb, isMockDb } from '@/lib/localDb';

const FALLBACK_PIN = '56765';

const AttendanceKiosk = () => {
    const [view, setView] = useState('LOCKED'); // LOCKED, LOADING_MODELS, SCANNING, SUCCESS
    const [pin, setPin] = useState('');
    const [systemPin, setSystemPin] = useState(FALLBACK_PIN);
    const [loading, setLoading] = useState(false);
    const [detectedUser, setDetectedUser] = useState(null); // { id, name, role, ... }
    const [nextAction, setNextAction] = useState('check_in'); // check_in or check_out
    const [modelsLoaded, setModelsLoaded] = useState(false);

    // We'll store all known descriptors in memory for fast matching. 
    // In a huge enterprise, this might need optimization, but for <1000 employees it's fine.
    const [labeledDescriptors, setLabeledDescriptors] = useState([]);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const { toast } = useToast();

    // Fetch dynamic PIN on mount
    useEffect(() => {
        const fetchKioskPin = async () => {
            try {
                const db = await getDb();
                let pinValue = FALLBACK_PIN;

                if (isMockDb()) {
                    const allSettings = db._storage.get('global_settings') || [];
                    const setting = allSettings.find(s => s.key === 'kiosk_pin');
                    if (setting && setting.value) pinValue = setting.value;
                } else {
                    const res = await db.query("SELECT value FROM global_settings WHERE key = 'kiosk_pin'");
                    if (res.values && res.values.length > 0) {
                        pinValue = res.values[0].value;
                    }
                }
                
                // Limpiar comillas si vienen en el JSON
                if (pinValue && pinValue.startsWith('"') && pinValue.endsWith('"')) {
                    pinValue = pinValue.slice(1, -1);
                }
                setSystemPin(String(pinValue));
            } catch (err) {
                console.error('Could not fetch kiosk pin from local DB, using fallback.', err);
            }
        };
        fetchKioskPin();
    }, []);

    // 1. PIN UNLOCK & MODEL LOADING
    const handlePinSubmit = async (e) => {
        e.preventDefault();
        if (pin === systemPin) {
            setView('LOADING_MODELS');
            try {
                await loadModelsAndData();
                setView('SCANNING');
                setView('SCANNING');
                // startCamera(); // Handled by useEffect
            } catch (error) {
                console.error(error);
                toast({ title: "Error", description: "Fallo al iniciar el sistema biométrico.", variant: "destructive" });
                setView('LOCKED');
            }
        } else {
            toast({ title: "Código Incorrecto", description: "PIN inválido.", variant: "destructive" });
            setPin('');
        }
    };

    const loadModelsAndData = async () => {
        const MODEL_URL = '/models';
        console.log("Loading FaceAPI models...");
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        console.log("Models loaded.");

        // Fetch users from local DB
        let users = [];
        try {
            const db = await getDb();
            if (isMockDb()) {
                const cachedProfiles = db._storage.get('profiles_kiosk') || [];
                users = cachedProfiles.filter(p => p.face_descriptor);
            } else {
                const res = await db.query("SELECT id, full_name as name, role, face_descriptor FROM profiles WHERE face_descriptor IS NOT NULL");
                users = res.values || [];
            }
        } catch (err) {
            console.error("Error reading profiles from local DB:", err);
            throw err;
        }

        const descriptors = users.map(user => {
            // Convert JSON array back to Float32Array. Ensure it's parsed if it's a string from SQLite.
            let descArray = user.face_descriptor;
            if (typeof descArray === 'string') {
                descArray = JSON.parse(descArray);
            }
            const floatArray = new Float32Array(descArray);
            return new faceapi.LabeledFaceDescriptors(
                user.id, // Label is IDs
                [floatArray]
            );
        });

        setLabeledDescriptors(descriptors);
        setModelsLoaded(true);
    };

    // 2. CAMERA HANDLING
    useEffect(() => {
        let stream = null;

        const initCamera = async () => {
            if (view === 'SCANNING' || view === 'CONFIRM') {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Error accessing camera", err);
                    toast({ title: "Error de Cámara", description: "Verifique permisos.", variant: "destructive" });
                }
            }
        };

        initCamera();

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [view]);

    const stopCamera = () => {
        // Redundant now handled by useEffect cleanup, but kept for explicit UI actions if needed
    };

    // 3. REAL FACIAL RECOGNITION
    const handleCapture = async () => {
        if (loading || !modelsLoaded || labeledDescriptors.length === 0) {
            if (labeledDescriptors.length === 0) {
                toast({ title: "Sin Datos", description: "No hay empleados registrados con biometría.", variant: "destructive" });
            }
            return;
        }

        setLoading(true);

        try {
            // Detect face using Tiny Face Detector
            const detection = await faceapi.detectSingleFace(
                videoRef.current,
                new faceapi.TinyFaceDetectorOptions()
            )
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                toast({ title: "No detectado", description: "No se encontró un rostro claro.", variant: "destructive" });
                setLoading(false);
                return;
            }

            // Match against DB
            const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6); // 0.6 is distance threshold
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

            if (bestMatch.label.toString() === 'unknown') {
                toast({ title: "Desconocido", description: "Rostro no reconocido en el sistema.", variant: "destructive" });
            } else {
                // Found a match!
                const matchedUser = await fetchUser(bestMatch.label);

                // Determine Check-in vs Check-out
                const lastLog = await getLastAttendance(matchedUser.id);
                let action = 'check_in';

                if (lastLog) {
                    const lastTime = new Date(lastLog.timestamp);
                    const now = new Date();
                    const isToday = lastTime.toDateString() === now.toDateString();

                    if (isToday && lastLog.type === 'check_in') {
                        action = 'check_out';
                    }
                }

                setDetectedUser(matchedUser);
                setNextAction(action);
                setView('CONFIRM');
            }

        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Error en el procesamiento facial.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    // Helper to get full user details from local list or refetch if needed
    // (Here we just use the ID to find in our labeledDescriptors if we stored metadata, but we only stored descriptors there)
    // Optimization: We could store the user object in a map.
    const fetchUser = async (id) => {
        const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
        return data;
    };

    const confirmAttendance = async () => {
        setLoading(true);
        try {
            await recordAttendance(detectedUser.id, nextAction, { lat: 0, lng: 0 }); // Fixed kiosk location

            setView('SUCCESS');
            setTimeout(() => {
                setView('SCANNING');
                setDetectedUser(null);
            }, 3000);
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Fallo al registrar asistencia.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    // UI RENDERERS
    if (view === 'LOCKED') {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
                <Card className="w-full max-w-md bg-slate-900 border-slate-800">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-700 shadow-inner">
                            <Lock className="w-8 h-8 text-emerald-500" />
                        </div>
                        <CardTitle className="text-2xl text-white">Kiosco de Asistencia</CardTitle>
                        <p className="text-slate-400">Ingrese PIN administrativo para activar</p>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handlePinSubmit} className="space-y-4">
                            <Input
                                type="password"
                                placeholder="• • • • •"
                                className="text-center text-3xl tracking-[1em] text-white bg-slate-950 border-slate-700 h-16"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                maxLength={5}
                                autoFocus
                            />
                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-lg h-12">
                                Desbloquear
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (view === 'LOADING_MODELS') {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
                <RefreshCw className="w-16 h-16 text-emerald-500 animate-spin mb-4" />
                <h2 className="text-2xl font-bold">Cargando Sistema Biométrico...</h2>
                <p className="text-slate-400">Descargando modelos neuronales...</p>
            </div>
        )
    }

    if (view === 'SCANNING' || view === 'CONFIRM') {
        return (
            <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 p-6 z-10 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Reconocimiento Facial</h2>
                        <p className="text-white/70">Mire a la cámara para registrar asistencia</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => { setView('LOCKED'); stopCamera(); }} className="text-white/50 hover:text-white hover:bg-white/10">
                        <XCircle />
                    </Button>
                </div>

                {/* Camera View */}
                <div className="flex-1 relative flex items-center justify-center">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ transform: 'scaleX(-1)' }} // Mirror effect
                    />

                    {/* Face Guide Overlay */}
                    {view === 'SCANNING' && !loading && (
                        <div className="relative z-0 w-64 h-80 border-2 border-emerald-500/50 rounded-[3rem] shadow-[0_0_100px_rgba(16,185,129,0.3)] animate-pulse flex items-center justify-center">
                            <div className="w-full h-1 bg-emerald-500/30 absolute top-1/2 -translate-y-1/2 animate-scan" />
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black via-black/90 to-transparent pt-20 flex flex-col items-center gap-4">
                    {loading ? (
                        <div className="flex flex-col items-center gap-2">
                            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                            <span className="text-emerald-400 font-medium tracking-wide">Procesando biometría...</span>
                        </div>
                    ) : view === 'CONFIRM' ? (
                        <Card className="w-full max-w-sm bg-slate-900/90 border-slate-700 backdrop-blur">
                            <CardContent className="pt-6 text-center space-y-4">
                                <div className="mx-auto w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center border-2 border-emerald-500">
                                    <User className="w-10 h-10 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white text-lg">Hola, {detectedUser?.name}</h3>
                                    <p className="text-slate-400 text-sm">{detectedUser?.role}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Button variant="outline" onClick={() => { setView('SCANNING'); setDetectedUser(null); }} className="border-slate-600 text-slate-300 hover:bg-slate-800">
                                        No soy yo
                                    </Button>
                                    <Button onClick={confirmAttendance} className={`hover:bg-opacity-90 ${nextAction === 'check_out' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                                        {nextAction === 'check_in' ? 'Registrar Entrada' : 'Registrar Salida'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Button
                            onClick={handleCapture}
                            size="lg"
                            className="rounded-full h-20 w-20 bg-white hover:bg-gray-100 text-black border-4 border-emerald-500/30 shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                        >
                            <Camera className="w-8 h-8" />
                        </Button>
                    )}

                    {view === 'SCANNING' && !loading && (
                        <p className="text-white/50 text-sm mt-2">
                            {labeledDescriptors.length === 0 ?
                                <span className="text-yellow-500 flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> Sin base de datos biométrica</span> :
                                "Toque el botón para escanear"}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (view === 'SUCCESS') {
        return (
            <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4">
                <div className="text-center space-y-6 animate-in zoom-in duration-300">
                    <div className="mx-auto w-32 h-32 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl">
                        <CheckCircle className="w-20 h-20 text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold text-white mb-2">
                            {nextAction === 'check_in' ? '¡Entrada Registrada!' : '¡Salida Registrada!'}
                        </h1>
                        <p className="text-emerald-100 text-xl">Bienvenido, {detectedUser?.name}</p>
                    </div>
                    <div className="text-emerald-200/60 text-sm">
                        Volviendo al escáner en 3...
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default AttendanceKiosk;
