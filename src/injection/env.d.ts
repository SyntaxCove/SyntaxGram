// Ambient types for the Instagram WebContentsView context. The injection
// bundle runs in the page's main world and may only talk to the app via
// `window.instagramBridge` (exposed by src/preload/instagram.ts) — this
// file gives that contract a TypeScript type.

import type { InstagramBridgeApi } from '../shared/types';

declare global {
  interface Window {
    instagramBridge?: InstagramBridgeApi;
    __IGD__?: { refresh(): void };
  }
}

export {};
