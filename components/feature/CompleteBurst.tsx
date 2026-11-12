// Confetti burst + floating "+XP" chip for a completed habit card.
// Fires when `completed` flips false→true; plays once, then cleans itself up.
// Built on RN Animated + native driver (transform/opacity only) — zero layout
// cost while idle (particles render only during the ~0.9s celebration).

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/theme';

const PARTICLE_COLORS = [Colors.primary, Colors.success, Colors.warning, '#FF6B6B', '#A78BFA', '#FB923C'];

interface Particle {
  id: number;
  color: string;
  size: number;
  angle: number;    // degrees around the burst origin
  distance: number;
  duration: number;
  delay: number;
}

const ANCHOR = { right: 46, top: 54 }; // near the checkbox, inside the card

export function CompleteBurst({ completed }: { completed: boolean }) {
  // prev starts at the prop's value: an already-completed card that mounts
  // (scroll windowing, date switch) must NOT replay the celebration.
  const prev = useRef(completed);
  const [particles, setParticles] = useState<Particle[] | null>(null);

  // Each particle owns one Animated value 0→1; interpolations drive position.
  const anims = useRef<Animated.Value[]>([]);
  const chip = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (completed && !prev.current) {
      const list: Particle[] = Array.from({ length: 9 }, (_, i) => ({
        id: i,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        size: 4 + ((i * 7) % 3),
        angle: (i / 9) * 360 + ((i * 13) % 12),
        distance: 26 + ((i * 11) % 18),
        duration: 520 + ((i * 37) % 180),
        delay: (i % 3) * 30,
      }));
      anims.current = list.map(() => new Animated.Value(0));
      setParticles(list);

      anims.current.forEach((av, i) => {
        Animated.timing(av, {
          toValue: 1,
          duration: list[i].duration,
          delay: list[i].delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });

      // "+XP" chip: pop in, float up, fade out.
      chip.setValue(0);
      Animated.sequence([
        Animated.timing(chip, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(chip, { toValue: 0, duration: 520, delay: 90, useNativeDriver: true }),
      ]).start();

      const cleanup = setTimeout(() => setParticles(null), 850);
      return () => clearTimeout(cleanup);
    }
    prev.current = completed;
  }, [completed, chip]);

  if (!particles) return null;

  return (
    <View pointerEvents="none" style={styles.anchor}>
      {particles.map((p, i) => {
        const av = anims.current[i] ?? new Animated.Value(0);
        const deg = p.angle;
        const rad = (deg * Math.PI) / 180;
        return (
          <Animated.View
            key={p.id}
            style={[
              styles.particle,
              {
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                backgroundColor: p.color,
                opacity: av.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: av.interpolate({ inputRange: [0, 1], outputRange: [Math.cos(rad) * 6, Math.cos(rad) * p.distance] }) },
                  { translateY: av.interpolate({ inputRange: [0, 1], outputRange: [Math.sin(rad) * 6 - 4, Math.sin(rad) * p.distance - 30] }) },
                  { scale: av.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 0.9, 0.2] }) },
                  { rotate: av.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${deg > 180 ? -1 : 1}220deg`] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.View
        style={[
          styles.chip,
          {
            opacity: chip,
            transform: [
              { translateY: chip.interpolate({ inputRange: [0, 1], outputRange: [4, -26] }) },
              { scale: chip.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.6, 1.15, 1] }) },
            ],
          },
        ]}
      >
        <Text style={styles.chipText}>+XP ✨</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: ANCHOR.right,
    top: ANCHOR.top,
    width: 2,
    height: 2,
  },
  particle: {
    position: 'absolute',
    top: -3,
    left: -3,
  },
  chip: {
    position: 'absolute',
    top: 6,
    left: -26,
    backgroundColor: Colors.success,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    shadowColor: Colors.success,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  chipText: {
    color: '#04110C',
    fontSize: 11,
    fontWeight: '700',
  },
});
