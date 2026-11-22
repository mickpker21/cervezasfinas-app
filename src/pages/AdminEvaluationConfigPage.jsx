import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  loadEvaluationConfig,
  saveEvaluationConfig,
  defaultEvaluationConfig,
  subscribeEvaluationConfig,
  onEvaluationConfigUpdated,
} from '@/lib/evaluationConfig';
import { useToast } from '@/components/ui/use-toast';
import {
  ClipboardCheck,
  Car,
  Building2,
  Settings,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  Sparkles,
  Tag,
  MapPin,
  Box,
} from 'lucide-react';

const ALL_COOLER_CAPS = ['144', '192', '320', '376', '500', '552', '900', '1350'];

const PDV_WEIGHT_LABELS = {
  surtido: 'Surtido de Marcas',
  planograma: 'Planograma',
  exterior: 'Comunicación Exterior',
  interior: 'Comunicación Interior',
  capacidad: 'Capacidad Fría (GEC)',
  frio: 'Enfriador Estado Óptimo',
};

const ONBOARD_WEIGHT_LABELS = {
  checklist: 'Checklist de Salida',
  purchases: 'Efectividad de Compra',
  steps: 'Pasos de la Visita',
  execution: 'Ejecución PDV / Auditoría',
};

const MODERN_WEIGHT_LABELS = {
  surtido: '1. Surtido General',
  precios: '2. Precios Comunicados',
  promos: '3. Promoción y Papeleta',
  impulso_primera: '4a. Impulso · Primera Posición',
  impulso_flanqueo: '4b. Impulso · Flanqueo',
  impulso_zero: '4c. Impulso · Categoría 0.0',
  impulso_enfriador: '4d. Impulso · Enfriador Adicional',
  destino_cerveza: '5a. Destino · Anaquel Cerveza',
  destino_bas: '5b. Destino · Anaquel BAS',
};

const AVAILABLE_TABLE_COLUMNS = [
  { key: 'fecha', defaultLabel: 'Fecha' },
  { key: 'punto_venta', defaultLabel: 'Punto de venta' },
  { key: 'client_code', defaultLabel: 'Código' },
  { key: 'nivel', defaultLabel: 'Nivel GEC' },
  { key: 'puntaje_total', defaultLabel: 'Puntaje' },
  { key: 'nombre', defaultLabel: 'Evaluador' },
  { key: '__details__', defaultLabel: 'Detalles' },
];

function ChipListEditor({ title, subtitle, items = [], onChange, placeholder = 'Agregar nuevo...' }) {
  const [draft, setDraft] = useState('');

  const handleAdd = () => {
    const val = draft.trim();
    if (!val) return;
    if (!items.some((x) => String(x).toLowerCase() === val.toLowerCase())) {
      onChange([...items, val]);
    }
    setDraft('');
  };

  const handleRemove = (target) => {
    onChange(items.filter((x) => x !== target));
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[34px]">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 border border-white/10"
          >
            {item}
            <button
              type="button"
              onClick={() => handleRemove(item)}
              className="text-slate-400 hover:text-rose-400 transition"
              title="Quitar"
            >
              ×
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-slate-500 italic">Sin elementos configurados</span>}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
          className="bg-slate-950 border-white/10 text-white h-9 text-xs"
        />
        <Button type="button" size="sm" onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-500 text-white h-9 px-3 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
        </Button>
      </div>
    </div>
  );
}

