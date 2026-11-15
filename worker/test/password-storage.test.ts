/**
 * 口令存储加固测试（2026-11-15，PR #12 方案 B）。
 *
 * 旧格式（仍须兼容，平滑升级）：
 * - 登录口令：D1 settings 表 `system.password_hash` 存无盐 SHA-256 hex
 * - 分享口令：KV 记录里 `passwordHash` 为无盐 SHA-256，`password` 为明文
 *
 * 新格式：
 * - 校验哈希：PBKDF2-SHA256，加盐，`pbkdf2-sha256$<次数>$<盐>$<哈希>`
 *   （5000 次，见 passwords.ts 对免费版 CPU 预算的说明）
 * - 分享口令显示副本：AES-GCM 加密 `aesgcm$<iv>$<密文>`，密钥来自
 *   `SHARE_PASSWORD_KEY`；无密钥时新分享不存显示副本（null），
 *   而不是悄悄回退到明文。
 *
 * 升级路径（登录成功 / 分享口令验证成功时就地升级，不用用户重设口令）：
 * - 登录：checkPassword 接受旧哈希，成功后把 settings 行写成 PBKDF2
 * - 分享：verify 成功后把 KV 记录的哈希改成 PBKDF2、明文显示副本重加密
 *
 * 运行方式：`npm test`（worker 目录）。settings 表不在 test/helpers.ts
 * 的 schema 里，这里自己建；SHARE_PASSWORD_KEY 来自 vitest.config.ts
 * 的测试绑定。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF, reset } from "cloudflare:test";
import { TEST_PASSWORD, FILE_BODY, seedDatabase, seedShares, sha256Hex } from "./helpers";
import {
  hashPassword,
  verifyPasswordHash,
  encryptSharePassword,
  decryptSharePassword,
  displaySharePassword,
  isEncryptedSharePassword,
} from "../src/passwords";

const BASE = "http://test.local";
const SESSION = { "X-Session-Id": "test-session" };
// 与 vitest.config.ts 测试绑定里的 SHARE_PASSWORD_KEY 相同（仅测试用）。
const TEST_SHARE_KEY = "fxO4F0JaGKN65Ttsyv-MqWfn78m0xfId8ssgAdlv7PU";
const LEGACY_LOGIN_PW = "legacy-login-pw";
const NEW_LOGIN_PW = "new-login-pw";

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.9.0.${ipCounter}`;
}

async function getSetting(key: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row ? row.value : null;
}

async function getShareRecord(prefix: string, code: string): Promise<any> {
  const raw = await env.SHARES.get(`${prefix}${code}`);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(async () => {
  await reset();
  await seedDatabase(env);
  await seedShares(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at INTEGER DEFAULT (unixepoch()))",
  ).run();
  // 登录口令种子：旧格式无盐 SHA-256
  await env.DB.prepare(
    "INSERT OR REPLACE INTO settings (key, value, description) VALUES ('system.password_hash', ?, ?)",
  )
    .bind(await sha256Hex(LEGACY_LOGIN_PW), "test")
    .run();
});

describe("登录口令：PBKDF2 + 旧哈希平滑升级", () => {
  it("旧哈希 + 正确口令 → 登录成功，且 settings 行升级成 PBKDF2", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ password: LEGACY_LOGIN_PW }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBeTruthy();

    const stored = await getSetting("system.password_hash");
    expect(stored).toMatch(/^pbkdf2-sha256\$5000\$/);
    expect(stored).not.toBe(await sha256Hex(LEGACY_LOGIN_PW));
  });

  it("旧哈希 + 错口令 → 403，且 settings 行不升级", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ password: "wrong-pw" }),
    });
    expect(res.status).toBe(403);
    expect(await getSetting("system.password_hash")).toBe(
      await sha256Hex(LEGACY_LOGIN_PW),
    );
  });

  it("新格式哈希 + 正确口令 → 登录成功，行保持 PBKDF2", async () => {
    const hashed = await hashPassword(NEW_LOGIN_PW);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('system.password_hash', ?)",
    )
      .bind(hashed)
      .run();
    const res = await SELF.fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ password: NEW_LOGIN_PW }),
    });
    expect(res.status).toBe(200);
    expect((await res.json<any>()).ok).toBe(true);
    expect(await getSetting("system.password_hash")).toBe(hashed);
  });

  it("改密码 → 存成 PBKDF2，旧口令失效、新口令能登录", async () => {
    const change = await SELF.fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...SESSION },
      body: JSON.stringify({ oldPassword: LEGACY_LOGIN_PW, newPassword: NEW_LOGIN_PW }),
    });
    expect(change.status).toBe(200);
    expect((await change.json<any>()).ok).toBe(true);
    expect(await getSetting("system.password_hash")).toMatch(/^pbkdf2-sha256\$5000\$/);

    const oldLogin = await SELF.fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ password: LEGACY_LOGIN_PW }),
    });
    expect(oldLogin.status).toBe(403);

    const newLogin = await SELF.fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ password: NEW_LOGIN_PW }),
    });
    expect(newLogin.status).toBe(200);
  });
});

describe("分享口令：PBKDF2 校验哈希 + AES-GCM 显示副本", () => {
  it("新建分享：KV 里哈希是 PBKDF2，显示副本是密文（不是明文）", async () => {
    const res = await SELF.fetch(`${BASE}/api/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...SESSION },
      body: JSON.stringify({ fileId: 1, password: "123456" }),
    });
    expect(res.status).toBe(201);
    const { code } = await res.json<any>();

    const record = await getShareRecord("share:", code);
    expect(record.passwordHash).toMatch(/^pbkdf2-sha256\$5000\$/);
    expect(record.password).toMatch(/^aesgcm\$/);
    expect(record.password).not.toContain("123456");

    // 新分享用正确口令能验证通过
    const verify = await SELF.fetch(`${BASE}/api/shares/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ code, password: "123456" }),
    });
    expect((await verify.json<any>()).ok).toBe(true);

    // 管理后台列表解密后显示明文（眼睛图标照常）
    const list = await SELF.fetch(`${BASE}/api/shares?fileId=1`, {
      headers: SESSION,
    });
    const shares = (await list.json<any>()).shares;
    const mine = shares.find((s: any) => s.code === code);
    expect(mine.password).toBe("123456");
  });

  it("旧分享验证成功 → KV 记录升级：哈希变 PBKDF2，明文变密文", async () => {
    const before = await getShareRecord("share:", "protfile");
    expect(before.passwordHash).toBe(await sha256Hex(TEST_PASSWORD));
    expect(before.password).toBe(TEST_PASSWORD);

    const res = await SELF.fetch(`${BASE}/api/shares/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ code: "protfile", password: TEST_PASSWORD }),
    });
    expect((await res.json<any>()).ok).toBe(true);

    const after = await getShareRecord("share:", "protfile");
    expect(after.passwordHash).toMatch(/^pbkdf2-sha256\$5000\$/);
    expect(after.password).toMatch(/^aesgcm\$/);
    expect(after.password).not.toContain(TEST_PASSWORD);

    // 升级后管理列表仍能解密显示
    const list = await SELF.fetch(`${BASE}/api/shares/list-all`, { headers: SESSION });
    const shares = (await list.json<any>()).shares;
    expect(shares.find((s: any) => s.code === "protfile").password).toBe(TEST_PASSWORD);
  });

  it("旧分享验证失败 → KV 记录不升级（哈希仍是旧 SHA-256，明文仍在）", async () => {
    const res = await SELF.fetch(`${BASE}/api/shares/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ code: "protfile", password: "wrong-pw" }),
    });
    expect((await res.json<any>()).ok).toBe(false);

    const record = await getShareRecord("share:", "protfile");
    expect(record.passwordHash).toBe(await sha256Hex(TEST_PASSWORD));
    expect(record.password).toBe(TEST_PASSWORD);
  });

  it("文件夹旧分享验证成功 → 同样升级", async () => {
    const res = await SELF.fetch(`${BASE}/api/shares/folder/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ code: "protfold", password: TEST_PASSWORD }),
    });
    expect((await res.json<any>()).ok).toBe(true);

    const record = await getShareRecord("fldr:", "protfold");
    expect(record.passwordHash).toMatch(/^pbkdf2-sha256\$5000\$/);
    expect(record.password).toMatch(/^aesgcm\$/);

    const list = await SELF.fetch(`${BASE}/api/shares/folder/list-all`, {
      headers: SESSION,
    });
    const shares = (await list.json<any>()).shares;
    expect(shares.find((s: any) => s.code === "protfold").password).toBe(TEST_PASSWORD);
  });

  it("改分享口令 → 新哈希 PBKDF2 + 新密文，旧口令失效", async () => {
    const update = await SELF.fetch(`${BASE}/api/shares/protfile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...SESSION },
      body: JSON.stringify({ password: "654321" }),
    });
    expect(update.status).toBe(200);

    const record = await getShareRecord("share:", "protfile");
    expect(record.passwordHash).toMatch(/^pbkdf2-sha256\$5000\$/);
    expect(record.password).toMatch(/^aesgcm\$/);
    expect(record.password).not.toContain("654321");

    const oldVerify = await SELF.fetch(`${BASE}/api/shares/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ code: "protfile", password: TEST_PASSWORD }),
    });
    expect((await oldVerify.json<any>()).ok).toBe(false);

    const newVerify = await SELF.fetch(`${BASE}/api/shares/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ code: "protfile", password: "654321" }),
    });
    expect((await newVerify.json<any>()).ok).toBe(true);
  });

  it("升级后的分享 raw 直链：正确口令 200、错口令 403（回归红线）", async () => {
    // 先验证一次触发升级
    await SELF.fetch(`${BASE}/api/shares/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
      body: JSON.stringify({ code: "protfile", password: TEST_PASSWORD }),
    });
    const ok = await SELF.fetch(
      `${BASE}/dl/protfile/raw?password=${encodeURIComponent(TEST_PASSWORD)}`,
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe(FILE_BODY);
    const bad = await SELF.fetch(`${BASE}/dl/protfile/raw?password=wrong-pw`);
    expect(bad.status).toBe(403);
  });
});

describe("passwords.ts 单元测试", () => {
  it("hash/verify 往返：正确口令过，错口令不过", async () => {
    const hashed = await hashPassword("some-password");
    expect(hashed).toMatch(/^pbkdf2-sha256\$5000\$/);
    expect(await verifyPasswordHash(hashed, "some-password")).toEqual({
      ok: true,
      legacy: false,
    });
    expect(await verifyPasswordHash(hashed, "other-password")).toEqual({
      ok: false,
      legacy: false,
    });
  });

  it("旧 SHA-256 hex：验证通过并标记 legacy；篡改后失败", async () => {
    const legacy = await sha256Hex("correct-pw");
    expect(await verifyPasswordHash(legacy, "correct-pw")).toEqual({
      ok: true,
      legacy: true,
    });
    expect(await verifyPasswordHash(legacy, "wrong-pw")).toEqual({
      ok: false,
      legacy: true,
    });
  });

  it("格式不对的存储值 → 验证失败（不是 legacy）", async () => {
    for (const bad of ["", "not-a-hash", "pbkdf2-sha256$5000", "pbkdf2-sha256$abc$xx$yy"]) {
      expect(await verifyPasswordHash(bad, "correct-pw")).toEqual({
        ok: false,
        legacy: false,
      });
    }
    expect(await verifyPasswordHash(null, "correct-pw")).toEqual({
      ok: false,
      legacy: false,
    });
  });

  it("AES-GCM 往返：同密钥能解，错密钥/坏数据解不出", async () => {
    const enc = await encryptSharePassword(TEST_SHARE_KEY, "123456");
    expect(enc).toMatch(/^aesgcm\$/);
    expect(isEncryptedSharePassword(enc)).toBe(true);
    expect(await decryptSharePassword(TEST_SHARE_KEY, enc!)).toBe("123456");
    expect(await decryptSharePassword("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", enc!)).toBeNull();
    expect(await decryptSharePassword(TEST_SHARE_KEY, "aesgcm$bad$bad")).toBeNull();
    expect(await decryptSharePassword(TEST_SHARE_KEY, "plain")).toBeNull();
  });

  it("无密钥：加密返回 null（不悄悄存明文）", async () => {
    expect(await encryptSharePassword(undefined, "123456")).toBeNull();
    expect(await encryptSharePassword("", "123456")).toBeNull();
    expect(await encryptSharePassword("not-valid-base64!!!", "123456")).toBeNull();
  });

  it("displaySharePassword：密文解密、明文直通、null 保持、缺密钥解不出", async () => {
    const enc = await encryptSharePassword(TEST_SHARE_KEY, "123456");
    expect(await displaySharePassword(TEST_SHARE_KEY, enc)).toBe("123456");
    expect(await displaySharePassword(undefined, enc)).toBeNull();
    expect(await displaySharePassword(TEST_SHARE_KEY, "123456")).toBe("123456");
    expect(await displaySharePassword(undefined, "123456")).toBe("123456");
    expect(await displaySharePassword(TEST_SHARE_KEY, null)).toBeNull();
    expect(isEncryptedSharePassword("123456")).toBe(false);
  });
});
