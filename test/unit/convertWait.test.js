import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DOC2X_API_KEY = 'synthetic-export-test-key';
process.env.DOC2X_BASE_URL = 'https://doc2x.test.invalid';
const { convertExportWaitByUid } = await import('../../dist/doc2x/convert.js');

for (const to of ['md', 'tex', 'docx']) {
  test(`wait accepts successful opaque ${to} download URLs`, async (t) => {
    const url = 'https://doc2x-business.oss-cn-beijing.aliyuncs.com/converts/cv_synthetic';
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return new Response(JSON.stringify({ code: 'success', data: { status: 'success', url } }));
    });
    const result = await convertExportWaitByUid({
      uid: 'test-uid',
      to,
      poll_interval_ms: 1,
      max_wait_ms: 30,
    });
    assert.equal(result.url, url);
    assert.equal(calls, 1);
  });
}

test('wait still rejects an explicitly mismatched legacy format and empty URLs', async (t) => {
  const urls = [
    '',
    'https://cdn.noedgeai.com/convert_md_normal_test.zip',
    'https://cdn.noedgeai.com/convert_tex_normal_test.zip',
  ];
  let calls = 0;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          code: 'success',
          data: { status: 'success', url: urls[Math.min(calls++, urls.length - 1)] },
        }),
      ),
  );
  const result = await convertExportWaitByUid({
    uid: 'test-uid',
    to: 'tex',
    poll_interval_ms: 1,
    max_wait_ms: 1000,
  });
  assert.equal(result.url, urls[2]);
  assert.equal(calls, 3);
});

test('wait requires HTTP download URLs and ignores format-like query values', async (t) => {
  const urls = [
    'invalid-url',
    'javascript:convert_md_test',
    'https://cdn.noedgeai.com/converts/cv_test?note=convert_tex_test',
  ];
  let calls = 0;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          code: 'success',
          data: { status: 'success', url: urls[Math.min(calls++, urls.length - 1)] },
        }),
      ),
  );
  const result = await convertExportWaitByUid({
    uid: 'test-uid',
    to: 'md',
    poll_interval_ms: 1,
    max_wait_ms: 1000,
  });
  assert.equal(result.url, urls[2]);
  assert.equal(calls, 3);
});
