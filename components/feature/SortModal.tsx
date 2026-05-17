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

const MODES: { key: SortMode; label: string; desc: string }[] = [
  { key: 'global', label: 'Global Sorting', desc: 'Sort all habits together' },
  { key: 'manual', label: 'Manual Sorting', desc: 'Drag to reorder habits' },
];

const SORT_BY_OPTIONS: { key: SortBy; label: string; icon: string }[] = [
  { key: 'name', label: 'Name', icon: 'sort-by-alpha' },
  { key: 'time', label: 'Time Created', icon: 'access-time' },
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Sort & Order</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Sort Mode */}
            <Text style={styles.sectionLabel}>SORTING MODE</Text>
            {MODES.map((m) => (
              <Pressable
                key={m.key}
                style={[styles.row, draft.mode === m.key && styles.rowSelected]}
                onPress={() => setDraft((d) => ({ ...d, mode: m.key }))}
              >
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>{m.label}</Text>
                  <Text style={styles.rowDesc}>{m.desc}</Text>
                </View>
                {draft.mode === m.key && (
                  <MaterialIcons name="check-circle" size={20} color={Colors.primary} />
                )}
              </Pressable>
            ))}

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
                          size={16}
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
                          size={18}
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: '80%',
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
  sectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  rowSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(41,121,255,0.1)',
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 6,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
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
    borderWidth: 1,
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
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  applyText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
