# Doc2x MCP Server

[![CI](https://github.com/NoEdgeAI/doc2x-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/NoEdgeAI/doc2x-mcp/actions/workflows/ci.yml)
[![Publish](https://github.com/NoEdgeAI/doc2x-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/NoEdgeAI/doc2x-mcp/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/%40noedgeai-org%2Fdoc2x-mcp)](https://www.npmjs.com/package/@noedgeai-org/doc2x-mcp)

English | [简体中文](./README.md)

A stdio-based MCP Server that wraps Doc2x v2 PDF/image capabilities into stable, composable semantic tools.

## Table of Contents

- [Project Scope](#project-scope)
- [Runtime Quick Facts](#runtime-quick-facts)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [Tool API Overview](#tool-api-overview)
- [Common Workflows](#common-workflows)
- [Local Development](#local-development)
- [CI / Release Pipelines](#ci--release-pipelines)
- [Publishing Flow](#publishing-flow)
- [Install Repo Skill (Optional)](#install-repo-skill-optional)
- [Security and Troubleshooting](#security-and-troubleshooting)
- [Getting Help](#getting-help)
- [License](#license)

## Project Scope

- Exposes Doc2x capabilities to MCP clients (Codex CLI / Claude Code / custom agents).
- Uses a unified async contract (`submit/status/wait`) for predictable automation.
- Provides runtime safety boundaries (timeouts, polling controls, download allowlist).

## Runtime Quick Facts

- Local run: Node.js `>=18` is enough.
- CI checks: builds run on Node.js `18` and `20`.
- Release environment: publish jobs run on Node.js `24` in GitHub Actions.
- Package manager: pnpm with lockfile `pnpm-lock.yaml`.

## Quick Start

### Option A: via npx (recommended)

Add this in your MCP client config:

```json
{
  "command": "npx",
  "args": ["-y", "@noedgeai-org/doc2x-mcp@latest"],
  "env": {
    "DOC2X_API_KEY": "sk-xxx",
    "DOC2X_BASE_URL": "https://v2.doc2x.noedgeai.com"
  }
}
```

### Option B: run from source

```bash
cd doc2x-mcp
pnpm install --frozen-lockfile
pnpm run build
DOC2X_API_KEY=sk-xxx pnpm start
```

Point MCP client to your local build output:

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

## Configuration Reference

| Environment Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DOC2X_API_KEY` | Yes | - | Doc2x API key (`sk-xxx`) |
| `DOC2X_BASE_URL` | No | `https://v2.doc2x.noedgeai.com` | Doc2x API base URL |
| `DOC2X_HTTP_TIMEOUT_MS` | No | `60000` | Per-request HTTP timeout in ms |
| `DOC2X_POLL_INTERVAL_MS` | No | `2000` | Polling interval in ms |
| `DOC2X_MAX_WAIT_MS` | No | `600000` | Max wait duration for wait tools in ms |
| `DOC2X_PARSE_PDF_MAX_OUTPUT_CHARS` | No | `5000` | Max returned chars for `doc2x_parse_pdf_wait_text`; `0` = unlimited |
| `DOC2X_PARSE_PDF_MAX_OUTPUT_PAGES` | No | `10` | Max merged pages for `doc2x_parse_pdf_wait_text`; `0` = unlimited |
| `DOC2X_DOWNLOAD_URL_ALLOWLIST` | No | `.amazonaws.com.cn,.aliyuncs.com,.noedgeai.com` | URL host allowlist for downloads; `*` allows any host (not recommended) |

## Tool API Overview

| Stage | Tools | Purpose |
| --- | --- | --- |
| PDF parse | `doc2x_parse_pdf_submit` / `doc2x_parse_pdf_status` / `doc2x_parse_pdf_wait_text` / `doc2x_materialize_pdf_layout_json` | Submit parse tasks, check status, wait and fetch text, or materialize v3 layout JSON locally |
| Export | `doc2x_convert_export_submit` / `doc2x_convert_export_result` / `doc2x_convert_export_wait` | Start export, read export result, wait for completion |
| Download | `doc2x_download_url_to_file` / `doc2x_materialize_convert_zip` | Download export URL to local path, materialize convert zip |
| Image layout parse | `doc2x_parse_image_layout_sync` / `doc2x_parse_image_layout_submit` / `doc2x_parse_image_layout_status` / `doc2x_parse_image_layout_wait_text` | Sync/async OCR and layout parse for images |
| Diagnostics | `doc2x_debug_config` | Show resolved config and API key source |

### PDF Parse Model (`doc2x_parse_pdf_submit` / `doc2x_parse_pdf_wait_text`)

- Optional parameter: `model`
- Supported value: `v3-2026` (latest model)
- Default (when omitted): `v2`

```json
{
  "model": "v3-2026"
}
```

### PDF Layout JSON Materialization (`doc2x_materialize_pdf_layout_json`)

- Required: `output_path`
- Provide either `uid` or `pdf_path`
- `v2` does not support `layout`; use `v3-2026` when `pages[].layout` is required
- When `pdf_path` is used and `model` is omitted, this tool defaults to `v3-2026`
- On success it writes the raw parse `result` JSON locally

`layout` contains page block structure and coordinates, which is useful for figure/table crops, region highlighting, structured extraction, and layout analysis. If the goal is readable full text, prefer Markdown / DOCX export.

```json
{
  "pdf_path": "/absolute/path/to/input.pdf",
  "output_path": "/absolute/path/to/input_v3.layout.json"
}
```

### Export Formula Parameters (`doc2x_convert_export_submit` / `doc2x_convert_export_wait`)

- Required: `formula_mode` (`normal` / `dollar`)
- Optional: `formula_level` (effective only when source parse used `model=v3-2026`)
- Value mapping:
  - `0`: keep formulas
  - `1`: degrade inline formulas (`\\(...\\)`, `$...$`)
  - `2`: degrade all formulas (`\\(...\\)`, `$...$`, `\\[...\\]`, `$$...$$`)

## Common Workflows

### Workflow 1: PDF -> Markdown local file

1. Submit parse via `doc2x_parse_pdf_submit`.
2. Wait export via `doc2x_convert_export_wait` (`to=md` and `formula_mode` required).
3. Read result URL via `doc2x_convert_export_result`.
4. Download to local path via `doc2x_download_url_to_file`.

### Workflow 2: Fast image OCR/layout result

1. Use `doc2x_parse_image_layout_sync` for direct parse.
2. For robust polling behavior, switch to submit/status/wait flow.

### Workflow 3: PDF -> local v3 layout JSON

1. Call `doc2x_materialize_pdf_layout_json` with `pdf_path` and `output_path`.
2. The tool waits for parse success and writes the raw `result` JSON locally.
3. The saved JSON can be consumed directly by downstream figure/table crop scripts.

## Local Development

### Requirements

- Node.js `>=18`
- pnpm (aligned with lockfile)

### Common commands

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run test
pnpm run format:check
```

Run server:

```bash
DOC2X_API_KEY=sk-xxx pnpm start
```

## CI / Release Pipelines

This repository uses GitHub Actions:

- CI: `.github/workflows/ci.yml`
  - Triggers: `push` to `main`, `pull_request`, `workflow_dispatch`, weekly on Monday at UTC `03:17`
  - Doc-only changes (`**/*.md`, `LICENSE`) are skipped
  - Jobs:
    - `dependency-review` (PR only)
    - `build` (Node.js `18/20` matrix)
    - `package-smoke` (`npm pack --dry-run`)
    - `security-audit` (manual/scheduled only)

- Publish: `.github/workflows/publish.yml`
  - Push to `dev`: publish npm package with `dev` tag
  - Push tag `v*.*.*`: publish npm package as `latest`
  - Verifies tag version matches `package.json` version before publish
  - Publish command: `npm publish --provenance`

Recommended local parity checks before pushing:

```bash
pnpm install --frozen-lockfile
pnpm run build
npm pack --dry-run
pnpm audit --prod --audit-level high
```

## Publishing Flow

- Dev pre-release (`dev`): push to `dev` branch to publish npm `dev` tag. Version is auto rewritten to `x.y.z-dev.<run>.<attempt>`.
- Production release (`latest`): push `v*.*.*` tag to publish npm `latest`. Tag version must match `package.json`.

## Install Repo Skill (Optional)

Installs a reusable skill for Codex CLI / Claude Code to guide tool usage with the standard `submit/status/wait/export/download` workflow.

One-command install without cloning (recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.sh | sh
```

Install from this repo source directory:

```bash
pnpm run skill:install
```

Default destinations:

- Codex CLI: `~/.codex/skills/public/doc2x-mcp` (override with `CODEX_HOME`)
- Claude Code: `~/.claude/skills/doc2x-mcp` (override with `CLAUDE_HOME`)

Notes:

- `--target auto` (default) installs to both Codex + Claude.
- PowerShell 7+: `irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.ps1 | iex`
- Windows PowerShell 5.1: `irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill-winps.ps1 | iex`

## Security and Troubleshooting

- Never commit real `DOC2X_API_KEY` to the repository.
- The download allowlist is restrictive by default; evaluate risk before using `DOC2X_DOWNLOAD_URL_ALLOWLIST=*`.
- Use `doc2x_debug_config` first when diagnosing config/environment issues.

## Getting Help

- Usage questions or bug reports: GitHub Issues  
  [https://github.com/NoEdgeAI/doc2x-mcp/issues](https://github.com/NoEdgeAI/doc2x-mcp/issues)
- Include minimal reproduction input, affected tool name, and sanitized `doc2x_debug_config` output when possible.

## License

MIT License. See `LICENSE`.
