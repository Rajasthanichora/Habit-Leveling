import { Audio, AVPlaybackSource } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { SoundConfig, DEFAULT_SOUND_CONFIG } from './types';

const ALARM_SOUNDS: Record<string, AVPlaybackSource> = {
  chime: require('../assets/sounds/chime.wav'),
  bell: require('../assets/sounds/bell.wav'),
  alarm: require('../assets/sounds/alarm.wav'),
  beep: require('../assets/sounds/beep.wav'),
  ding: require('../assets/sounds/ding.wav'),
};

export const ALARM_SOUND_NAMES = Object.keys(ALARM_SOUNDS);

let currentConfig: SoundConfig = { ...DEFAULT_SOUND_CONFIG };

export function setSoundConfig(config: SoundConfig) {
  currentConfig = config;
}

async function playSound(source: AVPlaybackSource) {
  try {
    const { sound } = await Audio.Sound.createAsync(source, { volume: 0.5 });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch {}
}

export async function playCompletionSound() {
  if (currentConfig.completionSound) {
    await playSound(ALARM_SOUNDS.complete || require('../assets/sounds/ding.wav'));
  }
}

export async function playDeleteSound() {
  if (currentConfig.deleteSound) {
    await playSound(ALARM_SOUNDS.delete || require('../assets/sounds/beep.wav'));
  }
}

export async function playAlarmSound(soundName?: string) {
  const name = soundName || currentConfig.alarmSound;
  const source = ALARM_SOUNDS[name];
  if (source) {
    await playSound(source);
  }
}

export async function playNotificationSound() {
  if (currentConfig.notificationSound) {
    await playSound(require('../assets/sounds/chime.wav'));
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
