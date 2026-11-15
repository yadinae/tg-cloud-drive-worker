# 口令存储加固：登录与分享口令改 PBKDF2，分享显示副本改 AES-GCM 加密

## 问题

口令存在两处明文/弱哈希问题：

- **登录口令**：D1 `settings` 表 `system.password_hash` 存的是无盐 SHA-256 hex（改密码接口也直接存这个）。拿到 D1 导出的人可以离线秒算常见口令，且所有用同一口令的地方哈希都一样。
- **分享口令**：KV 分享记录里同时存 `passwordHash`（无盐 SHA-256）和明文 `password`。明文是给管理后台眼睛图标显示用的（PR #2/#3 明确保留的功能）。无盐 SHA-256 的问题在这里更严重：分享口令基本是 6 位数字，全部 100 万种可能可以一次预计算出来，匹配任意 dumped 哈希；而且同一口令在所有分享里的哈希都相同，一眼就能看出哪些分享共用口令。

## 权衡

用户选了方案 B（两个一起加固），而不是只加固登录口令：

- **校验哈希改 PBKDF2-SHA256，加盐**（新模块 `worker/src/passwords.ts`）：登录和分享共用同一套 `hashPassword` / `verifyPasswordHash`，格式为 `pbkdf2-sha256$<次数>$<盐>$<哈希>`，次数存在哈希里，以后调高不影响旧哈希。旧的无盐 SHA-256 hex 仍能验证，验证成功时就地升级（登录时重写 settings 行，分享验证时搭下载次数那次 KV 写入一起改），不用用户重设口令。
- **迭代次数只取 5000**：实测约 5ms CPU 一次。分享验证每次下载都要跑一次，而免费版 CPU 预算是 10ms/请求——10 万次迭代（约 110ms）会直接打爆免费版的登录和下载。付费版可以调高 `PBKDF2_ITERATIONS`，旧哈希照样能验。诚实地说：对 6 位数字口令，迭代次数本来也不是主要防线（离线穷举 100 万种的成本主要看次数×候选数），盐（防预计算、去重）和限流（PR #10，防在线猜）才是；迭代次数是纵深防御。
- **分享显示副本改 AES-GCM 加密**：密钥来自新环境变量 `SHARE_PASSWORD_KEY`（base64url 的 16/24/32 字节随机值），每条记录随机 12 字节 IV，格式 `aesgcm$<iv>$<密文>`；读取时解密后返回，眼睛图标照常显示。密钥丢了只影响显示（解密失败返回 null），校验走哈希，不受影响。
- **无密钥时的行为是 fail-closed**：新分享不存显示副本（null），而不是悄悄回退到明文；旧分享的明文副本保持原样，直到下次验证成功/改口令时有密钥才重加密。密钥需要用户在部署后自己设（`node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put SHARE_PASSWORD_KEY`），命令已写进 README 和 PR 说明。
- **没动的东西**：`DRIVE_AUTH_TOKEN` 仍是明文环境密钥（Bearer 凭证，不是存口令的哈希，威胁模型不同）；Agent 的 `AGENT_API_TOKEN` 同理。

## 结论

改动（PR #12，分支 `fix/password-storage-hardening`）：

- 新增 `worker/src/passwords.ts`：`hashPassword`、`verifyPasswordHash`（接受 PBKDF2 与旧 SHA-256 hex，返回 `legacy` 标记）、`encryptSharePassword` / `decryptSharePassword` / `displaySharePassword` / `isEncryptedSharePassword`，以及 `sha256Hex`（仅用于旧格式验证）。
- `worker/src/index.ts`：`checkPassword` 改用新验证 + 登录成功时升级旧哈希（升级写失败也不影响登录）；改密码接口存 PBKDF2；settings 种子描述改成 PBKDF2-SHA256；删掉本地 `sha256`。
- `worker/src/shares.ts`：建分享/改口令时哈希改 PBKDF2、显示副本改加密存储；两次验证成功时就地升级；五个返回口令的地方（`getShare`、`listShares`、`listAllShares`、`getFolderShare`、`listAllFolderShares`）统一走 `displaySharePassword` 解密；删掉本地 `sha256`。
- `worker/src/types.ts`：`Env` 增加可选的 `SHARE_PASSWORD_KEY`；`worker/wrangler.toml` 与 `README.md` 增加该密钥的说明与生成命令。
- `worker/test/password-storage.test.ts`（16 个用例）：登录旧哈希升级、错口令不升级、新格式登录、改密码全流程；新建分享 KV 里是 PBKDF2 哈希 + AES-GCM 密文、管理列表解密显示；旧分享验证成功升级、失败不升级；文件夹分享同样升级；改分享口令后旧口令失效；升级后 raw 直链回归（正确 200、错误 403）；`passwords.ts` 单元测试（往返、旧格式、坏格式、错密钥/坏数据、无密钥行为）。
- `worker/vitest.config.ts`：测试绑定增加 `SHARE_PASSWORD_KEY`（仅测试用的固定密钥）。

验证：`tsc --noEmit` 干净；全套 53/53 通过（原 37 + 新增 16）。变异测试：删掉 `verifySharePassword` 里的升级块，恰好 1 个用例失败（旧分享验证升级）；恢复后全绿。

## 遗留

- 上线后用户需设 `SHARE_PASSWORD_KEY`，否则新分享的眼睛图标看不到口令（校验不受影响）。设好密钥后，旧分享的明文副本在下次验证成功或改口令时自动重加密；从不被验证的旧分享会一直保留明文副本——如需立刻清掉，可在设好密钥后改一次口令（或等后续批量迁移）。
- 6 位数字分享口令的离线穷举在 KV 泄露的前提下依然可行（PBKDF2 5000 次只是抬高成本），根本缓解是更长的分享口令或限流（在线已有限流）；本次不改口令长度（产品行为）。
