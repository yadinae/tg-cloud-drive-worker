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

interface TgFileResponse {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
  description?: string;
}

// ───── Bot API Client ─────

const BASE_URL = 'https://api.telegram.org';

/**
 * Wrapped fetch to Telegram Bot API with error handling.
 */
async function tgFetch(
  token: string,
  method: string,
  body?: FormData | object,
): Promise<Response> {
  const url = `${BASE_URL}/bot${token}/${method}`;
  const opts: RequestInit = { method: 'POST' };

  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }

  return fetch(url, opts);
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
  const form = new FormData();
  form.append('chat_id', env.STORAGE_CHANNEL_ID);

  // If sending to a specific topic, set the message_thread_id
  // General topic (id=1) is the default — omit message_thread_id for it
  if (topicId && topicId !== 1) {
    form.append('message_thread_id', String(topicId));
  }

  const blobSize = blob instanceof Blob ? blob.size : blob.byteLength;

  const file = new File([blob], fileName, { type: mimeType });
  form.append('document', file);

  const res = await tgFetch(env.TG_BOT_TOKEN, 'sendDocument', form);
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
  const res = await tgFetch(env.TG_BOT_TOKEN, 'getFile', { file_id: fileId });
  const data: TgFileResponse = await res.json();

  if (!data.ok || !data.result?.file_path) {
    throw new Error(`Bot API getFile failed: ${data.description || 'unknown'}`);
  }

  const filePath = data.result.file_path;
  const fileSize = data.result.file_size;
  const dlUrl = `${BASE_URL}/file/bot${env.TG_BOT_TOKEN}/${filePath}`;

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
  const res = await tgFetch(env.TG_BOT_TOKEN, 'getFile', { file_id: fileId });
  const data: TgFileResponse = await res.json();

  if (!data.ok || !data.result?.file_path) {
    throw new Error(`Bot API getFile failed: ${data.description || 'unknown'}`);
  }

  return `${BASE_URL}/file/bot${env.TG_BOT_TOKEN}/${data.result.file_path}`;
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
          const res = await tgFetch(env.TG_BOT_TOKEN, 'deleteMessage', {
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
 * Verify the bot token and channel access on startup.
 */
export async function verifyBotConnection(env: Env): Promise<{ ok: boolean; message: string }> {
  try {
    // Test bot token
    const meRes = await tgFetch(env.TG_BOT_TOKEN, 'getMe');
    const meData: any = await meRes.json();
    if (!meData.ok) {
      return { ok: false, message: `Invalid bot token: ${meData.description}` };
    }

    // Test channel access by sending a ping message
    const chatRes = await tgFetch(env.TG_BOT_TOKEN, 'sendMessage', {
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
