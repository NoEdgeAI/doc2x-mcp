import fsp from 'node:fs/promises';
import path from 'node:path';

import _ from 'lodash';

import { CONFIG } from '#config';
import { ToolError } from '#errors';
import {
  TOOL_ERROR_CODE_INVALID_ARGUMENT,
  TOOL_ERROR_CODE_PARSE_FAILED,
  TOOL_ERROR_CODE_TIMEOUT,
} from '#errorCodes';
import { jitteredBackoffMs, sleep } from '#utils';
import { doc2xRequestJson, putToSignedUrl } from '#doc2x/client';
import { DOC2X_TASK_STATUS_FAILED, DOC2X_TASK_STATUS_SUCCESS } from '#doc2x/constants';
import { HTTP_METHOD_GET, HTTP_METHOD_POST } from '#doc2x/http';
import { v2 } from '#doc2x/paths';

function mergePagesToTextWithLimit(
  result: any,
  joinWith: string,
  limits?: { maxOutputChars?: number; maxOutputPages?: number },
): { text: string; truncated: boolean; returnedPages: number; totalPages: number } {
  const pages = _.sortBy(_.isArray(result?.pages) ? result.pages : [], (p) =>
    Number((p as any)?.page_idx ?? 0),
  );

  const maxPages =
    (limits?.maxOutputPages ?? 0) > 0 ? Number(limits?.maxOutputPages) : Number.POSITIVE_INFINITY;
  const maxChars =
    (limits?.maxOutputChars ?? 0) > 0 ? Number(limits?.maxOutputChars) : Number.POSITIVE_INFINITY;

  const parts: string[] = [];
  let used = 0;
  let returnedPages = 0;
  let truncated = false;

  for (let i = 0; i < pages.length && returnedPages < maxPages; i++) {
    const pageMd = _.toString((pages[i] as any)?.md ?? '');
    const prefix = returnedPages === 0 ? '' : joinWith;

    if (used >= maxChars) {
      truncated = true;
      break;
    }

    if (prefix) {
      if (used + prefix.length > maxChars) {
        truncated = true;
        break;
      }
      parts.push(prefix);
      used += prefix.length;
    }

    if (!pageMd) {
      returnedPages++;
      continue;
    }

    const remaining = maxChars - used;
    if (pageMd.length <= remaining) {
      parts.push(pageMd);
      used += pageMd.length;
      returnedPages++;
      continue;
    }

    parts.push(pageMd.slice(0, Math.max(0, remaining)));
    used = maxChars;
    returnedPages++;
    truncated = true;
    break;
  }

  if (!truncated && returnedPages < pages.length) truncated = true;
  return { text: parts.join(''), truncated, returnedPages, totalPages: pages.length };
}

async function preuploadPdfWithRetry(): Promise<{ uid: string; url: string }> {
  let attempt = 0;
  while (true) {
    try {
      const data = await doc2xRequestJson(HTTP_METHOD_POST, v2('/parse/preupload'));
      return { uid: String(data.uid), url: String(data.url) };
    } catch (e) {
      if (e instanceof ToolError && e.retryable) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      throw e;
    }
  }
}

export async function parsePdfSubmit(pdfPath: string): Promise<{ uid: string }> {
  const p = path.resolve(pdfPath);
  if (!p.toLowerCase().endsWith('.pdf'))
    throw new ToolError({
      code: TOOL_ERROR_CODE_INVALID_ARGUMENT,
      message: 'pdf_path must end with .pdf',
      retryable: false,
    });
  await fsp.access(p);

  let data = await preuploadPdfWithRetry();
  try {
    await putToSignedUrl(String(data.url), p);
  } catch {
    data = await preuploadPdfWithRetry();
    await putToSignedUrl(String(data.url), p);
  }
  return { uid: String(data.uid) };
}

export async function parsePdfStatus(uid: string) {
  const data = await doc2xRequestJson(HTTP_METHOD_GET, v2('/parse/status'), { query: { uid } });
  return {
    uid,
    status: String(data.status),
    progress: Number(data.progress ?? 0),
    detail: String(data.detail || ''),
    result: data.result ?? null,
  };
}

export async function parsePdfWaitTextByUid(args: {
  uid: string;
  poll_interval_ms?: number;
  max_wait_ms?: number;
  join_with?: string;
  max_output_chars?: number;
  max_output_pages?: number;
}) {
  const pollInterval = args.poll_interval_ms ?? CONFIG.pollIntervalMs;
  const maxWait = args.max_wait_ms ?? CONFIG.maxWaitMs;
  const joinWith = args.join_with ?? '\n\n---\n\n';

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
    let st: Awaited<ReturnType<typeof parsePdfStatus>>;
    try {
      st = await parsePdfStatus(uid);
      attempt = 0;
    } catch (e) {
      if (e instanceof ToolError && e.retryable) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      throw e;
    }
    if (st.status === DOC2X_TASK_STATUS_SUCCESS) {
      const merged = mergePagesToTextWithLimit(st.result, joinWith, {
        maxOutputChars: args.max_output_chars,
        maxOutputPages: args.max_output_pages,
      });
      return { uid, status: DOC2X_TASK_STATUS_SUCCESS, ...merged };
    }
    if (st.status === DOC2X_TASK_STATUS_FAILED)
      throw new ToolError({
        code: TOOL_ERROR_CODE_PARSE_FAILED,
        message: st.detail || 'parse failed',
        retryable: true,
        uid,
      });
    await sleep(pollInterval);
  }
}
