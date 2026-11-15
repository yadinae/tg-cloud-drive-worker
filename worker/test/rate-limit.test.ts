/**
 * Rate-limit tests: password guessing must be bounded per IP.
 *
 * Covered oracles (all share one bucket per IP + share code):
 * - POST /api/auth/login (admin login): 5 failed / 15 min
 * - POST /api/shares/verify, POST /api/shares/folder/verify
 * - GET /dl/:code/raw, GET /dl/f/:code/raw/:fileId, GET /dl/f/:code/gallery
 *
 * Rules under test:
 * - only failed guesses count; empty password is never counted
 * - a correct password clears the bucket (mistypes don't lock you out)
 * - buckets are per (IP, share code): another IP / another code is unaffected
 * - 429 carries a Retry-After header; the window is fixed (not extended)
 *
 * The worker reads the client IP from CF-Connecting-IP, so tests just set
 * that header. Unit tests at the bottom drive rate-limit.ts directly with a
 * fake KV and a controllable clock (window expiry can't be waited out in
 * Miniflare, so the clock is injected).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF, reset } from "cloudflare:test";
import { seedDatabase, seedShares, TEST_PASSWORD, sha256Hex } from "./helpers";
import {
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  getClientIp,
  LOGIN_RATE_LIMIT,
  SHARE_RATE_LIMIT,
} from "../src/rate-limit";
import type { Env } from "../src/types";

const IP_A = "203.0.113.1";
const IP_B = "203.0.113.2";
const ADMIN_PASSWORD = "test-admin-token"; // = DRIVE_AUTH_TOKEN in vitest.config.ts

async function login(ip: string, password: string) {
  return SELF.fetch("http://test.local/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ password }),
  });
}

async function verifyShare(ip: string, code: string, password: string) {
  return SELF.fetch("http://test.local/api/shares/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ code, password }),
  });
}

async function verifyFolderShare(ip: string, code: string, password: string) {
  return SELF.fetch("http://test.local/api/shares/folder/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ code, password }),
  });
}

async function rawShare(ip: string, code: string, password: string) {
  return SELF.fetch(`http://test.local/dl/${code}/raw?password=${encodeURIComponent(password)}`, {
    headers: { "CF-Connecting-IP": ip },
  });
}

async function gallery(ip: string, code: string, pwd: string) {
  return SELF.fetch(`http://test.local/dl/f/${code}/gallery?pwd=${encodeURIComponent(pwd)}`, {
    headers: { "CF-Connecting-IP": ip },
  });
}

beforeEach(async () => {
  reset();
  await seedDatabase(env);
  await seedShares(env);
  // Second protected file share (file 1) for per-code isolation tests.
  await env.SHARES.put(
    "share:protfile2",
    JSON.stringify({
      fileId: 1,
      fileName: "secret.txt",
      fileSize: 5,
      passwordHash: await sha256Hex(TEST_PASSWORD),
      password: TEST_PASSWORD,
      expiresAt: null,
      downloadCount: 0,
      maxDownloads: null,
    }),
  );
});

describe("login rate limit", () => {
  it("blocks after 5 failed logins, correct password stays blocked", async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxAttempts; i++) {
      const res = await login(IP_A, "wrong-password");
      expect(res.status).toBe(403);
    }
    const blocked = await login(IP_A, "wrong-password");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();

    const correctWhileBlocked = await login(IP_A, ADMIN_PASSWORD);
    expect(correctWhileBlocked.status).toBe(429);
  });

  it("a different IP is not blocked", async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxAttempts; i++) {
      await login(IP_A, "wrong-password");
    }
    expect((await login(IP_A, "wrong-password")).status).toBe(429);

    const res = await login(IP_B, ADMIN_PASSWORD);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; sessionId?: string };
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBeTruthy();
  });

  it("a successful login clears the counter", async () => {
    for (let i = 0; i < 4; i++) {
      expect((await login(IP_A, "wrong-password")).status).toBe(403);
    }
    expect((await login(IP_A, ADMIN_PASSWORD)).status).toBe(200);
    // Counter restarted: 5 more failures, then the 6th is blocked.
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxAttempts; i++) {
      expect((await login(IP_A, "wrong-password")).status).toBe(403);
    }
    expect((await login(IP_A, "wrong-password")).status).toBe(429);
  });
});

describe("share password rate limit", () => {
  it("blocks after 10 wrong guesses on the verify endpoint", async () => {
    for (let i = 0; i < SHARE_RATE_LIMIT.maxAttempts; i++) {
      const res = await verifyShare(IP_A, "protfile", "wrong-pw");
      expect(res.status).toBe(200);
      expect((await res.json()) as { ok: boolean }).toEqual(
        expect.objectContaining({ ok: false }),
      );
    }
    const blocked = await verifyShare(IP_A, "protfile", "wrong-pw");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();

    const correctWhileBlocked = await verifyShare(IP_A, "protfile", TEST_PASSWORD);
    expect(correctWhileBlocked.status).toBe(429);
  });

  it("buckets are per share code", async () => {
    for (let i = 0; i < SHARE_RATE_LIMIT.maxAttempts; i++) {
      await verifyShare(IP_A, "protfile", "wrong-pw");
    }
    expect((await verifyShare(IP_A, "protfile", "wrong-pw")).status).toBe(429);

    // Another protected share, same IP: unaffected.
    const other = await verifyShare(IP_A, "protfile2", TEST_PASSWORD);
    expect(other.status).toBe(200);
    expect((await other.json()) as { ok: boolean }).toEqual(
      expect.objectContaining({ ok: true }),
    );
    // And the folder share endpoint, same IP: unaffected.
    const folder = await verifyFolderShare(IP_A, "protfold", TEST_PASSWORD);
    expect(folder.status).toBe(200);
    expect((await folder.json()) as { ok: boolean }).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });

  it("raw downloads and the verify endpoint share one bucket", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await verifyShare(IP_A, "protfile", "wrong-pw")).status).toBe(200);
    }
    for (let i = 0; i < 5; i++) {
      expect((await rawShare(IP_A, "protfile", "wrong-pw")).status).toBe(403);
    }
    // 10 guesses total across both oracles: the next one is blocked.
    expect((await rawShare(IP_A, "protfile", "wrong-pw")).status).toBe(429);
    expect((await verifyShare(IP_A, "protfile", TEST_PASSWORD)).status).toBe(429);
  });

  it("gallery guesses are limited", async () => {
    for (let i = 0; i < SHARE_RATE_LIMIT.maxAttempts; i++) {
      const res = await gallery(IP_A, "protfold", "wrong-pw");
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Invalid password");
    }
    const blocked = await gallery(IP_A, "protfold", "wrong-pw");
    expect(blocked.status).toBe(429);
    expect(await blocked.text()).toContain("Too many attempts");
  });

  it("a correct share password clears the counter", async () => {
    for (let i = 0; i < 9; i++) {
      expect((await verifyShare(IP_A, "protfile", "wrong-pw")).status).toBe(200);
    }
    const ok = await verifyShare(IP_A, "protfile", TEST_PASSWORD);
    expect(ok.status).toBe(200);
    expect((await ok.json()) as { ok: boolean }).toEqual(
      expect.objectContaining({ ok: true }),
    );
    // Counter restarted: 10 more failures before the block.
    for (let i = 0; i < SHARE_RATE_LIMIT.maxAttempts; i++) {
      expect((await verifyShare(IP_A, "protfile", "wrong-pw")).status).toBe(200);
    }
    expect((await verifyShare(IP_A, "protfile", "wrong-pw")).status).toBe(429);
  });

  it("empty password guesses are not counted", async () => {
    // 10 no-password raw requests: none of them is a guess.
    for (let i = 0; i < SHARE_RATE_LIMIT.maxAttempts; i++) {
      expect((await rawShare(IP_A, "protfile", "")).status).toBe(403);
    }
    // The 11th guess is still a plain 403, not a 429.
    expect((await rawShare(IP_A, "protfile", "wrong-pw")).status).toBe(403);
  });
});

// ───── Unit tests: window math, with a fake KV and a controllable clock ─────

function makeFakeEnv() {
  const store = new Map<string, string>();
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
  return { SHARES: kv } as unknown as Env;
}

describe("rate-limit window math", () => {
  it("allows again after the window ends, and the count restarts", async () => {
    const fake = makeFakeEnv();
    const t0 = 1_000_000;
    const key = "share:protfile:203.0.113.1";
    for (let i = 0; i < SHARE_RATE_LIMIT.maxAttempts; i++) {
      await recordFailedAttempt(fake, key, SHARE_RATE_LIMIT.windowSeconds, t0);
    }
    const blocked = await checkRateLimit(fake, key, SHARE_RATE_LIMIT.maxAttempts, SHARE_RATE_LIMIT.windowSeconds, t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(SHARE_RATE_LIMIT.windowSeconds);

    const after = await checkRateLimit(
      fake, key, SHARE_RATE_LIMIT.maxAttempts, SHARE_RATE_LIMIT.windowSeconds,
      t0 + SHARE_RATE_LIMIT.windowSeconds * 1000 + 1,
    );
    expect(after.allowed).toBe(true);

    await recordFailedAttempt(fake, key, SHARE_RATE_LIMIT.windowSeconds, t0 + SHARE_RATE_LIMIT.windowSeconds * 1000 + 1);
    const fresh = await checkRateLimit(fake, key, SHARE_RATE_LIMIT.maxAttempts, SHARE_RATE_LIMIT.windowSeconds, t0 + SHARE_RATE_LIMIT.windowSeconds * 1000 + 1);
    expect(fresh.allowed).toBe(true); // count restarted at 1
  });

  it("the window is fixed, not extended by later failures", async () => {
    const fake = makeFakeEnv();
    const t0 = 1_000_000;
    const key = "login:203.0.113.1";
    await recordFailedAttempt(fake, key, LOGIN_RATE_LIMIT.windowSeconds, t0);
    for (let i = 1; i < LOGIN_RATE_LIMIT.maxAttempts; i++) {
      await recordFailedAttempt(fake, key, LOGIN_RATE_LIMIT.windowSeconds, t0 + 300_000);
    }
    // 590s in: still blocked, ~10s left (window ends at t0 + 900s).
    const late = await checkRateLimit(fake, key, LOGIN_RATE_LIMIT.maxAttempts, LOGIN_RATE_LIMIT.windowSeconds, t0 + 590_000);
    expect(late.allowed).toBe(false);
    expect(late.retryAfterSeconds).toBeLessThanOrEqual(310);
    expect(late.retryAfterSeconds).toBeGreaterThan(0);
    // Past the original window end: allowed again.
    const over = await checkRateLimit(fake, key, LOGIN_RATE_LIMIT.maxAttempts, LOGIN_RATE_LIMIT.windowSeconds, t0 + 901_000);
    expect(over.allowed).toBe(true);
  });

  it("clearRateLimit resets the bucket", async () => {
    const fake = makeFakeEnv();
    const key = "login:203.0.113.1";
    for (let i = 0; i < 3; i++) {
      await recordFailedAttempt(fake, key, LOGIN_RATE_LIMIT.windowSeconds, 1_000_000);
    }
    await clearRateLimit(fake, key);
    const res = await checkRateLimit(fake, key, LOGIN_RATE_LIMIT.maxAttempts, LOGIN_RATE_LIMIT.windowSeconds, 1_000_000);
    expect(res.allowed).toBe(true);
  });

  it("getClientIp prefers CF-Connecting-IP, then X-Forwarded-For", () => {
    const ctx = (headers: Record<string, string>) => ({
      req: { header: (name: string) => headers[name.toLowerCase()] ?? null },
    });
    expect(getClientIp(ctx({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }) as any)).toBe("1.2.3.4");
    expect(getClientIp(ctx({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" }) as any)).toBe("5.6.7.8");
    expect(getClientIp(ctx({}) as any)).toBe("unknown");
  });
});
