# 补齐 OpenAPI 规范并挂载接口发现端点

## 问题

`worker/src/openapi.ts`（918 行）自写成就一直是死代码：`index.ts` 从未引用它，`GET /api` 与 `GET /api/openapi.json` 也不存在。更糟的是规范本身已经过时：主应用与 Agent API 合计 71 条路由，规范只覆盖了其中一部分，缺了配置、改密码、批量直传、批量删/移、全部文件夹分享接口、全部 17 条 Agent 接口和 4 个公开分享页；另有几处与实现不符（`/api/transfer` 响应写的是 `manifest`，实际返回 `{ fileId, fileName, size }`；`/api/folders/{id}` DELETE 写了不存在的 `topicId` 查询参数；`File`/`ShareLink` 结构缺了 `folderId`/`password`/`maxDownloads`）。

## 权衡

- **直接挂上去、标注缺口（选项 A）**：改动最小，但规范继续误导调用方，等于把已知错误上线。
- **先补齐再挂（选项 B，用户选的）**：一次把规范写对，之后调用方和 Agent 可以直接以 `GET /api` 发现接口；代价是一次性核对 71 条路由的实现。
- **删掉 openapi.ts（选项 C）**：彻底去掉维护负担，但 Agent 集成（Hermes）依赖这份发现能力，删了等于断了机器可读的入口。

挂载位置必须在 `app.use('/api/*', authMiddleware)` 之前，与公开的 `/api/health`、`/api/stats` 同列，否则发现接口本身也要登录，失去发现意义。`/api/agent/*` 用独立的 `AGENT_API_TOKEN` 鉴权（与会话 token 不同），规范里单独建 `AgentToken` 安全方案说明。

## 结论

- `openapi.ts` 按实现逐条补齐：`apiIndex` 与 `openApiSpec.paths` 各 71 条，与代码路由 1:1 对应；修正了上述全部过时项；新增 `FolderShare`、`Stats` 结构和 `AgentToken` 安全方案；`info.description` 注明 Agent 鉴权方式；`/img/:code/:fileId` 在规范里写明有意公开、不校验口令（与 2026-07-31 笔记一致）。
- `index.ts` 在鉴权中间件之前挂载 `GET /api`（`apiIndex`）与 `GET /api/openapi.json`（`openApiSpec`）；README 把“目前未挂载”改为已挂载。
- 验证：`npx tsc --noEmit` 通过；用 `tsx` 实际执行 `apiIndex`/`openApiSpec` 并序列化为 JSON，确认无运行时错误；另写一次性脚本逐条比对代码路由与规范，71/71 全覆盖、无多余。
- 遗留：用户已确认 LICENSE 用 MIT，随重建后的 PR 一并提交（见下）；规范今后新增路由时需同步更新，否则会再次漂移，CI 前端构建步骤那项仍待做。

## 重建（2026-11-15，历史清理后）

PR #6 的分支基于旧 main，而旧 main 的历史里含 11-07 笔记中的明文登录口令（见 `notes/2026-11-15-history-purge-plaintext-password.md`）。历史改写后 PR #6 作废，本次内容在重写后的 main（`84288310`）上原样重建为新 PR，并加入用户已确认的 MIT `LICENSE`；其余内容与验证结果不变。
