import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import { useWebViewportFit } from "../../hooks/useWebKeyboard";
import { api, TerminalBlock } from "../../services/api";
import {
  runTerminalCommand,
  TerminalResult,
  TerminalResultKind,
} from "../../services/terminalCommands";
import { colors, fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";

interface TerminalEntry {
  id: number;
  input: string;
  result: TerminalResult;
}

type TerminalMode = "workbench" | "commands";
type LiveState = "idle" | "capturing" | "open" | "error";
type PaneId = "epsilonChat" | "epsilonWork" | "cursaChat" | "cursaWork" | "omicronWork";

interface AnsiSegment {
  text: string;
  color?: string;
  bold?: boolean;
}

interface TerminalPane {
  id: PaneId;
  label: string;
  session: string;
  hint: string;
}

interface OpsBlock { id: string; type: string; text: string; name?: string | null }

interface PaneRuntime {
  output: string;
  state: LiveState;
  error: string;
  updatedAt: string | null;
  blockSource: "transcript" | "none" | null;
  latestBlock: { type: string; text: string } | null;
  // 操作卡片流（终端二期，2026-07-08）：blocks 累积，最近 40 个
  opsBlocks: OpsBlock[];
}

const TERMINAL_PANES: TerminalPane[] = [
  { id: "epsilonChat", label: "UNIT-A Chat", session: "horizon-chat", hint: "chat" },
  { id: "epsilonWork", label: "UNIT-A 工作区", session: "cc", hint: "tmux cc" },
  { id: "cursaChat", label: "UNIT-B Chat", session: "cursa-live", hint: "cyberboss 共享线程" },
  { id: "cursaWork", label: "UNIT-B 工作区", session: "codex", hint: "tmux codex" },
  { id: "omicronWork", label: "UNIT-C 工作区", session: "omicron-work", hint: "opencode" },
];

const PANE_BY_ID = TERMINAL_PANES.reduce(
  (acc, pane) => ({ ...acc, [pane.id]: pane }),
  {} as Record<PaneId, TerminalPane>
);

// 操作卡片流合并：按 id 去重，thinking 不进卡片流（太吵），保留最近 40 个
function mergeOpsBlocks(cur: OpsBlock[], incoming: any[]): OpsBlock[] {
  if (!incoming?.length) return cur;
  const seen = new Set(cur.map((b) => b.id));
  const fresh = incoming
    .filter((b: any) => b?.id && !seen.has(b.id) && (b.type === "tool" || b.type === "assistant" || b.type === "system"))
    .map((b: any) => ({ id: String(b.id), type: String(b.type), text: String(b.text || "").slice(0, 2000), name: b.name || null }));
  if (!fresh.length) return cur;
  return [...cur, ...fresh].slice(-40);
}

const EMPTY_RUNTIME: PaneRuntime = { output: "", state: "idle", error: "", updatedAt: null, blockSource: null, latestBlock: null, opsBlocks: [] };
const EMPTY_PANE_STATE: Record<PaneId, PaneRuntime> = {
  epsilonChat: { ...EMPTY_RUNTIME },
  epsilonWork: { ...EMPTY_RUNTIME },
  cursaChat: { ...EMPTY_RUNTIME },
  cursaWork: { ...EMPTY_RUNTIME },
  omicronWork: { ...EMPTY_RUNTIME },
};

let nextEntryId = 1;

function resultColor(kind: TerminalResultKind) {
  if (kind === "success") return colors.success;
  if (kind === "warning") return colors.accent;
  if (kind === "error") return colors.error;
  return colors.text;
}

const ANSI_COLORS: Record<number, string> = {
  30: "#3f3f70",
  31: "#ff7987",
  32: "#6ce48c",
  33: "#ffdf92",
  34: "#89b1ff",
  35: "#c994ff",
  36: "#64e6ff",
  37: "#efede6",
  90: "#62648a",
  91: "#ff929d",
  92: "#91f3ac",
  93: "#fff0a7",
  94: "#a3c1ff",
  95: "#ddb0ff",
  96: "#96ebff",
  97: "#ffffff",
};

function isSeparatorLine(line: string): boolean {
  const compact = line.trim();
  return compact.length > 40 && /^[─━═=\-_\s]+$/.test(compact);
}

function stripAnsiForFilter(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function parseAnsiLine(line: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let color: string | undefined;
  let bold = false;
  let index = 0;
  const re = /\x1B\[([0-9;]*)m/g;
  let match: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.color === color && last.bold === bold) {
      last.text += text;
    } else {
      segments.push({ text, color, bold });
    }
  };

  while ((match = re.exec(line))) {
    pushText(line.slice(index, match.index));
    const codes = (match[1] || "0").split(";").map((v) => Number(v || "0"));
    for (const code of codes) {
      if (code === 0) {
        color = undefined;
        bold = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 22) {
        bold = false;
      } else if (code === 39) {
        color = undefined;
      } else if (ANSI_COLORS[code]) {
        color = ANSI_COLORS[code];
      }
    }
    index = match.index + match[0].length;
  }
  pushText(line.slice(index));
  return segments.length ? segments : [{ text: "" }];
}

function cleanTerminalLines(output: string): AnsiSegment[][] {
  const cleaned = output.replace(/\r/g, "").replace(/\s+$/g, "");
  if (!cleaned) return [];
  return cleaned
    .split("\n")
    .filter((line) => !isSeparatorLine(stripAnsiForFilter(line)))
    .map(parseAnsiLine);
}

function flattenLine(segments: AnsiSegment[]) {
  return segments.map((segment) => segment.text).join("").trim();
}

export default function TerminalScreen() {
  const insets = useSafeAreaInsets();
  const tabFocused = useIsFocused();
  const isDesktop = useIsDesktop();
  const theme = useThemeTokens();
  const isEH = theme.key === "eventHorizon";
  const containerRef = useRef<any>(null);
  useWebViewportFit(containerRef, insets.bottom);
  const commandScrollRef = useRef<ScrollView>(null);
  const activeScrollRef = useRef<ScrollView>(null);
  // 用 callback ref 绑定：按钮只在 workbench 模式渲染，effect+[] 会在重新挂载后丢监听
  const preventPointerDown = useRef((e: Event) => e.preventDefault()).current;
  const liveSendBtnEl = useRef<HTMLElement | null>(null);
  const liveSendBtnRef = useCallback((node: View | null) => {
    if (Platform.OS !== "web") return;
    if (liveSendBtnEl.current) liveSendBtnEl.current.removeEventListener("pointerdown", preventPointerDown);
    const el = node as unknown as HTMLElement | null;
    liveSendBtnEl.current = el;
    if (el) el.addEventListener("pointerdown", preventPointerDown);
  }, [preventPointerDown]);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<TerminalMode>("workbench");
  const [sessions, setSessions] = useState<string[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [activePaneId, setActivePaneId] = useState<PaneId>("epsilonChat");
  const [paneState, setPaneState] = useState<Record<PaneId, PaneRuntime>>(EMPTY_PANE_STATE);
  // 160 行足够手机屏 + 渲染轻（旧值 500 是大文本重排卡顿的一半元凶）；
  // 「全文」拉 2000 行（后端上限同步放宽）。用 ref 保证 refreshPane 闭包
  // 永远读到最新值——setTimeout 里调旧闭包导致按钮无效的 bug 已修。
  const [liveLineCount, setLiveLineCount] = useState(160);
  const liveLineCountRef = useRef(160);
  liveLineCountRef.current = liveLineCount;
  const failCountRef = useRef(0);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  // 操作卡片流（终端二期）：折叠条 + 展开卡片列表 + 单卡展开全文
  const [opsOpen, setOpsOpen] = useState(false);
  const [opsExpandedId, setOpsExpandedId] = useState<string | null>(null);
  const [liveInput, setLiveInput] = useState("");
  const [liveSending, setLiveSending] = useState(false);
  const liveInputRef = useRef<TextInput>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const idleCountRef = useRef(0);
  const prevOutputRef = useRef("");
  const blocksInitRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const wsSessionRef = useRef<string>("");
  const blocksOffsetRef = useRef<Record<string, number>>({});
  const [entries, setEntries] = useState<TerminalEntry[]>([
    {
      id: nextEntryId++,
      input: "/help",
      result: {
        kind: "info",
        title: "Terminal Ready",
        lines: [
          "输入 /help 查看命令",
          "常用: /status, /health, /companions, /claudemd, /storage",
        ],
      },
    },
  ]);

  const activePane = PANE_BY_ID[activePaneId];
  const activeRuntime = paneState[activePaneId];

  const pinViewport = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      requestAnimationFrame(() => window.scrollTo(0, 0));
      setTimeout(() => window.scrollTo(0, 0), 100);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    // network failures here used to surface as unhandled rejections every poll tick
    try {
      const result = await api.terminalSessions();
      setSessions(result.sessions);
      setSessionsLoaded(true);
      return result.sessions;
    } catch {
      return [];
    }
  }, []);

  const refreshPane = useCallback(
    async (pane: TerminalPane, knownSessions?: string[]) => {
      const available = knownSessions ?? sessions;
      if (available.length > 0 && !available.includes(pane.session)) {
        setPaneState((current) => ({
          ...current,
          [pane.id]: {
            ...current[pane.id],
            state: "error",
            error: `${pane.session} 不在可用 tmux session 中`,
          },
        }));
        return;
      }

      // 静默刷新（2026-07-07 抄 CcCompanion 的克制）：已有内容时不切 capturing
      // 状态——旧行为每 2s 把顶栏闪成 "..." 再闪回 OPEN，就是"刷新鬼畜"本体。
      setPaneState((current) => {
        if (current[pane.id].output) return current;
        return {
          ...current,
          [pane.id]: { ...current[pane.id], state: "capturing", error: "" },
        };
      });

      try {
        const needReset = !blocksInitRef.current.has(pane.session);
        const savedOffset = blocksOffsetRef.current[pane.session];
        const [captureResult, blocksResult] = await Promise.all([
          api.terminalCapture(pane.session, liveLineCountRef.current),
          api.terminalBlocks(pane.session, {
            reset: needReset,
            offset: needReset ? undefined : savedOffset,
          }).catch(() => null),
        ]);
        if (blocksResult) {
          blocksInitRef.current.add(pane.session);
          if (blocksResult.offset != null) blocksOffsetRef.current[pane.session] = blocksResult.offset;
        }
        const changed = captureResult.output !== prevOutputRef.current;
        prevOutputRef.current = captureResult.output;
        if (changed) {
          idleCountRef.current = 0;
        } else {
          idleCountRef.current = Math.min(idleCountRef.current + 1, 10);
        }
        const blocks = blocksResult?.blocks || [];
        const latestBlock = blocks.length ? blocks[blocks.length - 1] : null;
        const hasFinal = blocks.some((b: any) => b.final);
        const hasActivity = changed || (latestBlock != null);
        if (hasActivity) idleCountRef.current = 0;
        failCountRef.current = 0;
        setPaneState((current) => {
          if (!changed && !latestBlock && current[pane.id].state === "open" && !current[pane.id].error) return current;
          return {
            ...current,
            [pane.id]: {
              output: captureResult.output,
              state: "open",
              error: "",
              updatedAt: new Date().toLocaleTimeString(),
              blockSource: blocksResult?.source ?? null,
              latestBlock: hasFinal ? null : (latestBlock ? { type: latestBlock.type, text: latestBlock.text?.slice(0, 120) || "" } : current[pane.id].latestBlock),
              opsBlocks: mergeOpsBlocks(current[pane.id].opsBlocks, blocks),
            },
          };
        });
      } catch (error) {
        // 失败静默（抄 CcCompanion）：网络抖动/后端重启时保留旧画面继续重试，
        // 连续 3 次失败才亮错误条——旧行为一次失败立刻整屏切 error。
        failCountRef.current += 1;
        if (failCountRef.current < 3) return;
        setPaneState((current) => {
          if (current[pane.id].output) {
            return {
              ...current,
              [pane.id]: {
                ...current[pane.id],
                error: "连接中断，重连中…",
              },
            };
          }
          return {
            ...current,
            [pane.id]: {
              ...current[pane.id],
              state: "error",
              error: error instanceof Error ? error.message : String(error),
            },
          };
        });
      }
    },
    [sessions, liveLineCount]
  );

  const refreshAll = useCallback(async () => {
    let knownSessions = sessions;
    if (!sessionsLoaded || knownSessions.length === 0) {
      knownSessions = await loadSessions();
    }
    await refreshPane(PANE_BY_ID[activePaneId], knownSessions);
    // 滚动交给 output 变化的 useEffect——旧版这里每个 tick 无条件 scrollToEnd，
    // 内容没变也硬滚一次，是"抽搐"的另一半元凶（2026-07-07 抄 CcCompanion 修）。
  }, [activePaneId, loadSessions, refreshPane, sessions, sessionsLoaded]);

  useEffect(() => {
    if (mode !== "workbench" || !tabFocused) return;
    refreshAll().catch(() => {});
  }, [mode, tabFocused, refreshAll]);

  useEffect(() => {
    if (mode !== "workbench" || !autoRefresh || !tabFocused) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      refreshAll().catch(() => {});
      const wsActive = wsRef.current?.readyState === WebSocket.OPEN;
      const interval = wsActive ? 10000 : (idleCountRef.current < 3 ? 2000 : 8000);
      timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, 2000);
    return () => clearTimeout(timer);
  }, [autoRefresh, mode, refreshAll, tabFocused]);

  useEffect(() => {
    if (!userScrolledUp) {
      requestAnimationFrame(() => {
        activeScrollRef.current?.scrollToEnd({ animated: false });
      });
    }
  }, [activePaneId, activeRuntime.output, userScrolledUp]);

  // P3: WebSocket for real-time block pushes — 断线指数退避自动重连（2026-07-07），
  // 后端重启后 1s/2s/4s/…/15s 内自己接回来，不再留一条死链等用户切页。
  useEffect(() => {
    if (mode !== "workbench" || !tabFocused || Platform.OS !== "web") return;
    const session = activePane.session;
    if (wsSessionRef.current === session && wsRef.current?.readyState === WebSocket.OPEN) return;
    wsRef.current?.close();
    wsSessionRef.current = session;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const connect = () => {
      if (disposed) return;
    try {
      const wsOffset = blocksOffsetRef.current[session];
      const url = api.terminalLiveWsUrl(session, wsOffset);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => { attempts = 0; };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "blocks" && Array.isArray(data.blocks) && data.blocks.length > 0) {
            const blocks: TerminalBlock[] = data.blocks;
            const latest = blocks[blocks.length - 1];
            const hasFinal = blocks.some((b) => b.final);
            if (data.offset != null) blocksOffsetRef.current[session] = data.offset;
            idleCountRef.current = 0;
            setPaneState((current) => ({
              ...current,
              [activePaneId]: {
                ...current[activePaneId],
                latestBlock: hasFinal ? null : { type: latest.type, text: latest.text?.slice(0, 120) || "" },
                opsBlocks: mergeOpsBlocks(current[activePaneId].opsBlocks, blocks),
              },
            }));
          }
          if (data.type === "capture" && data.output) {
            const changed = data.output !== prevOutputRef.current;
            if (changed) {
              prevOutputRef.current = data.output;
              idleCountRef.current = 0;
              setPaneState((current) => ({
                ...current,
                [activePaneId]: {
                  ...current[activePaneId],
                  output: data.output,
                  updatedAt: new Date().toLocaleTimeString(),
                },
              }));
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (disposed) return;
        attempts += 1;
        const delay = Math.min(1000 * 2 ** (attempts - 1), 15000);
        reconnectTimer = setTimeout(connect, delay);
      };
    } catch {
      if (!disposed) {
        attempts += 1;
        reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** (attempts - 1), 15000));
      }
    }
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [mode, tabFocused, activePane.session, activePaneId]);

  const appendEntry = useCallback((inputText: string, result: TerminalResult) => {
    setEntries((current) => [
      ...current,
      {
        id: nextEntryId++,
        input: inputText,
        result,
      },
    ]);
    requestAnimationFrame(() => {
      commandScrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const runInput = useCallback(async () => {
    const command = input.trim();
    if (!command || busy) return;
    setInput("");
    setBusy(true);
    const result = await runTerminalCommand(command);
    appendEntry(command, result);
    setBusy(false);
  }, [appendEntry, busy, input]);

  const quickCommand = useCallback(
    async (command: string) => {
      if (busy) return;
      setBusy(true);
      const result = await runTerminalCommand(command);
      appendEntry(command, result);
      setBusy(false);
    },
    [appendEntry, busy]
  );

  const sendToActivePane = useCallback(async () => {
    const value = liveInput.trim();
    if (!value || liveSending) return;
    setLiveSending(true);
    setPaneState((current) => ({
      ...current,
      [activePaneId]: { ...current[activePaneId], error: "" },
    }));
    try {
      await api.terminalSend(activePane.session, { text: value });
      setLiveInput("");
      await refreshPane(activePane, sessions);
    } catch (error) {
      setPaneState((current) => ({
        ...current,
        [activePaneId]: {
          ...current[activePaneId],
          state: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setLiveSending(false);
    }
  }, [activePane, activePaneId, liveInput, liveSending, refreshPane, sessions]);

  const sendKeyToActivePane = useCallback(
    async (key: string) => {
      if (liveSending) return;
      setLiveSending(true);
      try {
        await api.terminalSend(activePane.session, { key });
        await refreshPane(activePane, sessions);
      } catch (error) {
        setPaneState((current) => ({
          ...current,
          [activePaneId]: {
            ...current[activePaneId],
            state: "error",
            error: error instanceof Error ? error.message : String(error),
          },
        }));
      } finally {
        setLiveSending(false);
      }
    },
    [activePane, activePaneId, liveSending, refreshPane, sessions]
  );

  const sendRepeatedKeyToActivePane = useCallback(
    async (key: string, count: number) => {
      if (liveSending) return;
      setLiveSending(true);
      try {
        for (let i = 0; i < count; i += 1) {
          await api.terminalSend(activePane.session, { key });
          if (i < count - 1) await new Promise((resolve) => setTimeout(resolve, 80));
        }
        await refreshPane(activePane, sessions);
      } catch (error) {
        setPaneState((current) => ({
          ...current,
          [activePaneId]: {
            ...current[activePaneId],
            state: "error",
            error: error instanceof Error ? error.message : String(error),
          },
        }));
      } finally {
        setLiveSending(false);
      }
    },
    [activePane, activePaneId, liveSending, refreshPane, sessions]
  );

  const wsConnected = wsRef.current?.readyState === WebSocket.OPEN;
  const headerStatus =
    mode === "workbench"
      ? autoRefresh
        ? wsConnected ? "WS LIVE" : (idleCountRef.current < 3 ? "LIVE 2S" : "AUTO 8S")
        : "MANUAL"
      : busy
        ? "RUNNING"
        : "READY";

  const renderTerminalLines = (pane: TerminalPane, active: boolean) => {
    const runtime = paneState[pane.id];
    const allLines = cleanTerminalLines(runtime.output);
    const lines = active ? allLines : allLines.slice(-12);
    if (runtime.error) {
      return <Text style={styles.liveErrorInline}>{runtime.error}</Text>;
    }
    if (lines.length === 0) {
      return <Text style={styles.liveEmpty}>// 等待 tmux 输出...</Text>;
    }
    return lines.map((segments, index) => (
      <Text key={`${pane.id}-${index}-${flattenLine(segments)}`} style={styles.liveLine} numberOfLines={active ? undefined : 1}>
        {segments.map((segment, partIndex) => (
          <Text
            key={`${pane.id}-${index}-${partIndex}`}
            style={[
              segment.color ? { color: segment.color } : null,
              segment.bold ? styles.liveLineBold : null,
            ]}
          >
            {segment.text || " "}
          </Text>
        ))}
      </Text>
    ));
  };

  return (
    <View
      ref={containerRef}
      style={[styles.container, { paddingTop: insets.top }, isEH && { backgroundColor: "#000" }]}
    >
      <View style={[styles.header, isEH && { backgroundColor: "#000", borderBottomColor: "rgba(255,255,255,0.12)" }]}>
        <Text style={[styles.headerTitle, isEH && { color: "rgba(255,255,255,0.85)", fontFamily: "Silkscreen" }]}>
          {isEH ? "TERMINAL" : "＞_ Terminal"}
        </Text>
        <Text style={[styles.headerMeta, isEH && { color: "rgba(120,200,120,0.7)", fontFamily: "Silkscreen" }]}>{headerStatus}</Text>
      </View>

      {mode === "commands" ? (
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, styles.modeButtonActive]}
            onPress={() => setMode("workbench")}
            activeOpacity={0.75}
          >
            <Text style={[styles.modeText, styles.modeTextActive]}>BACK TO TMUX</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {mode === "commands" ? (
        <>
          <ScrollView
            ref={commandScrollRef}
            style={styles.output}
            contentContainerStyle={styles.outputContent}
          >
            {entries.map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <Text style={styles.prompt}>$ {entry.input}</Text>
                <Text style={[styles.resultTitle, { color: resultColor(entry.result.kind) }]}>
                  {entry.result.title}
                </Text>
                {entry.result.lines.map((line, index) => (
                  <Text key={`${entry.id}-${index}`} style={styles.line}>
                    {line}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={styles.quickRow}>
            {["/status", "/health", "/companions", "/tmux"].map((command) => (
              <TouchableOpacity
                key={command}
                style={styles.quickButton}
                onPress={() => quickCommand(command)}
                disabled={busy}
                activeOpacity={0.75}
              >
                <Text style={styles.quickText}>{command.replace("/", "")}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.commandInputRow, { paddingBottom: insets.bottom + 10 }]}>
            <Text style={styles.inputPrefix}>$</Text>
            <TextInput
              style={styles.commandInput}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={runInput}
              onFocus={pinViewport}
              placeholder="/help"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              editable={!busy}
            />
            <TouchableOpacity
              style={[styles.runButton, busy && styles.disabled]}
              onPress={runInput}
              disabled={busy || !input.trim()}
              activeOpacity={0.75}
            >
              <Text style={styles.runText}>{busy ? "..." : "RUN"}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={[styles.workbench, isEH && { backgroundColor: "#000" }]}>
          {!isDesktop && (
            <View style={[styles.workbenchToolbar, isEH && { backgroundColor: "#000", borderBottomColor: "rgba(255,255,255,0.1)" }]}>
              <View style={styles.sessionTabs}>
                {TERMINAL_PANES.map((pane) => {
                  const active = pane.id === activePaneId;
                  return (
                    <TouchableOpacity
                      key={pane.id}
                      style={[styles.sessionTab, active && styles.sessionTabActive,
                        isEH && { backgroundColor: "rgba(16,16,18,0.9)", borderColor: "rgba(255,255,255,0.08)" },
                        isEH && active && { backgroundColor: "rgba(32,32,34,0.95)", borderColor: "rgba(255,255,255,0.25)" },
                      ]}
                      onPress={() => { setActivePaneId(pane.id); setUserScrolledUp(false); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.sessionTabText, active && styles.sessionTabTextActive,
                        isEH && { color: "rgba(255,255,255,0.3)" },
                        isEH && active && { color: "rgba(255,255,255,0.85)" },
                      ]}>
                        {pane.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.compactToolRow}>
                <Text style={[styles.compactMeta, isEH && { color: "rgba(255,255,255,0.3)", fontFamily: "Silkscreen" }]}>
                  {activeRuntime.updatedAt ? activePane.session + " · " + activeRuntime.updatedAt : activePane.session}
                </Text>
                <TouchableOpacity
                  style={[styles.compactToolButton, autoRefresh && styles.compactToolButtonActive,
                    isEH && { backgroundColor: "rgba(16,16,18,0.9)", borderColor: "rgba(255,255,255,0.1)" },
                    isEH && autoRefresh && { borderColor: "rgba(255,255,255,0.3)" },
                  ]}
                  onPress={() => setAutoRefresh((value) => !value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.compactToolText, autoRefresh && styles.compactToolTextActive,
                    isEH && { color: "rgba(255,255,255,0.3)" },
                    isEH && autoRefresh && { color: "rgba(255,255,255,0.7)" },
                  ]}>AUTO</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.compactToolButton, isEH && { backgroundColor: "rgba(16,16,18,0.9)", borderColor: "rgba(255,255,255,0.1)" }]} onPress={refreshAll} activeOpacity={0.75}>
                  <Text style={[styles.compactToolText, isEH && { color: "rgba(255,255,255,0.4)" }]}>↻</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.compactToolButton, isEH && { backgroundColor: "rgba(16,16,18,0.9)", borderColor: "rgba(255,255,255,0.1)" }]} onPress={() => setMode("commands")} activeOpacity={0.75}>
                  <Text style={[styles.compactToolText, isEH && { color: "rgba(255,255,255,0.4)" }]}>CMD</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.singlePaneWrap}>
            <View style={[styles.terminalPaneFull, isEH && { backgroundColor: "#000", borderColor: "rgba(255,255,255,0.15)" }]}>
              <View style={[styles.paneHeader, isEH && { backgroundColor: "rgba(16,16,18,0.95)", borderBottomColor: "rgba(255,255,255,0.1)" }]}>
                <View style={styles.paneTitleWrap}>
                  <Text style={[styles.paneTitle, styles.paneTitleActive, isEH && { color: "rgba(255,255,255,0.85)" }]}>{activePane.label}</Text>
                  <Text style={[styles.paneHint, isEH && { color: "rgba(255,255,255,0.25)" }]}>{activePane.hint}</Text>
                </View>
                <Text style={[styles.paneState, activeRuntime.state === "error" && styles.paneStateError, isEH && { color: "rgba(120,200,120,0.7)" }]}>
                  {activeRuntime.state === "capturing" ? "..." : activeRuntime.state.toUpperCase()}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const next = liveLineCountRef.current >= 2000 ? 160 : 2000;
                    liveLineCountRef.current = next;
                    setLiveLineCount(next);
                    prevOutputRef.current = "";
                    setTimeout(() => refreshAll().catch(() => {}), 50);
                  }}
                  activeOpacity={0.7}
                  style={{ marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: isEH ? "rgba(255,255,255,0.2)" : "rgba(120,180,240,0.3)", borderRadius: isEH ? 0 : 4 }}
                >
                  <Text style={[styles.paneHint, isEH && { color: "rgba(255,255,255,0.45)" }]}>
                    {liveLineCount >= 2000 ? "精简" : "全文"}
                  </Text>
                </TouchableOpacity>
                {isDesktop && (
                  <>
                    <View style={{ flex: 1 }} />
                    {TERMINAL_PANES.map((pane) => {
                      const active = pane.id === activePaneId;
                      return (
                        <TouchableOpacity
                          key={pane.id}
                          style={[styles.sessionTab, active && styles.sessionTabActive]}
                          onPress={() => { setActivePaneId(pane.id); setUserScrolledUp(false); }}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.sessionTabText, active && styles.sessionTabTextActive]}>
                            {pane.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </View>
              <ScrollView
                ref={activeScrollRef}
                style={styles.paneOutput}
                contentContainerStyle={styles.paneOutputContent}
                showsVerticalScrollIndicator
                onScroll={(e: any) => {
                  const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                  if (contentSize.height <= layoutMeasurement.height) return;
                  const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
                  if (atBottom && userScrolledUp) setUserScrolledUp(false);
                  if (!atBottom && !userScrolledUp && contentOffset.y > 0) setUserScrolledUp(true);
                }}
                scrollEventThrottle={200}
              >
                {renderTerminalLines(activePane, true)}
              </ScrollView>
              {activeRuntime.opsBlocks.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: isEH ? "rgba(255,255,255,0.08)" : "rgba(120,160,220,0.18)", backgroundColor: isEH ? "rgba(8,8,10,0.97)" : "rgba(8,12,26,0.95)" }}>
                  <TouchableOpacity
                    onPress={() => setOpsOpen((v) => !v)}
                    activeOpacity={0.7}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}
                  >
                    <Text style={{ fontFamily: fonts.pixel, fontSize: 9, color: isEH ? "rgba(96,168,255,0.85)" : "#7cc7a0", letterSpacing: 1 }}>
                      {opsOpen ? "▾" : "▸"} 操作流 · {activeRuntime.opsBlocks.length}
                    </Text>
                    {!opsOpen && (
                      <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.pixel, fontSize: 9, color: isEH ? "rgba(255,255,255,0.4)" : "rgba(160,180,210,0.55)" }}>
                        {(() => { const last = activeRuntime.opsBlocks[activeRuntime.opsBlocks.length - 1]; return `${last.type === "tool" ? "⚙" : last.type === "system" ? "※" : "✎"} ${(last.name ? last.name + " " : "") + last.text.replace(/\s+/g, " ").slice(0, 60)}`; })()}
                      </Text>
                    )}
                  </TouchableOpacity>
                  {opsOpen && (
                    <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 8, gap: 4 }}>
                      {[...activeRuntime.opsBlocks].reverse().map((block) => {
                        const expanded = opsExpandedId === block.id;
                        const tone = block.type === "tool" ? (isEH ? "rgba(96,168,255,0.9)" : "#7cc7a0") : block.type === "system" ? "rgba(230,180,80,0.85)" : (isEH ? "rgba(255,255,255,0.7)" : "rgba(200,214,235,0.8)");
                        return (
                          <TouchableOpacity
                            key={block.id}
                            onPress={() => setOpsExpandedId(expanded ? null : block.id)}
                            activeOpacity={0.7}
                            style={{ borderWidth: 1, borderColor: isEH ? "rgba(255,255,255,0.1)" : "rgba(120,160,220,0.16)", borderRadius: isEH ? 0 : 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: isEH ? "rgb(14,14,16)" : "rgba(255,255,255,0.03)" }}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={{ fontFamily: fonts.pixel, fontSize: 9, color: tone }}>
                                {block.type === "tool" ? "✓" : block.type === "system" ? "※" : "✎"}
                              </Text>
                              <Text numberOfLines={expanded ? undefined : 1} style={{ flex: 1, fontFamily: fonts.pixel, fontSize: 9, lineHeight: 14, color: tone }}>
                                {(block.name ? block.name + " · " : "") + (expanded ? block.text : block.text.replace(/\s+/g, " ").slice(0, 90))}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              )}
              {activeRuntime.latestBlock && (
                <View style={[styles.activityStrip, isEH && { backgroundColor: "rgba(10,10,12,0.95)", borderTopColor: "rgba(255,255,255,0.08)" }]}>
                  <View style={[
                    styles.activityDot,
                    activeRuntime.latestBlock.type === "thinking" && styles.activityDotThinking,
                    activeRuntime.latestBlock.type === "tool" && styles.activityDotTool,
                    activeRuntime.latestBlock.type === "assistant" && styles.activityDotAssistant,
                  ]} />
                  <Text style={styles.activityLabel}>
                    {activeRuntime.latestBlock.type === "thinking" ? "THINKING"
                      : activeRuntime.latestBlock.type === "tool" ? "TOOL"
                      : activeRuntime.latestBlock.type === "assistant" ? "WRITING"
                      : "SYSTEM"}
                  </Text>
                  <Text style={styles.activityPreview} numberOfLines={1}>
                    {activeRuntime.latestBlock.text}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {!isDesktop && <View style={[styles.shortcutBar, isEH && { backgroundColor: "#000", borderTopColor: "rgba(255,255,255,0.1)" }]}>
            {[
              ["Esc", "Escape"],
              ["↑", "Up"],
              ["↑↑", "UpUp"],
              ["↓", "Down"],
              ["Enter", "Enter"],
              ["^C", "C-c"],
            ].map(([label, key]) => (
              <TouchableOpacity
                key={label}
                style={[styles.shortcutButton, isEH && { backgroundColor: "rgba(16,16,18,0.9)", borderColor: "rgba(255,255,255,0.12)" }]}
                onPress={() => {
                  if (key === "UpUp") {
                    sendRepeatedKeyToActivePane("Up", 2);
                  } else {
                    sendKeyToActivePane(key);
                  }
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.shortcutText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>}

          <View style={[styles.liveInputShell, { paddingBottom: isDesktop ? 8 : insets.bottom + 10 }, isEH && { backgroundColor: "#000", borderTopColor: "rgba(255,255,255,0.12)" }]}>
            <View style={styles.liveTargetRow}>
              <Text style={[styles.liveTarget, isEH && { color: "rgba(255,255,255,0.6)" }]}>{activePane.label}</Text>
              <Text style={[styles.liveTargetSession, isEH && { color: "rgba(255,255,255,0.25)" }]}>{activePane.session}</Text>
            </View>
            <View style={styles.liveInputRow}>
              <Text style={[styles.inputPrefix, isEH && { color: "rgba(255,255,255,0.4)" }]}>›</Text>
              <TextInput
                ref={liveInputRef}
                style={[styles.liveInput, isEH && { backgroundColor: "rgba(16,16,18,0.9)", color: "rgba(255,255,255,0.85)" }]}
                value={liveInput}
                onChangeText={setLiveInput}
                onSubmitEditing={sendToActivePane}
                onFocus={pinViewport}
                placeholder={isEH ? `SEND → ${activePane.session}` : `send to ${activePane.session}`}
                placeholderTextColor={isEH ? "rgba(255,255,255,0.2)" : colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!liveSending}
                returnKeyType="send"
                blurOnSubmit={false}
                {...(Platform.OS === "web" ? {
                  onKeyPress: (e: any) => {
                    if (e.nativeEvent?.key === "Escape") sendKeyToActivePane("Escape");
                  },
                } : {})}
              />
              <TouchableOpacity
                ref={liveSendBtnRef as any}
                style={[styles.liveSendButton, liveSending && styles.disabled, isEH && { backgroundColor: "rgba(16,16,18,0.9)", borderColor: "rgba(255,255,255,0.2)" }]}
                onPress={sendToActivePane}
                disabled={liveSending || !liveInput.trim()}
                activeOpacity={0.75}
                {...(Platform.OS === "web" ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
              >
                <Text style={[styles.liveSendText, isEH && { color: "rgba(255,255,255,0.7)" }]}>{liveSending ? "..." : "SEND"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(85,85,165,0.26)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: fonts.mono,
    fontSize: 17,
    color: colors.pixel.gold,
  },
  headerMeta: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: colors.textMuted,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  modeButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeButtonActive: {
    borderColor: colors.pixel.goldDim,
    backgroundColor: colors.bgCard,
  },
  modeText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.textMuted,
  },
  modeTextActive: {
    color: colors.pixel.gold,
  },
  output: {
    flex: 1,
  },
  outputContent: {
    padding: 14,
    gap: 10,
  },
  entry: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  prompt: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.pixel.gold,
    marginBottom: 6,
  },
  resultTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 14,
    marginBottom: 6,
  },
  line: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textDim,
    lineHeight: 20,
  },
  quickRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quickButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: "rgba(85,85,165,0.3)",
  },
  quickText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.pixel.gold,
  },
  commandInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: "rgba(202,197,171,0.38)",
  },
  inputPrefix: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.pixel.goldDim,
  },
  commandInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  runButton: {
    flexShrink: 0,
    minHeight: 40,
    minWidth: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: "rgba(85,85,165,0.3)",
  },
  runText: {
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    color: colors.pixel.gold,
  },
  disabled: {
    opacity: 0.45,
  },
  workbench: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.bg,
  },
  workbenchToolbar: {
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  sessionTabs: {
    flexDirection: "row",
    gap: 6,
  },
  sessionTab: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: "rgba(85,85,165,0.36)",
    paddingHorizontal: 4,
  },
  sessionTabActive: {
    backgroundColor: colors.bgCard,
    borderColor: "rgba(202,197,171,0.53)",
  },
  sessionTabText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
  },
  sessionTabTextActive: {
    color: colors.pixel.gold,
  },
  compactToolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  compactMeta: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: colors.textMuted,
  },
  compactToolButton: {
    minWidth: 42,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: "rgba(85,85,165,0.33)",
    paddingHorizontal: 6,
  },
  compactToolButtonActive: {
    borderColor: "rgba(202,197,171,0.48)",
    backgroundColor: colors.bgCard,
  },
  compactToolText: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: colors.textMuted,
  },
  compactToolTextActive: {
    color: colors.pixel.goldDim,
  },
  singlePaneWrap: {
    flex: 1,
    minHeight: 0,
    padding: 6,
  },
  terminalPaneFull: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#03060f",
    borderWidth: 1,
    borderColor: "rgba(202,197,171,0.43)",
  },
  paneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(85,85,165,0.42)",
  },
  paneTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  paneTitle: {
    flexShrink: 0,
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.textDim,
  },
  paneTitleActive: {
    color: colors.pixel.gold,
  },
  paneHint: {
    flexShrink: 1,
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.textMuted,
  },
  paneState: {
    flexShrink: 0,
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.success,
  },
  paneStateError: {
    color: colors.error,
  },
  paneOutput: {
    flex: 1,
    minHeight: 0,
  },
  paneOutputContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  activityStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "rgba(85,85,165,0.2)",
    backgroundColor: "rgba(5,12,31,0.9)",
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  activityDotThinking: { backgroundColor: colors.pixel.gold },
  activityDotTool: { backgroundColor: colors.blueAccent },
  activityDotAssistant: { backgroundColor: colors.success },
  activityLabel: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: colors.pixel.gold,
    letterSpacing: 1,
  },
  activityPreview: {
    flex: 1,
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: colors.textDim,
  },
  liveLine: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    color: "#9ecaad",
  },
  liveLineBold: {
    fontWeight: "700",
    color: colors.text,
  },
  liveEmpty: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.textMuted,
  },
  liveErrorInline: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.error,
  },
  shortcutBar: {
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: "rgba(85,85,165,0.36)",
  },
  shortcutButton: {
    flex: 1,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: "rgba(85,85,165,0.42)",
  },
  shortcutText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.textDim,
  },
  liveInputShell: {
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: "rgba(202,197,171,0.38)",
  },
  liveTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  liveTarget: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: colors.pixel.goldDim,
  },
  liveTargetSession: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.textMuted,
  },
  liveInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
  },
  liveInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveSendButton: {
    flexShrink: 0,
    minHeight: 38,
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: "rgba(85,85,165,0.42)",
  },
  liveSendText: {
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    color: colors.pixel.gold,
  },
});
