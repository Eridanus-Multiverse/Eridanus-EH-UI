// @ts-nocheck — StyleSheet.create with 90+ properties exceeds TS inference limit
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import { useWebViewportFit } from "../../hooks/useWebKeyboard";
import {
  api,
  Room,
  RoomMessage,
  RoomMode,
  RoomSummary,
  RoomTarget,
  PatrolPayload,
  ApiRequestError,
  GatewayUsageRow,
} from "../../services/api";
import { fonts } from "../../theme/colors";
import { defaultTheme } from "../../theme/themes";
import ThemeBackground from "../../components/decor/ThemeBackground";
import ThemeDivider from "../../components/decor/ThemeDivider";
import CornerBrackets from "../../components/decor/CornerBrackets";
import BridgeDashboard, { EH_BLUE, EH_BUBBLE_CUT, EhBridgeHeader, EhEntryCard, EhPatrolPanel } from "../../components/bridge/BridgeDashboard";
import { useThemeTokens } from "../../hooks/useTheme";
import CursaChatView from "../../components/chat/CursaChatView";

const theme = defaultTheme;
const groupTheme = theme.group;

const HIDDEN_MARKERS = /\[\[(?:ROOM|NEXT|STOP)[^\]]*\]\]/g;
const CONTEXT_HEADER = /ARCHIVE_ROOM_CONTEXT[^\n]*\n?/g;
function cleanRoomText(text: string): string {
  if (!text) return text;
  return text.replace(HIDDEN_MARKERS, "").replace(CONTEXT_HEADER, "").trim();
}

