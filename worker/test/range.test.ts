/**
 * Range 请求测试（RFC 9110 §14.2）。
 *
 * 背景：OpenAPI 早就承诺三个下载端点都支持 Range（206），但多块文件
 * 之前是 warn-and-ignore：带 Range 也返回整个文件 200。单块文件走
 * Telegram 直传，Range 由 Telegram 处理。
 *
 * 测试数据：3 块文件 big.bin（21 字节），块内容各不相同，跨块边界
 * 可观测：
 *   chunk 0 "HELLO" (5) + chunk 1 "WORLD!" (6) + chunk 2 "0123456789" (10)
 *   全文 "HELLOWORLD!0123456789"
 *
 * 运行方式：`npm test`（worker 目录）。Telegram 用本地 mock 服务器代替
 * （见 test/mock-telegram-server.ts），它按 file_id 返回不同块内容，
 * 并且文件 GET 本身也支持 Range。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF, reset } from "cloudflare:test";
import {
  TEST_PASSWORD,
  FILE_BODY,
  sha256Hex,
  seedDatabase,
  seedShares,
} from "./helpers";
import { parseRangeHeader } from "../src/range";

const BASE = "http://test.local";
const SESSION = { "X-Session-Id": "test-session" };

const MULTI_MANIFEST = JSON.stringify([
  { file_id: "tg-chunk-1", size: 5, part_index: 0 },
  { file_id: "tg-chunk-2", size: 6, part_index: 1 },
  { file_id: "tg-chunk-3", size: 10, part_index: 2 },
]);
const MULTI_BODY = "HELLOWORLD!0123456789"; // 21 bytes

async function seedMultiChunkFile(): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO files (id, topic_id, name, size, mime_type, manifest, chunk_count, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(3, 20, "big.bin", 21, "application/octet-stream", MULTI_MANIFEST, 3, null)
    .run();
  await env.SHARES.put(
    "share:openmulti",
    JSON.stringify({
      fileId: 3,
      fileName: "big.bin",
      fileSize: 21,
      passwordHash: null,
      password: null,
      expiresAt: null,
      downloadCount: 0,
      maxDownloads: null,
    }),
  );
  const pwHash = await sha256Hex(TEST_PASSWORD);
  await env.SHARES.put(
    "share:protmulti",
    JSON.stringify({
      fileId: 3,
      fileName: "big.bin",
      fileSize: 21,
      passwordHash: pwHash,
      password: TEST_PASSWORD,
      expiresAt: null,
      downloadCount: 0,
      maxDownloads: null,
    }),
  );
}

beforeEach(async () => {
  await reset();
  await seedDatabase(env);
  await seedShares(env);
  await seedMultiChunkFile();
});

describe("parseRangeHeader（纯函数）", () => {
  it("无 Range → ignore", () => {
    expect(parseRangeHeader(undefined, 21)).toEqual({ kind: "ignore" });
    expect(parseRangeHeader(null, 21)).toEqual({ kind: "ignore" });
  });

  it("bytes=0-4 → 0-4", () => {
    expect(parseRangeHeader("bytes=0-4", 21)).toEqual({ kind: "range", start: 0, end: 4 });
  });

  it("bytes=5-（开区间）→ 到末尾", () => {
    expect(parseRangeHeader("bytes=5-", 21)).toEqual({ kind: "range", start: 5, end: 20 });
  });

  it("bytes=-5（后缀）→ 最后 5 字节", () => {
    expect(parseRangeHeader("bytes=-5", 21)).toEqual({ kind: "range", start: 16, end: 20 });
  });

  it("越界的 end 被夹到末尾，后缀超长取全文", () => {
    expect(parseRangeHeader("bytes=0-999", 21)).toEqual({ kind: "range", start: 0, end: 20 });
    expect(parseRangeHeader("bytes=-999", 21)).toEqual({ kind: "range", start: 0, end: 20 });
  });

  it("起点超出文件 → unsatisfiable", () => {
    expect(parseRangeHeader("bytes=21-", 21)).toEqual({ kind: "unsatisfiable" });
    expect(parseRangeHeader("bytes=30-40", 21)).toEqual({ kind: "unsatisfiable" });
  });

  it("后缀 0 → unsatisfiable；空文件任何 Range 都 unsatisfiable", () => {
    expect(parseRangeHeader("bytes=-0", 21)).toEqual({ kind: "unsatisfiable" });
    expect(parseRangeHeader("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("畸形语法 / 倒置区间 / 多段 / 错误单位 → ignore（走 200 全文）", () => {
    expect(parseRangeHeader("bytes=abc", 21)).toEqual({ kind: "ignore" });
    expect(parseRangeHeader("bytes=5-3", 21)).toEqual({ kind: "ignore" });
    expect(parseRangeHeader("bytes=0-4, bytes=10-14", 21)).toEqual({ kind: "ignore" });
    expect(parseRangeHeader("items=0-4", 21)).toEqual({ kind: "ignore" });
  });
});

describe("多块文件 Range：公开分享 raw 直链 GET /dl/openmulti/raw", () => {
  it("无 Range → 200 全文，带 Accept-Ranges", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openmulti/raw`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await res.text()).toBe(MULTI_BODY);
  });

  it("bytes=0-4 → 206，第一块的前 5 字节", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openmulti/raw`, {
      headers: { Range: "bytes=0-4" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-4/21");
    expect(res.headers.get("Content-Length")).toBe("5");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await res.text()).toBe("HELLO");
  });

  it("bytes=3-10 → 206，跨第 0→1 块边界", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openmulti/raw`, {
      headers: { Range: "bytes=3-10" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 3-10/21");
    expect(res.headers.get("Content-Length")).toBe("8");
    expect(await res.text()).toBe("LOWORLD!");
  });

  it("bytes=9-15 → 206，跨第 1→2 块边界", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openmulti/raw`, {
      headers: { Range: "bytes=9-15" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 9-15/21");
    expect(await res.text()).toBe("D!01234");
  });

  it("bytes=-5 与 bytes=16- → 206，最后 5 字节", async () => {
    for (const range of ["bytes=-5", "bytes=16-"]) {
      const res = await SELF.fetch(`${BASE}/dl/openmulti/raw`, {
        headers: { Range: range },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 16-20/21");
      expect(await res.text()).toBe("56789");
    }
  });

  it("bytes=0-999 → 206，全文，end 被夹到 20", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openmulti/raw`, {
      headers: { Range: "bytes=0-999" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-20/21");
    expect(res.headers.get("Content-Length")).toBe("21");
    expect(await res.text()).toBe(MULTI_BODY);
  });

  it("bytes=21- → 416，带 Content-Range: bytes */21", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openmulti/raw`, {
      headers: { Range: "bytes=21-" },
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */21");
  });

  it("畸形 / 多段 Range → 忽略，200 全文", async () => {
    for (const range of ["bytes=abc", "bytes=0-4, bytes=10-14"]) {
      const res = await SELF.fetch(`${BASE}/dl/openmulti/raw`, {
        headers: { Range: range },
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(MULTI_BODY);
    }
  });

  it("有口令的分享：带 Range、无口令 → 403（Range 不绕口令）", async () => {
    const res = await SELF.fetch(`${BASE}/dl/protmulti/raw`, {
      headers: { Range: "bytes=0-4" },
    });
    expect(res.status).toBe(403);
  });

  it("有口令的分享：带 Range、对口令 → 206", async () => {
    const res = await SELF.fetch(
      `${BASE}/dl/protmulti/raw?password=${TEST_PASSWORD}`,
      { headers: { Range: "bytes=0-4" } },
    );
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("HELLO");
  });
});

