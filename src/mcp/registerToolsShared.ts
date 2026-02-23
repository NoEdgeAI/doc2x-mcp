import fsp from 'node:fs/promises';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';

import { CONVERT_FORMULA_LEVELS, type ConvertFormulaLevel } from '#doc2x/convert';
import { PARSE_PDF_MODELS, type ParsePdfModel } from '#doc2x/pdf';
import { ToolError } from '#errors';
import { TOOL_ERROR_CODE_INVALID_ARGUMENT } from '#errorCodes';
import { asErrorResult } from '#mcp/results';

export type FileSig = { absPath: string; size: number; mtimeMs: number; md5: string };
export type UidCacheState = 'submitted' | 'failed';
export type UidCacheEntry = {
  sig: FileSig;
  uid: string;
  state: UidCacheState;
  updatedAt: number;
};

export type ConvertSubmitKeyInput = {
  uid: string;
  to: 'md' | 'tex' | 'docx';
  formula_mode?: 'normal' | 'dollar';
  formula_level?: ConvertFormulaLevel;
  filename?: string;
  filename_mode?: 'auto' | 'raw';
  merge_cross_page_forms?: boolean;
};

const CACHE_MAX = 1024;
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const CACHE_FAILED_TTL = 2 * 60 * 1000; // 2 minutes
type ConvertSubmitInflightValue = Promise<unknown>;
type UidCacheKind = 'pdf' | 'image';
type FileDigestCacheEntry = { size: number; mtimeMs: number; md5: string };
const fileDigestCache = new LRUCache<string, FileDigestCacheEntry>({
  max: CACHE_MAX,
  ttl: CACHE_TTL,
});

export type RegisterToolsContext = {
  pdfUidCache: LRUCache<string, UidCacheEntry>;
  imageUidCache: LRUCache<string, UidCacheEntry>;
  convertSubmitCache: LRUCache<string, true>;
  convertSubmitInflight: Map<string, ConvertSubmitInflightValue>;
};

export function createRegisterToolsContext(): RegisterToolsContext {
  return {
    pdfUidCache: new LRUCache<string, UidCacheEntry>({
      max: CACHE_MAX,
      ttl: CACHE_TTL,
    }),
    imageUidCache: new LRUCache<string, UidCacheEntry>({
      max: CACHE_MAX,
      ttl: CACHE_TTL,
    }),
    convertSubmitCache: new LRUCache<string, true>({
      max: CACHE_MAX,
      ttl: CACHE_TTL,
    }),
    convertSubmitInflight: new Map<string, ConvertSubmitInflightValue>(),
  };
}

function pickUidCache(ctx: RegisterToolsContext, kind: UidCacheKind): LRUCache<string, UidCacheEntry> {
  return kind === 'pdf' ? ctx.pdfUidCache : ctx.imageUidCache;
}

export function getSubmittedUidFromCache(
  ctx: RegisterToolsContext,
  args: { kind: UidCacheKind; key: string; sig: FileSig },
): string {
  const cached = pickUidCache(ctx, args.kind).get(args.key);
  return cached && cached.state === 'submitted' && sameSig(cached.sig, args.sig) ? cached.uid : '';
}

export function setSubmittedUidCache(
  ctx: RegisterToolsContext,
  args: { kind: UidCacheKind; key: string; sig: FileSig; uid: string },
): void {
  pickUidCache(ctx, args.kind).set(args.key, {
    sig: args.sig,
    uid: args.uid,
    state: 'submitted',
    updatedAt: Date.now(),
  });
}

export function setFailedUidCache(
  ctx: RegisterToolsContext,
  args: { kind: UidCacheKind; key: string; sig: FileSig; uid: string },
): void {
  pickUidCache(ctx, args.kind).set(
    args.key,
    {
      sig: args.sig,
      uid: args.uid,
      state: 'failed',
      updatedAt: Date.now(),
    },
    { ttl: CACHE_FAILED_TTL },
  );
}

export function deleteUidCache(
  ctx: RegisterToolsContext,
  args: { kind: UidCacheKind; key: string },
): void {
  pickUidCache(ctx, args.kind).delete(args.key);
}

export async function runConvertSubmitAtomically<T>(
  ctx: RegisterToolsContext,
  args: { key: string; skipIfSubmitted?: boolean; submit: () => Promise<T> },
): Promise<T | undefined> {
  if (args.skipIfSubmitted && ctx.convertSubmitCache.has(args.key)) return undefined;

  const existing = ctx.convertSubmitInflight.get(args.key);
  // Safety assumption: same key always maps to same submit payload/result type.
  if (existing) return (await existing) as T;

  const pending = args
    .submit()
    .then((res) => {
      ctx.convertSubmitCache.set(args.key, true);
      return res;
    })
    .finally(() => {
      ctx.convertSubmitInflight.delete(args.key);
    });

  ctx.convertSubmitInflight.set(args.key, pending);
  return await pending;
}

