// Hero's Path 🗺️ — the Candy-Crush-style level roadmap.
// A winding road climbs from Level 1 to the horizon; every level below the
// player's current one glows as "cleared", the current node pulses with the
// player's portrait riding beside it, and locked levels sit in stone fog.
// Tap any node for its payoff sheet (XP worth, SP, title unlocks).
//
// Visual language matches the AMOLED neon theme: dark night realm, glowing
// emerald→amber trail, 3D candy buttons with extruded shadows.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import { avatarUrlForLevel, LEVEL_AVATAR_TIERS, tierForLevel } from '../../utils/levelAvatars';
import { xpForLevel } from '../../services/xpService';
import { SP_PER_LEVEL } from '../../services/gameRules';

// ─── Layout constants ────────────────────────────────────────────────────────

const MAX_LEVEL = 100;
const ROW_H = 118;
const PAD_TOP = 34;
const FOOTER_H = 148;
/** Horizontal swing of the path — center / right / center / left. */
const X_PATTERN = [0.5, 0.78, 0.5, 0.22];

type NodeStatus = 'cleared' | 'current' | 'locked';

interface Pt { x: number; y: number }

function nodeStatus(level: number, current: number): NodeStatus {
  if (level < current) return 'cleared';
  if (level === current) return 'current';
  return 'locked';
}

function nodeSize(level: number): number {
  if (level % 10 === 0) return 92; // crown towers
  if (level % 5 === 0) return 78;  // chest camps
  return 64;
}

/** Center coordinates of every node, sized to the window. */
function buildCenters(mapW: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 1; i <= MAX_LEVEL; i++) {
    const t = X_PATTERN[(i - 1) % X_PATTERN.length];
    const s = nodeSize(i);
    const x = Math.min(mapW - s / 2 - 10, Math.max(s / 2 + 10, mapW * t));
    const y = PAD_TOP + (i - 1) * ROW_H + ROW_H / 2;
    pts.push({ x, y });
  }
  return pts;
}

