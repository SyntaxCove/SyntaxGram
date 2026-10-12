import type { InstagramBridgeApi } from '../shared/types';

declare global {
  interface Window {
    instagramBridge?: InstagramBridgeApi;
    __IGD__?: { refresh(): void };
  }
}

export {};
