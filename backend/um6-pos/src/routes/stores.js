import { Router } from 'express';
import { pool } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getStoreForUser, requireStoreByCode } from '../lib/store.js';
import { withTransaction } from '../db/transaction.js';
import { inventoryLevelsSchema } from '../lib/validators.js';

const router = Router();

router.use(authenticate);

router.get('/stores', requireRole('gerente', 'admin', 'administrador'), async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim().toLowerCase();
    let sql = `SELECT id, code, name, address, max_capacity, min_capacity, manager_email
                 FROM stores`;
    const params = [];
    if (search) {
      sql += ' WHERE LOWER(code) LIKE ? OR LOWER(name) LIKE ?';
      const like = `%${search}%`;
      params.push(like, like);
    }
    sql += ' ORDER BY name ASC';

    const [rows] = await pool.execute(sql, params);
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.get('/stores/me', requireRole('UM6', 'gerente'), async (req, res, next) => {
  try {
    const store = await getStoreForUser(req.user, req.query.storeCode);
    const [rows] = await pool.execute(
      'SELECT id, code, name, address, max_capacity, min_capacity, manager_email FROM stores WHERE id = ? LIMIT 1',
      [store.id]
    );
    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.get('/stores/me/inventory', requireRole('UM6', 'gerente'), async (req, res, next) => {
  try {
    const store = await getStoreForUser(req.user, req.query.storeCode);

    const [inventoryRows] = await pool.execute(
      `SELECT p.id as product_id,
              p.sku,
              p.name,
              i.on_hand,
              i.reserved,
              i.max_level,
              i.min_level
         FROM inventories i
         JOIN products p ON p.id = i.product_id
        WHERE i.store_id = ?
        ORDER BY p.name ASC`,
      [store.id]
    );

    return res.json({ storeId: store.id, items: inventoryRows });
  } catch (err) {
    return next(err);
  }
});

router.patch('/stores/inventory-levels', requireRole('gerente', 'admin', 'administrador'), async (req, res, next) => {
  try {
    const parsed = inventoryLevelsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const store = await requireStoreByCode(parsed.data.storeCode);

    await withTransaction(async (connection) => {
      for (const item of parsed.data.items) {
        await connection.execute(
          `INSERT INTO inventories (store_id, product_id, on_hand, reserved, max_level, min_level)
           VALUES (?, ?, 0, 0, ?, ?)
           ON DUPLICATE KEY UPDATE
             max_level = VALUES(max_level),
             min_level = VALUES(min_level)`,
          [store.id, item.productId, item.maxLevel ?? null, item.minLevel ?? null]
        );
      }
    });

    return res.json({ message: 'Niveles actualizados' });
  } catch (err) {
    return next(err);
  }
});

export default router;
