import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fsp from 'node:fs/promises';
import path from 'node:path';
import _ from 'lodash';
import { z } from 'zod';

import { CONFIG, RESOLVED_KEY, parseDownloadUrlAllowlist } from '#config';
import {
  CONVERT_FORMULA_LEVELS,
  type ConvertFormulaLevel,
  convertExportResult,
  convertExportSubmit,
  convertExportWaitByUid,
} from '#doc2x/convert';
import { downloadUrlToFile } from '#doc2x/download';
import {
  parseImageLayoutStatus,
  parseImageLayoutSubmit,
  parseImageLayoutSync,
  parseImageLayoutWaitTextByUid,
} from '#doc2x/image';
import { materializeConvertZip } from '#doc2x/materialize';
import {
  PARSE_PDF_MODELS,
  type ParsePdfModel,
  parsePdfStatus,
  parsePdfSubmit,
  parsePdfWaitTextByUid,
} from '#doc2x/pdf';
import { ToolError } from '#errors';
import { TOOL_ERROR_CODE_INVALID_ARGUMENT } from '#errorCodes';
import { asErrorResult, asJsonResult, asTextResult } from '#mcp/results';

type FileSig = { absPath: string; size: number; mtimeMs: number };
type ConvertSubmitKeyInput = {
  uid: string;
  to: 'md' | 'tex' | 'docx';
  formula_mode?: 'normal' | 'dollar';
  formula_level?: ConvertFormulaLevel;
  filename?: string;
  filename_mode?: 'auto' | 'raw';
  merge_cross_page_forms?: boolean;
};

async function fileSig(p: string): Promise<FileSig> {
  const absPath = path.resolve(p);
  const st = await fsp.stat(absPath);
  return { absPath, size: st.size, mtimeMs: st.mtimeMs };
}

