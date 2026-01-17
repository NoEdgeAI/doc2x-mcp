export type Retryable = boolean;

export class ToolError extends Error {
  readonly code: string;
  readonly retryable: Retryable;
  readonly uid?: string;

  constructor(args: { code: string; message: string; retryable: Retryable; uid?: string }) {
    super(args.message);
    this.name = 'ToolError';
    this.code = args.code;
    this.retryable = args.retryable;
    this.uid = args.uid;
  }

  toPayload() {
    return {
      error: { code: this.code, message: this.message, retryable: this.retryable, uid: this.uid },
    };
  }
}
