// MetadataResolver (spec §10): reads page-level metadata (Open Graph and
// JSON-LD) that Instagram ships for the currently open post page.
import type { MediaCandidate } from '../../shared/types';
import type { ResolveContext } from '../resolvers';

export class MetadataResolver {
  async resolve(ctx: ResolveContext): Promise<MediaCandidate[]> {
    if (!ctx.postId) return [];
    if (!/\/(p|reel|tv)\//.test(location.pathname)) return [];
    const out: MediaCandidate[] = [];

    const og = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"], meta[property="og:image:secure_url"]',
    );
    if (og?.content && og.content.startsWith('https://')) {
      out.push({ url: og.content, mediaType: 'image', source: 'metadata' });
    }

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent || 'null') as {
          image?: string | string[];
          video?: { contentUrl?: string } | { contentUrl?: string }[];
        } | null;
        if (!data) continue;
        const images = Array.isArray(data.image) ? data.image : data.image ? [data.image] : [];
        for (const url of images) {
          if (typeof url === 'string' && url.startsWith('https://')) {
            out.push({ url, mediaType: 'image', source: 'metadata' });
          }
        }
        const videos = Array.isArray(data.video) ? data.video : data.video ? [data.video] : [];
        for (const v of videos) {
          if (v?.contentUrl?.startsWith('https://')) {
            out.push({ url: v.contentUrl, mediaType: 'video', source: 'metadata' });
          }
        }
      } catch {
        /* malformed ld+json — ignore */
      }
    }
    return out;
  }
}
