import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { isRetryableError } from '#errors';
import {
  parseImageLayoutStatus,
  parseImageLayoutSubmit,
  parseImageLayoutSync,
  parseImageLayoutWaitTextByUid,
} from '#doc2x/image';
import { asJsonResult, asTextResult } from '#mcp/results';
import {
  deleteUidCache,
  fileSig,
  getSubmittedUidFromCache,
  imagePathForWaitSchema,
  imagePathSchema,
  missingEitherFieldError,
  parseImageUidSchema,
  positiveIntMsSchema,
  setFailedUidCache,
  setSubmittedUidCache,
  type RegisterToolsContext,
  withToolErrorHandling,
} from '#mcp/registerToolsShared';

export function registerImageTools(server: McpServer, ctx: RegisterToolsContext) {
  server.registerTool(
    'doc2x_parse_image_layout_sync',
    {
      description:
        'Parse an image layout synchronously and return the raw Doc2x result JSON (including convert_zip when present).',
      inputSchema: {
        image_path: imagePathSchema,
      },
    },
    withToolErrorHandling(async ({ image_path }) => asJsonResult(await parseImageLayoutSync(image_path))),
  );

  server.registerTool(
    'doc2x_parse_image_layout_submit',
    {
      description:
        'Create an async image-layout parse task and return {uid}. After this, call doc2x_parse_image_layout_wait_text (with uid) or doc2x_parse_image_layout_status.',
      inputSchema: {
        image_path: imagePathSchema,
      },
    },
    withToolErrorHandling(async ({ image_path }) => {
      const sig = await fileSig(image_path);
      const res = await parseImageLayoutSubmit(image_path);
      setSubmittedUidCache(ctx, { kind: 'image', key: sig.absPath, sig, uid: res.uid });
      return asJsonResult(res);
    }),
  );

  server.registerTool(
    'doc2x_parse_image_layout_status',
    {
      description: 'Get status/result for an existing async image-layout parse task by uid.',
      inputSchema: {
        uid: parseImageUidSchema,
      },
    },
    withToolErrorHandling(async ({ uid }) => asJsonResult(await parseImageLayoutStatus(uid))),
  );

  server.registerTool(
    'doc2x_parse_image_layout_wait_text',
    {
      description:
        'Wait for an image-layout parse task until success, returning first page markdown. Prefer passing uid (no re-submit). If only image_path is provided, it will (a) reuse an in-process cached uid if available, otherwise (b) submit a new async task then wait.',
      inputSchema: {
        uid: parseImageUidSchema.optional(),
        image_path: imagePathForWaitSchema.optional(),
        poll_interval_ms: positiveIntMsSchema.optional(),
        max_wait_ms: positiveIntMsSchema.optional(),
      },
    },
    withToolErrorHandling(
      async (args: {
        uid?: string;
        image_path?: string;
        poll_interval_ms?: number;
        max_wait_ms?: number;
      }) => {
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
        if (!imagePath) throw missingEitherFieldError('uid', 'image_path');

        const sig = await fileSig(imagePath);
        const resolvedUid = getSubmittedUidFromCache(ctx, { kind: 'image', key: sig.absPath, sig });
        const finalUid = resolvedUid || (await parseImageLayoutSubmit(imagePath)).uid;
        setSubmittedUidCache(ctx, { kind: 'image', key: sig.absPath, sig, uid: finalUid });

        const waitByUid = async (uid: string) =>
          parseImageLayoutWaitTextByUid({
            uid,
            poll_interval_ms: args.poll_interval_ms,
            max_wait_ms: args.max_wait_ms,
          });

        const markFailed = (uid: string) =>
          setFailedUidCache(ctx, { kind: 'image', key: sig.absPath, sig, uid });

        try {
          const out = await waitByUid(finalUid);
          return asTextResult(out.text);
        } catch (e) {
          if (!resolvedUid) {
            markFailed(finalUid);
            throw e;
          }

          deleteUidCache(ctx, { kind: 'image', key: sig.absPath });
          if (!isRetryableError(e)) {
            markFailed(finalUid);
            throw e;
          }
          const retryUid = (await parseImageLayoutSubmit(imagePath)).uid;
          setSubmittedUidCache(ctx, { kind: 'image', key: sig.absPath, sig, uid: retryUid });
          try {
            const out = await waitByUid(retryUid);
            return asTextResult(out.text);
          } catch (retryErr) {
            markFailed(retryUid);
            throw retryErr;
          }
        }
      },
    ),
  );
}
