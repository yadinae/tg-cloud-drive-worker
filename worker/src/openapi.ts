// ───── OpenAPI 3.0 / Agent API Spec ─────
// Served at GET /api/openapi.json and GET /api (compact index)

export const API_VERSION = '1.0.0';

/**
 * Machine-readable index of all endpoints (served at GET /api).
 */
export function apiIndex(reqUrl: URL) {
  const base = `${reqUrl.origin}`;
  return {
    service: 'TG Cloud Drive',
    version: API_VERSION,
    documentation: `${base}/api/openapi.json`,
    spec: 'OpenAPI 3.0',
    endpoints: [
      // ── Public ──
      { method: 'GET',    path: '/api',              description: 'API index (this response)' },
      { method: 'GET',    path: '/api/openapi.json',  description: 'Full OpenAPI 3.0 specification' },
      { method: 'GET',    path: '/api/health',        description: 'Service health check' },
      { method: 'GET',    path: '/api/stats',         description: 'Aggregate storage stats' },
      { method: 'POST',   path: '/api/auth/login',    description: 'Password to session (7 days) [PUBLIC — no auth]' },
      { method: 'POST',   path: '/api/auth/logout',   description: 'Invalidate session [PUBLIC — no auth]' },
      { method: 'GET',    path: '/api/auth/session',  description: 'Check session validity [PUBLIC — no auth]' },
      { method: 'POST',   path: '/api/shares/verify', description: 'Verify share password and get download URL [PUBLIC — no auth]' },
      { method: 'POST',   path: '/api/shares/folder/verify', description: 'Verify folder share password and list files [PUBLIC — no auth]' },
      { method: 'GET',    path: '/dl/:code',          description: 'Share download page [PUBLIC]' },
      { method: 'GET',    path: '/dl/:code/raw',      description: 'Share raw download [PUBLIC]' },
      { method: 'GET',    path: '/dl/f/:code',        description: 'Folder share page [PUBLIC]' },
      { method: 'GET',    path: '/dl/f/:code/raw/:fileId', description: 'Folder share raw download (password via ?password= when protected) [PUBLIC]' },
      { method: 'GET',    path: '/dl/f/:code/gallery', description: 'Folder share image gallery (?pwd= to verify) [PUBLIC]' },
      { method: 'GET',    path: '/img/:code/:fileId', description: 'Public image hotlink, no password check by design [PUBLIC]' },

      // ── Config & Auth (auth required) ──
      { method: 'GET',    path: '/api/config',         description: 'Read all D1 settings' },
      { method: 'PUT',    path: '/api/config',         description: 'Batch update D1 settings (existing keys only)' },
      { method: 'POST',   path: '/api/auth/change-password', description: 'Change login password (min 6 chars)' },

      // ── Topics (auth required) ──
      { method: 'GET',    path: '/api/topics',          description: 'List all topics' },
      { method: 'POST',   path: '/api/topics',          description: 'Create a topic' },
      { method: 'PUT',    path: '/api/topics/:topicId', description: 'Rename a topic' },
      { method: 'DELETE', path: '/api/topics/:topicId', description: 'Delete a topic and all its files' },

      // ── Files (auth required) ──
      { method: 'GET',    path: '/api/files',                description: 'List files by topicId, or search by ?q=' },
      { method: 'POST',   path: '/api/files/upload',         description: 'Upload a file (multipart/form-data or JSON)' },
      { method: 'POST',   path: '/api/files/upload-chunk',   description: 'Upload a single chunk (chunked upload)' },
      { method: 'POST',   path: '/api/files/finalize',       description: 'Finalize chunked upload' },
      { method: 'POST',   path: '/api/files/cleanup-upload', description: 'Cleanup orphaned upload chunks' },
      { method: 'PUT',    path: '/api/files/:id',            description: 'Rename a file' },
      { method: 'PUT',    path: '/api/files/:id/move',       description: 'Move file to another topic/folder' },
      { method: 'DELETE', path: '/api/files/:id',            description: 'Delete a file and its Telegram messages' },
      { method: 'GET',    path: '/api/files/:id/download',   description: 'Download a file stream' },
      { method: 'POST',   path: '/api/transfer',             description: 'Transfer a file from an external URL' },
      { method: 'POST',   path: '/api/transfer/batch',       description: 'Transfer up to 20 files from external URLs' },
      { method: 'POST',   path: '/api/files/batch/delete',   description: 'Delete up to 50 files' },
      { method: 'POST',   path: '/api/files/batch/move',     description: 'Move up to 50 files to another topic/folder' },

      // ── Folders (auth required) ──
      { method: 'GET',    path: '/api/folders',             description: 'List folders (?topicId=X&parentId=Y)' },
      { method: 'POST',   path: '/api/folders',             description: 'Create a folder' },
      { method: 'PUT',    path: '/api/folders/:id',         description: 'Rename a folder' },
      { method: 'DELETE', path: '/api/folders/:id',         description: 'Delete a folder (files move to parent)' },
      { method: 'GET',    path: '/api/folders/:id/path',    description: 'Breadcrumb path to folder root' },

      // ── Share Links (auth required) ──
      { method: 'GET',    path: '/api/shares',              description: 'List shares for a file (?fileId=X)' },
      { method: 'GET',    path: '/api/shares/list-all',     description: 'List ALL shares across all files' },
      { method: 'POST',   path: '/api/shares',              description: 'Create a share link' },
      { method: 'PUT',    path: '/api/shares/:code',        description: 'Update a share link (password/expiry)' },
      { method: 'DELETE', path: '/api/shares/:code',        description: 'Delete/revoke a share link' },

      // ── Folder Share Links (auth required) ──
      { method: 'POST',   path: '/api/shares/folder',          description: 'Create a folder share link' },
      { method: 'GET',    path: '/api/shares/folder/list-all', description: 'List ALL folder shares' },
      { method: 'PUT',    path: '/api/shares/folder/:code',   description: 'Update a folder share link (password/expiry)' },
      { method: 'DELETE', path: '/api/shares/folder/:code',   description: 'Delete/revoke a folder share link' },

      // ── Agent API (AGENT_API_TOKEN required, not session auth) ──
      { method: 'GET',    path: '/api/agent/status',           description: 'Agent API health check + basic stats' },
      { method: 'GET',    path: '/api/agent/stats',           description: 'Detailed stats incl. share counts' },
      { method: 'GET',    path: '/api/agent/files',           description: 'List/search files (paginated)' },
      { method: 'GET',    path: '/api/agent/files/:id',       description: 'Single file details' },
      { method: 'GET',    path: '/api/agent/topics',          description: 'List topics with file counts' },
      { method: 'GET',    path: '/api/agent/shares',          description: 'List all file + folder shares' },
      { method: 'POST',   path: '/api/agent/shares',          description: 'Create a share link' },
      { method: 'PUT',    path: '/api/agent/shares/:code',    description: 'Update a share link' },
      { method: 'DELETE', path: '/api/agent/shares/:code',    description: 'Delete/revoke a share link' },
      { method: 'GET',    path: '/api/agent/ads',             description: 'Get ad configuration' },
      { method: 'PUT',    path: '/api/agent/ads',             description: 'Update ad configuration' },
      { method: 'POST',   path: '/api/agent/upload',          description: 'Upload a file (multipart), auto-creates share' },
      { method: 'DELETE', path: '/api/agent/files/:id',       description: 'Delete a file' },
      { method: 'POST',   path: '/api/agent/transfer',        description: 'Transfer a file from an external URL, auto-creates share' },
      { method: 'POST',   path: '/api/agent/transfer/batch',  description: 'Transfer up to 20 files from external URLs' },
      { method: 'POST',   path: '/api/agent/files/batch/delete', description: 'Delete up to 50 files' },
      { method: 'POST',   path: '/api/agent/files/batch/move',   description: 'Move up to 50 files to another topic/folder' },

      // ── Admin (auth required) ──
      { method: 'GET',    path: '/api/admin/migrate',       description: 'Run D1 schema migration' },
      { method: 'POST',   path: '/api/admin/sync-topics',   description: 'Discover Telegram forum topics' },
      { method: 'GET',    path: '/api/admin/info',          description: 'Get Telegram channel info' },
      { method: 'GET',    path: '/api/admin/identify/:topicId', description: 'Send ID card to a topic' },
      { method: 'POST',   path: '/api/admin/cleanup-orphans',   description: 'Clean all orphan upload chunks' },
    ],
  };
}

