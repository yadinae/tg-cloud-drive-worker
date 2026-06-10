import type { Env, ChunkInfo, UploadProgress } from './types';
import { uploadChunkToChannel, streamFileFromTelegram, getTelegramFilePath } from './bot';
import { createFile, updateFileManifest, getFile } from './metadata';

// ───── Constants ─────
const CHUNK_SIZE = 48 * 1024 * 1024;

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
        const chunkInfo = await uploadChunkToChannel(env, chunkData, chunkFileName, 'application/octet-stream', topicId);
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
): Promise<Response> {
  const fileRecord = await getFile(env, fileId);
  if (!fileRecord) {
    return new Response(JSON.stringify({ error: 'File not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const manifest: ChunkInfo[] = JSON.parse(fileRecord.manifest);

  if (manifest.length === 1) {
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
  }

  // Multi-chunk — concatenate streams
  if (range) {
    console.warn('Range requests not yet supported for multi-chunk files');
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    try {
      for (let i = 0; i < manifest.length; i++) {
        const chunkRes = await streamFileFromTelegram(env, manifest[i].file_id);
        const reader = chunkRes.body?.getReader();
        if (!reader) throw new Error(`Failed to read chunk ${i}`);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      }
    } catch (err: any) {
      console.error('Stream concatenation error:', err);
    } finally {
      await writer.close();
    }
  })();

  const totalSize = manifest.reduce((sum, c) => sum + c.size, 0);
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
