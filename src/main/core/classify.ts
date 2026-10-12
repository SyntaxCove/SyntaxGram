// Pure error classification: HTTP status codes, Node/system error codes and
// unknown throwables are mapped to an internal ErrorCode + retryability flag
// (spec §31). Retry only happens for genuinely retryable failures (spec §24).
import type { ErrorCode } from '../../shared/types';
import { DownloadError } from './errors';

const HTTP_MAP: Record<number, [ErrorCode, boolean]> = {
  403: ['HTTP_403', false],
  404: ['HTTP_404', false],
  429: ['HTTP_429', true],
};

const NET_MAP: Record<string, [ErrorCode, boolean]> = {
  ECONNRESET: ['CONNECTION_RESET', true],
  ECONNREFUSED: ['CONNECTION_LOST', true],
  EPIPE: ['CONNECTION_LOST', true],
  ECONNABORTED: ['CONNECTION_LOST', true],
  ETIMEDOUT: ['NETWORK_TIMEOUT', true],
  ENOTFOUND: ['DNS_ERROR', true],
  EAI_AGAIN: ['DNS_ERROR', true],
  ENOSPC: ['DISK_FULL', false],
  EACCES: ['PERMISSION_DENIED', false],
  EPERM: ['PERMISSION_DENIED', false],
  EROFS: ['PERMISSION_DENIED', false],
  EMFILE: ['UNKNOWN', true],
};

export function classifyHttpError(status: number): DownloadError {
  const mapped = HTTP_MAP[status];
  if (mapped) return new DownloadError(mapped[0], `HTTP ${status}`, mapped[1]);
  if (status >= 500) return new DownloadError('SERVER_ERROR', `HTTP ${status}`, true);
  if (status >= 400) return new DownloadError('HTTP_OTHER', `HTTP ${status}`, false);
  return new DownloadError('INVALID_RESPONSE', `Unexpected HTTP status ${status}`, false);
}

export function classifyUnknownError(e: unknown): DownloadError {
  if (e instanceof DownloadError) return e;
  const anyErr = e as { code?: string; message?: string };
  if (anyErr && typeof anyErr.code === 'string' && NET_MAP[anyErr.code]) {
    const [code, retryable] = NET_MAP[anyErr.code];
    return new DownloadError(code, anyErr.message || anyErr.code, retryable);
  }
  const message = anyErr?.message ?? String(e);
  return new DownloadError('UNKNOWN', message, false);
}
