import fsp from 'node:fs/promises';
import path from 'node:path';

import { CONFIG } from '#config';
import { ToolError } from '#errors';
import {
  TOOL_ERROR_CODE_FILE_TOO_LARGE,
  TOOL_ERROR_CODE_INVALID_ARGUMENT,
  TOOL_ERROR_CODE_PARSE_FAILED,
  TOOL_ERROR_CODE_TIMEOUT,
} from '#errorCodes';
import { jitteredBackoffMs, sleep } from '#utils';
import { doc2xRequestJson } from '#doc2x/client';
import { DOC2X_TASK_STATUS_FAILED, DOC2X_TASK_STATUS_SUCCESS } from '#doc2x/constants';
import { HTTP_METHOD_GET, HTTP_METHOD_POST } from '#doc2x/http';
import { v2 } from '#doc2x/paths';

async function readFileChecked(filePath: string, maxBytes: number): Promise<Buffer> {
  const p = path.resolve(filePath);
  const st = await fsp.stat(p);
  if (st.size > maxBytes)
    throw new ToolError({
      code: TOOL_ERROR_CODE_FILE_TOO_LARGE,
      message: `file too large: ${st.size} bytes`,
      retryable: false,
    });
  return await fsp.readFile(p);
}

export async function parseImageLayoutSync(imagePath: string) {
  const buf = await readFileChecked(imagePath, 7 * 1024 * 1024);
  const data = await doc2xRequestJson(HTTP_METHOD_POST, v2('/parse/img/layout'), {
    raw_body: new Uint8Array(buf),
  });
  return { uid: String(data.uid), result: data.result, convert_zip: data.convert_zip ?? null };
}

export async function parseImageLayoutSubmit(imagePath: string) {
  const buf = await readFileChecked(imagePath, 7 * 1024 * 1024);
  const data = await doc2xRequestJson(HTTP_METHOD_POST, v2('/async/parse/img/layout'), {
    raw_body: new Uint8Array(buf),
  });
  return { uid: String(data.uid) };
}

export async function parseImageLayoutStatus(uid: string) {
  const data = await doc2xRequestJson(HTTP_METHOD_GET, v2('/parse/img/layout/status'), {
    query: { uid },
  });
  return {
    uid,
    status: String(data.status),
    result: data.result ?? null,
    convert_zip: data.convert_zip ?? null,
  };
}

export async function parseImageLayoutWaitTextByUid(args: {
  uid: string;
  poll_interval_ms?: number;
  max_wait_ms?: number;
}) {
  const pollInterval = args.poll_interval_ms ?? CONFIG.pollIntervalMs;
  const maxWait = args.max_wait_ms ?? Math.min(CONFIG.maxWaitMs, 300_000);
  const uid = String(args.uid || '').trim();
  if (!uid)
    throw new ToolError({
      code: TOOL_ERROR_CODE_INVALID_ARGUMENT,
      message: 'uid is required',
      retryable: false,
    });

  const start = Date.now();
  let attempt = 0;
  while (true) {
    if (Date.now() - start > maxWait)
      throw new ToolError({
        code: TOOL_ERROR_CODE_TIMEOUT,
        message: `wait timeout after ${maxWait}ms`,
        retryable: true,
        uid,
      });
    let st: Awaited<ReturnType<typeof parseImageLayoutStatus>>;
    try {
      st = await parseImageLayoutStatus(uid);
      attempt = 0;
    } catch (e) {
      if (e instanceof ToolError && e.retryable) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      throw e;
    }
    if (st.status === DOC2X_TASK_STATUS_SUCCESS) {
      const md = String(st?.result?.pages?.[0]?.md || '');
      return { uid, status: DOC2X_TASK_STATUS_SUCCESS, text: md };
    }
    if (st.status === DOC2X_TASK_STATUS_FAILED)
      throw new ToolError({
        code: TOOL_ERROR_CODE_PARSE_FAILED,
        message: 'parse failed',
        retryable: true,
        uid,
      });
    await sleep(pollInterval);
  }
}
