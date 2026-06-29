import type { Env, ShareResponse, ShareCreatePayload, ShareUpdatePayload, FolderShareCreatePayload, FolderShareUpdatePayload, FolderShareRecord, FolderShareResponse } from './types';
import { getFile, listFilesInTree } from './metadata';
import { getTelegramFilePath } from './bot';

// ───── SHA-256 helper ─────
async function sha256(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ───── KV Key Prefixes ─────
const SHARE_PREFIX = 'share:';
const FILE_SHARES_PREFIX = 'fshare:';

// ───── Share CRUD ─────

/**
 * Create a share link for a file.
 */
export async function createShare(env: Env, payload: ShareCreatePayload): Promise<{ code: string; url: string } | { error: string }> {
  const { fileId, password, expiresIn } = payload;

  // Verify file exists
  const file = await getFile(env, fileId);
  if (!file) {
    return { error: 'File not found' };
  }

  // Generate 8-char unique code (collision-free)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Check for collision
    const existing = await env.SHARES.get(`${SHARE_PREFIX}${code}`);
    if (!existing) break;
    if (attempt === 9) return { error: 'Failed to generate unique share code' };
  }

  const now = Date.now();

  // Hash password if provided
  let passwordHash: string | null = null;
  if (password) {
    passwordHash = await sha256(password);
  }

  // Calculate expiration
  let expiresAt: number | null = null;
  if (expiresIn && expiresIn > 0) {
    expiresAt = now + expiresIn * 1000;
  }

  const record = {
    fileId,
    fileName: file.name,
    fileSize: file.size,
    passwordHash,
    password: password || null,
    createdAt: now,
    downloadCount: 0,
    expiresAt,
  };

  await env.SHARES.put(`${SHARE_PREFIX}${code}`, JSON.stringify(record));

  // Store reverse mapping (fileId → codes)
  const existing = await env.SHARES.get(`${FILE_SHARES_PREFIX}${fileId}`);
  let codes: string[] = [];
  if (existing) {
    try { codes = JSON.parse(existing); if (!Array.isArray(codes)) codes = [existing]; }
    catch { codes = [existing]; }
  }
  codes.push(code);
  await env.SHARES.put(`${FILE_SHARES_PREFIX}${fileId}`, JSON.stringify(codes));

  // Derive share URL — this will be the Worker's own URL
  // Note: in production, the worker URL is known at request time

  return { code, url: '' }; // url filled in by the route handler
}

/**
 * Get share info for verification.
 */
export async function getShare(code: string, env: Env): Promise<{
  ok: boolean;
  share?: any;
  error?: string;
}> {
  const raw = await env.SHARES.get(`${SHARE_PREFIX}${code}`);
  if (!raw) {
    return { ok: false, error: 'Share link not found' };
  }

  const record = JSON.parse(raw);

  // Check expiration
  if (record.expiresAt && Date.now() > record.expiresAt) {
    return { ok: false, error: 'Share link has expired' };
  }

  return {
    ok: true,
    share: {
      code,
      fileId: record.fileId,
      fileName: record.fileName,
      fileSize: record.fileSize,
      hasPassword: !!record.passwordHash,
      password: record.password || null,
      expiresAt: record.expiresAt,
      downloadCount: record.downloadCount,
    },
  };
}

/**
 * Verify share password and get download URL.
 */
