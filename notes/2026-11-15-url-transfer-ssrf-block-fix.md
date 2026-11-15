# URL 直传加 SSRF 拦截（P1）

## 问题

`transferFileByUrl`（`worker/src/storage.ts`）对用户传入的 URL 直接 `fetch`，只限制大小（100MB）与超时（30 秒），没有协议白名单，也没有对内网、回环或云元数据地址的拦截，且 `fetch` 默认跟随重定向，重定向目标也不做二次校验。它在登录后的接口之后，风险因此受限，但在 Agent API（`/api/agent/transfer`、`/api/agent/transfer/batch`）里同样开放。已登录用户或持有 Agent 令牌者可以把 Worker 当作跳板去探测内网服务、读取云元数据端点（`169.254.169.254`），或经重定向把请求带进内网。

## 权衡

- 只在路由层校验一次：四个直传入口（网页单条、网页批量、Agent 单条、Agent 批量）都汇入 `transferFileByUrl`，在函数内统一拦截最省事，也不会漏掉某个入口。选了这条：拦截逻辑收进新模块 `worker/src/ssrf.ts`，`transferFileByUrl` 只把 `fetch` 换成 `fetchPublicUrl`。
- 域名解析怎么防重绑定：Workers 没有原生 DNS 接口，校验完域名再 `fetch` 存在解析结果被换掉的时间差。做法是经 DNS-over-HTTPS（`cloudflare-dns.com`）解析 A/AAAA 记录，筛掉私有地址后取第一个公网 IP，再用 `fetch` 的 `cf.resolveOverride` 把请求钉死在这个 IP 上（TLS 仍按原域名校验），重定向每跳都重新走一遍这套流程。代价是每次直传多两次 DoH 查询，DoH 失败时整个直传失败（fail closed）；这是有意为之，解析失败时宁可不传。
- 拦截范围：协议只放 `http:`/`https:`；拒绝 URL 里带 `user:pass@`；字面 IP 按 IANA 特殊地址表拦（`10/8`、`172.16/12`、`192.168/16`、`127/8`、`169.254/16`、`100.64/10`、文档网段、组播与保留段；IPv6 含 `::1`、链路本地、唯一本地、组播、`::ffff:` 映射与 `2002::/16` 6to4 内嵌的 IPv4）；`localhost` 与 `*.localhost` 直接拦；域名解析不到公网地址也拦。端口不限制——目标仍是公网 IP 时端口本身不构成 SSRF。
- 被拦的 URL 不重试：`fetchPublicUrl` 抛 `UrlBlockedError`，`transferFileByUrl` 的 3 次重试循环会直接放过它；单条直传（网页与 Agent）回 400 而不是 500，批量直传按原有格式在单条结果里记错误。

## 结论

新增 `worker/src/ssrf.ts`（`fetchPublicUrl`、`isPrivateIp`、`UrlBlockedError`），`storage.ts` 的直传改走它，`index.ts` 与 `agent-api.ts` 的单条直传对被拦 URL 回 400。`npx tsc --noEmit` 通过（含 `cf.resolveOverride` 的类型）。

验证（仓库无测试框架，用一次性脚本在 Node 下跑，未提交）：`isPrivateIp` 对 34 个应拦地址（含 `169.254.169.254`、`::ffff:192.168.1.1`、6to4 内嵌私网地址）与 14 个应放行地址（含 `8.8.8.8`、`2001:4860:4860::8888`、边界外的 `172.15.0.1`）全部正确；真实网络下 `https://example.com` 200、`httpbin.org/redirect/1` 跟随成功，`169.254.169.254`、`127.0.0.1`、`10.0.0.5`、ftp/file 协议、带凭证 URL、`localhost`、不可解析域名均被 `UrlBlockedError` 拦截；另用 mock fetch 证实 302 跳向私网 IP 时在发出请求前就被拦住。httpbin 自身也会拒绝对内网地址的重定向，那次“失败”来自 httpbin 的 403，不是本修复的问题。

遗留风险：DoH 解析与实际建连之间仍有理论上的重绑定窗口，但 `resolveOverride` 已把建连 IP 钉死，窗口只剩 DoH 答案本身被污染一种情形；Worker 内无法做更彻底的解析后直连。`scripts/sync-ads.py` 也会抓外部商城地址，但那是维护者本地运行的脚本，不走 Worker，不在本次范围。
