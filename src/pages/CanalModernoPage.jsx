import React, { useMemo, useState, useEffect } from "react";
import { Helmet } from 'react-helmet-async';
import { getTodayMexico } from '@/lib/dateUtils';
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { useToast } from "@/components/ui/use-toast";
import { loadEvaluationConfig, defaultEvaluationConfig, onEvaluationConfigUpdated, subscribeEvaluationConfig } from "@/lib/evaluationConfig";
import { getClientsPaged } from "@/repositories/clientsRepository";
import { DirectCameraField } from "@/components/common/DirectCameraModal";
import { Building2, Search, CheckCircle2, AlertTriangle } from "lucide-react";

/* ===== UI helpers ===== */
function YesNo({ value, onChange, size = "default" }) {
  return (
    <div className="inline-flex gap-2">
      <Button type="button" variant={value === true ? "default" : "outline"} size={size} onClick={() => onChange(true)}>Sí</Button>
      <Button type="button" variant={value === false ? "default" : "outline"} size={size} onClick={() => onChange(false)}>No</Button>
    </div>
  );
}
const NumberInput = ({ label, value, onChange, suffix = "", min, max }) => (
  <div className="grid gap-2">
    <Label>{label}</Label>
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
        className="w-40"
      />
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </div>
  </div>
);
const SectionHeader = ({ title, subtitle, right }) => (
  <div className="mb-3 flex items-start gap-2">
    <div className="flex-1">
      <h4 className="text-base md:text-lg font-semibold">{title}</h4>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {right}
  </div>
);
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

