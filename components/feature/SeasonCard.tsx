import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import { getSeasonProgress, claimSeasonPass, SeasonProgress, PASS_STEP } from '../../services/seasonService';

const TIER_TINT: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#B8C2CC',
  gold: '#FBBF24',
  diamond: '#67E8F9',
  mythic: '#C084FC',
};

const TIER_MEDAL: Record<string, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  diamond: '💎',
  mythic: '🌟',
};

/** Season Clock 🗓️ — 30-day ranked window with tier rewards. */
export function SeasonCard() {
  const { habits, completions, refreshEconomy } = useHabits();
  const [season, setSeason] = useState<SeasonProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSeason(await getSeasonProgress(habits, completions));
    } catch {
      setSeason(null);
    }
  }, [habits, completions]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const claimPass = useCallback(async () => {
    if (busy || !season) return;
    setBusy(true);
    try {
      await claimSeasonPass(season.id, season.pass.completed);
      void refreshEconomy();
      await reload();
    } catch {}
    setBusy(false);
  }, [busy, season, refreshEconomy, reload]);

  if (!season) return null;

  const daysElapsed = Math.max(1, season.dayInSeason);
  const barPct = Math.min(100, (daysElapsed / 30) * 100);
  const ratePct = Math.round(season.rate * 100);
  const tierColor = TIER_TINT[season.tier.key] ?? Colors.primary;
  const nextMin = season.nextTier ? Math.round(season.nextTier.min * 100) : null;

  return (
    <LinearGradient
      colors={[`${tierColor}24`, `${tierColor}08`, 'rgba(255,255,255,0.02)']}
      locations={[0, 0.5, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[styles.card, { borderColor: `${tierColor}40` }]}
    >
      <View style={styles.headRow}>
        <View style={[styles.medalBadge, { borderColor: `${tierColor}66`, shadowColor: tierColor }]}>
          <Text style={styles.medalEmoji}>{TIER_MEDAL[season.tier.key] ?? '🏅'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Season {season.id}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            Day {season.dayInSeason} of 30 · {season.daysLeft} day{season.daysLeft !== 1 ? 's' : ''} left
          </Text>
        </View>
        <View style={[styles.tierPill, { borderColor: `${tierColor}55`, backgroundColor: `${tierColor}14` }]}>
          <Text style={[styles.tierText, { color: tierColor }]}>{season.tier.label}</Text>
        </View>
      </View>

      {/* Time progression — tier-colored ribbon */}
      <View style={styles.track}>
        <LinearGradient
          colors={[tierColor, `${tierColor}77`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${barPct}%` }]}
        />
      </View>

      {/* Rate vs next tier */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{ratePct}%</Text>
          <Text style={styles.statLabel}>completion</Text>
        </View>
        {nextMin != null ? (
          <View style={styles.nextChip}>
            <MaterialIcons name="arrow-upward" size={11} color={Colors.textSecondary} />
            <Text style={styles.nextText}>{nextMin}% → {season.nextTier?.label}</Text>
          </View>
        ) : (
          <View style={styles.nextChip}>
            <MaterialIcons name="workspace-premium" size={12} color={tierColor} />
            <Text style={[styles.nextText, { color: tierColor }]}>Top tier secured 🏅</Text>
          </View>
        )}
      </View>

      {/* Reward row — LEVEL-SCALED payout (+ momentum when hot) */}
      <View style={[styles.rewardRow, { borderColor: `${tierColor}38`, backgroundColor: `${tierColor}0F` }]}>
        <MaterialIcons name="redeem" size={12} color={tierColor} />
        <Text style={styles.rewardText}>
          Season-end payout: <Text style={styles.rewardStrong}>+{season.payout.coins}🪙 +{season.payout.xp} XP</Text>
          {'  '}<Text style={styles.rewardDim}>(Lv {season.level} scaled)</Text>
        </Text>
      </View>

      {season.momentum > 1 && (
        <Text style={styles.momentumText}>
          🔥 Momentum ×{season.momentum} — {season.momentum >= 1.25 ? '5+' : '2+'} strong seasons in a row
        </Text>
      )}

      {/* 🎟️ Season Pass — completions → milestone track */}
      <View style={styles.passRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.passTitle}>🎟️ Season Pass · Level {season.pass.level}</Text>
          <Text style={styles.passSub} numberOfLines={1}>
            {season.pass.next
              ? `${season.pass.completed}/${season.pass.next.min} completions → +${season.pass.next.coins}🪙${season.pass.next.xp > 0 ? ` +${season.pass.next.xp} XP` : ''}`
              : `${season.pass.completed} completions · track complete 🏆`}
          </Text>
          <View style={[styles.passTrack, { marginTop: 5 }]}>
            <LinearGradient
              colors={[tierColor, `${tierColor}77`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.passFill, { width: `${Math.min(100, ((season.pass.completed % PASS_STEP) / PASS_STEP) * 100)}%` }]}
            />
          </View>
        </View>
        {season.pass.claimable.length > 0 && (
          <Pressable onPress={claimPass} disabled={busy} accessibilityLabel="Claim season pass milestones" style={styles.passClaim}>
            <MaterialIcons name="redeem" size={13} color="#4A2E00" />
            <Text style={styles.passClaimText}>Claim {season.pass.claimable.length > 1 ? `×${season.pass.claimable.length}` : ''}</Text>
          </Pressable>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm - 2,
    marginBottom: Spacing.sm,
  },
  medalBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  medalEmoji: { fontSize: 19 },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  tierPill: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tierText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: Radius.full },
  sub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm + 2,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  nextChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    minWidth: 0,
  },
  nextText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    flexShrink: 1,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm + 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  rewardText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  rewardStrong: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  rewardDim: {
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
  },
  momentumText: {
    marginTop: Spacing.xs,
    fontSize: FontSize.xs,
    color: '#FBBF24',
    fontWeight: FontWeight.semibold,
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm + 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  passTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  passSub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  passTrack: {
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
  },
  passFill: { height: '100%', borderRadius: Radius.full },
  passClaim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    backgroundColor: '#FFD75E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  passClaimText: { color: '#4A2E00', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
});