/** Catmull-Rom spline converted to cubic beziers — the smooth candy road. */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Fixed scatter of forest props so the realm feels lived-in. */
const DECOR: { e: string; top: number; left: number; size: number; opacity: number }[] = [
  { e: '🌲', top: 60, left: 6, size: 34, opacity: 0.5 },
  { e: '✨', top: 130, left: 62, size: 16, opacity: 0.35 },
  { e: '🌲', top: 300, left: 76, size: 36, opacity: 0.42 },
  { e: '🪨', top: 420, left: 8, size: 26, opacity: 0.4 },
  { e: '🌿', top: 610, left: 70, size: 22, opacity: 0.35 },
  { e: '🌲', top: 760, left: 4, size: 40, opacity: 0.45 },
  { e: '🌙', top: 150, left: 84, size: 20, opacity: 0.22 },
  { e: '✨', top: 940, left: 10, size: 16, opacity: 0.3 },
  { e: '🌲', top: 1120, left: 74, size: 34, opacity: 0.4 },
  { e: '🪨', top: 1310, left: 12, size: 28, opacity: 0.38 },
  { e: '🌿', top: 1520, left: 78, size: 24, opacity: 0.3 },
  { e: '🌲', top: 1740, left: 6, size: 38, opacity: 0.42 },
  { e: '✨', top: 1980, left: 70, size: 15, opacity: 0.28 },
  { e: '🌲', top: 2260, left: 78, size: 36, opacity: 0.4 },
  { e: '🪨', top: 2500, left: 8, size: 26, opacity: 0.36 },
  { e: '🌲', top: 2760, left: 6, size: 34, opacity: 0.4 },
  { e: '✨', top: 3020, left: 66, size: 16, opacity: 0.26 },
  { e: '🌲', top: 3300, left: 76, size: 34, opacity: 0.4 },
  { e: '🪨', top: 3560, left: 8, size: 28, opacity: 0.36 },
  { e: '🌿', top: 3820, left: 10, size: 24, opacity: 0.3 },
  { e: '✨', top: 4120, left: 72, size: 15, opacity: 0.26 },
  { e: '🌲', top: 4440, left: 4, size: 36, opacity: 0.4 },
  { e: '🪨', top: 4760, left: 78, size: 26, opacity: 0.34 },
  { e: '✨', top: 5080, left: 12, size: 16, opacity: 0.24 },
  { e: '🌲', top: 5400, left: 72, size: 38, opacity: 0.38 },
  { e: '🌿', top: 5700, left: 8, size: 22, opacity: 0.28 },
  { e: '✨', top: 6020, left: 68, size: 15, opacity: 0.22 },
  { e: '🌲', top: 6400, left: 6, size: 36, opacity: 0.36 },
  { e: '🪨', top: 6780, left: 78, size: 28, opacity: 0.32 },
  { e: '✨', top: 7140, left: 10, size: 16, opacity: 0.22 },
  { e: '🌲', top: 7540, left: 74, size: 36, opacity: 0.36 },
  { e: '🌿', top: 7940, left: 6, size: 24, opacity: 0.26 },
  { e: '✨', top: 8340, left: 70, size: 15, opacity: 0.2 },
  { e: '🌲', top: 8800, left: 4, size: 36, opacity: 0.34 },
  { e: '🪨', top: 9240, left: 78, size: 28, opacity: 0.3 },
  { e: '✨', top: 9700, left: 68, size: 15, opacity: 0.2 },
  { e: '🌲', top: 10180, left: 8, size: 34, opacity: 0.32 },
  { e: '✨', top: 10640, left: 72, size: 14, opacity: 0.2 },
  { e: '🌿', top: 11100, left: 6, size: 22, opacity: 0.24 },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function RoadmapScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { levelInfo, xpTotal } = useHabits();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const viewHRef = useRef(0);
  const contentHRef = useRef(0);
  const jumpedRef = useRef(false);

  const [selected, setSelected] = useState<number | null>(null);
  const cur = levelInfo.level;
  // Cumulative XP checkpoints per level (for sheet info). Index MAX_LEVEL+1
  // keeps the final accumulator — a cleared level MAX_LEVEL sheet reads
  // xps[level + 1] and must show the XP total through that level, not the
  // XP needed to reach it.
  const xps = useMemo(() => {
    const starts: number[] = [0, 0]; // index 1 = level 1 start = 0
    let acc = 0;
    for (let i = 1; i <= MAX_LEVEL; i++) {
      starts[i] = acc;
      acc += xpForLevel(i);
    }
    starts[MAX_LEVEL + 1] = acc;
    return starts;
  }, []);

  const mapW = Math.max(320, winW);
  const totalH = PAD_TOP + MAX_LEVEL * ROW_H + FOOTER_H;
  const centers = useMemo(() => buildCenters(mapW), [mapW]);
  const curTier = tierForLevel(Math.min(cur, MAX_LEVEL));

  const fullRoad = useMemo(() => smoothPath(centers), [centers]);
  const clearedRoad = useMemo(() => smoothPath(centers.slice(0, Math.min(cur, MAX_LEVEL))), [centers, cur]);
  const clearTopY = centers[Math.max(0, Math.min(cur, MAX_LEVEL) - 1)].y;
  const clearBotY = centers[0].y + 40;

  // One-shot auto-scroll: land the current level ~55% down the viewport.
  // Both content-size and viewport can arrive in either order, so the jump
  // fires the moment BOTH are known.
  const maybeJump = useCallback(() => {
    if (jumpedRef.current || viewHRef.current <= 0 || contentHRef.current <= 0) return;
    jumpedRef.current = true;
    const y = Math.max(0, PAD_TOP + (cur - 1) * ROW_H + ROW_H / 2 - viewHRef.current * 0.55);
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [cur]);

  const onContent = useCallback((_: number, h: number) => {
    contentHRef.current = h;
    maybeJump();
  }, [maybeJump]);

  const backToHere = useCallback(() => {
    const y = Math.max(0, PAD_TOP + (cur - 1) * ROW_H + ROW_H / 2 - viewHRef.current * 0.5);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [cur]);

  const openSheet = useCallback((lv: number) => {
    setSelected(lv);
  }, []);

  return (
    <View style={styles.screen}>
      {/* Night realm backdrop */}
      <LinearGradient
        colors={['#05070F', '#0A1024', '#05070F']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.glowOrb, { backgroundColor: `${curTier.accent}14`, top: -60, right: -70, width: 220, height: 220 }]} />
      <View pointerEvents="none" style={[styles.glowOrb, { backgroundColor: 'rgba(45,212,191,0.08)', bottom: 120, left: -80, width: 240, height: 240 }]} />

      {/* ── Header ── */}
      <LinearGradient colors={['#05070F', 'rgba(5,7,15,0.85)', 'transparent']} locations={[0, 0.7, 1]} style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Text style={styles.headerIconEmoji}>🗺️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{'Hero’s Path'}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {levelInfo.title} · Level {levelInfo.level}
            </Text>
          </View>
          <View style={[styles.headerChip, { borderColor: `${curTier.accent}66` }]}>
            <Text style={[styles.headerChipLabel, { color: curTier.accent }]}>LV {levelInfo.level}</Text>
          </View>
        </View>
        <View style={styles.xpRow}>
          <MaterialIcons name="bolt" size={13} color={Colors.warning} />
          <Text style={styles.xpRowText}>{xpTotal.toLocaleString()} XP banked</Text>
          <View style={styles.xpDivider} />
          <MaterialIcons name="emoji-events" size={13} color={Colors.success} />
          <Text style={styles.xpRowText}>+{SP_PER_LEVEL} SP per level</Text>
        </View>
      </LinearGradient>

      {/* ── The map ── */}
      <View
        style={styles.mapArea}
        onLayout={(e) => {
          viewHRef.current = e.nativeEvent.layout.height;
          maybeJump();
        }}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={onContent}
          contentContainerStyle={{ width: mapW, height: totalH }}
        >
          <View style={{ width: mapW, height: totalH }}>
            {/* road SVG — behind everything */}
            <Svg width={mapW} height={totalH} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <SvgGradient id="clearedGrad" gradientUnits="userSpaceOnUse" x1="0" y1={clearTopY} x2="0" y2={clearBotY}>
                  <Stop offset="0" stopColor={curTier.accent} stopOpacity="0.95" />
                  <Stop offset="1" stopColor="#14B8A6" stopOpacity="0.9" />
                </SvgGradient>
              </Defs>
              {/* base road (dormant stone) */}
              <Path d={fullRoad} stroke="#1C2233" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <Path d={fullRoad} stroke="#252D42" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {/* cleared glow: halo + gradient ribbon + dotted pearls */}
              <Path d={clearedRoad} stroke="url(#clearedGrad)" strokeWidth={46} strokeOpacity={0.16} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <Path d={clearedRoad} stroke="url(#clearedGrad)" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <Path d={clearedRoad} stroke="#05221B" strokeWidth={12} strokeOpacity={0.22} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <Path
                d={clearedRoad}
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="0.1 15"
                fill="none"
              />
            </Svg>

            {/* forest props */}
            {DECOR.map((d, i) => (
              <Text
                key={`dec_${i}`}
                style={{ position: 'absolute', top: d.top, left: mapW * d.left - d.size / 2, fontSize: d.size, opacity: d.opacity }}
                pointerEvents="none"
              >
                {d.e}
              </Text>
            ))}

            {/* tier zone ribbons */}
            {LEVEL_AVATAR_TIERS.slice(1).map((t) => {
              const row = t.min;
              if (row > MAX_LEVEL) return null;
              const cx = centers[row - 1].x;
              const nodeOnLeft = cx < mapW / 2;
              return (
                <View
                  key={`gate_${t.key}`}
                  pointerEvents="none"
                  style={[styles.zoneRibbon, { top: PAD_TOP + (row - 1) * ROW_H + ROW_H / 2 - 15 }]}
                >
                  <View style={{ flex: 1, alignItems: nodeOnLeft ? 'flex-end' : 'flex-start', paddingHorizontal: 14 }}>
                    <View style={[styles.zonePill, { borderColor: `${t.accent}55`, backgroundColor: `${t.accent}14`, shadowColor: t.accent }]}>
                      <Text style={[styles.zoneText, { color: t.accent }]}>{t.label.toUpperCase()} ZONE</Text>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* nodes */}
            {Array.from({ length: MAX_LEVEL }, (_, idx) => idx + 1).map((lv) => {
              const c = centers[lv - 1];
              return (
                <MapNode
                  key={`nd_${lv}`}
                  level={lv}
                  status={nodeStatus(lv, Math.min(cur, MAX_LEVEL + 1))}
                  center={c}
                  size={nodeSize(lv)}
                  accent={curTier.accent}
                  progress={levelInfo.progress}
                  onPress={openSheet}
                />
              );
            })}

            {/* the hero riding beside the current node */}
            {cur <= MAX_LEVEL && (
              <HeroBubble
                nodeCenter={centers[cur - 1]}
                nodeSize={nodeSize(cur)}
                mapW={mapW}
                accent={curTier.accent}
                level={Math.min(cur, MAX_LEVEL)}
              />
            )}

            {/* summit */}
            <LinearGradient
              colors={['transparent', 'rgba(5,7,15,0.9)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              pointerEvents="none"
              style={[styles.summitMist, { top: PAD_TOP + MAX_LEVEL * ROW_H - 60 }]}
            />
            <View style={[styles.summit, { top: PAD_TOP + MAX_LEVEL * ROW_H + 30 }]}>
              <Text style={styles.summitEmoji}>🏔️</Text>
              <Text style={styles.summitTitle}>THE SUMMIT</Text>
              <Text style={styles.summitSub}>Zones beyond Level {MAX_LEVEL} are under construction…</Text>
            </View>
          </View>
        </ScrollView>

        {/* floating locator — parked above the tab bar */}
        <Pressable style={[styles.locator, { bottom: 92 + insets.bottom / 2 }]} onPress={backToHere} hitSlop={6}>
          <MaterialIcons name="my-location" size={14} color={Colors.background} />
          <Text style={styles.locatorText}>You are here</Text>
        </Pressable>
      </View>

      {/* ── Node detail sheet ── */}
      <LevelSheet
        level={selected}
        status={selected != null ? nodeStatus(selected, Math.min(cur, MAX_LEVEL + 1)) : 'locked'}
        accent={selected != null ? tierForLevel(selected).accent : Colors.primary}
        xps={xps}
        progress={levelInfo.progress}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

// ─── Candy node ──────────────────────────────────────────────────────────────

interface MapNodeProps {
  level: number;
  status: NodeStatus;
  center: Pt;
  size: number;
  accent: string;
  /** Live progress (0..1) of the player's current level — drives star fill. */
  progress: number;
  onPress: (lv: number) => void;
}

function MapNode({ level, status, center, size, accent, progress, onPress }: MapNodeProps) {
  const isCrown = level % 10 === 0;
  const isChest = level % 5 === 0 && !isCrown;

  // Idle bob for the current node — it breathes on the map.
  const bob = useRef(new Animated.Value(0)).current;
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status !== 'current') return;
    const loops = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.timing(ringA, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true })
      ),
      Animated.loop(
        Animated.timing(ringB, { toValue: 1, duration: 1800, delay: 700, easing: Easing.out(Easing.quad), useNativeDriver: true })
      ),
    ]);
    loops.start();
    return () => loops.stop();
  }, [status, bob, ringA, ringB]);

  const s = size;
  const left = center.x - s / 2;
  const top = center.y - (s + 5) / 2;

  const grad: [string, string] =
    status === 'cleared'
      ? isCrown ? ['#C4B5FD', '#7C3AED'] : isChest ? ['#67E8F9', '#0891B2'] : ['#34D399', '#0B8A5C']
      : status === 'current'
        ? ['#FFD75E', '#F59E0B']
        : isCrown ? ['#4A4F66', '#262A38'] : ['#3A4053', '#20242F'];
  const extrude = status === 'cleared' ? (isCrown ? '#2E1A5E' : isChest ? '#065E72' : '#054434') : status === 'current' ? '#7C4A03' : '#12151D';

  return (
    <View style={{ position: 'absolute', left, top, width: s, height: s + 5 }}>
      {/* pulse rings (current only) */}
      {status === 'current' && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, {
              borderColor: `${accent}88`,
              transform: [{ scale: ringA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) }],
              opacity: ringA.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, {
              borderColor: `${accent}66`,
              transform: [{ scale: ringB.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
              opacity: ringB.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            }]}
          />
        </>
      )}

      <Animated.View style={{ flex: 1, transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }}>
        {/* 3D extruded base */}
        <View style={[styles.extrude, { top: 5, borderRadius: s * 0.32, backgroundColor: extrude }]} />

        {/* candy face */}
        <Pressable
          onPress={() => onPress(level)}
          style={({ pressed }) => [styles.face, {
            height: s,
            borderRadius: s * 0.32,
            borderWidth: status === 'locked' ? 1 : 1.5,
            borderColor: status === 'locked' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.28)',
            opacity: pressed ? 0.85 : 1,
          }]}
          android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: false, radius: s / 2 }}
          accessibilityLabel={`Level ${level}`}
        >
          <LinearGradient colors={grad} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
          {/* top gloss */}
          <View pointerEvents="none" style={[styles.gloss, { height: s * 0.42, borderTopLeftRadius: s * 0.3, borderTopRightRadius: s * 0.3 }]} />

          {/* content */}
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }} pointerEvents="none">
            {status === 'locked' ? (
              <>
                <MaterialIcons name={isCrown ? 'lock' : 'lock'} size={Math.max(16, s * 0.26)} color="#6E748C" />
                <Text style={[styles.lockNum, { fontSize: Math.max(12, s * 0.2) }]}>{level}</Text>
              </>
            ) : (
              <Text style={[styles.numText, { fontSize: Math.min(30, s * 0.4), textShadowColor: 'rgba(0,0,0,0.35)' }]}>
                {level}
              </Text>
            )}
          </View>

          {/* milestone glyphs */}
          {(isCrown || isChest) && (
            <View pointerEvents="none" style={styles.milestoneChip}>
              <Text style={{ fontSize: 11 }}>{isCrown ? '👑' : '🎁'}</Text>
            </View>
          )}
          {status === 'current' && (
            <View pointerEvents="none" style={[styles.youChip, { backgroundColor: '#7C4A03', top: -8 }]}>
              <Text style={styles.youText}>YOU</Text>
            </View>
          )}
        </Pressable>

        {/* star row */}
        <View pointerEvents="none" style={[styles.starRow, { top: s - 3 }]}>
          {[0, 1, 2].map((k) => {
            const filled =
              status === 'cleared' ? true
                : status === 'current' ? Math.floor(progress * 3) > k
                  : false;
            return (
              <MaterialIcons
                key={k}
                name="star"
                size={11}
                color={filled ? '#FFC542' : 'rgba(255,255,255,0.18)'}
              />
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Hero bubble (portrait riding the path) ─────────────────────────────────

interface HeroBubbleProps {
  nodeCenter: Pt;
  nodeSize: number;
  mapW: number;
  accent: string;
  level: number;
}

function HeroBubble({ nodeCenter, nodeSize, mapW, accent, level }: HeroBubbleProps) {
  const { levelInfo } = useHabits();
  const url = avatarUrlForLevel(levelInfo.level, 128);
  const tier = tierForLevel(level);
  const [failed, setFailed] = useState(false);
  const hop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hop]);

  const BUB = 52;
  const onRightSide = nodeCenter.x > mapW / 2;
  const left = onRightSide ? nodeCenter.x - nodeSize / 2 - 14 - BUB : nodeCenter.x + nodeSize / 2 + 14;
  const top = nodeCenter.y - BUB / 2 - 14;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width: BUB,
        height: BUB,
        transform: [{ translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
      }}
    >
      {/* soft ground shadow */}
      <View style={[styles.heroShadow]} />
      <View
        style={[
          styles.heroRing,
          { borderColor: accent, shadowColor: accent },
        ]}
      >
        {failed ? (
          <View style={[styles.heroFallback, { backgroundColor: `${accent}22` }]}>
            <Text style={{ fontSize: 22 }}>{tier.fallbackEmoji}</Text>
          </View>
        ) : (
          <ExpoImage
            source={{ uri: url }}
            style={styles.heroImg}
            contentFit="cover"
            recyclingKey={`road_${tier.key}`}
            onError={() => setFailed(true)}
          />
        )}
      </View>
      {/* speech nib */}
      <View style={[styles.heroNib, onRightSide ? { right: 8 } : { left: 8 }]} />
    </Animated.View>
  );
}

// ─── Level detail sheet ──────────────────────────────────────────────────────

interface SheetProps {
  level: number | null;
  status: NodeStatus;
  accent: string;
  xps: number[];
  progress: number;
  onClose: () => void;
}

function LevelSheet({ level, status, accent, xps, progress, onClose }: SheetProps) {
  if (level == null) return null;
  const tier = tierForLevel(level);
  const worth = xpForLevel(level);
  const isBandStart = LEVEL_AVATAR_TIERS.some((t) => t.min === level && t.min > 1);
  const statusMeta: Record<NodeStatus, { label: string; color: string; icon: string }> = {
    cleared: { label: 'Cleared ✓', color: Colors.success, icon: 'check-circle' },
    current: { label: 'You are here', color: accent, icon: 'my-location' },
    locked: { label: 'Locked', color: Colors.textSecondary, icon: 'lock' },
  };
  const meta = statusMeta[status];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <LinearGradient colors={['#11151F', '#0B0E15']} style={StyleSheet.absoluteFill} />
          <View style={styles.sheetGrip} />

          <View style={styles.sheetHead}>
            <Text style={styles.sheetLevel}>LEVEL {level}</Text>
            <View style={[styles.sheetStatus, { borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14` }]}>
              <MaterialIcons name={meta.icon as any} size={12} color={meta.color} />
              <Text style={[styles.sheetStatusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>

          <View style={styles.tierRow}>
            <View style={[styles.tierDot, { backgroundColor: `${tier.accent}26`, borderColor: `${tier.accent}88` }]}>
              <Text style={{ fontSize: 15 }}>{tier.fallbackEmoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tierName}>{tier.label}</Text>
              <Text style={styles.tierMotto} numberOfLines={1}>{tier.motto}</Text>
            </View>
          </View>

          {status === 'current' && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(progress > 0 ? 4 : 0, Math.round(progress * 100))}%`, backgroundColor: accent }]} />
              </View>
              <Text style={styles.progressPct}>{Math.round(progress * 100)}% · keep raiding</Text>
            </View>
          )}

          <View style={styles.payRows}>
            <View style={styles.payRow}>
              <MaterialIcons name="bolt" size={14} color={Colors.warning} />
              <Text style={styles.payText}>Clears for <Text style={styles.payStrong}>+{worth.toLocaleString()} XP</Text></Text>
            </View>
            <View style={styles.payRow}>
              <MaterialIcons name="stars" size={14} color={Colors.success} />
              <Text style={styles.payText}>Grants <Text style={styles.payStrong}>+{SP_PER_LEVEL} SP</Text> for skills</Text>
            </View>
            {isBandStart && (
              <View style={styles.payRow}>
                <MaterialIcons name="emoji-events" size={14} color={accent} />
                <Text style={styles.payText}>Unlocks the <Text style={[styles.payStrong, { color: accent }]}>{tier.label}</Text> title zone</Text>
              </View>
            )}
            {status === 'cleared' && (
              <View style={styles.payRow}>
                <MaterialIcons name="verified" size={14} color={Colors.success} />
                <Text style={styles.payText}>Crossed this level at <Text style={styles.payStrong}>{(xps[level + 1] ?? 0).toLocaleString()} XP</Text> total</Text>
              </View>
            )}
          </View>

          <Pressable style={[styles.sheetBtn, { backgroundColor: accent }]} onPress={onClose}>
            <Text style={styles.sheetBtnText}>{status === 'locked' ? 'Keep climbing 🧗' : 'Onward ⚔️'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  glowOrb: { position: 'absolute', borderRadius: 999 },

  headerWrap: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 14,
    zIndex: 5,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconEmoji: { fontSize: 20 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  headerChip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  headerChipLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  xpRowText: { fontSize: 11, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  xpDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.textMuted, marginHorizontal: 4 },

  mapArea: { flex: 1, overflow: 'hidden' },

  zoneRibbon: { position: 'absolute', left: 0, right: 0, height: 30, justifyContent: 'center' },
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  zoneText: { fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1.6 },

  extrude: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  ring: {
    position: 'absolute',
    left: -6,
    right: -6,
    top: -6,
    bottom: -11,
    borderWidth: 2,
    borderRadius: 999,
  },
  numText: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  lockNum: { color: '#6E748C', fontWeight: FontWeight.bold, marginTop: 1 },
  milestoneChip: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#101420',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  youChip: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  youText: { color: '#FFE9B8', fontSize: 8.5, fontWeight: FontWeight.bold, letterSpacing: 1 },

  starRow: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 1,
    backgroundColor: 'rgba(5,8,14,0.66)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  summit: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 4 },
  summitMist: { position: 'absolute', left: 0, right: 0, height: 130 },
  summitEmoji: { fontSize: 40, opacity: 0.85 },
  summitTitle: { color: Colors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 2.4 },
  summitSub: { color: Colors.textMuted, fontSize: 11 },

  heroShadow: {
    position: 'absolute',
    bottom: 2,
    left: 8,
    right: 8,
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  heroRing: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 2.5,
    padding: 2,
    backgroundColor: '#0B0F1A',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    overflow: 'hidden',
  },
  heroImg: { flex: 1, borderRadius: 999 },
  heroFallback: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  heroNib: {
    position: 'absolute',
    bottom: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0B0F1A',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },

  locator: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 13,
    paddingVertical: 9,
    shadowColor: Colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  locatorText: { color: '#fff', fontSize: 11, fontWeight: FontWeight.bold },

  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    overflow: 'hidden',
  },
  sheetGrip: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetLevel: { fontSize: 20, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: 0.5 },
  sheetStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  sheetStatusText: { fontSize: 10, fontWeight: FontWeight.bold },

  tierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 12 },
  tierDot: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tierName: { color: Colors.textPrimary, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  tierMotto: { color: Colors.textSecondary, fontSize: 11, marginTop: 1, fontStyle: 'italic' },

  progressWrap: { marginBottom: 12, gap: 4 },
  progressTrack: { height: 8, borderRadius: Radius.full, backgroundColor: Colors.progressBg, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: Radius.full },
  progressPct: { fontSize: 10, color: Colors.textSecondary },

  payRows: { gap: 8, marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payText: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1 },
  payStrong: { color: Colors.textPrimary, fontWeight: FontWeight.bold },

  sheetBtn: { borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' },
  sheetBtnText: { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },
});
