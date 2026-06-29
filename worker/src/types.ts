import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// ───── Bindings ─────
export interface Env {
  DB: D1Database;
  SHARES: KVNamespace;
  TG_BOT_TOKEN: string;
  STORAGE_CHANNEL_ID: string;
  DRIVE_AUTH_TOKEN: string;
  /** Optional: custom Bot API base URL (e.g. self-hosted Bot API server).
   *  Defaults to https://api.telegram.org when not set.
   *  Enables >2GB file uploads via local Bot API server. */
  TG_API_BASE_URL?: string;
  /** Optional: max concurrent Bot API calls per instance (default: 2).
   *  Helps prevent 429 rate limits under heavy upload concurrency. */
  TG_API_CONCURRENCY?: string;  // parsed as number, default 2
}

// ───── D1 Row Types ─────
export interface TopicRow {
  topic_id: number;     // Telegram's message_thread_id
  name: string;
  created_at: number;
  updated_at: number;
}

export interface FileRow {
  id: number;
  topic_id: number;
  folder_id: number | null;
  name: string;
  size: number;
  mime_type: string;
  /** JSON string of ChunkInfo[] */
  manifest: string;
  chunk_count: number;
  bot_file_id: string | null;
  file_unique_id: string | null;
  message_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface ChunkInfo {
  file_id: string;
  file_unique_id: string;
  size: number;
  part_index: number;
  message_id?: number;  // Telegram message ID for deleteMessage
}

export interface ShareRow {
  code: string;
  file_id: number;
  password_hash: string | null;
  expires_at: number | null;
  download_count: number;
  created_at: number;
}

// ───── API Response Shapes ─────
export interface TopicResponse {
  topicId: number;      // message_thread_id
  name: string;
  fileCount: number;    // populated by JOIN
  createdAt: number;
}

export interface FileResponse {
  id: number;
  topicId: number;
  folderId: number | null;
  name: string;
  size: number;
  mimeType: string;
  chunkCount: number;
  createdAt: number;
}

export interface ShareResponse {
  code: string;
  fileId: number;
  fileName: string;
  fileSize: number;
  hasPassword: boolean;
  password: string | null;
  expiresAt: number | null;
  downloadCount: number;
  createdAt: number;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  totalChunks: number;
  uploadedChunks: number;
  totalBytes: number;
  uploadedBytes: number;
  status: 'preparing' | 'uploading' | 'finalizing' | 'done' | 'error';
  error?: string;
}

// ───── Share Payloads ─────
export interface ShareCreatePayload {
  fileId: number;
  password?: string;
  expiresIn?: number; // seconds from now
}

export interface ShareUpdatePayload {
  password?: string;   // empty string to remove, omit to keep
  expiresIn?: number;  // 0 to remove expiry, omit to keep
}

export interface ConfigRow {
  key: string;
  value: string;
  description: string;
  updated_at?: number;
}

export interface ShareVerifyPayload {
  code: string;
  password: string;
}

// ───── Folder Types ─────
export interface FolderRow {
  id: number;
  topic_id: number;
  parent_id: number | null;
  name: string;
  created_at: number;
}

export interface FolderResponse {
  id: number;
  topicId: number;
  parentId: number | null;
  name: string;
  fileCount: number;
  createdAt: number;
}

// ───── Folder Share Types ─────
export interface FolderShareCreatePayload {
  topicId: number;
  folderId?: number | null; // null = topic root
  password?: string;
  expiresIn?: number; // seconds from now
}

export interface FolderShareUpdatePayload {
  password?: string;  // empty string to remove, omit to keep
  expiresIn?: number; // 0 to remove expiry, omit to keep
}

export interface FolderShareRecord {
  topicId: number;
  folderId: number | null;
  name: string;        // display name (folder name or topic name)
  passwordHash: string | null;
  password?: string | null; // plaintext for display
  createdAt: number;
  downloadCount: number;
  expiresAt: number | null;
  fileCount: number;
}

export interface FolderShareResponse {
  code: string;
  topicId: number;
  folderId: number | null;
  name: string;
  fileCount: number;
  hasPassword: boolean;
  password: string | null;
  expiresAt: number | null;
  downloadCount: number;
  createdAt: number;
}

export interface FolderShareVerifyResponse {
  ok: boolean;
  files?: FileResponse[];
  name?: string;
  error?: string;
}
