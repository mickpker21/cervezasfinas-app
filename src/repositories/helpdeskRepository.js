import { v4 as uuidv4 } from 'uuid';
import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline } from '@/lib/network';
import { addPendingOperation } from '@/sync/syncService';
import { fetchHelpdeskApi, importHelpdeskApi } from '@/lib/mysqlHelpdesk';

/**
 * INIT (Optional: seed basic areas if missing locally)
 */
export async function seedBasicAreasIfMissing() {
  const db = await getDb();
  let areas = [];
  if (isMockDb()) {
    areas = db._storage.get('support_ticket_areas') || [];
  } else {
    const res = await db.query('SELECT * FROM support_ticket_areas');
    areas = res.values || [];
  }

  if (areas.length === 0) {
    const basicAreas = [
      { id: 'area-sistemas-001', name: 'Sistemas', is_active: 1 },
      { id: 'area-canalfrio-002', name: 'Canal Frío', is_active: 1 },
      { id: 'area-rrhh-003', name: 'Recursos Humanos', is_active: 1 },
      { id: 'area-soporte-004', name: 'Soporte General', is_active: 1 }
    ];
    for (const a of basicAreas) {
      // Check if area with same name already exists to avoid duplicates if ID was different before
      const exists = areas.some(existing => existing.name.toLowerCase() === a.name.toLowerCase());
      if (exists) continue;

      await saveAreaLocal(a, false);
      try {
        await addPendingOperation({
          entity_type: 'support_ticket_area',
          operation: 'insert',
          payload: a,
          created_at: new Date().toISOString()
        });
      } catch (e) {}
    }
  }
}

/**
 * AREAS
 */
export async function fetchAreas(forceOnline = false) {
  const online = await isOnline().catch(() => false);
  if (online || forceOnline) {
    try {
      const resp = await fetchHelpdeskApi();
      if (resp && resp.areas) {
        for (const a of resp.areas) {
          await saveAreaLocal(a, true);
        }
      }
    } catch (e) {
      console.warn('[helpdeskRepository] Failed to fetch areas online:', e);
    }
  }

  const db = await getDb();
  if (isMockDb()) {
    const all = db._storage.get('support_ticket_areas') || [];
    const active = all.filter(a => a.is_active === 1 || a.is_active === true);
    const uniqueNames = new Set();
    return active.filter(a => {
      const lowerName = (a.name || '').toLowerCase().trim();
      if (!lowerName || uniqueNames.has(lowerName)) return false;
      uniqueNames.add(lowerName);
      return true;
    });
  }
  const res = await db.query('SELECT * FROM support_ticket_areas WHERE is_active = 1');
  const values = res.values || [];
  
  const uniqueNames = new Set();
  return values.filter(a => {
    const lowerName = (a.name || '').toLowerCase().trim();
    if (!lowerName || uniqueNames.has(lowerName)) return false;
    uniqueNames.add(lowerName);
    return true;
  });
}

export async function addOrUpdateArea(areaName, id = null, is_active = 1) {
  const area = {
    id: id || uuidv4(),
    name: areaName,
    is_active: is_active ? 1 : 0,
    created_at: new Date().toISOString()
  };
  await saveAreaLocal(area, false);
  await addPendingOperation({ entity_type: 'support_ticket_area', operation: 'insert', payload: area });
  
  if (await isOnline().catch(() => false)) {
      importHelpdeskApi({ areas: [area] }).catch(console.error);
  }
  return area;
}

export async function deleteArea(areaId) {
  const db = await getDb();
  if (isMockDb()) {
    const current = db._storage.get('support_ticket_areas') || [];
    const updated = current.filter(x => String(x.id) !== String(areaId));
    db._storage.set('support_ticket_areas', updated);
  } else {
    await db.run('DELETE FROM support_ticket_areas WHERE id = ?', [areaId]);
  }
  
  await addPendingOperation({ entity_type: 'support_ticket_area', operation: 'delete', payload: { id: areaId } });
  if (await isOnline().catch(() => false)) {
    importHelpdeskApi({ delete_areas: [areaId] }).catch(console.warn);
  }
}

async function saveAreaLocal(a, synced = false) {
  const db = await getDb();
  if (isMockDb()) {
    const current = db._storage.get('support_ticket_areas') || [];
    const index = current.findIndex(x => x.id === a.id);
    const newObj = { ...a, synced: synced ? 1 : 0 };
    if (index >= 0) current[index] = newObj;
    else current.push(newObj);
    db._storage.set('support_ticket_areas', current);
  } else {
    await db.run(
      'INSERT OR REPLACE INTO support_ticket_areas (id, name, is_active, created_at, synced) VALUES (?, ?, ?, ?, ?)',
      [a.id, a.name, a.is_active, a.created_at || new Date().toISOString(), synced ? 1 : 0]
    );
  }
}

/**
 * TICKETS
 */
