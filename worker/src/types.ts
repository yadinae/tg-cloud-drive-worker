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
export interface FolderRow {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface FileRow {
  id: number;
  folder_id: number;
  name: string;
  size: number;
  mime_type: string;
  /** JSON string of ChunkInfo[] */
  manifest: string;
  chunk_count: number;
  bot_file_id: string | null;
  file_unique_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface ChunkInfo {
  file_id: string;
  file_unique_id: string;
  size: number;
  part_index: number;
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
export interface FolderResponse {
  id: number;
  name: string;
  parentId: number | null;
  createdAt: number;
}

export interface FileResponse {
  id: number;
  folderId: number;
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

export interface ShareVerifyPayload {
  code: string;
  password: string;
}
