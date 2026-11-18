import type { Hono } from 'hono';
import type { Env } from '../types';
import { getStats } from '../metadata';
import { verifySharePassword, verifyFolderSharePassword } from '../shares';
import { verifyBotConnection } from '../bot';
import { FRONTEND_HTML, FRONTEND_JS_CONTENT } from '../frontend-assets';
import { apiIndex, openApiSpec } from '../openapi';
import { getClientIp } from '../rate-limit';
import { ensureSchema } from '../schema';

export function registerPublicRoutes(app: Hono<{ Bindings: Env }>): void {
// ───── Static: Serve frontend SPA ─────
app.get('/', (c) => c.html(FRONTEND_HTML));
app.get('/assets/*', (c) => {
  if (c.req.path.endsWith('.js')) {
    c.header('Content-Type', 'application/javascript; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    return c.body(FRONTEND_JS_CONTENT);
  }
  return c.html(FRONTEND_HTML);
});

// ───── Health ─────
app.get('/api/health', async (c) => {
  const botStatus = await verifyBotConnection(c.env);
  // Ensure D1 schema is up to date (idempotent)
  await ensureSchema(c.env);
  return c.json({ ok: botStatus.ok, message: botStatus.message });
});

// ───── Stats (public) ─────
app.get('/api/stats', async (c) => {
  const stats = await getStats(c.env);
  return c.json(stats);
});

// ───── Share Verify (public) ─────
app.post('/api/shares/verify', async (c) => {
  const { code, password } = await c.req.json();
  if (!code) return c.json({ error: 'code required' }, 400);
  const result = await verifySharePassword(code, password || '', c.env, getClientIp(c));
  if (result.rateLimited) {
    return c.json({ error: result.error }, 429, { 'Retry-After': String(result.retryAfterSeconds ?? 60) });
  }
  return c.json(result);
});

// ───── Folder Share Verify (public) ─────
app.post('/api/shares/folder/verify', async (c) => {
  const { code, password } = await c.req.json();
  if (!code) return c.json({ error: 'code required' }, 400);
  const result = await verifyFolderSharePassword(code, password || '', c.env, getClientIp(c));
  if (result.rateLimited) {
    return c.json({ error: result.error }, 429, { 'Retry-After': String(result.retryAfterSeconds ?? 60) });
  }
  return c.json(result);
});
}

export function registerApiDiscoveryRoutes(app: Hono<{ Bindings: Env }>): void {
// ───── API Discovery (public — must be registered before authMiddleware) ─────
app.get('/api', (c) => c.json(apiIndex(new URL(c.req.url))));
app.get('/api/openapi.json', (c) => c.json(openApiSpec(new URL(c.req.url).origin)));
}
