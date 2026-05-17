// Powered by OnSpace.AI
export const Colors = {
  background: '#0D0D0D',
  surface: '#1A1A1A',
  card: '#1E1E1E',
  cardBorder: '#2A2A2A',
  primary: '#2979FF',
  primaryDark: '#1565C0',
  success: '#4CAF50',
  danger: '#FF3B5C',
  warning: '#FF9500',

  textPrimary: '#FFFFFF',
  textSecondary: '#888888',
  textMuted: '#555555',
  textInverse: '#000000',

  // Category Colors
  categoryHealth: '#FF6B35',
  categoryStudy: '#FF3B5C',
  categoryWork: '#2979FF',
  categoryOther: '#9B59B6',
  categoryHome: '#2ECC71',

  // UI
  separator: '#2A2A2A',
  overlay: 'rgba(0,0,0,0.75)',
  chipBg: '#252525',
  chipSelected: '#2979FF',
  inputBg: '#252525',
  inputBorder: '#333333',

  // Progress
  progressBg: '#2A2A2A',
  progressFill: '#2979FF',

  // Today button
  todayPill: '#2979FF',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 28,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const CategoryConfig: Record<string, { color: string; label: string; icon: string }> = {
  Health: { color: Colors.categoryHealth, label: 'Health', icon: 'favorite' },
  Study: { color: Colors.categoryStudy, label: 'Study', icon: 'school' },
  Work: { color: Colors.categoryWork, label: 'Work', icon: 'work' },
  Other: { color: Colors.categoryOther, label: 'Other', icon: 'star' },
  Home: { color: Colors.categoryHome, label: 'Home', icon: 'home' },
};
