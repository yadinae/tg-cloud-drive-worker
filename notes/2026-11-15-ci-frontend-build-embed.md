# CI 加上前端构建和嵌入步骤

## 问题

CI 只做三件事：装 worker 依赖、跑测试、直接部署。部署的前端是仓库里提交的 `worker/src/frontend-assets.ts`（上次生成是 11-15 10:21，PR #3 时）。改了 `frontend/src` 却忘了在本地重新 build + embed 再提交，线上就会跑旧界面——PR #3 的眼睛图标修复就差点这样，全靠人记得。而本地 `deploy.sh` 本来就是 build → embed → deploy 三步，CI 缺了前两步，两条部署路径行为不一致。

## 权衡

- **方案 A（选了）：CI 自己 build + embed，部署永远用源码现 build 的产物。** 提交的 `frontend-assets.ts` 只留作本地 `wrangler dev` 的后备。好处是“忘了重新生成”这个失误不可能再发生；代价是 CI 多了 frontend `npm ci` + build 两步（本地实测 build 只要 0.35 秒，`npm ci` 是主要耗时）。
- **方案 B（没选）：CI 重新生成后比对 git diff，提交的 bundle 过期就失败。** 能守住“提交的 bundle 必须新鲜”，但每次改前端都要人记得重新生成提交，失败模式是红 CI 而不是直接修好；而且部署的仍是提交的文件。A 更彻底，所以选 A。
- **tsx**：`deploy.sh` 用 `npx tsx scripts/embed-assets.ts`，但 tsx 不在 worker 的依赖里，npx 每次都要现场从 registry 下载。把它加进 worker devDependencies（4.23.15），CI 和本地都从 `node_modules` 解析，版本固定。
- **Node 缓存**：`setup-node` 一步只能缓存一个 lockfile，frontend 的再加一步 `setup-node`（`cache-dependency-path: frontend/package-lock.json`）。
- **构建可复现性**：本地重新 build 产出的 JS 文件名哈希和提交的一致（`index-DAOwTq4v.js`），重新 embed 后 bundle 与提交的 diff 为空，说明现在提交的 bundle 是新鲜的，构建也是确定性的。

## 结论

- `deploy.yml` 在 `Run tests` 之后、`Deploy to Cloudflare Workers` 之前加四步：frontend 的 `setup-node`（缓存）、`npm ci`、`npm run build`（`NODE_OPTIONS` 与 `deploy.sh` 一致）、`npx tsx scripts/embed-assets.ts`。
- 本地按 CI 顺序完整模拟过：worker `npm ci` → 20 个测试全绿 → frontend `npm ci` → build 0.35 秒 → embed → bundle 与提交的一致 → `tsc` 通过。
- 注意：`deploy.yml` 本身这次又推不上去（GitHub App 没有 `workflows` 权限，推 workflow 文件报 403），需手动加上那四步再合 PR。
