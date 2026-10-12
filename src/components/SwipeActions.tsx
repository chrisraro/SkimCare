import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { palette, radius, space } from '@/theme/tokens';
import { AppText } from './ui/AppText';

export interface SwipeAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** `danger` for delete-like actions. Colour is never the only signal: icon + words. */
  tone?: 'default' | 'danger';
  onPress: () => void;
}

const ACTION_WIDTH = 84;
/** Horizontal travel before the row takes the gesture (vertical scrolling keeps working). */
const SLOP = 12;

/**
 * Swipe left to reveal actions behind a row (Rename, Delete…). Built on PanResponder +
 * Animated, so it needs no native module and behaves the same on Android, iOS and web.
 * Screen readers get the same actions through `accessibilityActions`, since a swipe is
 * not discoverable without sight.
 */
export function SwipeActions({
  actions,
  children,
  style,
  actionsHeight,
}: {
  actions: SwipeAction[];
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Height of the visible part of the row, when cards overlap (actions sit in that strip). */
  actionsHeight?: number;
}) {
  const width = actions.length * ACTION_WIDTH;
  // Created once per row: the animated offset, whether it is open, and the gesture handler.
  const [swipe] = useState(() => createSwipe(width));

  // Web: react-native-web runs onPress from the DOM click that follows mouse-up, even after a
  // drag. Catch it in the capture phase: right after a swipe it is swallowed, and while the
  // actions are open a tap on the card closes them instead of opening it (as on a phone).
  const cardRef = useRef<View>(null);
  useEffect(() => {
    const el = cardRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !el?.addEventListener) return;
    const onClick = (e: Event) => {
      if (!swipe.justSwiped() && !swipe.isOpen()) return;
      e.stopPropagation();
      e.preventDefault();
      if (!swipe.justSwiped()) swipe.settle(0);
    };
    el.addEventListener('click', onClick, true);
    return () => el.removeEventListener('click', onClick, true);
  }, [swipe]);

  const run = (action: SwipeAction) => {
    swipe.settle(0);
    action.onPress();
  };

  return (
    <View
      style={style}
      accessibilityActions={actions.map((a) => ({ name: a.key, label: a.label }))}
      onAccessibilityAction={(e) => {
        const a = actions.find((x) => x.key === e.nativeEvent.actionName);
        if (a) a.onPress();
      }}
    >
      <View style={[styles.actions, { width, height: actionsHeight ?? '100%' }]} importantForAccessibility="no-hide-descendants">
        {actions.map((a) => (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={() => run(a)}
            style={({ pressed }) => [styles.action, a.tone === 'danger' && styles.danger, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name={a.icon} size={22} color={a.tone === 'danger' ? palette.coral700 : palette.navy900} />
            <AppText variant="small" style={{ fontWeight: '700', color: a.tone === 'danger' ? palette.coral700 : palette.navy900 }}>
              {a.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Animated.View ref={cardRef} style={{ transform: [{ translateX: swipe.x }] }} {...swipe.pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

function createSwipe(width: number) {
  const x = new Animated.Value(0);
  let open = false;
  // On web the browser still sends a click on mouse-up after a drag; this lets the row swallow it.
  let swipedAt = 0;
  const justSwiped = () => Date.now() - swipedAt < 400;

  const settle = (to: 0 | 1) => {
    open = to === 1;
    Animated.spring(x, { toValue: to ? -width : 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };

  const horizontal = (g: PanResponderGestureState) => Math.abs(g.dx) > SLOP && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
  const pan = PanResponder.create({
    // Capture phase: the card inside is a Pressable that already holds the touch, so the row must
    // take it over on a sideways drag (which also cancels the tap). Vertical drags still scroll.
    onMoveShouldSetPanResponderCapture: (_, g) => horizontal(g),
    onMoveShouldSetPanResponder: (_, g) => horizontal(g),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => {
      // Follow the finger, with resistance past the actions and none to the right.
      const next = Math.min(0, (open ? -width : 0) + g.dx);
      x.setValue(next < -width ? -width + (next + width) / 3 : next);
    },
    onPanResponderRelease: (_, g) => {
      swipedAt = Date.now();
      const travelled = -((open ? -width : 0) + g.dx);
      settle(travelled > width / 2 || g.vx < -0.5 ? 1 : 0);
    },
    onPanResponderTerminate: () => settle(open ? 1 : 0),
  });

  return { x, pan, settle, justSwiped, isOpen: () => open };
}

const styles = StyleSheet.create({
  actions: {
    position: 'absolute',
    right: 0,
    top: 0,
    flexDirection: 'row',
    gap: space.xs,
    paddingLeft: space.xs,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.card,
    backgroundColor: palette.slate100,
  },
  danger: { backgroundColor: palette.coral100 },
});
