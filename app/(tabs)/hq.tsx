// HQ — the Player Hub tab. Everything about *you* lives here: level, gear,
// trees, collections and week-long ambitions. Pure data & analytics stay one
// tab to the right (Stats). This screen only reorganizes existing cards into
// one wayfinder home — no new economy, no duplicated game loops.
//
// Visual language mirrors the Hero's Path roadmap: ambient glow orbs, neon
// section banners (icon badge + gradient underline) and candy-styled cards.
//
// Mobile-first: the "WEEKLY ARENA" cards are rich, full-width designs, so they
// stack vertically on phones and only form a 2-column grid on large
// windows (tablets/desktop).

import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import { ProfileCard } from '../../components/feature/ProfileCard';
import { HQGrid } from '../../components/feature/HQGrid';
import { QuestsCard } from '../../components/feature/QuestsCard';
import { RaidsCard } from '../../components/feature/RaidsCard';
import { ChallengeCard } from '../../components/feature/ChallengeCard';
import { SeasonCard } from '../../components/feature/SeasonCard';
import { LegendSkillsCard } from '../../components/feature/LegendSkillsCard';
import { GameToast } from '../../components/feature/GameToast';

/** Game-style section banner: neon icon badge + label + gradient underline. */
function SectionHeader({ icon, label, tint, hint }: { icon: string; label: string; tint: string; hint?: string }) {
  return (
    <View style={styles.secHead}>
      <View style={[styles.secBadge, { borderColor: `${tint}66`, backgroundColor: `${tint}1C`, shadowColor: tint }]}>
        <MaterialIcons name={icon as never} size={13} color={tint} />
      </View>
      <Text style={[styles.secLabel, { color: tint }]}>{label}</Text>
      <LinearGradient
        colors={[`${tint}66`, 'rgba(255,255,255,0)'] as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.secLine}
        pointerEvents="none"
      />
      {hint ? <Text style={styles.secHint}>{hint}</Text> : null}
    </View>
  );
}

export default function HQScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { levelInfo } = useHabits();
  const { width } = useWindowDimensions();
  const twoColumns = width >= 760;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Ambient realm backdrop (same night-realm language as the roadmap) ── */}
      <LinearGradient
        colors={['rgba(78,142,255,0.10)', 'rgba(0,0,0,0)'] as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bgBand}
        pointerEvents="none"
      />
      <View pointerEvents="none" style={styles.bgOrbA} />
      <View pointerEvents="none" style={styles.bgOrbB} />

      {/* ── HUD header ── */}
      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Text style={{ fontSize: 17 }}>🏰</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle}>Player Hub</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {levelInfo.title} · Level {levelInfo.level}
          </Text>
        </View>
        <View style={styles.headerChip}>
          <Text style={styles.headerChipText}>LV {levelInfo.level}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      >
        {/* ── Hero: level portrait, XP bar, lifetime counters — tap = roadmap ── */}
        <ProfileCard onPressDetails={() => router.navigate('/(tabs)/roadmap' as never)} />

        {/* ── Wayfinder: Mailbox · Inventory · Skills · Shop · Penalties · Settings (+ reserved slot) ── */}
        <SectionHeader icon="shield" label="YOUR ARMORY" tint="#4E8EFF" hint="gear & collections" />
        <HQGrid />

        {/* ── Daily quests, boss battle & the critical-HP callout ── */}
        <SectionHeader icon="flag" label="QUEST BOARD" tint="#FBBF24" hint="resets daily" />
        <QuestsCard />

        {/* ── This week's ambitions (stack on phones, 2-col on wide screens) ── */}
        <SectionHeader icon="sports-esports" label="WEEKLY ARENA" tint="#A78BFA" hint="raid · challenge · season" />
        <View style={[twoColumns && styles.gridWrap]}>
          {twoColumns ? (
            <>
              <View style={styles.gridCellFull}><RaidsCard /></View>
              <View style={styles.gridCell}><ChallengeCard /></View>
              <View style={styles.gridCell}><SeasonCard /></View>
            </>
          ) : (
            <>
              <View style={styles.stackCell}><RaidsCard /></View>
              <View style={styles.stackCell}><ChallengeCard /></View>
              <View style={styles.stackCell}><SeasonCard /></View>
            </>
          )}
        </View>

        {/* ── Legend skills wall ── */}
        <SectionHeader icon="military-tech" label="LEGEND SKILLS" tint="#FFC542" hint="earned in the arena — never bought" />
        <LegendSkillsCard />
      </ScrollView>

      {/* Claim/achievement toasts echo here too, not just on Today */}
      <GameToast />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bgBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  bgOrbA: {
    position: 'absolute',
    top: -70,
    right: -80,
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: 'rgba(78,142,255,0.08)',
  },
  bgOrbB: {
    position: 'absolute',
    top: 90,
    left: -90,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: 'rgba(45,212,191,0.06)',
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginTop: 1,
  },
  headerChip: {
    borderWidth: 1,
    borderColor: `${Colors.primary}55`,
    backgroundColor: `${Colors.primary}14`,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerChipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  content: {
    paddingHorizontal: Spacing.md,
  },
  secHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm + 4,
    marginTop: Spacing.xs,
  },
  secBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  secLabel: {
    fontSize: 10.5,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.6,
  },
  secLine: {
    flex: 1,
    height: 2,
    borderRadius: 2,
    opacity: 0.4,
    marginLeft: 2,
  },
  secHint: {
    fontSize: 8.5,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    color: Colors.textMuted,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  gridCell: {
    flexBasis: '47.5%',
    minWidth: '47.5%',
    flexGrow: 1,
  },
  gridCellFull: {
    flexBasis: '100%',
    minWidth: '100%',
  },
  stackCell: {},
});
