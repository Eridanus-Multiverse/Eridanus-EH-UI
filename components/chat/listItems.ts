// Shared chat-list assembly: date separators + message run grouping.
// Was duplicated verbatim in chat.tsx and CursaChatView — the grouping race
// fixed in one copy (2026-07-04) had a live twin in the other.
import type { ChatMessage } from "../../services/api";

export type ListItem =
  | { type: "message"; data: ChatMessage; isGroupStart: boolean; isGroupEnd: boolean }
  | { type: "separator"; date: string };

// DM pages have exactly one assistant — source differences (bridge vs chat)
// must not split a run. Window: 5 minutes.
export function sameSender(a: ChatMessage, b: ChatMessage): boolean {
  if (a.role !== b.role || a.role === "system") return false;
  // never merge runs across assistants (Cursa review P3) — but within one
  // assistant, transport source (bridge vs chat) must not split a run
  if (a.role === "assistant" && (a as any).assistant !== (b as any).assistant) return false;
  return Math.abs(new Date(a.ts).getTime() - new Date(b.ts).getTime()) < 300_000;
}

export function buildItems(messages: ChatMessage[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDate = "";

  for (const msg of messages) {
    const d = new Date(msg.ts);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (dateStr !== lastDate) {
      items.push({ type: "separator", date: dateStr });
      lastDate = dateStr;
    }
    items.push({ type: "message", data: msg, isGroupStart: true, isGroupEnd: true });
  }

  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    if (cur.type !== "message") continue;
    const prev = i > 0 ? items[i - 1] : null;
    const next = i < items.length - 1 ? items[i + 1] : null;
    cur.isGroupStart = !(prev?.type === "message" && sameSender(prev.data, cur.data));
    cur.isGroupEnd = !(next?.type === "message" && sameSender(next.data, cur.data));
  }

  return items;
}
