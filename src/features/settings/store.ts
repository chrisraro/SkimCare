import { create } from 'zustand';
import type { Locale } from '@/i18n/strings';

interface SettingsState {
  locale: Locale;
  onboarded: boolean;
  /** Result of the last readiness check (null = not checked yet). */
  offlineReady: boolean | null;
  setLocale: (locale: Locale) => void;
  setOfflineReady: (ready: boolean) => void;
  completeOnboarding: () => void;
}

// TODO(persistence): back with the encrypted store (src/db) once SQLCipher is wired.
export const useSettings = create<SettingsState>((set) => ({
  locale: 'en',
  onboarded: false,
  offlineReady: null,
  setLocale: (locale) => set({ locale }),
  setOfflineReady: (offlineReady) => set({ offlineReady }),
  completeOnboarding: () => set({ onboarded: true }),
}));
