import { getDb, isMockDb } from '@/lib/localDb';
import { getGoals } from './goalsRepository';
import { getSalesBySku } from './salesRepository';
import { logAction } from './auditRepository';

/**
 * HR & Performance Repository
 * Aggregates data for Dashboards and Commission Engine.
 */

// --- PERFORMANCE ---

import { detectUserRoute } from './routeRepository';
import { getClients } from './clientsRepository';
import { getVisitsByRoute } from './visitsRepository';
import { getAllowedRoutes } from './metadataRepository';

export async function getPerformanceSummary(userId, period) {
    // 1. Detect Routes (Primary + Allowed)
    const primaryRoute = await detectUserRoute({ id: userId });
    const { sales: allowedSalesRoutes } = await getAllowedRoutes(userId);

    const routes = new Set();
    if (primaryRoute) routes.add(primaryRoute);
    if (allowedSalesRoutes) allowedSalesRoutes.forEach(r => routes.add(r));

    const routeList = Array.from(routes);
    if (routeList.length === 0) routeList.push('101'); // Safety Fallback

    console.log(`[HR] Calculating stats for User ${userId} across routes: ${routeList.join(', ')}`);

    let combinedGoals = [];
    let combinedSales = [];
    let combinedClients = [];
    let combinedVisits = [];

    // 2. Fetch Data for ALL routes
    // Parallelize per route for speed
    const promises = routeList.map(async (route) => {
        const [g, s, c, v] = await Promise.all([
            getGoals({ salesRoute: route, from: period.start, to: period.end }),
            getSalesBySku({ salesRoute: route, from: period.start, to: period.end }),
            getClients(route),
            getVisitsByRoute(route, { startDate: period.start, endDate: period.end })
        ]);
        return { g, s, c, v };
    });

    const results = await Promise.all(promises);

    results.forEach(({ g, s, c, v }) => {
        combinedGoals = combinedGoals.concat(g);
        combinedSales = combinedSales.concat(s);
        combinedClients = combinedClients.concat(c);
        combinedVisits = combinedVisits.concat(v);
    });

    console.log(`[HR] Aggregated: ${combinedGoals.length} goals, ${combinedSales.length} sales.`);

    // ---------------------------------------------------------
    // KPI 1: VOLUME vs GOAL (Monthly)
    // ---------------------------------------------------------
    const totalVolume = combinedSales.reduce((sum, sale) => sum + (parseFloat(sale.htls_total) || 0), 0);
    const goalVolume = combinedGoals.reduce((sum, goal) => sum + (parseFloat(goal.meta) || 0), 0);

    // ---------------------------------------------------------
    // KPI 2: CLIENTS WITH PURCHASE (Monthly Unique)
    // ---------------------------------------------------------
    // Use Set to ensure unique clients across routes (if a client exists in multiple routes? unlikely but safe)
    const uniqueClientsWithPurchase = new Set(combinedSales.map(s => s.cve_cliente || s.client_code)).size;
    const totalClientsInRoutes = combinedClients.length; // Active clients in all routes

    // ---------------------------------------------------------
    // KPI 3: EXECUTION (Daily: Visited vs Scheduled Today)
    // ---------------------------------------------------------
    // Determine "Today's" scheduled clients
    const today = new Date();
    const dayName = today.toLocaleDateString('es-ES', { weekday: 'long' }).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // "miercoles"

    // Map DB days to standard
    const dayMap = {
        'lunes': 'lunes', 'mon': 'lunes',
        'martes': 'martes', 'tue': 'martes',
        'miercoles': 'miercoles', 'wed': 'miercoles',
        'jueves': 'jueves', 'thu': 'jueves',
        'viernes': 'viernes', 'fri': 'viernes',
        'sabado': 'sabado', 'sat': 'sabado'
    };
    const targetDay = dayMap[dayName] || dayName;

    // Filter "Planned" clients (Scheduled for Today)
    // combinedClients contains all clients from all routes
    const plannedClients = combinedClients.filter(c => {
        if (!c.visit_days) return false;
        const days = String(c.visit_days).toLowerCase();
        return days.includes(targetDay);
    });
    const plannedCount = plannedClients.length > 0 ? plannedClients.length : 1; // Avoid div/0

    // Filter "Visited" clients (Visited Today)
    const todayStr = today.toISOString().split('T')[0];
    const visitedToday = combinedVisits.filter(v => (v.fecha || '').startsWith(todayStr));
    const uniqueVisitedCount = new Set(visitedToday.map(v => v.client_id)).size;

    return {
        volume: {
            current: totalVolume,
            target: goalVolume > 0 ? goalVolume : 0,
            percent: goalVolume > 0 ? (totalVolume / goalVolume) * 100 : 0
        },
        clients: {
            buying: uniqueClientsWithPurchase,
            total: totalClientsInRoutes,
            active_percent: totalClientsInRoutes > 0 ? (uniqueClientsWithPurchase / totalClientsInRoutes) * 100 : 0
        },
        execution: {
            visited: uniqueVisitedCount,
            planned: plannedClients.length,
            percent: (uniqueVisitedCount / plannedCount) * 100
        }
    };
}

