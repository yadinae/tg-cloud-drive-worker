# TG Cloud Drive Worker

**Telegram Bot API 驱动的云盘，运行在 Cloudflare Workers 上，无需翻墙。**

对比原版 [tg-cloud-drive](https://github.com/yadinae/tg-cloud-drive)（浏览器 GramJS + MTProto），本版用 Bot API 替代 MTProto，彻底避免 GFW 封锁。

## ✨ 特性

- **文件夹分享**：分享整个文件夹（含子文件夹），一键生成下载页
- **在线图库**：图片文件夹自动生成画廊模式，支持直链热链供外部网站调用
- **文件预览**：支持图片、视频、音频、PDF、Markdown、代码/文本文件的在线预览（7 种预览方式）
- **拖放上传**：支持文件/文件夹拖放上传，保持目录结构
- **分享链接**：可设密码保护、过期时间、访问次数统计
- **多文件夹**：无限层级文件夹，面包屑导航
- **URL 传输**：直接粘贴 URL 将文件从网络传输到云盘
- **分块上传**：大文件浏览器端分块（每块 18MB），绕过 Bot API 限制
- **音频播放器**：底部全局播放栏，支持队列/顺序/循环
- **并发控制**：Bot API 调用限并发（默认 2），防止 429 限流

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|:-----|:----:|:------|:-----|
| `TG_BOT_TOKEN` | ✅ | — | Telegram Bot Token（从 @BotFather 获取）|
| `STORAGE_CHANNEL_ID` | ✅ | — | 存储频道/群组的数字 ID（如 `-1001234567890`）|
| `DRIVE_AUTH_TOKEN` | ✅ | — | 前端登录用的 Bearer Token |
| `TG_API_BASE_URL` | ❌ | `https://api.telegram.org` | 自定义 Bot API 服务器地址（自建 Bot API 可突破 2GB 上限）|
| `TG_API_CONCURRENCY` | ❌ | `2` | Bot API 最大并发调用数 |

## 架构对比

| 特性 | 原版 tg-cloud-drive | 本版 (Worker) |
|------|:-------------------:|:-------------:|
| 协议 | MTProto (GramJS) | **HTTP Bot API** |
| 需翻墙？ | ✅ 是 | **❌ 否** |
| 运行时 | 浏览器 + Cloudflare Pages | **Cloudflare Workers (单一部署)** |
| 文件存储 | Telegram 超级群组 | Telegram 频道 (Bot 管理) |
| 元数据 | Telegram 消息扫描 | **D1 数据库** |
| 文件夹 | 超级群组话题 (Topic) | **D1 记录 (话题 ID)** |
| 用户认证 | Telegram 手机号登录 | **Bearer Token** |
| 分块上传 | 50MB → MTProto | **18MB → Bot API sendDocument** |

## 架构

```
浏览器 (React SPA)
   │
   ├─ HTTP ──► Cloudflare Worker ──► Bot API (api.telegram.org)
   │                │                         │
   │                ├─ D1 (元数据)              └─ 频道 (文件存储)
   │                └─ KV (分享链接)
   │
   └── 静态资源 ──► Worker 内联 (无需 Pages)
```

**关键设计：** 上传时浏览器将大文件分块（每块 18MB），Worker 逐块通过 `sendDocument` 发送到 Telegram 频道。下载时 Worker 从 Bot API 拉取各块并流式拼接返回浏览器。

## 部署

### 前置条件

1. **Telegram Bot Token** — 从 [@BotFather](https://t.me/BotFather) 创建
2. **Telegram 频道/群组** — 创建后将 Bot 设为管理员（需允许 Bot 发消息）
3. **Cloudflare 账户** — 开通 Workers、D1、KV

### 一键部署

```bash
# 克隆仓库
git clone https://github.com/yadinae/tg-cloud-drive-worker.git
cd tg-cloud-drive-worker

# 安装依赖
cd frontend && npm install && cd ../worker && npm install && cd ..

# 创建 D1 数据库
cd worker
npx wrangler d1 create tgcd-meta
# → 将返回的 database_id 填入 wrangler.toml 的 [[d1_databases]] 部分

# 创建 KV 命名空间
npx wrangler kv:namespace create "SHARES"
# → 将返回的 id 填入 wrangler.toml 的 [[kv_namespaces]] 部分

# 设置 secrets
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put STORAGE_CHANNEL_ID   # 频道/群组的数字 ID (如 -1001234567890)
npx wrangler secret put DRIVE_AUTH_TOKEN     # 前端访问用的 Bearer Token

# 部署
bash deploy.sh
```

### 首次启动

访问 `https://tg-cloud-drive-worker.yadinae.workers.dev`：
1. 输入 DRIVE_AUTH_TOKEN 登录
2. 在侧边栏创建 Topic（话题=文件夹）
3. 上传文件开始使用

## API 接口

### 公开接口（无需 Auth）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 前端 SPA |
| GET | `/api/health` | 健康检查 (验证 Bot + 频道) |
| GET | `/api/stats` | 统计信息 (文件数/大小/话题数) |
| POST | `/api/auth/verify` | 验证用户 Token |
| POST | `/api/shares/verify` | 验证分享密码 |
| GET | `/dl/:code` | 分享下载页面 |
| GET | `/dl/:code/raw` | 分享直链下载 |
| GET | `/dl/f/:code` | **文件夹分享下载页面** |
| GET | `/dl/f/:code/raw/:fileId` | **文件夹分享直链文件下载** |
| GET | `/dl/f/:code/gallery` | **图片画廊模式** |
| GET | `/img/:code/:fileId` | **图片直链热链 (CORS)** |
| POST | `/api/shares/folder/verify` | **验证文件夹分享密码** ||

### 认证接口（需 `Authorization: Bearer <token>`）

#### 话题 (文件夹)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/topics` | 获取话题列表 (含文件数) |
| POST | `/api/topics` | 创建话题 (自动在 Telegram 创建论坛话题) |
| PUT | `/api/topics/:topicId` | 重命名话题 |
| DELETE | `/api/topics/:topicId` | 删除话题 (含其下所有文件) |

#### 文件

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files?topicId=` | 列出话题中的文件 |
| GET | `/api/files?q=` | 搜索文件 |
| POST | `/api/files/upload` | 上传文件 (multipart, ≤18MB) |
| POST | `/api/files/upload-chunk` | 上传分块 (前端分块用) |
| POST | `/api/files/finalize` | 完成分块上传 |
| POST | `/api/files/cleanup-upload` | 清理失败的分块上传 |
| PUT | `/api/files/:id` | 重命名文件 |
| PUT | `/api/files/:id/move` | 移动文件到其他话题/文件夹 |
| DELETE | `/api/files/:id` | 删除文件 (D1 + Telegram 消息) |
| GET | `/api/files/:id/download` | 下载文件 (单块代理/多块流式拼接) |
| POST | `/api/transfer` | 从 URL 传输文件 |

#### 文件夹

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/folders?topicId=` | 列出话题中的文件夹 |
| POST | `/api/folders` | 创建文件夹 |
| PUT | `/api/folders/:id` | 重命名文件夹 |
| DELETE | `/api/folders/:id` | 删除文件夹 (文件移到父目录) |
| GET | `/api/folders/:id/path` | 文件夹导航面包屑路径 |

#### 分享链接

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/shares` | 创建文件分享链接 (可设密码/过期) |
| GET | `/api/shares?fileId=` | 查看某个文件的分享链接 |
| GET | `/api/shares/list-all` | 查看所有分享链接 |
| PUT | `/api/shares/:code` | 修改分享 (密码/过期) |
| DELETE | `/api/shares/:code` | 撤销分享链接 |
| POST | `/api/shares/folder` | **创建文件夹分享链接** |
| GET | `/api/shares/folder/list-all` | **查看所有文件夹分享** |
| PUT | `/api/shares/folder/:code` | **修改文件夹分享** |
| DELETE | `/api/shares/folder/:code` | **撤销文件夹分享** |

#### 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/migrate` | 调试 D1 表结构 |
| GET | `/api/admin/info` | 获取频道信息 |
| POST | `/api/admin/sync-topics` | 扫描 Telegram 已存在的论坛话题 |
| GET | `/api/admin/identify/:topicId` | 向话题发消息以确认 ID |
| POST | `/api/admin/cleanup-orphans` | 清理所有孤立的上传分块 |

## 已知限制

| 限制 | 说明 | 解决方案 |
|:----|:-----|:---------|
| **Bot API 下载限制 ~20MB** | `getFile` 方法无法返回 >20MB 文件的下载路径 | 前端分块上传（每块 ≤18MB），下载时 Worker 逐块拉取后流式拼接 |
| **文件大小上限 ~2GB** | Bot API 的 sendDocument 限制 | 超过 50MB 的文件需要架设 [Local Bot API](https://core.telegram.org/bots/api#using-a-local-bot-api-server)，设置 `TG_API_BASE_URL` 环境变量 |

> **自建 Bot API Server**：设置 `TG_API_BASE_URL` 后可绕过官方 API 的限制，直接上传/下载 >2GB 的文件，无需浏览器端分块。参见 [Telegram Bot API 自部署文档](https://github.com/tdlib/telegram-bot-api)。

## 分块上传机制

大文件通过浏览器端分块解决 Bot API 50MB 上传限制和 20MB 下载限制：

```
        ≤18MB: 单请求上传
        >18MB: 分块上传
                │
                ├─ 块 0: POST /api/files/upload-chunk → Bot API sendDocument
                ├─ 块 1: POST /api/files/upload-chunk → Bot API sendDocument
                ├─ ...
                └─ POST /api/files/finalize → 写入 D1 manifest
```

每个块的 `message_id` 存储在 manifest 中，删除文件时会通过 Bot API 的 `deleteMessage` 同步清理 Telegram 上的消息。

## 下载流程

```
单块文件 (≤18MB):
  Worker → Bot API getFile → 获取 Telegram CDN URL → 流式转发回浏览器
  (失败自动重试 3 次，25 秒超时)

多块文件 (>18MB):
  Worker → 逐块从 Bot API 拉取 → 流式拼接 → 浏览器
  (每块独立重试 3 次，单块失败不影响后续块)
```

## 技术栈

- **运行时:** Cloudflare Workers
- **框架:** Hono.js
- **前端:** React + TypeScript + Vite (内联到 Worker)
- **数据库:** D1 (SQLite)
- **缓存:** KV (分享链接 + 分块上传暂存)
- **存储后端:** Telegram Bot API (官方 API)
