import * as Audio from 'expo-audio';
import type { AudioSource } from 'expo-audio';

// ── Audio Mode Initialization ──
export async function initAudio(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch {}
}

/**
 * Built-in sound catalog — every app function has its own fixed sound.
 * Sounds are royalty-free picks from Mixkit's free SFX library, shipped
 * inside the app under `assets/sounds`.
 */
interface SfxEntry {
  /** Sound Lab label. */
  label: string;
  /** What the sound is used for (Sound Lab description). */
  desc: string;
  source: AudioSource;
}

const FUNCTION_SOUNDS = {
  complete: {
    label: 'Habit Complete',
    desc: 'Plays when you check off a habit',
    source: require('../assets/sounds/COMPLETION-SOUND.wav'),
  },
  delete: {
    label: 'Habit Delete',
    desc: 'Plays when you delete a habit',
    source: require('../assets/sounds/DELETE-SOUND.wav'),
  },
  levelUp: {
    label: 'Level Up',
    desc: 'Plays when your XP level rises',
    source: require('../assets/sounds/levelup.mp3'),
  },
  coin: {
    label: 'Coin Earn',
    desc: 'Coins landing: completions, combos & shop payouts',
    source: require('../assets/sounds/coin.mp3'),
  },
  penalty: {
    label: 'Penalty',
    desc: 'HP damage, fines & habit collapse',
    source: require('../assets/sounds/penalty.mp3'),
  },
  chest: {
    label: 'Chest & Season Reward',
    desc: 'Chests, season closures & big rewards',
    source: require('../assets/sounds/chest.mp3'),
  },
  evolve: {
    label: 'Evolution',
    desc: 'Habit evolution stage-ups',
    source: require('../assets/sounds/evolve.mp3'),
  },
  revive: {
    label: 'Revive',
    desc: 'Bringing a collapsed habit back to life',
    source: require('../assets/sounds/revive.mp3'),
  },
  alarm: {
    label: 'Reminder Alarm',
    desc: 'The sound of reminder & alarm notifications',
    source: require('../assets/sounds/musical_alarm.wav'),
  },
} satisfies Record<string, SfxEntry>;

export type SfxId = keyof typeof FUNCTION_SOUNDS;

export const SFX_IDS = Object.keys(FUNCTION_SOUNDS) as SfxId[];

/** Catalog rows for the Sound Lab screen (id, label, description). */
export function getSfxCatalog(): { id: SfxId; label: string; desc: string }[] {
  return SFX_IDS.map((id) => ({ id, label: FUNCTION_SOUNDS[id].label, desc: FUNCTION_SOUNDS[id].desc }));
}

let preloaded = false;

function playOnce(source: AudioSource) {
  try {
    const player = Audio.createAudioPlayer(source);
    player.volume = 1;
    player.play();
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish || status.error) {
        player.remove();
      }
    });
  } catch {}
}

export async function preloadCommonSounds(): Promise<void> {
  if (preloaded) return;
  preloaded = true;
  for (const s of SFX_IDS) {
    try {
      await Audio.preload(FUNCTION_SOUNDS[s].source);
    } catch {}
  }
}

// ─── Function-triggered sounds (fixed, no settings needed) ───────────────────

export async function playCompletionSound() {
  playOnce(FUNCTION_SOUNDS.complete.source);
}

export async function playDeleteSound() {
  playOnce(FUNCTION_SOUNDS.delete.source);
}

/** Fires on XP level-up events. */
export async function playLevelUpSound() {
  playOnce(FUNCTION_SOUNDS.levelUp.source);
}

/** Preview any built-in sound (Sound Lab rows). */
export async function previewSound(id: SfxId) {
  const entry = FUNCTION_SOUNDS[id];
  if (entry) {
    playOnce(entry.source);
  }
}

// ─── Game SFX (economy/penalty layer) ─────────────────────────────────────────

export type GameSfxKind = 'coin' | 'penalty' | 'chest' | 'evolve' | 'revive';

const GAME_SFX_SOURCE: Record<GameSfxKind, SfxId> = {
  coin: 'coin',
  penalty: 'penalty',
  chest: 'chest',
  evolve: 'evolve',
  revive: 'revive',
};

export async function playGameSfx(kind: GameSfxKind): Promise<void> {
  playOnce(FUNCTION_SOUNDS[GAME_SFX_SOURCE[kind]].source);
}

export const playCoinSound = () => playGameSfx('coin');
export const playPenaltySound = () => playGameSfx('penalty');
export const playChestSound = () => playGameSfx('chest');
export const playEvolveSound = () => playGameSfx('evolve');
export const playReviveSound = () => playGameSfx('revive');