function sameSig(a: FileSig, b: FileSig): boolean {
  return a.absPath === b.absPath && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

function normalizeParsePdfModel(model?: ParsePdfModel): ParsePdfModel | 'v2' {
  return model ?? 'v2';
}

function makePdfUidCacheKey(absPath: string, model?: ParsePdfModel): string {
  return JSON.stringify([absPath, normalizeParsePdfModel(model)]);
}

function makeConvertSubmitKey(args: ConvertSubmitKeyInput): string {
  return JSON.stringify({
    uid: args.uid,
    to: args.to,
    formula_mode: args.formula_mode ?? null,
    formula_level: args.formula_level ?? null,
    filename: args.filename ?? null,
    filename_mode: args.filename_mode ?? null,
    merge_cross_page_forms: args.merge_cross_page_forms ?? null,
  });
}

export function registerTools(server: McpServer) {
  const pdfUidCache = new Map<string, { sig: FileSig; uid: string }>();
  const imageUidCache = new Map<string, { sig: FileSig; uid: string }>();
  const convertSubmitCache = new Set<string>();

  server.registerTool(
    'doc2x_parse_pdf_submit',
    {
      description:
        'Create a Doc2x PDF parse task for a local file and return {uid}. Prefer calling doc2x_parse_pdf_status to monitor progress/result; only call doc2x_parse_pdf_wait_text if the user explicitly asks to wait/return merged text.',
      inputSchema: {
        pdf_path: z
          .string()
          .min(1)
          .describe(
            "Absolute path to a local PDF file. Use an absolute path (relative paths are resolved from the MCP server process cwd, which may be '/'). Must end with '.pdf'.",
          ),
        model: z
          .enum(PARSE_PDF_MODELS)
          .optional()
          .describe(
            "Optional parse model. Use 'v3-2026' to try the latest model. Omit this field to use default v2.",
          ),
      },
    },
    async ({ pdf_path, model }: { pdf_path: string; model?: ParsePdfModel }) => {
      try {
        const sig = await fileSig(pdf_path);
        const res = await parsePdfSubmit(pdf_path, { model });
        pdfUidCache.set(makePdfUidCacheKey(sig.absPath, model), { sig, uid: res.uid });
        return asJsonResult(res);
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_parse_pdf_status',
    {
      description:
        'Query parse task status by uid. Returns {status, progress, detail}. status is one of processing/failed/success; progress is an integer 0..100; detail is populated only when status=failed. Fetch parsed content via doc2x_convert_export_*.',
      inputSchema: {
        uid: z.string().min(1).describe('Doc2x parse task uid returned by doc2x_parse_pdf_submit.'),
      },
    },
    async (args: { uid: string }) => {
      try {
        const st = await parsePdfStatus(args.uid);
        return asJsonResult({ status: st.status, progress: st.progress, detail: st.detail });
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_parse_pdf_wait_text',
    {
      description:
        'Wait for a PDF parse task until success and return merged text. Prefer passing uid (no re-submit). If only pdf_path is provided, it will (a) reuse an in-process cached uid if available, otherwise (b) submit a new task then wait.',
      inputSchema: {
        uid: z
          .string()
          .min(1)
          .optional()
          .describe('Doc2x parse task uid returned by doc2x_parse_pdf_submit.'),
        pdf_path: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Absolute path to a local PDF file. If uid is not provided, this tool will reuse cached uid (if any) or submit a new task.',
          ),
        poll_interval_ms: z.number().int().positive().optional(),
        max_wait_ms: z.number().int().positive().optional(),
        join_with: z.string().optional(),
        max_output_chars: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'Max characters of returned text (0 = unlimited). Useful to avoid LLM context overflow. Default can be set via env DOC2X_PARSE_PDF_MAX_OUTPUT_CHARS.',
          ),
        max_output_pages: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'Max pages to merge into returned text (0 = unlimited). Default can be set via env DOC2X_PARSE_PDF_MAX_OUTPUT_PAGES.',
          ),
        model: z
          .enum(PARSE_PDF_MODELS)
          .optional()
          .describe(
            "Optional parse model used only when submitting from pdf_path. Use 'v3-2026' to try latest model. Omit this field to use default v2.",
          ),
      },
    },
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
      try {
        const maxOutputChars = args.max_output_chars ?? CONFIG.parsePdfMaxOutputChars;
        const maxOutputPages = args.max_output_pages ?? CONFIG.parsePdfMaxOutputPages;
        const appendNotice = (text: string, notice: string) => {
          if (maxOutputChars <= 0) return text + notice;
          if (text.length + notice.length <= maxOutputChars) return text + notice;
          const keep = _.clamp(maxOutputChars - notice.length, 0, maxOutputChars);
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
        if (!pdfPath) {
          return asErrorResult(
            new ToolError({
              code: TOOL_ERROR_CODE_INVALID_ARGUMENT,
              message: 'Either uid or pdf_path is required.',
              retryable: false,
            }),
          );
        }

        const sig = await fileSig(pdfPath);
        const model = args.model;
        const cacheKey = makePdfUidCacheKey(sig.absPath, model);
        const cached = pdfUidCache.get(cacheKey);
        const resolvedUid = cached && sameSig(cached.sig, sig) ? cached.uid : '';
        const finalUid = resolvedUid || (await parsePdfSubmit(pdfPath, { model })).uid;
        pdfUidCache.set(cacheKey, { sig, uid: finalUid });

        const out = await parsePdfWaitTextByUid({
          uid: finalUid,
          poll_interval_ms: args.poll_interval_ms,
          max_wait_ms: args.max_wait_ms,
          join_with: args.join_with,
          max_output_chars: maxOutputChars,
          max_output_pages: maxOutputPages,
        });
        const notice = out.truncated ? truncationNotice(out) : '';
        return asTextResult(notice ? appendNotice(out.text, notice) : out.text);
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_convert_export_submit',
    {
      description:
        'Start an export (convert) job for a parsed PDF uid. After this, poll with doc2x_convert_export_wait or doc2x_convert_export_result. Do NOT call doc2x_convert_export_submit twice for the same uid+format in parallel.',
      inputSchema: {
        uid: z.string().min(1).describe('Doc2x parse task uid returned by doc2x_parse_pdf_submit.'),
        to: z.enum(['md', 'tex', 'docx']),
        formula_mode: z.enum(['normal', 'dollar']),
        formula_level: z
          .union([
            z.literal(CONVERT_FORMULA_LEVELS[0]),
            z.literal(CONVERT_FORMULA_LEVELS[1]),
            z.literal(CONVERT_FORMULA_LEVELS[2]),
          ])
          .optional()
          .describe(
            'Optional formula degradation level. Effective only when source parse uses model=v3-2026 (ignored by v2). 0: keep formulas, 1: degrade inline formulas, 2: degrade inline and block formulas.',
          ),
        filename: z
          .string()
          .describe(
            "Optional output filename (for md/tex only). Tip: pass a basename WITHOUT extension to avoid getting 'name.md.md' / 'name.tex.tex'.",
          )
          .optional(),
        filename_mode: z
          .enum(['auto', 'raw'])
          .describe(
            "How to treat filename. 'auto' strips common extensions for the target format; 'raw' passes basename as-is.",
          )
          .optional(),
        merge_cross_page_forms: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        const key = makeConvertSubmitKey(args);
        const res = await convertExportSubmit(args);
        convertSubmitCache.add(key);
        return asJsonResult(res);
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_convert_export_result',
    {
      description:
        'Get the latest export (convert) result for a parsed PDF uid (may contain an escaped URL).',
      inputSchema: {
        uid: z.string().min(1).describe('Doc2x parse task uid returned by doc2x_parse_pdf_submit.'),
      },
    },
    async ({ uid }) => {
      try {
        return asJsonResult(await convertExportResult(uid));
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_convert_export_wait',
    {
      description:
        'Wait for an export job to finish. Prefer calling doc2x_convert_export_submit first, then wait with uid+to. For backward compatibility, if formula_mode is provided and this job was not submitted in-process, this tool will submit once then wait.',
      inputSchema: {
        uid: z.string().min(1).describe('Doc2x parse task uid returned by doc2x_parse_pdf_submit.'),
        to: z
          .enum(['md', 'tex', 'docx'])
          .describe('Expected target format. Used to verify the result URL.'),
        formula_mode: z.enum(['normal', 'dollar']).optional(),
        formula_level: z
          .union([
            z.literal(CONVERT_FORMULA_LEVELS[0]),
            z.literal(CONVERT_FORMULA_LEVELS[1]),
            z.literal(CONVERT_FORMULA_LEVELS[2]),
          ])
          .optional()
          .describe(
            'Optional formula degradation level used when this tool auto-submits export (formula_mode must be provided). Effective only when source parse uses model=v3-2026 (ignored by v2).',
          ),
        filename: z.string().optional(),
        filename_mode: z.enum(['auto', 'raw']).optional(),
        merge_cross_page_forms: z.boolean().optional(),
        poll_interval_ms: z.number().int().positive().optional(),
        max_wait_ms: z.number().int().positive().optional(),
      },
    },
    async (args: {
      uid: string;
      to: 'md' | 'tex' | 'docx';
      formula_mode?: 'normal' | 'dollar';
      formula_level?: ConvertFormulaLevel;
      filename?: string;
      filename_mode?: 'auto' | 'raw';
      merge_cross_page_forms?: boolean;
      poll_interval_ms?: number;
      max_wait_ms?: number;
    }) => {
      try {
        if (args.formula_mode) {
          const key = makeConvertSubmitKey(args);
          if (!convertSubmitCache.has(key)) {
            await convertExportSubmit({
              uid: args.uid,
              to: args.to,
              formula_mode: args.formula_mode,
              formula_level: args.formula_level,
              filename: args.filename,
              filename_mode: args.filename_mode,
              merge_cross_page_forms: args.merge_cross_page_forms,
            });
            convertSubmitCache.add(key);
          }
        }
        return asJsonResult(await convertExportWaitByUid(args));
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_download_url_to_file',
    {
      description:
        'Download a Doc2x-provided URL (e.g. from doc2x_convert_export_result) to a local file path.',
      inputSchema: {
        url: z
          .string()
          .min(1)
          .describe(
            "A URL returned by doc2x_convert_export_result (may contain escaped '\\u0026').",
          ),
        output_path: z
          .string()
          .min(1)
          .describe(
            'Absolute path for the output file. The file will be overwritten if it exists.',
          ),
      },
    },
    async (args) => {
      try {
        return asJsonResult(await downloadUrlToFile(args));
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_parse_image_layout_sync',
    {
      description:
        'Parse an image layout synchronously and return the raw Doc2x result JSON (including convert_zip when present).',
      inputSchema: {
        image_path: z
          .string()
          .min(1)
          .describe(
            "Absolute path to a local image file (png/jpg). Use an absolute path (relative paths are resolved from the MCP server process cwd, which may be '/').",
          ),
      },
    },
    async ({ image_path }) => {
      try {
        return asJsonResult(await parseImageLayoutSync(image_path));
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_parse_image_layout_submit',
    {
      description:
        'Create an async image-layout parse task and return {uid}. After this, call doc2x_parse_image_layout_wait_text (with uid) or doc2x_parse_image_layout_status.',
      inputSchema: {
        image_path: z
          .string()
          .min(1)
          .describe(
            "Absolute path to a local image file (png/jpg). Use an absolute path (relative paths are resolved from the MCP server process cwd, which may be '/').",
          ),
      },
    },
    async ({ image_path }) => {
      try {
        const sig = await fileSig(image_path);
        const res = await parseImageLayoutSubmit(image_path);
        imageUidCache.set(sig.absPath, { sig, uid: res.uid });
        return asJsonResult(res);
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_parse_image_layout_status',
    {
      description: 'Get status/result for an existing async image-layout parse task by uid.',
      inputSchema: {
        uid: z
          .string()
          .min(1)
          .describe(
            'Doc2x image-layout parse task uid returned by doc2x_parse_image_layout_submit.',
          ),
      },
    },
    async ({ uid }) => {
      try {
        return asJsonResult(await parseImageLayoutStatus(uid));
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_parse_image_layout_wait_text',
    {
      description:
        'Wait for an image-layout parse task until success, returning first page markdown. Prefer passing uid (no re-submit). If only image_path is provided, it will (a) reuse an in-process cached uid if available, otherwise (b) submit a new async task then wait.',
      inputSchema: {
        uid: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Doc2x image-layout parse task uid returned by doc2x_parse_image_layout_submit.',
          ),
        image_path: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Absolute path to a local image file (png/jpg). Used to reuse cached uid or submit a new async task.',
          ),
        poll_interval_ms: z.number().int().positive().optional(),
        max_wait_ms: z.number().int().positive().optional(),
      },
    },
    async (args: {
      uid?: string;
      image_path?: string;
      poll_interval_ms?: number;
      max_wait_ms?: number;
    }) => {
      try {
        const uid = String(args.uid || '').trim();
        if (uid) {
          const out = await parseImageLayoutWaitTextByUid({
            uid,
            poll_interval_ms: args.poll_interval_ms,
            max_wait_ms: args.max_wait_ms,
          });
          return asTextResult(out.text);
        }

        const imagePath = String(args.image_path || '').trim();
        if (!imagePath) {
          return asErrorResult(
            new ToolError({
              code: TOOL_ERROR_CODE_INVALID_ARGUMENT,
              message: 'Either uid or image_path is required.',
              retryable: false,
            }),
          );
        }

        const sig = await fileSig(imagePath);
        const cached = imageUidCache.get(sig.absPath);
        const resolvedUid = cached && sameSig(cached.sig, sig) ? cached.uid : '';
        const finalUid = resolvedUid || (await parseImageLayoutSubmit(imagePath)).uid;
        imageUidCache.set(sig.absPath, { sig, uid: finalUid });

        const out = await parseImageLayoutWaitTextByUid({
          uid: finalUid,
          poll_interval_ms: args.poll_interval_ms,
          max_wait_ms: args.max_wait_ms,
        });
        return asTextResult(out.text);
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_materialize_convert_zip',
    {
      description:
        'Materialize convert_zip (base64) into output_dir. Best-effort: tries system unzip first; otherwise writes the zip file.',
      inputSchema: { convert_zip_base64: z.string().min(1), output_dir: z.string().min(1) },
    },
    async (args) => {
      try {
        return asJsonResult(
          await materializeConvertZip({
            convert_zip_base64: args.convert_zip_base64,
            output_dir: args.output_dir,
          }),
        );
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );

  server.registerTool(
    'doc2x_debug_config',
    {
      description: 'Debug helper: return resolved config and API key source for troubleshooting.',
      inputSchema: {},
    },
    async () => {
      try {
        return asJsonResult({
          baseUrl: CONFIG.baseUrl,
          apiKeySource: RESOLVED_KEY.source,
          apiKeyLen: CONFIG.apiKey.length,
          apiKeyPrefix: CONFIG.apiKey ? CONFIG.apiKey.slice(0, 6) : '',
          pollIntervalMs: CONFIG.pollIntervalMs,
          httpTimeoutMs: CONFIG.httpTimeoutMs,
          maxWaitMs: CONFIG.maxWaitMs,
          parsePdfMaxOutputChars: CONFIG.parsePdfMaxOutputChars,
          parsePdfMaxOutputPages: CONFIG.parsePdfMaxOutputPages,
          downloadUrlAllowlist: parseDownloadUrlAllowlist(),
        });
      } catch (e) {
        return asErrorResult(e);
      }
    },
  );
}
