// Powered by OnSpace.AI
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CategoryDef, Habit } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { EVOLUTION_STAGES } from '../../services/gameRules';
import { Checkbox } from '../ui/Checkbox';
import { HabitOptionsModal } from './HabitOptionsModal';
import { CompleteBurst } from './CompleteBurst';
import { resolveCategory } from '../../utils/categoryResolver';
import { CategoryIcon } from './CategoryIcon';

// Skin-tinted aura per evolution stage — the chip border + glow colour.
// Mirrors stage tier: green growth → gold bloom → icy eternal → royal mythic.
const STAGE_AURA = ['#6EE7B7', '#4ADE80', '#34D399', '#FBBF24', '#F472B6', '#67E8F9', '#FFD700'];

interface Props {
  habit: Habit;
  completed: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onReminder?: () => void;
  onCalendar?: () => void;
  drag?: () => void;
  isActive?: boolean;
  customCategories?: CategoryDef[];
  reminderCount?: number;
  /** Today's progress for quantity habits (habit.targetCount > 0). */
  quantityCount?: number;
  /** Removes one unit of quantity progress. */
  onQuantityDown?: () => void;
  /** Done sub-habit ids for today (drives the checklist). */
  subDoneIds?: string[];
  /** Toggles one checklist item. */
  onToggleSubHabit?: (subId: string) => void;
  // ── Game layer (economy + penalties + evolution) ──
  /** Current HP (0–100). Undefined → bar hidden. */
  hp?: number;
  /** Collapsed (hibernating) state — rewards pause; completing fills the rebuild mission. */
  collapsed?: boolean;
  /** Evolution stage index (0=🌱 … 3=✨). */
  stage?: number;
  /** Streak-insured today (🛡️ chip). */
  insured?: boolean;
  /** Rebuild mission progress (0–3) while collapsed. */
  rebuildProgress?: number;
  /** Revive flow: uses a Revival Kit when owned, else coins. */
  onRevive?: () => void;
}

