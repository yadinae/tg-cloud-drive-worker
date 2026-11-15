# 2026-11-15 · 文件夹分享 raw 直链绕过分享口令

- **类型**：安全 / 踩坑
- **涉及文件**：`worker/src/index.ts`、`worker/src/shares.ts`、`README.md`、`worker/src/openapi.ts`、`worker/src/bot.ts`、`worker/wrangler.toml`
- **相关**：`notes/2026-07-31-raw-endpoint-bypasses-password.md`、`AGENTS.md` 鉴权红线

## 问题

`GET /dl/f/:code/raw/:fileId`（`worker/src/index.ts` 约 L1039，HEAD `f32b2b3`）只校验了分享存在（`getFolderShare`，含过期）与文件属于该分享的文件夹树，就直接 `downloadFileStream` 返回文件本体，没有校验分享口令。

与 2026-07-31 已修复的单文件 `/dl/:code/raw` 绕过完全同类：知道分享码 `code` 与文件 `id` 即可下载带口令文件夹里的任意文件，不走 `verifyFolderSharePassword`，也不计下载次数、不受 `maxDownloads` 限制。

复查时还发现同类缺口在调用方：文件夹分享页 `showFiles()` 拼的下载链接、画廊缩略图 `thumbUrl`、单文件分享页 `doDownload()` fetch 的 raw 链接，均不带口令参数。单文件 raw 服务端已有口令校验，但前端不带口令，带口令的单文件下载同样走不通。

## 权衡

| 方案 | 代价 | 结果 |
|---|---|---|
| 只在服务端 raw 端点加 `verifyFolderSharePassword`，调用方不动 | 合法用户下载/缩略图会 403，等于把功能修坏 | 弃用 |
| 服务端加校验 + 调用方透传口令（`?password=` / 画廊 `?pwd=`） | 口令出现在 URL 查询串，有日志/Referer 泄露面；与现有单文件 raw、画廊 `?pwd=` 做法一致，改动集中在 `index.ts` 一个文件 | **采用** |
| 改用短期会话/签名 URL 替代查询串口令 | 更干净，但要新增会话存储与过期逻辑，改动面大，不适合一次安全热修 | 暂缓，列入后续 |
| `/img/:code/:fileId` 一并加口令校验 | 会破坏商品预览图热链，笔记已明确其有意公开 | 不动，只在 README 注明有意公开 |

## 结论

已验证事实（本地工作副本，未推送、未部署）：

- 修复：`GET /dl/f/:code/raw/:fileId` 有口令时调 `verifyFolderSharePassword(code, ?password=, env)`，失败回 403 `Password required`；无口令分享不受影响。
- 调用方同步改动：文件夹分享页验证成功后把口令传给 `showFiles()`，下载链接带 `?password=`，画廊链接带 `?pwd=`；画廊路由把已验证的 `pwd` 透传给 `galleryPageHTML`，两处缩略图 `thumbUrl` 带 `?password=`；单文件分享页 `doDownload()` 用验证后保存的口令请求 raw。
- `npx tsc --noEmit` 在 `worker/` 通过（exit 0）。
- `grep -r "auth/verify"` 在仓库内已无结果；README 并发默认 2→5、文件上限 2GB→官方 Bot API 约 900MB（50×18MB）、`wrangler.toml` cron 已按 2026-11-07 结论移除（改手动清理），`openapi.ts` 的 `/api/auth/verify` 已替换为 login/logout/session。

遗留风险：

1. 口令仍走 URL 查询串，与现有设计一致但有泄露面；后续可改签名 URL。
2. 每次 raw 下载都会调一次 `verifyFolderSharePassword`，会自增一次下载次数；画廊浏览同样会自增，与现有画廊行为一致。
3. 生产验证待部署后做：带口令 / 不带口令 / 错口令三种情况测文件夹 raw 直链与画廊缩略图，无口令分享不受影响。
