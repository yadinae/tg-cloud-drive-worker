import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import {
  listTopics,
  createTopic as createTopicMeta,
  renameTopic,
  deleteTopic,
  listFiles, listFilesPaginated,
  getFile,
  renameFile,
  moveFile,
  deleteFile as deleteFileMeta,
  getAndDeleteFile,
  searchFiles,
  getStats,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  listFilesInTree,
} from './metadata';
import { uploadCompleteFile, downloadFileStream, getShareDownloadUrl, receiveUploadChunk, finalizeChunkedUpload, transferFileByUrl, cleanupUploadChunks, cleanupAllOrphanUploads } from './storage';
import { UrlBlockedError } from './ssrf';
import {
  createShare,
  getShare,
  verifySharePassword,
  listShares,
  listAllShares,
  updateShare,
  deleteShare,
  createFolderShare,
  getFolderShare,
  verifyFolderSharePassword,
  listAllFolderShares,
  updateFolderShare,
  deleteFolderShare,
} from './shares';
import { verifyBotConnection, deleteFileMessages, createForumTopic, renameForumTopic, deleteForumTopic } from './bot';
import { FRONTEND_HTML, FRONTEND_JS_NAME, FRONTEND_JS_CONTENT } from './frontend-assets';
import agentApi from './agent-api';
import { apiIndex, openApiSpec } from './openapi';
import { getClientIp, checkRateLimit, recordFailedAttempt, clearRateLimit, LOGIN_RATE_LIMIT } from './rate-limit';
import { hashPassword, verifyPasswordHash } from './passwords';

// ───── Auto-migrate D1 on cold start ─────
async function ensureSchema(env: Env) {
  try {
    // Check if topics table exists (v2 schema)
    const allTables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name: string}>();
    const tableNames = allTables.results.map(r => r.name);

    if (tableNames.includes('topics')) {
      // Check for v3 migration (folders support)
      if (!tableNames.includes('folders')) {
        await env.DB.prepare(`CREATE TABLE folders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          parent_id INTEGER,
          name TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        )`).run();
        // Add folder_id to files
        await env.DB.prepare("ALTER TABLE files ADD COLUMN folder_id INTEGER").run();
        // Add indexes for folder queries
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_topic ON folders(topic_id)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)").run();
        console.log('✅ D1 schema migrated to v3 (folders support)');
      } else {
        // Ensure indexes exist on existing v3 schema
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_topic ON folders(topic_id)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)").run();
      }

      // ───── V4: Settings table (config system) ─────
      if (!tableNames.includes('settings')) {
        await env.DB.prepare(`CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          description TEXT DEFAULT '',
          updated_at INTEGER DEFAULT (unixepoch())
        )`).run();
        // Seed default values
        const defaults: [string, string, string][] = [
          ['download.concurrency', '3',           '并发下载线程数'],
          ['download.chunk_size_mb', '18',        '下载分块大小(MB)'],
          ['upload.default_topic', '',            '默认上传话题ID'],
          ['upload.chunk_size_mb', '18',          '上传分块大小(MB)'],
          ['upload.auto_chunk_threshold_mb', '10','自动分块阈值(MB)'],
          ['share.default_expiry_hours', '72',    '分享默认过期时间(小时)'],
          ['bot.api_concurrency', '5',            'Bot API 最大并发数'],
          ['bot.api_base_url', '',                '自定义 Bot API 地址'],
          ['system.auto_cleanup_days', '0',       '自动清理天数(0=关)'],
          ['system.session_timeout_days', '7',    '会话过期天数'],
        ['system.password_hash', '',             '用户可修改的登录密码(PBKDF2-SHA256)'],
          // ───── 商城广告配置 ─────
          ['ads.enabled', 'false',               '分享页是否显示商城广告'],
          ['ads.shop_name', '我们的商城',          '商城名称'],
          ['ads.shop_url', 'https://www.isoho168.top', '商城链接'],
          ['ads.products', '[]',                 '推荐商品列表(JSON)'],
        ];
        for (const [k, v, d] of defaults) {
          await env.DB.prepare(
            'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)'
          ).bind(k, v, d).run();
        }
        console.log('✅ D1 schema migrated to v4 (settings table)');
      }
      return; // Already migrated
    }

    // Drop old folders
    await env.DB.prepare("DROP TABLE IF EXISTS folders").run();

    // Drop old files table and create new one with topic_id
    await env.DB.prepare("DROP TABLE IF EXISTS files_old").run();
    // Rename old files to files_old before creating new
    const oldFilesExists = tableNames.includes('files');
    if (oldFilesExists) {
      await env.DB.prepare("ALTER TABLE files RENAME TO files_old").run();
    }

    await env.DB.prepare(`CREATE TABLE topics (
      topic_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`).run();

    await env.DB.prepare(`CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT 'application/octet-stream',
      manifest TEXT DEFAULT '[]',
      chunk_count INTEGER DEFAULT 1,
      bot_file_id TEXT,
      file_unique_id TEXT,
      message_id INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`).run();

    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_topic ON files(topic_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_topic ON folders(topic_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)").run();

    console.log('✅ D1 schema migrated to v2 (topic-based)', tableNames);
  } catch (err) {
    console.error('D1 schema migration failed:', err);
    throw err; // Let caller see the error
  }
}

const app = new Hono<{ Bindings: Env }>();

// ───── CORS (allow frontend on any domain) ─────
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
  exposeHeaders: ['Content-Length', 'Content-Disposition', 'Accept-Ranges'],
}));

// ───── Auth middleware (supports session, env token, and settings password) ─────
/** Check password against env var OR settings table hash (PBKDF2, or legacy
 *  SHA-256 upgraded in place on success). */
async function checkPassword(env: Env, password: string): Promise<boolean> {
  // 1. Check against env DRIVE_AUTH_TOKEN
  const tokenBytes = new TextEncoder().encode(password);
  const expectedBytes = new TextEncoder().encode(env.DRIVE_AUTH_TOKEN);
  if (tokenBytes.length === expectedBytes.length) {
    try {
      if (await crypto.subtle.timingSafeEqual(tokenBytes, expectedBytes)) return true;
    } catch { /* ignore */ }
  }
  // 2. Check against settings table password_hash
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'system.password_hash'").first<{value: string}>();
    if (row && row.value) {
      const result = await verifyPasswordHash(row.value, password);
      if (!result.ok) return false;
      if (result.legacy) {
        // Upgrade the stored hash to PBKDF2 (best-effort; login succeeds
        // even if the upgrade write fails).
        try {
          const upgraded = await hashPassword(password);
          await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'system.password_hash'").bind(upgraded).run();
        } catch { /* ignore upgrade failure */ }
      }
      return true;
    }
  } catch { /* settings table may not exist yet */ }
  return false;
}

async function authMiddleware(c: any, next: any) {
  // 1. Check session (from X-Session-Id header or cookie)
  const sessionId = c.req.header('X-Session-Id') || c.req.cookie?.session_id || c.req.query('session') || '';
  if (sessionId) {
    const raw = await c.env.SHARES.get(`sess:${sessionId}`, { type: 'json' }).catch(() => null);
    if (raw && raw.createdAt && (!raw.expiresAt || Date.now() < raw.expiresAt)) {
      // Session valid — renew if close to expiry
      if (raw.expiresAt && raw.expiresAt - Date.now() < 86400000) {
        raw.expiresAt = Date.now() + 7 * 86400000; // extend 7 days
        await c.env.SHARES.put(`sess:${sessionId}`, JSON.stringify(raw), { expirationTtl: 604800 });
      }
      return await next();
    }
    // Session expired or invalid — fall through to token check
  }

  // 2. Fallback: Bearer token (check env var OR settings hash)
  let token = '';
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = c.req.query('token') || '';
  }
  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  const ok = await checkPassword(c.env, token);
  if (!ok) return c.json({ error: 'Invalid auth token' }, 403);
  await next();
}

// ───── Static: Serve frontend SPA ─────
app.get('/', (c) => c.html(FRONTEND_HTML));
app.get('/assets/*', (c) => {
  if (c.req.path.endsWith('.js')) {
    c.header('Content-Type', 'application/javascript; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    return c.body(FRONTEND_JS_CONTENT);
  }
  return c.html(FRONTEND_HTML);
});

// ───── Session Login / Logout (public) ─────
// POST /api/auth/login — password → session
app.post('/api/auth/login', async (c) => {
  const { password } = await c.req.json();
  if (!password) return c.json({ error: 'Password required' }, 400);

  // Rate limit: 5 failed logins per IP per 15 min
  const ip = getClientIp(c);
  const loginKey = `login:${ip}`;
  const limit = await checkRateLimit(c.env, loginKey, LOGIN_RATE_LIMIT.maxAttempts, LOGIN_RATE_LIMIT.windowSeconds);
  if (!limit.allowed) {
    return c.json({ error: 'Too many login attempts, please try again later' }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });
  }

  // Verify password against env var OR settings hash
  const valid = await checkPassword(c.env, password);
  if (!valid) {
    await recordFailedAttempt(c.env, loginKey, LOGIN_RATE_LIMIT.windowSeconds);
    return c.json({ error: 'Invalid password' }, 403);
  }
  await clearRateLimit(c.env, loginKey);

  // Create session
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const session = {
    createdAt: now,
    expiresAt: now + 7 * 86400000, // 7 days
  };
  await c.env.SHARES.put(`sess:${sessionId}`, JSON.stringify(session), { expirationTtl: 604800 });

  return c.json({ ok: true, sessionId, expiresAt: session.expiresAt });
});

