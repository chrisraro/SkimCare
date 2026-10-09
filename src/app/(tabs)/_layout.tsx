import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet } from 'react-native';
import { FloatingTabBar } from '@/components/glass/FloatingTabBar';
import { GlassScene } from '@/components/ui/GlassScene';

/**
 * Tabs with the floating Liquid Glass bar from the design canvas, on every platform.
 * Headless tabs (expo-router/ui) let the bar float over the screens, which become the
 * blur target the glass samples — real blur on Android via expo-blur, not just a tint.
 */
export default function TabsLayout() {
  return (
    <Tabs style={styles.fill}>
      <GlassScene chrome={<FloatingTabBar />}>
        <TabSlot />
      </GlassScene>
      {/* Registers the routes; the visible triggers live in FloatingTabBar. */}
      <TabList style={styles.hidden}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="documents" href="/documents" />
        <TabTrigger name="settings" href="/settings" />
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
});
