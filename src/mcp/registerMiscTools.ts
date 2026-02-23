import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CONFIG, RESOLVED_KEY, parseDownloadUrlAllowlist } from '#config';
import { downloadUrlToFile } from '#doc2x/download';
import { materializeConvertZip } from '#doc2x/materialize';
import { asJsonResult } from '#mcp/results';
import {
  convertZipBase64Schema,
  doc2xDownloadUrlSchema,
  outputDirSchema,
  outputPathSchema,
  withToolErrorHandling,
} from '#mcp/registerToolsShared';

export function registerMiscTools(server: McpServer) {
  server.registerTool(
    'doc2x_download_url_to_file',
    {
      description:
        'Download a Doc2x-provided URL (e.g. from doc2x_convert_export_result) to a local file path.',
      inputSchema: {
        url: doc2xDownloadUrlSchema,
        output_path: outputPathSchema,
      },
    },
    withToolErrorHandling(async (args) => asJsonResult(await downloadUrlToFile(args))),
  );

  server.registerTool(
    'doc2x_materialize_convert_zip',
    {
      description:
        'Materialize convert_zip (base64) into output_dir. Best-effort: tries system unzip first; otherwise writes the zip file.',
      inputSchema: { convert_zip_base64: convertZipBase64Schema, output_dir: outputDirSchema },
    },
    withToolErrorHandling(async (args) =>
      asJsonResult(
        await materializeConvertZip({
          convert_zip_base64: args.convert_zip_base64,
          output_dir: args.output_dir,
        }),
      ),
    ),
  );

  server.registerTool(
    'doc2x_debug_config',
    {
      description: 'Debug helper: return resolved config and API key source for troubleshooting.',
      inputSchema: {},
    },
    withToolErrorHandling(async () =>
      asJsonResult({
        baseUrl: CONFIG.baseUrl,
        apiKeySource: RESOLVED_KEY.source,
        apiKeyLen: CONFIG.apiKey.length,
        apiKeyPrefix: CONFIG.apiKey ? CONFIG.apiKey.slice(0, 6) : '',
        pollIntervalMs: CONFIG.pollIntervalMs,
        httpTimeoutMs: CONFIG.httpTimeoutMs,
        maxWaitMs: CONFIG.maxWaitMs,
        parsePdfMaxOutputChars: CONFIG.parsePdfMaxOutputChars,
        parsePdfMaxOutputPages: CONFIG.parsePdfMaxOutputPages,
        downloadUrlAllowlist: parseDownloadUrlAllowlist(),
      }),
    ),
  );
}
