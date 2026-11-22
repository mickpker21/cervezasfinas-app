import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/supabaseClient';
import { Textarea } from '@/components/ui/textarea';
import { fetchVentasPorSku } from '@/lib/mysqlVentasPorSku';
import { API_URL as SHOP_API_URL, getShopAuthHeaders } from '@/lib/api';

const numberFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1, signDisplay: 'always' });
const dateFormatter = new Intl.DateTimeFormat('es-MX');

const pickDate = (row) => row?.fecha_alta || row?.period_date || row?.periodDate || null;
const toNumOrNull = (value) => {
  const str = String(value ?? '').trim();
  if (!str) return null;
  return /^\d+$/.test(str) ? Number(str) : null;
};
const keyVariants = (value) => {
  const str = String(value ?? '').trim();
  if (!str) return [];
  const num = toNumOrNull(str);
  return num !== null ? [str, String(num)] : [str];
};
const chunk = (arr, size) =>
  arr.reduce((acc, _, index) => (index % size ? acc : [...acc, arr.slice(index, index + size)]), []);

const VISIT_DAY_OPTIONS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const normalizeVisitDayName = (val) => {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const map = {
    '1': 'Lunes', 'lunes': 'Lunes', 'lun': 'Lunes',
    '2': 'Martes', 'martes': 'Martes', 'mar': 'Martes',
    '3': 'Miércoles', 'miercoles': 'Miércoles', 'mie': 'Miércoles',
    '4': 'Jueves', 'jueves': 'Jueves', 'jue': 'Jueves',
    '5': 'Viernes', 'viernes': 'Viernes', 'vie': 'Viernes',
    '6': 'Sábado', 'sabado': 'Sábado', 'sab': 'Sábado',
    '0': 'Domingo', '7': 'Domingo', 'domingo': 'Domingo', 'dom': 'Domingo',
  };
  return map[s] || null;
};

const parseVisitDaysList = (client) => {
  if (!client) return [];
  const raw = client.visit_days || client.visitDays || client.visitDaysText || '';
  if (!raw) return [];
  let parts = [];
  if (Array.isArray(raw)) {
    parts = raw;
  } else {
    const text = String(raw).trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) parts = parsed;
      } catch {
        parts = text.split(/[,;|]+/);
      }
    } else {
      parts = text.split(/[,;|]+/);
    }
  }
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const norm = normalizeVisitDayName(p);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
};

