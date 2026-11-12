// Mailbox 📬 — the player's inbox. Game-journal letters land here: level-ups,
// badges, day-close receipts, collapses, season results and welcome tips.
// Reward letters carry coins — open them and tap Collect (once-only, keyed).

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { useHabits } from '../hooks/useHabits';
import { playCoinSound } from '../services/soundService';
import {
  loadMailbox,
  markAllRead,
  markRead,
  claimMailReward,
  clearMailbox,
  MailboxStore,
  MailEntry,
  MailKind,
} from '../services/mailboxService';
import { confirmAlert } from '../services/alertCompat';

const KIND_COLOR: Record<MailKind, string> = {
  reward: Colors.success,
  levelup: Colors.primary,
  achievement: Colors.warning,
  penalty: Colors.textSecondary,
  collapse: Colors.danger,
  season: '#67E8F9',
  system: Colors.primary,
};

function fmtTime(t: number): string {
  const d = new Date(t);
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `Today ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${time}`;
}

function MailCard({ mail, expanded, onToggle, onClaim, claimed }: {
  mail: MailEntry;
  expanded: boolean;
  onToggle: () => void;
  onClaim: () => void;
  claimed: boolean;
}) {
  const accent = KIND_COLOR[mail.kind] ?? Colors.primary;
  const showClaim = !!mail.coinReward && !mail.rewardClaimed && !claimed;

  return (
    <Pressable
      style={[styles.mailCard, mail.read ? styles.mailCardRead : styles.mailCardUnread, { borderColor: expanded ? `${accent}66` : Colors.cardBorder }]}
      onPress={onToggle}
    >
      <View style={styles.mailHead}>
        <View style={[styles.kindIcon, { backgroundColor: `${accent}1A`, borderColor: `${accent}55` }]}>
          <Text style={styles.kindIconText}>{mail.icon}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.mailTitle, mail.read && styles.mailTitleRead]} numberOfLines={expanded ? undefined : 2}>
            {mail.title}
          </Text>
          <Text style={styles.mailMeta}>{fmtTime(mail.createdAt)}</Text>
        </View>
        {!mail.read && <View style={styles.unreadDot} />}
      </View>

      {expanded && (
        <Text style={styles.mailBody}>
          {mail.body.split('\n').map((line, i) => (
            <Text key={i}>
              {line}
              {i < mail.body.split('\n').length - 1 ? '\n' : ''}
            </Text>
          ))}
        </Text>
      )}

      {mail.coinReward != null && (
        <View style={styles.rewardRow}>
          <Text style={[styles.rewardLabel, { color: accent }]}>🎁 {mail.coinReward}🪙 attached</Text>
          {showClaim ? (
            <Pressable style={styles.claimBtn} onPress={onClaim} hitSlop={6}>
              <Text style={styles.claimText}>Collect</Text>
            </Pressable>
          ) : (mail.rewardClaimed || claimed) ? (
            <Text style={styles.claimedText}>Collected ✓</Text>
          ) : null}
        </View>
      )}

      {expanded && (
        <Text style={styles.clearReadMark}>read ✓</Text>
      )}
    </Pressable>
  );
}

export default function MailboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshEconomy } = useHabits();

  const [store, setStore] = useState<MailboxStore | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [claimedIds, setClaimedIds] = useState<Record<string, boolean>>({});
  const [busyClaim, setBusyClaim] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStore(await loadMailbox());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return undefined;
    }, [reload])
  );

  const unread = store?.letters.filter((l) => !l.read).length ?? 0;

  const handleToggle = useCallback((mail: MailEntry) => {
    const next = expandedId === mail.id ? null : mail.id;
    setExpandedId(next);
    if (!mail.read) {
      void markRead(mail.id).then(reload);
    }
  }, [expandedId, reload]);

  const handleClaim = useCallback(async (mail: MailEntry) => {
    if (busyClaim) return;
    setBusyClaim(mail.id);
    const got = await claimMailReward(mail.id);
    setClaimedIds((m) => ({ ...m, [mail.id]: got > 0 }));
    if (got > 0) playCoinSound();
    setBusyClaim(null);
    await reload();
    void refreshEconomy();
  }, [busyClaim, reload, refreshEconomy]);

  const handleMarkAll = useCallback(async () => {
    await markAllRead();
    await reload();
  }, [reload]);

  const handleClear = useCallback(() => {
    confirmAlert('Clear mailbox', 'Delete every letter? Attached rewards that are still uncollected will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => { void clearMailbox().then(reload); } },
    ]);
  }, [reload]);

  if (!store) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Mailbox</Text>
        {unread > 0 && (
          <View style={styles.unreadChip}>
            <Text style={styles.unreadText}>{unread} new</Text>
          </View>
        )}
        {unread === 0 && (
          <MaterialIcons name="mark-email-read" size={20} color={Colors.textMuted} />
        )}
      </View>

      {/* Bulk actions */}
      {store.letters.length > 0 && (
        <View style={styles.bulkRow}>
          <Pressable style={styles.bulkBtn} onPress={handleMarkAll} disabled={unread === 0}>
            <MaterialIcons name="done-all" size={15} color={unread > 0 ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.bulkText, unread === 0 && { color: Colors.textMuted }]}>Mark all read</Text>
          </Pressable>
          <Pressable style={styles.bulkBtn} onPress={handleClear}>
            <MaterialIcons name="delete-sweep" size={15} color={Colors.danger} />
            <Text style={[styles.bulkText, { color: Colors.danger }]}>Clear</Text>
          </Pressable>
        </View>
      )}

      {/* Letters */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      >
        {store.letters.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>No letters yet</Text>
            <Text style={styles.emptySub}>
              Level-ups, badges, season results and day-close receipts will get mailed here automatically.
            </Text>
          </View>
        ) : (
          store.letters.map((mail) => (
            <MailCard
              key={mail.id}
              mail={mail}
              expanded={expandedId === mail.id}
              onToggle={() => handleToggle(mail)}
              onClaim={() => { void handleClaim(mail); }}
              claimed={!!claimedIds[mail.id]}
            />
          ))
        )}
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
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
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
  unreadChip: {
    backgroundColor: Colors.primaryGlow,
    borderColor: Colors.primary,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unreadText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  bulkRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bulkText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  content: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    paddingTop: Spacing.md,
  },
  mailCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  mailCardUnread: {
    backgroundColor: Colors.cardElevated,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  mailCardRead: {
    opacity: 0.82,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  mailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  kindIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindIconText: { fontSize: 17 },
  mailTitle: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  mailTitleRead: { color: Colors.textSecondary },
  mailMeta: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: FontWeight.medium,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  mailBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: Spacing.sm,
    paddingLeft: 46,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm + 2,
    paddingLeft: 46,
    gap: Spacing.sm,
  },
  rewardLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    flexShrink: 1,
  },
  claimBtn: {
    backgroundColor: Colors.success,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  claimText: {
    color: '#04150E',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  claimedText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  clearReadMark: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: Spacing.xs + 2,
    paddingLeft: 46,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    gap: 4,
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
