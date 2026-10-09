import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, glass, palette } from '@/theme/tokens';

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
  /** `prominent` is the teal-tinted glass used for primary actions. */
  variant?: 'regular' | 'prominent';
}

/**
 * Glass for controls only (buttons, bars, sheets) — never for contract text.
 * iOS 26: native Liquid Glass. Older iOS: system blur. Android and
 * Reduce Transparency: an opaque-enough fill so text keeps its contrast.
 */
export function GlassSurface({ children, style, variant = 'regular' }: GlassSurfaceProps) {
  const reduce = useReduceTransparency();
  const prominent = variant === 'prominent';

  if (reduce) {
    return (
      <View style={[styles.base, { backgroundColor: prominent ? colors.primary : glass.solid }, style]}>
        {children}
      </View>
    );
  }

  if (LIQUID) {
    return (
      <GlassView glassEffectStyle="regular" tintColor={prominent ? colors.primary : undefined} style={[styles.base, style]}>
        {children}
      </GlassView>
    );
  }

  if (prominent) {
    return <View style={[styles.base, styles.rim, styles.lift, { backgroundColor: colors.primary }, style]}>{children}</View>;
  }

  if (Platform.OS === 'ios') {
    return (
      <BlurView tint="systemChromeMaterialLight" intensity={80} style={[styles.base, styles.rim, styles.clip, style]}>
        {children}
      </BlurView>
    );
  }

  return (
    <View style={[styles.base, styles.rim, styles.lift, { backgroundColor: glass.fillAndroid }, style]}>{children}</View>
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
