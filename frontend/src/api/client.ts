// HTTP API client — replaces GramJS client
const API_BASE = '';

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
export const uploadFile = (topicId: number, file: File) => {
  const fd = new FormData();
  fd.append('file', file); fd.append('topicId', String(topicId)); fd.append('mimeType', file.type);
  return req<{ ok: boolean; fileId: number }>('/api/files/upload', { method: 'POST', body: fd });
};
export const renameFile = (id: number, name: string) => req<{ ok: boolean }>(`/api/files/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteFile = (id: number) => req<{ ok: boolean }>(`/api/files/${id}`, { method: 'DELETE' });

export const getDlUrl = (id: number) => {
  const token = getToken();
  return `/api/files/${id}/download?token=${token}`;
};

export const createShare = (p: { fileId: number; password?: string; expiresIn?: number }) => req<{ ok: boolean; code: string; url: string }>('/api/shares', { method: 'POST', body: JSON.stringify(p) });
export const fetchShares = (fileId: number) => req<{ shares: any[] }>(`/api/shares?fileId=${fileId}`);
export const deleteShare = (code: string) => req<{ ok: boolean }>(`/api/shares/${code}`, { method: 'DELETE' });
