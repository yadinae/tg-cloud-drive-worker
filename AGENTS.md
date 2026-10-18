# AGENTS.md — tg-cloud-drive-worker

TG Cloud Drive 的 Cloudflare Worker 后端：文件上传/分享/口令保护/商城对接
（`worker/src/index.ts`）。

> ⚠️ 仓库区分：本仓库是**后端 Worker**。另有一个 `yadinae/tg-cloud-drive`
> 是浏览器端前端 App（MTProto 直连下载），两者是不同代码库，不要搞混。
> 本机只有本仓库的工作副本。

## 笔记位置

本仓库的历史问答与决策记录在 `notes/` 目录：

- `notes/` — 每次重要问答沉淀一篇 `问题 / 权衡 / 结论` 摘要
- 文件命名：`notes/YYYY-MM-DD-<主题slug>.md`
- 索引：`notes/INDEX.md` 按时间倒序列出全部笔记

新会话开始前，如果任务与本项目相关，先读 `notes/INDEX.md`，
再按需读相关笔记，不要依赖模型内置记忆复述已有结论。

## 何时写一篇笔记

一次较长的技术问答结束时（涉及方案选型、踩坑排查、架构决策），
在 `notes/` 新增一篇摘要，正文三段式：

1. **问题** — 当时要解决什么，背景一句话
2. **权衡** — 考虑过的方案与各自的代价
3. **结论** — 最终怎么做、验证结果、遗留风险

结论必须写实际验证过的事实，不写推测。

## 鉴权红线（改动前必读）

分享口令（`hasPassword`）保护的是一致付费内容。**同一文件的每一个出口端点
都必须各自校验口令** —— 曾经因为给页面加了校验而漏掉 raw 直链，造成付费绕过。

新增任何能取回文件内容的路由时，先 grep `hasPassword` 看现有端点是怎么做的，
并把新路由一起纳入校验。图片预览类端点若有意公开，要在笔记里写明理由。

详见 `notes/2026-07-31-raw-endpoint-bypasses-password.md`。
凭证走 `~/.hermes/scripts/secrets.json` 集中读取，禁止硬编码 token。
