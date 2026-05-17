// Powered by OnSpace.AI
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

export type TabName = 'index' | 'habits' | 'tasks' | 'statistics';

interface TabItem {
  name: TabName;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { name: 'index', label: 'Today', icon: 'calendar-today' },
  { name: 'habits', label: 'Habits', icon: 'format-list-bulleted' },
  { name: 'tasks', label: 'AI', icon: 'smart-toy' },
  { name: 'statistics', label: 'Statistics', icon: 'bar-chart' },
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
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const colorAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1.08 : 1,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }),
      Animated.timing(colorAnim, {
        toValue: isActive ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isActive]);

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabBtn}
      hitSlop={4}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: scaleAnim }] }]}>
        <MaterialIcons
          name={tab.icon as any}
          size={22}
          color={isActive ? Colors.primary : '#666'}
        />
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

  const handleFabPressIn = () => {
    Animated.spring(fabScale, { toValue: 0.9, useNativeDriver: true, tension: 300 }).start();
  };
  const handleFabPressOut = () => {
    Animated.spring(fabScale, { toValue: 1, useNativeDriver: true, tension: 300 }).start();
  };

  const leftTabs = TABS.slice(0, 2);
  const rightTabs = TABS.slice(2, 4);

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom }]}>
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
            <Animated.View style={[styles.fab, { transform: [{ scale: fabScale }] }]}>
              <MaterialIcons name="add" size={32} color="#fff" />
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
    paddingBottom: 6,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 30,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
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
  },
  tabLabel: {
    fontSize: FontSize.xs,
    color: '#666',
    fontWeight: FontWeight.medium,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  fabSlot: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabOuter: {
    marginTop: -22,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 3,
    borderColor: '#1C1C1E',
  },
});
