---
name: doc2x-mcp
description: 使用 Doc2x MCP 工具完成文档解析与转换：对 PDF/扫描件/图片做 OCR 与版面解析，抽取文本/表格，导出为 Markdown/LaTeX(TeX)/DOCX 并下载落盘（submit/status/wait/export/download）。当用户提到 PDF/pdfs、scanned PDF、OCR、image-to-text、extract text/tables、表格抽取、文档转换/convert、导出/export、Markdown、LaTeX/TeX、DOCX、doc2x、doc2x-mcp、MCP 时使用。
---

# Doc2x MCP Tool-Use Skill (for LLM)

## 你要做什么

你是一个会调用 MCP tools 的助手。凡是涉及 PDF/图片的“解析/抽取/导出/下载”，必须通过 `doc2x-mcp` tools 执行真实操作：

- 不要臆测/伪造 `uid`、`url`、文件内容或导出结果
- 不要跳过工具步骤直接输出“看起来合理”的内容

## 全局约束（必须遵守）

1. 路径必须是绝对路径  
   `pdf_path` / `image_path` / `output_path` / `output_dir` 都应使用绝对路径；相对路径可能会被 server 以意外的 cwd 解析导致失败。

2. 扩展名约束  
   `doc2x_parse_pdf_submit.pdf_path` 必须以 `.pdf` 结尾；图片解析使用 `png/jpg`。

3. 不要并发重复提交导出  
   同一个 `uid` 对同一种导出配置（`to + formula_mode + formula_level (+ filename + filename_mode + merge_cross_page_forms...)`）不要并行重复 submit。

4. 不要泄露密钥  
   永远不要回显/记录 `DOC2X_API_KEY`。排错只用 `doc2x_debug_config` 的 `apiKeyLen/apiKeyPrefix/apiKeySource`。

5. 不要伪造下载 URL  
   下载必须使用 `doc2x_convert_export_*` 返回的 `url`；不要自己拼接。

6. 参数生效边界  
   `model` 仅用于 PDF 解析提交（默认 `v2`，可选 `v3-2026`）；`formula_level` 仅用于导出（`doc2x_convert_export_*`），并且只在源解析任务使用 `v3-2026` 时生效（`v2` 下无效）。

## 关键参数语义（避免误用）

- `doc2x_parse_pdf_submit` / `doc2x_parse_pdf_wait_text(pdf_path 提交分支)`  
  - 可选 `model: "v3-2026"`；不传则默认 `v2`。
- `doc2x_convert_export_submit` / `doc2x_convert_export_wait`  
  - `formula_mode`：`"normal"` 或 `"dollar"`（关键参数，建议总是显式传入）。  
  - `formula_level`：`0 | 1 | 2`（可选）  
    - `0`：不退化公式（保留原始 Markdown）
    - `1`：行内公式退化为普通文本（`\(...\)`、`$...$`）
    - `2`：行内 + 块级公式全部退化为普通文本（`\(...\)`、`$...$`、`\[...\]`、`$$...$$`）

## Tool 选择（按用户目标）

- **PDF 解析任务**：`doc2x_parse_pdf_submit` → `doc2x_parse_pdf_status`
- **少量预览/摘要**：`doc2x_parse_pdf_wait_text`（可能截断；要完整内容请导出文件）
- **导出文件（md/tex/docx）**：`doc2x_convert_export_submit` → `doc2x_convert_export_wait`（或直接 `doc2x_convert_export_wait` 走兼容模式一键导出）
- **下载落盘**：`doc2x_download_url_to_file`
- **图片版面解析**：`doc2x_parse_image_layout_sync` 或 `doc2x_parse_image_layout_submit` → `doc2x_parse_image_layout_wait_text`
- **解包资源 zip**：`doc2x_materialize_convert_zip`
- **配置排错**：`doc2x_debug_config`

## 标准工作流（照做）

### 工作流 A：批量 PDF → 导出文件（MD/TEX/DOCX，高效并行版）

适用于“多个 PDF 批量导出并落盘（.md / .tex / .docx）”。核心原则：

- `doc2x_parse_pdf_submit` 可并行（批量提交）
- `doc2x_parse_pdf_status` 可并行（批量轮询）
- **流水线式并行**：某个 `uid` 一旦解析成功，立刻开始该 `uid` 的导出+下载（不必等所有 PDF 都解析完）
- 不同 `uid` 的导出与下载可并行
- **同一个 `uid` 的同一种导出配置（`to + formula_mode + formula_level (+ filename + filename_mode + merge_cross_page_forms...)`）不要并行重复提交**
- 同一个 `uid` 若要导出多种格式（例如 md + docx + tex），建议**按格式串行**，但不同 `uid` 仍可并行

