import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, space } from '@/theme/tokens';
import { AppText } from './AppText';

/** Model interpretation — labeled so it is never confused with source text. */
export function AiNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="sparkles-outline" size={14} color={colors.textMuted} />
        <AppText variant="label" tone="muted">
          {label.toUpperCase()}
        </AppText>
      </View>
      {typeof children === 'string' ? <AppText>{children}</AppText> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
