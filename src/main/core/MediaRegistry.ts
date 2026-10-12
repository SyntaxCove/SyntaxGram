// MediaRegistry: passively records media resources observed on the Instagram
// session via webRequest (the "NetworkResourceResolver" data source). This is
// read-only observation of the user's own browsing session — no automation,
// no scraping: it only helps resolve blob-backed videos for media the user is
// actively watching.
import type { Session } from 'electron';
import type { MediaRecord, MediaType, RegistryQuery } from '../../shared/types';
import { REGISTRY_MAX } from '../../shared/layout';

const URL_FILTERS = ['*://*.cdninstagram.com/*', '*://*.fbcdn.net/*', '*://*.instagram.com/*'];

export function inferMediaType(rec: { mimeType?: string; url: string }): MediaType {
  if (rec.mimeType?.startsWith('video/')) return 'video';
  if (rec.mimeType?.startsWith('image/')) return 'image';
  return /\.mp4(\?|$)/i.test(rec.url) ? 'video' : 'image';
}

export class MediaRegistry {
  private records: MediaRecord[] = [];
  private byUrl = new Map<string, MediaRecord>();

  attach(ses: Session): void {
    ses.webRequest.onCompleted({ urls: URL_FILTERS }, (details) => {
      const url = details.url;
      if (!url.startsWith('https://')) return;
      const headers = details.responseHeaders ?? {};
      const contentTypeKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
      const mime = (contentTypeKey ? headers[contentTypeKey]?.[0] : '')?.toLowerCase() ?? '';
      if (mime.includes('html') || mime.includes('json')) return;
      const isMedia =
        mime.startsWith('image/') ||
        mime.startsWith('video/') ||
        /\.(jpg|jpeg|png|webp|heic|avif|mp4)(\?|$)/i.test(url);
      if (!isMedia) return;
      const rec: MediaRecord = {
        url,
        mimeType: mime || undefined,
        ts: Date.now(),
      };
      this.byUrl.set(url, rec);
      this.records = [...this.byUrl.values()];
      if (this.records.length > REGISTRY_MAX) {
        const overflow = this.records.length - REGISTRY_MAX;
        const dropped = this.records.splice(0, overflow);
        for (const d of dropped) this.byUrl.delete(d.url);
      }
    });
  }

  query(raw: RegistryQuery): MediaRecord[] {
    const limit = Math.min(50, Math.max(1, Math.round(raw.limit ?? 12)));
    const sinceMs = Math.max(0, raw.sinceMs ?? 120_000);
    const cutoff = Date.now() - sinceMs;
    return this.records
      .filter((r) => r.ts >= cutoff && (!raw.mediaType || inferMediaType(r) === raw.mediaType))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  }
}
