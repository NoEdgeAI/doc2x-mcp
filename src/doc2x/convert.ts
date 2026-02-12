import path from 'node:path';

import { CONFIG } from '#config';
import { ToolError } from '#errors';
import { TOOL_ERROR_CODE_CONVERT_FAILED, TOOL_ERROR_CODE_TIMEOUT } from '#errorCodes';
import { jitteredBackoffMs, sleep } from '#utils';
import { doc2xRequestJson, normalizeUrl } from '#doc2x/client';
import { DOC2X_TASK_STATUS_FAILED, DOC2X_TASK_STATUS_SUCCESS } from '#doc2x/constants';
import { HTTP_METHOD_GET, HTTP_METHOD_POST } from '#doc2x/http';
import { v2 } from '#doc2x/paths';

type ExportFilenameMode = 'auto' | 'raw';
export const CONVERT_FORMULA_LEVELS = [0, 1, 2] as const;
export type ConvertFormulaLevel = (typeof CONVERT_FORMULA_LEVELS)[number];

function normalizeExportFilename(
  filename: string,
  to: 'md' | 'tex' | 'docx',
  mode: ExportFilenameMode,
): string {
  const v = String(filename).trim();
  if (!v) return v;
  const base = path.basename(v);
  if (mode === 'raw') return base;
  if (to === 'md') return base.replace(/\.md$/i, '');
  if (to === 'tex') return base.replace(/\.tex$/i, '');
  if (to === 'docx') return base.replace(/\.docx$/i, '');
  return base;
}

function exportUrlLooksLike(url: string, to: 'md' | 'tex' | 'docx'): boolean {
  const u = String(url || '').toLowerCase();
  if (!u) return false;
  if (to === 'docx') return u.includes('convert_docx');
  return u.includes(`convert_${to}_`);
}

export async function convertExportSubmit(args: {
  uid: string;
  to: 'md' | 'tex' | 'docx';
  formula_mode: 'normal' | 'dollar';
  formula_level?: ConvertFormulaLevel;
  filename?: string;
  merge_cross_page_forms?: boolean;
  filename_mode?: ExportFilenameMode;
}) {
  const body: any = {
    uid: args.uid,
    to: args.to,
    formula_mode: args.formula_mode,
  };
  if (args.formula_level != null) body.formula_level = args.formula_level;
  if (args.merge_cross_page_forms != null)
    body.merge_cross_page_forms = args.merge_cross_page_forms;
  if (args.filename != null)
    body.filename = normalizeExportFilename(args.filename, args.to, args.filename_mode ?? 'auto');

  const data = await doc2xRequestJson(HTTP_METHOD_POST, v2('/convert/parse'), { body });
  return { uid: args.uid, status: String(data.status), url: String(data.url || '') };
}

export async function convertExportResult(uid: string) {
  const data = await doc2xRequestJson(HTTP_METHOD_GET, v2('/convert/parse/result'), {
    query: { uid },
  });
  return { uid, status: String(data.status), url: data.url ? normalizeUrl(String(data.url)) : '' };
}

export async function convertExportWaitByUid(args: {
  uid: string;
  to: 'md' | 'tex' | 'docx';
  poll_interval_ms?: number;
  max_wait_ms?: number;
}) {
  const pollInterval = args.poll_interval_ms ?? CONFIG.pollIntervalMs;
  const maxWait = args.max_wait_ms ?? CONFIG.maxWaitMs;

  const start = Date.now();
  let attempt = 0;
  while (true) {
    if (Date.now() - start > maxWait) {
      throw new ToolError({
        code: TOOL_ERROR_CODE_TIMEOUT,
        message: `wait timeout after ${maxWait}ms (hint: exports for the same uid should be run sequentially, not in parallel)`,
        retryable: true,
        uid: args.uid,
      });
    }

    let st: Awaited<ReturnType<typeof convertExportResult>>;
    try {
      st = await convertExportResult(args.uid);
      attempt = 0;
    } catch (e) {
      if (e instanceof ToolError && e.retryable) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      throw e;
    }

    if (st.status === DOC2X_TASK_STATUS_SUCCESS) {
      if (st.url && exportUrlLooksLike(st.url, args.to)) return st;
      await sleep(pollInterval);
      continue;
    }
    if (st.status === DOC2X_TASK_STATUS_FAILED)
      throw new ToolError({
        code: TOOL_ERROR_CODE_CONVERT_FAILED,
        message: 'convert failed',
        retryable: true,
        uid: args.uid,
      });
    await sleep(pollInterval);
  }
}
