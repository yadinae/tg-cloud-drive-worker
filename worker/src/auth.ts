import type { Env } from './types';
import { hashPassword, verifyPasswordHash } from './passwords';

// ───── Auth middleware (supports session, env token, and settings password) ─────
/** Check password against env var OR settings table hash (PBKDF2, or legacy
 *  SHA-256 upgraded in place on success). */
export async function checkPassword(env: Env, password: string): Promise<boolean> {
  // 1. Check against env DRIVE_AUTH_TOKEN
  const tokenBytes = new TextEncoder().encode(password);
  const expectedBytes = new TextEncoder().encode(env.DRIVE_AUTH_TOKEN);
  if (tokenBytes.length === expectedBytes.length) {
    try {
      if (await crypto.subtle.timingSafeEqual(tokenBytes, expectedBytes)) return true;
    } catch { /* ignore */ }
  }
  // 2. Check against settings table password_hash
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'system.password_hash'").first<{value: string}>();
    if (row && row.value) {
      const result = await verifyPasswordHash(row.value, password);
      if (!result.ok) return false;
      if (result.legacy) {
        // Upgrade the stored hash to PBKDF2 (best-effort; login succeeds
        // even if the upgrade write fails).
        try {
          const upgraded = await hashPassword(password);
          await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'system.password_hash'").bind(upgraded).run();
        } catch { /* ignore upgrade failure */ }
      }
      return true;
    }
  } catch { /* settings table may not exist yet */ }
  return false;
}

export async function authMiddleware(c: any, next: any) {
  // 1. Check session (from X-Session-Id header or cookie)
  const sessionId = c.req.header('X-Session-Id') || c.req.cookie?.session_id || c.req.query('session') || '';
  if (sessionId) {
    const raw = await c.env.SHARES.get(`sess:${sessionId}`, { type: 'json' }).catch(() => null);
    if (raw && raw.createdAt && (!raw.expiresAt || Date.now() < raw.expiresAt)) {
      // Session valid — renew if close to expiry
      if (raw.expiresAt && raw.expiresAt - Date.now() < 86400000) {
        raw.expiresAt = Date.now() + 7 * 86400000; // extend 7 days
        await c.env.SHARES.put(`sess:${sessionId}`, JSON.stringify(raw), { expirationTtl: 604800 });
      }
      return await next();
    }
    // Session expired or invalid — fall through to token check
  }

  // 2. Fallback: Bearer token (check env var OR settings hash)
  let token = '';
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = c.req.query('token') || '';
  }
  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  const ok = await checkPassword(c.env, token);
  if (!ok) return c.json({ error: 'Invalid auth token' }, 403);
  await next();
}
