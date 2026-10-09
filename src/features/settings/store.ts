import { create } from 'zustand';
import type { Locale } from '@/i18n/strings';

interface SettingsState {
  locale: Locale;
  onboarded: boolean;
  setLocale: (locale: Locale) => void;
  completeOnboarding: () => void;
}

// TODO(persistence): back with the encrypted store (src/db) once SQLCipher is wired.
export const useSettings = create<SettingsState>((set) => ({
  locale: 'en',
  onboarded: false,
  setLocale: (locale) => set({ locale }),
  completeOnboarding: () => set({ onboarded: true }),
}));