export default function TeleventaClientDashboard({
  client,
  onCallSubmit,
  onVisitRequest,
  onClose,
  onOpenSalesDialog,
  onAnsweredYes,
  onPhoneUpdated,
  onVisitDaysUpdated,
}) {
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState(null);

  const [monthlyVolume, setMonthlyVolume] = useState(0);
  const [monthlyBoxes, setMonthlyBoxes] = useState(0);
  const [volumeBySku, setVolumeBySku] = useState([]);
  const [skuMetadata, setSkuMetadata] = useState({});
  const [lastOrderDate, setLastOrderDate] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [salesDecline, setSalesDecline] = useState(0);

  const [form, setForm] = useState({ answered: null, purchaseIntent: null, comments: '' });
  const [formError, setFormError] = useState(null);
  const [isSubmittingCall, setIsSubmittingCall] = useState(false);
  const [isRequestingVisit, setIsRequestingVisit] = useState(false);
  const [visitError, setVisitError] = useState(null);
  const [visitReason, setVisitReason] = useState('');
  const [whatsappForm, setWhatsappForm] = useState({ boxes: '', comments: '' });
  const [isSubmittingWhatsapp, setIsSubmittingWhatsapp] = useState(false);
  const [whatsappError, setWhatsappError] = useState(null);

  const [clientPhone, setClientPhone] = useState(() => String(client?.phone || client?.telefono || '').trim());
  const [phoneInput, setPhoneInput] = useState(() => String(client?.phone || client?.telefono || '').trim());
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneSavedSuccess, setPhoneSavedSuccess] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);

  const [savedVisitDays, setSavedVisitDays] = useState(() => parseVisitDaysList(client));
  const [visitDaysInput, setVisitDaysInput] = useState(() => parseVisitDaysList(client));
  const [isSavingVisitDays, setIsSavingVisitDays] = useState(false);
  const [visitDaysSavedSuccess, setVisitDaysSavedSuccess] = useState(false);
  const [editingVisitDays, setEditingVisitDays] = useState(false);

  const clientCode = useMemo(() => {
    if (!client?.client_code && !client?.cve_cliente) return null;
    return String(client.client_code || client.cve_cliente || '').trim();
  }, [client]);

  const cleanSavedPhoneDigits = useMemo(
    () => String(clientPhone || '').replace(/\D/g, ''),
    [clientPhone]
  );
  const hasRegisteredPhone = cleanSavedPhoneDigits.length >= 10;
  const hasRegisteredVisitDays = savedVisitDays.length > 0;

  useEffect(() => {
    const initialPh = String(client?.phone || client?.telefono || '').trim();
    const initialDays = parseVisitDaysList(client);
    setClientPhone(initialPh);
    setPhoneInput(initialPh);
    setPhoneSavedSuccess(false);
    setEditingPhone(false);
    setSavedVisitDays(initialDays);
    setVisitDaysInput(initialDays);
    setVisitDaysSavedSuccess(false);
    setEditingVisitDays(false);
    setForm({ answered: null, purchaseIntent: null, comments: '' });
    setFormError(null);
    setVisitError(null);
    setVisitReason('');
  }, [client?.id, client?.phone, client?.visit_days]);

  const saveClientPhone = async (rawPhoneToSave = phoneInput) => {
    const digits = String(rawPhoneToSave || '').replace(/\D/g, '');
    if (digits.length < 10) {
      setFormError('⚠️ Por favor ingresa un número de teléfono válido de al menos 10 dígitos.');
      return null;
    }

    setIsSavingPhone(true);
    setFormError(null);
    try {
      // 1. Guardar en Supabase (tabla clients)
      if (client?.id) {
        await supabase.from('clients').update({ phone: digits }).eq('id', client.id);
      } else if (clientCode) {
        await supabase.from('clients').update({ phone: digits }).eq('client_code', clientCode);
      }

      // 2. Sincronizar en MySQL (clients y shop_client_users)
      if (clientCode) {
        try {
          const authHeaders = await getShopAuthHeaders();
          await fetch(`${SHOP_API_URL}/admin/clients-manage.php`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
            },
            body: JSON.stringify({
              client_code: clientCode,
              phone: digits,
            }),
          });
        } catch (err) {
          console.warn('No se pudo sincronizar teléfono en MySQL shop:', err);
        }
      }

      setClientPhone(digits);
      setPhoneInput(digits);
      setPhoneSavedSuccess(true);
      setEditingPhone(false);
      onPhoneUpdated?.(digits);
      return digits;
    } catch (err) {
      console.error('Error guardando teléfono del cliente:', err);
      setFormError('No se pudo guardar el número de teléfono. Intenta nuevamente.');
      return null;
    } finally {
      setIsSavingPhone(false);
    }
  };

  const toggleVisitDayOption = (dayName) => {
    setVisitDaysInput((prev) =>
      prev.includes(dayName) ? prev.filter((d) => d !== dayName) : [...prev, dayName]
    );
  };

  const saveClientVisitDays = async (daysToSave = visitDaysInput) => {
    const cleanDays = Array.isArray(daysToSave) ? daysToSave.filter(Boolean) : [];
    if (cleanDays.length === 0) {
      setFormError('⚠️ Selecciona al menos un día de visita para el cliente.');
      return null;
    }
    setIsSavingVisitDays(true);
    setFormError(null);
    try {
      const daysStr = cleanDays.join(', ');
      if (client?.id) {
        await supabase.from('clients').update({ visit_days: cleanDays }).eq('id', client.id);
      } else if (clientCode) {
        await supabase.from('clients').update({ visit_days: cleanDays }).eq('client_code', clientCode);
      }
      setSavedVisitDays(cleanDays);
      setVisitDaysInput(cleanDays);
      setVisitDaysSavedSuccess(true);
      setEditingVisitDays(false);
      onVisitDaysUpdated?.(cleanDays, daysStr);
      return cleanDays;
    } catch (err) {
      console.error('Error guardando días de visita:', err);
      setFormError('No se pudo guardar el día de visita. Intenta nuevamente.');
      return null;
    } finally {
      setIsSavingVisitDays(false);
    }
  };

  useEffect(() => {
    if (!clientCode) {
      setMonthlyVolume(0);
      setMonthlyBoxes(0);
      setVolumeBySku([]);
      setSkuMetadata({});
      setLastOrderDate(null);
      setOrderHistory([]);
      setSalesDecline(0);
      setDataError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setDataError(null);

    (async () => {
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const prevYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        const prevYearNext = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);

        const monthStartIso = monthStart.toISOString().slice(0, 10);
        const nextMonthStartIso = nextMonthStart.toISOString().slice(0, 10);
        const prevYearStartIso = prevYearStart.toISOString().slice(0, 10);
        const prevYearNextIso = prevYearNext.toISOString().slice(0, 10);

        const code = String(clientCode);
        const allClientRows = await fetchVentasPorSku({
          from: prevYearStartIso,
          nextFrom: nextMonthStartIso,
          cve_cliente: code,
        });

        const clientRows = (allClientRows || []).filter(
          (row) => String(row.cve_cliente ?? '').trim() === code
        );

        const monthRows = clientRows.filter((row) => {
          const d = String(pickDate(row) || '').slice(0, 10);
          return d >= monthStartIso && d < nextMonthStartIso;
        });

        const prevYearRows = clientRows.filter((row) => {
          const d = String(pickDate(row) || '').slice(0, 10);
          return d >= prevYearStartIso && d < prevYearNextIso;
        });

        const historyRows = [...clientRows]
          .sort((a, b) => {
            const da = pickDate(a);
            const db = pickDate(b);
            return new Date(db) - new Date(da);
          })
          .slice(0, 200);

        const monthVolume = monthRows.reduce(
          (acc, row) => acc + (Number(row.htls_total) || 0),
          0
        );
        const monthBoxes = monthRows.reduce(
          (acc, row) => acc + (Number(row.unidades) || 0),
          0
        );

        const monthSkuMap = new Map();
        for (const row of monthRows) {
          const sku = String(row.cve_marca ?? '').trim() || 'SIN_SKU';
          const amount = Number(row.htls_total) || 0;
          monthSkuMap.set(sku, (monthSkuMap.get(sku) || 0) + amount);
        }
        const skuRows = Array.from(monthSkuMap.entries())
          .map(([sku, value]) => ({ sku, value }))
          .sort((a, b) => b.value - a.value);

        const orderSource = monthRows.length ? monthRows : historyRows;
        const orders = new Map();
        for (const row of orderSource) {
          const key = String(row.num_remision ?? 'SIN_REMISION');
          const date = pickDate(row);
          const amount = Number(row.htls_total) || 0;
          const boxes = Number(row.unidades) || 0;
          if (!orders.has(key)) {
            orders.set(key, { remision: key, date, volume: amount, boxes });
          } else {
            const current = orders.get(key);
            current.volume += amount;
            current.boxes += boxes;
            if (date && new Date(date) > new Date(current.date)) current.date = date;
          }
        }
        const orderList = Array.from(orders.values()).sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );

        const trimmedOrders = orderList.slice(0, 20);
        const lastDate = trimmedOrders.length ? trimmedOrders[0].date : null;

        const prevYearVolume = prevYearRows.reduce(
          (acc, row) => acc + (Number(row.htls_total) || 0),
          0
        );
        let decline = 0;
        if (prevYearVolume > 0) {
          decline = ((monthVolume - prevYearVolume) / prevYearVolume) * 100;
        } else if (monthVolume > 0) {
          decline = 100;
        }

        if (!active) return;
        setMonthlyVolume(monthVolume);
        setMonthlyBoxes(monthBoxes);
        setVolumeBySku(skuRows);
        setLastOrderDate(lastDate);
        setOrderHistory(trimmedOrders);
        setSalesDecline(Number.isFinite(decline) ? Math.round(decline * 10) / 10 : 0);
      } catch (err) {
        console.error('televenta dashboard fetch error', err);
        if (active) {
          setDataError('No se pudo cargar la informacion de ventas del cliente.');
          setMonthlyVolume(0);
          setMonthlyBoxes(0);
          setVolumeBySku([]);
          setLastOrderDate(null);
          setOrderHistory([]);
          setSalesDecline(0);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [clientCode]);

  useEffect(() => {
    let active = true;
    const loadSkuMetadata = async () => {
      const topSkus = volumeBySku.slice(0, 12).map((item) => String(item.sku ?? '').trim()).filter(Boolean);
      if (topSkus.length === 0) {
        if (active) setSkuMetadata({});
        return;
      }

      const variants = Array.from(new Set(topSkus.flatMap((sku) => keyVariants(sku))));
      const numericKeys = variants
        .map(toNumOrNull)
        .filter((value) => value !== null);
      const textKeys = variants.filter((value) => !/^\d+$/.test(value));

      const metadata = {};

      const storeMetadata = (items, keyField, fields) => {
        for (const item of items || []) {
          if (!item || item[keyField] == null) continue;
          const key = String(item[keyField]);
          metadata[key] = {
            ...metadata[key],
            ...fields(item)
          };
        }
      };

      try {
        if (numericKeys.length) {
          // Remove sku_images fetch
          storeMetadata(numericKeys.map(k => ({ sku: k, image_url: `https://cervezasfinas.com/portafolio/${k}.png` })), 'sku', (item) => ({ image_url: item.image_url }));

          for (const part of chunk(numericKeys, 100)) {
            const { data } = await supabase
              .from('sku_descripcion')
              .select('cve_marca, descripcion')
              .in('cve_marca', part);
            storeMetadata(data, 'cve_marca', (item) => ({ descripcion: item.descripcion }));
          }
        }
        if (textKeys.length) {
          storeMetadata(textKeys.map(k => ({ sku: k, image_url: `https://cervezasfinas.com/portafolio/${k}.png` })), 'sku', (item) => ({ image_url: item.image_url }));

          for (const part of chunk(textKeys, 100)) {
            const { data } = await supabase
              .from('sku_descripcion')
              .select('cve_marca, descripcion')
              .in('cve_marca', part);
            storeMetadata(data, 'cve_marca', (item) => ({ descripcion: item.descripcion }));
          }
        }
        if (active) setSkuMetadata(metadata);
      } catch (err) {
        console.warn('televenta dashboard: no se pudieron cargar imagenes de SKU', err);
        if (active) setSkuMetadata({});
      }
    };
    loadSkuMetadata();
    return () => {
      active = false;
    };
  }, [volumeBySku]);

  const handleCallSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    if (isSubmittingCall) return;

    const answered = form.answered === true;
    const purchase = form.purchaseIntent === true;

    if (form.answered === null) {
      setFormError('Indica si el cliente contesto.');
      return;
    }
    if (answered && !hasRegisteredPhone) {
      const pendingDigits = String(phoneInput || '').replace(/\D/g, '');
      if (pendingDigits.length >= 10) {
        const savedPh = await saveClientPhone(pendingDigits);
        if (!savedPh) return;
      } else {
        setFormError('⚠️ Como el cliente sí contestó, debes registrar su número de teléfono (10 dígitos) antes de guardar.');
        return;
      }
    }
    if (answered && !hasRegisteredVisitDays) {
      if (visitDaysInput.length > 0) {
        const savedDays = await saveClientVisitDays(visitDaysInput);
        if (!savedDays) return;
      } else {
        setFormError('⚠️ Este cliente no tiene día de visita asignado. Selecciona al menos un día antes de guardar.');
        return;
      }
    }
    if (answered && form.purchaseIntent === null) {
      setFormError('Indica si el cliente compro.');
      return;
    }
    setIsSubmittingCall(true);
    try {
      const result = await onCallSubmit({
        answered,
        boxes_sold: purchase ? Number(form.boxes_sold || 0) : 0,
        comments: form.comments?.trim() || ''
      });

      if (!result || !result.success) {
        setFormError(result?.error || 'No se pudo registrar la llamada.');
      } else {
        setForm({ answered: null, purchaseIntent: null, comments: '', boxes_sold: '' });
      }
    } finally {
      setIsSubmittingCall(false);
    }
  };

  const handleWhatsAppOrderSubmit = async () => {
    if (isSubmittingWhatsapp) return;
    setWhatsappError(null);
    const boxes = Number(whatsappForm.boxes || 0);
    if (!boxes || boxes <= 0) {
      setWhatsappError('Ingresa la cantidad de cajas del pedido.');
      return;
    }
    setIsSubmittingWhatsapp(true);
    try {
      const result = await onCallSubmit({
        answered: true,
        boxes_sold: boxes,
        comments: whatsappForm.comments?.trim() || '',
        via_whatsapp: true
      });
      if (!result || !result.success) {
        setWhatsappError(result?.error || 'No se pudo registrar el pedido.');
      } else {
        setWhatsappForm({ boxes: '', comments: '' });
      }
    } finally {
      setIsSubmittingWhatsapp(false);
    }
  };

  const handleRequestVisit = async () => {
    if (isRequestingVisit) return;
    setVisitError(null);
    const reason = visitReason.trim();
    if (!reason) {
      setVisitError('Escribe un comentario para el asesor.');
      return;
    }
    setIsRequestingVisit(true);
    try {
      const result = await onVisitRequest(client, reason);
      if (!result || !result.success) {
        setVisitError(result?.error || 'No se pudo solicitar la visita.');
      } else {
        setVisitReason('');
      }
    } finally {
      setIsRequestingVisit(false);
    }
  };

  const renderSkuRow = useCallback(
    (item) => {
      const [k1, k2] = keyVariants(item.sku);
      const meta = skuMetadata[k1] || skuMetadata[k2] || null;
      const imageUrl = meta?.image_url || null;
      const description = meta?.descripcion || '';
      return (
        <div
          key={item.sku}
          className="flex items-center gap-3 rounded-lg border border-white/5 bg-slate-900/50 p-3"
        >
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-white/5 bg-slate-800">
            {imageUrl ? (
              <img src={imageUrl} alt={item.sku} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-white/50">
                Sin imagen
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col">
            <span className="font-mono text-xs uppercase tracking-wide text-green-200">
              SKU {item.sku}
            </span>
            <span className="text-sm font-semibold text-white">
              {description || 'Producto sin descripcion'}
            </span>
            <span className="text-xs text-white/70">
              {numberFormatter.format(item.value)} HL en el mes
            </span>
          </div>
        </div>
      );
    },
    [skuMetadata]
  );

  return (
    <div className="bg-slate-900 text-white max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold">Dashboard del cliente</h2>
          <p className="text-sm text-white/60">
            {client?.business_name || client?.name || 'Cliente sin nombre'} · Codigo{' '}
            {clientCode || 'N/D'}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose} className="text-white hover:bg-slate-800">
          Cerrar
        </Button>
      </div>

      <div className="space-y-6 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Resumen del mes en curso</h3>
            <p className="text-xs text-white/60">
              Datos calculados al {dateFormatter.format(new Date())}
            </p>
          </div>
          {onOpenSalesDialog ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => onOpenSalesDialog()}
                className="border border-white/10 bg-white/10 text-white hover:bg-white/20"
              >
                Ver historico de pedidos
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="bg-slate-800/90 border border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-emerald-200">
                Venta mes (HL)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {numberFormatter.format(monthlyVolume)}
              </div>
              <div className="text-xs text-white/70">
                {numberFormatter.format(monthlyBoxes)} cajas equivalente
              </div>
              {loading ? <div className="mt-1 text-xs text-white/60">Cargando...</div> : null}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/90 border border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-emerald-200">
                Ultimo pedido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {lastOrderDate ? dateFormatter.format(new Date(lastOrderDate)) : 'Sin pedidos'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/90 border border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-emerald-200">
                Variacion vs ano anterior
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${salesDecline >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {percentFormatter.format(salesDecline)}%
              </div>
              <div className="text-xs text-white/60">Comparado con el mismo mes del ano anterior</div>
            </CardContent>
          </Card>
        </div>

        {dataError ? (
          <div className="rounded border border-red-600 bg-red-900/40 px-4 py-3 text-sm text-red-200">
            {dataError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="bg-slate-800/90 border border-slate-700">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white">Top productos del mes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {volumeBySku.length === 0 ? (
                  <div className="rounded border border-dashed border-white/10 px-3 py-4 text-sm text-white/60">
                    Sin ventas registradas en el mes actual.
                  </div>
                ) : (
                  volumeBySku.slice(0, 6).map(renderSkuRow)
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/90 border border-slate-700">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white">Pedidos del mes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-sm">
                {orderHistory.length === 0 ? (
                  <div className="rounded border border-dashed border-white/10 px-3 py-4 text-sm text-white/60">
                    No hay pedidos registrados en el mes actual.
                  </div>
                ) : (
                  orderHistory.map((order) => (
                    <div
                      key={order.remision}
                      className="rounded border border-white/5 bg-slate-900/50 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-white">
                            {order.remision === 'SIN_REMISION'
                              ? 'Pedido sin remision'
                              : `Remision ${order.remision}`}
                          </div>
                          <div className="text-xs text-white/60">
                            {dateFormatter.format(new Date(order.date))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-white">
                            {numberFormatter.format(order.volume)} HL
                          </div>
                          <div className="text-xs text-white/60">
                            {numberFormatter.format(order.boxes)} cajas
                          </div>
                        </div>
                      </div>
                      {onOpenSalesDialog ? (
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border border-white/20 text-white hover:bg-white/10"
                            onClick={() => onOpenSalesDialog()}
                          >
                            Ver pedidos
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-800/90 border border-slate-700">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-white">Ejecuciones de Enfriador</CardTitle>
          </CardHeader>
          <CardContent>
            <CoolerExecutionsList clientCode={clientCode} />
          </CardContent>
        </Card>

        <Card className="bg-slate-800/90 border border-slate-700">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-white">Registrar llamada y acciones</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCallSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label className="text-white/80">Contesto?</Label>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant={form.answered === true ? 'default' : 'outline'}
                    onClick={() => {
                      setForm((prev) => ({ ...prev, answered: true, purchaseIntent: null }));
                    }}
                  >
                    Si
                  </Button>
                  <Button
                    type="button"
                    variant={form.answered === false ? 'default' : 'outline'}
                    onClick={() => setForm({ answered: false, purchaseIntent: null, comments: '' })}
                  >
                    No
                  </Button>
                </div>
              </div>

              {form.answered === true ? (
                <>
                  <div className="md:col-span-2">
                    {(!hasRegisteredPhone || editingPhone) ? (
                      <div className="rounded-xl border border-amber-500/60 bg-amber-950/40 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5">
                            <span>📱</span>
                            <span>
                              {hasRegisteredPhone
                                ? 'Actualizar número de teléfono del cliente'
                                : 'Registrar número de teléfono del cliente (Obligatorio si contestó)'}
                            </span>
                          </Label>
                          {hasRegisteredPhone && (
                            <button
                              type="button"
                              onClick={() => {
                                setPhoneInput(clientPhone);
                                setEditingPhone(false);
                              }}
                              className="text-xs text-slate-300 hover:text-white underline"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-amber-100/80">
                          Ingresa el número de celular / WhatsApp (10 dígitos) para enviarle automáticamente su ticket con puntos acumulados y QR de UM6 SHOP.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            type="tel"
                            placeholder="Ej. 2221234567 (10 dígitos)"
                            value={phoneInput}
                            onChange={(e) => {
                              setPhoneInput(e.target.value);
                              if (formError) setFormError(null);
                            }}
                            className="bg-slate-900 border-amber-500/50 text-white font-mono"
                          />
                          <Button
                            type="button"
                            disabled={isSavingPhone}
                            onClick={() => saveClientPhone(phoneInput)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shrink-0"
                          >
                            {isSavingPhone ? 'Guardando...' : 'Guardar Teléfono'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-emerald-200 flex items-center gap-2">
                          <span>📱 Teléfono / WhatsApp registrado:</span>
                          <strong className="font-mono text-white text-sm">{clientPhone}</strong>
                          {phoneSavedSuccess && (
                            <span className="rounded bg-emerald-600/40 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                              ✓ Guardado
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingPhone(true)}
                          className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline"
                        >
                          Cambiar número
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    {(!hasRegisteredVisitDays || editingVisitDays) ? (
                      <div className="rounded-xl border border-amber-500/60 bg-amber-950/40 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5">
                            <span>🗓️</span>
                            <span>
                              {hasRegisteredVisitDays
                                ? 'Actualizar días de visita del cliente'
                                : 'Asignar día(s) de visita del cliente (Obligatorio si no tiene)'}
                            </span>
                          </Label>
                          {hasRegisteredVisitDays && (
                            <button
                              type="button"
                              onClick={() => {
                                setVisitDaysInput(savedVisitDays);
                                setEditingVisitDays(false);
                              }}
                              className="text-xs text-slate-400 hover:text-white underline"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {VISIT_DAY_OPTIONS.map((dayName) => {
                            const selected = visitDaysInput.includes(dayName);
                            return (
                              <button
                                key={dayName}
                                type="button"
                                onClick={() => toggleVisitDayOption(dayName)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                                  selected
                                    ? 'bg-emerald-600 text-white border-emerald-500'
                                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                                }`}
                              >
                                {dayName}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isSavingVisitDays || visitDaysInput.length === 0}
                            onClick={() => saveClientVisitDays(visitDaysInput)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                          >
                            {isSavingVisitDays ? 'Guardando...' : 'Guardar días de visita'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <span>🗓️ Días de visita:</span>
                          <span className="font-semibold text-white">{savedVisitDays.join(', ')}</span>
                          {visitDaysSavedSuccess && (
                            <span className="rounded bg-emerald-600/40 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                              ✓ Guardado
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingVisitDays(true)}
                          className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline"
                        >
                          Cambiar días
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <Label className="text-white/80">¿Compra?</Label>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        variant={form.purchaseIntent === true ? 'default' : 'outline'}
                        disabled={isSavingPhone || isSavingVisitDays}
                        onClick={async () => {
                          let activePhone = hasRegisteredPhone ? cleanSavedPhoneDigits : null;
                          if (!activePhone) {
                            const pendingDigits = String(phoneInput || '').replace(/\D/g, '');
                            if (pendingDigits.length >= 10) {
                              activePhone = await saveClientPhone(pendingDigits);
                            }
                          }
                          if (!activePhone) {
                            setFormError('⚠️ Antes de capturar el pedido, debes registrar el número de teléfono del cliente (10 dígitos).');
                            return;
                          }
                          if (!hasRegisteredVisitDays) {
                            if (visitDaysInput.length > 0) {
                              const savedDays = await saveClientVisitDays(visitDaysInput);
                              if (!savedDays) return;
                            } else {
                              setFormError('⚠️ Antes de capturar el pedido, selecciona al menos un día de visita para este cliente.');
                              return;
                            }
                          }
                          setForm((prev) => ({ ...prev, purchaseIntent: true }));
                          onAnsweredYes?.(activePhone);
                        }}
                      >
                        Si
                      </Button>
                      <Button
                        type="button"
                        variant={form.purchaseIntent === false ? 'default' : 'outline'}
                        onClick={() => setForm((prev) => ({ ...prev, purchaseIntent: false }))}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-white/80">Comentarios</Label>
                    <Input
                      value={form.comments}
                      onChange={(event) => setForm((prev) => ({ ...prev, comments: event.target.value }))}
                      className="bg-slate-900 text-white"
                    />
                  </div>
                </>
              ) : null}

              {formError ? (
                <div className="text-sm text-red-300 md:col-span-2">{formError}</div>
              ) : null}

              <div className="md:col-span-2">
                <Label className="text-white/80">Motivo de la visita</Label>
                <Textarea
                  value={visitReason}
                  onChange={(event) => setVisitReason(event.target.value)}
                  placeholder="Describe el motivo o contexto para la visita (maximo 500 caracteres)."
                  className="mt-2 bg-slate-900 text-white min-h-[80px]"
                  maxLength={500}
                />
                <div className="mt-1 text-xs text-white/50">
                  El asesor recibira este comentario junto con la solicitud.
                </div>
              </div>

              <div className="flex flex-wrap gap-3 md:col-span-2">
                <Button type="submit" disabled={isSubmittingCall}>
                  {isSubmittingCall ? 'Guardando...' : 'Guardar llamada'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isRequestingVisit}
                  onClick={handleRequestVisit}
                >
                  {isRequestingVisit ? 'Solicitando...' : 'Solicitar visita del asesor'}
                </Button>
              </div>

              {visitError ? (
                <div className="text-sm text-red-300 md:col-span-2">{visitError}</div>
              ) : null}
            </form>

            {/* Sección: Pedido por WhatsApp */}
            <div className="mt-6 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">💬</span>
                <span className="text-sm font-semibold text-green-400">Registrar pedido por WhatsApp</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-white/70 text-xs">Cajas del pedido</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Ej. 3"
                    value={whatsappForm.boxes}
                    onChange={(e) => setWhatsappForm(prev => ({ ...prev, boxes: e.target.value }))}
                    className="mt-1 bg-slate-900 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Comentarios (opcional)</Label>
                  <Input
                    placeholder="Notas del pedido..."
                    value={whatsappForm.comments}
                    onChange={(e) => setWhatsappForm(prev => ({ ...prev, comments: e.target.value }))}
                    className="mt-1 bg-slate-900 text-white"
                  />
                </div>
                {whatsappError && (
                  <div className="text-xs text-red-300 md:col-span-2">{whatsappError}</div>
                )}
                <div className="md:col-span-2">
                  <Button
                    type="button"
                    disabled={isSubmittingWhatsapp}
                    onClick={handleWhatsAppOrderSubmit}
                    className="bg-green-600 hover:bg-green-700 text-white gap-2"
                  >
                    <span>💬</span>
                    {isSubmittingWhatsapp ? 'Guardando...' : 'Guardar pedido por WhatsApp'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CoolerExecutionsList({ clientCode }) {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientCode) return;
    setLoading(true);
    (async () => {
      try {
        const response = await fetch(
          `${SHOP_API_URL}/televenta/executions-list.php?client_code=${encodeURIComponent(clientCode)}`,
          { headers: await getShopAuthHeaders() }
        );
        const result = await response.json();
        if (result.success) setExecutions(result.data);
      } catch (err) {
        console.error('Error fetching executions:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientCode]);

  if (loading) return <div className="text-white/60 text-sm">Cargando ejecuciones...</div>;

  if (executions.length === 0) {
    return <div className="text-white/60 text-sm border border-dashed border-white/10 p-4 rounded">No hay ejecuciones registradas.</div>;
  }

  return (
    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
      {executions.map(ex => (
        <div key={ex.id} className="flex gap-3 bg-slate-900/50 p-3 rounded border border-white/5">
          <div className="w-16 h-16 shrink-0 bg-black rounded overflow-hidden flex items-center justify-center">
            <img
              src={ex.photo_url}
              alt="Ejecución"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${ex.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                ex.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                  'bg-yellow-500/20 text-yellow-300'
                }`}>
                {ex.status === 'pending' ? 'Pendiente' : ex.status === 'approved' ? 'Aprobada' : 'Rechazada'}
              </span>
              <span className="text-xs text-white/50">{new Date(ex.created_at).toLocaleDateString()}</span>
            </div>
            <p className="text-xs text-white/70 mt-1 line-clamp-2">
              {ex.feedback || 'Sin comentarios'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}



