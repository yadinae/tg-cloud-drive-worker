# TG Cloud Drive — 配置系统设计方案

> 日期：2026-06-26
> 状态：待实施（计划明日执行）

---

## 一、需求背景

当前 TG Cloud Drive 的配置散落在三处：Cloudflare Secrets（`DRIVE_AUTH_TOKEN`、`TG_BOT_TOKEN`、`STORAGE_CHANNEL_ID`）、环境变量（`TG_API_BASE_URL`、`TG_API_CONCURRENCY`）、以及前端硬编码。用户缺少一个统一的配置界面来调整运行时行为。

---

## 二、配置项清单

### P0（核心功能）

| 配置项 | key | 类型 | 默认值 | 说明 |
|--------|-----|------|--------|------|
| 登录密码 | — | string | env secret | 当前靠 wrangler secret，需特殊处理 |
| 下载并发线程数 | `download.concurrency` | number(1-8) | 3 | 大文件同时下载几个 chunk |
| 默认上传话题 | `upload.default_topic` | number \| null | null | 上传文件默认目标话题 ID |

### P1（体验优化）

| 配置项 | key | 类型 | 默认值 | 说明 |
|--------|-----|------|--------|------|
| 上传分块大小 | `upload.chunk_size_mb` | number(1-20) | 18 | 超过此值自动分块 |
| 自动分块阈值 | `upload.auto_chunk_threshold_mb` | number | 10 | 超过此大小自动分块 |
| 下载分块大小 | `download.chunk_size_mb` | number(1-20) | 18 | 下载分块大小 |
| 分享默认过期时间 | `share.default_expiry_hours` | number | 72 | 创建分享的默认过期(小时) |
| Bot API 并发数 | `bot.api_concurrency` | number(1-8) | 2 | 防 429 限流 |

### P2（锦上添花）

| 配置项 | key | 类型 | 默认值 | 说明 |
|--------|-----|------|--------|------|
| 会话超时天数 | `system.session_timeout_days` | number | 7 | 登录过期时间 |
| 自动清理天数 | `system.auto_cleanup_days` | number(0-365) | 0 | 超过 N 天自动删除(0=关) |
| 自定义 Bot API 地址 | `bot.api_base_url` | string | "" | 自建 Bot API 服务器 URL |
| 每页文件数 | — | number(localStorage) | 50 | 前端分页 |
| 默认排序 | — | enum(localStorage) | name_asc | name/size/time + asc/desc |
| 主题色 | — | enum(localStorage) | dark | dark/light/system |

---

## 三、存储分层

```
┌──────────────────────────────────────────────────────┐
│ Tier 1: Cloudflare Secrets (不可读，仅可比较)         │
│ ───────────────────────────────────────────────────── │
│ DRIVE_AUTH_TOKEN    登录密码                          │
│ TG_BOT_TOKEN        Bot Token                        │
│ STORAGE_CHANNEL_ID  存储频道 ID                       │
│                                                      │
│ 修改方式：wrangler secret put <key>                   │
│ UI 方案：POST /api/auth/change-password 路由          │
│          Worker 持有 CF API Token(限定 scope)，        │
│          通过 CF API 更新 secret                      │
├──────────────────────────────────────────────────────┤
│ Tier 2: D1 `settings` 表 (持久化，可 CRUD)            │
│ ───────────────────────────────────────────────────── │
│ download.*             下载相关                       │
│ upload.*               上传相关                       │
│ share.*                分享相关                       │
│ bot.*                  Bot API 相关                   │
│ system.*               系统配置                       │
│                                                      │
│ 写入 API: PUT /api/config → 批量更新                  │
│ 读取 API: GET /api/config → 全量返回                  │
│ 生效方式：写入即生效，无需重部署                       │
├──────────────────────────────────────────────────────┤
│ Tier 3: 前端 localStorage (零服务端依赖)               │
│ ───────────────────────────────────────────────────── │
│ 每页文件数、排序方式、主题色                           │
│ 保存方式：useEffect(() => localStorage.set())         │
│ 加载方式：useState(() => localStorage.get())          │
└──────────────────────────────────────────────────────┘
```

---

## 四、UI 布局

### Sidebar 新增入口

当前布局（左侧 260px 侧边栏）：

```
┌─────────────────┐
│ 📂 TOPICS        │
│  All Topics      │
│  📁 Document     │
│  📁 Music        │
│  ...             │
│  [+ New]         │
│                  │
│ ──────────────── │
│ 🔗 SHARE LINKS   │
│  🔗 Active       │
│  ⏳ Expiring     │
│  ❌ Expired      │
│                  │
│ ──────────────── │
│ ⚙️ Settings     ← 新增入口
└─────────────────┘
```

点击 ⚙️ Settings 后，Main Content 区域切换为配置面板。

### Settings 面板布局

