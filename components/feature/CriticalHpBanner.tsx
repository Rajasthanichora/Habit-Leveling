// ⚠️ Critical-HP warning banner — "2 habits critical HP".
// Reads the live hpMap and lists habits whose HP has fallen into the danger
// zone (≤ 25). Display-only: it lives next to the quest card on HQ so the
// Today screen keeps its exact structure.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';

const CRITICAL_HP = 25;

export function CriticalHpBanner() {
  const { hpMap, habits } = useHabits();

  const critical = useMemo(
    () =>
      habits
        .filter((h) => !h.archived)
        .filter((h) => {
          const state = hpMap[h.id];
          return state && !state.collapsedAt && state.hp <= CRITICAL_HP;
        })
        .sort((a, b) => (hpMap[a.id]?.hp ?? 0) - (hpMap[b.id]?.hp ?? 0)),
    [hpMap, habits]
  );

  if (critical.length === 0) return null;

  const names = critical.slice(0, 2).map((h) => h.name);
  const extra = critical.length - names.length;

  return (
    <View style={styles.banner}>
      <View style={styles.sirenAvatar}>
        <MaterialIcons name="warning-amber" size={16} color={Colors.danger} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>
          {critical.length} habit{critical.length !== 1 ? 's' : ''} in critical HP
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {names.join(', ')}
          {extra > 0 ? ` · +${extra} more` : ''} — complete them to heal
        </Text>
      </View>
      <View style={styles.hpChip}>
        <Text style={styles.hpChipText}>LOW HP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sirenAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hpChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  hpChipText: {
    fontSize: 8,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.2,
    color: Colors.danger,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.danger,
  },
  sub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
