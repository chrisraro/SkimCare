import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabBarSpace } from '@/components/glass/metrics';
import { GlassHeader, GlassVeil, HEADER_GAP, HEADER_HEIGHT } from '@/components/glass/GlassHeader';
import { COMPACT_AFTER, useChrome } from '@/features/chrome/store';
import { colors, space } from '@/theme/tokens';
import { GlassScene } from './GlassScene';

interface ScreenProps {
  children: ReactNode;
  /** Primary actions; they float over the content as glass. */
  footer?: ReactNode;
  scroll?: boolean;
  /** Edges handled here when there is no header; omit 'top' if something else covers it. */
  edges?: ('top' | 'bottom')[];
  /** Shows the floating glass header with this title. */
  title?: string;
  /** Header back button (default true when there is a header). */
  back?: boolean;
  /** Header actions, e.g. a GlassActionGroup. */
  headerRight?: ReactNode;
  /** A tab screen: leaves room for the floating tab bar and collapses it on scroll. */
  tab?: boolean;
}

export function Screen({ children, footer, scroll = true, edges = ['bottom'], title, back = true, headerRight, tab }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const setCompact = useChrome((s) => s.setCompact);
  const hasHeader = title !== undefined;

  // Each tab starts with the full bar.
  useFocusEffect(
    useCallback(() => {
      if (tab) setCompact(false);
    }, [tab, setCompact]),
  );

  const onScroll = tab
    ? (e: NativeSyntheticEvent<NativeScrollEvent>) => setCompact(e.nativeEvent.contentOffset.y > COMPACT_AFTER)
    : undefined;

  const top = hasHeader ? insets.top + HEADER_GAP + HEADER_HEIGHT + space.lg : edges.includes('top') ? insets.top + space.lg : space.lg;
  const bottomEdge = edges.includes('bottom') ? insets.bottom : 0;
  const bottom = tab ? tabBarSpace(insets.bottom) : space.xxl + Math.max(bottomEdge, footerHeight);
  const pad = { paddingTop: top, paddingBottom: bottom };

  const chrome = (
    <>
      {hasHeader ? <GlassHeader title={title} back={back} right={headerRight} /> : null}
      {/* Tab screens without a header still get a frosted status-bar edge. */}
      {!hasHeader && edges.includes('top') ? <GlassVeil edge="top" height={insets.top} /> : null}
      {footer ? (
        <View
          pointerEvents="box-none"
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          style={[styles.footer, { paddingBottom: Math.max(bottomEdge, space.lg) }]}
        >
          {/* Frosted scroll edge: footers can hold helper text, which needs a backdrop to stay legible. */}
          <GlassVeil edge="bottom" height={footerHeight} />
          {footer}
        </View>
      ) : null}
    </>
  );

  return (
    // Headless TabSlot screens size to their content (flexShrink 0); pinning the root bounds the ScrollView.
    <View style={[styles.root, tab ? StyleSheet.absoluteFill : null]}>
      {hasHeader ? <Stack.Screen options={{ title, headerShown: false }} /> : null}
      <GlassScene chrome={chrome}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, pad]}
            keyboardShouldPersistTaps="handled"
            // iOS: scroll focused inputs above the keyboard (Android resizes the window).
            automaticallyAdjustKeyboardInsets
            onScroll={onScroll}
            scrollEventThrottle={32}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.fill, pad]}>{children}</View>
        )}
      </GlassScene>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { paddingHorizontal: space.lg + 4, gap: space.lg },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
  },
});
