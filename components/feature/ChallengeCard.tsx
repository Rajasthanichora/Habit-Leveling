// 7-Day Challenge card — pick a habit, keep its streak alive for 7 days.
// Evaluate runs whenever completions flip (the streak paying out fires the
// win path inside the service, which emits its own toast + payout).

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import {
  loadChallenge,
  startChallenge,
  abandonChallenge,
  evaluateChallenge,
  challengeCandidates,
  CHALLENGE_TARGET_DAYS,
  ChallengeStore,
} from '../../services/challengeService';

export function ChallengeCard() {
  const { habits, completions, refreshEconomy } = useHabits();
  const [store, setStore] = useState<ChallengeStore | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const evalRes = await evaluateChallenge(habits, completions);
      setStore(evalRes.store);
      setProgress(evalRes.progress);
      if (evalRes.justCompleted) void refreshEconomy();
    } catch {
      setStore(await loadChallenge());
    }
  }, [habits, completions, refreshEconomy]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleStart = useCallback(async (habitId: string) => {
    if (busy) return;
    setBusy(true);
    const habit = habits.find((h) => h.id === habitId);
    if (habit) {
      await startChallenge(habit);
      await reload();
    }
    setBusy(false);
  }, [busy, habits, reload]);

  const handleAbandon = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await abandonChallenge();
    await reload();
    setBusy(false);
  }, [busy, reload]);

  if (!store) return null;
  const active = store.active;
  const candidates = challengeCandidates(habits, store.history).slice(0, 3);

  return (
    <LinearGradient
      colors={['rgba(52,211,153,0.10)', 'rgba(52,211,153,0.03)', 'rgba(255,255,255,0.02)']}
      locations={[0, 0.45, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleBadge}>
          <Text style={styles.titleBadgeEmoji}>🏆</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>7-Day Challenge</Text>
          <Text style={styles.titleSub}>One habit · unbroken streak</Text>
        </View>
        <View style={styles.rewardChip}>
          <Text style={styles.rewardChipText}>+40 XP · +15🪙</Text>
        </View>
      </View>

      {active ? (
        <>
          {/* Streak banner */}
          <View style={styles.activeBanner}>
            <MaterialIcons name="local-fire-department" size={16} color={`${Colors.success}dd`} />
            <Text style={styles.activeName} numberOfLines={1}>
              <Text style={{ color: Colors.success }}>{active.habitName}</Text> · keep it going {active.target} days
            </Text>
          </View>

          {/* Candy streak coins */}
          <View style={styles.dotsRow}>
            {Array.from({ length: active.target }, (_, i) => {
              const done = i < progress;
              const isNext = i === progress && progress < active.target;
              return (
                <View
                  key={i}
                  style={[styles.dotFace, done && styles.dotDone, isNext && styles.dotNext]}
                >
                  {done ? <MaterialIcons name="check" size={10} color="#fff" /> : null}
                  {isNext ? <View style={styles.dotPulse} /> : null}
                </View>
              );
            })}
            <Text style={styles.progressText}>
              {progress}/{active.target}
            </Text>
          </View>

          <View style={styles.activeFooter}>
            <Text style={styles.activeHint}>
              {progress === 0
                ? 'Complete it today to start the streak'
                : progress >= active.target
                  ? 'Checking…'
                  : progress === active.target - 1
                    ? 'One day from the crown 👑'
                    : 'Streak in progress — protect it'}
            </Text>
            <Pressable onPress={handleAbandon} hitSlop={8}>
              <Text style={styles.abandonText}>Abandon</Text>
            </Pressable>
          </View>
        </>
      ) : candidates.length > 0 ? (
        <>
          <Text style={styles.pickText}>Pick a habit — keep it unbroken for {CHALLENGE_TARGET_DAYS} days:</Text>
          <View style={styles.suggestions}>
            {candidates.map((h) => (
              <Pressable key={h.id} style={styles.suggestion} onPress={() => handleStart(h.id)} disabled={busy}>
                <LinearGradient
                  colors={['rgba(52,211,153,0.16)', 'rgba(52,211,153,0.03)']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.suggestionGrad}
                  pointerEvents="none"
                />
                <View style={styles.suggestionInner}>
                  <Text style={{ fontSize: 12 }}>⭐</Text>
                  <Text style={styles.suggestionText} numberOfLines={1}>{h.name}</Text>
                  <MaterialIcons name="chevron-right" size={13} color={`${Colors.success}aa`} />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.pickText}>All habits have been conquered 🔒 — your streaks speak for themselves.</Text>
      )}

      {store.history.length > 0 && (
        <View style={styles.historyRow}>
          <View style={styles.medalChip}>
            <Text style={styles.medalEmoji}>🥇</Text>
          </View>
          <Text style={styles.historyText}>
            Conquered: {store.history.slice(0, 2).map((h) => h.habitName).join(', ')}
            {store.history.length > 2 ? ` +${store.history.length - 2} more` : ''}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.28)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: 'rgba(52,211,153,0.22)',
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
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(52,211,153,0.4)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.success,
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
  rewardChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.32)',
    backgroundColor: 'rgba(251,191,36,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rewardChipText: {
    fontSize: 9.5,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.3)',
    backgroundColor: 'rgba(52,211,153,0.08)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm - 2,
    marginBottom: Spacing.sm + 2,
  },
  activeName: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: Spacing.sm + 2,
  },
  dotFace: {
    width: 19,
    height: 19,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: '#262A38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: Colors.success,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: Colors.success,
    shadowOpacity: 0.55,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  dotNext: {
    borderColor: Colors.warning,
    backgroundColor: 'rgba(251,191,36,0.16)',
  },
  dotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.warning,
  },
  progressText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
    marginLeft: 2,
  },
  activeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeHint: {
    flex: 1,
    fontSize: 10,
    color: Colors.textSecondary,
    minWidth: 0,
  },
  abandonText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: Spacing.xs,
  },
  pickText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  suggestion: {
    flexGrow: 1,
    flexBasis: '44%',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    overflow: 'hidden',
  },
  suggestionGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  suggestionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  suggestionText: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
  },
  medalChip: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalEmoji: { fontSize: 11 },
  historyText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    color: Colors.success,
    fontWeight: FontWeight.semibold,
  },
});