export const HabitCard = React.memo(function HabitCard({
  habit,
  completed,
  onToggle,
  onDelete,
  onEdit,
  onReminder,
  onCalendar,
  drag,
  isActive,
  customCategories,
  reminderCount,
  quantityCount,
  onQuantityDown,
  subDoneIds,
  onToggleSubHabit,
  hp,
  collapsed,
  stage,
  insured,
  rebuildProgress,
  onRevive,
}: Props) {
  const [showOptions, setShowOptions] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const catConfig = resolveCategory(habit.category, customCategories);

  const isQuantity = !!habit.targetCount && habit.targetCount > 0;
  const count = isQuantity ? quantityCount ?? 0 : 0;
  const target = isQuantity ? habit.targetCount! : 0;
  const pct = isQuantity ? Math.min(1, count / target) : 0;

  const subHabits = habit.subHabits ?? [];
  const subDone = new Set(subDoneIds ?? []);
  const subDoneCount = subHabits.filter((s) => subDone.has(s.id)).length;
  const hasChecklist = subHabits.length > 0;

  const stageInfo = stage != null ? EVOLUTION_STAGES[Math.max(0, Math.min(EVOLUTION_STAGES.length - 1, stage))] : null;
  const hpPct = hp != null && !collapsed ? Math.max(0, Math.min(100, hp)) : null;
  const hpColor = hpPct == null ? Colors.success : hpPct > 60 ? Colors.success : hpPct > 25 ? Colors.warning : Colors.danger;
  const isHibernating = !!collapsed;

  // Collapsed habits CAN be completed — each completed scheduled day fills
  // the rebuild mission 🧱 (3 days → free revive). Only the rewards pause.
  const handleToggle = useCallback(() => {
    onToggle();
  }, [onToggle]);

  const handleDown = useCallback(() => {
    onQuantityDown?.();
  }, [onQuantityDown]);

  const handleSubToggle = useCallback((subId: string) => {
    onToggleSubHabit?.(subId);
  }, [onToggleSubHabit]);

  return (
    <>
      <View
        style={[
          styles.card,
          completed && styles.cardCompleted,
          isHibernating && styles.cardHibernating,
          isActive && styles.dragging,
        ]}
      >
        {/* Left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: isHibernating ? Colors.textMuted : catConfig.color }]} />

        {/* Main row */}
        <Pressable
          style={({ pressed }) => [styles.mainRow, pressed && !drag && styles.pressed]}
          onPress={drag ? undefined : handleToggle}
          onLongPress={drag}
          delayLongPress={200}
          accessibilityLabel={`Habit: ${habit.name}`}
        >
          {/* Drag Handle */}
          {drag && (
            <View style={styles.dragHandle}>
              <MaterialIcons name="drag-handle" size={20} color={Colors.textMuted} />
            </View>
          )}

          {/* Category Icon */}
          <View style={[styles.iconBox, { backgroundColor: `${catConfig.color}18` }]}>
            <CategoryIcon icon={catConfig.icon} color={catConfig.color} size={20} />
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.name, completed && styles.nameCompleted, isHibernating && styles.nameHibernating]} numberOfLines={2}>
              {habit.name}
            </Text>
            <View style={styles.tagRow}>
              <View style={[styles.tag, { borderColor: `${catConfig.color}50`, backgroundColor: `${catConfig.color}10` }]}>
                <View style={[styles.tagDot, { backgroundColor: catConfig.color }]} />
                <Text style={[styles.tagText, { color: catConfig.color }]}>{catConfig.name}</Text>
              </View>
              {stageInfo && stageInfo.threshold > 0 && (
                <View
                  style={[
                    styles.stageChip,
                    {
                      borderColor: `${STAGE_AURA[Math.min(EVOLUTION_STAGES.indexOf(stageInfo), STAGE_AURA.length - 1)]}77`,
                      backgroundColor: `${STAGE_AURA[Math.min(EVOLUTION_STAGES.indexOf(stageInfo), STAGE_AURA.length - 1)]}1A`,
                    },
                    // Higher stages glow harder — the aura is the trophy.
                    stage != null && stage >= 4 && {
                      shadowColor: STAGE_AURA[Math.min(stage, STAGE_AURA.length - 1)],
                      shadowOpacity: 0.55,
                      shadowRadius: 7,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 3,
                    },
                  ]}
                >
                  <Text style={styles.stageEmoji}>{stageInfo.emoji}</Text>
                </View>
              )}
              {insured && (
                <View style={styles.insuredChip}>
                  <Text style={styles.insuredText}>🛡️</Text>
                </View>
              )}
              <View style={styles.priorityBadge}>
                <Text style={styles.priorityText}>P{habit.priority}</Text>
              </View>
            </View>

            {/* Quantity progress bar */}
            {isQuantity && !isHibernating && (
              <View style={styles.quantityRow}>
                <View style={styles.quantityTrack}>
                  <View
                    style={[
                      styles.quantityFill,
                      { width: `${Math.max(pct > 0 ? 2 : 0, Math.round(pct * 100))}%`, backgroundColor: completed ? Colors.success : catConfig.color },
                    ]}
                  />
                </View>
                <Text style={styles.quantityText}>
                  {count}/{target}
                </Text>
              </View>
            )}

            {/* HP bar */}
            {hpPct != null && (
              <View style={styles.hpRow}>
                <View style={styles.hpTrack}>
                  <View style={[styles.hpFill, { width: `${Math.max(hpPct > 0 ? 2 : 0, hpPct)}%`, backgroundColor: hpColor }]} />
                </View>
                <Text style={[styles.hpText, { color: hpColor }]}>{hp} HP</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {!isHibernating && <CompleteBurst completed={completed} />}
            {isHibernating ? (
              <View style={styles.hibernateBadge}>
                <Text style={styles.hibernateEmoji}>🏚️</Text>
              </View>
            ) : isQuantity ? (
              <>
                <Pressable
                  onPress={handleDown}
                  disabled={count === 0}
                  hitSlop={6}
                  style={[styles.stepBtn, count === 0 && styles.stepBtnDisabled]}
                  accessibilityLabel={`Decrease ${habit.name}`}
                >
                  <MaterialIcons name="remove" size={18} color={count === 0 ? Colors.textMuted : Colors.textPrimary} />
                </Pressable>
                <Pressable
                  onPress={handleToggle}
                  hitSlop={6}
                  style={[styles.stepBtn, styles.stepBtnPlus, completed && styles.stepBtnPlusDone]}
                  accessibilityLabel={completed ? `${habit.name} complete` : `Add one ${habit.name}`}
                >
                  <MaterialIcons
                    name={completed ? 'check' : 'add'}
                    size={18}
                    color={completed ? Colors.success : Colors.primary}
                  />
                </Pressable>
              </>
            ) : (
              <Checkbox checked={completed} onToggle={handleToggle} size={28} />
            )}
            <Pressable
              onPress={() => setShowOptions(true)}
              hitSlop={10}
              style={styles.dotsBtn}
            >
              <MaterialIcons name="more-vert" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>

        {/* Sub-habit checklist */}
        {hasChecklist && !isHibernating && (
          <View style={styles.subWrap}>
            <Pressable style={styles.subToggle} onPress={() => { setShowChecklist((v) => !v); }}>
              <MaterialIcons
                name="format-list-bulleted"
                size={13}
                color={subDoneCount === subHabits.length ? Colors.success : Colors.textMuted}
              />
              <Text style={styles.subToggleText}>
                Checklist {subDoneCount}/{subHabits.length}
              </Text>
              <MaterialIcons
                name={showChecklist ? 'expand-less' : 'expand-more'}
                size={16}
                color={Colors.textMuted}
              />
            </Pressable>

            {showChecklist &&
              subHabits.map((sub) => {
                const done = subDone.has(sub.id);
                return (
                  <Pressable
                    key={sub.id}
                    style={styles.subRow}
                    onPress={() => handleSubToggle(sub.id)}
                  >
                    <Checkbox checked={done} onToggle={() => handleSubToggle(sub.id)} size={18} />
                    <Text style={[styles.subTitle, done && styles.subTitleDone]}>{sub.title}</Text>
                  </Pressable>
                );
              })}
          </View>
        )}

        {/* Hibernating: revive row (never deleted — data stays safe) */}
        {isHibernating && (
          <View style={styles.hibernateWrap}>
            <Text style={styles.hibernateText}>
              Hibernating · complete it to fill the rebuild 🧱 → FREE revive 🕊️
              {rebuildProgress != null ? ` · ${rebuildProgress}/3` : ''}
            </Text>
            {onRevive && (
              <Pressable style={styles.reviveBtn} onPress={onRevive}>
                <Text style={styles.reviveText}>🕊️ Revive</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <HabitOptionsModal
        visible={showOptions}
        habitName={habit.name}
        reminderCount={reminderCount}
        onClose={() => setShowOptions(false)}
        onReminder={() => { setShowOptions(false); onReminder?.(); }}
        onCalendar={() => { setShowOptions(false); onCalendar?.(); }}
        onEdit={() => { setShowOptions(false); onEdit?.(); }}
        onDelete={() => { setShowOptions(false); onDelete(); }}
      />
    </>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  cardCompleted: {
    opacity: 0.55,
  },
  cardHibernating: {
    opacity: 0.7,
    borderColor: Colors.cardBorder,
  },
  hibernateBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hibernateEmoji: { fontSize: 18 },
  hibernateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(248,113,113,0.05)',
  },
  hibernateText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  reviveBtn: {
    backgroundColor: `${Colors.success}18`,
    borderWidth: 1,
    borderColor: `${Colors.success}55`,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reviveText: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: FontWeight.bold,
  },
  stageChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  stageEmoji: { fontSize: 11 },
  insuredChip: {
    backgroundColor: 'rgba(126,227,255,0.10)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(126,227,255,0.4)',
  },
  insuredText: { fontSize: 10 },
  hpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  hpTrack: {
    flex: 1,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  hpText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    minWidth: 44,
    textAlign: 'right',
  },
  nameHibernating: {
    color: Colors.textMuted,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  dragging: {
    opacity: 0.9,
    backgroundColor: Colors.cardElevated,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  dragHandle: {
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    marginRight: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 5,
    lineHeight: 20,
  },
  nameCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  priorityBadge: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  priorityText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 7,
  },
  quantityTrack: {
    flex: 1,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.progressBg,
    overflow: 'hidden',
  },
  quantityFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  quantityText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
    minWidth: 34,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: 10,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  stepBtnPlus: {
    borderColor: `${Colors.primary}55`,
    backgroundColor: `${Colors.primary}18`,
  },
  stepBtnPlusDone: {
    borderColor: `${Colors.success}55`,
    backgroundColor: `${Colors.success}18`,
  },
  dotsBtn: {
    padding: 4,
  },
  subWrap: {
    borderTopWidth: 0.5,
    borderTopColor: Colors.cardBorder,
    paddingLeft: 57,
    paddingRight: Spacing.sm,
    paddingBottom: 2,
  },
  subToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
  },
  subToggleText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  subTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  subTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
});
