import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { useGlassTarget } from '@/components/ui/GlassScene';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { colors, glass, space } from '@/theme/tokens';

/** Height the header occupies below the status bar; content starts after it. */
export const HEADER_HEIGHT = 48;
export const HEADER_GAP = 6;

/** Frosted veil content scrolls under (the iOS "scroll edge"). Blurs the scene on every platform. */
export function GlassVeil({ height, edge }: { height: number; edge: 'top' | 'bottom' }) {
  const target = useGlassTarget();
  const canBlur = Platform.OS !== 'android' || target !== null;
  return (
    <View pointerEvents="none" style={[styles.veil, edge === 'top' ? { top: 0 } : { bottom: 0 }, { height }]}>
      {canBlur ? (
        <BlurView
          tint="light"
          intensity={24}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={target ?? undefined}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: canBlur ? glass.edge : colors.bg }]} />
    </View>
  );
}

/** A 48px round glass button for header actions. */
export function GlassIconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}>
      {({ pressed }) => (
        <GlassSurface style={[styles.circle, pressed && styles.pressed]}>
          <Ionicons name={icon} size={22} color={colors.text} />
        </GlassSurface>
      )}
    </Pressable>
  );
}

/** Groups several header actions into one glass capsule, like Photos and Safari. */
export function GlassActionGroup({ children }: { children: ReactNode }) {
  return <GlassSurface style={styles.group}>{children}</GlassSurface>;
}

/** An action inside a GlassActionGroup. */
export function GlassGroupAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.groupAction, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={21} color={colors.text} />
    </Pressable>
  );
}

interface GlassHeaderProps {
  title?: string;
  /** Show the back button (default true). Off for screens that must not be left mid-task. */
  back?: boolean;
  right?: ReactNode;
}

/**
 * Floating navigation header: glass back circle, glass title capsule, optional
 * actions — over a frosted scroll edge so content stays legible as it passes under.
 */
export function GlassHeader({ title, back = true, right }: GlassHeaderProps) {
  const insets = useSafeAreaInsets();
  const top = insets.top + HEADER_GAP;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <>
      <GlassVeil edge="top" height={top + HEADER_HEIGHT + space.sm} />
      <View style={[styles.bar, { top }]} pointerEvents="box-none">
        {back ? <GlassIconButton icon="chevron-back" label="Back" onPress={goBack} /> : <View style={styles.spacer} />}
        {title ? (
          <GlassSurface style={styles.title}>
            <AppText variant="bodyStrong" numberOfLines={1} accessibilityRole="header" style={{ fontWeight: '600' }}>
              {title}
            </AppText>
          </GlassSurface>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {right ?? <View style={styles.spacer} />}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  veil: { position: 'absolute', left: 0, right: 0 },
  bar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  circle: { width: HEADER_HEIGHT, height: HEADER_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.94 }] },
  spacer: { width: HEADER_HEIGHT },
  title: {
    flexShrink: 1,
    height: HEADER_HEIGHT,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    marginHorizontal: 'auto',
  },
  group: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs },
  groupAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
