// Powered by OnSpace.AI
// Skill Trees — four grand paths (Midas Way / Sage Mind / Iron Aegis / Chrono Vault).
// 12 parent-chained nodes each, bought one at a time (never freely granted): a
// full tree costs ~32 SP ≈ Level 32. Deep tiers also ask for player level (the
// ⚡ gate hint shows the requirement), and a paid respec refunds the whole
// tree when the player wants to re-spec their build.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { useHabits } from '../hooks/useHabits';
import { SKILL_TREES, EQUIPPABLE_TITLES, LEGEND_SKILLS, SkillNodeId, TitleDef } from '../services/gameRules';
import { loadSkillStore, canBuy, buySkillNode, resetSkills, equipTitle, getUnlockedTitles, SkillStore, legendProgress } from '../services/skillService';
import { infoAlert, confirmAlert } from '../services/alertCompat';

/** One earned-legend row — no buy button, only its arena ledger status. */
function LegendRow({ nodeId, state }: {
  nodeId: SkillNodeId;
  state: { current: number; target: number; levelOk: boolean; owned: boolean } | undefined;
}) {
  const def = LEGEND_SKILLS.find((n) => n.id === nodeId)!;
  const owned = !!state?.owned;
  const levelOk = state?.levelOk ?? false;
  const pct = state && state.target > 0 ? Math.min(1, state.current / state.target) : 0;
  return (
    <View style={[ls.row, owned && ls.rowOwned]}>
      <View style={[ls.iconBox, owned && ls.iconOwned]}>
        {owned ? <Text style={ls.ownedCheck}>✓</Text> : <Text style={{ fontSize: 15 }}>{def.icon}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <View style={ls.nameRow}>
          <Text style={[ls.name, owned && { color: Colors.warning }]}>{def.name}</Text>
          <View style={[ls.levelChip, !levelOk && owned && { opacity: 0.6 }]}>
            <Text style={ls.levelChipText}>Lv {def.minLevel} · {def.kind.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={ls.desc}>{def.desc}</Text>
        {owned ? (
          <Text style={ls.earnedText}>Earned in the arena — never bought 🔥</Text>
        ) : (
          <>
            <View style={ls.track}>
              <View style={[ls.fill, { width: `${Math.round(pct * 100)}%` }]} />
            </View>
            <Text style={ls.req}>
              {state ? `${state.current}/${state.target} ` : ''}
              {def.kind === 'raid' ? 'raids cleared' : def.kind === 'challenge' ? 'challenges conquered' : 'seasons closed'}
              {!levelOk ? ` · needs level ${def.minLevel}` : ''}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const ls = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 9,
    paddingHorizontal: Spacing.xs,
  },
  rowOwned: { opacity: 0.92 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.chipBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  iconOwned: {
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderColor: `${Colors.warning}66`,
  },
  ownedCheck: { color: Colors.warning, fontWeight: '900', fontSize: 15 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelChip: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  levelChipText: {
    fontSize: 8.5,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
    letterSpacing: 0.6,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  desc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 15,
    marginTop: 1,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 3,
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.warning,
  },
  req: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  earnedText: {
    fontSize: 10,
    color: Colors.warning,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
});

/** Single skill node row with its parent connector rail. */
function NodeRow({ nodeId, owned, affordable, gated, minLevel, level, isFirst, onBuy }: {
  nodeId: SkillNodeId;
  owned: boolean;
  affordable: boolean;
  /** Node demands a player level the player hasn't reached yet. */
  gated: boolean;
  minLevel?: number;
  level: number;
  isFirst: boolean;
  onBuy: (id: SkillNodeId) => void;
}) {
  const node = SKILL_TREES.flatMap((t) => t.nodes).find((n) => n.id === nodeId)!;
  return (
    <View style={[ns.row, owned && ns.rowOwned]}>
      {/* Connector rail: vertical line joining the node to its parent above. */}
      <View style={ns.rail}>
        {!isFirst && <View style={[ns.railLine, owned && ns.railLineOwned]} />}
      </View>
      <View
        style={[
          ns.iconBox,
          owned && ns.iconOwned,
          gated && !owned && { borderColor: 'rgba(169,139,250,0.55)' },
        ]}
      >
        {owned ? (
          <Text style={ns.ownedCheck}>✓</Text>
        ) : gated ? (
          <MaterialIcons name="lock" size={15} color={'#A78BFA'} />
        ) : (
          <Text style={ns.costIcon}>{node.cost}⚡</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={ns.nameRow}>
          <Text style={[ns.name, owned && ns.nameOwned]}>{node.name}</Text>
          {gated && !owned && (
            <View style={ns.levelChip}>
              <Text style={ns.levelChipText}>LV {minLevel} REQ</Text>
            </View>
          )}
        </View>
        <Text style={ns.desc}>{node.desc}</Text>
        {gated && !owned && (
          <Text style={ns.gateHint}>
            You&apos;re level {level} — reach level {minLevel} to unlock this tier.
          </Text>
        )}
      </View>
      {!owned && (
        <Pressable
          style={[ns.buyBtn, (!affordable || gated) && ns.buyBtnDisabled]}
          onPress={() => onBuy(nodeId)}
          disabled={!affordable || gated}
        >
          <Text style={ns.buyText}>Unlock</Text>
        </Pressable>
      )}
    </View>
  );
}

const ns = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 9,
    paddingHorizontal: Spacing.xs,
  },
  rowOwned: { opacity: 0.85 },
  rail: {
    width: 12,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railLine: {
    width: 1.5,
    height: '100%',
    backgroundColor: Colors.separator,
  },
  railLineOwned: {
    backgroundColor: 'rgba(52,211,153,0.4)',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.chipBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  iconOwned: {
    backgroundColor: 'rgba(52,211,153,0.14)',
    borderColor: `${Colors.success}55`,
  },
  ownedCheck: { color: Colors.success, fontWeight: '900', fontSize: 15 },
  costIcon: {
    color: Colors.warning,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelChip: {
    backgroundColor: 'rgba(169,139,250,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(169,139,250,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  levelChipText: {
    fontSize: 8.5,
    fontWeight: FontWeight.bold,
    color: '#A78BFA',
    letterSpacing: 0.6,
  },
  gateHint: {
    fontSize: 10,
    color: '#A78BFA',
    marginTop: 2,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  nameOwned: { color: Colors.success },
  desc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 15,
    marginTop: 1,
  },
  buyBtn: {
    backgroundColor: `${Colors.warning}18`,
    borderWidth: 1,
    borderColor: `${Colors.warning}55`,
    borderRadius: Radius.full,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  buyBtnDisabled: { opacity: 0.35 },
  buyText: {
    color: Colors.warning,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});

/** Legend progress wrapper — tolerate a service hiccup. */
async function catchLegend() {
  try {
    return await legendProgress();
  } catch {
    return null;
  }
}

export default function SkillsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshEconomy, levelInfo, coins } = useHabits();
  const level = levelInfo?.level ?? 0;

  const [store, setStore] = useState<SkillStore | null>(null);
  const [titles, setTitles] = useState<TitleDef[]>([]);
  const [legend, setLegend] = useState<Awaited<ReturnType<typeof legendProgress>> | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [s, t, l] = await Promise.all([loadSkillStore(), getUnlockedTitles(), catchLegend()]);
    setStore(s);
    setTitles(t);
    setLegend(l);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleBuy = useCallback(async (id: SkillNodeId) => {
    if (!store || busy) return;
    const node = SKILL_TREES.flatMap((t) => t.nodes).find((n) => n.id === id);
    if (node && store.sp < node.cost) {
      infoAlert('Not enough SP', `This node costs ${node.cost} SP — level up or buy a Skill Scroll 📜 in the Shop.`);
      return;
    }
    const parentMissing = node?.parent && !store.owned.includes(node.parent);
    if (parentMissing) {
      infoAlert('Locked', 'Unlock the parent node at the top of this path first.');
      return;
    }
    if (node?.minLevel != null && level < node.minLevel) {
      infoAlert('Level gate', `${node.name} unlocks at level ${node.minLevel} — you're level ${level}.`);
      return;
    }
    setBusy(true);
    await buySkillNode(id);
    setBusy(false);
    await reload();
    void refreshEconomy();
  }, [store, busy, level, reload, refreshEconomy]);

  const handleRespec = useCallback(() => {
    if (!store || busy || store.owned.length === 0) return;
    if (coins < 150) {
      infoAlert('Not enough coins', 'Skill respec costs 150🪙 — earn more and come back.');
      return;
    }
    const refundable = SKILL_TREES.flatMap((t) => t.nodes)
      .filter((n) => store.owned.includes(n.id))
      .reduce((sum, n) => sum + n.cost, 0);
    confirmAlert(
      'Respec skills 🔁',
      `Reset ALL skill nodes and refund ${refundable} SP to spend again? Costs 150🪙. Titles stay unlocked.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Respec',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              const ok = await resetSkills();
              setBusy(false);
              if (!ok) {
                infoAlert('Respec failed', 'Your wallet could not cover the 150🪙 fee.');
              }
              await reload();
              void refreshEconomy();
            })();
          },
        },
      ]
    );
  }, [store, busy, coins, reload, refreshEconomy]);

  const handleEquip = useCallback(async (titleId: string | null) => {
    await equipTitle(titleId);
    await reload();
  }, [reload]);

  if (!store) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const ownedAny = store.owned.length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Skill Trees</Text>
        <View style={styles.spChip}>
          <Text style={styles.spText}>{store.sp} SP</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={styles.intro}>
          Earn 1 Skill Point every level-up ({store.spEarnedLifetime} lifetime). Buy Skill
          Scrolls 📜 in the Shop for instant SP. Every tree runs 12 parent-chained nodes —
          they unlock top-down one at a time, and the deep tiers also ask for your player
          level. Nothing is freely given: you BUY each node, and a full tree is the end game.
        </Text>

        {SKILL_TREES.map((tree) => {
          const ownedCount = tree.nodes.filter((n) => store.owned.includes(n.id)).length;
          const complete = ownedCount === tree.nodes.length;
          return (
            <View key={tree.id} style={styles.tree}>
              <View style={styles.treeHead}>
                <Text style={styles.treeIcon}>{tree.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.treeName, { color: tree.accent }]}>{tree.name}</Text>
                  <Text style={styles.treeBlurb}>{tree.blurb}</Text>
                </View>
                <Text style={[styles.treeCount, complete && { color: Colors.success }]}>
                  {ownedCount}/{tree.nodes.length}
                </Text>
              </View>
              {tree.nodes.map((node, idx) => (
                <NodeRow
                  key={node.id}
                  nodeId={node.id}
                  owned={store.owned.includes(node.id)}
                  affordable={
                    !!node && canBuy(store, node.id, level)
                  }
                  gated={!!node.minLevel && level < node.minLevel && !store.owned.includes(node.id)}
                  minLevel={node.minLevel}
                  level={level}
                  isFirst={idx === 0}
                  onBuy={(id) => { void handleBuy(id); }}
                />
              ))}
            </View>
          );
        })}

        {/* ── Legend skills (arena-earned) ── */}
        <View style={styles.tree}>
          <View style={styles.treeHead}>
            <Text style={styles.treeIcon}>⚔️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.treeName, { color: Colors.warning }]}>Legend Skills</Text>
              <Text style={styles.treeBlurb}>Earned in raids, 7-day challenges & seasons — never bought, SP-safe on respec.</Text>
            </View>
            <Text style={[styles.treeCount, { color: Colors.warning }]}>
              {legend ? LEGEND_SKILLS.filter((n) => legend.nodes[n.id]?.owned).length : 0}/{LEGEND_SKILLS.length}
            </Text>
          </View>
          {LEGEND_SKILLS.map((n) => (
            <LegendRow key={n.id} nodeId={n.id} state={legend?.nodes[n.id]} />
          ))}
          <Text style={styles.legendNote}>
            Win counts stretch with your difficulty preset — balanced ×1.25, hardcore ×1.5 — and every
            node also demands its player level. Titles like Arena Blooded unlock from these.
          </Text>
        </View>

        {/* Respec */}
        <Pressable
          style={[styles.respecBtn, (!ownedAny || coins < 150 || busy) && styles.respecBtnMuted]}
          onPress={handleRespec}
          disabled={!ownedAny || coins < 150 || busy}
        >
          <MaterialIcons name="restart-alt" size={18} color={ownedAny && coins >= 150 ? Colors.warning : Colors.textMuted} />
          <Text style={[styles.respecText, (!ownedAny || coins < 150) && { color: Colors.textMuted }]}>
            {ownedAny ? 'Respec all skills — 150🪙' : 'No nodes speced yet'}
          </Text>
        </Pressable>

        {/* Titles */}
        <View style={styles.titleSection}>
          <Text style={styles.groupTitle}>TITLES</Text>
          <Text style={styles.intro}>
            Equip one title for your profile. Unlocked from real progress — trees, arena and legacy milestones. Never revoked.
          </Text>
          {EQUIPPABLE_TITLES.map((t) => {
            const unlocked = titles.some((u) => u.id === t.id);
            const equipped = store.equippedTitle === t.id;
            return (
              <Pressable
                key={t.id}
                style={[styles.titleRow, equipped && styles.titleRowEquipped, !unlocked && styles.titleRowLocked]}
                onPress={() => { if (unlocked) handleEquip(equipped ? null : t.id); }}
                disabled={!unlocked}
              >
                <MaterialIcons
                  name={unlocked ? (equipped ? 'check-circle' : 'radio-button-unchecked') : 'lock'}
                  size={18}
                  color={equipped ? Colors.success : unlocked ? Colors.textSecondary : Colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.titleName, !unlocked && styles.titleNameLocked]}>{t.name}</Text>
                  <Text style={styles.titleDesc}>{t.desc}</Text>
                </View>
              </Pressable>
            );
          })}
          {titles.length === 0 && (
            <Text style={styles.emptyTitles}>No titles yet — grow your trees, climb levels and conquer the arena to unlock them.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
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
  spChip: {
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  spText: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  content: { paddingHorizontal: Spacing.md },
  intro: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  tree: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.sm,
    marginTop: Spacing.md,
  },
  treeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  treeIcon: { fontSize: 22 },
  treeName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  treeBlurb: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  treeCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
  },
  respecBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: `${Colors.warning}12`,
    borderWidth: 1,
    borderColor: `${Colors.warning}44`,
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginTop: Spacing.md,
  },
  respecBtnMuted: { opacity: 0.45 },
  respecText: {
    color: Colors.warning,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  legendNote: {
    fontSize: 9.5,
    color: Colors.textMuted,
    lineHeight: 14,
    marginTop: Spacing.sm - 2,
    paddingTop: Spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
  },
  titleSection: {
    marginTop: Spacing.lg,
  },
  groupTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.4,
    color: Colors.textMuted,
    marginBottom: 2,
    paddingHorizontal: Spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  titleRowEquipped: {
    backgroundColor: 'rgba(52,211,153,0.07)',
    borderRadius: Radius.sm,
  },
  titleRowLocked: { opacity: 0.5 },
  titleName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  titleNameLocked: {
    color: Colors.textMuted,
  },
  titleDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  emptyTitles: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
});
