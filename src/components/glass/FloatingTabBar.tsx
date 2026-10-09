import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, useEffect } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View, type View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReviewAccessory } from '@/components/ReviewAccessory';
import { AppText } from '@/components/ui/AppText';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { useChrome } from '@/features/chrome/store';
import { useReviewJob } from '@/features/review/jobStore';
import { colors, glass, palette, space } from '@/theme/tokens';

export const TAB_BAR_HEIGHT = 62;
const BAR_PAD = 6;
const ACCESSORY_HEIGHT = 52;

/** Space a tab screen leaves at the bottom so its last item clears the bar and the review capsule. */
export function tabBarSpace(bottomInset: number) {
  return bottomInset + space.lg + TAB_BAR_HEIGHT + space.md + ACCESSORY_HEIGHT + space.lg;
}

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; label: string; icon: IconName; iconOn: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home-outline', iconOn: 'home' },
  { name: 'documents', label: 'Documents', icon: 'folder-outline', iconOn: 'folder' },
  { name: 'settings', label: 'Settings', icon: 'options-outline', iconOn: 'options' },
];

type TabButtonProps = TabTriggerSlotProps & { label: string; icon: IconName; iconOn: IconName; compact: boolean };

/** One tab inside the glass bar. Rendered through TabTrigger asChild, which supplies onPress and isFocused. */
const TabButton = forwardRef<RNView, TabButtonProps>(function TabButton(
  { label, icon, iconOn, compact, isFocused, ...pressable },
  ref,
) {
  // Collapsed bar keeps only the current tab.
  if (compact && !isFocused) return null;
  const color = isFocused ? colors.primary : palette.slate700;
  return (
    <Pressable
      ref={ref}
      {...pressable}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [
        styles.tab,
        compact ? styles.tabCompact : null,
        isFocused ? styles.tabOn : null,
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      <Ionicons name={isFocused ? iconOn : icon} size={22} color={color} />
      {compact ? null : (
        <AppText variant="small" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, color, fontWeight: isFocused ? '700' : '600' }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
});

/**
 * Floating Liquid Glass tab bar (design: "Glass · Home"): a glass capsule of tabs plus a
 * search circle. Scrolling down collapses it to the current tab and slides the review
 * capsule in beside it, like the iOS Music now-playing bar.
 */
export function FloatingTabBar() {
  const insets = useSafeAreaInsets();
  const compact = useChrome((s) => s.compact);
  const reviewing = useReviewJob((s) => s.status !== 'idle');
  const onDocuments = usePathname() === '/documents';
  const bottom = Math.max(insets.bottom, space.md) + space.xs;

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.create(320, 'easeInEaseOut', 'opacity'));
  }, [compact, reviewing]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {reviewing ? (
        <GlassSurface
          style={[
            styles.accessory,
            compact
              ? { bottom: bottom + (TAB_BAR_HEIGHT - ACCESSORY_HEIGHT) / 2, left: space.lg + TAB_BAR_HEIGHT + space.sm, right: space.lg + TAB_BAR_HEIGHT + space.sm }
              : { bottom: bottom + TAB_BAR_HEIGHT + space.md, left: space.lg, right: space.lg },
          ]}
        >
          <ReviewAccessory compact={compact} />
        </GlassSurface>
      ) : null}

      <View pointerEvents="box-none" style={[styles.row, { bottom }]}>
        <GlassSurface style={styles.bar}>
          <View accessibilityRole="tablist" style={styles.tabs}>
            {TABS.map((t) => (
              <TabTrigger key={t.name} name={t.name} asChild>
                <TabButton label={t.label} icon={t.icon} iconOn={t.iconOn} compact={compact} />
              </TabTrigger>
            ))}
          </View>
        </GlassSurface>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search your reviews"
          onPress={() => router.navigate({ pathname: '/documents', params: { search: String(Date.now()) } })}
          hitSlop={4}
        >
          {({ pressed }) => (
            <GlassSurface variant={onDocuments ? 'tinted' : 'regular'} style={[styles.search, pressed && { transform: [{ scale: 0.94 }] }]}>
              <Ionicons name="search" size={24} color={onDocuments ? colors.primary : colors.text} />
            </GlassSurface>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bar: { height: TAB_BAR_HEIGHT, padding: BAR_PAD, justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 2 },
  tab: {
    minWidth: 72,
    height: TAB_BAR_HEIGHT - BAR_PAD * 2,
    paddingHorizontal: space.md,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabCompact: { minWidth: TAB_BAR_HEIGHT - BAR_PAD * 2, paddingHorizontal: 0 },
  tabOn: { backgroundColor: glass.selected },
  search: { width: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  accessory: { position: 'absolute', height: ACCESSORY_HEIGHT, flexDirection: 'row', alignItems: 'center' },
});
