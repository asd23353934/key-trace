import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type SettingsStore<T> = {
  get: () => T;
  set: (value: T) => void;
};

export function createSettingsStore<T extends object>(
  fileName: string,
  defaultValue: T,
  validate: (raw: unknown) => T,
): SettingsStore<T> {
  const path = join(app.getPath('userData'), fileName);

  function readFromDisk(): T {
    if (!existsSync(path)) return { ...defaultValue };
    try {
      const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      return validate(raw);
    } catch (err) {
      console.warn(`[settings-store] failed to read ${fileName}, using defaults:`, err);
      return { ...defaultValue };
    }
  }

  let cache: T = readFromDisk();

  function get(): T {
    return cache;
  }

  function set(value: T): void {
    cache = value;
    try {
      writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[settings-store] failed to write ${fileName}:`, err);
    }
  }

  return { get, set };
}
