import { create } from 'zustand';

/**
 * App chrome state. `compact` collapses the floating tab bar to the active tab
 * once the person scrolls down a tab screen, like iOS Music and Notes.
 */
interface ChromeState {
  compact: boolean;
  setCompact: (compact: boolean) => void;
}

export const useChrome = create<ChromeState>((set, get) => ({
  compact: false,
  setCompact: (compact) => {
    if (get().compact !== compact) set({ compact });
  },
}));

/** Scroll distance before the tab bar collapses. */
export const COMPACT_AFTER = 40;
