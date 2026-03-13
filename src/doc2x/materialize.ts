import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { ToolError } from '#errors';
import { TOOL_ERROR_CODE_INVALID_JSON } from '#errorCodes';

function spawnUnzip(zipPath: string, outputDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('unzip', ['-o', zipPath, '-d', outputDir], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validatePdfLayoutResult(result: unknown, uid?: string) {
  if (!isRecord(result))
    throw new ToolError({
      code: TOOL_ERROR_CODE_INVALID_JSON,
      message: 'parse result must be a JSON object',
      retryable: false,
      uid,
    });

  const pages = result.pages;
  if (!Array.isArray(pages) || pages.length === 0)
    throw new ToolError({
      code: TOOL_ERROR_CODE_INVALID_JSON,
      message: 'parse result must contain a non-empty pages array',
      retryable: false,
      uid,
    });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!isRecord(page))
      throw new ToolError({
        code: TOOL_ERROR_CODE_INVALID_JSON,
        message: `pages[${i}] must be an object`,
        retryable: false,
        uid,
      });
    if (!isRecord(page.layout))
      throw new ToolError({
        code: TOOL_ERROR_CODE_INVALID_JSON,
        message: `pages[${i}].layout must be an object`,
        retryable: false,
        uid,
      });
  }

  return { result, pageCount: pages.length, hasLayout: true as const };
}

export async function materializeConvertZip(args: {
  convert_zip_base64: string;
  output_dir: string;
}) {
  const outDir = path.resolve(args.output_dir);
  await fsp.mkdir(outDir, { recursive: true });
  const buf = Buffer.from(args.convert_zip_base64, 'base64');
  const zipPath = path.join(outDir, 'assets.zip');
  await fsp.writeFile(zipPath, buf);
  const extracted = await spawnUnzip(zipPath, outDir);
  return { output_dir: outDir, zip_path: zipPath, extracted };
}

export async function materializePdfLayoutJson(args: {
  result: unknown;
  output_path: string;
  uid?: string;
}) {
  const validated = validatePdfLayoutResult(args.result, args.uid);
  const outputPath = path.resolve(args.output_path);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${JSON.stringify(validated.result, null, 2)}\n`, 'utf8');
  return {
    uid: args.uid ?? '',
    output_path: outputPath,
    page_count: validated.pageCount,
    has_layout: validated.hasLayout,
  };
}
