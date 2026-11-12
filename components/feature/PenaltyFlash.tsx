// Penalty/Flash juice — globally mounted overlay (root layout). When the
// game bus announces a penalty or a habit collapse, a red vignette breathes
// in-out and a damage wave sweeps across the screen. pointerEvents="none" so
// gameplay is never blocked; zero cost while idle.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet } from 'react-native';
import { subscribeGameEvents } from '../../services/xpService';

const { width: W } = Dimensions.get('window');

export function PenaltyFlash() {
  const [flash, setFlash] = useState(0);
  const vignette = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return subscribeGameEvents((event) => {
      if (event.type !== 'penalty' && event.type !== 'collapse') return;
      setFlash((f) => f + 1);
    });
  }, []);

  useEffect(() => {
    if (flash === 0) return;
    vignette.setValue(0);
    wave.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(vignette, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(vignette, { toValue: 0, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(wave, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [flash, vignette, wave]);

  if (flash === 0) return null;

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Static red vignette pulse */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderWidth: 12,
            borderColor: 'rgba(248,113,113,0.4)',
            backgroundColor: 'rgba(248,113,113,0.05)',
            opacity: vignette,
          },
        ]}
      />
      {/* Diagonal damage wave sweeping through */}
      <Animated.View
        style={[
          styles.wave,
          {
            opacity: wave.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.85, 0] }),
            transform: [
              { translateX: wave.interpolate({ inputRange: [0, 1], outputRange: [-W * 0.6, W * 1.05] }) },
              { rotate: '-10deg' },
              { skewX: '8deg' },
            ],
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wave: {
    position: 'absolute',
    top: '-20%',
    bottom: '-20%',
    left: 0,
    width: W * 0.55,
    backgroundColor: 'rgba(248,113,113,0.10)',
  },
});
