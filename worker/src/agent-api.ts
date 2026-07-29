import { Hono } from 'hono';
import type { Env } from './types';
import { getStats, searchFiles, listFilesPaginated, getFile, listTopics } from './metadata';
import { createShare, listAllShares, updateShare, deleteShare } from './shares';
import { uploadCompleteFile } from './storage';
import { deleteFileMessages } from './bot';

// ───── Agent API ─────
// Used by Hermes Agent to orchestrate between edge-key, TG cloud drive, and Hexo blog.
// Authentication: Bearer token matching AGENT_API_TOKEN env variable.

const app = new Hono<{ Bindings: Env }>();

// ───── Agent Auth Middleware ─────
app.use('*', async (c, next) => {
  const token = c.req.header('Authorization') || '';
  const expected = c.env.AGENT_API_TOKEN;
  if (!expected) {
    return c.json({ error: 'AGENT_API_TOKEN not configured on server' }, 503);
  }
  if (token !== `Bearer ${expected}`) {
    return c.json({ error: 'Invalid agent token' }, 401);
  }
  await next();
});

// ───── GET /api/agent/status — Agent API health check + basic info ─────
app.get('/status', async (c) => {
  const stats = await getStats(c.env);
  return c.json({
    ok: true,
    service: 'tg-cloud-drive',
    stats,
  });
});

// ───── GET /api/agent/stats — detailed statistics ─────
app.get('/stats', async (c) => {
  const stats = await getStats(c.env);

  // Share counts
  let shareCount = 0;
  let folderShareCount = 0;
  try {
    const shares = await listAllShares(c.env);
    shareCount = shares.length;
  } catch { /* ignore */ }
  try {
    const { listAllFolderShares } = await import('./shares');
    const folderShares = await listAllFolderShares(c.env);
    folderShareCount = folderShares.length;
  } catch { /* ignore */ }

  return c.json({
    ...stats,
    shareCount,
    folderShareCount,
  });
});

// ───── GET /api/agent/files — list or search files ─────
// Query params:
//   q=keyword    — search by name
//   topicId=123  — filter by topic
//   folderId=456 — filter by folder
//   page=1, pageSize=50 — pagination
app.get('/files', async (c) => {
  const query = c.req.query('q');

  if (query) {
    const files = await searchFiles(c.env, query);
    return c.json({ files, total: files.length });
  }

  const topicId = Number(c.req.query('topicId'));
  if (!topicId) {
    return c.json({ error: 'topicId required' }, 400);
  }
  const folderId = c.req.query('folderId') ? Number(c.req.query('folderId')) : null;
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const result = await listFilesPaginated(c.env, topicId, folderId, page, pageSize);
  return c.json(result);
});

// ───── GET /api/agent/files/:id — single file details ─────
app.get('/files/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const file = await getFile(c.env, id);
  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }
  return c.json({ file });
});

// ───── GET /api/agent/topics — list all topics (with file count) ─────
app.get('/topics', async (c) => {
  const topics = await listTopics(c.env);
  // Enrich with file counts
  const enriched = await Promise.all(topics.map(async (t) => {
    try {
      const row = await c.env.DB.prepare(
        'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM files WHERE topic_id = ?'
      ).bind(t.topicId).first<{ count: number; total_size: number }>();
      return {
        ...t,
        fileCount: row?.count ?? 0,
        totalSize: row?.total_size ?? 0,
      };
    } catch {
      return { ...t, fileCount: 0, totalSize: 0 };
    }
  }));
  return c.json({ topics: enriched });
});

// ───── GET /api/agent/shares — list all shares ─────
app.get('/shares', async (c) => {
  const [fileShares, folderShares] = await Promise.all([
    listAllShares(c.env),
    import('./shares').then(m => m.listAllFolderShares(c.env)).catch(() => [] as any[]),
  ]);
  return c.json({
    shares: fileShares,
    folderShares,
    total: fileShares.length + folderShares.length,
  });
});

// ───── POST /api/agent/shares — create a share link ─────
app.post('/shares', async (c) => {
  const payload = await c.req.json<{
    fileId: number;
    password?: string;
    expiresIn?: number;
  }>();
  if (!payload.fileId) {
    return c.json({ error: 'fileId required' }, 400);
  }
  const result = await createShare(c.env, payload);
  if ('error' in result) {
    return c.json(result, 400);
  }
  const url = new URL(c.req.url);
  result.url = `${url.origin}/dl/${result.code}`;
  return c.json({ ok: true, ...result }, 201);
});

