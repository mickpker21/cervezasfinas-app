import { Router } from 'express';
import healthRouter from './health.js';
import storesRouter from './stores.js';
import posRouter from './pos.js';
import ordersRouter from './orders.js';
import planogramsRouter from './planograms.js';

const router = Router();

router.use(healthRouter);
router.use('/api', storesRouter);
router.use('/api', posRouter);
router.use('/api', ordersRouter);
router.use('/api', planogramsRouter);

export default router;