// POST /api/auth/logout — invalidate session
app.post('/api/auth/logout', async (c) => {
  const sessionId = c.req.header('X-Session-Id') || '';
  if (sessionId) {
    await c.env.SHARES.delete(`sess:${sessionId}`).catch(() => {});
  }
  return c.json({ ok: true });
});

// GET /api/auth/session — check if session is valid
app.get('/api/auth/session', async (c) => {
  const sessionId = c.req.query('session') || c.req.header('X-Session-Id') || '';
  if (!sessionId) return c.json({ ok: false, error: 'No session' }, 401);
  const raw = await c.env.SHARES.get(`sess:${sessionId}`).catch(() => null);
  if (!raw) return c.json({ ok: false, error: 'Session expired or invalid' }, 401);
  try {
    const session = JSON.parse(raw);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      await c.env.SHARES.delete(`sess:${sessionId}`).catch(() => {});
      return c.json({ ok: false, error: 'Session expired' }, 401);
    }
    return c.json({ ok: true, createdAt: session.createdAt, expiresAt: session.expiresAt });
  } catch {
    return c.json({ ok: false, error: 'Invalid session' }, 401);
  }
});

// ───── Health ─────
app.get('/api/health', async (c) => {
  const botStatus = await verifyBotConnection(c.env);
  // Ensure D1 schema is up to date (idempotent)
  await ensureSchema(c.env);
  return c.json({ ok: botStatus.ok, message: botStatus.message });
});

// ───── Stats (public) ─────
app.get('/api/stats', async (c) => {
  const stats = await getStats(c.env);
  return c.json(stats);
});

// ───── Share Verify (public) ─────
app.post('/api/shares/verify', async (c) => {
  const { code, password } = await c.req.json();
  if (!code) return c.json({ error: 'code required' }, 400);
  const result = await verifySharePassword(code, password || '', c.env, getClientIp(c));
  if (result.rateLimited) {
    return c.json({ error: result.error }, 429, { 'Retry-After': String(result.retryAfterSeconds ?? 60) });
  }
  return c.json(result);
});

// ───── Folder Share Verify (public) ─────
app.post('/api/shares/folder/verify', async (c) => {
  const { code, password } = await c.req.json();
  if (!code) return c.json({ error: 'code required' }, 400);
  const result = await verifyFolderSharePassword(code, password || '', c.env, getClientIp(c));
  if (result.rateLimited) {
    return c.json({ error: result.error }, 429, { 'Retry-After': String(result.retryAfterSeconds ?? 60) });
  }
  return c.json(result);
});

// ───── Agent API (uses its own AGENT_API_TOKEN auth) ─────
app.route('/api/agent', agentApi);

// ───── API Discovery (public — must be registered before authMiddleware) ─────
app.get('/api', (c) => c.json(apiIndex(new URL(c.req.url))));
app.get('/api/openapi.json', (c) => c.json(openApiSpec(new URL(c.req.url).origin)));

// ═══════════ All routes below require auth ═══════════
app.use('/api/*', authMiddleware);

// ───── Config (Settings API, auth required) ─────

// GET /api/config — 获取全部配置
app.get('/api/config', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all<{key: string, value: string}>();
  const settings: Record<string, string> = {};
  for (const row of results) settings[row.key] = row.value;
  return c.json({ settings });
});

// PUT /api/config — 批量更新配置（只更新已存在的键，含类型校验）
app.put('/api/config', async (c) => {
  const body = await c.req.json<Record<string, string>>();
  const now = Math.floor(Date.now() / 1000);

  // Type/range validation per key
  const rangeRules: Record<string, { min: number; max: number }> = {
    'download.concurrency': { min: 1, max: 8 },
    'download.chunk_size_mb': { min: 1, max: 20 },
    'upload.chunk_size_mb': { min: 1, max: 20 },
    'upload.auto_chunk_threshold_mb': { min: 1, max: 50 },
    'bot.api_concurrency': { min: 1, max: 8 },
    'system.auto_cleanup_days': { min: 0, max: 365 },
    'system.session_timeout_days': { min: 1, max: 90 },
  };
  const intKeys = new Set(Object.keys(rangeRules));

  for (const [key, value] of Object.entries(body)) {
    // Validate key exists
    const existing = await c.env.DB.prepare('SELECT key FROM settings WHERE key = ?').bind(key).first();
    if (!existing) continue; // skip unknown keys

    // Type validation for integer fields
    if (intKeys.has(key)) {
      const num = Number(value);
      if (!Number.isInteger(num) || isNaN(num)) {
        return c.json({ error: `${key} 必须是整数` }, 400);
      }
      const rule = rangeRules[key];
      if (num < rule.min || num > rule.max) {
        return c.json({ error: `${key} 取值范围 ${rule.min}-${rule.max}` }, 400);
      }
    }

    // Length validation for string fields
    if (value && value.length > 500) {
      return c.json({ error: `${key} 值过长（最多500字符）` }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?'
    ).bind(value, now, key).run();
  }
  return c.json({ ok: true });
});

// POST /api/auth/change-password — 修改密码（存储 PBKDF2 哈希到 settings 表）
app.post('/api/auth/change-password', async (c) => {
  const { oldPassword, newPassword } = await c.req.json();
  if (!oldPassword || !newPassword) {
    return c.json({ error: 'oldPassword and newPassword are required' }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: '新密码长度至少6位' }, 400);
  }
  // Verify old password against env var OR current hash
  const valid = await checkPassword(c.env, oldPassword);
  if (!valid) return c.json({ error: '当前密码错误' }, 403);

  // Hash new password and store in settings table
  const hash = await hashPassword(newPassword);
  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO settings (key, value, description, updated_at) VALUES ('system.password_hash', ?, ?, ?)"
  ).bind(hash, '用户可修改的登录密码(PBKDF2-SHA256)', Math.floor(Date.now() / 1000)).run();

  // Also invalidate all existing sessions so user must re-login
  // (Sessions expire naturally based on TTL; no bulk delete in KV)

  return c.json({ ok: true, message: '密码已更新，请重新登录 ✅' });
});

// ───── Topics (Folders = Telegram forum topics) ─────

// GET /api/topics — list all topics
app.get('/api/topics', async (c) => {
  const topics = await listTopics(c.env);
  return c.json({ topics });
});

