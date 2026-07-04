import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';

const PALETTES: [string, string][] = [
  ['#2d1b69', '#11998e'],
  ['#0f3460', '#0d9488'],
  ['#134e5e', '#71b280'],
  ['#2d1b69', '#11998e'],
];

interface GradientBackgroundProps extends ViewProps {
  durationMs?: number;
}

// Cross-fades between gradient palettes by animating the opacity of a top layer
// that swaps its colors each cycle. The RN-native equivalent of the web
// framer-motion animated-background component.
export function GradientBackground({ children, durationMs = 6000, ...props }: GradientBackgroundProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % PALETTES.length), durationMs);
    return () => clearInterval(id);
  }, [durationMs]);

  const current = PALETTES[index];

  return (
    <View style={styles.fill} {...props}>
      <LinearGradient colors={PALETTES[0]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <MotiView
        key={index}
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: durationMs / 2 }}
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient colors={current} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </MotiView>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1 },
});
