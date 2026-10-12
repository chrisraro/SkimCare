import { create } from 'zustand';
import { setClassifierEnabled } from '@/ai/classifier/setting';
import type { Locale } from '@/i18n/strings';

interface SettingsState {
  locale: Locale;
  onboarded: boolean;
  /** Result of the last readiness check (null = not checked yet). */
  offlineReady: boolean | null;
  /** Use the clause classifier for the type pass when it is installed (src/ai/classifier). */
  clauseSorter: boolean;
  setLocale: (locale: Locale) => void;
  setOfflineReady: (ready: boolean) => void;
  completeOnboarding: () => void;
  setClauseSorter: (on: boolean) => void;
}

// locale, onboarded and clauseSorter are persisted by src/features/storage/persistence.ts; offlineReady is per session.
export const useSettings = create<SettingsState>((set) => ({
  locale: 'en',
  onboarded: false,
  offlineReady: null,
  clauseSorter: true,
  setLocale: (locale) => set({ locale }),
  setOfflineReady: (offlineReady) => set({ offlineReady }),
  completeOnboarding: () => set({ onboarded: true }),
  setClauseSorter: (clauseSorter) => set({ clauseSorter }),
}));

// The engine reads the switch outside React (src/ai/classifier/setting.ts).
useSettings.subscribe((s, prev) => {
  if (s.clauseSorter !== prev.clauseSorter) setClassifierEnabled(s.clauseSorter);
});
