// InstagramSelectors (spec §11): the ONLY place where DOM structure
// assumptions live. Instagram changes its DOM frequently — everything here is
// semantic / a11y based (articles, dialogs, buttons, aria-labels, media
// elements) rather than fragile class names.
export const InstagramSelectors = {
  article: 'article',
  dialog: 'div[role="dialog"]',
  image: 'img',
  video: 'video',
  clickables: '[role="button"], button, a[href]',
  carouselList: 'ul',
  carouselSlide: ':scope > li',
  nextButtonLabels: [
    'next',
    'after',
    // Persian UI (user language) + common locales — matched with includes()
    'بعدی',
    'بعد',
    'التالي',
    'suivant',
    'siguiente',
    'weiter',
    'sonraki',
    'следующ',
    '次へ',
    '다음',
  ],
  prevButtonLabels: [
    'previous',
    'prev',
    'before',
    'go back',
    'قبلی',
    'پیشین',
    'السابق',
    'précédent',
    'anterior',
    'zurück',
    'önceki',
    'предыдущ',
    '前へ',
    '이전',
  ],
} as const;

/** Words (lowercase) that identify the like button across UI languages. */
export const LIKE_WORDS = [
  'like',
  'مثل',
  'لایک',
  'پسندیدن',
  "j'aime",
  'aime',
  'gefällt mir',
  'me gusta',
  'mi piace',
  'いいね',
  '좋아요',
  '赞',
  'curtir',
  'beğen',
  'gilla',
  'ljubi',
];

/** Words that identify an already-liked state ("Unlike").
 * Checked BEFORE any like-word test: e.g. Persian "لغو پسندیدن" (unlike)
 * contains the like word "پسندیدن" as a substring, so ordering matters. */
export const UNLIKE_WORDS = [
  'unlike',
  'nicht mehr gefällt',
  'ヤメる',
  'descurtir',
  'لغو پسندیدن',
  'لغو لایک',
  'نپسندیدن',
  'نلایک',
];

function labelOf(el: Element): string {
  return (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '').trim().toLowerCase();
}

export function hasLabel(el: Element, words: string[]): boolean {
  const l = labelOf(el);
  if (!l) return false;
  return words.some((w) => l === w || l.startsWith(w) || l.includes(w));
}
