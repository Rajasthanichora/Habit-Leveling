// Skeleton loaders — rune-shimmer placeholder blocks for async-heavy areas
// (Today habit list, badge grid). Pure Animated loop on native driver; no
// layout cost while hidden.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

export function useShimmer() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return t;
}

function Block({ shimmer, style }: { shimmer: Animated.Value; style: object }) {
  return (
    <View style={[styles.block, style]}>
      <Animated.View
        style={[
          styles.shine,
          {
            opacity: shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 0.7, 0.25] }),
          },
        ]}
      />
    </View>
  );
}

/** Habit-card shaped skeleton row (icon + two lines + checkbox). */
export function SkeletonHabitRow({ shimmer }: { shimmer: Animated.Value }) {
  return (
    <View style={styles.row}>
      <Block shimmer={shimmer} style={styles.icon} />
      <View style={{ flex: 1, gap: 6 }}>
        <Block shimmer={shimmer} style={styles.lineA} />
        <Block shimmer={shimmer} style={styles.lineB} />
      </View>
      <Block shimmer={shimmer} style={styles.circle} />
    </View>
  );
}

/** A stack of habit rows — direct swap-in for the "Loading habits…" state. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  const shimmer = useShimmer();
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonHabitRow key={i} shimmer={shimmer} />
      ))}
    </View>
  );
}

/** Settings-style list skeleton (line rows). */
export function SkeletonLineRow({ shimmer, wide = false }: { shimmer: Animated.Value; wide?: boolean }) {
  return (
    <View style={[styles.row, { paddingVertical: Spacing.xs }]}>
      <Block shimmer={shimmer} style={[styles.dot, { opacity: wide ? 1 : 0.8 }]} />
      <Block shimmer={shimmer} style={[styles.lineB, { flex: wide ? 1 : 0.8 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  block: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  icon: { width: 44, height: 44, borderRadius: Radius.md },
  lineA: { height: 12, width: '72%' },
  lineB: { height: 8, width: '45%' },
  circle: { width: 28, height: 28, borderRadius: Radius.full },
  dot: { width: 20, height: 20, borderRadius: Radius.full },
});
