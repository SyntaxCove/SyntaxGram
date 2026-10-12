// Ambient declaration for `window.instagramApp` (injected by
// src/preload/index.ts via contextBridge). Keeps renderer code fully typed
// against the shared API contract in src/shared/types.ts.

import type { InstagramAppApi } from '../../../shared/types';

declare global {
  interface Window {
    instagramApp: InstagramAppApi;
  }
}

export {};
