import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, glass, palette } from '@/theme/tokens';
import { useGlassTarget } from './GlassScene';

/** Real Liquid Glass needs iOS 26 and a runtime that actually ships the API. */
const LIQUID = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    // The setting and its API exist only on iOS; elsewhere there is no translucency to reduce.
    if (Platform.OS !== 'ios') return;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((v) => alive && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

interface GlassSurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `prominent` is the teal glass of primary actions; `tinted` the soft teal of a selected control. */
  variant?: 'regular' | 'prominent' | 'tinted';
  /** Blur strength, 1–100. */
  intensity?: number;
}

/**
 * Glass for controls only (buttons, bars, headers, sheets) — never for contract text.
 *  1. Reduce Transparency → solid surface.
 *  2. iOS 26 → native Liquid Glass.
 *  3. Otherwise a real blur via expo-blur: system material on iOS, backdrop-filter on
 *     web, Dimezis BlurView on Android 12+ (Android 11 and below get a tinted view).
 *     Android can only blur a BlurTargetView, so outside a GlassScene's chrome it uses a fill.
 */
export function GlassSurface({ children, style, variant = 'regular', intensity = 60 }: GlassSurfaceProps) {
  const reduce = useReduceTransparency();
  const target = useGlassTarget();
  const radius = StyleSheet.flatten(style)?.borderRadius ?? 999;
  const layer = [StyleSheet.absoluteFill, { borderRadius: radius }];

  if (variant === 'prominent') {
    if (LIQUID && !reduce) {
      return (
        <GlassView glassEffectStyle="regular" tintColor={colors.primary} style={[styles.base, style]}>
          {children}
        </GlassView>
      );
    }
    return <View style={[styles.base, styles.rim, styles.lift, { backgroundColor: colors.primary }, style]}>{children}</View>;
  }

  const tint = variant === 'tinted' ? glass.tealFill : null;

  if (reduce) {
    return <View style={[styles.base, { backgroundColor: tint ?? glass.solid }, style]}>{children}</View>;
  }

  if (LIQUID) {
    return (
      <GlassView glassEffectStyle="regular" tintColor={tint ?? undefined} isInteractive style={[styles.base, style]}>
        {children}
      </GlassView>
    );
  }

  const canBlur = Platform.OS !== 'android' || target !== null;
  return (
    <View style={[styles.base, styles.lift, style]}>
      {canBlur ? (
        <BlurView
          tint={Platform.OS === 'ios' ? 'systemChromeMaterialLight' : 'light'}
          intensity={intensity}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={target ?? undefined}
          style={[layer, styles.clip]}
        />
      ) : null}
      {/* The milky fill keeps text on glass at full contrast whatever scrolls beneath. */}
      <View
        pointerEvents="none"
        style={[layer, styles.rim, { backgroundColor: tint ?? (canBlur ? glass.fill : glass.fillAndroid) }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 999 },
  clip: { overflow: 'hidden' },
  rim: { borderWidth: StyleSheet.hairlineWidth, borderColor: glass.rim },
  lift: {
    shadowColor: palette.navy900,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
