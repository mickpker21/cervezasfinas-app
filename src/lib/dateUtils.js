// src/lib/dateUtils.js

/**
 * Timezone utilities para México
 * Zona horaria: America/Mexico_City (UTC-6)
 */

/**
 * Obtiene las partes de fecha/hora exactas en zona horaria America/Mexico_City
 * sin depender del reloj/zona horaria del dispositivo.
 */
function getMexicoParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = {};
    for (const p of formatter.formatToParts(date)) {
        if (p.type !== 'literal') parts[p.type] = p.value;
    }
    // En algunos motores Intl, medianoche aparece como "24"
    const hour = parts.hour === '24' ? '00' : (parts.hour || '00');
    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour,
        minute: parts.minute || '00',
        second: parts.second || '00',
    };
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para México
 * Usa la zona horaria America/Mexico_City
 * 
 * @returns {string} Fecha en formato YYYY-MM-DD (ej: "2026-01-18")
 */
export function getTodayMexico() {
    const p = getMexicoParts(new Date());
    return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Obtiene el timestamp actual en hora exacta de México (America/Mexico_City)
 * en formato MySQL DATETIME / local seguro: "YYYY-MM-DD HH:mm:ss".
 * Evita el desfase +6h de toISOString() (UTC).
 * 
 * @returns {string} Timestamp en hora de México (ej: "2026-11-24 23:05:00")
 */
export function getNowMexico(date = new Date()) {
    const p = getMexicoParts(date);
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Obtiene la hora actual en México en formato HH:mm:ss (24h).
 */
export function getMexicoTimeString(date = new Date()) {
    const p = getMexicoParts(date);
    return `${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Convierte un timestamp (UTC ISO con 'Z'/offset o DATETIME local de México)
 * a fecha calendario de México (YYYY-MM-DD).
 * 
 * @param {string} isoString - Timestamp ISO o DATETIME
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function toMexicoDateString(isoString) {
    if (!isoString) return '';
    const str = String(isoString).trim();
    if (!str) return '';

    // Si es solo fecha YYYY-MM-DD o DATETIME local sin zona explícita (ya guardado en hora México),
    // devolver directamente YYYY-MM-DD para no volver a restar 6 horas.
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(str)) {
        return str.slice(0, 10);
    }

    try {
        const date = new Date(str);
        if (Number.isNaN(date.getTime())) return str.slice(0, 10);
        const p = getMexicoParts(date);
        return `${p.year}-${p.month}-${p.day}`;
    } catch (e) {
        console.error('Error parsing date:', e);
        return str.slice(0, 10);
    }
}

/**
 * Verifica si un timestamp corresponde a "hoy" en México (corte 00:00 America/Mexico_City)
 * 
 * @param {string} isoString - Timestamp ISO o DATETIME
 * @returns {boolean}
 */
export function isTodayMexico(isoString) {
    if (!isoString) return false;

    const dateStr = toMexicoDateString(isoString);
    const today = getTodayMexico();

    return dateStr === today;
}

/**
 * Obtiene el día de la semana actual en México (0 = Domingo, 6 = Sábado)
 * 
 * @returns {number} Número de día (0-6)
 */
export function getTodayDayOfWeekMexico() {
    const p = getMexicoParts(new Date());
    return new Date(Number(p.year), Number(p.month) - 1, Number(p.day)).getDay();
}

/**
 * Obtiene fecha y hora formateadas para México (America/Mexico_City)
 * 
 * @returns {object} { date: 'YYYY-MM-DD', time: 'HH:MM:SS', dayOfWeek: 0-6, timestamp: 'YYYY-MM-DD HH:MM:SS' }
 */
export function getMexicoDateTime(date = new Date()) {
    const p = getMexicoParts(date);
    const dateStr = `${p.year}-${p.month}-${p.day}`;
    const timeStr = `${p.hour}:${p.minute}:${p.second}`;
    const dayOfWeek = new Date(Number(p.year), Number(p.month) - 1, Number(p.day)).getDay();

    return {
        date: dateStr,
        time: timeStr,
        dayOfWeek,
        timestamp: `${dateStr} ${timeStr}`
    };
}

/**
 * Calcula días hábiles (Lunes-Sábado) entre dos fechas
 * @param {string} fromISO - Fecha inicio YYYY-MM-DD
 * @param {string} toISO - Fecha fin YYYY-MM-DD
 * @returns {number} Número de días hábiles
 */
export function businessDaysMonSat(fromISO, toISO) {
    const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
    const from = parse(fromISO), to = parse(toISO);
    if (to < from) return 0;

    let c = 0, cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    while (cur <= to) {
        if (cur.getDay() !== 0) c++; // 0 is Sunday
        cur.setDate(cur.getDate() + 1);
    }
    return c;
}
