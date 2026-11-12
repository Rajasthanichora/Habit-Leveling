// The big reward moment: a full-screen LEVEL UP celebration.
// Subscribes to the game bus directly (plain JS layer) — works from any screen,
// including those without a GameToast mount. pointerEvents="none" so gameplay
// is never blocked; auto-dismisses. Display-only: the toast copy for levelups
// is suppressed in HabitContext, and the sound still plays there.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius } from '../../constants/theme';
import { subscribeGameEvents } from '../../services/xpService';

const { width: W } = Dimensions.get('window');
const RING = Math.min(W * 0.8, 320);

// Firework embers: one burst of 10 emoji sparks flying outward from the ring.
interface Ember { emoji: string; dx: number; dy: number; size: number; rot: number; lift: number; shift: number }
const EMBERS: Ember[] = [
  { emoji: '✨', dx: -150, dy: -100, size: 18, rot: -20, lift: 8, shift: 16 },
  { emoji: '⭐', dx: 150, dy: -110, size: 16, rot: 25, lift: 8, shift: -16 },
  { emoji: '💫', dx: -185, dy: 30, size: 15, rot: 0, lift: -20, shift: 16 },
  { emoji: '🌟', dx: 190, dy: 40, size: 17, rot: 15, lift: -20, shift: -16 },
  { emoji: '🎆', dx: -110, dy: 120, size: 18, rot: -30, lift: -60, shift: 16 },
  { emoji: '🎇', dx: 115, dy: 125, size: 18, rot: 30, lift: -60, shift: -16 },
  { emoji: '✧', dx: -55, dy: -160, size: 14, rot: 0, lift: 40, shift: 16 },
  { emoji: '✦', dx: 60, dy: -165, size: 14, rot: 0, lift: 40, shift: -16 },
  { emoji: '🎉', dx: -230, dy: -20, size: 20, rot: -12, lift: -60, shift: 16 },
  { emoji: '🎊', dx: 235, dy: -15, size: 20, rot: 12, lift: -60, shift: -16 },
];

interface State {
  level: number;
  title: string;
  key: number;
}

export function LevelUpOverlay() {
  const [state, setState] = useState<State | null>(null);
  const backdrop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return subscribeGameEvents((event) => {
      if (event.type !== 'levelup') return;
      setState({ level: event.level, title: event.title, key: Date.now() });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    [ring, text, glow, sparkle, flip, burst].forEach((a) => a.setValue(0));
    backdrop.setValue(0);

    const core = Animated.sequence([
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(ring, { toValue: 1, useNativeDriver: true, friction: 5, tension: 160 }),
        Animated.timing(glow, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.spring(text, { toValue: 1, useNativeDriver: true, friction: 4, tension: 200 }),
        Animated.parallel([
          Animated.timing(sparkle, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.delay(1700),
        ]),
        Animated.timing(sparkle, { toValue: 0, duration: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]),
    ]);

    Animated.parallel([
      core,
      // Title card flip-in (rotateY 180° → 0°) landing as the text springs.
      Animated.timing(flip, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      // Firework embers fly out just after the card lands.
      Animated.sequence([
        Animated.delay(240),
        Animated.timing(burst, { toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Hide after the exit completes so a re-trigger can replay cleanly.
      setTimeout(() => setState(null), 40);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.key]);

  if (!state) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="none">
      {/* Dim + glow backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}>
        <Animated.View
          style={[
            styles.glowCircle,
            {
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.15] }) }],
            },
          ]}
        />
      </Animated.View>

      {/* Expanding ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.8, 0.35] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }],
          },
        ]}
      />

      {/* Firework embers — emoji sparks flying outward on radial arcs */}
      {EMBERS.map((e, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.ember,
            {
              marginBottom: e.lift,
              marginLeft: e.shift,
              opacity: burst.interpolate({ inputRange: [0, 0.12, 0.62, 1], outputRange: [0, 0, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, e.dx] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, e.dy] }) },
                { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] }) },
                { rotate: `${e.rot}deg` },
              ],
            },
          ]}
        >
          <Text style={{ fontSize: e.size }}>{e.emoji}</Text>
        </Animated.View>
      ))}

      {/* Center copy — flips in like a prize card */}
      <Animated.View
        style={[
          styles.center,
          {
            transform: [
              { perspective: 900 },
              { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '0deg'] }) },
            ],
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.label,
            {
              opacity: text,
              transform: [
                { scale: text.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
        >
          LEVEL UP
        </Animated.Text>
        <Animated.Text
          style={[
            styles.levelNumber,
            {
              opacity: text,
              transform: [{ scale: text.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }],
            },
          ]}
        >
          {state.level}
        </Animated.Text>
        <Animated.Text style={[styles.titleText, { opacity: text }]}>{state.title}</Animated.Text>
      </Animated.View>

      {/* Sparkle burst emojis */}
      <Animated.View style={{ opacity: sparkle }}>
        <Text style={styles.sparkles}>✦ ⭐ ✦　✦ ✧ ✦</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    elevation: 999,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowCircle: {
    position: 'absolute',
    width: RING * 1.35,
    height: RING * 1.35,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(78,142,255,0.16)',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: 'rgba(78,142,255,0.55)',
  },
  center: { alignItems: 'center' },
  label: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    letterSpacing: 6,
  },
  levelNumber: {
    fontSize: 88,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
    textShadowColor: 'rgba(78,142,255,0.6)',
    textShadowRadius: 28,
    textShadowOffset: { width: 0, height: 0 },
    marginTop: 4,
  },
  titleText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginTop: 6,
  },
  sparkles: {
    position: 'absolute',
    bottom: '32%',
    fontSize: 16,
    color: Colors.warning,
    letterSpacing: 8,
    textAlign: 'center',
    width: '100%',
  },
  ember: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
