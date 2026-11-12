import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { useHabits } from '../hooks/useHabits';
import { playCoinSound } from '../services/soundService';
import { SHOP_CATALOG, ShopItem, shelfCountOf, XP_DRINK_XP } from '../services/gameRules';
import { loadEconomy, buyItem, assignInsurance, removeInsurance, itemPriceFor } from '../services/economyService';
import { todayStr } from '../services/recurrenceService';
import { getHpMap } from '../services/hpService';
import type { EconomyStore } from '../services/economyService';
import { loadXp, levelInfoFromTotal } from '../services/xpService';
import { loadSkillStore } from '../services/skillService';
import { milestoneGateFor } from '../services/difficultyService';
import { infoAlert } from '../services/alertCompat';

const GROUP_LABELS = { boost: 'BOOST', defense: 'DEFENSE', legend: 'LEGEND VAULT ⚔️' } as const;

/** One-time consumables that need a target (assign/manually drink). */
function UseRow({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable style={styles.useRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.useLabel}>{label}</Text>
        <Text style={styles.useHint}>{hint}</Text>
      </View>
      <MaterialIcons name="play-arrow" size={22} color={Colors.primary} />
    </Pressable>
  );
}

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { habits, refreshEconomy, refreshHp } = useHabits();

  const [econ, setEcon] = useState<EconomyStore | null>(null);
  const [insuranceMap, setInsuranceMap] = useState<Record<string, string>>({});
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [assignTarget, setAssignTarget] = useState<'insurance' | 'revival' | null>(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(1);
  const [sp, setSp] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const reload = useCallback(async () => {
    const [store, hpMap, xp, skills] = await Promise.all([
      loadEconomy(),
      getHpMap(),
      loadXp(),
      loadSkillStore(),
    ]);
    setEcon(store);
    setInsuranceMap(store.insurance);
    setCollapsedIds(
      habits.filter((h) => !h.archived && hpMap[h.id]?.collapsedAt).map((h) => h.id)
    );
    setLevel(levelInfoFromTotal(xp.totalXp).level);
    setSp(skills.sp);
    // Live prices (Hustler 'Tongue of Bargains' discounts them).
    const priceMap: Record<string, number> = {};
    for (const item of SHOP_CATALOG) {
      priceMap[item.id] = await itemPriceFor(item.id);
    }
    setPrices(priceMap);
  }, [habits]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const inventoryOf = useCallback(
    (id: string) => Math.max(0, Math.floor(econ?.inventory[id] ?? 0)),
    [econ]
  );

  const handleBuy = useCallback(async (item: ShopItem) => {
    if (busy || !econ) return;
    const price = prices[item.id] ?? item.price;
    if (econ.coins < price) {
      infoAlert('Not enough coins', `${item.name} costs ${price}🪙 — earn more by beating habits, challenges and quests.`);
      return;
    }
    setBusy(true);
    const res = await buyItem(item.id);
    setBusy(false);
    if (res.ok) {
      playCoinSound();
      // Items that need a target habit open the picker straight away —
      // revival kits used to purchase into a void: the assign state existed
      // in the type but nothing ever set it, so the kit sat un-usable here.
      if (item.id === 'insurance') setAssignTarget('insurance');
      if (item.id === 'revival_kit') setAssignTarget('revival');
    } else if (res.error === 'insufficient') {
      infoAlert('Not enough coins', 'Come back when your wallet is fatter 🪙');
    } else if (res.error === 'limit') {
      infoAlert('Shelf is full', `${item.icon} ${item.name} — you already hold the rationed maximum. Use what you own first.`);
    } else if (res.error === 'level') {
      infoAlert('Locked', `${item.name} opens at Level ${milestoneGateFor(item.minLevel, item.milestone) ?? item.minLevel}. Keep grinding.`);
    } else if (res.error === 'sp_full') {
      infoAlert('Scroll refuses you', 'Skill Scrolls only sell while you hold fewer than 3 unspent SP.');
    }
    await reload();
    void refreshEconomy();
  }, [busy, econ, prices, reload, refreshEconomy]);

  /** Assign insurance to a habit (7 days). */
  const handleAssignInsurance = useCallback(async (habitId: string, habitName: string) => {
    setBusy(true);
    const ok = await assignInsurance(habitId, habitName);
    setBusy(false);
    setAssignTarget(null);
    if (!ok) infoAlert('No certificate', 'Buy Habit Insurance first 📜');
    await reload();
    // The shared insuranceMap drives the Today-screen badge — refresh it or
    // the provider keeps showing the pre-assignment state.
    void refreshEconomy();
  }, [reload, refreshEconomy]);

  const handleUnassign = useCallback(async (habitId: string) => {
    await removeInsurance(habitId);
    await reload();
    void refreshEconomy();
  }, [reload, refreshEconomy]);

  /** Drink an XP potion/elixir: instant XP (applies skill/prestige multipliers). */
  const handleDrink = useCallback(async (itemId: 'xp_potion' | 'xp_elixir') => {
    if (busy) return; // double-tap used to grant the potion's XP twice
    if (inventoryOf(itemId) <= 0) return;
    setBusy(true);
    const economy = await import('../services/economyService');
    // consumeInventory returns FALSE when nothing was actually consumed —
    // granting XP unconditionally paid potions out of thin air.
    const consumed = await economy.consumeInventory(itemId);
    if (!consumed) {
      setBusy(false);
      infoAlert('Stock empty', 'That drink is already gone — buy another one first 🪙');
      await reload();
      return;
    }
    const xp = await import('../services/xpService');
    const total = await xp.grantXpBonus(XP_DRINK_XP[itemId] ?? 40, '🧪 XP drink');
    setBusy(false);
    infoAlert('XP drink 🧪', `+${total.total} XP added to your meter.`);
    await reload();
    void refreshEconomy();
  }, [busy, inventoryOf, reload, refreshEconomy]);

  /** Revive one collapsed habit with a kit — kit is burned ONLY when the
   *  revive actually happens. The picker list is rendered from state that
   *  may be stale (a free rebuild revive or a Phoenix save can un-collapse
   *  the habit between listing and tapping); consuming first burned a
   *  100+🪙 kit for nothing. */
  const handleReviveKit = useCallback(async (habitId: string, habitName: string) => {
    setBusy(true);
    const hp = await import('../services/hpService');
    const revived = await hp.reviveHabit(habitId, habitName, false);
    if (revived) {
      const economy = await import('../services/economyService');
      await economy.consumeInventory('revival_kit');
    } else {
      setAssignTarget(null);
      setBusy(false);
      infoAlert('Not collapsed', `${habitName} came back on its own in the meantime — the kit was NOT used.`);
      await Promise.all([reload(), refreshHp(), refreshEconomy()]);
      return;
    }
    setBusy(false);
    setAssignTarget(null);
    await Promise.all([reload(), refreshHp(), refreshEconomy()]);
  }, [reload, refreshHp, refreshEconomy]);

  if (!econ) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Shop</Text>
        <Pressable
          style={styles.penaltiesChip}
          onPress={() => { router.push('/penalties'); }}
          hitSlop={6}
        >
          <Text style={styles.penaltiesText}>💀 Penalties</Text>
        </Pressable>
        <View style={styles.coinChip}>
          <Text style={styles.coinText}>🪙 {econ.coins.toLocaleString()}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Level & SP wallet ── */}
        <View style={styles.walletRow}>
          <View style={styles.walletChip}>
            <Text style={styles.walletText}>⭐ Level {level}</Text>
          </View>
          <View style={styles.walletChip}>
            <Text style={styles.walletText}>✨ {sp} SP unspent</Text>
          </View>
        </View>

        {/* ── Inventory strip — what you already own, one glance ── */}
        {(() => {
          const strip = SHOP_CATALOG.filter((i) => shelfCountOf(i, econ) > 0);
          if (strip.length === 0) return null;
          return (
            <View style={styles.invWrap}>
              <Text style={styles.invTitle}>INVENTORY 🎒</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.invRow}>
                {strip.map((i) => {
                  const count = shelfCountOf(i, econ);
                  return (
                    <View key={i.id} style={styles.invChip}>
                      <Text style={styles.invEmoji}>{i.icon}</Text>
                      <Text style={styles.invCount}>×{count}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          );
        })()}

        {/* Fast consumables actionable right here */}
        {(['xp_potion', 'xp_elixir'] as const).map((id) => inventoryOf(id) > 0 && (
          <UseRow
            key={id}
            label={{
              xp_potion: `🧪 XP Potion ×${inventoryOf(id)}`,
              xp_elixir: `⚗️ XP Elixir ×${inventoryOf(id)}`,
            }[id]}
            hint={`Instant +${XP_DRINK_XP[id] ?? 40} XP drink, multiplied by your skill bonuses`}
            onPress={() => void handleDrink(id)}
          />
        ))}

        {(['boost', 'defense', 'legend'] as const).map((group) => {
          const items = SHOP_CATALOG.filter((i) => i.group === group);
          return (
            <View key={group} style={styles.group}>
              <Text style={styles.groupTitle}>{GROUP_LABELS[group]}</Text>
              {items.map((item) => {
                const onShelf = shelfCountOf(item, econ);
                const price = prices[item.id] ?? item.price;
                // Legend Scroll never caps (grants SP straight to the wallet);
                // Skill Scrolls cap on the SP wallet itself.
                const atLimit =
                  item.id === 'sp_scroll' ? sp >= 3
                  : item.id === 'legend_scroll' ? false
                  : onShelf >= item.maxStock;
                // Milestone gates stretch with the difficulty preset
                // (gentle base · balanced ×1.2 · hardcore ×1.4).
                const gate = milestoneGateFor(item.minLevel, item.milestone) ?? item.minLevel;
                const levelLocked = gate != null && level < gate;
                const loadRow = gate ?? item.minLevel;
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.itemIcon}>
                      <Text style={styles.itemIconText}>{item.icon}</Text>
                    </View>
                    <View style={styles.itemInfo}>
                      <View style={styles.itemNameRow}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {atLimit && (
                          <View style={styles.maxBadge}>
                            <Text style={styles.maxText}>MAX</Text>
                          </View>
                        )}
                        {levelLocked && (
                          <View style={styles.lockBadge}>
                            <Text style={styles.lockText}>🔒 Lv {loadRow}{item.milestone ? ' ★' : ''}</Text>
                          </View>
                        )}
                        {!atLimit && !levelLocked && onShelf > 0 && (
                          <View style={styles.stockBadge}>
                            <Text style={styles.stockText}>×{onShelf}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.itemDesc}>{item.desc}</Text>
                      {item.id === 'midas_touch' && econ.midasCharges > 0 && (
                        <Text style={styles.itemCharge}>Active charges: {econ.midasCharges}</Text>
                      )}
                      {item.id === 'midas_gauntlet' && econ.gauntletCharges > 0 && (
                        <Text style={styles.itemCharge}>🧤 Gauntlet charges: {econ.gauntletCharges} (×3 coin completions left)</Text>
                      )}
                      {item.id === 'titan_shield' && econ.titanCharges > 0 && (
                        <Text style={styles.itemCharge}>🦾 Titan charges: {econ.titanCharges} (auto-absorbs misses on day close)</Text>
                      )}
                      {item.id === 'xp_storm' && econ.xpStormUntil > Date.now() && econ.xpStormStrength <= 1.3 && (
                        <Text style={styles.itemCharge}>⚡ Storm live until {new Date(econ.xpStormUntil).toLocaleTimeString()}</Text>
                      )}
                      {item.id === 'eternal_storm' && econ.xpStormUntil > Date.now() && econ.xpStormStrength > 1.3 && (
                        <Text style={styles.itemCharge}>🌩️ Eternal Storm live — +40% XP until {new Date(econ.xpStormUntil).toLocaleTimeString()}</Text>
                      )}
                      {item.id === 'sp_scroll' && (
                        <Text style={styles.itemCharge}>Unspent SP: {sp} (scroll only sells under 3)</Text>
                      )}
                      {item.id === 'legend_scroll' && (
                        <Text style={styles.itemCharge}>Endgame item — the +2 SP skips the 3-SP wallet cap</Text>
                      )}
                      {item.id === 'xp_elixir' && (
                        <Text style={styles.itemCharge}>Milestone drink — Level 10+ players only</Text>
                      )}
                      {item.id === 'insurance' && (
                        <Text style={styles.itemCharge}>
                          Protecting: {habits.filter((h) => isInsuredSync(insuranceMap, h.id)).map((h) => h.name).join(', ') || 'no habit yet'}
                        </Text>
                      )}
                    </View>
                    <View style={styles.itemActions}>
                      {item.id === 'insurance' && inventoryOf('insurance') > 0 && (
                        <Pressable style={styles.assignBtn} onPress={() => setAssignTarget('insurance')}>
                          <Text style={styles.assignText}>Assign</Text>
                        </Pressable>
                      )}
                      {item.id === 'revival_kit' && inventoryOf('revival_kit') > 0 && (
                        <Pressable
                          style={styles.assignBtn}
                          disabled={busy || collapsedIds.length === 0}
                          onPress={() => setAssignTarget('revival')}
                        >
                          <Text style={styles.assignText}>Use</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={[
                          styles.buyBtn,
                          (econ.coins < price || atLimit || levelLocked) && styles.buyBtnDisabled,
                        ]}
                        onPress={() => handleBuy(item)}
                        disabled={busy || atLimit || levelLocked}
                      >
                        <Text style={styles.buyText}>{price}🪙</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Managed insurance list (expiry + remove) */}
        {habits.filter((h) => isInsuredSync(insuranceMap, h.id)).length > 0 && (
          <View style={styles.group}>
            <Text style={styles.groupTitle}>ACTIVE INSURANCE 📜</Text>
            {habits.filter((h) => isInsuredSync(insuranceMap, h.id)).map((h) => (
              <View key={h.id} style={styles.pendingRow}>
                <MaterialIcons name="verified" size={16} color={Colors.success} />
                <Text style={styles.pendingName} numberOfLines={1}>{h.name}</Text>
                <Text style={styles.pendingExpiry}>until {insuranceMap[h.id]}</Text>
                <Pressable onPress={() => handleUnassign(h.id)} hitSlop={8}>
                  <MaterialIcons name="cancel" size={20} color={Colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footNote}>
          The shelf is rationed — most items cap at 1–3 in your vault, and each
          one is consumed the moment it fires. Coins come only from completions,
          challenges, raids, streaks and quests; defense items are absorbed
          automatically when a missed day gets punished 💀
        </Text>
      </ScrollView>

      {/* Habit picker for insurance / revival kit */}
      <Modal visible={assignTarget !== null} transparent animationType="fade" onRequestClose={() => setAssignTarget(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setAssignTarget(null)}>
          <Pressable
            style={[styles.sheetPanel, { paddingBottom: Math.max(insets.bottom, 12) + Spacing.sm }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>
                {assignTarget === 'insurance' ? 'Assign Habit Insurance' : 'Revive a Habit'}
              </Text>
              <Pressable onPress={() => setAssignTarget(null)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll}>
              {assignTarget === 'insurance'
                ? habits.filter((h) => !h.archived && !isInsuredSync(insuranceMap, h.id)).map((h) => (
                    <Pressable
                      key={h.id}
                      style={styles.sheetRow}
                      onPress={() => { void handleAssignInsurance(h.id, h.name); }}
                    >
                      <Text style={styles.sheetRowText} numberOfLines={1}>{h.name}</Text>
                      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                    </Pressable>
                  ))
                : collapsedIds.length === 0 ? (
                    // All collapsed habits revived in the meantime — kits safe.
                    <Text style={styles.sheetRowText}>
                      No habit is hibernating right now — every kit stays in your vault 🧰
                    </Text>
                  ) : habits.filter((h) => collapsedIds.includes(h.id)).map((h) => (
                    <Pressable
                      key={h.id}
                      style={styles.sheetRow}
                      onPress={() => { void handleReviveKit(h.id, h.name); }}
                    >
                      <Text style={styles.sheetRowText} numberOfLines={1}>🏚️ {h.name}</Text>
                      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                    </Pressable>
                  ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Pure helper — insurance still ACTIVE for this habit today? The map holds
 * 'YYYY-MM-DD' expiry strings; mere presence includes lapsed certificates
 * that blocked re-assignment and posed as protection in the UI. */
function isInsuredSync(map: Record<string, string>, habitId: string): boolean {
  const expiry = map[habitId];
  return !!expiry && expiry >= todayStr();
}

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
  coinChip: {
    backgroundColor: `${Colors.warning}14`,
    borderWidth: 1,
    borderColor: `${Colors.warning}55`,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  coinText: {
    color: Colors.warning,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  penaltiesChip: {
    backgroundColor: `${Colors.danger}14`,
    borderWidth: 1,
    borderColor: `${Colors.danger}55`,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  penaltiesText: {
    color: Colors.danger,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
  },
  walletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  walletChip: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  walletText: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
  },
  invWrap: {
    marginTop: Spacing.md,
  },
  invTitle: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.4,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  invRow: {
    gap: Spacing.sm,
  },
  invChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  invEmoji: { fontSize: 13 },
  invCount: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  content: { paddingHorizontal: Spacing.md },
  useRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: `${Colors.success}55`,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  useLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  useHint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  group: {
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.sm,
  },
  groupTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.4,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconText: { fontSize: 20 },
  itemInfo: { flex: 1 },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  stockBadge: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  stockText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  maxBadge: {
    backgroundColor: 'rgba(248,113,113,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  maxText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: FontWeight.bold,
  },
  lockBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  lockText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
  },
  itemDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 15,
    marginTop: 2,
  },
  itemCharge: {
    fontSize: FontSize.xs,
    color: Colors.success,
    marginTop: 3,
    fontWeight: FontWeight.semibold,
  },
  itemActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  assignBtn: {
    backgroundColor: `${Colors.success}14`,
    borderWidth: 1,
    borderColor: `${Colors.success}45`,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  assignText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  buyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  buyBtnDisabled: { opacity: 0.4 },
  buyText: {
    color: '#fff',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
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
});
