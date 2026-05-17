import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getSvgIconSource, isSvgIcon } from '../../utils/svgIcons';

interface Props {
  icon: string;
  color: string;
  size?: number;
}

export function CategoryIcon({ icon, color, size = 22 }: Props) {
  const iconSize = size;

  if (isSvgIcon(icon)) {
    const source = getSvgIconSource(icon);
    if (source) {
      return (
        <View style={[svgStyles.wrapper, { width: iconSize, height: iconSize }]}>
          <Image source={source} style={{ width: iconSize, height: iconSize }} resizeMode="contain" />
        </View>
      );
    }
  }

  return (
    <MaterialIcons
      name={(icon || 'category') as any}
      size={iconSize}
      color="#fff"
    />
  );
}

const svgStyles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