// POST /api/topics — create a new topic (folder) in Telegram + D1
// If topicId is provided, skip Telegram creation (for importing existing topics)
app.post('/api/topics', async (c) => {
  const { name, topicId: existingTopicId } = await c.req.json();
  if (!name || !name.trim()) {
    return c.json({ error: 'Topic name is required' }, 400);
  }
  const trimmedName = name.trim();

  // If topicId is provided, this is an existing Telegram topic; insert in D1 only
  if (existingTopicId) {
    const topic = await createTopicMeta(c.env, existingTopicId, trimmedName);
    return c.json({ ok: true, topic }, 201);
  }

  // Create in Telegram via Bot API
  try {
    const topicId = await createForumTopic(c.env, trimmedName);
    // Store in D1
    const topic = await createTopicMeta(c.env, topicId, trimmedName);
    return c.json({ ok: true, topic }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/topics/:topicId — rename a topic
app.put('/api/topics/:topicId', async (c) => {
  const topicId = Number(c.req.param('topicId'));
  const { name } = await c.req.json();
  if (!name || !name.trim()) {
    return c.json({ error: 'Topic name is required' }, 400);
  }
  const trimmedName = name.trim();

  // Rename in Telegram
  try {
    await renameForumTopic(c.env, topicId, trimmedName);
  } catch (err: any) {
    console.error('Telegram rename error:', err.message);
    // Continue anyway — D1 rename is the source of truth
  }

  // Rename in D1
  const ok = await renameTopic(c.env, topicId, trimmedName);
  return c.json({ ok });
});

// DELETE /api/topics/:topicId — delete a topic (folder)
app.delete('/api/topics/:topicId', async (c) => {
  const topicId = Number(c.req.param('topicId'));

  // Delete from Telegram
  try {
    await deleteForumTopic(c.env, topicId);
  } catch (err: any) {
    console.error('Telegram delete topic error:', err.message);
    // Continue anyway — D1 delete is the source of truth
  }

  // Delete from D1 (cascading files)
  const ok = await deleteTopic(c.env, topicId);
  return c.json({ ok });
});

// ───── Folders ─────

// GET /api/folders?topicId=X&parentId=Y — list folders in a topic
app.get('/api/folders', async (c) => {
  const topicId = Number(c.req.query('topicId'));
  const parentId = c.req.query('parentId') ? Number(c.req.query('parentId')) : null;
  if (!topicId) return c.json({ error: 'topicId required' }, 400);
  const folders = await listFolders(c.env, topicId, parentId);
  return c.json({ folders });
});

// POST /api/folders — create a folder
app.post('/api/folders', async (c) => {
  const { topicId, parentId, name } = await c.req.json();
  if (!topicId || !name?.trim()) return c.json({ error: 'topicId and name required' }, 400);
  const folder = await createFolder(c.env, topicId, name.trim(), parentId || null);
  return c.json({ ok: true, folder }, 201);
});

// PUT /api/folders/:id — rename folder
app.put('/api/folders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { name } = await c.req.json();
  if (!name?.trim()) return c.json({ error: 'name required' }, 400);
  const ok = await renameFolder(c.env, id, name.trim());
  return c.json({ ok });
});

// DELETE /api/folders/:id — delete folder (files reassigned to parent)
app.delete('/api/folders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const ok = await deleteFolder(c.env, id);
  return c.json({ ok });
});

// GET /api/folders/:id/path — breadcrumb path to folder root
app.get('/api/folders/:id/path', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    const rows = await c.env.DB.prepare(
      `WITH RECURSIVE tree AS (
         SELECT id, parent_id, name, 0 AS depth FROM folders WHERE id = ?
         UNION ALL
         SELECT f.id, f.parent_id, f.name, t.depth + 1
         FROM folders f JOIN tree t ON f.id = t.parent_id
       )
       SELECT id, name FROM tree ORDER BY depth DESC`
    ).bind(id).all<{ id: number; name: string }>();
    return c.json({ path: rows.results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ───── Files ─────

// GET /api/files?topicId=X — list files in a topic
// GET /api/files?q=xxx — search files
app.get('/api/files', async (c) => {
  const query = c.req.query('q');
  if (query) {
    const files = await searchFiles(c.env, query);
    return c.json({ files });
  }

  const topicId = c.req.query('topicId');
  if (!topicId) {
    return c.json({ error: 'topicId query parameter required' }, 400);
  }
  const folderId = c.req.query('folderId') ? Number(c.req.query('folderId')) : null;
  // Pagination (default: page=1, pageSize=200 = max per-page)
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const result = await listFilesPaginated(c.env, Number(topicId), folderId, page, pageSize);
  return c.json(result);
});

// POST /api/files/upload — upload file to a topic
app.post('/api/files/upload', async (c) => {
  const contentType = c.req.header('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const fileEntry = formData.get('file') as File | null;
    const topicId = Number(formData.get('topicId'));
    const mimeType = (formData.get('mimeType') as string) || fileEntry?.type || 'application/octet-stream';
    const uploadId = (formData.get('uploadId') as string) || '';

    if (!fileEntry || !topicId) {
      return c.json({ error: 'file and topicId are required' }, 400);
    }

    // Idempotency: if this uploadId already completed (client retried after a
    // lost response), return the existing file instead of duplicating it.
    if (uploadId) {
      try {
        const doneKey = `done:${uploadId}`;
        const doneRaw = await c.env.SHARES.get(doneKey);
        if (doneRaw) {
          const done = JSON.parse(doneRaw);
          return c.json({ ok: true, fileId: done.fileId, manifest: [], deduped: true }, 201);
        }
      } catch { /* fall through to normal upload */ }
    }

    const buffer = await fileEntry.arrayBuffer();
    const result = await uploadCompleteFile(c.env, topicId, fileEntry.name, mimeType, buffer);
    // Set folder if provided
    const folderId = formData.get('folderId') ? Number(formData.get('folderId')) : null;
    if (folderId && result.fileId) {
      await c.env.DB.prepare('UPDATE files SET folder_id = ? WHERE id = ?').bind(folderId, result.fileId).run();
    }
    // Record idempotency key (7d TTL — matches chunk TTL)
    if (uploadId) {
      await c.env.SHARES.put(`done:${uploadId}`, JSON.stringify({ fileId: result.fileId, name: fileEntry.name, size: buffer.byteLength }), { expirationTtl: 604800 }).catch(() => {});
    }
    return c.json({ ok: true, ...result }, 201);
  }

  // JSON mode
  const { topicId, name, data, mimeType } = await c.req.json();
  if (!topicId || !name || !data) {
    return c.json({ error: 'topicId, name, and data are required' }, 400);
  }
  const binaryStr = atob(data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const buffer = bytes.buffer;
  const result = await uploadCompleteFile(c.env, topicId, name, mimeType || 'application/octet-stream', buffer);
  return c.json({ ok: true, ...result }, 201);
});

// PUT /api/files/:id — rename file
app.put('/api/files/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { name } = await c.req.json();
  if (!name || !name.trim()) return c.json({ error: 'File name is required' }, 400);
  const ok = await renameFile(c.env, id, name.trim());
  return c.json({ ok });
});

// PUT /api/files/:id/move — move file to another topic/folder
app.put('/api/files/:id/move', async (c) => {
  const id = Number(c.req.param('id'));
  const { topicId, folderId } = await c.req.json();
  if (!topicId) return c.json({ error: 'topicId is required' }, 400);
  // Verify target topic exists
  const target = await c.env.DB.prepare('SELECT topic_id FROM topics WHERE topic_id = ?').bind(topicId).first();
  if (!target) return c.json({ error: 'Target topic not found' }, 404);
  // Check if file is moving to a different topic — reset folder_id since folders are topic-scoped
  const file = await c.env.DB.prepare('SELECT topic_id, folder_id FROM files WHERE id = ?').bind(id).first<{topic_id: number, folder_id: number | null}>();
  if (file && file.topic_id !== topicId) {
    await c.env.DB.prepare('UPDATE files SET folder_id = NULL WHERE id = ?').bind(id).run();
  }
  const ok = await moveFile(c.env, id, topicId);
  // Apply explicit folder target (works for both same-topic and cross-topic moves)
  if (folderId !== undefined && folderId !== null) {
    await c.env.DB.prepare('UPDATE files SET folder_id = ? WHERE id = ?').bind(folderId, id).run();
  } else if (file && file.topic_id !== topicId) {
    // Cross-topic move without explicit folder — already set to NULL above
  } else if (folderId === null) {
    // Explicit request to set folder to null (move to topic root)
    await c.env.DB.prepare('UPDATE files SET folder_id = NULL WHERE id = ?').bind(id).run();
  }
  return c.json({ ok });
});

// ───── Chunked Upload: receive individual chunk ─────
app.post('/api/files/upload-chunk', async (c) => {
  const formData = await c.req.formData();
  const fileEntry = formData.get('file') as File | null;
  const uploadId = formData.get('uploadId') as string;
  const chunkIndex = Number(formData.get('chunkIndex'));
  const totalChunks = Number(formData.get('totalChunks'));
  const topicId = Number(formData.get('topicId'));
  const fileName = formData.get('fileName') as string;
  const fileSize = Number(formData.get('fileSize'));
  const mimeType = formData.get('mimeType') as string || 'application/octet-stream';

  if (!fileEntry || !uploadId || !topicId) {
    return c.json({ error: 'file, uploadId, and topicId are required' }, 400);
  }

  const buffer = await fileEntry.arrayBuffer();
  const result = await receiveUploadChunk(c.env, uploadId, chunkIndex, totalChunks, fileName, fileSize, mimeType, topicId, buffer);
  return c.json({ ...result, chunkIndex });
});

// ───── Chunked Upload: finalize all chunks ─────
app.post('/api/files/finalize', async (c) => {
  const { uploadId, topicId, name, size, mimeType, totalChunks, folderId } = await c.req.json();
  if (!uploadId || !topicId || !name) {
    return c.json({ error: 'uploadId, topicId, and name are required' }, 400);
  }
  const result = await finalizeChunkedUpload(c.env, uploadId, topicId, name, size || 0, mimeType || 'application/octet-stream', totalChunks || 1);
  if (folderId && result.fileId) {
    await c.env.DB.prepare('UPDATE files SET folder_id = ? WHERE id = ?').bind(folderId, result.fileId).run();
  }
  return c.json({ ok: true, ...result }, 201);
});

// ───── Chunked Upload: cleanup chunks on failure ─────
app.post('/api/files/cleanup-upload', async (c) => {
  const { uploadId } = await c.req.json();
  if (!uploadId) return c.json({ error: 'uploadId is required' }, 400);
  const result = await cleanupUploadChunks(c.env, uploadId);
  return c.json({ ok: true, ...result });
});

// ───── URL Transfer: download from URL and store ─────
app.post('/api/transfer', async (c) => {
  const { url, topicId, folderId, fileName, mimeType } = await c.req.json();
  if (!url || !topicId) return c.json({ error: 'url and topicId required' }, 400);
  try {
    const result = await transferFileByUrl(c.env, url, topicId, folderId || null, fileName, mimeType);
    return c.json({ ok: true, ...result }, 201);
  } catch (err: any) {
    if (err instanceof UrlBlockedError) return c.json({ error: err.message }, 400);
    return c.json({ error: err.message }, 500);
  }
});

// ───── Batch URL Transfer: download multiple URLs ─────
app.post('/api/transfer/batch', async (c) => {
  const { urls, topicId, folderId } = await c.req.json();
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return c.json({ error: 'urls array required' }, 400);
  }
  if (!topicId) return c.json({ error: 'topicId required' }, 400);
  if (urls.length > 20) return c.json({ error: 'Max 20 URLs per batch' }, 400);

  const results: Array<{ url: string; ok: boolean; fileId?: number; fileName?: string; size?: number; error?: string }> = [];
  let succeeded = 0, failed = 0;

  for (const url of urls) {
    try {
      const result = await transferFileByUrl(c.env, url, topicId, folderId || null);
      results.push({ url, ok: true, fileId: result.fileId, fileName: result.fileName, size: result.size });
      succeeded++;
    } catch (err: any) {
      results.push({ url, ok: false, error: err.message });
      failed++;
    }
  }

  return c.json({ ok: failed === 0, succeeded, failed, results });
});

// DELETE /api/files/:id — delete file (D1 + Telegram messages)
app.delete('/api/files/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const file = await getAndDeleteFile(c.env, id);
  if (!file) return c.json({ ok: false, error: 'File not found' }, 404);

  // Delete Telegram messages for each chunk
  let deleted = 0;
  try {
    deleted = await deleteFileMessages(c.env, file.manifest);
  } catch (err: any) {
    console.error('Telegram message deletion error:', err);
  }

  return c.json({ ok: true, telegramMessagesDeleted: deleted });
});

// ───── Batch Operations ─────

// POST /api/files/batch/delete — delete multiple files
app.post('/api/files/batch/delete', async (c) => {
  const { fileIds } = await c.req.json();
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return c.json({ error: 'fileIds array required' }, 400);
  }
  if (fileIds.length > 50) return c.json({ error: 'Max 50 files per batch' }, 400);

  let succeeded = 0, failed = 0;
  const errors: Array<{ id: number; error: string }> = [];

  for (const id of fileIds) {
    try {
      const file = await getAndDeleteFile(c.env, Number(id));
      if (!file) {
        errors.push({ id: Number(id), error: 'File not found' });
        failed++;
        continue;
      }
      try {
        await deleteFileMessages(c.env, file.manifest);
      } catch (err: any) {
        console.error(`Batch delete: Telegram message deletion error for file ${id}:`, err);
      }
      succeeded++;
    } catch (err: any) {
      errors.push({ id: Number(id), error: err.message });
      failed++;
    }
  }

  return c.json({ ok: failed === 0, succeeded, failed, errors: errors.length > 0 ? errors : undefined });
});

// POST /api/files/batch/move — move multiple files to another topic/folder
app.post('/api/files/batch/move', async (c) => {
  const { fileIds, topicId, folderId } = await c.req.json();
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return c.json({ error: 'fileIds array required' }, 400);
  }
  if (!topicId) return c.json({ error: 'topicId required' }, 400);
  if (fileIds.length > 50) return c.json({ error: 'Max 50 files per batch' }, 400);

  // Verify target topic exists
  const target = await c.env.DB.prepare('SELECT topic_id FROM topics WHERE topic_id = ?').bind(topicId).first();
  if (!target) return c.json({ error: 'Target topic not found' }, 404);

  let succeeded = 0, failed = 0;
  const errors: Array<{ id: number; error: string }> = [];

  for (const id of fileIds) {
    try {
      const file = await c.env.DB.prepare('SELECT topic_id, folder_id FROM files WHERE id = ?').bind(Number(id)).first<{topic_id: number, folder_id: number | null}>();
      if (!file) {
        errors.push({ id: Number(id), error: 'File not found' });
        failed++;
        continue;
      }
      // Reset folder_id if moving to different topic
      if (file.topic_id !== topicId) {
        await c.env.DB.prepare('UPDATE files SET folder_id = NULL WHERE id = ?').bind(Number(id)).run();
      }
      await moveFile(c.env, Number(id), topicId);
      // Apply explicit folder target
      if (folderId !== undefined && folderId !== null) {
        await c.env.DB.prepare('UPDATE files SET folder_id = ? WHERE id = ?').bind(folderId, Number(id)).run();
      } else if (folderId === null) {
        await c.env.DB.prepare('UPDATE files SET folder_id = NULL WHERE id = ?').bind(Number(id)).run();
      }
      succeeded++;
    } catch (err: any) {
      errors.push({ id: Number(id), error: err.message });
      failed++;
    }
  }

  return c.json({ ok: failed === 0, succeeded, failed, errors: errors.length > 0 ? errors : undefined });
});

// ───── File Download ─────
app.get('/api/files/:id/download', async (c) => {
  const id = Number(c.req.param('id'));
  const range = c.req.header('Range');
  const forceDownload = c.req.query('dl') === '1';
  return downloadFileStream(c.env, id, range, forceDownload);
});

// ───── Share Links ─────
app.post('/api/shares', async (c) => {
  const payload = await c.req.json();
  const result = await createShare(c.env, payload);
  if ('error' in result) return c.json(result, 400);
  const url = new URL(c.req.url);
  result.url = `${url.origin}/dl/${result.code}`;
  return c.json({ ok: true, ...result }, 201);
});

app.get('/api/shares', async (c) => {
  const fileId = c.req.query('fileId');
  if (!fileId) return c.json({ error: 'fileId query parameter required' }, 400);
  const shares = await listShares(c.env, Number(fileId));
  return c.json({ shares });
});

app.delete('/api/shares/:code', async (c) => {
  const code = c.req.param('code');
  const ok = await deleteShare(c.env, code);
  return c.json({ ok });
});

// GET /api/shares/list-all — list ALL shares across all files
app.get('/api/shares/list-all', async (c) => {
  c.header('Cache-Control', 'no-store');
  // 管理后台列表要显示/复制口令，返回明文口令（路由本身在 authMiddleware 之后，仅登录管理员可调）
  const shares = await listAllShares(c.env, 100, true);
  return c.json({ shares });
});

// PUT /api/shares/:code — update share (password, expiry)
app.put('/api/shares/:code', async (c) => {
  const code = c.req.param('code');
  const payload = await c.req.json();
  const result = await updateShare(c.env, code, payload);
  if (!result.ok) return c.json(result, 404);
  return c.json(result);
});

// ───── Folder Share Links (auth required) ─────

// POST /api/shares/folder — create folder share
app.post('/api/shares/folder', async (c) => {
  const payload = await c.req.json();
  const result = await createFolderShare(c.env, payload);
  if ('error' in result) return c.json(result, 400);
  const url = new URL(c.req.url);
  result.url = `${url.origin}/dl/f/${result.code}`;
  return c.json({ ok: true, ...result }, 201);
});

// GET /api/shares/folder/list-all — list ALL folder shares
app.get('/api/shares/folder/list-all', async (c) => {
  c.header('Cache-Control', 'no-store');
  // 管理后台列表要显示/复制口令，返回明文口令（路由本身在 authMiddleware 之后，仅登录管理员可调）
  const shares = await listAllFolderShares(c.env, 100, true);
  return c.json({ shares });
});

// DELETE /api/shares/folder/:code — revoke folder share
app.delete('/api/shares/folder/:code', async (c) => {
  const code = c.req.param('code');
  const ok = await deleteFolderShare(c.env, code);
  return c.json({ ok });
});

// PUT /api/shares/folder/:code — update folder share
app.put('/api/shares/folder/:code', async (c) => {
  const code = c.req.param('code');
  const payload = await c.req.json();
  const result = await updateFolderShare(c.env, code, payload);
  if (!result.ok) return c.json(result, 404);
  return c.json(result);
});

// ───── Admin: Clean all orphan upload chunks ─────
app.post('/api/admin/cleanup-orphans', async (c) => {
  try {
    // minAgeHours: skip chunks younger than this (protects in-progress uploads)
    const minAgeHours = Number(c.req.query('minAgeHours')) || 0;
    const result = await cleanupAllOrphanUploads(c.env, minAgeHours * 3600 * 1000);
    return c.json({ ok: true, ...result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ───── Admin: Debug migration ─────
app.get('/api/admin/migrate', async (c) => {
  try {
    await ensureSchema(c.env);
    const tables = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    return c.json({ ok: true, tables: tables.results });
  } catch (err: any) {
    return c.json({ error: err.message, stack: err.stack }, 500);
  }
});

// ───── Admin: Sync existing Telegram topics to D1 ─────
app.post('/api/admin/sync-topics', async (c) => {
  try {
    const token = c.env.TG_BOT_TOKEN;
    const chatId = c.env.STORAGE_CHANNEL_ID;
    const from = Number(c.req.query('from')) || 1;
    const to = Math.min(from + 25, 100); // Probe 25 IDs at a time
    const discovered: { topicId: number; name: string }[] = [];
    const toDelete: number[] = [];

    for (let tid = from; tid <= to; tid++) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: tid,
          text: '.',
          disable_notification: true,
          disable_web_page_preview: true,
        })
      });
      const data: any = await res.json();
      if (data.ok) {
        discovered.push({ topicId: tid, name: tid === 1 ? 'General' : `Topic ${tid}` });
        if (data.result?.message_id) {
          toDelete.push(data.result.message_id);
        }
      }
    }

    // Batch delete test messages (only for discovered topics)
    let deleted = 0;
    for (const msgId of toDelete) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: msgId })
        });
        deleted++;
      } catch { /* ignore */ }
    }

    // Store discovered topics in D1
    let inserted = 0;
    for (const topic of discovered) {
      try {
        await c.env.DB.prepare('INSERT OR IGNORE INTO topics (topic_id, name) VALUES (?, ?)')
          .bind(topic.topicId, topic.name).run();
        inserted++;
      } catch { /* ignore duplicates */ }
    }

    return c.json({
      ok: true,
      from, to,
      discovered: discovered.length,
      inserted,
      allTopics: discovered,
      note: 'Topic names are generic. Rename them from the UI.',
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ───── Admin: Get channel info ─────
app.get('/api/admin/info', async (c) => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${c.env.TG_BOT_TOKEN}/getChat?chat_id=${c.env.STORAGE_CHANNEL_ID}`);
    const data: any = await res.json();
    if (!data.ok) return c.json({ error: `getChat failed: ${data.description}` }, 400);
    return c.json({ ok: true, chat: { id: data.result.id, type: data.result.type, title: data.result.title || data.result.username } });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ───── Admin: Identify which topic is which ─────
app.get('/api/admin/identify/:topicId', async (c) => {
  const topicId = Number(c.req.param('topicId'));
  const msg = `🆔 话题 ID ${topicId} — 你看到这个话题的名称是什么？告诉我后我会删掉这条消息`;
  const res = await fetch(`https://api.telegram.org/bot${c.env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: c.env.STORAGE_CHANNEL_ID, message_thread_id: topicId, text: msg, disable_notification: true })
  });
  const data: any = await res.json();
  if (!data.ok) return c.json({ error: data.description }, 500);
  return c.json({ ok: true, message: `Sent ID card to topic ${topicId}` });
});

