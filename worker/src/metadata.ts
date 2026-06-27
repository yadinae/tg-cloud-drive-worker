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
  // Delete files in this topic first
  await env.DB.prepare('DELETE FROM files WHERE topic_id = ?').bind(topicId).run();
  const result = await env.DB.prepare('DELETE FROM topics WHERE topic_id = ?').bind(topicId).run();
  return result.success;
}

// ───── Files ─────

export async function listFiles(env: Env, topicId: number, folderId: number | null = null): Promise<FileResponse[]> {
  let rows;
  if (folderId === null) {
    rows = await env.DB.prepare(
      "SELECT * FROM files WHERE topic_id = ? AND folder_id IS NULL ORDER BY name"
    ).bind(topicId).all<FileRow>().then(r => r.results);
  } else {
    rows = await env.DB.prepare(
      "SELECT * FROM files WHERE topic_id = ? AND folder_id = ? ORDER BY name"
    ).bind(topicId, folderId).all<FileRow>().then(r => r.results);
  }

  return rows.map(r => ({
    id: r.id,
    topicId: r.topic_id,
    folderId: r.folder_id,
    name: r.name,
    size: r.size,
    mimeType: r.mime_type,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  }));
}

export async function listFilesPaginated(
  env: Env, topicId: number, folderId: number | null, page: number, pageSize: number
): Promise<{ files: FileResponse[]; total: number; page: number; pageSize: number }> {
  const offset = (page - 1) * pageSize;
  let rows;
  let countResult: { count: number } | null;
  if (folderId === null) {
    [countResult, rows] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM files WHERE topic_id = ? AND folder_id IS NULL").bind(topicId).first<{count: number}>(),
      env.DB.prepare("SELECT * FROM files WHERE topic_id = ? AND folder_id IS NULL ORDER BY name LIMIT ? OFFSET ?").bind(topicId, pageSize, offset).all<FileRow>(),
    ]);
  } else {
    [countResult, rows] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM files WHERE topic_id = ? AND folder_id = ?").bind(topicId, folderId).first<{count: number}>(),
      env.DB.prepare("SELECT * FROM files WHERE topic_id = ? AND folder_id = ? ORDER BY name LIMIT ? OFFSET ?").bind(topicId, folderId, pageSize, offset).all<FileRow>(),
    ]);
  }
  return {
    files: rows.results.map(r => ({
      id: r.id,
      topicId: r.topic_id,
      folderId: r.folder_id,
      name: r.name,
      size: r.size,
      mimeType: r.mime_type,
      chunkCount: r.chunk_count,
      createdAt: r.created_at,
    })),
    total: countResult?.count || 0,
    page,
    pageSize,
  };
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

