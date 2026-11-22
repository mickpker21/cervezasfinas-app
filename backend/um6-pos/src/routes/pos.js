import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { salesSchema, movementSchema } from '../lib/validators.js';
import { getStoreForUser } from '../lib/store.js';
import { withTransaction } from '../db/transaction.js';
import { pool } from '../db/pool.js';

const router = Router();

router.use(authenticate);

async function upsertInventory(connection, storeId, productId) {
  await connection.execute(
    `INSERT INTO inventories (store_id, product_id, on_hand, reserved)
     VALUES (?, ?, 0, 0)
     ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)`,
    [storeId, productId]
  );
}

async function registerMovement(connection, { storeId, productId, type, quantity, reference, userId }) {
  await connection.execute(
    `INSERT INTO inventory_movements (store_id, product_id, type, quantity, reference, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [storeId, productId, type, quantity, reference || null, userId]
  );
}

async function updateInventory(connection, storeId, productId, delta) {
  await connection.execute(
    `UPDATE inventories
        SET on_hand = on_hand + ?
      WHERE store_id = ? AND product_id = ?`,
    [delta, storeId, productId]
  );
}

router.post('/pos/sales', requireRole('UM6'), async (req, res, next) => {
  try {
    const parsed = salesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const store = await getStoreForUser(req.user);

    await withTransaction(async (connection) => {
      for (const item of parsed.data.items) {
        await upsertInventory(connection, store.id, item.productId);
        await registerMovement(connection, {
          storeId: store.id,
          productId: item.productId,
          type: 'SALE',
          quantity: item.quantity,
          reference: parsed.data.reference,
          userId: req.user.id
        });
        await updateInventory(connection, store.id, item.productId, -item.quantity);
      }
    });

    return res.status(201).json({ message: 'Venta registrada' });
  } catch (err) {
    return next(err);
  }
});

router.post('/pos/movements', requireRole('gerente', 'admin', 'administrador'), async (req, res, next) => {
  try {
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    if (!parsed.data.storeCode) {
      return res.status(400).json({ message: 'storeCode es requerido' });
    }

    const store = await getStoreForUser(req.user, parsed.data.storeCode);
    const sign = parsed.data.type === 'STOCK_OUT' ? -1 : 1;

    await withTransaction(async (connection) => {
      for (const item of parsed.data.items) {
        await upsertInventory(connection, store.id, item.productId);
        await registerMovement(connection, {
          storeId: store.id,
          productId: item.productId,
          type: parsed.data.type,
          quantity: item.quantity,
          reference: parsed.data.reference,
          userId: req.user.id
        });
        await updateInventory(connection, store.id, item.productId, sign * item.quantity);
      }
    });

    return res.status(201).json({ message: 'Movimiento registrado' });
  } catch (err) {
    return next(err);
  }
});

router.get('/pos/sales/summary', requireRole('UM6'), async (req, res, next) => {
  try {
    const store = await getStoreForUser(req.user);

    const [totalsRows] = await pool.execute(
      `SELECT
         COALESCE(SUM(quantity), 0) AS total_units,
         COUNT(*) AS line_items,
         COUNT(DISTINCT COALESCE(NULLIF(reference, ''), CAST(id AS CHAR))) AS tickets
       FROM inventory_movements
      WHERE store_id = ?
        AND type = 'SALE'
        AND DATE(created_at) = CURRENT_DATE`,
      [store.id]
    );

    const [productsRows] = await pool.execute(
      `SELECT p.id, p.name, p.sku, COALESCE(SUM(m.quantity), 0) AS total_units
         FROM inventory_movements m
         JOIN products p ON p.id = m.product_id
        WHERE m.store_id = ?
          AND m.type = 'SALE'
          AND DATE(m.created_at) = CURRENT_DATE
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_units DESC
        LIMIT 5`,
      [store.id]
    );

    const summary = totalsRows[0] || { total_units: 0, line_items: 0, tickets: 0 };

    return res.json({
      totals: {
        units: Number(summary.total_units || 0),
        lineItems: Number(summary.line_items || 0),
        tickets: Number(summary.tickets || 0)
      },
      topProducts: productsRows.map((row) => ({
        productId: row.id,
        name: row.name,
        sku: row.sku,
        units: Number(row.total_units || 0)
      }))
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
