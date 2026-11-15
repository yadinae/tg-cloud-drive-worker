# 文件夹分享眼睛图标仍显示“hash only”（PR #2 只修好了一半）

## 问题

PR #2 合并部署后，文件分享的眼睛图标能显示真实口令了，但文件夹分享点眼睛图标还是显示 `(hash only)`。

## 权衡

- 后端已经没问题：PR #2 让 `GET /api/shares/folder/list-all` 返回明文口令（`includePassword=true`），且部署成功。
- 问题在前端 `frontend/src/App.tsx` 的 `loadShares`：文件分享用 `{...s, _type: 'file'}` 展开，字段全保留；文件夹分享为了统一显示走白名单映射，只复制了 code、fileName、fileSize、hasPassword、expiresAt、downloadCount、createdAt、`_type`，漏了 `password`。后端给回来也被前端丢掉了，所以眼睛按钮读到空口令，只能显示 `(hash only)`。
- 文件夹分享弹窗（FolderShareManager）里是直接存原始返回的，没有映射，所以不受影响；只有统一的分享链接列表有这个问题。

## 结论

- `frontend/src/App.tsx`：文件夹映射里补上 `password: fs.password || null`，并加注释提醒这是白名单映射，新增字段要显式加上。
- 前端改动必须重新打包并生成 `worker/src/frontend-assets.ts` 一起提交：CI 的部署流程没有前端构建与嵌入步骤，只部署仓库里已提交的 bundle，不重新生成就上不了线。这次本地 `npm run build`（tsc -b + vite）与 `npx tsx scripts/embed-assets.ts` 均已执行，bundle 里 `password` 出现次数由 25 变为 27，与新增映射一致。
- 验证：前端构建通过，`npx tsc --noEmit`（worker）通过。生产验证待合并部署后在后台分享列表点文件夹分享的眼睛图标确认。