if (Platform.OS === "web" && typeof document !== "undefined") {
  const id = "group-crt-css";
  if (!document.getElementById(id)) {
    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      @keyframes bridgePulse {
        0%, 100% { opacity: 0.4; box-shadow: ${groupTheme.bridgePulseLowShadow}; }
        50% { opacity: 1; box-shadow: ${groupTheme.bridgePulseHighShadow}; }
      }
      [data-bridgepulse="1"] {
        animation: bridgePulse 2.5s ease-in-out infinite !important;
      }
      @keyframes roomMsgAppear {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes roomMsgSend {
        from { opacity: 0; transform: translateY(6px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      [data-roommsgfade="appear"] {
        animation-name: roomMsgAppear !important;
        animation-duration: 0.35s !important;
        animation-timing-function: cubic-bezier(0.16, 0.84, 0.44, 1) !important;
        animation-fill-mode: both !important;
      }
      [data-roommsgfade="send"] {
        animation-name: roomMsgSend !important;
        animation-duration: 0.38s !important;
        animation-timing-function: cubic-bezier(0.22, 0.68, 0.35, 1) !important;
        animation-fill-mode: both !important;
      }
    `;
    document.head.appendChild(st);
  }
}

const GROUP_ICON = require("../../assets/tab-icons/group.png");

// ─── EH group bubble identity ───
// desaturated member tints for bubble edges (Eri asked for per-member borders in group rooms)
const EH_MEMBER_EDGES: Record<string, string> = {
  eri: "rgba(96,168,255,0.65)",
  epsilon: "rgba(255,255,255,0.4)",
  cursa: "rgba(190,160,255,0.5)",
  deepseek: "rgba(120,210,200,0.5)",
  gemini: "rgba(255,170,190,0.5)",
};
// matching sender-name tones, brighter than the edges
const EH_MEMBER_TONES: Record<string, string> = {
  eri: "rgba(96,168,255,0.95)",
  epsilon: "rgba(255,255,255,0.9)",
  cursa: "rgba(200,175,255,0.9)",
  deepseek: "rgba(140,220,210,0.9)",
  gemini: "rgba(255,185,200,0.9)",
};

const WEB_BUBBLE_SURFACES: Record<string, any> = Platform.OS === "web" ? {
  eri: {
    backgroundColor: groupTheme.c001,
    borderWidth: 1,
    borderColor: groupTheme.c002,
    borderRadius: 4,
    boxShadow: groupTheme.c003,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  },
  epsilon: {
    backgroundColor: groupTheme.c004,
    borderWidth: 1,
    borderColor: groupTheme.c005,
    borderRadius: 4,
    boxShadow: groupTheme.c006,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  },
  cursa: {
    backgroundColor: groupTheme.c007,
    borderWidth: 1,
    borderColor: groupTheme.c008,
    borderRadius: 4,
    boxShadow: groupTheme.c009,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  },
  default: {
    backgroundColor: groupTheme.c010,
    borderWidth: 1,
    borderColor: groupTheme.c011,
    borderRadius: 4,
    boxShadow: groupTheme.c003,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  },
} : {};

const isWeb = Platform.OS === "web";
const ROOM_POLL_FAST_MS = 2500;
const ROOM_POLL_SLOW_MS = 12000;
const ROOM_POLL_FAST_WINDOW_MS = 120000;

// 注意：\b 在中文后永远不成立（JS \w 不含汉字），中文名不能用词边界
const MENTION_RE = /@(UNIT-A|UNIT-B|拉那|小拉|小那|小娜|UNIT-C|小鲸鱼|大胖鱼|epsilon|cursa|rana|gemini|omicron|deepseek)(?![a-z0-9_])/i;
const ALL_MENTION_RE = /[@＠](?:all|全员|大家)(?![a-z0-9_])/i;

function detectMention(text: string, members?: Room["members"]): { mode: RoomMode; target?: string } {
  if (ALL_MENTION_RE.test(text)) return { mode: "all" };
  // API 船员成员（#7③）：房间里有 crew 成员时先按名字匹配（去 emoji 修饰）
  const crewHit = (members || []).find((m) => {
    if (!String(m?.id || "").startsWith("crew:") || !m?.name) return null;
    const bare = String(m.name).replace(/[^\p{L}\p{N}]/gu, "");
    return text.includes(String(m.name)) || (bare.length >= 2 && text.includes(bare));
  });
  const match = text.match(MENTION_RE);
  if (!match) return crewHit ? { mode: "direct", target: crewHit.id } : { mode: "round" };
  const who = match[1].toLowerCase();
  if (who === "UNIT-A" || who === "epsilon") return { mode: "direct", target: "epsilon" };
  if (who === "UNIT-B" || who === "cursa") return { mode: "direct", target: "cursa" };
  if (who === "UNIT-C" || who === "小鲸鱼" || who === "大胖鱼" || who === "omicron" || who === "deepseek") {
    // 内置UNIT-C不在房间但同名船员在（如新建群只拉了船员）→ 让给船员
    const hasDeepseek = !members || members.some((m) => m.id === "deepseek");
    if (!hasDeepseek && crewHit) return { mode: "direct", target: crewHit.id };
    return { mode: "direct", target: "deepseek" };
  }
  // 拉那是客座，服务端按文本 pattern 自行召唤，不派常驻 AI 接话
  return crewHit ? { mode: "direct", target: crewHit.id } : { mode: "silent" };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function messageTone(sender: string) {
  if (sender === "eri") return theme.pixel.gold;
  if (sender === "epsilon") return theme.blueAccent;
  if (sender === "cursa") return groupTheme.c012;
  if (sender === "deepseek") return groupTheme.c013;
  if (sender === "gemini") return groupTheme.c014;
  if (sender.startsWith("crew:")) return groupTheme.c013; // API 船员统一青色系
  return theme.textMuted;
}

const MODEL_LABELS: Record<string, string> = {
  epsilon: "claude-opus",
  cursa: "codex",
  deepseek: "deepseek-v4-pro",
  gemini: "gemini-3.1",
};

function fallbackAvatar(id: string): { label: string; color: string } {
  if (id === "eri") return { label: "E", color: theme.pixel.gold };
  if (id === "epsilon") return { label: "🐦‍⬛", color: theme.blueAccent };
  if (id === "cursa") return { label: "🐈‍⬛", color: groupTheme.c012 };
  if (id === "deepseek") return { label: "🐋", color: groupTheme.c013 };
  if (id === "gemini") return { label: "🐶", color: groupTheme.c014 };
  if (id === "system") return { label: "※", color: theme.textMuted };
  if (id.startsWith("crew:")) return { label: "◈", color: groupTheme.c013 }; // API 船员
  return { label: (id || "?").slice(0, 1).toUpperCase(), color: theme.textDim };
}

function avatarSource(member?: Room["members"][number] | null) {
  const uri = member?.avatar_url || member?.avatar;
  return uri ? { uri } : null;
}

function MemberAvatar({
  member,
  sender,
  size = 28,
  compact = false,
}: {
  member?: Room["members"][number] | null;
  sender?: string;
  size?: number;
  compact?: boolean;
}) {
  const id = member?.id || sender || "system";
  const fallback = fallbackAvatar(id);
  const source = avatarSource(member);
  const label = member?.emoji || (member?.icon && !source && member.icon !== id ? member.icon : fallback.label);
  const borderColor = member?.color || fallback.color;
  return (
    <View
      style={[
        s.avatar,
        compact && s.avatarCompact,
        { width: size, height: size, borderColor },
      ]}
    >
      {source ? (
        <Image source={source} style={s.avatarImage} resizeMode="cover" />
      ) : (
        <Text style={[s.avatarText, compact && s.avatarTextCompact, { color: borderColor }]}>
          {label}
        </Text>
      )}
    </View>
  );
}


function roomDescription(room: Room): string {
  const names = (room.members || []).map((m) => m.name).join("、");
  return names || room.type;
}

function relativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 0 || Number.isNaN(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

function roomTypeLabel(room: Room): string {
  if (room.type === "direct") return "DM";
  if (room.type === "group") return "GROUP";
  return room.type.toUpperCase();
}

function isCursaDm(room: Room): boolean {
  return room.type === "direct"
    && room.readonly !== true
    && room.viewer_role !== "observer"
    && (room.members || []).some((m) => m.id === "cursa");
}

function isReadonlyRoom(room: Room): boolean {
  return room.readonly === true || room.viewer_role === "observer";
}

function isHiddenSystemMessage(message: RoomMessage): boolean {
  if (message.sender !== "system") return false;
  const type = message.metadata && typeof message.metadata.type === "string"
    ? message.metadata.type
    : "";
  return type === "dispatch_queued" || type === "dispatch_skipped";
}

function hasVisibleRoomMessageBody(message: RoomMessage): boolean {
  return cleanRoomText(message.text || "").length > 0;
}

function isQuietRefreshAbort(err: unknown): boolean {
  if (err instanceof ApiRequestError && err.kind === "abort") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /abort(ed)?/i.test(message);
}

function roomMessageWantsContinuation(message: RoomMessage): boolean {
  if (message.sender === "eri" || message.sender === "system") return false;
  const directive = message.metadata?.flow_directive as { action?: unknown; target?: unknown } | undefined;
  return directive?.action === "next" && typeof directive.target === "string";
}

function hasQueuedRoomDispatch(result: unknown): boolean {
  const payload = result as { dispatch?: RoomDispatchResult[]; guests?: RoomDispatchResult[] };
  const all = [...(payload.dispatch || []), ...(payload.guests || [])];
  return all.some((item) => item.status === "queued" || item.status === "running");
}

type VisibleRoomMessage = {
  message: RoomMessage;
  isGroupStart: boolean;
  isGroupEnd: boolean;
};

function patrolTone(status?: string) {
  if (status === "ok") return groupTheme.c015;
  if (status === "watch") return theme.pixel.gold;
  if (status === "warning") return groupTheme.c016;
  if (status === "critical") return theme.error;
  return theme.textMuted;
}

function formatPatrolAge(seconds: number | null | undefined): string {
  if (seconds == null) return "尚未巡逻";
  if (seconds < 60) return "刚刚";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function PatrolReportCard() {
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  const [payload, setPayload] = useState<PatrolPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.patrolReport();
      setPayload(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      const result = await api.runPatrol();
      setPayload(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [running]);

  useEffect(() => { load(); }, [load]);

  const report = payload?.report;
  const status = report?.status || (payload?.available ? "ok" : "unknown");
  const tone = patrolTone(status);
  const issues = report?.issues || [];
  const highlights = report?.highlights || [];

  const statusLabel = status === "ok" ? "ALL CLEAR" : status === "watch" ? "WATCH" : status === "warning" ? "ALERT" : status === "critical" ? "CRITICAL" : "STANDBY";

  function parseHighlight(h: string): { value: string; label: string; color: string } {
    const m = h.match(/^(.+?)\s+([\d.]+%?\s*.*)$/);
    const label = m ? m[1] : h;
    const value = m ? m[2] : "";
    let color = groupTheme.c017;
    if (/ok$/i.test(value)) color = groupTheme.c018;
    else if (/available/i.test(label) || /memory/i.test(label)) {
      const pct = parseFloat(value);
      color = pct > 50 ? groupTheme.c018 : pct > 20 ? groupTheme.c019 : groupTheme.c020;
    } else if (/disk/i.test(label) || /used/i.test(value)) {
      const pct = parseFloat(value);
      color = pct < 70 ? groupTheme.c018 : pct < 85 ? groupTheme.c019 : groupTheme.c020;
    } else if (/load/i.test(label)) {
      const val = parseFloat(value);
      color = val < 1 ? groupTheme.c018 : val < 2 ? groupTheme.c019 : groupTheme.c020;
    } else if (/session/i.test(value) || /tmux/i.test(label)) color = groupTheme.c021;
    return { label, value, color };
  }

  const parsedHighlights = highlights.slice(0, 6).map(parseHighlight);

  if (isEH) {
    return <EhPatrolPanel payload={payload} loading={loading} running={running} error={error} onRun={run} />;
  }

  return (
    <View style={[s.patrolCard, s.roomCardSurface]}>
      <View style={s.patrolTopEdge} />

      <View style={s.patrolTitleBlock}>
        <Text style={s.patrolTitleDeco}>◆ ─── · ·</Text>
        <Text style={s.patrolTitleText}>HULL SCAN</Text>
        <Text style={s.patrolTitleDeco}>· · ─── ◆</Text>
      </View>
      <View style={s.patrolSubtitleRow}>
        <View style={[s.patrolStatusDot, { backgroundColor: tone }]} />
        <Text style={s.patrolSubtitle}>B ROUTE PATROL · {statusLabel}</Text>
      </View>

      <View style={s.patrolBody}>
        <Text style={s.patrolSummary}>
          {loading && !report ? "信号接收中..." : report?.summary || "尚未收到巡检报告。"}
        </Text>

        {issues.length > 0 ? (
          <View style={s.patrolIssueList}>
            {issues.slice(0, 3).map((issue, index) => (
              <View key={`${issue.title}-${index}`} style={s.patrolIssueRow}>
                <Text style={s.patrolIssueLevel}>{String(issue.level).toUpperCase()}</Text>
                <Text style={s.patrolIssueText} numberOfLines={2}>{issue.title}: {issue.detail}</Text>
              </View>
            ))}
          </View>
        ) : parsedHighlights.length > 0 ? (
          <View style={s.patrolGrid}>
            {parsedHighlights.map((item, i) => (
              <View key={i} style={s.patrolGridCell}>
                <Text style={[s.patrolGridValue, { color: item.color }]}>{item.value || "—"}</Text>
                <Text style={s.patrolGridLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.patrolFooter}>
          <Text style={s.patrolMeta}>
            最近扫描：{formatPatrolAge(payload?.age_seconds)}
            {payload?.stale ? "  ·  信号过期" : ""}
          </Text>
          <TouchableOpacity
            style={[s.patrolButton, (running || loading) && s.disabled]}
            activeOpacity={0.7}
            onPress={run}
            disabled={running || loading}
          >
            <Text style={s.patrolButtonText}>{running ? "▶ SCANNING..." : "▶ RUN SCAN"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? <Text style={s.patrolError}>{error}</Text> : null}

      <View style={s.patrolBottomEdge} />
    </View>
  );
}

function buildVisibleRoomMessages(messages: RoomMessage[], cursaDirect: boolean): VisibleRoomMessage[] {
  const visible = messages.filter((message) => {
    if (cursaDirect && message.sender === "system") return false;
    if (isHiddenSystemMessage(message)) return false;
    return hasVisibleRoomMessageBody(message);
  });

  return visible.map((message, index) => {
    const prev = visible[index - 1];
    const next = visible[index + 1];
    const sameAsPrev = prev && prev.sender === message.sender && message.sender !== "system"
      && Math.abs(new Date(message.created_at).getTime() - new Date(prev.created_at).getTime()) < 120_000;
    const sameAsNext = next && next.sender === message.sender && message.sender !== "system"
      && Math.abs(new Date(next.created_at).getTime() - new Date(message.created_at).getTime()) < 120_000;
    return {
      message,
      isGroupStart: !sameAsPrev,
      isGroupEnd: !sameAsNext,
    };
  });
}

const RoomMessageBubble = memo(function RoomMessageBubble({
  message,
  isGroupStart,
  isGroupEnd,
  member,
  memberName,
  fadeType,
  onQuote,
  onReact,
}: {
  message: RoomMessage;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  member?: Room["members"][number];
  memberName: string;
  fadeType?: "send" | "appear" | null;
  onQuote?: () => void;
  onReact?: (emoji: string) => void;
}) {
  const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  const isEri = message.sender === "eri";
  const isSystem = message.sender === "system";
  const displayText = cleanRoomText(message.text || "");
  // EH member edges — desaturated identity tints, Eri keeps the poster blue
  // (Eri overruled strict monochrome here: group rooms need per-member borders)
  const ehEdge = EH_MEMBER_EDGES[message.sender] || "rgba(255,255,255,0.4)";
  const tone = isEH ? (EH_MEMBER_TONES[message.sender] || "rgba(255,255,255,0.85)") : messageTone(message.sender);
  const [showActions, setShowActions] = useState(false);
  const [fadeState, setFadeState] = useState(fadeType || null);
  useEffect(() => {
    if (!fadeType || Platform.OS !== "web") return;
    const t = setTimeout(() => setFadeState(null), isEri ? 400 : 600);
    return () => clearTimeout(t);
  }, [fadeType, isEri]);
  const roomReactions = useMemo(() => {
    try { return JSON.parse(message.reactions || "[]"); } catch { return []; }
  }, [message.reactions]);
  // EH bubbles: DM-style corner cut via a two-layer clip — the outer layer is the
  // member tint showing through a 1px inset, so the "border" follows the cut edge
  // (a real CSS border gets sliced off by clip-path at the corners)
  const pixelSurface = Platform.OS === "web"
    ? isEH
      ? { backgroundColor: isEri ? "rgb(32,32,34)" : "rgb(24,24,26)", borderWidth: 0, borderRadius: 0, boxShadow: "none", clipPath: EH_BUBBLE_CUT } as any
      : (WEB_BUBBLE_SURFACES[isEri ? "eri" : message.sender] || WEB_BUBBLE_SURFACES.default)
    : null;

  const webContextMenuProps =
    Platform.OS === "web" && !isSystem
      ? { onContextMenu: (e: any) => { e.preventDefault(); setShowActions(true); } }
      : {};

  return (
    <View
      style={[
        s.msgRow,
        isSystem ? s.msgCenter : isEri ? s.msgRight : s.msgLeft,
        !isGroupStart && s.msgContinuation,
      ]}
      {...(Platform.OS === "web" && fadeState ? { dataSet: { roommsgfade: fadeState } } : {})}
    >
      {isSystem ? (
        <>
          <View style={[s.bubble, s.sysBubble, isEH && ehs.sysBubble]}>
            <Text style={[s.sysLabel, isEH && ehs.sysLabel]}>SYSTEM</Text>
            <Text style={[s.msgText, s.sysText, isEH && ehs.sysText]}>{displayText}</Text>
          </View>
          <Text style={[s.time, isEH && ehs.time]}>{formatTime(message.created_at)}</Text>
        </>
      ) : (
        <TouchableOpacity
          activeOpacity={1}
          delayLongPress={350}
          onLongPress={() => setShowActions(true)}
          onPress={showActions ? () => setShowActions(false) : undefined}
          {...webContextMenuProps}
        >
        <View style={[s.messageCluster, isEri && s.messageClusterRight]}>
          {isGroupStart && (
            <View style={[
              s.senderRow,
              isEri ? s.senderRightWithAvatar : s.senderLeftWithAvatar,
            ]}>
              <Text style={[s.sender, { color: tone }]}>
                {memberName || message.sender}
              </Text>
              {!isEri && !isSystem && MODEL_LABELS[message.sender] && (
                <Text style={[s.modelLabel, isEH && ehs.modelLabel]}>
                  {(member as any)?.model || (message as any).metadata?.model || MODEL_LABELS[message.sender]}
                </Text>
              )}
            </View>
          )}
          <View style={[s.bubbleLine, isEri && s.bubbleLineRight]}>
            {!isEri && isGroupStart ? <MemberAvatar member={member} sender={message.sender} /> : null}
            {!isEri && !isGroupStart ? <View style={s.avatarSpacer} /> : null}
            <View style={isEH ? ({ backgroundColor: ehEdge, clipPath: EH_BUBBLE_CUT, padding: 1, flexShrink: 1 } as any) : { flexShrink: 1 }}>
            <View style={[
              s.bubble,
              isEri ? s.eriBubble : s.aiBubble,
              pixelSurface,
            ]}>
              {!isEH && <CornerBrackets color={isEri ? groupTheme.c074 : groupTheme.c075} size={6} offset={2} />}
              {message.quoted_text && (
                <View style={[s.quotedBlock, isEH && ehs.quotedBlock]}>
                  <Text style={[s.quotedBlockText, isEH && ehs.quotedBlockText]} numberOfLines={2}>{message.quoted_text}</Text>
                </View>
              )}
              <Text style={s.msgText}>{displayText}</Text>
            </View>
            </View>
            {isEri && isGroupStart ? <MemberAvatar member={member} sender={message.sender} /> : null}
            {isEri && !isGroupStart ? <View style={s.avatarSpacer} /> : null}
          </View>
          {showActions && (
            <>
              {onReact && (
                <View style={[s.roomEmojiBar, isEri ? s.roomActionsRight : s.roomActionsLeft]}>
                  {QUICK_EMOJIS.map((e) => (
                    <TouchableOpacity key={e} style={s.roomActionBtn} onPress={() => { setShowActions(false); onReact(e); }} activeOpacity={0.6}>
                      <Text style={{ fontSize: 14 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={[s.roomActionsBar, isEri ? s.roomActionsRight : s.roomActionsLeft]}>
                {onQuote && (
                  <TouchableOpacity style={s.roomActionBtn} onPress={() => { setShowActions(false); onQuote(); }} activeOpacity={0.7}>
                    <Text style={s.roomActionBtnText}>引用</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
          {roomReactions.length > 0 && (
            <View style={[s.roomReactions, isEri ? s.roomActionsRight : s.roomActionsLeft]}>
              {roomReactions.map((r, i) => (
                <Text key={i} style={{ fontSize: 14 }}>{r}</Text>
              ))}
            </View>
          )}
          {isGroupEnd && (
            <Text style={[
              s.time,
              isEH && ehs.time,
              isEri ? s.timeRightWithAvatar : s.timeLeftWithAvatar,
            ]}>{formatTime(message.created_at)}</Text>
          )}
        </View>
        </TouchableOpacity>
      )}
    </View>
  );
}, (prev, next) =>
  prev.message.id === next.message.id &&
  prev.message.text === next.message.text &&
  prev.message.sender === next.message.sender &&
  prev.message.created_at === next.message.created_at &&
  prev.message.quoted_text === next.message.quoted_text &&
  prev.message.reactions === next.message.reactions &&
  prev.memberName === next.memberName &&
  prev.member === next.member &&
  prev.isGroupStart === next.isGroupStart &&
  prev.isGroupEnd === next.isGroupEnd &&
  prev.fadeType === next.fadeType
);

// ─── Bridge View (main page with dashboard cards) ───

/** 行程评估（2026-07-07 Eri：彻底本地化自绘）——读监督员UNIT-B的 timeline 数据，
    按天分组时间轴卡片，note=他的评估锐评。双主题。 */
const AUDIT_CAT_COLORS: Record<string, string> = {
  life: "#78c878", work: "rgba(96,168,255,0.9)", rest: "#b08ee0", health: "#e6b450",
};
function AuditView({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  const [days, setDays] = useState<Array<{ date: string; status: string; events: Array<{ start: string | null; end: string | null; title: string; note: string; category: string; category_label: string; tags: string[] }> }>>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"timeline" | "diary" | "reminders" | "stickers">("timeline");
  const [office, setOffice] = useState<{ diary: Array<{ date: string; content: string }>; reminders: any[]; stickers: Array<{ id: string; url: string; tags: string[]; desc: string }> }>({ diary: [], reminders: [], stickers: [] });
  useEffect(() => {
    api.timelineAudit().then((r) => { setDays(r.days || []); setLoading(false); }).catch(() => setLoading(false));
    api.cursaOffice().then(setOffice).catch(() => {});
  }, []);
  const fmtT = (iso: string | null) => {
    if (!iso) return "--:--";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const textC = isEH ? "#fff" : groupTheme.roomName;
  const dimC = isEH ? "rgba(255,255,255,0.5)" : "rgba(200,216,240,0.5)";
  return (
    <View style={[s.container, isEH && { backgroundColor: "#000" }]}>
      <ThemeBackground orbitSlot="none" crt crtColor={groupTheme.crtScanlineBg} />
      <View style={[s.lobbyHeader, { paddingTop: insets.top }, isEH && ({ backgroundColor: "#000", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.15)" } as any)]}>
        <View style={s.lobbyScanline}>
          <Text style={[s.lobbyScanlineText, isEH && { color: "rgba(255,255,255,0.35)" }]}>AUDIT</Text>
          <View style={s.lobbyScanlineFill} />
          <Text style={[s.lobbyScanlineText, isEH && { color: "rgba(96,168,255,0.85)" }]}>SUPERVISOR · CURSA</Text>
        </View>
        <View style={s.lobbyTitleRow}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.6} style={s.commBackBtn}>
            <Text style={[s.commBackText, isEH && { color: "rgba(255,255,255,0.6)" }]}>‹ 群组</Text>
          </TouchableOpacity>
          <Text style={[s.lobbyTitle, isEH && { color: "#fff" }]}>监督室</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
          {([["timeline", "行程"], ["diary", "日记"], ["reminders", "备忘"], ["stickers", "贴纸"]] as const).map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} activeOpacity={0.7} style={{
              paddingHorizontal: 12, paddingVertical: 5,
              borderWidth: 1, borderRadius: isEH ? 0 : 6,
              borderColor: tab === k ? (isEH ? "rgba(255,255,255,0.6)" : "rgba(120,170,240,0.6)") : (isEH ? "rgba(255,255,255,0.15)" : "rgba(120,160,220,0.2)"),
              backgroundColor: tab === k ? (isEH ? "rgba(255,255,255,0.1)" : "rgba(120,170,240,0.15)") : "transparent",
            }}>
              <Text style={{ fontFamily: fonts.pixel, fontSize: 11, color: tab === k ? textC : dimC }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <ScrollView style={s.lobbyScroll} contentContainerStyle={s.lobbyContent}>
        {tab === "diary" && (
          office.diary.length === 0 ? <Text style={[s.lobbyEmptyText, { marginTop: 30 }]}>监督员还没写日记</Text> :
          office.diary.map((d) => (
            <View key={d.date} style={{ marginBottom: 14, padding: 12, backgroundColor: isEH ? "#000" : "rgba(10,16,34,0.55)", borderWidth: 1, borderColor: isEH ? "rgba(255,255,255,0.18)" : "rgba(120,160,220,0.2)", borderRadius: isEH ? 0 : 8 }}>
              <Text style={{ fontFamily: fonts.pixel, fontSize: 12, color: textC, marginBottom: 6 }}>{d.date}</Text>
              <Text style={{ fontFamily: fonts.pixel, fontSize: 11, lineHeight: 18, color: dimC }}>{d.content.replace(/^## /gm, "· ").replace(/[#*]/g, "")}</Text>
            </View>
          ))
        )}
        {tab === "reminders" && (
          office.reminders.length === 0 ? <Text style={[s.lobbyEmptyText, { marginTop: 30 }]}>没有待办备忘——他现在心里只有你</Text> :
          office.reminders.map((r: any, i: number) => (
            <View key={i} style={{ marginBottom: 10, padding: 12, backgroundColor: isEH ? "#000" : "rgba(10,16,34,0.55)", borderWidth: 1, borderColor: isEH ? "rgba(255,255,255,0.18)" : "rgba(120,160,220,0.2)", borderRadius: isEH ? 0 : 8 }}>
              <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: isEH ? "rgba(96,168,255,0.85)" : "rgba(120,170,240,0.8)" }}>{r.fireAt || r.fire_at || ""}</Text>
              <Text style={{ fontFamily: fonts.pixel, fontSize: 12, color: textC, marginTop: 4 }}>{r.prompt || r.text || JSON.stringify(r).slice(0, 80)}</Text>
            </View>
          ))
        )}
        {tab === "stickers" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {office.stickers.length === 0 && <Text style={[s.lobbyEmptyText, { marginTop: 30 }]}>贴纸架是空的</Text>}
            {office.stickers.map((st) => (
              <View key={st.id} style={{ width: "30%", padding: 8, alignItems: "center", backgroundColor: isEH ? "#000" : "rgba(10,16,34,0.55)", borderWidth: 1, borderColor: isEH ? "rgba(255,255,255,0.18)" : "rgba(120,160,220,0.2)", borderRadius: isEH ? 0 : 8 }}>
                {Platform.OS === "web" ? (
                  <img src={st.url} style={{ width: "100%", height: 72, objectFit: "contain" }} alt={st.desc} />
                ) : null}
                <Text style={{ fontFamily: fonts.pixel, fontSize: 8, color: dimC, marginTop: 4 }} numberOfLines={1}>{st.tags.join(" · ")}</Text>
              </View>
            ))}
          </View>
        )}
        {tab !== "timeline" ? null : <>
        {loading && <Text style={[s.lobbyEmptyText, { marginTop: 30 }]}>监督员整理档案中…</Text>}
        {!loading && days.length === 0 && (
          <View style={s.lobbyEmpty}>
            <Text style={s.lobbyEmptyText}>监督员还没写过记录</Text>
            <Text style={[s.lobbyEmptyText, { fontSize: 10, marginTop: 6 }]}>跟UNIT-B多聊聊，他会把你的一天记下来</Text>
          </View>
        )}
        {/* 分类时长环形图（2026-07-07 Eri 点单：像原版 dashboard 的分析视图） */}
        {!loading && days.length > 0 && Platform.OS === "web" && (() => {
          const catMins: Record<string, number> = {};
          for (const day of days) {
            for (const ev of day.events) {
              if (!ev.start || !ev.end) continue;
              const mins = Math.max(0, (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000);
              catMins[ev.category || "other"] = (catMins[ev.category || "other"] || 0) + mins;
            }
          }
          const entries = Object.entries(catMins).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
          const total = entries.reduce((n, [, m]) => n + m, 0);
          if (!total) return null;
          const R = 42, CX = 55, CY = 55, SW = 16;
          const C = 2 * Math.PI * R;
          let acc = 0;
          const labelFor = (cat: string) => days.flatMap(d => d.events).find(e => e.category === cat)?.category_label || cat;
          return (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 18, padding: 12,
              backgroundColor: isEH ? "#000" : "rgba(10,16,34,0.55)",
              borderWidth: 1, borderColor: isEH ? "rgba(255,255,255,0.18)" : "rgba(120,160,220,0.2)",
              borderRadius: isEH ? 0 : 8,
            }}>
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle cx={CX} cy={CY} r={R} fill="none" stroke={isEH ? "rgba(255,255,255,0.08)" : "rgba(120,160,220,0.12)"} strokeWidth={SW} />
                {entries.map(([cat, mins], i) => {
                  const frac = mins / total;
                  const dash = frac * C;
                  const offset = -acc * C;
                  acc += frac;
                  const color = AUDIT_CAT_COLORS[cat] || (isEH ? "rgba(255,255,255,0.45)" : "rgba(200,216,240,0.45)");
                  return (
                    <circle key={cat} cx={CX} cy={CY} r={R} fill="none"
                      stroke={color} strokeWidth={SW}
                      strokeDasharray={`${dash.toFixed(1)} ${(C - dash).toFixed(1)}`}
                      strokeDashoffset={offset.toFixed(1)}
                      transform={`rotate(-90 ${CX} ${CY})`} />
                  );
                })}
                <text x={CX} y={CY - 2} textAnchor="middle" fill={isEH ? "#fff" : "#d8e2f0"} style={{ fontFamily: "monospace", fontSize: 13 }}>{Math.round(total / 60 * 10) / 10}h</text>
                <text x={CX} y={CY + 13} textAnchor="middle" fill={isEH ? "rgba(255,255,255,0.4)" : "rgba(200,216,240,0.45)"} style={{ fontFamily: "monospace", fontSize: 7 }}>TRACKED</text>
              </svg>
              <View style={{ flex: 1, gap: 5 }}>
                {entries.map(([cat, mins]) => {
                  const color = AUDIT_CAT_COLORS[cat] || (isEH ? "rgba(255,255,255,0.45)" : "rgba(200,216,240,0.45)");
                  return (
                    <View key={cat} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <View style={{ width: 8, height: 8, backgroundColor: color, borderRadius: isEH ? 0 : 4 }} />
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: textC, flex: 1 }}>{labelFor(cat)}</Text>
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: dimC }}>{Math.round(mins)}m · {Math.round(mins / total * 100)}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {days.map((day) => (
          <View key={day.date} style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <Text style={{ fontFamily: fonts.pixel, fontSize: 13, color: textC, letterSpacing: 1 }}>{day.date}</Text>
              <Text style={{ fontFamily: fonts.pixel, fontSize: 8, color: dimC, letterSpacing: 2 }}>{day.status.toUpperCase()}</Text>
            </View>
            {day.events.map((ev, i) => {
              const catColor = AUDIT_CAT_COLORS[ev.category] || (isEH ? "rgba(255,255,255,0.5)" : "rgba(200,216,240,0.5)");
              return (
                <View key={i} style={{
                  flexDirection: "row",
                  marginBottom: 10,
                  backgroundColor: isEH ? "#000" : "rgba(10,16,34,0.55)",
                  borderWidth: 1,
                  borderColor: isEH ? "rgba(255,255,255,0.18)" : "rgba(120,160,220,0.2)",
                  borderRadius: isEH ? 0 : 8,
                  overflow: "hidden",
                }}>
                  <View style={{ width: 3, backgroundColor: catColor }} />
                  <View style={{ flex: 1, padding: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: catColor, letterSpacing: 1 }}>
                        {fmtT(ev.start)}–{fmtT(ev.end)}
                      </Text>
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 8, color: dimC, letterSpacing: 1 }}>{ev.category_label.toUpperCase()}</Text>
                    </View>
                    <Text style={{ fontFamily: fonts.pixel, fontSize: 13, color: textC, marginTop: 4 }}>{ev.title}</Text>
                    {ev.note ? (
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 10, lineHeight: 16, color: dimC, marginTop: 5 }}>{ev.note}</Text>
                    ) : null}
                    {ev.tags.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                        {ev.tags.map((t) => (
                          <Text key={t} style={{ fontFamily: fonts.pixel, fontSize: 8, color: dimC, borderWidth: 1, borderColor: isEH ? "rgba(255,255,255,0.2)" : "rgba(120,160,220,0.25)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: isEH ? 0 : 3 }}>{t}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        </>}
      </ScrollView>
    </View>
  );
}

function BridgeView({
  roomCount,
  onOpenComms,
  onOpenCmd,
  onOpenAudit,
}: {
  roomCount: number;
  onOpenComms: () => void;
  onOpenCmd: () => void;
  onOpenAudit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  return (
    <View style={[s.container, isEH && { backgroundColor: "#000" }]}>
      <ThemeBackground orbitSlot="none" crt crtColor={groupTheme.crtScanlineBg} />
      {isEH ? (
        <EhBridgeHeader paddingTop={insets.top} label="BRIDGE" title="群组" countText={`${roomCount} ROOMS`} />
      ) : (
      <View style={[s.lobbyHeader, { paddingTop: insets.top }]}>
        <View style={s.lobbyScanline}>
          <Text style={s.lobbyScanlineText}>BRIDGE</Text>
          <View
            {...(Platform.OS === "web" ? { dataSet: { bridgepulse: "1" } } : {})}
            style={s.lobbyScanlineDot}
          />
          <Text style={s.lobbyScanlineText}>ACTIVE</Text>
          <View style={s.lobbyScanlineFill} />
          <Text style={s.lobbyScanlineText}>{roomCount} ROOMS</Text>
        </View>
        <View style={s.lobbyTitleRow}>
          <Image source={GROUP_ICON} style={s.lobbyIcon} resizeMode="contain" />
          <Text style={s.lobbyTitle}>群组</Text>
        </View>
        <ThemeDivider style={s.lobbyDivider} color={groupTheme.c027} tickColor={groupTheme.c026} />
      </View>
      )}

      <ScrollView style={s.lobbyScroll} contentContainerStyle={s.lobbyContent}>
        <BridgeDashboard />
        <PatrolReportCard />

        {isEH ? (
          <EhEntryCard
            variant="comm"
            tag="COMM"
            name="通讯频段"
            desc={`${roomCount} 个频道在线`}
            meta="▸ OPEN COMM ARRAY"
            count={roomCount}
            onPress={onOpenComms}
          />
        ) : (
        <TouchableOpacity
          style={[s.roomCard, s.roomCardSurface]}
          onPress={onOpenComms}
          activeOpacity={0.7}
        >
          <View style={s.roomCardEdge} />
          <View style={s.commCardRow}>
            <View style={s.commCardLeft}>
              <View style={s.roomCardHeader}>
                <View style={s.roomCardTitleRow}>
                  <Text style={s.channelTag}>COMM</Text>
                  <Text style={s.roomCardName}>通讯频段</Text>
                </View>
              </View>
              <Text style={s.roomCardMembers} numberOfLines={1}>
                {roomCount} 个频道在线
              </Text>
              <View style={s.roomCardDivider} />
              <View style={s.roomCardFooter}>
                <Text style={s.roomCardMeta}>▸ OPEN COMM ARRAY</Text>
              </View>
            </View>
            <View style={s.commCardRight}>
              <View style={s.commSignalBlock}>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={s.commSignalRow}>
                    <View
                      {...(Platform.OS === "web" ? { dataSet: { bridgepulse: "1" } } : {})}
                      style={[s.commSignalDot, i <= roomCount && s.commSignalDotOn]}
                    />
                    <Text style={s.commSignalLabel}>CH-{String(i).padStart(2, "0")}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.commSignalFreq}>FREQ OK</Text>
            </View>
          </View>
        </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Room List ───

/** EH channel row — flat 1px frame (no bevel: that's the entry cards' signature),
 *  tag plate + name, member line, blue traffic meta; avatar stack goes grayscale
 *  behind the dashed rail to keep the monochrome rule. */
function EhRoomCard({ room, idx, onPress }: { room: Room; idx: number; onPress: () => void }) {
  const EW = "rgba(255,255,255,";
  const readonly = isReadonlyRoom(room);
  const tag = readonly ? "OBS" : `CH-${String(idx + 1).padStart(2, "0")}`;
  const count = room.message_count ?? 0;
  const time = relativeTime(room.last_message_at);
  return (
    <View style={{ position: "relative" as const }}>
      <div
        onClick={onPress}
        style={{ background: "#000", border: `1px solid ${EW}0.4)`, padding: "9px 12px 8px", cursor: "pointer", userSelect: "none", display: "flex", gap: 12 }}
      >
        {/* left: tag + name / members / traffic meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: "#fff", letterSpacing: 1.5, border: `1px solid ${EW}0.6)`, padding: "2px 5px", fontWeight: 700, flexShrink: 0 }}>{tag}</span>
            <span style={{ fontFamily: fonts.pixel, fontSize: 13, color: "#fff", letterSpacing: 1.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{room.name}</span>
            {readonly ? <span style={{ fontFamily: fonts.pixel, fontSize: 9, color: `${EW}0.5)`, flexShrink: 0 }}>旁听</span> : null}
          </div>
          <div style={{ fontFamily: fonts.pixel, fontSize: 11, color: `${EW}0.6)`, marginTop: 6, letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roomDescription(room)}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 7 }}>
            {count > 0 ? (
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 1.5 }}>▸ {count} MSG</span>
            ) : (
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EW}0.35)`, letterSpacing: 1.5 }}>· NO TRAFFIC ·</span>
            )}
            <span style={{ flex: 1 }} />
            {time ? <span style={{ fontFamily: fonts.pixel, fontSize: 10, color: `${EW}0.45)` }}>{time}</span> : null}
          </div>
        </div>
        {/* right: grayscale avatar stack behind the dashed rail */}
        <div style={{ display: "flex", alignItems: "center", paddingLeft: 12, borderLeft: `1px dashed ${EW}0.2)`, filter: "grayscale(1) brightness(1.05)" }}>
          {(room.members || []).slice(0, 3).map((member, ai) => (
            <View key={member.id} style={{ marginLeft: ai > 0 ? -8 : 0 }}>
              <MemberAvatar member={member} size={24} compact />
            </View>
          ))}
        </div>
      </div>
    </View>
  );
}

