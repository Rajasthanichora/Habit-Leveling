// Game Hub drawer — the section manager.
// Top: player mini-card (tier portrait, title, XP bar, coins + SP).
// Middle: the SECTIONS CRUD + date footer + settings.
// Navigation tiles (Stats / Shop / Skills / Rewards / …) live in the HQ tab's
// grid — the drawer stays lean and focused on managing sections.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, TextInput } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { Section } from '../../services/types';
import { useHabits } from '../../hooks/useHabits';
import { loadSkillStore } from '../../services/skillService';
import { loadPrestigeStore } from '../../services/prestigeService';
import { getSeasonProgress } from '../../services/seasonService';
import type { SeasonProgress } from '../../services/seasonService';
import { avatarUrlForLevel, tierForLevel } from '../../utils/levelAvatars';

const DRAWER_WIDTH = 320;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSettings: () => void;
  sections: Section[];
  selectedSectionId: string;
  onSelectSection: (id: string) => void;
  onAddSection: (name: string) => void;
  onDeleteSection: (id: string) => void;
}

function getTodayInfo() {
  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()];
  const dateStr = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  return { dayName, dateStr };
}

export function SideDrawer({
  visible,
  onClose,
  onSettings,
  sections,
  selectedSectionId,
  onSelectSection,
  onAddSection,
  onDeleteSection,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');
  const { dayName, dateStr } = getTodayInfo();

  // ── Player / season live state (only read while the hub is open) ──
  const { levelInfo, coins, habits, completions } = useHabits();
  const [sp, setSp] = useState(0);
  const [prestigeCount, setPrestigeCount] = useState(0);
  const [season, setSeason] = useState<SeasonProgress | null>(null);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const tier = tierForLevel(levelInfo.level);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void (async () => {
      try {
        const [skillStore, prestige, seasonP] = await Promise.all([
          loadSkillStore(),
          loadPrestigeStore(),
          getSeasonProgress(habits, completions),
        ]);
        if (!active) return;
        setSp(Math.max(0, Math.floor(skillStore.sp)));
        setPrestigeCount(prestige.count);
        setSeason(seasonP);
      } catch {}
    })();
    return () => { active = false; };
  }, [visible, habits, completions]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
      setShowNewInput(false);
      setNewName('');
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, translateX, opacity]);

  if (!visible && (translateX as any)._value === -DRAWER_WIDTH) return null;

  const handleAddSection = () => {
    const name = newName.trim();
    if (name) {
      onAddSection(name);
      setNewName('');
      setShowNewInput(false);
    }
  };

  const xpPct = Math.round(levelInfo.progress * 100);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          { transform: [{ translateX }], paddingTop: insets.top + Spacing.md },
        ]}
      >
        {/* ── Player mini-card ── */}
        <View style={[styles.playerCard, { borderColor: `${tier.accent}55` }]}>
          <View style={styles.playerTop}>
            {/* Level portrait (falls back to the tier emoji offline) */}
            <View style={[styles.avatarRing, { borderColor: `${tier.accent}CC` }]}>
              {portraitFailed ? (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackEmoji}>{tier.fallbackEmoji}</Text>
                </View>
              ) : (
                <ExpoImage
                  source={{ uri: avatarUrlForLevel(levelInfo.level, 256) }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  recyclingKey={tier.key}
                  onError={() => setPortraitFailed(true)}
                />
              )}
              <View style={[styles.lvBadge, { borderColor: `${tier.accent}88` }]}>
                <Text style={[styles.lvBadgeLabel, { color: tier.accent }]}>LV</Text>
                <Text style={[styles.lvBadgeValue, { color: tier.accent }]}>{levelInfo.level}</Text>
              </View>
            </View>
            <View style={styles.playerMain}>
              <Text style={styles.playerTitle} numberOfLines={1}>{levelInfo.title}</Text>
              <Text style={[styles.playerTier, { color: tier.accent }]}>{tier.label}</Text>
              {/* XP bar */}
              <View style={styles.xpBar}>
                <View style={[styles.xpFill, { width: `${xpPct}%`, backgroundColor: tier.accent }]} />
              </View>
              <Text style={styles.xpText}>{xpPct}% to next level</Text>
            </View>
          </View>
          {/* Wallet line */}
          <View style={styles.walletRow}>
            <View style={styles.walletChip}>
              <Text style={styles.walletEmoji}>🪙</Text>
              <Text style={styles.walletText}>{coins}</Text>
            </View>
            <View style={styles.walletChip}>
              <Text style={styles.walletEmoji}>✦</Text>
              <Text style={styles.walletText}>{sp} SP</Text>
            </View>
            {prestigeCount > 0 && (
              <View style={[styles.walletChip, styles.walletChipGold]}>
                <Text style={styles.walletEmoji}>🕊</Text>
                <Text style={styles.walletText}>{prestigeCount}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Season chip ── */}
        {season && (
          <View style={styles.seasonChip}>
            <MaterialIcons name="calendar-month" size={18} color={Colors.primary} />
            <Text style={styles.seasonText} numberOfLines={1}>
              Season {season.id} · {season.tier.label} · {season.daysLeft}d left
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* ── Sections (unchanged CRUD) ── */}
        <Text style={styles.sectionTitle}>SECTIONS</Text>
        <View style={styles.sectionList}>
          {sections.map((sec) => {
            const active = sec.id === selectedSectionId;
            const isDefault = sec.id === 'default';
            return (
              <View key={sec.id} style={styles.sectionItemRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.sectionItem,
                    active && styles.sectionItemActive,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => { onSelectSection(sec.id); onClose(); }}
                >
                  <View style={[styles.sectionDotIcon, active && { backgroundColor: Colors.primaryGlow }]}>
                    <View style={[styles.sectionDot, { backgroundColor: active ? Colors.primary : Colors.textMuted }]} />
                  </View>
                  <Text style={[styles.sectionName, active && styles.sectionNameActive]}>
                    {sec.name}
                  </Text>
                  {active && (
                    <MaterialIcons name="check" size={16} color={Colors.primary} />
                  )}
                </Pressable>
                {!isDefault && (
                  <Pressable
                    style={styles.sectionDeleteBtn}
                    onPress={() => onDeleteSection(sec.id)}
                    hitSlop={8}
                  >
                    <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
            );
          })}

          {/* New section input */}
          {showNewInput ? (
            <View style={styles.newSectionRow}>
              <TextInput
                style={styles.newSectionInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Section name"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                onSubmitEditing={handleAddSection}
              />
              <Pressable onPress={handleAddSection} hitSlop={8}>
                <MaterialIcons name="check" size={20} color={Colors.primary} />
              </Pressable>
              <Pressable onPress={() => { setShowNewInput(false); setNewName(''); }} hitSlop={8}>
                <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.newSectionBtn}
              onPress={() => setShowNewInput(true)}
            >
              <View style={styles.addIconWrap}>
                <MaterialIcons name="add" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.newSectionText}>New Section</Text>
            </Pressable>
          )}
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Day & Date footer */}
        <View style={styles.dateSection}>
          <Text style={styles.dayNameFooter}>{dayName}</Text>
          <Text style={styles.dateStr}>{dateStr}</Text>
        </View>

        {/* Settings */}
        <Pressable
          style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
          onPress={() => { onSettings(); onClose(); }}
        >
          <View style={styles.settingsIcon}>
            <MaterialIcons name="settings" size={18} color={Colors.textSecondary} />
          </View>
          <Text style={styles.settingsText}>Settings</Text>
          <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Colors.surface,
    borderRightWidth: 0.5,
    borderRightColor: Colors.cardBorder,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  // ── Player mini-card ──
  playerCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  playerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatarRing: {
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 1.5,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
  },
  avatarFallbackEmoji: { fontSize: 22 },
  lvBadge: {
    position: 'absolute',
    bottom: -7,
    alignSelf: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  lvBadgeLabel: { fontSize: 7, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  lvBadgeValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, lineHeight: 13 },
  playerMain: {
    flex: 1,
  },
  playerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  playerTier: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    marginBottom: 5,
    marginTop: 1,
    textTransform: 'uppercase',
  },
  xpBar: {
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  xpText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: FontWeight.medium,
  },
  walletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  walletChipGold: {
    borderColor: Colors.warning,
  },
  walletEmoji: {
    fontSize: 12,
  },
  walletText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  seasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    marginBottom: Spacing.md,
  },
  seasonText: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  dateSection: {
    marginBottom: Spacing.md,
  },
  dayNameFooter: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  dateStr: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: FontWeight.medium,
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.separator,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.6,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  sectionList: {
    gap: 4,
  },
  sectionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    gap: Spacing.md,
  },
  sectionDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionItemActive: {
    backgroundColor: Colors.primaryGlow,
  },
  sectionDotIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  sectionNameActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  newSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginTop: 4,
    borderRadius: Radius.sm,
  },
  addIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  newSectionText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  newSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: 6,
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  newSectionInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    borderRadius: Radius.sm,
  },
  settingsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  settingsText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});
