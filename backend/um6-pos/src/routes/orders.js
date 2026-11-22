import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createOrderSchema, updateOrderStatusSchema } from '../lib/validators.js';
import { pool } from '../db/pool.js';
import { withTransaction } from '../db/transaction.js';
import { getStoreForUser, requireStoreByCode } from '../lib/store.js';

const router = Router();

router.use(authenticate);

router.get('/orders', async (req, res, next) => {
  try {
    const role = (req.user.role || '').toLowerCase();
    let store;
    if (role === 'um6') {
      store = await getStoreForUser(req.user);
    } else if (role === 'gerente' || role === 'admin' || role === 'administrador') {
      if (req.query.storeCode) {
        store = await requireStoreByCode(req.query.storeCode);
      }
    } else {
      return res.status(403).json({ message: 'No autorizado' });
    }

    const params = [];
    let sql = `SELECT o.id, o.store_id, s.code as store_code, o.status, o.suggested, o.notes, o.created_at, o.updated_at
                 FROM orders o
                 JOIN stores s ON s.id = o.store_id`;

    if (store) {
      sql += ' WHERE o.store_id = ?';
      params.push(store.id);
    }

    sql += ' ORDER BY o.created_at DESC LIMIT 100';

    const [rows] = await pool.execute(sql, params);

    const orderIds = rows.map((o) => o.id);
    let items = [];
    if (orderIds.length) {
      const [itemRows] = await pool.query(
        `SELECT oi.order_id, oi.product_id, p.name, oi.quantity
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id IN (?)`,
        [orderIds]
      );
      items = itemRows;
    }

    const grouped = rows.map((order) => ({
      ...order,
      items: items.filter((it) => it.order_id === order.id)
    }));

    return res.json(grouped);
  } catch (err) {
    return next(err);
  }
});

router.get('/orders/suggestions', requireRole('gerente', 'admin', 'administrador'), async (req, res, next) => {
  try {
    const code = (req.query.storeCode || '').trim();
    if (!code) {
      return res.status(400).json({ message: 'storeCode requerido' });
    }

    const store = await requireStoreByCode(code);
    const [rows] = await pool.execute(
      `SELECT p.id as product_id,
              p.name,
              p.sku,
              COALESCE(i.on_hand, 0) AS on_hand,
              i.max_level,
              i.min_level,
              GREATEST(COALESCE(i.max_level, 0) - COALESCE(i.on_hand, 0), 0) AS suggested_quantity
         FROM inventories i
         JOIN products p ON p.id = i.product_id
        WHERE i.store_id = ?
          AND i.max_level IS NOT NULL
          AND COALESCE(i.max_level, 0) > COALESCE(i.on_hand, 0)
        ORDER BY suggested_quantity DESC, p.name ASC`,
      [store.id]
    );

    return res.json({
      storeCode: store.code,
      items: rows.map((row) => ({
        productId: row.product_id,
        name: row.name,
        sku: row.sku,
        onHand: Number(row.on_hand || 0),
        maxLevel: row.max_level != null ? Number(row.max_level) : null,
        minLevel: row.min_level != null ? Number(row.min_level) : null,
        quantity: Number(row.suggested_quantity || 0)
      }))
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/orders', requireRole('gerente', 'admin', 'administrador'), async (req, res, next) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const store = await requireStoreByCode(parsed.data.storeCode);

    const orderId = await withTransaction(async (connection) => {
      const [orderResult] = await connection.execute(
        `INSERT INTO orders (store_id, status, suggested, notes, created_by)
         VALUES (?, 'IN_TRANSIT', ?, ?, ?)`,
        [store.id, parsed.data.suggested ? 1 : 0, parsed.data.notes || null, req.user.id]
      );

      const orderId = orderResult.insertId;

      const values = parsed.data.items.map((item) => [orderId, item.productId, item.quantity]);
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, quantity) VALUES ?',
        [values]
      );

      return orderId;
    });

    return res.status(201).json({ id: orderId });
  } catch (err) {
    return next(err);
  }
});

router.patch('/orders/:orderId/status', requireRole('gerente', 'admin', 'administrador'), async (req, res, next) => {
  try {
    const parsed = updateOrderStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const [result] = await pool.execute(
      'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [parsed.data.status, req.params.orderId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    return res.json({ message: 'Estatus actualizado' });
  } catch (err) {
    return next(err);
  }
});

router.post('/orders/:orderId/accept', requireRole('UM6'), async (req, res, next) => {
  try {
    const store = await getStoreForUser(req.user);

    await withTransaction(async (connection) => {
      const [orders] = await connection.execute(
        'SELECT id, store_id, status FROM orders WHERE id = ? FOR UPDATE',
        [req.params.orderId]
      );

      if (!orders.length) {
        const err = new Error('Pedido no encontrado');
        err.status = 404;
        throw err;
      }

      const order = orders[0];
      if (order.store_id !== store.id) {
        const err = new Error('No autorizado para este pedido');
        err.status = 403;
        throw err;
      }

      if (!['IN_TRANSIT', 'SENT'].includes(order.status)) {
        const err = new Error('El pedido no se puede aceptar en este estado');
        err.status = 400;
        throw err;
      }

      const [items] = await connection.execute(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
        [order.id]
      );

      for (const item of items) {
        await connection.execute(
          `INSERT INTO inventories (store_id, product_id, on_hand, reserved)
           VALUES (?, ?, 0, 0)
           ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)`,
          [store.id, item.product_id]
        );

        await connection.execute(
          `INSERT INTO inventory_movements (store_id, product_id, type, quantity, reference, created_by)
           VALUES (?, ?, 'ORDER_ACCEPT', ?, ?, ?)`,
          [store.id, item.product_id, item.quantity, `order#${order.id}`, req.user.id]
        );

        await connection.execute(
          `UPDATE inventories SET on_hand = on_hand + ? WHERE store_id = ? AND product_id = ?`,
          [item.quantity, store.id, item.product_id]
        );
      }

      await connection.execute(
        'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['RECEIVED', order.id]
      );
    });

    return res.json({ message: 'Pedido recibido' });
  } catch (err) {
    return next(err);
  }
});

export default router;
