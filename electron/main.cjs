const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');

const PREFERRED_PORT = 45780;
const PRODUCTION_ORIGIN = 'https://cervezasfinas.com';

let mainWindow = null;
let activeBundleDir = null;
let serverPort = PREFERRED_PORT;

const crypto = require('crypto');

function getAppDataRoot() {
  return path.join(app.getPath('userData'), 'CervezasFinasData');
}

function getApiCacheDir() {
  const dir = path.join(getAppDataRoot(), 'api_http_cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getApiCacheFilePath(pathname, searchParams) {
  const cleanParams = new URLSearchParams(searchParams);
  cleanParams.delete('_t');
  cleanParams.delete('_v');
  cleanParams.sort();
  const normalizedKey = `${pathname}?${cleanParams.toString()}`;
  const hash = crypto.createHash('sha1').update(normalizedKey).digest('hex');
  return path.join(getApiCacheDir(), `${hash}.json`);
}

function getLocalDbDir() {
  const dir = path.join(getAppDataRoot(), 'local_db');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getOtaBundleDir() {
  return path.join(getAppDataRoot(), 'ota-bundle');
}

function getOtaMetaPath() {
  return path.join(getAppDataRoot(), 'ota-meta.json');
}

function getBuiltinDistDir() {
  return path.join(__dirname, '..', 'dist');
}

function resolveActiveBundleDir() {
  const otaDir = getOtaBundleDir();
  const otaIndex = path.join(otaDir, 'index.html');
  if (fs.existsSync(otaIndex)) {
    return otaDir;
  }
  return getBuiltinDistDir();
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

function startLocalServer() {
  activeBundleDir = resolveActiveBundleDir();
  const builtinDir = getBuiltinDistDir();

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Reverse proxy for /api/* -> https://cervezasfinas.com/api/* when online, with automatic disk cache fallback when offline
    if (pathname.startsWith('/api/')) {
      const targetUrl = new URL(pathname + parsedUrl.search, PRODUCTION_ORIGIN);
      const isGet = (req.method || 'GET').toUpperCase() === 'GET';
      const cacheFile = isGet ? getApiCacheFilePath(pathname, parsedUrl.searchParams) : null;

      const serveFromDiskCache = (reason) => {
        if (isGet && cacheFile && fs.existsSync(cacheFile)) {
          try {
            const cachedBuffer = fs.readFileSync(cacheFile);
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'X-Offline-Cache': 'HIT',
            });
            res.end(cachedBuffer);
            return true;
          } catch {}
        }
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, offline: true, error: reason || 'Offline' }));
        return false;
      };

      const proxyHeaders = { ...req.headers, host: targetUrl.host };
      delete proxyHeaders['accept-encoding']; // keep plain UTF-8 JSON for disk caching

      const proxyReq = https.request(
        targetUrl,
        {
          method: req.method,
          headers: proxyHeaders,
          timeout: 12000,
        },
        (proxyRes) => {
          const status = proxyRes.statusCode || 200;
          if (isGet && status === 200 && cacheFile) {
            const chunks = [];
            proxyRes.on('data', (chunk) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const fullBuf = Buffer.concat(chunks);
              try {
                // Only cache valid JSON responses
                const txt = fullBuf.toString('utf8');
                JSON.parse(txt);
                fs.writeFileSync(cacheFile, fullBuf);
              } catch {}
              res.writeHead(status, proxyRes.headers);
              res.end(fullBuf);
            });
            return;
          }
          if (isGet && status >= 500 && cacheFile && fs.existsSync(cacheFile)) {
            proxyRes.resume();
            serveFromDiskCache(`HTTP ${status}`);
            return;
          }
          res.writeHead(status, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on('timeout', () => {
        proxyReq.destroy(new Error('TIMEOUT'));
      });
      proxyReq.on('error', (err) => {
        serveFromDiskCache(err.message);
      });
      req.pipe(proxyReq);
      return;
    }

    // Serve static files from activeBundleDir, falling back to builtinDir for static assets omitted in slim OTA
    const safeRel = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
    let candidate = path.join(activeBundleDir, safeRel);
    if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      const builtinCandidate = path.join(builtinDir, safeRel);
      if (fs.existsSync(builtinCandidate) && !fs.statSync(builtinCandidate).isDirectory()) {
        candidate = builtinCandidate;
      } else {
        // SPA fallback to index.html
        candidate = path.join(activeBundleDir, 'index.html');
        if (!fs.existsSync(candidate)) {
          candidate = path.join(builtinDir, 'index.html');
        }
      }
    }

    try {
      const ext = path.extname(candidate).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      fs.createReadStream(candidate).pipe(res);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.on('error', () => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve(serverPort);
      });
    });
    server.listen(PREFERRED_PORT, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve(serverPort);
    });
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} al descargar OTA`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
    req.on('error', reject);
  });
}

function extractZipWindows(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetDir, { recursive: true });
    const psCmd = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath.replace(/'/g, "''")}', '${targetDir.replace(/'/g, "''")}')`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function registerIpcHandlers() {
  ipcMain.handle('ota:info', async () => {
    try {
      const metaPath = getOtaMetaPath();
      if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
    } catch {}
    return { version: app.getVersion() };
  });

  ipcMain.handle('ota:apply', async (_event, { url, version }) => {
    try {
      const root = getAppDataRoot();
      fs.mkdirSync(root, { recursive: true });
      const zipPath = path.join(root, `ota-${version || Date.now()}.zip`);
      const stagingDir = path.join(root, 'ota-staging');
      const finalOtaDir = getOtaBundleDir();

      await downloadFile(url, zipPath);
      await extractZipWindows(zipPath, stagingDir);

      const extractedIndex = path.join(stagingDir, 'index.html');
      if (!fs.existsSync(extractedIndex)) {
        throw new Error('El paquete OTA no contiene index.html en la raíz.');
      }

      if (fs.existsSync(finalOtaDir)) {
        fs.rmSync(finalOtaDir, { recursive: true, force: true });
      }
      fs.renameSync(stagingDir, finalOtaDir);
      try { fs.unlinkSync(zipPath); } catch {}

      fs.writeFileSync(
        getOtaMetaPath(),
        JSON.stringify({ version, updatedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );

      activeBundleDir = finalOtaDir;
      return { success: true, version };
    } catch (err) {
      console.error('[OTA-PC] Error aplicando OTA:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ota:reload', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      activeBundleDir = resolveActiveBundleDir();
      mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
    }
    return { success: true };
  });

  ipcMain.handle('db:loadAll', async () => {
    const dir = getLocalDbDir();
    const out = {};
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const tableName = file.slice(0, -5);
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf8');
          out[tableName] = JSON.parse(raw);
        } catch {}
      }
    } catch {}
    return out;
  });

  ipcMain.handle('db:saveTable', async (_event, { tableName, data }) => {
    if (!tableName) return { success: false };
    try {
      const safeName = String(tableName).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(getLocalDbDir(), `${safeName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data ?? []), 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

async function createWindow() {
  const port = await startLocalServer();
  const iconCandidates = [
    path.join(__dirname, 'icon.ico'),
    path.join(getBuiltinDistDir(), 'logo6.png'),
    path.join(getBuiltinDistDir(), 'logo.png'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'Cervezas Finas CRM',
    icon: iconPath || undefined,
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://wa.me') || url.startsWith('https://api.whatsapp.com') || url.startsWith('tel:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
