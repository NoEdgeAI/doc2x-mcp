export const TOOL_ERROR_CODE_CONVERT_FAILED = 'convert_failed' as const;
export const TOOL_ERROR_CODE_EMPTY_BODY = 'empty_body' as const;
export const TOOL_ERROR_CODE_FILE_TOO_LARGE = 'file_too_large' as const;
export const TOOL_ERROR_CODE_INTERNAL_ERROR = 'internal_error' as const;
export const TOOL_ERROR_CODE_INVALID_ARGUMENT = 'invalid_argument' as const;
export const TOOL_ERROR_CODE_INVALID_JSON = 'invalid_json' as const;
export const TOOL_ERROR_CODE_INVALID_URL = 'invalid_url' as const;
export const TOOL_ERROR_CODE_MISSING_API_KEY = 'missing_api_key' as const;
export const TOOL_ERROR_CODE_PARSE_FAILED = 'parse_failed' as const;
export const TOOL_ERROR_CODE_TIMEOUT = 'timeout' as const;
export const TOOL_ERROR_CODE_UNSAFE_URL = 'unsafe_url' as const;

export function httpErrorCode(status: number): string {
  return `http_${status}`;
}

export function putFailedCode(status: number): string {
  return `put_failed_${status}`;
}
