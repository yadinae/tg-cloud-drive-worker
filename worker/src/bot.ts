import type { Env, ChunkInfo } from './types';

// ───── Bot API Response Types ─────
interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TgMessage {
  message_id: number;
  document?: TgDocument;
  date: number;
}

interface TgSendResponse {
  ok: boolean;
  result?: TgMessage;
  description?: string;
}

interface TgFileResult {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface TgFileResponse {
  ok: boolean;
  result?: TgFileResult;
  description?: string;
}

// ───── Async Semaphore (concurrency control) ─────
// Prevents 429 rate limits by limiting concurrent Bot API calls per instance.
// Modeled after CloudPaste's TelegramOperations.js withSemaphore pattern.
class AsyncSemaphore {
  private max: number;
  private current = 0;
  private queue: Array<(release: () => void) => void> = [];

  constructor(max: number) {
    this.max = Math.max(1, Math.floor(max) || 1);
  }

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current++;
      return this._release.bind(this);
    }
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  private _release(): void {
    this.current = Math.max(0, this.current - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.current++;
      next(this._release.bind(this));
    }
  }
}

// Per-instance semaphore, keyed by bot token (so different bots don't share)
const semaphores = new Map<string, AsyncSemaphore>();

function getSemaphore(env: Env): AsyncSemaphore {
  const maxConcurrent = Math.max(1, parseInt(env.TG_API_CONCURRENCY || '2', 10) || 2);
  const key = env.TG_BOT_TOKEN;
  let sem = semaphores.get(key);
  if (!sem) {
    sem = new AsyncSemaphore(maxConcurrent);
    semaphores.set(key, sem);
  }
  return sem;
}

/**
 * Wrap an async function with per-bot concurrency limiting.
 * Ensures no more than TG_API_CONCURRENCY (default 2) simultaneous
 * Bot API calls for this bot token.
 */
async function withConcurrency<T>(env: Env, fn: () => Promise<T>): Promise<T> {
  const release = await getSemaphore(env).acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

// ───── Bot API URL helpers ─────

function getBaseUrl(env: Env): string {
  const custom = env.TG_API_BASE_URL;
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return 'https://api.telegram.org';
}

function botApiUrl(env: Env, method: string): string {
  return `${getBaseUrl(env)}/bot${env.TG_BOT_TOKEN}/${method}`;
}

function botFileUrl(env: Env, filePath: string): string {
  return `${getBaseUrl(env)}/file/bot${env.TG_BOT_TOKEN}/${filePath}`;
}

// ───── 429 retry helper ─────

async function parseRetryAfter(res: Response, method: string, attempt: number, max: number): Promise<number> {
  let retryAfter = 5;
  try {
    const body: any = await res.json();
    retryAfter = body.parameters?.retry_after || 5;
  } catch { /* use default */ }
  const wait = Math.min(retryAfter + 1, 60);
  console.warn(`429 rate limited on ${method}, retry_after=${retryAfter}s, waiting ${wait}s (${attempt + 1}/${max})`);
  return wait;
}

/**
 * Wrapped fetch to Telegram Bot API with:
 * - Concurrency limiting (via semaphore)
 * - 429 rate-limit retry for JSON payloads (reusable body)
 * - Custom API base URL support
 * FormData payloads are NOT retried here (body can't be reused after first send);
 * those callers handle 429 retry themselves by reconstructing FormData.
 */
async function tgFetch(
  env: Env,
  method: string,
  body?: FormData | object,
): Promise<Response> {
  const url = botApiUrl(env, method);
  const opts: RequestInit = { method: 'POST' };
  const isFormData = body instanceof FormData;

  if (isFormData) {
    opts.body = body;
  } else if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }

  return withConcurrency(env, async () => {
    // For non-FormData payloads: retry on 429 (JSON body is reusable)
    if (!isFormData) {
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const res = await fetch(url, opts);
        if (res.status === 429) {
          const wait = await parseRetryAfter(res, method, attempt, MAX_RETRIES);
          await new Promise(r => setTimeout(r, wait * 1000));
          continue;
        }
        return res;
      }
    }

    return fetch(url, opts);
  });
}

/**
 * Send a document (file chunk) to the storage channel via Bot API.
 * If topicId is provided, sends the message to that forum topic.
 * Returns the chunk info including file_id and optional message_id.
 */
