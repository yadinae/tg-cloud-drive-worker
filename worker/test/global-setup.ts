/**
 * Vitest globalSetup (runs in Node, before the workers pool starts).
 *
 * Starts the mock Telegram server and hands its port to the pool config via
 * `project.provide` — the test files themselves run inside workerd and cannot
 * start a server or read files, so the port has to come from here.
 */
import {
  createMockTelegramServer,
  listenMockTelegram,
} from "./mock-telegram-server";

export default async function setup() {
  const server = createMockTelegramServer();
  // Fixed port: the pool config points the worker at it with a plain var.
  // (A dynamic port would need provide/inject; the pool evaluates its options
  // function before globalSetup runs, so inject returns undefined there.)
  const port = await listenMockTelegram(server, 18777);

  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}
