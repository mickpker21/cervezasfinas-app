// ============================================================
// CATÁLOGO DE PERFILES DE IMPRESORAS BLUETOOTH
// Incluye UUIDs BLE, ancho de papel, tipo de conexión y configuración ESC/POS
// ============================================================

export const PRINTER_BRANDS = [
  // ── Genéricas (ESC/POS estándar, UUID 18f0) ────────────────────────────
  {
    id: 'generic_58',
    label: 'Genérica 58mm (RPP02, PT-210, GOOJPRT, Netum)',
    group: 'Genéricas',
    paperWidth: 58,
    charWidth: 32,
    connectionType: 'ble',
    bleServiceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
    bleCharUuid: '00002af1-0000-1000-8000-00805f9b34fb',
    warning: null,
    models: ['RPP02', 'PT-210', 'GOOJPRT PT-210', 'Netum', 'POS-58', 'MPT-II', 'Mini POS'],
  },
  {
    id: 'generic_80',
    label: 'Genérica 80mm (POS-80, G80, Mini 80)',
    group: 'Genéricas',
    paperWidth: 80,
    charWidth: 48,
    connectionType: 'ble',
    bleServiceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
    bleCharUuid: '00002af1-0000-1000-8000-00805f9b34fb',
    warning: null,
    models: ['POS-80', 'G80', 'Mini 80'],
  },

  // ── Xprinter ─────────────────────────────────────────────────────────────
  {
    id: 'xprinter_58',
    label: 'Xprinter 58mm (XP-P300, XP-366B)',
    group: 'Xprinter',
    paperWidth: 58,
    charWidth: 32,
    connectionType: 'ble',
    bleServiceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
    bleCharUuid: '00002af1-0000-1000-8000-00805f9b34fb',
    warning: null,
    models: ['XP-P300', 'XP-366B', 'XP-T80'],
  },
  {
    id: 'xprinter_80',
    label: 'Xprinter 80mm (XP-420B, XP-F80)',
    group: 'Xprinter',
    paperWidth: 80,
    charWidth: 48,
    connectionType: 'ble',
    bleServiceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
    bleCharUuid: '00002af1-0000-1000-8000-00805f9b34fb',
    warning: null,
    models: ['XP-420B', 'XP-F80'],
  },

  // ── iDPRT ────────────────────────────────────────────────────────────────
  {
    id: 'idprt_58',
    label: 'iDPRT 58mm (iK4, SP450)',
    group: 'iDPRT',
    paperWidth: 58,
    charWidth: 32,
    connectionType: 'ble',
    bleServiceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
    bleCharUuid: '00002af1-0000-1000-8000-00805f9b34fb',
    warning: null,
    models: ['iK4', 'SP450'],
  },
  {
    id: 'idprt_80',
    label: 'iDPRT 80mm (iD80, DP80)',
    group: 'iDPRT',
    paperWidth: 80,
    charWidth: 48,
    connectionType: 'ble',
    bleServiceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
    bleCharUuid: '00002af1-0000-1000-8000-00805f9b34fb',
    warning: null,
    models: ['iD80', 'DP80'],
  },

  // ── Zebra ─────────────────────────────────────────────────────────────────
  {
    id: 'zebra_zq_58',
    label: 'Zebra ZQ Series 58mm (ZQ310, ZQ320)',
    group: 'Zebra',
    paperWidth: 58,
    charWidth: 32,
    connectionType: 'ble',
    bleServiceUuid: '38eb4a80-c570-11e3-9507-0002a5d5c51b',
    bleCharUuid:    '38eb4a82-c570-11e3-9507-0002a5d5c51b',
    warning: null,
    models: ['ZQ310', 'ZQ320', 'ZQ311', 'ZQ321'],
  },
  {
    id: 'zebra_zq_80',
    label: 'Zebra ZQ Series 80mm (ZQ511, ZQ521, ZQ630)',
    group: 'Zebra',
    paperWidth: 80,
    charWidth: 48,
    connectionType: 'ble',
    bleServiceUuid: '38eb4a80-c570-11e3-9507-0002a5d5c51b',
    bleCharUuid:    '38eb4a82-c570-11e3-9507-0002a5d5c51b',
    warning: null,
    models: ['ZQ511', 'ZQ521', 'ZQ630', 'ZD421'],
  },

  // ── Epson ─────────────────────────────────────────────────────────────────
  {
    id: 'epson_tm_80',
    label: 'Epson TM-T Series 80mm (TM-T20, TM-T88)',
    group: 'Epson',
    paperWidth: 80,
    charWidth: 48,
    connectionType: 'spp',
    bleServiceUuid: '00001101-0000-1000-8000-00805f9b34fb',
    bleCharUuid:    null,
    warning: 'Esta impresora usa Bluetooth clásico (SPP). Emparéjala primero en Configuración → Bluetooth de tu dispositivo Android, luego regresa aquí e ingresa su dirección MAC manualmente.',
    models: ['TM-T20III', 'TM-T20IIIL', 'TM-T88VI', 'TM-T88VII'],
  },

  // ── Honeywell ─────────────────────────────────────────────────────────────
  {
    id: 'honeywell_58',
    label: 'Honeywell 58mm (PC42, RP2)',
    group: 'Honeywell',
    paperWidth: 58,
    charWidth: 32,
    connectionType: 'spp',
    bleServiceUuid: '00001101-0000-1000-8000-00805f9b34fb',
    bleCharUuid:    null,
    warning: 'Esta impresora usa Bluetooth clásico (SPP). Emparéjala primero en Configuración → Bluetooth de tu dispositivo Android, luego regresa aquí e ingresa su dirección MAC manualmente.',
    models: ['PC42t', 'PC42d', 'RP2', 'RP2f', 'RP4'],
  },
  {
    id: 'honeywell_80',
    label: 'Honeywell 80mm (PC45, RP4)',
    group: 'Honeywell',
    paperWidth: 80,
    charWidth: 48,
    connectionType: 'spp',
    bleServiceUuid: '00001101-0000-1000-8000-00805f9b34fb',
    bleCharUuid:    null,
    warning: 'Esta impresora usa Bluetooth clásico (SPP). Emparéjala primero en Configuración → Bluetooth de tu dispositivo Android, luego regresa aquí e ingresa su dirección MAC manualmente.',
    models: ['PC45t', 'PC45d', 'RP4', 'RP4f'],
  },
];

/** Retorna el perfil completo dado un brand id */
export function getPrinterProfile(brandId) {
  return PRINTER_BRANDS.find(b => b.id === brandId) || PRINTER_BRANDS[0];
}

/** Config por defecto para nuevos usuarios */
export const DEFAULT_PRINTER_CONFIG = {
  brand: 'generic_58',
  model: '',
  deviceId: null,
  paperWidth: 58,
  charWidth: 32,
  bleServiceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
  bleCharUuid: '00002af1-0000-1000-8000-00805f9b34fb',
  connectionType: 'ble',
};

/** Agrupa las marcas para el select del UI */
export function getGroupedPrinterBrands() {
  const groups = {};
  for (const brand of PRINTER_BRANDS) {
    if (!groups[brand.group]) groups[brand.group] = [];
    groups[brand.group].push(brand);
  }
  return groups;
}