/** EH crew DM card — same panel language as EhRoomCard: black face, white
    hairline frame, plate tag, EH_BLUE meta row, geometric crest on the rail */
function EhCrewCard({ name, idx, onPress }: { name: string; idx: number; onPress: () => void }) {
  const EW = "rgba(255,255,255,";
  return (
    <View style={{ position: "relative" as const }}>
      <div
        onClick={onPress}
        style={{ background: "#000", border: `1px solid ${EW}0.4)`, padding: "9px 12px 8px", cursor: "pointer", userSelect: "none", display: "flex", gap: 12 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 1.5, border: `1px solid rgba(96,168,255,0.55)`, padding: "2px 5px", fontWeight: 700, flexShrink: 0 }}>{`DM-${String(idx + 1).padStart(2, "0")}`}</span>
            <span style={{ fontFamily: fonts.pixel, fontSize: 13, color: "#fff", letterSpacing: 1.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
          </div>
          <div style={{ fontFamily: fonts.pixel, fontSize: 11, color: `${EW}0.6)`, marginTop: 6, letterSpacing: 0.5 }}>API 船员 · 直连专线</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 7 }}>
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 1.5 }}>▸ CREW LINK</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: "#78c878", letterSpacing: 1 }}>RDY</span>
          </div>
        </div>
        {/* crest on the rail — geometric mark instead of avatar stack */}
        <div style={{ display: "flex", alignItems: "center", paddingLeft: 12, borderLeft: `1px dashed ${EW}0.2)` }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="4" width="16" height="16" stroke="rgba(96,168,255,0.55)" strokeWidth="1.2" fill="none" transform="rotate(45 12 12)" />
            <rect x="9" y="9" width="6" height="6" fill="rgba(96,168,255,0.7)" transform="rotate(45 12 12)" />
          </svg>
        </div>
      </div>
    </View>
  );
}

