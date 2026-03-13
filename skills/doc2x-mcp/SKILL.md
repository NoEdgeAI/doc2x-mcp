---
name: doc2x-mcp
description: 使用 Doc2x MCP 工具处理 PDF、扫描件和图片：提交解析、查询状态、等待文本、导出 Markdown/LaTeX/DOCX、下载落盘，以及将 PDF v3 layout 结果写为本地 JSON。用户提到 PDF、OCR、scan/scanned PDF、image-to-text、extract text/tables、表格抽取、layout、Markdown、LaTeX/TeX、DOCX、doc2x、doc2x-mcp、MCP、figure/table crop、v3 JSON 时使用。
---

# Doc2x MCP

## 目的

凡是“解析 PDF/图片、抽取文本/表格、导出文档、下载结果、获取 v3 layout JSON”的请求，都应通过 `doc2x-mcp` tools 执行真实操作，不要臆造 `uid`、`url`、文件内容或导出结果。

## 必须遵守

1. 所有文件路径都用绝对路径：`pdf_path`、`image_path`、`output_path`、`output_dir`。
2. 不要伪造下载 URL；只能使用 `doc2x_convert_export_*` 返回的 `url`。
3. 同一个 `uid` 的同一组导出参数不要并发重复提交。
4. 同一个 `uid` 做多档导出对比时，必须按“导出成功 -> 立即下载 -> 再导出下一档”执行，避免结果覆盖。
5. 不要回显 `DOC2X_API_KEY`；排错只用 `doc2x_debug_config` 的摘要信息。
6. `model` 只用于 PDF 解析提交；`formula_level` 只用于导出，且仅在源解析为 `v3-2026` 时有效。
7. `doc2x_parse_pdf_wait_text` 只适合预览或摘要；需要完整结果时优先导出文件。
8. 需要 PDF v3 block/layout 坐标时，不要从文本结果推断，直接使用 `doc2x_materialize_pdf_layout_json`。

## 参数边界

- PDF 解析：`doc2x_parse_pdf_submit` 和 `doc2x_parse_pdf_wait_text(pdf_path 分支)` 可传 `model: "v2" | "v3-2026"`；不传默认 `v2`。
- PDF layout JSON：`doc2x_materialize_pdf_layout_json` 在 `pdf_path` 分支默认使用 `v3-2026`，并要求返回结果包含 `pages[].layout`。
- 导出：`formula_mode` 建议总是显式传入。
- `formula_level` 必须传数字 `0 | 1 | 2`，不要传字符串。
- 图片解析路径只接受 `png/jpg/jpeg`；PDF 路径必须以 `.pdf` 结尾；layout JSON 输出路径应以 `.json` 结尾。

## 按目标选 Tool

- 提交 PDF 解析：`doc2x_parse_pdf_submit`
- 查看 PDF 状态：`doc2x_parse_pdf_status`
- 取 PDF 文本预览：`doc2x_parse_pdf_wait_text`
- 导出 PDF 为 `md/tex/docx`：`doc2x_convert_export_wait`
- 下载导出文件：`doc2x_download_url_to_file`
- 落盘 PDF v3 layout JSON：`doc2x_materialize_pdf_layout_json`
- 图片版面解析原始结果：`doc2x_parse_image_layout_sync`
- 图片版面解析并等待首屏 Markdown：`doc2x_parse_image_layout_submit` -> `doc2x_parse_image_layout_wait_text`
- 落盘 `convert_zip`：`doc2x_materialize_convert_zip`
- 配置排错：`doc2x_debug_config`

## 标准流程

### 1. PDF -> 完整文件

当用户要完整 Markdown / TeX / DOCX，本流程优先：

1. `doc2x_parse_pdf_submit({ pdf_path, model? })`
2. 轮询 `doc2x_parse_pdf_status({ uid })` 直到成功
3. `doc2x_convert_export_wait({ uid, to, formula_mode, formula_level?, filename?, filename_mode? })`
4. `doc2x_download_url_to_file({ url, output_path })`

说明：

- `md/docx` 常用 `formula_mode: "normal"`
- `tex` 常用 `formula_mode: "dollar"`
- 需要完整内容时，不要用 `doc2x_parse_pdf_wait_text` 代替导出

### 2. PDF -> 文本预览

仅在用户要快速预览、摘要、少量文本时使用：

- `doc2x_parse_pdf_wait_text({ pdf_path | uid, max_output_chars?, max_output_pages?, model? })`

若出现截断提示，应切回“PDF -> 完整文件”流程。

### 3. PDF -> v3 layout JSON

当用户要 figure/table 坐标、block bbox、layout blocks、后续裁剪脚本输入时使用：

- 优先：`doc2x_materialize_pdf_layout_json({ uid | pdf_path, output_path, model? })`

要向用户说明 `layout` 的用途：

- `Markdown/text` 适合阅读正文；`layout` 适合程序继续处理页面结构
- `layout.blocks[].bbox` 可用于 figure/table 裁剪、区域截图、框选高亮、可视化调试
- `layout.blocks[].type` 可用于区分标题、正文、表格、图片等块，做结构化抽取
- `layout` 适合作为后续脚本输入，例如 figure/table crop、block 对齐、版面分析
- 如果用户只想“看内容”，优先给 Markdown / DOCX；如果用户要“知道内容在页面哪里”，就用 `layout`

行为要求：

- 走 `pdf_path` 分支时，默认使用 `v3-2026`
- 输出的是原始 parse `result` JSON，而不是精简文本
- 若返回结果缺少 `pages[].layout`，应视为失败而不是静默降级

### 4. 图片 -> 版面结果

- 直接拿原始结果：`doc2x_parse_image_layout_sync({ image_path })`
- 等待并取首屏 Markdown：`doc2x_parse_image_layout_submit({ image_path })` -> `doc2x_parse_image_layout_wait_text({ uid })`
- 结果包含 `convert_zip` 且用户要资源落盘时：`doc2x_materialize_convert_zip({ convert_zip_base64, output_dir })`

### 5. 批量 PDF

批量场景采用流水线，不要全串行：

1. 多个 `pdf_path` 可并行 `doc2x_parse_pdf_submit`
2. 多个 `uid` 可并行 `doc2x_parse_pdf_status`
3. 某个 `uid` 一旦 parse 成功，立即开始它自己的导出和下载
4. 不同 `uid` 可并行导出
5. 同一个 `uid` 的同一种导出配置不要并发

## 向用户回报

- 成功时报告：输入文件、`uid`、输出路径、必要时 `bytes_written`
- 失败时报告：错误码、错误消息、相关 `uid`，并指出哪些文件未受影响
- 当用户目标是“本地文件”时，优先回报落盘结果，不要只贴长文本

## 常见错误处理

1. 缺参数或路径不合法：提示用户提供绝对路径，不要猜测相对路径。
2. 等待超时：说明可调大 `DOC2X_MAX_WAIT_MS` 或适度调整轮询间隔。
3. 下载被策略拦截：解释是 `DOC2X_DOWNLOAD_URL_ALLOWLIST` 限制，不要绕过。
4. 认证或配置问题：调用 `doc2x_debug_config`，只汇报 `apiKeySource/apiKeyPrefix/apiKeyLen` 等摘要。
