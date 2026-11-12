import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import type { GameEvent } from '../../services/xpService';

const COPY: Record<GameEvent['type'], { icon: string; color: string }> = {
  levelup: { icon: 'military-tech', color: Colors.warning },
  achievement: { icon: 'emoji-events', color: Colors.warning },
  claim: { icon: 'bolt', color: Colors.success },
  coin: { icon: 'paid', color: Colors.warning },
  penalty: { icon: 'flash-off', color: Colors.danger },
  collapse: { icon: 'hotel', color: Colors.danger },
  revive: { icon: 'restart-alt', color: Colors.success },
  chest: { icon: 'redeem', color: Colors.warning },
  combo: { icon: 'local-fire-department', color: Colors.warning },
  evolve: { icon: 'eco', color: Colors.success },
  prestige: { icon: 'flight-takeoff', color: Colors.warning },
  season: { icon: 'calendar-month', color: Colors.primary },
  rebuild: { icon: 'construction', color: Colors.primary },
  skill: { icon: 'psychology', color: Colors.primary },
};

/** Floating game toast — level ups, badge unlocks, bonus XP claims. */
export function GameToast() {
  const { gameToast, gameToastKey, clearGameToast } = useHabits();
  const [visibleEvent, setVisibleEvent] = useState<GameEvent | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  // Guards against a STALE animation's finish callback: two toasts within the
  // ~2.7s window used to interleave — the old sequence's callback fired after
  // the new one started, wiping the FRESH toast (`clearGameToast()` +
  // `setVisibleEvent(null)`) before the user could read it.
  const runningAnim = useRef<Animated.CompositeAnimation | null>(null);
  const startedForKey = useRef<number | null>(null);

  useEffect(() => {
    if (!gameToast) return;
    // Cancel whatever the previous toast is still playing.
    runningAnim.current?.stop();
    const forThisKey = gameToastKey;
    startedForKey.current = forThisKey ?? null;
    setVisibleEvent(gameToast);
    anim.setValue(0);
    const seq = Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.delay(2400),
      Animated.timing(anim, { toValue: 0, useNativeDriver: true, duration: 220 }),
    ]);
    runningAnim.current = seq;
    seq.start(({ finished }) => {
      // A newer toast took over since this one started — its callback owns the cleanup.
      if (startedForKey.current !== forThisKey) return;
      runningAnim.current = null;
      if (finished) {
        // Hide after the exit animation completes.
        setTimeout(() => setVisibleEvent(null), 60);
        clearGameToast();
      } else {
        // Interrupted (replaced/re-mounted): leave everything for the new sequence.
        setVisibleEvent(null);
      }
    });
    return () => {
      // Effect re-run/unmount: mark this toast stale so a late settle does nothing.
      startedForKey.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameToastKey]);

  if (!visibleEvent) return null;

  const meta = COPY[visibleEvent.type];
  let title = '';
  let subtitle: string | undefined = '';
  if (visibleEvent.type === 'levelup') {
    title = `LEVEL UP! Level ${visibleEvent.level}`;
    subtitle = visibleEvent.title;
  } else if (visibleEvent.type === 'achievement') {
    title = 'Achievement unlocked!';
    subtitle = visibleEvent.title;
  } else {
    title = visibleEvent.message;
    if (visibleEvent.type === 'claim') {
      subtitle = `+${visibleEvent.xp} XP`;
    } else if (visibleEvent.type === 'coin' || visibleEvent.type === 'chest') {
      subtitle = visibleEvent.coins > 0 ? `+${visibleEvent.coins}🪙` : undefined;
    } else if (visibleEvent.type === 'penalty' && typeof visibleEvent.coins === 'number') {
      subtitle = `${visibleEvent.coins}🪙`;
    } else {
      subtitle = undefined;
    }
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.iconWrap}>
        <MaterialIcons name={meta.icon as never} size={20} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 60,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
