// MIME type -> file extension mapping. The real Content-Type of the response
// is preferred over URL heuristics (spec §8/§9). No re-encoding happens in the
// MVP; the original binary is stored as-is.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export function extForMime(mime?: string | null): string | undefined {
  if (!mime) return undefined;
  const clean = String(mime).trim().toLowerCase().split(';')[0].trim();
  return MIME_TO_EXT[clean];
}

export function extFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const m = pathname.match(/\.([A-Za-z0-9]{2,5})$/);
    return m ? m[1].toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}