describe("多块文件 Range：管理员下载 GET /api/files/:id/download", () => {
  it("bytes=3-10 → 206，跨块", async () => {
    const res = await SELF.fetch(`${BASE}/api/files/3/download`, {
      headers: { ...SESSION, Range: "bytes=3-10" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 3-10/21");
    expect(await res.text()).toBe("LOWORLD!");
  });

  it("bytes=21- → 416", async () => {
    const res = await SELF.fetch(`${BASE}/api/files/3/download`, {
      headers: { ...SESSION, Range: "bytes=21-" },
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */21");
  });

  it("无 Range → 200 全文（回归：不断流）", async () => {
    const res = await SELF.fetch(`${BASE}/api/files/3/download`, {
      headers: SESSION,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(MULTI_BODY);
  });
});

describe("单块文件 Range：公开分享 raw 直链 GET /dl/openfile/raw", () => {
  it("bytes=1-3 → 206，Telegram 直传的 Range 透传", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openfile/raw`, {
      headers: { Range: "bytes=1-3" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 1-3/5");
    expect(await res.text()).toBe("ELL");
  });

  it("bytes=5- → 416（本地校验，不用等 Telegram）", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openfile/raw`, {
      headers: { Range: "bytes=5-" },
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */5");
  });

  it("无 Range → 200 全文", async () => {
    const res = await SELF.fetch(`${BASE}/dl/openfile/raw`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(FILE_BODY);
  });
});