export default function AdminEvaluationConfigPage() {
  const [activeTab, setActiveTab] = useState('pdv'); // 'pdv' | 'onboard' | 'modern' | 'table'
  const [cfg, setCfg] = useState(defaultEvaluationConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState({ label: '', subtitle: '' });
  const [newVisitStep, setNewVisitStep] = useState('');
  const { toast } = useToast ? useToast() : { toast: () => {} };

  const normalizeZone = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await loadEvaluationConfig();
      setCfg(data);
      setLoading(false);
    };
    load();
    const unsubLocal = onEvaluationConfigUpdated(load);
    const unsubRt = subscribeEvaluationConfig(load);
    return () => {
      unsubLocal && unsubLocal();
      unsubRt && unsubRt();
    };
  }, []);

  const pdvWeightSum = Object.values(cfg.weights || {}).reduce((acc, v) => acc + Number(v || 0), 0);
  const onboardWeightSum = Object.values(cfg.onboardConfig?.weights || {}).reduce((acc, v) => acc + Number(v || 0), 0);
  const modernWeightSum = Object.values(cfg.modernChannelConfig?.weights || {}).reduce((acc, v) => acc + Number(v || 0), 0);
  const oxxoWeightSum = Object.values(cfg.oxxoConfig?.weights || defaultEvaluationConfig.oxxoConfig.weights).reduce((acc, v) => acc + Number(v || 0), 0);

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveEvaluationConfig(cfg);
      toast({
        title: '✅ Configuración Corporativa Guardada',
        description: 'Los estándares de Evaluación PDV, Supervisión a Bordo y Canal Moderno ya están activos.',
      });
    } catch (e) {
      toast({
        title: 'Error al guardar',
        description: e.message || 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const addZone = () => {
    const cleaned = newZoneName.trim();
    if (!cleaned) return;
    const normNew = normalizeZone(cleaned);
    const exists = (cfg.zonas || []).some((z) => normalizeZone(z) === normNew);
    if (exists) {
      toast({ title: 'Zona duplicada', description: 'Esa zona comercial ya existe.', variant: 'destructive' });
      return;
    }
    setCfg((prev) => ({
      ...prev,
      zonas: [...(prev.zonas || []), cleaned],
      presentacionesByZona: {
        ...(prev.presentacionesByZona || {}),
        [cleaned]: [...(prev.presentaciones || ['Heineken', 'Tecate', 'Tecate Light', 'Dos Equis Lager', 'Indio'])],
      },
    }));
    setNewZoneName('');
  };

  const removeZone = (zone) => {
    setCfg((prev) => {
      const nextPZ = { ...(prev.presentacionesByZona || {}) };
      delete nextPZ[zone];
      return {
        ...prev,
        zonas: (prev.zonas || []).filter((z) => z !== zone),
        presentacionesByZona: nextPZ,
      };
    });
  };

  const toggleCapForLevel = (level, cap) => {
    setCfg((prev) => {
      const current = prev.allowedCapsByLevel?.[level] || [];
      const next = current.includes(cap) ? current.filter((c) => c !== cap) : [...current, cap];
      return {
        ...prev,
        allowedCapsByLevel: {
          ...(prev.allowedCapsByLevel || {}),
          [level]: next,
        },
      };
    });
  };

  const addOnboardChecklistItem = () => {
    const lbl = newChecklistItem.label.trim();
    if (!lbl) return;
    const key = 'chk_' + lbl.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + Date.now().toString().slice(-3);
    setCfg((prev) => ({
      ...prev,
      onboardConfig: {
        ...(prev.onboardConfig || defaultEvaluationConfig.onboardConfig),
        checklistItems: [
          ...(prev.onboardConfig?.checklistItems || []),
          { key, label: lbl, subtitle: newChecklistItem.subtitle.trim() || 'Criterio de salida a ruta', active: true },
        ],
      },
    }));
    setNewChecklistItem({ label: '', subtitle: '' });
  };

  const addOnboardVisitStep = () => {
    const lbl = newVisitStep.trim();
    if (!lbl) return;
    const key = 'step_' + lbl.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + Date.now().toString().slice(-3);
    setCfg((prev) => ({
      ...prev,
      onboardConfig: {
        ...(prev.onboardConfig || defaultEvaluationConfig.onboardConfig),
        visitSteps: [
          ...(prev.onboardConfig?.visitSteps || []),
          { key, label: lbl, active: true },
        ],
      },
    }));
    setNewVisitStep('');
  };

  return (
    <div className="space-y-6 pb-20">
      <Helmet>
        <title>Centro de Estándares & Evaluaciones | Cervezas Finas</title>
      </Helmet>

      {/* HEADER CORPORATIVO */}
      <div className="bg-[#0b1329] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <ClipboardCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Centro Corporativo de Evaluaciones & Supervisión
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Configura de forma visual los pesos, reglas de negocio, checklists y estándares de ejecución en PDV, Supervisión a Bordo y Canal Moderno.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCfg(defaultEvaluationConfig)}
              className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Restaurar Estándar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 shadow-lg shadow-emerald-900/40"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </Button>
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {[
            { id: 'pdv', label: '1. Evaluación PDV & Enfriador', icon: Box, sum: pdvWeightSum },
            { id: 'onboard', label: '2. Supervisión a Bordo (Ruta)', icon: Car, sum: onboardWeightSum },
            { id: 'modern', label: '3. Canal Moderno (Autoservicio)', icon: Building2, sum: modernWeightSum },
            { id: 'oxxo', label: '4. Nueva Evaluación OXXO', icon: Building2, sum: oxxoWeightSum },
            { id: 'table', label: '5. Reportes y Columnas', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 border ${
                  active
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/25'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.sum !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      tab.sum === 100 ? 'bg-black/30 text-emerald-300' : 'bg-amber-500 text-black'
                    }`}
                  >
                    {tab.sum}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">Cargando configuración corporativa...</div>
      ) : (
        <>
          {/* ================================================================= */}
          {/* TAB 1: EVALUACIÓN PDV TRADICIONAL & ENFRIADOR                      */}
          {/* ================================================================= */}
          {activeTab === 'pdv' && (
            <div className="space-y-6">
              <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                <CardContent className="p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        Ponderación de los 6 Pilares de Ejecución PDV
                      </h2>
                      <p className="text-xs text-slate-400">
                        Define el peso de cada rubro en la calificación del punto de venta y del enfriador (debe sumar 100%).
                      </p>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                        pdvWeightSum === 100
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {pdvWeightSum === 100 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      Suma actual: {pdvWeightSum}%
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(cfg.weights || {}).map(([key, val]) => (
                      <div key={key} className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-white">{PDV_WEIGHT_LABELS[key] || key}</div>
                          <div className="text-[11px] text-slate-400">Clave: {key}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={val}
                            onChange={(e) => {
                              const num = Math.max(0, Number(e.target.value || 0));
                              setCfg((prev) => ({
                                ...prev,
                                weights: { ...(prev.weights || {}), [key]: num },
                              }));
                            }}
                            className="w-20 bg-slate-950 border-white/15 text-white text-center font-bold h-10"
                          />
                          <span className="text-xs font-bold text-slate-400">%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* MODO DE CALIFICACIÓN Y UMBRALES */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-white/10">
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                      <div className="text-xs font-bold text-white">Modo de Calificación (Surtido e Interior)</div>
                      <p className="text-[11px] text-slate-400">
                        Elige si el puntaje se otorga solo al alcanzar el umbral o proporcionalmente al avance.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          { id: 'threshold', label: 'Todo o Nada (Umbral)' },
                          { id: 'proportional', label: 'Proporcional (%)' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setCfg((prev) => ({ ...prev, scoringMode: m.id }))}
                            className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition ${
                              (cfg.scoringMode || 'threshold') === m.id
                                ? 'bg-emerald-600 text-white border-emerald-400'
                                : 'bg-slate-950 text-slate-400 border-white/10 hover:text-white'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white">% Mínimo de Surtido</div>
                        <div className="text-[11px] text-slate-400">Meta de marcas presentes en la zona</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={10}
                          max={100}
                          value={cfg.thresholds?.surtidoMinPercent ?? 80}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              ...prev,
                              thresholds: { ...(prev.thresholds || {}), surtidoMinPercent: Number(e.target.value || 80) },
                            }))
                          }
                          className="w-20 bg-slate-950 border-white/15 text-white text-center font-bold h-10"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white">Mín. Elementos Interiores</div>
                        <div className="text-[11px] text-slate-400">Cantidad mínima de POP interior</div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={cfg.thresholds?.interiorMinElements ?? 3}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            thresholds: { ...(prev.thresholds || {}), interiorMinElements: Number(e.target.value || 3) },
                          }))
                        }
                        className="w-20 bg-slate-950 border-white/15 text-white text-center font-bold h-10"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* MATRIZ DE CAPACIDADES DE ENFRIADOR POR NIVEL GEC */}
              <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Matriz de Capacidades de Enfriador por Nivel GEC</h2>
                    <p className="text-xs text-slate-400">
                      Activa o desactiva qué capacidades de enfriador (en latas/botellas) son válidas para cada nivel de cliente.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {(cfg.tiposCliente || ['Bronce', 'Plata', 'Oro', 'Platino', 'Titanio']).map((level) => {
                      const allowed = cfg.allowedCapsByLevel?.[level] || [];
                      return (
                        <div key={level} className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
                          <div className="text-sm font-black text-emerald-400 uppercase tracking-wider">{level}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {ALL_COOLER_CAPS.map((cap) => {
                              const active = allowed.includes(cap);
                              return (
                                <button
                                  key={cap}
                                  type="button"
                                  onClick={() => toggleCapForLevel(level, cap)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                                    active
                                      ? 'bg-emerald-600 text-white border-emerald-400'
                                      : 'bg-slate-950 text-slate-500 border-white/10 hover:text-white'
                                  }`}
                                >
                                  {cap}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* ZONAS Y MARCAS POR ZONA */}
              <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-cyan-400" />
                        Portafolio de Marcas Evaluadas por Zona Comercial
                      </h2>
                      <p className="text-xs text-slate-400">
                        Configura las marcas obligatorias que se evalúan en el surtido de cada zona comercial.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newZoneName}
                        onChange={(e) => setNewZoneName(e.target.value)}
                        placeholder="Nueva zona (ej. Tehuacán)..."
                        className="bg-slate-950 border-white/15 text-white h-9 text-xs w-52"
                      />
                      <Button type="button" size="sm" onClick={addZone} className="bg-cyan-600 hover:bg-cyan-500 text-white h-9 text-xs">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar Zona
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(cfg.zonas || []).map((zone) => (
                      <div key={zone} className="relative">
                        <button
                          type="button"
                          onClick={() => removeZone(zone)}
                          className="absolute top-3.5 right-3.5 text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1 z-10"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Eliminar zona
                        </button>
                        <ChipListEditor
                          title={`Zona: ${zone}`}
                          subtitle="Marcas requeridas en el enfriador para esta zona"
                          items={cfg.presentacionesByZona?.[zone] || cfg.presentaciones || []}
                          placeholder="Agregar marca (ej. Amstel Ultra)..."
                          onChange={(nextList) =>
                            setCfg((prev) => ({
                              ...prev,
                              presentacionesByZona: {
                                ...(prev.presentacionesByZona || {}),
                                [zone]: nextList,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ELEMENTOS EXTERIOR, INTERIOR Y CATÁLOGOS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChipListEditor
                  title="Elementos de Comunicación Exterior"
                  subtitle="Materiales POP evaluados en la fachada del PDV"
                  items={cfg.elementosExterior || []}
                  placeholder="Agregar elemento exterior (ej. Toldo)..."
                  onChange={(list) => setCfg((prev) => ({ ...prev, elementosExterior: list }))}
                />
                <ChipListEditor
                  title="Elementos de Comunicación Interior"
                  subtitle="Materiales POP evaluados dentro del local y enfriador"
                  items={cfg.elementosInterior || []}
                  placeholder="Agregar elemento interior (ej. Cenefa)..."
                  onChange={(list) => setCfg((prev) => ({ ...prev, elementosInterior: list }))}
                />
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: SUPERVISIÓN A BORDO (COACHING & RUTA)                      */}
          {/* ================================================================= */}
          {activeTab === 'onboard' && (
            <div className="space-y-6">
              <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                <CardContent className="p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Car className="w-5 h-5 text-emerald-400" />
                        Ponderación del Scorecard de Supervisión a Bordo
                      </h2>
                      <p className="text-xs text-slate-400">
                        Configura cómo se calcula la calificación final del vendedor durante el acompañamiento en ruta.
                      </p>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                        onboardWeightSum === 100
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      Suma actual: {onboardWeightSum}%
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(cfg.onboardConfig?.weights || defaultEvaluationConfig.onboardConfig.weights).map(([key, val]) => (
                      <div key={key} className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-white">{ONBOARD_WEIGHT_LABELS[key] || key}</div>
                          <div className="text-[11px] text-slate-400">Pilar de supervisión</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={val}
                            onChange={(e) => {
                              const num = Math.max(0, Number(e.target.value || 0));
                              setCfg((prev) => ({
                                ...prev,
                                onboardConfig: {
                                  ...(prev.onboardConfig || defaultEvaluationConfig.onboardConfig),
                                  weights: { ...(prev.onboardConfig?.weights || {}), [key]: num },
                                },
                              }));
                            }}
                            className="w-20 bg-slate-950 border-white/15 text-white text-center font-bold h-10"
                          />
                          <span className="text-xs font-bold text-slate-400">%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* SWITCH DE REDISTRIBUCIÓN INTELIGENTE */}
                  <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-emerald-300">
                        Redistribución Inteligente cuando no hay Enfriadores en los clientes visitados
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Si ningún cliente visitado en la sesión tiene enfriador, el peso de <strong>Ejecución PDV ({cfg.onboardConfig?.weights?.execution ?? 40}%)</strong> se redistribuye proporcionalmente entre Checklist, Compras y Pasos de Visita para evaluar sobre 100% sin castigar al vendedor.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCfg((prev) => ({
                          ...prev,
                          onboardConfig: {
                            ...(prev.onboardConfig || defaultEvaluationConfig.onboardConfig),
                            redistributeIfNoCooler: !(prev.onboardConfig?.redistributeIfNoCooler ?? true),
                          },
                        }))
                      }
                      className={`px-4 py-2 rounded-xl text-xs font-black shrink-0 border transition ${
                        (cfg.onboardConfig?.redistributeIfNoCooler ?? true)
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : 'bg-slate-900 text-slate-400 border-white/10'
                      }`}
                    >
                      {(cfg.onboardConfig?.redistributeIfNoCooler ?? true) ? '✓ ACTIVADO (Recomendado)' : 'DESACTIVADO'}
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* FLUJO Y RUTEO AUTOMÁTICO A EVALUACIONES EN VISITA */}
              <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        Ruteo Automático a Evaluaciones durante la Visita (y Retorno a Cierre de Visita)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Define a qué evaluación se envía automáticamente al supervisor según el cliente y el enfriador, regresando siempre a la ventana de la visita para cerrarla.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      {
                        key: 'routeToCoolerEval',
                        title: '1. Si tiene Enfriador (PDV / Centro de Consumo) ➔ Evaluación de Enfriador',
                        desc: 'Al marcar "¿Tiene Enfriador? = SÍ" en un cliente tradicional, abre la Evaluación Normal de Enfriador y al guardar regresa para cerrar la visita.',
                        tabJump: 'pdv',
                        tabLabel: 'Ver config PDV',
                      },
                      {
                        key: 'routeOxxoToEval',
                        title: '2. Si el cliente es OXXO ➔ Nueva Evaluación de OXXO',
                        desc: 'Al visitar un cliente clasificado como OXXO, abre la Nueva Evaluación de OXXO (Cuarto Frío, Impulso y Promos) y al guardar regresa para cerrar la visita.',
                        tabJump: 'oxxo',
                        tabLabel: 'Ver config OXXO',
                      },
                      {
                        key: 'routeModernToEval',
                        title: '3. Si el cliente es Canal Moderno ➔ Evaluación de Canal Moderno',
                        desc: 'Al visitar un cliente clasificado como Canal Moderno, abre la Evaluación de Canal Moderno y al guardar regresa para cerrar la visita.',
                        tabJump: 'modern',
                        tabLabel: 'Ver config Canal Moderno',
                      },
                      {
                        key: 'autoDetectOxxo',
                        title: '4. Auto-detectar cliente OXXO por Cadena o Nombre',
                        desc: 'Si la cadena o el nombre del cliente contiene "OXXO", selecciona automáticamente el canal "🏪 OXXO" al abrir su visita en Supervisión a Bordo.',
                        tabJump: null,
                        tabLabel: null,
                      },
                    ].map((rule) => {
                      const isEnabled = cfg.onboardConfig?.evaluationRouting?.[rule.key] ?? true;
                      return (
                        <div key={rule.key} className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex flex-col justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-white">{rule.title}</div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">{rule.desc}</p>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-white/5">
                            {rule.tabJump ? (
                              <button
                                type="button"
                                onClick={() => setActiveTab(rule.tabJump)}
                                className="text-[11px] font-bold text-emerald-400 hover:underline"
                              >
                                {rule.tabLabel} →
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 uppercase font-bold">Detección inteligente</span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setCfg((prev) => ({
                                  ...prev,
                                  onboardConfig: {
                                    ...(prev.onboardConfig || defaultEvaluationConfig.onboardConfig),
                                    evaluationRouting: {
                                      ...(prev.onboardConfig?.evaluationRouting || defaultEvaluationConfig.onboardConfig.evaluationRouting),
                                      [rule.key]: !isEnabled,
                                    },
                                  },
                                }))
                              }
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition ${
                                isEnabled
                                  ? 'bg-emerald-600 text-white border-emerald-400'
                                  : 'bg-slate-950 text-slate-500 border-white/10'
                              }`}
                            >
                              {isEnabled ? '✓ ACTIVO' : 'INACTIVO'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* CHECKLIST DE SALIDA Y PASOS DE LA VISITA */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Checklist de salida */}
                <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-white">1. Checklist de Salida a Ruta</h3>
                      <p className="text-xs text-slate-400">
                        Puntos que el supervisor verifica antes de arrancar la ruta con el vendedor.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      {(cfg.onboardConfig?.checklistItems || []).map((item, idx) => (
                        <div key={item.key} className="p-3 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            <Input
                              value={item.label}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCfg((prev) => {
                                  const list = [...(prev.onboardConfig?.checklistItems || [])];
                                  list[idx] = { ...list[idx], label: val };
                                  return { ...prev, onboardConfig: { ...prev.onboardConfig, checklistItems: list } };
                                });
                              }}
                              className="bg-slate-950 border-white/10 text-white h-8 text-xs font-bold"
                            />
                            <Input
                              value={item.subtitle || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCfg((prev) => {
                                  const list = [...(prev.onboardConfig?.checklistItems || [])];
                                  list[idx] = { ...list[idx], subtitle: val };
                                  return { ...prev, onboardConfig: { ...prev.onboardConfig, checklistItems: list } };
                                });
                              }}
                              placeholder="Descripción corta..."
                              className="bg-slate-950/60 border-white/5 text-slate-400 h-7 text-[11px]"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setCfg((prev) => {
                                  const list = [...(prev.onboardConfig?.checklistItems || [])];
                                  list[idx] = { ...list[idx], active: !list[idx].active };
                                  return { ...prev, onboardConfig: { ...prev.onboardConfig, checklistItems: list } };
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                                item.active !== false
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-500 border-white/5'
                              }`}
                            >
                              {item.active !== false ? 'Activo' : 'Oculto'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCfg((prev) => ({
                                  ...prev,
                                  onboardConfig: {
                                    ...prev.onboardConfig,
                                    checklistItems: (prev.onboardConfig?.checklistItems || []).filter((_, i) => i !== idx),
                                  },
                                }));
                              }}
                              className="p-1.5 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-white/10 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          value={newChecklistItem.label}
                          onChange={(e) => setNewChecklistItem((p) => ({ ...p, label: e.target.value }))}
                          placeholder="Nuevo criterio (ej. Licencia vigente)..."
                          className="bg-slate-950 border-white/10 text-white h-9 text-xs"
                        />
                        <Input
                          value={newChecklistItem.subtitle}
                          onChange={(e) => setNewChecklistItem((p) => ({ ...p, subtitle: e.target.value }))}
                          placeholder="Subtítulo o detalle..."
                          className="bg-slate-950 border-white/10 text-white h-9 text-xs"
                        />
                      </div>
                      <Button type="button" size="sm" onClick={addOnboardChecklistItem} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-9">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar al Checklist de Salida
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Pasos de la visita */}
                <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-white">2. Pasos de la Visita Comercial en cada Cliente</h3>
                      <p className="text-xs text-slate-400">
                        Preguntas Sí/No de proceso comercial que el supervisor evalúa en cada PDV visitado.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      {(cfg.onboardConfig?.visitSteps || []).map((stepItem, idx) => (
                        <div key={stepItem.key} className="p-3 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                          <Input
                            value={stepItem.label}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCfg((prev) => {
                                const list = [...(prev.onboardConfig?.visitSteps || [])];
                                list[idx] = { ...list[idx], label: val };
                                return { ...prev, onboardConfig: { ...prev.onboardConfig, visitSteps: list } };
                              });
                            }}
                            className="bg-slate-950 border-white/10 text-white h-9 text-xs font-bold flex-1"
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setCfg((prev) => {
                                  const list = [...(prev.onboardConfig?.visitSteps || [])];
                                  list[idx] = { ...list[idx], active: !list[idx].active };
                                  return { ...prev, onboardConfig: { ...prev.onboardConfig, visitSteps: list } };
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                                stepItem.active !== false
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-500 border-white/5'
                              }`}
                            >
                              {stepItem.active !== false ? 'Activo' : 'Oculto'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCfg((prev) => ({
                                  ...prev,
                                  onboardConfig: {
                                    ...prev.onboardConfig,
                                    visitSteps: (prev.onboardConfig?.visitSteps || []).filter((_, i) => i !== idx),
                                  },
                                }));
                              }}
                              className="p-1.5 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-white/10 flex gap-2">
                      <Input
                        value={newVisitStep}
                        onChange={(e) => setNewVisitStep(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addOnboardVisitStep();
                          }
                        }}
                        placeholder="Nuevo paso (ej. ¿Ofreció paquete de botanas Chidas?)..."
                        className="bg-slate-950 border-white/10 text-white h-9 text-xs flex-1"
                      />
                      <Button type="button" size="sm" onClick={addOnboardVisitStep} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-9">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar Paso
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: CANAL MODERNO (AUTOSERVICIO)                               */}
          {/* ================================================================= */}
          {activeTab === 'modern' && (
            <div className="space-y-6">
              <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                <CardContent className="p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-purple-400" />
                        Ponderación y Reglas de Evaluación – Canal Moderno
                      </h2>
                      <p className="text-xs text-slate-400">
                        Configura los puntos de cada sección (Surtido, Precios, Promos, Impulso y Destino) y metas de participación en anaquel.
                      </p>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                        modernWeightSum === 100
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      Suma base: {modernWeightSum} pts
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(cfg.modernChannelConfig?.weights || defaultEvaluationConfig.modernChannelConfig.weights).map(([key, val]) => (
                      <div key={key} className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                        <div className="text-xs font-bold text-white">{MODERN_WEIGHT_LABELS[key] || key}</div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={val}
                            onChange={(e) => {
                              const num = Math.max(0, Number(e.target.value || 0));
                              setCfg((prev) => ({
                                ...prev,
                                modernChannelConfig: {
                                  ...(prev.modernChannelConfig || defaultEvaluationConfig.modernChannelConfig),
                                  weights: { ...(prev.modernChannelConfig?.weights || {}), [key]: num },
                                },
                              }));
                            }}
                            className="w-20 bg-slate-950 border-white/15 text-white text-center font-bold h-10"
                          />
                          <span className="text-xs text-slate-400">pts</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/10">
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1.5">
                      <div className="text-xs font-bold text-white">Meta Participación Anaquel Cerveza (%)</div>
                      <Input
                        type="number"
                        value={cfg.modernChannelConfig?.beerShareTargetPct ?? 41}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            modernChannelConfig: {
                              ...(prev.modernChannelConfig || defaultEvaluationConfig.modernChannelConfig),
                              beerShareTargetPct: Number(e.target.value || 41),
                            },
                          }))
                        }
                        className="bg-slate-950 border-white/15 text-white font-bold h-9"
                      />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1.5">
                      <div className="text-xs font-bold text-white">Penalización por Frescura (pts)</div>
                      <Input
                        type="number"
                        value={cfg.modernChannelConfig?.frescuraPenalty ?? 5}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            modernChannelConfig: {
                              ...(prev.modernChannelConfig || defaultEvaluationConfig.modernChannelConfig),
                              frescuraPenalty: Number(e.target.value || 5),
                            },
                          }))
                        }
                        className="bg-slate-950 border-white/15 text-white font-bold h-9"
                      />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1.5">
                      <div className="text-xs font-bold text-white">Puntos Extra por Material POP</div>
                      <Input
                        type="number"
                        value={cfg.modernChannelConfig?.materialExtraPoints ?? 2}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            modernChannelConfig: {
                              ...(prev.modernChannelConfig || defaultEvaluationConfig.modernChannelConfig),
                              materialExtraPoints: Number(e.target.value || 2),
                            },
                          }))
                        }
                        className="bg-slate-950 border-white/15 text-white font-bold h-9"
                      />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1.5">
                      <div className="text-xs font-bold text-white">Regla de Marcas Prioritarias</div>
                      <Input
                        value={cfg.modernChannelConfig?.brandRulesText ?? 'TECATE, INDIO, CARTA BLANCA'}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            modernChannelConfig: {
                              ...(prev.modernChannelConfig || defaultEvaluationConfig.modernChannelConfig),
                              brandRulesText: e.target.value,
                            },
                          }))
                        }
                        className="bg-slate-950 border-white/15 text-white font-bold h-9 text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: NUEVA EVALUACIÓN OXXO                                      */}
          {/* ================================================================= */}
          {activeTab === 'oxxo' && (
            <div className="space-y-6">
              <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
                <CardContent className="p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-amber-400" />
                        Ponderación y Reglas – Nueva Evaluación OXXO
                      </h2>
                      <p className="text-xs text-slate-400">
                        Configura los puntos de cada sección para tiendas OXXO (Surtido, Precios, Promos OXXO, Puntos de Impulso y Puertas de Cuarto Frío / Destino).
                      </p>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                        oxxoWeightSum === 100
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      Suma base: {oxxoWeightSum} pts
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(cfg.oxxoConfig?.weights || defaultEvaluationConfig.oxxoConfig.weights).map(([key, val]) => (
                      <div key={key} className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                        <div className="text-xs font-bold text-white">{MODERN_WEIGHT_LABELS[key] || key}</div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={val}
                            onChange={(e) => {
                              const num = Math.max(0, Number(e.target.value || 0));
                              setCfg((prev) => ({
                                ...prev,
                                oxxoConfig: {
                                  ...(prev.oxxoConfig || defaultEvaluationConfig.oxxoConfig),
                                  weights: { ...(prev.oxxoConfig?.weights || defaultEvaluationConfig.oxxoConfig.weights), [key]: num },
                                },
                              }));
                            }}
                            className="w-20 bg-slate-950 border-white/15 text-white text-center font-bold h-10"
                          />
                          <span className="text-xs text-slate-400">pts</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/10">
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1.5">
                      <div className="text-xs font-bold text-white">Meta Puertas Cuarto Frío Cerveza (%)</div>
                      <Input
                        type="number"
                        value={cfg.oxxoConfig?.beerShareTargetPct ?? 45}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            oxxoConfig: {
                              ...(prev.oxxoConfig || defaultEvaluationConfig.oxxoConfig),
                              beerShareTargetPct: Number(e.target.value || 45),
                            },
                          }))
                        }
                        className="bg-slate-950 border-white/15 text-white font-bold h-9"
                      />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1.5">
                      <div className="text-xs font-bold text-white">Penalización por Frescura (pts)</div>
                      <Input
                        type="number"
                        value={cfg.oxxoConfig?.frescuraPenalty ?? 5}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            oxxoConfig: {
                              ...(prev.oxxoConfig || defaultEvaluationConfig.oxxoConfig),
                              frescuraPenalty: Number(e.target.value || 5),
                            },
                          }))
                        }
                        className="bg-slate-950 border-white/15 text-white font-bold h-9"
                      />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1.5">
                      <div className="text-xs font-bold text-white">Puntos Extra por Material POP OXXO</div>
                      <Input
                        type="number"
                        value={cfg.oxxoConfig?.materialExtraPoints ?? 2}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            oxxoConfig: {
                              ...(prev.oxxoConfig || defaultEvaluationConfig.oxxoConfig),
                              materialExtraPoints: Number(e.target.value || 2),
                            },
                          }))
                        }
                        className="bg-slate-950 border-white/15 text-white font-bold h-9"
                      />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1.5">
                      <div className="text-xs font-bold text-white">Marcas Prioritarias OXXO</div>
                      <Input
                        value={cfg.oxxoConfig?.brandRulesText ?? 'TECATE, TECATE LIGHT, INDIO, DOS EQUIS, HEINEKEN'}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            oxxoConfig: {
                              ...(prev.oxxoConfig || defaultEvaluationConfig.oxxoConfig),
                              brandRulesText: e.target.value,
                            },
                          }))
                        }
                        className="bg-slate-950 border-white/15 text-white font-bold h-9 text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: REPORTES, TABLA Y EVIDENCIAS                               */}
          {/* ================================================================= */}
          {activeTab === 'table' && (
            <Card className="bg-[#0b1329] border-white/10 rounded-3xl">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Columnas Visibles y Opciones de Tabla</h2>
                  <p className="text-xs text-slate-400">
                    Selecciona qué columnas aparecen en el listado de evaluaciones y personaliza sus títulos sin editar JSON.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AVAILABLE_TABLE_COLUMNS.map((col) => {
                    const cols = cfg.pageSettings?.columns || [];
                    const isVisible = cols.includes(col.key);
                    const customLabel = cfg.pageSettings?.columnLabels?.[col.key] ?? col.defaultLabel;
                    return (
                      <div key={col.key} className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-emerald-400">{col.key}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setCfg((prev) => {
                                const cur = prev.pageSettings?.columns || [];
                                const next = cur.includes(col.key) ? cur.filter((c) => c !== col.key) : [...cur, col.key];
                                return {
                                  ...prev,
                                  pageSettings: { ...(prev.pageSettings || {}), columns: next },
                                };
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                              isVisible
                                ? 'bg-emerald-600 text-white border-emerald-400'
                                : 'bg-slate-950 text-slate-500 border-white/10'
                            }`}
                          >
                            {isVisible ? 'Visible' : 'Oculta'}
                          </button>
                        </div>
                        <Input
                          value={customLabel}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCfg((prev) => ({
                              ...prev,
                              pageSettings: {
                                ...(prev.pageSettings || {}),
                                columnLabels: {
                                  ...(prev.pageSettings?.columnLabels || {}),
                                  [col.key]: val,
                                },
                              },
                            }));
                          }}
                          placeholder="Título de columna..."
                          className="bg-slate-950 border-white/10 text-white h-8 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10">
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Límite de registros en tabla</span>
                    <Input
                      type="number"
                      value={cfg.pageSettings?.itemsLimit || 200}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          pageSettings: { ...(prev.pageSettings || {}), itemsLimit: Number(e.target.value || 200) },
                        }))
                      }
                      className="w-24 bg-slate-950 border-white/15 text-white text-center font-bold h-9"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Mostrar Fotos en Detalle</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCfg((prev) => ({
                          ...prev,
                          pageSettings: { ...(prev.pageSettings || {}), showPhotos: !prev.pageSettings?.showPhotos },
                        }))
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                        cfg.pageSettings?.showPhotos
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : 'bg-slate-950 text-slate-400 border-white/10'
                      }`}
                    >
                      {cfg.pageSettings?.showPhotos ? 'SÍ' : 'NO'}
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Mostrar Escáner QR en Detalle</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCfg((prev) => ({
                          ...prev,
                          pageSettings: {
                            ...(prev.pageSettings || {}),
                            showScannerInDetail: !prev.pageSettings?.showScannerInDetail,
                          },
                        }))
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                        cfg.pageSettings?.showScannerInDetail
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : 'bg-slate-950 text-slate-400 border-white/10'
                      }`}
                    >
                      {cfg.pageSettings?.showScannerInDetail ? 'SÍ' : 'NO'}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
