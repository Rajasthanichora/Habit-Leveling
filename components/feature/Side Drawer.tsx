import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { Section } from '../../services/types';

const DRAWER_WIDTH = 280;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSettings: () => void;
  sections: Section[];
  selectedSectionId: string;
  onSelectSection: (id: string) => void;
  onAddSection: (name: string) => void;
  onDeleteSection: (id: string) => void;
}

function getTodayInfo() {
  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()];
  const dateStr = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  return { dayName, dateStr };
}

export function SideDrawer({ visible, onClose, onSettings, sections, selectedSectionId, onSelectSection, onAddSection, onDeleteSection }: Props) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');
  const { dayName, dateStr } = getTodayInfo();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
      setShowNewInput(false);
      setNewName('');
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, translateX, opacity]);

  if (!visible && (translateX as any)._value === -DRAWER_WIDTH) return null;

  const handleAddSection = () => {
    const name = newName.trim();
    if (name) {
      onAddSection(name);
      setNewName('');
      setShowNewInput(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          { transform: [{ translateX }], paddingTop: insets.top + Spacing.md },
        ]}
      >
        {/* Day & Date header */}
        <View style={styles.dateSection}>
          <Text style={styles.dayName}>{dayName}</Text>
          <Text style={styles.dateStr}>{dateStr}</Text>
        </View>

        <View style={styles.divider} />

        {/* Sections label */}
        <Text style={styles.sectionTitle}>SECTIONS</Text>
        <View style={styles.sectionList}>
          {sections.map((sec) => {
            const active = sec.id === selectedSectionId;
            return (
              <Pressable
                key={sec.id}
                style={({ pressed }) => [
                  styles.sectionItem,
                  active && styles.sectionItemActive,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { onSelectSection(sec.id); onClose(); }}
              >
                <View style={[styles.sectionDotIcon, active && { backgroundColor: Colors.primaryGlow }]}>
                  <View style={[styles.sectionDot, { backgroundColor: active ? Colors.primary : Colors.textMuted }]} />
                </View>
                <Text style={[styles.sectionName, active && styles.sectionNameActive]}>
                  {sec.name}
                </Text>
                {active && (
                  <MaterialIcons name="check" size={16} color={Colors.primary} />
                )}
              </Pressable>
            );
          })}

          {/* New section input */}
          {showNewInput ? (
            <View style={styles.newSectionRow}>
              <TextInput
                style={styles.newSectionInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Section name"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                onSubmitEditing={handleAddSection}
              />
              <Pressable onPress={handleAddSection} hitSlop={8}>
                <MaterialIcons name="check" size={20} color={Colors.primary} />
              </Pressable>
              <Pressable onPress={() => { setShowNewInput(false); setNewName(''); }} hitSlop={8}>
                <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.newSectionBtn}
              onPress={() => setShowNewInput(true)}
            >
              <View style={styles.addIconWrap}>
                <MaterialIcons name="add" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.newSectionText}>New Section</Text>
            </Pressable>
          )}
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Settings */}
        <Pressable
          style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
          onPress={() => { onSettings(); onClose(); }}
        >
          <View style={styles.settingsIcon}>
            <MaterialIcons name="settings" size={18} color={Colors.textSecondary} />
          </View>
          <Text style={styles.settingsText}>Settings</Text>
          <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Colors.surface,
    borderRightWidth: 0.5,
    borderRightColor: Colors.cardBorder,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  dateSection: {
    marginBottom: Spacing.lg,
  },
  dayName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  dateStr: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.separator,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.4,
    marginBottom: Spacing.sm,
  },
  sectionList: {
    gap: 2,
  },
  sectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  sectionItemActive: {
    backgroundColor: Colors.primaryGlow,
  },
  sectionDotIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  sectionNameActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  newSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    marginTop: 2,
  },
  addIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primaryGlow,
  },
  newSectionText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },
  newSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginTop: 4,
  },
  newSectionInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    borderRadius: Radius.md,
  },
  settingsIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  settingsText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});
