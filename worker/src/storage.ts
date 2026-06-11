import type { Env, ChunkInfo, UploadProgress } from './types';
import { sendDocumentToChannel, streamFileFromTelegram, getTelegramFilePath } from './bot';
import { createFile, updateFileManifest, getFile } from './metadata';

// ───── Constants ─────
const CHUNK_SIZE = 18 * 1024 * 1024; // 18MB per chunk — under Bot API 20MB download limit
const UPLOAD_PREFIX = 'up:'; // KV prefix for in-progress chunked uploads

/**
 * Upload a complete file to a specific topic (forum thread) in Telegram.
 */
export async function uploadCompleteFile(
  env: Env,
  topicId: number,
  fileName: string,
  mimeType: string,
  fileBuffer: ArrayBuffer,
  onProgress?: (progress: UploadProgress) => void,
  folderId?: number | null,
): Promise<{ fileId: number; manifest: ChunkInfo[] }> {
  const totalSize = fileBuffer.byteLength;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const fileId = `${fileName}-${Date.now()}`;

  const emitProgress = (status: UploadProgress['status'], uploadedChunks: number, uploadedBytes: number) => {
    onProgress?.({ fileId, fileName, totalChunks, uploadedChunks, totalBytes: totalSize, uploadedBytes, status });
  };

  emitProgress('preparing', 0, 0);

  const chunks: ChunkInfo[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunkData = fileBuffer.slice(start, end);
    const chunkFileName = totalChunks > 1 ? `${fileName}.part${String(i).padStart(4, '0')}` : fileName;

    emitProgress('uploading', i, start);

    let attempts = 0;
    let success = false;
    while (!success && attempts < 3) {
      try {
        // Send to the specific topic using message_thread_id
        const chunkInfo = await sendDocumentToChannel(env, chunkData, chunkFileName, 'application/octet-stream', topicId);
        chunks.push({ ...chunkInfo, part_index: i });
        success = true;
      } catch (err: any) {
        attempts++;
        if (attempts >= 3) {
          emitProgress('error', i, start);
          throw new Error(`Failed to upload chunk ${i} after 3 attempts: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
      }
    }
  }

  emitProgress('finalizing', totalChunks, totalSize);

  const manifestJson = JSON.stringify(chunks);
  const firstChunk = chunks[0];
  const effectiveMimeType = mimeType || 'application/octet-stream';

  const fileRecord = await createFile(
    env, topicId, fileName, totalSize, effectiveMimeType,
    manifestJson, totalChunks, firstChunk.file_id, firstChunk.file_unique_id,
    firstChunk.message_id, folderId, // may be undefined for first chunk
  );

  if (totalChunks > 1) {
    await updateFileManifest(env, fileRecord.id, manifestJson, totalChunks);
  }

  emitProgress('done', totalChunks, totalSize);

  return { fileId: fileRecord.id, manifest: chunks };
}

/**
 * Stream file download through Worker, pulling from Telegram Bot API.
 */
export async function downloadFileStream(
  env: Env,
  fileId: number,
  range?: string,
): Promise<Response> {
  const fileRecord = await getFile(env, fileId);
  if (!fileRecord) {
    return new Response(JSON.stringify({ error: 'File not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const manifest: ChunkInfo[] = JSON.parse(fileRecord.manifest);

  // ─── Single chunk: proxy through Worker with retry ───
  if (manifest.length === 1) {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await streamFileFromTelegram(env, manifest[0].file_id, range);
        return new Response(res.body, {
          status: res.status,
          headers: new Headers({
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${fileRecord.name}"`,
            'Content-Length': res.headers.get('Content-Length') || String(fileRecord.size),
            'Accept-Ranges': 'bytes',
            ...(res.headers.get('Content-Range') ? { 'Content-Range': res.headers.get('Content-Range')! } : {}),
          }),
        });
      } catch (err: any) {
        lastErr = err;
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    return new Response(JSON.stringify({ error: `Download failed after 3 attempts: ${lastErr?.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── Multi-chunk: parallel fetch, ordered output ───
  if (range) {
    console.warn('Range requests not yet supported for multi-chunk files');
  }

  // Check Bot API download limit
  const tooBigChunk = manifest.find(c => c.size > 20 * 1024 * 1024);
  if (tooBigChunk) {
    return new Response(JSON.stringify({
      error: `Chunk ${tooBigChunk.part_index} is ${(tooBigChunk.size / 1024 / 1024).toFixed(0)}MB, exceeding Bot API 20MB download limit. Re-upload the file with the updated client (18MB chunks).`
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const totalSize = manifest.reduce((sum, c) => sum + c.size, 0);

  // Use a simple approach: fetch chunks sequentially but with retry per chunk
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Write content-type+disposition header early so browser starts receiving
  (async () => {
    for (let i = 0; i < manifest.length; i++) {
      let success = false;
      for (let attempt = 0; attempt < 3 && !success; attempt++) {
        try {
          const chunkRes = await streamFileFromTelegram(env, manifest[i].file_id);
          const reader = chunkRes.body?.getReader();
          if (!reader) throw new Error(`Failed to read chunk ${i}`);
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
          success = true;
        } catch (err: any) {
          console.error(`Chunk ${i} attempt ${attempt + 1} failed:`, err.message);
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
      if (!success) {
        try {
          await writer.write(new TextEncoder().encode(
            JSON.stringify({ error: `Chunk ${i} download failed after 3 attempts` })
          ));
        } catch {}
        break;
      }
    }
    await writer.close();
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileRecord.name}"`,
      'Content-Length': String(totalSize),
      'Accept-Ranges': 'bytes',
    },
  });
}

/**
 * Transfer a file from an external URL directly into the cloud drive.
 * Fetches the URL, streams content in 18MB chunks, uploads each to Telegram,
 * then creates the D1 file record — no local download needed.
 */
export async function transferFromUrl(
  env: Env,
  topicId: number,
  url: string,
  fileName?: string,
  folderId?: number | null,
): Promise<{ fileId: number; manifest: ChunkInfo[] }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  // Determine file name from Content-Disposition, URL path, or explicit name
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const cd = response.headers.get('content-disposition');
  let name = fileName || '';
  if (!name && cd) {
    const m = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (m) name = m[1].replace(/['"]/g, '').trim();
  }
  if (!name) {
    name = url.split('/').pop()?.split('?')[0] || 'download';
  }

  const body = response.body;
  if (!body) throw new Error('Response body is null');

  const reader = body.getReader();
  const chunks: ChunkInfo[] = [];
  let partIndex = 0;
  let totalUploaded = 0;
  let buffer = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      const newBuf = new Uint8Array(buffer.length + value.length);
      newBuf.set(buffer);
      newBuf.set(value, buffer.length);
      buffer = newBuf;
    }

    // Drain buffer in full-chunk blocks
    while (buffer.length >= CHUNK_SIZE) {
      const chunkData = buffer.slice(0, CHUNK_SIZE);
      buffer = buffer.slice(CHUNK_SIZE);

      const chunkInfo = await sendDocumentToChannel(
        env, chunkData.buffer as ArrayBuffer,
        `${name}.part${String(partIndex).padStart(4, '0')}`,
        'application/octet-stream', topicId,
      );
      chunks.push({ ...chunkInfo, part_index: partIndex });
      totalUploaded += chunkData.length;
      partIndex++;
    }

    if (done) {
      // Flush remaining bytes
      if (buffer.length > 0) {
        const chunkInfo = await sendDocumentToChannel(
          env, buffer.buffer as ArrayBuffer,
          `${name}.part${String(partIndex).padStart(4, '0')}`,
          'application/octet-stream', topicId,
        );
        chunks.push({ ...chunkInfo, part_index: partIndex });
        totalUploaded += buffer.length;
        partIndex++;
        buffer = new Uint8Array(0);
      }
      break;
    }
  }

  if (chunks.length === 0) {
    throw new Error('No data received from URL');
  }

  const manifestJson = JSON.stringify(chunks);
  const firstChunk = chunks[0];
  const totalChunks = chunks.length;

  const fileRecord = await createFile(
    env, topicId, name, totalUploaded, contentType,
    manifestJson, totalChunks, firstChunk.file_id, firstChunk.file_unique_id,
    firstChunk.message_id, folderId,
  );
  if (totalChunks > 1) {
    await updateFileManifest(env, fileRecord.id, manifestJson, totalChunks);
  }

  return { fileId: fileRecord.id, manifest: chunks };
}

