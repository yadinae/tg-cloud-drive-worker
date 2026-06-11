import type { Env, ShareResponse, ShareCreatePayload, ShareUpdatePayload } from './types';
import { getFile } from './metadata';
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

  // Generate 8-char unique code
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
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
    // password: hash only (removed plaintext storage)
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
        expiresAt: record.expiresAt,
        downloadCount: record.downloadCount || 0,
        createdAt: record.createdAt,
      });
    }
  }

  return shares;
}

/**
 * List ALL shares across all files.
 */
export async function listAllShares(env: Env): Promise<ShareResponse[]> {
  const shares: ShareResponse[] = [];
  try {
    const list = await env.SHARES.list({ prefix: SHARE_PREFIX });
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
            expiresAt: record.expiresAt,
          downloadCount: record.downloadCount || 0,
          createdAt: record.createdAt,
        });
      }
    }
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
      record.password = payload.password; // store plaintext for display
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
