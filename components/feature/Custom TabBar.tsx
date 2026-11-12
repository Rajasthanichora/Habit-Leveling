// Powered by OnSpace.AI
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

export type TabName = 'index' | 'hq' | 'roadmap' | 'statistics';

interface TabItem {
  name: TabName;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { name: 'index', label: 'Today', icon: 'calendar-today' },
  { name: 'hq', label: 'HQ', icon: 'videogame-asset' },
  { name: 'roadmap', label: 'Roadmap', icon: 'map' },
  { name: 'statistics', label: 'Stats', icon: 'bar-chart' },
];

interface Props {
  activeTab: string;
  onTabPress: (tab: TabName) => void;
  onAddPress: () => void;
}

function TabButton({
  tab,
  isActive,
  onPress,
}: {
  tab: TabItem;
  isActive: boolean;
  onPress: (tab: TabName) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1.06 : 1,
        useNativeDriver: true,
        tension: 280,
        friction: 22,
      }),
      Animated.timing(opacityAnim, {
        toValue: isActive ? 1 : 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isActive, scaleAnim, opacityAnim]);

  // Tap feedback: quick squish then settle — tactile "press" without stealing
  // the activation spring above (they compose on the same value).
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.86, duration: 70, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: isActive ? 1.06 : 1, useNativeDriver: true, friction: 5, tension: 240 }),
    ]).start();
    onPress(tab.name);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.tabBtn}
      hitSlop={4}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: scaleAnim }] }]}>
        <View style={[styles.iconPill, isActive && styles.iconPillActive]}>
          {isActive && (
            <LinearGradient
              colors={[Colors.primary, '#2E63C9']}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={styles.iconPillGrad}
            />
          )}
          <MaterialIcons
            name={tab.icon as any}
            size={20}
            color={isActive ? '#FFFFFF' : Colors.textMuted}
          />
        </View>
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function CustomTabBar({ activeTab, onTabPress, onAddPress }: Props) {
  const insets = useSafeAreaInsets();
  const fabScale = useRef(new Animated.Value(1)).current;
  // Idle breathing — the FAB never sits still: a slow 1→1.05 scale loop draws
  // the eye without stealing focus. Composed with (not competing with) the
  // press squish on the inner view.
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const handleFabPressIn = () => {
    Animated.spring(fabScale, { toValue: 0.88, useNativeDriver: true, tension: 300 }).start();
  };
  const handleFabPressOut = () => {
    Animated.spring(fabScale, { toValue: 1, useNativeDriver: true, tension: 260 }).start();
  };

  // Layout: [Today · HQ]  FAB  [Roadmap · Stats] — the map sits exactly to
  // the left of Stats, and both sides of the FAB stay symmetric.
  const leftTabs = TABS.slice(0, 2);
  const rightTabs = TABS.slice(2, 4);

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View style={styles.bar}>
        {/* Left tabs */}
        <View style={styles.tabGroup}>
          {leftTabs.map((tab) => (
            <TabButton
              key={tab.name}
              tab={tab}
              isActive={activeTab === tab.name}
              onPress={() => onTabPress(tab.name)}
            />
          ))}
        </View>

        {/* Center FAB */}
        <View style={styles.fabSlot}>
          <Pressable
            onPress={onAddPress}
            onPressIn={handleFabPressIn}
            onPressOut={handleFabPressOut}
            style={styles.fabOuter}
            accessibilityLabel="Add habit"
          >
            <Animated.View style={{ transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] }}>
              <Animated.View style={[styles.fab, { transform: [{ scale: fabScale }] }]}>
                <MaterialIcons name="add" size={28} color="#fff" />
              </Animated.View>
            </Animated.View>
          </Pressable>
        </View>

        {/* Right tabs */}
        <View style={styles.tabGroup}>
          {rightTabs.map((tab) => (
            <TabButton
              key={tab.name}
              tab={tab}
              isActive={activeTab === tab.name}
              onPress={() => onTabPress(tab.name)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
    paddingBottom: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.tabBar,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.tabBarBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    gap: 3,
    position: 'relative',
  },
  iconPill: {
    width: 46,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconPillActive: {
    shadowColor: Colors.primary,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  iconPillGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  tabLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  fabSlot: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabOuter: {
    marginTop: -20,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 2,
    borderColor: Colors.tabBar,
  },
});
