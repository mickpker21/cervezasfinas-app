import { Router } from 'express';
import { pingDatabase } from '../db/pool.js';

const router = Router();

router.get('/health', async (req, res, next) => {
  try {
    await pingDatabase();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
