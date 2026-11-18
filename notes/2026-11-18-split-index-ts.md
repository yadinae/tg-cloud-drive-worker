# 拆分 worker/src/index.ts（1,790 行 → 87 行）

日期：2026-11-18

## 问题

`worker/src/index.ts` 长到 1,790 行，56 处路由注册，和 D1 自动迁移（`ensureSchema`）、
鉴权（`checkPassword` / `authMiddleware`）、分享页 HTML 模板（`sharePageHTML` /
`shareFolderPageHTML` / `galleryPageHTML` + 广告渲染）全挤在一个文件里。改一处路由要
在近两千行里翻找，`openapi.ts`（2,040 行）虽已独立，入口文件本身仍是单体。

## 权衡

- **方案 A：纯搬移，逐字切片**——每个 handler 原样移到新模块，注册顺序与原来完全一致，
  不改任何逻辑、不抽公共 helper。优点：零行为变化，现有 77 个测试就是回归网；
  缺点：`files.ts`（308 行）、`share-pages.ts`（542 行）内部仍偏大。
- **方案 B：拆分时顺手重构**——合并重复的口令校验、抽取通用 handler 包装。
  优点：代码更干净；缺点：任何一处语义漂移都可能动到口令红线（raw 直链、/img 图片限制
  都是曾出过绕过的敏感点），且无法用现有测试完全覆盖模板 HTML 的行为。
- **拆分粒度**：只拆 `index.ts` 本体。`openapi.ts` 已是独立模块且不在 `index.ts` 内，
  本次不动；D1 版本化迁移是另一项工作，也不顺带做。

结论是选 A。执行时用脚本逐行切片（`~/workspace/work/split_index.py`，在仓库外），
而不用手抄：脚本按行号切出 11 个片段，逐个包进 `register*Routes(app)`，
最后做覆盖检查——原文件 47–1790 行的每个非空行都在新文件里恰好出现一次。

## 结论

新结构（`worker/src/`）：

| 文件 | 行数 | 内容 |
|---|---|---|
| `index.ts` | 87 | 仅组装：CORS → 公开路由 → agent → 鉴权门 → 鉴权后路由 → 分享页路由 → 404/错误/定时任务 |
| `schema.ts` | 115 | `ensureSchema`（D1 自动迁移 v2/v3/v4） |
| `auth.ts` | 66 | `checkPassword` / `authMiddleware` |
| `share-pages.ts` | 542 | 广告配置与渲染、分享页/文件夹页/画廊页 HTML 模板 |
| `routes/public.ts` | 64 | 静态页、health、stats、分享校验、API 发现 |
| `routes/auth.ts` | 95 | 登录/登出/会话（公开）+ 改密码（鉴权后） |
| `routes/config.ts` | 61 | GET/PUT `/api/config` |
| `routes/topics.ts` | 133 | topics + folders |
| `routes/files.ts` | 308 | 文件上传/分块/直传/批量/下载 |
| `routes/shares.ts` | 81 | 文件分享 + 文件夹分享 |
| `routes/admin.ts` | 122 | 清理孤儿分块、迁移、同步话题、频道信息 |
| `routes/public-dl.ts` | 169 | `/dl/*`、`/img/*` 公开下载页 |

关键不变量：

- 注册顺序与原来完全一致，特别是 `app.use('/api/*', authMiddleware)` 的位置——
  它之前注册的公开路由（登录、health、分享校验、`/api` 发现）不受鉴权，
  之后注册的全部走鉴权；`/dl/*`、`/img/*` 不在 `/api/*` 下，位置不影响鉴权。
- `export default { fetch, scheduled }` 仍在 `index.ts`，`wrangler.toml` 的 `main`
  不用改；测试走 Miniflare + 该入口，不直接 import `index.ts`，拆分对测试无感。

验证（拆分后，main 基线同样通过）：`npx tsc --noEmit` 干净；
`npm test` 4 个文件 **77/77 通过**；覆盖检查 0 行丢失。

遗留风险 / 下一步：

- `files.ts` 308 行仍是最大路由文件，下一步可按上传 / 下载 / 批量再拆。
- `share-pages.ts` 542 行基本是 HTML 模板字符串，改动时注意转义（`esc`）别漏。
- `openapi.ts` 2,040 行未动，OpenAPI 规范与路由仍需人肉保持同步。
