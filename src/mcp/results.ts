import { ToolError } from "../errors.js";

export function asTextResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function asJsonResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

export function asErrorResult(e: unknown) {
  const payload =
    e instanceof ToolError
      ? e.toPayload()
      : { error: { code: "internal_error", message: String((e as any)?.message || e), retryable: false } };
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

