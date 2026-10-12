// DOMResolver (spec §10): extracts media candidates directly from elements.
// Avoids profile avatars and tiny thumbnails; picks the largest srcset variant.
import type { MediaCandidate } from '../../shared/types';

const PROFILE_PATH_RE = /\/t51\.2885-19\//; // Instagram profile picture CDN path

export class DOMResolver {
  resolveFrom(root: Element | null): MediaCandidate[] {
    if (!root || !root.isConnected) return [];
    const out: MediaCandidate[] = [];

    const images = Array.from(root.querySelectorAll('img')).filter((img) => this.isContentImage(img, root));
    let best: { url: string; width: number } | null = null;
    for (const img of images) {
      const cand = this.bestFromImage(img);
      if (cand && (!best || cand.width > best.width)) best = cand;
    }
    if (best) {
      out.push({
        url: best.url,
        mediaType: 'image',
        source: 'dom',
        width: best.width,
      });
    }

    const video = root.querySelector('video');
    if (video) {
      const url = this.videoUrl(video);
      if (url) {
        out.push({
          url,
          mediaType: 'video',
          source: 'dom',
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
        });
      }
    }
    return out;
  }

  private isContentImage(img: HTMLImageElement, root: Element): boolean {
    if (!img.src && !img.srcset) return false;
    if (PROFILE_PATH_RE.test(img.src) || PROFILE_PATH_RE.test(img.srcset)) return false;
    // Avatars live inside the post header link.
    if (img.closest('header')) return false;
    // Small round images are avatars.
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 120) return false;
    if (img.naturalWidth > 0 && img.naturalWidth < 120) return false;
    return root.contains(img);
  }

  private bestFromImage(img: HTMLImageElement): { url: string; width: number } | null {
    const cands: { url: string; width: number }[] = [];
    if (img.srcset) {
      for (const part of img.srcset.split(',')) {
        const [url, descriptor] = part.trim().split(/\s+/);
        if (!url) continue;
        let width = 0;
        if (descriptor?.endsWith('w')) width = parseInt(descriptor, 10) || 0;
        else if (descriptor?.endsWith('x')) width = Math.round((parseFloat(descriptor) || 1) * (img.clientWidth || 640));
        else width = img.naturalWidth || 640;
        cands.push({ url, width });
      }
    }
    if (img.src) cands.push({ url: img.src, width: img.naturalWidth || 0 });
    if (!cands.length) return null;
    return cands.sort((a, b) => b.width - a.width)[0];
  }

  private videoUrl(video: HTMLVideoElement): string | null {
    const direct = video.currentSrc || video.src || video.querySelector('source')?.src || '';
    // blob:/MSE sources cannot be fetched; the network layer provides the
    // real mp4 URL for such videos. No protective mechanism is bypassed.
    if (!direct || direct.startsWith('blob:')) return null;
    return direct;
  }
}
