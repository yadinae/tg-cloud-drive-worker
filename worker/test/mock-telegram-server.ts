/**
 * Mock Telegram Bot API server (runs in Node, NOT in the worker).
 *
 * Test files run inside workerd, where `node:http` servers cannot be created,
 * so this server is started from the Vitest `globalSetup` file and the worker
 * is pointed at it through `TG_API_BASE_URL` (see vitest.config.ts).
 *
 * It answers the only two Telegram calls the download path makes:
 *   POST /bot<token>/getFile          → { file_path: "documents/<file_id>" }
 *   GET  /file/bot<token>/documents/<file_id> → that chunk's body
 *
 * Chunk bodies are distinct per file_id so multi-chunk downloads and Range
 * slices are observable end to end:
 *   tg-chunk-1 → "HELLO"        (5 bytes)
 *   tg-chunk-2 → "WORLD!"       (6 bytes)
 *   tg-chunk-3 → "0123456789"   (10 bytes)
 * A 3-chunk file built from these is 21 bytes: "HELLOWORLD!0123456789".
 *
 * The file GET honors Range headers (single byte-range → 206 with
 * Content-Range; unsatisfiable → 416), mirroring what the real Telegram
 * file server does, so the worker's single-chunk Range passthrough is
 * testable too.
 */
import { createServer, type Server } from "node:http";
import { appendFileSync } from "node:fs";

export const MOCK_FILE_BODY = "HELLO";
export const MOCK_TOKEN = "test-bot-token";

export const MOCK_FILES: Record<string, string> = {
  "tg-chunk-1": "HELLO",
  "tg-chunk-2": "WORLD!",
  "tg-chunk-3": "0123456789",
};

// Request log for debugging: the worker runs in workerd, so its requests to
// this server are only visible here, not in the test output.
const LOG_PATH = "/tmp/mock-tg-requests.log";
function logRequest(reqMethod: string, path: string, status: number): void {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${reqMethod} ${path} -> ${status}\n`);
  } catch {
    // logging must never break the mock
  }
}

/** Minimal single-range parse for the mock file server (not the worker's parser). */
function parseMockRange(
  header: string | undefined,
  total: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=([^,]+)$/.exec(header.trim());
  if (!m) return null;
  const spec = m[1].trim();
  if (spec.startsWith("-")) {
    const suffix = Number(spec.slice(1));
    if (!Number.isInteger(suffix) || suffix <= 0) return "unsatisfiable";
    if (suffix >= total) return { start: 0, end: total - 1 };
    return { start: total - suffix, end: total - 1 };
  }
  const parts = spec.split("-");
  if (parts.length !== 2) return null;
  const start = Number(parts[0]);
  const end = parts[1] === "" ? total - 1 : Number(parts[1]);
  if (!Number.isInteger(start) || start < 0) return null;
  if (parts[1] !== "" && (!Number.isInteger(end) || end < start)) return null;
  if (start >= total) return "unsatisfiable";
  return { start, end: Math.min(end, total - 1) };
}

export function createMockTelegramServer(): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === `/bot${MOCK_TOKEN}/getFile`) {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        let fileId = "tg-chunk-1";
        try {
          fileId = JSON.parse(Buffer.concat(chunks).toString()).file_id ?? fileId;
        } catch {
          // fall through with the default
        }
        const body = MOCK_FILES[fileId];
        if (body === undefined) {
          logRequest(req.method ?? "", url.pathname, 404);
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, description: "file not found" }));
          return;
        }
        logRequest(req.method ?? "", url.pathname, 200);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            result: { file_path: `documents/${fileId}`, file_size: body.length },
          }),
        );
      });
      return;
    }
    const fileMatch = url.pathname.match(
      new RegExp(`^/file/bot${MOCK_TOKEN}/documents/(.+)$`),
    );
    if (req.method === "GET" && fileMatch) {
      const body = MOCK_FILES[fileMatch[1]];
      if (body === undefined) {
        logRequest(req.method ?? "", url.pathname, 404);
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, description: "not found" }));
        return;
      }
      const parsed = parseMockRange(req.headers.range, body.length);
      if (parsed === "unsatisfiable") {
        logRequest(req.method ?? "", url.pathname, 416);
        res.writeHead(416, {
          "Content-Range": `bytes */${body.length}`,
          "Content-Type": "application/octet-stream",
        });
        res.end();
        return;
      }
      if (parsed) {
        const slice = body.slice(parsed.start, parsed.end + 1);
        logRequest(req.method ?? "", url.pathname, 206);
        res.writeHead(206, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(slice.length),
          "Content-Range": `bytes ${parsed.start}-${parsed.end}/${body.length}`,
          "Accept-Ranges": "bytes",
        });
        res.end(slice);
        return;
      }
      logRequest(req.method ?? "", url.pathname, 200);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
      });
      res.end(body);
      return;
    }
    logRequest(req.method ?? "", url.pathname, 404);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, description: "not found" }));
  });
}

/** Listen on 127.0.0.1 with the given fixed port; resolves with the port. */
export function listenMockTelegram(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(port));
  });
}
