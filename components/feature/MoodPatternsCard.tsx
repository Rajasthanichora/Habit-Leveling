// Mood Patterns 🎭 — the aura reader on Statistics. Shows how the player's
// last 30 days of completed habits *feel*: mood coins per tier, glowing
// candy bars, and a "positive aura" meter styled like the HQ game panels.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { loadCompletions } from '../../services/habitService';

const MOOD_ROWS: { id: 'great' | 'good' | 'ok' | 'rough'; emoji: string; label: string; color: string }[] = [
  { id: 'great', emoji: '🤩', label: 'Great', color: Colors.success },
  { id: 'good', emoji: '🙂', label: 'Good', color: Colors.success },
  { id: 'ok', emoji: '😐', label: 'OK', color: Colors.primary },
  { id: 'rough', emoji: '😵', label: 'Rough', color: Colors.danger },
];

// Edge colors for the candy bar gradients (top → bottom face look).
const MOOD_FACE: Record<string, [string, string]> = {
  great: ['#34D399', '#0B8A5C'],
  good: ['#34D399', '#1E7A4C'],
  ok: ['#67E8F9', '#2563EB'],
  rough: ['#F87171', '#B91C1C'],
};

/** Mood patterns over the last 30 days — how your completions *feel*. */
export function MoodPatternsCard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let active = true;
    loadCompletions().then((completions) => {
      if (!active) return;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const withMood = completions.filter(
        (c) => c.completed && c.mood && new Date(c.completedAt) >= cutoff
      );
      const map: Record<string, number> = {};
      withMood.forEach((c) => {
        map[c.mood!] = (map[c.mood!] ?? 0) + 1;
      });
      setCounts(map);
      setTotal(withMood.length);
    });
    return () => {
      active = false;
    };
  }, []);

  const maxCount = Math.max(...MOOD_ROWS.map((m) => counts[m.id] ?? 0), 0);
  const positivePct = total > 0
    ? Math.round(((counts.great ?? 0) + (counts.good ?? 0)) / total * 100)
    : 0;

  return (
    <LinearGradient
      colors={['rgba(167,139,250,0.12)', 'rgba(167,139,250,0.03)', 'rgba(255,255,255,0.02)']}
      locations={[0, 0.45, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleBadge}>
          <Text style={styles.titleBadgeEmoji}>🎭</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Mood Patterns</Text>
          <Text style={styles.titleSub}>Last 30 days · how your wins feel</Text>
        </View>
        {total > 0 && (
          <View style={styles.counterChip}>
            <MaterialIcons name="insights" size={11} color="#C4B5FD" />
            <Text style={styles.counterText}>{total}</Text>
          </View>
        )}
      </View>

      {total === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🌈</Text>
          <Text style={styles.empty}>
            No mood data yet — complete habits and rate them to reveal your aura
          </Text>
        </View>
      ) : (
        <View style={styles.rows}>
          {MOOD_ROWS.map((m) => {
            const n = counts[m.id] ?? 0;
            const pct = total > 0 ? n / total : 0;
            const isTop = n > 0 && n === maxCount;
            const face = MOOD_FACE[m.id] ?? ['#4E8EFF', '#2E63C9'];
            return (
              <View key={m.id} style={styles.row}>
                <View style={[styles.moodCoin, { borderColor: `${m.color}55`, backgroundColor: `${m.color}14` }]}>
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.trackHead}>
                    <Text style={styles.moodLabel}>
                      {m.label}{isTop ? ' 👑' : ''}
                    </Text>
                    <Text style={[styles.value, { color: n > 0 ? m.color : Colors.textMuted }]}>
                      {n}
                    </Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: `${m.color}12` }]}>
                    <LinearGradient
                      colors={face}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0.6 }}
                      style={[styles.fill, { width: `${Math.max(n > 0 ? 5 : 0, Math.round(pct * 100))}%` }]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Positive-aura meter */}
      <View style={styles.insightRow}>
        <View style={styles.auraChip}>
          <MaterialIcons name="auto-awesome" size={13} color={positivePct >= 60 ? Colors.success : Colors.warning} />
          <Text style={[styles.auraValue, { color: positivePct >= 60 ? Colors.success : Colors.warning }]}>
            {positivePct}%
          </Text>
          <Text style={styles.auraLabel}>positive aura</Text>
        </View>
        <Text style={styles.legendText}>
          {total > 0
            ? `${positivePct}% of your check-ins feel positive`
            : 'Patterns appear as you rate more completions'}
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.28)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    overflow: 'hidden',
    shadowColor: 'rgba(167,139,250,0.25)',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    marginBottom: Spacing.sm + 2,
  },
  titleBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(167,139,250,0.42)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A78BFA',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  titleBadgeEmoji: { fontSize: 15 },
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
  counterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    backgroundColor: 'rgba(167,139,250,0.10)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  counterText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: '#C4B5FD',
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
  },
  emptyEmoji: { fontSize: 22, opacity: 0.9 },
  empty: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  rows: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  moodCoin: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodEmoji: { fontSize: 14 },
  trackHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  moodLabel: {
    fontSize: 10.5,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  track: {
    height: 9,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  value: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(167,139,250,0.18)',
  },
  auraChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    backgroundColor: 'rgba(167,139,250,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  auraValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  auraLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
  },
  legendText: {
    fontSize: 10,
    color: Colors.textMuted,
    flex: 1,
    minWidth: 0,
  },
});
