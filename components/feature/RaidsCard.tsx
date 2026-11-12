// Weekly Raid card — the shared week-long bar. Renders progress, tiers and
// the claim button. Data comes from raidService; claiming stays one tap, and
// every payout is claim-keyed so re-renders never double-pay.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import { getRaidInfo, claimRaid, RAID_TIERS, RaidInfo } from '../../services/raidService';

/** Candy medal faces per tier (cleared) — locked nodes use stone colors. */
const TIER_FACE: Record<string, [string, string]> = {
  bronze: ['#E2A76F', '#8F5B26'],
  silver: ['#EAEFF4', '#9FACB8'],
  gold: ['#FFE089', '#DE8F09'],
};
const TIER_EXTRUDE: Record<string, string> = {
  bronze: '#4E3312',
  silver: '#6E7880',
  gold: '#7C4A03',
};
const LOCKED_FACE: [string, string] = ['#3A4053', '#20242F'];

export function RaidsCard() {
  const { habits, completions, refreshEconomy } = useHabits();
  const [info, setInfo] = useState<RaidInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setInfo(await getRaidInfo(habits, completions));
    } catch {
      setInfo(null);
    }
  }, [habits, completions]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const claimable = !!info?.highestTier && (!info.claimedTier || RAID_ORDER(info.claimedTier) < RAID_ORDER(info.highestTier));

  const handleClaim = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await claimRaid(habits, completions);
      void refreshEconomy();
      await reload();
    } catch {}
    setBusy(false);
  }, [busy, habits, completions, refreshEconomy, reload]);

  if (!info || info.scheduled === 0) return null;

  const pct = Math.round(info.rate * 100);
  // Bar scales to the Gold ceiling — RAID_TIERS.gold.min (90%), the rate the
  // claim engine actually requires. The UI previously scaled to 80% (and lit
  // medals at 25/50/80%) while the engine gated at 35/60/90%: medals glowed
  // "reached" the claim button never honoured.
  const goldCeiling = RAID_TIERS[RAID_TIERS.length - 1].min;
  const barPct = Math.min(100, (info.rate / goldCeiling) * 100);

  return (
    <LinearGradient
      colors={['rgba(124,58,237,0.13)', 'rgba(124,58,237,0.03)', 'rgba(255,255,255,0.02)']}
      locations={[0, 0.45, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <View style={styles.dragonBadge}>
          <Text style={styles.dragonEmoji}>🐉</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Weekly Raid</Text>
          <View style={styles.daysChip}>
            <Text style={styles.daysIcon}>⏳</Text>
            <Text style={styles.daysText}>
              {info.daysLeft <= 1 ? 'Last day — close the week strong' : `${info.daysLeft} days left`}
            </Text>
          </View>
        </View>
        <View style={styles.rateWrap}>
          <Text style={styles.rateText}>{pct}%</Text>
          <Text style={styles.rateLabel}>BOSS HP</Text>
          <Text style={styles.hitsText}>⚔️ {info.done} hits · {Math.max(0, info.scheduled - info.done)} left</Text>
        </View>
      </View>

      {info.goldStreak > 0 && (
        <Text style={styles.streakText}>
          {info.goldStreak >= 3 ? '🔥 ×1.15 streak bonus' : '🔥'} {info.goldStreak} gold week{info.goldStreak !== 1 ? 's' : ''} in a row{info.goldStreak >= 3 ? ' active' : ` — ${3 - info.goldStreak} more for +15%`}
        </Text>
      )}

      {/* Progress bar to the Gold ceiling (90%); tier markers sit at their real thresholds */}
      <View style={styles.track}>
        <LinearGradient
          colors={['#A78BFA', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${barPct}%` }]}
        />
        {/* Tier markers — paddingLeft positions come from RAID_TIERS mins */}
        {RAID_TIERS.map((t) => (
          <View
            key={`mark_${t.key}`}
            style={[styles.marker, { left: `${Math.min(100, (t.min / goldCeiling) * 100)}%` }]}
          />
        ))}
      </View>

      {/* Candy medal row — rendered from the SERVICE tiers so the "reached"
          state, the shown reward and the actual claim gate never disagree */}
      <View style={styles.tierRow}>
        {RAID_TIERS.map((t) => {
          const reached = info.rate + 1e-9 >= t.min;
          const claimed = info.claimedTier?.key === t.key;
          const face = reached ? (TIER_FACE[t.key] ?? TIER_FACE.bronze) : LOCKED_FACE;
          const extrude = reached ? (TIER_EXTRUDE[t.key] ?? TIER_EXTRUDE.bronze) : '#12151D';
          return (
            <View key={t.key} style={[styles.tierWrap, !reached && styles.tierWrapLocked]}>
              <View style={[styles.tierExtrude, { backgroundColor: extrude }]} />
              <LinearGradient colors={face} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={styles.tierFace}>
                {claimed && (
                  <View style={styles.tierCheck}>
                    <MaterialIcons name="check" size={11} color={Colors.success} />
                  </View>
                )}
                <Text style={styles.tierIcon}>{t.icon}</Text>
                <Text style={[styles.tierLabel, !reached && styles.tierTextLocked]}>{t.key[0].toUpperCase() + t.key.slice(1)}</Text>
                <Text style={[styles.tierReward, !reached && styles.tierTextLocked]}>+{Math.round(t.xp * info.xpMult)} XP</Text>
              </LinearGradient>
            </View>
          );
        })}
      </View>

      {claimable && (
        <Pressable style={styles.claimBtnOuter} onPress={handleClaim} disabled={busy} accessibilityLabel="Claim raid reward">
          <LinearGradient
            colors={['#FFD75E', '#F59E0B']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.claimBtn}
          >
            <MaterialIcons name="redeem" size={15} color="#4A2E00" />
            <Text style={styles.claimText}>Claim {info.highestTier?.icon} raid reward</Text>
          </LinearGradient>
        </Pressable>
      )}
      {!claimable && info.claimedTier && (
        <Text style={styles.footNote}>{info.claimedTier.icon} {info.claimedTier.label} secured this week</Text>
      )}
    </LinearGradient>
  );
}

function RAID_ORDER(t: { key: string }): number {
  return RAID_TIERS.findIndex((x) => x.key === t.key);
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: 'rgba(124,58,237,0.3)',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm + 2,
  },
  dragonBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(167,139,250,0.4)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A78BFA',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  dragonEmoji: { fontSize: 21 },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  daysChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    backgroundColor: 'rgba(167,139,250,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 3,
  },
  daysIcon: { fontSize: 9 },
  daysText: {
    fontSize: 9.5,
    fontWeight: FontWeight.semibold,
    color: '#C4B5FD',
  },
  rateWrap: { alignItems: 'flex-end' },
  rateText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: '#C4B5FD',
    textShadowColor: 'rgba(124,58,237,0.6)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 1 },
  },
  rateLabel: {
    fontSize: 7.5,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  hitsText: {
    fontSize: 8,
    color: 'rgba(196,181,253,0.7)',
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  streakText: {
    fontSize: 9.5,
    color: '#FBBF24',
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.sm,
    marginTop: -Spacing.xs,
  },
  track: {
    height: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
    marginBottom: Spacing.md + 2,
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2.5,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  tierRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tierWrap: {
    flex: 1,
    height: 82,
  },
  tierWrapLocked: { opacity: 0.8 },
  tierExtrude: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 0,
    height: 8,
    borderRadius: 4,
  },
  tierFace: {
    height: 76,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tierCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 17,
    height: 17,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: `${Colors.success}88`,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierIcon: { fontSize: 17 },
  tierLabel: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  tierReward: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: FontWeight.semibold,
  },
  tierTextLocked: {
    color: 'rgba(255,255,255,0.45)',
  },
  claimBtnOuter: {
    marginTop: Spacing.sm + 2,
    borderRadius: Radius.full,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.full,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  claimText: {
    color: '#4A2E00',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  footNote: {
    marginTop: Spacing.sm,
    fontSize: FontSize.xs,
    color: Colors.success,
    textAlign: 'center',
    fontWeight: FontWeight.semibold,
  },
});
