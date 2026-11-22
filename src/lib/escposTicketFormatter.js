/**
 * escposTicketFormatter.js
 * Generador de comandos y texto plano para Impresoras Térmicas Bluetooth (58mm / 80mm)
 * Compatible con impresoras ESC/POS móviles (Zebra, Bixolon, Goojprt, POS-58, etc.)
 */

/**
 * Centra una cadena de texto en un ancho dado
 */
function centerText(text, width = 32) {
  const str = String(text || '').trim();
  if (str.length >= width) return str.slice(0, width);
  const pad = Math.floor((width - str.length) / 2);
  return ' '.repeat(pad) + str;
}

/**
 * Justifica dos columnas (Texto a la izquierda, Monto a la derecha)
 */
function justifyRow(left, right, width = 32) {
  const strLeft = String(left || '').trim();
  const strRight = String(right || '').trim();
  const maxLeft = width - strRight.length - 1;
  const truncatedLeft = strLeft.length > maxLeft ? strLeft.slice(0, maxLeft) : strLeft;
  const spaces = Math.max(1, width - truncatedLeft.length - strRight.length);
  return truncatedLeft + ' '.repeat(spaces) + strRight;
}

/**
 * Genera el ticket en texto plano para formato de 58mm (32 columnas) o 80mm (48 columnas)
 */
export function generatePlainTicket(saleData, client, items = [], width = 32) {
  const line = '─'.repeat(width);
  const doubleLine = '═'.repeat(width);

  const date = saleData.created_at
    ? new Date(saleData.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
    : new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  const ticketId = String(saleData.id || saleData.preventaId || '000000').slice(-8).toUpperCase();
  const total = Number(saleData.total_amount || saleData.totalAmount || 0);

  const lines = [];

  // Encabezado
  lines.push(doubleLine);
  lines.push(centerText('CERVEZAS FINAS', width));
  lines.push(centerText('COMPROBANTE DE VENTA', width));
  lines.push(doubleLine);

  lines.push(justifyRow('FOLIO:', `#${ticketId}`, width));
  lines.push(justifyRow('FECHA:', date, width));
  lines.push(justifyRow('CLIENTE:', (client?.business_name || client?.name || 'MOSTRADOR').slice(0, width - 9), width));
  if (client?.client_code) lines.push(justifyRow('COD. CLIENTE:', client.client_code, width));
  if (client?.delivery_route || client?.sales_route) {
    lines.push(justifyRow('RUTA:', client.delivery_route || client.sales_route, width));
  }
  lines.push(line);

  // Productos
  lines.push(centerText('CANT  PRODUCTO           TOTAL', width));
  lines.push(line);

  let totalReturnableBottles = 0;

  items.forEach(item => {
    const qty = Number(item.quantity || item.qty || 1);
    const price = Number(item.price || item.unit_price || 0);
    const subtotal = qty * price;
    const name = item.des_marca || item.name || item.cve_marca || 'PRODUCTO';
    const isReturnable = Number(item.returnableFactor || 0) >= 1.0 || item.es_retornable;

    if (isReturnable) {
      totalReturnableBottles += qty;
    }

    // Línea 1: Qty x Nombre
    lines.push(`${String(qty).padStart(2)}x ${name.slice(0, width - 12)}`);

    // Línea 2: Desglose de precio unitario y subtotal
    const priceStr = `$${price.toFixed(2)} c/u -> $${subtotal.toFixed(2)}`;
    lines.push(justifyRow('   ', priceStr, width));

    // Desglose de promociones si existen
    const breakdown = item.breakdown || [];
    breakdown.forEach(b => {
      const bSign = b.amount < 0 || b.type.includes('discount') || b.type === 'promotion' ? '-' : '+';
      const bText = `   * ${b.label}`;
      const bVal = `${bSign}$${(Math.abs(b.amount) * qty).toFixed(2)}`;
      lines.push(justifyRow(bText, bVal, width));
    });

    if (isReturnable) {
      lines.push(justifyRow('   ', `(♻️ ${qty} envases a retornar)`, width));
    }
  });

  lines.push(line);

  // Resumen de Descuentos globales si aplican
  if (Number(saleData.promo_discount || 0) > 0) {
    lines.push(justifyRow('DESC. PROMO:', `-$${Number(saleData.promo_discount).toFixed(2)}`, width));
  }
  if (Number(saleData.gec_discount || 0) > 0) {
    lines.push(justifyRow('DESC. GEC:', `-$${Number(saleData.gec_discount).toFixed(2)}`, width));
  }
  if (Number(saleData.cargo || 0) > 0) {
    lines.push(justifyRow('CARGO ENVASE:', `+$${Number(saleData.cargo).toFixed(2)}`, width));
  }

  lines.push(doubleLine);
  lines.push(justifyRow('TOTAL A PAGAR:', `$${total.toFixed(2)}`, width));
  lines.push(doubleLine);

  if (totalReturnableBottles > 0) {
    lines.push(centerText(`♻️ ENVASES A DEVOLVER: ${totalReturnableBottles}`, width));
    lines.push(line);
  }

  lines.push(centerText('¡Gracias por su compra!', width));
  lines.push(centerText('Cervezas Finas App', width));
  lines.push('\n\n\n');

  return lines.join('\n');
}

/**
 * Genera bytes binarios de comandos ESC/POS para envío por Web Bluetooth / Serial
 */
export function generateESCPOSBytes(saleData, client, items = [], paperSize = '58mm') {
  const width = paperSize === '80mm' ? 48 : 32;
  const plainText = generatePlainTicket(saleData, client, items, width);

  // Comandos ESC/POS estándar
  const ESC = 0x1b;
  const GS = 0x1d;

  const initPrinter = [ESC, 0x40]; // ESC @ (Inicializar)
  const setSpanish = [ESC, 0x52, 0x0f]; // Código de caracteres latino
  const alignCenter = [ESC, 0x61, 0x01];
  const alignLeft = [ESC, 0x61, 0x00];
  const cutPaper = [GS, 0x56, 0x42, 0x00]; // GS V B 0 (Corte parcial)

  const encoder = new TextEncoder();
  const textBytes = encoder.encode(plainText);

  const fullBytes = new Uint8Array([
    ...initPrinter,
    ...setSpanish,
    ...textBytes,
    ...cutPaper,
  ]);

  return fullBytes;
}

/**
 * Envía el ticket directamente a una impresora Bluetooth conectada vía Web Bluetooth API
 */
export async function printViaWebBluetooth(saleData, client, items = [], paperSize = '58mm') {
  if (!navigator.bluetooth) {
    throw new Error('Navegador no soporta Web Bluetooth. Usa Chrome o Edge.');
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
  });

  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  if (!services.length) throw new Error('No se encontraron servicios de impresión.');

  const characteristics = await services[0].getCharacteristics();
  const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

  if (!writeChar) throw new Error('Característica de escritura no disponible en la impresora.');

  const bytes = generateESCPOSBytes(saleData, client, items, paperSize);

  // Enviar en bloques de 512 bytes para evitar saturar el buffer Bluetooth
  const chunkSize = 512;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (writeChar.properties.writeWithoutResponse) {
      await writeChar.writeValueWithoutResponse(chunk);
    } else {
      await writeChar.writeValue(chunk);
    }
  }

  return true;
}
