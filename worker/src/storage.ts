import type { Env, ChunkInfo, UploadProgress } from './types';
import { sendDocumentToChannel, streamFileFromTelegram, getTelegramFilePath, deleteTelegramMessage } from './bot';
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

    // Pace chunks: avoid hitting 20/min Bot API rate limit
    if (i < totalChunks - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  emitProgress('finalizing', totalChunks, totalSize);

  const manifestJson = JSON.stringify(chunks);
  const firstChunk = chunks[0];
  const effectiveMimeType = mimeType || 'application/octet-stream';

  // The message_id is not immediately returned from sendDocument with topic
  // We store it if available
  const fileRecord = await createFile(
    env, topicId, fileName, totalSize, effectiveMimeType,
    manifestJson, totalChunks, firstChunk.file_id, firstChunk.file_unique_id,
    firstChunk.message_id, // may be undefined for first chunk
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
  forceDownload?: boolean,
): Promise<Response> {
  const fileRecord = await getFile(env, fileId);
  if (!fileRecord) {
    return new Response(JSON.stringify({ error: 'File not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const manifest: ChunkInfo[] = JSON.parse(fileRecord.manifest);
  // ─── Single chunk: proxy through Worker — always proxy for reliability (no CDN CORS issues) ───
  if (manifest.length === 1) {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await streamFileFromTelegram(env, manifest[0].file_id, range);
        const singleHeaders = new Headers({
          'Content-Type': fileRecord.mime_type,
          'Content-Disposition': 'inline',
          'X-Total-Size': String(fileRecord.size),
          'Accept-Ranges': 'bytes',
        });
        // Passthrough Content-Length from Telegram (passthrough body, no buffering)
        const tgCL = res.headers.get('Content-Length');
        if (tgCL) singleHeaders.set('Content-Length', tgCL);
        if (range && res.headers.get('Content-Range')) {
          singleHeaders.set('Content-Range', res.headers.get('Content-Range')!);
        }
        return new Response(res.body, { status: res.status, headers: singleHeaders });
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

  // ─── Multi-chunk: parallel fetch (max 3), ordered write ───
  if (range) {
    console.warn('Range requests not yet supported for multi-chunk files');
  }

  // Check Bot API download limit
  const tooBigChunk = manifest.find(c => c.size > 20 * 1024 * 1024);
  if (tooBigChunk) {
    return new Response(JSON.stringify({
      error: `Chunk ${tooBigChunk.part_index} is ${(tooBigChunk.size / 1024 / 1024).toFixed(0)}MB, exceeding Bot API 20MB download limit.`
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }


  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    try {
      // Buffer for out-of-order chunks (index → Uint8Array)
      const buffer = new Array<Uint8Array | null>(manifest.length).fill(null);
      let nextIdx = 0;          // Next chunk index to write
      let nextFetchIdx = 0;     // Next chunk index to start fetching
      let inFlight = 0;         // Currently fetching
      const MAX_PARALLEL = 3;

      // Fetch one chunk and store in buffer
      async function fetchAndBuffer(idx: number) {
        const chunk = manifest[idx];
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await streamFileFromTelegram(env, chunk.file_id);
            const reader = res.body?.getReader();
            if (!reader) throw new Error('No reader');
            const parts: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              parts.push(value);
            }
            // Concatenate
            const total = parts.reduce((s, p) => s + p.length, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const p of parts) { merged.set(p, offset); offset += p.length; }
            buffer[idx] = merged;
            return;
          } catch (err: any) {
            if (attempt === 2) throw new Error(`Chunk ${idx} failed: ${err.message}`);
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        }
      }

      // Shared error flag: any chunk failure aborts the entire stream
      let streamError: Error | null = null;

      // Fire-and-forget fetchers
      function startFetch(idx: number) {
        inFlight++;
        fetchAndBuffer(idx).catch(err => {
          streamError = err;
          console.error(`Chunk ${idx} download failed:`, err.message);
        }).finally(() => { inFlight--; });
      }

      // Main loop: keep filling up to MAX_PARALLEL, write when ordered
      while (nextIdx < manifest.length && !streamError) {
        // Launch new fetches
        while (inFlight < MAX_PARALLEL && nextFetchIdx < manifest.length) {
          startFetch(nextFetchIdx++);
        }
        // If the next chunk is ready, write it (and any subsequent ready chunks)
        while (nextIdx < manifest.length && buffer[nextIdx] !== null && !streamError) {
          await writer.write(buffer[nextIdx]!);
          buffer[nextIdx] = null;
          nextIdx++;
        }
        // If nothing to write and nothing in-flight, break (all done or all errored)
        if (inFlight === 0) break;
        // Small yield to event loop
        await new Promise(r => setTimeout(r, 5));
      }

      if (streamError) {
        throw streamError;
      }
    } catch (err: any) {
      console.error('Multi-chunk stream error:', err.message);
      // Abort the writer so the client gets an error response, not corrupted content
      try { await writer.abort(err.message); } catch { /* writer may already be closed */ }
      return;
    }
    await writer.close();
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': fileRecord.mime_type,
      'Content-Disposition': 'inline',
      'X-Total-Size': String(fileRecord.size),
      'Accept-Ranges': 'bytes',
    },
  });
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

  const fileRecord = await createFile(
    env, topicId, fileName, fileSize, effectiveMimeType,
    manifestJson, totalChunks, firstChunk.file_id, firstChunk.file_unique_id,
    firstChunk.message_id,
  );

  return { fileId: fileRecord.id, manifest: chunks };
}

/**
 * Download a file from a URL and store it in the drive.
 * Handles chunking for files > 18MB automatically.
 * Max file size: 100MB (Worker memory limit).
 */
export async function transferFileByUrl(
  env: Env,
  url: string,
  topicId: number,
  folderId: number | null,
): Promise<{ fileId: number; fileName: string; size: number }> {
  const MAX_SIZE = 100 * 1024 * 1024;

  // Retry the initial fetch up to 3 times with backoff
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) break;
      if (attempt < 2 && res.status >= 500) {
        // Server error — retry
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      if (attempt === 2 || err.name === 'AbortError') {
        throw new Error(`Failed to fetch URL after 3 attempts: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  if (!res) throw new Error('Failed to fetch URL after 3 attempts');

  let fileName = '';
  const cd = res.headers.get('Content-Disposition');
  if (cd) {
    const match = cd.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
    if (match) fileName = decodeURIComponent(match[1]);
  }
  if (!fileName) {
    const urlPath = new URL(url).pathname;
    fileName = urlPath.split('/').pop() || 'downloaded_file';
    if (!fileName.includes('.')) fileName += '.bin';
  }

  const contentLengthStr = res.headers.get('Content-Length');
  const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : 0;
  if (contentLength > MAX_SIZE) {
    throw new Error(`File too large: ${(contentLength / 1024 / 1024).toFixed(0)}MB (max ${MAX_SIZE / 1024 / 1024}MB)`);
  }

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_SIZE) {
    throw new Error(`File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(0)}MB (max ${MAX_SIZE / 1024 / 1024}MB)`);
  }

  const mimeType = res.headers.get('Content-Type') || 'application/octet-stream';
  const mime = mimeType.split(';')[0].trim();

  const result = await uploadCompleteFile(env, topicId, fileName, mime, buffer);

  if (folderId && result.fileId) {
    await env.DB.prepare('UPDATE files SET folder_id = ? WHERE id = ?').bind(folderId, result.fileId).run();
  }

  return { fileId: result.fileId, fileName, size: buffer.byteLength };
}

/**
 * Clean up all chunks associated with a failed (or abandoned) chunked upload.
 * Deletes Telegram messages for each chunk and removes KV entries.
 * Returns the number of chunks successfully cleaned up.
 */
export async function cleanupUploadChunks(env: Env, uploadId: string): Promise<{ deleted: number; failed: number; found: number }> {
  let deleted = 0, failed = 0, found = 0;
  try {
    // List all KV entries with this uploadId prefix
    let cursor: string | undefined;
    do {
      const list = await env.SHARES.list({ prefix: `${UPLOAD_PREFIX}${uploadId}:`, cursor });
      for (const key of list.keys) {
        found++;
        try {
          const raw = await env.SHARES.get(key.name);
          if (raw) {
            const info = JSON.parse(raw);
            if (info.message_id) {
              const ok = await deleteTelegramMessage(env, info.message_id);
              if (ok) deleted++; else failed++;
            }
          }
          await env.SHARES.delete(key.name);
        } catch (err) {
          console.error(`Cleanup error for key ${key.name}:`, err);
          failed++;
        }
      }
      cursor = (list as any).cursor;
    } while (cursor);

    // Also clean up the meta key if it exists
    await env.SHARES.delete(`${UPLOAD_PREFIX}${uploadId}:meta`).catch(() => {});
  } catch (err) {
    console.error('cleanupUploadChunks error:', err);
  }
  return { deleted, failed, found };
}

/**
 * Clean up ALL orphan upload chunks in the KV namespace.
 * Lists all KV keys with the upload prefix, groups by uploadId,
 * and calls cleanupUploadChunks for each unique uploadId.
 * Returns the total counts across all cleaned uploads.
 */
export async function cleanupAllOrphanUploads(env: Env): Promise<{ totalDeleted: number; totalFailed: number; totalFound: number; uploadIds: string[] }> {
  let totalDeleted = 0, totalFailed = 0, totalFound = 0;
  const uploadIds = new Set<string>();
  const keysToProcess: string[] = [];

  // Collect all up: keys
  let cursor: string | undefined;
  do {
    const list = await env.SHARES.list({ prefix: `${UPLOAD_PREFIX}`, cursor });
    for (const key of list.keys) {
      keysToProcess.push(key.name);
      // Extract uploadId from key name: "up:{uploadId}:{index}"
      const match = key.name.match(/^up:([^:]+):/);
      if (match) uploadIds.add(match[1]);
    }
    cursor = (list as any).cursor;
  } while (cursor);

  for (const uploadId of uploadIds) {
    const result = await cleanupUploadChunks(env, uploadId);
    totalDeleted += result.deleted;
    totalFailed += result.failed;
    totalFound += result.found;
  }

  return { totalDeleted, totalFailed, totalFound, uploadIds: Array.from(uploadIds) };
}
