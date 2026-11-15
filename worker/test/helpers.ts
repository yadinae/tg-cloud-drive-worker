/**
 * Shared helpers for the password red-line tests.
 *
 * Seeding mirrors what the worker expects in production:
 * - D1: the tables from `worker/schema.sql` (inlined here — test files run
 *   inside workerd and cannot read files, so the SQL is copied, not loaded;
 *   keep it in sync with schema.sql) plus one topic and two single-chunk files.
 * - KV (`SHARES`): one password-protected + one public file share,
 *   one password-protected + one public folder share, and one admin session.
 * - Telegram: a local mock server (see test/mock-telegram-server.ts), started
 *   by the Vitest globalSetup and pointed at via `TG_API_BASE_URL`.
 */
import type { Env } from "../src/types";

export const TEST_PASSWORD = "correct-pw";
export const FILE_BODY = "HELLO";

export async function sha256Hex(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Mirrors worker/schema.sql (v3: topics + files + folders + shares).
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS topics (
    topic_id    INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id        INTEGER NOT NULL,
    name            TEXT NOT NULL,
    size            INTEGER NOT NULL DEFAULT 0,
    mime_type       TEXT NOT NULL DEFAULT 'application/octet-stream',
    manifest        TEXT NOT NULL DEFAULT '[]',
    chunk_count     INTEGER NOT NULL DEFAULT 1,
    bot_file_id     TEXT,
    file_unique_id  TEXT,
    message_id      INTEGER,
    folder_id       INTEGER,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS folders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id    INTEGER NOT NULL,
    parent_id   INTEGER,
    name        TEXT NOT NULL,
    created_at  INTEGER DEFAULT (unixepoch()),
    updated_at  INTEGER DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS shares (
    code            TEXT PRIMARY KEY,
    file_id         INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    password_hash   TEXT,
    expires_at      INTEGER,
    download_count  INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  "CREATE INDEX IF NOT EXISTS idx_files_topic ON files(topic_id)",
  "CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)",
  "CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id)",
  "CREATE INDEX IF NOT EXISTS idx_folders_topic ON folders(topic_id)",
  "CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)",
  "CREATE INDEX IF NOT EXISTS idx_shares_file ON shares(file_id)",
];

const MANIFEST = JSON.stringify([
  { file_id: "tg-chunk-1", size: 5, part_index: 0 },
]);

export async function seedDatabase(env: Env): Promise<void> {
  for (const stmt of SCHEMA_STATEMENTS) {
    await env.DB.prepare(stmt).run();
  }

  await env.DB.prepare("INSERT INTO topics (topic_id, name) VALUES (?, ?)")
    .bind(20, "Test Topic")
    .run();
  await env.DB.prepare(
    "INSERT INTO files (id, topic_id, name, size, mime_type, manifest, chunk_count, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(1, 20, "secret.txt", 5, "text/plain", MANIFEST, 1, null)
    .run();
  await env.DB.prepare(
    "INSERT INTO files (id, topic_id, name, size, mime_type, manifest, chunk_count, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(2, 20, "photo.png", 5, "image/png", MANIFEST, 1, null)
    .run();
}

export async function seedShares(env: Env): Promise<void> {
  const pwHash = await sha256Hex(TEST_PASSWORD);
  const now = Date.now();

  // Password-protected single-file share (file 1)
  await env.SHARES.put(
    "share:protfile",
    JSON.stringify({
      fileId: 1,
      fileName: "secret.txt",
      fileSize: 5,
      passwordHash: pwHash,
      password: TEST_PASSWORD,
      expiresAt: null,
      downloadCount: 0,
      maxDownloads: null,
    }),
  );
  // Public single-file share (file 1, no password)
  await env.SHARES.put(
    "share:openfile",
    JSON.stringify({
      fileId: 1,
      fileName: "secret.txt",
      fileSize: 5,
      passwordHash: null,
      password: null,
      expiresAt: null,
      downloadCount: 0,
      maxDownloads: null,
    }),
  );
  // Password-protected folder share (whole topic 20, files 1 + 2)
  await env.SHARES.put(
    "fldr:protfold",
    JSON.stringify({
      topicId: 20,
      folderId: null,
      name: "Test Topic",
      passwordHash: pwHash,
      password: TEST_PASSWORD,
      createdAt: now,
      downloadCount: 0,
      expiresAt: null,
      maxDownloads: null,
      fileCount: 2,
    }),
  );
  // Public folder share (whole topic 20)
  await env.SHARES.put(
    "fldr:openfold",
    JSON.stringify({
      topicId: 20,
      folderId: null,
      name: "Test Topic",
      passwordHash: null,
      password: null,
      createdAt: now,
      downloadCount: 0,
      expiresAt: null,
      maxDownloads: null,
      fileCount: 2,
    }),
  );
  // Admin session for the /api/files/:id/download tests
  await env.SHARES.put(
    "sess:test-session",
    JSON.stringify({ createdAt: now, expiresAt: now + 3_600_000 }),
  );
}