function RoomListView({
  rooms,
  loading,
  error,
  onSelect,
  onRefresh,
  onBack,
  crew = [],
  onSelectCrew,
}: {
  rooms: Room[];
  loading: boolean;
  error: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onBack: () => void;
  crew?: { id: string; name: string }[];
  onSelectCrew?: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  // 新建房间（#4，2026-07-08 Eri 点名"我能不能自己建群"）
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMembers, setNewMembers] = useState<string[]>(["epsilon"]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const memberChoices = useMemo(() => ([
    // 名牌基准（2026-07-08 Eri）：英文名+emoji。UNIT-C的正身是 crew（UNIT-C），
    // 不再放 deepseek 内置身份的重复入口——同一个人只有一扇门。
    { id: "epsilon", name: "UNIT-A" },
    { id: "cursa", name: "UNIT-B" },
    ...crew.map((c) => ({ id: c.id.startsWith("crew:") ? c.id : `crew:${c.id}`, name: c.name })),
  ]), [crew]);
  const toggleNewMember = (id: string) => {
    setNewMembers((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));
  };
  const submitCreateRoom = async () => {
    const name = newName.trim();
    if (!name || !newMembers.length || createBusy) return;
    setCreateBusy(true);
    setCreateError("");
    try {
      const result = await api.createRoom({ name, members: newMembers });
      setCreating(false);
      setNewName("");
      setNewMembers(["epsilon"]);
      onRefresh();
      onSelect(result.room.id);
    } catch (e: any) {
      setCreateError(e?.message || "创建失败");
    } finally {
      setCreateBusy(false);
    }
  };
  const chipOn = isEH ? "rgba(96,168,255,0.9)" : theme.pixel.gold;
  const chipOff = isEH ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.25)";
  // 网关总用量（#3 群组dashboard，2026-07-08）：7日汇总，进频段页拉一次
  const [gwUsage, setGwUsage] = useState<GatewayUsageRow[] | null>(null);
  useEffect(() => {
    if (!crew.length) return;
    let cancelled = false;
    api.gatewayUsage(7).then((r) => { if (!cancelled) setGwUsage(r.summary || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [crew.length]);
  return (
    <View style={[s.container, isEH && { backgroundColor: "#000" }]}>
      <ThemeBackground orbitSlot="none" crt crtColor={groupTheme.crtScanlineBg} />
      {isEH ? (
        <EhBridgeHeader
          paddingTop={insets.top}
          label="COMM"
          title="通讯频段"
          countText={`${rooms.length} CHANNELS`}
          onBack={onBack}
        />
      ) : (
      <View style={[s.lobbyHeader, { paddingTop: insets.top }]}>
        <View style={s.lobbyScanline}>
          <Text style={s.lobbyScanlineText}>COMM</Text>
          <View
            {...(Platform.OS === "web" ? { dataSet: { bridgepulse: "1" } } : {})}
            style={s.lobbyScanlineDot}
          />
          <Text style={s.lobbyScanlineText}>ACTIVE</Text>
          <View style={s.lobbyScanlineFill} />
          <Text style={s.lobbyScanlineText}>{rooms.length} CHANNELS</Text>
        </View>
        <View style={s.lobbyTitleRow}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.6} style={s.commBackBtn}>
            <Text style={s.commBackText}>‹ 群组</Text>
          </TouchableOpacity>
          <Text style={s.lobbyTitle}>通讯频段</Text>
        </View>
        <ThemeDivider style={s.lobbyDivider} color={groupTheme.c027} tickColor={groupTheme.c026} />
      </View>
      )}

      <ScrollView
        style={s.lobbyScroll}
        contentContainerStyle={s.lobbyContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={theme.pixel.gold} />
        }
      >
        {rooms.filter((room) => !isCursaDm(room)).map((room, idx) => isEH ? (
            <EhRoomCard key={room.id} room={room} idx={idx} onPress={() => onSelect(room.id)} />
          ) : (
            <TouchableOpacity
              key={room.id}
              style={[s.roomCard, s.roomCardSurface]}
              onPress={() => onSelect(room.id)}
              activeOpacity={0.7}
            >
              <View style={s.roomCardEdge} />
              <View style={s.roomCardBody}>
                <View style={s.roomCardHeader}>
                  <View style={s.roomCardTitleRow}>
                    <View style={s.roomAvatarStack}>
                      {(room.members || []).slice(0, 4).map((member, ai) => (
                        <View key={member.id} style={[s.roomAvatarOverlap, ai > 0 && { marginLeft: -8 }]}>
                          <MemberAvatar member={member} size={28} compact />
                        </View>
                      ))}
                    </View>
                    <Text style={s.channelTag}>
                      {isReadonlyRoom(room) ? "OBS" : `CH-${String(idx + 1).padStart(2, "0")}`}
                    </Text>
                    {isReadonlyRoom(room) && <Text style={s.observerTag}>旁听</Text>}
                    <Text style={s.roomCardName}>{room.name}</Text>
                  </View>
                  <Text style={s.roomCardArrow}>›</Text>
                </View>
                <Text style={s.roomCardMembers} numberOfLines={1}>
                  {roomDescription(room)}
                </Text>
                <View style={s.roomCardDivider} />
                <View style={s.roomCardFooter}>
                  {room.message_count != null && room.message_count > 0 ? (
                    <Text style={s.roomCardMeta}>{room.message_count} 条消息</Text>
                  ) : (
                    <Text style={s.roomCardMeta}>还没有消息</Text>
                  )}
                  {room.last_message_at ? (
                    <Text style={s.roomCardTime}>{relativeTime(room.last_message_at)}</Text>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          )
        )}

        {/* API 船员私聊频段（压榨清单#3）：控制室招募的船员，一人一条专线 */}
        {crew.length > 0 && (
          <>
            <Text style={[s.roomCardMeta, { marginTop: 14, marginBottom: 6, letterSpacing: 2, ...(isEH ? { fontFamily: "Silkscreen", fontSize: 8, color: "rgba(96,168,255,0.85)" } : {}) }]}>
              ◆ 船员专线 · CREW DM
            </Text>
            {gwUsage && gwUsage.length > 0 && (
              <View style={{
                marginBottom: 8,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: isEH ? "rgba(96,168,255,0.3)" : "rgba(255,255,255,0.14)",
                borderRadius: isEH ? 0 : 8,
                backgroundColor: isEH ? "rgb(12,12,14)" : "rgba(255,255,255,0.03)",
              }}>
                {gwUsage.map((row) => {
                  const tone = isEH ? "rgba(96,168,255,0.85)" : theme.pixel.gold;
                  const dim = isEH ? "rgba(255,255,255,0.45)" : theme.textMuted;
                  const tk = (row.input_tokens || 0) + (row.output_tokens || 0) + (row.cache_read_tokens || 0);
                  const tkLabel = tk >= 1000000 ? `${(tk / 1000000).toFixed(1)}M` : tk >= 1000 ? `${(tk / 1000).toFixed(1)}K` : String(tk);
                  return (
                    <View key={row.provider_id} style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <Text style={{ color: tone, fontSize: isEH ? 9 : 12, letterSpacing: 1, ...(isEH ? { fontFamily: "Silkscreen" } : {}) }}>
                        {row.name}
                      </Text>
                      <Text style={{ color: dim, fontSize: isEH ? 8 : 11, ...(isEH ? { fontFamily: "Silkscreen" } : {}) }}>
                        7D {row.calls}次 · {tkLabel} tk · HIT {Math.round((row.cache_hit_rate || 0) * 100)}% · {row.avg_latency_ms ? `${(row.avg_latency_ms / 1000).toFixed(1)}s` : "-"}
                        {row.failures ? ` · ✗${row.failures}` : ""}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            {crew.map((member, ci) => isEH ? (
              <EhCrewCard key={member.id} name={member.name} idx={ci} onPress={() => onSelectCrew?.(member.id)} />
            ) : (
              <TouchableOpacity
                key={member.id}
                style={[s.roomCard, s.roomCardSurface]}
                onPress={() => onSelectCrew?.(member.id)}
                activeOpacity={0.7}
              >
                <View style={s.roomCardEdge} />
                <View style={s.roomCardBody}>
                  <View style={s.roomCardHeader}>
                    <View style={s.roomCardTitleRow}>
                      <Text style={s.roomCardName}>◆ {member.name}</Text>
                    </View>
                    <Text style={s.channelTag}>{`DM-${String(ci + 1).padStart(2, "0")}`}</Text>
                  </View>
                  <Text style={s.roomCardMembers} numberOfLines={1}>API 船员 · 直连专线</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* 新建房间（#4）：幽灵卡展开成内联表单，双主题共用骨架各自着色 */}
        {!creating ? (
          <TouchableOpacity
            onPress={() => { setCreating(true); setCreateError(""); }}
            activeOpacity={0.7}
            style={{
              marginTop: 14,
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: isEH ? "rgba(96,168,255,0.4)" : "rgba(255,255,255,0.2)",
              borderRadius: isEH ? 0 : 10,
            }}
          >
            <Text style={{
              color: isEH ? "rgba(96,168,255,0.85)" : theme.textMuted,
              fontSize: isEH ? 9 : 13,
              letterSpacing: 2,
              ...(isEH ? { fontFamily: "Silkscreen" } : {}),
            }}>
              ＋ 新建房间 · NEW CHANNEL
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{
            marginTop: 14,
            padding: 14,
            borderWidth: 1,
            borderColor: isEH ? "rgba(96,168,255,0.5)" : "rgba(255,255,255,0.22)",
            borderRadius: isEH ? 0 : 10,
            backgroundColor: isEH ? "rgb(16,16,18)" : "rgba(255,255,255,0.04)",
          }}>
            <Text style={{
              color: isEH ? "rgba(96,168,255,0.9)" : theme.pixel.gold,
              fontSize: isEH ? 9 : 12,
              letterSpacing: 2,
              marginBottom: 10,
              ...(isEH ? { fontFamily: "Silkscreen" } : {}),
            }}>
              新建房间
            </Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="房间名字…"
              placeholderTextColor={isEH ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.35)"}
              maxLength={40}
              style={{
                color: "#fff",
                borderWidth: 1,
                borderColor: isEH ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.2)",
                borderRadius: isEH ? 0 : 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 14,
                marginBottom: 12,
              }}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {memberChoices.map((choice) => {
                const on = newMembers.includes(choice.id);
                return (
                  <TouchableOpacity
                    key={choice.id}
                    onPress={() => toggleNewMember(choice.id)}
                    activeOpacity={0.7}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderWidth: 1,
                      borderColor: on ? chipOn : chipOff,
                      borderRadius: isEH ? 0 : 14,
                      backgroundColor: on
                        ? (isEH ? "rgba(96,168,255,0.12)" : "rgba(230,180,80,0.12)")
                        : "transparent",
                    }}
                  >
                    <Text style={{ color: on ? chipOn : (isEH ? "rgba(255,255,255,0.6)" : theme.textMuted), fontSize: 12 }}>
                      {on ? "◆ " : "◇ "}{choice.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {createError ? (
              <Text style={{ color: theme.warning, fontSize: 12, marginBottom: 8 }}>{createError}</Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={submitCreateRoom}
                disabled={createBusy || !newName.trim() || !newMembers.length}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: chipOn,
                  borderRadius: isEH ? 0 : 8,
                  opacity: createBusy || !newName.trim() || !newMembers.length ? 0.4 : 1,
                }}
              >
                <Text style={{ color: chipOn, fontSize: 13, letterSpacing: 1 }}>
                  {createBusy ? "建造中…" : "创建"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCreating(false)}
                activeOpacity={0.7}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: chipOff,
                  borderRadius: isEH ? 0 : 8,
                }}
              >
                <Text style={{ color: isEH ? "rgba(255,255,255,0.6)" : theme.textMuted, fontSize: 13 }}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!loading && error ? (
          <View style={s.lobbyEmpty}>
            <Text style={s.lobbyEmptyText}>频道加载失败</Text>
            <Text style={s.lobbyErrorText}>{error}</Text>
          </View>
        ) : null}

        {!loading && !error && rooms.length === 0 ? (
          <View style={s.lobbyEmpty}>
            <Text style={s.lobbyEmptyText}>没有可用的频道</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Chat Room ───

function RoomHighlightedSnippet({ snippet }: { snippet: string }) {
  const parts = snippet.split(/(<mark>.*?<\/mark>)/g);
  return (
    <Text style={s.roomSearchSnippet} numberOfLines={3}>
      {parts.map((part, i) => {
        const match = part.match(/^<mark>(.*)<\/mark>$/);
        if (match) {
          return (
            <Text key={i} style={s.roomSearchHighlight}>
              {match[1]}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

function ChatRoomView({
  room,
  onBack,
}: {
  room: Room;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  const tabFocused = useIsFocused();
  const containerRef = useRef<View>(null);
  useWebViewportFit(containerRef, insets.bottom);
  const pinViewport = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      requestAnimationFrame(() => window.scrollTo(0, 0));
      setTimeout(() => window.scrollTo(0, 0), 100);
    }
  }, []);
  const listRef = useRef<FlatList<VisibleRoomMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const sendBtnRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const prevent = (e: Event) => e.preventDefault();
    const el = sendBtnRef.current as unknown as HTMLElement;
    if (el) el.addEventListener("pointerdown", prevent);
    return () => { if (el) el.removeEventListener("pointerdown", prevent); };
  }, []);
  const isAtBottomRef = useRef(true);
  // 快速滑动时 scroll 事件稀疏，isAtBottomRef 可能基于过期位置误判"在底部"，
  // 轮询的新消息一到就 scrollToEnd 把人拽走（鬼畜跳）。滚动后 600ms 内不自动滚。
  const lastUserScrollTsRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const needsScrollRef = useRef(true);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const messagesRef = useRef<RoomMessage[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<RoomSummary[]>([]);
  const [text, setText] = useState("");
  const [quotedMessage, setQuotedMessage] = useState<RoomMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(RoomMessage & { match_snippet?: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeqRef = useRef(0);
  const awaitingRoomReplyStartedAtRef = useRef<number | null>(null);
  const [awaitingRoomReply, setAwaitingRoomReply] = useState(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const cursaDirect = isCursaDm(room);
  const roomReadonly = isReadonlyRoom(room);

  const startRoomFastPolling = useCallback(() => {
    awaitingRoomReplyStartedAtRef.current = Date.now();
    setAwaitingRoomReply(true);
  }, []);

  const stopRoomFastPolling = useCallback(() => {
    awaitingRoomReplyStartedAtRef.current = null;
    setAwaitingRoomReply(false);
  }, []);

  const memberNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const member of room.members || []) {
      names.set(member.id, member.name);
    }
    names.set("system", "SYSTEM");
    return names;
  }, [room]);

  const membersById = useMemo(() => {
    const members = new Map<string, Room["members"][number]>();
    for (const member of room.members || []) {
      members.set(member.id, member);
    }
    return members;
  }, [room]);


  const latestSummary = summaries[0];
  const messagesSinceSummary = useMemo(() => {
    if (!latestSummary) return messages.length;
    const rangeEnd = latestSummary.message_range_end;
    if (!rangeEnd) return 0;
    const idx = messages.findIndex((m) => m.id === rangeEnd);
    return idx >= 0 ? Math.max(0, messages.length - idx - 1) : 0;
  }, [latestSummary, messages]);
  const summaryReady = messagesSinceSummary >= 30;
  const visibleItems = useMemo(
    () => buildVisibleRoomMessages(messages, cursaDirect),
    [cursaDirect, messages]
  );

  const loadData = useCallback(
    async (quiet = false) => {
      const seq = ++loadSeqRef.current;
      const existingIds = new Set(messagesRef.current.map((m) => m.id));
      const incomingFresh = (rows: RoomMessage[]) => rows.filter((m) => !existingIds.has(m.id));
      if (!quiet) setLoading(true);
      try {
        const [msgRes, sumRes] = await Promise.all([
          api.roomMessages(room.id, { limit: 100 }),
          api.roomSummaries(room.id, 3),
        ]);
        if (seq !== loadSeqRef.current) return;
        if (isInitialLoadRef.current) {
          for (const m of msgRes.messages) seenIdsRef.current.add(m.id);
          messagesRef.current = msgRes.messages;
          setMessages(msgRes.messages);
          isInitialLoadRef.current = false;
          isAtBottomRef.current = true;
          needsScrollRef.current = true;
        } else {
          const freshMessages = incomingFresh(msgRes.messages);
          if (freshMessages.length > 0) {
            messagesRef.current = [...messagesRef.current, ...freshMessages];
            setMessages((cur) => {
              const curIds = new Set(cur.map((m) => m.id));
              const fresh = msgRes.messages.filter((m) => !curIds.has(m.id));
              if (fresh.length === 0) return cur;
              return [...cur, ...fresh];
            });
          }
          if (freshMessages.some(roomMessageWantsContinuation)) {
            startRoomFastPolling();
          } else if (freshMessages.some((m) => m.sender !== "eri" && m.sender !== "system")) {
            stopRoomFastPolling();
          }
          if (isAtBottomRef.current && Date.now() - lastUserScrollTsRef.current > 600) {
            needsScrollRef.current = true;
          }
        }
        // 内容没变就保留原引用，免得每次轮询都触发摘要区重渲染
        setSummaries((cur) => (JSON.stringify(cur) === JSON.stringify(sumRes.summaries) ? cur : sumRes.summaries));
        setError("");
      } catch (err) {
        if (quiet && isQuietRefreshAbort(err)) return;
        if (seq !== loadSeqRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!quiet && seq === loadSeqRef.current) setLoading(false);
      }
    },
    [room.id, startRoomFastPolling, stopRoomFastPolling]
  );

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!tabFocused) return;
    const intervalMs = awaitingRoomReply ? ROOM_POLL_FAST_MS : ROOM_POLL_SLOW_MS;
    const t = setInterval(() => {
      const startedAt = awaitingRoomReplyStartedAtRef.current;
      if (awaitingRoomReply && startedAt && Date.now() - startedAt > ROOM_POLL_FAST_WINDOW_MS) {
        stopRoomFastPolling();
        return;
      }
      loadData(true);
    }, intervalMs);
    return () => clearInterval(t);
  }, [awaitingRoomReply, loadData, stopRoomFastPolling, tabFocused]);

  const send = useCallback(async () => {
    const draft = text.trim();
    if (!draft || sending) return;
    setSending(true);
    setError("");
    try {
      const payload = cursaDirect
        ? { text: draft, mode: "direct" as RoomMode, target: "cursa" as RoomTarget, ...(quotedMessage ? { quoted_id: quotedMessage.id } : {}) }
        : { text: draft, ...detectMention(draft, room.members), ...(quotedMessage ? { quoted_id: quotedMessage.id } : {}) };
      const result = await api.sendRoomMessage(room.id, payload);
      if (hasQueuedRoomDispatch(result)) startRoomFastPolling();
      setText("");
      setQuotedMessage(null);
      setMessages((cur) => {
        if (cur.some((m) => m.id === result.message.id)) return cur;
        const next = [...cur, result.message];
        messagesRef.current = next;
        return next;
      });
      isAtBottomRef.current = true;
      needsScrollRef.current = true;
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }, [cursaDirect, loadData, quotedMessage, room.id, sending, startRoomFastPolling, text]);


  const createSummary = useCallback(async () => {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const sum = await api.createRoomSummary(room.id, 80);
      setSummaries((cur) => [sum, ...cur.filter((s) => s.id !== sum.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarizing(false);
    }
  }, [room.id, summarizing]);

  const handleRoomSearch = useCallback((q) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchRoom(room.id, q.trim());
        setSearchResults(res.messages);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [room.id]);

  const closeRoomSearch = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
  }, []);

  const jumpToRoomMessage = useCallback(
    (message: RoomMessage) => {
      const scrollToIndex = (index: number) => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.5,
          });
        });
      };
      const loadedIndex = visibleItems.findIndex((item) => item.message.id === message.id);
      closeRoomSearch();
      if (loadedIndex >= 0) {
        scrollToIndex(loadedIndex);
        return;
      }

      const mergedMessages = [...messages.filter((m) => m.id !== message.id), message].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const mergedItems = buildVisibleRoomMessages(mergedMessages, cursaDirect);
      const mergedIndex = mergedItems.findIndex((item) => item.message.id === message.id);
      if (mergedIndex < 0) {
        setError("这条消息当前不可见。");
        return;
      }
      setMessages(mergedMessages);
      scrollToIndex(mergedIndex);
    },
    [closeRoomSearch, cursaDirect, messages, visibleItems]
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const renderMessage = useCallback(
    ({ item }: { item: VisibleRoomMessage }) => {
      const id = item.message.id;
      const isNew = Platform.OS === "web" && !seenIdsRef.current.has(id);
      if (isNew) seenIdsRef.current.add(id);
      const fade = isNew ? (item.message.sender === "eri" ? "send" : "appear") : null;
      return (
        <RoomMessageBubble
          message={item.message}
          isGroupStart={item.isGroupStart}
          isGroupEnd={item.isGroupEnd}
          member={membersById.get(item.message.sender)}
          memberName={memberNames.get(item.message.sender) || item.message.sender}
          fadeType={fade}
          onQuote={roomReadonly ? undefined : () => setQuotedMessage(item.message)}
          onReact={roomReadonly ? undefined : async (emoji) => {
            try {
              const res = await api.reactRoomMessage(room.id, item.message.id, emoji);
              setMessages((cur) => cur.map((m) =>
                m.id === item.message.id ? { ...m, reactions: JSON.stringify(res.reactions) } : m
              ));
            } catch {}
          }}
        />
      );
    },
    [memberNames, membersById, room.id, roomReadonly]
  );

  const keyExtractor = useCallback((item: VisibleRoomMessage) => item.message.id, []);

  const handleListScroll = useCallback((e) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isAtBottomRef.current = distanceFromBottom < 80;
    lastUserScrollTsRef.current = Date.now();
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (needsScrollRef.current) {
      needsScrollRef.current = false;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return (
    <View
      ref={containerRef}
      style={[s.container, isEH && { backgroundColor: "#000" }]}
    >
      <ThemeBackground
        orbitSlot={cursaDirect ? "static-left-cursa" : "static-right-home"}
        crt
        crtColor={groupTheme.crtScanlineBg}
        scene={cursaDirect ? "cursa" : "horizon"}
      />
      {/* header */}
      {isEH ? (
        <div style={{ position: "relative", zIndex: 2, background: "#000", padding: `${insets.top + 6}px 14px 0` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: "rgba(255,255,255,0.65)", letterSpacing: 2 }}>{cursaDirect ? "DM" : "CH"}</span>
            <svg width="6" height="6"><rect width="6" height="6" fill="#78c878"><animate attributeName="opacity" values="1;0.2;1" dur="2.5s" repeatCount="indefinite" /></rect></svg>
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: "rgba(255,255,255,0.65)", letterSpacing: 2 }}>LINKED</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.15)" }} />
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: "rgba(255,255,255,0.65)", letterSpacing: 2 }}>{(room.members || []).length} CREW</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 9 }}>
            <div
              onClick={onBack}
              style={{ border: "1px solid rgba(255,255,255,0.55)", padding: "3px 8px 3px 7px", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
            >
              <span style={{ fontFamily: fonts.pixel, fontSize: 11, color: "#fff", lineHeight: "12px" }}>‹</span>
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: "rgba(255,255,255,0.75)", letterSpacing: 1.5, lineHeight: "9px" }}>COMM</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: fonts.pixel, fontSize: 14, color: "#fff", letterSpacing: 2, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {cursaDirect ? "CURSA" : room.name}
              </div>
              {!cursaDirect && (
                <div style={{ fontFamily: fonts.pixel, fontSize: 8.5, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {roomDescription(room)}
                </div>
              )}
            </div>
            <div
              onClick={() => setShowSearch(true)}
              style={{ border: "1px solid rgba(255,255,255,0.35)", padding: "3px 8px", cursor: "pointer", userSelect: "none", flexShrink: 0, display: "flex", alignItems: "center" }}
            >
              {/* pixel font sits low in its em box — pin line-height so the text centers in the plate */}
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: "rgba(255,255,255,0.75)", letterSpacing: 1.5, lineHeight: "9px" }}>SCAN</span>
            </div>
          </div>
          <svg width="100%" height="11" viewBox="0 0 360 11" preserveAspectRatio="none" style={{ display: "block", marginTop: 8 }}>
            <path d="M0 1.5 L216 1.5 L228 8.5 L318 8.5 L330 1.5 L360 1.5" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      ) : (
      <View style={[s.chatHeader, { paddingTop: insets.top }]}>
        <View style={s.chatScanline}>
          <Text style={s.chatScanlineText}>{cursaDirect ? "DM" : "CH"}</Text>
          <View
            {...(Platform.OS === "web" ? { dataSet: { bridgepulse: "1" } } : {})}
            style={s.chatScanlineDot}
          />
          <Text style={s.chatScanlineText}>LINKED</Text>
          <View style={s.chatScanlineFill} />
          <Text style={s.chatScanlineText}>{(room.members || []).length} CREW</Text>
        </View>
        <View style={s.chatTitleRow}>
          <TouchableOpacity style={s.backButton} onPress={onBack} activeOpacity={0.7}>
            <Text style={s.backText}>‹ 群组</Text>
          </TouchableOpacity>
          <View style={s.chatTitleBlock}>
            <Text style={s.chatTitle} numberOfLines={1}>{cursaDirect ? "UNIT-B" : room.name}</Text>
            {!cursaDirect && <Text style={s.chatSubtitle}>{roomDescription(room)}</Text>}
          </View>
          <TouchableOpacity
            onPress={() => setShowSearch(true)}
            style={s.roomSearchBtn}
            activeOpacity={0.7}
          >
            <Text style={s.roomSearchBtnText}>搜索</Text>
          </TouchableOpacity>
        </View>
        <ThemeDivider style={s.chatDivider} color={groupTheme.c027} tickColor={groupTheme.c026} />
      </View>
      )}

      {showSearch && (
        <View style={[s.roomSearchOverlay, isEH && ehs.roomSearchOverlay]}>
          <View style={[s.roomSearchBarRow, isEH && ehs.roomSearchBarRow, { paddingTop: insets.top + 8 }]}>
            <Text style={{ fontSize: 14 }}>🔍</Text>
            <TextInput
              style={[s.roomSearchInput, isEH && ehs.roomSearchInput]}
              value={searchQuery}
              onChangeText={handleRoomSearch}
              placeholder="搜索房间消息..."
              placeholderTextColor={theme.textMuted}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery !== "" && (
              <TouchableOpacity
                onPress={() => { setSearchQuery(""); setSearchResults([]); }}
                style={{ paddingHorizontal: 4 }}
              >
                <Text style={{ color: theme.textDim, fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={closeRoomSearch}
              style={{ paddingHorizontal: 6 }}
            >
              <Text style={s.roomSearchCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
          {searching && (
            <View style={s.roomSearchStatus}>
              <Text style={s.roomSearchStatusText}>搜索中…</Text>
            </View>
          )}
          {!searching && searchQuery.trim() !== "" && searchResults.length === 0 && (
            <View style={s.roomSearchStatus}>
              <Text style={s.roomSearchStatusText}>没有找到相关消息</Text>
            </View>
          )}
          {searchResults.length > 0 && (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              renderItem={({ item }) => {
                const d = new Date(item.created_at);
                const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                const senderName = memberNames.get(item.sender) || item.sender;
                return (
                  <TouchableOpacity
                    style={s.roomSearchResultItem}
                    activeOpacity={0.7}
                    onPress={() => jumpToRoomMessage(item)}
                  >
                    <View style={s.roomSearchResultHeader}>
                      <Text style={s.roomSearchResultSender}>{senderName}</Text>
                      <Text style={s.roomSearchResultTime}>{timeStr}</Text>
                    </View>
                    {item.match_snippet ? (
                      <RoomHighlightedSnippet snippet={item.match_snippet} />
                    ) : (
                      <Text style={s.roomSearchSnippet} numberOfLines={3}>{item.text}</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {/* summary — only show button when enough messages accumulated */}
      {!cursaDirect && summaryReady && (
        <TouchableOpacity
          style={[s.summaryBar, isEH && ehs.summaryBar, summarizing && s.disabled]}
          onPress={createSummary}
          disabled={summarizing || messages.length === 0}
          activeOpacity={0.75}
        >
          <Text style={[s.summaryLabel, isEH && ehs.summaryLabel]}>
            {summarizing ? "生成总结中..." : `已积累 ${messagesSinceSummary} 条新消息 · 点击生成阶段总结`}
          </Text>
        </TouchableOpacity>
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}

      {/* messages */}
      <FlatList
        ref={listRef}
        data={visibleItems}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        style={s.list}
        contentContainerStyle={s.listContent}
        initialNumToRender={100}
        maxToRenderPerBatch={100}
        updateCellsBatchingPeriod={120}
        windowSize={9}
        removeClippedSubviews={Platform.OS !== "web"}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => loadData()} tintColor={theme.pixel.gold} />
        }
        onScroll={handleListScroll}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, info.averageItemLength * info.index),
            animated: true,
          });
        }}
        scrollEventThrottle={100}
        onContentSizeChange={handleContentSizeChange}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>{loading ? "加载中" : "还没有消息"}</Text>
            <Text style={s.emptyText}>这个频道还没有新消息。</Text>
          </View>
        }
      />

      {roomReadonly ? (
        <View style={[s.observerComposer, isEH && ehs.observerComposer, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={[s.observerText, isEH && ehs.observerText]}>你在旁听悄悄话。</Text>
        </View>
      ) : (
      <View style={[s.composerWrap, isEH && ehs.composerWrap, { paddingBottom: insets.bottom + 10 }]}>
        {isEH ? (
          /* notched shoulder lines — same part as HudHeader's bottom separator, NOT mirrored */
          <div style={{ position: "absolute", top: -10, left: 0, right: 0, height: 12, zIndex: 100, pointerEvents: "none" }}>
            <svg width="100%" height="12" viewBox="0 0 360 12" preserveAspectRatio="none" style={{ position: "absolute", left: 0, top: 0, width: "100%" }}>
              <path d="M0 3 L80 3 L100 8 L260 8 L280 3 L360 3 L360 12 L0 12 Z" fill="#000" />
              <path d="M0 3 L80 3 L100 8 L260 8 L280 3 L360 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
              <path d="M0 6 L75 6 L97 10 L263 10 L285 6 L360 6" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ position: "absolute", left: 14, bottom: -6, display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 4, height: 4, backgroundColor: "rgba(120,200,120,0.8)" }} />
              <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: "rgba(255,255,255,0.55)", letterSpacing: 2 }}>TX_OPEN</span>
            </div>
            <div style={{ position: "absolute", right: 14, bottom: -6, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: EH_BLUE, letterSpacing: 2 }}>{cursaDirect ? "DM" : "CH"}</span>
            </div>
          </div>
        ) : (
        <View style={s.composerCommBar}>
          <View style={s.composerDot} />
          <Text style={s.composerCommLabel}>COMM LINK</Text>
          <View style={s.composerSignal}>
            <View style={[s.composerSignalBar, { height: 2 }]} />
            <View style={[s.composerSignalBar, { height: 4 }]} />
            <View style={[s.composerSignalBar, { height: 6 }]} />
            <View style={[s.composerSignalBar, { height: 8 }]} />
          </View>
          <View style={s.composerCommLine} />
          <Text style={s.composerCommFreq}>{cursaDirect ? "DM" : "CH"}</Text>
        </View>
        )}
        <View style={[s.composer, isEH && ehs.composer]}>
        {!cursaDirect && (
          <View style={s.mentionRow}>
            {/* chips follow the room roster — a family room without UNIT-C/小娜 shouldn't offer them */}
            {[...(room.members || []).filter((m) => m.id !== "eri").map((m) => m.name), "all"].map((name) => (
              <TouchableOpacity
                key={name}
                style={[s.mentionChip, isEH && ehs.mentionChip]}
                activeOpacity={0.6}
                // web: mousedown 阶段阻止默认行为，点 chip 时输入框不丢焦点（键盘不收起）
                {...(isWeb ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
                onPress={() => {
                  const prefix = `@${name} `;
                  if (!text.startsWith(prefix)) setText(prefix + text);
                  // 原生端把焦点拉回输入框，键盘保持弹出
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              >
                <Text style={[s.mentionChipText, isEH && ehs.mentionChipText]}>@{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {quotedMessage && (
          <View style={[s.quoteBar, isEH && ehs.quoteBar]}>
            <View style={[s.quoteBarAccent, isEH && ehs.quoteBarAccent]} />
            <View style={s.quoteBarContent}>
              <Text style={[s.quoteBarSender, isEH && ehs.quoteBarSender]} numberOfLines={1}>
                {memberNames.get(quotedMessage.sender) || quotedMessage.sender}
              </Text>
              <Text style={s.quoteBarText} numberOfLines={2}>{quotedMessage.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setQuotedMessage(null)} style={s.quoteBarClose}>
              <Text style={s.quoteBarCloseX}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={[s.inputRow, isEH && ehs.inputRow]}>
            <TextInput
              ref={inputRef}
              style={[s.input, isEH && ehs.input]}
              value={text}
              onChangeText={setText}
              onFocus={pinViewport}
              placeholder={isEH ? "TRANSMISSION..." : "说点什么..."}
              placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : theme.textMuted}
              multiline
              maxLength={4000}
              blurOnSubmit={false}
              returnKeyType="default"
            />
            <TouchableOpacity
              ref={sendBtnRef as any}
              style={[s.sendBtn, isEH && ehs.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
              onPress={send}
              disabled={!text.trim() || sending}
              activeOpacity={0.4}
              {...(isWeb ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
            >
              <Text style={[s.iconText, isEH && ehs.iconText]}>▲</Text>
            </TouchableOpacity>
        </View>
        </View>
      </View>
      )}
    </View>
  );
}

// ─── Root ───

// ─── Command Center (指挥部) ───

function kindLabel(kind: string) {
  if (kind === "task") return "TASK";
  if (kind === "review_request") return "REVIEW";
  if (kind === "broadcast") return "INFO";
  if (kind === "question") return "Q&A";
  return kind.toUpperCase();
}

function kindColor(kind: string) {
  if (kind === "task") return theme.pixel.gold;
  if (kind === "review_request") return theme.blueAccent;
  if (kind === "broadcast") return theme.textMuted;
  return theme.textDim;
}

function statusColor(status: string) {
  if (status === "open") return theme.success;
  if (status === "waiting_review") return theme.warning;
  if (status === "resolved") return theme.textMuted;
  if (status === "archived") return groupTheme.c022;
  return theme.textDim;
}

function senderLabel(sender: string) {
  if (sender === "xiaoyi") return "UNIT-A";
  if (sender === "xiaosa") return "Cursa";
  if (sender === "deepseek" || sender === "omicron") return "UNIT-C";
  if (sender === "eri") return "Eri";
  return sender;
}

// EH command-center semantics — the three sanctioned colors plus poster blue
function ehKindColor(kind: string) {
  if (kind === "task") return "#e6b450";
  if (kind === "review_request") return EH_BLUE;
  if (kind === "question") return "#78c878";
  return "rgba(255,255,255,0.6)";
}
function ehStatusColor(status: string) {
  if (status === "open") return "#78c878";
  if (status === "waiting_review") return "#e6b450";
  if (status === "resolved") return "rgba(255,255,255,0.45)";
  return "rgba(255,255,255,0.25)";
}

/** EH order card — flat frame like EhRoomCard, kind plate + status lamp + blue meta */
function EhCmdCard({ thread, onPress }: { thread: any; onPress: () => void }) {
  const EW = "rgba(255,255,255,";
  const kc = ehKindColor(thread.kind);
  return (
    <View style={{ position: "relative" as const }}>
      <div
        onClick={onPress}
        style={{ background: "#000", border: `1px solid ${EW}0.4)`, padding: "9px 12px 8px", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: kc, letterSpacing: 1.5, border: `1px solid ${kc}`, padding: "2px 5px", fontWeight: 700, flexShrink: 0, lineHeight: "9px" }}>{kindLabel(thread.kind)}</span>
          <span style={{ width: 5, height: 5, background: ehStatusColor(thread.status), flexShrink: 0 }} />
          <span style={{ fontFamily: fonts.pixel, fontSize: 12.5, color: "#fff", letterSpacing: 1, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{thread.title}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: fonts.pixel, fontSize: 10, color: `${EW}0.5)`, flexShrink: 0 }}>›</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 7 }}>
          <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 1.5 }}>▸ {senderLabel(thread.sender)} · {thread.comments?.length || 0} MSG</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: fonts.pixel, fontSize: 10, color: `${EW}0.45)` }}>{thread.created_at?.slice(5, 10)}</span>
        </div>
      </div>
    </View>
  );
}

function CommandCenterView({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.channels(filter === "all" ? undefined : filter);
      const sorted = (res.threads || []).sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
      setThreads(sorted);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await api.channelDetail(id);
      setDetail(res.thread);
    } catch {}
  }, []);

  const openThread = useCallback((id: string) => {
    setSelectedId(id);
    loadDetail(id);
  }, [loadDetail]);

  const sendComment = useCallback(async () => {
    if (!selectedId || !commentText.trim() || sending) return;
    setSending(true);
    try {
      await api.channelComment(selectedId, commentText.trim());
      setCommentText("");
      loadDetail(selectedId);
    } catch {}
    setSending(false);
  }, [selectedId, commentText, sending, loadDetail]);

  const changeStatus = useCallback(async (status: string) => {
    if (!selectedId) return;
    try {
      await api.channelStatus(selectedId, status);
      loadDetail(selectedId);
      loadThreads();
    } catch {}
  }, [selectedId, loadDetail, loadThreads]);

  if (selectedId && detail) {
    return (
      <View style={[s.container, isEH && { backgroundColor: "#000" }]}>
        <ThemeBackground orbitSlot="none" crt crtColor={groupTheme.crtScanlineBg} />
        {isEH ? (
          <EhBridgeHeader
            paddingTop={insets.top}
            label="CMD"
            title={kindLabel(detail.kind)}
            countText={detail.status === "waiting_review" ? "REVIEW" : (detail.status || "").toUpperCase()}
            backLabel="CMD"
            onBack={() => { setSelectedId(null); setDetail(null); }}
          />
        ) : (
        <View style={[s.lobbyHeader, { paddingTop: insets.top }]}>
          <View style={s.lobbyScanline}>
            <Text style={s.lobbyScanlineText}>CMD</Text>
            <View style={s.lobbyScanlineDot} />
            <Text style={s.lobbyScanlineText}>{detail.status?.toUpperCase()}</Text>
            <View style={s.lobbyScanlineFill} />
            <Text style={s.lobbyScanlineText}>{kindLabel(detail.kind)}</Text>
          </View>
          <View style={s.lobbyTitleRow}>
            <TouchableOpacity onPress={() => { setSelectedId(null); setDetail(null); }} activeOpacity={0.6} style={s.commBackBtn}>
              <Text style={s.commBackText}>‹ 指挥部</Text>
            </TouchableOpacity>
          </View>
          <ThemeDivider style={s.lobbyDivider} color={groupTheme.c027} tickColor={groupTheme.c026} />
        </View>
        )}

        <ScrollView style={s.lobbyScroll} contentContainerStyle={s.lobbyContent}>
          <Text style={[s.cmdDetailTitle, isEH && ehs.cmdDetailTitle]}>{detail.title}</Text>
          <View style={s.cmdDetailMeta}>
            <Text style={[s.cmdTag, isEH && ehs.cmdTag, { borderColor: (isEH ? ehKindColor : kindColor)(detail.kind), color: (isEH ? ehKindColor : kindColor)(detail.kind) }]}>{kindLabel(detail.kind)}</Text>
            <Text style={[s.cmdMetaText, isEH && ehs.cmdMetaText]}>{senderLabel(detail.sender)}</Text>
            <Text style={[s.cmdMetaText, isEH && ehs.cmdMetaText]}>{detail.created_at?.slice(0, 10)}</Text>
          </View>
          <Text style={[s.cmdDetailBody, isEH && ehs.cmdDetailBody]}>{detail.body || detail.text}</Text>

          {/* status buttons */}
          <View style={s.cmdStatusRow}>
            {["open", "waiting_review", "resolved", "archived"].map((st) => {
              const sc = (isEH ? ehStatusColor : statusColor)(st);
              return (
              <TouchableOpacity
                key={st}
                style={[
                  s.cmdStatusBtn,
                  isEH && ehs.cmdStatusBtn,
                  detail.status === st && (isEH ? { borderColor: sc } : { borderColor: sc, backgroundColor: groupTheme.c023 }),
                ]}
                onPress={() => changeStatus(st)}
                activeOpacity={0.7}
              >
                <View style={[s.cmdStatusDot, isEH && { borderRadius: 0 }, { backgroundColor: sc }]} />
                <Text style={[s.cmdStatusText, isEH && ehs.cmdStatusText, detail.status === st && { color: sc }]}>{st === "waiting_review" ? "REVIEW" : st.toUpperCase()}</Text>
              </TouchableOpacity>
              );
            })}
          </View>

          {/* comments */}
          {(detail.comments || []).length > 0 && (
            <View style={[s.cmdComments, isEH && ehs.cmdComments]}>
              <Text style={[s.cmdCommentsTitle, isEH && ehs.cmdCommentsTitle]}>评论 ({detail.comments.length})</Text>
              {detail.comments.map((c: any, i: number) => (
                <View key={i} style={[s.cmdCommentItem, isEH && ehs.cmdCommentItem]}>
                  <Text style={[s.cmdCommentSender, isEH && ehs.cmdCommentSender]}>{senderLabel(c.sender)}</Text>
                  <Text style={[s.cmdCommentTime, isEH && ehs.cmdCommentTime]}>{c.created_at?.slice(0, 16)}</Text>
                  <Text style={[s.cmdCommentText, isEH && ehs.cmdCommentText]}>{c.body || c.text}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* comment input */}
        <View style={[s.cmdInputWrap, isEH && ehs.cmdInputWrap, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={[s.cmdInput, isEH && ehs.cmdInput]}
            value={commentText}
            onChangeText={setCommentText}
            placeholder={isEH ? "TRANSMISSION..." : "发条评论..."}
            placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : theme.textMuted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[s.cmdSendBtn, isEH && ehs.cmdSendBtn, (!commentText.trim() || sending) && s.sendBtnDisabled]}
            onPress={sendComment}
            disabled={!commentText.trim() || sending}
            activeOpacity={0.4}
            {...(isWeb ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
          >
            <Text style={[s.iconText, isEH && ehs.iconText]}>▲</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, isEH && { backgroundColor: "#000" }]}>
      <ThemeBackground orbitSlot="none" crt crtColor={groupTheme.crtScanlineBg} />
      {isEH ? (
        <EhBridgeHeader
          paddingTop={insets.top}
          label="CMD"
          title="指挥部"
          countText={`${threads.length} ORDERS`}
          onBack={onBack}
        />
      ) : (
      <View style={[s.lobbyHeader, { paddingTop: insets.top }]}>
        <View style={s.lobbyScanline}>
          <Text style={s.lobbyScanlineText}>CMD</Text>
          <View style={s.lobbyScanlineDot} />
          <Text style={s.lobbyScanlineText}>CENTER</Text>
          <View style={s.lobbyScanlineFill} />
          <Text style={s.lobbyScanlineText}>{threads.length} ORDERS</Text>
        </View>
        <View style={s.lobbyTitleRow}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.6} style={s.commBackBtn}>
            <Text style={s.commBackText}>‹ 群组</Text>
          </TouchableOpacity>
          <Text style={s.lobbyTitle}>指挥部</Text>
        </View>
        <ThemeDivider style={s.lobbyDivider} color={groupTheme.c027} tickColor={groupTheme.c026} />
      </View>
      )}

      {/* filter */}
      <View style={[s.cmdFilterRow, isEH && ehs.cmdFilterRow]}>
        {["open", "all", "resolved", "archived"].map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              s.cmdFilterBtn,
              isEH && ehs.cmdFilterBtn,
              filter === f && (isEH ? ehs.cmdFilterBtnActive : s.cmdFilterBtnActive),
            ]}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[
              s.cmdFilterText,
              isEH && ehs.cmdFilterText,
              filter === f && (isEH ? ehs.cmdFilterTextActive : s.cmdFilterTextActive),
            ]}>
              {f === "all" ? "全部" : f === "open" ? "进行中" : f === "resolved" ? "已完成" : "归档"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.lobbyScroll} contentContainerStyle={s.lobbyContent}>
        {loading && <Text style={[s.cmdEmpty, isEH && ehs.cmdEmpty]}>加载中...</Text>}
        {!loading && threads.length === 0 && <Text style={[s.cmdEmpty, isEH && ehs.cmdEmpty]}>没有工单</Text>}
        {threads.map((t) => isEH ? (
          <EhCmdCard key={t.id} thread={t} onPress={() => openThread(t.id)} />
        ) : (
          <TouchableOpacity
            key={t.id}
            style={[s.roomCard, s.roomCardSurface]}
            onPress={() => openThread(t.id)}
            activeOpacity={0.7}
          >
            <View style={s.roomCardEdge} />
            <View style={s.roomCardBody}>
              <View style={s.roomCardHeader}>
                <View style={s.roomCardTitleRow}>
                  <Text style={[s.cmdTag, { borderColor: kindColor(t.kind), color: kindColor(t.kind) }]}>{kindLabel(t.kind)}</Text>
                  <View style={[s.cmdStatusDot, { backgroundColor: statusColor(t.status) }]} />
                  <Text style={s.roomCardName} numberOfLines={1}>{t.title}</Text>
                </View>
                <Text style={s.roomCardArrow}>›</Text>
              </View>
              <View style={s.roomCardFooter}>
                <Text style={s.roomCardMeta}>{senderLabel(t.sender)} · {t.comments?.length || 0} 条评论</Text>
                <Text style={s.roomCardTime}>{t.created_at?.slice(5, 10)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function GroupScreen() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [showComms, setShowComms] = useState(false);
  const [showCmd, setShowCmd] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // API 船员私聊频段（压榨清单#3，Eri 拍板入口放群组通讯频段）
  const [crewList, setCrewList] = useState<{ id: string; name: string; enabled: number }[]>([]);
  const [activeCrewId, setActiveCrewId] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.rooms();
      setRooms(result.rooms.filter((r) => !isCursaDm(r)));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    api.gatewayCrew().then((r) => setCrewList((r.crew || []).filter((c) => c.enabled))).catch(() => {});
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const activeRoom = useMemo(() => rooms.find((r) => r.id === activeRoomId) || null, [activeRoomId, rooms]);
  const activeCrew = useMemo(() => crewList.find((c) => c.id === activeCrewId) || null, [activeCrewId, crewList]);

  if (activeCrew) {
    return (
      <CursaChatView
        assistant={`crew:${activeCrew.id}`}
        title={activeCrew.name}
        onSwitchBack={() => setActiveCrewId(null)}
      />
    );
  }

  if (activeRoom) {
    return (
      <ChatRoomView
        room={activeRoom}
        onBack={() => setActiveRoomId(null)}
      />
    );
  }

  if (showCmd) {
    return <CommandCenterView onBack={() => setShowCmd(false)} />;
  }

  if (showAudit) {
    return <AuditView onBack={() => setShowAudit(false)} />;
  }

  if (showComms) {
    return (
      <RoomListView
        rooms={rooms}
        loading={loading}
        error={error}
        onSelect={setActiveRoomId}
        onRefresh={loadRooms}
        onBack={() => setShowComms(false)}
        crew={crewList}
        onSelectCrew={setActiveCrewId}
      />
    );
  }

  return (
    <BridgeView
      roomCount={rooms.length}
      onOpenComms={() => setShowComms(true)}
      onOpenCmd={() => setShowCmd(true)}
      onOpenAudit={() => setShowAudit(true)}
    />
  );
}

// ─── Styles ───

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  crtOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  disabled: { opacity: 0.45 },

  // lobby
  lobbyHeader: {
    paddingHorizontal: 14,
    paddingBottom: 0,
    backgroundColor: theme.bg,
    zIndex: 2,
  },
  lobbyScanline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  lobbyScanlineText: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: groupTheme.c024,
    letterSpacing: 1,
  },
  lobbyScanlineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: groupTheme.c015,
  },
  lobbyScanlineFill: { flex: 1 },
  lobbyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  lobbyIcon: { width: 34, height: 34, tintColor: theme.pixel.gold },
  lobbyTitle: {
    fontFamily: fonts.pixel,
    fontSize: 20,
    color: theme.pixel.gold,
    ...(Platform.OS === "web" ? {
      textShadow: groupTheme.c025,
    } as any : {
      textShadowColor: groupTheme.c026,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    }),
  },
  lobbyDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 3,
    paddingBottom: 3,
  },
  lobbyScroll: { flex: 1, zIndex: 2 },
  lobbyContent: { padding: 14, gap: 12 },
  lobbyEmpty: { minHeight: 200, alignItems: "center", justifyContent: "center" },
  lobbyEmptyText: { fontFamily: fonts.pixel, fontSize: 12, color: theme.textMuted },
  lobbyErrorText: { fontFamily: fonts.pixel, fontSize: 10, color: theme.error, marginTop: 8, textAlign: "center", paddingHorizontal: 20 },

  patrolCard: {
    borderWidth: 1,
    borderColor: groupTheme.c028,
    backgroundColor: groupTheme.c029,
    overflow: "hidden",
  },
  patrolTopEdge: {
    height: 2,
    ...(Platform.OS === "web"
      ? { background: groupTheme.c030 } as any
      : { backgroundColor: groupTheme.c031 }),
  },
  patrolBottomEdge: {
    height: 1,
    ...(Platform.OS === "web"
      ? { background: groupTheme.c032 } as any
      : { backgroundColor: groupTheme.c033 }),
  },
  patrolTitleBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 8,
    paddingBottom: 1,
  },
  patrolTitleText: {
    fontFamily: fonts.silkscreen,
    fontSize: 15,
    color: groupTheme.c034,
    letterSpacing: 5,
    ...(Platform.OS === "web"
      ? { textShadow: groupTheme.c035 } as any : {}),
  },
  patrolTitleDeco: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: groupTheme.c036,
  },
  patrolSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 6,
  },
  patrolSubtitle: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: groupTheme.c037,
    letterSpacing: 3,
  },
  patrolStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    ...(Platform.OS === "web" ? { boxShadow: groupTheme.c038 } as any : {}),
  },
  patrolBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  patrolSummary: { fontFamily: fonts.pixel, fontSize: 10, lineHeight: 16, color: groupTheme.c039 },
  patrolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0,
  },
  patrolGridCell: {
    width: "50%" as any,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: groupTheme.c040,
  },
  patrolGridValue: {
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    color: groupTheme.c017,
    letterSpacing: 1,
  },
  patrolGridLabel: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: groupTheme.c041,
    letterSpacing: 1,
    marginTop: 2,
  },
  patrolIssueList: { gap: 6 },
  patrolIssueRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  patrolIssueLevel: {
    fontFamily: fonts.silkscreen,
    fontSize: 8,
    color: groupTheme.c016,
    borderWidth: 1,
    borderColor: groupTheme.c042,
    paddingHorizontal: 4,
    paddingVertical: 1,
    letterSpacing: 1,
  },
  patrolIssueText: { fontFamily: fonts.pixel, fontSize: 12, lineHeight: 18, color: groupTheme.c043, flex: 1 },
  patrolFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  patrolMeta: { fontFamily: fonts.pixel, fontSize: 10, color: theme.textMuted },
  patrolError: { fontFamily: fonts.pixel, fontSize: 11, color: theme.error, paddingHorizontal: 14 },
  patrolButton: {
    borderWidth: 1,
    borderColor: groupTheme.c044,
    backgroundColor: groupTheme.c045,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...(Platform.OS === "web"
      ? { boxShadow: groupTheme.c046 } as any : {}),
  },
  patrolButtonText: { fontFamily: fonts.silkscreen, fontSize: 8, color: groupTheme.c017, letterSpacing: 2 },

  roomCard: {
    borderWidth: 1,
    borderColor: groupTheme.c031,
    backgroundColor: groupTheme.c029,
    overflow: "hidden",
  },
  roomCardSurface: Platform.OS === "web" ? {
    boxShadow: groupTheme.c047,
  } as any : null,
  roomCardEdge: {
    height: 1,
    ...(Platform.OS === "web"
      ? { background: groupTheme.c048 } as any
      : { backgroundColor: groupTheme.c049 }),
  },
  roomCardBody: {
    padding: 12,
    gap: 6,
  },
  roomCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  roomCardName: { fontFamily: fonts.pixel, fontSize: 16, color: groupTheme.c050 },
  roomCardArrow: { fontFamily: fonts.silkscreen, fontSize: 16, color: groupTheme.c051 },
  roomCardMembers: { fontFamily: fonts.pixel, fontSize: 10, color: groupTheme.c052 },
  roomCardDivider: {
    height: 1,
    marginTop: 2,
    ...(Platform.OS === "web"
      ? { background: groupTheme.c053 } as any
      : { backgroundColor: groupTheme.c054 }),
  },
  roomCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomCardMeta: { fontFamily: fonts.pixel, fontSize: 10, color: groupTheme.c055 },
  roomCardTime: { fontFamily: fonts.silkscreen, fontSize: 8, color: groupTheme.c056, letterSpacing: 1 },

  commPanelSurface: Platform.OS === "web" ? {
    boxShadow: groupTheme.c057,
  } as any : null,
  commCardRow: {
    flexDirection: "row",
  },
  commCardLeft: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
  commCardRight: {
    width: 90,
    borderLeftWidth: 1,
    borderLeftColor: groupTheme.c058,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  commSignalBlock: {
    gap: 5,
  },
  commSignalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commSignalDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: groupTheme.c059,
  },
  commSignalDotOn: {
    backgroundColor: groupTheme.c018,
    ...(Platform.OS === "web" ? { boxShadow: groupTheme.c060 } as any : {}),
  },
  commSignalLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: groupTheme.c041,
    letterSpacing: 1,
  },
  commSignalFreq: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: groupTheme.c061,
    letterSpacing: 2,
  },
  commBackBtn: {
    paddingRight: 8,
    paddingVertical: 4,
  },
  commBackText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: groupTheme.c062,
  },
  channelTag: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: groupTheme.c063,
    borderWidth: 1,
    borderColor: groupTheme.c064,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: groupTheme.c065,
    overflow: "hidden",
    letterSpacing: 1,
  },
  observerTag: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: groupTheme.c066,
    borderWidth: 1,
    borderColor: groupTheme.c067,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: groupTheme.c068,
    overflow: "hidden",
    letterSpacing: 1,
  },
  roomCardName: { fontFamily: fonts.pixel, fontSize: 16, color: groupTheme.c050 },
  roomCardArrow: { fontFamily: fonts.silkscreen, fontSize: 16, color: groupTheme.c051 },
  roomCardMembers: { fontFamily: fonts.pixel, fontSize: 10, color: groupTheme.c052 },
  roomCardDivider: {
    height: 1,
    marginTop: 2,
    ...(Platform.OS === "web"
      ? { background: groupTheme.c053 } as any
      : { backgroundColor: groupTheme.c054 }),
  },
  roomCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomCardMeta: { fontFamily: fonts.pixel, fontSize: 10, color: groupTheme.c055 },
  roomCardTime: { fontFamily: fonts.silkscreen, fontSize: 8, color: groupTheme.c056, letterSpacing: 1 },
  roomAvatarStack: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    marginRight: 2,
  },
  roomAvatarOverlap: {
    backgroundColor: theme.bg,
  },
  avatarSpacer: { width: 28, flexShrink: 0 },
  avatar: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: groupTheme.c069,
    overflow: "hidden",
  },
  avatarCompact: {
    borderWidth: 1,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    ...(Platform.OS === "web" ? { imageRendering: "pixelated" } as any : {}),
  },
  avatarText: {
    fontFamily: fonts.pixel,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
  },
  avatarTextCompact: {
    fontSize: 10,
    lineHeight: 14,
  },

  // chat header
  chatHeader: {
    paddingHorizontal: 12,
    paddingBottom: 0,
    backgroundColor: theme.bg,
    zIndex: 2,
  },
  chatScanline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  chatScanlineText: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: groupTheme.c024,
    letterSpacing: 1,
  },
  chatScanlineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: groupTheme.c015,
  },
  chatScanlineFill: { flex: 1 },
  chatTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  backButton: {
    minHeight: 34,
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  backText: { fontFamily: fonts.pixel, fontSize: 11, color: theme.pixel.gold },
  chatTitleBlock: { flex: 1, minWidth: 0 },
  chatTitle: {
    fontFamily: fonts.pixel,
    fontSize: 16,
    color: theme.pixel.gold,
    ...(Platform.OS === "web" ? {
      textShadow: groupTheme.c070,
    } as any : {}),
  },
  chatSubtitle: { marginTop: 2, fontFamily: fonts.pixel, fontSize: 9, color: theme.textMuted },
  chatDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 3,
    paddingBottom: 3,
  },

  // summary
  summaryBar: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: groupTheme.c071,
    zIndex: 2,
  },
  summaryLabel: { fontFamily: fonts.pixel, fontSize: 8, color: theme.textMuted, textAlign: "center" },

  // messages
  list: { flex: 1, zIndex: 2 },
  listContent: { paddingHorizontal: 12, paddingVertical: 14, gap: 12 },
  msgRow: { maxWidth: "86%" },
  msgContinuation: { marginTop: -8 },
  msgLeft: { alignSelf: "flex-start" },
  msgRight: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgCenter: { alignSelf: "center", maxWidth: "92%", alignItems: "center" },
  messageCluster: {
    maxWidth: "100%",
  },
  messageClusterRight: {
    alignItems: "flex-end",
  },
  bubbleLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    maxWidth: "100%",
    flexShrink: 1,
  },
  bubbleLineRight: {
    justifyContent: "flex-end",
  },
  senderRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginBottom: 3 },
  sender: { fontFamily: fonts.pixel, fontSize: 11 },
  modelLabel: { fontFamily: fonts.mono, fontSize: 8, color: theme.textMuted, opacity: 0.6 },
  senderLeftWithAvatar: { marginLeft: 34 },
  senderRightWithAvatar: { marginRight: 34 },
  bubble: {
    borderWidth: 1,
    borderColor: groupTheme.c072,
    backgroundColor: groupTheme.c073,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexShrink: 1,
  },
  eriBubble: { backgroundColor: groupTheme.c001 },
  aiBubble: { backgroundColor: groupTheme.c004 },
  sysBubble: {
    backgroundColor: theme.bgInput,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sysLabel: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: theme.textMuted,
    marginBottom: 2,
    textAlign: "center",
  },
  msgText: { fontFamily: fonts.chat, fontSize: 15, lineHeight: 24, color: theme.text },
  sysText: { fontSize: 10, lineHeight: 15, color: theme.textDim, textAlign: "center" },
  time: { marginTop: 3, fontFamily: fonts.pixel, fontSize: 8, color: theme.textMuted },
  timeLeftWithAvatar: { marginLeft: 34 },
  timeRightWithAvatar: { marginRight: 34, textAlign: "right" },
  empty: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: { fontFamily: fonts.pixel, fontSize: 14, color: theme.pixel.gold },
  emptyText: { fontFamily: fonts.pixel, fontSize: 11, color: theme.textMuted },

  // errors
  error: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: theme.error,
    fontFamily: fonts.pixel,
    fontSize: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.error,
    backgroundColor: theme.errorBg,
  },
  // composer
  composerWrap: {
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: groupTheme.c076,
    borderBottomColor: groupTheme.c077,
    zIndex: 2,
  },
  composerCommBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
    backgroundColor: groupTheme.c078,
  },
  composerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: groupTheme.c018,
    ...(Platform.OS === "web" ? { boxShadow: groupTheme.c079 } as any : {}),
  },
  composerCommLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: groupTheme.c080,
    letterSpacing: 2,
  },
  composerSignal: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 1,
    marginLeft: 6,
    height: 8,
  },
  composerSignalBar: {
    width: 2,
    backgroundColor: groupTheme.c081,
  },
  composerCommLine: {
    flex: 1,
    height: 1,
    ...(Platform.OS === "web"
      ? { background: groupTheme.c082 } as any
      : { backgroundColor: groupTheme.c054 }),
  },
  composerCommFreq: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: groupTheme.c056,
    letterSpacing: 1,
  },
  composer: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2,
    gap: 6,
    backgroundColor: groupTheme.c083,
  },
  observerComposer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: groupTheme.c084,
    backgroundColor: groupTheme.c085,
    zIndex: 2,
    alignItems: "center",
  },
  observerText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textMuted,
  },
  mentionRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 4,
  },
  mentionChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: groupTheme.c086,
    backgroundColor: groupTheme.c087,
  },
  mentionChipText: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: groupTheme.c088,
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 42,
    backgroundColor: groupTheme.c089,
    borderWidth: 1,
    borderColor: groupTheme.c090,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 26,
    maxHeight: 86,
    paddingHorizontal: 10,
    paddingTop: Platform.OS === "ios" ? 8 : 6,
    paddingBottom: Platform.OS === "ios" ? 8 : 6,
    backgroundColor: "transparent",
    borderWidth: 0,
    color: theme.text,
    fontFamily: fonts.chat,
    fontSize: 16,
    lineHeight: 22,
    ...(Platform.OS === "web" ? { outlineStyle: "none", resize: "none" } as any : {}),
  },
  sendBtn: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: groupTheme.c091,
    borderLeftWidth: 1,
    borderLeftColor: groupTheme.c092,
    marginLeft: 2,
  },
  sendBtnDisabled: {
    opacity: 0.4,
    backgroundColor: "transparent",
  },
  iconText: {
    fontFamily: fonts.pixel,
    fontSize: 20,
    color: theme.pixel.goldDim,
  },
  quotedBlock: {
    borderLeftWidth: 2,
    borderLeftColor: theme.textMuted,
    paddingLeft: 8,
    marginBottom: 6,
  },
  quotedBlockText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
  },
  quoteBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: groupTheme.c093,
    borderBottomWidth: 1,
    borderBottomColor: groupTheme.c094,
  },
  quoteBarAccent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: theme.blueAccent,
    marginRight: 8,
  },
  quoteBarContent: {
    flex: 1,
  },
  quoteBarSender: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.blueAccent,
    marginBottom: 2,
  },
  quoteBarText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textMuted,
  },
  quoteBarClose: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quoteBarCloseX: {
    color: theme.textDim,
    fontSize: 14,
  },
  roomActionsBar: {
    flexDirection: "row",
    gap: 2,
    marginTop: 4,
  },
  roomActionsRight: {
    alignSelf: "flex-end",
  },
  roomActionsLeft: {
    alignSelf: "flex-start",
    marginLeft: 34,
  },
  roomActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: groupTheme.c095,
    borderWidth: 1,
    borderColor: theme.pixel.border,
  },
  roomActionBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.text,
  },
  roomEmojiBar: {
    flexDirection: "row",
    gap: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  roomReactions: {
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },
  roomSearchBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: groupTheme.c096,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: groupTheme.c097,
  },
  roomSearchBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.pixel.gold,
  },
  roomSearchOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.bg,
    zIndex: 90,
  },
  roomSearchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: groupTheme.c098,
    backgroundColor: groupTheme.c099,
  },
  roomSearchInput: {
    flex: 1,
    fontFamily: fonts.pixel,
    fontSize: 16,
    color: theme.text,
    backgroundColor: groupTheme.c100,
    borderWidth: 1,
    borderColor: groupTheme.c096,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
  },
  roomSearchCancelText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.pixel.gold,
  },
  roomSearchStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 8,
  },
  roomSearchStatusText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.textMuted,
  },
  roomSearchResultItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: groupTheme.c092,
  },
  roomSearchResultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  roomSearchResultSender: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.blueAccent,
  },
  roomSearchResultTime: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.textMuted,
  },
  roomSearchSnippet: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.textDim,
    lineHeight: 18,
  },
  roomSearchHighlight: {
    color: theme.pixel.gold,
    fontFamily: fonts.pixel,
  },
  // ─── Command Center ───
  cmdFilterRow: { flexDirection: "row" as const, gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: groupTheme.c101 },
  cmdFilterBtn: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: groupTheme.c102, backgroundColor: "transparent" },
  cmdFilterBtnActive: { borderColor: theme.pixel.gold, backgroundColor: groupTheme.c103 },
  cmdFilterText: { fontFamily: fonts.pixel, fontSize: 10, color: theme.textMuted },
  cmdFilterTextActive: { color: theme.pixel.gold },
  cmdTag: { fontFamily: fonts.pixel, fontSize: 7, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, marginRight: 6 },
  cmdStatusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  cmdEmpty: { fontFamily: fonts.pixel, fontSize: 12, color: theme.textMuted, textAlign: "center" as const, paddingTop: 40 },
  cmdDetailTitle: { fontFamily: fonts.silkscreen, fontSize: 13, color: theme.pixel.gold, marginBottom: 8, lineHeight: 20 },
  cmdDetailMeta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, marginBottom: 14 },
  cmdMetaText: { fontFamily: fonts.pixel, fontSize: 9, color: theme.textMuted },
  cmdDetailBody: { fontFamily: fonts.pixel, fontSize: 12, color: theme.textDim, lineHeight: 20 },
  cmdStatusRow: { flexDirection: "row" as const, gap: 6, marginTop: 16, marginBottom: 16, flexWrap: "wrap" as const },
  cmdStatusBtn: { flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: groupTheme.c104 },
  cmdStatusText: { fontFamily: fonts.pixel, fontSize: 8, color: theme.textMuted, letterSpacing: 1 },
  cmdComments: { marginTop: 8 },
  cmdCommentsTitle: { fontFamily: fonts.pixel, fontSize: 10, color: theme.textMuted, marginBottom: 8, letterSpacing: 1 },
  cmdCommentItem: { borderLeftWidth: 2, borderLeftColor: groupTheme.c104, paddingLeft: 10, marginBottom: 12 },
  cmdCommentSender: { fontFamily: fonts.pixel, fontSize: 9, color: theme.blueAccent, marginBottom: 2 },
  cmdCommentTime: { fontFamily: fonts.pixel, fontSize: 7, color: theme.textMuted, marginBottom: 4 },
  cmdCommentText: { fontFamily: fonts.pixel, fontSize: 11, color: theme.textDim, lineHeight: 18 },
  cmdInputWrap: { flexDirection: "row" as const, alignItems: "flex-end" as const, gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: groupTheme.c101, backgroundColor: groupTheme.c099 },
  cmdInput: { flex: 1, fontFamily: fonts.pixel, fontSize: 12, color: theme.text, backgroundColor: groupTheme.c105, borderWidth: 1, borderColor: groupTheme.c102, paddingHorizontal: 10, paddingVertical: 8, minHeight: 36, maxHeight: 100 },
  cmdSendBtn: { width: 36, height: 36, justifyContent: "center" as const, alignItems: "center" as const, borderWidth: 1, borderColor: groupTheme.c106, backgroundColor: groupTheme.c101 },
});

