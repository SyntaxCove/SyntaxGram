// Zustand store for shell UI state: active page id, sidebar collapsed flag,
// window maximized flag and the Instagram view's nav state (URL, back and
// forward availability). The app opens on the Instagram page.

import { create } from 'zustand';
import type { NavState } from '../../../shared/types';

export type PageId = 'dashboard' | 'instagram' | 'downloads' | 'queue' | 'failed' | 'history' | 'settings';

interface UiState {
  page: PageId;
  sidebarCollapsed: boolean;
  maximized: boolean;
  navState: NavState | null;
  setPage: (page: PageId) => void;
  toggleSidebar: () => void;
  setMaximized: (maximized: boolean) => void;
  setNavState: (navState: NavState) => void;
}

export const useUiStore = create<UiState>((set) => ({
  // The app opens straight into the Instagram view (spec §3).
  page: 'instagram',
  sidebarCollapsed: false,
  maximized: false,
  navState: null,
  setPage: (page) => set({ page }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMaximized: (maximized) => set({ maximized }),
  setNavState: (navState) => set({ navState }),
}));
