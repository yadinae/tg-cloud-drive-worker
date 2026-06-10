import type { Env, TopicRow, FileRow, TopicResponse, FileResponse } from './types';

// ───── Topics (mirrors Telegram forum topics) ─────

export async function listTopics(env: Env): Promise<TopicResponse[]> {
  const rows = await env.DB.prepare(
    `SELECT t.*, COUNT(f.id) as file_count
     FROM topics t
     LEFT JOIN files f ON f.topic_id = t.topic_id
     GROUP BY t.topic_id
     ORDER BY t.name`
  ).all<TopicRow & { file_count: number }>().then(r => r.results);

  return rows.map(r => ({
    topicId: r.topic_id,
    name: r.name,
    fileCount: r.file_count ?? 0,
    createdAt: r.created_at,
  }));
}

export async function createTopic(env: Env, topicId: number, name: string): Promise<TopicResponse> {
  const result = await env.DB.prepare(
    'INSERT INTO topics (topic_id, name) VALUES (?, ?) RETURNING *'
  ).bind(topicId, name).first<TopicRow>();

  if (!result) throw new Error('Failed to create topic');

  return {
    topicId: result.topic_id,
    name: result.name,
    fileCount: 0,
    createdAt: result.created_at,
  };
}

export async function renameTopic(env: Env, topicId: number, name: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'UPDATE topics SET name = ?, updated_at = unixepoch() WHERE topic_id = ?'
  ).bind(name, topicId).run();
  return result.success;
}

export async function deleteTopic(env: Env, topicId: number): Promise<boolean> {
  // Delete files in this topic first
  await env.DB.prepare('DELETE FROM files WHERE topic_id = ?').bind(topicId).run();
  const result = await env.DB.prepare('DELETE FROM topics WHERE topic_id = ?').bind(topicId).run();
  return result.success;
}

// ───── Files ─────

export async function listFiles(env: Env, topicId: number): Promise<FileResponse[]> {
  const rows = await env.DB.prepare(
    'SELECT * FROM files WHERE topic_id = ? ORDER BY name'
  ).bind(topicId).all<FileRow>().then(r => r.results);

  return rows.map(r => ({
    id: r.id,
    topicId: r.topic_id,
    name: r.name,
    size: r.size,
    mimeType: r.mime_type,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  }));
}

export async function getFile(env: Env, fileId: number): Promise<FileRow | null> {
  return env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first<FileRow>();
}

export async function createFile(
  env: Env,
  topicId: number,
  name: string,
  size: number,
  mimeType: string,
  manifest: string,
  chunkCount: number,
  botFileId: string,
  fileUniqueId: string,
  messageId?: number,
): Promise<FileRow> {
  const result = await env.DB.prepare(
    `INSERT INTO files (topic_id, name, size, mime_type, manifest, chunk_count, bot_file_id, file_unique_id, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(topicId, name, size, mimeType, manifest, chunkCount, botFileId, fileUniqueId, messageId ?? null)
    .first<FileRow>();

  if (!result) throw new Error('Failed to create file record');
  return result;
}

export async function updateFileManifest(
  env: Env,
  fileId: number,
  manifest: string,
  chunkCount: number,
): Promise<boolean> {
  const result = await env.DB.prepare(
    'UPDATE files SET manifest = ?, chunk_count = ?, updated_at = unixepoch() WHERE id = ?'
  ).bind(manifest, chunkCount, fileId).run();
  return result.success;
}

export async function renameFile(env: Env, fileId: number, name: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'UPDATE files SET name = ?, updated_at = unixepoch() WHERE id = ?'
  ).bind(name, fileId).run();
  return result.success;
}

export async function deleteFile(env: Env, fileId: number): Promise<boolean> {
  const result = await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run();
  return result.success;
}

/**
 * Get file by id, then delete it. Returns the file data (including manifest)
 * before deletion, so caller can clean up Telegram messages.
 */
export async function getAndDeleteFile(env: Env, fileId: number): Promise<FileRow | null> {
  const file = await getFile(env, fileId);
  if (!file) return null;
  await deleteFile(env, fileId);
  return file;
}

// ───── Search ─────

export async function searchFiles(env: Env, query: string): Promise<FileResponse[]> {
  const rows = await env.DB.prepare(
    'SELECT * FROM files WHERE name LIKE ? ORDER BY name'
  ).bind(`%${query}%`).all<FileRow>().then(r => r.results);

  return rows.map(r => ({
    id: r.id,
    topicId: r.topic_id,
    name: r.name,
    size: r.size,
    mimeType: r.mime_type,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  }));
}

// ───── Stats ─────

export async function getStats(env: Env): Promise<{ fileCount: number; totalSize: number; topicCount: number; }> {
  const fileStats = await env.DB.prepare(
    'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM files'
  ).first<{ count: number; total_size: number }>();

  const topicCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM topics'
  ).first<{ count: number }>();

  return {
    fileCount: fileStats?.count ?? 0,
    totalSize: fileStats?.total_size ?? 0,
    topicCount: topicCount?.count ?? 0,
  };
}
