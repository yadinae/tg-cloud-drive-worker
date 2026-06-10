# TG Cloud Drive Worker

**Telegram Bot API 驱动的云盘，运行在 Cloudflare Workers 上，无需翻墙。**

## 架构对比

| 特性 | 原版 tg-cloud-drive | 本版 (Worker) |
|------|:-------------------:|:-------------:|
| 协议 | MTProto (GramJS) | HTTP Bot API |
| 需翻墙？ | ✅ 是 | ❌ 否 |
| 运行时 | 浏览器 + Cloudflare Pages | Cloudflare Workers |
| 文件存储 | Telegram 超级群组 | Telegram 频道 (Bot 管理) |
| 元数据 | Telegram 消息扫描 | D1 数据库 |
| 用户认证 | Telegram 手机号登录 | Bearer Token |
| 分块上传 | 50MB → MTProto 消息 | 48MB → Bot API 文档 |

## 快速开始

### 前置条件

1. **Telegram Bot Token** — 从 [@BotFather](https://t.me/BotFather) 创建
2. **Telegram 频道** — 创建频道，将 Bot 设为管理员
3. **Cloudflare 账户** — 启用 Workers 和 D1

### 部署

```bash
# 1. 写入配置
cd worker
cp wrangler.toml wrangler.toml.bak  # 备份

# 2. 创建 D1 数据库
npx wrangler d1 create tgcd-meta
# → 将返回的 database_id 填入 wrangler.toml

# 3. 初始化 D1 schema
npx wrangler d1 execute tgcd-meta --file=schema.sql

# 4. 设置 secrets
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put STORAGE_CHANNEL_ID
npx wrangler secret put DRIVE_AUTH_TOKEN

# 5. 部署 Worker
npm run deploy
```

### 前端部署

```bash
cd frontend
npm install
VITE_API_BASE=https://your-worker.workers.dev npm run build
# 将 dist/ 部署到 Cloudflare Pages
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/stats | 统计信息 |
| GET | /api/folders | 文件夹列表 |
| POST | /api/folders | 创建文件夹 |
| PUT | /api/folders/:id | 重命名文件夹 |
| DELETE | /api/folders/:id | 删除文件夹 |
| GET | /api/files?folderId= | 文件列表 |
| POST | /api/files/upload | 上传文件 (multipart) |
| PUT | /api/files/:id | 重命名文件 |
| DELETE | /api/files/:id | 删除文件 |
| GET | /api/files/:id/download | 下载文件 |
| POST | /api/shares | 创建分享链接 |
| GET | /api/shares?fileId= | 分享链接列表 |
| DELETE | /api/shares/:code | 删除分享 |
| POST | /api/shares/verify | 验证分享密码 |
| GET | /dl/:code | 分享下载页 |
