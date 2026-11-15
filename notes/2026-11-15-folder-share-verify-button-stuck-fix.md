# 文件夹分享页验证成功后确认按钮卡在“验证中...”

## 问题

文件夹分享页（`/dl/f/:code`）输入正确口令点确认后，确认按钮一直灰着显示“验证中...”，看起来像请求挂起，两个生产分享（`k5vdgdws`、`i9ctx9pc`）都复现。实际上验证接口已经返回成功，文件列表也已渲染，只是按钮状态没恢复，用户会误以为页面卡死。

根因在 `worker/src/index.ts` 文件夹分享页的 `verifyPassword` 成功分支：只调了 `showFiles(...)`，既没隐藏密码表单，也没恢复按钮。而同文件的单文件分享页 `verifyPassword` 成功时是隐藏 `pw-wrap` 的，文件夹页漏了这一步。错误口令分支和 `catch` 里都有恢复按钮的代码，只有成功分支缺失。

## 权衡

- 只恢复按钮（`btn.disabled=false; btn.textContent='确认'`）：改动同样小，但验证通过后密码框还留在文件列表上方，占地方且无意义。
- 隐藏整个密码表单（`pw-wrap`）：与单文件分享页的做法一致，验证通过后页面只剩文件列表，更干净。选这个，一行改动。

## 结论

文件夹页 `verifyPassword` 成功分支在 `showFiles(...)` 之后加一行：

```js
document.getElementById('pw-wrap').style.display='none';
```

`npx tsc --noEmit` 通过。改动在服务端渲染的页面模板里，不需要重新构建前端 bundle。生产验证待合并部署后，在 `i9ctx9pc` 上复测：输正确口令后密码框消失、文件列表正常显示。
