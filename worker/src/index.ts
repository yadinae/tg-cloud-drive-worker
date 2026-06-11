import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import {
  listTopics,
  createTopic as createTopicMeta,
  renameTopic,
  deleteTopic,
  listFiles,
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
} from './metadata';
import { uploadCompleteFile, downloadFileStream, getShareDownloadUrl, receiveUploadChunk, finalizeChunkedUpload, transferFileByUrl } from './storage';
import {
  createShare,
  getShare,
  verifySharePassword,
  listShares,
  listAllShares,
  updateShare,
  deleteShare,
} from './shares';
import { verifyBotConnection, deleteFileMessages } from './bot';
import { FRONTEND_HTML, FRONTEND_JS_NAME, FRONTEND_JS_CONTENT } from './frontend-assets';

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
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'Content-Disposition', 'Accept-Ranges'],
}));

// ───── Auth middleware ─────
async function authMiddleware(c: any, next: any) {
  let token = '';
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = c.req.query('token') || '';
  }
  if (!token) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  if (token !== c.env.DRIVE_AUTH_TOKEN) {
    return c.json({ error: 'Invalid auth token' }, 403);
  }
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
  const result = await verifySharePassword(code, password || '', c.env);
  return c.json(result);
});

// ═══════════ All routes below require auth ═══════════
app.use('/api/*', authMiddleware);

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
  const res = await fetch(`https://api.telegram.org/bot${c.env.TG_BOT_TOKEN}/createForumTopic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: c.env.STORAGE_CHANNEL_ID, name: trimmedName }),
  });
  const tgResult: any = await res.json();

  if (!tgResult.ok) {
    return c.json({ error: `Telegram API error: ${tgResult.description}` }, 500);
  }

  const topicId = tgResult.result.message_thread_id;

  // Store in D1
  const topic = await createTopicMeta(c.env, topicId, trimmedName);
  return c.json({ ok: true, topic }, 201);
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
  await fetch(`https://api.telegram.org/bot${c.env.TG_BOT_TOKEN}/editForumTopic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: c.env.STORAGE_CHANNEL_ID, message_thread_id: topicId, name: trimmedName }),
  });

  // Rename in D1
  const ok = await renameTopic(c.env, topicId, trimmedName);
  return c.json({ ok });
});

// DELETE /api/topics/:topicId — delete a topic (folder)
app.delete('/api/topics/:topicId', async (c) => {
  const topicId = Number(c.req.param('topicId'));

  // Delete from Telegram
  await fetch(`https://api.telegram.org/bot${c.env.TG_BOT_TOKEN}/deleteForumTopic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: c.env.STORAGE_CHANNEL_ID, message_thread_id: topicId }),
  });

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
  const files = await listFiles(c.env, Number(topicId), folderId);
  return c.json({ files });
});

// POST /api/files/upload — upload file to a topic
app.post('/api/files/upload', async (c) => {
  const contentType = c.req.header('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const fileEntry = formData.get('file') as File | null;
    const topicId = Number(formData.get('topicId'));
    const mimeType = (formData.get('mimeType') as string) || fileEntry?.type || 'application/octet-stream';

    if (!fileEntry || !topicId) {
      return c.json({ error: 'file and topicId are required' }, 400);
    }
    const buffer = await fileEntry.arrayBuffer();
    const result = await uploadCompleteFile(c.env, topicId, fileEntry.name, mimeType, buffer);
    // Set folder if provided
    const folderId = formData.get('folderId') ? Number(formData.get('folderId')) : null;
    if (folderId && result.fileId) {
      await c.env.DB.prepare('UPDATE files SET folder_id = ? WHERE id = ?').bind(folderId, result.fileId).run();
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

// PUT /api/files/:id/move — move file to another topic
app.put('/api/files/:id/move', async (c) => {
  const id = Number(c.req.param('id'));
  const { topicId } = await c.req.json();
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

// ───── URL Transfer: download from URL and store ─────
app.post('/api/transfer', async (c) => {
  const { url, topicId, folderId } = await c.req.json();
  if (!url || !topicId) return c.json({ error: 'url and topicId required' }, 400);
  try {
    const result = await transferFileByUrl(c.env, url, topicId, folderId || null);
    return c.json({ ok: true, ...result }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
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
  const shares = await listAllShares(c.env);
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

// ───── Public: Share Download ─────
app.get('/dl/:code', async (c) => {
  const code = c.req.param('code');
  const shareInfo = await getShare(code, c.env);
  if (!shareInfo.ok) {
    return c.html(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Share Link</title><style>body{background:#0f172a;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#1e293b;border-radius:12px;padding:2rem;max-width:400px;text-align:center}.error{color:#f87171}</style></head><body><div class="card"><h1 class="error">❌ ${shareInfo.error}</h1></div></body></html>`);
  }
  const share = shareInfo.share!;
  if (share.hasPassword) {
    return c.html(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Download — ${share.fileName}</title><style>*{box-sizing:border-box;margin:0}body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}.card{background:#1e293b;border-radius:12px;padding:2rem;width:100%;max-width:420px}h1{color:#38bdf8;font-size:1.25rem;margin-bottom:.25rem}.meta{color:#94a3b8;font-size:.875rem;margin-bottom:1.5rem}label{display:block;color:#94a3b8;font-size:.875rem;margin-bottom:.5rem}input[type=password]{width:100%;padding:.75rem;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem;outline:none}input[type=password]:focus{border-color:#38bdf8}button{width:100%;margin-top:1rem;padding:.75rem;border-radius:8px;border:none;background:#38bdf8;color:#0f172a;font-size:1rem;font-weight:600;cursor:pointer}button:hover{background:#7dd3fc}.error{color:#f87171;font-size:.875rem;margin-top:.5rem;display:none}</style></head><body><div class="card"><h1>📁 ${share.fileName}</h1><div class="meta">${formatBytes(share.fileSize)}</div><label for="pwd">This file is password protected</label><input type="password" id="pwd" placeholder="Enter password" autocomplete="off"><div class="error" id="error"></div><button onclick="download()">Download</button></div><script>async function download(){const pwd=document.getElementById('pwd').value;const err=document.getElementById('error');err.style.display='none';try{const res=await fetch('/api/shares/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'${code}',password:pwd})});const data=await res.json();if(data.ok&&data.downloadUrl){window.location.href=data.downloadUrl}else if(data.ok){window.location.href='/dl/${code}/raw'}else{err.textContent=data.error||'Invalid password';err.style.display='block'}}catch(e){err.textContent='Network error';err.style.display='block'}}</script></body></html>`);
  }
  return c.redirect(`/dl/${code}/raw`);
});

app.get('/dl/:code/raw', async (c) => {
  const code = c.req.param('code');
  const shareInfo = await getShare(code, c.env);
  if (!shareInfo.ok) return c.json({ error: shareInfo.error }, 404);
  return downloadFileStream(c.env, shareInfo.share!.fileId, c.req.header('Range'), true);
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

export default app;

// ───── Helper ─────
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
