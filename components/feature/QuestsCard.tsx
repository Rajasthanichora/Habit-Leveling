import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { DailyQuest, getTodayQuests, QuestTier } from '../../services/questsService';
import { useHabits } from '../../hooks/useHabits';
import { CriticalHpBanner } from './CriticalHpBanner';

/** Stamp that slams in when the boss habit falls today. */
function BossDefeatStamp({ show }: { show: boolean }) {
  const stamp = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!show) return;
    stamp.setValue(0);
    flash.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(stamp, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(flash, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]),
      Animated.timing(flash, { toValue: 0, duration: 320, delay: 240, useNativeDriver: true }),
      Animated.timing(stamp, { toValue: 0, duration: 500, delay: 900, useNativeDriver: true }),
    ]).start();
  }, [show, stamp, flash]);

  if (!show) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        stampS.layer,
        {
          backgroundColor: flash.interpolate({ inputRange: [0, 1], outputRange: ['rgba(52,211,153,0)', 'rgba(52,211,153,0.18)'] }),
        },
      ]}
    >
      <Animated.Text
        style={[
          stampS.text,
          {
            opacity: stamp,
            transform: [
              { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] }) },
              { rotate: stamp.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '-8deg'] }) },
            ],
          },
        ]}
      >
        SLAIN ⚔️
      </Animated.Text>
    </Animated.View>
  );
}

const stampS = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.success,
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
});

// Tier chips — little difficulty badges next to each quest.
const TIER_STYLE: Record<Exclude<QuestTier, undefined>, { label: string; color: string }> = {
  easy: { label: 'EASY', color: Colors.success },
  medium: { label: 'MED', color: Colors.primary },
  hard: { label: 'HARD', color: Colors.danger },
  secret: { label: '🔧', color: '#B9F2FF' },
};

/** One quest row; `shineKey` bumps when this quest's check flips to claimed. */
function QuestRow({ quest, shineKey }: { quest: DailyQuest; shineKey: number }) {
  const shine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shineKey <= 0 || !quest.claimed) return;
    shine.setValue(0);
    Animated.sequence([
      Animated.timing(shine, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(shine, { toValue: 0, duration: 620, delay: 120, useNativeDriver: true }),
    ]).start();
  }, [shineKey, quest.claimed, shine]);

  if (quest.tier === 'secret') {
    return (
      <View style={[styles.questRow, quest.claimed && styles.questRowDone, quest.claimed && styles.secretClaimed]}>
        <Text style={{ fontSize: 15 }}>{quest.claimed ? '🔓' : '🔒'}</Text>
        <Text style={[styles.questLabel, quest.claimed && styles.questLabelDone]}>
          {quest.claimed ? 'Secret quest — cleared!' : 'Secret quest cleared only on a perfect up day'}
        </Text>
        <View style={[styles.rewardPill, styles.secretPill]}>
          <Text style={[styles.rewardPillText, styles.secretPillText]}>
            {quest.claimed ? '✓' : `+${quest.reward}`}
          </Text>
        </View>
      </View>
    );
  }

  const tier = TIER_STYLE[quest.tier ?? 'easy'];

  return (
    <View style={[styles.questRow, quest.done && styles.questRowDone]}>
      <MaterialIcons
        name={(quest.done ? 'check-circle' : 'radio-button-unchecked') as never}
        size={19}
        color={quest.done ? Colors.success : Colors.textMuted}
      />
      <Text style={[styles.questLabel, quest.done && styles.questLabelDone]}>{quest.label}</Text>
      <Animated.View
        style={{
          opacity: shine.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }),
          transform: [{ scale: shine.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
        }}
      >
        <View style={[styles.tierChip, { borderColor: `${tier.color}55`, backgroundColor: `${tier.color}12` }]}>
          <Text style={[styles.tierChipText, { color: tier.color }]}>{tier.label}</Text>
        </View>
      </Animated.View>
      <View style={[styles.rewardPill, quest.done && styles.rewardPillDone]}>
        <Text style={[styles.rewardPillText, quest.done && styles.rewardPillTextDone]}>
          {quest.claimed ? '✓' : `+${quest.reward}`}
        </Text>
      </View>
    </View>
  );
}

