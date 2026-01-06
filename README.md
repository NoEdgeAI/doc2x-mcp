# Doc2x MCP Server

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
- `DOC2X_DOWNLOAD_URL_ALLOWLIST`：可选，默认 `".amazonaws.com.cn,.aliyuncs.com,.noedgeai.com"`；设为 `*` 可允许任意 host（不推荐）

## 3) 启动

### 方式 A：通过 npx

```json
{
  "command": "npx",
  "args": ["-y", "@noedgeai/doc2x-mcp"],
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