export async function fileSig(p: string): Promise<FileSig> {
  const absPath = path.resolve(p);
  const st = await fsp.stat(absPath);
  const cached = fileDigestCache.get(absPath);
  if (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs) {
    return { absPath, size: st.size, mtimeMs: st.mtimeMs, md5: cached.md5 };
  }
  const md5 = await new Promise<string>((resolve, reject) => {
    const hash = createHash('md5');
    const stream = fs.createReadStream(absPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
  fileDigestCache.set(absPath, { size: st.size, mtimeMs: st.mtimeMs, md5 });
  return { absPath, size: st.size, mtimeMs: st.mtimeMs, md5 };
}

export function sameSig(a: FileSig, b: FileSig): boolean {
  if (a.absPath !== b.absPath || a.size !== b.size) return false;
  return a.md5 === b.md5;
}

function normalizeParsePdfModel(model?: ParsePdfModel): ParsePdfModel | 'v2' {
  return model ?? 'v2';
}

export function makePdfUidCacheKey(absPath: string, model?: ParsePdfModel): string {
  return JSON.stringify([absPath, normalizeParsePdfModel(model)]);
}

export function makeConvertSubmitKey(args: ConvertSubmitKeyInput): string {
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

export function missingEitherFieldError(a: string, b: string): ToolError {
  return new ToolError({
    code: TOOL_ERROR_CODE_INVALID_ARGUMENT,
    message: `Either ${a} or ${b} is required.`,
    retryable: false,
  });
}

type AnyAsyncFn = (...args: any[]) => Promise<any>;

export function withToolErrorHandling<T extends AnyAsyncFn>(
  fn: T,
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | ReturnType<typeof asErrorResult>> {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (e) {
      return asErrorResult(e);
    }
  };
}

export const nonEmptyStringSchema = z.string().trim().min(1);
export const optionalStringSchema = z.string().optional();
export const optionalNonEmptyStringSchema = z.string().trim().min(1).optional();
export const positiveIntMsSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().min(0);
export const optionalBooleanSchema = z.boolean().optional();

export const parsePdfUidSchema = z
  .string()
  .trim()
  .min(1)
  .describe('Doc2x parse task uid returned by doc2x_parse_pdf_submit.');

export const parseImageUidSchema = z
  .string()
  .trim()
  .min(1)
  .describe('Doc2x image-layout parse task uid returned by doc2x_parse_image_layout_submit.');

export const convertToSchema = z.enum(['md', 'tex', 'docx']);
export const parsePdfModelSchema = z.enum(PARSE_PDF_MODELS).optional();
export const convertFormulaModeSchema = z.enum(['normal', 'dollar']);
export const convertFilenameModeSchema = z.enum(['auto', 'raw']);
export const convertFormulaLevelValueSchema = z.union([
  z.literal(CONVERT_FORMULA_LEVELS[0]),
  z.literal(CONVERT_FORMULA_LEVELS[1]),
  z.literal(CONVERT_FORMULA_LEVELS[2]),
]);

const absolutePathSchema = nonEmptyStringSchema.refine((v) => path.isAbsolute(v), {
  message: 'Path must be absolute.',
});

export const pdfPathSchema = absolutePathSchema
  .refine((v) => v.toLowerCase().endsWith('.pdf'), {
    message: "Path must end with '.pdf'.",
  })
  .describe(
  "Absolute path to a local PDF file. Use an absolute path (relative paths are resolved from the MCP server process cwd, which may be '/'). Must end with '.pdf'.",
);

const imagePathBaseSchema = absolutePathSchema.refine((v) => /\.(png|jpe?g)$/i.test(v), {
  message: 'Path must point to a png/jpg/jpeg file.',
});

export const imagePathSchema = imagePathBaseSchema.describe(
  "Absolute path to a local image file (png/jpg). Use an absolute path (relative paths are resolved from the MCP server process cwd, which may be '/').",
);

export const imagePathForWaitSchema = imagePathBaseSchema.describe(
  'Absolute path to a local image file (png/jpg). Used to reuse cached uid or submit a new async task.',
);

export const pdfPathForWaitSchema = pdfPathSchema.describe(
  'Absolute path to a local PDF file. If uid is not provided, this tool will reuse cached uid (if any) or submit a new task.',
);

export const outputPathSchema = absolutePathSchema.describe(
  'Absolute path for the output file. The file will be overwritten if it exists.',
);

export const doc2xDownloadUrlSchema = z
  .string()
  .trim()
  .pipe(z.url())
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'URL protocol must be http or https.')
  .describe(
  "A URL returned by doc2x_convert_export_result (may contain escaped '\\u0026').",
);

export const convertZipBase64Schema = nonEmptyStringSchema;
export const outputDirSchema = nonEmptyStringSchema;
export const joinWithSchema = optionalStringSchema;
export const convertFilenameSchema = optionalNonEmptyStringSchema;
