import { create } from "zustand";
import { uuid } from "../utils/id";
import { api, ApiRequestError, ChatMessage } from "../services/api";
import { loadChatCache, saveChatCache } from "../services/offlineCache";
import { getOfflineChatMessages } from "../services/offlineMirror";
import {
  enqueueOfflineChatSend,
  loadOfflineChatOutbox,
  removeOfflineChatSend,
} from "../services/offlineOutbox";
import { useConnection } from "./connectionStore";

interface ChatState {
  messages: ChatMessage[];
  etag: string;
  polling: boolean;
  pollTimer: ReturnType<typeof setTimeout> | null;
  pollInterval: number;
  pollActive: boolean;
  pollFailures: number;
  lastPollError: string | null;
  lastSendError: string | null;
  cacheHydrated: boolean;
  cacheUpdatedAt: string | null;
  cacheMessageCount: number;
  loadingHistory: boolean;
  hasMore: boolean;
  // 发送后等待UNIT-A回复的起始时间戳——点亮"思考中"占位气泡。
  // 只由 send/retry 点亮、poll 到 assistant 新消息或超时熄灭，
  // 不由消息数据驱动（避免历史回填/缓存恢复时冒假占位）。
  awaitingReplySince: number | null;

  startPolling: () => void;
  stopPolling: () => void;
  setPollActive: (active: boolean) => void;
  hydrateCache: () => Promise<void>;
  poll: () => Promise<void>;
  schedulePoll: () => void;
  loadHistory: () => Promise<void>;
  flushOfflineQueue: () => Promise<void>;
  send: (text: string, attachments?: { id: string; url: string; type: string }[], quotedId?: string, quotedText?: string) => Promise<void>;
  retryFailed: (messageId: string) => Promise<void>;
  retryAllFailed: () => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  updateMessageText: (messageId: string, text: string) => Promise<void>;
  clearChat: (before?: string) => Promise<number>;
  react: (messageId: string, emoji: string) => Promise<void>;
  feedback: (messageId: string, rating: "like" | "dislike" | null, reason?: string) => Promise<void>;
  clearAwaitingReply: () => void;
  replaceMessages: (msgs: ChatMessage[]) => void;
}

const POLL_AWAITING = 2000;
const POLL_FAST = 5000;
const POLL_SLOW = 45000;
const POLL_PASSIVE = 45000;
const POLL_HIDDEN = 120000;
const POLL_STEP = 1.5;
const HISTORY_PAGE_SIZE = 24;
// Only mark disconnected after this many consecutive poll failures, to
// tolerate transient network blips that would otherwise flip the indicator.
const DISCONNECT_THRESHOLD = 3;
// 内存消息软上限：长开不刷新的 session 里 poll 会无限累积，列表越长，
// 键盘弹出导致容器高度变化时 inverted FlatList 的整体重排越慢
// （表现为聚焦输入框后上半屏白住几秒然后抽一下）。超限从最旧端裁，
// 翻历史能按需取回（hasMore 保持 true）。
const MESSAGES_SOFT_CAP = 350;
const MESSAGES_TRIM_TO = 250;
// 刚翻过历史的 30s 内不裁——避免把用户正在看的旧消息从脚下抽走
let lastHistoryLoadAt = 0;
let offlineFlushInFlight = false;
let _staggerCounter = 0;
let firstPollAfterStart = true;
let visCleanup: (() => void) | null = null;
// 看门狗：iOS PWA 长后台/网络切换时 fetch 可能悬死、timer 可能冻结，
// poll→schedulePoll 链一断页面就永远不更新（发消息能成功收不到回复）。
// 记录每轮 poll 链推进时间，超时强制复活。
let lastPollTickAt = Date.now();
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let saveCacheTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSaveCache(get: () => ChatState) {
  if (saveCacheTimer !== null) clearTimeout(saveCacheTimer);
  saveCacheTimer = setTimeout(() => {
    saveCacheTimer = null;
    const { messages, etag } = get();
    saveChatCache(messages, etag).catch(() => {});
  }, 500);
}