/** Daily Quests strip + Boss habit battle card. Lives on the HQ tab. */
export function QuestsCard() {
  const { completionMap, habits, completions, selectedDate, refreshXp } = useHabits();
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [boss, setBoss] = useState<{ name: string; defeated: boolean } | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showStamp, setShowStamp] = useState(false);
  const [shine, setShine] = useState<Record<string, number>>({});
  const prevDefeated = useRef(false);
  const bossKnown = useRef(false);
  const prevClaimed = useRef<Record<string, boolean>>({});

  useEffect(() => {
    // First evaluation (app open with boss already down) sets the baseline —
    // only real transitions happening live earn the stamp.
    if (!bossKnown.current) {
      bossKnown.current = true;
      prevDefeated.current = !!boss?.defeated;
      return undefined;
    }
    // Stamp fires only on a real defeat transition (false→true) while mounted.
    if (boss?.defeated && !prevDefeated.current) {
      prevDefeated.current = true;
      setShowStamp(true);
      const t = setTimeout(() => setShowStamp(false), 2100);
      return () => clearTimeout(t);
    }
    prevDefeated.current = !!boss?.defeated;
    return undefined;
  }, [boss?.defeated]);

  const reload = useCallback(async () => {
    // Evaluate (claims) then read fresh state so newly-completed quests pay out.
    try {
      const questsMod = await import('../../services/questsService');
      await questsMod.evaluateQuestClaims(selectedDate);
    } catch {}
    void refreshXp();
  }, [selectedDate, refreshXp]);

  useEffect(() => {
    void (async () => {
      const { quests: qs, boss: b } = await getTodayQuests();
      // ➕ claim-shine: any quest that flips unclaimed→claimed while mounted.
      qs.forEach((q) => {
        const was = prevClaimed.current[q.id];
        if (was === false && q.claimed) {
          setShine((s) => ({ ...s, [q.id]: (s[q.id] ?? 0) + 1 }));
        }
        prevClaimed.current[q.id] = q.claimed;
      });
      setQuests(qs);
      if (b) {
        // Boss is credited like every other habit: a quantity boss with ANY
        // progress counts as defeated (the streak/penalty pipeline uses the
        // same rule) — completionMap alone misses partial quantity progress.
        const defeated =
          completionMap[b.id] === true ||
          completions.some((c) => c.date === selectedDate && c.habitId === b.id && (c.count ?? 0) > 0);
        setBoss({ name: b.name, defeated });
      } else {
        setBoss(null);
      }
    })();
    // Claims may have become eligible — flip them from either the pipeline or here.
  }, [completionMap, habits, completions, selectedDate]);

  useEffect(() => {
    void reload();
  }, [reload, completionMap, habits]);

  const bossQuest = quests.find((q) => q.id === 'q_boss');
  const normalQuests = quests.filter((q) => q.id !== 'q_boss');
  const totalCount = quests.length;
  const claimedCount = quests.filter((q) => q.claimed).length;
  const claimPct = totalCount ? Math.round((claimedCount / totalCount) * 100) : 0;

  return (
    <View>
      {/* ⚠️ Critical-HP callout lives with the quest board on HQ */}
      <CriticalHpBanner />

      <LinearGradient
        colors={['rgba(251,191,36,0.10)', 'rgba(251,191,36,0.03)', 'rgba(255,255,255,0.02)']}
        locations={[0, 0.42, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.card}
      >
        <Pressable style={styles.headerRow} onPress={() => { setExpanded(!expanded); }} accessibilityLabel="Toggle daily quests">
          <View style={styles.headerLeft}>
            <View style={styles.titleBadge}>
              <Text style={styles.titleBadgeEmoji}>⚔️</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>Daily Quests</Text>
              <Text style={styles.titleSub}>Board resets at midnight</Text>
            </View>
          </View>
          {totalCount > 0 && (
            <View style={styles.counterChip}>
              <MaterialIcons name="bolt" size={11} color={Colors.warning} />
              <Text style={styles.counterText}>{claimedCount}/{totalCount}</Text>
            </View>
          )}
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
        </Pressable>

        {/* claim-progress candy strip */}
        {totalCount > 0 && (
          <View style={styles.stripTrack}>
            <LinearGradient
              colors={['#FFD75E', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.stripFill, { width: `${Math.max(claimPct > 0 ? 3 : 0, claimPct)}%` }]}
            />
          </View>
        )}

        {expanded && (
          <View style={styles.list}>
            {normalQuests.map((q) => (
              <QuestRow key={q.id} quest={q} shineKey={shine[q.id] ?? 0} />
            ))}

            {boss && bossQuest && (
              <View style={[styles.bossCard, boss.defeated && styles.bossCardDone]}>
                <BossDefeatStamp show={showStamp} />
                <View style={styles.bossTag}>
                  <Text style={styles.bossTagText}>⚔️ DAILY BOSS</Text>
                </View>
                <View style={styles.bossHead}>
                  <View style={[styles.bossAvatar, boss.defeated && styles.bossAvatarDone]}>
                    <Text style={styles.bossAvatarEmoji}>{boss.defeated ? '💀' : '🐉'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.bossTitle} numberOfLines={1}>{boss.name}</Text>
                    <Text style={styles.bossSub} numberOfLines={2}>
                      {boss.defeated
                        ? 'Defeated — bonus XP collected!'
                        : 'Your hardest habit today — defeat it for bonus XP'}
                    </Text>
                  </View>
                  <View style={[styles.rewardPill, boss.defeated && styles.rewardPillDone]}>
                    <Text style={[styles.rewardPillText, boss.defeated && styles.rewardPillTextDone]}>
                      {bossQuest.claimed ? '✓' : `+${bossQuest.reward}`}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.22)',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: 'rgba(251,191,36,0.25)',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    paddingVertical: 6,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
  },
  titleBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.warning,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  titleBadgeEmoji: { fontSize: 16 },
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
    borderColor: 'rgba(251,191,36,0.32)',
    backgroundColor: 'rgba(251,191,36,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  counterText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
  stripTrack: {
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  stripFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  list: {
    gap: 8,
    paddingBottom: 4,
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 9,
  },
  questRowDone: {
    backgroundColor: 'rgba(52,211,153,0.06)',
    borderColor: 'rgba(52,211,153,0.25)',
  },
  questLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    minWidth: 0,
  },
  questLabelDone: {
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  rewardPill: {
    minWidth: 44,
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.32)',
  },
  rewardPillText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
  rewardPillDone: {
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderColor: 'rgba(52,211,153,0.38)',
  },
  rewardPillTextDone: {
    color: Colors.success,
  },
  secretPill: {
    backgroundColor: 'rgba(126,227,255,0.10)',
    borderColor: 'rgba(126,227,255,0.35)',
  },
  secretPillText: {
    color: '#7EE3FF',
  },
  tierChip: {
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  tierChipText: {
    fontSize: 8,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
  },
  secretClaimed: {
    borderWidth: 1,
    borderRadius: Radius.sm,
  },
  bossCard: {
    backgroundColor: 'rgba(251,191,36,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    overflow: 'hidden',
  },
  bossCardDone: {
    borderColor: 'rgba(52,211,153,0.45)',
    backgroundColor: 'rgba(52,211,153,0.07)',
  },
  bossTag: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(251,191,36,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    marginBottom: Spacing.xs + 2,
  },
  bossTagText: {
    fontSize: 8,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.4,
    color: Colors.warning,
  },
  bossHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bossAvatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.42)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bossAvatarDone: {
    borderColor: 'rgba(52,211,153,0.5)',
  },
  bossAvatarEmoji: { fontSize: 23 },
  bossTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
  bossSub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
