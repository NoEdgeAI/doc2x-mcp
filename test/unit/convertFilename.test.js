import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DOC2X_API_KEY = 'synthetic-export-test-key';
process.env.DOC2X_BASE_URL = 'https://doc2x.test.invalid';

const { convertExportSubmit } = await import('../../dist/doc2x/convert.js');
const { TOOL_ERROR_CODE_INVALID_ARGUMENT } = await import('../../dist/errors/errorCodes.js');

function mockApi(t) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://doc2x.test.invalid/api/v2/convert/parse');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body);
    requests.push(body);
    if (Array.from(body.filename ?? '').length > 50) {
      return new Response(JSON.stringify({ code: 'internal_error' }), { status: 500 });
    }
    return new Response(JSON.stringify({ code: 'success', data: { status: 'processing' } }), {
      status: 200,
    });
  });
  return requests;
}

function args(filename, extra = {}) {
  return { uid: 'synthetic-export-uid', to: 'md', formula_mode: 'dollar', filename, ...extra };
}

test('auto mode submits ASCII, CJK and astral titles within the 50-character contract', async (t) => {
  const requests = mockApi(t);
  for (const title of ['a'.repeat(51), '研究报告'.repeat(30), '🚀'.repeat(60)]) {
    await convertExportSubmit(args(`${title}.md`));
    const sent = requests.at(-1).filename;
    assert.equal(Array.from(sent).length, 50);
    assert.match(sent, /-[0-9a-f]{12}$/);
    assert.ok(!sent.includes('\uFFFD'));
  }
});

test('valid names retain basename and extension normalization', async (t) => {
  const requests = mockApi(t);
  for (const [to, filename, expected] of [
    ['md', '/folder/report.md', 'report'],
    ['tex', '/folder/report.TEX', 'report'],
    ['docx', '/folder/report.docx', 'report'],
    ['md', `${'文'.repeat(50)}.md`, '文'.repeat(50)],
    ['md', `${'🚀'.repeat(50)}.md`, '🚀'.repeat(50)],
  ]) {
    await convertExportSubmit(args(filename, { to }));
    assert.equal(requests.at(-1).filename, expected);
  }
});

test('shortening is deterministic and preserves distinctions after a shared prefix', async (t) => {
  const requests = mockApi(t);
  const prefix = 'shared-title-'.repeat(8);
  for (const title of [`${prefix}one`, `${prefix}one`, `${prefix}two`]) {
    await convertExportSubmit(args(title));
  }
  assert.equal(requests[0].filename, requests[1].filename);
  assert.notEqual(requests[0].filename, requests[2].filename);
});

test('raw mode preserves valid names but rejects overlong names before any request', async (t) => {
  const requests = mockApi(t);
  await convertExportSubmit(args('/folder/report.md', { filename_mode: 'raw' }));
  assert.equal(requests[0].filename, 'report.md');
  await assert.rejects(
    convertExportSubmit(args('🚀'.repeat(51), { filename_mode: 'raw' })),
    (error) => {
      assert.equal(error.code, TOOL_ERROR_CODE_INVALID_ARGUMENT);
      assert.equal(error.retryable, false);
      assert.match(error.message, /50/);
      return true;
    },
  );
  assert.equal(requests.length, 1);
});

test('shortening leaves caller data and export options intact', async (t) => {
  const requests = mockApi(t);
  const original = Object.freeze(
    args('long-report-'.repeat(10), {
      formula_level: 2,
      merge_cross_page_forms: true,
    }),
  );
  const snapshot = { ...original };
  await convertExportSubmit(original);
  assert.deepEqual(original, snapshot);
  assert.equal(requests[0].formula_level, 2);
  assert.equal(requests[0].merge_cross_page_forms, true);
  assert.equal(requests[0].formula_mode, 'dollar');
  await convertExportSubmit(args(undefined));
  assert.equal(Object.hasOwn(requests.at(-1), 'filename'), false);
});
