import { legacyStorageKey } from "./compatibility/legacy";

// Copy first and remove the old key only after the new value is persisted.
type LocalStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
export function readLocalStorage(key: string, storage: LocalStorage = (globalThis as unknown as { localStorage: LocalStorage }).localStorage): string | null {
  const current = storage.getItem(key);
  if (current !== null) return current;
  const oldKey = legacyStorageKey(key), value = oldKey ? storage.getItem(oldKey) : null;
  if (oldKey && value !== null) {
    try { storage.setItem(key, value); storage.removeItem(oldKey); } catch { /* Keep the original if storage is full. */ }
  }
  return value;
}
