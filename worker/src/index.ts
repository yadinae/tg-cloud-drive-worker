import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import type { Env, UploadProgress } from './types';
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  listFiles,
  getFile,
  renameFile,
  deleteFile as deleteFileMeta,
  searchFiles,
  getStats,
} from './metadata';
import { uploadCompleteFile, downloadFileStream, getShareDownloadUrl } from './storage';
import {
  createShare,
  getShare,
  verifySharePassword,
  listShares,
  deleteShare,
} from './shares';
import { verifyBotConnection } from './bot';

const app = new Hono<{ Bindings: Env }>();

// ───── CORS (allow frontend on any domain) ─────
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'Content-Disposition', 'Accept-Ranges'],
}));

// ───── Auth middleware ─────
async function authMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = authHeader.slice(7);
  if (token !== c.env.DRIVE_AUTH_TOKEN) {
    return c.json({ error: 'Invalid auth token' }, 403);
  }
  await next();
}

// ───── Static: Serve frontend build files ─────
// (Frontend is deployed to Cloudflare Pages separately,
//  but the Worker can also serve a simple status page)
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TG Cloud Drive Worker</title>
  <style>
    body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#1e293b;border-radius:12px;padding:2rem;max-width:480px;text-align:center}
    h1{color:#38bdf8;margin:0 0 .5rem}
    p{color:#94a3b8;margin:.5rem 0}
    .status{display:inline-block;margin-top:1rem;padding:.5rem 1rem;border-radius:8px;background:#334155;color:#e2e8f0}
  </style>
</head>
<body>
  <div class="card">
    <h1>☁️ TG Cloud Drive Worker</h1>
    <p>Telegram Bot API based storage — running on Cloudflare Workers</p>
    <div class="status" id="status">Checking API status...</div>
  </div>
  <script>
    fetch('/api/health').then(r=>r.json()).then(d=>{
      document.getElementById('status').textContent = d.ok ? '✅ ' + d.message : '❌ ' + d.message;
    }).catch(()=>{
      document.getElementById('status').textContent = '❌ API not reachable';
    });
  </script>
</body>
</html>`);
});

// ───── Health ─────
app.get('/api/health', async (c) => {
  const botStatus = await verifyBotConnection(c.env);
  return c.json({ ok: botStatus.ok, message: botStatus.message });
});

// ───── All routes below require auth ─────
app.use('/api/*', authMiddleware);

// ───── Stats ─────
app.get('/api/stats', async (c) => {
  const stats = await getStats(c.env);
  return c.json(stats);
});

// ───── Folders ─────
app.get('/api/folders', async (c) => {
  const parentId = c.req.query('parentId') ? Number(c.req.query('parentId')) : null;
  const folders = await listFolders(c.env, parentId);
  return c.json({ folders });
});

app.post('/api/folders', async (c) => {
  const { name, parentId } = await c.req.json();
  if (!name || !name.trim()) {
    return c.json({ error: 'Folder name is required' }, 400);
  }
  const folder = await createFolder(c.env, name.trim(), parentId ?? null);
  return c.json({ ok: true, folder }, 201);
});

app.put('/api/folders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { name } = await c.req.json();
  if (!name || !name.trim()) {
    return c.json({ error: 'Folder name is required' }, 400);
  }
  const ok = await renameFolder(c.env, id, name.trim());
  return c.json({ ok });
});

app.delete('/api/folders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const ok = await deleteFolder(c.env, id);
  return c.json({ ok });
});

// ───── Files ─────
app.get('/api/files', async (c) => {
  const folderId = c.req.query('folderId');
  const query = c.req.query('q');

  if (query) {
    const files = await searchFiles(c.env, query);
    return c.json({ files });
  }

  if (!folderId) {
    return c.json({ error: 'folderId query parameter required' }, 400);
  }
  const files = await listFiles(c.env, Number(folderId));
  return c.json({ files });
});

app.post('/api/files/upload', async (c) => {
  // Accept both multipart form data and JSON with base64
  const contentType = c.req.header('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const fileEntry = formData.get('file') as File | null;
    const folderId = Number(formData.get('folderId'));
    const mimeType = (formData.get('mimeType') as string) || fileEntry?.type || 'application/octet-stream';

    if (!fileEntry || !folderId) {
      return c.json({ error: 'file and folderId are required' }, 400);
    }

    const buffer = await fileEntry.arrayBuffer();
    const result = await uploadCompleteFile(c.env, folderId, fileEntry.name, mimeType, buffer);
    return c.json({ ok: true, ...result }, 201);
  }

  // JSON mode: base64-encoded file data (for smaller files or programmatic use)
  const { folderId, name, data, mimeType } = await c.req.json();
  if (!folderId || !name || !data) {
    return c.json({ error: 'folderId, name, and data are required' }, 400);
  }

  const binaryStr = atob(data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const buffer = bytes.buffer;

  const result = await uploadCompleteFile(c.env, folderId, name, mimeType || 'application/octet-stream', buffer);
  return c.json({ ok: true, ...result }, 201);
});

app.put('/api/files/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { name } = await c.req.json();
  if (!name || !name.trim()) {
    return c.json({ error: 'File name is required' }, 400);
  }
  const ok = await renameFile(c.env, id, name.trim());
  return c.json({ ok });
});

app.delete('/api/files/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const ok = await deleteFileMeta(c.env, id);
  return c.json({ ok });
});

// ───── File Download ─────
app.get('/api/files/:id/download', async (c) => {
  const id = Number(c.req.param('id'));
  const range = c.req.header('Range');
  return downloadFileStream(c.env, id, range);
});

// ───── Share Links ─────
app.post('/api/shares', async (c) => {
  const payload = await c.req.json();
  const result = await createShare(c.env, payload);

  if ('error' in result) {
    return c.json(result, 400);
  }

  // Fill in the URL with the actual worker URL
  const url = new URL(c.req.url);
  result.url = `${url.origin}/dl/${result.code}`;

  return c.json({ ok: true, ...result }, 201);
});

app.get('/api/shares', async (c) => {
  const fileId = c.req.query('fileId');
  if (!fileId) {
    return c.json({ error: 'fileId query parameter required' }, 400);
  }
  const shares = await listShares(c.env, Number(fileId));
  return c.json({ shares });
});

app.delete('/api/shares/:code', async (c) => {
  const code = c.req.param('code');
  const ok = await deleteShare(c.env, code);
  return c.json({ ok });
});

app.post('/api/shares/verify', async (c) => {
  const { code, password } = await c.req.json();
  if (!code) {
    return c.json({ error: 'code required' }, 400);
  }
  const result = await verifySharePassword(code, password || '', c.env);
  return c.json(result);
});

// ───── Public: Share Download ─────
app.get('/dl/:code', async (c) => {
  const code = c.req.param('code');
  const shareInfo = await getShare(code, c.env);

  if (!shareInfo.ok) {
    return c.html(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Share Link</title>
<style>body{background:#0f172a;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#1e293b;border-radius:12px;padding:2rem;max-width:400px;text-align:center}
.error{color:#f87171}</style></head>
<body><div class="card"><h1 class="error">❌ ${shareInfo.error}</h1></div></body>
</html>`);
  }

  const share = shareInfo.share!;

  // If password protected, show password form
  if (share.hasPassword) {
    return c.html(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download — ${share.fileName}</title>
  <style>
    *{box-sizing:border-box;margin:0}
    body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}
    .card{background:#1e293b;border-radius:12px;padding:2rem;width:100%;max-width:420px}
    h1{color:#38bdf8;font-size:1.25rem;margin-bottom:.25rem}
    .meta{color:#94a3b8;font-size:.875rem;margin-bottom:1.5rem}
    label{display:block;color:#94a3b8;font-size:.875rem;margin-bottom:.5rem}
    input[type=password]{width:100%;padding:.75rem;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem;outline:none}
    input[type=password]:focus{border-color:#38bdf8}
    button{width:100%;margin-top:1rem;padding:.75rem;border-radius:8px;border:none;background:#38bdf8;color:#0f172a;font-size:1rem;font-weight:600;cursor:pointer}
    button:hover{background:#7dd3fc}
    .error{color:#f87171;font-size:.875rem;margin-top:.5rem;display:none}
  </style>
</head>
<body>
  <div class="card">
    <h1>📁 ${share.fileName}</h1>
    <div class="meta">${formatBytes(share.fileSize)}</div>
    <label for="pwd">This file is password protected</label>
    <input type="password" id="pwd" placeholder="Enter password" autocomplete="off">
    <div class="error" id="error"></div>
    <button onclick="download()">Download</button>
  </div>
  <script>
    async function download() {
      const pwd = document.getElementById('pwd').value;
      const err = document.getElementById('error');
      err.style.display = 'none';
      try {
        const res = await fetch('/api/shares/verify', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ code: '${code}', password: pwd })
        });
        const data = await res.json();
        if (data.ok && data.downloadUrl) {
          window.location.href = data.downloadUrl;
        } else if (data.ok) {
          // Proxy download through worker
          window.location.href = '/dl/${code}/raw';
        } else {
          err.textContent = data.error || 'Invalid password';
          err.style.display = 'block';
        }
      } catch(e) {
        err.textContent = 'Network error';
        err.style.display = 'block';
      }
    }
  </script>
</body>
</html>`);
  }

  // No password — direct download
  return c.redirect(`/dl/${code}/raw`);
});

// Raw download endpoint (proxy through Worker)
app.get('/dl/:code/raw', async (c) => {
  const code = c.req.param('code');
  const shareInfo = await getShare(code, c.env);

  if (!shareInfo.ok) {
    return c.json({ error: shareInfo.error }, 404);
  }

  const share = shareInfo.share!;
  return downloadFileStream(c.env, share.fileId, c.req.header('Range'));
});

// ───── 404 ─────
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// ───── Error handler ─────
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

export default app;

// ───── Helper ─────
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
