import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CONFIG } from '#config';
import { isRetryableError } from '#errors';
import {
  type ParsePdfModel,
  parsePdfStatus,
  parsePdfSubmit,
  parsePdfWaitTextByUid,
} from '#doc2x/pdf';
import { asJsonResult, asTextResult } from '#mcp/results';
import {
  deleteUidCache,
  fileSig,
  getSubmittedUidFromCache,
  joinWithSchema,
  makePdfUidCacheKey,
  missingEitherFieldError,
  nonNegativeIntSchema,
  parsePdfModelSchema,
  parsePdfUidSchema,
  pdfPathForWaitSchema,
  pdfPathSchema,
  positiveIntMsSchema,
  setFailedUidCache,
  setSubmittedUidCache,
  type RegisterToolsContext,
  withToolErrorHandling,
} from '#mcp/registerToolsShared';

export function registerPdfTools(server: McpServer, ctx: RegisterToolsContext) {
  server.registerTool(
    'doc2x_parse_pdf_submit',
    {
      description:
        'Create a Doc2x PDF parse task for a local file and return {uid}. Prefer calling doc2x_parse_pdf_status to monitor progress/result; only call doc2x_parse_pdf_wait_text if the user explicitly asks to wait/return merged text.',
      inputSchema: {
        pdf_path: pdfPathSchema,
        model: parsePdfModelSchema.describe(
          "Optional parse model. Use 'v3-2026' to try the latest model. Omit this field to use default v2.",
        ),
      },
    },
    withToolErrorHandling(async ({ pdf_path, model }: { pdf_path: string; model?: ParsePdfModel }) => {
      const sig = await fileSig(pdf_path);
      const res = await parsePdfSubmit(pdf_path, { model });
      setSubmittedUidCache(ctx, {
        kind: 'pdf',
        key: makePdfUidCacheKey(sig.absPath, model),
        sig,
        uid: res.uid,
      });
      return asJsonResult(res);
    }),
  );

  server.registerTool(
    'doc2x_parse_pdf_status',
    {
      description:
        'Query parse task status by uid. Returns {status, progress, detail}. status is one of processing/failed/success; progress is an integer 0..100; detail is populated only when status=failed. Fetch parsed content via doc2x_convert_export_*.',
      inputSchema: {
        uid: parsePdfUidSchema,
      },
    },
    withToolErrorHandling(async (args: { uid: string }) => {
      const st = await parsePdfStatus(args.uid);
      return asJsonResult({ status: st.status, progress: st.progress, detail: st.detail });
    }),
  );

  server.registerTool(
    'doc2x_parse_pdf_wait_text',
    {
      description:
        'Wait for a PDF parse task until success and return merged text. Prefer passing uid (no re-submit). If only pdf_path is provided, it will (a) reuse an in-process cached uid if available, otherwise (b) submit a new task then wait.',
      inputSchema: {
        uid: parsePdfUidSchema.optional(),
        pdf_path: pdfPathForWaitSchema.optional(),
        poll_interval_ms: positiveIntMsSchema.optional(),
        max_wait_ms: positiveIntMsSchema.optional(),
        join_with: joinWithSchema,
        max_output_chars: nonNegativeIntSchema
          .optional()
          .describe(
            'Max characters of returned text (0 = unlimited). Useful to avoid LLM context overflow. Default can be set via env DOC2X_PARSE_PDF_MAX_OUTPUT_CHARS.',
          ),
        max_output_pages: nonNegativeIntSchema
          .optional()
          .describe(
            'Max pages to merge into returned text (0 = unlimited). Default can be set via env DOC2X_PARSE_PDF_MAX_OUTPUT_PAGES.',
          ),
        model: parsePdfModelSchema
          .describe(
            "Optional parse model used only when submitting from pdf_path. Use 'v3-2026' to try latest model. Omit this field to use default v2.",
          ),
      },
    },
    withToolErrorHandling(
      async (args: {
        uid?: string;
        pdf_path?: string;
        poll_interval_ms?: number;
        max_wait_ms?: number;
        join_with?: string;
        max_output_chars?: number;
        max_output_pages?: number;
        model?: ParsePdfModel;
      }) => {
        const maxOutputChars = args.max_output_chars ?? CONFIG.parsePdfMaxOutputChars;
        const maxOutputPages = args.max_output_pages ?? CONFIG.parsePdfMaxOutputPages;
        const appendNotice = (text: string, notice: string) => {
          if (maxOutputChars <= 0) return text + notice;
          if (text.length + notice.length <= maxOutputChars) return text + notice;
          const keep = Math.min(Math.max(maxOutputChars - notice.length, 0), maxOutputChars);
          if (keep <= 0) return notice.slice(0, maxOutputChars);
          return text.slice(0, keep) + notice;
        };
        const truncationNotice = (o: { uid: string; returnedPages: number; totalPages: number }) =>
          `\n\n---\n[doc2x-mcp] Output truncated (pages ${o.returnedPages}/${o.totalPages}, uid=${o.uid}). Fetch full markdown via doc2x_convert_export_* (to=md).\n`;

        const uid = String(args.uid || '').trim();
        if (uid) {
          const out = await parsePdfWaitTextByUid({
            uid,
            poll_interval_ms: args.poll_interval_ms,
            max_wait_ms: args.max_wait_ms,
            join_with: args.join_with,
            max_output_chars: maxOutputChars,
            max_output_pages: maxOutputPages,
          });
          const notice = out.truncated ? truncationNotice(out) : '';
          return asTextResult(notice ? appendNotice(out.text, notice) : out.text);
        }

        const pdfPath = String(args.pdf_path || '').trim();
        if (!pdfPath) throw missingEitherFieldError('uid', 'pdf_path');

        const sig = await fileSig(pdfPath);
        const model = args.model;
        const cacheKey = makePdfUidCacheKey(sig.absPath, model);
        const resolvedUid = getSubmittedUidFromCache(ctx, { kind: 'pdf', key: cacheKey, sig });
        const finalUid = resolvedUid || (await parsePdfSubmit(pdfPath, { model })).uid;
        setSubmittedUidCache(ctx, { kind: 'pdf', key: cacheKey, sig, uid: finalUid });

        const waitByUid = async (uid: string) =>
          parsePdfWaitTextByUid({
            uid,
            poll_interval_ms: args.poll_interval_ms,
            max_wait_ms: args.max_wait_ms,
            join_with: args.join_with,
            max_output_chars: maxOutputChars,
            max_output_pages: maxOutputPages,
          });

        const markFailed = (uid: string) =>
          setFailedUidCache(ctx, { kind: 'pdf', key: cacheKey, sig, uid });

        try {
          const out = await waitByUid(finalUid);
          const notice = out.truncated ? truncationNotice(out) : '';
          return asTextResult(notice ? appendNotice(out.text, notice) : out.text);
        } catch (e) {
          if (!resolvedUid) {
            markFailed(finalUid);
            throw e;
          }

          deleteUidCache(ctx, { kind: 'pdf', key: cacheKey });
          if (!isRetryableError(e)) {
            markFailed(finalUid);
            throw e;
          }

          const retryUid = (await parsePdfSubmit(pdfPath, { model })).uid;
          setSubmittedUidCache(ctx, { kind: 'pdf', key: cacheKey, sig, uid: retryUid });
          try {
            const out = await waitByUid(retryUid);
            const notice = out.truncated ? truncationNotice(out) : '';
            return asTextResult(notice ? appendNotice(out.text, notice) : out.text);
          } catch (retryErr) {
            markFailed(retryUid);
            throw retryErr;
          }
        }
      },
    ),
  );
}
