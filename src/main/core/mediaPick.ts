// Pure media-candidate selection: picks the best URL per carousel slide.
// Instagram CDN URLs are signed, so candidates are only *selected*, never
// rewritten. Preference: video presence wins the slide; otherwise the largest
// image; source quality breaks ties (dom > metadata > resource > network).
import type { MediaCandidate, MediaType, MediaSourceKind } from '../../shared/types';

const SOURCE_RANK: Record<MediaSourceKind, number> = {
  dom: 4,
  metadata: 3,
  resource: 2,
  network: 1,
};

export function scoreCandidate(c: MediaCandidate): number {
  let score = SOURCE_RANK[c.source] * 10_000;
  if (c.mediaType === 'image') score += Math.min(c.width ?? 0, 9_999);
  return score;
}

export function bestOf(cands: MediaCandidate[], prefer: MediaType): MediaCandidate | undefined {
  const typed = cands.filter((c) => c.mediaType === prefer);
  if (typed.length === 0) return undefined;
  return typed.reduce((a, b) => (scoreCandidate(b) > scoreCandidate(a) ? b : a));
}

/**
 * Groups candidates by slide and picks one best candidate per slide,
 * preserving slide order. Used by the DownloadManager for all contexts.
 */
export function pickPerSlide(cands: MediaCandidate[], prefer?: MediaType): MediaCandidate[] {
  const groups = new Map<number, MediaCandidate[]>();
  for (const c of cands) {
    const key = typeof c.slideIndex === 'number' && Number.isFinite(c.slideIndex) ? Math.floor(c.slideIndex) : 0;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }
  const out: MediaCandidate[] = [];
  for (const key of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(key)!;
    const want: MediaType = prefer ?? (group.some((c) => c.mediaType === 'video') ? 'video' : 'image');
    const best = bestOf(group, want) ?? bestOf(group, want === 'video' ? 'image' : 'video');
    if (best) out.push({ ...best, slideIndex: key });
  }
  return out;
}
