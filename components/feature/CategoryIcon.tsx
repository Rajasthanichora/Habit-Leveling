import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { SVG_ICON_COMPONENTS, isSvgIcon } from '../../utils/svgIcons';

interface Props {
  icon: string;
  color: string;
  size?: number;
}

export function CategoryIcon({ icon, color, size = 22 }: Props) {
  if (isSvgIcon(icon)) {
    const SvgComponent = SVG_ICON_COMPONENTS[icon];
    if (SvgComponent) {
      return (
        <SvgComponent width={size} height={size} color={color} fill={color} />
      );
    }
  }

  return (
    <MaterialIcons
      name={(icon || 'category') as any}
      size={size}
      color={color}
    />
  );
}
