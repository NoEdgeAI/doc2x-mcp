import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { TOOL_ERROR_CODE_INVALID_ARGUMENT } from '../../dist/errors/errorCodes.js';
import {
  BoundedTtlMap,
  BoundedTtlSet,
  doc2xDownloadUrlSchema,
  imagePathSchema,
  makeConvertSubmitKey,
  missingEitherFieldError,
  outputPathSchema,
  pdfPathSchema,
  withToolErrorHandling,
} from '../../dist/mcp/registerToolsShared.js';

function parseErrorPayload(result) {
  assert.equal(result.isError, true);
  const text = result.content?.[0]?.text ?? '';
  return JSON.parse(text);
}

test('BoundedTtlMap enforces max entries in LRU order', () => {
  const m = new BoundedTtlMap(2, 60_000);
  m.set('a', 1);
  m.set('b', 2);
  assert.equal(m.get('a'), 1);
  m.set('c', 3);
  assert.equal(m.get('a'), 1);
  assert.equal(m.get('b'), undefined);
  assert.equal(m.get('c'), 3);
});

test('BoundedTtlMap expires entries by ttl', async () => {
  const m = new BoundedTtlMap(2, 20);
  m.set('a', 1);
  await sleep(40);
  assert.equal(m.get('a'), undefined);
});

test('BoundedTtlSet enforces ttl and presence', async () => {
  const s = new BoundedTtlSet(2, 20);
  s.add('x');
  assert.equal(s.has('x'), true);
  await sleep(40);
  assert.equal(s.has('x'), false);
});

test('makeConvertSubmitKey is stable for omitted optional fields', () => {
  const a = makeConvertSubmitKey({
    uid: 'u1',
    to: 'md',
    formula_mode: 'dollar',
  });
  const b = makeConvertSubmitKey({
    uid: 'u1',
    to: 'md',
    formula_mode: 'dollar',
    formula_level: undefined,
    filename: undefined,
    filename_mode: undefined,
    merge_cross_page_forms: undefined,
  });
  assert.equal(a, b);
});

test('withToolErrorHandling converts ToolError to MCP error result', async () => {
  const wrapped = withToolErrorHandling(async () => {
    throw missingEitherFieldError('uid', 'pdf_path');
  });
  const out = await wrapped();
  const payload = parseErrorPayload(out);
  assert.equal(payload.error.code, TOOL_ERROR_CODE_INVALID_ARGUMENT);
  assert.match(payload.error.message, /Either uid or pdf_path is required\./);
});

test('path schemas enforce absolute and extension constraints', () => {
  const goodPdf = path.resolve('/tmp/test.pdf');
  const badPdf = path.resolve('/tmp/test.txt');
  const goodImage = path.resolve('/tmp/a.jpg');
  const badImage = path.resolve('/tmp/a.gif');
  const relativeOut = 'tmp/out.md';
  const absoluteOut = path.resolve('/tmp/out.md');

  assert.equal(pdfPathSchema.safeParse(goodPdf).success, true);
  assert.equal(pdfPathSchema.safeParse(badPdf).success, false);
  assert.equal(pdfPathSchema.safeParse('relative.pdf').success, false);

  assert.equal(imagePathSchema.safeParse(goodImage).success, true);
  assert.equal(imagePathSchema.safeParse(badImage).success, false);
  assert.equal(imagePathSchema.safeParse('relative.jpg').success, false);

  assert.equal(outputPathSchema.safeParse(absoluteOut).success, true);
  assert.equal(outputPathSchema.safeParse(relativeOut).success, false);
});

test('download URL schema only allows http/https', () => {
  assert.equal(doc2xDownloadUrlSchema.safeParse('https://example.com/a?b=1').success, true);
  assert.equal(doc2xDownloadUrlSchema.safeParse('http://example.com').success, true);
  assert.equal(doc2xDownloadUrlSchema.safeParse('ftp://example.com/file').success, false);
});
