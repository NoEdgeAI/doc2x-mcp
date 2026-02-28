import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerConvertTools } from '#mcp/registerConvertTools';
import { registerImageTools } from '#mcp/registerImageTools';
import { registerMiscTools } from '#mcp/registerMiscTools';
import { registerPdfTools } from '#mcp/registerPdfTools';
import { createRegisterToolsContext } from '#mcp/registerToolsShared';

export function registerTools(server: McpServer) {
  const ctx = createRegisterToolsContext();
  registerPdfTools(server, ctx);
  registerConvertTools(server, ctx);
  registerImageTools(server, ctx);
  registerMiscTools(server);
}
