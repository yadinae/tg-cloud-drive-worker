# 2026-11-07 · TG Cloud Drive Worker：手动清理孤儿文件按钮 + 前端 JSX/TS 修复上线

- **来源会话**：@session:default/20261107_191600_e90871
- **类型**：实现 / 踩坑排查 / 部署
- **涉及文件**：`frontend/src/App.tsx`、`frontend/tsconfig.json`、`frontend/src/api/client.ts`、`worker/src/shares.ts`、`worker/src/index.ts`、`worker/wrangler.toml`

## 问题

TG Cloud Drive Worker 需要：
1. 将原本计划的「每 6 小时自动清理孤儿分片上传」cron 改为**手动触发按钮**（避免误删进行中的上传、减少 Cron 槽位占用）。
2. 前端构建报错：`TS1382: Unexpected token. Did you mean '{'>'}' or '>'?` —— JSX 文本节点里的 `>` 需转义。
3. `tsconfig.json` 里 `"types": ["vite/client"]` 导致找不到类型定义（项目未安装 `@types/vite`）。
4. `worker/src/shares.ts` 的 `listAllShares`/`listAllFolderShares` 无分页上限，可能一次拉取过多 KV 记录。

## 权衡

| 方案 | 代价 | 结果 |
|---|---|---|
| 保留自动清理 cron（`0 */6 * * *`） | 占用 1 个 Cron 槽位（账号上限 5/5），误删风险需靠 `minAgeHours` 防护 | 弃用 |
| **新增 `/api/admin/cleanup-orphans` + 前端「🧹 Clean Orphans Now」红色按钮** | 需用户主动点击；Settings 页新增交互态（loading/success/error） | **采用** |
| JSX 里 `>2小时` 改为 `>2小时` | 最小改动，符合 JSX 规范 | **采用** |
| JSX 里 `>2小时` 改为 `{'>'}2小时` | 避免实体编码，保持源码可读 | **采用（最终方案）** |
| 移除 `tsconfig.json` 的 `vite/client` types | 失去 `import.meta.env` 类型提示；该项目未用 Vite env | **采用** |
| `listAllShares` 加 `limit` 参数（默认 100，KV 单次最多 1000） | 防止全量扫描把 KV 读爆；旧调用方默认不受影响 | **采用** |
| `listAllShares` 返回 `password: null`（不再回传明文密码） | 修复潜在泄露；前端原本也不显示密码 | **采用** |

## 结论

**已验证事实（生产环境 https://tg-cloud-drive-worker.yadinae.workers.dev）**：
- 登录密码 `tgdrive123`（SHA-256 存储）正常，签发 `sessionId` 可用于后续请求。
- `POST /api/admin/cleanup-orphans` 需 `X-Session-Id` 头，返回 `{ ok: true, totalDeleted: 0, totalFailed: 0, totalFound: 0, totalSkipped: 0, uploadIds: [] }`。
- 前端 `npm run build`（`npm ci` → `tsc -b` → `vite build`）成功，产物 `index-ZMD7q2cs.js` 已嵌入 `worker/src/frontend-assets.ts`。
- `wrangler deploy` 成功，Worker 版本已上线。
- 原自动清理 cron（`0 */6 * * *`）已清空，账号 Cron 槽位回收 1 个。

**遗留风险**：
1. 手动清理依赖用户记得点击；长期不清理会积累孤儿 chunks 占用 R2 存储。可考虑后台定期告警而非自动删。
2. `listAllShares` 仍按 `prefix` 扫描 KV，数据量极大时（>10 万条）仍有延迟；如需再优化可引入二级索引。
3. 前端 `cleanupOrphans(2)` 硬编码 2 小时阈值；如需可配置，可改为从 settings 读取。

**可复用规则**：
> **Cron 槽位是稀缺资源（免费 5/个账号），能用手动触发替代定时任务的场景，优先做手动按钮 + 后台告警，不要盲目占 cron。**
> **JSX 文本节点里的 `<` `>` `&` 必须转义或用 `{'>'}` 写法，否则 `tsc -b` 直接报 TS1382 阻断构建。**