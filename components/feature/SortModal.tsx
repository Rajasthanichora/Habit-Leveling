// Powered by OnSpace.AI
import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SortConfig, SortMode, SortBy, SortOrder } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

interface Props {
  visible: boolean;
  config: SortConfig;
  onClose: () => void;
  onApply: (config: SortConfig) => void;
}

const MODES: { key: SortMode; label: string; desc: string; icon: string }[] = [
  { key: 'global', label: 'Global Sorting', desc: 'Sort all habits together', icon: 'sort' },
  { key: 'manual', label: 'Manual Sorting', desc: 'Drag to reorder habits', icon: 'drag-indicator' },
];

const SORT_BY_OPTIONS: { key: SortBy; label: string; icon: string }[] = [
  { key: 'name', label: 'Name', icon: 'sort-by-alpha' },
  { key: 'time', label: 'Created', icon: 'access-time' },
  { key: 'category', label: 'Category', icon: 'category' },
  { key: 'progress', label: 'Progress', icon: 'trending-up' },
  { key: 'priority', label: 'Priority', icon: 'flag' },
];

export function SortModal({ visible, config, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<SortConfig>(config);

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Sort & Order</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Sort Mode */}
            <Text style={styles.sectionLabel}>SORTING MODE</Text>
            {MODES.map((m) => {
              const isSelected = draft.mode === m.key;
              return (
                <Pressable
                  key={m.key}
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => setDraft((d) => ({ ...d, mode: m.key }))}
                >
                  <View style={[styles.rowIcon, isSelected && { backgroundColor: Colors.primaryGlow }]}>
                    <MaterialIcons name={m.icon as any} size={18} color={isSelected ? Colors.primary : Colors.textSecondary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={[styles.rowLabel, isSelected && { color: Colors.primary }]}>{m.label}</Text>
                    <Text style={styles.rowDesc}>{m.desc}</Text>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check-circle" size={18} color={Colors.primary} />
                  )}
                </Pressable>
              );
            })}

            {draft.mode === 'global' && (
              <>
                {/* Sort By */}
                <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>SORT BY</Text>
                <View style={styles.chipGrid}>
                  {SORT_BY_OPTIONS.map((o) => {
                    const sel = draft.sortBy === o.key;
                    return (
                      <Pressable
                        key={o.key}
                        style={[styles.chip, sel && styles.chipSelected]}
                        onPress={() => setDraft((d) => ({ ...d, sortBy: o.key }))}
                      >
                        <MaterialIcons
                          name={o.icon as any}
                          size={14}
                          color={sel ? '#fff' : Colors.textSecondary}
                        />
                        <Text style={[styles.chipText, sel && styles.chipTextSelected]}>
                          {o.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Order */}
                <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>ORDER</Text>
                <View style={styles.orderRow}>
                  {(['asc', 'desc'] as SortOrder[]).map((o) => {
                    const sel = draft.order === o;
                    return (
                      <Pressable
                        key={o}
                        style={[styles.orderBtn, sel && styles.orderBtnSelected]}
                        onPress={() => setDraft((d) => ({ ...d, order: o }))}
                      >
                        <MaterialIcons
                          name={o === 'asc' ? 'arrow-upward' : 'arrow-downward'}
                          size={16}
                          color={sel ? '#fff' : Colors.textSecondary}
                        />
                        <Text style={[styles.orderText, sel && styles.orderTextSelected]}>
                          {o === 'asc' ? 'Ascending' : 'Descending'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>

          {/* Apply */}
          <Pressable style={styles.applyBtn} onPress={handleApply}>
            <Text style={styles.applyText}>Apply Sorting</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingTop: 12,
    maxHeight: '80%',
    borderTopWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  handle: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.4,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    marginBottom: Spacing.sm,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: 12,
  },
  rowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: { flex: 1 },
  rowLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: 5,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  orderRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  orderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: 6,
  },
  orderBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  orderText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  orderTextSelected: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  applyBtn: {
    backgroundColor: Colors.primary,
    padding: 15,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  applyText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
