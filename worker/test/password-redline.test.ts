/**
 * 口令校验红线测试（Auth red line, see AGENTS.md + notes/2026-07-31-raw-endpoint-bypasses-password.md）
 *
 * 规则：每一个能取回文件内容的端点都必须各自校验分享口令。
 * 2026-07-31 和 2026-11-15 两次都是“页面加了校验、raw 直链漏掉”造成的付费绕过，
 * 所以这里按端点逐个断言，而不是只测一两个代表：
 *
 *   公开端点（必须各自校验口令）:
 *     GET /dl/:code/raw            单文件分享 raw 直链
 *     GET /dl/f/:code/raw/:fileId  文件夹分享 raw 直链
 *     GET /dl/:code                单文件分享页（有口令时只出密码框，不出内容）
 *     GET /dl/f/:code              文件夹分享页（同上）
 *     GET /dl/f/:code/gallery      文件夹画廊（有口令时须先过口令）
 *   有意公开的例外（必须保持公开，见 2026-07-31 笔记：产品预览图/外链）:
 *     GET /img/:code/:fileId       不校验口令，但仍校验文件属于该分享
 *   管理员端点（走登录会话，不走分享口令）:
 *     GET /api/files/:id/download  无会话 → 401，有会话 → 200
 *
 * 运行方式：`npm test`（worker 目录）。Telegram 用本地 mock 服务器代替
 * （见 test/helpers.ts），不触网；D1/KV 由 @cloudflare/vitest-pool-workers
 * 在 workerd 里提供本地实例，每条用例前 reset + 重新播种。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF, reset } from "cloudflare:test";
import { TEST_PASSWORD, FILE_BODY, seedDatabase, seedShares } from "./helpers";

const BASE = "http://test.local";

beforeEach(async () => {
  await reset();
  await seedDatabase(env);
  await seedShares(env);
});

describe("单文件分享 raw 直链 GET /dl/:code/raw", () => {
  it("有口令、无口令 → 403", async () => {
    const res = await SELF.fetch(`${BASE}/dl/protfile/raw`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Password required" });
  });

  it("有口令、错口令 → 403", async () => {
    const res = await SELF.fetch(`${BASE}/dl/protfile/raw?password=wrong-pw`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Password required" });
  });

  it("有口令、对口令 → 200 并返回文件本体", async () => {
    const res = await SELF.fetch(
      `${BASE}/dl/protfile/raw?password=${TEST_PASSWORD}`,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(FILE_BODY);
  });

  it("无口令的分享 → 200，不用口令", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openfile/raw`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(FILE_BODY);
  });

  it("不存在的分享 → 404", async () => {
    const res = await SELF.fetch(`${BASE}/dl/nopefile/raw`);
    expect(res.status).toBe(404);
  });
});

describe("单文件分享页 GET /dl/:code", () => {
  it("有口令 → 只出密码框", async () => {
    const res = await SELF.fetch(`${BASE}/dl/protfile`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="pw-wrap"');
    expect(html).toContain("文件受密码保护");
    expect(html).toContain("secret.txt");
  });

  it("无口令 → 不出密码框", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openfile`);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('id="pw-wrap"');
  });
});

describe("文件夹分享 raw 直链 GET /dl/f/:code/raw/:fileId", () => {
  it("有口令、无口令 → 403", async () => {
    const res = await SELF.fetch(`${BASE}/dl/f/protfold/raw/1`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Password required" });
  });

  it("有口令、错口令 → 403", async () => {
    const res = await SELF.fetch(
      `${BASE}/dl/f/protfold/raw/1?password=wrong-pw`,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Password required" });
  });

  it("有口令、对口令 → 200 并返回文件本体", async () => {
    const res = await SELF.fetch(
      `${BASE}/dl/f/protfold/raw/1?password=${TEST_PASSWORD}`,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(FILE_BODY);
  });

  it("对口令、但文件不在该分享的文件夹里 → 404", async () => {
    const res = await SELF.fetch(
      `${BASE}/dl/f/protfold/raw/999?password=${TEST_PASSWORD}`,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "File not found in this share" });
  });

  it("无口令的分享 → 200，不用口令", async () => {
    const res = await SELF.fetch(`${BASE}/dl/f/openfold/raw/1`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(FILE_BODY);
  });
});

describe("文件夹分享页 GET /dl/f/:code", () => {
  it("有口令 → 只出密码框", async () => {
    const res = await SELF.fetch(`${BASE}/dl/f/protfold`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="pw-wrap"');
    expect(html).toContain("此文件夹受密码保护");
  });
});

describe("文件夹画廊 GET /dl/f/:code/gallery", () => {
  it("有口令、不带 pwd → 密码框", async () => {
    const res = await SELF.fetch(`${BASE}/dl/f/protfold/gallery`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="pw-wrap"');
  });

  it("有口令、错 pwd → 报错页", async () => {
    const res = await SELF.fetch(`${BASE}/dl/f/protfold/gallery?pwd=wrong-pw`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Invalid password");
  });

  it("有口令、对 pwd → 画廊列出图片", async () => {
    const res = await SELF.fetch(
      `${BASE}/dl/f/protfold/gallery?pwd=${TEST_PASSWORD}`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("photo.png");
    expect(html).toContain("1 images");
    expect(html).not.toContain('id="pw-wrap"');
  });
});

describe("图片外链 GET /img/:code/:fileId（有意公开的例外）", () => {
  it("有口令的分享、不带口令 → 仍返回图片（产品预览/外链，见 2026-07-31 笔记）", async () => {
    const res = await SELF.fetch(`${BASE}/img/protfile/1`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(FILE_BODY);
  });

  it("文件不在该分享里 → 404（例外不绕过归属校验）", async () => {
    const res = await SELF.fetch(`${BASE}/img/protfile/999`);
    expect(res.status).toBe(404);
  });
});

describe("管理员下载 GET /api/files/:id/download", () => {
  it("无登录 → 401", async () => {
    const res = await SELF.fetch(`${BASE}/api/files/1/download`);
    expect(res.status).toBe(401);
  });

  it("有有效会话 → 200 并返回文件本体", async () => {
    const res = await SELF.fetch(`${BASE}/api/files/1/download`, {
      headers: { "X-Session-Id": "test-session" },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(FILE_BODY);
  });
});
