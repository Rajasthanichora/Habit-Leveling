import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import { playCoinSound } from '../../services/soundService';

/** Three 🪙 fly up out of the wallet on income — tiny, native-driver, idle-free. */
function CoinBurst({ trigger }: { trigger: number }) {
  const [show, setShow] = useState(false);
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger <= 0) return;
    setShow(true);
    [a1, a2, a3].forEach((a) => a.setValue(0));
    const base = { easing: Easing.out(Easing.quad), useNativeDriver: true } as const;
    Animated.parallel([
      Animated.timing(a1, { toValue: 1, duration: 650, ...base }),
      Animated.timing(a2, { toValue: 1, duration: 650, delay: 60, ...base }),
      Animated.timing(a3, { toValue: 1, duration: 650, delay: 120, ...base }),
    ]).start(() => {
      setShow(false);
    });
  }, [trigger, a1, a2, a3]);

  if (!show) return null;
  const path = (a: Animated.Value, dx: number, dy: number, rot: string) => ({
    opacity: a.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
    transform: [
      { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
      { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [2, dy] }) },
      { scale: a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 1, 0.7] }) },
      { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', rot] }) },
    ],
  });

  return (
    <View pointerEvents="none" style={burst.rows}>
      <Animated.Text style={[burst.coin, path(a1, -18, -34, '-40deg')]}>🪙</Animated.Text>
      <Animated.Text style={[burst.coin, path(a2, 0, -44, '25deg')]}>🪙</Animated.Text>
      <Animated.Text style={[burst.coin, path(a3, 18, -34, '40deg')]}>🪙</Animated.Text>
    </View>
  );
}

const burst = StyleSheet.create({
  rows: {
    position: 'absolute',
    top: -2,
    left: '50%',
    marginLeft: -10,
    width: 20,
  },
  coin: {
    position: 'absolute',
    left: 1,
    fontSize: 14,
  },
});

/**
 * Economy strip — the coin wallet and the live combo chip. Sits right under
 * the progress bar on Home. (Day closing is fully automatic now — the day
 * settles itself when the next day arrives.)
 * Animations: wallet coin-burst on income, combo pulse while a chain is live.
 */
export function EconomyStrip() {
  const router = useRouter();
  const { coins, comboCount, comboMult } = useHabits();

  // ── Coin-burst trigger (fires when coins increase past the first load) ──
  const prevCoins = useRef<number | null>(null);
  const [coinTrigger, setCoinTrigger] = useState(0);
  useEffect(() => {
    if (prevCoins.current !== null && coins > prevCoins.current) {
      setCoinTrigger((t) => t + 1);
    }
    prevCoins.current = coins;
  }, [coins]);

  // ── Combo pulse: a crisp bump each time the chain grows ──
  const prevCombo = useRef(0);
  const comboScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (comboCount >= 2 && comboCount > prevCombo.current) {
      Animated.sequence([
        Animated.spring(comboScale, { toValue: 1.22, useNativeDriver: true, friction: 4, tension: 260 }),
        Animated.spring(comboScale, { toValue: 1, useNativeDriver: true, friction: 6 }),
      ]).start();
      // Combo jingle at the headline thresholds — reuse the coin chime.
      if (comboCount === 3 || comboCount === 6 || comboCount === 9) {
        void playCoinSound();
      }
    }
    prevCombo.current = comboCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboCount]);

  return (
    <View style={styles.strip}>
      {/* Coin wallet → Shop */}
      <Pressable style={styles.wallet} onPress={() => { router.push('/shop'); }}>
        <Text style={styles.coinEmoji}>🪙</Text>
        <Text style={styles.coinValue}>{coins.toLocaleString()}</Text>
        <MaterialIcons name="storefront" size={14} color={Colors.textMuted} />
        <CoinBurst trigger={coinTrigger} />
      </Pressable>

      {/* Combo chip — visible only while a chain is running */}
      {comboCount >= 2 && (
        <Animated.View style={[styles.comboChip, { transform: [{ scale: comboScale }] }]}>
          <Text style={styles.comboText}>🔥 {comboCount} · ×{comboMult}</Text>
        </Animated.View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  wallet: {
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
  coinEmoji: { fontSize: 14 },
  coinValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
  comboChip: {
    backgroundColor: `${Colors.warning}14`,
    borderWidth: 1,
    borderColor: `${Colors.warning}55`,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  comboText: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    fontWeight: FontWeight.bold,
  },
});