export async function verifySharePassword(
  code: string,
  password: string,
  env: Env,
): Promise<{ ok: boolean; downloadUrl?: string; error?: string }> {
  const raw = await env.SHARES.get(`${SHARE_PREFIX}${code}`);
  if (!raw) {
    return { ok: false, error: 'Share link not found' };
  }

  const record = JSON.parse(raw);

  // Check expiration
  if (record.expiresAt && Date.now() > record.expiresAt) {
    return { ok: false, error: 'Share link has expired' };
  }

  // Verify password
  if (record.passwordHash) {
    const hash = await sha256(password);
    if (hash !== record.passwordHash) {
      return { ok: false, error: 'Invalid password' };
    }
  }

  // Increment download count
  record.downloadCount = (record.downloadCount || 0) + 1;
  await env.SHARES.put(`${SHARE_PREFIX}${code}`, JSON.stringify(record));

  // Get the file download URL
  const file = await getFile(env, record.fileId);
  if (!file) {
    return { ok: false, error: 'File not found in storage' };
  }

  const manifest = JSON.parse(file.manifest);
  if (manifest.length === 1) {
    try {
      const dlUrl = await getTelegramFilePath(env, manifest[0].file_id);
      return { ok: true, downloadUrl: dlUrl };
    } catch {
      // Fallback: proxy download through worker
      return { ok: true }; // Caller should use proxy download
    }
  }

  // Multi-chunk: proxy through worker
  return { ok: true };
}

/**
 * List shares for a file.
 */
export async function listShares(env: Env, fileId: number): Promise<ShareResponse[]> {
  const raw = await env.SHARES.get(`${FILE_SHARES_PREFIX}${fileId}`);
  if (!raw) return [];

  let codes: string[] = [];
  try { codes = JSON.parse(raw); if (!Array.isArray(codes)) codes = [raw]; }
  catch { codes = [raw]; }

  const shares: ShareResponse[] = [];
  for (const code of codes) {
    const data = await env.SHARES.get(`${SHARE_PREFIX}${code}`);
    if (data) {
      const record = JSON.parse(data);
      shares.push({
        code,
        fileId: record.fileId,
        fileName: record.fileName,
        fileSize: record.fileSize,
        hasPassword: !!record.passwordHash,
        password: record.password || null,
        expiresAt: record.expiresAt,
        downloadCount: record.downloadCount || 0,
        createdAt: record.createdAt,
      });
    }
  }

  return shares;
}

/**
 * List ALL shares across all files (with KV pagination).
 */
export async function listAllShares(env: Env): Promise<ShareResponse[]> {
  const shares: ShareResponse[] = [];
  try {
    let cursor: string | undefined;
    do {
      const opts: any = { prefix: SHARE_PREFIX };
      if (cursor) opts.cursor = cursor;
      const list = await env.SHARES.list(opts);
      for (const key of list.keys) {
        const raw = await env.SHARES.get(key.name);
        if (raw) {
          const record = JSON.parse(raw);
          shares.push({
            code: key.name.replace(SHARE_PREFIX, ''),
            fileId: record.fileId,
            fileName: record.fileName,
            fileSize: record.fileSize,
            hasPassword: !!record.passwordHash,
            password: record.password || null,
            expiresAt: record.expiresAt,
            downloadCount: record.downloadCount || 0,
            createdAt: record.createdAt,
          });
        }
      }
      cursor = (list as any).cursor;
    } while (cursor);
  } catch (err) {
    console.error('listAllShares error:', err);
  }
  // Sort newest first
  shares.sort((a, b) => b.createdAt - a.createdAt);
  return shares;
}

/**
 * Update a share link (password, expiry).
 */
export async function updateShare(
  env: Env,
  code: string,
  payload: ShareUpdatePayload,
): Promise<{ ok: boolean; error?: string }> {
  const raw = await env.SHARES.get(`${SHARE_PREFIX}${code}`);
  if (!raw) {
    return { ok: false, error: 'Share link not found' };
  }

  const record = JSON.parse(raw);

  // Update password
  if (payload.password !== undefined) {
    if (payload.password) {
      record.passwordHash = await sha256(payload.password);
      record.password = payload.password;
    } else {
      record.passwordHash = null;
      record.password = null;
    }
  }

  // Update expiry
  if (payload.expiresIn !== undefined) {
    if (payload.expiresIn && payload.expiresIn > 0) {
      record.expiresAt = Date.now() + payload.expiresIn * 1000;
    } else {
      record.expiresAt = null;
    }
  }

  await env.SHARES.put(`${SHARE_PREFIX}${code}`, JSON.stringify(record));
  return { ok: true };
}

