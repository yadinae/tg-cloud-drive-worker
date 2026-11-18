import type { Hono } from 'hono';
import type { Env } from '../types';
import { getFile, listFilesInTree } from '../metadata';
import { downloadFileStream } from '../storage';
import { getShare, verifySharePassword, getFolderShare, verifyFolderSharePassword } from '../shares';
import { getClientIp } from '../rate-limit';
import { getAdConfig, sharePageHTML, shareFolderPageHTML, galleryPageHTML } from '../share-pages';

export function registerPublicDlRoutes(app: Hono<{ Bindings: Env }>): void {
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
}
