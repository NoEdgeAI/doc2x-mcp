import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { TOOL_ERROR_CODE_INVALID_ARGUMENT } from '../../dist/errors/errorCodes.js';

function repoRootFrom(importMetaUrl) {
  const here = path.dirname(fileURLToPath(importMetaUrl));
  return path.resolve(here, '../..');
}

function toSpawnEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => typeof v === 'string'),
  );
}

function firstText(result) {
  const textBlock = Array.isArray(result.content)
    ? result.content.find((c) => c && c.type === 'text')
    : undefined;
  assert.ok(textBlock, 'tool result should contain a text block');
  return textBlock.text;
}

test('stdio e2e: list tools and basic error/result paths', async (t) => {
  const cwd = repoRootFrom(import.meta.url);
  const serverPath = path.join(cwd, 'dist', 'index.js');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd,
    env: toSpawnEnv(),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'doc2x-mcp-e2e', version: '0.0.0' });

  t.after(async () => {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  });

  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = new Set(tools.tools.map((x) => x.name));
  assert.ok(toolNames.has('doc2x_debug_config'));
  assert.ok(toolNames.has('doc2x_parse_pdf_wait_text'));
  assert.ok(toolNames.has('doc2x_parse_image_layout_wait_text'));

  const debug = await client.callTool({ name: 'doc2x_debug_config', arguments: {} });
  assert.notEqual(debug.isError, true);
  const debugPayload = JSON.parse(firstText(debug));
  assert.equal(typeof debugPayload.baseUrl, 'string');
  assert.equal(typeof debugPayload.pollIntervalMs, 'number');
  assert.equal(typeof debugPayload.httpTimeoutMs, 'number');

  const pdfWait = await client.callTool({ name: 'doc2x_parse_pdf_wait_text', arguments: {} });
  assert.equal(pdfWait.isError, true);
  const pdfWaitPayload = JSON.parse(firstText(pdfWait));
  assert.equal(pdfWaitPayload.error.code, TOOL_ERROR_CODE_INVALID_ARGUMENT);

  const imageWait = await client.callTool({ name: 'doc2x_parse_image_layout_wait_text', arguments: {} });
  assert.equal(imageWait.isError, true);
  const imageWaitPayload = JSON.parse(firstText(imageWait));
  assert.equal(imageWaitPayload.error.code, TOOL_ERROR_CODE_INVALID_ARGUMENT);
});
