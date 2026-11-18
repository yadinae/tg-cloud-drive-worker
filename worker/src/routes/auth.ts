import type { Hono } from 'hono';
import type { Env } from '../types';
import { getClientIp, checkRateLimit, recordFailedAttempt, clearRateLimit, LOGIN_RATE_LIMIT } from '../rate-limit';
import { hashPassword } from '../passwords';
import { checkPassword } from '../auth';

export function registerPublicAuthRoutes(app: Hono<{ Bindings: Env }>): void {
// ───── Session Login / Logout (public) ─────
// POST /api/auth/login — password → session
app.post('/api/auth/login', async (c) => {
  const { password } = await c.req.json();
  if (!password) return c.json({ error: 'Password required' }, 400);

  // Rate limit: 5 failed logins per IP per 15 min
  const ip = getClientIp(c);
  const loginKey = `login:${ip}`;
  const limit = await checkRateLimit(c.env, loginKey, LOGIN_RATE_LIMIT.maxAttempts, LOGIN_RATE_LIMIT.windowSeconds);
  if (!limit.allowed) {
    return c.json({ error: 'Too many login attempts, please try again later' }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });
  }

  // Verify password against env var OR settings hash
  const valid = await checkPassword(c.env, password);
  if (!valid) {
    await recordFailedAttempt(c.env, loginKey, LOGIN_RATE_LIMIT.windowSeconds);
    return c.json({ error: 'Invalid password' }, 403);
  }
  await clearRateLimit(c.env, loginKey);

  // Create session
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const session = {
    createdAt: now,
    expiresAt: now + 7 * 86400000, // 7 days
  };
  await c.env.SHARES.put(`sess:${sessionId}`, JSON.stringify(session), { expirationTtl: 604800 });

  return c.json({ ok: true, sessionId, expiresAt: session.expiresAt });
});

// POST /api/auth/logout — invalidate session
app.post('/api/auth/logout', async (c) => {
  const sessionId = c.req.header('X-Session-Id') || '';
  if (sessionId) {
    await c.env.SHARES.delete(`sess:${sessionId}`).catch(() => {});
  }
  return c.json({ ok: true });
});

// GET /api/auth/session — check if session is valid
app.get('/api/auth/session', async (c) => {
  const sessionId = c.req.query('session') || c.req.header('X-Session-Id') || '';
  if (!sessionId) return c.json({ ok: false, error: 'No session' }, 401);
  const raw = await c.env.SHARES.get(`sess:${sessionId}`).catch(() => null);
  if (!raw) return c.json({ ok: false, error: 'Session expired or invalid' }, 401);
  try {
    const session = JSON.parse(raw);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      await c.env.SHARES.delete(`sess:${sessionId}`).catch(() => {});
      return c.json({ ok: false, error: 'Session expired' }, 401);
    }
    return c.json({ ok: true, createdAt: session.createdAt, expiresAt: session.expiresAt });
  } catch {
    return c.json({ ok: false, error: 'Invalid session' }, 401);
  }
});
}

export function registerAuthedAuthRoutes(app: Hono<{ Bindings: Env }>): void {
// POST /api/auth/change-password — 修改密码（存储 PBKDF2 哈希到 settings 表）
app.post('/api/auth/change-password', async (c) => {
  const { oldPassword, newPassword } = await c.req.json();
  if (!oldPassword || !newPassword) {
    return c.json({ error: 'oldPassword and newPassword are required' }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: '新密码长度至少6位' }, 400);
  }
  // Verify old password against env var OR current hash
  const valid = await checkPassword(c.env, oldPassword);
  if (!valid) return c.json({ error: '当前密码错误' }, 403);

  // Hash new password and store in settings table
  const hash = await hashPassword(newPassword);
  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO settings (key, value, description, updated_at) VALUES ('system.password_hash', ?, ?, ?)"
  ).bind(hash, '用户可修改的登录密码(PBKDF2-SHA256)', Math.floor(Date.now() / 1000)).run();

  // Also invalidate all existing sessions so user must re-login
  // (Sessions expire naturally based on TTL; no bulk delete in KV)

  return c.json({ ok: true, message: '密码已更新，请重新登录 ✅' });
});
}
