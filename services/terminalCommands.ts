import { api, ChatMessage, ContextUsage } from "./api";
import { clearLocalCache, inspectStorage } from "./storage";
import { inspectChatCache } from "./offlineCache";
import { inspectOfflineMirror } from "./offlineMirror";
import { useApiDiagnostics } from "../stores/apiDiagnosticsStore";
import { useChat } from "../stores/chatStore";
import { useConnection } from "../stores/connectionStore";

export type TerminalResultKind = "info" | "success" | "warning" | "error";

export interface TerminalResult {
  kind: TerminalResultKind;
  title: string;
  lines: string[];
}

type TerminalCommandHandler = (args: string[]) => Promise<TerminalResult> | TerminalResult;

interface TerminalCommand {
  name: string;
  aliases?: string[];
  usage: string;
  description: string;
  run: TerminalCommandHandler;
}

function preview(text: string, limit = 90): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 3)}...`;
}

function formatContext(context: ContextUsage): string[] {
  return [
    `band=${context.threshold_band}`,
    `tokens=${context.estimated_tokens}/${context.token_budget}`,
    `ratio=${Math.round(context.ratio * 100)}%`,
    `turns=${context.turn_count ?? "?"}`,
    `jsonl=${Math.round(context.jsonl_size_bytes / 1024)}KB`,
    `measured=${context.measured_at || "unknown"}`,
  ];
}

function formatMessage(message: ChatMessage, index: number): string {
  const date = new Date(message.ts);
  const time = Number.isNaN(date.getTime()) ? message.ts : date.toLocaleString();
  return `${index + 1}. [${message.role}/${message.source || "app"}] ${time} :: ${preview(message.text || "(empty)")}`;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function isSeparatorLine(line: string): boolean {
  const compact = line.trim();
  return compact.length > 40 && /^[─━═=\-_\s]+$/.test(compact);
}

function tailLines(output: string, limit = 12): string[] {
  const lines = stripAnsi(output)
    .replace(/\r/g, "")
    .replace(/\s+$/g, "")
    .split("\n")
    .filter((line) => !isSeparatorLine(line));
  return lines.slice(Math.max(0, lines.length - limit)).map((line) => line || " ");
}

function diagnosticsLines(): string[] {
  const apiState = useApiDiagnostics.getState();
  const chatState = useChat.getState();
  const connection = useConnection.getState();
  const last = apiState.lastFailure;
  const failedMessages = chatState.messages.filter((m) => m.status === "failed").length;
  const sendingMessages = chatState.messages.filter((m) => m.status === "sending").length;

  return [
    `server=${connection.serverUrl || "(empty)"}`,
    `connected=${connection.connected ? "yes" : "no"} configured=${connection.configured ? "yes" : "no"}`,
    `messages=${chatState.messages.length} sending=${sendingMessages} failed=${failedMessages}`,
    `polling=${chatState.polling ? "on" : "off"} interval=${chatState.pollInterval}ms failures=${chatState.pollFailures}`,
    `history loading=${chatState.loadingHistory ? "yes" : "no"} hasMore=${chatState.hasMore ? "yes" : "no"}`,
    `last_poll_error=${chatState.lastPollError || "none"}`,
    `last_send_error=${chatState.lastSendError || "none"}`,
    `api ok=${apiState.okRequests}/${apiState.totalRequests} failed=${apiState.failedRequests} timeouts=${apiState.timeoutRequests}`,
    last
      ? `last_api_error=${last.kind} status=${last.status ?? "-"} ${last.method} ${last.path} ${last.durationMs}ms ${last.message}`
      : "last_api_error=none",
  ];
}

const commands: TerminalCommand[] = [
  {
    name: "help",
    aliases: ["?"],
    usage: "/help",
    description: "列出可用命令",
    run: () => ({
      kind: "info",
      title: "Commands",
      lines: commands.map((cmd) => `${cmd.usage} - ${cmd.description}`),
    }),
  },
  {
    name: "ping",
    usage: "/ping",
    description: "测试基础连接和认证",
    run: async () => {
      const result = await api.testConnection();
      return {
        kind: result.ok ? "success" : "error",
        title: result.ok ? "Ping OK" : "Ping Failed",
        lines: [result.ok ? "连接和认证正常" : result.detail || "连接失败"],
      };
    },
  },
  {
    name: "health",
    usage: "/health",
    description: "读取服务 /health 和 /api/time",
    run: async () => {
      const [health, time] = await Promise.all([api.health(), api.time()]);
      return {
        kind: health.status === "ok" ? "success" : "warning",
        title: "Server Health",
        lines: [
          `status=${health.status}`,
          `name=${health.name || "unknown"}`,
          `memories=${health.memories ?? "unknown"}`,
          `time=${time.now || time.time || JSON.stringify(time)}`,
        ],
      };
    },
  },
  {
    name: "whoami",
    usage: "/whoami",
    description: "显示当前本机配置，不暴露 token 内容",
    run: () => {
      const connection = useConnection.getState();
      const runtime =
        typeof window === "undefined"
          ? "native"
          : window.matchMedia?.("(display-mode: standalone)")?.matches
            ? "pwa"
            : "browser";
      return {
        kind: connection.configured ? "success" : "warning",
        title: "Local Identity",
        lines: [
          "user=HORIZON",
          "assistant=UNIT-A",
          `runtime=${runtime}`,
          `server=${connection.serverUrl || "(empty)"}`,
          `token=${connection.secret ? "present" : "missing"}`,
          `connected=${connection.connected ? "yes" : "no"}`,
        ],
      };
    },
  },
  {
    name: "companions",
    usage: "/companions",
    description: "显示UNIT-A、UNIT-B、推送和 control plane 状态",
    run: async () => {
      const result = await api.companionsStatus();
      return {
        kind: "info",
        title: "Companions",
        lines: [
          `checked_at=${result.checked_at}`,
          ...result.companions.map(
            (item) =>
              `${item.icon} ${item.label} ${item.status} last=${item.last_seen_at || "-"} ${item.detail || ""}`
          ),
        ],
      };
    },
  },
  {
    name: "claudemd",
    usage: "/claudemd",
    description: "查看 CLAUDE.md 大小、修改时间和历史备份数",
    run: async () => {
      const [current, history] = await Promise.all([
        api.getClaudeMd(),
        api.getClaudeMdHistory(),
      ]);
      return {
        kind: "info",
        title: "CLAUDE.md",
        lines: [
          `size=${current.size}B`,
          `modified_at=${current.modified_at}`,
          `history=${history.history.length}`,
          ...history.history.slice(0, 5).map((entry) => `${entry.filename} ${entry.size}B`),
        ],
      };
    },
  },
  {
    name: "status",
    usage: "/status",
    description: "显示本机连接、聊天和 API 诊断状态",
    run: () => ({
      kind: "info",
      title: "Status",
      lines: diagnosticsLines(),
    }),
  },
  {
    name: "batch",
    usage: "/batch",
    description: "查看当前消息延迟回复队列",
    run: async () => {
      const result = await api.batchStatus();
      return {
        kind: result.pending > 0 ? "warning" : "success",
        title: "Chat Batch",
        lines: [
          `pending=${result.pending}`,
          `delay=${result.delay_ms}ms`,
          `flushing=${result.flushing ? "yes" : "no"}`,
          `oldest=${result.oldest_ts || "-"}`,
          `due=${result.due_at || "-"}`,
          ...result.messages.map(
            (message, index) =>
              `${index + 1}. ${message.ts} attachment=${message.has_attachment ? message.attachment_type || "yes" : "no"} ${preview(message.text_preview, 70)}`
          ),
        ],
      };
    },
  },
  {
    name: "events",
    usage: "/events [type]",
    description: "查看最近 control events",
    run: async (args) => {
      const type = args.join(" ").trim() || undefined;
      const result = await api.getControlEvents({ type, limit: 5 });
      return {
        kind: result.count > 0 ? "success" : "warning",
        title: type ? `Events: ${type}` : "Recent Events",
        lines:
          result.events.length > 0
            ? result.events.map((event, index) => {
                const payload = JSON.stringify(event.payload);
                return `${index + 1}. ${event.created_at} ${event.event_type} ${preview(payload, 110)}`;
              })
            : ["没有 control events"],
      };
    },
  },
  {
    name: "tmux",
    usage: "/tmux [session]",
    description: "查看 tmux session 列表和最近输出",
    run: async (args) => {
      const sessions = await api.terminalSessions();
      const session = args[0] || sessions.sessions[0] || "horizon-chat";
      const capture = await api.terminalCapture(session, 60);
      return {
        kind: sessions.sessions.includes(session) ? "success" : "warning",
        title: `tmux: ${capture.session}`,
        lines: [
          `sessions=${sessions.sessions.length ? sessions.sessions.join(", ") : "(none)"}`,
          ...tailLines(capture.output, 12),
        ],
      };
    },
  },
  {
    name: "api",
    usage: "/api",
    description: "显示 API 计数和最近错误",
    run: () => {
      const state = useApiDiagnostics.getState();
      return {
        kind: state.failedRequests > 0 ? "warning" : "success",
        title: "API Telemetry",
        lines: [
          `total=${state.totalRequests}`,
          `ok=${state.okRequests}`,
          `failed=${state.failedRequests}`,
          `timeouts=${state.timeoutRequests}`,
          ...state.recentFailures.map(
            (failure) =>
              `#${failure.id} ${failure.kind} ${failure.status ?? "-"} ${failure.method} ${failure.path} ${failure.durationMs}ms ${failure.message}`
          ),
        ],
      };
    },
  },
  {
    name: "failures",
    aliases: ["logs"],
    usage: "/failures",
    description: "显示最近 API 失败记录；/logs 为别名",
    run: () => {
      const failures = useApiDiagnostics.getState().recentFailures;
      return {
        kind: failures.length > 0 ? "warning" : "success",
        title: "Recent Failures",
        lines:
          failures.length > 0
            ? failures.map(
                (failure) =>
                  `#${failure.id} ${failure.at} ${failure.kind} ${failure.status ?? "-"} ${failure.method} ${failure.path} ${failure.durationMs}ms ${failure.message}`
              )
            : ["最近没有 API 失败记录"],
      };
    },
  },
  {
    name: "context",
    aliases: ["ctx"],
    usage: "/context",
    description: "读取当前 context usage",
    run: async () => ({
      kind: "info",
      title: "Context Usage",
      lines: formatContext(await api.getContextUsage()),
    }),
  },
  {
    name: "refresh-session",
    usage: "/refresh-session [reason]",
    description: "手动请求刷新聊天 session",
    run: async (args) => {
      const reason = args.join(" ").trim() || "terminal";
      const result = await api.refreshSession(reason);
      return {
        kind: "success",
        title: "Session Refresh Requested",
        lines: [
          `request_id=${result.request_id}`,
          `status=${result.status}`,
          `reason=${result.reason}`,
          `applied_at=${result.applied_at || "-"}`,
          `completed_at=${result.completed_at || "-"}`,
        ],
      };
    },
  },
  {
    name: "push",
    usage: "/push test",
    description: "发送一条测试 Web Push",
    run: async (args) => {
      if (args[0] !== "test") {
        return {
          kind: "warning",
          title: "Usage",
          lines: ["用法: /push test"],
        };
      }
      const result = await api.pushTest();
      return {
        kind: result.ok ? "success" : "warning",
        title: "Push Test",
        lines: [`ok=${result.ok ? "yes" : "no"} configured=${result.configured ? "yes" : "no"}`],
      };
    },
  },
  {
    name: "bark",
    usage: "/bark test",
    description: "发送一条测试 Bark 推送",
    run: async (args) => {
      if (args[0] !== "test") {
        const status = await api.barkStatus();
        return {
          kind: status.registered ? "success" : "warning",
          title: "Bark Status",
          lines: [`registered=${status.registered ? "yes" : "no"}`, `devices=${status.count}`],
        };
      }
      const result = await api.barkTest();
      return {
        kind: result.ok ? "success" : "warning",
        title: "Bark Test",
        lines: [`ok=${result.ok ? "yes" : "no"}`],
      };
    },
  },
  {
    name: "retry-failed",
    usage: "/retry-failed",
    description: "重试当前本地失败消息",
    run: async () => {
      const state = useChat.getState();
      const count = state.messages.filter((m) => m.status === "failed").length;
      if (count === 0) {
        return {
          kind: "success",
          title: "No Failed Messages",
          lines: ["当前没有失败消息"],
        };
      }
      await state.retryAllFailed();
      return {
        kind: "warning",
        title: "Retry Queued",
        lines: [`已尝试重发 ${count} 条失败消息`],
      };
    },
  },
  {
    name: "search",
    usage: "/search <关键词>",
    description: "搜索聊天记录，显示前 5 条",
    run: async (args) => {
      const query = args.join(" ").trim();
      if (!query) {
        return {
          kind: "warning",
          title: "Usage",
          lines: ["用法: /search UNIT-A说过什么"],
        };
      }
      const result = await api.search(query);
      const messages = result.messages.slice(0, 5);
      return {
        kind: messages.length > 0 ? "success" : "warning",
        title: `Search: ${query}`,
        lines:
          messages.length > 0
            ? messages.map(formatMessage)
            : ["没有找到匹配消息"],
      };
    },
  },
  {
    name: "storage",
    usage: "/storage",
    description: "查看本机 localStorage 摘要，不显示 secret 内容",
    run: () => {
      const snapshot = inspectStorage();
      return {
        kind: snapshot.available ? "info" : "warning",
        title: "Local Storage",
        lines: snapshot.available
          ? [
              `keys=${snapshot.entries.length}`,
              `bytes=${snapshot.totalBytes}`,
              ...snapshot.entries.map(
                (entry) =>
                  `${entry.protected ? "*" : "-"} ${entry.key} ${entry.bytes}B`
              ),
            ]
          : ["当前运行环境不支持枚举本地缓存"],
      };
    },
  },
  {
    name: "offline",
    usage: "/offline",
    description: "查看聊天离线缓存状态",
    run: () => {
      const snapshot = inspectChatCache();
      const mirror = inspectOfflineMirror();
      return {
        kind:
          (snapshot.available && snapshot.messageCount > 0) ||
          (mirror.available && (mirror.counts.chat_messages > 0 || mirror.counts.companion_notes > 0 || mirror.counts.mood_events > 0))
            ? "success"
            : "warning",
        title: "Offline Cache",
        lines: snapshot.available || mirror.available
          ? [
              `chat_cache_messages=${snapshot.messageCount}`,
              `chat_cache_saved_at=${snapshot.savedAt || "-"}`,
              `mirror_chat=${mirror.counts.chat_messages}`,
              `mirror_notes=${mirror.counts.companion_notes}`,
              `mirror_moods=${mirror.counts.mood_events}`,
              `mirror_last_pulled_at=${mirror.lastPulledAt || "-"}`,
              `bytes=${snapshot.bytes + mirror.bytes}`,
            ]
          : ["当前运行环境不支持离线缓存"],
      };
    },
  },
  {
    name: "clear-cache",
    usage: "/clear-cache",
    description: "清理本机普通缓存，保留 serverUrl 和 secret",
    run: () => {
      const deleted = clearLocalCache({ keepConnection: true });
      useApiDiagnostics.getState().clear();
      return {
        kind: "success",
        title: "Local Cache Cleared",
        lines: [`deleted_keys=${deleted}`, "已保留 serverUrl / secret，并清空 API 诊断计数"],
      };
    },
  },
  {
    name: "clear-api",
    usage: "/clear-api",
    description: "清空本机 API 诊断计数",
    run: () => {
      useApiDiagnostics.getState().clear();
      return {
        kind: "success",
        title: "API Telemetry Cleared",
        lines: ["已清空本机 API 诊断记录"],
      };
    },
  },
];

function normalizeInput(input: string) {
  const trimmed = input.trim();
  const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const [name = "", ...args] = withoutSlash.split(/\s+/).filter(Boolean);
  return { name: name.toLowerCase(), args };
}

export async function runTerminalCommand(input: string): Promise<TerminalResult> {
  const { name, args } = normalizeInput(input);
  if (!name) {
    return {
      kind: "warning",
      title: "Empty Command",
      lines: ["输入 /help 查看可用命令"],
    };
  }

  const command = commands.find(
    (cmd) => cmd.name === name || cmd.aliases?.includes(name)
  );
  if (!command) {
    return {
      kind: "error",
      title: "Unknown Command",
      lines: [`没有这个命令: ${name}`, "输入 /help 查看可用命令"],
    };
  }

  try {
    return await command.run(args);
  } catch (error) {
    return {
      kind: "error",
      title: "Command Failed",
      lines: [error instanceof Error ? error.message : String(error)],
    };
  }
}
