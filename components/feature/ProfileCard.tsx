// Hero profile card ─ the player's ID badge.
// Level portrait (changes per tier), animated XP bar, lifetime stat chips —
// everything responsive inside one full-width card that reads well on any
// phone width. Portrait art/api: see utils/levelAvatars.ts.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import { avatarUrlForLevel, tierForLevel } from '../../utils/levelAvatars';
import { HP_RULES } from '../../services/gameRules';

interface Props {
  onPressDetails?: () => void;
}

/** Profile card: level portrait, title, animated XP progress, quick stats. */
export function ProfileCard({ onPressDetails }: Props) {
  const { levelInfo, xpTotal, habits, coins, hpMap } = useHabits();
  const pct = Math.round(levelInfo.progress * 100);
  const tier = useMemo(() => tierForLevel(levelInfo.level), [levelInfo.level]);
  const portraitUrl = useMemo(() => avatarUrlForLevel(levelInfo.level, 512), [levelInfo.level]);
  const [portraitFailed, setPortraitFailed] = useState(false);

  // Animated XP fill — smoothly re-fills whenever XP changes.
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: Math.max(0, Math.min(1, levelInfo.progress)),
      duration: 650,
      useNativeDriver: false, // width animation
    }).start();
  }, [levelInfo.progress, fill]);

  const activeHabits = habits.filter((h) => !h.archived);
  const curXp = Math.max(0, xpTotal - levelInfo.levelStartXp);
  const needXp = Math.max(1, levelInfo.nextLevelXp - levelInfo.levelStartXp);

  // ── Player HP: average across active habits (missing state = full HP). ──
  const playerHp = useMemo(() => {
    if (activeHabits.length === 0) return HP_RULES.maxHp;
    const total = activeHabits.reduce((sum, h) => sum + (hpMap[h.id]?.hp ?? HP_RULES.maxHp), 0);
    return Math.max(0, Math.min(HP_RULES.maxHp, Math.round(total / activeHabits.length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hpMap, habits]);
  const hpPct = Math.round((playerHp / HP_RULES.maxHp) * 100);
  const hpColor = playerHp > HP_RULES.maxHp * 0.6 ? Colors.success : playerHp > HP_RULES.maxHp * 0.25 ? Colors.warning : Colors.danger;

  return (
    <View style={[styles.cardShadow]} accessibilityLabel={`Level ${levelInfo.level} profile, ${tier.label}`}>
      <Pressable onPress={onPressDetails} style={styles.cardWrap}>
        <LinearGradient
          colors={[`${tier.accent}26`, `${tier.accent}0D`, Colors.card]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          {/* Decorative axes */}
          <View pointerEvents="none" style={[styles.decoCircle, { borderColor: `${tier.accent}2E`, top: -34, right: -26, width: 118, height: 118 }]} />
          <View pointerEvents="none" style={[styles.decoCircle, { borderColor: `${tier.accent}1F`, bottom: -48, left: -30, width: 132, height: 132 }]} />

          <View style={styles.topRow}>
            {/* ── Level portrait ── */}
            <View style={[styles.avatarRing, { borderColor: `${tier.accent}CC` }]}>
              {portraitFailed ? (
                <View style={[styles.avatarBoxFallback, { backgroundColor: `${tier.accent}26` }]}>
                  <Text style={styles.avatarFallbackEmoji}>{tier.fallbackEmoji}</Text>
                </View>
              ) : (
                <ExpoImage
                  source={{ uri: portraitUrl }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  recyclingKey={tier.key}
                  onError={() => setPortraitFailed(true)}
                />
              )}
              {/* LV badge overlapping the ring */}
              <View style={[styles.lvBadge, { borderColor: `${tier.accent}88` }]}>
                <Text style={[styles.lvBadgeLabel, { color: tier.accent }]}>LV</Text>
                <Text style={[styles.lvBadgeValue, { color: tier.accent }]}>{levelInfo.level}</Text>
              </View>
            </View>

            {/* ── Title + XP block ── */}
            <View style={styles.mainCol}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>{levelInfo.title}</Text>
                <View style={[styles.tierChip, { borderColor: `${tier.accent}66`, backgroundColor: `${tier.accent}14` }]}>
                  <Text style={[styles.tierChipText, { color: tier.accent }]}>{tier.label}</Text>
                </View>
              </View>

              {/* Animated XP bar */}
              <View style={styles.barTrack}>
                <Animated.View
                  style={[styles.barFill, { width: `${Math.max(pct > 0 ? 3 : 0, pct)}%` }]}
                >
                  <LinearGradient
                    colors={[`${tier.accent}`, Colors.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                {/* soft gloss on the bar */}
                <View pointerEvents="none" style={styles.barGloss} />
              </View>
              <View style={styles.barMetaRow}>
                <Text style={styles.barMeta}>{curXp.toLocaleString()} / {needXp.toLocaleString()} XP</Text>
                <Text style={[styles.barMetaPct, { color: tier.accent }]}>{pct}%</Text>
              </View>

              {/* HP bar — live health of the roster (average across active habits) */}
              <View style={styles.hpRow}>
                <Text style={styles.hpIcon}>❤️</Text>
                <View style={styles.hpTrack}>
                  <View style={[styles.hpFill, { width: `${Math.max(hpPct > 0 ? 3 : 0, hpPct)}%`, backgroundColor: hpColor }]} />
                </View>
                <Text style={[styles.hpValue, { color: hpColor }]}>{playerHp}/{HP_RULES.maxHp}</Text>
              </View>

              <Text style={styles.motto} numberOfLines={1}>{tier.motto}</Text>
            </View>
          </View>

          {/* ── Stat chips + Roadmap CTA ── */}
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <MaterialIcons name="bolt" size={13} color={tier.accent} />
              <Text style={styles.chipText}>{xpTotal.toLocaleString()} XP</Text>
            </View>
            <View style={styles.chip}>
              <MaterialIcons name="flag" size={13} color={Colors.success} />
              <Text style={styles.chipText}>{activeHabits.length} active</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipEmoji}>🪙</Text>
              <Text style={styles.chipText}>{coins.toLocaleString()}</Text>
            </View>
            <View style={[styles.chipCta, { borderColor: `${tier.accent}55`, backgroundColor: `${tier.accent}14` }]}>
              <MaterialIcons name="map" size={12} color={tier.accent} />
              <Text style={[styles.chipText, { color: tier.accent, fontWeight: FontWeight.bold }]}>Roadmap</Text>
            </View>
            <MaterialIcons name="chevron-right" size={16} color={Colors.textMuted} />
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    shadowColor: 'rgba(78,142,255,0.35)',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  cardWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    overflow: 'hidden',
  },
  decoCircle: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 999,
  },
  topRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 999,
    borderWidth: 2,
    padding: 2.5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    shadowColor: 'rgba(78,142,255,0.5)',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  avatarImg: {
    flex: 1,
    borderRadius: 999,
  },
  avatarBoxFallback: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackEmoji: { fontSize: 36 },
  lvBadge: {
    position: 'absolute',
    bottom: -9,
    alignSelf: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  lvBadgeLabel: { fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1 },
  lvBadgeValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  mainCol: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    marginBottom: Spacing.sm + 2,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  tierChip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    flexShrink: 0,
  },
  tierChipText: { fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  barTrack: {
    height: 9,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barGloss: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(255,255,255,0.10)',
    height: '45%',
    borderTopLeftRadius: Radius.full,
    borderTopRightRadius: Radius.full,
  },
  barMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  barMeta: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  barMetaPct: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
  hpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs + 2,
  },
  hpIcon: { fontSize: 11 },
  hpTrack: {
    flex: 1,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  hpValue: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    minWidth: 52,
    textAlign: 'right',
  },
  motto: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm + 2,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
  },
  chipCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  chipEmoji: { fontSize: 11 },
  chipText: {
    fontSize: 10.5,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
});
