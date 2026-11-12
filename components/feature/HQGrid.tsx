// HQ quick-access tile grid — the "home rows" of the player hub.
// Pure navigation: every tile routes to an existing screen. The Mailbox tile
// is the only live one — it carries the unread-letter badge so the inbox
// never hides new messages.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useRouter } from 'expo-router';
import { unreadCount, subscribeMailbox } from '../../services/mailboxService';

interface Tile {
  key: string;
  label: string;
  emoji: string;
  icon?: string;   // MaterialIcons fallback when no emoji
  tint: string;
  route: string;
  /** Vertical gradient for the tile body (top → bottom). */
  gradA: string;
  gradB: string;
}

const TILES: Tile[] = [
  { key: 'mailbox', label: 'Mailbox', emoji: '📬', tint: 'rgba(78,142,255,0.14)', route: '/mailbox', gradA: 'rgba(78,142,255,0.22)', gradB: 'rgba(78,142,255,0.03)' },
  { key: 'inventory', label: 'Inventory', emoji: '🎒', tint: 'rgba(52,211,153,0.14)', route: '/inventory', gradA: 'rgba(52,211,153,0.22)', gradB: 'rgba(52,211,153,0.03)' },
  { key: 'skills', label: 'Skill Trees', emoji: '🧠', tint: Colors.primaryGlow, route: '/skills', gradA: 'rgba(78,142,255,0.22)', gradB: 'rgba(45,212,191,0.04)' },
  { key: 'shop', label: 'Shop', emoji: '🪙', tint: 'rgba(251,191,36,0.14)', route: '/shop', gradA: 'rgba(251,191,36,0.22)', gradB: 'rgba(251,191,36,0.03)' },
  { key: 'penalties', label: 'Penalties', emoji: '💀', tint: 'rgba(248,113,113,0.14)', route: '/penalties', gradA: 'rgba(248,113,113,0.24)', gradB: 'rgba(248,113,113,0.04)' },
  { key: 'settings', label: 'Settings', emoji: '⚙️', tint: 'rgba(255,255,255,0.06)', route: '/settings', gradA: 'rgba(255,255,255,0.10)', gradB: 'rgba(255,255,255,0.02)' },
];

/** Reserved empty slot — a future feature tile can drop in here (Journey's old spot). */

export function HQGrid() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  // Live unread badge — any mailbox write (service-level) nudges this tile.
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void unreadCount().then((n) => {
        if (active) setUnread(n);
      });
    };
    refresh();
    const unsub = subscribeMailbox(refresh);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const open = useCallback((route: string) => {
    router.push(route as never);
  }, [router]);

  return (
    <View style={styles.grid}>
      {TILES.map((t) => (
        <Pressable
          key={t.key}
          style={({ pressed }) => [
            styles.tile,
            { backgroundColor: t.tint },
            pressed && styles.tilePressed,
            pressed && { transform: [{ scale: 0.955 }] },
          ]}
          onPress={() => open(t.route)}
          android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
          accessibilityLabel={t.label}
        >
          {/* premium gradient body */}
          <LinearGradient
            colors={[t.gradA, t.gradB]}
            locations={[0, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.tileGrad}
            pointerEvents="none"
          />
          <View style={styles.emojiWrap}>
            <Text style={styles.tileEmoji}>{t.emoji}</Text>
            {t.key === 'mailbox' && unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </View>
          <Text style={styles.tileLabel} numberOfLines={1}>{t.label}</Text>
          <MaterialIcons name="chevron-right" size={14} color={Colors.textMuted} />
        </Pressable>
      ))}

      {/* Reserved empty slot — future feature tile will live here (old Journey spot). */}
      <View
        style={styles.tile}
        accessibilityLabel="Coming soon"
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']}
          locations={[0, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.tileGrad}
          pointerEvents="none"
        />
        <View style={[styles.emojiWrap, styles.emptySlotIcon]}>
          <Text style={styles.emptySlotPlus}>+</Text>
        </View>
        <Text style={[styles.tileLabel, styles.emptySlotLabel]} numberOfLines={1}>Soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tile: {
    flexBasis: '31.5%',
    flexGrow: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: 5,
    overflow: 'hidden', // clip the gradient + ripple to the tile radius
  },
  tileGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  tilePressed: { opacity: 0.85 },
  emojiWrap: {
    position: 'relative',
  },
  tileEmoji: { fontSize: 24 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    borderRadius: 9,
    backgroundColor: Colors.danger,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: FontWeight.bold,
  },
  tileLabel: {
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  emptySlotIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotPlus: {
    fontSize: 18,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
  },
  emptySlotLabel: {
    color: Colors.textMuted,
    opacity: 0.8,
  },
});