// ───── Public: Folder Share Download ─────
// GET /dl/f/:code — folder share page (list files with download links)
app.get('/dl/f/:code', async (c) => {
  const code = c.req.param('code');
  const shareInfo = await getFolderShare(code, c.env);
  if (!shareInfo.ok) {
    return c.html(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>无法访问</title><style>body{background:#141415;color:#ededed;font-family:'Inter',system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}.card{background:#19191b;border:1px solid #2a2a2e;border-radius:16px;padding:2rem;max-width:400px;width:100%;text-align:center}.label{color:#85858b;font-size:.75rem;letter-spacing:.08em;margin-bottom:.5rem}.error{color:#f87171;font-size:1rem;line-height:1.5}</style></head><body><div class="card"><div class="label">无法访问</div><div class="error">${shareInfo.error}</div></div></body></html>`);
  }
  const share = shareInfo.share!;
  const ad = await getAdConfig(c.env);
  if (share.hasPassword) {
    return c.html(shareFolderPageHTML({ code, shareName: share.name, fileCount: share.fileCount, requiresPassword: true, origin: new URL(c.req.url).origin, ad }));
  }
  return c.html(shareFolderPageHTML({ code, shareName: share.name, fileCount: share.fileCount, requiresPassword: false, origin: new URL(c.req.url).origin, ad }));
});

// GET /dl/f/:code/raw/:fileId — download specific file from folder share
app.get('/dl/f/:code/raw/:fileId', async (c) => {
  const code = c.req.param('code');
  const fileId = Number(c.req.param('fileId'));
  // Verify share
  const shareInfo = await getFolderShare(code, c.env);
  if (!shareInfo.ok) return c.json({ error: shareInfo.error }, 404);
  const share = shareInfo.share!;
  // 口令校验：分享设了密码时，文件夹 raw 直链也必须带正确口令才能下载
  // （修复：此前与 2026-07-31 单文件 raw 绕过同类，任何知道 code 的人都能下载文件本体）
  if (share.hasPassword) {
    const url = new URL(c.req.url);
    const pw = url.searchParams.get('password') || '';
    const result = await verifyFolderSharePassword(code, pw, c.env, getClientIp(c));
    if (result.rateLimited) {
      return c.json({ error: result.error }, 429, { 'Retry-After': String(result.retryAfterSeconds ?? 60) });
    }
    if (!result.ok) {
      return c.json({ error: 'Password required' }, 403);
    }
  }
  // Verify the file belongs to this share's folder tree
  const files = await listFilesInTree(c.env, shareInfo.share!.topicId, shareInfo.share!.folderId);
  if (!files.some(f => f.id === fileId)) {
    return c.json({ error: 'File not found in this share' }, 404);
  }
  return downloadFileStream(c.env, fileId, c.req.header('Range'), true);
});

// GET /dl/f/:code/gallery — image gallery page
app.get('/dl/f/:code/gallery', async (c) => {
  const code = c.req.param('code');
  const shareInfo = await getFolderShare(code, c.env);
  if (!shareInfo.ok) {
    return c.html(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>无法访问</title><style>body{background:#141415;color:#ededed;font-family:'Inter',system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}.card{background:#19191b;border:1px solid #2a2a2e;border-radius:16px;padding:2rem;max-width:400px;width:100%;text-align:center}.label{color:#85858b;font-size:.75rem;letter-spacing:.08em;margin-bottom:.5rem}.error{color:#f87171;font-size:1rem;line-height:1.5}</style></head><body><div class="card"><div class="label">无法访问</div><div class="error">${shareInfo.error}</div></div></body></html>`);
  }
  const share = shareInfo.share!;
  const isGalleryMode = c.req.query('pwd') !== undefined;
  // If password-protected and no pwd param, show password form
  if (share.hasPassword && !c.req.query('pwd')) {
    return c.html(shareFolderPageHTML({ code, shareName: share.name, fileCount: share.fileCount, requiresPassword: true, origin: new URL(c.req.url).origin }));
  }
  // Verify password if needed
  if (share.hasPassword) {
    const verify = await verifyFolderSharePassword(code, c.req.query('pwd') || '', c.env, getClientIp(c));
    if (verify.rateLimited) {
      return new Response(`<html><head><meta charset="UTF-8"></head><body style="background:#141415;color:#ededed;font-family:'Inter',system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem"><div style="background:#19191b;border:1px solid #2a2a2e;border-radius:16px;padding:2rem;text-align:center;max-width:400px"><div style="color:#85858b;font-size:.75rem;letter-spacing:.08em;margin-bottom:.5rem">请求过于频繁</div><div style="color:#f87171;font-size:1rem;line-height:1.5">${verify.error}</div><p style="color:#a1a1a6;font-size:.85rem;margin-top:.75rem">请稍后再试。</p></div></body></html>`, { status: 429, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': String(verify.retryAfterSeconds ?? 60) } });
    }
    if (!verify.ok) return c.html(`<html><head><meta charset="UTF-8"></head><body style="background:#141415;color:#ededed;font-family:'Inter',system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem"><div style="background:#19191b;border:1px solid #2a2a2e;border-radius:16px;padding:2rem;text-align:center;max-width:400px"><div style="color:#85858b;font-size:.75rem;letter-spacing:.08em;margin-bottom:.5rem">验证失败</div><div style="color:#f87171;font-size:1rem;line-height:1.5">${verify.error}</div><a href="/dl/f/${code}" style="color:#faff69;display:inline-block;margin-top:1rem;font-size:.875rem;text-decoration:none">返回</a></div></body></html>`);
  }
  // Load files
  const files = await listFilesInTree(c.env, share.topicId, share.folderId);
  const images = files.filter(f => f.mimeType.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.name));
  // 画廊已在上方校验过口令，把已验证的 pwd 透传给缩略图（缩略图走 /dl/f/:code/raw/:fileId，现已要求口令）
  const pwd = c.req.query('pwd') || '';
  return c.html(galleryPageHTML({ code, shareName: share.name, images, origin: new URL(c.req.url).origin, pwd }));
});

// ───── Public: Image Hotlink ─────
// GET /img/:code/:fileId — direct image URL for hotlinking (proper MIME + CORS)
app.get('/img/:code/:fileId', async (c) => {
  const code = c.req.param('code');
  const fileId = Number(c.req.param('fileId'));
  let fileOk = false;
  // Try file share first
  const fileShareInfo = await getShare(code, c.env);
  if (fileShareInfo.ok && fileShareInfo.share) {
    fileOk = fileShareInfo.share.fileId === fileId;
  }
  // Fallback to folder share
  if (!fileOk) {
    const folderShareInfo = await getFolderShare(code, c.env);
    if (folderShareInfo.ok && folderShareInfo.share) {
      const files = await listFilesInTree(c.env, folderShareInfo.share.topicId, folderShareInfo.share.folderId);
      fileOk = files.some(f => f.id === fileId);
    }
  }
  if (!fileOk) {
    return new Response('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  // /img is an image-only hotlink endpoint (product previews): a non-image
  // file must not leak through here — otherwise any file in a
  // password-protected share (PDF, ZIP, …) would be downloadable with just
  // the share code and a guessable file id, bypassing the share password.
  // Same image predicate as the gallery: MIME type or file extension.
  const file = await getFile(c.env, fileId);
  if (!file) {
    return new Response('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  const isImage =
    (file.mime_type || '').startsWith('image/') ||
    /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name);
  if (!isImage) {
    return new Response('Forbidden', { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  // Stream file as image with CORS
  const response = await downloadFileStream(c.env, fileId, undefined, false);
  // Override CORS and cache headers for hotlinking
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(response.body, {
    status: response.status,
    headers,
  });
});

// ───── Public: Share Download ─────
app.get('/dl/:code', async (c) => {
  const code = c.req.param('code');
  const shareInfo = await getShare(code, c.env);
  if (!shareInfo.ok) {
    return c.html(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>无法访问</title><style>body{background:#141415;color:#ededed;font-family:'Inter',system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}.card{background:#19191b;border:1px solid #2a2a2e;border-radius:16px;padding:2rem;max-width:400px;width:100%;text-align:center}.label{color:#85858b;font-size:.75rem;letter-spacing:.08em;margin-bottom:.5rem}.error{color:#f87171;font-size:1rem;line-height:1.5}</style></head><body><div class="card"><div class="label">无法访问</div><div class="error">${shareInfo.error}</div></div></body></html>`);
  }
  const share = shareInfo.share!;
  const ad = await getAdConfig(c.env);
  const origin = new URL(c.req.url).origin;
  if (share.hasPassword) {
    return c.html(sharePageHTML({ code, fileName: share.fileName, fileSize: share.fileSize, requiresPassword: true, origin, ad }));
  }
  return c.html(sharePageHTML({ code, fileName: share.fileName, fileSize: share.fileSize, requiresPassword: false, origin, ad }));
});

app.get('/dl/:code/raw', async (c) => {
  const code = c.req.param('code');
  const shareInfo = await getShare(code, c.env);
  if (!shareInfo.ok) return c.json({ error: shareInfo.error }, 404);
  const share = shareInfo.share!;
  // 口令校验：分享设了密码时，raw 直链也必须带正确口令才能下载
  // （修复：raw 端点此前绕过口令保护，任何知道 code 的人都能下载文件本体）
  if (share.hasPassword) {
    const url = new URL(c.req.url);
    const pw = url.searchParams.get('password') || '';
    const result = await verifySharePassword(code, pw, c.env, getClientIp(c));
    if (result.rateLimited) {
      return c.json({ error: result.error }, 429, { 'Retry-After': String(result.retryAfterSeconds ?? 60) });
    }
    if (!result.ok) {
      return c.json({ error: 'Password required' }, 403);
    }
  }
  return downloadFileStream(c.env, share.fileId, c.req.header('Range'), true);
});

// ───── 404 ─────
app.notFound((c) => {
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/dl/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.html(FRONTEND_HTML);
});

app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

// ───── Scheduled: periodic orphan cleanup ─────
// Runs on the cron trigger (see wrangler.toml [triggers]).
// Cleans up abandoned chunked uploads whose KV entries are older than
// ORPHAN_MIN_AGE_HOURS (default 2h) — old enough that no in-progress upload
// could still be writing them, young enough that the 7d KV TTL hasn't
// deleted the message_id trail yet.

async function scheduledHandler(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil((async () => {
    try {
      await ensureSchema(env);
      const minAgeHours = Number(env.ORPHAN_MIN_AGE_HOURS || 2);
      const result = await cleanupAllOrphanUploads(env, minAgeHours * 3600 * 1000);
      console.log(`[scheduled] orphan cleanup: deleted=${result.totalDeleted} failed=${result.totalFailed} found=${result.totalFound} skipped=${result.totalSkipped} uploads=${result.uploadIds.length}`);
    } catch (err) {
      console.error('[scheduled] orphan cleanup failed:', err);
    }
  })());
}

export default {
  fetch: app.fetch.bind(app),
  scheduled: scheduledHandler,
};

// ───── Ad Config ─────
interface AdProduct {
  name: string;
  price: string;
  url: string;
  image?: string;
  description?: string;
}

interface AdConfig {
  enabled: boolean;
  shopName: string;
  shopUrl: string;
  products: AdProduct[];
}

async function getAdConfig(env: Env): Promise<AdConfig> {
  try {
    const rows = await env.DB.prepare(
      "SELECT key, value FROM settings WHERE key LIKE 'ads.%'"
    ).all<{ key: string; value: string }>();
    const map: Record<string, string> = {};
    for (const r of rows.results) map[r.key] = r.value;
    const products: AdProduct[] = (() => {
      try { return JSON.parse(map['ads.products'] || '[]'); }
      catch { return []; }
    })();
    return {
      enabled: map['ads.enabled'] === 'true',
      shopName: map['ads.shop_name'] || '我们的商城',
      shopUrl: map['ads.shop_url'] || 'https://www.isoho168.top',
      products,
    };
  } catch {
    return { enabled: false, shopName: '我们的商城', shopUrl: 'https://www.isoho168.top', products: [] };
  }
}

// ───── Ad rendering ─────
function renderAd(ad: AdConfig | undefined): string {
  if (!ad || !ad.enabled || ad.products.length === 0) return '';
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const productCards = ad.products.slice(0, 8).map(p => {
    const imgHtml = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" class="ad-card-img" loading="lazy">`
      : `<div class="ad-card-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
    return `
    <a href="${esc(p.url)}" target="_blank" rel="noopener" class="ad-card">
      ${imgHtml}
      <div class="ad-card-body">
        <div class="ad-card-name">${esc(p.name)}</div>
        ${p.description ? `<div class="ad-card-desc">${esc(p.description)}</div>` : ''}
        <div class="ad-card-bottom">
          <span class="ad-card-price">¥${esc(p.price)}</span>
          <span class="ad-card-btn">立即购买</span>
        </div>
      </div>
    </a>`;
  }).join('\n');

  return `
<div class="ad-wrap">
  <div class="ad-inner">
    <div class="ad-header">
      <div class="ad-header-left">
        <span class="ad-badge">推荐</span>
        <span class="ad-title">${esc(ad.shopName)}</span>
      </div>
      <a href="${esc(ad.shopUrl)}" target="_blank" rel="noopener" class="ad-more">去商城逛逛 →</a>
    </div>
    <div class="ad-grid">
      ${productCards}
    </div>
  </div>
</div>
<style>
.ad-wrap{width:100%;display:flex;justify-content:center;padding:0 1rem 2rem}
.ad-inner{width:100%;max-width:960px}
.ad-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;padding:.5rem 0}
.ad-header-left{display:flex;align-items:center;gap:.6rem}
.ad-badge{background:#faff69;color:#141415;font-size:.75rem;font-weight:700;padding:.2rem .6rem;border-radius:6px}
.ad-title{color:#a1a1a6;font-size:.9rem}
.ad-more{color:#faff69;font-size:.85rem;text-decoration:none;font-weight:600;transition:color .15s cubic-bezier(.22,1,.36,1)}
.ad-more:hover{color:#e6eb52;text-decoration:underline}
.ad-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.75rem}
.ad-card{display:flex;flex-direction:column;background:#19191b;border:1px solid #2a2a2e;border-radius:12px;overflow:hidden;text-decoration:none;color:#ededed;transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s cubic-bezier(.22,1,.36,1),border-color .2s cubic-bezier(.22,1,.36,1)}
.ad-card:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(0,0,0,.4);border-color:#faff69}
.ad-card-img{width:100%;height:160px;object-fit:cover;display:block;background:#141415}
.ad-card-img-placeholder{width:100%;height:120px;display:flex;align-items:center;justify-content:center;color:#85858b;background:#232325}
.ad-card-body{padding:.85rem 1rem 1rem;display:flex;flex-direction:column;flex:1}
.ad-card-name{font-size:.95rem;font-weight:600;color:#ededed;margin-bottom:.25rem;line-height:1.3}
.ad-card-desc{font-size:.78rem;color:#a1a1a6;line-height:1.4;margin-bottom:.6rem;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ad-card-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:.5rem;border-top:1px solid #2a2a2e}
.ad-card-price{color:#faff69;font-size:1.1rem;font-weight:700}
.ad-card-btn{padding:.35rem .85rem;border-radius:8px;background:#faff69;color:#141415;font-size:.78rem;font-weight:700;cursor:pointer;transition:opacity .15s cubic-bezier(.22,1,.36,1)}
.ad-card-btn:hover{opacity:.9}
@media(max-width:640px){.ad-grid{grid-template-columns:1fr}.ad-wrap{padding:0 .75rem 1.5rem}.ad-card-img,.ad-card-img-placeholder{height:100px}}
</style>`;
}

// ───── Helper ─────
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ───── Share pages: shared design tokens ─────
// Single source for the three server-rendered share templates (share /
// folder / gallery). Dark graphite ramp + #faff69 accent, Inter, 4px
// spacing grid, 12–16px card radii, 8px button radii — same language as
// the admin frontend (frontend/index.html loads the same fonts).
const SHARE_FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

const SHARE_BASE_CSS = `
*{box-sizing:border-box;margin:0}
body{background:#141415;color:#ededed;font-family:'Inter',system-ui,-apple-system,sans-serif;min-height:100vh;padding:2rem 1rem}
a{color:#faff69}
.card{background:#19191b;border:1px solid #2a2a2e;border-radius:16px;padding:2rem}
h1{color:#ededed;font-size:1.2rem;margin-bottom:0;word-break:break-all;display:flex;align-items:center;gap:.5rem}
h1 svg{flex-shrink:0;color:#a1a1a6}
.meta{color:#85858b;font-size:.85rem;margin:.5rem 0 1.5rem}
label{display:block;color:#a1a1a6;font-size:.85rem;margin-bottom:.5rem;text-align:left}
input[type=password]{width:100%;padding:.75rem;border-radius:8px;border:1px solid #2a2a2e;background:#141415;color:#ededed;font-size:1rem;outline:none;transition:border-color .15s cubic-bezier(.22,1,.36,1)}
input[type=password]:focus{border-color:#faff69}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;width:100%;margin-top:.75rem;padding:.75rem;border-radius:8px;border:none;font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;transition:background .15s cubic-bezier(.22,1,.36,1),color .15s cubic-bezier(.22,1,.36,1)}
.btn svg{flex-shrink:0}
.btn-primary{background:#faff69;color:#141415}
.btn-primary:hover{background:#e6eb52}
.btn-primary:disabled{background:#232325;color:#85858b;cursor:not-allowed}
.btn-secondary{background:#232325;color:#ededed;border:1px solid #2a2a2e}
.btn-secondary:hover{background:#2c2c2f}
.btn-group{display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap}
.btn-group .btn{width:auto;flex:1;margin-top:0}
.error{color:#f87171;font-size:.85rem;margin-top:.5rem;display:none}
@media(max-width:640px){body{padding:1rem .75rem}.card{padding:1.25rem}h1{font-size:1.05rem}}
`;

/**
 * Generate the share download page HTML — in-page download with progress bar.
 * Uses fetch + ReadableStream to download via Worker, shows real-time progress,
 * then triggers browser save-as via blob URL when complete.
 */
function sharePageHTML(p: { code: string; fileName: string; fileSize: number; requiresPassword: boolean; origin: string; ad?: AdConfig }): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const name = esc(p.fileName);
  const size = formatBytes(p.fileSize);
  const rawUrl = `/dl/${p.code}/raw`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${SHARE_FONT_LINKS}
<title>Download — ${name}</title>
<style>
${SHARE_BASE_CSS}
.page-wrap{display:flex;flex-direction:column;align-items:center;gap:1.5rem}
.card{width:100%;max-width:440px;text-align:center}
h1{justify-content:center}
#progress-wrap{display:none;margin-top:1rem}
#progress-text{color:#a1a1a6;font-size:.85rem;margin-top:.5rem}
progress{width:100%;height:8px;border-radius:4px;overflow:hidden;appearance:none;-webkit-appearance:none}
progress::-webkit-progress-bar{background:#232325;border-radius:4px}
progress::-webkit-progress-value{background:#faff69;border-radius:4px}
progress::-moz-progress-bar{background:#faff69;border-radius:4px}
</style>
</head>
<body>
<div class="page-wrap">
<div class="card">
  <h1><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>${name}</h1>
  <div class="meta">${size}</div>
  ${p.requiresPassword ? `
  <div id="pw-wrap">
    <label for="pwd">文件受密码保护</label>
    <input type="password" id="pwd" placeholder="输入密码" autocomplete="off">
    <div class="error" id="error"></div>
    <button class="btn btn-primary" id="verify-btn" onclick="verifyPassword()">确认</button>
  </div>
  <div id="action-wrap" style="display:none">
    <div class="btn-group">
      <button class="btn btn-secondary" onclick="doDownload()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载</button>
      </div>
      </div>` : `
      <div class="btn-group">
      <button class="btn btn-secondary" onclick="startDownload()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载</button>
      </div>`}
  <div id="progress-wrap">
    <progress id="progress-bar" value="0" max="100"></progress>
    <div id="progress-text">准备下载...</div>
  </div>
</div>

${renderAd(p.ad)}
</div>
<script>
let _pwd='';
${p.requiresPassword ? `
async function verifyPassword(){
  const btn=document.getElementById('verify-btn');
  const err=document.getElementById('error');
  const pwd=document.getElementById('pwd').value;
  err.style.display='none';
  btn.disabled=true;btn.textContent='验证中...';
  try{
    const res=await fetch('/api/shares/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'${p.code}',password:pwd})});
    const data=await res.json();
    if(!data.ok){err.textContent=data.error||'密码错误';err.style.display='block';btn.disabled=false;btn.textContent='确认';return}
    _pwd=pwd;
    document.getElementById('pw-wrap').style.display='none';
    document.getElementById('action-wrap').style.display='block';
  }catch(e){
    err.textContent='网络错误，请重试';err.style.display='block';btn.disabled=false;btn.textContent='确认'
  }
}` : `
async function startDownload(){
  document.getElementById('preview-btn')?.style.setProperty('pointer-events','none');
  doDownload();
}`}
async function doDownload(){
  const wrap=document.getElementById('progress-wrap');
  const bar=document.getElementById('progress-bar');
  const txt=document.getElementById('progress-text');
  wrap.style.display='block';
  try{
    const dlUrl=_pwd ? '${rawUrl}?password='+encodeURIComponent(_pwd) : '${rawUrl}';
    const res=await fetch(dlUrl);
    if(!res.ok){const e=await res.json().catch(()=>({error:'HTTP '+res.status}));txt.textContent='下载失败: '+(e.error||res.status);return}
    const cl=parseInt(res.headers.get('X-Total-Size')||res.headers.get('Content-Length')||'0',10);
    const reader=res.body.getReader();
    const chunks=[];
    let received=0;
    while(true){
      const{done,value}=await reader.read();
      if(done)break;
      chunks.push(value);
      received+=value.length;
      if(cl>0){const pct=Math.round(received/cl*100);bar.value=pct;txt.textContent=pct+'% ('+fmt(received)+'/'+fmt(cl)+')'}
      else{txt.textContent='下载中... '+fmt(received)}
    }
    bar.value=100;
    txt.textContent='下载完成，保存文件中...';
    const blob=new Blob(chunks);
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='${name}';document.body.appendChild(a);a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    txt.textContent='下载完成';
  }catch(e){
    txt.textContent='下载失败: '+e.message;
  }
}
function fmt(b){if(!b||b<=0)return'0 B';const k=1024,s=['B','KB','MB','GB','TB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}
</script>
</body>
</html>`;
}

/**
 * Generate the folder share page HTML — lists all files in a shared folder with download links.
 */
function shareFolderPageHTML(p: { code: string; shareName: string; fileCount: number; requiresPassword: boolean; origin: string; ad?: AdConfig }): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const name = esc(p.shareName);
  const rawUrl = `/dl/f/${p.code}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${SHARE_FONT_LINKS}
<title>Folder — ${name}</title>
<style>
${SHARE_BASE_CSS}
.card{max-width:720px;margin:0 auto;text-align:left}
.meta{margin:.5rem 0 1rem}
.file-list{display:flex;flex-direction:column;gap:.5rem;margin-top:1rem}
.file-item{display:flex;align-items:center;padding:.75rem 1rem;background:#232325;border:1px solid #2a2a2e;border-radius:12px;gap:.75rem;text-decoration:none;color:#ededed;transition:background .15s cubic-bezier(.22,1,.36,1)}
.file-item:hover{background:#2c2c2f}
.file-icon{flex-shrink:0;color:#a1a1a6;display:flex}
.file-icon svg{width:20px;height:20px;display:block}
.file-info{flex:1;min-width:0}
.file-name{display:block;font-size:.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-size{display:block;font-size:.75rem;color:#85858b}
.file-dl-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .75rem;border-radius:8px;border:none;background:#faff69;color:#141415;cursor:pointer;font-size:.8rem;font-weight:600;text-decoration:none;flex-shrink:0}
.file-dl-btn svg{width:14px;height:14px}
.gallery-link{display:inline-flex;align-items:center;gap:.4rem;margin-top:1rem;padding:.5rem 1rem;border-radius:8px;background:#faff69;color:#141415;text-decoration:none;font-size:.875rem;font-weight:600}
.gallery-link svg{width:16px;height:16px}
.embed-section{background:#232325;border-radius:12px;padding:1rem;margin-top:1rem;border:1px solid #2a2a2e}
.embed-section h3{color:#a1a1a6;font-size:.8rem;margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.06em}
.embed-code{background:#141415;padding:.5rem;border-radius:4px;font-size:.75rem;font-family:'JetBrains Mono',monospace;color:#a1a1a6;word-break:break-all;user-select:all}
@media(max-width:640px){.file-item{padding:.6rem .75rem}.file-dl-btn{font-size:.75rem;padding:.35rem .6rem}}
</style>
</head>
<body>
<div class="card">
  <h1><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>${name}</h1>
  <div class="meta">${p.fileCount} files</div>
  ${p.requiresPassword ? `
  <div id="pw-wrap">
    <label for="pwd">此文件夹受密码保护</label>
    <input type="password" id="pwd" placeholder="输入密码" autocomplete="off">
    <div class="error" id="error"></div>
    <button class="btn btn-primary" id="verify-btn" onclick="verifyPassword()">确认</button>
  </div>
  <div id="content-wrap" style="display:none">` : `<div id="content-wrap">`}
    <div id="file-list" class="file-list">
      <div style="text-align:center;padding:2rem;color:#85858b">加载文件中...</div>
    </div>
    <a href="/dl/f/${p.code}/gallery${p.requiresPassword ? '?pwd=' : ''}" class="gallery-link" id="gallery-link" style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>图片画廊</a>
    <div class="embed-section" id="embed-section" style="display:none">
      <h3>图片直链（供外部网站调用）</h3>
      <p style="color:#a1a1a6;font-size:.75rem;margin-bottom:.5rem">点击图片下方的链接复制，用 <code>&lt;img&gt;</code> 标签嵌入</p>
    </div>
  </div>
</div>
${renderAd(p.ad)}
<script>
${p.requiresPassword ? `
async function verifyPassword(){
  const btn=document.getElementById('verify-btn');
  const err=document.getElementById('error');
  const pwd=document.getElementById('pwd').value;
  err.style.display='none';btn.disabled=true;btn.textContent='验证中...';
  try{
    const res=await fetch('/api/shares/folder/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'${p.code}',password:pwd})});
    const data=await res.json();
    if(!data.ok){err.textContent=data.error||'密码错误';err.style.display='block';btn.disabled=false;btn.textContent='确认';return}
    showFiles(data.files||[], data.name, pwd);
    document.getElementById('pw-wrap').style.display='none';
  }catch(e){err.textContent='网络错误，请重试';err.style.display='block';btn.disabled=false;btn.textContent='确认'}
}` : `
async function init(){try{const r=await fetch('/api/shares/folder/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'${p.code}',password:''})});const d=await r.json();if(d.ok)showFiles(d.files||[], d.name, '')}catch(e){}}
init();`}
const FILE_ICONS={
img:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
video:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>',
audio:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
pdf:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>',
archive:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
code:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
file:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'};
const DL_ICON='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
function fileIcon(name){
  if(/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(name))return FILE_ICONS.img;
  if(/\.(mp4|webm|mkv|mov)$/i.test(name))return FILE_ICONS.video;
  if(/\.(mp3|wav|flac)$/i.test(name))return FILE_ICONS.audio;
  if(/\.(pdf)$/i.test(name))return FILE_ICONS.pdf;
  if(/\.(zip|rar|7z|tar|gz)$/i.test(name))return FILE_ICONS.archive;
  if(/\.(js|ts|py|go|rs|java)$/i.test(name))return FILE_ICONS.code;
  return FILE_ICONS.file;
}
function showFiles(files, folderName, pwd){
  const pwdParam = pwd ? '?password=' + encodeURIComponent(pwd) : '';
  if(pwd){
    const gl=document.getElementById('gallery-link');
    if(gl) gl.href='/dl/f/${p.code}/gallery?pwd=' + encodeURIComponent(pwd);
  }
  const wrap=document.getElementById('content-wrap');wrap.style.display='block';
  const list=document.getElementById('file-list');list.innerHTML='';
  const hasImages=files.some(f=>/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.name));
  if(hasImages){
    document.getElementById('gallery-link').style.display='inline-flex';
    document.getElementById('embed-section').style.display='block';
  }
  if(files.length===0){list.innerHTML='<div style="text-align:center;padding:2rem;color:#85858b">文件夹为空</div>';return}
  files.forEach(f=>{
    const icon=fileIcon(f.name);
    const sz=fmt(f.size);
    const isImg=/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.name);
    const dlUrl='/dl/f/${p.code}/raw/'+f.id + pwdParam;
    const hotlink='${p.origin}/img/${p.code}/'+f.id;
    const row=document.createElement('div');
    row.style.marginBottom='.35rem';
    row.innerHTML='<a href="'+dlUrl+'" class="file-item">'
      +'<span class="file-icon">'+icon+'</span>'
      +'<span class="file-info"><span class="file-name">'+esc(f.name)+'</span><span class="file-size">'+sz+'</span></span>'
      +'<span class="file-dl-btn">'+DL_ICON+'下载</span>'
      +'</a>'
      +(isImg?'<div style="display:flex;align-items:center;gap:.5rem;padding:.15rem 0 0 2.5rem;font-size:.75rem;color:#85858b">直链: <code class="embed-code" style="font-size:.7rem;cursor:pointer" onclick="navigator.clipboard.writeText(this.textContent)">'+hotlink+'</code></div>':'');
    list.appendChild(row);
  });
}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmt(b){if(!b||b<=0)return'0 B';const k=1024,s=['B','KB','MB','GB','TB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}
</script>
</body>
</html>`;
}

/**
 * Generate the image gallery page HTML — responsive grid with lightbox.
 */
function galleryPageHTML(p: { code: string; shareName: string; images: any[]; origin: string; ad?: AdConfig; pwd?: string }): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const name = esc(p.shareName);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${SHARE_FONT_LINKS}
<title>Gallery — ${name}</title>
<style>
${SHARE_BASE_CSS}
body{padding:0}
header{padding:1.5rem 2rem;border-bottom:1px solid #2a2a2e;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem}
header .meta{margin:0}
header .links{display:flex;gap:.5rem}
header .links a{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .8rem;border-radius:8px;text-decoration:none;font-size:.8rem;font-weight:600;background:#232325;color:#ededed;border:1px solid #2a2a2e;transition:background .15s cubic-bezier(.22,1,.36,1)}
header .links a:hover{background:#2c2c2f}
header .links a svg{width:14px;height:14px;color:#a1a1a6}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem;padding:1.5rem 2rem}
.gallery-item{position:relative;border-radius:12px;overflow:hidden;background:#19191b;border:1px solid #2a2a2e;cursor:pointer;aspect-ratio:1;transition:transform .15s cubic-bezier(.22,1,.36,1),box-shadow .15s cubic-bezier(.22,1,.36,1)}
.gallery-item:hover{transform:scale(1.02);box-shadow:0 8px 24px rgba(0,0,0,.4)}
.gallery-item img{width:100%;height:100%;object-fit:cover;display:block}
.gallery-item .info{position:absolute;bottom:0;left:0;right:0;padding:.5rem;background:linear-gradient(transparent,rgba(0,0,0,.8));font-size:.75rem;color:#ededed;opacity:0;transition:opacity .2s cubic-bezier(.22,1,.36,1)}
.gallery-item:hover .info{opacity:1}
.gallery-item .info .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gallery-item .info .size{color:#a1a1a6;font-size:.7rem}

/* Lightbox */
#lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;align-items:center;justify-content:center;flex-direction:column;padding:2rem}
#lightbox.show{display:flex}
#lightbox img{max-width:95%;max-height:85vh;border-radius:8px;object-fit:contain}
#lightbox .lb-info{color:#a1a1a6;font-size:.85rem;margin-top:1rem;text-align:center}
#lightbox .lb-info a{color:#faff69;text-decoration:none}
#lightbox .lb-nav{position:absolute;top:50%;transform:translateY(-50%);font-size:2.5rem;color:#a1a1a6;cursor:pointer;padding:1rem;user-select:none;transition:color .15s cubic-bezier(.22,1,.36,1)}
#lightbox .lb-nav:hover{color:#ededed}
#lightbox .lb-prev{left:1rem}
#lightbox .lb-next{right:1rem}
#lightbox .lb-close{position:absolute;top:1rem;right:1.5rem;font-size:2rem;color:#a1a1a6;cursor:pointer;background:none;border:none;transition:color .15s cubic-bezier(.22,1,.36,1)}
#lightbox .lb-close:hover{color:#ededed}
#lightbox .lb-counter{position:absolute;bottom:1.5rem;color:#85858b;font-size:.8rem}
#lightbox .lb-hotlink{position:absolute;bottom:1.5rem;color:#faff69;font-size:.75rem;background:#19191b;padding:.35rem .75rem;border-radius:6px;cursor:pointer;user-select:all}
@media(max-width:640px){header{padding:1rem}.gallery{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));padding:1rem;gap:.5rem}#lightbox{padding:1rem}#lightbox img{max-width:100%}#lightbox .lb-nav{font-size:1.5rem}}
.empty{text-align:center;padding:4rem 2rem;color:#85858b}
.empty p{font-size:1.125rem;margin-bottom:.5rem}
.empty .empty-icon{display:flex;justify-content:center;color:#85858b;margin-bottom:.5rem}
</style>
</head>
<body>
<header>
  <div>
    <h1><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>${name}</h1>
    <div class="meta">${p.images.length} images</div>
  </div>
  <div class="links">
    <a href="/dl/f/${p.code}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>文件列表</a>
  </div>
</header>

${p.images.length === 0 ? `
<div class="empty">
  <p class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></p>
  <p>此文件夹没有图片</p>
  <p style="font-size:.875rem;margin-top:.25rem;color:#85858b">只有图片文件才会显示在画廊中</p>
</div>` : `
<div class="gallery" id="gallery">
  ${p.images.map((img, idx) => {
    const imgUrl = `/img/${p.code}/${img.id}`;
    const thumbUrl = '/dl/f/' + p.code + '/raw/' + img.id + (p.pwd ? '?password=' + encodeURIComponent(p.pwd) : ''); // proxy for thumbnail
    return `<div class="gallery-item" onclick="openLightbox(${idx})">
      <img src="${thumbUrl}" alt="${esc(img.name)}" loading="lazy">
      <div class="info">
        <div class="name">${esc(img.name)}</div>
        <div class="size">${formatBytes(img.size)}</div>
      </div>
    </div>`;
  }).join('\n  ')}
</div>

<!-- Lightbox -->
<div id="lightbox" onclick="closeLightbox(event)">
  <button class="lb-close" onclick="closeLightbox()">✕</button>
  <span class="lb-nav lb-prev" onclick="event.stopPropagation();prevImage()">‹</span>
  <span class="lb-nav lb-next" onclick="event.stopPropagation();nextImage()">›</span>
  <img id="lb-img" src="" alt="">
  <div class="lb-info" id="lb-info"></div>
  <div class="lb-counter" id="lb-counter"></div>
</div>
${renderAd(p.ad)}
<script>
const images = ${JSON.stringify(p.images.map(img => ({
    id: img.id,
    name: img.name,
    size: img.size,
    url: '/img/${p.code}/' + img.id,
    thumbUrl: '/dl/f/${p.code}/raw/' + img.id + (p.pwd ? '?password=' + encodeURIComponent(p.pwd) : ''),
    hotlink: '${p.origin}/img/${p.code}/' + img.id,
  })))};
let currentIdx = 0;

function openLightbox(idx) {
  currentIdx = idx;
  const img = images[idx];
  document.getElementById('lb-img').src = img.url;
  document.getElementById('lb-info').innerHTML = esc(img.name) + ' · ' + fmt(img.size) + ' — <a href="' + img.hotlink + '" target="_blank" onclick="event.stopPropagation()">直链</a>';
  document.getElementById('lb-counter').textContent = (idx + 1) + ' / ' + images.length;
  document.getElementById('lightbox').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('lightbox').classList.remove('show');
  document.body.style.overflow = '';
}

function nextImage() {
  openLightbox((currentIdx + 1) % images.length);
}

function prevImage() {
  openLightbox((currentIdx - 1 + images.length) % images.length);
}

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('lightbox').classList.contains('show')) return;
  if (e.key === 'Escape') closeLightbox(e);
  if (e.key === 'ArrowRight') nextImage();
  if (e.key === 'ArrowLeft') prevImage();
});

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmt(b){if(!b||b<=0)return'0 B';const k=1024,s=['B','KB','MB','GB','TB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}
</script>`}
</body>
</html>`;
}
