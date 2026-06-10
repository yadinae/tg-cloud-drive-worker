import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// ───── Bindings ─────
export interface Env {
  DB: D1Database;
  SHARES: KVNamespace;
  TG_BOT_TOKEN: string;
  STORAGE_CHANNEL_ID: string;
  DRIVE_AUTH_TOKEN: string;
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
  topic_id: number;     // message_thread_id in Telegram
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
  password: string | null;   // plaintext for display
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

export interface ShareVerifyPayload {
  code: string;
  password: string;
}
