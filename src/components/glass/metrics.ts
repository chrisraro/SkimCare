import { space } from '@/theme/tokens';

/** Sizes of the floating glass chrome, shared by the bar itself and the screens that make room for it. */
export const TAB_BAR_HEIGHT = 62;
export const ACCESSORY_HEIGHT = 52;

/** Space a tab screen leaves at the bottom so its last item clears the bar and the review capsule. */
export function tabBarSpace(bottomInset: number) {
  return bottomInset + space.lg + TAB_BAR_HEIGHT + space.md + ACCESSORY_HEIGHT + space.lg;
}
