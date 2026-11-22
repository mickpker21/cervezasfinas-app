import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticate, requireRole } from '../middleware/auth.js';
import { planogramCreateSchema } from '../lib/validators.js';
import { requireStoreByCode, getStoreForUser } from '../lib/store.js';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';

const router = Router();

router.use(authenticate);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '..', '..', 'uploads', 'planograms');
fs.mkdirSync(uploadsRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsRoot),
  filename: (req, file, cb) => {
    const safeCode = String(req.body.storeCode || 'planogram')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '') || 'planogram';
    const ext = path.extname(file.originalname?.toLowerCase() || '') || mimeToExtension(file.mimetype);
    cb(null, `${safeCode}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype?.startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new Error('Formato de archivo no permitido'));
  }
});

const maybeUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return upload.single('file')(req, res, next);
  }
  return next();
};

function mimeToExtension(mime = '') {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '.bin';
  }
}

function buildFileUrl(req, filename) {
  const baseUrl = env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/planograms/${filename}`;
}

function cleanupUploadedFile(file) {
  if (file?.path) {
    fs.unlink(file.path, () => {});
  }
}

router.get('/planograms/me', requireRole('UM6'), async (req, res, next) => {
  try {
    const store = await getStoreForUser(req.user);
    const [rows] = await pool.execute(
      `SELECT id, file_url, version, uploaded_by, uploaded_at
         FROM planograms
        WHERE store_id = ?
        ORDER BY version DESC, uploaded_at DESC
        LIMIT 1`,
      [store.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Sin planograma asignado' });
    }

    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.get('/planograms', requireRole('gerente'), async (req, res, next) => {
  try {
    let filterSql = '';
    const params = [];
    if (req.query.storeCode) {
      const store = await requireStoreByCode(req.query.storeCode);
      filterSql = 'WHERE p.store_id = ?';
      params.push(store.id);
    }

    const [rows] = await pool.execute(
      `SELECT p.id, s.code as store_code, p.file_url, p.version, p.uploaded_at
         FROM planograms p
         JOIN stores s ON s.id = p.store_id
        ${filterSql}
        ORDER BY p.uploaded_at DESC
        LIMIT 100`,
      params
    );

    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post('/planograms', requireRole('gerente'), maybeUpload, async (req, res, next) => {
  try {
    const normalizedStoreCode = String(req.body.storeCode || '').trim().toUpperCase();
    const rawVersion = String(req.body.version || '').trim();
    const versionValue = rawVersion ? Number(rawVersion) : undefined;
    const payload = {
      storeCode: normalizedStoreCode,
      version: versionValue,
      fileUrl: req.file ? buildFileUrl(req, req.file.filename) : req.body.fileUrl?.trim()
    };

    const parsed = planogramCreateSchema.safeParse(payload);
    if (!parsed.success) {
      cleanupUploadedFile(req.file);
      return res.status(400).json(parsed.error.flatten());
    }

    const store = await requireStoreByCode(parsed.data.storeCode);

    const [result] = await pool.execute(
      `INSERT INTO planograms (store_id, file_url, version, uploaded_by)
       VALUES (?, ?, COALESCE(?, (
         SELECT COALESCE(MAX(version),0) + 1 FROM planograms WHERE store_id = ?
       )), ?)`,
      [store.id, parsed.data.fileUrl, parsed.data.version || null, store.id, req.user.id]
    );

    return res.status(201).json({ id: result.insertId, fileUrl: parsed.data.fileUrl });
  } catch (err) {
    cleanupUploadedFile(req.file);
    return next(err);
  }
});

export default router;
