import Ionicons from '@expo/vector-icons/Ionicons';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReviewAccessory } from '@/components/ReviewAccessory';
import { GlassSurface } from '@/components/ui';
import { useReviewJob } from '@/features/review/jobStore';
import { colors, fonts, space } from '@/theme/tokens';

/** The native bottom accessory exists only on iOS 26; elsewhere a glass capsule floats above the bar. */
const NATIVE_ACCESSORY = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** Approximate tab bar heights, used to float the fallback capsule just above them. */
const TAB_BAR_HEIGHT = Platform.select({ ios: 49, android: 80, default: 64 });

/**
 * Native tabs: a floating Liquid Glass bar on iOS 26 builds (it minimizes as
 * you scroll), the platform tab bar on Android. Native tabs' web view overlays
 * the content, so web keeps a plain bottom bar. Screens draw their own titles.
 */
export default function TabsLayout() {
  const reviewing = useReviewJob((s) => s.status !== 'idle');

  if (Platform.OS === 'web') {
    return (
      <WithFloatingAccessory show={reviewing}>
        <WebTabs />
      </WithFloatingAccessory>
    );
  }

  const tabs = (
    <NativeTabs tintColor={colors.primary} minimizeBehavior="onScrollDown">
      {NATIVE_ACCESSORY && reviewing ? (
        <NativeTabs.BottomAccessory>
          <NativeAccessoryContent />
        </NativeTabs.BottomAccessory>
      ) : null}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="documents">
        <NativeTabs.Trigger.Label>Documents</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'folder', selected: 'folder.fill' }} md="folder" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );

  if (NATIVE_ACCESSORY) return tabs;
  return <WithFloatingAccessory show={reviewing}>{tabs}</WithFloatingAccessory>;
}

/** iOS 26 renders this twice (regular above the bar, inline when it minimizes). */
function NativeAccessoryContent() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <ReviewAccessory compact={placement === 'inline'} />;
}

function WithFloatingAccessory({ show, children }: { show: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      {children}
      {show ? (
        <View pointerEvents="box-none" style={[styles.floating, { bottom: insets.bottom + TAB_BAR_HEIGHT + space.sm }]}>
          <GlassSurface style={styles.capsule}>
            <ReviewAccessory />
          </GlassSurface>
        </View>
      ) : null}
    </View>
  );
}

function WebTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.sans[600], fontSize: 12 },
        tabBarStyle: { minHeight: 64, backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="documents"
        options={{ title: 'Documents', tabBarIcon: ({ color, size }) => <Ionicons name="folder-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  floating: { position: 'absolute', left: space.lg, right: space.lg },
  capsule: { minHeight: 60, flexDirection: 'row', alignItems: 'center' },
});
