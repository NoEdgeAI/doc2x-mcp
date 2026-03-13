# Doc2x MCP Server

[![CI](https://github.com/NoEdgeAI/doc2x-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/NoEdgeAI/doc2x-mcp/actions/workflows/ci.yml)
[![Publish](https://github.com/NoEdgeAI/doc2x-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/NoEdgeAI/doc2x-mcp/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/%40noedgeai-org%2Fdoc2x-mcp)](https://www.npmjs.com/package/@noedgeai-org/doc2x-mcp)

简体中文 | [English](./README_EN.md)

将 Doc2x v2 PDF/图片能力封装为基于 stdio 的 MCP Server，提供稳定、可组合的语义化 tools。

## 目录

- [项目定位](#项目定位)
- [版本与环境](#版本与环境)
- [快速开始](#快速开始)
- [配置参考](#配置参考)
- [Tool API 总览](#tool-api-总览)
- [常见工作流](#常见工作流)
- [本地开发](#本地开发)
- [CI / 发布流水线](#ci--发布流水线)
- [如何发布](#如何发布)
- [安装本仓库 Skill（可选）](#安装本仓库-skill可选)
- [安全与排错](#安全与排错)
- [问题反馈](#问题反馈)
- [License](#license)

## 项目定位

- 面向 MCP 客户端（Codex CLI / Claude Code / 自定义 Agent）提供 Doc2x 能力。
- 以 submit/status/wait 统一异步任务模型，便于自动化编排。
- 提供可控超时、轮询、下载白名单等运行时安全边界。

## 版本与环境

- 本地运行：Node.js `>=18` 即可。
- CI 校验：Node.js `18`、`20` 都会跑构建。
- 发布环境：GitHub Actions 中发布任务使用 Node.js `24`。
- 包管理器：统一用 pnpm（锁文件 `pnpm-lock.yaml`）。

## 快速开始

### 方式 A：通过 npx（推荐）

在 MCP client 配置中添加：

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

### 方式 B：本地源码运行

```bash
cd doc2x-mcp
pnpm install --frozen-lockfile
pnpm run build
DOC2X_API_KEY=sk-xxx pnpm start
```

MCP client 指向本地构建产物：

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

## 配置参考

| 环境变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `DOC2X_API_KEY` | 是 | - | Doc2x API Key（`sk-xxx`） |
| `DOC2X_BASE_URL` | 否 | `https://v2.doc2x.noedgeai.com` | Doc2x API 基础地址 |
| `DOC2X_HTTP_TIMEOUT_MS` | 否 | `60000` | 单次 HTTP 超时（毫秒） |
| `DOC2X_POLL_INTERVAL_MS` | 否 | `2000` | 轮询间隔（毫秒） |
| `DOC2X_MAX_WAIT_MS` | 否 | `600000` | wait 类工具最大等待时长（毫秒） |
| `DOC2X_PARSE_PDF_MAX_OUTPUT_CHARS` | 否 | `5000` | `doc2x_parse_pdf_wait_text` 最大返回字符数；`0`=不限制 |
| `DOC2X_PARSE_PDF_MAX_OUTPUT_PAGES` | 否 | `10` | `doc2x_parse_pdf_wait_text` 最大合并页数；`0`=不限制 |
| `DOC2X_DOWNLOAD_URL_ALLOWLIST` | 否 | `.amazonaws.com.cn,.aliyuncs.com,.noedgeai.com` | 下载 URL 白名单；`*` 允许任意 host（不推荐） |

## Tool API 总览

| 阶段 | Tools | 说明 |
| --- | --- | --- |
| PDF 解析 | `doc2x_parse_pdf_submit` / `doc2x_parse_pdf_status` / `doc2x_parse_pdf_wait_text` / `doc2x_materialize_pdf_layout_json` | 提交任务、查询状态、等待并取文本，或将 v3 layout 结果落盘为本地 JSON |
| 结果导出 | `doc2x_convert_export_submit` / `doc2x_convert_export_result` / `doc2x_convert_export_wait` | 发起导出、查结果、等待导出完成 |
| 下载落盘 | `doc2x_download_url_to_file` / `doc2x_materialize_convert_zip` | 下载 URL 到本地、解包 convert zip |
| 图片版面解析 | `doc2x_parse_image_layout_sync` / `doc2x_parse_image_layout_submit` / `doc2x_parse_image_layout_status` / `doc2x_parse_image_layout_wait_text` | 同步/异步图片 OCR 与版面解析 |
| 诊断 | `doc2x_debug_config` | 返回配置解析与 API key 来源，便于排错 |

### PDF 解析模型（`doc2x_parse_pdf_submit` / `doc2x_parse_pdf_wait_text`）

- 可选参数：`model`
- 可选值：`v2`（默认） / `v3-2026`（最新模型）
- 不传时默认 `v2`

```json
{
  "model": "v3-2026"
}
```

### PDF Layout JSON 落盘（`doc2x_materialize_pdf_layout_json`）

- 必选参数：`output_path`
- `uid` 与 `pdf_path` 二选一
- `v2` 不支持 `layout`；需要 `pages[].layout` 时请使用 `v3-2026`
- 若传 `pdf_path` 但不传 `model`，该工具默认使用 `v3-2026`
- 成功时将原始 `result` JSON 写到本地

`layout` 是页面块结构和坐标信息，适合 figure/table 裁剪、区域高亮、结构化抽取和版面分析；如果只想看正文内容，优先使用 Markdown / DOCX 导出。

```json
{
  "pdf_path": "/absolute/path/to/input.pdf",
  "output_path": "/absolute/path/to/input_v3.layout.json"
}
```

### 导出公式参数（`doc2x_convert_export_submit` / `doc2x_convert_export_wait`）

- 必选参数：`formula_mode`（`normal` / `dollar`）
- 可选参数：`formula_level`（仅源解析任务为 `model=v3-2026` 时生效）
- 取值说明：
  - `0`：保留公式
  - `1`：仅退化行内公式（`\\(...\\)`、`$...$`）
  - `2`：退化全部公式（`\\(...\\)`、`$...$`、`\\[...\\]`、`$$...$$`）

## 常见工作流

### 工作流 1：PDF -> Markdown 本地文件

1. `doc2x_parse_pdf_submit` 提交 PDF 解析。
2. `doc2x_convert_export_wait` 等待导出（`to=md`，并指定 `formula_mode`）。
3. `doc2x_convert_export_result` 获取下载 URL。
4. `doc2x_download_url_to_file` 下载到目标路径。

### 工作流 2：图片版面 OCR 快速结果

1. `doc2x_parse_image_layout_sync` 直接同步解析。
2. 若需要稳态轮询，改用 submit/status/wait 组合。

### 工作流 3：PDF -> v3 layout JSON 本地文件

1. 调用 `doc2x_materialize_pdf_layout_json`，传入 `pdf_path` 和 `output_path`。
2. 工具会等待 parse 成功，并将原始 `result` JSON 落到本地。
3. 该 JSON 可直接提供给后续 figure/table 裁剪脚本使用。

## 本地开发

### 环境要求

- Node.js `>=18`
- pnpm（与仓库锁文件一致）

### 常用命令

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run test
pnpm run format:check
```

运行服务：

```bash
DOC2X_API_KEY=sk-xxx pnpm start
```

## CI / 发布流水线

仓库使用 GitHub Actions：

- CI：`.github/workflows/ci.yml`
  - 触发：`push` 到 `main`、`pull_request`、`workflow_dispatch`、每周一 UTC `03:17`
  - 文档-only 变更（`**/*.md`、`LICENSE`）自动跳过
  - 任务：
    - `dependency-review`（仅 PR）
    - `build`（Node.js `18/20` 矩阵）
    - `package-smoke`（`npm pack --dry-run`）
    - `security-audit`（仅手动/定时）

- Publish：`.github/workflows/publish.yml`
  - `dev` 分支 push：发布 npm `dev` tag
  - `v*.*.*` tag push：发布 npm `latest`
  - 发布前校验 tag 版本与 `package.json` 版本一致
  - 发布命令：`npm publish --provenance`

建议提交前本地对齐：

```bash
pnpm install --frozen-lockfile
pnpm run build
npm pack --dry-run
pnpm audit --prod --audit-level high
```

## 如何发布

- 开发预发布（`dev`）：push 到 `dev` 分支后自动发布到 npm `dev` tag。版本会自动改成 `x.y.z-dev.<run>.<attempt>`。
- 正式发布（`latest`）：push `v*.*.*` tag 后发布到 npm `latest`。tag 版本必须和 `package.json` 版本一致。

## 安装本仓库 Skill（可选）

用于给 Codex CLI / Claude Code 增加一个“教大模型如何使用 doc2x-mcp tools 的 Skill”。

不需要 clone 仓库的一键安装（推荐）：

```bash
curl -fsSL https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.sh | sh
```

在本仓库源码目录安装：

```bash
pnpm run skill:install
```

默认安装目录：

- Codex CLI：`~/.codex/skills/public/doc2x-mcp`（可用 `CODEX_HOME` 覆盖）
- Claude Code：`~/.claude/skills/doc2x-mcp`（可用 `CLAUDE_HOME` 覆盖）

说明：

- `--target auto`（默认）会同时安装到 Codex + Claude。
- PowerShell 7+：`irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill.ps1 | iex`
- Windows PowerShell 5.1：`irm https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main/scripts/install-skill-winps.ps1 | iex`

## 安全与排错

- 不要在仓库提交真实 `DOC2X_API_KEY`。
- 白名单默认限制下载域名；如需放开，评估风险后再使用 `DOC2X_DOWNLOAD_URL_ALLOWLIST=*`。
- 配置异常时优先调用 `doc2x_debug_config` 定位环境变量来源与解析结果。

## 问题反馈

- 使用问题或缺陷反馈：GitHub Issues  
  [https://github.com/NoEdgeAI/doc2x-mcp/issues](https://github.com/NoEdgeAI/doc2x-mcp/issues)
- 建议在 issue 中附上最小复现输入、触发的 tool 名称、以及 `doc2x_debug_config` 结果（可脱敏）。

## License

MIT License，详见 `LICENSE`。
