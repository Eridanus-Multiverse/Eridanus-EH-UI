import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";
import { api, ContextUsage } from "../../services/api";
import { checkPushSupport, isPushSubscribed } from "../../services/push";
import { clearLocalCache, inspectStorage, StorageSnapshot } from "../../services/storage";
import { inspectChatCache } from "../../services/offlineCache";
import { inspectOfflineMirror, OfflineMirrorSnapshot } from "../../services/offlineMirror";
import { useApiDiagnostics } from "../../stores/apiDiagnosticsStore";
import { useChat } from "../../stores/chatStore";
import { useConnection } from "../../stores/connectionStore";
import { colors, fonts } from "../../theme/colors";

type CheckState = "idle" | "ok" | "warn" | "error";

interface CheckRow {
  label: string;
  value: string;
  state: CheckState;
  detail?: string;
}

interface RemoteDiagnostics {
  api: CheckRow;
  context: CheckRow;
  tmux: CheckRow;
  webPush: CheckRow;
  bark: CheckRow;
}

const initialRemote: RemoteDiagnostics = {
  api: { label: "API", value: "未检查", state: "idle" },
  context: { label: "Context", value: "未检查", state: "idle" },
  tmux: { label: "tmux Live", value: "未检查", state: "idle" },
  webPush: { label: "Web Push", value: "未检查", state: "idle" },
  bark: { label: "Bark", value: "未检查", state: "idle" },
};

const STATE_COLORS: Record<CheckState, string> = {
  idle: colors.textMuted,
  ok: colors.success,
  warn: colors.warning,
  error: colors.error,
};

function shortError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ts: string | null): string {
  if (!ts) return "未知";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString();
}

function contextRow(context: ContextUsage): CheckRow {
  const ratio = Math.round(context.ratio * 100);
  const value = `${context.threshold_band} · ${ratio}%`;
  const state: CheckState =
    context.threshold_band === "emergency" || context.threshold_band === "hard"
      ? "error"
      : context.threshold_band === "soft"
        ? "warn"
        : "ok";
  return {
    label: "Context",
    value,
    state,
    detail: `${context.estimated_tokens}/${context.token_budget} tokens · ${context.turn_count ?? "?"} turns · jsonl ${formatBytes(context.jsonl_size_bytes)} · ${formatTime(context.measured_at)}`,
  };
}

function readRuntimeRows(): CheckRow[] {
  const version = Constants.expoConfig?.version || "unknown";
  const platform = `${Platform.OS}${Platform.OS === "web" ? " / PWA" : ""}`;

  if (Platform.OS !== "web" || typeof window === "undefined") {
    return [
      { label: "App", value: `v${version}`, state: "ok" },
      { label: "Runtime", value: platform, state: "ok" },
    ];
  }

  const nav = window.navigator as any;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    nav.standalone === true;
  const notification =
    typeof Notification === "undefined" ? "无 Notification" : Notification.permission;
  const serviceWorker =
    "serviceWorker" in navigator ? "可用" : "不可用";

  return [
    { label: "App", value: `v${version}`, state: "ok" },
    {
      label: "Runtime",
      value: standalone ? "PWA standalone" : "Browser tab",
      state: standalone ? "ok" : "warn",
      detail: platform,
    },
    { label: "Service Worker", value: serviceWorker, state: serviceWorker === "可用" ? "ok" : "warn" },
    { label: "通知权限", value: notification, state: notification === "granted" ? "ok" : "warn" },
  ];
}

