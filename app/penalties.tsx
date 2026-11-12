// Penalties 💀 — a clear penalty log. For every closed day: the date, exactly
// which habits were fined (and why), what protected the rest, and — if the
// inventory holds a cure (Revival Kit, shields, skip pass) — a one-line
// suggestion to fix the damage.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { useHabits } from '../hooks/useHabits';
import { loadPenaltyStore } from '../services/penaltyService';
import type { CloseResult } from '../services/penaltyService';
import { loadEconomy } from '../services/economyService';
import type { EconomyStore } from '../services/economyService';

const PROTECT_LABEL: Record<string, string> = {
  skip: '🎫 Skip Pass',
  shield: '🛡️ Shield',
  freeze: '❄️ Freeze',
};

/** Cure suggestion for a closure, based on what the inventory actually holds. */
function cureHint(c: CloseResult, econ: EconomyStore | null): string | null {
  const inv = econ?.inventory ?? {};
  const has = (id: string) => (inv[id] ?? 0) > 0;

  if (c.collapsedHabitNames.length > 0) {
    const names = c.collapsedHabitNames.join(', ');
    return has('revival_kit')
      ? `🩹 ${names} collapsed — you hold a Revival Kit. Open 🎒 Inventory and revive it.`
      : `🩹 ${names} collapsed — buy a Revival Kit 🩹 in the Shop to revive it.`;
  }
  if (c.fineCount > 0) {
    const names = c.hit.map((h) => h.habitName).join(', ');
    if (has('skip_pass')) return `🎫 ${names} were fined — a Skip Pass sits in your vault; it would have waived this whole day.`;
    if (has('streak_shield')) return `🛡️ ${names} were fined — ${inv.streak_shield} Streak Shield${inv.streak_shield !== 1 ? 's' : ''} in your vault would have absorbed it.`;
    return `🛡️ ${names} were fined — arm a Streak Shield 🛡️ or Skip Pass 🎫 from the Shop to dodge the next one.`;
  }
  return null;
}

export default function PenaltiesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { habits } = useHabits();

  const [closures, setClosures] = useState<CloseResult[]>([]);
  const [econ, setEcon] = useState<EconomyStore | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [store, economy] = await Promise.all([loadPenaltyStore(), loadEconomy()]);
        if (!active) return;
        const nameOf = new Map(habits.map((h) => [h.id, h.name]));
        const rows = Object.values(store.closures)
          // Only days that actually hurt — empty closes are noise.
          .filter((c) => c.fineCount > 0 || c.coinsLost > 0 || c.hpLost > 0 || c.collapsedHabitNames.length > 0 || c.escapedBossName)
          .sort((a, b) => (a.closedDate < b.closedDate ? 1 : -1))
          .map((c) => ({
            ...c,
            hit: c.hit.map((h) => ({ ...h, habitName: nameOf.get(h.habitName) ?? h.habitName })),
            protectedBy: c.protectedBy.map((p) => ({ ...p, habitName: nameOf.get(p.habitName) ?? p.habitName })),
          }));
        setClosures(rows);
        setEcon(economy);
      } catch {}
      if (active) setLoaded(true);
    })();
    return () => { active = false; };
  }, [habits]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Penalty Log 💀</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {!loaded ? (
          <Text style={styles.loading}>Loading…</Text>
        ) : closures.length === 0 ? (
          <LinearGradient
            colors={['rgba(52,211,153,0.09)', 'rgba(52,211,153,0.03)', 'rgba(255,255,255,0.02)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.cleanCard}
          >
            <Text style={styles.cleanEmoji}>✨</Text>
            <Text style={styles.cleanTitle}>PERFECT RECORD</Text>
            <Text style={styles.cleanSub}>No penalties yet — your days have closed clean.</Text>
          </LinearGradient>
        ) : (
          closures.map((c) => {
            const hint = cureHint(c, econ);
            return (
              <View key={c.closedDate} style={styles.card}>
                {/* Date + damage summary */}
                <View style={styles.cardHead}>
                  <MaterialIcons name="event" size={13} color={Colors.danger} />
                  <Text style={styles.date}>{c.closedDate}</Text>
                  {c.coinsLost > 0 && <Text style={styles.damage}>−{c.coinsLost}🪙</Text>}
                  {c.hpLost > 0 && <Text style={styles.damage}>HP −{c.hpLost}</Text>}
                </View>

                {/* Per-habit reason: missed → fine */}
                {c.hit.map((h) => (
                  <View key={h.habitName} style={styles.reasonRow}>
                    <Text style={styles.bullet}>⚔️</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.reasonText} numberOfLines={2}>
                        Missed <Text style={styles.reasonName}>{h.habitName}</Text> — fined {h.fine}🪙, HP −{h.hpDamage} (now {h.hpAfter})
                        {h.insured ? ' · insurance halved' : ''}
                      </Text>
                    </View>
                  </View>
                ))}

                {/* What protected the rest */}
                {c.protectedBy.map((p) => (
                  <Text key={`${p.habitName}_${p.by}`} style={styles.protectLine}>
                    {PROTECT_LABEL[p.by] ?? '🛡️'} protected <Text style={styles.reasonName}>{p.habitName}</Text>
                  </Text>
                ))}
                {c.skipPassUsed && <Text style={styles.protectLine}>🎫 A Skip Pass pardoned the whole day</Text>}
                {c.roughMoodHalf && <Text style={styles.protectLine}>💙 Rough-mood mercy halved the fines</Text>}

                {/* Serious outcomes */}
                {c.escapedBossName && <Text style={styles.warnLine}>🐉 {c.escapedBossName} escaped</Text>}
                {c.phoenixSaves.length > 0 && <Text style={styles.goodLine}>🕊 Phoenix saved: {c.phoenixSaves.join(', ')}</Text>}

                {/* Cure suggestion from inventory */}
                {hint && (
                  <View style={styles.cureBox}>
                    <Text style={styles.cureText}>{hint}</Text>
                    <Pressable style={styles.cureBtn} onPress={() => router.push(c.collapsedHabitNames.length > 0 && (econ?.inventory['revival_kit'] ?? 0) > 0 ? '/inventory' : '/shop')}>
                      <Text style={styles.cureBtnText}>{c.collapsedHabitNames.length > 0 && (econ?.inventory['revival_kit'] ?? 0) > 0 ? 'Open Inventory' : 'Go to Shop'}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  content: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  loading: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  cleanCard: {
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.25)',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  cleanEmoji: { fontSize: 22 },
  cleanTitle: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 2,
    color: Colors.success,
  },
  cleanSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.26)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xs + 2,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.cardBorder,
  },
  date: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  damage: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.danger,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm - 2,
  },
  bullet: { fontSize: 12, marginTop: 1 },
  reasonText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  reasonName: {
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  protectLine: {
    fontSize: FontSize.xs,
    color: Colors.success,
    lineHeight: 16,
  },
  warnLine: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    lineHeight: 16,
  },
  goodLine: {
    fontSize: FontSize.xs,
    color: Colors.success,
    lineHeight: 16,
  },
  cureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
    backgroundColor: 'rgba(129,140,248,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.35)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  cureText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    lineHeight: 16,
  },
  cureBtn: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.5)',
    backgroundColor: 'rgba(129,140,248,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cureBtnText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
});