export async function moveFile(env: Env, fileId: number, newTopicId: number): Promise<boolean> {
  const result = await env.DB.prepare(
    'UPDATE files SET topic_id = ?, updated_at = unixepoch() WHERE id = ?'
  ).bind(newTopicId, fileId).run();
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
    folderId: r.folder_id,
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

// ───── Folders ─────

export async function listFolders(env: Env, topicId: number, parentId: number | null = null): Promise<FolderResponse[]> {
  if (parentId === null) {
    const rows = await env.DB.prepare(
      `SELECT f.*, COUNT(file.id) as file_count
       FROM folders f
       LEFT JOIN files file ON file.folder_id = f.id
       WHERE f.topic_id = ? AND f.parent_id IS NULL
       GROUP BY f.id ORDER BY f.name`
    ).bind(topicId).all<FolderRow & { file_count: number }>().then(r => r.results);
    return rows.map(r => ({ id: r.id, topicId: r.topic_id, parentId: r.parent_id, name: r.name, fileCount: r.file_count, createdAt: r.created_at }));
  }
  const rows = await env.DB.prepare(
    `SELECT f.*, COUNT(file.id) as file_count
     FROM folders f
     LEFT JOIN files file ON file.folder_id = f.id
     WHERE f.topic_id = ? AND f.parent_id = ?
     GROUP BY f.id ORDER BY f.name`
  ).bind(topicId, parentId).all<FolderRow & { file_count: number }>().then(r => r.results);
  return rows.map(r => ({ id: r.id, topicId: r.topic_id, parentId: r.parent_id, name: r.name, fileCount: r.file_count, createdAt: r.created_at }));
}

export async function createFolder(env: Env, topicId: number, name: string, parentId: number | null = null): Promise<FolderResponse> {
  const result = await env.DB.prepare(
    'INSERT INTO folders (topic_id, parent_id, name) VALUES (?, ?, ?) RETURNING *'
  ).bind(topicId, parentId, name).first<FolderRow>();
  if (!result) throw new Error('Failed to create folder');
  return { id: result.id, topicId: result.topic_id, parentId: result.parent_id, name: result.name, fileCount: 0, createdAt: result.created_at };
}

export async function renameFolder(env: Env, folderId: number, name: string): Promise<boolean> {
  const result = await env.DB.prepare('UPDATE folders SET name = ?, updated_at = unixepoch() WHERE id = ?').bind(name, folderId).run();
  return result.success;
}

/**
 * List all files in a folder subtree (recursive: includes subfolders).
 * If folderId is null, returns all files at the topic root (no folder).
 */
export async function listFilesInTree(env: Env, topicId: number, folderId: number | null): Promise<FileResponse[]> {
  if (folderId === null) {
    const rows = await env.DB.prepare(
      "SELECT * FROM files WHERE topic_id = ? AND folder_id IS NULL ORDER BY name"
    ).bind(topicId).all<FileRow>().then(r => r.results);
    return rows.map(r => ({
      id: r.id, topicId: r.topic_id, folderId: r.folder_id,
      name: r.name, size: r.size, mimeType: r.mime_type,
      chunkCount: r.chunk_count, createdAt: r.created_at,
    }));
  }

  // Recursive CTE: find all descendant folders, then list files in those folders
  const rows = await env.DB.prepare(
    `WITH RECURSIVE subfolders AS (
       SELECT id FROM folders WHERE id = ? AND topic_id = ?
       UNION ALL
       SELECT f.id FROM folders f JOIN subfolders s ON f.parent_id = s.id
     )
     SELECT f.* FROM files f
     WHERE f.topic_id = ?
       AND f.folder_id IN (SELECT id FROM subfolders)
     ORDER BY f.name`
  ).bind(folderId, topicId, topicId).all<FileRow>().then(r => r.results);

  return rows.map(r => ({
    id: r.id, topicId: r.topic_id, folderId: r.folder_id,
    name: r.name, size: r.size, mimeType: r.mime_type,
    chunkCount: r.chunk_count, createdAt: r.created_at,
  }));
}

export async function deleteFolder(env: Env, folderId: number): Promise<boolean> {
  // Find the parent for reassignment
  const folder = await env.DB.prepare('SELECT parent_id FROM folders WHERE id = ?').bind(folderId).first<FolderRow>();
  const newParentId = folder?.parent_id ?? null;

  // Collect all descendant folder IDs recursively (CTE)
  const descendants = await env.DB.prepare(
    `WITH RECURSIVE tree AS (
       SELECT id, parent_id FROM folders WHERE id = ?
       UNION ALL
       SELECT f.id, f.parent_id FROM folders f JOIN tree t ON f.parent_id = t.id
     )
     SELECT id FROM tree WHERE id != ?`
  ).bind(folderId, folderId).all<{ id: number }>();
  const descendantIds = descendants.results.map(r => r.id);

  // Reassign files from all descendants to the new parent
  if (descendantIds.length > 0) {
    const placeholders = descendantIds.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE files SET folder_id = ? WHERE folder_id IN (${placeholders})`
    ).bind(newParentId, ...descendantIds).run();
    await env.DB.prepare(
      `DELETE FROM folders WHERE id IN (${placeholders})`
    ).bind(...descendantIds).run();
  }

  // Reassign files from the deleted folder itself
  await env.DB.prepare('UPDATE files SET folder_id = ? WHERE folder_id = ?').bind(newParentId, folderId).run();
  const result = await env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(folderId).run();
  return result.success;
}
