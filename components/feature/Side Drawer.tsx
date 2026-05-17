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
        Animated.timing(translateX, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
      setShowNewInput(false);
      setNewName('');
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
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
        {/* Day & Date */}
        <View style={styles.dateSection}>
          <Text style={styles.dayName}>{dayName}</Text>
          <Text style={styles.dateStr}>{dateStr}</Text>
        </View>

        <View style={styles.divider} />

        {/* Sections */}
        <Text style={styles.sectionTitle}>SECTIONS</Text>
        <View style={styles.sectionList}>
          {sections.map((sec) => {
            const active = sec.id === selectedSectionId;
            return (
              <Pressable
                key={sec.id}
                style={[styles.sectionItem, active && styles.sectionItemActive]}
                onPress={() => { onSelectSection(sec.id); onClose(); }}
              >
                <Text style={[styles.sectionName, active && styles.sectionNameActive]}>
                  {sec.name}
                </Text>
                {active && <View style={styles.activeDot} />}
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
              <MaterialIcons name="add" size={18} color={Colors.primary} />
              <Text style={styles.newSectionText}>New Section</Text>
            </Pressable>
          )}
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Settings */}
        <Pressable
          style={styles.settingsBtn}
          onPress={() => { onSettings(); onClose(); }}
        >
          <MaterialIcons name="settings" size={22} color={Colors.textSecondary} />
          <Text style={styles.settingsText}>Settings</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
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
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.separator,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  sectionList: {
    gap: 2,
  },
  sectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  sectionItemActive: {
    backgroundColor: 'rgba(41,121,255,0.12)',
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
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  newSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
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
  },
  newSectionInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  settingsText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});
