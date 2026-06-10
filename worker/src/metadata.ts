import type { Env, FolderRow, FileRow, FolderResponse, FileResponse } from './types';

// ───── Folders ─────

export async function listFolders(env: Env, parentId: number | null = null): Promise<FolderResponse[]> {
  let rows: FolderRow[];
  if (parentId === null) {
    rows = await env.DB.prepare(
      'SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name'
    ).all<FolderRow>().then(r => r.results);
  } else {
    rows = await env.DB.prepare(
      'SELECT * FROM folders WHERE parent_id = ? ORDER BY name'
    ).bind(parentId).all<FolderRow>().then(r => r.results);
  }

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    createdAt: r.created_at,
  }));
}

export async function createFolder(env: Env, name: string, parentId: number | null = null): Promise<FolderResponse> {
  const result = await env.DB.prepare(
    'INSERT INTO folders (name, parent_id) VALUES (?, ?) RETURNING *'
  ).bind(name, parentId).first<FolderRow>();

  if (!result) throw new Error('Failed to create folder');

  return {
    id: result.id,
    name: result.name,
    parentId: result.parent_id,
    createdAt: result.created_at,
  };
}

export async function renameFolder(env: Env, id: number, name: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'UPDATE folders SET name = ?, updated_at = unixepoch() WHERE id = ?'
  ).bind(name, id).run();

  return result.success;
}

export async function deleteFolder(env: Env, id: number): Promise<boolean> {
  // D1 cascade should handle deleting files within (ON DELETE CASCADE)
  const result = await env.DB.prepare(
    'DELETE FROM folders WHERE id = ?'
  ).bind(id).run();

  return result.success;
}

// ───── Files ─────

export async function listFiles(env: Env, folderId: number): Promise<FileResponse[]> {
  const rows = await env.DB.prepare(
    'SELECT * FROM files WHERE folder_id = ? ORDER BY name'
  ).bind(folderId).all<FileRow>().then(r => r.results);

  return rows.map(r => ({
    id: r.id,
    folderId: r.folder_id,
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
  folderId: number,
  name: string,
  size: number,
  mimeType: string,
  manifest: string,
  chunkCount: number,
  botFileId: string,
  fileUniqueId: string,
): Promise<FileRow> {
  const result = await env.DB.prepare(
    `INSERT INTO files (folder_id, name, size, mime_type, manifest, chunk_count, bot_file_id, file_unique_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(folderId, name, size, mimeType, manifest, chunkCount, botFileId, fileUniqueId)
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
  const result = await env.DB.prepare(
    'DELETE FROM files WHERE id = ?'
  ).bind(fileId).run();

  return result.success;
}

// ───── Search ─────

export async function searchFiles(env: Env, query: string): Promise<FileResponse[]> {
  const rows = await env.DB.prepare(
    'SELECT * FROM files WHERE name LIKE ? ORDER BY name'
  ).bind(`%${query}%`).all<FileRow>().then(r => r.results);

  return rows.map(r => ({
    id: r.id,
    folderId: r.folder_id,
    name: r.name,
    size: r.size,
    mimeType: r.mime_type,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  }));
}

// ───── Stats ─────

export async function getStats(env: Env): Promise<{ fileCount: number; totalSize: number; folderCount: number }> {
  const fileStats = await env.DB.prepare(
    'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM files'
  ).first<{ count: number; total_size: number }>();

  const folderCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM folders'
  ).first<{ count: number }>();

  return {
    fileCount: fileStats?.count ?? 0,
    totalSize: fileStats?.total_size ?? 0,
    folderCount: folderCount?.count ?? 0,
  };
}
