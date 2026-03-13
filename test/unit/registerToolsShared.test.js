import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { TOOL_ERROR_CODE_INVALID_ARGUMENT } from '../../dist/errors/errorCodes.js';
import {
  createRegisterToolsContext,
  doc2xDownloadUrlSchema,
  fileSig,
  getSubmittedUidFromCache,
  jsonOutputPathSchema,
  makePdfUidCacheKey,
  imagePathSchema,
  makeConvertSubmitKey,
  missingEitherFieldError,
  outputPathSchema,
  pdfPathSchema,
  setFailedUidCache,
  setSubmittedUidCache,
  withToolErrorHandling,
} from '../../dist/mcp/registerToolsShared.js';

function parseErrorPayload(result) {
  assert.equal(result.isError, true);
  const text = result.content?.[0]?.text ?? '';
  return JSON.parse(text);
}

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
  const absoluteJsonOut = path.resolve('/tmp/out.json');

  assert.equal(pdfPathSchema.safeParse(goodPdf).success, true);
  assert.equal(pdfPathSchema.safeParse(badPdf).success, false);
  assert.equal(pdfPathSchema.safeParse('relative.pdf').success, false);

  assert.equal(imagePathSchema.safeParse(goodImage).success, true);
  assert.equal(imagePathSchema.safeParse(badImage).success, false);
  assert.equal(imagePathSchema.safeParse('relative.jpg').success, false);

  assert.equal(outputPathSchema.safeParse(absoluteOut).success, true);
  assert.equal(outputPathSchema.safeParse(relativeOut).success, false);
  assert.equal(jsonOutputPathSchema.safeParse(absoluteJsonOut).success, true);
  assert.equal(jsonOutputPathSchema.safeParse(absoluteOut).success, false);
});

test('download URL schema only allows http/https', () => {
  assert.equal(doc2xDownloadUrlSchema.safeParse('https://example.com/a?b=1').success, true);
  assert.equal(doc2xDownloadUrlSchema.safeParse('http://example.com').success, true);
  assert.equal(doc2xDownloadUrlSchema.safeParse('ftp://example.com/file').success, false);
});

test('pdf uid cache hits for same signature from test/pdf/test.pdf', async () => {
  const ctx = createRegisterToolsContext();
  const pdfPath = path.resolve(process.cwd(), 'test/pdf/test.pdf');
  const sig1 = await fileSig(pdfPath);
  const key = makePdfUidCacheKey(sig1.absPath);

  assert.equal(getSubmittedUidFromCache(ctx, { kind: 'pdf', key, sig: sig1 }), '');

  setSubmittedUidCache(ctx, { kind: 'pdf', key, sig: sig1, uid: 'uid-1' });
  const sig2 = await fileSig(pdfPath);
  assert.equal(getSubmittedUidFromCache(ctx, { kind: 'pdf', key, sig: sig2 }), 'uid-1');

  setFailedUidCache(ctx, { kind: 'pdf', key, sig: sig2, uid: 'uid-1' });
  assert.equal(getSubmittedUidFromCache(ctx, { kind: 'pdf', key, sig: sig2 }), '');

  setSubmittedUidCache(ctx, { kind: 'pdf', key, sig: sig2, uid: 'uid-2' });
  const changedSig = { ...sig2, md5: '00000000000000000000000000000000' };
  assert.equal(getSubmittedUidFromCache(ctx, { kind: 'pdf', key, sig: changedSig }), '');
});
