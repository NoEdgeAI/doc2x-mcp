# doc2x-mcp 开发指南

## 项目概览

`@noedgeai-org/doc2x-mcp` 是一个 MCP（Model Context Protocol）服务器，通过 stdio 提供 Doc2x PDF/图片解析、格式导出和文件落盘能力。

- **语言**：TypeScript（ESM，Node ≥18）
- **包管理**：pnpm
- **入口**：`src/index.ts` → 构建产物 `dist/index.js`
- **发布包名**：`@noedgeai-org/doc2x-mcp`

---

## 目录结构

```
src/
  config/index.ts          # 配置：API Key、超时、环境变量解析
  doc2x/
    client.ts              # HTTP 客户端
    pdf.ts                 # PDF 解析 API
    convert.ts             # 导出 API（md/tex/docx）
    image.ts               # 图片解析 API
    materialize.ts         # layout JSON 落盘
    download.ts            # 文件下载（含 allowlist 校验）
    paths.ts               # API 路径常量
    constants.ts           # 通用常量
    http.ts                # HTTP 工具
  mcp/
    registerTools.ts       # 入口：统一注册所有 tool
    registerPdfTools.ts    # PDF 相关 tools
    registerConvertTools.ts# 导出相关 tools
    registerImageTools.ts  # 图片相关 tools
    registerMiscTools.ts   # 杂项 tools（debug config 等）
    registerToolsShared.ts # 共享类型、LRU 缓存、Zod schema、工具函数
    results.ts             # MCP 结果格式化
  errors/
    error.ts               # ToolError
    errorCodes.ts          # 错误码常量
  shared/utils.ts          # 通用工具函数
skills/doc2x-mcp/SKILL.md  # 用户侧 skill（用于 Claude/Codex 调用指导）
```

---

## 常用命令

```bash
just install          # pnpm install
just build            # tsc 编译
just start            # node dist/index.js（stdio MCP 服务器）
just run              # build + start
just fmt              # prettier 格式化
just fmt-check        # 格式检查（CI 用）
just check            # fmt-check + build
just clean            # 删除 dist/

# 测试
pnpm test             # 单元测试 + e2e 测试
pnpm test:unit        # 仅单元测试
pnpm test:e2e         # 仅 e2e 测试

# skill 安装（开发本地调试用）
just install-skill         # 安装到 Codex + Claude
just install-skill-force   # 强制覆盖
just install-skill-codex   # 仅 Codex
just install-skill-claude  # 仅 Claude
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DOC2X_API_KEY` | API Key（也可内嵌在 `src/config/index.ts` 的 `INLINE_DOC2X_API_KEY`） | — |
| `DOC2X_BASE_URL` | API Base URL | `https://v2.doc2x.noedgeai.com` |
| `DOC2X_HTTP_TIMEOUT` / `DOC2X_HTTP_TIMEOUT_MS` | HTTP 超时（`s` 或 `ms`） | `60s` |
| `DOC2X_POLL_INTERVAL_MS` | 轮询间隔 | `2000ms` |
| `DOC2X_MAX_WAIT_MS` | 最大等待时长 | `600000ms` |
| `DOC2X_PARSE_PDF_MAX_OUTPUT_CHARS` | 文本预览最大字符数 | `5000` |
| `DOC2X_PARSE_PDF_MAX_OUTPUT_PAGES` | 文本预览最大页数 | `10` |
| `DOC2X_DOWNLOAD_URL_ALLOWLIST` | 下载域名白名单（逗号分隔，`*` 表示全放行） | `.amazonaws.com.cn,.aliyuncs.com,.noedgeai.com` |

本地开发可在根目录创建 `.env` 文件，`just` 命令会自动加载（`set dotenv-load := true`）。

---

## 核心架构

### MCP Tool 注册

所有 tool 在 `registerTools(server)` 中统一挂载，分为四组：

- `registerPdfTools` — PDF 提交、状态、等待文本、layout JSON
- `registerConvertTools` — 导出（md/tex/docx）、下载、convert_zip 落盘
- `registerImageTools` — 图片同步解析、异步提交、等待文本
- `registerMiscTools` — debug_config

### 内存缓存（LRU）

`RegisterToolsContext` 持有三个 LRU 缓存，在 MCP 服务器生命周期内共享：

- `pdfUidCache` — `(absPath + model)` → `uid`，TTL 12h，避免重复提交同一文件
- `imageUidCache` — 同上，针对图片
- `convertSubmitCache` + `convertSubmitInflight` — 防止同一 `uid+参数组合` 并发重复提交导出

### 路径别名（imports）

`package.json` 中配置了 `#config`、`#errors`、`#utils`、`#doc2x/*`、`#mcp/*` 等别名，对应 `src/` 下的子目录。新增文件时同步维护 `tsconfig.json` 的 `paths` 配置。

---

## 添加新 Tool 的步骤

1. 在对应的 `registerXxxTools.ts` 中用 `server.tool(name, schema, handler)` 注册
2. Zod schema 复用 `registerToolsShared.ts` 中已有的 `pdfPathSchema`、`outputPathSchema` 等
3. Handler 用 `withToolErrorHandling` 包裹，统一处理 `ToolError`
4. 在 `skills/doc2x-mcp/SKILL.md` 的"按目标选 Tool"和"标准流程"中补充说明

---

## CI / 发布

| 触发条件 | 动作 |
|----------|------|
| PR / push to main | `ci.yml`：依赖审查、多版本 build、package smoke test |
| push to `dev` 分支 | `publish.yml`：发布 `dev` 标签版本到 npm（版本号加 `-dev.<run>.<attempt>`） |
| push `v*.*.*` tag | `publish.yml`：正式发布 `latest` 到 npm，需 tag 与 `package.json` version 一致 |
| 手动触发 | `recreate-dev.yml`：将 `dev` 分支重置为 `main` |

发布前必须通过 `just check`（fmt-check + build），CI 中 Node 版本矩阵为 18 / 20。

---

## 开发注意事项

- **绝对路径**：所有文件路径参数（`pdf_path`、`output_path` 等）必须是绝对路径，Zod schema 已做校验
- **不要伪造 uid/url**：uid 来自 API 响应，url 来自导出结果，不能手动构造
- **同一 uid 的同种导出不要并发**：`runConvertSubmitAtomically` 已做 inflight 去重，但调用侧仍需注意
- **不要打印 API Key**：调试只用 `doc2x_debug_config` 返回的摘要字段
- **formula_level 类型**：必须传数字 `0 | 1 | 2`，仅在 `v3-2026` 解析结果上有效
