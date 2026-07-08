import { api, ChatMessage } from "./api";
import { getItem, setItem } from "./storage";
import { useConnection } from "../stores/connectionStore";

const OUTBOX_KEY = "offline.chat.outbox.v1";
const MAX_OUTBOX = 80;

export interface OfflineChatSend {
  id: string;
  client_id: string;
  text: string;
  attachment_id?: string;
  quoted_id?: string;
  quoted_text?: string;
  created_at: string;
  attempts: number;
  last_error?: string;
}

export async function loadOfflineChatOutbox(): Promise<OfflineChatSend[]> {
  try {
    const raw = await getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveOutbox(items: OfflineChatSend[]): Promise<void> {
  await setItem(OUTBOX_KEY, JSON.stringify(items.slice(-MAX_OUTBOX)));
}

export async function enqueueOfflineChatSend(message: Pick<ChatMessage, "id" | "client_id" | "text" | "attachment_id" | "quoted_id" | "quoted_text">, error?: string): Promise<void> {
  const clientId = message.client_id || message.id;
  const current = await loadOfflineChatOutbox();
  const next: OfflineChatSend = {
    id: message.id,
    client_id: clientId,
    text: message.text || "",
    attachment_id: message.attachment_id,
    quoted_id: message.quoted_id,
    quoted_text: message.quoted_text,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: error,
  };
  const withoutDuplicate = current.filter((item) => item.client_id !== clientId);
  await saveOutbox([...withoutDuplicate, next]);
}

export async function removeOfflineChatSend(clientId: string): Promise<void> {
  const current = await loadOfflineChatOutbox();
  await saveOutbox(current.filter((item) => item.client_id !== clientId));
}

