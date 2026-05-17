import { Audio, AVPlaybackSource } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { SoundConfig, DEFAULT_SOUND_CONFIG } from './types';

// ── Audio Mode Initialization ──
export async function initAudio(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      allowsRecordingIOS: false,
    });
  } catch {}
}

const ALARM_SOUNDS: Record<string, AVPlaybackSource> = {
  chime: require('../assets/sounds/chime.wav'),
  bell: require('../assets/sounds/bell.wav'),
  alarm: require('../assets/sounds/alarm.wav'),
  beep: require('../assets/sounds/beep.wav'),
  ding: require('../assets/sounds/ding.wav'),
};

const COMPLETION_SOURCE: AVPlaybackSource = require('../assets/sounds/ding.wav');
const DELETE_SOURCE: AVPlaybackSource = require('../assets/sounds/beep.wav');

export const ALARM_SOUND_NAMES = Object.keys(ALARM_SOUNDS);

let currentConfig: SoundConfig = { ...DEFAULT_SOUND_CONFIG };

export function setSoundConfig(config: SoundConfig) {
  currentConfig = config;
}

let preloaded = false;

async function loadSound(source: AVPlaybackSource): Promise<Audio.Sound> {
  const { sound } = await Audio.Sound.createAsync(source, { volume: 1.0 });
  return sound;
}

async function playOnce(source: AVPlaybackSource) {
  try {
    const sound = await loadSound(source);
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch {}
}

export async function preloadCommonSounds(): Promise<void> {
  if (preloaded) return;
  preloaded = true;
  const sounds = [COMPLETION_SOURCE, DELETE_SOURCE, ALARM_SOUNDS.chime];
  for (const s of sounds) {
    try {
      const sound = await loadSound(s);
      await sound.unloadAsync();
    } catch {}
  }
}

export async function playCompletionSound() {
  if (currentConfig.completionSound) {
    await playOnce(COMPLETION_SOURCE);
  }
}

export async function playDeleteSound() {
  if (currentConfig.deleteSound) {
    await playOnce(DELETE_SOURCE);
  }
}

export async function playAlarmSound(soundName?: string) {
  const name = soundName || currentConfig.alarmSound;
  const source = ALARM_SOUNDS[name];
  if (source) {
    await playOnce(source);
  }
}

export async function playNotificationSound() {
  if (currentConfig.notificationSound) {
    await playOnce(require('../assets/sounds/chime.wav'));
  }
}

export async function vibrateOnTap() {
  if (currentConfig.vibrationOnTap) {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }
}

export function getAlarmSoundNames(): string[] {
  return ALARM_SOUND_NAMES;
}
