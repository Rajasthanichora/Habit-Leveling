// Penalty log 💀 — the battle-vault ledger on Statistics. For every closed
// day: the date, exactly which habits were fined (and why), what protected
// the rest, and — if the inventory holds a cure (Revival Kit, shields, skip
// pass) — a one-line suggestion to fix the damage.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { loadPenaltyStore } from '../../services/penaltyService';
import type { CloseResult } from '../../services/penaltyService';
import { loadEconomy } from '../../services/economyService';
import type { EconomyStore } from '../../services/economyService';
import { useHabits } from '../../hooks/useHabits';

const PROTECT_LABEL: Record<string, string> = {
  skip: '🎫 Skip Pass',
  shield: '🛡️ Shield',
  freeze: '❄️ Freeze',
};

/** Cure suggestion for a closure, based on what the inventory actually holds. */
function cureHint(c: CloseResult, econ: EconomyStore | null): { text: string; toInventory: boolean } | null {
  const inv = econ?.inventory ?? {};
  const has = (id: string) => (inv[id] ?? 0) > 0;

  if (c.collapsedHabitNames.length > 0) {
    const names = c.collapsedHabitNames.join(', ');
    if (has('revival_kit')) return { text: `🩹 ${names} collapsed — you hold a Revival Kit. Open 🎒 Inventory and revive it.`, toInventory: true };
    return { text: `🩹 ${names} collapsed — buy a Revival Kit 🩹 in the Shop to revive it.`, toInventory: false };
  }
  if (c.fineCount > 0) {
    const names = c.hit.map((h) => h.habitName).join(', ');
    if (has('skip_pass')) return { text: `🎫 ${names} were fined — a Skip Pass sits in your vault; it would have waived this whole day.`, toInventory: false };
    if (has('streak_shield')) return { text: `🛡️ ${names} were fined — ${inv.streak_shield} Streak Shield${inv.streak_shield !== 1 ? 's' : ''} in your vault would have absorbed it.`, toInventory: false };
    return { text: `🛡️ ${names} were fined — arm a Streak Shield 🛡️ or Skip Pass 🎫 from the Shop to dodge the next one.`, toInventory: false };
  }
  return null;
}

export function PenaltyLogCard() {
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
        // Most recent first, last 30, and skip totally empty closures.
        const rows = Object.values(store.closures)
          .filter((c) => c.fineCount > 0 || c.coinsLost > 0 || c.hpLost > 0 || c.collapsedHabitNames.length > 0 || c.escapedBossName)
          .sort((a, b) => (a.closedDate < b.closedDate ? 1 : -1))
          .slice(0, 30)
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

  if (!loaded) {
    return (
      <LinearGradient
        colors={['rgba(248,113,113,0.10)', 'rgba(248,113,113,0.03)', 'rgba(255,255,255,0.02)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.card}
      >
        <Head total={0} />
        <Text style={styles.loading}>Loading…</Text>
      </LinearGradient>
    );
  }

  if (closures.length === 0) {
    return (
      <LinearGradient
        colors={['rgba(52,211,153,0.09)', 'rgba(52,211,153,0.03)', 'rgba(255,255,255,0.02)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.card, { borderColor: 'rgba(52,211,153,0.25)' }]}
      >
        <Head total={0} clean />
        <View style={styles.cleanWrap}>
          <Text style={styles.cleanEmoji}>✨</Text>
          <Text style={styles.cleanTitle}>PERFECT RECORD</Text>
          <Text style={styles.cleanSub}>No penalties yet — your days have closed clean. 🌙</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['rgba(248,113,113,0.10)', 'rgba(248,113,113,0.03)', 'rgba(255,255,255,0.02)']}
      locations={[0, 0.45, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.card}
    >
      <Head total={closures.length} />

      {closures.map((c) => {
        const hint = cureHint(c, econ);
        return (
          <View key={c.closedDate} style={styles.row}>
            {/* Date + damage summary */}
            <View style={styles.cardHead}>
              <MaterialIcons name="event" size={12} color={Colors.danger} />
              <Text style={styles.date}>{c.closedDate}</Text>
              {c.coinsLost > 0 && <Text style={styles.damage}>−{c.coinsLost}🪙</Text>}
              {c.hpLost > 0 && <Text style={styles.damage}>HP −{c.hpLost}</Text>}
            </View>

            {/* Per-habit reason: missed → fine */}
            {c.hit.map((h) => (
              <View key={h.habitName} style={styles.reasonRow}>
                <Text style={styles.bullet}>⚔️</Text>
                <Text style={styles.reasonText} numberOfLines={2}>
                  Missed <Text style={styles.reasonName}>{h.habitName}</Text> — fined {h.fine}🪙, HP −{h.hpDamage} (now {h.hpAfter})
                  {h.insured ? ' · insurance halved' : ''}
                </Text>
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
                <Text style={styles.cureText}>{hint.text}</Text>
                <Pressable
                  style={styles.cureBtn}
                  onPress={() => router.push(hint.toInventory ? '/inventory' : '/shop')}
                >
                  <Text style={styles.cureBtnText}>{hint.toInventory ? 'Open Inventory' : 'Go to Shop'}</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </LinearGradient>
  );
}

/** Vault header — skull coin + title + entry counter. */
function Head({ total, clean }: { total: number; clean?: boolean }) {
  return (
    <View style={styles.headRow}>
      <View style={[styles.titleBadge, clean && styles.titleBadgeClean]}>
        <Text style={styles.titleBadgeEmoji}>{clean ? '🛡️' : '💀'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>Penalty Log</Text>
        <Text style={styles.titleSub}>{clean ? 'The vault is untouched' : 'Why each day cost you — and how to fix it'}</Text>
      </View>
      {total > 0 && (
        <View style={styles.counterChip}>
          <MaterialIcons name="receipt-long" size={11} color={Colors.danger} />
          <Text style={styles.counterText}>{total}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.26)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    overflow: 'hidden',
    shadowColor: 'rgba(248,113,113,0.22)',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
  },
  titleBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(248,113,113,0.42)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.danger,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  titleBadgeClean: {
    borderColor: 'rgba(52,211,153,0.42)',
    shadowColor: Colors.success,
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
    borderColor: 'rgba(248,113,113,0.35)',
    backgroundColor: 'rgba(248,113,113,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  counterText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.danger,
  },
  loading: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  cleanWrap: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
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
  row: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    gap: 5,
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
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  reasonName: {
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  protectLine: {
    fontSize: 11,
    color: Colors.success,
    lineHeight: 16,
  },
  warnLine: {
    fontSize: 11,
    color: Colors.warning,
    lineHeight: 16,
  },
  goodLine: {
    fontSize: 11,
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