```
┌──────────────────────────────────────────────────┐
│ ⚙️ Settings                                       │
│                                                 │
│ ── 🔒 Security ──                                │
│  密码: ••••••••••  [✏️ 修改]                     │
│  会话超时: [7] 天                                 │
│                                                 │
│ ── ⬇️ Download ──                                │
│  并发线程数:  [3]  (1-8)                         │
│  分块大小:    [18] MB                            │
│                                                 │
│ ── ⬆️ Upload ──                                  │
│  默认上传话题: [▼ 下拉选择话题列表         ]       │
│  自动分块阈值: [10] MB                            │
│  分块大小:     [18] MB                            │
│                                                 │
│ ── 🔗 Share ──                                   │
│  默认过期时间: [▼ 72小时                    ]     │
│                                                 │
│ ── 🤖 Bot ──                                     │
│  API 并发数:  [2]                                │
│  自定义 URL:  [________________________]         │
│                                                 │
│ ── 🧹 Auto Cleanup ──                           │
│  自动清理天数: [0]  (0=关闭)                      │
│                                                 │
│ [💾 保存设置]  [↻ 恢复默认]                       │
│                                                 │
│ 📡 状态: Bot 已连接 ✅ | KV 正常 ✅               │
│     存储频道: isoho_cloud_drive_bot              │
└──────────────────────────────────────────────────┘
```

### 密码修改弹窗

点击 [✏️ 修改] 弹出模态框：

```
┌──────────────────────┐
│ 🔒 修改登录密码       │
│                      │
│ 当前密码: [________]  │
│ 新密码:   [________]  │
│ 确认密码: [________]  │
│                      │
│ 密码将作为 Cloudflare │
│ Secret 更新，写入后   │
│ 即时生效。            │
│                      │
│ [取消]    [确认修改]   │
└──────────────────────┘
```

**关键设计决策**：Worker 需注入一个 `CLOUDFLARE_API_TOKEN` secret（仅限 `workers:secret:edit` scope），密码修改路由通过 CF API 调 `PATCH /accounts/:id/workers/scripts/:name/secrets` 更新 `DRIVE_AUTH_TOKEN`。

---

## 五、后端实现

### D1 Schema (添加到 `ensureSchema`)

```typescript
if (!tableNames.includes('settings')) {
  await env.DB.prepare(`CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT DEFAULT '',
    updated_at INTEGER DEFAULT (unixepoch())
  )`).run();
  // 种子数据
  const defaults = [
    ['download.concurrency', '3', '并发下载线程数'],
    ['download.chunk_size_mb', '18', '下载分块大小(MB)'],
    ['upload.default_topic', '', '默认上传话题ID'],
    ['upload.chunk_size_mb', '18', '上传分块大小(MB)'],
    ['upload.auto_chunk_threshold_mb', '10', '自动分块阈值(MB)'],
    ['share.default_expiry_hours', '72', '分享默认过期时间(小时)'],
    ['bot.api_concurrency', '2', 'Bot API 最大并发数'],
    ['bot.api_base_url', '', '自定义 Bot API 地址'],
    ['system.auto_cleanup_days', '0', '自动清理天数(0=关)'],
    ['system.session_timeout_days', '7', '会话过期天数'],
  ];
  for (const [k, v, d] of defaults) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)'
    ).bind(k, v, d).run();
  }
}
```

### API 路由

```typescript
// GET /api/config — 获取全部配置
app.get('/api/config', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all();
  const settings: Record<string, string> = {};
  for (const row of results as any[]) settings[row.key] = row.value;
  return c.json({ settings });
});

// PUT /api/config — 批量更新配置
app.put('/api/config', async (c) => {
  const body = await c.req.json<Record<string, string>>();
  const now = Math.floor(Date.now() / 1000);
  for (const [key, value] of Object.entries(body)) {
    await c.env.DB.prepare(
      'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?'
    ).bind(value, now, key).run();
  }
  return c.json({ ok: true });
});

// POST /api/auth/change-password — 修改密码
app.post('/api/auth/change-password', async (c) => {
  const { oldPassword, newPassword } = await c.req.json();
  // 1. 验证旧密码
  const tokenBytes = new TextEncoder().encode(oldPassword);
  const expectedBytes = new TextEncoder().encode(c.env.DRIVE_AUTH_TOKEN);
  if (tokenBytes.length !== expectedBytes.length ||
      !(await crypto.subtle.timingSafeEqual(tokenBytes, expectedBytes))) {
    return c.json({ error: '当前密码错误' }, 403);
  }
  // 2. 通过 CF API 更新 secret
  if (!c.env.CF_API_TOKEN_FOR_SECRET) {
    return c.json({ error: '服务器未配置密钥管理权限，请联系管理员通过命令行修改密码' }, 501);
  }
  const accountId = c.env.CF_ACCOUNT_ID;
  const scriptName = 'tg-cloud-drive-worker';
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/secrets`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${c.env.CF_API_TOKEN_FOR_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'secret_text',
        name: 'DRIVE_AUTH_TOKEN',
        text: newPassword,
      }),
    }
  );
  const data = await res.json() as any;
  if (!data.success) {
    return c.json({ error: `密钥更新失败: ${data.errors?.[0]?.message || '未知错误'}` }, 500);
  }
  return c.json({ ok: true, message: '密码已更新' });
});
```

### Override 逻辑（环境变量 vs D1 settings）

读取配置时，优先使用 D1 settings 表的值，但环境变量可以覆盖——这为管理员保留了通过 wrangler 强制覆盖的能力：

```typescript
function getConfig(env: Env, settings: Record<string, string>, key: string): string {
  // 环境变量映射
  const envMap: Record<string, string | undefined> = {
    'bot.api_base_url': env.TG_API_BASE_URL,
    'bot.api_concurrency': env.TG_API_CONCURRENCY,
  };
  return envMap[key] ?? settings[key] ?? '';
}
```

---

## 六、前端组件结构

### 新增组件

| 组件 | 说明 | 位置 |
|------|------|------|
| `SettingsPanel` | 配置面板主容器 | App.tsx 新文件 |
| `ChangePasswordModal` | 密码修改弹窗 | SettingsPanel 内 |

### 状态管理

```typescript
// 新增状态
const [activeView, setActiveView] = useState<'topics' | 'shares' | 'settings'>('topics');
const [settings, setSettings] = useState<Record<string, string>>({});
const [settingsDirty, setSettingsDirty] = useState(false);

