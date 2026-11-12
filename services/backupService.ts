// ── Backup & Restore ────────────────────────────────────────────────────────
// The whole app state lives in AsyncStorage. Backup dumps every key into a
// single JSON file the user can save/share anywhere; restore reads a backup
// file back into AsyncStorage. On next launch everything comes back as it was.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const BACKUP_APP_ID = 'habit-leveling';
const BACKUP_FORMAT_VERSION = 1;

export interface BackupFile {
  app: string;
  type: 'backup';
  version: number;
  createdAt: string;
  habitLevelingBackup?: true; // extra marker so restore rejects random JSON files
  data: Record<string, string>;
}

/** Builds the backup payload from every AsyncStorage key (internal, testable). */
export async function buildBackupPayload(): Promise<BackupFile> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  const data: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (key && value !== null) data[key] = value;
  }
  return {
    app: BACKUP_APP_ID,
    type: 'backup',
    version: BACKUP_FORMAT_VERSION,
    habitLevelingBackup: true,
    createdAt: new Date().toISOString(),
    data,
  };
}

/**
 * Exports the full app state to a timestamped JSON file in the app cache and
 * opens the share sheet so the user can save it to Drive/WhatsApp/Files.
 * Returns the file URI, or null if the user cancelled / sharing unavailable.
 */
export async function exportBackup(): Promise<string | null> {
  const payload = await buildBackupPayload();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = new File(Paths.cache, `HabitLeveling-Backup-${stamp}.json`);
  file.create(); // no-op if it already exists
  file.write(JSON.stringify(payload, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your backup file',
    });
    return file.uri;
  }
  return null;
}

/**
 * Lets the user pick a previously exported backup file and reads it.
 * Returns the parsed backup, or null if picking was cancelled.
 * Throws a friendly Error when the file is not a valid backup.
 */
export async function pickBackupFile(): Promise<BackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;

  const file = new File(asset.uri);
  if (!file.exists) throw new Error('Selected file could not be read.');
  let text = '';
  try {
    text = await file.text();
  } catch {
    throw new Error('File could not be read — is it a valid backup file?');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not a valid backup file (bad JSON).');
  }
  const backup = parsed as Partial<BackupFile>;
  if (
    !backup ||
    backup.app !== BACKUP_APP_ID ||
    backup.type !== 'backup' ||
    backup.habitLevelingBackup !== true ||
    typeof backup.data !== 'object' ||
    backup.data === null
  ) {
    throw new Error('This file is not a Habit Leveling backup.');
  }
  // Upgrades can bump version — accept anything we know how to read.
  if ((backup.version ?? 0) > BACKUP_FORMAT_VERSION) {
    throw new Error('Backup was made by a newer app version. Update the app first.');
  }
  return backup as BackupFile;
}

/**
 * Writes every key/value from a backup into AsyncStorage (overwrites
 * duplicates, keeps keys the backup doesn't contain). Returns key count.
 */
export async function restoreFromBackup(backup: BackupFile): Promise<number> {
  const entries = Object.entries(backup.data).filter(
    ([key, value]) => !!key && typeof value === 'string'
  );
  if (entries.length === 0) return 0;
  // multiSet caps are large but chunk defensively for huge histories.
  const CHUNK = 400;
  for (let i = 0; i < entries.length; i += CHUNK) {
    await AsyncStorage.multiSet(entries.slice(i, i + CHUNK));
  }
  return entries.length;
}
