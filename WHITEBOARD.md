# WHITEBOARD — 对抗式解题法系统性审核

## 1️⃣ 任务描述
TG Cloud Drive Worker 全量对抗式评审 + 修复

## 2️⃣ 文件清单
| 文件 | 行数 | 功能 |
|:-----|:----:|:-----|
| `frontend/src/App.tsx` | ~1100 | 主前端应用 |
| `frontend/src/api/client.ts` | ~230 | API 客户端 |
| `frontend/src/design-tokens.ts` | ~30 | 设计令牌 |
| `worker/src/index.ts` | ~640 | Hono 路由 |
| `worker/src/metadata.ts` | ~300 | D1 数据库操作 |
| `worker/src/storage.ts` | ~410 | 文件存储 |
| `worker/src/types.ts` | ~80 | 类型定义 |
| `worker/src/bot.ts` | ~100 | Telegram Bot 交互 |
| `worker/src/shares.ts` | ~200 | 分享链接管理 |
| `worker/src/openapi.ts` | ~120 | OpenAPI 规范 |

## 3️⃣ 判别者结果汇总

### 🔌 功能审查者 — 52/100

| 级别 | 问题 | 位置 | 说明 |
|:----:|:-----|:-----|:------|
| P1 | Topic 删除不清理 Folder | `metadata.ts:44-49` | `deleteTopic()` 删 files 和 topics 但不删 folders |
| P1 | 音频播放 index 越界 | `App.tsx` | ~~`files.indexOf()` 在过滤队列上索引错位~~ *(特定实现路径)* |
| P1 | Telegram API 错误不回滚 | `index.ts:232-256` | rename/delete topic 不检查 TG 响应，D1 已改不回滚 |
| P2 | 文件移动未校验目标 folder | `index.ts:375-388` | 未验证 `folderId` 属于同一 topic |
| P2 | transferFromUrl 无重试 | `storage.ts:229-268` | chunk 上传无重试逻辑 |
| P2 | 删除文件夹子级被提升到根 | `metadata.ts:190-197` | 子文件夹 `parent_id=NULL` 而非递归删除 |
| P2 | 全部查询无分页 | `metadata.ts` | 无 LIMIT/OFFSET |
| P2 | 分享 code 无碰撞检测 | `shares.ts:34-38` | 8 字符随机 code 无重试 |

### 🛡️ 安全审查者 — 内联检查

| 级别 | 问题 | 位置 | 说明 |
|:----:|:-----|:-----|:------|
| **P0** | **密码明文存储** | `shares.ts:59` | `password: password \|\| null` 明文同时存 hash 和明文 |
| **P0** | **Token 在 URL 中** | `client.ts:137,152` | `?token=` 泄入浏览器历史/日志 |
| P1 | 分享页 XSS | `index.ts:606` | `share.fileName` 未转义嵌入 HTML |
| P1 | CORS `origin: '*'` | `index.ts:107` | 任意站点可跨站请求 |
| P1 | SSRF 无防护 | `storage.ts:203` | `fetch(url)` 无白名单/校验 |

### ⚡ 性能基准师 — 内联检查

| 级别 | 问题 | 位置 | 说明 |
|:----:|:-----|:-----|:------|
| P1 | D1 全表扫描 | `metadata.ts` | 全部无 LIMIT 大表性能崩 |
| P2 | 子查询 O(n²) | `metadata.ts:161-170` | `(SELECT COUNT(*) FROM files WHERE folder_id = f.id)` |
| P2 | JS Bundle 238KB | `dist/assets/` | 含完整 React |
| P3 | Chunk size 跨文件常量 | `client.ts:3` / `storage.ts:6` | 重复定义 |

### 🎯 现实检验者 — 6.5/10

| 维度 | 评分 | 关键问题 |
|:-----|:----:|:---------|
| 整体交付质量 | 6/10 | 核心流程通但体验粗糙 |
| 安全性 | **4/10** | 密码明文 + URL token 致命 |
| 功能完整性 | 6/10 | 缺批量操作、分页、回收站 |
| 代码质量 | 7/10 | App.tsx 1100 行巨石需拆分 |

## 4️⃣ 修复优先级（P0→P1→P2→P3→P4）

### 🔴 P0 — 安全底线
- [ ] **P0-1** 密码明文存储 → 只保留 hash，删除明文 `password` 字段
- [ ] **P0-2** Token 移出 URL → 下载改用 Authorization header

### 🟠 P1 — 严重问题
- [ ] **P1-1** 分享页 fileName XSS → HTML 转义
- [ ] **P1-2** Topic 删除级联清理 folders 记录
- [ ] **P1-3** Topic rename/delete 检查 TG 响应失败时回滚
- [ ] **P1-4** D1 全部查询加 LIMIT/OFFSET 分页
- [ ] **P1-5** 迁移代码加事务保护（`ensureSchema`）

### 🟡 P2 — 一般问题
- [ ] **P2-1** 文件移动校验 folderId 属于同一 topic
- [ ] **P2-2** transferFromUrl 添加 chunk 上传重试
- [ ] **P2-3** 文件夹删除策略确定（递归删除 vs 提升）
- [ ] **P2-4** 分享 code 碰撞检测
- [ ] **P2-5** 文件夹列表子查询优化（`COUNT(*)` → 缓存或 JOIN）

### 🔵 P3 — 轻微问题
- [ ] **P3-1** 音频队列重建时保留当前播放位置
- [ ] **P3-2** 预览弹窗与播放栏双重音频冲突
- [ ] **P3-3** 面包屑导航加 loading 状态
- [ ] **P3-4** Chunk size 常量抽取到共享文件

## 5️⃣ Arena 决策状态

**当前状态**：⏳ 修复中
- ✅ 判别者已完成（功能 52/100 + 安全 + 性能 + 现实 6.5/10）
- ⏳ P0 修复中...
- ⬜ P1 修复中...
- ⬜ Arena 验证