export default function CanalModernoPage({ embeddedClient = null, hideRedirect = false, onComplete = null, evalMode = null }) {
  const location = useLocation();
  const { user } = useSupabaseAuth();
  const { toast } = useToast ? useToast() : { toast: () => {} };
  const [modernCfg, setModernCfg] = useState(defaultEvaluationConfig.modernChannelConfig);
  const [oxxoCfg, setOxxoCfg] = useState(defaultEvaluationConfig.oxxoConfig);
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState([]);
  const [selectedTiendaId, setSelectedTiendaId] = useState(embeddedClient?.id || location.state?.client?.id || null);

  const isOxxoMode = useMemo(() => {
    if (evalMode === "oxxo") return true;
    if (evalMode === "modern") return false;
    const urlMode = new URLSearchParams(location.search || "").get("mode");
    if (urlMode === "oxxo" || location.state?.mode === "oxxo") return true;
    const c = embeddedClient || location.state?.client;
    if (c) {
      const ct = String(c.client_type || c.type || "").toLowerCase();
      const cad = String(c.cadena || "").toUpperCase();
      const nm = String(c.business_name || c.name || "").toUpperCase();
      if (ct === "oxxo" || cad.includes("OXXO") || nm.includes("OXXO")) return true;
    }
    return false;
  }, [evalMode, location.search, location.state, embeddedClient]);

  const activeCfg = isOxxoMode ? oxxoCfg : modernCfg;

  useEffect(() => {
    const loadCfg = async () => {
      const full = await loadEvaluationConfig();
      if (full?.modernChannelConfig) setModernCfg(full.modernChannelConfig);
      if (full?.oxxoConfig) setOxxoCfg(full.oxxoConfig);
    };
    loadCfg();
    const unsub1 = onEvaluationConfigUpdated(loadCfg);
    const unsub2 = subscribeEvaluationConfig(loadCfg);
    return () => {
      unsub1 && unsub1();
      unsub2 && unsub2();
    };
  }, []);

  const PESOS = useMemo(() => {
    const fallbackWeights = isOxxoMode ? defaultEvaluationConfig.oxxoConfig.weights : defaultEvaluationConfig.modernChannelConfig.weights;
    const w = activeCfg?.weights || fallbackWeights;
    return {
      surtido: Number(w.surtido ?? 15),
      precios: Number(w.precios ?? 5),
      promos: Number(w.promos ?? 15),
      impulso: {
        total: Number(w.impulso_primera ?? 10) + Number(w.impulso_flanqueo ?? 10) + Number(w.impulso_zero ?? 10) + Number(w.impulso_enfriador ?? 5),
        primera: Number(w.impulso_primera ?? 10),
        flanqueo: Number(w.impulso_flanqueo ?? 10),
        zero: Number(w.impulso_zero ?? 10),
        enfriador: Number(w.impulso_enfriador ?? 5),
      },
      destino: {
        total: Number(w.destino_cerveza ?? 15) + Number(w.destino_bas ?? 15),
        cerveza: Number(w.destino_cerveza ?? 15),
        bas: Number(w.destino_bas ?? 15),
      },
    };
  }, [activeCfg, isOxxoMode]);

  /* ===== Datos de tienda ===== */
  const [storeInfo, setStoreInfo] = useState({
    nombre: "",
    client_code: "",
    fecha: getTodayMexico(), // Mexico timezone
    evaluador: "",
  });

  /* ===== Secciones (todas aplican) ===== */
  // Surtido SIEMPRE aplica (sin NA)
  const [surtido, setSurtido] = useState({
    cervezaCompleta: false,
    otrasCatCompleta: false,
    frescuraOk: true,
  });

  // Precios SIEMPRE aplica
  const [precios, setPrecios] = useState({ preciosVisibles: false });

  // Promos SIEMPRE aplica
  const [promos, setPromos] = useState({ tableroVigente: false, papeletaCadena: false });

  // Impulso SIEMPRE aplica como sección; dentro:
  // - primera y flanqueo SIEMPRE aplican (sin NA)
  // - zero (0.0) y enfriador adicional pueden ser NA
  const puntoDefault = () => ({ presente: false, reglaOk: false, precioVisible: false, promoVisible: false, materialEjec: false });
  const [impulso, setImpulso] = useState({
    primera: puntoDefault(),
    flanqueo: puntoDefault(),
    zero: { ...puntoDefault(), na: false },       // <- puede ser NA
    enfriador: { ...puntoDefault(), na: false },  // <- puede ser NA
  });

  // Destino SIEMPRE aplica (ambas sub-secciones)
  const [destino, setDestino] = useState({
    cerveza: { participacion: undefined, precioVisible: false, promoVisible: false, materialEjec: false, objetivo: 41 },
    bas: { precioVisible: false, promoVisible: false, materialEjec: false, participacion: undefined },
  });

  const [notas, setNotas] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  /* ===== TRES FOTOS individuales ===== */
  const [photoFachada, setPhotoFachada] = useState(null);
  const [photoDestino, setPhotoDestino] = useState(null);
  const [photoImpulso, setPhotoImpulso] = useState(null);

  /* ===== Wizard ===== */
  // 0 Datos, 1 Surtido, 2 Precios, 3 Promos, 4 Impulso, 5 Destino, 6 Evidencia/Resumen
  const [step, setStep] = useState(0);
  const totalSteps = 7;
  const progressPct = Math.round(((step + 1) / totalSteps) * 100);
  const goNext = () => setStep((s) => Math.min(totalSteps - 1, s + 1));
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  /* ===== Autocompletar evaluador/cliente ===== */
  useEffect(() => {
    const evaluatorName = user?.user_metadata?.full_name || user?.email || "";
    const targetClient = embeddedClient || location.state?.client;
    if (targetClient) {
      setSelectedTiendaId(targetClient.id || null);
      setStoreInfo((prev) => ({
        ...prev,
        nombre: targetClient.business_name || targetClient.name || "",
        client_code: targetClient.client_code || "",
        evaluador: evaluatorName,
      }));
    } else {
      setStoreInfo((prev) => ({ ...prev, evaluador: evaluatorName }));
    }
  }, [embeddedClient, location.state, user]);

  useEffect(() => {
    const q = clientSearch.trim();
    if (!q || q.length < 2) {
      setClientResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await getClientsPaged({ page: 1, pageSize: 12, filters: { search: q } });
        if (!cancelled) setClientResults(res?.data || []);
      } catch {
        if (!cancelled) setClientResults([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clientSearch]);

  /* ===== Scoring (solo Zero y Enfriador pueden ser NA) ===== */
  const { sobre100, extras, denominador, detallesOk, detallesMal } = useMemo(() => {
    let puntos = 0;
    let denom = 0;
    let extrasAcc = 0;
    const ok = [];
    const mal = [];

    const frescuraPen = Number(activeCfg?.frescuraPenalty ?? 5);
    const matExtra = Number(activeCfg?.materialExtraPoints ?? 2);
    const targetBeerPct = Number(activeCfg?.beerShareTargetPct ?? (isOxxoMode ? 45 : 41));

    // SURTIDO — siempre aplica
    denom += PESOS.surtido;
    const halfSurtido = PESOS.surtido / 2;
    const p1 = surtido.cervezaCompleta ? halfSurtido : 0;
    const p2 = surtido.otrasCatCompleta ? halfSurtido : 0;
    puntos += p1 + p2;
    surtido.cervezaCompleta ? ok.push("Surtido cerveza completo") : mal.push("Falta surtido de cerveza");
    surtido.otrasCatCompleta ? ok.push("Surtido otras categorías completo") : mal.push("Faltan otras categorías");
    if (!surtido.frescuraOk) { mal.push(`Frescura/estado NO OK: penalización −${frescuraPen}`); puntos -= frescuraPen; } else ok.push("Frescura/estado OK");

    // PRECIOS — siempre aplica
    denom += PESOS.precios;
    if (precios.preciosVisibles) { puntos += PESOS.precios; ok.push("Precios visibles"); } else mal.push("Faltan precios visibles");

    // PROMOS — siempre aplica
    denom += PESOS.promos;
    const ambos = promos.tableroVigente && promos.papeletaCadena;
    const uno = (promos.tableroVigente && !promos.papeletaCadena) || (!promos.tableroVigente && promos.papeletaCadena);
    if (ambos) { puntos += PESOS.promos; ok.push("Promos vigentes + papeleta"); }
    else if (uno) { puntos += PESOS.promos / 2; mal.push("Promos incompletas"); }
    else mal.push("Sin promos");

    // IMPULSO — primera y flanqueo SIEMPRE aplican
    [
      ["primera", PESOS.impulso.primera, "Primera posición"],
      ["flanqueo", PESOS.impulso.flanqueo, "Exhibición flanqueo"],
    ].forEach(([key, peso, nombre]) => {
      const p = impulso[key];
      denom += peso;
      let sec = 0;
      if (p.presente && p.reglaOk && p.precioVisible && p.promoVisible) { sec = peso; ok.push(`${nombre}: OK`); }
      else if (p.presente) { sec = peso * 0.5; mal.push(`${nombre}: presente con desviaciones`); }
      else { mal.push(`${nombre}: NO presente`); }
      puntos += sec;
      if (p.materialEjec && p.presente) extrasAcc += matExtra;
    });

    // zero y enfriador — PUEDEN SER NA
    [
      ["zero", PESOS.impulso.zero, "Exhibición 0.0"],
      ["enfriador", PESOS.impulso.enfriador, "Enfriador adicional"],
    ].forEach(([key, peso, nombre]) => {
      const p = impulso[key];
      if (p.na) return;
      denom += peso;
      let sec = 0;
      if (p.presente && p.reglaOk && p.precioVisible && p.promoVisible) { sec = peso; ok.push(`${nombre}: OK`); }
      else if (p.presente) { sec = peso * 0.5; mal.push(`${nombre}: presente con desviaciones`); }
      else { mal.push(`${nombre}: NO presente`); }
      puntos += sec;
      if (p.materialEjec && p.presente) extrasAcc += matExtra;
    });

    // DESTINO — SIEMPRE aplica
    denom += PESOS.destino.cerveza;
    const d = destino.cerveza; const obj = targetBeerPct; const part = d.participacion ?? 0;
    const cumple = part >= obj; const vis = d.precioVisible && d.promoVisible;
    if (cumple && vis) { puntos += PESOS.destino.cerveza; ok.push(`Anaquel Cerveza OK (≥${obj}%)`); }
    else if ((cumple && !vis) || (!cumple && vis)) { puntos += PESOS.destino.cerveza * 0.5; mal.push(`Anaquel Cerveza: ${cumple ? "falta señalización" : `participación < ${obj}%`}`); }
    else mal.push("Anaquel Cerveza: sin cumplimiento");
    if (d.materialEjec) extrasAcc += matExtra;

    denom += PESOS.destino.bas;
    const b = destino.bas;
    if (b.precioVisible && b.promoVisible) { puntos += PESOS.destino.bas; ok.push("Anaquel BAS OK"); }
    else if (b.precioVisible || b.promoVisible) { puntos += PESOS.destino.bas * 0.5; mal.push("Anaquel BAS: falta precio o promo"); }
    else mal.push("Anaquel BAS: sin señalización");
    if (b.materialEjec) extrasAcc += matExtra;

    const totalSobre100 = denom > 0 ? clamp((puntos / denom) * 100, 0, 100) : 0;
    return { sobre100: totalSobre100, extras: extrasAcc, denominador: denom, detallesOk: ok, detallesMal: mal };
  }, [surtido, precios, promos, impulso, destino, PESOS, activeCfg, isOxxoMode]);

  const totalFinal = clamp(sobre100 + extras, 0, Number(activeCfg?.maxScoreWithExtras ?? 110));

  /* ===== Guardar ===== */
  async function guardar() {
    if (!supabase) { alert("Configuración de Supabase incompleta."); return; }
    if (!storeInfo.evaluador) { alert("No se pudo identificar al evaluador. Por favor, recarga la página."); return; }
    // Requiere las 3 fotos individuales
    if (!photoFachada || !photoDestino || !photoImpulso) { alert("Debes tomar las 3 fotos (Fachada, Destino y Impulso)."); return; }

    setIsSaving(true);
    try {
      const evalTypeLabel = isOxxoMode ? "OXXO" : "CANAL MODERNO";
      // 2. PREPARE EVALUATION PAYLOAD
      const payload = {
        tipo: evalTypeLabel,
        storeInfo,
        criterios: {
          surtido,
          precios,
          promos,
          impulso,   // contiene na sólo en zero y enfriador
          destino,
        },
        resultados: { scoreBase: sobre100, extras, scoreFinal: totalFinal, denominador, detallesOk, detallesMal },
        notas,
        // photoUrls se generará en el repositorio (online) o quedará pendiente (offline)
        photo_files: {
          fachada: photoFachada,
          destino: photoDestino,
          impulso: photoImpulso
        },
        timestamp: new Date().toISOString(),
      };

      const insertRow = {
        id: crypto.randomUUID(),
        tipo: payload.tipo,
        cadena: payload.storeInfo?.nombre ?? (isOxxoMode ? "OXXO" : null),
        ciudad: null,
        fecha: payload.storeInfo?.fecha ?? null,
        tienda_id: selectedTiendaId || embeddedClient?.id || location.state?.client?.id || null,
        client_code: storeInfo.client_code,
        payload,
        score_base: payload.resultados?.scoreBase ?? null,
        extras: payload.resultados?.extras ?? null,
        score_final: payload.resultados?.scoreFinal ?? null,
        denominador: payload.resultados?.denominador ?? null,
        evaluator_name: storeInfo.evaluador,
        photo_files: payload.photo_files,
      };

      const { createEvaluationCanalModerno } = await import('@/repositories/evaluationsRepository');
      const result = await createEvaluationCanalModerno(insertRow);

      toast({
        title: isOxxoMode ? "✅ Evaluación OXXO guardada" : "✅ Evaluación Canal Moderno guardada",
        description: `Puntaje final: ${totalFinal.toFixed(1)} pts`,
      });
      if (typeof onComplete === "function") {
        onComplete({
          id: result.id || insertRow.id,
          score: totalFinal,
          puntaje_total: totalFinal,
          tipo: evalTypeLabel,
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Error al guardar",
        description: e.message || String(e),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  /* ===== Pasos ===== */
  const StepDatos = (
    <Card className="mb-4">
      <CardHeader><CardTitle>Datos de la tienda (Canal Moderno)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!embeddedClient && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Search className="w-3.5 h-3.5" /> Buscar tienda / cliente en el padrón
            </Label>
            <Input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Escribe código o nombre de la tienda para autocompletar..."
            />
            {clientResults.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 divide-y divide-white/5">
                {clientResults.map((c) => (
                  <button
                    key={c.id || c.client_code}
                    type="button"
                    onClick={() => {
                      setSelectedTiendaId(c.id || null);
                      setStoreInfo((prev) => ({
                        ...prev,
                        nombre: c.business_name || c.name || "",
                        client_code: c.client_code || "",
                      }));
                      setClientSearch("");
                      setClientResults([]);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-500/15 flex items-center justify-between"
                  >
                    <span className="font-semibold text-white">[{c.client_code}] {c.business_name || c.name}</span>
                    <span className="text-emerald-400 font-bold">Elegir</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Nombre de Tienda / Cadena</Label>
            <Input value={storeInfo.nombre} onChange={(e) => setStoreInfo({ ...storeInfo, nombre: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Código de Cliente</Label>
            <Input value={storeInfo.client_code} onChange={(e) => setStoreInfo({ ...storeInfo, client_code: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Fecha</Label>
            <Input type="date" value={storeInfo.fecha} onChange={(e) => setStoreInfo({ ...storeInfo, fecha: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Evaluador</Label>
            <Input value={storeInfo.evaluador} readOnly />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const StepSurtido = (
    <Card className="mb-4">
      <CardHeader><CardTitle>1) Surtido (15%)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">Cerveza completa (Prioritarios + Calificadores)</div>
          <YesNo value={!!surtido.cervezaCompleta} onChange={(v) => setSurtido({ ...surtido, cervezaCompleta: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm">Otras categorías completas</div>
          <YesNo value={!!surtido.otrasCatCompleta} onChange={(v) => setSurtido({ ...surtido, otrasCatCompleta: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm">Frescura/estado óptimo (−5 si NO)</div>
          <YesNo value={!!surtido.frescuraOk} onChange={(v) => setSurtido({ ...surtido, frescuraOk: v })} />
        </div>
      </CardContent>
    </Card>
  );

  const StepPrecios = (
    <Card className="mb-4">
      <CardHeader><CardTitle>2) Precios comunicados (5%)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">Todos los SKUs ejecutados muestran precio visible</div>
          <YesNo value={!!precios.preciosVisibles} onChange={(v) => setPrecios({ ...precios, preciosVisibles: v })} />
        </div>
      </CardContent>
    </Card>
  );

  const StepPromos = (
    <Card className="mb-4">
      <CardHeader><CardTitle>3) Promoción (15%)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">Tablero de promociones vigente ejecutado</div>
          <YesNo value={!!promos.tableroVigente} onChange={(v) => setPromos({ ...promos, tableroVigente: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm">Papeleta/promocional de la cadena colocada</div>
          <YesNo value={!!promos.papeletaCadena} onChange={(v) => setPromos({ ...promos, papeletaCadena: v })} />
        </div>
      </CardContent>
    </Card>
  );

  const StepImpulso = (
    <Card className="mb-4">
      <CardHeader><CardTitle>4) Impulso (35%)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {/* Primera posición (REQUERIDA) */}
        <div className="border rounded-xl p-3 md:p-4">
          <SectionHeader title="Primera posición (10%)" subtitle="12/16/24 oz según guía" />
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">Presente</div>
              <YesNo value={!!impulso.primera.presente} onChange={(v) => setImpulso((prev) => ({ ...prev, primera: { ...prev.primera, presente: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Regla de presentación *TECATE,INDIO,CARTABLANCA*</div>
              <YesNo value={!!impulso.primera.reglaOk} onChange={(v) => setImpulso((prev) => ({ ...prev, primera: { ...prev.primera, reglaOk: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Precio visible</div>
              <YesNo value={!!impulso.primera.precioVisible} onChange={(v) => setImpulso((prev) => ({ ...prev, primera: { ...prev.primera, precioVisible: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Promoción visible</div>
              <YesNo value={!!impulso.primera.promoVisible} onChange={(v) => setImpulso((prev) => ({ ...prev, primera: { ...prev.primera, promoVisible: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Material de ejecución (+2 extra)</div>
              <YesNo value={!!impulso.primera.materialEjec} onChange={(v) => setImpulso((prev) => ({ ...prev, primera: { ...prev.primera, materialEjec: v } }))} />
            </div>
          </div>
        </div>

        {/* Flanqueo (REQUERIDA) */}
        <div className="border rounded-xl p-3 md:p-4">
          <SectionHeader title="Exhibición flanqueo (10%)" subtitle="6p/12p" />
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">Presente</div>
              <YesNo value={!!impulso.flanqueo.presente} onChange={(v) => setImpulso((prev) => ({ ...prev, flanqueo: { ...prev.flanqueo, presente: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Regla de presentación OK INDIO,CARTABLANCA,TECATE</div>
              <YesNo value={!!impulso.flanqueo.reglaOk} onChange={(v) => setImpulso((prev) => ({ ...prev, flanqueo: { ...prev.flanqueo, reglaOk: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Precio visible</div>
              <YesNo value={!!impulso.flanqueo.precioVisible} onChange={(v) => setImpulso((prev) => ({ ...prev, flanqueo: { ...prev.flanqueo, precioVisible: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Promoción visible</div>
              <YesNo value={!!impulso.flanqueo.promoVisible} onChange={(v) => setImpulso((prev) => ({ ...prev, flanqueo: { ...prev.flanqueo, promoVisible: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Material de ejecución (+2 extra)</div>
              <YesNo value={!!impulso.flanqueo.materialEjec} onChange={(v) => setImpulso((prev) => ({ ...prev, flanqueo: { ...prev.flanqueo, materialEjec: v } }))} />
            </div>
          </div>
        </div>

        {/* Zero (OPCIONAL) */}
        <div className="border rounded-xl p-3 md:p-4">
          <SectionHeader title="Exhibición categoría 0.0 (10%)" subtitle="12 oz; sin alcohol" />
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">¿Aplica este punto?</div>
              <YesNo value={!impulso.zero.na} onChange={(v) => setImpulso((prev) => ({ ...prev, zero: { ...prev.zero, na: !v } }))} />
            </div>
            {!impulso.zero.na && (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Presente</div>
                  <YesNo value={!!impulso.zero.presente} onChange={(v) => setImpulso((prev) => ({ ...prev, zero: { ...prev.zero, presente: v } }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Regla de presentación OK TECATE,INDIO,CARTABLANCA</div>
                  <YesNo value={!!impulso.zero.reglaOk} onChange={(v) => setImpulso((prev) => ({ ...prev, zero: { ...prev.zero, reglaOk: v } }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Precio visible</div>
                  <YesNo value={!!impulso.zero.precioVisible} onChange={(v) => setImpulso((prev) => ({ ...prev, zero: { ...prev.zero, precioVisible: v } }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Promoción visible</div>
                  <YesNo value={!!impulso.zero.promoVisible} onChange={(v) => setImpulso((prev) => ({ ...prev, zero: { ...prev.zero, promoVisible: v } }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Material de ejecución (+2 extra)</div>
                  <YesNo value={!!impulso.zero.materialEjec} onChange={(v) => setImpulso((prev) => ({ ...prev, zero: { ...prev.zero, materialEjec: v } }))} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Enfriador adicional (OPCIONAL) */}
        <div className="border rounded-xl p-3 md:p-4">
          <SectionHeader title="Exhibidor / Enfriador adicional (5%)" subtitle="12/16 oz o media NR; seguir planograma" />
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">¿Aplica este punto?</div>
              <YesNo value={!impulso.enfriador.na} onChange={(v) => setImpulso((prev) => ({ ...prev, enfriador: { ...prev.enfriador, na: !v } }))} />
            </div>
            {!impulso.enfriador.na && (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Presente</div>
                  <YesNo value={!!impulso.enfriador.presente} onChange={(v) => setImpulso((prev) => ({ ...prev, enfriador: { ...prev.enfriador, presente: v } }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Regla de presentación OK</div>
                  <YesNo value={!!impulso.enfriador.reglaOk} onChange={(v) => setImpulso((prev) => ({ ...prev, enfriador: { ...prev.enfriador, reglaOk: v } }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Precio visible</div>
                  <YesNo value={!!impulso.enfriador.precioVisible} onChange={(v) => setImpulso((prev) => ({ ...prev, enfriador: { ...prev.enfriador, precioVisible: v } }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Promoción visible</div>
                  <YesNo value={!!impulso.enfriador.promoVisible} onChange={(v) => setImpulso((prev) => ({ ...prev, enfriador: { ...prev.enfriador, promoVisible: v } }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">Material de ejecución (+2 extra)</div>
                  <YesNo value={!!impulso.enfriador.materialEjec} onChange={(v) => setImpulso((prev) => ({ ...prev, enfriador: { ...prev.enfriador, materialEjec: v } }))} />
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const StepDestino = (
    <Card className="mb-4">
      <CardHeader><CardTitle>5) Destino (30%)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-xl p-3 md:p-4 mb-3">
          <SectionHeader title="Anaquel Cerveza (15%)" subtitle="Objetivo Puebla: ≥41%" />
          <div className="grid gap-3">
            <NumberInput
              label="Participación"
              suffix="%"
              min={0}
              max={100}
              value={destino.cerveza.participacion}
              onChange={(v) => setDestino((d) => ({ ...d, cerveza: { ...d.cerveza, participacion: v } }))}
            />
            <div className="flex items-center justify-between">
              <div className="text-sm">Precio visible</div>
              <YesNo value={!!destino.cerveza.precioVisible} onChange={(v) => setDestino((d) => ({ ...d, cerveza: { ...d.cerveza, precioVisible: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Promoción visible</div>
              <YesNo value={!!destino.cerveza.promoVisible} onChange={(v) => setDestino((d) => ({ ...d, cerveza: { ...d.cerveza, promoVisible: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Material de ejecución (+2 extra)</div>
              <YesNo value={!!destino.cerveza.materialEjec} onChange={(v) => setDestino((d) => ({ ...d, cerveza: { ...d.cerveza, materialEjec: v } }))} />
            </div>
          </div>
        </div>

        <div className="border rounded-xl p-3 md:p-4">
          <SectionHeader title="Anaquel BAS (15%)" />
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">Precio visible</div>
              <YesNo value={!!destino.bas.precioVisible} onChange={(v) => setDestino((d) => ({ ...d, bas: { ...d.bas, precioVisible: v } }))} />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Promoción visible</div>
              <YesNo value={!!destino.bas.promoVisible} onChange={(v) => setDestino((d) => ({ ...d, bas: { ...d.bas, promoVisible: v } }))} />
            </div>
            <NumberInput
              label="Participación (opcional)"
              suffix="%"
              min={0}
              max={100}
              value={destino.bas.participacion}
              onChange={(v) => setDestino((d) => ({ ...d, bas: { ...d.bas, participacion: v } }))}
            />
            <div className="flex items-center justify-between">
              <div className="text-sm">Material de ejecución (+2 extra)</div>
              <YesNo value={!!destino.bas.materialEjec} onChange={(v) => setDestino((d) => ({ ...d, bas: { ...d.bas, materialEjec: v } }))} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const StepEvidencia = (
    <>
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardHeader><CardTitle>Resultado</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {sobre100.toFixed(1)}<span className="text-xl font-semibold"> / 100</span>
            </div>
            <div className="text-muted-foreground mt-1">Extras (material de ejecución): <span className="font-semibold">+{extras}</span></div>
            <div className="text-2xl font-bold mt-1">Total: {totalFinal.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-1">Denominador actual (tras N/A): {denominador}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Qué está bien</CardTitle></CardHeader>
          <CardContent>
            {detallesOk.length === 0 ? <div className="text-muted-foreground">Aún sin puntos OK</div> : (
              <ul className="list-disc pl-5 space-y-1">{detallesOk.map((t, i) => (<li key={i}>{t}</li>))}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Qué revisar</CardTitle></CardHeader>
          <CardContent>
            {detallesMal.length === 0 ? <div className="text-muted-foreground">Sin hallazgos por ahora</div> : (
              <ul className="list-disc pl-5 space-y-1">{detallesMal.map((t, i) => (<li key={i}>{t}</li>))}</ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle>Fotos de evidencia en vivo (toma 3)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DirectCameraField
              label="Foto 1 — Fachada / Frontal"
              required
              file={photoFachada}
              onCapture={(file) => setPhotoFachada(file)}
            />
            <DirectCameraField
              label="Foto 2 — Destino / Anaquel"
              required
              file={photoDestino}
              onCapture={(file) => setPhotoDestino(file)}
            />
            <DirectCameraField
              label="Foto 3 — Impulso / Exhibición"
              required
              file={photoImpulso}
              onCapture={(file) => setPhotoImpulso(file)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={guardar} disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar"}
        </Button>
      </div>

      <footer className="text-xs text-muted-foreground mt-8">
        * Sólo “Exhibición 0.0” y “Exhibidor adicional” pueden marcarse como N/A. Las demás secciones siempre aplican.
      </footer>
    </>
  );

  /* ===== Render principal ===== */
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-[#0b1329] border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${isOxxoMode ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-purple-500/15 border-purple-500/30 text-purple-400'}`}>
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {isOxxoMode ? 'Nueva Evaluación – OXXO' : 'Evaluación – Canal Moderno'}
              <Badge className={`${isOxxoMode ? 'bg-amber-600' : 'bg-purple-600'} text-white border-none text-[10px]`}>
                {isOxxoMode ? 'Cadena OXXO' : 'Corporativo'}
              </Badge>
            </h2>
            <p className="text-xs text-slate-400">
              {storeInfo.nombre ? `${storeInfo.nombre} (${storeInfo.client_code || 'S/C'})` : 'Selecciona o ingresa los datos de la tienda'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Puntaje en Vivo</div>
            <div className="text-xl font-black text-emerald-400">
              {totalFinal.toFixed(1)} <span className="text-xs text-slate-400 font-normal">pts ({sobre100.toFixed(0)} + {extras} extra)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progreso (simple, sin dependencias) */}
      <div className="w-full h-2 rounded bg-white/10 overflow-hidden mb-4">
        <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Paso actual */}
      {step === 0 && StepDatos}
      {step === 1 && StepSurtido}
      {step === 2 && StepPrecios}
      {step === 3 && StepPromos}
      {step === 4 && StepImpulso}
      {step === 5 && StepDestino}
      {step === 6 && StepEvidencia}

      {/* Controles */}
      <div className="flex justify-between mt-6">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={goPrev}>Anterior</Button>
        ) : <div />}

        {step < totalSteps - 1 ? (
          <Button type="button" onClick={goNext}>Siguiente</Button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