// ───── PUT /api/agent/shares/:code — update share ─────
app.put('/shares/:code', async (c) => {
  const code = c.req.param('code');
  const payload = await c.req.json<{
    password?: string;
    expiresIn?: number;
  }>();
  const result = await updateShare(c.env, code, payload);
  if (!result.ok) return c.json(result, 404);
  return c.json(result);
});

// ───── DELETE /api/agent/shares/:code — delete/revoke share ─────
app.delete('/shares/:code', async (c) => {
  const code = c.req.param('code');
  const ok = await deleteShare(c.env, code);
  return c.json({ ok });
});

// ───── GET /api/agent/ads — get current ad configuration ─────
app.get('/ads', async (c) => {
  const { DB } = c.env;
  const rows = await DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'ads.%'").all<{key: string; value: string}>();
  const map: Record<string, string> = {};
  for (const r of rows.results) map[r.key] = r.value;
  let products: any[] = [];
  try { products = JSON.parse(map['ads.products'] || '[]'); } catch {}
  return c.json({
    enabled: map['ads.enabled'] === 'true',
    shopName: map['ads.shop_name'] || '我们的商城',
    shopUrl: map['ads.shop_url'] || 'https://www.isoho168.top',
    products,
  });
});

// ───── PUT /api/agent/ads — update ad configuration ─────
app.put('/ads', async (c) => {
  const body = await c.req.json<{
    enabled?: boolean;
    shopName?: string;
    shopUrl?: string;
    products?: Array<{ name: string; price: string; url: string; image?: string }>;
  }>();
  const { DB } = c.env;
  const now = Math.floor(Date.now() / 1000);
  const updates: [string, string][] = [];
  if (body.enabled !== undefined) updates.push(['ads.enabled', body.enabled ? 'true' : 'false']);
  if (body.shopName !== undefined) updates.push(['ads.shop_name', body.shopName]);
  if (body.shopUrl !== undefined) updates.push(['ads.shop_url', body.shopUrl]);
  if (body.products !== undefined) updates.push(['ads.products', JSON.stringify(body.products)]);
  for (const [key, value] of updates) {
    await DB.prepare('INSERT OR REPLACE INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)')
      .bind(key, value, '商城广告配置', now).run();
  }
  return c.json({ ok: true });
});

// ───── POST /api/agent/upload — upload file (image, doc, etc.) ─────
app.post('/upload', async (c) => {
  const contentType = c.req.header('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'multipart/form-data required' }, 400);
  }
  const formData = await c.req.formData();
  const fileEntry = formData.get('file') as File | null;
  if (!fileEntry) {
    return c.json({ error: 'file field required' }, 400);
  }
  const topicId = Number(formData.get('topicId')) || 20;
  
  // 自动删除同话题下的同名旧文件
  const fileName = fileEntry.name;
  try {
    const existing = await listFilesPaginated(c.env, topicId, null, 1, 200);
    for (const f of existing.files || []) {
      if (f.name === fileName) {
        const oldFile = await getFile(c.env, f.id);
        if (oldFile) {
          await deleteFileMessages(c.env, oldFile.manifest);
          await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(f.id).run();
        }
      }
    }
  } catch { /* 清理失败不影响上传 */ }
  
  const mimeType = fileEntry.type || 'application/octet-stream';
  const buffer = await fileEntry.arrayBuffer();
  const result = await uploadCompleteFile(c.env, topicId, fileEntry.name, mimeType, buffer);
  if (!result.fileId) {
    return c.json({ error: 'Upload failed' }, 500);
  }
  // Auto-create a share so the file is publicly accessible
  const { createShare } = await import('./shares');
  const share = await createShare(c.env, { fileId: result.fileId, password: '' });
  const url = new URL(c.req.url);
  const shareCode = (share as any).code || result.fileId;
  const isImage = mimeType.startsWith('image/');
  return c.json({
    ok: true,
    fileId: result.fileId,
    name: fileEntry.name,
    mimeType,
    url: `${url.origin}/dl/${shareCode}`,
    rawUrl: `${url.origin}/dl/${shareCode}/raw`,
    imgUrl: isImage ? `${url.origin}/img/${shareCode}/${result.fileId}` : undefined,
  }, 201);
});

// ───── DELETE /api/agent/files/:id — delete a file ─────
app.delete('/files/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'id required' }, 400);
  const { getFile, deleteFile } = await import('./metadata');
  const file = await getFile(c.env, id);
  if (!file) return c.json({ error: 'File not found' }, 404);
  const deleted = await deleteFileMessages(c.env, file.manifest);
  await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
  return c.json({ ok: true, deleted, fileId: id });
});

export default app;
