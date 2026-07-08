import { Platform } from "react-native";
import { ChatMessage } from "./api";
import { getItem, setItem } from "./storage";

const CHAT_CACHE_KEY = "offline.chat.v1";
const CHAT_CACHE_LIMIT = 120;

export interface OfflineChatCache {
  version: 1;
  saved_at: string;
  etag: string;
  messages: ChatMessage[];
}

export interface OfflineCacheSnapshot {
  available: boolean;
  messageCount: number;
  savedAt: string | null;
  etag: string | null;
  bytes: number;
}

function cacheableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.status !== "sending" && message.status !== "failed")
    .slice(-CHAT_CACHE_LIMIT);
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (!message || !message.id || !message.ts) continue;
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort((a, b) => a.ts.localeCompare(b.ts));
}

export async function loadChatCache(): Promise<OfflineChatCache | null> {
  try {
    const raw = await getItem(CHAT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfflineChatCache>;
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) return null;
    return {
      version: 1,
      saved_at: parsed.saved_at || "",
      etag: parsed.etag || "1970-01-01T00:00:00.000Z",
      messages: normalizeMessages(parsed.messages),
    };
  } catch {
    return null;
  }
}

export async function saveChatCache(messages: ChatMessage[], etag: string): Promise<void> {
  const payload: OfflineChatCache = {
    version: 1,
    saved_at: new Date().toISOString(),
    etag,
    messages: normalizeMessages(cacheableMessages(messages)),
  };
  if (payload.messages.length === 0) return;
  try {
    await setItem(CHAT_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

export function inspectChatCache(): OfflineCacheSnapshot {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") {
    return {
      available: false,
      messageCount: 0,
      savedAt: null,
      etag: null,
      bytes: 0,
    };
  }

  try {
    const raw = localStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) {
      return {
        available: true,
        messageCount: 0,
        savedAt: null,
        etag: null,
        bytes: 0,
      };
    }
    const parsed = JSON.parse(raw) as Partial<OfflineChatCache>;
    return {
      available: true,
      messageCount: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
      savedAt: parsed.saved_at || null,
      etag: parsed.etag || null,
      bytes: raw.length,
    };
  } catch {
    return {
      available: true,
      messageCount: 0,
      savedAt: null,
      etag: null,
      bytes: 0,
    };
  }
}
