import type { InstagramAppApi } from '../../../shared/types';

declare global {
  interface Window {
    instagramApp: InstagramAppApi;
  }
}

export {};
