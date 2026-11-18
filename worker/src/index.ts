import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { FRONTEND_HTML } from './frontend-assets';
import agentApi from './agent-api';
import { ensureSchema } from './schema';
import { authMiddleware } from './auth';
import { cleanupAllOrphanUploads } from './storage';
import { registerPublicRoutes, registerApiDiscoveryRoutes } from './routes/public';
import { registerPublicAuthRoutes, registerAuthedAuthRoutes } from './routes/auth';
import { registerConfigRoutes } from './routes/config';
import { registerTopicsRoutes } from './routes/topics';
import { registerFilesRoutes } from './routes/files';
import { registerSharesRoutes } from './routes/shares';
import { registerAdminRoutes } from './routes/admin';
import { registerPublicDlRoutes } from './routes/public-dl';

const app = new Hono<{ Bindings: Env }>();

// ───── CORS (allow frontend on any domain) ─────
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
  exposeHeaders: ['Content-Length', 'Content-Disposition', 'Accept-Ranges'],
}));

// ───── Public routes (registered before the auth gate, same order as before) ─────
registerPublicRoutes(app);
registerPublicAuthRoutes(app);

// ───── Agent API (uses its own AGENT_API_TOKEN auth) ─────
app.route('/api/agent', agentApi);

// ───── API Discovery (public — must be registered before authMiddleware) ─────
registerApiDiscoveryRoutes(app);

// ═══════════ All routes below require auth ═══════════
app.use('/api/*', authMiddleware);

registerConfigRoutes(app);
registerAuthedAuthRoutes(app);
registerTopicsRoutes(app);
registerFilesRoutes(app);
registerSharesRoutes(app);
registerAdminRoutes(app);

// ───── Public share-download pages (not under /api/*) ─────
registerPublicDlRoutes(app);

// ───── 404 ─────
app.notFound((c) => {
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/dl/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.html(FRONTEND_HTML);
});

app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

// ───── Scheduled: periodic orphan cleanup ─────
// Runs on the cron trigger (see wrangler.toml [triggers]).
// Cleans up abandoned chunked uploads whose KV entries are older than
// ORPHAN_MIN_AGE_HOURS (default 2h) — old enough that no in-progress upload
// could still be writing them, young enough that the 7d KV TTL hasn't
// deleted the message_id trail yet.

async function scheduledHandler(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil((async () => {
    try {
      await ensureSchema(env);
      const minAgeHours = Number(env.ORPHAN_MIN_AGE_HOURS || 2);
      const result = await cleanupAllOrphanUploads(env, minAgeHours * 3600 * 1000);
      console.log(`[scheduled] orphan cleanup: deleted=${result.totalDeleted} failed=${result.totalFailed} found=${result.totalFound} skipped=${result.totalSkipped} uploads=${result.uploadIds.length}`);
    } catch (err) {
      console.error('[scheduled] orphan cleanup failed:', err);
    }
  })());
}

export default {
  fetch: app.fetch.bind(app),
  scheduled: scheduledHandler,
};