/**
 * Full OpenAPI 3.0 specification (served at GET /api/openapi.json).
 */
export function openApiSpec(baseUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'TG Cloud Drive API',
      version: API_VERSION,
      description: `REST API for TG Cloud Drive — a file storage system backed by Telegram and Cloudflare.

Public endpoints are \`/api/health\`, \`/api/stats\`, \`/api/auth/login\`, \`/api/auth/logout\`, \`/api/auth/session\`, \`/api/shares/verify\`, \`/api/shares/folder/verify\`, and the \`/dl/*\` / \`/img/*\` share pages; all other \`/api/*\` endpoints require authentication via \`Authorization: Bearer <token>\` header or \`?token=<token>\` query parameter.

The \`/api/agent/*\` endpoints use a separate authentication scheme: a Bearer token matching the \`AGENT_API_TOKEN\` secret (plain string comparison, not the session token). \`GET /api\` and \`GET /api/openapi.json\` are public discovery endpoints.

Files larger than 18MB are split into chunks before sending to Telegram. The chunked upload protocol:
1. Send each chunk via \`POST /api/files/upload-chunk\` (multipart/form-data)
2. Finalize with \`POST /api/files/finalize\`

For agent-to-agent usage: start at \`GET /api\` to discover all endpoints, then use \`GET /api/openapi.json\` for full parameter details.`,
      contact: { name: 'TG Cloud Drive' },
    },
    servers: [{ url: baseUrl, description: 'Production' }],
    paths: {
      // ── Public ──
      '/api': {
        get: {
          summary: 'API index',
          description: 'Returns a compact machine-readable list of all available endpoints.',
          tags: ['Discovery'],
          responses: { '200': { description: 'Endpoint list' } },
        },
      },
      '/api/openapi.json': {
        get: {
          summary: 'OpenAPI specification',
          description: 'Returns the full OpenAPI 3.0 specification for this service.',
          tags: ['Discovery'],
          responses: { '200': { description: 'OpenAPI 3.0 JSON' } },
        },
      },
      '/api/health': {
        get: {
          summary: 'Health check',
          description: 'Verify the service is running and the Telegram bot connection is healthy.',
          tags: ['Public'],
          responses: {
            '200': {
              description: 'Health status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/stats': {
        get: {
          summary: 'Aggregate stats',
          description: 'Returns total file count, total size, and topic count.',
          tags: ['Public'],
          responses: {
            '200': {
              description: 'Storage statistics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      fileCount: { type: 'number' },
                      totalSize: { type: 'number' },
                      topicCount: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/login': {
        post: {
          summary: 'Login with password',
          description: 'Public endpoint — no auth required. Password to session (7 days).',
          tags: ['Public'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['password'],
                  properties: {
                    password: { type: 'string', description: 'Login password' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Session created' },
            '403': { description: 'Invalid password' },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          summary: 'Logout',
          description: 'Invalidate session.',
          tags: ['Public'],
          responses: { '200': { description: 'Logged out' } },
        },
      },
      '/api/auth/session': {
        get: {
          summary: 'Check session',
          description: 'Check if session is valid.',
          tags: ['Public'],
          responses: {
            '200': { description: 'Session valid' },
            '401': { description: 'Session invalid' },
          },
        },
      },
      '/api/shares/verify': {
        post: {
          summary: 'Verify share password',
          description: 'Public endpoint — no auth required. Verify a share link password and get a download URL.',
          tags: ['Shares', 'Public'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code', 'password'],
                  properties: {
                    code: { type: 'string', description: 'Share link code (8 chars)' },
                    password: { type: 'string', description: 'Share password' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Verification result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      downloadUrl: { type: 'string', nullable: true, description: 'Direct Telegram file URL (single-chunk files only; multi-chunk files return ok without a URL — use the proxy download instead)' },
                      error: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/shares/folder/verify': {
        post: {
          summary: 'Verify folder share password',
          description: 'Public endpoint — no auth required. Verify a folder share link password and list the files in its folder tree.',
          tags: ['Shares', 'FolderShares', 'Public'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code', 'password'],
                  properties: {
                    code: { type: 'string', description: 'Folder share link code (8 chars)' },
                    password: { type: 'string', description: 'Folder share password' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Verification result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      files: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'number' },
                            name: { type: 'string' },
                            size: { type: 'number' },
                            mimeType: { type: 'string' },
                            createdAt: { type: 'number' },
                          },
                        },
                      },
                      name: { type: 'string', description: 'Folder share display name' },
                      fileCount: { type: 'number' },
                      error: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ── Config & Auth ──
      '/api/config': {
        get: {
          summary: 'Read settings',
          description: 'Returns all D1 settings as a key/value map.',
          tags: ['Config'],
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Settings map',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      settings: { type: 'object', additionalProperties: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
        put: {
          summary: 'Batch update settings',
          description: 'Updates only keys that already exist in settings. Integer keys are range-checked (e.g. download.concurrency 1–8, download.chunk_size_mb 1–20, system.auto_cleanup_days 0–365); string values are capped at 500 chars. Unknown keys are silently skipped.',
          tags: ['Config'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  example: { 'download.concurrency': '5' },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Update result' },
            '400': { description: 'Invalid value (not an integer or out of range)' },
          },
        },
      },
      '/api/auth/change-password': {
        post: {
          summary: 'Change login password',
          description: 'Verifies the old password, then stores the SHA-256 hash of the new password in settings. Existing sessions are not bulk-invalidated (they expire by TTL).',
          tags: ['Config'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['oldPassword', 'newPassword'],
                  properties: {
                    oldPassword: { type: 'string' },
                    newPassword: { type: 'string', description: 'At least 6 characters' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Password updated' },
            '400': { description: 'Missing fields or new password too short' },
            '403': { description: 'Old password incorrect' },
          },
        },
      },

      // ── Topics ──
      '/api/topics': {
        get: {
          summary: 'List topics',
          description: 'List all forum topics/project folders.',
          tags: ['Topics'],
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Topic list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      topics: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            topicId: { type: 'number' },
                            name: { type: 'string' },
                            fileCount: { type: 'number' },
                            createdAt: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create topic',
          description: 'Create a new forum topic. Optionally provide an existing topicId to skip Telegram creation.',
          tags: ['Topics'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', description: 'Topic name' },
                    topicId: { type: 'number', description: 'Optional — existing Telegram topic ID to import' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Topic created' },
          },
        },
      },
      '/api/topics/{topicId}': {
        put: {
          summary: 'Rename topic',
          tags: ['Topics'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'topicId', in: 'path', required: true, schema: { type: 'number' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'Rename result' } },
        },
        delete: {
          summary: 'Delete topic',
          description: 'Delete a topic and all files within it.',
          tags: ['Topics'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'topicId', in: 'path', required: true, schema: { type: 'number' } },
          ],
          responses: { '200': { description: 'Delete result' } },
        },
      },

      // ── Files ──
      '/api/files': {
        get: {
          summary: 'List or search files',
          description: 'List files in a topic (?topicId=X) or search all files (?q=keyword). Paginated (default page=1, pageSize=50, max 200).',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'topicId', in: 'query', schema: { type: 'number' }, description: 'Topic ID to list files from' },
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query' },
            { name: 'folderId', in: 'query', schema: { type: 'number' }, description: 'Folder ID within the topic (omit = topic root)' },
            { name: 'page', in: 'query', schema: { type: 'number', default: 1 }, description: 'Page number (1-based)' },
            { name: 'pageSize', in: 'query', schema: { type: 'number', default: 50 }, description: 'Items per page (max 200)' },
          ],
          responses: {
            '200': {
              description: 'File list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      files: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/File' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/files/upload': {
        post: {
          summary: 'Upload file',
          description: 'Upload a file to a topic. Accepts multipart/form-data (preferred) or base64 JSON ({ topicId, name, data, mimeType }). Passing uploadId makes the upload idempotent: retrying with the same uploadId returns the existing file instead of duplicating it.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file', 'topicId'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                    topicId: { type: 'number' },
                    mimeType: { type: 'string' },
                    folderId: { type: 'number', description: 'Target folder ID within the topic' },
                    uploadId: { type: 'string', description: 'Idempotency key for retries' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Upload result with fileId' },
          },
        },
      },
      '/api/files/upload-chunk': {
        post: {
          summary: 'Upload chunk',
          description: 'Upload a single chunk as part of a chunked upload.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file', 'uploadId', 'chunkIndex', 'totalChunks', 'topicId', 'fileName', 'fileSize'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                    uploadId: { type: 'string' },
                    chunkIndex: { type: 'number' },
                    totalChunks: { type: 'number' },
                    topicId: { type: 'number' },
                    fileName: { type: 'string' },
                    fileSize: { type: 'number' },
                    mimeType: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Chunk upload result' } },
        },
      },
      '/api/files/finalize': {
        post: {
          summary: 'Finalize chunked upload',
          description: 'After all chunks are uploaded, call this to create the file record.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['uploadId', 'topicId', 'name'],
                  properties: {
                    uploadId: { type: 'string' },
                    topicId: { type: 'number' },
                    name: { type: 'string' },
                    size: { type: 'number' },
                    mimeType: { type: 'string' },
                    totalChunks: { type: 'number' },
                    folderId: { type: 'number', description: 'Target folder ID within the topic' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'File created' } },
        },
      },
      '/api/files/cleanup-upload': {
        post: {
          summary: 'Cleanup failed upload chunks',
          description: 'Clean up Telegram messages and KV entries for an abandoned chunked upload.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['uploadId'],
                  properties: {
                    uploadId: { type: 'string', description: 'Upload ID from chunked upload' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Cleanup result' } },
        },
      },
      '/api/files/{id}': {
        put: {
          summary: 'Rename file',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'number' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'Rename result' } },
        },
        delete: {
          summary: 'Delete file',
          description: 'Delete a file and its Telegram messages.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'number' } },
          ],
          responses: { '200': { description: 'Delete result' } },
        },
      },
      '/api/files/{id}/move': {
        put: {
          summary: 'Move file',
          description: 'Move file to another topic or folder.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'number' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['topicId'],
                  properties: {
                    topicId: { type: 'number', description: 'Target topic ID' },
                    folderId: { type: 'number', nullable: true, description: 'Target folder ID (null = topic root)' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Move result' } },
        },
      },
      '/api/files/{id}/download': {
        get: {
          summary: 'Download file',
          description: 'Stream file download from Telegram. Supports Range headers.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'number' } },
            { name: 'Range', in: 'header', schema: { type: 'string' }, description: 'HTTP Range header for partial downloads' },
          ],
          responses: {
            '200': { description: 'File stream' },
            '206': { description: 'Partial content' },
          },
        },
      },
      '/api/transfer': {
        post: {
          summary: 'Transfer from URL',
          description: 'Fetch a file from an external URL and store it directly in the cloud drive (no local download needed). SSRF protection: only public http/https URLs are fetched; private/reserved IPs, localhost, URL-embedded credentials and unresolvable hosts are rejected with 400, and every redirect hop is re-validated.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url', 'topicId'],
                  properties: {
                    url: { type: 'string', format: 'uri', description: 'Source URL to fetch' },
                    topicId: { type: 'number', description: 'Target topic ID' },
                    folderId: { type: 'number', nullable: true, description: 'Target folder ID within the topic' },
                    fileName: { type: 'string', description: 'Optional file name override (auto-detected from Content-Disposition or URL)' },
                    mimeType: { type: 'string', description: 'Optional MIME type override' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Transfer complete',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      fileId: { type: 'number' },
                      fileName: { type: 'string' },
                      size: { type: 'number' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Missing fields, or URL blocked by SSRF protection' },
            '500': { description: 'Fetch or store failed' },
          },
        },
      },
      '/api/transfer/batch': {
        post: {
          summary: 'Batch transfer from URLs',
          description: 'Fetch up to 20 files from external URLs. Each URL is transferred independently; per-URL failures are reported in results instead of failing the whole batch. Blocked URLs (SSRF protection) are reported as per-URL errors, never retried.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['urls', 'topicId'],
                  properties: {
                    urls: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uri' } },
                    topicId: { type: 'number', description: 'Target topic ID' },
                    folderId: { type: 'number', nullable: true, description: 'Target folder ID within the topic' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch result (ok is true only when every URL succeeded)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      succeeded: { type: 'number' },
                      failed: { type: 'number' },
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            url: { type: 'string' },
                            ok: { type: 'boolean' },
                            fileId: { type: 'number' },
                            fileName: { type: 'string' },
                            size: { type: 'number' },
                            error: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'urls array missing/empty, topicId missing, or more than 20 URLs' },
          },
        },
      },
      '/api/files/batch/delete': {
        post: {
          summary: 'Batch delete files',
          description: 'Delete up to 50 files (D1 records + Telegram messages). Per-file failures are reported in errors instead of failing the whole batch.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileIds'],
                  properties: {
                    fileIds: { type: 'array', maxItems: 50, items: { type: 'number' } },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch result (ok is true only when every file was deleted)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      succeeded: { type: 'number' },
                      failed: { type: 'number' },
                      errors: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'number' },
                            error: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'fileIds array missing/empty or more than 50 files' },
          },
        },
      },
      '/api/files/batch/move': {
        post: {
          summary: 'Batch move files',
          description: 'Move up to 50 files to another topic (and optionally a folder within it). Moving to a different topic resets folder_id unless an explicit folderId is given. Per-file failures are reported in errors.',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileIds', 'topicId'],
                  properties: {
                    fileIds: { type: 'array', maxItems: 50, items: { type: 'number' } },
                    topicId: { type: 'number', description: 'Target topic ID' },
                    folderId: { type: 'number', nullable: true, description: 'Target folder ID (null = topic root)' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch result (ok is true only when every file was moved)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      succeeded: { type: 'number' },
                      failed: { type: 'number' },
                      errors: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'number' },
                            error: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'fileIds array missing/empty, topicId missing, or more than 50 files' },
            '404': { description: 'Target topic not found' },
          },
        },
      },
      // ── Folders ──
      '/api/folders': {
        get: {
          summary: 'List folders',
          description: 'List folders in a topic. Omit parentId for all, pass empty/null for root level.',
          tags: ['Folders'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'topicId', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'parentId', in: 'query', schema: { type: 'string' }, description: 'Parent folder ID (omit=all, empty=root, number=subfolder)' },
          ],
          responses: { '200': { description: 'Folder list' } },
        },
        post: {
          summary: 'Create folder',
          tags: ['Folders'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['topicId', 'name'],
                  properties: {
                    topicId: { type: 'number' },
                    name: { type: 'string' },
                    parentId: { type: 'number', nullable: true, description: 'Parent folder ID (null = root level)' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Folder created' } },
        },
      },
      '/api/folders/{id}': {
        put: {
          summary: 'Rename folder',
          tags: ['Folders'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'number' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
          },
          responses: { '200': { description: 'Rename result' } },
        },
        delete: {
          summary: 'Delete folder',
          description: 'Delete folder. Files move to topic root, child folders move up one level.',
          tags: ['Folders'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'number' } },
          ],
          responses: { '200': { description: 'Delete result' } },
        },
      },
      '/api/folders/{id}/path': {
        get: {
          summary: 'Folder breadcrumb path',
          description: 'Returns the path from root to this folder (for breadcrumb navigation).',
          tags: ['Folders'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'number' } }],
          responses: { '200': { description: 'Path array' } },
        },
      },

      // ── Shares ──
      '/api/shares': {
        get: {
          summary: 'List shares for a file',
          tags: ['Shares'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'fileId', in: 'query', required: true, schema: { type: 'number' } },
          ],
          responses: {
            '200': {
              description: 'Share list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      shares: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ShareLink' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create share link',
          tags: ['Shares'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileId'],
                  properties: {
                    fileId: { type: 'number' },
                    password: { type: 'string', description: 'Optional password protection' },
                    expiresIn: { type: 'number', description: 'Expiry in seconds from now (0 = never). E.g. 3600 = 1h, 86400 = 1d' },
                    maxDownloads: { type: 'number', description: 'Max download count (null = unlimited)' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Share created' },
          },
        },
      },
      '/api/shares/list-all': {
        get: {
          summary: 'List ALL share links',
          description: 'Returns all shares across all files, sorted newest first.',
          tags: ['Shares'],
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'All shares',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      shares: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ShareLink' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/shares/{code}': {
        put: {
          summary: 'Update share link',
          description: 'Update password and/or expiry of a share link.',
          tags: ['Shares'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    password: { type: 'string', description: 'New password (empty string to remove, omit to keep)' },
                    expiresIn: { type: 'number', description: 'New expiry in seconds (0 to remove, omit to keep)' },
                    maxDownloads: { type: 'number', nullable: true, description: 'New download limit (null to remove, omit to keep)' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Update result' } },
        },
        delete: {
          summary: 'Revoke share link',
          tags: ['Shares'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Revoke result' } },
        },
      },

      // ── Folder Shares ──
      '/api/shares/folder': {
        post: {
          summary: 'Create folder share link',
          description: 'Share a whole folder (or a topic root when folderId is null). The display name is taken from the folder/topic name and the file count is snapshotted at creation.',
          tags: ['FolderShares'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['topicId'],
                  properties: {
                    topicId: { type: 'number' },
                    folderId: { type: 'number', nullable: true, description: 'Folder ID (null = topic root)' },
                    password: { type: 'string', description: 'Optional password protection' },
                    expiresIn: { type: 'number', description: 'Expiry in seconds from now (0 = never)' },
                    maxDownloads: { type: 'number', description: 'Max download count (null = unlimited)' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Folder share created' },
            '400': { description: 'Creation failed (e.g. code generation failed)' },
          },
        },
      },
      '/api/shares/folder/list-all': {
        get: {
          summary: 'List ALL folder share links',
          description: 'Returns all folder shares across all topics, sorted newest first. Includes the plaintext password for admin display/copy.',
          tags: ['FolderShares'],
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'All folder shares',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      shares: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/FolderShare' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/shares/folder/{code}': {
        put: {
          summary: 'Update folder share link',
          description: 'Update password and/or expiry of a folder share link.',
          tags: ['FolderShares'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    password: { type: 'string', description: 'New password (empty string to remove, omit to keep)' },
                    expiresIn: { type: 'number', description: 'New expiry in seconds (0 to remove, omit to keep)' },
                    maxDownloads: { type: 'number', nullable: true, description: 'New download limit (null to remove, omit to keep)' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Update result' },
            '404': { description: 'Folder share link not found' },
          },
        },
        delete: {
          summary: 'Revoke folder share link',
          tags: ['FolderShares'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Revoke result' } },
        },
      },

      // ── Admin ──
      '/api/admin/migrate': {
        get: {
          summary: 'Run schema migration',
          description: 'Run D1 schema migration to ensure tables exist. Idempotent.',
          tags: ['Admin'],
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Migration result' } },
        },
      },
      '/api/admin/sync-topics': {
        post: {
          summary: 'Sync Telegram topics',
          description: 'Probe a range of topic IDs and import discovered topics into D1.',
          tags: ['Admin'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'number' }, description: 'Start topic ID' },
          ],
          responses: { '200': { description: 'Sync result' } },
        },
      },
      '/api/admin/info': {
        get: {
          summary: 'Channel info',
          description: 'Get Telegram storage channel info.',
          tags: ['Admin'],
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Channel info' } },
        },
      },
      '/api/admin/identify/{topicId}': {
        get: {
          summary: 'Identify topic',
          description: 'Send an ID card message to a topic to identify it.',
          tags: ['Admin'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'topicId', in: 'path', required: true, schema: { type: 'number' } },
          ],
          responses: { '200': { description: 'Identify result' } },
        },
      },
      '/api/admin/cleanup-orphans': {
        post: {
          summary: 'Clean orphan upload chunks',
          description: 'List all orphaned chunked upload KV entries and delete their Telegram messages.',
          tags: ['Admin'],
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Cleanup result' } },
        },
      },

      // ── Public Share Download (no auth) ──
      '/dl/{code}': {
        get: {
          summary: 'Public share download page',
          description: 'Renders an HTML page for password-protected shares, or redirects to raw download.',
          tags: ['Public'],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'HTML page or redirect' } },
        },
      },
      '/dl/{code}/raw': {
        get: {
          summary: 'Raw share download',
          description: 'Direct file download via a valid share link. Supports Range headers. When the share is password-protected, the correct password must be passed as ?password= (403 otherwise).',
          tags: ['Public'],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'password', in: 'query', schema: { type: 'string' }, description: 'Share password (required when the share is password-protected)' },
            { name: 'Range', in: 'header', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'File stream' },
            '206': { description: 'Partial content' },
            '403': { description: 'Password required or incorrect' },
            '404': { description: 'Share link not found' },
          },
        },
      },
      '/dl/f/{code}': {
        get: {
          summary: 'Folder share page',
          description: 'Renders an HTML page for a folder share: a password form when protected, otherwise the file list with download links.',
          tags: ['Public'],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'HTML page' },
          },
        },
      },
      '/dl/f/{code}/raw/{fileId}': {
        get: {
          summary: 'Folder share raw download',
          description: 'Download one file from a folder share. When the share is password-protected, the correct password must be passed as ?password= (403 otherwise). The file must belong to the shared folder tree (404 otherwise). Supports Range headers.',
          tags: ['Public'],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'fileId', in: 'path', required: true, schema: { type: 'number' } },
            { name: 'password', in: 'query', schema: { type: 'string' }, description: 'Share password (required when the share is password-protected)' },
            { name: 'Range', in: 'header', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'File stream' },
            '206': { description: 'Partial content' },
            '403': { description: 'Password required or incorrect' },
            '404': { description: 'Share link not found, or file not in this share' },
          },
        },
      },
      '/dl/f/{code}/gallery': {
        get: {
          summary: 'Folder share image gallery',
          description: 'Renders an HTML image gallery for a folder share. When protected, pass ?pwd=<password> to verify; without it the password form is shown, with a wrong password an error page is shown.',
          tags: ['Public'],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'pwd', in: 'query', schema: { type: 'string' }, description: 'Share password (required when the share is password-protected)' },
          ],
          responses: {
            '200': { description: 'HTML gallery page' },
          },
        },
      },
      '/img/{code}/{fileId}': {
        get: {
          summary: 'Public image hotlink',
          description: 'Direct image URL for hotlinking (product preview images). Intentionally public: no password check, CORS * and a 1-year immutable cache. Only serves files that belong to the given file or folder share (404 otherwise).',
          tags: ['Public'],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'fileId', in: 'path', required: true, schema: { type: 'number' } },
          ],
          responses: {
            '200': { description: 'Image stream' },
            '404': { description: 'File not in this share' },
          },
        },
      },

      // ── Agent API (AGENT_API_TOKEN, not session auth) ──
      '/api/agent/status': {
        get: {
          summary: 'Agent API status',
          description: 'Health check for the Agent API, with basic storage stats.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          responses: {
            '200': {
              description: 'Status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      service: { type: 'string' },
                      stats: { $ref: '#/components/schemas/Stats' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Invalid agent token' },
            '503': { description: 'AGENT_API_TOKEN not configured on server' },
          },
        },
      },
      '/api/agent/stats': {
        get: {
          summary: 'Agent API detailed stats',
          description: 'Storage stats plus file/folder share counts.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          responses: {
            '200': {
              description: 'Stats',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      fileCount: { type: 'number' },
                      totalSize: { type: 'number' },
                      topicCount: { type: 'number' },
                      shareCount: { type: 'number' },
                      folderShareCount: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/agent/files': {
        get: {
          summary: 'Agent list/search files',
          description: 'Search by ?q=, or list files in a topic (?topicId=X, optional folderId, page, pageSize up to 200).',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query (takes precedence over topicId)' },
            { name: 'topicId', in: 'query', schema: { type: 'number' }, description: 'Topic ID to list files from (required unless q is given)' },
            { name: 'folderId', in: 'query', schema: { type: 'number' }, description: 'Folder ID within the topic' },
            { name: 'page', in: 'query', schema: { type: 'number', default: 1 } },
            { name: 'pageSize', in: 'query', schema: { type: 'number', default: 50 }, description: 'Items per page (max 200)' },
          ],
          responses: {
            '200': {
              description: 'File list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      files: { type: 'array', items: { $ref: '#/components/schemas/File' } },
                      total: { type: 'number' },
                      page: { type: 'number' },
                      pageSize: { type: 'number' },
                    },
                  },
                },
              },
            },
            '400': { description: 'topicId required (when no q given)' },
          },
        },
      },
      '/api/agent/files/{id}': {
        get: {
          summary: 'Agent single file details',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'number' } },
          ],
          responses: {
            '200': {
              description: 'File details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { file: { $ref: '#/components/schemas/File' } },
                  },
                },
              },
            },
            '404': { description: 'File not found' },
          },
        },
        delete: {
          summary: 'Agent delete file',
          description: 'Deletes the file record and its Telegram messages.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'number' } },
          ],
          responses: {
            '200': {
              description: 'Delete result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      deleted: { type: 'number', description: 'Telegram messages deleted' },
                      fileId: { type: 'number' },
                    },
                  },
                },
              },
            },
            '404': { description: 'File not found' },
          },
        },
      },
      '/api/agent/topics': {
        get: {
          summary: 'Agent list topics',
          description: 'Lists all topics, each enriched with fileCount and totalSize.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          responses: {
            '200': {
              description: 'Topic list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      topics: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            topicId: { type: 'number' },
                            name: { type: 'string' },
                            fileCount: { type: 'number' },
                            totalSize: { type: 'number' },
                            createdAt: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/agent/shares': {
        get: {
          summary: 'Agent list all shares',
          description: 'Returns all file shares and all folder shares (no plaintext passwords — unlike the admin list-all routes).',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          responses: {
            '200': {
              description: 'Share lists',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      shares: { type: 'array', items: { $ref: '#/components/schemas/ShareLink' } },
                      folderShares: { type: 'array', items: { $ref: '#/components/schemas/FolderShare' } },
                      total: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Agent create share link',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileId'],
                  properties: {
                    fileId: { type: 'number' },
                    password: { type: 'string', description: 'Optional password protection' },
                    expiresIn: { type: 'number', description: 'Expiry in seconds from now (0 = never)' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Share created' },
            '400': { description: 'fileId required, or file not found' },
          },
        },
      },
      '/api/agent/shares/{code}': {
        put: {
          summary: 'Agent update share link',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    password: { type: 'string', description: 'New password (empty string to remove, omit to keep)' },
                    expiresIn: { type: 'number', description: 'New expiry in seconds (0 to remove, omit to keep)' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Update result' },
            '404': { description: 'Share link not found' },
          },
        },
        delete: {
          summary: 'Agent revoke share link',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Revoke result' } },
        },
      },
      '/api/agent/ads': {
        get: {
          summary: 'Agent get ad configuration',
          description: 'Reads the ads.* settings (enabled, shop name/URL, product list).',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          responses: {
            '200': {
              description: 'Ad configuration',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      shopName: { type: 'string' },
                      shopUrl: { type: 'string' },
                      products: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            price: { type: 'string' },
                            url: { type: 'string' },
                            image: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        put: {
          summary: 'Agent update ad configuration',
          description: 'Updates only the fields present in the body.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    shopName: { type: 'string' },
                    shopUrl: { type: 'string' },
                    products: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          price: { type: 'string' },
                          url: { type: 'string' },
                          image: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Update result' } },
        },
      },
      '/api/agent/upload': {
        post: {
          summary: 'Agent upload file',
          description: 'Upload a file via multipart/form-data. topicId defaults to AGENT_DEFAULT_TOPIC (or 20). A same-name file in the same topic is deleted first, and a public share link is auto-created.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                    topicId: { type: 'number', description: 'Target topic ID (default: AGENT_DEFAULT_TOPIC or 20)' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Upload complete',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      fileId: { type: 'number' },
                      name: { type: 'string' },
                      mimeType: { type: 'string' },
                      url: { type: 'string', description: 'Public share page URL' },
                      rawUrl: { type: 'string', description: 'Raw download URL' },
                      imgUrl: { type: 'string', description: 'Image hotlink URL (images only)' },
                    },
                  },
                },
              },
            },
            '400': { description: 'multipart/form-data required, or file field missing' },
            '500': { description: 'Upload failed' },
          },
        },
      },
      '/api/agent/transfer': {
        post: {
          summary: 'Agent transfer from URL',
          description: 'Fetch a file from an external URL and store it. topicId defaults to AGENT_DEFAULT_TOPIC (or 20). A public share link is auto-created. Same SSRF protection as POST /api/transfer: blocked URLs return 400.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: { type: 'string', format: 'uri' },
                    topicId: { type: 'number', description: 'Target topic ID (default: AGENT_DEFAULT_TOPIC or 20)' },
                    folderId: { type: 'number', nullable: true },
                    fileName: { type: 'string', description: 'Optional file name override' },
                    mimeType: { type: 'string', description: 'Optional MIME type override' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Transfer complete',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      fileId: { type: 'number' },
                      name: { type: 'string' },
                      size: { type: 'number' },
                      url: { type: 'string', description: 'Public share page URL' },
                      rawUrl: { type: 'string', description: 'Raw download URL' },
                    },
                  },
                },
              },
            },
            '400': { description: 'url required, or URL blocked by SSRF protection' },
            '500': { description: 'Fetch or store failed' },
          },
        },
      },
      '/api/agent/transfer/batch': {
        post: {
          summary: 'Agent batch transfer from URLs',
          description: 'Fetch up to 20 files from external URLs. topicId defaults to AGENT_DEFAULT_TOPIC (or 20). Per-URL failures are reported in results.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['urls'],
                  properties: {
                    urls: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uri' } },
                    topicId: { type: 'number', description: 'Target topic ID (default: AGENT_DEFAULT_TOPIC or 20)' },
                    folderId: { type: 'number', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch result (ok is true only when every URL succeeded)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      succeeded: { type: 'number' },
                      failed: { type: 'number' },
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            url: { type: 'string' },
                            ok: { type: 'boolean' },
                            fileId: { type: 'number' },
                            name: { type: 'string' },
                            error: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'urls array missing/empty or more than 20 URLs' },
          },
        },
      },
      '/api/agent/files/batch/delete': {
        post: {
          summary: 'Agent batch delete files',
          description: 'Delete up to 50 files (D1 records + Telegram messages). Per-file failures are reported in errors.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileIds'],
                  properties: {
                    fileIds: { type: 'array', maxItems: 50, items: { type: 'number' } },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      succeeded: { type: 'number' },
                      failed: { type: 'number' },
                      errors: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'number' },
                            error: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'fileIds array missing/empty or more than 50 files' },
          },
        },
      },
      '/api/agent/files/batch/move': {
        post: {
          summary: 'Agent batch move files',
          description: 'Move up to 50 files to another topic (and optionally a folder within it). Moving to a different topic resets folder_id unless an explicit folderId is given.',
          tags: ['Agent'],
          security: [{ AgentToken: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileIds', 'topicId'],
                  properties: {
                    fileIds: { type: 'array', maxItems: 50, items: { type: 'number' } },
                    topicId: { type: 'number', description: 'Target topic ID' },
                    folderId: { type: 'number', nullable: true, description: 'Target folder ID (null = topic root)' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      succeeded: { type: 'number' },
                      failed: { type: 'number' },
                      errors: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'number' },
                            error: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'fileIds array missing/empty, topicId missing, or more than 50 files' },
            '404': { description: 'Target topic not found' },
          },
        },
      },
    },

    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'token',
          description: 'Auth token. Pass as Authorization: Bearer <token> or ?token=<token> in query.',
        },
        AgentToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'token',
          description: 'Agent API token. Pass as Authorization: Bearer <AGENT_API_TOKEN>. Separate from the session token; plain string comparison against the AGENT_API_TOKEN secret.',
        },
      },
      schemas: {
        Stats: {
          type: 'object',
          properties: {
            fileCount: { type: 'number' },
            totalSize: { type: 'number' },
            topicCount: { type: 'number' },
          },
        },
        File: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            topicId: { type: 'number' },
            folderId: { type: 'number', nullable: true },
            name: { type: 'string' },
            size: { type: 'number' },
            mimeType: { type: 'string' },
            chunkCount: { type: 'number' },
            createdAt: { type: 'number' },
          },
        },
        ChunkInfo: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            file_unique_id: { type: 'string' },
            size: { type: 'number' },
            part_index: { type: 'number' },
            message_id: { type: 'number' },
          },
        },
        ShareLink: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            fileId: { type: 'number' },
            fileName: { type: 'string' },
            fileSize: { type: 'number' },
            hasPassword: { type: 'boolean' },
            password: { type: 'string', nullable: true, description: 'Plaintext password (returned by admin list-all routes for display/copy)' },
            expiresAt: { type: 'number', nullable: true },
            downloadCount: { type: 'number' },
            maxDownloads: { type: 'number', nullable: true },
            createdAt: { type: 'number' },
          },
        },
        FolderShare: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            topicId: { type: 'number' },
            folderId: { type: 'number', nullable: true },
            name: { type: 'string' },
            fileCount: { type: 'number' },
            hasPassword: { type: 'boolean' },
            password: { type: 'string', nullable: true, description: 'Plaintext password (returned by admin list-all routes for display/copy)' },
            expiresAt: { type: 'number', nullable: true },
            downloadCount: { type: 'number' },
            maxDownloads: { type: 'number', nullable: true },
            createdAt: { type: 'number' },
          },
        },
      },
    },
    tags: [
      { name: 'Discovery', description: 'API self-discovery endpoints' },
      { name: 'Public', description: 'Public endpoints (no auth required)' },
      { name: 'Topics', description: 'Folder/topic management' },
      { name: 'Files', description: 'File CRUD and transfer operations' },
      { name: 'Folders', description: 'Hierarchical folder management' },
      { name: 'Shares', description: 'Share link management' },
      { name: 'FolderShares', description: 'Folder share link management' },
      { name: 'Config', description: 'Settings and password management' },
      { name: 'Admin', description: 'Administrative operations' },
      { name: 'Agent', description: 'Agent API (AGENT_API_TOKEN auth) for Hermes integration' },
    ],
  };
}
