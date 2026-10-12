import { describe, expect, it } from 'vitest';
import { classifyHttpError, classifyUnknownError } from '../src/main/core/classify';
import { DownloadError } from '../src/main/core/errors';

describe('classifyHttpError (spec §31)', () => {
  it('maps 404/403 as non-retryable', () => {
    expect(classifyHttpError(404)).toMatchObject({ code: 'HTTP_404', retryable: false });
    expect(classifyHttpError(403)).toMatchObject({ code: 'HTTP_403', retryable: false });
  });

  it('maps 429 and 5xx as retryable', () => {
    expect(classifyHttpError(429)).toMatchObject({ code: 'HTTP_429', retryable: true });
    expect(classifyHttpError(500)).toMatchObject({ code: 'SERVER_ERROR', retryable: true });
    expect(classifyHttpError(503)).toMatchObject({ code: 'SERVER_ERROR', retryable: true });
  });

  it('maps other 4xx as non-retryable', () => {
    expect(classifyHttpError(410)).toMatchObject({ code: 'HTTP_OTHER', retryable: false });
  });
});

describe('classifyUnknownError', () => {
  it('maps system error codes', () => {
    expect(classifyUnknownError({ code: 'ECONNRESET', message: 'reset' })).toMatchObject({
      code: 'CONNECTION_RESET',
      retryable: true,
    });
    expect(classifyUnknownError({ code: 'ENOSPC', message: 'full' })).toMatchObject({
      code: 'DISK_FULL',
      retryable: false,
    });
    expect(classifyUnknownError({ code: 'EACCES', message: 'no' })).toMatchObject({
      code: 'PERMISSION_DENIED',
      retryable: false,
    });
    expect(classifyUnknownError({ code: 'ETIMEDOUT', message: 'slow' })).toMatchObject({
      code: 'NETWORK_TIMEOUT',
      retryable: true,
    });
  });

  it('passes DownloadError through untouched', () => {
    const e = new DownloadError('INVALID_MEDIA', 'not media', false);
    expect(classifyUnknownError(e)).toBe(e);
  });

  it('wraps unknown errors as UNKNOWN / non-retryable', () => {
    expect(classifyUnknownError(new Error('boom'))).toMatchObject({ code: 'UNKNOWN', retryable: false });
    expect(classifyUnknownError('weird')).toMatchObject({ code: 'UNKNOWN' });
  });
});