function shouldQueueSend(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return error.kind === "network" || error.kind === "timeout" || error.kind === "config";
  }
  return true;
}

async function outboxAsMessages(): Promise<ChatMessage[]> {
  const outbox = await loadOfflineChatOutbox();
  return outbox.map((item) => ({
    id: item.id,
    client_id: item.client_id,
    ts: item.created_at,
    role: "user",
    text: item.text,
    source: "app",
    status: "queued",
    attachment_id: item.attachment_id,
    quoted_id: item.quoted_id,
    quoted_text: item.quoted_text,
    error: item.last_error,
  }));
}

function mergeLocalMessages(messages: ChatMessage[], localMessages: ChatMessage[]): ChatMessage[] {
  const byClient = new Set(messages.map((m) => m.client_id || m.id));
  const missing = localMessages.filter((m) => !byClient.has(m.client_id || m.id));
  return [...messages, ...missing].sort((a, b) => a.ts.localeCompare(b.ts));
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  etag: "1970-01-01T00:00:00.000Z",
  polling: false,
  pollTimer: null,
  pollInterval: POLL_FAST,
  pollActive: true,
  pollFailures: 0,
  lastPollError: null,
  lastSendError: null,
  cacheHydrated: false,
  cacheUpdatedAt: null,
  cacheMessageCount: 0,
  loadingHistory: false,
  hasMore: true,
  awaitingReplySince: null,

  clearAwaitingReply: () => {
    if (get().awaitingReplySince !== null) set({ awaitingReplySince: null });
  },

  replaceMessages: (msgs: ChatMessage[]) => {
    set({ messages: msgs, hasMore: true });
  },

  poll: async () => {
    try {
      const { etag } = get();
      const res = await api.poll(etag);
      set({ pollFailures: 0, lastPollError: null });
      useConnection.getState().setConnected(true);
      get().flushOfflineQueue().catch(() => {});
      if (res.messages.length > 0) {
        set((s) => {
          const deletedIds = new Set(
            res.messages.filter((m) => m.deleted_at).map((m) => m.id)
          );
          const existingIds = new Set(s.messages.map((m) => m.id));
          const serverById = new Map(res.messages.map((m) => [m.id, m]));
          // sending 状态消息的 client_id 集合——这些 client_id 对应的服务端消息
          // 会通过下面的 updated.map 替换乐观消息，不能再被当作 new 追加
          const sendingClientIds = new Set(
            s.messages
              .filter((m) => m.status === "sending" && m.client_id)
              .map((m) => m.client_id as string)
          );
          const newMsgs = res.messages.filter(
            (m) =>
              !m.deleted_at &&
              !existingIds.has(m.id) &&
              !(m.client_id && sendingClientIds.has(m.client_id))
          );
          const updated = s.messages.flatMap((m) => {
            if (deletedIds.has(m.id)) return [];
            const sameId = serverById.get(m.id);
            if (sameId) {
              if (sameId.deleted_at) return [];
              // 内容没变就保留原引用——换新对象会让 MessageBubble 的
              // memo 失效，poll 一回来整列表重渲染（滑动时表现为卡跳）
              if (
                m.text === sameId.text &&
                m.status === sameId.status &&
                m.reactions === sameId.reactions &&
                m.edited_at === sameId.edited_at &&
                m.thinking === sameId.thinking &&
                m.content_blocks === sameId.content_blocks &&
                m.tool_calls === sameId.tool_calls &&
                m.voice_url === sameId.voice_url
              )
                return [m];
              return [{ ...sameId }];
            }
            if (m.status === "sending") {
              const match = res.messages.find(
                (rm) => rm.client_id && rm.client_id === m.client_id
              );
              if (match) return match.deleted_at ? [] : [{ ...match }];
            }
            return [m];
          });
          const coldStart = firstPollAfterStart;
          firstPollAfterStart = false;
          if (!coldStart && newMsgs.length > 1) {
            _staggerCounter++;
            const batch = _staggerCounter;
            for (let i = 0; i < newMsgs.length; i++) {
              (newMsgs[i] as any)._stagger = { batch, index: i };
            }
          }
          let messages = [...updated, ...newMsgs];
          if (
            messages.length > MESSAGES_SOFT_CAP &&
            Date.now() - lastHistoryLoadAt > 30_000
          ) {
            // keep in-flight optimistic messages visible even if they're old —
            // trimming by position alone hid queued/sending bubbles
            const cut = messages.length - MESSAGES_TRIM_TO;
            const inFlight = messages.slice(0, cut).filter(
              (m) => m.status === "queued" || m.status === "sending" || m.status === "failed"
            );
            messages = [...inFlight, ...messages.slice(cut)];
          }
          // UNIT-A的回复到了——熄灭"思考中"占位
          const gotReply = newMsgs.some((m) => m.role === "assistant");
          return {
            messages,
            etag: res.etag,
            pollInterval: POLL_FAST,
            cacheUpdatedAt: new Date().toISOString(),
            cacheMessageCount: messages.length,
            hasMore: true,
            ...(gotReply ? { awaitingReplySince: null } : {}),
          };
        });
        scheduleSaveCache(get);
      } else {
        const current = get();
        set((s) => ({
          etag: res.etag,
          pollInterval: Math.min(POLL_SLOW, s.pollInterval * POLL_STEP),
          ...(current.messages.length > 0 ? { cacheUpdatedAt: new Date().toISOString(), cacheMessageCount: current.messages.length } : {}),
        }));
        if (current.messages.length > 0) scheduleSaveCache(get);
      }
    } catch (error) {
      const failures = get().pollFailures + 1;
      if (failures >= DISCONNECT_THRESHOLD) {
        useConnection.getState().setConnected(false);
      }
      set((s) => ({
        pollFailures: failures,
        lastPollError: error instanceof Error ? error.message : String(error),
        pollInterval: Math.min(POLL_SLOW, s.pollInterval * POLL_STEP),
      }));
    }
    lastPollTickAt = Date.now();
    if (get().polling) get().schedulePoll();
  },

  schedulePoll: () => {
    const old = get().pollTimer;
    if (old) clearTimeout(old);
    const hidden = typeof document !== "undefined" && document.hidden;
    const current = get();
    const awaiting = current.awaitingReplySince !== null;
    const interval = hidden
      ? POLL_HIDDEN
      : awaiting
        ? POLL_AWAITING
        : current.pollActive
          ? current.pollInterval
          : Math.max(POLL_PASSIVE, current.pollInterval);
    const timer = setTimeout(() => get().poll(), interval);
    set({ pollTimer: timer });
  },

  startPolling: () => {
    if (get().polling) return;
    set({ polling: true, pollInterval: POLL_FAST });
    get().hydrateCache().finally(() => get().poll());
    if (typeof document !== "undefined" && !visCleanup) {
      const onVisible = () => {
        if (!document.hidden && get().polling) {
          set({ pollInterval: POLL_FAST });
          get().schedulePoll();
        }
      };
      // 网络恢复 / iOS PWA 从后台快照恢复（pageshow）时立即拉一轮，
      // 不等被冻结的 timer 慢慢醒
      const kick = () => {
        if (!get().polling) return;
        set({ pollInterval: POLL_FAST });
        get().poll();
      };
      window.addEventListener("online", kick);
      window.addEventListener("pageshow", kick);
      if (watchdogTimer) clearInterval(watchdogTimer);
      watchdogTimer = setInterval(() => {
        if (get().polling && Date.now() - lastPollTickAt > 60_000) {
          lastPollTickAt = Date.now();
          get().poll();
        }
      }, 30_000);
      document.addEventListener("visibilitychange", onVisible);
      visCleanup = () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", kick);
        window.removeEventListener("pageshow", kick);
        if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
      };
    }
  },

  stopPolling: () => {
    const { pollTimer } = get();
    if (pollTimer) clearTimeout(pollTimer);
    if (visCleanup) { visCleanup(); visCleanup = null; }
    set({ polling: false, pollTimer: null });
  },

  setPollActive: (active: boolean) => {
    if (get().pollActive === active) return;
    set({ pollActive: active, pollInterval: active ? POLL_FAST : get().pollInterval });
    if (get().polling) get().schedulePoll();
  },

  hydrateCache: async () => {
    if (get().cacheHydrated) return;
    const queued = await outboxAsMessages();
    const cached = await loadChatCache();
    if (!cached || cached.messages.length === 0) {
      const mirrored = await getOfflineChatMessages(120);
      if (mirrored.length === 0) {
        try {
          const recent = await api.history(new Date().toISOString(), 80);
          if (recent.messages.length > 0) {
            const sorted = recent.messages.sort((a, b) => a.ts.localeCompare(b.ts));
            const messages = mergeLocalMessages(sorted, queued);
            const latestTs = sorted[sorted.length - 1]?.ts || new Date().toISOString();
            set({
              messages,
              etag: latestTs,
              cacheHydrated: true,
              cacheUpdatedAt: new Date().toISOString(),
              cacheMessageCount: messages.length,
              hasMore: true,
            });
            saveChatCache(messages, latestTs).catch(() => {});
            return;
          }
        } catch {}
        set({
          messages: queued,
          cacheHydrated: true,
          cacheUpdatedAt: queued.length ? new Date().toISOString() : null,
          cacheMessageCount: queued.length,
        });
        return;
      }
      const messages = mergeLocalMessages(mirrored, queued);
      set({
        messages,
        etag: mirrored[mirrored.length - 1]?.ts || "1970-01-01T00:00:00.000Z",
        cacheHydrated: true,
        cacheUpdatedAt: new Date().toISOString(),
        cacheMessageCount: messages.length,
        hasMore: true,
      });
      return;
    }
    set((s) => {
      if (s.messages.length > 0) {
        const messages = mergeLocalMessages(s.messages, queued);
        return {
          messages,
          cacheHydrated: true,
          cacheUpdatedAt: cached.saved_at || null,
          cacheMessageCount: messages.length,
        };
      }
      const messages = mergeLocalMessages(cached.messages, queued);
      return {
        messages,
        etag: cached.etag,
        cacheHydrated: true,
        cacheUpdatedAt: cached.saved_at || null,
        cacheMessageCount: messages.length,
        hasMore: true,
      };
    });
  },

  loadHistory: async () => {
    const { messages, loadingHistory } = get();
    if (loadingHistory) return;
    set({ loadingHistory: true });
    try {
      const oldest = messages[0]?.ts || new Date().toISOString();
      const res = await api.history(oldest, HISTORY_PAGE_SIZE);
      if (res.messages.length === 0) {
        set({ hasMore: false });
        return;
      }
      lastHistoryLoadAt = Date.now();
      set((s) => {
        const existingIds = new Set(s.messages.map((m) => m.id));
        const older = res.messages.filter((m) => !existingIds.has(m.id));
        const messages = [...older, ...s.messages];
        return { messages, cacheUpdatedAt: new Date().toISOString(), cacheMessageCount: messages.length };
      });
      scheduleSaveCache(get);
    } catch {
    } finally {
      set({ loadingHistory: false });
    }
  },

  flushOfflineQueue: async () => {
    if (offlineFlushInFlight) return;
    const queued = get().messages.filter((m) => m.status === "queued");
    if (queued.length === 0) return;

    offlineFlushInFlight = true;
    try {
      const result = await api.syncPush({
        chat_messages: queued.map((m) => ({
          id: m.id,
          client_id: m.client_id || m.id,
          text: m.text,
          attachment_id: m.attachment_id,
          quoted_id: m.quoted_id,
          quoted_text: m.quoted_text,
        })),
      });
      const byClient = new Map(
        result.chat_messages.map((item) => [item.client_id || "", item])
      );
      const removals: string[] = [];
      set((s) => {
        const messages = s.messages.map((m) => {
          if (m.status !== "queued") return m;
          const clientId = m.client_id || m.id;
          const pushed = byClient.get(clientId);
          if (!pushed) return m;
          if (!pushed.ok) return { ...m, error: pushed.error || "sync push failed" };
          removals.push(clientId);
          return {
            ...m,
            id: pushed.id || m.id,
            ts: pushed.ts || m.ts,
            status: pushed.status || "sent",
            error: undefined,
          };
        });
        return {
          messages,
          pollInterval: POLL_FAST,
          lastSendError: null,
          cacheUpdatedAt: new Date().toISOString(),
          cacheMessageCount: messages.length,
        };
      });
      await Promise.all(removals.map((clientId) => removeOfflineChatSend(clientId)));
      scheduleSaveCache(get);
      if (removals.length > 0) useConnection.getState().setConnected(true);
    } finally {
      offlineFlushInFlight = false;
    }
  },

  send: async (text: string, attachments?: { id: string; url: string; type: string }[], quotedId?: string, quotedText?: string) => {
    const clientId = uuid();
    const first = attachments?.[0];
    const optimistic: ChatMessage = {
      id: clientId,
      client_id: clientId,
      ts: new Date().toISOString(),
      role: "user",
      text,
      source: "app",
      status: "sending",
      attachment_id: first?.id,
      attachment_url: first?.url,
      attachment_type: first?.type,
      attachments: attachments?.map((a, i) => ({ id: a.id, url: a.url, type: a.type, sort_order: i })),
      quoted_id: quotedId,
      quoted_text: quotedText,
    };
    set((s) => ({
      messages: [...s.messages, optimistic],
      pollInterval: POLL_FAST,
      lastSendError: null,
      awaitingReplySince: Date.now(),
    }));
    if (get().polling) get().schedulePoll();

    try {
      const ids = attachments?.map((a) => a.id);
      const res = await api.send(text, clientId, ids && ids.length > 0 ? ids : undefined, quotedId);
      set((s) => {
        const messages = s.messages.map((m) =>
          m.client_id === clientId
            ? { ...m, id: res.id, ts: res.ts || m.ts, status: res.status || "sent" }
            : m
        );
        return {
          messages,
          pollInterval: POLL_FAST,
          lastSendError: null,
          cacheUpdatedAt: new Date().toISOString(),
          cacheMessageCount: messages.length,
        };
      });
      scheduleSaveCache(get);
      useConnection.getState().setConnected(true);
      if (get().polling) get().schedulePoll();
    } catch (e: any) {
      useConnection.getState().setConnected(false);
      const queued = shouldQueueSend(e);
      if (queued) {
        await enqueueOfflineChatSend(optimistic, e?.message || "offline");
      }
      set((s) => {
        const messages = s.messages.map((m) =>
          m.client_id === clientId
            ? { ...m, status: queued ? "queued" : "failed", error: e.message }
            : m
        );
        return {
          messages,
          lastSendError: e?.message || "unknown",
          cacheUpdatedAt: new Date().toISOString(),
          cacheMessageCount: messages.length,
          // 没发出去就别让她以为UNIT-A在想
          awaitingReplySince: null,
        };
      });
      scheduleSaveCache(get);
    }
  },

  retryFailed: async (messageId: string) => {
    const failed = get().messages.find(
      (m) => m.id === messageId && (m.status === "failed" || m.status === "queued")
    );
    if (!failed) return;
    const clientId = failed.client_id || failed.id;
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, client_id: clientId, status: "sending", error: undefined }
          : m
      ),
      pollInterval: POLL_FAST,
      lastSendError: null,
    }));

    try {
      const retryIds = failed.attachments?.map((a) => a.id) ?? (failed.attachment_id ? [failed.attachment_id] : undefined);
      const res = await api.send(failed.text, clientId, retryIds, failed.quoted_id);
      set((s) => {
        const messages = s.messages.map((m) =>
          m.client_id === clientId || m.id === messageId
            ? { ...m, id: res.id, ts: res.ts || m.ts, status: res.status || "sent", error: undefined }
            : m
        );
        return {
          messages,
          pollInterval: POLL_FAST,
          lastSendError: null,
          cacheUpdatedAt: new Date().toISOString(),
          cacheMessageCount: messages.length,
          awaitingReplySince: Date.now(),
        };
      });
      scheduleSaveCache(get);
      await removeOfflineChatSend(clientId);
      useConnection.getState().setConnected(true);
      if (get().polling) get().schedulePoll();
    } catch (e: any) {
      useConnection.getState().setConnected(false);
      const queued = shouldQueueSend(e);
      if (queued) {
        await enqueueOfflineChatSend(failed, e?.message || "offline");
      }
      set((s) => ({
        messages: s.messages.map((m) =>
          m.client_id === clientId || m.id === messageId
            ? { ...m, status: queued ? "queued" : "failed", error: e?.message || "unknown" }
            : m
        ),
        lastSendError: e?.message || "unknown",
      }));
    }
  },

  retryAllFailed: async () => {
    const failedIds = get()
      .messages.filter((m) => m.status === "failed" || m.status === "queued")
      .map((m) => m.id);
    for (const id of failedIds) {
      await get().retryFailed(id);
    }
  },

  updateMessageText: async (messageId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      await get().deleteMessage(messageId);
      return;
    }
    const res = await api.updateMessageText(messageId, trimmed);
    set((st) => {
      const messages = st.messages.map((m) =>
        m.id === messageId ? { ...m, ...res.message } : m
      );
      return {
        messages,
        cacheUpdatedAt: new Date().toISOString(),
        cacheMessageCount: messages.length,
      };
    });
    scheduleSaveCache(get);
  },

  deleteMessage: async (messageId: string) => {
    const existing = get().messages.find((m) => m.id === messageId);
    if (!existing) return;

    if (existing.status === "failed" || existing.status === "sending" || existing.status === "queued") {
      set((s) => {
        const messages = s.messages.filter((m) => m.id !== messageId);
        return {
          messages,
          cacheUpdatedAt: new Date().toISOString(),
          cacheMessageCount: messages.length,
        };
      });
      scheduleSaveCache(get);
      if (existing.status === "queued") {
        await removeOfflineChatSend(existing.client_id || existing.id);
      }
      return;
    }

    try {
      await api.deleteMessage(messageId);
    } catch (_) {
      // Server may have already deleted it — still remove locally
    }
    set((s) => {
      const messages = s.messages.filter((m) => m.id !== messageId);
      return {
        messages,
        cacheUpdatedAt: new Date().toISOString(),
        cacheMessageCount: messages.length,
      };
    });
    scheduleSaveCache(get);
  },

  clearChat: async (before?: string) => {
    const res = await api.clearChat(before);
    const cutoff = before ? new Date(before).getTime() : null;
    set((s) => {
      const messages = cutoff
        ? s.messages.filter((m) => new Date(m.ts).getTime() >= cutoff)
        : [];
      return {
        messages,
        etag: new Date().toISOString(),
        hasMore: cutoff ? s.hasMore : false,
        cacheUpdatedAt: new Date().toISOString(),
        cacheMessageCount: messages.length,
      };
    });
    const current = get();
    saveChatCache(current.messages, current.etag).catch(() => {});
    return res.count;
  },

  react: async (messageId: string, emoji: string) => {
    try {
      const res = await api.react(messageId, emoji);
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, reactions: JSON.stringify(res.reactions) }
            : m
        ),
      }));
    } catch {}
  },

  feedback: async (messageId: string, rating: "like" | "dislike" | null, reason?: string) => {
    try {
      const res = await api.feedback(messageId, rating, reason);
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, feedback_rating: res.feedback_rating, feedback_reason: res.feedback_reason, feedback_at: res.feedback_at }
            : m
        ),
      }));
    } catch {}
  },
}));
