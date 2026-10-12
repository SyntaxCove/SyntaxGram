import { create } from 'zustand';
import type { AppSettings, AppSettingsPatch } from '../../../shared/types';
import { api } from '../lib/api';

interface SettingsState {
  settings: AppSettings | null;
  set: (settings: AppSettings) => void;
  load: () => Promise<void>;
  apply: (patch: AppSettingsPatch) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  set: (settings) => set({ settings }),
  load: async () => {
    const settings = await api.settings.get();
    set({ settings });
  },
  apply: async (patch) => {
    const settings = await api.settings.update(patch);
    set({ settings });
  },
}));
