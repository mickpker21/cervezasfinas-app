import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { supabase } from "../supabaseClient";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { Camera, MapPin, StickyNote, Sparkles, CheckCircle2, AlertTriangle, Navigation } from "lucide-react";
import { getOptionalPositionFast, warmUpGeolocation } from "@/lib/geolocation";
import { getTodayMexico, getNowMexico, getMexicoDateTime } from "@/lib/dateUtils";
import { DirectCameraModal } from "@/components/common/DirectCameraModal";
import { getRememberedClientCoords, rememberClientCoords } from "@/repositories/clientsRepository";

const MAX_VISIT_DISTANCE_METERS = 200;

function extractClientCoords(c) {
  if (!c) return null;
  const remembered = getRememberedClientCoords(c);
  if (remembered && Number.isFinite(remembered.lat) && Number.isFinite(remembered.lng)) {
    return { lat: Number(remembered.lat), lng: Number(remembered.lng) };
  }
  const raw = c.coords;
  if (raw) {
    if (Array.isArray(raw) && raw.length >= 2) {
      const la = Number(raw[0]);
      const ln = Number(raw[1]);
      if (Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0)) return { lat: la, lng: ln };
    } else if (typeof raw === "object") {
      const la = Number(raw.lat ?? raw.latitude);
      const ln = Number(raw.lng ?? raw.lon ?? raw.longitude);
      if (Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0)) return { lat: la, lng: ln };
    } else if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        return extractClientCoords({ coords: parsed });
      } catch {
        const parts = raw.split(",").map((s) => Number(s.trim()));
        if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && !(parts[0] === 0 && parts[1] === 0)) {
          return { lat: parts[0], lng: parts[1] };
        }
      }
    }
  }
  const flatLat = Number(c.lat ?? c.latitude ?? c.latitud);
  const flatLng = Number(c.lng ?? c.longitude ?? c.longitud ?? c.lon);
  if (Number.isFinite(flatLat) && Number.isFinite(flatLng) && !(flatLat === 0 && flatLng === 0)) {
    return { lat: flatLat, lng: flatLng };
  }
  return null;
}

function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const NOTE_PRESETS = [
  "Cliente sin inventario frío.",
  "Se acordó visita de seguimiento en 7 días.",
  "Se detectó oportunidad de nuevos SKUs.",
  "Solicita apoyo para material POP.",
];

const MOTIVOS = ["Prospeccion", "Negociacion", "Cierre", "Seguimiento", "Reposición", "Visita Express"];

