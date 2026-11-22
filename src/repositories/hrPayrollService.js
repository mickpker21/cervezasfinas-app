import { supabase } from '@/mysqlClient';
import { getDb, isMockDb } from '@/lib/localDb';
import { getSalesBySku } from '@/repositories/salesRepository';
import { getClients } from '@/repositories/clientsRepository';
import { getAllEvaluations } from '@/repositories/evaluationsRepository';

const strip = (s) => (s || "").toString().trim();
const norm = (s) => strip(s).toUpperCase();
const clientCodeKey = (s) => norm(s).replace(/[^A-Z0-9]/g, "");
const isZeroLike = (s) => {
  if (!s) return true;
  const str = String(s).trim();
  return str === "0" || str === "00" || str === "000";
};
const routeKey = (r) => norm(r);

let cachedClientsByKey = null;
async function getClientsMap() {
    if (cachedClientsByKey) return cachedClientsByKey;
    const clients = await getClients();
    const map = new Map();
    for (const c of clients || []) {
        const code = strip(c?.client_code || c?.code || c?.cve_cliente || c?.clave_cliente || c?.id || "");
        if (code) map.set(clientCodeKey(code), c);
        const name = strip(c.name || "");
        if (name) map.set(clientCodeKey(name), c);
        const bname = strip(c.business_name || "");
        if (bname) map.set(clientCodeKey(bname), c);
    }
    cachedClientsByKey = map;
    return map;
}

async function routeFromRow(r) {
    const rx = strip(r?.ruta_express);
    if (rx && !isZeroLike(rx)) return rx;

    const rn = r?.ruta;
    const n = Number(rn);
    if (Number.isFinite(n) && n > 0) return String(n);
    if (typeof rn === "string" && rn && !isZeroLike(rn)) return strip(rn);

    const clientsByKey = await getClientsMap();
    const codeKey = clientCodeKey(r?.cve_cliente);
    const c = clientsByKey.get(codeKey);
    const alt = strip(c?.sales_route || c?.ruta || c?.internal_route || c?.route);
    return alt && !isZeroLike(alt) ? alt : null;
}

/**
 * Motor de Nómina y Comisiones.
 * Cruza la información real (ventas, asistencia) con las metas definidas en payroll_config.
 */

// Helper: Obtener registros de asistencia por mes (para calcular KPI de asistencia)
async function getAttendanceLogForMonth(userId, year, month) {
    const db = await getDb();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    
    if (isMockDb()) {
        const all = db._storage.get('hr_attendance') || [];
        return all.filter(a => a.user_id === userId && a.timestamp.startsWith(prefix));
    } else {
        const res = await db.query(`
            SELECT * FROM hr_attendance 
            WHERE user_id = ? AND timestamp LIKE ?
        `, [userId, `${prefix}%`]);
        return res.values || [];
    }
}

export async function toggleManualKpi(userId, year, month, kpiName, isMet) {
    const db = await getDb();
    const m = parseInt(month, 10);
    const key = `manual_kpi_${userId}_${year}_${m}_${kpiName}`;
    const value = isMet ? 'true' : 'false';
    
    if (isMockDb()) {
        const store = db._storage.get('kv_store') || [];
        const existingIdx = store.findIndex(item => item.key === key);
        if (existingIdx >= 0) store[existingIdx].value = value;
        else store.push({ key, value, updated_at: new Date().toISOString() });
        db._storage.set('kv_store', store);
    } else {
        await db.run(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)`, [key, value, new Date().toISOString()]);
    }
}

export async function savePayrollConfig(userId, config) {
    const db = await getDb();
    const key = `payroll_config_${userId}`;
    const value = JSON.stringify(config);
    if (isMockDb()) {
        const store = db._storage.get('kv_store') || [];
        const existingIdx = store.findIndex(item => item.key === key);
        if (existingIdx >= 0) store[existingIdx].value = value;
        else store.push({ key, value, updated_at: new Date().toISOString() });
        db._storage.set('kv_store', store);
    } else {
        await db.run(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)`, [key, value, new Date().toISOString()]);
    }
}

