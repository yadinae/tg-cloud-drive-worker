// HTTP API client — replaces GramJS client
const API_BASE = '';
const CHUNK_THRESHOLD = 18 * 1024 * 1024; // 18MB — uploads > this get chunked client-side

function getSessionId(): string | null {
  return localStorage.getItem('tgcd_session_id');
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const sessionId = getSessionId();
  const h = { ...(opts.headers as Record<string, string>) } as Record<string, string>;
  if (sessionId) h['X-Session-Id'] = sessionId;
  // Fallback: also send Bearer token if present (backward compat)
  const token = localStorage.getItem('tgcd_auth_token');
  if (token && !sessionId) h['Authorization'] = `Bearer ${token}`;
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

export async function login(password: string): Promise<string | null> {
  try {
    const r = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await r.json();
    if (data.ok && data.sessionId) {
      localStorage.setItem('tgcd_session_id', data.sessionId);
      localStorage.removeItem('tgcd_auth_token'); // clean up old token
      return data.sessionId;
    }
    return null;
  } catch { return null; }
}

export async function logout() {
  const sessionId = getSessionId();
  if (sessionId) {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { 'X-Session-Id': sessionId },
      });
    } catch { /* ignore */ }
  }
  localStorage.removeItem('tgcd_session_id');
  localStorage.removeItem('tgcd_auth_token');
}

export async function isAuthed(): Promise<boolean> {
  const sessionId = getSessionId();
  if (!sessionId) {
    // Fallback: check if old Bearer token exists
    return !!localStorage.getItem('tgcd_auth_token');
  }
  try {
    const r = await fetch(`${API_BASE}/api/auth/session?session=${sessionId}`);
    const data = await r.json();
    if (data.ok) return true;
    // Session expired
    localStorage.removeItem('tgcd_session_id');
    return false;
  } catch { return true; } // Optimistic — server might be down
}

export const fetchStats = () => req<{ fileCount: number; totalSize: number; topicCount: number }>('/api/stats');
export const fetchTopics = () => req<{ topics: any[] }>('/api/topics');
export const createTopic = (name: string) => req<{ ok: boolean; topic: any }>('/api/topics', { method: 'POST', body: JSON.stringify({ name }) });
export const renameTopic = (topicId: number, name: string) => req<{ ok: boolean }>(`/api/topics/${topicId}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteTopic = (topicId: number) => req<{ ok: boolean }>(`/api/topics/${topicId}`, { method: 'DELETE' });

export const fetchFiles = (topicId: number, folderId?: string, page?: number, pageSize?: number) => {
  let path = `/api/files?topicId=${topicId}`;
  if (folderId !== undefined) path += `&folderId=${folderId}`;
  if (page !== undefined) path += `&page=${page}&pageSize=${pageSize || 50}`;
  return req<{ files: any[]; total: number; page: number; pageSize: number }>(path);
};
export const searchFiles = (q: string) => req<{ files: any[] }>(`/api/files?q=${encodeURIComponent(q)}`);

// Get auth header value for XHR requests (session-based or token fallback)
function getAuthHeader(): Record<string, string> {
  const sessionId = localStorage.getItem('tgcd_session_id');
  if (sessionId) return { 'X-Session-Id': sessionId };
  const token = localStorage.getItem('tgcd_auth_token');
  if (token) return { 'Authorization': `Bearer ${token}` };
  return {};
}

/**
 * Upload a file to a topic. Files >18MB are split into chunks client-side.
 * Optionally upload into a specific folder.
 */
export function uploadFile(topicId: number, file: File, onProgress?: (pct: number) => void, folderId?: number | null): Promise<{ ok: boolean; fileId: number }> {
  const authHeaders = getAuthHeader();

  // ─── Small files: single upload with XHR progress ───
  if (file.size <= CHUNK_THRESHOLD) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file); fd.append('topicId', String(topicId)); fd.append('mimeType', file.type);
      if (folderId !== undefined && folderId !== null) fd.append('folderId', String(folderId));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/files/upload`);
      const sessionId = authHeaders['X-Session-Id'];
      if (sessionId) xhr.setRequestHeader('X-Session-Id', sessionId);
      else if (authHeaders['Authorization']) xhr.setRequestHeader('Authorization', authHeaders['Authorization']);
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
    try {
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
          const sessionId = authHeaders['X-Session-Id'];
          if (sessionId) xhr.setRequestHeader('X-Session-Id', sessionId);
          else if (authHeaders['Authorization']) xhr.setRequestHeader('Authorization', authHeaders['Authorization']);
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
        // Pace chunks: 1.5s gap keeps us well under 20/min Bot API limit
        if (i < totalChunks - 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      // Finalize
      return req<{ ok: boolean; fileId: number }>('/api/files/finalize', {
        method: 'POST',
        body: JSON.stringify({ uploadId, topicId, name: file.name, size: file.size, mimeType: file.type, totalChunks, folderId }),
      });
    } catch (err) {
      // Upload failed — clean up orphaned chunks from Telegram
      try {
        await fetch(`${API_BASE}/api/files/cleanup-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeaders['X-Session-Id'] ? { 'X-Session-Id': authHeaders['X-Session-Id'] } : authHeaders['Authorization'] ? { 'Authorization': authHeaders['Authorization'] } : {}) },
          body: JSON.stringify({ uploadId }),
        });
      } catch { /* cleanup is best-effort */ }
      throw err;
    }
  }

  return run();
}

export const renameFile = (id: number, name: string) => req<{ ok: boolean }>(`/api/files/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteFile = (id: number) => req<{ ok: boolean }>(`/api/files/${id}`, { method: 'DELETE' });

export const getDlUrl = (id: number) => {
  const sessionId = localStorage.getItem('tgcd_session_id');
  if (sessionId) return `/api/files/${id}/download?session=${sessionId}`;
  const token = localStorage.getItem('tgcd_auth_token');
  if (token) return `/api/files/${id}/download?token=${token}`;
  return `/api/files/${id}/download`;
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
  const authHeaders = getAuthHeader();
  const res = await fetch(`${API_BASE}/api/files/${id}/download?dl=1`, {
    headers: authHeaders,
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

  const contentLength = parseInt(res.headers.get('X-Total-Size') || res.headers.get('Content-Length') || '0', 10);
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

// ───── Folder Shares ─────
export const createFolderShare = (p: { topicId: number; folderId?: number | null; password?: string; expiresIn?: number }) =>
  req<{ ok: boolean; code: string; url: string }>('/api/shares/folder', { method: 'POST', body: JSON.stringify(p) });

export const fetchAllFolderShares = () =>
  req<{ shares: any[] }>('/api/shares/folder/list-all');

export const deleteFolderShare = (code: string) =>
  req<{ ok: boolean }>(`/api/shares/folder/${code}`, { method: 'DELETE' });

export const updateFolderShare = (code: string, p: { password?: string; expiresIn?: number }) =>
  req<{ ok: boolean }>(`/api/shares/folder/${code}`, { method: 'PUT', body: JSON.stringify(p) });

// ───── Config / Settings ─────
export const fetchConfig = () => req<{ settings: Record<string, string> }>('/api/config');
export const updateConfig = (settings: Record<string, string>) =>
  req<{ ok: boolean }>('/api/config', { method: 'PUT', body: JSON.stringify(settings) });
export const changePassword = (oldPassword: string, newPassword: string) =>
  req<{ ok: boolean; message: string }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
