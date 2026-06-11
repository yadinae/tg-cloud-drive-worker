// HTTP API client — replaces GramJS client
const API_BASE = '';
const CHUNK_THRESHOLD = 18 * 1024 * 1024; // 18MB — uploads > this get chunked client-side

function getToken(): string | null {
  return localStorage.getItem('tgcd_auth_token');
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const h = { ...(opts.headers as Record<string, string>) } as Record<string, string>;
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) h['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: h });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('octet-stream')) return res as unknown as T;
  return res.json();
}

export async function login(token: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/stats`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { localStorage.setItem('tgcd_auth_token', token); return true; }
    return false;
  } catch { return false; }
}
export function logout() { localStorage.removeItem('tgcd_auth_token'); }
export function isAuthed(): boolean { return !!getToken(); }

export const fetchStats = () => req<{ fileCount: number; totalSize: number; topicCount: number }>('/api/stats');
export const fetchTopics = () => req<{ topics: any[] }>('/api/topics');
export const createTopic = (name: string) => req<{ ok: boolean; topic: any }>('/api/topics', { method: 'POST', body: JSON.stringify({ name }) });
export const renameTopic = (topicId: number, name: string) => req<{ ok: boolean }>(`/api/topics/${topicId}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteTopic = (topicId: number) => req<{ ok: boolean }>(`/api/topics/${topicId}`, { method: 'DELETE' });

export const fetchFiles = (topicId: number) => req<{ files: any[] }>(`/api/files?topicId=${topicId}`);
export const searchFiles = (q: string) => req<{ files: any[] }>(`/api/files?q=${encodeURIComponent(q)}`);

/**
 * Upload a single file to a topic. Files >18MB are split into chunks client-side.
 */
function uploadSingleFile(topicId: number, file: File, token: string | null, onProgress?: (pct: number) => void): Promise<{ ok: boolean; fileId: number }> {
  // ─── Small files: single upload with XHR progress ───
  if (file.size <= CHUNK_THRESHOLD) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file); fd.append('topicId', String(topicId)); fd.append('mimeType', file.type);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/files/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolve(data);
          else reject(new Error(data.error || `HTTP ${xhr.status}`));
        } catch { reject(new Error('Invalid response')); }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(fd);
    });
  }

  // ─── Large files: chunked upload ───
  const CHUNK_SIZE = 18 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = crypto.randomUUID();

  async function run() {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const fd = new FormData();
      fd.append('file', chunk, `chunk_${i}`);
      fd.append('uploadId', uploadId);
      fd.append('chunkIndex', String(i));
      fd.append('totalChunks', String(totalChunks));
      fd.append('topicId', String(topicId));
      fd.append('fileName', file.name);
      fd.append('fileSize', String(file.size));
      fd.append('mimeType', file.type);

      await new Promise<void>((resolveChunk, rejectChunk) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/files/upload-chunk`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const chunkPct = e.loaded / e.total;
            const overall = Math.round(((i + chunkPct) / totalChunks) * 100);
            onProgress(overall);
          }
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolveChunk();
            else rejectChunk(new Error(data.error || `HTTP ${xhr.status}`));
          } catch { rejectChunk(new Error('Invalid response')); }
        };
        xhr.onerror = () => rejectChunk(new Error('Network error'));
        xhr.send(fd);
      });
    }
    return req<{ ok: boolean; fileId: number }>('/api/files/finalize', {
      method: 'POST',
      body: JSON.stringify({ uploadId, topicId, name: file.name, size: file.size, mimeType: file.type, totalChunks }),
    });
  }

  return run();
}

/**
 * Upload multiple files to a topic. Reports per-file progress.
 */
export async function uploadFiles(
  topicId: number,
  files: File[],
  onFileProgress?: (index: number, pct: number, status: 'uploading' | 'done' | 'error', error?: string) => void,
  onAllDone?: () => void,
): Promise<void> {
  const token = getToken();
  for (let i = 0; i < files.length; i++) {
    try {
      onFileProgress?.(i, 0, 'uploading');
      await uploadSingleFile(topicId, files[i], token, (pct) => onFileProgress?.(i, pct, 'uploading'));
      onFileProgress?.(i, 100, 'done');
    } catch (err: any) {
      onFileProgress?.(i, 0, 'error', err.message);
    }
  }
  onAllDone?.();
}

export const renameFile = (id: number, name: string) => req<{ ok: boolean }>(`/api/files/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const moveFile = (id: number, topicId: number) => req<{ ok: boolean }>(`/api/files/${id}/move`, { method: 'PUT', body: JSON.stringify({ topicId }) });
export const deleteFile = (id: number) => req<{ ok: boolean }>(`/api/files/${id}`, { method: 'DELETE' });

export const getDlUrl = (id: number) => {
  const token = getToken();
  return `/api/files/${id}/download?token=${token}`;
};

/**
 * Download a file with progress tracking via fetch + ReadableStream.
 * Resolves when the blob is ready and triggers the browser save dialog.
 */
export function downloadFileWithProgress(
  fileId: number,
  fileName: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const token = getToken();
  const url = `${API_BASE}/api/files/${fileId}/download?token=${encodeURIComponent(token || '')}`;

  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(url);

      if (!res.ok) {
        // Try to read error body
        try {
          const errData = await res.json();
          reject(new Error(errData.error || 'HTTP ' + res.status));
        } catch {
          reject(new Error('Download failed (HTTP ' + res.status + ')'));
        }
        return;
      }

      const contentLength = res.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!total || !res.body) {
        // Fallback: no streaming progress, just get the blob
        const blob = await res.blob();
        triggerDownload(blob, fileName);
        onProgress?.(100);
        resolve();
        return;
      }

      // Stream with progress tracking
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (onProgress && total > 0) {
          onProgress(Math.round((received / total) * 100));
        }
      }

      // Assemble blob and trigger download
      const blob = new Blob(chunks, { type: 'application/octet-stream' });
      triggerDownload(blob, fileName);
      onProgress?.(100);
      resolve();
    } catch (err: any) {
      reject(new Error(err.message || 'Download failed'));
    }
  });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const createShare = (p: { fileId: number; password?: string; expiresIn?: number }) => req<{ ok: boolean; code: string; url: string }>('/api/shares', { method: 'POST', body: JSON.stringify(p) });
export const fetchShares = (fileId: number) => req<{ shares: any[] }>(`/api/shares?fileId=${fileId}`);
export const deleteShare = (code: string) => req<{ ok: boolean }>(`/api/shares/${code}`, { method: 'DELETE' });
export const fetchAllShares = () => req<{ shares: any[] }>('/api/shares/list-all');
export const updateShare = (code: string, p: { password?: string; expiresIn?: number }) =>
  req<{ ok: boolean }>(`/api/shares/${code}`, { method: 'PUT', body: JSON.stringify(p) });