export async function getPayrollConfig(userId, fallbackConfig) {
    const db = await getDb();
    const key = `payroll_config_${userId}`;
    let savedVal = null;
    if (isMockDb()) {
        const store = db._storage.get('kv_store') || [];
        savedVal = store.find(item => item.key === key)?.value;
    } else {
        const res = await db.query(`SELECT value FROM kv_store WHERE key = ?`, [key]);
        if (res.values && res.values.length > 0) savedVal = res.values[0].value;
    }
    
    if (savedVal) {
        try { return JSON.parse(savedVal); } catch(e) { }
    }
    
    let config = fallbackConfig || {};
    if (typeof config === 'string') {
        try { config = JSON.parse(config); } catch(e) { config = {}; }
    }
    return config;
}

async function getSalesVolumeForMonth(user, year, month) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextFrom = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    const to = new Date(nextYear, nextMonth - 1, 0).toISOString().split('T')[0];
    
    const rows = await getSalesBySku({ from, to, nextFrom, zona: user.zona && user.zona !== 'TODAS' ? user.zona : undefined });
    let totalHL = 0;
    
    for (const r of rows) {
        if (user.route && user.route !== 'TODAS') {
            const raw = await routeFromRow(r);
            if (!raw || routeKey(raw) !== routeKey(user.route)) continue;
        }
        totalHL += (Number(r.htls_total) || 0);
    }
    return totalHL;
}

async function getEffectiveClientsForMonth(user, year, month) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextFrom = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    const to = new Date(nextYear, nextMonth - 1, 0).toISOString().split('T')[0];

    const rows = await getSalesBySku({ from, to, nextFrom, zona: user.zona && user.zona !== 'TODAS' ? user.zona : undefined });
    
    const salesByClientKey = new Map();
    for (const r of rows) {
        if (user.route && user.route !== 'TODAS') {
            const raw = await routeFromRow(r);
            if (!raw || routeKey(raw) !== routeKey(user.route)) continue;
        }
        
        const code = strip(r.cve_cliente);
        if (!code) continue;
        const key = clientCodeKey(code);
        const v = Number(r.htls_total) || 0;
        salesByClientKey.set(key, (salesByClientKey.get(key) || 0) + v);
    }
    
    let count = 0;
    for (const [key, value] of salesByClientKey.entries()) {
        if (value > 0) count++;
    }
    
    return count;
}

async function getEvaluationAverageForMonth(user, year, month) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = new Date(year, month, 0).toISOString().split('T')[0];

    const allEvals = await getAllEvaluations({ from, to });
    const clientsByKey = await getClientsMap();

    const hydratedEvals = allEvals.map((e) => {
        if (e.zona && e.ruta) return e;
        const code = e.client_code || e.client_id;
        if (!code) return e;
        const key = clientCodeKey(code);
        const c = clientsByKey.get(key);
        if (!c) return e;
        return {
            ...e,
            zona: e.zona || c.zona || c.region || c.zona_comercial,
            ruta: e.ruta || c.sales_route || c.ruta || c.internal_route || c.route,
        };
    });

    const filtered = hydratedEvals.filter(e => {
        if (from && e.fecha < from) return false;
        if (to && e.fecha > to) return false;

        const z = strip(e.zona);
        const r = strip(e.ruta || e.sales_route || e.client_route);

        if (user.zona && user.zona !== 'TODAS' && norm(z) !== norm(user.zona)) return false;
        if (user.route && user.route !== 'TODAS') {
            const sel = norm(user.route);
            const rut = norm(r);
            if (!rut.includes(sel)) return false;
        }

        return true;
    });

    if (filtered.length === 0) return 0;
    const total = filtered.reduce((acc, curr) => acc + (Number(curr.puntaje) || 0), 0);
    return Math.round(total / filtered.length);
}

