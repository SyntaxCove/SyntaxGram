// Typed DownloadError with retryability metadata. Raw HTTP statuses and
// Node/system error codes are mapped to these by classify.ts; the queue
// consults `retryable` when deciding whether to schedule another attempt.

import type { ErrorCode } from '../../shared/types';

/** Typed download failure with retryability classification (spec §24/§31). */
export class DownloadError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'DownloadError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function err(code: ErrorCode, message: string, retryable: boolean): DownloadError {
  return new DownloadError(code, message, retryable);
}

export function isDownloadError(e: unknown): e is DownloadError {
  return e instanceof DownloadError;
}
