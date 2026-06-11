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
      { method: 'POST',   path: '/api/shares/verify', description: 'Verify share password and get download URL [PUBLIC — no auth]' },

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
      { method: 'PUT',    path: '/api/files/:id',            description: 'Rename a file' },
      { method: 'DELETE', path: '/api/files/:id',            description: 'Delete a file and its Telegram messages' },
      { method: 'GET',    path: '/api/files/:id/download',   description: 'Download a file stream' },
      { method: 'POST',   path: '/api/transfer',             description: 'Transfer a file from an external URL' },

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

      // ── Admin (auth required) ──
      { method: 'GET',    path: '/api/admin/migrate',       description: 'Run D1 schema migration' },
      { method: 'POST',   path: '/api/admin/sync-topics',   description: 'Discover Telegram forum topics' },
      { method: 'GET',    path: '/api/admin/info',          description: 'Get Telegram channel info' },
      { method: 'GET',    path: '/api/admin/identify/:topicId', description: 'Send ID card to a topic' },
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

All endpoints except \`/api/shares/verify\` require authentication via \`Authorization: Bearer <token>\` header or \`?token=<token>\` query parameter.

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
          security: [{ BearerAuth: [] }],
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
                      downloadUrl: { type: 'string', nullable: true },
                      error: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
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
          description: 'List files in a topic (?topicId=X) or search all files (?q=keyword).',
          tags: ['Files'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'topicId', in: 'query', schema: { type: 'number' }, description: 'Topic ID to list files from' },
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query' },
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
          description: 'Upload a file to a topic. Accepts multipart/form-data (preferred) or base64 JSON.',
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
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'File created' } },
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
          description: 'Fetch a file from an external URL and store it directly in the cloud drive (no local download needed).',
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
                    name: { type: 'string', description: 'Optional file name (auto-detected from Content-Disposition or URL)' },
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
                      manifest: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ChunkInfo' },
                      },
                    },
                  },
                },
              },
            },
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
            { name: 'topicId', in: 'query', required: true, schema: { type: 'number' } },
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
          description: 'Direct file download via a valid share link. Supports Range headers.',
          tags: ['Public'],
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'Range', in: 'header', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'File stream' },
            '206': { description: 'Partial content' },
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
      },
      schemas: {
        File: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            topicId: { type: 'number' },
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
            password: { type: 'string', nullable: true },
            expiresAt: { type: 'number', nullable: true },
            downloadCount: { type: 'number' },
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
      { name: 'Shares', description: 'Share link management' },
      { name: 'Admin', description: 'Administrative operations' },
    ],
  };
}
