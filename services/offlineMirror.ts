import { Platform } from "react-native";
import {
  api,
  ChatMessage,
  CompanionNote,
  CurrentMood,
  MoodEvent,
  SyncTableName,
} from "./api";
import { getItem, setItem } from "./storage";
import { useConnection } from "../stores/connectionStore";

const MIRROR_KEY = "offline.mirror.v1";
const START_SINCE = "1970-01-01T00:00:00.000Z";
const SYNC_INTERVAL_MS = 180_000;
const TABLES: SyncTableName[] = ["chat_messages", "companion_notes", "mood_events"];
const SYNC_PAGE_LIMIT = 1000;
const TABLE_LIMITS = {
  chat_messages: 400,
  companion_notes: 240,
  mood_events: 240,
};

interface OfflineMirrorState {
  version: 1;
  saved_at: string;
  last_pulled_at: string | null;
  table_pulled_at: Partial<Record<SyncTableName, string>>;
  chat_messages: ChatMessage[];
  companion_notes: CompanionNote[];
  mood_events: MoodEvent[];
}

export interface OfflineMirrorSnapshot {
  available: boolean;
  savedAt: string | null;
  lastPulledAt: string | null;
  counts: Record<SyncTableName, number>;
  bytes: number;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncInFlight = false;

function emptyMirror(): OfflineMirrorState {
  return {
    version: 1,
    saved_at: "",
    last_pulled_at: null,
    table_pulled_at: {},
    chat_messages: [],
    companion_notes: [],
    mood_events: [],
  };
}

function isAvailable(): boolean {
  return Platform.OS === "web" && typeof localStorage !== "undefined";
}

function rowUpdatedAt(row: { updated_at?: string | null; ts?: string; created_at?: string | number }): string {
  if (row.updated_at) return row.updated_at;
  if (row.ts) return row.ts;
  if (typeof row.created_at === "string") return row.created_at;
  if (typeof row.created_at === "number") return new Date(row.created_at).toISOString();
  return START_SINCE;
}

function sortByUpdatedAt<T extends { updated_at?: string | null; ts?: string; created_at?: string | number }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => rowUpdatedAt(a).localeCompare(rowUpdatedAt(b)));
}

function sortByCreatedDesc<T extends { created_at?: string | number; ts?: string }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const at = typeof a.created_at === "number" ? a.created_at : new Date(a.ts || a.created_at || 0).getTime();
    const bt = typeof b.created_at === "number" ? b.created_at : new Date(b.ts || b.created_at || 0).getTime();
    return bt - at;
  });
}

function mergeById<
  T extends {
    id: string | number;
    deleted_at?: string | null;
    updated_at?: string | null;
    ts?: string;
    created_at?: string | number;
  },
>(current: T[], incoming: T[], limit: number): T[] {
  const byId = new Map<string, T>();
  for (const row of current) {
    if (row?.id != null) byId.set(String(row.id), row);
  }
  for (const row of incoming) {
    if (row?.id == null) continue;
    byId.set(String(row.id), row);
  }
  return sortByUpdatedAt(Array.from(byId.values()))
    .slice(-limit);
}

export async function loadOfflineMirror(): Promise<OfflineMirrorState> {
  if (!isAvailable()) return emptyMirror();
  try {
    const raw = await getItem(MIRROR_KEY);
    if (!raw) return emptyMirror();
    const parsed = JSON.parse(raw) as Partial<OfflineMirrorState>;
    if (parsed.version !== 1) return emptyMirror();
    return {
      version: 1,
      saved_at: parsed.saved_at || "",
      last_pulled_at: parsed.last_pulled_at || null,
      table_pulled_at: parsed.table_pulled_at || {},
      chat_messages: Array.isArray(parsed.chat_messages) ? parsed.chat_messages : [],
      companion_notes: Array.isArray(parsed.companion_notes) ? parsed.companion_notes : [],
      mood_events: Array.isArray(parsed.mood_events) ? parsed.mood_events : [],
    };
  } catch {
    return emptyMirror();
  }
}

async function saveOfflineMirror(mirror: OfflineMirrorState): Promise<void> {
  if (!isAvailable()) return;
  const payload = {
    ...mirror,
    version: 1 as const,
    saved_at: new Date().toISOString(),
  };
  await setItem(MIRROR_KEY, JSON.stringify(payload));
}

