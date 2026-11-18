import type { Hono } from 'hono';
import type { Env } from '../types';
import { listTopics, createTopic as createTopicMeta, renameTopic, deleteTopic, listFolders, createFolder, renameFolder, deleteFolder } from '../metadata';
import { createForumTopic, renameForumTopic, deleteForumTopic } from '../bot';

export function registerTopicsRoutes(app: Hono<{ Bindings: Env }>): void {
// ───── Topics (Folders = Telegram forum topics) ─────

// GET /api/topics — list all topics
app.get('/api/topics', async (c) => {
  const topics = await listTopics(c.env);
  return c.json({ topics });
});

// POST /api/topics — create a new topic (folder) in Telegram + D1
// If topicId is provided, skip Telegram creation (for importing existing topics)
app.post('/api/topics', async (c) => {
  const { name, topicId: existingTopicId } = await c.req.json();
  if (!name || !name.trim()) {
    return c.json({ error: 'Topic name is required' }, 400);
  }
  const trimmedName = name.trim();

  // If topicId is provided, this is an existing Telegram topic; insert in D1 only
  if (existingTopicId) {
    const topic = await createTopicMeta(c.env, existingTopicId, trimmedName);
    return c.json({ ok: true, topic }, 201);
  }

  // Create in Telegram via Bot API
  try {
    const topicId = await createForumTopic(c.env, trimmedName);
    // Store in D1
    const topic = await createTopicMeta(c.env, topicId, trimmedName);
    return c.json({ ok: true, topic }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/topics/:topicId — rename a topic
app.put('/api/topics/:topicId', async (c) => {
  const topicId = Number(c.req.param('topicId'));
  const { name } = await c.req.json();
  if (!name || !name.trim()) {
    return c.json({ error: 'Topic name is required' }, 400);
  }
  const trimmedName = name.trim();

  // Rename in Telegram
  try {
    await renameForumTopic(c.env, topicId, trimmedName);
  } catch (err: any) {
    console.error('Telegram rename error:', err.message);
    // Continue anyway — D1 rename is the source of truth
  }

  // Rename in D1
  const ok = await renameTopic(c.env, topicId, trimmedName);
  return c.json({ ok });
});

// DELETE /api/topics/:topicId — delete a topic (folder)
app.delete('/api/topics/:topicId', async (c) => {
  const topicId = Number(c.req.param('topicId'));

  // Delete from Telegram
  try {
    await deleteForumTopic(c.env, topicId);
  } catch (err: any) {
    console.error('Telegram delete topic error:', err.message);
    // Continue anyway — D1 delete is the source of truth
  }

  // Delete from D1 (cascading files)
  const ok = await deleteTopic(c.env, topicId);
  return c.json({ ok });
});

// ───── Folders ─────

// GET /api/folders?topicId=X&parentId=Y — list folders in a topic
app.get('/api/folders', async (c) => {
  const topicId = Number(c.req.query('topicId'));
  const parentId = c.req.query('parentId') ? Number(c.req.query('parentId')) : null;
  if (!topicId) return c.json({ error: 'topicId required' }, 400);
  const folders = await listFolders(c.env, topicId, parentId);
  return c.json({ folders });
});

// POST /api/folders — create a folder
app.post('/api/folders', async (c) => {
  const { topicId, parentId, name } = await c.req.json();
  if (!topicId || !name?.trim()) return c.json({ error: 'topicId and name required' }, 400);
  const folder = await createFolder(c.env, topicId, name.trim(), parentId || null);
  return c.json({ ok: true, folder }, 201);
});

// PUT /api/folders/:id — rename folder
app.put('/api/folders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { name } = await c.req.json();
  if (!name?.trim()) return c.json({ error: 'name required' }, 400);
  const ok = await renameFolder(c.env, id, name.trim());
  return c.json({ ok });
});

// DELETE /api/folders/:id — delete folder (files reassigned to parent)
app.delete('/api/folders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const ok = await deleteFolder(c.env, id);
  return c.json({ ok });
});

// GET /api/folders/:id/path — breadcrumb path to folder root
app.get('/api/folders/:id/path', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    const rows = await c.env.DB.prepare(
      `WITH RECURSIVE tree AS (
         SELECT id, parent_id, name, 0 AS depth FROM folders WHERE id = ?
         UNION ALL
         SELECT f.id, f.parent_id, f.name, t.depth + 1
         FROM folders f JOIN tree t ON f.id = t.parent_id
       )
       SELECT id, name FROM tree ORDER BY depth DESC`
    ).bind(id).all<{ id: number; name: string }>();
    return c.json({ path: rows.results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
}
