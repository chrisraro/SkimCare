import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, space } from '@/theme/tokens';
import { AppText } from './ui';

export function EmptyState({ icon, message }: { icon: ComponentProps<typeof Ionicons>['name']; message: string }) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={36} color={colors.textMuted} />
      <AppText tone="muted" center>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
});
