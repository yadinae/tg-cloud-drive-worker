import type { Hono } from 'hono';
import type { Env } from '../types';


export function registerConfigRoutes(app: Hono<{ Bindings: Env }>): void {
// ───── Config (Settings API, auth required) ─────

// GET /api/config — 获取全部配置
app.get('/api/config', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all<{key: string, value: string}>();
  const settings: Record<string, string> = {};
  for (const row of results) settings[row.key] = row.value;
  return c.json({ settings });
});

// PUT /api/config — 批量更新配置（只更新已存在的键，含类型校验）
app.put('/api/config', async (c) => {
  const body = await c.req.json<Record<string, string>>();
  const now = Math.floor(Date.now() / 1000);

  // Type/range validation per key
  const rangeRules: Record<string, { min: number; max: number }> = {
    'download.concurrency': { min: 1, max: 8 },
    'download.chunk_size_mb': { min: 1, max: 20 },
    'upload.chunk_size_mb': { min: 1, max: 20 },
    'upload.auto_chunk_threshold_mb': { min: 1, max: 50 },
    'bot.api_concurrency': { min: 1, max: 8 },
    'system.auto_cleanup_days': { min: 0, max: 365 },
    'system.session_timeout_days': { min: 1, max: 90 },
  };
  const intKeys = new Set(Object.keys(rangeRules));

  for (const [key, value] of Object.entries(body)) {
    // Validate key exists
    const existing = await c.env.DB.prepare('SELECT key FROM settings WHERE key = ?').bind(key).first();
    if (!existing) continue; // skip unknown keys

    // Type validation for integer fields
    if (intKeys.has(key)) {
      const num = Number(value);
      if (!Number.isInteger(num) || isNaN(num)) {
        return c.json({ error: `${key} 必须是整数` }, 400);
      }
      const rule = rangeRules[key];
      if (num < rule.min || num > rule.max) {
        return c.json({ error: `${key} 取值范围 ${rule.min}-${rule.max}` }, 400);
      }
    }

    // Length validation for string fields
    if (value && value.length > 500) {
      return c.json({ error: `${key} 值过长（最多500字符）` }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?'
    ).bind(value, now, key).run();
  }
  return c.json({ ok: true });
});
}