**批量提交解析任务（并行）**

- 对每个 `pdf_path` 调用：`doc2x_parse_pdf_submit({ pdf_path, model? })` → `{ uid }`

**等待解析完成（并行）**

- 对每个 `uid` 轮询：`doc2x_parse_pdf_status({ uid })` 直到 `status="success"`
- 若 `status="failed"`：汇报 `detail`，该文件停止后续步骤

**导出目标格式（并行，按 uid）**

推荐用 `doc2x_convert_export_wait` 走“兼容模式一键导出”（当你提供 `formula_mode` 且本进程未提交过该导出时，会自动 submit 一次，然后 wait），避免你手动拆成 submit+wait：

- DOCX：`doc2x_convert_export_wait({ uid, to: "docx", formula_mode: "normal", formula_level? })` → `{ status: "success", url }`
- Markdown：`doc2x_convert_export_wait({ uid, to: "md", formula_mode: "normal", formula_level?, filename?, filename_mode? })` → `{ status: "success", url }`
- LaTeX：`doc2x_convert_export_wait({ uid, to: "tex", formula_mode: "dollar", formula_level? })` → `{ status: "success", url }`

（或显式两步：`doc2x_convert_export_submit(...)` → `doc2x_convert_export_wait({ uid, to })`）

**补充建议**

- `formula_mode` 是关键参数：建议总是显式传入（`"normal"` / `"dollar"`，按用户偏好选择；常见：`md/docx` 用 `"normal"`、`tex` 用 `"dollar"`）
- 需要做公式退化时显式传 `formula_level`（`0/1/2`）；若不需要退化，建议显式传 `0`，避免调用端默认值歧义
- `filename`/`filename_mode` 主要用于 `md/tex`：传不带扩展名的 basename，并配合 `filename_mode: "auto"`（避免 `name.md.md` / `name.tex.tex`）
- 对同一个 `uid` 做多格式导出时，先确定顺序（例如先 md 再 docx），逐个完成再进行下一个格式

**批量下载（并行）**

- `doc2x_download_url_to_file({ url, output_path })` → `{ output_path, bytes_written }`
- `output_path` 必须为绝对路径，且每个文件应唯一（建议用原文件名 + 对应扩展名：`.md` / `.tex` / `.docx`）

**并发建议**

- 10 个 PDF 以内通常可以直接并行；更多文件建议分批/限流（避免触发超时/限流）

**向用户回报（按文件汇总）**

- 成功：列出每个输入文件对应的 `output_path` 与 `bytes_written`
- 失败：列出失败文件与错误原因（包含 `uid` 与 `detail`/错误码），并说明其余文件不受影响

### 工作流 B：PDF → Markdown 文件（推荐）

当用户目标是“拿到完整 Markdown / 落盘”，主链路应当是导出与下载，不要依赖 `doc2x_parse_pdf_wait_text`。

**提交解析任务**

- `doc2x_parse_pdf_submit({ pdf_path, model? })` → `{ uid }`

**等待解析完成**

- 轮询 `doc2x_parse_pdf_status({ uid })` 直到 `status="success"`（失败则带 `detail` 汇报）

**导出 Markdown**

- `doc2x_convert_export_wait({ uid, to: "md", formula_mode: "normal", formula_level?, filename?, filename_mode? })` → `{ status: "success", url }`

**下载落盘**

- `doc2x_download_url_to_file({ url, output_path })` → `{ output_path, bytes_written }`

**向用户回报**

- 回复用户：保存路径、文件大小、`uid`（必要时附上 `url`）

### 工作流 C：PDF → 文本预览（可控长度）

当用户只需要“摘要/少量预览”时才用：

- `doc2x_parse_pdf_wait_text({ pdf_path | uid, max_output_chars?, max_output_pages? })`

如果返回包含截断提示（`[doc2x-mcp] Output truncated ...`），应切换到“工作流 B”导出 md 获取完整内容。

### 工作流 D：PDF → LaTeX / DOCX

- LaTeX：把 `to` 设为 `"tex"`
- Word：把 `to` 设为 `"docx"`
- 调用链同“工作流 A / B”（先解析 → 再导出 → 再下载），仅替换 `to`（以及必要时调整 `formula_mode/formula_level/filename`）
- 注意：`doc2x_convert_export_submit.formula_mode` 必填（`"normal"` 或 `"dollar"`）；`formula_level` 可选（`0/1/2`）

### 工作流 E：图片 → Markdown（版面解析）

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
