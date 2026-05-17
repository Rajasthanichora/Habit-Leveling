// Powered by OnSpace.AI
export const Colors = {
  // ── Core Backgrounds (AMOLED hierarchy) ──────────────────────────
  background: '#000000',       // True AMOLED black
  surface: '#0E0E0F',          // Elevated surface (cards, drawers)
  card: '#141415',             // Card background
  cardElevated: '#1A1A1C',     // Higher-elevation card
  cardBorder: 'rgba(255,255,255,0.07)', // Crisp subtle border

  // ── Primary Accent ───────────────────────────────────────────────
  primary: '#4E8EFF',          // Vibrant but refined blue
  primaryDark: '#2B6AE0',      // Pressed / darker state
  primaryGlow: 'rgba(78,142,255,0.18)', // Subtle glow / active bg

  // ── Semantic Colors ──────────────────────────────────────────────
  success: '#34D399',          // Emerald green — completed
  danger: '#F87171',           // Soft red — failed / delete
  warning: '#FBBF24',          // Amber — missed / warning

  // ── Text ─────────────────────────────────────────────────────────
  textPrimary: '#F0F0F2',      // Near-white, reduced harshness
  textSecondary: '#7A7A85',    // Muted labels
  textMuted: '#3E3E46',        // Very muted / disabled
  textInverse: '#000000',

  // ── Category Accents ─────────────────────────────────────────────
  categoryHealth: '#FF6B6B',
  categoryStudy: '#A78BFA',
  categoryWork: '#4E8EFF',
  categoryOther: '#34D399',
  categoryHome: '#FB923C',

  // ── UI Chrome ────────────────────────────────────────────────────
  separator: 'rgba(255,255,255,0.06)',
  overlay: 'rgba(0,0,0,0.82)',
  chipBg: '#141415',
  chipSelected: '#4E8EFF',
  inputBg: '#0E0E0F',
  inputBorder: 'rgba(255,255,255,0.09)',
  inputBorderFocus: 'rgba(78,142,255,0.5)',

  // ── Progress ─────────────────────────────────────────────────────
  progressBg: 'rgba(255,255,255,0.07)',
  progressFill: '#4E8EFF',

  // ── Tab Bar ──────────────────────────────────────────────────────
  tabBar: '#0A0A0B',
  tabBarBorder: 'rgba(255,255,255,0.06)',
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
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 26,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
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