export async function getShareDownloadUrl(env: Env, fileId: number): Promise<string | null> {
  const fileRecord = await getFile(env, fileId);
  if (!fileRecord) return null;

  const manifest: ChunkInfo[] = JSON.parse(fileRecord.manifest);
  if (manifest.length === 1) {
    try {
      return await getTelegramFilePath(env, manifest[0].file_id);
    } catch {
      return null;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// Frontend chunked upload API
// ─────────────────────────────────────────────

/**
 * Receive a single chunk from the frontend, send to Bot API,
 * store result in KV for later finalization.
 */
export async function receiveUploadChunk(
  env: Env,
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  fileName: string,
  fileSize: number,
  mimeType: string,
  topicId: number,
  chunkBuffer: ArrayBuffer,
  folderId?: number | null,
): Promise<{ ok: boolean; chunkIndex: number }> {
  const chunkFileName = totalChunks > 1 ? `${fileName}.part${String(chunkIndex).padStart(4, '0')}` : fileName;

  try {
    const chunkInfo = await sendDocumentToChannel(env, chunkBuffer, chunkFileName, 'application/octet-stream', topicId);

    // Store chunk info in KV
    const chunkKey = `${UPLOAD_PREFIX}${uploadId}:${chunkIndex}`;
    await env.SHARES.put(chunkKey, JSON.stringify({
      file_id: chunkInfo.file_id,
      file_unique_id: chunkInfo.file_unique_id,
      size: chunkBuffer.byteLength,
      part_index: chunkIndex,
      message_id: chunkInfo.message_id,
    }), { expirationTtl: 86400 }); // 24h TTL

    // Store folderId in meta KV for finalization step
    if (folderId !== undefined && chunkIndex === 0) {
      await env.SHARES.put(`${UPLOAD_PREFIX}${uploadId}:meta`, JSON.stringify({ folderId }), { expirationTtl: 86400 });
    }

    return { ok: true, chunkIndex };
  } catch (err: any) {
    throw new Error(`Chunk ${chunkIndex} upload failed: ${err.message}`);
  }
}

/**
 * Finalize a multi-chunk upload: read all chunk info from KV,
 * create the D1 file record with the complete manifest.
 */
export async function finalizeChunkedUpload(
  env: Env,
  uploadId: string,
  topicId: number,
  fileName: string,
  fileSize: number,
  mimeType: string,
  totalChunks: number,
  folderId?: number | null,
): Promise<{ fileId: number; manifest: ChunkInfo[] }> {
  const chunks: ChunkInfo[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkKey = `${UPLOAD_PREFIX}${uploadId}:${i}`;
    const raw = await env.SHARES.get(chunkKey);
    if (!raw) {
      throw new Error(`Missing chunk ${i}/${totalChunks} for upload ${uploadId}`);
    }
    const info = JSON.parse(raw);
    chunks.push({
      file_id: info.file_id,
      file_unique_id: info.file_unique_id,
      size: info.size,
      part_index: i,
      message_id: info.message_id,
    });

    // Clean up KV entry
    await env.SHARES.delete(chunkKey);
  }

  // Clean up upload metadata (if any)
  await env.SHARES.delete(`${UPLOAD_PREFIX}${uploadId}:meta`).catch(() => {});

  const manifestJson = JSON.stringify(chunks);
  const effectiveMimeType = mimeType || 'application/octet-stream';
  const firstChunk = chunks[0];

  // Resolve folderId: parameter takes priority, otherwise check KV meta
  let resolvedFolderId = folderId;
  if (resolvedFolderId === undefined) {
    try {
      const metaRaw = await env.SHARES.get(`${UPLOAD_PREFIX}${uploadId}:meta`);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        resolvedFolderId = meta.folderId ?? null;
      }
    } catch { /* ignore — fall back to null */ }
  }

  const fileRecord = await createFile(
    env, topicId, fileName, fileSize, effectiveMimeType,
    manifestJson, totalChunks, firstChunk.file_id, firstChunk.file_unique_id,
    firstChunk.message_id, resolvedFolderId ?? null,
  );

  return { fileId: fileRecord.id, manifest: chunks };
}
