import type { Env } from './types';

// ───── Auto-migrate D1 on cold start ─────
export async function ensureSchema(env: Env) {
  try {
    // Check if topics table exists (v2 schema)
    const allTables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name: string}>();
    const tableNames = allTables.results.map(r => r.name);

    if (tableNames.includes('topics')) {
      // Check for v3 migration (folders support)
      if (!tableNames.includes('folders')) {
        await env.DB.prepare(`CREATE TABLE folders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          parent_id INTEGER,
          name TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        )`).run();
        // Add folder_id to files
        await env.DB.prepare("ALTER TABLE files ADD COLUMN folder_id INTEGER").run();
        // Add indexes for folder queries
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_topic ON folders(topic_id)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)").run();
        console.log('✅ D1 schema migrated to v3 (folders support)');
      } else {
        // Ensure indexes exist on existing v3 schema
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_topic ON folders(topic_id)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)").run();
      }

      // ───── V4: Settings table (config system) ─────
      if (!tableNames.includes('settings')) {
        await env.DB.prepare(`CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          description TEXT DEFAULT '',
          updated_at INTEGER DEFAULT (unixepoch())
        )`).run();
        // Seed default values
        const defaults: [string, string, string][] = [
          ['download.concurrency', '3',           '并发下载线程数'],
          ['download.chunk_size_mb', '18',        '下载分块大小(MB)'],
          ['upload.default_topic', '',            '默认上传话题ID'],
          ['upload.chunk_size_mb', '18',          '上传分块大小(MB)'],
          ['upload.auto_chunk_threshold_mb', '10','自动分块阈值(MB)'],
          ['share.default_expiry_hours', '72',    '分享默认过期时间(小时)'],
          ['bot.api_concurrency', '5',            'Bot API 最大并发数'],
          ['bot.api_base_url', '',                '自定义 Bot API 地址'],
          ['system.auto_cleanup_days', '0',       '自动清理天数(0=关)'],
          ['system.session_timeout_days', '7',    '会话过期天数'],
        ['system.password_hash', '',             '用户可修改的登录密码(PBKDF2-SHA256)'],
          // ───── 商城广告配置 ─────
          ['ads.enabled', 'false',               '分享页是否显示商城广告'],
          ['ads.shop_name', '我们的商城',          '商城名称'],
          ['ads.shop_url', 'https://www.isoho168.top', '商城链接'],
          ['ads.products', '[]',                 '推荐商品列表(JSON)'],
        ];
        for (const [k, v, d] of defaults) {
          await env.DB.prepare(
            'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)'
          ).bind(k, v, d).run();
        }
        console.log('✅ D1 schema migrated to v4 (settings table)');
      }
      return; // Already migrated
    }

    // Drop old folders
    await env.DB.prepare("DROP TABLE IF EXISTS folders").run();

    // Drop old files table and create new one with topic_id
    await env.DB.prepare("DROP TABLE IF EXISTS files_old").run();
    // Rename old files to files_old before creating new
    const oldFilesExists = tableNames.includes('files');
    if (oldFilesExists) {
      await env.DB.prepare("ALTER TABLE files RENAME TO files_old").run();
    }

    await env.DB.prepare(`CREATE TABLE topics (
      topic_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`).run();

    await env.DB.prepare(`CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT 'application/octet-stream',
      manifest TEXT DEFAULT '[]',
      chunk_count INTEGER DEFAULT 1,
      bot_file_id TEXT,
      file_unique_id TEXT,
      message_id INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`).run();

    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_topic ON files(topic_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_topic ON folders(topic_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)").run();

    console.log('✅ D1 schema migrated to v2 (topic-based)', tableNames);
  } catch (err) {
    console.error('D1 schema migration failed:', err);
    throw err; // Let caller see the error
  }
}
