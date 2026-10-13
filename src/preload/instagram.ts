// Preload for the Instagram WebContentsView.
// Exposes a minimal `window.instagramBridge` used by the injected enhancement
// layer. The bridge validates payloads before they ever reach IPC (spec §43).
// The injected code itself never gets Node.js access.
import { contextBridge, ipcRenderer, webFrame } from 'electron';
import { IPC } from '../shared/channels';
import { passkeySuppressorSource } from '../shared/passkeySuppressor';
import type { AppSettings, InstagramBridgeApi, RegistryQuery, ToastPayload } from '../shared/types';
import { isDownloadRequestPayload, isRegistryQuery } from '../shared/validators';

// Suppress passkey (WebAuthn) prompts BEFORE any Instagram script runs:
// evaluate the guard in the page's main world while the preload executes —
// this is the earliest hook available for the main frame (v0.2.3 fix).
try {
  void webFrame.executeJavaScript(passkeySuppressorSource());
} catch {
  /* webFrame unavailable — the injection layer installs the guard later */
}

const bridge: InstagramBridgeApi = {
  requestDownload: (payload) => {
    if (!isDownloadRequestPayload(payload)) return Promise.resolve({ queued: 0, skipped: 0 });
    return ipcRenderer.invoke(IPC.IgDownloadRequest, payload) as Promise<{ queued: number; skipped: number }>;
  },
  queryRegistry: (query: RegistryQuery) => {
    if (!isRegistryQuery(query)) return Promise.resolve([]);
    return ipcRenderer.invoke(IPC.IgRegistryQuery, query) as Promise<
      { url: string; mimeType?: string; bytes?: number; ts: number }[]
    >;
  },
  toast: (message: string, kind?: ToastPayload['kind']) => {
    if (typeof message !== 'string' || message.length === 0 || message.length > 300) return;
    const safeKind = kind === 'success' || kind === 'error' ? kind : 'info';
    ipcRenderer.send(IPC.IgToast, { kind: safeKind, message });
  },
  ready: () => ipcRenderer.send(IPC.IgReady),
  onSettings: (cb: (settings: AppSettings) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, settings: AppSettings): void => cb(settings);
    ipcRenderer.on(IPC.EvtIgSettings, handler);
  },
};

contextBridge.exposeInMainWorld('instagramBridge', bridge);
