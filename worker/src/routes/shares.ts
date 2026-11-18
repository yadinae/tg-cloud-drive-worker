import type { Hono } from 'hono';
import type { Env } from '../types';
import { createShare, listShares, listAllShares, updateShare, deleteShare, createFolderShare, listAllFolderShares, updateFolderShare, deleteFolderShare } from '../shares';

export function registerSharesRoutes(app: Hono<{ Bindings: Env }>): void {
// ───── Share Links ─────
app.post('/api/shares', async (c) => {
  const payload = await c.req.json();
  const result = await createShare(c.env, payload);
  if ('error' in result) return c.json(result, 400);
  const url = new URL(c.req.url);
  result.url = `${url.origin}/dl/${result.code}`;
  return c.json({ ok: true, ...result }, 201);
});

app.get('/api/shares', async (c) => {
  const fileId = c.req.query('fileId');
  if (!fileId) return c.json({ error: 'fileId query parameter required' }, 400);
  const shares = await listShares(c.env, Number(fileId));
  return c.json({ shares });
});

app.delete('/api/shares/:code', async (c) => {
  const code = c.req.param('code');
  const ok = await deleteShare(c.env, code);
  return c.json({ ok });
});

// GET /api/shares/list-all — list ALL shares across all files
app.get('/api/shares/list-all', async (c) => {
  c.header('Cache-Control', 'no-store');
  // 管理后台列表要显示/复制口令，返回明文口令（路由本身在 authMiddleware 之后，仅登录管理员可调）
  const shares = await listAllShares(c.env, 100, true);
  return c.json({ shares });
});

// PUT /api/shares/:code — update share (password, expiry)
app.put('/api/shares/:code', async (c) => {
  const code = c.req.param('code');
  const payload = await c.req.json();
  const result = await updateShare(c.env, code, payload);
  if (!result.ok) return c.json(result, 404);
  return c.json(result);
});

// ───── Folder Share Links (auth required) ─────

// POST /api/shares/folder — create folder share
app.post('/api/shares/folder', async (c) => {
  const payload = await c.req.json();
  const result = await createFolderShare(c.env, payload);
  if ('error' in result) return c.json(result, 400);
  const url = new URL(c.req.url);
  result.url = `${url.origin}/dl/f/${result.code}`;
  return c.json({ ok: true, ...result }, 201);
});

// GET /api/shares/folder/list-all — list ALL folder shares
app.get('/api/shares/folder/list-all', async (c) => {
  c.header('Cache-Control', 'no-store');
  // 管理后台列表要显示/复制口令，返回明文口令（路由本身在 authMiddleware 之后，仅登录管理员可调）
  const shares = await listAllFolderShares(c.env, 100, true);
  return c.json({ shares });
});

// DELETE /api/shares/folder/:code — revoke folder share
app.delete('/api/shares/folder/:code', async (c) => {
  const code = c.req.param('code');
  const ok = await deleteFolderShare(c.env, code);
  return c.json({ ok });
});

// PUT /api/shares/folder/:code — update folder share
app.put('/api/shares/folder/:code', async (c) => {
  const code = c.req.param('code');
  const payload = await c.req.json();
  const result = await updateFolderShare(c.env, code, payload);
  if (!result.ok) return c.json(result, 404);
  return c.json(result);
});
}
