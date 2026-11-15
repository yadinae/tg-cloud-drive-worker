/**
 * IP rate limiting for password-guessing endpoints.
 *
 * Why: login and share-password endpoints had no limit at all — anyone could
 * guess passwords without bound. Share passwords are short numeric codes,
 * so an unbounded oracle is a real brute-force hole.
 *
 * Design: fixed-window counters in the existing SHARES KV namespace, keyed
 * `rl:<scope>:<key>`, value `{count, expiresAt}` (JSON), TTL = window.
 * - Only failed guesses count; a correct password clears the bucket, so a
 *   legitimate user who mistypes a few times is not locked out afterwards.
 * - Requests without a password are not counted (an empty guess proves
 *   nothing, and counting it would let anyone exhaust someone else's bucket).
 * - KV read-then-write is not atomic: under concurrency the count can
 *   overshoot the limit by a little. That is acceptable here — the limit is
 *   a soft bound on guessing, not an exact accounting. (A Durable Object
 *   would give atomicity, but adds a new binding for little benefit.)
 * - `now` is injectable so tests can fast-forward past a window.
 */

import type { Env } from './types';

export const LOGIN_RATE_LIMIT = { maxAttempts: 5, windowSeconds: 900 }; // 5 / 15 min
export const SHARE_RATE_LIMIT = { maxAttempts: 10, windowSeconds: 600 }; // 10 / 10 min

const PREFIX = 'rl:';

interface Bucket {
  count: number;
  expiresAt: number; // ms epoch, end of the fixed window
}

/** Client IP: Cloudflare sets CF-Connecting-IP on every Worker request. */
export function getClientIp(c: any): string {
  const cf = c.req.header('CF-Connecting-IP');
  if (cf) return cf.trim();
  const forwarded = c.req.header('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

async function readBucket(env: Env, key: string, now: number): Promise<Bucket | null> {
  const raw = await env.SHARES.get(`${PREFIX}${key}`).catch(() => null);
  if (!raw) return null;
  try {
    const bucket = JSON.parse(raw) as Bucket;
    if (!bucket || typeof bucket.count !== 'number' || typeof bucket.expiresAt !== 'number') return null;
    if (bucket.expiresAt <= now) return null; // window over (KV TTL should have removed it already)
    return bucket;
  } catch {
    return null;
  }
}

export async function checkRateLimit(
  env: Env,
  key: string,
  maxAttempts: number,
  windowSeconds: number,
  now: number = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const bucket = await readBucket(env, key, now);
  if (!bucket) return { allowed: true, retryAfterSeconds: 0 };
  if (bucket.count < maxAttempts) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)),
  };
}

export async function recordFailedAttempt(
  env: Env,
  key: string,
  windowSeconds: number,
  now: number = Date.now(),
): Promise<void> {
  const bucket = await readBucket(env, key, now);
  if (!bucket) {
    const next: Bucket = { count: 1, expiresAt: now + windowSeconds * 1000 };
    await env.SHARES.put(`${PREFIX}${key}`, JSON.stringify(next), { expirationTtl: windowSeconds }).catch(() => {});
    return;
  }
  const remainingSeconds = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000));
  const next: Bucket = { count: bucket.count + 1, expiresAt: bucket.expiresAt };
  // Keep the original window end (fixed window), don't extend it.
  await env.SHARES.put(`${PREFIX}${key}`, JSON.stringify(next), { expirationTtl: remainingSeconds }).catch(() => {});
}

export async function clearRateLimit(env: Env, key: string): Promise<void> {
  await env.SHARES.delete(`${PREFIX}${key}`).catch(() => {});
}
