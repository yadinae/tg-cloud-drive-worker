import type { Hono } from 'hono';
import type { Env } from '../types';
import { cleanupAllOrphanUploads } from '../storage';
import { ensureSchema } from '../schema';

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
// ───── Admin: Clean all orphan upload chunks ─────
app.post('/api/admin/cleanup-orphans', async (c) => {
  try {
    // minAgeHours: skip chunks younger than this (protects in-progress uploads)
    const minAgeHours = Number(c.req.query('minAgeHours')) || 0;
    const result = await cleanupAllOrphanUploads(c.env, minAgeHours * 3600 * 1000);
    return c.json({ ok: true, ...result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ───── Admin: Debug migration ─────
app.get('/api/admin/migrate', async (c) => {
  try {
    await ensureSchema(c.env);
    const tables = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    return c.json({ ok: true, tables: tables.results });
  } catch (err: any) {
    return c.json({ error: err.message, stack: err.stack }, 500);
  }
});

// ───── Admin: Sync existing Telegram topics to D1 ─────
app.post('/api/admin/sync-topics', async (c) => {
  try {
    const token = c.env.TG_BOT_TOKEN;
    const chatId = c.env.STORAGE_CHANNEL_ID;
    const from = Number(c.req.query('from')) || 1;
    const to = Math.min(from + 25, 100); // Probe 25 IDs at a time
    const discovered: { topicId: number; name: string }[] = [];
    const toDelete: number[] = [];

    for (let tid = from; tid <= to; tid++) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: tid,
          text: '.',
          disable_notification: true,
          disable_web_page_preview: true,
        })
      });
      const data: any = await res.json();
      if (data.ok) {
        discovered.push({ topicId: tid, name: tid === 1 ? 'General' : `Topic ${tid}` });
        if (data.result?.message_id) {
          toDelete.push(data.result.message_id);
        }
      }
    }

    // Batch delete test messages (only for discovered topics)
    let deleted = 0;
    for (const msgId of toDelete) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: msgId })
        });
        deleted++;
      } catch { /* ignore */ }
    }

    // Store discovered topics in D1
    let inserted = 0;
    for (const topic of discovered) {
      try {
        await c.env.DB.prepare('INSERT OR IGNORE INTO topics (topic_id, name) VALUES (?, ?)')
          .bind(topic.topicId, topic.name).run();
        inserted++;
      } catch { /* ignore duplicates */ }
    }

    return c.json({
      ok: true,
      from, to,
      discovered: discovered.length,
      inserted,
      allTopics: discovered,
      note: 'Topic names are generic. Rename them from the UI.',
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ───── Admin: Get channel info ─────
app.get('/api/admin/info', async (c) => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${c.env.TG_BOT_TOKEN}/getChat?chat_id=${c.env.STORAGE_CHANNEL_ID}`);
    const data: any = await res.json();
    if (!data.ok) return c.json({ error: `getChat failed: ${data.description}` }, 400);
    return c.json({ ok: true, chat: { id: data.result.id, type: data.result.type, title: data.result.title || data.result.username } });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ───── Admin: Identify which topic is which ─────
app.get('/api/admin/identify/:topicId', async (c) => {
  const topicId = Number(c.req.param('topicId'));
  const msg = `🆔 话题 ID ${topicId} — 你看到这个话题的名称是什么？告诉我后我会删掉这条消息`;
  const res = await fetch(`https://api.telegram.org/bot${c.env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: c.env.STORAGE_CHANNEL_ID, message_thread_id: topicId, text: msg, disable_notification: true })
  });
  const data: any = await res.json();
  if (!data.ok) return c.json({ error: data.description }, 500);
  return c.json({ ok: true, message: `Sent ID card to topic ${topicId}` });
});
}
