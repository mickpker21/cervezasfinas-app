import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

export const BluetoothPrinterService = {
    device: null,
    server: null,
    characteristic: null,
    isConnected: false,

    // UUIDs — ahora dinamicos segun el perfil de impresora seleccionado
    // Valores predeterminados: impresoras genericas 58mm/80mm
    SERVICE_UUID: '000018f0-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC_UUID: '00002af1-0000-1000-8000-00805f9b34fb',

    async connect() {
        try {
            if (Capacitor.isNativePlatform()) {
                return await this.connectNative();
            } else {
                return await this.connectWeb();
            }
        } catch (error) {
            console.error('Bluetooth Connection Error:', error);
            this.isConnected = false;
            throw error;
        }
    },

    async connectWeb() {
        if (!navigator.bluetooth) {
            throw new Error("Web Bluetooth no disponible. Usa Chrome y HTTPS.");
        }

        console.log('Requesting Web Bluetooth Device...');
        this.device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [this.SERVICE_UUID] }],
            optionalServices: [this.SERVICE_UUID]
        });

        console.log('Connecting to GATT Server...');
        this.server = await this.device.gatt.connect();

        console.log('Getting Service...');
        const service = await this.server.getPrimaryService(this.SERVICE_UUID);

        console.log('Getting Characteristic...');
        const characteristics = await service.getCharacteristics();

        this.characteristic = characteristics.find(c =>
            c.properties.write || c.properties.writeWithoutResponse
        );

        if (!this.characteristic) {
            throw new Error("No write capability found regarding standard UUIDs.");
        }

        this.isConnected = true;
        this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
        return true;
    },

    async connectNative() {
        try {
            await BleClient.initialize();

            // 1. Try Auto-Connect to last used device
            const lastId = localStorage.getItem('last_printer_id');
            if (lastId) {
                try {
                    console.log(`Attempting auto-connect to stored printer: ${lastId}`);
                    // Check if device is bonded/available (optional, but connect checks it)
                    await BleClient.connect(lastId, (deviceId) => this.onDisconnected());
                    this.device = { deviceId: lastId }; // Mock device object since we don't have full object from connect
                    this.isConnected = true;
                    console.log('Auto-connected successfully!');
                    return true;
                } catch (autoErr) {
                    console.warn("Auto-connect failed, falling back to scanner:", autoErr);
                    // Clear invalid ID
                    localStorage.removeItem('last_printer_id');
                }
            }

            console.log('Scanning for Native Bluetooth Device...');
            // In native, requestDevice opens a picker
            const device = await BleClient.requestDevice({
                services: [this.SERVICE_UUID],
                optionalServices: [this.SERVICE_UUID]
            });

            this.device = device;
            console.log('Connecting Native...', device.deviceId);

            await BleClient.connect(device.deviceId, (deviceId) => this.onDisconnected());

            console.log('Native Connected!');
            this.isConnected = true;

            // Save for next time
            localStorage.setItem('last_printer_id', device.deviceId);

            return true;
        } catch (error) {
            console.error("Native Connect Fail:", error);
            throw error;
        }
    },

    onDisconnected() {
        console.log('Bluetooth Device Disconnected');
        BluetoothPrinterService.isConnected = false;
    },

    // Helper to remove accents/diacritics for thermal printers
    cleanText(str) {
        if (!str) return '';
        return str.toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^\x20-\x7E\n\r]/g, "");   // Remove non-printable ASCII but KEEP Newlines
    },

    async printTicket(saleData, client) {
        if (!this.isConnected) {
            throw new Error("Printer not connected");
        }

        console.log(`[BluetoothPrinterService] Printing Ticket. Sale ID: ${saleData.preventaId}`);
        // Generate ESC/POS Buffer
        const encoder = new EscPosEncoder();
        let commands = encoder
            .initialize()
            .align('center');

        // Print LOGO (Text Version)
        // Replaces problematic image printing.
        // Solved "Ghosting" issue.
        // Restore Image Logo (Safely)
        try { await this.printImage(encoder, '/logo2.png'); } catch (e) { }

        // Text Fallback (Optional)
        if (!Capacitor.isNativePlatform()) {
            commands.bold(true).size(2, 2).text('   ★   \n').text('CERVEZAS\n').text(' FINAS \n').size(1, 1).bold(false).feed(1);
        }

        commands
            .text('C. 5 Pte. 303, Col Centro\n')
            .text(this.cleanText('75520 Cdad. Serdan, Pue.\n'))
            .text('Tel. 245 452 0134\n')
            .feed(1)
            .align('left')
            .text(`${this.cleanText(new Date(saleData.created_at || new Date()).toLocaleString('es-MX'))}\n`)
            .text(`Cliente: ${client?.client_code || 'Mostrador'}\n`)
            .text(`${this.cleanText((client?.name || 'Cliente Mostrador').substring(0, 30))}\n`)
            .text(`Venta ID: #${saleData.preventaId?.toString().slice(-8) || '???'}\n`)
            .text('--------------------------------\n')
            .bold(true)
            .text('CANT DESCRIPCION       IMPORTE\n')
            .bold(false)
            .text('--------------------------------\n');

        // Items
        if (saleData.items) {
            saleData.items.forEach(item => {
                const qty = item.quantity.toString().padEnd(4);
                // Clean description text
                const rawName = item.des_marca || item.cve_marca || '';
                const name = this.cleanText(rawName).substring(0, 18).padEnd(19);
                const total = `$${(item.price * item.quantity).toFixed(2)}`.padStart(9);

                commands
                    .bold(true)
                    .text(qty)
                    .bold(false)
                    .text(`${name}${total}\n`);
            });
        }

        // Calc Totals
        // Calc Totals
        const finalTotal = Number(saleData.totalAmount);
        const discount = Number(saleData.discount || 0);
        const gecDiscount = Number(saleData.gecDiscount || 0);
        const promoDiscount = Number(saleData.promoDiscount || 0);
        const cargo = Number(saleData.cargo || 0); // Read Cargo

        console.log("Printer Financials:", { finalTotal, discount, gecDiscount, promoDiscount, cargo });

        // Subtotal = Final + Discounts - Surcharges (to get back to base)
        const subtotal = finalTotal + discount + gecDiscount + promoDiscount - cargo;

        commands
            .text('--------------------------------\n')
            .align('right')
            .text(`${saleData.items.length} articulos   Subtotal: $${subtotal.toFixed(2)}\n`)

        if (gecDiscount > 0) {
            commands.text(`Desc. GEC: -$${gecDiscount.toFixed(2)}\n`);
        }
        if (promoDiscount > 0) {
            commands.text(`Promocion: -$${promoDiscount.toFixed(2)}\n`);
        }

        const remainderDiscount = discount - gecDiscount - promoDiscount;
        if (remainderDiscount > 0.01) {
            commands.text(`Descuento: -$${remainderDiscount.toFixed(2)}\n`);
        }

        // Print Cargo (Moved to Bottom)
        if (cargo > 0) {
            commands.text(`Cargos: +$${cargo.toFixed(2)}\n`);
        }

        commands
            .bold(true)
            .text(`TOTAL: $${finalTotal.toFixed(2)}\n`)
            .bold(false)
            .align('center')
            .feed(1)
            .align('center')
            .text(this.cleanText('Visitenos en\n'))
            .text('www.cervezasfinas.com.mx\n')
            .feed(1)
            .qr(`https://cervezasfinas.com.mx/verificar?id=${saleData.preventaId || saleData.id}`)
            .feed(1);

        // Verification Code Logic
        const id = saleData.preventaId || saleData.id || '000000';
        const dateStr = saleData.created_at ? new Date(saleData.created_at).getDate() : new Date().getDate();
        const str = id.toString() + dateStr;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        const vCode = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0').match(/.{1,4}/g).join('-');

        commands
            .bold(true)
            .text(this.cleanText('Codigo de Verificacion:\n'))
            .text(`${vCode}\n`)
            .bold(false)
            .feed(1)
            .text(`Impreso: ${new Date().toLocaleTimeString()}\n`)
            .text('GRACIAS POR SU COMPRA!\n')
            .feed(3);

        const buffer = commands.encode();

        // Write logic depending on platform
        // Write logic
        await this.writeToDevice(buffer);
    },

    // ───────────────────────────────────────────────────────
    // TICKET DE PRUEBA (desde configuracion de impresora)
    // ───────────────────────────────────────────────────────
    async printTestTicket(printerConfig) {
        if (!this.isConnected) throw new Error('Printer not connected');

        const charWidth = printerConfig?.charWidth || 32;
        const sep = '-'.repeat(charWidth);
        const encoder = new EscPosEncoder();
        let commands = encoder.initialize().align('center');

        try { await this.printImage(encoder, '/logo2.png'); } catch (e) { }

        commands
            .bold(true).text('TICKET DE PRUEBA\n').bold(false)
            .text('CERVEZAS FINAS\n')
            .align('left')
            .feed(1)
            .text(`${sep}\n`)
            .text(`Marca:   ${printerConfig?.brand || 'generica'}\n`)
            .text(`Papel:   ${printerConfig?.paperWidth || 58}mm\n`)
            .text(`Chars:   ${charWidth} por linea\n`)
            .text(`Fecha:   ${new Date().toLocaleString('es-MX')}\n`)
            .text(`${sep}\n`)
            .align('center')
            .bold(true).text('IMPRESION EXITOSA\n').bold(false)
            .text('Configuracion correcta\n')
            .feed(3);

        const buffer = commands.encode();
        await this.writeToDevice(buffer);
    },

    // ───────────────────────────────────────────────────────
    // IMPRIMIR TICKET USANDO PLANTILLA DINAMICA DEL ADMIN
    // ───────────────────────────────────────────────────────
    async printTicketFromTemplate(saleData, client, template) {
        if (!this.isConnected) throw new Error('Printer not connected');

        // Fallback a printTicket si no hay template
        if (!template?.template_json?.sections) {
            return this.printTicket(saleData, client);
        }

        const { sections, charWidth: cw = 32 } = template.template_json;
        const charWidth = cw;
        const sep = '-'.repeat(charWidth);

        // Contexto de datos para sustitucion de variables {{...}}
        const id = saleData.preventaId || saleData.id || '000000';
        const dateStr = new Date(saleData.created_at || new Date()).getDate();
        const str = id.toString() + dateStr;
        let hash = 0;
        for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
        const vCode = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0').match(/.{1,4}/g).join('-');

        const ctx = {
            date: new Date(saleData.created_at || new Date()).toLocaleString('es-MX'),
            print_time: new Date().toLocaleTimeString(),
            'client.client_code': client?.client_code || 'Mostrador',
            'client.name': (client?.name || 'Cliente Mostrador').substring(0, charWidth - 2),
            'sale.id': `#${id.toString().slice(-8)}`,
            'sale.verify_url': `https://cervezasfinas.com.mx/verificar?id=${id}`,
        };

        const substitute = (str) => str.replace(/\{\{([^}]+)\}\}/g, (_, key) => ctx[key] || '');

        const encoder = new EscPosEncoder();
        let commands = encoder.initialize();

        const finalTotal = Number(saleData.totalAmount);
        const discount = Number(saleData.discount || 0);
        const gecDiscount = Number(saleData.gecDiscount || 0);
        const promoDiscount = Number(saleData.promoDiscount || 0);
        const cargo = Number(saleData.cargo || 0);
        const subtotal = finalTotal + discount + gecDiscount + promoDiscount - cargo;

        for (const section of sections) {
            if (!section.enabled) continue;

            if (section.type === 'header') {
                commands.align('center');
                for (const f of (section.fields || [])) {
                    if (!f.enabled) continue;
                    if (f.type === 'image') { try { await this.printImage(encoder, f.src || '/logo2.png'); } catch (e) {} }
                    else if (f.type === 'bold_center_text') commands.bold(true).text(`${this.cleanText(f.value)}\n`).bold(false);
                    else commands.text(`${this.cleanText(substitute(f.value))}\n`);
                }
                commands.feed(1);
            }

            else if (section.type === 'order_info') {
                commands.align('left').text(`${sep}\n`);
                for (const f of (section.fields || [])) {
                    if (!f.enabled) continue;
                    const val = this.cleanText(substitute(f.value || ''));
                    if (f.label) commands.text(`${f.label} ${val}\n`);
                    else commands.text(`${val}\n`);
                }
                commands.text(`${sep}\n`);
            }

            else if (section.type === 'items_table') {
                const cols = section.columns || [
                    { id: 'qty', width: 4, align: 'left' },
                    { id: 'name', width: 19, align: 'left' },
                    { id: 'total', width: 9, align: 'right' },
                ];
                const header = cols.map(c => c.label ? c.label.padEnd(c.width) : ''.padEnd(c.width)).join('');
                commands.align('left').bold(true).text(`${header}\n`).bold(false).text(`${sep}\n`);

                for (const item of (saleData.items || [])) {
                    const qty = (item.quantity || 0).toString().padEnd(cols[0]?.width || 4);
                    const rawName = item.des_marca || item.cve_marca || '';
                    const nameWidth = cols[1]?.width || 19;
                    const name = this.cleanText(rawName).substring(0, nameWidth).padEnd(nameWidth);
                    const totalWidth = cols[2]?.width || 9;
                    const total = `$${(item.price * item.quantity).toFixed(2)}`.padStart(totalWidth);
                    commands.bold(true).text(qty).bold(false).text(`${name}${total}\n`);
                }
                commands.text(`${sep}\n`);
            }

            else if (section.type === 'totals') {
                commands.align('right');
                for (const f of (section.fields || [])) {
                    if (!f.enabled) continue;
                    const label = this.cleanText(f.label || '');
                    let val = '';
                    switch (f.type) {
                        case 'subtotal': val = `${(saleData.items || []).length} articulos   Subtotal: $${subtotal.toFixed(2)}`; break;
                        case 'gec_discount': if (gecDiscount <= 0) continue; val = `${label} -$${gecDiscount.toFixed(2)}`; break;
                        case 'promo_discount': if (promoDiscount <= 0) continue; val = `${label} -$${promoDiscount.toFixed(2)}`; break;
                        case 'cargo': if (cargo <= 0) continue; val = `${label} +$${cargo.toFixed(2)}`; break;
                        case 'total': val = `${label} $${finalTotal.toFixed(2)}`; break;
                        default: val = label;
                    }
                    if (f.bold) commands.bold(true).text(`${val}\n`).bold(false);
                    else commands.text(`${val}\n`);
                }
            }

            else if (section.type === 'footer') {
                commands.feed(1).align('center');
                for (const f of (section.fields || [])) {
                    if (!f.enabled) continue;
                    if (f.type === 'qr_code') {
                        commands.qr(substitute(f.value || ''));
                    } else if (f.type === 'verify_code') {
                        commands.bold(true).text(`${this.cleanText(f.label || 'Codigo de Verificacion:')}\n`).bold(false).text(`${vCode}\n`);
                    } else if (f.type === 'bold_center_text') {
                        commands.bold(true).text(`${this.cleanText(substitute(f.value || ''))}\n`).bold(false);
                    } else if (f.value) {
                        commands.text(`${this.cleanText(substitute(f.value))}\n`);
                    }
                }
                commands.feed(3);
            }
        }

        const buffer = commands.encode();
        await this.writeToDevice(buffer);
    },


    async printInventory(items, user, title = "INVENTARIO") {
        if (!this.isConnected) {
            throw new Error("Printer not connected");
        }

        console.log(`[BluetoothPrinterService] Printing Inventory`);
        const encoder = new EscPosEncoder();
        let commands = encoder.initialize().align('center');

        // Restore Image Logo (Safely)
        try { await this.printImage(encoder, '/logo2.png'); } catch (e) { }

        // Text Fallback (Optional, but acts as spacing/failsafe)
        if (!Capacitor.isNativePlatform()) {
            commands.bold(true).size(2, 2).text('   ★   \n').text('CERVEZAS\n').text(' FINAS \n').size(1, 1).bold(false).feed(1);
        }

        const now = new Date();
        const dateStr = this.cleanText(now.toLocaleString('es-MX'));
        const driverName = this.cleanText(user?.user_metadata?.name || 'Chofer');

        commands
            .bold(true)
            .text('CERVEZAS FINAS\n')
            .text('REPORTE DE INVENTARIO\n')
            .bold(false)
            .text(`${this.cleanText(title)}\n`)
            .text('--------------------------------\n')
            .align('left')
            .text(`Fecha:  ${dateStr}\n`)
            .text(`Chofer: ${driverName}\n`)
            .text('--------------------------------\n')
            .bold(true)
            .text('CANT   PRODUCTO\n')
            .bold(false)
            .text('--------------------------------\n');

        items.forEach(item => {
            const qty = item.qty.toString().padEnd(6);
            const name = this.cleanText(item.name || item.sku).substring(0, 24);
            commands.text(`${qty} ${name}\n`);
        });

        const totalBoxes = items.reduce((sum, i) => sum + Number(i.qty), 0);

        commands
            .text('--------------------------------\n')
            .feed(1)
            .bold(true)
            .align('right')
            .text(`TOTAL CAJAS: ${totalBoxes}\n`)
            .bold(false)
            .align('center')
            .feed(2)
            .text('__________________________\n')
            .text('Firma Responsable\n')
            .feed(3);

        const buffer = commands.encode();
        await this.writeToDevice(buffer);
    },

    async printDailyReport(stats, user, now = new Date()) {
        if (!this.isConnected) {
            throw new Error("Printer not connected");
        }

        console.log(`[BluetoothPrinterService] Printing Daily Report`);
        const encoder = new EscPosEncoder();
        let commands = encoder
            .initialize()
            .lineSpacing(60)
            .align('center');

        // Restore Image Logo
        try { await this.printImage(encoder, '/logo2.png'); } catch (e) { }

        const dateStr = this.cleanText(now.toLocaleString('es-MX'));
        const driverName = this.cleanText(user?.user_metadata?.name || 'Chofer');
        const routeName = this.cleanText(stats.routeName || user?.user_metadata?.route || '---');

        commands
            .bold(true)
            .text('CERVEZAS FINAS\n')
            .text('CIERRE DE JORNADA\n')
            .bold(false)
            .text('--------------------------------\n')
            .align('left')
            .text(`Fecha:  ${dateStr}\n`)
            .text(`Chofer: ${driverName}\n`)
            .text(`Ruta:   ${routeName}\n`)
            .text('--------------------------------\n')
            .bold(true)
            .text('CONCEPTO           VALOR\n')
            .bold(false)
            .text('--------------------------------\n');

        const rows = [
            { label: 'Venta Total:', value: `$${stats.salesTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { label: 'Tickets:', value: stats.salesCount.toString() },
            { label: 'Volumen (HL):', value: stats.totalHL.toString() },
            { label: 'Cajas Vendidas:', value: stats.totalBoxes.toString() },
            { label: 'Visitas Efectivas:', value: stats.visitsCount.toString() },
            { label: 'Inv. Final:', value: stats.inventoryCount.toString() }
        ];

        rows.forEach(row => {
            const label = this.cleanText(row.label).padEnd(18);
            const val = this.cleanText(row.value).padStart(13);
            commands.text(`${label}${val}\n`);
        });

        commands
            .text('--------------------------------\n')
            .feed(2)
            .align('center')
            .text('__________________________\n')
            .text('Firma Chofer\n')
            .feed(2)
            .text('__________________________\n')
            .text('Firma Supervisor\n')
            .feed(3);

        const buffer = commands.encode();
        await this.writeToDevice(buffer);
    },

    async writeToDevice(buffer) {
        if (Capacitor.isNativePlatform()) {
            // Native Chunking logic to prevent buffer overflow
            const CHUNK_SIZE = 400; // Smaller safe chunk
            for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
                const chunk = buffer.slice(i, i + CHUNK_SIZE);
                const dataView = new DataView(chunk.buffer);
                await BleClient.write(this.device.deviceId, this.SERVICE_UUID, this.CHARACTERISTIC_UUID, dataView);
                // Small delay to let printer digest
                await new Promise(r => setTimeout(r, 60));
            }
        } else {
            await this.writeInChunksWeb(buffer);
        }
    },

    async writeInChunksWeb(data) {
        const CHUNK_SIZE = 512;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            await this.characteristic.writeValue(chunk);
        }
    },

    async printImage(encoder, imageUrl) {

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";

            // Timeout Safety: If image takes > 800ms, skip it to prevent ghosting/hanging
            const timeoutId = setTimeout(() => {
                console.warn("Logo load timed out, skipping.");
                resolve();
            }, 800);

            img.onload = () => {
                clearTimeout(timeoutId);
                try {
                    const canvas = document.createElement('canvas');
                    // Resize if too big (Safe width for most 58mm printers 384px)
                    const maxWidth = 384;
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }

                    // Align width to bytes (multiple of 8)
                    width = Math.ceil(width / 8) * 8;

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const imageData = ctx.getImageData(0, 0, width, height);

                    const rasterData = encoder.raster(imageData);
                    encoder.image(width, height, rasterData);
                } catch (err) {
                    console.error("Error encoding image:", err);
                }
                resolve();
            };

            img.onerror = (e) => {
                clearTimeout(timeoutId);
                console.error("Could not load logo image for printing", e);
                resolve(); // Continue without logo
            };

            img.src = imageUrl;
        });
    }
};

// Simple ESC/POS Encoder Helper
class EscPosEncoder {
    constructor() {
        this.buffer = [];
    }

    initialize() {
        this.buffer.push(0x1B, 0x40); // ESC @
        return this;
    }

    text(str) {
        const bytes = new TextEncoder().encode(str);
        bytes.forEach(b => this.buffer.push(b));
        return this;
    }

    lineSpacing(n) {
        this.buffer.push(0x1B, 0x33, n); // ESC 3 n
        return this;
    }

    feed(n) {
        this.buffer.push(0x1B, 0x64, n); // ESC d n
        return this;
    }

    align(align) {
        let n = 0;
        if (align === 'center') n = 1;
        if (align === 'right') n = 2;
        this.buffer.push(0x1B, 0x61, n); // ESC a n
        return this;
    }

    bold(enable) {
        this.buffer.push(0x1B, 0x45, enable ? 1 : 0); // ESC E n
        return this;
    }

    // New Size Command (GS ! n)
    size(width, height) {
        // width and height: 1 (normal) to 8
        // n bits: 0-3 = height-1, 4-7 = width-1
        // Example: Normal = 0x00. Double = 0x11 (17).
        if (width < 1) width = 1; else if (width > 8) width = 8;
        if (height < 1) height = 1; else if (height > 8) height = 8;

        const w = width - 1;
        const h = height - 1;
        const n = (w << 4) | h;

        this.buffer.push(0x1D, 0x21, n); // GS ! n
        return this;
    }

    qr(data) {
        // ESC/POS QR Code Commands (Model 2)
        // 1. Set model
        this.buffer.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
        // 2. Set size
        this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);
        // 3. Set error correction level (M)
        this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);

        // 4. Store data
        const len = data.length + 3;
        const pL = len % 256;
        const pH = Math.floor(len / 256);
        this.buffer.push(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
        const bytes = new TextEncoder().encode(data);
        bytes.forEach(b => this.buffer.push(b));

        // 5. Print
        this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
        return this;
    }

    image(width, height, data) {
        // GS v 0 m xL xH yL yH d1...dk
        // m=0 (density normal)
        // xL, xH = width in bytes
        // yL, yH = height in dots

        const bytesWidth = Math.ceil(width / 8);
        const xL = bytesWidth % 256;
        const xH = Math.floor(bytesWidth / 256);
        const yL = height % 256;
        const yH = Math.floor(height / 256);

        this.buffer.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

        data.forEach(b => this.buffer.push(b));
        return this;
    }

    // Converts ImageData from a canvas to a raster byte array for ESC/POS
    raster(imageData) {
        const { width, height, data } = imageData;
        const bytesPerRow = Math.ceil(width / 8);
        const rasterData = [];

        for (let y = 0; y < height; y++) {
            for (let xByte = 0; xByte < bytesPerRow; xByte++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = xByte * 8 + bit;
                    if (x < width) {
                        const i = (y * width + x) * 4; // RGBA
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const alpha = data[i + 3];

                        // Convert to grayscale and check if it's dark enough (or transparent)
                        // A simple luminance calculation: 0.2126*R + 0.7152*G + 0.0722*B
                        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b);

                        // If pixel is dark (luminance < 128) and not fully transparent, set bit
                        if (luminance < 128 && alpha > 128) {
                            byte |= (1 << (7 - bit));
                        }
                    }
                }
                rasterData.push(byte);
            }
        }
        return rasterData;
    }

    encode() {
        return new Uint8Array(this.buffer);
    }
}
