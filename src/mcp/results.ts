import { coerceToolError } from '#errors';
import { TOOL_ERROR_CODE_INTERNAL_ERROR } from '#errorCodes';

export function asTextResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

export function asJsonResult(obj: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }],
  };
}

export function asErrorResult(e: unknown) {
  const payload = coerceToolError(e, {
    defaultCode: TOOL_ERROR_CODE_INTERNAL_ERROR,
    defaultRetryable: false,
    defaultMessage: 'Unhandled error',
  }).toPayload();
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}
