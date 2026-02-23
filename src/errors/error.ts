import { TOOL_ERROR_CODE_INTERNAL_ERROR, TOOL_ERROR_CODE_TIMEOUT } from '#errorCodes';

export type Retryable = boolean;
type ToolErrorDetails = Record<string, unknown>;

export class ToolError extends Error {
  readonly code: string;
  readonly retryable: Retryable;
  readonly uid?: string;
  readonly details?: ToolErrorDetails;

  constructor(args: {
    code: string;
    message: string;
    retryable: Retryable;
    uid?: string;
    details?: ToolErrorDetails;
    cause?: unknown;
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = 'ToolError';
    this.code = args.code;
    this.retryable = args.retryable;
    this.uid = args.uid;
    this.details = args.details;
  }

  toPayload() {
    const error: {
      code: string;
      message: string;
      retryable: Retryable;
      uid?: string;
      details?: ToolErrorDetails;
    } = { code: this.code, message: this.message, retryable: this.retryable };
    if (this.uid) error.uid = this.uid;
    if (this.details && Object.keys(this.details).length > 0) error.details = this.details;
    return {
      error,
    };
  }
}

function stringMessageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function isAbortLikeError(e: unknown): boolean {
  const name = e instanceof Error ? e.name : '';
  return name === 'AbortError' || name === 'TimeoutError';
}

export function isRetryableError(e: unknown): boolean {
  return e instanceof ToolError && e.retryable;
}

export function coerceToolError(
  e: unknown,
  opts?: {
    defaultCode: string;
    defaultRetryable: Retryable;
    defaultMessage: string;
    uid?: string;
    details?: ToolErrorDetails;
  },
): ToolError {
  if (e instanceof ToolError) return e;
  if (isAbortLikeError(e)) {
    return new ToolError({
      code: TOOL_ERROR_CODE_TIMEOUT,
      message: opts?.defaultMessage ? `${opts.defaultMessage}: request timeout` : 'request timeout',
      retryable: true,
      uid: opts?.uid,
      details: opts?.details,
      cause: e,
    });
  }
  return new ToolError({
    code: opts?.defaultCode ?? TOOL_ERROR_CODE_INTERNAL_ERROR,
    message: opts?.defaultMessage
      ? `${opts.defaultMessage}: ${stringMessageOf(e)}`
      : stringMessageOf(e),
    retryable: opts?.defaultRetryable ?? false,
    uid: opts?.uid,
    details: opts?.details,
    cause: e,
  });
}
