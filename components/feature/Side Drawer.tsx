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
            const isDefault = sec.id === 'default';
            return (
              <View key={sec.id} style={styles.sectionItemRow}>
                <Pressable
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
                {!isDefault && (
                  <Pressable
                    style={styles.sectionDeleteBtn}
                    onPress={() => onDeleteSection(sec.id)}
                    hitSlop={8}
                  >
                    <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
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
    backgroundColor: 'rgba(0,0,0,0.82)',
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
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  dateSection: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  dayName: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  dateStr: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: FontWeight.medium,
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.separator,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.6,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  sectionList: {
    gap: 4,
  },
  sectionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    gap: Spacing.md,
  },
  sectionDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  sectionItemActive: {
    backgroundColor: Colors.primaryGlow,
  },
  sectionDotIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    gap: Spacing.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    marginTop: 4,
    borderRadius: Radius.sm,
  },
  addIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primaryGlow,
    borderWidth: 0.5,
    borderColor: Colors.primary,
  },
  newSectionText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  newSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: 6,
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  newSectionInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    borderRadius: Radius.sm,
  },
  settingsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
