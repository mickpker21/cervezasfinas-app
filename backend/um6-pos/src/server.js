import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import router from './routes/index.js';
import { env } from './config/env.js';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();

app.use(cors());
app.use(express.json());
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health'
    }
  })
);

app.use('/uploads', express.static(uploadsDir));
app.use(router);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Error interno';
  logger.error({ err, status }, 'Unhandled error');
  res.status(status).json({ message });
});

app.listen(env.PORT, () => {
  logger.info(`UM6 POS API escuchando en puerto ${env.PORT}`);
});