export async function sendDocumentToChannel(
  env: Env,
  blob: ArrayBuffer | Blob,
  fileName: string,
  mimeType: string = 'application/octet-stream',
  topicId?: number,
): Promise<ChunkInfo & { message_id?: number }> {
  const blobSize = blob instanceof Blob ? blob.size : blob.byteLength;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Wrap with semaphore, build fresh FormData inside (body can't be reused)
    const res = await withConcurrency(env, async () => {
      const form = new FormData();
      form.append('chat_id', env.STORAGE_CHANNEL_ID);
      if (topicId && topicId !== 1) {
        form.append('message_thread_id', String(topicId));
      }
      const file = new File([blob], fileName, { type: mimeType });
      form.append('document', file);
      const url = botApiUrl(env, 'sendDocument');
      return await fetch(url, { method: 'POST', body: form });
    });
    if (res.status === 429) {
      const wait = await parseRetryAfter(res, 'sendDocument', attempt, MAX_ATTEMPTS);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    const data: TgSendResponse = await res.json() as TgSendResponse;

    if (!data.ok || !data.result?.document) {
      throw new Error(`Bot API sendDocument failed: ${data.description || 'unknown'}`);
    }

    return {
      file_id: data.result.document.file_id,
      file_unique_id: data.result.document.file_unique_id,
      size: data.result.document.file_size ?? blobSize,
      part_index: 0,
      message_id: data.result.message_id,
    };
  }

  throw new Error(`Bot API sendDocument failed after ${MAX_ATTEMPTS} attempts (rate limited)`);
}

/**
 * Get file download path from Bot API, then stream the file content back.
 * Returns a Response that can be returned directly from the Worker.
 */
export async function streamFileFromTelegram(
  env: Env,
  fileId: string,
  range?: string,
): Promise<Response> {
  // Step 1: get file path
  const res = await tgFetch(env, 'getFile', { file_id: fileId });
  const data: TgFileResponse = await res.json();

  if (!data.ok || !data.result?.file_path) {
    throw new Error(`Bot API getFile failed: ${data.description || 'unknown'}`);
  }

  const filePath = data.result.file_path;
  const fileSize = data.result.file_size;
  const dlUrl = botFileUrl(env, filePath);

  // Step 2: fetch the file from Telegram and stream it back
  const headers: Record<string, string> = {};
  if (range) headers['Range'] = range;

  // Abort controller with 25s timeout for the download
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const dlRes = await fetch(dlUrl, { headers, signal: controller.signal });
    clearTimeout(timeoutId);

    // Build response headers for the client
    const responseHeaders = new Headers({
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
      'Content-Disposition': 'attachment',
    });

    if (fileSize) {
      responseHeaders.set('Content-Length', String(fileSize));
    }

    // Pass through the content-range header if it was a ranged request
    const contentRange = dlRes.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }
    const contentLength = dlRes.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    return new Response(dlRes.body, {
      status: dlRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw new Error(`Telegram download timeout or failure: ${err.message}`);
  }
}

/**
 * Get just the file path for direct download (used for share links).
 */
export async function getTelegramFilePath(
  env: Env,
  fileId: string,
): Promise<string> {
  const res = await tgFetch(env, 'getFile', { file_id: fileId });
  const data: TgFileResponse = await res.json();

  if (!data.ok || !data.result?.file_path) {
    throw new Error(`Bot API getFile failed: ${data.description || 'unknown'}`);
  }

  return botFileUrl(env, data.result.file_path);
}

/**
 * Upload a single chunk as a document to the storage channel.
 * Re-exports sendDocumentToChannel with a cleaner name for storage logic.
 */
export const uploadChunkToChannel = sendDocumentToChannel;

/**
 * Delete file messages from the Telegram channel.
 * Parses the manifest to find each chunk's message_id and calls deleteMessage.
 */
export async function deleteFileMessages(env: Env, manifestStr: string, chatId?: string): Promise<number> {
  const channelId = chatId || env.STORAGE_CHANNEL_ID;
  let deleted = 0;
  try {
    const chunks = JSON.parse(manifestStr);
    for (const chunk of chunks) {
      if (chunk.message_id) {
        try {
          const res = await tgFetch(env, 'deleteMessage', {
            chat_id: channelId,
            message_id: chunk.message_id,
          });
          const data: any = await res.json();
          if (data.ok) deleted++;
        } catch (err) {
          console.error(`Failed to delete message ${chunk.message_id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse manifest for deletion:', err);
  }
  return deleted;
}

/**
 * Delete a single Telegram message by message_id.
 * Returns true if the message was deleted successfully.
 */
export async function deleteTelegramMessage(env: Env, messageId: number, chatId?: string): Promise<boolean> {
  try {
    const res = await tgFetch(env, 'deleteMessage', {
      chat_id: chatId || env.STORAGE_CHANNEL_ID,
      message_id: messageId,
    });
    const data: any = await res.json();
    return !!data.ok;
  } catch (err) {
    console.error(`Failed to delete message ${messageId}:`, err);
    return false;
  }
}

/**
 * Verify the bot token and channel access on startup.
 */
export async function verifyBotConnection(env: Env): Promise<{ ok: boolean; message: string }> {
  try {
    // Test bot token
    const meRes = await tgFetch(env, 'getMe');
    const meData: any = await meRes.json();
    if (!meData.ok) {
      return { ok: false, message: `Invalid bot token: ${meData.description}` };
    }

    // Test channel access by sending a ping message
    const chatRes = await tgFetch(env, 'sendMessage', {
      chat_id: env.STORAGE_CHANNEL_ID,
      text: '✅ TG Cloud Drive Worker is online',
      disable_notification: true,
    });
    const chatData: any = await chatRes.json();
    if (!chatData.ok) {
      return { ok: false, message: `Cannot access channel: ${chatData.description}` };
    }

    return { ok: true, message: 'Bot is connected and channel is accessible' };
  } catch (err: any) {
    return { ok: false, message: `Connection check failed: ${err.message}` };
  }
}

// ───── Forum Topic Helpers (for index.ts route handlers) ─────

/**
 * Create a forum topic in the storage channel.
 * Returns the message_thread_id on success.
 */
export async function createForumTopic(env: Env, name: string): Promise<number> {
  const res = await tgFetch(env, 'createForumTopic', {
    chat_id: env.STORAGE_CHANNEL_ID,
    name,
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data.result.message_thread_id;
}

/**
 * Rename a forum topic in the storage channel.
 */
export async function renameForumTopic(env: Env, topicId: number, name: string): Promise<void> {
  await tgFetch(env, 'editForumTopic', {
    chat_id: env.STORAGE_CHANNEL_ID,
    message_thread_id: topicId,
    name,
  });
}

/**
 * Delete a forum topic from the storage channel.
 */
export async function deleteForumTopic(env: Env, topicId: number): Promise<void> {
  await tgFetch(env, 'deleteForumTopic', {
    chat_id: env.STORAGE_CHANNEL_ID,
    message_thread_id: topicId,
  });
}
