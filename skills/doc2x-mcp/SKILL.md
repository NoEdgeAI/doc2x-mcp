---
name: doc2x-mcp
description: Doc2x MCP 工具调用指南：解析/转换/抽取 PDF 与图片（PDF→Markdown/LaTeX(TeX)/DOCX，图片→Markdown），支持 OCR/版面解析/表格与文本抽取，导出并下载文件（submit/status/wait/export/download）。当用户提到 PDF/pdfs、OCR、扫描件、截图、extract text/tables、表格抽取、文档转换、Markdown、LaTeX/TeX、DOCX、doc2x、doc2x-mcp、MCP 时使用。
---

# Doc2x MCP Tool-Use Skill (for LLM)

## 你要做什么

你是一个会调用 MCP tools 的助手。对 PDF/图片解析与导出相关需求，必须通过 `doc2x-mcp` tools 执行真实操作，不要臆测/伪造 `uid`、`url`、文件内容或导出结果。

## 全局约束（必须遵守）

1. 路径必须是绝对路径  
   `pdf_path` / `image_path` / `output_path` / `output_dir` 都应使用绝对路径；相对路径可能会被 server 以意外的 cwd 解析导致失败。

2. 扩展名约束  
   `doc2x_parse_pdf_submit.pdf_path` 必须以 `.pdf` 结尾；图片解析使用 `png/jpg`。

3. 不要并发重复提交导出  
   同一个 `uid + to + formula_mode (+ filename...)` 不要并发调用 `doc2x_convert_export_submit`。

4. 不要泄露密钥  
   永远不要回显/记录 `DOC2X_API_KEY`。排错只用 `doc2x_debug_config` 的 `apiKeyLen/apiKeyPrefix/apiKeySource`。

5. 不要伪造下载 URL  
   下载必须使用 `doc2x_convert_export_*` 返回的 `url`；不要自己拼接。

## Tool 选择（按用户目标）

- 拿到解析任务并自行控制轮询：`doc2x_parse_pdf_submit` → `doc2x_parse_pdf_status`
- 需要少量文本预览/摘要：`doc2x_parse_pdf_wait_text`（可能截断）
- 导出文件（md/tex/docx）：`doc2x_convert_export_submit` → `doc2x_convert_export_wait`
- 下载导出文件到本地：`doc2x_download_url_to_file`
- 图片版面解析：`doc2x_parse_image_layout_sync` 或 `doc2x_parse_image_layout_submit/status/wait_text`
- 解包资源 zip：`doc2x_materialize_convert_zip`
- 配置排错：`doc2x_debug_config`

## 标准工作流（照做）

### 工作流 A：PDF → Markdown 文件（推荐）

当用户目标是“拿到完整 Markdown / 落盘”，主链路应当是导出与下载，不要依赖 `doc2x_parse_pdf_wait_text`。

1. `doc2x_parse_pdf_submit({ pdf_path })` → `{ uid }`
2. 轮询 `doc2x_parse_pdf_status({ uid })` 直到 `status="success"`（失败则带 `detail` 汇报）
3. `doc2x_convert_export_submit({ uid, to: "md", formula_mode: "normal", filename? })`
4. `doc2x_convert_export_wait({ uid, to: "md" })` → `{ url }`
5. `doc2x_download_url_to_file({ url, output_path })` → `{ output_path, bytes_written }`
6. 回复用户：保存路径、文件大小、`uid`（必要时附上 `url`）

### 工作流 B：PDF → 文本预览（可控长度）

当用户只需要“摘要/少量预览”时才用：

- `doc2x_parse_pdf_wait_text({ pdf_path | uid, max_output_chars?, max_output_pages? })`

如果返回包含截断提示（`[doc2x-mcp] Output truncated ...`），应切换到“工作流 A”导出 md 获取完整内容。

### 工作流 C：PDF → LaTeX / DOCX

- LaTeX：把 `to` 设为 `"tex"`
- Word：把 `to` 设为 `"docx"`
- 调用链同“工作流 A”，仅替换 `to`
- 注意：`doc2x_convert_export_submit.formula_mode` 必填（`"normal"` 或 `"dollar"`）

### 工作流 D：图片 → Markdown（版面解析）

- 只要结果（同步）：`doc2x_parse_image_layout_sync({ image_path })`（返回原始 JSON，可能包含 `convert_zip`）
- 要首屏 markdown（异步）：`doc2x_parse_image_layout_submit({ image_path })` → `doc2x_parse_image_layout_wait_text({ uid })`

如果结果里有 `convert_zip`（base64）且用户希望落盘资源文件：

- `doc2x_materialize_convert_zip({ convert_zip_base64, output_dir })` → `{ output_dir, zip_path, extracted }`

## 失败与排错（你应当这样处理）

1. 鉴权/配置异常  
   先 `doc2x_debug_config()`，确认 `apiKeyLen > 0` 且 `baseUrl/httpTimeoutMs/pollIntervalMs/maxWaitMs` 合理。

2. 等待超时  
   建议用户调大 `DOC2X_MAX_WAIT_MS` 或按需调 `DOC2X_POLL_INTERVAL_MS`（不要过于频繁）。

3. 下载被阻止（安全策略）  
   `doc2x_download_url_to_file` 只允许 `https` 且要求 host 在 `DOC2X_DOWNLOAD_URL_ALLOWLIST` 内；被拦截时解释原因，并让用户选择“加 allowlist”或“保持默认安全策略”。

4. 用户给的是相对路径/不确定路径  
   要求用户提供绝对路径；不要猜。
