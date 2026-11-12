// Powered by OnSpace.AI
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

interface Props {
  checked: boolean;
  onToggle: () => void;
  size?: number;
}

export function Checkbox({ checked, onToggle, size = 28 }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        checked && styles.checked,
        pressed && styles.pressed,
      ]}
      accessibilityLabel={checked ? 'Mark incomplete' : 'Mark complete'}
    >
      {checked && (
        <MaterialIcons name="check" size={size * 0.6} color="#fff" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 2,
    borderColor: Colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  pressed: {
    opacity: 0.7,
  },
});
