-- TG Cloud Drive Worker — D1 Metadata Schema (v3: Topic-based + Folders)
-- Topics mirror Telegram supergroup forum topics (话题).
-- Files are stored as document messages in topics.
-- Folders provide hierarchical organization within topics.

-- Topics (1:1 with Telegram forum topics)
CREATE TABLE IF NOT EXISTS topics (
  topic_id    INTEGER PRIMARY KEY,  -- Telegram's message_thread_id
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Files (each row = one logical file, stored as document in a topic)
CREATE TABLE IF NOT EXISTS files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id        INTEGER NOT NULL,      -- message_thread_id in Telegram
  name            TEXT NOT NULL,
  size            INTEGER NOT NULL DEFAULT 0,
  mime_type       TEXT NOT NULL DEFAULT 'application/octet-stream',
  manifest        TEXT NOT NULL DEFAULT '[]',   -- JSON array of {file_id, size, part_index}
  chunk_count     INTEGER NOT NULL DEFAULT 1,
  bot_file_id     TEXT,                      -- primary Bot API file_id
  file_unique_id  TEXT,
  message_id      INTEGER,                   -- message ID in the topic
  folder_id       INTEGER,                   -- optional folder (v3+)
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Folders (hierarchical organization within topics, v3+)
CREATE TABLE IF NOT EXISTS folders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id    INTEGER NOT NULL,
  parent_id   INTEGER,
  name        TEXT NOT NULL,
  created_at  INTEGER DEFAULT (unixepoch()),
  updated_at  INTEGER DEFAULT (unixepoch())
);

-- Shares (kept in KV for fast access, D1 as secondary)
CREATE TABLE IF NOT EXISTS shares (
  code            TEXT PRIMARY KEY,
  file_id         INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  password_hash   TEXT,
  expires_at      INTEGER,
  download_count  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_files_topic ON files(topic_id);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_topic ON folders(topic_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_shares_file ON shares(file_id);
