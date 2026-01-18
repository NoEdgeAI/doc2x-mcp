# Doc2x MCP Server

English | [简体中文](./README.md)

This project provides a stdio-based MCP Server that wraps Doc2x v2 PDF/image APIs into semantic tools.

## 1) Requirements

- Node.js >= 18

## 2) Configuration

Configure via environment variables:

- `DOC2X_API_KEY`: required (e.g. `sk-xxx`)
- `DOC2X_BASE_URL`: optional, default `https://v2.doc2x.noedgeai.com`
- `DOC2X_HTTP_TIMEOUT_MS`: optional, default `60000`
- `DOC2X_POLL_INTERVAL_MS`: optional, default `2000`
- `DOC2X_MAX_WAIT_MS`: optional, default `600000`
- `DOC2X_PARSE_PDF_MAX_OUTPUT_CHARS`: optional, default `5000`; limit the returned text size of `doc2x_parse_pdf_wait_text` (set `0` for unlimited)
- `DOC2X_PARSE_PDF_MAX_OUTPUT_PAGES`: optional, default `10`; limit merged pages of `doc2x_parse_pdf_wait_text` (set `0` for unlimited)
- `DOC2X_DOWNLOAD_URL_ALLOWLIST`: optional, default `".amazonaws.com.cn,.aliyuncs.com,.noedgeai.com"`; set to `*` to allow any host (not recommended)

## 3) Run

### Option A: via npx

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

### Option B: run from source

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

## 5) License

MIT License. See `LICENSE`.

## 6) Install Repo Skill (Optional)

Installs a tool-use skill for Codex CLI / Claude Code (teaches the LLM how to use doc2x-mcp tools with a standard workflow: submit/status/wait/export/download).

One-command install without cloning (recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.sh | sh
```

Overwrite reinstall:

```bash
curl -fsSL https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.sh | sh -s -- --force
```

Install from this repo source directory:

```bash
npm run skill:install
```

Default destination:

The script installs to:

- Codex CLI: `~/.codex/skills/public/doc2x-mcp` (override via `CODEX_HOME`)
- Claude Code: `~/.claude/skills/doc2x-mcp` (override via `CLAUDE_HOME`)

Notes:

- `--target auto` (default) installs to both Codex + Claude; use `--target codex|claude` to install only one.
- Windows PowerShell one-command install: `irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.ps1 | iex`

Override install dir examples:

- mac/linux: `CODEX_HOME=/custom/.codex curl -fsSL https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.sh | sh -s -- --target codex`
- Windows: `$env:CODEX_HOME="C:\\path\\.codex"; irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.ps1 | iex`
