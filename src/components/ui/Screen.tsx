import { BlurView } from 'expo-blur';
import { useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  /** Primary actions; they float over the content as glass. */
  footer?: ReactNode;
  scroll?: boolean;
  /** Edges handled here; omit 'top' when a native header is shown. */
  edges?: ('top' | 'bottom')[];
}

export function Screen({ children, footer, scroll = true, edges = ['bottom'] }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const top = edges.includes('top') ? insets.top : 0;
  const bottom = edges.includes('bottom') ? insets.bottom : 0;
  const pad = { paddingTop: space.lg + top, paddingBottom: space.xxl + Math.max(bottom, footerHeight) };

  return (
    <View style={styles.root}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, pad]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, pad]}>{children}</View>
      )}
      {footer ? (
        <View
          pointerEvents="box-none"
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          style={[styles.footer, { paddingBottom: Math.max(bottom, space.lg) }]}
        >
          {/* Frosted scroll edge: footers can hold helper text, which needs a backdrop to stay legible. */}
          {Platform.OS === 'ios' ? (
            <BlurView tint="systemUltraThinMaterialLight" intensity={60} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.footerFill]} />
          )}
          {footer}
        </View>
      ) : null}
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
  footerFill: { backgroundColor: 'rgba(242,244,247,0.94)' },
});
