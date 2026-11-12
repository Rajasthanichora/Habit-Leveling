// Inventory 🎒 — what you OWN and how to USE it (Shop stays the buying place;
// this is the possession + usage layer. Deliberately read-mostly: items that
// fire automatically on their natural occasion (shields, freeze tokens) show a
// passive note instead of a button, so "use it" always means something).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { useHabits } from '../hooks/useHabits';
import { SHOP_CATALOG, XP_DRINK_XP } from '../services/gameRules';
import type { ShopItem } from '../services/gameRules';
import { loadEconomy, consumeInventory, assignInsurance, removeInsurance } from '../services/economyService';
import type { EconomyStore } from '../services/economyService';
import { todayStr } from '../services/recurrenceService';
import { grantXpBonus } from '../services/xpService';
import { reviveHabit, getHpMap } from '../services/hpService';
import { infoAlert } from '../services/alertCompat';

interface OwnedRow {
  item: ShopItem;
  count: number;
  /** UI presentation kind — determines the natural action. */
  kind: 'drink' | 'assign' | 'revive' | 'passive';
  note?: string;
}

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { habits, refreshEconomy, refreshHp } = useHabits();

  const [econ, setEcon] = useState<EconomyStore | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'insurance' | 'revive' | null>(null);

  /** Clock snapshot taken on mount — keeps render time math lint-pure. */
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const reload = useCallback(async () => {
    const [store, hpMap] = await Promise.all([loadEconomy(), getHpMap()]);
    setEcon(store);
    setCollapsedIds(habits.filter((h) => !h.archived && hpMap[h.id]?.collapsedAt).map((h) => h.id));
  }, [habits]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Owned items incl. charge-tracked boosts, in catalog order. */
  const owned: OwnedRow[] = useMemo(() => {
    if (!econ) return [];
    const rows: { item: ShopItem; count: number; kind: OwnedRow['kind']; note?: string }[] = [];
    for (const item of SHOP_CATALOG) {
      let count = Math.max(0, Math.floor(econ.inventory[item.id] ?? 0));
      const kind = ManagedKind[item.id] ?? 'passive';
      let note: string | undefined;
      if (item.id === 'midas_touch') count = econ.midasCharges;
      if (item.id === 'midas_gauntlet') count = econ.gauntletCharges;
      if (item.id === 'titan_shield') count = econ.titanCharges;
      if (count <= 0) continue;

      if (kind === 'passive') {
        note = AUTO_NOTE[item.id];
      }
      rows.push({ item, count, kind, note });
    }

    // Active timed boosts get their own rows on top (now from mount-time
    // state so this memo stays a pure function of its dependencies).
    const special: OwnedRow[] = [];
    if (econ.xpStormUntil > nowMs) {
      const mins = Math.max(1, Math.round((econ.xpStormUntil - nowMs) / 60000));
      const eternal = (econ.xpStormStrength ?? 1) > 1.3;
      const xpStormDef = SHOP_CATALOG.find((i) => i.id === (eternal ? 'eternal_storm' : 'xp_storm'))!;
      special.push({
        item: xpStormDef,
        count: 0,
        kind: 'passive',
        note: `ACTIVE ${eternal ? '🌩️' : '⚡'} — all XP pays +${eternal ? 40 : 25}% for another ${mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`}`,
      });
    }
    return [...special, ...rows];
  }, [econ, nowMs]);

  /** 🔓 Unlock habits for the picker sheets (insurance / revival targets). */
  const sheetHabits = useMemo(() => {
    if (!econ || !sheet) return [];
    return sheet === 'insurance'
      // Expiry-aware: a lapsed certificate must not block re-assignment.
      ? habits.filter((h) => !h.archived && !(econ.insurance[h.id] && econ.insurance[h.id] >= todayStr()))
      : habits.filter((h) => collapsedIds.includes(h.id));
  }, [econ, sheet, habits, collapsedIds]);

  const handleDrink = useCallback(async (itemId: 'xp_potion' | 'xp_elixir') => {
    if (busy || !econ) return;
    if (Math.floor(econ.inventory[itemId] ?? 0) <= 0) return;
    setBusy(true);
    // Only grant XP when a unit was actually consumed — the stale-count
    // race otherwise paid potions out of thin air.
    const consumed = await consumeInventory(itemId);
    if (!consumed) {
      setBusy(false);
      infoAlert('Stock empty', 'That drink is already gone — buy another one first 🪙');
      await reload();
      return;
    }
    const res = await grantXpBonus(XP_DRINK_XP[itemId] ?? 40, '🧪 XP drink');
    setBusy(false);
    infoAlert('XP drink 🧪', `+${res.total} XP added to your meter.`);
    await reload();
    void refreshEconomy();
  }, [busy, econ, reload, refreshEconomy]);

  const handleAssignInsurance = useCallback(async (habitId: string, habitName: string) => {
    setBusy(true);
    const ok = await assignInsurance(habitId, habitName);
    setBusy(false);
    setSheet(null);
    if (!ok) infoAlert('No certificate', 'You have no Habit Insurance left 📜');
    await reload();
    void refreshEconomy();
  }, [reload, refreshEconomy]);

  const handleReviveKit = useCallback(async (habitId: string, habitName: string) => {
    setBusy(true);
    // Kit burns ONLY on a real revive — the picker list can be stale (free
    // rebuild revive / Phoenix save un-collapsed the habit meanwhile), and
    // consume-then-revive wasted a 100+🪙 kit with no feedback.
    const revived = await reviveHabit(habitId, habitName, false);
    if (revived) {
      await consumeInventory('revival_kit');
    } else {
      setSheet(null);
      setBusy(false);
      infoAlert('Not collapsed', `${habitName} came back on its own in the meantime — the kit was NOT used.`);
      await Promise.all([reload(), refreshHp(), refreshEconomy()]);
      return;
    }
    setBusy(false);
    setSheet(null);
    await Promise.all([reload(), refreshHp(), refreshEconomy()]);
  }, [reload, refreshHp, refreshEconomy]);

  const handleUnassign = useCallback(async (habitId: string) => {
    await removeInsurance(habitId);
    await reload();
    // The shared insuranceMap drives the Today-screen badge — refresh it.
    void refreshEconomy();
  }, [reload, refreshEconomy]);

  if (!econ) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const insured = habits.filter((h) => econ.insurance[h.id] && econ.insurance[h.id] >= todayStr());

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Inventory</Text>
        <Pressable
          style={styles.shopChip}
          onPress={() => { router.push('/shop'); }}
          hitSlop={6}
        >
          <Text style={styles.shopChipText}>🪙 {econ.coins.toLocaleString()}</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {owned.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎒</Text>
            <Text style={styles.emptyTitle}>Your pack is empty</Text>
            <Text style={styles.emptySubtitle}>
              Potions, shields and charms land here when you buy them in the Shop.
            </Text>
            <Pressable style={styles.emptyCta} onPress={() => { router.push('/shop'); }}>
              <Text style={styles.emptyCtaText}>Visit the Shop 🛍️</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {owned.map(({ item, count, kind, note }) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowIcon}>
                  <Text style={styles.rowIconText}>{item.icon}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <View style={styles.rowNameWrap}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <View style={styles.countBadge}>
                      {count > 0 && <Text style={styles.countText}>×{count}</Text>}
                    </View>
                  </View>
                  <Text style={styles.rowDesc}>{note ?? item.desc}</Text>
                  {/* Insurance status lives with the item, not on a second screen */}
                  {item.id === 'insurance' && insured.length > 0 && (
                    <Text style={styles.rowStatus}>
                      Protecting: {insured.map((h) => h.name).join(', ')}
                    </Text>
                  )}
                </View>

                {/* ── Natural actions only ── */}
                {kind === 'drink' && (
                  <Pressable style={styles.useBtn} onPress={() => void handleDrink(item.id as 'xp_potion' | 'xp_elixir')} disabled={busy}>
                    <Text style={styles.useBtnText}>Drink</Text>
                  </Pressable>
                )}
                {kind === 'assign' && (
                  <Pressable style={styles.useBtn} onPress={() => setSheet('insurance')} disabled={busy}>
                    <Text style={styles.useBtnText}>Assign</Text>
                  </Pressable>
                )}
                {kind === 'revive' && (
                  <Pressable
                    style={[styles.useBtn, collapsedIds.length === 0 && styles.useBtnDisabled]}
                    onPress={() => setSheet('revive')}
                    disabled={busy || collapsedIds.length === 0}
                  >
                    <Text style={styles.useBtnText}>Revive</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {/* Managed insurance list (expiry + remove) */}
            {insured.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>ACTIVE INSURANCE 📜</Text>
                {insured.map((h) => (
                  <View key={h.id} style={styles.pendingRow}>
                    <MaterialIcons name="verified" size={16} color={Colors.success} />
                    <Text style={styles.pendingName} numberOfLines={1}>{h.name}</Text>
                    <Text style={styles.pendingExpiry}>until {econ.insurance[h.id]}</Text>
                    <Pressable onPress={() => handleUnassign(h.id)} hitSlop={8}>
                      <MaterialIcons name="cancel" size={20} color={Colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.footNote}>
              Defense items fire automatically when a day gets punished — shields, freezes
              and skip passes never need buttons.
            </Text>
          </>
        )}
      </ScrollView>

      {/* ── Habit picker sheet (assign / revive) ── */}
      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setSheet(null)}>
          <Pressable
            style={[styles.sheetPanel, { paddingBottom: Math.max(insets.bottom, 12) + Spacing.sm }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>
                {sheet === 'insurance' ? 'Assign Habit Insurance' : 'Revive a collapsed Habit'}
              </Text>
              <Pressable onPress={() => setSheet(null)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll}>
              {sheetHabits.map((h) => (
                <Pressable
                  key={h.id}
                  style={styles.sheetRow}
                  onPress={() => {
                    if (sheet === 'insurance') void handleAssignInsurance(h.id, h.name);
                    else void handleReviveKit(h.id, h.name);
                  }}
                >
                  <Text style={styles.sheetRowText} numberOfLines={1}>
                    {sheet === 'revive' ? '🏚️ ' : ''}{h.name}
                  </Text>
                  <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                </Pressable>
              ))}
              {sheetHabits.length === 0 && (
                <Text style={styles.sheetEmpty}>
                  {sheet === 'insurance' ? 'Every habit is already insured ✅' : 'No collapsed habits right now ✅'}
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Which UI action each item id maps to (drag-to-use flows stay in place). */
const ManagedKind: Partial<Record<ShopItem['id'], OwnedRow['kind']>> = {
  xp_potion: 'drink',
  xp_elixir: 'drink',
  insurance: 'assign',
  revival_kit: 'revive',
  streak_shield: 'passive',
  freeze_token: 'passive',
  skip_pass: 'passive',
  midas_touch: 'passive',
  midas_gauntlet: 'passive',
  titan_shield: 'passive',
  sp_scroll: 'passive',
  legend_scroll: 'passive',
  xp_storm: 'passive',
  eternal_storm: 'passive',
};

const AUTO_NOTE: Record<string, string> = {
  streak_shield: 'Auto-absorbs the next habit miss before freezes & HP 🛡️',
  freeze_token: 'Adds +1 streak freeze allowance for this month ❄️',
  skip_pass: 'Waives penalties for one chosen day — used when the day closes 🎫',
  midas_touch: 'Next habit completion pays ×2 coins ✨',
  midas_gauntlet: 'Next completion pays ×3 coins, one charge at a time 🧤',
  titan_shield: 'Auto-absorbs habit misses BEFORE regular shields & freezes 🦾',
  sp_scroll: '+1 Skill Point — spendable on the Skill Trees 📜',
  legend_scroll: '+2 Skill Points at once — skips the 3-SP wallet cap 📈',
  xp_storm: '+25% XP while active ⚡',
  eternal_storm: '+40% XP for 72h — stronger than a regular storm 🌩️',
};

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
  shopChip: {
    backgroundColor: `${Colors.warning}14`,
    borderWidth: 1,
    borderColor: `${Colors.warning}55`,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shopChipText: {
    color: Colors.warning,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 80,
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
  },
  emptyCta: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  emptyCtaText: { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconText: { fontSize: 20 },
  rowInfo: { flex: 1 },
  rowNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  countBadge: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  rowDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 15,
    marginTop: 2,
  },
  rowStatus: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: FontWeight.semibold,
    marginTop: 3,
  },
  useBtn: {
    backgroundColor: `${Colors.success}14`,
    borderWidth: 1,
    borderColor: `${Colors.success}55`,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  useBtnDisabled: { opacity: 0.4 },
  useBtnText: { color: Colors.success, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  group: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.sm,
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.4,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: Spacing.xs,
  },
  pendingName: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  pendingExpiry: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  footNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 0.5,
    borderColor: Colors.cardBorder,
    maxHeight: '70%',
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sheetTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  sheetScroll: { marginBottom: Spacing.sm },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  sheetRowText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  sheetEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
