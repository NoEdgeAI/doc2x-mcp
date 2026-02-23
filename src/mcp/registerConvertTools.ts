import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  type ConvertFormulaLevel,
  convertExportResult,
  convertExportSubmit,
  convertExportWaitByUid,
} from '#doc2x/convert';
import { asJsonResult } from '#mcp/results';
import {
  convertFilenameModeSchema,
  convertFilenameSchema,
  convertFormulaLevelValueSchema,
  convertFormulaModeSchema,
  convertToSchema,
  makeConvertSubmitKey,
  optionalBooleanSchema,
  parsePdfUidSchema,
  positiveIntMsSchema,
  runConvertSubmitAtomically,
  type RegisterToolsContext,
  withToolErrorHandling,
} from '#mcp/registerToolsShared';

export function registerConvertTools(server: McpServer, ctx: RegisterToolsContext) {
  type ConvertSubmitArgs = {
    uid: string;
    to: 'md' | 'tex' | 'docx';
    formula_mode: 'normal' | 'dollar';
    formula_level?: ConvertFormulaLevel;
    filename?: string;
    filename_mode?: 'auto' | 'raw';
    merge_cross_page_forms?: boolean;
  };

  const submitConvertWithDedup = async (
    args: ConvertSubmitArgs,
    opts?: { skipIfSubmitted?: boolean },
  ): Promise<Awaited<ReturnType<typeof convertExportSubmit>> | undefined> => {
    const key = makeConvertSubmitKey(args);
    return await runConvertSubmitAtomically(ctx, {
      key,
      skipIfSubmitted: opts?.skipIfSubmitted,
      submit: () => convertExportSubmit(args),
    });
  };

  server.registerTool(
    'doc2x_convert_export_submit',
    {
      description:
        'Start an export (convert) job for a parsed PDF uid. After this, poll with doc2x_convert_export_wait or doc2x_convert_export_result. Do NOT call doc2x_convert_export_submit twice for the same uid+format in parallel.',
      inputSchema: {
        uid: parsePdfUidSchema,
        to: convertToSchema,
        formula_mode: convertFormulaModeSchema,
        formula_level: convertFormulaLevelValueSchema
          .optional()
          .describe(
            'Optional formula degradation level. Effective only when source parse uses model=v3-2026 (ignored by v2). 0: keep formulas, 1: degrade inline formulas, 2: degrade inline and block formulas.',
          ),
        filename: convertFilenameSchema
          .describe(
            "Optional output filename (for md/tex only). Tip: pass a basename WITHOUT extension to avoid getting 'name.md.md' / 'name.tex.tex'.",
          ),
        filename_mode: convertFilenameModeSchema
          .describe(
            "How to treat filename. 'auto' strips common extensions for the target format; 'raw' passes basename as-is.",
          )
          .optional(),
        merge_cross_page_forms: optionalBooleanSchema,
      },
    },
    withToolErrorHandling(async (args: ConvertSubmitArgs) => asJsonResult(await submitConvertWithDedup(args))),
  );

  server.registerTool(
    'doc2x_convert_export_result',
    {
      description:
        'Get the latest export (convert) result for a parsed PDF uid (may contain an escaped URL).',
      inputSchema: {
        uid: parsePdfUidSchema,
      },
    },
    withToolErrorHandling(async ({ uid }) => asJsonResult(await convertExportResult(uid))),
  );

  server.registerTool(
    'doc2x_convert_export_wait',
    {
      description:
        'Wait for an export job to finish. Prefer calling doc2x_convert_export_submit first, then wait with uid+to. For backward compatibility, if formula_mode is provided and this job was not submitted in-process, this tool will submit once then wait.',
      inputSchema: {
        uid: parsePdfUidSchema,
        to: convertToSchema.describe('Expected target format. Used to verify the result URL.'),
        formula_mode: convertFormulaModeSchema.optional(),
        formula_level: convertFormulaLevelValueSchema
          .optional()
          .describe(
            'Optional formula degradation level used when this tool auto-submits export (formula_mode must be provided). Effective only when source parse uses model=v3-2026 (ignored by v2).',
          ),
        filename: convertFilenameSchema,
        filename_mode: convertFilenameModeSchema.optional(),
        merge_cross_page_forms: optionalBooleanSchema,
        poll_interval_ms: positiveIntMsSchema.optional(),
        max_wait_ms: positiveIntMsSchema.optional(),
      },
    },
    withToolErrorHandling(
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
        if (args.formula_mode) {
          await submitConvertWithDedup(
            {
              uid: args.uid,
              to: args.to,
              formula_mode: args.formula_mode,
              formula_level: args.formula_level,
              filename: args.filename,
              filename_mode: args.filename_mode,
              merge_cross_page_forms: args.merge_cross_page_forms,
            },
            { skipIfSubmitted: true },
          );
        }
        return asJsonResult(await convertExportWaitByUid(args));
      },
    ),
  );
}