export default function VisitForm({ client, onSave, onClientCoordsUpdated, initialData = {}, forceMotivo = null }) {
  const { user } = useSupabaseAuth();
  const [motivo, setMotivo] = useState(forceMotivo || initialData.motivo || MOTIVOS[0]);
  const [notes, setNotes] = useState(initialData.notes || "");
  const [notaRapida, setNotaRapida] = useState("");
  const [proximoPaso, setProximoPaso] = useState("");
  const [photoFachada, setPhotoFachada] = useState(null);
  const [photoInterior, setPhotoInterior] = useState(null);
  const [photoEnfriador, setPhotoEnfriador] = useState(null);
  const [fachadaError, setFachadaError] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [clientCoords, setClientCoords] = useState(() => extractClientCoords(client));
  const [updatingClientGeo, setUpdatingClientGeo] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [loading, setLoading] = useState(false);

  // Mantener coordenadas del cliente siempre sincronizadas con prop + cache local + SQLite
  useEffect(() => {
    const freshFromProp = extractClientCoords(client);
    if (freshFromProp) {
      setClientCoords(freshFromProp);
    }
    let cancelled = false;
    if (client?.id) {
      (async () => {
        try {
          const { loadClientsFromLocalByIds } = await import("@/repositories/clientsRepository");
          const rows = await loadClientsFromLocalByIds([client.id]);
          if (!cancelled && rows?.[0]) {
            const dbCoords = extractClientCoords(rows[0]);
            if (dbCoords) {
              setClientCoords(dbCoords);
            }
          }
        } catch {
          // ignore
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [client?.id, client?.lat, client?.lng, client?.coords]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGettingLocation(true);
      const pos = await getOptionalPositionFast(6000);
      if (!cancelled && pos) {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
      }
      if (!cancelled) setGettingLocation(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client?.id]);

  const distanceToClient = useMemo(() => {
    const numLat = Number(lat);
    const numLng = Number(lng);
    if (!lat || !lng || !Number.isFinite(numLat) || !Number.isFinite(numLng)) return null;
    if (!clientCoords || !Number.isFinite(clientCoords.lat) || !Number.isFinite(clientCoords.lng)) return null;
    return calcDistanceMeters(numLat, numLng, clientCoords.lat, clientCoords.lng);
  }, [lat, lng, clientCoords]);

  const isTooFar = distanceToClient !== null && distanceToClient > MAX_VISIT_DISTANCE_METERS;

  const resumenCliente = useMemo(() => {
    const nombre = client?.business_name || client?.name || "Cliente";
    const direccion = client?.address || "Sin dirección registrada";
    const ruta = client?.sales_route || client?.internal_route || "Sin ruta";
    const telefono = client?.phone || "Sin teléfono";
    return { nombre, direccion, ruta, telefono };
  }, [client]);

  const handleCaptureLocation = async () => {
    setLocationError("");
    setGettingLocation(true);
    try {
      const pos = await getOptionalPositionFast(6000);
      if (pos) {
        const { latitude, longitude } = pos.coords;
        setLat(String(latitude));
        setLng(String(longitude));
      } else {
        setLocationError("No se detectó señal GPS en 6s. Verifica que el GPS del teléfono esté encendido.");
      }
    } finally {
      setGettingLocation(false);
    }
  };

  // Permite actualizar las coordenadas del cliente directamente dentro del formulario de visita
  // y sincroniza el estado en 0ms para que al cerrar/guardar la visita NUNCA use coordenadas viejas
  const handleUpdateClientLocationHere = async () => {
    setLocationError("");
    setUpdatingClientGeo(true);
    try {
      let currentLat = lat ? Number(lat) : null;
      let currentLng = lng ? Number(lng) : null;

      const pos = await getOptionalPositionFast(6000);
      if (pos) {
        currentLat = Number(pos.coords.latitude);
        currentLng = Number(pos.coords.longitude);
        setLat(String(currentLat));
        setLng(String(currentLng));
      }

      if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) {
        setLocationError("No se pudo obtener tu ubicación GPS actual para actualizar al cliente.");
        return;
      }

      const newCoords = { lat: currentLat, lng: currentLng };
      // 1. Actualizar inmediatamente en memoria local y formulario (distancia pasa a 0m al instante)
      if (client?.id || client?.client_code) {
        rememberClientCoords(client?.id, client?.client_code || client?.cve_cliente, currentLat, currentLng);
      }
      setClientCoords(newCoords);

      // 2. Persistir en SQLite + MySQL / cola offline
      if (client?.id) {
        const { updateClient } = await import("@/repositories/clientsRepository");
        await updateClient(client.id, {
          lat: currentLat,
          lng: currentLng,
          coords: newCoords,
        });
      }

      // 3. Notificar al componente padre (DynamicAdvisorRoute, DynamicAdvisorClients, etc.)
      if (onClientCoordsUpdated) {
        onClientCoordsUpdated(newCoords);
      }
    } catch (err) {
      console.error("[VisitForm] Error actualizando geolocalización del cliente:", err);
      setLocationError("Se actualizó la ubicación para esta visita, pero hubo un detalle al sincronizar.");
    } finally {
      setUpdatingClientGeo(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocationError("");

    // 🔴 Foto de Fachada OBLIGATORIA
    if (!photoFachada) {
      setFachadaError(true);
      const el = document.getElementById('media-fachada');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setFachadaError(false);

    // 🔴 Geolocalización y validación de geocerca (máximo 200m del cliente)
    let finalLat = lat;
    let finalLng = lng;
    if (!finalLat || !finalLng) {
      setGettingLocation(true);
      const quickPos = await getOptionalPositionFast(6000);
      setGettingLocation(false);
      if (quickPos) {
        finalLat = String(quickPos.coords.latitude);
        finalLng = String(quickPos.coords.longitude);
        setLat(finalLat);
        setLng(finalLng);
      }
    }

    const numFinalLat = Number(finalLat);
    const numFinalLng = Number(finalLng);
    if (!finalLat || !finalLng || !Number.isFinite(numFinalLat) || !Number.isFinite(numFinalLng)) {
      setLocationError("⚠️ Debes tener el GPS activo y capturar tu ubicación para poder guardar la visita.");
      const geoEl = document.getElementById("visit-geo-section");
      if (geoEl) geoEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Re-verificar si se acaba de actualizar la ubicación del cliente en memoria/cache
    const latestRemembered = getRememberedClientCoords(client);
    const effectiveClientCoords = latestRemembered || clientCoords;
    if (latestRemembered && (!clientCoords || clientCoords.lat !== latestRemembered.lat || clientCoords.lng !== latestRemembered.lng)) {
      setClientCoords({ lat: latestRemembered.lat, lng: latestRemembered.lng });
    }

    if (effectiveClientCoords && Number.isFinite(effectiveClientCoords.lat) && Number.isFinite(effectiveClientCoords.lng)) {
      const dist = calcDistanceMeters(numFinalLat, numFinalLng, effectiveClientCoords.lat, effectiveClientCoords.lng);
      if (dist > MAX_VISIT_DISTANCE_METERS) {
        setLocationError(
          `⛔ Estás demasiado lejos del cliente (${Math.round(dist)} m · máximo permitido: ${MAX_VISIT_DISTANCE_METERS} m). Si ya estás frente al negocio y la ubicación anterior estaba desfasada, presiona el botón "Actualizar ubicación del cliente aquí".`
        );
        const geoEl = document.getElementById("visit-geo-section");
        if (geoEl) geoEl.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    setLoading(true);

    // Helper para Base64
    const fileToBase64 = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });
    };

    // Subida de fotos (Best Effort - Offline capable)
    const uploadPhoto = async (file, tipo) => {
      if (!file) return null;
      try {
        // Verificar conexión antes de intentar subir
        if (!navigator.onLine) throw new Error("Offline");

        const { uploadPhoto: uploadService } = await import('@/lib/uploadService');
        return await uploadService(file, "visitas-fotos");
      } catch (err) {
        console.warn(`Foto ${tipo} se guardará localmente (sin conexión):`, err);
        // Retornar Base64 para almacenamiento local y sincronización posterior
        try {
          return await fileToBase64(file);
        } catch (b64Err) {
          console.error("Error convirtiendo a Base64:", b64Err);
          return null;
        }
      }
    };

    let urlFachada = null, urlInterior = null, urlEnfriador = null;
    try {
      [urlFachada, urlInterior, urlEnfriador] = await Promise.all([
        uploadPhoto(photoFachada, "fachada"),
        uploadPhoto(photoInterior, "interior"),
        uploadPhoto(photoEnfriador, "enfriador"),
      ]);
    } catch (e) {
      console.warn("Error general subiendo fotos:", e);
    }

    const { time: horaMexico } = getMexicoDateTime();
    const horaActual = horaMexico || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const routeToSave =
      client?.internal_route ||
      client?.sales_route ||
      client?.sale_route ||
      client?.ruta ||
      client?.route ||
      user?.user_metadata?.route ||
      user?.user_metadata?.sales_route ||
      user?.user_metadata?.ruta ||
      null;

    const redaccionFinal = [
      notes.trim(),
      notaRapida ? `Nota rápida: ${notaRapida}` : "",
      proximoPaso ? `Próximo paso: ${proximoPaso}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const stableClientCode = [
      client?.client_code,
      client?.cve_cliente,
      client?.code,
      client?.codigo_cliente,
      client?.codigo,
    ].find((value) => value !== null && value !== undefined && String(value).trim() !== '');
    const businessNameSnapshot = [
      client?.business_name,
      client?.nombre_comercial,
      client?.razon_social,
      client?.nombre_negocio,
      client?.name,
    ].find((value) => value !== null && value !== undefined && String(value).trim() !== '');

    const visitData = {
      client_id: client?.id || null,
      client_code: stableClientCode ? String(stableClientCode).trim() : null,
      business_name: businessNameSnapshot ? String(businessNameSnapshot).trim() : "",
      cliente_nombre: client?.name || "",
      fecha: getTodayMexico(),
      hora: horaActual,
      ruta: routeToSave,
      notes: redaccionFinal,
      motivo: forceMotivo || motivo,
      photo_fachada: urlFachada,
      photo_interior: urlInterior,
      photo_enfriador: urlEnfriador,
      lat: finalLat || null,
      lng: finalLng || null,
      user_id: user.id,
      created_at: getNowMexico(),
    };

    try {
      const { createVisit } = await import('@/repositories/visitsRepository');
      await createVisit(visitData);
      if (finalLat && finalLng && client?.id && !clientCoords) {
        try {
          const { updateClient } = await import('@/repositories/clientsRepository');
          const numLat = Number(finalLat);
          const numLng = Number(finalLng);
          if (Number.isFinite(numLat) && Number.isFinite(numLng)) {
            const newCoords = { lat: numLat, lng: numLng };
            rememberClientCoords(client.id, client.client_code || client.cve_cliente, numLat, numLng);
            await updateClient(client.id, {
              lat: numLat,
              lng: numLng,
              coords: newCoords,
            });
            setClientCoords(newCoords);
            if (onClientCoordsUpdated) onClientCoordsUpdated(newCoords);
          }
        } catch (coordErr) {
          console.warn('No se pudo actualizar coords del cliente tras visita:', coordErr);
        }
      }

      setLoading(false);
      if (onSave) onSave();
    } catch (error) {
      console.error("Error guardando visita:", error);
      setLoading(false);
      alert(`Error guardando visita: ${error.message || error}`);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex max-h-[80vh] flex-col gap-6 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-xl"
    >
      <header className="flex flex-col gap-4 rounded-xl bg-white/60 p-4 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{resumenCliente.nombre}</h3>
            <p className="text-sm text-slate-500">{resumenCliente.direccion}</p>
          </div>
          <div className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
            Ruta {resumenCliente.ruta}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {lat && lng ? `Lat ${Number(lat).toFixed(5)}, Lng ${Number(lng).toFixed(5)}` : "Ubicación pendiente"}
          </span>
          <span className="flex items-center gap-1">
            <StickyNote className="h-4 w-4" />
            Teléfono: {resumenCliente.telefono}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Motivo de visita</p>
          {forceMotivo ? (
            <div className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow">
              {forceMotivo}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {MOTIVOS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMotivo(option)}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-sm transition",
                    motivo === option
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-600"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Notas detalladas</label>
              <textarea
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm shadow-inner transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                rows={4}
                placeholder="Describe cambios, acuerdos o incidencias relevantes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notas rápidas</p>
              <div className="flex flex-wrap gap-2">
                {NOTE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                    onClick={() => {
                      setNotaRapida(preset);
                      if (!notes.includes(preset)) {
                        setNotes((prev) => (prev ? `${prev}\n${preset}` : preset));
                      }
                    }}
                  >
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Próximo paso sugerido</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Ej. Revisión de planograma en 2 semanas"
                value={proximoPaso}
                onChange={(e) => setProximoPaso(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <MediaDropzone
            id="media-fachada"
            label="Fachada"
            file={photoFachada}
            onChange={(file) => {
              setPhotoFachada(file);
              if (file) setFachadaError(false);
            }}
            helper="Muestra el letrero y acceso principal."
            required={true}
            hasError={fachadaError}
            errorMessage="La foto de fachada es obligatoria para registrar la visita."
          />
          <MediaDropzone
            id="media-interior"
            label="Interior"
            file={photoInterior}
            onChange={setPhotoInterior}
            helper="Documenta exhibiciones, anaqueles y stock (opcional)."
          />
          <MediaDropzone
            id="media-enfriador"
            label="Enfriador"
            file={photoEnfriador}
            onChange={setPhotoEnfriador}
            helper="Evidencia la temperatura y acomodo del equipo (opcional)."
          />
        </div>
      </section>

      <section
        id="visit-geo-section"
        className={clsx(
          "rounded-xl bg-white p-4 ring-1 transition",
          isTooFar || locationError ? "ring-2 ring-red-500 bg-red-50/20" : "ring-slate-200"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Geolocalización y Validación de Distancia (Máx. {MAX_VISIT_DISTANCE_METERS}m)
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Debes estar a menos de {MAX_VISIT_DISTANCE_METERS} metros del negocio para cerrar y guardar la visita.
            </p>
          </div>
          <button
            type="button"
            onClick={handleUpdateClientLocationHere}
            disabled={updatingClientGeo || gettingLocation}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold shadow-sm transition",
              isTooFar
                ? "bg-amber-600 text-white hover:bg-amber-500 ring-2 ring-amber-300 animate-pulse"
                : "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            )}
          >
            <Navigation className="h-3.5 w-3.5" />
            {updatingClientGeo
              ? "Actualizando ubicación..."
              : isTooFar
              ? "📍 Estoy en el negocio: Actualizar ubicación del cliente aquí"
              : "📍 Actualizar ubicación del cliente aquí"}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 sm:w-auto"
            onClick={handleCaptureLocation}
            disabled={gettingLocation}
          >
            <MapPin className="h-4 w-4" />
            {gettingLocation ? "Capturando ubicación..." : "Capturar mi GPS"}
          </button>
          {lat && lng && (
            <div className="flex-grow rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              Tu GPS actual · Lat {Number(lat).toFixed(5)} · Lng {Number(lng).toFixed(5)}
            </div>
          )}
        </div>

        {/* Semáforo en tiempo real de distancia al cliente */}
        {lat && lng && clientCoords && distanceToClient !== null && (
          <div
            className={clsx(
              "mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold",
              isTooFar
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-emerald-300 bg-emerald-50 text-emerald-800"
            )}
          >
            <div className="flex items-center gap-2">
              {isTooFar ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              )}
              <span>
                {isTooFar
                  ? `Demasiado lejos del punto registrado: estás a ${Math.round(distanceToClient)} m (máximo permitido: ${MAX_VISIT_DISTANCE_METERS} m).`
                  : `Ubicación validada frente al cliente: estás a ${Math.round(distanceToClient)} m (dentro del rango de ${MAX_VISIT_DISTANCE_METERS} m).`}
              </span>
            </div>
            <span className="text-[11px] opacity-80">
              Pin cliente: {Number(clientCoords.lat).toFixed(5)}, {Number(clientCoords.lng).toFixed(5)}
            </span>
          </div>
        )}

        {lat && lng && !clientCoords && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700">
            📍 Este cliente aún no tenía coordenadas registradas. Tu ubicación actual se guardará automáticamente como la ubicación del negocio.
          </div>
        )}

        {locationError && (
          <div className="mt-3 rounded-xl border border-red-300 bg-red-100/80 px-4 py-2.5 text-xs font-semibold text-red-700">
            {locationError}
          </div>
        )}
      </section>

      <footer className="sticky bottom-0 flex flex-col gap-3 rounded-xl bg-slate-900 px-4 py-4 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/80">
          <strong>Tip:</strong> deja registrado el próximo paso para acelerar tu siguiente visita.
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Guardando visita..." : "Guardar visita"}
        </button>
      </footer>
    </form>
  );
}

function MediaDropzone({ id, label, helper, file, onChange, required = false, hasError = false, errorMessage = "" }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const previewUrl = useMemo(() => {
    if (!file) return null;
    if (typeof file === "string") return file;
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }, [file]);

  return (
    <div className={`rounded-xl bg-white p-4 ring-1 transition-all ${
      hasError ? "ring-2 ring-red-500 bg-red-50/20" : "ring-slate-200"
    }`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
          {label}
          {required ? (
            <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Obligatoria *</span>
          ) : (
            <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
          )}
        </p>
        {file && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-red-500 hover:text-red-700 font-medium"
          >
            Quitar
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-0.5">{helper}</p>

      {hasError && errorMessage && (
        <p className="text-xs text-red-600 font-medium mt-1.5 flex items-center gap-1">
          ⚠️ {errorMessage}
        </p>
      )}

      {previewUrl ? (
        <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-32 group">
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="absolute inset-0 bg-black/50 text-white text-xs font-medium flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1.5"
          >
            <Camera className="h-4 w-4" /> Tomar de nuevo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-8 text-sm font-medium transition ${
            hasError
              ? "border-red-400 bg-red-50 text-red-600 hover:border-red-500"
              : "border-slate-300 bg-slate-50 text-slate-600 hover:border-emerald-400 hover:text-emerald-600"
          }`}
        >
          <Camera className="h-5 w-5" />
          <span>Abrir cámara ({label.toLowerCase()})</span>
        </button>
      )}

      <DirectCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title={`Tomar foto de ${label}`}
        onCapture={(capturedFile) => onChange(capturedFile)}
      />
    </div>
  );
}
