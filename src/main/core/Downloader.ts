// Stream-based, session-aware downloader worker (spec §30/§31/§32/§33).
// - Uses Electron `net.request` bound to the Instagram session (cookies apply)
// - Streams to "<final>.part", then renames atomically on success
// - Supports pause/resume via HTTP Range + kept .part files
// - Validates the payload with magic bytes before finalizing
// - No media is ever re-encoded; the original binary is stored as-is
import { net } from 'electron';
import type { IncomingMessage, ClientRequest, Session } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Executor, ExecutorHooks, ExecutorResult } from './DownloadQueue';
import { DownloadError } from './errors';
import { classifyHttpError, classifyUnknownError } from './classify';
import { isAllowedMediaUrl } from './urlGuard';
import { extForMime, extFromUrl } from './mime';
import { uniqueFileName } from './naming';
import { mimeTrustSniff, sniffMedia } from './sniff';

export interface DownloaderOptions {
  session: Session;
  /** Live getter so a user-agent change in Settings applies to future jobs
   * without recreating the executor. */
  getUserAgent: () => string;
  stallTimeoutMs?: number;
}

type HeaderVal = string | string[] | undefined;

function header(headers: Record<string, HeaderVal>, key: string): string {
  const v = headers[key];
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? '').toString();
}

export function createExecutor(opts: DownloaderOptions): Executor {
  const stallTimeoutMs = opts.stallTimeoutMs ?? 30_000;

  return async function execute(job, hooks: ExecutorHooks): Promise<ExecutorResult> {
    // ---------- guards ----------
    if (!job.mediaUrl || !isAllowedMediaUrl(job.mediaUrl)) {
      throw new DownloadError('URL_REJECTED', 'Media URL is not allowed', false);
    }
    const dir = path.dirname(job.destinationPath);
    await fsp.mkdir(dir, { recursive: true });

    // ---------- disk safety (spec §33) ----------
    try {
      const st = await fsp.statfs(dir);
      const freeBytes = Number(st.bsize) * Number(st.bavail);
      if (job.totalBytes > 1e6 && freeBytes < job.totalBytes * 1.05 + 5e6) {
        throw new DownloadError('DISK_FULL', 'Not enough free disk space', false);
      }
    } catch (e) {
      if (e instanceof DownloadError) throw e;
      // statfs unavailable on this platform -> skip the pre-check.
    }

    // ---------- part file / resume base ----------
    const partPath = `${job.destinationPath}.part`;
    let resumeBytes = 0;
    if (hooks.resumeBytes > 0) {
      try {
        const st = await fsp.stat(partPath);
        resumeBytes = Math.min(st.size, hooks.resumeBytes);
      } catch {
        resumeBytes = 0;
      }
    }

    // ---------- request ----------
    let activeRequest: ClientRequest | null = null;
    let stalled = false;
    const doRequest = (rangeFrom: number): Promise<IncomingMessage> =>
      new Promise<IncomingMessage>((resolve, reject) => {
        const req = net.request({
          method: 'GET',
          url: job.mediaUrl!,
          session: opts.session,
          useSessionCookies: true,
          redirect: 'follow',
        });
        activeRequest = req;
        req.setHeader('User-Agent', opts.getUserAgent());
        req.setHeader('Referer', 'https://www.instagram.com/');
        req.setHeader('Accept', 'image/*,video/*,*/*;q=0.8');
        // net.request does NOT auto-decompress: with Chromium's default
        // "Accept-Encoding: gzip, deflate, br" the Instagram CDN frequently
        // answers with a brotli/gzip-wrapped body whose head bytes are not a
        // media signature -> almost every download failed INVALID_MEDIA.
        // Requesting identity encoding makes the CDN stream the raw bytes.
        req.setHeader('Accept-Encoding', 'identity');
        if (rangeFrom > 0) req.setHeader('Range', `bytes=${rangeFrom}-`);
        req.on('response', (res) => resolve(res));
        req.on('error', (e) => reject(classifyUnknownError(e)));
        req.end();
      });

    let response = await doRequest(resumeBytes);
    if (response.statusCode === 416 && resumeBytes > 0) {
      // Stale part file: start over cleanly.
      resumeBytes = 0;
      try {
        await fsp.rm(partPath, { force: true });
      } catch {
        /* ignore */
      }
      response = await doRequest(0);
    }
    const status = response.statusCode ?? 0;
    const rangeOk = resumeBytes > 0 && status === 206;
    if (status !== 200 && !(status === 206 && resumeBytes > 0)) {
      throw classifyHttpError(status);
    }

    // ---------- metadata ----------
    const mime = header(response.headers as Record<string, HeaderVal>, 'content-type')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const contentLen = Number(header(response.headers as Record<string, HeaderVal>, 'content-length')) || 0;
    const totalBytes = rangeOk ? resumeBytes + contentLen : contentLen;

    let bytes = rangeOk ? resumeBytes : 0;
    let lastTime = Date.now();
    let lastBytes = bytes;
    let speed = 0;

    const abortNow = () => {
      stalled = true;
      try {
        activeRequest?.abort();
      } catch {
        /* ignore */
      }
      try {
        (response as unknown as { destroy?: () => void }).destroy?.();
      } catch {
        /* ignore */
      }
    };
    hooks.signal.addEventListener('abort', abortNow, { once: true });

    const ws = fs.createWriteStream(partPath, { flags: rangeOk ? 'a' : 'w' });

    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const resetStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => abortNow(), stallTimeoutMs);
    };

    const writeDone = new Promise<void>((resolve, reject) => {
      response.on('data', (chunk: Buffer) => {
        if (stalled) return;
        resetStall();
        bytes += chunk.length;
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt >= 0.25) {
          const inst = (bytes - lastBytes) / dt;
          speed = speed ? speed * 0.6 + inst * 0.4 : inst;
          lastTime = now;
          lastBytes = bytes;
          hooks.onProgress(bytes, totalBytes, speed);
        }
        ws.write(chunk);
      });
      response.on('end', () => {
        ws.end(() => resolve());
      });
      response.on('error', (e: unknown) => {
        ws.destroy();
        reject(classifyUnknownError(e));
      });
      response.on('aborted', () => {
        ws.destroy();
        reject(new DownloadError('CONNECTION_LOST', 'Connection lost mid-download', true));
      });
      ws.on('error', (e) => reject(classifyUnknownError(e)));
    });

    resetStall();
    try {
      await writeDone;
    } catch (e) {
      if (stalled && hooks.signal.aborted) {
        throw new DownloadError('CANCELLED', hooks.signal.reason === 'pause' ? 'Paused' : 'Cancelled by user', false);
      }
      if (stalled) throw new DownloadError('NETWORK_TIMEOUT', 'Download stalled (no data)', true);
      throw e;
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
      hooks.signal.removeEventListener('abort', abortNow);
    }

    hooks.onProgress(bytes, totalBytes, 0);

    // ---------- validation (spec §31) ----------
    if (bytes === 0) throw new DownloadError('INVALID_MEDIA', 'Empty response body', false);
    if (totalBytes > 0 && bytes < totalBytes - 8) {
      throw new DownloadError('INVALID_RESPONSE', `Incomplete download (${bytes}/${totalBytes})`, true);
    }

    const fh = await fsp.open(partPath, 'r');
    const headBuf = Buffer.alloc(64);
    const read = await fh.read(headBuf, 0, headBuf.length, 0);
    await fh.close();
    const head = headBuf.subarray(0, read.bytesRead);
    let sniff = sniffMedia(head);
    if (!sniff.ok) {
      // Unrecognized magic bytes: reject text-like payloads (HTML/JSON error
      // pages) unconditionally; otherwise, if the CDN's Content-Type honestly
      // declares media and the body is binary, trust it instead of failing the
      // whole job (rescues brandless MP4 variants, MPEG-TS, raw HEVC ...).
      sniff = mimeTrustSniff(head, mime);
      if (!sniff.ok) {
        throw new DownloadError('INVALID_MEDIA', 'Response is not a recognized image/video', false);
      }
    }

    // ---------- atomic finalize (spec §32, §34) ----------
    const ext =
      sniff.ext ?? extForMime(mime) ?? job.extension ?? extFromUrl(job.mediaUrl!) ?? (job.mediaType === 'video' ? 'mp4' : 'jpg');
    const base = path.basename(job.destinationPath).replace(/\.[^.]+$/, '') || `${job.username}-${job.createdAt}`;
    const plainPath = path.join(dir, `${base}.${ext}`);

    let finalPath = plainPath;
    if (fs.existsSync(plainPath)) {
      if (hooks.duplicateBehavior === 'overwrite') {
        await fsp.rm(plainPath, { force: true });
      } else if (hooks.duplicateBehavior === 'skip') {
        await fsp.rm(partPath, { force: true });
        return { finalPath: plainPath, bytes, mimeType: mime || undefined, extension: ext };
      } else {
        finalPath = path.join(dir, uniqueFileName(dir, base, ext, (p) => fs.existsSync(p)));
      }
    }
    await fsp.rename(partPath, finalPath);

    return { finalPath, bytes, mimeType: mime || undefined, extension: ext };
  };
}
