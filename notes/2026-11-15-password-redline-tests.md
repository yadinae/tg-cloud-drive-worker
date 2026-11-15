# 口令校验红线自动化测试

## 问题

分享口令（`hasPassword`）是一致付费内容的红线，但同一类 bug 出现过两次：2026-07-31 单文件 raw 直链绕过口令，2026-11-15 文件夹分享 raw 直链绕过口令。两次都是“页面加了校验、raw 直链漏掉”，靠人眼 review 拦不住，需要一个可执行的检查：任何能取回文件内容的端点都必须各自校验口令，漏掉任何一个，测试就红。

## 权衡

- **测试框架：Vitest + `@cloudflare/vitest-plugin`（workerd 真实环境）**，而不是在 Node 里直接测 Hono app + 自造 D1/KV 假对象。后者快，但假对象可能与真实 D1 行为脱节（比如 `listFilesInTree` 的递归 CTE）；前者用 Miniflare 的本地 D1/KV 实例，跑的是真实 SQL 和真实 workerd，代价是搭建时踩了一串坑（见结论）。
- **Telegram 用本地 mock 服务器**，站在 worker 本来就支持的 `TG_API_BASE_URL` 口子上（自建 Bot API 也走这个变量），不触网。本想用动态端口 + `provide`/`inject` 传端口，但 pool 在 globalSetup 之前就求值 options，`inject` 拿到的是 `undefined`，于是改固定端口 `127.0.0.1:18777`，端口被占会直接报错，不会静默测错。
- **包名迁移**：`@cloudflare/vitest-pool-workers` 已改名 `@cloudflare/vitest-plugin` 且不再更新，改用新包；新包的 `cloudflareTest` 是 Vite 插件形式（`plugins: [cloudflareTest(...)]`），不再是 `defineWorkersConfig`。另外 Vitest 4 删了 `test.poolOptions`，pool 选项改放顶层；`provide` 也不是从 `vitest` 导入，而是 globalSetup 收到的 project 实例上的方法（`project.provide(...)`）。
- **测试文件跑在 workerd 里**：`node:http` 的 `createServer` 和 `node:fs` 在 workerd 里都不存在，所以 mock 服务器必须由 globalSetup（Node 侧）启动，D1 建表 SQL 也不能读文件，内联在 `test/helpers.ts` 里（与 `worker/schema.sql` 保持同步，漂移了测试会直接报错）。
- **`/img/:code/:fileId` 例外**：有意公开（产品预览图/外链，见 2026-07-31 笔记），测试里明确断言它无口令仍返回图片，同时断言文件不在该分享里时仍 404——例外不绕过归属校验。
- **npm 安装**：npm 10.9.4 的 arborist 在解析 vitest 4 的 peer 依赖时会崩（`Cannot read properties of null (reading 'edgesOut')`），要用 `--legacy-peer-deps` 安装；vitest-plugin 依赖的 wrangler 4.162 又要求 `@cloudflare/workers-types` v5（peerOptional），把仓库的 workers-types 从 v4 升到 v5 后 `tsc` 仍通过，`npm ci` 也恢复正常。

## 结论

- 新增 `worker/test/password-redline.test.ts`，20 个用例，覆盖全部 6 个内容出口：单文件 raw、文件夹 raw、单文件分享页、文件夹分享页、文件夹画廊、`/img`（例外）、管理员下载。运行方式：`worker/` 目录下 `npm test`，约 1 秒。
- 变异测试验证过：临时删掉 `/dl/:code/raw` 的口令校验，恰好 2 个用例失败（无口令→403、错口令→403），其余 18 个仍通过；恢复后 20 个全绿。说明测试真的守住了红线，不是摆设。
- CI：`.github/workflows/deploy.yml` 准备在部署前加 `npm test` 一步，测试失败就不会部署。但这一步当时没能一起推上去：GitHub App 没有 `workflows` 权限，推 workflow 文件会报 403，只能手动改（在 `Install dependencies` 之后加三行：`Run tests` / `run: npm test` / `working-directory: worker`）。改完再合 PR，CI 才会真正跑起来。
- 搭建时最隐蔽的坑：Miniflare V4 配置里没有 `vars` 字段，写了会被静默丢掉（worker 的 `env` 里什么都没有），变量要写进 `bindings`。定位时用过临时 `/__debug-env` 路由，调完已删。
- 遗留：固定端口 18777 有极小概率与本机其他服务冲突，冲突时测试会直接报错，不会静默通过。
