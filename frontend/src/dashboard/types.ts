// ───── Dashboard shared types & helpers ─────
// App.tsx used to define these inline; the split components import them
// from here so behaviour stays identical. Business logic is untouched.
import { c } from '../design-tokens';

export type View = 'login' | 'drive';

export type ShareCategory = 'active' | 'expiring' | 'expired';

export interface Topic { topicId: number; name: string; fileCount: number; createdAt: number; }
export interface DriveFile { id: number; topicId: number; folderId: number | null; name: string; size: number; mimeType: string; chunkCount: number; createdAt: number; }
export interface ShareLink { code: string; fileId: number; fileName: string; fileSize: number; hasPassword: boolean; password: string | null; expiresAt: number | null; downloadCount: number; createdAt: number; _type?: string; }
export interface Folder { id: number; topicId: number; parentId: number | null; name: string; fileCount: number; createdAt: number; }

export function formatBytes(b: number): string {
  if (!b || b <= 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatExpiry(expiresAt: number | null): { label: string; color: string } {
  if (!expiresAt) return { label: 'Never', color: c.mutedSoft };
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return { label: 'Expired', color: c.danger };
  const totalHours = remaining / 3600000;
  if (totalHours < 1) return { label: Math.max(1, Math.round(totalHours * 60)) + 'm', color: '#f97316' };
  if (totalHours < 23.5) return { label: Math.round(totalHours) + 'h', color: c.warning };
  return { label: Math.round(totalHours / 24) + 'd', color: c.success };
}

export function getCategory(share: ShareLink): ShareCategory {
  if (!share.expiresAt) return 'active';
  return share.expiresAt < Date.now() ? 'expired' :
    share.expiresAt < Date.now() + 86400000 ? 'expiring' : 'active';
}

export const EXPIRY_OPTIONS = [
  { label: 'Never', value: 0 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '1 day', value: 86400 },
  { label: '3 days', value: 259200 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
];

export const CATEGORY_META: Record<ShareCategory, { label: string; tone: 'success' | 'warning' | 'danger'; color: string }> = {
  active: { label: 'Active', tone: 'success', color: '#22c55e' },
  expiring: { label: 'Expiring', tone: 'warning', color: '#f59e0b' },
  expired: { label: 'Expired', tone: 'danger', color: '#f87171' },
};

/** File-type predicates, shared by the list, preview and audio player. */
export const isImageFile = (f: DriveFile) => f.mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(f.name);
export const isVideoFile = (f: DriveFile) => f.mimeType?.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(f.name);
export const isAudioFile = (f: DriveFile) => f.mimeType?.startsWith('audio/') || /\.(mp3|wav|flac|ogg|aac|m4a)$/i.test(f.name);
export const isPdfFile = (f: DriveFile) => f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isMarkdownFile = (f: DriveFile) => /\.md$/i.test(f.name);
export const isCodeFile = (f: DriveFile) => /\.(js|ts|jsx|tsx|py|java|go|rs|c|cpp|h|sh|bash|yaml|yml|json|xml|css|scss|sql|rb|php|toml)$/i.test(f.name);
export const isTextFile = (f: DriveFile) => /\.(txt|log|cfg|conf|ini|env)$/i.test(f.name);

/** Confirm / toast plumbing passed from Dashboard down to children. */
export type ConfirmFn = (message: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
export type NotifyFn = (text: string, kind?: 'success' | 'error') => void;