export async function fetchTickets(userId = null) {
  const online = await isOnline().catch(() => false);
  if (online) {
    try {
      const resp = await fetchHelpdeskApi(userId ? { user_id: userId } : {});
      if (resp && resp.tickets) {
        // Responses can be paginated or scoped to the current user. Merge the
        // returned records; absence from one response is not proof of deletion.
        for (const t of resp.tickets) { await saveTicketLocal(t, true); }
      }
      if (resp && resp.messages) {
        for (const m of resp.messages) { await saveMessageLocal(m, true); }
      }
    } catch (e) {
      console.warn('[helpdeskRepository] Failed to fetch tickets online:', e);
    }
  }

  const db = await getDb();
  let tickets = [];
  if (isMockDb()) {
    const all = db._storage.get('support_tickets') || [];
    tickets = userId ? all.filter(x => x.creator_id === userId || x.assigned_to === userId) : all;
  } else {
    if (userId) {
      const res = await db.query('SELECT * FROM support_tickets WHERE creator_id = ? OR assigned_to = ? ORDER BY created_at DESC', [userId, userId]);
      tickets = res.values || [];
    } else {
      const res = await db.query('SELECT * FROM support_tickets ORDER BY created_at DESC');
      tickets = res.values || [];
    }
  }
  return tickets;
}

export async function createTicket(ticketData) {
  const ticket = {
    id: uuidv4(),
    creator_id: ticketData.creator_id,
    creator_name: ticketData.creator_name,
    area_id: ticketData.area_id,
    area_name: ticketData.area_name,
    subject: ticketData.subject,
    description: ticketData.description,
    priority: ticketData.priority || 'MEDIA',
    status: 'OPEN',
    assigned_to: ticketData.assigned_to || null,
    image_url: ticketData.image_url || null,
    created_at: new Date().toISOString()
  };

  await saveTicketLocal(ticket, false);
  await addPendingOperation({ entity_type: 'support_ticket', operation: 'insert', payload: ticket });
  
  if (await isOnline().catch(() => false)) {
      importHelpdeskApi({ tickets: [ticket] }).catch(console.error);
  }
  return ticket;
}

export async function updateTicketStatus(ticketId, modifications) {
    // modifications is object like { status: 'CLOSED' } or { assigned_to: 'user_id' }
    const db = await getDb();
    let currentTicket = null;

    if (isMockDb()) {
        const all = db._storage.get('support_tickets') || [];
        currentTicket = all.find(x => x.id === ticketId);
    } else {
        const res = await db.query('SELECT * FROM support_tickets WHERE id = ?', [ticketId]);
        currentTicket = res.values?.[0] || null;
    }

    if (!currentTicket) throw new Error("Ticket no encontrado");

    const updatedTicket = { ...currentTicket, ...modifications };
    await saveTicketLocal(updatedTicket, false);
    await addPendingOperation({ entity_type: 'support_ticket', operation: 'update', payload: updatedTicket });

    if (await isOnline().catch(() => false)) {
        importHelpdeskApi({ tickets: [updatedTicket] }).catch(console.error);
    }

    return updatedTicket;
}

async function saveTicketLocal(t, synced = false) {
  const db = await getDb();
  if (isMockDb()) {
    const current = db._storage.get('support_tickets') || [];
    const index = current.findIndex(x => x.id === t.id);
    const newObj = { ...t, synced: synced ? 1 : 0 };
    if (index >= 0) current[index] = Object.assign(current[index], newObj); // Merge just in case
    else current.push(newObj);
    db._storage.set('support_tickets', current);
  } else {
    await db.run(
      `INSERT OR REPLACE INTO support_tickets 
      (id, creator_id, creator_name, area_id, area_name, subject, description, priority, status, assigned_to, image_url, created_at, synced) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [t.id, t.creator_id, t.creator_name, t.area_id, t.area_name, t.subject, t.description, t.priority, t.status, t.assigned_to, t.image_url, t.created_at || new Date().toISOString(), synced ? 1 : 0]
    );
  }
}

/**
 * MESSAGES
 */
export async function fetchMessages(ticketId) {
  const db = await getDb();
  let msgs = [];
  if (isMockDb()) {
    const all = db._storage.get('support_ticket_messages') || [];
    msgs = all.filter(x => x.ticket_id === ticketId);
  } else {
    const res = await db.query('SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC', [ticketId]);
    msgs = res.values || [];
  }
  return msgs.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function addMessage(ticketId, senderId, senderName, messageText, imageUrl = null) {
  const msg = {
    id: uuidv4(),
    ticket_id: ticketId,
    sender_id: senderId,
    sender_name: senderName,
    message: messageText,
    image_url: imageUrl,
    created_at: new Date().toISOString()
  };

  await saveMessageLocal(msg, false);
  await addPendingOperation({ entity_type: 'support_ticket_message', operation: 'insert', payload: msg });
  
  if (await isOnline().catch(() => false)) {
      importHelpdeskApi({ messages: [msg] }).catch(console.error);
  }
  return msg;
}

async function saveMessageLocal(m, synced = false) {
  const db = await getDb();
  if (isMockDb()) {
    const current = db._storage.get('support_ticket_messages') || [];
    const index = current.findIndex(x => x.id === m.id);
    const newObj = { ...m, synced: synced ? 1 : 0 };
    if (index >= 0) current[index] = newObj;
    else current.push(newObj);
    db._storage.set('support_ticket_messages', current);
  } else {
    await db.run(
      `INSERT OR REPLACE INTO support_ticket_messages 
      (id, ticket_id, sender_id, sender_name, message, image_url, created_at, synced) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.id, m.ticket_id, m.sender_id, m.sender_name, m.message, m.image_url, m.created_at || new Date().toISOString(), synced ? 1 : 0]
    );
  }
}
