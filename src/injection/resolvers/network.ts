// ResourceResolver + NetworkResourceResolver (spec §10).
// - ResourceResolver inspects the Performance API entries of the current page
//   for media that was already fetched while the user was watching.
// - NetworkResourceResolver asks the main process MediaRegistry (webRequest
//   observations of the user's own session) for recent media URLs — this is
//   what makes blob-backed videos downloadable without bypassing anything.
import type { InstagramBridgeApi, MediaCandidate, MediaRecord } from '../../shared/types';
import type { ResolveContext } from '../resolvers';
import { recordToCandidate } from '../resolvers';

const MEDIA_RE = /https:\/\/[\w.-]*(cdninstagram\.com|fbcdn\.net)\/[^\s"'<>]+?\.(jpg|jpeg|png|webp|heic|avif|mp4)(\?[^\s"'<>]*)?/i;

export class ResourceResolver {
  resolve(_ctx: ResolveContext, maxAgeMs = 10 * 60_000): MediaCandidate[] {
    const out: MediaCandidate[] = [];
    const seen = new Set<string>();
    let entries: PerformanceResourceTiming[] = [];
    try {
      entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    } catch {
      return out;
    }
    const cutoff = Date.now() - maxAgeMs;
    for (const entry of entries) {
      const name = entry.name;
      if (!name.startsWith('https://')) continue;
      if (entry.startTime && Date.now() - entry.startTime > maxAgeMs) continue;
      void cutoff;
      if (!MEDIA_RE.test(name)) continue;
      const url = name.split('#')[0];
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        url,
        mediaType: /\.mp4(\?|$)/i.test(url) ? 'video' : 'image',
        source: 'resource',
      });
    }
    return out;
  }
}

export class NetworkResourceResolver {
  async resolve(_ctx: ResolveContext, bridge: InstagramBridgeApi): Promise<MediaCandidate[]> {
    const recents = await bridge.queryRegistry({ limit: 16, sinceMs: 120_000 });
    return recents.map((r: MediaRecord) => recordToCandidate(r));
  }
}
