// Powered by OnSpace.AI
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

interface Props {
  progress: number; // 0–1
  completed: number;
  total: number;
}

export function ProgressSection({ progress, completed, total }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterpolated = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const pct = Math.round(progress * 100);

  // Color shifts: muted → primary → success based on completion
  const fillColor = pct >= 100 ? Colors.success : Colors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>PROGRESS</Text>
        <View style={styles.pctRow}>
          <Text style={[styles.pctText, pct >= 100 && { color: Colors.success }]}>{pct}%</Text>
        </View>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: widthInterpolated, backgroundColor: fillColor }]} />
        {pct > 0 && pct < 100 && (
          <Animated.View style={[styles.fillGlow, { width: widthInterpolated, backgroundColor: `${fillColor}22` }]} />
        )}
      </View>
      <Text style={styles.subLabel}>
        {completed} of {total} habits completed
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.4,
  },
  pctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pctText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  track: {
    height: 4,
    backgroundColor: Colors.progressBg,
    borderRadius: Radius.full,
    overflow: 'visible',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  fillGlow: {
    position: 'absolute',
    top: -2,
    left: 0,
    height: 8,
    borderRadius: Radius.full,
  },
  subLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 5,
  },
});