async function getGlobalMetas(user, year, month) {
    const period_date = `${year}-${String(month).padStart(2, '0')}-01`;
    let metaVolume = 0;
    let metaClients = 0;

    try {
        if (user.route && user.route !== 'TODAS') {
            const { data } = await supabase
                .from('metas_venta')
                .select('meta, meta_clientes')
                .eq('sales_route', user.route)
                .eq('period_date', period_date)
                .maybeSingle();
            
            if (data) {
                metaVolume = data.meta || 0;
                metaClients = data.meta_clientes || 0;
            }
        } else if (user.zona && user.zona !== 'TODAS') {
            const { data } = await supabase
                .from('metas_zona')
                .select('meta')
                .eq('zona', user.zona)
                .eq('period_date', period_date)
                .maybeSingle();
                
            if (data) {
                metaVolume = data.meta || 0;
            }
        }
    } catch(e) {
        console.error("Error fetching global metas:", e);
    }

    return { metaVolume, metaClients };
}

/**
 * Calcula la nómina de un usuario específico para un mes.
 */
export async function calculateUserPayroll(user, year, month) {
    const config = await getPayrollConfig(user.id, user.payroll_config);
    const baseSalary = Number(config.base_salary) || 0;
    const kpis = config.kpis || [];
    
    // Traer las metas oficiales del módulo /admin/metas
    const globalMetas = await getGlobalMetas(user, year, month);

    let totalBonus = 0;
    const evaluatedKpis = [];

    for (const kpi of kpis) {
        let achievedValue = 0;
        let isMet = false;
        
        switch (kpi.type) {
            case 'sales_volume':
                achievedValue = await getSalesVolumeForMonth(user, year, month);
                kpi.target = globalMetas.metaVolume || kpi.target; // Usar la global, fallback a la manual
                isMet = achievedValue >= kpi.target;
                break;
                
            case 'effective_clients':
                achievedValue = await getEffectiveClientsForMonth(user, year, month);
                kpi.target = globalMetas.metaClients || kpi.target; // Usar la global, fallback a la manual
                isMet = achievedValue >= kpi.target;
                break;
                
            case 'attendance':
                const logs = await getAttendanceLogForMonth(user.id, year, month);
                // Calculate unique days with check_in
                const uniqueDays = new Set(logs.filter(l => l.type === 'check_in').map(l => l.timestamp.split('T')[0]));
                // Assume 24 working days in a month for this example
                achievedValue = Math.round((uniqueDays.size / 24) * 100); 
                if (achievedValue > 100) achievedValue = 100;
                isMet = achievedValue >= kpi.target;
                break;
                
            case 'evaluation':
                achievedValue = await getEvaluationAverageForMonth(user, year, month);
                isMet = Number(achievedValue) >= kpi.target;
                break;
                
            case 'custom':
                const kpiName = kpi.customName || 'Manual';
                const key = `manual_kpi_${user.id}_${year}_${month}_${kpiName}`;
                const db = await getDb();
                let savedMet = false;
                if (isMockDb()) {
                    const store = db._storage.get('kv_store') || [];
                    savedMet = store.find(item => item.key === key)?.value === 'true';
                } else {
                    const res = await db.query(`SELECT value FROM kv_store WHERE key = ?`, [key]);
                    if (res.values && res.values.length > 0) savedMet = res.values[0].value === 'true';
                }
                
                achievedValue = savedMet ? 1 : 0;
                kpi.target = 1;
                isMet = savedMet;
                break;
        }

        const bonusEarned = isMet ? Number(kpi.bonus) : 0;
        totalBonus += bonusEarned;
        
        evaluatedKpis.push({
            type: kpi.type === 'custom' ? (kpi.customName || 'Manual') : kpi.type,
            target: kpi.target,
            achieved: achievedValue,
            isMet,
            potentialBonus: kpi.bonus,
            earnedBonus: bonusEarned
        });
    }

    return {
        user_id: user.id,
        user_name: user.name,
        role: user.role,
        zona: user.zona,
        baseSalary,
        totalBonus,
        totalPay: baseSalary + totalBonus,
        kpis: evaluatedKpis
    };
}
