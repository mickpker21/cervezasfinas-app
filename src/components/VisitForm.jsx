import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { supabase } from "../supabaseClient";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { Camera, MapPin, StickyNote, Sparkles } from "lucide-react";
import { getOptionalPositionFast } from "@/lib/geolocation";
import { getTodayMexico, getNowMexico, getMexicoDateTime } from "@/lib/dateUtils";

const NOTE_PRESETS = [
  "Cliente sin inventario frío.",
  "Se acordó visita de seguimiento en 7 días.",
  "Se detectó oportunidad de nuevos SKUs.",
  "Solicita apoyo para material POP.",
];

const MOTIVOS = ["Prospeccion", "Negociacion", "Cierre", "Seguimiento", "Reposición", "Visita Express"];

export default function VisitForm({ client, onSave, initialData = {}, forceMotivo = null }) {
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
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGettingLocation(true);
      const pos = await getOptionalPositionFast(3000);
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
      const pos = await getOptionalPositionFast(3000);
      if (pos) {
        const { latitude, longitude } = pos.coords;
        setLat(String(latitude));
        setLng(String(longitude));
      } else {
        setLocationError("No se detectó ubicación en 3s (opcional: puedes guardar sin coordenadas).");
      }
    } finally {
      setGettingLocation(false);
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

    // Geolocalización opcional: si no se detectó en 3s, se omite sin bloquear
    let finalLat = lat;
    let finalLng = lng;
    if (!finalLat || !finalLng) {
      const quickPos = await getOptionalPositionFast(3000);
      if (quickPos) {
        finalLat = String(quickPos.coords.latitude);
        finalLng = String(quickPos.coords.longitude);
        setLat(finalLat);
        setLng(finalLng);
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
      if (finalLat && finalLng && client?.id) {
        try {
          const { updateClient } = await import('@/repositories/clientsRepository');
          const numLat = Number(finalLat);
          const numLng = Number(finalLng);
          if (Number.isFinite(numLat) && Number.isFinite(numLng)) {
            await updateClient(client.id, {
              lat: numLat,
              lng: numLng,
              latitude: numLat,
              longitude: numLng,
              coords: { lat: numLat, lng: numLng },
            });
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

      <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Geolocalización</p>
        <p className="mt-1 text-sm text-slate-600">
          Asegúrate de capturar tu ubicación frente al punto de venta para validar la visita.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 sm:w-auto"
            onClick={handleCaptureLocation}
            disabled={gettingLocation}
          >
            <MapPin className="h-4 w-4" />
            {gettingLocation ? "Capturando ubicación..." : "Capturar ubicación"}
          </button>
          {lat && lng && (
            <div className="flex-grow rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              Coordenadas guardadas · Lat {Number(lat).toFixed(5)} · Lng {Number(lng).toFixed(5)}
            </div>
          )}
        </div>
        {locationError && <div className="mt-2 text-xs text-red-500">{locationError}</div>}
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
  const inputId = id || `media-${label.toLowerCase().replace(/\s+/g, "-")}`;
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

      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />

      {previewUrl ? (
        <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-32 group">
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => document.getElementById(inputId)?.click()}
            className="absolute inset-0 bg-black/50 text-white text-xs font-medium flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1.5"
          >
            <Camera className="h-4 w-4" /> Cambiar foto
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => document.getElementById(inputId)?.click()}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-8 text-sm font-medium transition ${
            hasError
              ? "border-red-400 bg-red-50 text-red-600 hover:border-red-500"
              : "border-slate-300 bg-slate-50 text-slate-600 hover:border-emerald-400 hover:text-emerald-600"
          }`}
        >
          <Camera className="h-5 w-5" />
          <span>Tomar o subir foto de {label.toLowerCase()}</span>
        </button>
      )}
    </div>
  );
}
