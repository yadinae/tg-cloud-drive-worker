# 分享列表眼睛图标只显示“hash only”，看不到真实口令

## 问题

管理后台分享链接列表里，带口令的分享点眼睛图标，只显示 `(hash only)`，看不到真实口令，点击复制也只能复制到空字符串。

## 权衡

- 前端 `frontend/src/App.tsx` 分享列表的眼睛按钮逻辑本身是对的：有 `share.password` 就显示并复制，没有就显示 `(hash only)`。问题不在前端。
- 列表数据来自 `GET /api/shares/list-all` 与 `GET /api/shares/folder/list-all`，后端 `listAllShares` / `listAllFolderShares` 在拼返回对象时把口令写死成 `password: null`，而按文件查的 `listShares` 与 `getShare` 返回的是明文口令。两处行为不一致，列表拿不到口令。
- 修复位置有两个选择：
  1. 直接把两个 list-all 函数改成始终返回明文口令 —— 改动最小，但 `GET /api/agent/shares` 也用这两个函数，会顺带把明文口令暴露给 Agent token 持有者；
  2. 给两个函数加 `includePassword` 开关，默认 false，只有管理后台列表路由传 true —— 多两行参数，但不扩大 Agent API 的暴露面。选了 2。

## 结论

- `worker/src/shares.ts`：`listAllShares` 与 `listAllFolderShares` 增加 `includePassword: boolean = false` 参数，仅为 true 时返回 `record.password`，否则仍为 null。
- `worker/src/index.ts`：两个管理后台列表路由（`GET /api/shares/list-all`、`GET /api/shares/folder/list-all`）传 `includePassword=true`。这两个路由在 `app.use('/api/*', authMiddleware)` 之后，仅登录管理员可调。
- Agent API（`GET /api/agent/shares`、`/stats`）保持默认，不返回明文口令。
- 前端不用改：`App.tsx` 已按 `share.password` 显示与复制，数据回来后眼睛图标直接显示真实口令。
- 验证：`npx tsc --noEmit` 通过。生产验证待合并部署后在后台列表点眼睛确认。
