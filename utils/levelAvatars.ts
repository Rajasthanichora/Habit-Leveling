// ─── Level avatars 🖼️ ────────────────────────────────────────────────────────
//
// The player portrait grows with the character: every level tier maps to a
// distinct high-res character portrait (DiceBear CDN — reliable, hotlinkable,
// and free) plus its own accent palette. The level card, the drawer's player
// mini-card and the mailbox header all read from here, so the portrait
// changes automatically the moment the level crosses a tier threshold.
//
// Offline-safe: `fallbackEmoji` renders when the network image fails.

export interface LevelAvatarTier {
  key: string;
  label: string;
  /** Level where this tier starts (min level of the band, inclusive). */
  min: number;
  /** Level where the band ends (exclusive) — null = open-ended. */
  max: number | null;
  /** DiceBear seed — a unique character per tier. */
  seed: string;
  /** Accent glow / ring color (hex). */
  accent: string;
  /** Soft background gradient colors (hex, no #). */
  bgA: string;
  bgB: string;
  /** Fallback emoji shown when the portrait can't load. */
  fallbackEmoji: string;
  /** Short flavor line shown under the portrait. */
  motto: string;
}

/** One row per level band — mirrors LEVEL_TITLES in xpService. */
export const LEVEL_AVATAR_TIERS: LevelAvatarTier[] = [
  {
    key: 'novice',
    label: 'Novice',
    min: 1,
    max: 4,
    seed: 'novice-squire',
    accent: '#9DB8FF',
    bgA: '2E4A9C',
    bgB: '1A2B63',
    fallbackEmoji: '🗡️',
    motto: 'Every legend starts with one small step.',
  },
  {
    key: 'apprentice',
    label: 'Apprentice',
    min: 4,
    max: 8,
    seed: 'apprentice-mage',
    accent: '#B79CFF',
    bgA: '5A3EC4',
    bgB: '2E2260',
    fallbackEmoji: '📖',
    motto: 'Discipline is the first spell you learn.',
  },
  {
    key: 'fighter',
    label: 'Fighter',
    min: 8,
    max: 12,
    seed: 'fighter-blade',
    accent: '#4FD8C4',
    bgA: '0F6E62',
    bgB: '093A34',
    fallbackEmoji: '⚔️',
    motto: 'Consistency sharpens the blade.',
  },
  {
    key: 'warrior',
    label: 'Warrior',
    min: 12,
    max: 18,
    seed: 'warrior-iron',
    accent: '#FFA25C',
    bgA: 'B35C1F',
    bgB: '5C2F10',
    fallbackEmoji: '🛡️',
    motto: 'Standards held. No excuses.',
  },
  {
    key: 'elite',
    label: 'Elite Warrior',
    min: 18,
    max: 25,
    seed: 'elite-warden',
    accent: '#FF7089',
    bgA: '9C2A44',
    bgB: '51152A',
    fallbackEmoji: '🏹',
    motto: 'Precision beats motivation.',
  },
  {
    key: 'champion',
    label: 'Champion',
    min: 25,
    max: 35,
    seed: 'champion-gold',
    accent: '#FFC542',
    bgA: '9C7A1F',
    bgB: '503D0C',
    fallbackEmoji: '👑',
    motto: 'Win the morning, own the day.',
  },
  {
    key: 'hero',
    label: 'Hero',
    min: 35,
    max: 50,
    seed: 'hero-dawn',
    accent: '#5CE8B4',
    bgA: '0F7A55',
    bgB: '083827',
    fallbackEmoji: '🌟',
    motto: 'Habits are the hero the day needs.',
  },
  {
    key: 'legend',
    label: 'Legend',
    min: 50,
    max: 75,
    seed: 'legend-storm',
    accent: '#6BD5FF',
    bgA: '205E9C',
    bgB: '0E2F52',
    fallbackEmoji: '🐉',
    motto: 'Your streaks write the sagas now.',
  },
  {
    key: 'master',
    label: 'Grandmaster',
    min: 75,
    max: null,
    seed: 'master-astral',
    accent: '#C29BFF',
    bgA: '6A3FC0',
    bgB: '33185F',
    fallbackEmoji: '✨',
    motto: 'Mastery: the art of never stopping.',
  },
];

/** The tier for a player level, falling back to the first / last band. */
export function tierForLevel(level: number): LevelAvatarTier {
  const lv = Math.max(1, Math.floor(level));
  for (const t of LEVEL_AVATAR_TIERS) {
    if (lv >= t.min && (t.max == null || lv < t.max)) return t;
  }
  return LEVEL_AVATAR_TIERS[LEVEL_AVATAR_TIERS.length - 1];
}

/**
 * High-resolution portrait URL for a level (512px, linear gradient bg).
 * The portrait is a stable per-tier character; the palette shifts per tier,
 * so the level card visibly "evolves" as the player levels up.
 */
export function avatarUrlForLevel(level: number, size = 512): string {
  const tier = tierForLevel(level);
  const params = new URLSearchParams({
    seed: tier.seed,
    size: String(size),
    radius: '0',
    backgroundColor: `${tier.bgA},${tier.bgB}`,
    backgroundType: 'gradientLinear',
  });
  return `https://api.dicebear.com/9.x/adventurer/png?${params.toString()}`;
}

export { tierForLevel as levelTier };
