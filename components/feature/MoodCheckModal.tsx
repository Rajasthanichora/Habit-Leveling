import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompletionMood, GAME_RULES } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { getCompletionMap, loadHabits } from '../../services/habitService';
import { formatDate, isHabitActiveOnDate, parseDate } from '../../services/recurrenceService';
import {
  freezeCreditsLeft,
  isFrozen,
  loadFreezeStore,
  useFreezeForDate as applyFreezeToken,
} from '../../services/streakService';

const MOODS: { id: CompletionMood; emoji: string; label: string; xp: number }[] = [
  { id: 'great', emoji: '🤩', label: 'Great', xp: GAME_RULES.moodBonus.great },
  { id: 'good', emoji: '🙂', label: 'Good', xp: GAME_RULES.moodBonus.good },
  { id: 'ok', emoji: '😐', label: 'OK', xp: GAME_RULES.moodBonus.ok },
  { id: 'rough', emoji: '😵', label: 'Rough', xp: GAME_RULES.moodBonus.rough },
];

interface Props {
  prompt: { habitId: string; date: string } | null;
  onSave: (habitId: string, date: string, mood: CompletionMood) => void;
  onSkip: () => void;
}

interface RepairCandidate {
  date: string;
}

/**
 * Post-completion sheet: "how did it go?" (+ XP mood bonus) and, when the
 * yesterday of the streak chain was missed, a ❄️ freeze-repair option.
 */
export function MoodCheckModal({ prompt, onSave, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  const [repair, setRepair] = useState<RepairCandidate | null>(null);
  const [creditsLeft, setCreditsLeft] = useState<number>(0);
  const [usedRepair, setUsedRepair] = useState(false);

  useEffect(() => {
    if (!prompt) return;
    let active = true;
    setUsedRepair(false);
    (async () => {
      try {
        const habits = await loadHabits();
        const habit = habits.find((h) => h.id === prompt.habitId);
        if (!habit || !active) {
          setRepair(null);
          return;
        }
        // Streak-repair eligibility: yesterday was active & not completed.
        const yesterday = formatDate(
          new Date(parseDate(prompt.date).getTime() - 86400000)
        );
        const map = await getCompletionMap(yesterday);
        const store = await loadFreezeStore();
        const stillEligible =
          isHabitActiveOnDate(habit, yesterday) &&
          map[habit.id] !== true &&
          !isFrozen(store, habit.id, yesterday);
        const credits = await freezeCreditsLeft(prompt.date);
        if (!active) return;
        setCreditsLeft(credits);
        setRepair(stillEligible && credits > 0 ? { date: yesterday } : null);
      } catch {
        setRepair(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [prompt, prompt?.habitId, prompt?.date]);

  const handleRepair = async () => {
    if (!prompt || !repair) return;
    try {
      const storeLoaded = await applyFreezeToken(prompt.habitId, repair.date);
      if (storeLoaded) {
        setUsedRepair(true);
        setRepair(null);
        setCreditsLeft((c) => Math.max(0, c - 1));
        // Notifications streak math now includes the frozen day.
        try {
          const ns = await import('../../services/notificationService');
          await ns.refreshFreezeCache();
        } catch {}
      }
    } catch {}
  };

  return (
    <Modal visible={prompt !== null} transparent animationType="slide" onRequestClose={onSkip}>
      <Pressable style={styles.overlay} onPress={onSkip}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + Spacing.md, Spacing.xl) }]}
          onPress={() => {}}
        >
          {prompt && (
            <>
              <Text style={styles.title}>How did it go?</Text>

              {repair && (
                <Pressable style={styles.repairBtn} onPress={() => { void handleRepair(); }}>
                  <Text style={styles.repairEmoji}>❄️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.repairTitle}>
                      Missed day: {repair.date}
                    </Text>
                    <Text style={styles.repairSub}>
                      Use a freeze token to protect your streak
                    </Text>
                  </View>
                  <View style={styles.repairChip}>
                    <Text style={styles.repairChipText}>{creditsLeft} left</Text>
                  </View>
                </Pressable>
              )}

              {usedRepair && (
                <View style={styles.repairedNote}>
                  <MaterialIcons name="ac-unit" size={16} color={Colors.primary} />
                  <Text style={styles.repairedNoteText}>Streak protected ❄️</Text>
                </View>
              )}

              <View style={styles.moodRow}>
                {MOODS.map((m) => (
                  <Pressable
                    key={m.id}
                    style={styles.moodBtn}
                    onPress={() => { onSave(prompt.habitId, prompt.date, m.id); }}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text style={styles.moodLabel}>{m.label}</Text>
                    {m.xp > 0 && <Text style={styles.moodXp}>+{m.xp} XP</Text>}
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.skipBtn} onPress={onSkip}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  repairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.md,
  },
  repairEmoji: {
    fontSize: 22,
  },
  repairTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  repairSub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  repairChip: {
    backgroundColor: Colors.chipBg,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  repairChipText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  repairedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: Spacing.md,
  },
  repairedNoteText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  moodRow: {
    flexDirection: 'row',
    gap: Spacing.sm + 2,
    marginBottom: Spacing.md,
  },
  moodBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 2,
    gap: 2,
  },
  moodEmoji: {
    fontSize: 26,
  },
  moodLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  moodXp: {
    fontSize: 9,
    color: Colors.warning,
    fontWeight: FontWeight.bold,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.xs + 2,
  },
  skipText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
  },
});