/**
 * Delete a share link.
 */
export async function deleteShare(env: Env, code: string): Promise<boolean> {
  const raw = await env.SHARES.get(`${SHARE_PREFIX}${code}`);
  if (!raw) return false;

  const record = JSON.parse(raw);

  // Remove from reverse mapping
  const existing = await env.SHARES.get(`${FILE_SHARES_PREFIX}${record.fileId}`);
  if (existing) {
    let codes: string[] = [];
    try { codes = JSON.parse(existing); }
    catch { codes = [existing]; }
    codes = codes.filter(c => c !== code);
    if (codes.length > 0) {
      await env.SHARES.put(`${FILE_SHARES_PREFIX}${record.fileId}`, JSON.stringify(codes));
    } else {
      await env.SHARES.delete(`${FILE_SHARES_PREFIX}${record.fileId}`);
    }
  }

  await env.SHARES.delete(`${SHARE_PREFIX}${code}`);
  return true;
}

// ════════════════════════════════════════════════════════════════
// Folder Shares (share an entire folder subtree)
// ════════════════════════════════════════════════════════════════

const FOLDER_SHARE_PREFIX = 'fldr:';

/**
 * Create a folder share link.
 */
export async function createFolderShare(
  env: Env,
  payload: FolderShareCreatePayload,
): Promise<{ code: string; url: string } | { error: string }> {
  const { topicId, folderId, password, expiresIn } = payload;

  // Generate 8-char unique code
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await env.SHARES.get(`${FOLDER_SHARE_PREFIX}${code}`);
    if (!existing) break;
    if (attempt === 9) return { error: 'Failed to generate unique share code' };
  }

  const now = Date.now();
  let passwordHash: string | null = null;
  if (password) {
    passwordHash = await sha256(password);
  }

  let expiresAt: number | null = null;
  if (expiresIn && expiresIn > 0) {
    expiresAt = now + expiresIn * 1000;
  }

  const record: FolderShareRecord = {
    topicId,
    folderId: folderId ?? null,
    name: '', // filled below
    passwordHash,
    password: password || null,
    createdAt: now,
    downloadCount: 0,
    expiresAt,
    fileCount: 0,
  };

  // Count files and get a display name
  const files = await listFilesInTree(env, topicId, folderId ?? null);
  record.fileCount = files.length;

  if (folderId != null && folderId !== undefined) {
    try {
      const folder = await env.DB.prepare('SELECT name FROM folders WHERE id = ?').bind(folderId).first<{ name: string }>();
      record.name = (folder?.name || '').trim() || `Folder ${folderId}`;
    } catch {
      record.name = `Folder ${folderId}`;
    }
  } else {
    const topic = await env.DB.prepare('SELECT name FROM topics WHERE topic_id = ?').bind(topicId).first<{ name: string }>();
    record.name = (topic?.name || '').trim() || `Topic ${topicId}`;
  }

  await env.SHARES.put(`${FOLDER_SHARE_PREFIX}${code}`, JSON.stringify(record));
  return { code, url: '' };
}

/**
 * Get folder share info.
 */
export async function getFolderShare(code: string, env: Env): Promise<{
  ok: boolean;
  share?: FolderShareResponse;
  error?: string;
}> {
  const raw = await env.SHARES.get(`${FOLDER_SHARE_PREFIX}${code}`);
  if (!raw) {
    return { ok: false, error: 'Share link not found' };
  }

  const record: FolderShareRecord = JSON.parse(raw);

  if (record.expiresAt && Date.now() > record.expiresAt) {
    return { ok: false, error: 'Share link has expired' };
  }

  return {
    ok: true,
    share: {
      code,
      topicId: record.topicId,
      folderId: record.folderId,
      name: record.name,
      fileCount: record.fileCount,
      hasPassword: !!record.passwordHash,
      password: record.password || null,
      expiresAt: record.expiresAt,
      downloadCount: record.downloadCount,
      createdAt: record.createdAt,
    },
  };
}

/**
 * Verify folder share password and return file list.
 */