function StatusRow({ row }: { row: CheckRow }) {
  return (
    <View style={styles.row}>
      <View style={[styles.statusDot, { backgroundColor: STATE_COLORS[row.state] }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {row.value}
          </Text>
        </View>
        {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
      </View>
    </View>
  );
}

function RowGroup({ title, rows }: { title: string; rows: CheckRow[] }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupRows}>
        {rows.map((row) => (
          <StatusRow key={`${row.label}-${row.value}`} row={row} />
        ))}
      </View>
    </View>
  );
}

export default function DiagnosticsPanel() {
  const serverUrl = useConnection((state) => state.serverUrl);
  const secret = useConnection((state) => state.secret);
  const connected = useConnection((state) => state.connected);
  const configured = useConnection((state) => state.configured);
  const checkConnection = useConnection((state) => state.checkConnection);
  const messageCount = useChat((state) => state.messages.length);
  const polling = useChat((state) => state.polling);
  const pollInterval = useChat((state) => state.pollInterval);
  const pollFailures = useChat((state) => state.pollFailures);
  const lastPollError = useChat((state) => state.lastPollError);
  const lastSendError = useChat((state) => state.lastSendError);
  const cacheHydrated = useChat((state) => state.cacheHydrated);
  const failedMessages = useChat((state) => state.messages.filter((m) => m.status === "failed").length);
  const sendingMessages = useChat((state) => state.messages.filter((m) => m.status === "sending").length);
  const apiTotal = useApiDiagnostics((state) => state.totalRequests);
  const apiOk = useApiDiagnostics((state) => state.okRequests);
  const apiFailed = useApiDiagnostics((state) => state.failedRequests);
  const apiTimeouts = useApiDiagnostics((state) => state.timeoutRequests);
  const apiLastFailure = useApiDiagnostics((state) => state.lastFailure);
  const clearApiDiagnostics = useApiDiagnostics((state) => state.clear);

  const [remote, setRemote] = useState<RemoteDiagnostics>(initialRemote);
  const [runtimeRows, setRuntimeRows] = useState<CheckRow[]>(() => readRuntimeRows());
  const [storageSnapshot, setStorageSnapshot] = useState<StorageSnapshot>(() => inspectStorage());
  const [chatCacheSnapshot, setChatCacheSnapshot] = useState(() => inspectChatCache());
  const [mirrorSnapshot, setMirrorSnapshot] = useState<OfflineMirrorSnapshot>(() => inspectOfflineMirror());
  const [companionRows, setCompanionRows] = useState<CheckRow[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cacheMsg, setCacheMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const connectionRows = useMemo<CheckRow[]>(
    () => [
      {
        label: "服务器",
        value: configured ? serverUrl || "已配置" : "未配置",
        state: configured ? "ok" : "warn",
      },
      {
        label: "Auth",
        value: secret ? "Token 已保存" : "Token 缺失",
        state: secret ? "ok" : "error",
      },
      {
        label: "连接",
        value: connected ? "已连接" : "未连接",
        state: connected ? "ok" : "warn",
      },
    ],
    [configured, connected, secret, serverUrl],
  );

  const chatRows = useMemo<CheckRow[]>(
    () => [
      {
        label: "消息",
        value: `${messageCount} 条`,
        state: failedMessages > 0 || pollFailures > 0 ? "warn" : "ok",
        detail: `sending=${sendingMessages} · failed=${failedMessages} · polling=${polling ? "on" : "off"} · interval=${pollInterval}ms`,
      },
      {
        label: "错误",
        value: lastSendError || lastPollError ? "有记录" : "无",
        state: lastSendError || lastPollError ? "warn" : "ok",
        detail: [lastSendError ? `send=${lastSendError}` : "", lastPollError ? `poll=${lastPollError}` : ""]
          .filter(Boolean)
          .join(" · ") || undefined,
      },
    ],
    [failedMessages, lastPollError, lastSendError, messageCount, pollFailures, pollInterval, polling, sendingMessages],
  );

  const apiRows = useMemo<CheckRow[]>(
    () => [
      {
        label: "请求",
        value: `${apiOk}/${apiTotal} ok`,
        state: apiFailed > 0 ? "warn" : "ok",
        detail: `failed=${apiFailed} · timeouts=${apiTimeouts}`,
      },
      ...(apiLastFailure
        ? [
            {
              label: "最后错误",
              value: `${apiLastFailure.kind} · ${apiLastFailure.status ?? "-"}`,
              state: "warn" as CheckState,
              detail: `${apiLastFailure.method} ${apiLastFailure.path} · ${apiLastFailure.durationMs}ms`,
            },
          ]
        : []),
    ],
    [apiFailed, apiLastFailure, apiOk, apiTimeouts, apiTotal],
  );

  const cacheRows = useMemo<CheckRow[]>(
    () => [
      {
        label: "本地缓存",
        value: storageSnapshot.available
          ? `${storageSnapshot.entries.length} keys`
          : "不可枚举",
        state: storageSnapshot.available ? "ok" : "warn",
        detail: storageSnapshot.available ? formatBytes(storageSnapshot.totalBytes) : undefined,
      },
      {
        label: "离线消息",
        value: chatCacheSnapshot.available
          ? `${chatCacheSnapshot.messageCount} 条`
          : "不可用",
        state: chatCacheSnapshot.messageCount > 0 ? "ok" : "warn",
        detail: chatCacheSnapshot.available
          ? `${cacheHydrated ? "已激活" : "未激活"} · ${formatBytes(chatCacheSnapshot.bytes)}`
          : undefined,
      },
      {
        label: "同步镜像",
        value: mirrorSnapshot.available
          ? `${mirrorSnapshot.counts.chat_messages}/${mirrorSnapshot.counts.companion_notes}/${mirrorSnapshot.counts.mood_events}`
          : "不可用",
        state: mirrorSnapshot.counts.chat_messages > 0 || mirrorSnapshot.counts.companion_notes > 0 || mirrorSnapshot.counts.mood_events > 0 ? "ok" : "warn",
        detail: mirrorSnapshot.available
          ? `chat/notes/moods · ${formatBytes(mirrorSnapshot.bytes)} · last=${formatTime(mirrorSnapshot.lastPulledAt)}`
          : undefined,
      },
    ],
    [cacheHydrated, chatCacheSnapshot, mirrorSnapshot, storageSnapshot],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setRuntimeRows(readRuntimeRows());
    setStorageSnapshot(inspectStorage());
    setChatCacheSnapshot(inspectChatCache());
    setMirrorSnapshot(inspectOfflineMirror());

    const next: RemoteDiagnostics = { ...initialRemote };

    try {
      const ok = await checkConnection();
      next.api = { label: "API", value: ok ? "认证通过" : "认证失败", state: ok ? "ok" : "error" };
    } catch (error) {
      next.api = { label: "API", value: "检查失败", state: "error", detail: shortError(error) };
    }

    try {
      next.context = contextRow(await api.getContextUsage());
    } catch (error) {
      next.context = { label: "Context", value: "读取失败", state: "warn", detail: shortError(error) };
    }

    try {
      const sessions = await api.terminalSessions();
      const target = sessions.sessions.includes("horizon-chat") ? "horizon-chat" : sessions.sessions[0];
      if (!target) {
        next.tmux = { label: "tmux", value: "无可用 session", state: "warn" };
      } else {
        const capture = await api.terminalCapture(target, 20);
        const lineCount = capture.output ? capture.output.split("\n").length : 0;
        next.tmux = { label: "tmux", value: `${target} 可读`, state: "ok", detail: `sessions=${sessions.sessions.join(", ")} · ${lineCount} lines` };
      }
    } catch (error) {
      next.tmux = { label: "tmux", value: "读取失败", state: "warn", detail: shortError(error) };
    }

    try {
      const support = checkPushSupport();
      if (!support.supported) {
        next.webPush = { label: "Web Push", value: "不可用", state: "warn", detail: support.reason };
      } else {
        const [localSub, status] = await Promise.all([isPushSubscribed(), api.pushStatus()]);
        next.webPush = { label: "Web Push", value: `${localSub ? "已订阅" : "未订阅"} · ${status.count} 台`, state: localSub && status.enabled ? "ok" : "warn" };
      }
    } catch (error) {
      next.webPush = { label: "Web Push", value: "检查失败", state: "warn", detail: shortError(error) };
    }

    try {
      const status = await api.barkStatus();
      next.bark = { label: "Bark", value: `${status.registered ? "已注册" : "未注册"} · ${status.count} 台`, state: status.registered ? "ok" : "warn" };
    } catch (error) {
      next.bark = { label: "Bark", value: "检查失败", state: "warn", detail: shortError(error) };
    }

    try {
      const status = await api.companionsStatus();
      setCompanionRows(
        status.companions.map((item) => ({
          label: `${item.icon} ${item.label}`,
          value: item.status,
          state: item.status === "online" ? "ok" : item.status === "warning" ? "warn" : "error",
          detail: [item.detail, item.last_seen_at ? `last=${formatTime(item.last_seen_at)}` : ""].filter(Boolean).join(" · "),
        })),
      );
    } catch (error) {
      setCompanionRows([{ label: "Companions", value: "读取失败", state: "warn", detail: shortError(error) }]);
    }

    setRemote(next);
    setCheckedAt(new Date().toLocaleTimeString());
    setBusy(false);
  }, [checkConnection]);

  const handleClearCache = useCallback(() => {
    const deleted = clearLocalCache({ keepConnection: true });
    clearApiDiagnostics();
    setStorageSnapshot(inspectStorage());
    setChatCacheSnapshot(inspectChatCache());
    setCacheMsg(`已清理 ${deleted} 个缓存 key`);
  }, [clearApiDiagnostics]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.subtitle}>
            {checkedAt ? `最后检查 ${checkedAt}` : "等待检查"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, busy && styles.disabled]}
          onPress={refresh}
          disabled={busy}
          activeOpacity={0.75}
        >
          <Text style={styles.refreshText}>{busy ? "检查中" : "刷新"}</Text>
        </TouchableOpacity>
      </View>

      {/* Core groups */}
      <RowGroup title="连接" rows={[...connectionRows, remote.api, remote.context]} />
      <RowGroup title="聊天" rows={chatRows} />
      <RowGroup title="缓存" rows={cacheRows} />

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={clearApiDiagnostics} activeOpacity={0.75}>
          <Text style={styles.actionText}>清空 API 记录</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleClearCache} activeOpacity={0.75}>
          <Text style={styles.actionText}>清本机缓存</Text>
        </TouchableOpacity>
      </View>
      {cacheMsg ? <Text style={styles.cacheMsg}>{cacheMsg}</Text> : null}

      {/* Advanced toggle */}
      <TouchableOpacity
        style={styles.advancedToggle}
        onPress={() => setShowAdvanced((v) => !v)}
        activeOpacity={0.75}
      >
        <Text style={styles.advancedText}>
          {showAdvanced ? "收起" : "展开详细"}
        </Text>
      </TouchableOpacity>

      {showAdvanced && (
        <>
          <RowGroup title="API" rows={apiRows} />
          <RowGroup title="推送" rows={[remote.webPush, remote.bark]} />
          <RowGroup title="基础设施" rows={[remote.tmux, ...companionRows]} />
          <RowGroup title="运行环境" rows={runtimeRows} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0c0d22",
    borderWidth: 1,
    borderColor: "rgba(238,195,116,0.26)",
    padding: 14,
    overflow: "hidden" as const,
    ...(Platform.OS === "web" ? { boxShadow: "0 0 8px rgba(238,195,116,0.08), 3px 3px 0 #000" } as any : {}),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  subtitle: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.38)",
  },
  refreshBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "rgba(255,223,146,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.38)",
  },
  refreshText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.pixel.gold,
  },
  disabled: {
    opacity: 0.4,
  },

  group: {
    marginBottom: 14,
  },
  groupTitle: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "rgba(255,223,146,0.55)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  groupRows: {
    gap: 4,
  },

  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "rgba(4,7,16,0.6)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 4,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rowLabel: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "rgba(200,216,240,0.5)",
  },
  rowValue: {
    flexShrink: 1,
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: "#c8d8f0",
    textAlign: "right",
  },
  rowDetail: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.38)",
    lineHeight: 15,
    marginTop: 3,
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.2)",
    backgroundColor: "rgba(4,7,16,0.6)",
  },
  actionText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.5)",
  },
  cacheMsg: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "rgba(200,216,240,0.38)",
    marginBottom: 10,
  },

  advancedToggle: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.38)",
    backgroundColor: "rgba(255,223,146,0.16)",
  },
  advancedText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: colors.pixel.gold,
  },
});
