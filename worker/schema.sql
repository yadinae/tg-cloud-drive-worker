-- TG Cloud Drive Worker — D1 Metadata Schema
-- Stores file/folder hierarchy (not file bytes — those go to Telegram channel via Bot API)

-- Folders (replaces Telegram supergroup topics)
CREATE TABLE IF NOT EXISTS folders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Files (each row = one logical file, may have multiple chunks if >50MB)
CREATE TABLE IF NOT EXISTS files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id       INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  size            INTEGER NOT NULL DEFAULT 0,
  mime_type       TEXT NOT NULL DEFAULT 'application/octet-stream',
  -- For single-chunk files: chunk_count=1, manifest is '[{"file_id":"...","size":N}]'
  -- For multi-chunk files: manifest is JSON array of {file_id, size, part_index}
  manifest        TEXT NOT NULL DEFAULT '[]',
  chunk_count     INTEGER NOT NULL DEFAULT 1,
  bot_file_id     TEXT,                      -- primary Bot API file_id (first/only chunk)
  file_unique_id  TEXT,                      -- Telegram unique ID for dedup
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Shares (kept in KV for compatibility, D1 as secondary/query layer)
CREATE TABLE IF NOT EXISTS shares (
  code            TEXT PRIMARY KEY,
  file_id         INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  password_hash   TEXT,
  expires_at      INTEGER,
  download_count  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_shares_file ON shares(file_id);
