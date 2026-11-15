/**
 * Mock Telegram Bot API server (runs in Node, NOT in the worker).
 *
 * Test files run inside workerd, where `node:http` servers cannot be created,
 * so this server is started from the Vitest `globalSetup` file and the worker
 * is pointed at it through `TG_API_BASE_URL` (see vitest.config.ts).
 *
 * It answers the only two Telegram calls the download path makes:
 *   POST /bot<token>/getFile          → { file_path: "documents/chunk-1" }
 *   GET  /file/bot<token>/documents/chunk-1 → the 5-byte file body
 */
import { createServer, type Server } from "node:http";
import { appendFileSync } from "node:fs";

export const MOCK_FILE_BODY = "HELLO";
export const MOCK_TOKEN = "test-bot-token";

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

export function createMockTelegramServer(): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === `/bot${MOCK_TOKEN}/getFile`) {
      req.resume();
      req.on("end", () => {
        logRequest(req.method ?? "", url.pathname, 200);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            result: { file_path: "documents/chunk-1", file_size: 5 },
          }),
        );
      });
      return;
    }
    if (
      req.method === "GET" &&
      url.pathname === `/file/bot${MOCK_TOKEN}/documents/chunk-1`
    ) {
      logRequest(req.method ?? "", url.pathname, 200);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(MOCK_FILE_BODY.length),
      });
      res.end(MOCK_FILE_BODY);
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
