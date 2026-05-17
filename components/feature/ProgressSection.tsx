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
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterpolated = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const pct = Math.round(progress * 100);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>PROGRESS</Text>
        <Text style={styles.pctText}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: widthInterpolated }]} />
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
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.2,
  },
  pctText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  track: {
    height: 6,
    backgroundColor: Colors.progressBg,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  subLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