function latestReturnedAt(rows: Array<{ updated_at?: string | null; ts?: string; created_at?: string | number }>): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    const value = rowUpdatedAt(row);
    if (!latest || value > latest) latest = value;
  }
  return latest;
}

function getSyncRows(result: Awaited<ReturnType<typeof api.syncPull>>, table: SyncTableName) {
  if (table === "chat_messages") return result.chat_messages || [];
  if (table === "companion_notes") return result.companion_notes || [];
  return result.mood_events || [];
}

function mergeSyncRows(mirror: OfflineMirrorState, table: SyncTableName, rows: ReturnType<typeof getSyncRows>): OfflineMirrorState {
  if (table === "chat_messages") {
    return {
      ...mirror,
      chat_messages: mergeById(mirror.chat_messages, rows as ChatMessage[], TABLE_LIMITS.chat_messages),
    };
  }
  if (table === "companion_notes") {
    return {
      ...mirror,
      companion_notes: mergeById(mirror.companion_notes, rows as CompanionNote[], TABLE_LIMITS.companion_notes),
    };
  }
  return {
    ...mirror,
    mood_events: mergeById(mirror.mood_events, rows as MoodEvent[], TABLE_LIMITS.mood_events),
  };
}

export async function syncOfflineMirrorOnce(): Promise<OfflineMirrorSnapshot> {
  if (!isAvailable()) return inspectOfflineMirror();
  const connection = useConnection.getState();
  if (!connection.configured || !connection.secret) return inspectOfflineMirror();
  if (syncInFlight) return inspectOfflineMirror();

  syncInFlight = true;
  try {
    let mirror = await loadOfflineMirror();
    let serverTime = new Date().toISOString();

    for (const table of TABLES) {
      let since = mirror.table_pulled_at[table] || mirror.last_pulled_at || START_SINCE;
      while (true) {
        const result = await api.syncPull({ since, tables: [table], limit: SYNC_PAGE_LIMIT });
        const rows = getSyncRows(result, table);
        mirror = mergeSyncRows(mirror, table, rows);
        serverTime = result.server_time || serverTime;

        const latest = latestReturnedAt(rows);
        if (!result.has_more || !latest || latest <= since) break;
        since = latest;
      }
    }

    mirror.table_pulled_at = Object.fromEntries(TABLES.map((table) => [table, serverTime]));
    mirror.last_pulled_at = serverTime;
    await saveOfflineMirror(mirror);
    return inspectOfflineMirror();
  } finally {
    syncInFlight = false;
  }
}

export function startOfflineMirrorSync(): void {
  if (syncTimer) return;
  const syncWhenVisible = () => {
    if (typeof document !== "undefined" && document.hidden) return;
    syncOfflineMirrorOnce().catch(() => {});
  };
  setTimeout(syncWhenVisible, 8000);
  syncTimer = setInterval(syncWhenVisible, SYNC_INTERVAL_MS);
}

export async function getOfflineChatMessages(limit = 120): Promise<ChatMessage[]> {
  const mirror = await loadOfflineMirror();
  return mirror.chat_messages
    .filter((message) => !message.deleted_at && message.status !== "sending" && message.status !== "failed")
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit);
}

export function inspectOfflineMirror(): OfflineMirrorSnapshot {
  if (!isAvailable()) {
    return {
      available: false,
      savedAt: null,
      lastPulledAt: null,
      counts: { chat_messages: 0, companion_notes: 0, mood_events: 0 },
      bytes: 0,
    };
  }
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (!raw) {
      return {
        available: true,
        savedAt: null,
        lastPulledAt: null,
        counts: { chat_messages: 0, companion_notes: 0, mood_events: 0 },
        bytes: 0,
      };
    }
    const parsed = JSON.parse(raw) as Partial<OfflineMirrorState>;
    return {
      available: true,
      savedAt: parsed.saved_at || null,
      lastPulledAt: parsed.last_pulled_at || null,
      counts: {
        chat_messages: Array.isArray(parsed.chat_messages) ? parsed.chat_messages.length : 0,
        companion_notes: Array.isArray(parsed.companion_notes) ? parsed.companion_notes.length : 0,
        mood_events: Array.isArray(parsed.mood_events) ? parsed.mood_events.length : 0,
      },
      bytes: raw.length,
    };
  } catch {
    return {
      available: true,
      savedAt: null,
      lastPulledAt: null,
      counts: { chat_messages: 0, companion_notes: 0, mood_events: 0 },
      bytes: 0,
    };
  }
}
