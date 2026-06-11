// ───── Shared types for frontend ─────

export interface Folder {
  id: number;
  name: string;
  parentId: number | null;
  createdAt: number;
}

export interface DriveFile {
  id: number;
  folderId: number;
  name: string;
  size: number;
  mimeType: string;
  chunkCount: number;
  createdAt: number;
}

export interface ShareLink {
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

export interface DriveStats {
  fileCount: number;
  totalSize: number;
  folderCount: number;
}

export interface ShareCreatePayload {
  fileId: number;
  password?: string;
  expiresIn?: number;
}

// Allow webkitdirectory attribute on HTML input elements
declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string | boolean;
  }
}
