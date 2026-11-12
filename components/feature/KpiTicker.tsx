// KPI Ticker — horizontally scrolling headline stat cards for the Stats
// screen. Purely a re-arrangement of already-computed summary / advanced
// numbers into one swipeable strip: no new datastore, no async work.
// Candy styling: each card glows in its own stat color, roadmap language.

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

export interface Kpi {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
}

export function KpiTicker({ kpis }: { kpis: Kpi[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {kpis.map((k, i) => (
        <View key={`${k.label}_${i}`} style={[styles.card, { borderColor: `${k.color}38` }]}>
          <LinearGradient
            colors={[`${k.color}1E`, 'rgba(255,255,255,0.02)']}
            locations={[0, 1]}
            start={{ x: 0.25, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={styles.cardGrad}
            pointerEvents="none"
          />
          <View style={[styles.iconBox, { backgroundColor: `${k.color}26`, borderColor: `${k.color}55`, shadowColor: k.color }]}>
            <MaterialIcons name={k.icon as never} size={17} color={k.color} />
          </View>
          <Text style={[styles.value, { textShadowColor: `${k.color}55` }]} numberOfLines={1}>{k.value}</Text>
          <Text style={styles.label} numberOfLines={1}>{k.label}</Text>
          {k.sub ? (
            <Text style={styles.sub} numberOfLines={1}>{k.sub}</Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
    paddingVertical: 2,
  },
  card: {
    width: 128,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 3,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
    shadowOpacity: 0.3,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  value: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textShadowRadius: 7,
    textShadowOffset: { width: 0, height: 1 },
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  sub: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});
