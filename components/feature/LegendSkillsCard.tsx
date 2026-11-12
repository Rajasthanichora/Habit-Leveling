// ─── Legend Skills card (Trophy Hall's successor) ───────────────────────────
//
// The old badge/trophy hall is gone. This card shows the nine hard-earned
// LEGEND skills instead — unlocked only through Weekly Raids 🐉, 7-Day
// Challenges 🏆 and Season closures 🗓️, each ALSO gated behind a player
// level and stretched by the difficulty preset (gentle ×1 · balanced ×1.25
// · hardcore ×1.5 on the win count).

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { LEGEND_SKILLS } from '../../services/gameRules';
import { legendProgress } from '../../services/skillService';

const KIND_META: Record<string, { label: string; color: string }> = {
  raid: { label: 'RAID', color: '#F97373' },
  challenge: { label: 'CHALLENGE', color: Colors.warning },
  season: { label: 'SEASON', color: '#7C9EF5' },
};

const LOCKED = 'rgba(255,255,255,0.35)';

export function LegendSkillsCard() {
  const [data, setData] = useState<Awaited<ReturnType<typeof legendProgress>> | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await legendProgress());
    } catch {}
  }, []);

  useEffect(() => {
    void reload();
    // Poll briefly — raids/challenges fire library events the card may miss.
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  const ownedCount = LEGEND_SKILLS.filter((n) => data?.nodes[n.id]?.owned).length;

  return (
    <LinearGradient
      colors={['rgba(251,191,36,0.10)', 'rgba(251,191,36,0.03)', 'rgba(255,255,255,0.02)']}
      locations={[0, 0.45, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleBadge}>
          <Text style={styles.titleBadgeEmoji}>⚔️</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Legend Skills</Text>
          <Text style={styles.titleSub}>Earned in raids, challenges & seasons</Text>
        </View>
        <View style={styles.countChip}>
          <Text style={styles.countChipText}>{ownedCount}/{LEGEND_SKILLS.length}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {LEGEND_SKILLS.map((def) => {
          const node = data?.nodes[def.id];
          const owned = !!node?.owned;
          const levelOk = node?.levelOk ?? false;
          const pct = node && node.target > 0 ? Math.min(1, node.current / node.target) : 0;
          const kindMeta = KIND_META[def.kind];
          return (
            <View key={def.id} style={[styles.cell, owned && styles.cellOwned]}>
              <View style={styles.cellTop}>
                <Text style={[styles.cellIcon, !owned && { opacity: 0.4 }]}>{def.icon}</Text>
                <View style={[styles.kindChip, { borderColor: `${kindMeta.color}55`, backgroundColor: `${kindMeta.color}14` }]}>
                  <Text style={[styles.kindChipText, { color: kindMeta.color }]}>{kindMeta.label}</Text>
                </View>
              </View>
              <Text style={[styles.cellName, !owned && { color: LOCKED }]} numberOfLines={1}>
                {def.name}
              </Text>
              <Text style={styles.cellDesc} numberOfLines={2}>
                {def.desc}
              </Text>
              {owned ? (
                <Text style={styles.cellOwnedText}>✓ Earned</Text>
              ) : (
                <>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
                  </View>
                  <Text style={styles.cellReq} numberOfLines={1}>
                    {node ? `${node.current}/${node.target} wins · Lv ${def.minLevel}` : `Lv ${def.minLevel}`}
                    {!levelOk ? ' 🔒' : ''}
                  </Text>
                </>
              )}
            </View>
          );
        })}
      </View>

      <Text style={styles.footerNote}>
        Win counts stretch with your difficulty — balanced ×1.25, hardcore ×1.5. Nothing here is
        bought: titles like 🏅 Arena Blooded (4 skills) live in Skill Trees → Titles.
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: 'rgba(251,191,36,0.22)',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    marginBottom: Spacing.md,
  },
  titleBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.warning,
    shadowOpacity: 0.3,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  titleBadgeEmoji: { fontSize: 17 },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  titleSub: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
    fontWeight: FontWeight.medium,
  },
  countChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.32)',
    backgroundColor: 'rgba(251,191,36,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countChipText: {
    fontSize: 9.5,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm - 2,
  },
  cell: {
    flexGrow: 1,
    flexBasis: '31%',
    minWidth: '31%',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: 'rgba(0,0,0,0.22)',
    padding: Spacing.sm - 2,
  },
  cellOwned: {
    borderColor: 'rgba(251,191,36,0.45)',
    backgroundColor: 'rgba(251,191,36,0.07)',
  },
  cellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs + 1,
    gap: 4,
  },
  cellIcon: { fontSize: 16 },
  kindChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
  },
  kindChipText: {
    fontSize: 7,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  cellName: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  cellDesc: {
    fontSize: 9,
    color: Colors.textMuted,
    lineHeight: 12,
    marginBottom: Spacing.xs + 1,
    minHeight: 24,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    marginBottom: 3,
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.warning,
  },
  cellReq: {
    fontSize: 8.5,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  cellOwnedText: {
    fontSize: 9,
    color: Colors.warning,
    fontWeight: FontWeight.bold,
  },
  footerNote: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm - 2,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    fontSize: 9,
    color: Colors.textMuted,
    lineHeight: 13,
  },
});
