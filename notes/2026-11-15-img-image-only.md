# /img 外链限制为仅图片：非图片文件不再无口令可取

## 问题

`/img/:code/:fileId`（index.ts，约 1101 行）是 2026-07-31 笔记里记录的“有意公开的例外”：商品预览图热链，不校验分享口令，只校验文件属于该分享。但这个例外超出了原意：

- 处理器里没有任何口令校验，也没有任何 MIME 校验，只查 `fileOk`（文件属于该分享）就直接 `downloadFileStream` 流式返回。
- 约 1129 行的 Content-Type 分支是个空 `if`，什么都不拦——注释写着“Leave as-is”。
- fileId 是 D1 里连续的整数，可以枚举。

结论：**口令分享里的任何文件（PDF、ZIP、TXT……）只要知道分享 code，就能经 `/img` 无口令取回**，口令形同虚设。这是 raw 直链绕过的同类问题第三次出现（2026-07-31 单文件 raw、2026-11-15 文件夹 raw，这次是 `/img`）。

PR #8 的红线测试当时把 `/img` 断言为“有口令分享、不带口令仍 200”，用的是 `secret.txt`（文本文件）——也就是说测试本身把这个越界行为锁成了“符合预期”。用户在 2026-11-15 选了 A：把 `/img` 限制为仅图片。

## 权衡

- **方案 A（采用）：在流式传输之前按文件记录的 MIME/扩展名校验，仅图片放行，非图片 403。** 校验点放在 `downloadFileStream` 之前，非图片根本不触 Telegram。判定规则复用画廊已有的谓词：`mime_type` 以 `image/` 开头，或文件名以 `.png/.jpg/.jpeg/.gif/.webp/.bmp` 结尾（后者覆盖 MIME 未识别、存成 `application/octet-stream` 的图片）。限制与口令无关：公开分享的非图片经 `/img` 也 403——`/img` 本来就是图片外链端点，非图片有 `/dl/.../raw` 可走。
- **方案 B（用户未选）：接受现状。** 预览图热链不受影响，但口令分享的非图片文件继续无口令可取，等于口令只拦了 raw，没拦 `/img`。

## 结论

改动（PR #11，分支 `fix/img-image-only`）：

- `worker/src/index.ts`：`/img` 处理器在 `fileOk` 校验后、`downloadFileStream` 之前查 `getFile` 拿文件记录，按上述谓词判定；非图片返回 403 纯文本 `Forbidden`（与同接口 404 的纯文本风格一致，带 `Access-Control-Allow-Origin: *`）；同时删掉了原来那个空的 Content-Type `if` 分支。
- `worker/test/password-redline.test.ts`：`/img` 一节从 2 个用例扩到 6 个——图片文件（口令分享 `protfold/2`、公开分享 `openfold/2`）仍 200；非图片文件（口令单文件 `protfile/1`、口令文件夹 `protfold/1`、公开单文件 `openfile/1`）一律 403；不在分享里的文件仍 404。文件头注释同步更新（仅限图片）。
- 变异测试：删掉 `isImage` 校验后，恰好 3 个非图片用例失败、其余通过；恢复后全套 37/37 通过（原 33 + 新增 4），`tsc --noEmit` 干净。

## 备注

- `/img` 的公开属性本身没变：图片仍无口令可取（产品预览/外链需求），变的只是“什么算图片”。
- `getFile` 读的是 D1 文件表，与归属校验查的是同一来源，不存在口径不一致。
