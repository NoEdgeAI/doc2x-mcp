import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { TOOL_ERROR_CODE_INVALID_JSON } from '../../dist/errors/errorCodes.js';
import {
  materializePdfLayoutJson,
  validatePdfLayoutResult,
} from '../../dist/doc2x/materialize.js';

test('validatePdfLayoutResult accepts result with per-page layout objects', () => {
  const out = validatePdfLayoutResult({
    pages: [
      { page_idx: 0, layout: { blocks: [] } },
      { page_idx: 1, layout: { blocks: [{ id: 'b1', type: 'Text' }] } },
    ],
  });

  assert.equal(out.pageCount, 2);
  assert.equal(out.hasLayout, true);
});

test('validatePdfLayoutResult rejects pages without layout', () => {
  assert.throws(
    () =>
      validatePdfLayoutResult({
        pages: [{ page_idx: 0, md: '# no layout' }],
      }),
    (err) => {
      assert.equal(err.code, TOOL_ERROR_CODE_INVALID_JSON);
      assert.match(err.message, /pages\[0\]\.layout must be an object/);
      return true;
    },
  );
});

test('materializePdfLayoutJson writes raw result JSON to output_path', async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'doc2x-mcp-layout-'));
  const outputPath = path.join(tempDir, 'result.layout.json');
  const result = {
    version: 'v1',
    pages: [{ page_idx: 0, layout: { blocks: [{ id: 'block-1', type: 'Figure' }] } }],
  };

  const out = await materializePdfLayoutJson({
    uid: 'uid-123',
    result,
    output_path: outputPath,
  });

  assert.equal(out.uid, 'uid-123');
  assert.equal(out.output_path, outputPath);
  assert.equal(out.page_count, 1);
  assert.equal(out.has_layout, true);

  const saved = JSON.parse(await fsp.readFile(outputPath, 'utf8'));
  assert.deepEqual(saved, result);
});