export async function verifyFolderSharePassword(
  code: string,
  password: string,
  env: Env,
): Promise<{
  ok: boolean;
  files?: any[];
  name?: string;
  error?: string;
  fileCount?: number;
}> {
  const raw = await env.SHARES.get(`${FOLDER_SHARE_PREFIX}${code}`);
  if (!raw) {
    return { ok: false, error: 'Share link not found' };
  }

  const record: FolderShareRecord = JSON.parse(raw);

  if (record.expiresAt && Date.now() > record.expiresAt) {
    return { ok: false, error: 'Share link has expired' };
  }

  if (record.passwordHash) {
    const hash = await sha256(password);
    if (hash !== record.passwordHash) {
      return { ok: false, error: 'Invalid password' };
    }
  }

  // Increment download count
  record.downloadCount = (record.downloadCount || 0) + 1;
  await env.SHARES.put(`${FOLDER_SHARE_PREFIX}${code}`, JSON.stringify(record));

  // List files in the folder tree — use static import
  const files = await listFilesInTree(env, record.topicId, record.folderId);

  return {
    ok: true,
    files: files.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      createdAt: f.createdAt,
    })),
    name: record.name,
    fileCount: record.fileCount,
  };
}

/**
 * List all folder shares.
 */
export async function listAllFolderShares(env: Env): Promise<FolderShareResponse[]> {
  const shares: FolderShareResponse[] = [];
  try {
    let cursor: string | undefined;
    do {
      const opts: any = { prefix: FOLDER_SHARE_PREFIX };
      if (cursor) opts.cursor = cursor;
      const list = await env.SHARES.list(opts);
      for (const key of list.keys) {
        const raw = await env.SHARES.get(key.name);
        if (raw) {
          const record: FolderShareRecord = JSON.parse(raw);
          // Skip reverse mapping entries (arrays) — they belong to file shares
          if (Array.isArray(record)) continue;
          shares.push({
            code: key.name.replace(FOLDER_SHARE_PREFIX, ''),
            topicId: record.topicId,
            folderId: record.folderId,
            name: record.name,
            fileCount: record.fileCount,
            hasPassword: !!record.passwordHash,
            password: record.password || null,
            expiresAt: record.expiresAt,
            downloadCount: record.downloadCount || 0,
            createdAt: record.createdAt,
          });
        }
      }
      cursor = (list as any).cursor;
    } while (cursor);
  } catch (err) {
    console.error('listAllFolderShares error:', err);
  }
  shares.sort((a, b) => b.createdAt - a.createdAt);
  return shares;
}

/**
 * Update a folder share (password, expiry).
 */
export async function updateFolderShare(
  env: Env,
  code: string,
  payload: FolderShareUpdatePayload,
): Promise<{ ok: boolean; error?: string }> {
  const raw = await env.SHARES.get(`${FOLDER_SHARE_PREFIX}${code}`);
  if (!raw) {
    return { ok: false, error: 'Folder share link not found' };
  }

  const record: FolderShareRecord = JSON.parse(raw);

  if (payload.password !== undefined) {
    if (payload.password) {
      record.passwordHash = await sha256(payload.password);
      record.password = payload.password;
    } else {
      record.passwordHash = null;
      record.password = null;
    }
  }

  if (payload.expiresIn !== undefined) {
    if (payload.expiresIn && payload.expiresIn > 0) {
      record.expiresAt = Date.now() + payload.expiresIn * 1000;
    } else {
      record.expiresAt = null;
    }
  }

  await env.SHARES.put(`${FOLDER_SHARE_PREFIX}${code}`, JSON.stringify(record));
  return { ok: true };
}

/**
 * Delete a folder share link.
 */
export async function deleteFolderShare(env: Env, code: string): Promise<boolean> {
  const raw = await env.SHARES.get(`${FOLDER_SHARE_PREFIX}${code}`);
  if (!raw) return false;
  await env.SHARES.delete(`${FOLDER_SHARE_PREFIX}${code}`);
  return true;
}
