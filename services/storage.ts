import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export interface StorageEntrySummary {
  key: string;
  bytes: number;
  protected: boolean;
}

export interface StorageSnapshot {
  available: boolean;
  entries: StorageEntrySummary[];
  totalBytes: number;
  protectedKeys: string[];
}

const CONNECTION_KEYS = new Set(["serverUrl", "secret"]);

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(key, value); } catch {}
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(key); } catch {}
    return;
  }
  return SecureStore.deleteItemAsync(key);
}

export function inspectStorage(): StorageSnapshot {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") {
    return {
      available: false,
      entries: [],
      totalBytes: 0,
      protectedKeys: Array.from(CONNECTION_KEYS),
    };
  }

  const entries: StorageEntrySummary[] = [];
  let totalBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) || "";
      const bytes = key.length + value.length;
      totalBytes += bytes;
      entries.push({
        key,
        bytes,
        protected: CONNECTION_KEYS.has(key),
      });
    }
  } catch {
    return {
      available: false,
      entries: [],
      totalBytes: 0,
      protectedKeys: Array.from(CONNECTION_KEYS),
    };
  }

  return {
    available: true,
    entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
    totalBytes,
    protectedKeys: Array.from(CONNECTION_KEYS),
  };
}

export function clearLocalCache(options: { keepConnection?: boolean } = {}): number {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return 0;

  const keepConnection = options.keepConnection !== false;
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
  } catch {
    return 0;
  }

  let deleted = 0;
  for (const key of keys) {
    if (keepConnection && CONNECTION_KEYS.has(key)) continue;
    try {
      localStorage.removeItem(key);
      deleted += 1;
    } catch {}
  }
  return deleted;
}
