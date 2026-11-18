import type { Hono } from 'hono';
import type { Env } from '../types';
import { listFilesPaginated, renameFile, moveFile, getAndDeleteFile, searchFiles } from '../metadata';
import { uploadCompleteFile, downloadFileStream, receiveUploadChunk, finalizeChunkedUpload, transferFileByUrl, cleanupUploadChunks } from '../storage';
import { UrlBlockedError } from '../ssrf';
import { deleteFileMessages } from '../bot';

export function registerFilesRoutes(app: Hono<{ Bindings: Env }>): void {
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
}