// --- GAMIFICATION (Enterprise) ---

export async function getUserGamificationParams(userId) {
    const db = await getDb();
    let data = null;

    if (isMockDb()) {
        const all = db._storage.get('hr_gamification') || [];
        data = all.find(x => x.user_id === userId);
    } else {
        const res = await db.query('SELECT * FROM hr_gamification WHERE user_id = ?', [userId]);
        data = (res.values && res.values[0]) || null;
    }

    if (!data) {
        // Init default if not exists
        return {
            xp: 0,
            level: 1,
            levelProgress: 0,
            badges: [],
            streak: 0
        };
    }

    return {
        ...data,
        badges: data.badges ? JSON.parse(data.badges) : [],
        levelProgress: (data.xp % 1000) / 10 // Mock logic: 1000 XP per level
    };
}

// --- ATTENDANCE ---

export async function recordAttendance(userId, type, coords) {
    const entry = {
        id: crypto.randomUUID(),
        user_id: userId,
        type, // 'check_in', 'check_out'
        timestamp: new Date().toISOString(),
        lat: coords?.lat || 0,
        lng: coords?.lng || 0,
        created_at: new Date().toISOString(),
        synced: 0
    };

    const db = await getDb();
    if (isMockDb()) {
        const current = db._storage.get('hr_attendance') || [];
        current.push(entry);
        db._storage.set('hr_attendance', current);
    } else {
        await db.run(`INSERT INTO hr_attendance (id, user_id, type, timestamp, lat, lng, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [entry.id, entry.user_id, entry.type, entry.timestamp, entry.lat, entry.lng, entry.created_at, entry.synced]
        );
    }

    // Log this event in the Audit Trail (Enterprise Requirement)
    await logAction({
        actorId: userId,
        action: `ATTENDANCE_${type.toUpperCase()}`,
        target: 'hr_attendance',
        details: { coords }
    });

    return entry;
}

export async function getTodayAttendance() {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];

    if (isMockDb()) {
        const all = db._storage.get('hr_attendance') || [];
        return all.filter(a => a.timestamp.startsWith(today));
    } else {
        const res = await db.query(`
            SELECT a.*, p.name as user_name, p.role as user_role, p.face_descriptor
            FROM hr_attendance a
            LEFT JOIN profiles p ON a.user_id = p.id
            WHERE date(a.timestamp) = date('now', 'localtime')
            ORDER BY a.timestamp DESC
        `);
        return res.values || [];
    }
}

export async function getAttendanceByDate(dateString) {
    // dateString should be 'YYYY-MM-DD'
    const db = await getDb();
    
    if (isMockDb()) {
        const all = db._storage.get('hr_attendance') || [];
        return all.filter(a => a.timestamp.startsWith(dateString));
    } else {
        const res = await db.query(`
            SELECT a.*, p.full_name as user_name, p.role as user_role, p.face_descriptor
            FROM hr_attendance a
            LEFT JOIN profiles p ON a.user_id = p.id
            WHERE date(a.timestamp) = date(?)
            ORDER BY a.timestamp DESC
        `, [dateString]);
        return res.values || [];
    }
}

export async function getLastAttendance(userId) {
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('hr_attendance') || [];
        const userLogs = all.filter(a => a.user_id === userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return userLogs[0] || null;
    } else {
        const res = await db.query(`
            SELECT * FROM hr_attendance 
            WHERE user_id = ? 
            ORDER BY timestamp DESC 
            LIMIT 1
        `, [userId]);
        return (res.values && res.values[0]) || null;
    }
}
