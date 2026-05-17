// Powered by OnSpace.AI
import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

interface Props {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  style?: object;
}

export function PillButton({ label, onPress, icon, trailingIcon, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed, style]}
    >
      {icon && <View style={{ marginRight: Spacing.xs }}>{icon}</View>}
      <Text style={styles.label}>{label}</Text>
      {trailingIcon && <View style={{ marginLeft: Spacing.xs }}>{trailingIcon}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  pressed: { opacity: 0.8 },
  label: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
});
