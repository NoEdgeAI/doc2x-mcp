import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { CONFIG, isHostAllowedByAllowlist, parseDownloadUrlAllowlist } from '#config';
import { ToolError, coerceToolError } from '#errors';
import {
  TOOL_ERROR_CODE_EMPTY_BODY,
  TOOL_ERROR_CODE_INTERNAL_ERROR,
  TOOL_ERROR_CODE_INVALID_URL,
  TOOL_ERROR_CODE_UNSAFE_URL,
  httpErrorCode,
} from '#errorCodes';
import { HTTP_METHOD_GET } from '#doc2x/http';
import { normalizeUrl } from '#doc2x/client';

export async function downloadUrlToFile(args: { url: string; output_path: string }) {
  const outPath = path.resolve(args.output_path);
  await fsp.mkdir(path.dirname(outPath), { recursive: true });

  const normalizedUrl = normalizeUrl(args.url);
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new ToolError({
      code: TOOL_ERROR_CODE_INVALID_URL,
      message: 'download failed: invalid url',
      retryable: false,
    });
  }
  if (parsed.protocol !== 'https:') {
    throw new ToolError({
      code: TOOL_ERROR_CODE_UNSAFE_URL,
      message: `download blocked: only https URLs are allowed (${parsed.protocol})`,
      retryable: false,
    });
  }
  const allowlist = parseDownloadUrlAllowlist();
  if (!isHostAllowedByAllowlist(parsed.hostname, allowlist)) {
    throw new ToolError({
      code: TOOL_ERROR_CODE_UNSAFE_URL,
      message: `download blocked: host not allowed (${parsed.hostname}); set DOC2X_DOWNLOAD_URL_ALLOWLIST=\"*\" to allow any host, or provide a comma-separated allowlist`,
      retryable: false,
    });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.httpTimeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(normalizedUrl, { method: HTTP_METHOD_GET, signal: ctrl.signal });
    } catch (e) {
      throw coerceToolError(e, {
        defaultCode: TOOL_ERROR_CODE_INTERNAL_ERROR,
        defaultRetryable: true,
        defaultMessage: 'download failed',
        details: { url: parsed.hostname },
      });
    }
    if (!res.ok) {
      throw new ToolError({
        code: httpErrorCode(res.status),
        message: `download failed: ${res.status} ${res.statusText}`,
        retryable: res.status >= 500 || res.status === 408 || res.status === 429,
      });
    }
    if (!res.body)
      throw new ToolError({
        code: TOOL_ERROR_CODE_EMPTY_BODY,
        message: 'download failed: empty body',
        retryable: true,
      });

    const file = fs.createWriteStream(outPath);
    try {
      await new Promise<void>((resolve, reject) => {
        file.on('error', reject);
        file.on('finish', resolve);
        Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>)
          .on('error', reject)
          .pipe(file);
      });
    } catch (e) {
      throw coerceToolError(e, {
        defaultCode: TOOL_ERROR_CODE_INTERNAL_ERROR,
        defaultRetryable: false,
        defaultMessage: 'download failed while writing file',
        details: { output_path: outPath },
      });
    }
    const stat = await fsp.stat(outPath);
    return { output_path: outPath, bytes_written: stat.size };
  } finally {
    clearTimeout(t);
  }
}
