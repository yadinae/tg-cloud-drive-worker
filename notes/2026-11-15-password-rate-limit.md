# 口令猜测加 IP 限流

## 问题

登录和分享口令端点完全没有限流，任何人可以无限制猜口令。分享口令是 6 位数字（100 万空间），登录口令是管理员的唯一凭证——一台机器不停试，迟早能试出来。此前的安全报告和路线图都把这项列为“立即（安全）”之后的第一批工作。

## 权衡

- **存哪**：用现有的 SHARES KV，加 `rl:` 前缀，不用新绑定。固定窗口计数器，值是 `{count, expiresAt}`，TTL = 窗口。没用 Durable Object（原子计数）：KV 读后写有竞态，并发下计数可能超一点，但限流是软上限，可以接受；DO 要多一个绑定，收益不大。
- **桶怎么分**：登录按 IP（5 次 / 15 分钟）；分享按 IP + 分享 code（10 次 / 10 分钟）。按 code 分桶是不让一个分享的攻击影响其他分享的正常用户。全局按 code 限流（不分 IP）会让攻击者能锁死正常用户，属于拒绝服务，没选。
- **只计失败**：空口令不计——不带口令的请求不是猜测，计了会让攻击者用空请求耗尽别人的桶；正确口令清桶——输错几次再输对不该被锁。
- **覆盖面**：6 个猜测口——登录、两个 POST verify、两个 raw 直链、画廊。raw/画廊和 POST verify 共用同一个桶（一次猜测不管走哪个口子都算一次）。限流放在 `verifySharePassword` / `verifyFolderSharePassword` 两个函数里，一次改动覆盖全部 5 个分享口子；登录单独在 handler 里做。
- **429**：返回 429 + `Retry-After`；画廊是页面导航，返回 429 HTML 页。
- **没做的**：Agent API 的 Bearer token 猜测不在这次范围（token 是长随机串，暴力不可行）；Cloudflare 面板里的 WAF 限流规则是另一条路，没选是因为代码里的限流可测试、跟着仓库走。

## 结论

- 新增 `worker/src/rate-limit.ts`：固定窗口计数器（KV）、`getClientIp`（`CF-Connecting-IP` 优先，其次 `X-Forwarded-For`）、`checkRateLimit` / `recordFailedAttempt` / `clearRateLimit`；`now` 可注入，方便测试快进时间。
- `verifySharePassword` / `verifyFolderSharePassword` 加 `clientIp` 参数，超限返回 `rateLimited` + `retryAfterSeconds`，各调用点（POST verify、两个 raw、画廊）映射成 429；登录在 handler 里单独做。
- 13 个新测试（`worker/test/rate-limit.test.ts`）：9 个集成（Miniflare 真实 KV：登录 5 次后 429、分享 10 次后 429、跨口子共用桶、按 IP 按 code 隔离、成功清桶、空口令不计）+ 4 个单元（假 KV + 可控时钟：窗口过期恢复、固定窗口不延长、Retry-After 计算、`getClientIp`）。
- 变异测试：临时删掉登录限流检查，恰好 3 个登录测试失败，其余 10 个仍通过；恢复后 33 个测试全绿（20 个红线 + 13 个限流），`tsc` 通过。
- 阈值：登录 5 次 / 15 分钟，分享 10 次 / 10 分钟（每 IP 每分享）。数字可以在 `rate-limit.ts` 顶部的常量里调。
- 已知局限：KV 读后写不是原子的，并发下计数可能略超；分布式攻击（很多 IP 各试几次）IP 限流拦不住——这是 IP 限流本身的边界，不是实现问题。
