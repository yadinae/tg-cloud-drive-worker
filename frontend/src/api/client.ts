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

export const fetchFiles = (topicId: number, folderId?: string) => {
  let path = `/api/files?topicId=${topicId}`;
  if (folderId !== undefined) path += `&folderId=${folderId}`;
  return req<{ files: any[] }>(path);
};
export const searchFiles = (q: string) => req<{ files: any[] }>(`/api/files?q=${encodeURIComponent(q)}`);

/**
 * Upload a file to a topic. Files >18MB are split into chunks client-side.
 * Optionally upload into a specific folder.
 */
export function uploadFile(topicId: number, file: File, onProgress?: (pct: number) => void, folderId?: number | null): Promise<{ ok: boolean; fileId: number }> {
  const token = getToken();

  // ─── Small files: single upload with XHR progress ───
  if (file.size <= CHUNK_THRESHOLD) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file); fd.append('topicId', String(topicId)); fd.append('mimeType', file.type);
      if (folderId !== undefined && folderId !== null) fd.append('folderId', String(folderId));
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
  const CHUNK_SIZE = 18 * 1024 * 1024; // 18MB per chunk — must be under Bot API 20MB download limit
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
      if (folderId !== undefined && folderId !== null) fd.append('folderId', String(folderId));

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
    // Finalize
    return req<{ ok: boolean; fileId: number }>('/api/files/finalize', {
      method: 'POST',
      body: JSON.stringify({ uploadId, topicId, name: file.name, size: file.size, mimeType: file.type, totalChunks, folderId }),
    });
  }

  return run();
}

export const renameFile = (id: number, name: string) => req<{ ok: boolean }>(`/api/files/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteFile = (id: number) => req<{ ok: boolean }>(`/api/files/${id}`, { method: 'DELETE' });

export const getDlUrl = (id: number) => {
  return `/api/files/${id}/download`; // No token in URL for security
};
export const getDownloadUrl = (id: number) => {
  return `/api/files/${id}/download?dl=1`;
};

/**
 * Download a file with real progress tracking.
 * Uses fetch() + ReadableStream for accurate byte-level progress on both
 * 302 redirects (single-chunk) and streaming responses (multi-chunk).
 * Downloads the full blob in-memory, then triggers browser save dialog.
 */
export async function downloadFile(
  id: number,
  fileName: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/files/${id}/download?dl=1`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    redirect: 'manual', // don't follow 302 — handle ourselves
  });

  // Single-chunk: 302 redirect to Telegram CDN
  if (res.status === 302) {
    const dlUrl = res.headers.get('Location');
    if (!dlUrl) throw new Error('No redirect location');
    // Browser-download the CDN URL directly (no progress, but fastest path)
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onProgress?.(100);
    return;
  }

  // Multi-chunk: streaming response — track progress by bytes received
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const contentLength = parseInt(res.headers.get('Content-Length') || '0', 10);
  const reader = res.body!.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0 && onProgress) {
      onProgress(Math.round((received / contentLength) * 100));
    }
  }

  const blob = new Blob(chunks);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download multiple files sequentially (one by one) with individual progress.
 * onProgress receives (currentIndex, totalCount, fileName, filePercent).
 */
export async function downloadFiles(
  files: { id: number; name: string }[],
  onProgress?: (idx: number, total: number, name: string, pct: number) => void,
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(i + 1, files.length, f.name, 0);
    await downloadFile(f.id, f.name, (pct) => {
      onProgress?.(i + 1, files.length, f.name, pct);
    });
    onProgress?.(i + 1, files.length, f.name, 100);
  }
}

export const createShare = (p: { fileId: number; password?: string; expiresIn?: number }) => req<{ ok: boolean; code: string; url: string }>('/api/shares', { method: 'POST', body: JSON.stringify(p) });
export const fetchShares = (fileId: number) => req<{ shares: any[] }>(`/api/shares?fileId=${fileId}`);
export const deleteShare = (code: string) => req<{ ok: boolean }>(`/api/shares/${code}`, { method: 'DELETE' });
export const fetchAllShares = () => req<{ shares: any[] }>('/api/shares/list-all');
export const updateShare = (code: string, p: { password?: string; expiresIn?: number }) =>
  req<{ ok: boolean }>(`/api/shares/${code}`, { method: 'PUT', body: JSON.stringify(p) });

export const transferFromUrl = (p: { url: string; topicId: number; name?: string; folderId?: number | null }) =>
  req<{ ok: boolean; fileId: number }>('/api/transfer', { method: 'POST', body: JSON.stringify(p) });

// ───── Folders ─────
export const fetchFolders = (topicId: number, parentId?: number | null) => {
  let path = `/api/folders?topicId=${topicId}`;
  if (parentId !== undefined) path += `&parentId=${parentId ?? ''}`;
  return req<{ folders: any[] }>(path);
};
export const createFolderApi = (topicId: number, name: string, parentId?: number | null) =>
  req<{ ok: boolean; folder: any }>('/api/folders', { method: 'POST', body: JSON.stringify({ topicId, name, parentId: parentId ?? null }) });
export const renameFolderApi = (id: number, name: string) =>
  req<{ ok: boolean }>(`/api/folders/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteFolderApi = (id: number, topicId: number) =>
  req<{ ok: boolean }>(`/api/folders/${id}?topicId=${topicId}`, { method: 'DELETE' });
export const fetchFolderPath = (id: number) =>
  req<{ path: { id: number; name: string }[] }>(`/api/folders/${id}/path`);
