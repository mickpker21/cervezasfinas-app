// src/lib/dateUtils.js

/**
 * Timezone utilities para México
 * Zona horaria: America/Mexico_City (UTC-6)
 */

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para México
 * Usa la zona horaria America/Mexico_City
 * 
 * @returns {string} Fecha en formato YYYY-MM-DD (ej: "2026-01-18")
 */
export function getTodayMexico() {
    return new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Mexico_City'
    });
}

/**
 * Obtiene el timestamp actual en ISO format pero ajustado a México
 * 
 * @returns {string} Timestamp ISO (ej: "2026-01-18T06:30:00.000Z")
 */
export function getNowMexico() {
    // Opción 1: Convertir a México y luego a ISO
    const mexicoDate = new Date().toLocaleString('en-US', {
        timeZone: 'America/Mexico_City'
    });
    return new Date(mexicoDate).toISOString();
}

/**
 * Convierte un timestamp ISO a fecha de México (YYYY-MM-DD)
 * 
 * @param {string} isoString - Timestamp ISO
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function toMexicoDateString(isoString) {
    if (!isoString) return '';

    try {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-CA', {
            timeZone: 'America/Mexico_City'
        });
    } catch (e) {
        console.error('Error parsing date:', e);
        return '';
    }
}

/**
 * Verifica si un timestamp ISO corresponde a "hoy" en México
 * 
 * @param {string} isoString - Timestamp ISO
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
    const mexicoDateStr = new Date().toLocaleString('en-US', {
        timeZone: 'America/Mexico_City'
    });
    return new Date(mexicoDateStr).getDay();
}

/**
 * Obtiene fecha y hora formateadas para México
 * 
 * @returns {object} { date: 'YYYY-MM-DD', time: 'HH:MM:SS', dayOfWeek: 0-6 }
 */
export function getMexicoDateTime() {
    const mexicoStr = new Date().toLocaleString('en-US', {
        timeZone: 'America/Mexico_City',
        hour12: false
    });

    const date = new Date(mexicoStr);

    return {
        date: date.toLocaleDateString('en-CA'),
        time: date.toLocaleTimeString('en-GB'), // HH:MM:SS
        dayOfWeek: date.getDay(),
        timestamp: date.toISOString()
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
