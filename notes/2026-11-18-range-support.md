# 多块文件下载支持 Range（断点续传）

## 问题

OpenAPI 早就承诺三个下载端点（`/api/files/:id/download`、`/dl/:code/raw`、
`/dl/f/:code/raw/:fileId`）都支持 Range，返回 206。但实际上只有单块文件
能用——Range 透传给 Telegram，Telegram 回 206 就透传回去。多块文件
（>18MB 拆成多块存 Telegram 的大文件）带 Range 请求时，代码只打一条
`console.warn('Range requests not yet supported for multi-chunk files')`，
然后返回整个文件 200。下载器、视频播放器的断点续传和分块并行对大文件
全部无效。

## 权衡

- **方案 A（采用）：Worker 层按 manifest 切片。** 解析 Range 得到绝对字节
  区间，只从 Telegram 取区间覆盖到的块（并行最多 3 块，沿用现有模式），
  每块在内存里切出区间内那一段，按顺序流式写回，返回 206 +
  `Content-Range` + 精确 `Content-Length`。不动 Telegram 调用方式，
  不新增路由，不碰口令校验（Range 处理在 `downloadFileStream` 内，
  各端点原有的口令/会话校验都在调用它之前）。
- **方案 B（未采用）：把 Range 下推到每个块。** 每个块向 Telegram 各发
  自己的 Range，省了本地切片，但块边界对齐、某块失败重试、Telegram
  对超小 Range 的行为都要单独处理，复杂度高于收益。
- **多段 Range（`bytes=0-4, bytes=10-14`）：忽略，走 200 全文。** RFC 9110
  允许服务器忽略 Range；返回 416 会让某些下载器误判，200 是兼容性
  最好的选择。畸形 Range 同样忽略；语法合法但越界（起点 ≥ 文件大小、
  后缀 0、空文件）→ 416 + `Content-Range: bytes */<total>`。
- **单块文件：** Range 归一化为绝对边界再透传 Telegram（后缀、开区间
  形式先解析掉）；越界在本地直接 416，不用等 Telegram。Telegram 若
  忽略 Range 回 200，Worker 原样回 200 全文（RFC 允许）。
- **If-Range：不实现。** 本系统文件不可变（改动即重新上传成新 fileId），
  续传时内容不会变旧，没有实际影响。

## 结论

- 新增 `worker/src/range.ts`（纯函数 `parseRangeHeader`，单段解析、
  后缀/开区间、越界夹取），`downloadFileStream` 里多块路径按区间取块、
  切片、206 返回；单块路径传归一化 Range；三个端点的 OpenAPI 响应
  补上 416（206 早就写在 spec 里了，这次是代码兑现承诺）。
- 测试：新增 `worker/test/range.test.ts` 24 个用例（解析 8、多块公开
  分享 10、管理员下载 3、单块 3），mock Telegram 服务器扩展为按
  file_id 返回不同块内容、文件 GET 本身支持 Range。`npm test` 77/77
  通过（原 53 + 新 24），`tsc --noEmit` 通过。
- 遗留风险：manifest 里各块 size 之和与 D1 的 size 不一致时，切片
  边界可能错位（现有数据未见此情况）；Telegram 忽略 Range 时单块
  回 200 全文，客户端需按 200 处理（标准行为）。
