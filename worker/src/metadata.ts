import type { Env, TopicRow, FileRow, TopicResponse, FileResponse, FolderRow, FolderResponse } from './types';

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
  // Delete files and folders in this topic first
  await env.DB.prepare('DELETE FROM files WHERE topic_id = ?').bind(topicId).run();
  await env.DB.prepare('DELETE FROM folders WHERE topic_id = ?').bind(topicId).run();
  const result = await env.DB.prepare('DELETE FROM topics WHERE topic_id = ?').bind(topicId).run();
  return result.success;
}

// ───── Files ─────

export async function listFiles(env: Env, topicId: number, folderId?: number | null): Promise<FileResponse[]> {
  if (folderId === undefined) {
    // List ALL files in topic (including those in folders)
    const rows = await env.DB.prepare(
      'SELECT * FROM files WHERE topic_id = ? ORDER BY name LIMIT 1000'
    ).bind(topicId).all<FileRow>().then(r => r.results);
    return rows.map(r => ({
      id: r.id, topicId: r.topic_id, folderId: r.folder_id,
      name: r.name, size: r.size, mimeType: r.mime_type,
      chunkCount: r.chunk_count, createdAt: r.created_at,
    }));
  }
  // List files at a specific folder level (null = topic root, number = inside folder)
  const rows = await env.DB.prepare(
    `SELECT * FROM files WHERE topic_id = ? AND (folder_id IS ? OR (folder_id IS NULL AND ? IS NULL))
     ORDER BY name LIMIT 1000`
  ).bind(topicId, folderId ?? null, folderId ?? null).all<FileRow>().then(r => r.results);
  return rows.map(r => ({
    id: r.id, topicId: r.topic_id, folderId: r.folder_id,
    name: r.name, size: r.size, mimeType: r.mime_type,
    chunkCount: r.chunk_count, createdAt: r.created_at,
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
  folderId?: number | null,
): Promise<FileRow> {
  const result = await env.DB.prepare(
    `INSERT INTO files (topic_id, folder_id, name, size, mime_type, manifest, chunk_count, bot_file_id, file_unique_id, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(topicId, folderId ?? null, name, size, mimeType, manifest, chunkCount, botFileId, fileUniqueId, messageId ?? null)
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
    'SELECT * FROM files WHERE name LIKE ? ORDER BY name LIMIT 1000'
  ).bind(`%${query}%`).all<FileRow>().then(r => r.results);

  return rows.map(r => ({
    id: r.id, topicId: r.topic_id, folderId: r.folder_id ?? null,
    name: r.name, size: r.size, mimeType: r.mime_type,
    chunkCount: r.chunk_count, createdAt: r.created_at,
  }));
}

// ───── Folders (nested within a topic) ─────

export async function listFolders(env: Env, topicId: number, parentId?: number | null): Promise<FolderResponse[]> {
  if (parentId === undefined) {
    // List ALL folders in topic (for tree view)
    const rows = await env.DB.prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM files WHERE folder_id = f.id) as file_count
       FROM folders f WHERE f.topic_id = ? ORDER BY f.name LIMIT 500`
    ).bind(topicId).all<FolderRow & { file_count: number }>().then(r => r.results);
    return rows.map(r => ({ id: r.id, topicId: r.topic_id, parentId: r.parent_id, name: r.name, fileCount: r.file_count, createdAt: r.created_at }));
  }
  // List immediate children of parentId (null = root level)
  const rows = await env.DB.prepare(
    `SELECT f.*, (SELECT COUNT(*) FROM files WHERE folder_id = f.id) as file_count
     FROM folders f WHERE f.topic_id = ? AND (f.parent_id IS ? OR (f.parent_id IS NULL AND ? IS NULL))
     ORDER BY f.name LIMIT 500`
  ).bind(topicId, parentId ?? null, parentId ?? null).all<FolderRow & { file_count: number }>().then(r => r.results);
  return rows.map(r => ({ id: r.id, topicId: r.topic_id, parentId: r.parent_id, name: r.name, fileCount: r.file_count, createdAt: r.created_at }));
}

export async function createFolder(env: Env, topicId: number, name: string, parentId?: number | null): Promise<FolderResponse> {
  const result = await env.DB.prepare(
    'INSERT INTO folders (topic_id, parent_id, name) VALUES (?, ?, ?) RETURNING *'
  ).bind(topicId, parentId ?? null, name).first<FolderRow>();
  if (!result) throw new Error('Failed to create folder');
  return { id: result.id, topicId: result.topic_id, parentId: result.parent_id, name: result.name, fileCount: 0, createdAt: result.created_at };
}

export async function renameFolder(env: Env, folderId: number, name: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'UPDATE folders SET name = ?, updated_at = unixepoch() WHERE id = ?'
  ).bind(name, folderId).run();
  return result.success;
}

export async function deleteFolder(env: Env, folderId: number, topicId: number): Promise<boolean> {
  // Move files in this folder to topic root (or parent)
  await env.DB.prepare('UPDATE files SET folder_id = NULL WHERE folder_id = ?').bind(folderId).run();
  // Move child folders up one level
  await env.DB.prepare('UPDATE folders SET parent_id = NULL WHERE parent_id = ? AND topic_id = ?').bind(folderId, topicId).run();
  const result = await env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(folderId).run();
  return result.success;
}

export async function getFolderPath(env: Env, folderId: number): Promise<{ id: number; name: string }[]> {
  const path: { id: number; name: string }[] = [];
  let current = await env.DB.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').bind(folderId).first<FolderRow>();
  while (current) {
    path.unshift({ id: current.id, name: current.name });
    if (current.parent_id === null) break;
    current = await env.DB.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').bind(current.parent_id).first<FolderRow>();
  }
  return path;
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