// 在 Drive 组件初始化时加载配置
useEffect(() => {
  if (activeView === 'settings' && Object.keys(settings).length === 0) {
    loadSettings();
  }
}, [activeView]);

// 保存
const handleSaveSettings = async () => {
  await saveSettings(settings);
  setSettingsDirty(false);
};
```

### Sidebar 修改点

```tsx
// 在 Share Links 区块之后添加（App.tsx ~line 1468）
{/* ─── SETTINGS ─── */}
<div style={{ borderTop: '1px solid #334155', paddingTop: '1rem' }}>
  <button
    onClick={() => setActiveView('settings')}
    style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '.5rem .75rem', borderRadius: 6,
      border: 'none',
      background: activeView === 'settings' ? '#242424' : 'transparent',
      color: '#ffffff', cursor: 'pointer', fontSize: '.875rem',
    }}
  >
    ⚙️ Settings
  </button>
</div>
```

### Main Content 切换逻辑

```tsx
// 在 ~line 1471-1472 之间
{activeView === 'settings' ? (
  <SettingsPanel
    settings={settings}
    onSettingsChange={setSettings}
    onSave={handleSaveSettings}
    onDirtyChange={setSettingsDirty}
    env={env}
  />
) : (
  /* 现有内容 */
)}
```

---

## 七、实施步骤

### Phase 1: 后端（~1 小时）

1. `types.ts` — 新增 `ConfigRow` 类型
2. `index.ts` — `ensureSchema` 中建 `settings` 表 + 种子数据
3. `index.ts` — 新增 `GET /api/config`、`PUT /api/config` 路由
4. `index.ts` — 新增 `POST /api/auth/change-password` 路由
5. 如需：新增 `CLOUDFLARE_API_TOKEN_FOR_SECRET` 环境变量声明

### Phase 2: 前端（~1-2 小时）

1. `api/client.ts` — 新增 `fetchConfig()`、`updateConfig()`、`changePassword()` API 封装
2. App.tsx — Sidebar 添加 ⚙️ Settings 入口按钮
3. 新增 `SettingsPanel` 组件（配置面板主组件）
4. 新增 `ChangePasswordModal` 组件（密码修改弹窗）
5. 对接 Main Content 切换逻辑

### Phase 3: 验证（~30 分钟）

1. 部署到 Cloudflare
2. 测试配置读写
3. 测试密码修改（需要先注入 CF API token secret）

---

## 八、边界情况与注意事项

| # | 注意事项 | 说明 |
|:-:|----------|------|
| 1 | **密码修改的前置条件** | Worker 需要注入限定了 `workers:secret:edit` scope 的 CF API Token，否则密码修改返回 501 |
| 2 | **配置覆盖优先级** | 环境变量 > D1 settings > 代码默认值。管理员可以用 wrangler 强行覆盖 |
| 3 | **localStorage 配置不跨设备同步** | 每页条数、主题、排序等 UI 配置存 localStorage，切换设备需重新设置 |
| 4 | **配置值校验** | 后端写入前做基本类型和范围校验（如 download.concurrency 1-8） |
| 5 | **修改密码会登出所有会话** | 密码修改后需重新登录，密码验证基于 timingSafeEqual，新密码即时生效 |

---

## 九、种子数据 SQL

```sql
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('download.concurrency', '3',           '并发下载线程数'),
  ('download.chunk_size_mb', '18',        '下载分块大小(MB)'),
  ('upload.default_topic', '',            '默认上传话题ID'),
  ('upload.chunk_size_mb', '18',          '上传分块大小(MB)'),
  ('upload.auto_chunk_threshold_mb', '10','自动分块阈值(MB)'),
  ('share.default_expiry_hours', '72',    '分享默认过期时间(小时)'),
  ('bot.api_concurrency', '2',            'Bot API 最大并发数'),
  ('bot.api_base_url', '',                '自定义 Bot API 地址'),
  ('system.auto_cleanup_days', '0',       '自动清理天数(0=关)'),
  ('system.session_timeout_days', '7',    '会话过期天数');
```