// ─── Event Horizon overrides (group chat room) ───
// Monochrome skin for ChatRoomView + RoomMessageBubble: black fills, white
// line hierarchy, pixel type, semantic green/EH blue only. Web-gated by isEH.
const EHW_G = "rgba(255,255,255,";
const ehs = StyleSheet.create({
  // message meta
  time: { color: `${EHW_G}0.4)` },
  modelLabel: { fontFamily: fonts.pixel, color: `${EHW_G}0.4)`, opacity: 1 },
  sysBubble: { backgroundColor: "#000", borderColor: `${EHW_G}0.3)`, borderRadius: 0 },
  sysLabel: { color: `${EHW_G}0.55)`, letterSpacing: 2 },
  sysText: { color: `${EHW_G}0.6)` },
  quotedBlock: { borderLeftColor: `${EHW_G}0.4)` },
  quotedBlockText: { color: `${EHW_G}0.5)` },
  // summary bar
  summaryBar: { backgroundColor: "#000", borderTopWidth: 1, borderBottomWidth: 1, borderColor: `${EHW_G}0.2)` },
  summaryLabel: { color: `${EHW_G}0.55)` },
  // composer
  composerWrap: { backgroundColor: "#000" },
  // extra top padding clears the shoulder-line labels that hang into the wrap
  composer: { backgroundColor: "#000", paddingTop: 14 },
  observerComposer: { backgroundColor: "#000", borderTopColor: `${EHW_G}0.2)` },
  observerText: { color: `${EHW_G}0.5)` },
  mentionChip: { borderColor: `${EHW_G}0.3)`, backgroundColor: "#000" },
  mentionChipText: { color: `${EHW_G}0.7)` },
  inputRow: { backgroundColor: "#000", borderColor: `${EHW_G}0.4)` },
  input: { color: "#fff" },
  sendBtn: { backgroundColor: "#000", borderLeftColor: `${EHW_G}0.4)` },
  iconText: { color: "#fff" },
  quoteBar: { backgroundColor: "#000", borderWidth: 1, borderColor: `${EHW_G}0.25)` },
  quoteBarAccent: { backgroundColor: `${EHW_G}0.6)` },
  quoteBarSender: { color: `${EHW_G}0.8)` },
  // search overlay
  roomSearchOverlay: { backgroundColor: "#000" },
  roomSearchBarRow: { backgroundColor: "#000", borderBottomColor: `${EHW_G}0.2)` },
  roomSearchInput: { backgroundColor: "#000", borderColor: `${EHW_G}0.4)`, color: "#fff" },
  // command center
  cmdFilterRow: { backgroundColor: "#000" },
  cmdFilterBtn: { backgroundColor: "#000", borderWidth: 1, borderColor: `${EHW_G}0.3)`, borderRadius: 0 },
  cmdFilterBtnActive: { borderColor: `${EHW_G}0.85)`, backgroundColor: "#000" },
  cmdFilterText: { fontFamily: fonts.pixel, color: `${EHW_G}0.5)` },
  cmdFilterTextActive: { color: "#fff" },
  cmdEmpty: { color: `${EHW_G}0.45)` },
  cmdDetailTitle: { color: "#fff", fontFamily: fonts.pixel },
  cmdTag: { borderRadius: 0, fontFamily: fonts.pixel },
  cmdMetaText: { color: `${EHW_G}0.5)`, fontFamily: fonts.pixel },
  cmdDetailBody: { color: `${EHW_G}0.85)` },
  cmdStatusBtn: { backgroundColor: "#000", borderWidth: 1, borderColor: `${EHW_G}0.25)`, borderRadius: 0 },
  cmdStatusText: { fontFamily: fonts.pixel, color: `${EHW_G}0.5)` },
  cmdComments: { borderTopWidth: 1, borderTopColor: `${EHW_G}0.2)` },
  cmdCommentsTitle: { color: `${EHW_G}0.6)`, fontFamily: fonts.pixel },
  cmdCommentItem: { backgroundColor: "#000", borderWidth: 1, borderColor: `${EHW_G}0.18)`, borderRadius: 0 },
  cmdCommentSender: { color: `${EHW_G}0.8)` },
  cmdCommentTime: { color: `${EHW_G}0.4)` },
  cmdCommentText: { color: `${EHW_G}0.7)` },
  cmdInputWrap: { backgroundColor: "#000", borderTopColor: `${EHW_G}0.25)` },
  cmdInput: { backgroundColor: "#000", borderColor: `${EHW_G}0.4)`, color: "#fff", borderRadius: 0 },
  cmdSendBtn: { backgroundColor: "#000", borderColor: `${EHW_G}0.4)` },
});
