import { BlurTargetView } from 'expo-blur';
import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Where glass can blur from. Android's blur (Dimezis BlurView) needs an explicit
 * BlurTargetView to sample, and a BlurView must sit OUTSIDE that target — so a
 * scene splits into content (the target) and chrome (overlays that blur it).
 */
type GlassTarget = RefObject<View | null> | null;

const GlassTargetContext = createContext<GlassTarget>(null);

/** The blur target for glass drawn here, or null when there is nothing safe to sample. */
export function useGlassTarget(): GlassTarget {
  return useContext(GlassTargetContext);
}

interface GlassSceneProps {
  /** Scrolling content — becomes the surface the chrome blurs. */
  children: ReactNode;
  /** Floating glass chrome (headers, bars, footers) drawn above the content. */
  chrome?: ReactNode;
}

export function GlassScene({ children, chrome }: GlassSceneProps) {
  const target = useRef<View | null>(null);
  return (
    <View style={styles.fill}>
      {/* Glass inside the content cannot blur its own target, so it gets no target. */}
      <GlassTargetContext.Provider value={null}>
        <BlurTargetView ref={target} style={styles.fill}>
          {children}
        </BlurTargetView>
      </GlassTargetContext.Provider>
      <GlassTargetContext.Provider value={target}>{chrome}</GlassTargetContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
