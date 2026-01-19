# Doc2x MCP Server

简体中文 | [English](./README_EN.md)

本项目提供一个基于 stdio 的 MCP Server，把 Doc2x v2 的 PDF/图片接口封装成语义化 tools。

## 1) 运行环境

- Node.js >= 18

## 2) 配置

通过环境变量配置：

- `DOC2X_API_KEY`：必填（形如 `sk-xxx`）
- `DOC2X_BASE_URL`：可选，默认 `https://v2.doc2x.noedgeai.com`
- `DOC2X_HTTP_TIMEOUT_MS`：可选，默认 `60000`
- `DOC2X_POLL_INTERVAL_MS`：可选，默认 `2000`
- `DOC2X_MAX_WAIT_MS`：可选，默认 `600000`
- `DOC2X_PARSE_PDF_MAX_OUTPUT_CHARS`：可选，默认 `5000`；限制 `doc2x_parse_pdf_wait_text` 返回文本的最大字符数，避免大模型上下文超限（设为 `0` 表示不限制）
- `DOC2X_PARSE_PDF_MAX_OUTPUT_PAGES`：可选，默认 `10`；限制 `doc2x_parse_pdf_wait_text` 合并的最大页数（设为 `0` 表示不限制）
- `DOC2X_DOWNLOAD_URL_ALLOWLIST`：可选，默认 `".amazonaws.com.cn,.aliyuncs.com,.noedgeai.com"`；设为 `*` 可允许任意 host（不推荐）

## 3) 启动

### 方式 A：通过 npx

```json
{
  "command": "npx",
  "args": ["-y", "@noedgeai-org/doc2x-mcp"],
  "env": {
    "DOC2X_API_KEY": "sk-xxx",
    "DOC2X_BASE_URL": "https://v2.doc2x.noedgeai.com"
  }
}
```

### 方式 B：本地源码运行

```bash
cd doc2x-mcp
npm install
npm run build
DOC2X_API_KEY=sk-xxx npm start
```

```json
{
  "command": "node",
  "args": ["<ABS_PATH>/doc2x-mcp/dist/index.js"],
  "env": {
    "DOC2X_API_KEY": "sk-xxx",
    "DOC2X_BASE_URL": "https://v2.doc2x.noedgeai.com"
  }
}
```

## 4) Tools

- `doc2x_parse_pdf_submit`
- `doc2x_parse_pdf_status`
- `doc2x_parse_pdf_wait_text`
- `doc2x_convert_export_submit`
- `doc2x_convert_export_result`
- `doc2x_convert_export_wait`
- `doc2x_download_url_to_file`
- `doc2x_parse_image_layout_sync`
- `doc2x_parse_image_layout_submit`
- `doc2x_parse_image_layout_status`
- `doc2x_parse_image_layout_wait_text`
- `doc2x_materialize_convert_zip`
- `doc2x_debug_config`

## 5) 协议

MIT License，详见 `LICENSE`。

## 6) 安装本仓库 Skill（可选）

用于给 Codex CLI / Claude Code 增加一个“教大模型如何使用 doc2x-mcp tools 的 Skill”（便于按固定工作流调用 tools、导出与下载、以及排错）。

不需要 clone 仓库的一键安装（推荐）：

```bash
curl -fsSL https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/fix/scripts/scripts/install-skill.sh | sh
```

重复执行同一条命令即可覆盖安装（默认会覆盖已存在目录）。

在本仓库源码目录安装：

```bash
npm run skill:install
```

默认安装到：

脚本默认安装到：

- Codex CLI：`~/.codex/skills/public/doc2x-mcp`（用 `CODEX_HOME` 覆盖）
- Claude Code：`~/.claude/skills/doc2x-mcp`（用 `CLAUDE_HOME` 覆盖）

说明：

- `--target auto`（默认）会同时安装到 Codex + Claude；如只想装其中一个，用 `--target codex|claude`。
- PowerShell 7+ 一键安装：`irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/fix/scripts/scripts/install-skill.ps1 | iex`
- Windows PowerShell 5.1 一键安装：`irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/fix/scripts/scripts/install-skill-winps.ps1 | iex`

覆盖安装目录示例：

- mac/linux：`CODEX_HOME=/custom/.codex curl -fsSL https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/fix/scripts/scripts/install-skill.sh | sh -s -- --target codex`
- Windows：`$env:CODEX_HOME="C:\\path\\.codex"; irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/fix/scripts/scripts/install-skill.ps1 | iex`
