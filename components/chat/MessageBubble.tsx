import { Fragment, memo, useMemo, useState, useEffect, useCallback } from "react";
import { Alert, View, Text, TouchableOpacity, ScrollView, StyleSheet, Image, Platform, TextInput } from "react-native";
import { ChatMessage, api } from "../../services/api";
import { fonts } from "../../theme/colors";
import { EH_BUBBLE_CUT } from "../bridge/BridgeDashboard";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";
import VoicePlayer from "./VoicePlayer";
import MusicCard from "./MusicCard";
import CornerBrackets from "../decor/CornerBrackets";
function renderMarkdown(text: string, baseStyle: any[], mdStyles: any) {
  const codeBlockRe = /```[\s\S]*?```/g;
  const parts: Array<{ type: "text" | "codeblock"; content: string }> = [];
  let lastIdx = 0;
  let match;
  while ((match = codeBlockRe.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push({ type: "text", content: text.slice(lastIdx, match.index) });
    parts.push({ type: "codeblock", content: match[0].replace(/^```\w*\n?/, "").replace(/\n?```$/, "") });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push({ type: "text", content: text.slice(lastIdx) });

  return parts.map((part, pi) => {
    if (part.type === "codeblock") {
      return (
        <View key={pi} style={mdStyles.codeBlock}>
          <Text style={mdStyles.codeBlockText}>{part.content}</Text>
        </View>
      );
    }
    const inlineRe = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)/g;
    const elements: React.ReactNode[] = [];
    let last = 0;
    let m;
    const src = part.content;
    while ((m = inlineRe.exec(src)) !== null) {
      if (m.index > last) elements.push(<Text key={`t${pi}-${last}`} style={baseStyle}>{src.slice(last, m.index)}</Text>);
      if (m[2]) elements.push(<Text key={`b${pi}-${m.index}`} style={[baseStyle, mdStyles.bold]}>{m[2]}</Text>);
      else if (m[4]) elements.push(<Text key={`i${pi}-${m.index}`} style={[baseStyle, mdStyles.italic]}>{m[4]}</Text>);
      else if (m[6]) elements.push(<Text key={`c${pi}-${m.index}`} style={[baseStyle, mdStyles.inlineCode]}>{m[6]}</Text>);
      last = m.index + m[0].length;
    }
    if (last < src.length) elements.push(<Text key={`t${pi}-${last}`} style={baseStyle}>{src.slice(last)}</Text>);
    if (elements.length === 0) return <Text key={pi} style={baseStyle}>{src}</Text>;
    return <Text key={pi} style={baseStyle}>{elements}</Text>;
  });
}

function createMarkdownStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    bold: { fontWeight: "700" as const },
    italic: { fontStyle: "italic" as const },
    inlineCode: {
      fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
      backgroundColor: theme.messageBubble.markdownInlineBg,
      paddingHorizontal: 3,
      borderRadius: 2,
      fontSize: 12,
    },
    codeBlock: {
      backgroundColor: theme.messageBubble.markdownBlockBg,
      borderRadius: 4,
      padding: 8,
      marginVertical: 4,
    },
    codeBlockText: {
      fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
      fontSize: 11,
      color: theme.messageBubble.markdownCodeText,
      lineHeight: 16,
    },
  });
}

interface Props {
  message: ChatMessage;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  animDelay?: number;
  onRetry?: () => void;
  onDelete?: (segmentIndex?: number, segmentText?: string) => void;
  onQuote?: (segmentIndex?: number, segmentText?: string) => void;
  onReact?: (emoji: string) => void;
  onFeedback?: (rating: "like" | "dislike" | null, reason?: string) => void;
  onImagePress?: (images: string[], index: number) => void;
  senderName?: string; // API 船员显示名（crew 消息用）
}

function formatTime(ts: string) {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function installMessageBubbleWebStyles(theme: ThemeTokens) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const id = "breathe-keyframes";
  let styleEl = document.getElementById(id) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = id;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
      [data-breathe="blue"] { box-shadow: ${theme.messageBubble.webAssistantShadow} !important; border-color: ${theme.messageBubble.webAssistantBorder} !important; }
      [data-breathe="silver"] { box-shadow: ${theme.messageBubble.webUserShadow} !important; border-color: ${theme.messageBubble.webUserBorder} !important; }
      [data-breathe="purple"] { box-shadow: ${theme.messageBubble.webCursaShadow} !important; border-color: ${theme.messageBubble.webCursaBorder} !important; }
      @keyframes refresh-flash {
        0% { opacity: 0; transform: scale(0.7); }
        15% { opacity: 1; transform: scale(1.1); }
        30% { opacity: 1; transform: scale(1); }
        70% { opacity: 0.6; }
        100% { opacity: 0; transform: scale(0.9); height: 0; padding: 0; margin: 0; overflow: hidden; }
      }
      [data-refreshflash="1"] {
        animation: refresh-flash 3s ease-out forwards !important;
      }
      .tool-stack-list {
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition: max-height 0.2s ease-out, opacity 0.15s ease-out;
        padding-left: 8px;
        padding-right: 8px;
      }
      .tool-stack-list.expanded {
        max-height: 400px;
        opacity: 1;
        padding-top: 4px;
        padding-bottom: 4px;
      }
      .tool-stack-chevron {
        display: inline-block;
        transition: transform 0.18s ease-in-out;
        font-size: 8px;
        color: ${theme.textDim};
      }
      .tool-stack-chevron.expanded {
        transform: rotate(90deg);
      }
    `;
}

const THINKING_STAR = require("../../assets/chat/thinking-star.png");
const THINKING_LABEL = "偷看UNIT-A思考";

interface ToolCall {
  name: string;
  input_summary: string;
}

interface ContentBlock {
  type: string;
  content?: string;
  name?: string;
  input_summary?: string;
}

const TOOL_INFO: Record<string, { emoji: string; label: string; verb: string; verbMany: string }> = {
  surface: { emoji: "📖", label: "翻记忆", verb: "翻了翻记忆", verbMany: "翻了好几遍记忆" },
  memory: { emoji: "📖", label: "翻记忆", verb: "翻了翻记忆", verbMany: "翻了好几遍记忆" },
  write_memory: { emoji: "📝", label: "写记忆", verb: "记了点什么", verbMany: "记了好几笔" },
  stellar: { emoji: "⭐", label: "读星体", verb: "看了看星体", verbMany: "反复看了看星体" },
  web_search: { emoji: "🔍", label: "搜索", verb: "搜了搜", verbMany: "搜了好几轮" },
  gmail: { emoji: "📧", label: "查邮件", verb: "看了看邮箱", verbMany: "翻了翻邮箱" },
  room_send: { emoji: "💬", label: "发群聊", verb: "在群里说了句话", verbMany: "在群里聊了几句" },
  music: { emoji: "🎵", label: "音乐", verb: "听了听歌", verbMany: "听了好几首歌" },
  jellyfish: { emoji: "🪼", label: "喂水母", verb: "逗了逗JELLY", verbMany: "跟JELLY玩了会儿" },
  bookshelf: { emoji: "📚", label: "书架", verb: "翻了翻书架", verbMany: "在书架翻了好一会儿" },
  wake: { emoji: "🌅", label: "醒来", verb: "醒了过来", verbMany: "醒了过来" },
  sleep: { emoji: "🌙", label: "入睡", verb: "睡了过去", verbMany: "睡了过去" },
  Bash: { emoji: "⚡", label: "命令行", verb: "敲了点命令", verbMany: "敲了一串命令" },
  Read: { emoji: "📄", label: "读文件", verb: "读了点东西", verbMany: "读了好几个文件" },
  Edit: { emoji: "✏️", label: "编辑", verb: "改了点代码", verbMany: "改了好几处代码" },
  Write: { emoji: "📝", label: "写文件", verb: "写了点东西", verbMany: "写了好几个文件" },
  session_diary: { emoji: "📓", label: "日记", verb: "写了写日记", verbMany: "写了写日记" },
  write_murmur: { emoji: "💭", label: "碎碎念", verb: "嘟囔了几句", verbMany: "嘟囔了好一会儿" },
  library: { emoji: "📖", label: "阅览室", verb: "翻了翻书", verbMany: "读了好一会儿书" },
  album: { emoji: "📷", label: "相册", verb: "翻了翻相册", verbMany: "看了好几张照片" },
  exhibit: { emoji: "🏛️", label: "展览馆", verb: "看了看展品", verbMany: "在展览馆逛了一圈" },
  ledger: { emoji: "💰", label: "金库", verb: "看了看账本", verbMany: "翻了翻账本" },
  channel: { emoji: "📋", label: "工单", verb: "看了看工单", verbMany: "处理了几个工单" },
  git: { emoji: "🗂️", label: "提交", verb: "提交了代码", verbMany: "提交了好几笔代码" },
  stackchan: { emoji: "🤖", label: "小方块", verb: "戳了戳小方块", verbMany: "跟小方块玩了会儿" },
  room_send_whisper: { emoji: "🤫", label: "悄悄话", verb: "跟UNIT-B说了句悄悄话", verbMany: "跟UNIT-B聊了好一会儿" },
  room_send_family: { emoji: "👨‍👩‍👧", label: "家庭群", verb: "在家庭群说了句话", verbMany: "在家庭群聊了几句" },
  dream: { emoji: "🌙", label: "做梦", verb: "做了一个梦", verbMany: "在梦里飘了好一会儿" },
  solo: { emoji: "🔥", label: "独处", verb: "一个人待了会儿", verbMany: "一个人待了好一会儿" },
};

const TOOL_GROUPS: Record<string, string> = {
  surface: "memory", memory: "memory", write_memory: "write_memory", write_murmur: "write_memory",
  room_send: "room", room_send_whisper: "room", room_send_family: "room",
  library: "library", bookshelf: "library",
  Bash: "code", Read: "code", Edit: "code", Write: "code", dream: "dream", solo: "solo",
};

function toolInfo(name: string) {
  return TOOL_INFO[name] || { emoji: "🔧", label: name, verb: `用了一下${name}`, verbMany: `用了好几次${name}` };
}

// Bash 命令嗅探（2026-07-07 修语义包装回归）：工具内置化后所有家内操作都
// 变成了 `ai-tool xxx` 的 Bash 命令，工具名一律 "Bash" → 全显示"敲了点命令"。
// 从命令内容认出真身，翻邮箱还是翻邮箱、逗JELLY还是逗JELLY。
const BASH_SNIFF_RULES: Array<[RegExp, string]> = [
  [/ai-tool\s+(?:memory\.|surface)/, "memory"],
  [/ai-tool\s+write_memory/, "write_memory"],
  [/ai-tool\s+write_murmur/, "write_murmur"],
  [/ai-tool\s+jellyfish/, "jellyfish"],
  [/ai-tool\s+music/, "music"],
  [/ai-tool\s+gmail/, "gmail"],
  [/ai-tool\s+stellar/, "stellar"],
  [/ai-tool\s+web_search/, "web_search"],
  [/ai-tool\s+room_send/, "room_send"],
  [/ai-tool\s+library/, "library"],
  [/ai-tool\s+album/, "album"],
  [/ai-tool\s+exhibit|nest\.sh/, "exhibit"],
  [/ai-tool\s+ledger/, "ledger"],
  [/ai-tool\s+bookshelf/, "bookshelf"],
  [/ai-tool\s+stackchan/, "stackchan"],
  [/channel\.sh/, "channel"],
  [/git\s+(commit|add|push|tag)/, "git"],
];

function resolveToolKey(tc: ToolCall): string {
  if (tc.name !== "Bash" || !tc.input_summary) return tc.name;
  for (const [re, key] of BASH_SNIFF_RULES) {
    if (re.test(tc.input_summary)) return key;
  }
  return "Bash";
}

function summarizeToolCalls(calls: ToolCall[]): string {
  const grouped = new Map<string, { info: typeof TOOL_INFO[string]; count: number }>();
  for (const tc of calls) {
    const resolved = resolveToolKey(tc);
    const groupKey = TOOL_GROUPS[resolved] || resolved;
    const info = toolInfo(groupKey === "code" ? "Bash" : groupKey === "memory" ? "memory" : resolved);
    const existing = grouped.get(groupKey);
    if (existing) { existing.count++; } else { grouped.set(groupKey, { info, count: 1 }); }
  }
  const parts: string[] = [];
  for (const [, { info, count }] of grouped) {
    parts.push(count > 2 ? info.verbMany : info.verb);
  }
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.join("，");
}

const BUBBLE_FRAME_SOURCES = {
  user: require("../../assets/chat/bubble-frame-user.png"),
  assistant: require("../../assets/chat/bubble-frame-assistant.png"),
  epsilon: require("../../assets/chat/bubble-frame-epsilon.png"),
  thinking: require("../../assets/chat/thinking-frame.png"),
};

function assetUri(source: unknown) {
  if (typeof source === "object" && source && "uri" in source) {
    return (source as { uri: string }).uri;
  }
  return undefined;
}

function isCursaMessage(message: ChatMessage): boolean {
  return message.assistant === "cursa" || !!message.source?.startsWith("cursa");
}

function sourceLabel(message: ChatMessage, senderName?: string) {
  if (message.role === "user") return "CAPTAIN";
  if (message.role === "system") return "SYSTEM";
  if (message.source === "tg" || message.source === "telegram") return "TG";
  if (isCursaMessage(message)) return "UNIT-B";
  // API 船员（2026-07-07）：crew 消息显示船员名，不再冒充UNIT-A
  if (String(message.assistant || "").startsWith("crew:")) return senderName || "船员";
  return "UNIT-A";
}


function nativeBubbleSurface(theme: ThemeTokens) {
  return {
    borderColor: theme.messageBubble.nativeBorder,
    borderRadius: 4,
  };
}

function webBubbleSurfaces(theme: ThemeTokens) {
  const isEH = theme.key === "eventHorizon";
  const cut = EH_BUBBLE_CUT;
  return {
    user: {
      backgroundColor: theme.messageBubble.webUserBg,
      borderWidth: isEH ? 0 : 1,
      borderColor: theme.messageBubble.webUserBorder,
      borderRadius: isEH ? 0 : 4,
      boxShadow: theme.messageBubble.webUserShadow,
      ...(isEH ? { clipPath: cut } : { backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }),
    } as any,
    assistant: {
      backgroundColor: theme.messageBubble.webAssistantBg,
      borderWidth: isEH ? 0 : 1,
      borderColor: theme.messageBubble.webAssistantBorder,
      borderRadius: isEH ? 0 : 4,
      boxShadow: theme.messageBubble.webAssistantShadow,
      ...(isEH ? { clipPath: cut } : { backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }),
    } as any,
    cursa: {
      backgroundColor: theme.messageBubble.webCursaBg,
      borderWidth: isEH ? 0 : 1,
      borderColor: theme.messageBubble.webCursaBorder,
      borderRadius: isEH ? 0 : 4,
      boxShadow: theme.messageBubble.webCursaShadow,
      ...(isEH ? { clipPath: cut } : { backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }),
    } as any,
  };
}

function webThinkingSurface(theme: ThemeTokens) {
  return {
    backgroundColor: theme.messageBubble.thinkingSurfaceBg,
    borderWidth: 0,
  } as any;
}

function nativeThinkingSurface(theme: ThemeTokens) {
  return {
    borderColor: theme.pixel.goldDim,
    borderRadius: 10,
  };
}

function pixelBubbleSurface(isUser: boolean, message: ChatMessage, theme: ThemeTokens) {
  if (Platform.OS !== "web") return nativeBubbleSurface(theme);
  const surfaces = webBubbleSurfaces(theme);
  if (isUser) return surfaces.user;
  if (isCursaMessage(message)) return surfaces.cursa;
  return surfaces.assistant;
}

const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
const SKIP_TEXT_RE = /^\s*(?:\[skip\]|【skip】)\s*$/i;

function MessageBubble({ message, isGroupStart = true, isGroupEnd = true, animDelay = 0, onRetry, onDelete, onQuote, onReact, onFeedback, onImagePress, senderName }: Props) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mdStyles = useMemo(() => createMarkdownStyles(theme), [theme]);
  useEffect(() => installMessageBubbleWebStyles(theme), [theme]);
  const isUser = message.role === "user";
  const isCursa = isCursaMessage(message);
  const isEH = theme.key === "eventHorizon";
  const breatheColor = isUser ? "silver" : isCursa ? "purple" : "blue";
  const cornerColor = isUser
    ? theme.messageBubble.cornerUser
    : isCursa
      ? theme.messageBubble.cornerCursa
      : theme.messageBubble.cornerAssistant;
  const isFailed = message.status === "failed";
  const isSending = message.status === "sending";
  const isQueued = message.status === "queued";
  const isPendingBatch = message.status === "pending_batch";
  const [showThinking, setShowThinking] = useState(false);
  const [imgUrls, setImgUrls] = useState<Map<string, string>>(new Map());
  const [fadeState, setFadeState] = useState<"send" | "appear" | "done">(isUser ? "send" : "appear");
  const musicTags = useMemo(() => {
    if (!message.text) return [];
    const re = /\[\[MUSIC:([^:]+):([^:]+):([^\]]+)\]\]/g;
    const tags: { songId: string; songName: string; artist: string }[] = [];
    let m;
    while ((m = re.exec(message.text)) !== null) tags.push({ songId: m[1], songName: m[2], artist: m[3] });
    return tags;
  }, [message.text]);
  const messageSegments = useMemo(
    () => message.text
      ? message.text
          .replace(/^\[via Telegram\] /i, "")
          .replace(/\[\[(?:ROOM|NEXT|STOP|MUSIC)[^\]]*\]\]/g, "")
          .replace(/ARCHIVE_ROOM_CONTEXT[^\n]*\n?/g, "")
          .split(/\n---\n/)
          .map((s: string) => s.replace(/^---\s*$/, "").trim())
          .filter((s: string) => s && !SKIP_TEXT_RE.test(s))
      : [],
    [message.text]
  );
  const [visibleSegmentCount, setVisibleSegmentCount] = useState(messageSegments.length || 1);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const t = setTimeout(() => setFadeState("done"), animDelay + (isUser ? 400 : 600));
    return () => clearTimeout(t);
  }, [isUser, animDelay]);

  useEffect(() => {
    if (messageSegments.length <= 1) {
      setVisibleSegmentCount(messageSegments.length || 1);
      return;
    }
    setVisibleSegmentCount(1);
    let current = 1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const revealNext = () => {
      current += 1;
      setVisibleSegmentCount(current);
      if (current < messageSegments.length) {
        timers.push(setTimeout(revealNext, 360));
      }
    };
    timers.push(setTimeout(revealNext, Math.max(120, animDelay + 300)));
    return () => timers.forEach(clearTimeout);
  }, [message.id, messageSegments.length, animDelay]);

  const isSessionRefreshChip =
    message.role === "system" &&
    typeof message.source === "string" &&
    message.source.startsWith("system.session_refresh_");

  const isToolActivityChip =
    message.role === "system" &&
    message.source === "system.tool_activity";

  const imageAttachments = useMemo(() => {
    if (message.attachments && message.attachments.length > 0) {
      return message.attachments.filter((a) => a.type === "image");
    }
    if (message.attachment_url && message.attachment_type === "image") {
      return [{ id: message.attachment_id || "legacy", url: message.attachment_url, type: "image", sort_order: 0 }];
    }
    return [];
  }, [message.attachments, message.attachment_url, message.attachment_type, message.attachment_id]);

  const fileAttachments = useMemo(() => {
    if (message.attachments && message.attachments.length > 0) {
      return message.attachments.filter((a) => a.type !== "image");
    }
    if (message.attachment_url && message.attachment_type && message.attachment_type !== "image") {
      return [{ id: message.attachment_id || "legacy", url: message.attachment_url, type: message.attachment_type, sort_order: 0 }];
    }
    return [];
  }, [message.attachments, message.attachment_url, message.attachment_type, message.attachment_id]);

  useEffect(() => {
    const toResolve = imageAttachments.filter((a) => a.url.startsWith("/api/"));
    if (toResolve.length === 0) return;
    let cancelled = false;
    const blobUrls: string[] = [];
    Promise.all(
      toResolve.map(async (a) => {
        try {
          // 气泡展示降采样到长边 1600：48MB 位图 → ~7MB，
          // 渲染窗口里挂几张图也不会把 iOS 内存顶爆触发整页重载
          const u = await api.fetchAttachmentBlobUrl(a.url, { maxDim: 1600 });
          if (cancelled) { URL.revokeObjectURL(u); return; }
          blobUrls.push(u);
          setImgUrls((prev) => new Map(prev).set(a.url, u));
        } catch {}
      })
    );
    return () => {
      cancelled = true;
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [imageAttachments]);

  const resolvedImageUrls = useMemo(
    () => imageAttachments.map((a) => imgUrls.get(a.url) || (a.url.startsWith("/api/") ? null : a.url)).filter(Boolean) as string[],
    [imageAttachments, imgUrls]
  );

  const openLightbox = useCallback((idx: number) => {
    if (onImagePress && resolvedImageUrls.length > 0) {
      onImagePress(resolvedImageUrls, idx);
    }
  }, [onImagePress, resolvedImageUrls]);

  const reactions = useMemo(() => {
    try {
      return JSON.parse(message.reactions || "[]");
    } catch {
      return [];
    }
  }, [message.reactions]);

  const toolCalls = useMemo<ToolCall[]>(() => {
    if (!message.tool_calls) return [];
    try {
      const parsed = typeof message.tool_calls === "string" ? JSON.parse(message.tool_calls) : message.tool_calls;
      const calls: ToolCall[] = Array.isArray(parsed) ? parsed : [];
      return calls.map((tc) => {
        if (tc.name === "Bash" && tc.input_summary) {
          const m = tc.input_summary.match(/ai-tool\s+(\S+)/);
          if (m) {
            const toolName = m[1].split('.')[0];
            if (tc.input_summary.includes('mode":"dream') || tc.input_summary.includes('mode=dream')) return { name: "dream", input_summary: tc.input_summary };
            return { name: toolName, input_summary: tc.input_summary };
          }
          const s = tc.input_summary.toLowerCase();
          if (s.includes("dream")) return { name: "dream", input_summary: tc.input_summary };
          if (s.includes("solo")) return { name: "solo", input_summary: tc.input_summary };
          if (s.includes("/api/memories") || s.includes("write_memory") || s.includes("memory")) return { name: "memory", input_summary: tc.input_summary };
          if (s.includes("jellyfish")) return { name: "jellyfish", input_summary: tc.input_summary };
          if (s.includes("write_murmur") || s.includes("murmur")) return { name: "write_murmur", input_summary: tc.input_summary };
          if (s.includes("room_send") || s.includes("/api/rooms")) return { name: "room_send", input_summary: tc.input_summary };
          if (s.includes("stellar")) return { name: "stellar", input_summary: tc.input_summary };
          if (s.includes("ledger")) return { name: "ledger", input_summary: tc.input_summary };
        }
        if (tc.name === "Read" && tc.input_summary?.includes("dream")) return { name: "dream", input_summary: tc.input_summary };
        return tc;
      });
    } catch {
      return [];
    }
  }, [message.tool_calls]);
  const contentBlocks = useMemo<ContentBlock[]>(() => {
    if (!message.content_blocks) return [];
    try {
      const parsed = typeof message.content_blocks === "string" ? JSON.parse(message.content_blocks) : message.content_blocks;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [message.content_blocks]);
  const thinkingText = useMemo(() => {
    if (message.thinking) return message.thinking;
    return contentBlocks
      .filter((block) => block.type === "thinking" && block.content)
      .map((block) => block.content)
      .join("\n\n")
      .trim();
  }, [contentBlocks, message.thinking]);
  // 时序流（2026-07-07 压榨清单#4）：按 content_blocks 真实顺序还原
  // 思考→工具→思考→工具→…的交错过程。thinking 每段独立成卡，
  // 连续 tool_use 合并成一组。text 块不进流（正文仍走 segments 渲染）。
  const flowGroups = useMemo<Array<{ kind: "thinking"; content: string } | { kind: "tools"; items: ToolCall[] }>>(() => {
    const groups: Array<{ kind: "thinking"; content: string } | { kind: "tools"; items: ToolCall[] }> = [];
    if (contentBlocks.length) {
      for (const block of contentBlocks) {
        if (block.type === "thinking" && block.content) {
          groups.push({ kind: "thinking", content: String(block.content) });
        } else if (block.type === "tool_use") {
          const last = groups[groups.length - 1];
          const item: ToolCall = { name: block.name || "", input_summary: block.input_summary || "" };
          if (last && last.kind === "tools") last.items.push(item);
          else groups.push({ kind: "tools", items: [item] });
        }
      }
      return groups;
    }
    // 无 content_blocks 的消息（UNIT-B/cyberboss 回写只带 thinking+tool_calls）：
    // 用两个字段拼一条流，让他的命令也有操作面板（2026-07-07 Eri 报障修复）
    if (message.thinking) groups.push({ kind: "thinking", content: String(message.thinking) });
    if (toolCalls.length) groups.push({ kind: "tools", items: toolCalls });
    return groups;
  }, [contentBlocks, message.thinking, toolCalls]);
  const flowThinkingCount = useMemo(() => flowGroups.filter((g) => g.kind === "thinking").length, [flowGroups]);
  const useFlowRender = flowGroups.length > 0;
  const [expandedFlow, setExpandedFlow] = useState<Record<number, boolean>>({});
  const toggleFlow = (idx: number) => setExpandedFlow((prev) => ({ ...prev, [idx]: !prev[idx] }));
  const [showTools, setShowTools] = useState(false);
  const hasVoice = !isUser && !!message.voice_url;
  const [showVoiceText, setShowVoiceText] = useState(false);

  const hasThinking = !isUser && !!thinkingText;
  const hasToolCalls = toolCalls.length > 0;
  const hasInlineStatus = isFailed || isQueued;
  const canDelete = !!onDelete && !isSending;
  const [showActions, setShowActions] = useState(false);
  const [actionSegmentIndex, setActionSegmentIndex] = useState<number | undefined>(undefined);
  const [actionSegmentText, setActionSegmentText] = useState<string | undefined>(undefined);

  const selectedActionText = () => actionSegmentText || message.text || "";

  const handleCopy = () => {
    setShowActions(false);
    if (Platform.OS === "web" && navigator.clipboard) {
      navigator.clipboard.writeText(selectedActionText()).catch(() => {});
    }
  };

  const handleDelete = () => {
    setShowActions(false);
    if (!canDelete || !onDelete) return;
    const confirm = (globalThis as any).confirm;
    if (Platform.OS === "web" && typeof confirm === "function") {
      if (confirm("确定要删除这个气泡吗？")) onDelete(actionSegmentIndex, actionSegmentText);
      return;
    }
    Alert.alert("删除气泡", "确定要删除这个气泡吗？", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => onDelete(actionSegmentIndex, actionSegmentText) },
    ]);
  };

  const openActions = (segmentIndex?: number, segmentText?: string) => {
    setActionSegmentIndex(segmentIndex);
    setActionSegmentText(segmentText);
    setShowActions(true);
  };

  // 赞/踩 + 原因 —— 演化织机的素材入口
  const [feedbackDraft, setFeedbackDraft] = useState<"like" | "dislike" | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const canFeedback = !isUser && !!onFeedback && !isSending;

  const startFeedback = (rating: "like" | "dislike") => {
    setShowActions(false);
    if (message.feedback_rating === rating) {
      // 再点一次同样的 → 撤销
      onFeedback?.(null);
      return;
    }
    setFeedbackText(message.feedback_reason || "");
    setFeedbackDraft(rating);
  };

  const submitFeedback = () => {
    if (!feedbackDraft) return;
    onFeedback?.(feedbackDraft, feedbackText.trim() || undefined);
    setFeedbackDraft(null);
    setFeedbackText("");
  };


  if (isSessionRefreshChip) {
    const state = (message.source || "").split(".").pop() || "";
    if (state === "started" || state === "applied") return null;
    const isFail = state === "failed";
    if (isFail) {
      return (
        <View style={styles.systemChipRow}>
          <View style={[styles.systemChip, { borderColor: theme.error }]}>
            <Text style={[styles.systemChipText, { color: theme.error }]}>{message.text}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={{ alignItems: "center", marginVertical: 8 }}>
        <Text style={{ fontFamily: fonts.pixel, fontSize: 9, color: theme.messageBubble.sessionRefreshText, letterSpacing: 1 }}>
          ✦ 航道校准完毕 · 意识流无缝续航 ✦
        </Text>
      </View>
    );
  }

  if (isToolActivityChip) {
    return null;
  }

  const hasBubbleContent =
    messageSegments.length > 0 ||
    imageAttachments.length > 0 ||
    fileAttachments.length > 0 ||
    hasVoice ||
    hasInlineStatus ||
    reactions.length > 0 ||
    !!message.quoted_text;


  return (
    <>
    <View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowAssistant,
        // group breathing room belongs AFTER the last message of a run — on the
        // first it wedged 6px between bubble 1 and 2 (Eri's report)
        isGroupEnd ? styles.rowGroupEnd : styles.rowInGroup,
        Platform.OS === "web" && animDelay > 0 && { animationDelay: `${animDelay}ms` } as any,
      ]}
      {...(Platform.OS === "web" ? { dataSet: { msgfade: fadeState } } : {})}
    >
      {isGroupStart && (
        <View
          style={[
            styles.messageHeader,
            isUser ? styles.messageHeaderUser : styles.messageHeaderAssistant,
          ]}
        >
          <Text
            style={[
              styles.senderName,
              isUser ? styles.senderNameUser : styles.senderNameAssistant,
              isCursa && styles.senderNameCursa,
            ]}
          >
            {sourceLabel(message, senderName)}
          </Text>
        </View>
      )}
      <View style={styles.bubbleStack}>
        {/* 时序流渲染（压榨清单#4）：思考/工具按 content_blocks 真实顺序交错展开 */}
        {useFlowRender && !isUser && flowGroups.map((group, gi) => {
          if (group.kind === "thinking") {
            const thinkingIdx = flowGroups.slice(0, gi + 1).filter((g) => g.kind === "thinking").length;
            const open = !!expandedFlow[gi];
            const label = flowThinkingCount > 1
              ? (isEH ? `THINKING ${thinkingIdx}/${flowThinkingCount}` : `${THINKING_LABEL} · ${thinkingIdx}`)
              : (isEH ? "THINKING" : THINKING_LABEL);
            return (
              <View key={`flow-${gi}`}>
                <TouchableOpacity
                  onPress={() => toggleFlow(gi)}
                  style={[styles.thinkingChip, styles.thinkingChip_thinking, open && styles.thinkingChipActive]}
                  activeOpacity={0.7}
                >
                  <View style={styles.thinkingChipInner}>
                    {isEH && Platform.OS === "web" ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <circle cx="5" cy="5" r="3.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" fill="none" />
                        <circle cx="5" cy="5" r="1.2" fill="rgba(255,255,255,0.6)" />
                      </svg>
                    ) : (
                      <Image source={THINKING_STAR} style={styles.thinkingStar} />
                    )}
                    <Text style={[styles.thinkingChipText, isEH && { fontFamily: "Silkscreen", fontSize: 7, letterSpacing: 1, color: "rgba(255,255,255,0.45)" }]}>
                      {label}
                      {open ? " ▾" : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
                {open && (
                  <View
                    style={[
                      styles.thinkingFrame,
                      Platform.OS === "web" ? webThinkingSurface(theme) : nativeThinkingSurface(theme),
                      isEH && { borderRadius: 0 },
                    ]}
                  >
                    <ScrollView style={styles.thinkingBox} nestedScrollEnabled>
                      <Text style={styles.thinkingText}>{group.content}</Text>
                    </ScrollView>
                  </View>
                )}
              </View>
            );
          }
          // tools group — 复用工具卡样式，落在真实发生的位置，点击折叠/展开
          return (
            <TouchableOpacity
              key={`flow-${gi}`}
              onPress={() => toggleFlow(gi)}
              activeOpacity={0.8}
              style={[styles.toolCard, isEH && { borderRadius: 0, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(16,16,18,0.7)" }]}
            >
              <View style={styles.toolCardHeader}>
                {isEH && Platform.OS === "web" ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <rect x="1" y="1" width="6" height="6" stroke="rgba(120,200,120,0.6)" strokeWidth="1.2" fill="none" />
                        <rect x="2.5" y="2.5" width="3" height="3" fill="rgba(120,200,120,0.5)" />
                      </svg>
                      <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
                        {summarizeToolCalls(group.items)}
                      </span>
                    </div>
                    <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: "rgba(120,200,120,0.6)", letterSpacing: 2 }}>DONE</span>
                  </>
                ) : (
                  <>
                    <Text style={styles.toolCardProc}>▸ {summarizeToolCalls(group.items)}</Text>
                    <Text style={styles.toolCardStatus}>OK</Text>
                  </>
                )}
              </View>
              {expandedFlow[gi] && (
                /* 操作面板（IMG_9051 风格，压榨清单#1 二期）：黑底终端块，
                   命令逐条打勾——聊天里直接看干了什么，不用跑终端页 */
                <View style={{
                  backgroundColor: isEH ? "#000" : "rgba(4,8,16,0.92)",
                  borderRadius: isEH ? 0 : 8,
                  borderWidth: 1,
                  borderColor: isEH ? "rgba(255,255,255,0.14)" : "rgba(120,200,120,0.18)",
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  marginTop: 6,
                  gap: 5,
                }}>
                  {group.items.map((tc, i) => {
                    const info = toolInfo(resolveToolKey(tc));
                    const isCmd = resolveToolKey(tc) === "Bash";
                    return (
                      <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
                        <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: "#78c878", lineHeight: 15 }}>✓</Text>
                        {isCmd ? (
                          <Text style={{ flex: 1, fontFamily: Platform.OS === "web" ? "monospace" : fonts.pixel, fontSize: 10, lineHeight: 15, color: isEH ? "rgba(255,255,255,0.75)" : "rgba(160,220,170,0.85)" } as any} numberOfLines={2}>
                            <Text style={{ color: isEH ? "rgba(255,255,255,0.35)" : "rgba(120,200,120,0.5)" }}>$ </Text>
                            {tc.input_summary}
                          </Text>
                        ) : (
                          <Text style={{ flex: 1, fontFamily: fonts.pixel, fontSize: 10, lineHeight: 15, color: isEH ? "rgba(255,255,255,0.7)" : "rgba(200,216,240,0.8)" }} numberOfLines={2}>
                            <Text style={{ color: isEH ? "rgba(96,168,255,0.85)" : "rgba(120,170,240,0.8)" }}>{isEH ? info.label.toUpperCase() : info.label} </Text>
                            {tc.input_summary}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3, paddingTop: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isEH ? "rgba(255,255,255,0.1)" : "rgba(120,200,120,0.15)" }}>
                    <Text style={{ fontFamily: fonts.pixel, fontSize: 8, color: isEH ? "rgba(255,255,255,0.35)" : "rgba(120,200,120,0.45)", letterSpacing: 1 }}>
                      {group.items.length} 个操作 · 完成
                    </Text>
                    <Text style={{ fontFamily: fonts.pixel, fontSize: 8, color: "#78c878", letterSpacing: 1 }}>✓ DONE</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {!useFlowRender && hasThinking && (
          <TouchableOpacity
            onPress={() => setShowThinking(!showThinking)}
            style={[
              styles.thinkingChip,
              styles.thinkingChip_thinking,
              showThinking && styles.thinkingChipActive,
            ]}
            activeOpacity={0.7}
          >
            <View style={styles.thinkingChipInner}>
              {isEH && Platform.OS === "web" ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="3.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" fill="none" />
                  <circle cx="5" cy="5" r="1.2" fill="rgba(255,255,255,0.6)" />
                </svg>
              ) : (
                <Image source={THINKING_STAR} style={styles.thinkingStar} />
              )}
              <Text style={[styles.thinkingChipText, isEH && { fontFamily: "Silkscreen", fontSize: 7, letterSpacing: 1, color: "rgba(255,255,255,0.45)" }]}>
                {isEH ? "THINKING" : THINKING_LABEL}
                {showThinking ? " ▾" : ""}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {!useFlowRender && showThinking && thinkingText && (
          <View
            style={[
              styles.thinkingFrame,
              Platform.OS === "web" ? webThinkingSurface(theme) : nativeThinkingSurface(theme),
              isEH && { borderRadius: 0 },
            ]}
          >
            <ScrollView style={styles.thinkingBox} nestedScrollEnabled>
              <Text style={styles.thinkingText}>{thinkingText}</Text>
            </ScrollView>
          </View>
        )}

        {!useFlowRender && hasToolCalls && (
          <TouchableOpacity
            onPress={() => setShowTools(!showTools)}
            style={[styles.toolCard, isEH && { borderRadius: 0, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(16,16,18,0.7)" }]}
            activeOpacity={0.8}
          >
            <View style={styles.toolCardHeader}>
              {isEH && Platform.OS === "web" ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <rect x="1" y="1" width="6" height="6" stroke="rgba(120,200,120,0.6)" strokeWidth="1.2" fill="none" />
                      <rect x="2.5" y="2.5" width="3" height="3" fill="rgba(120,200,120,0.5)" />
                    </svg>
                    <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
                      {summarizeToolCalls(toolCalls)}
                    </span>
                  </div>
                  <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: "rgba(120,200,120,0.6)", letterSpacing: 2 }}>DONE</span>
                </>
              ) : (
                <>
                  <Text style={styles.toolCardProc}>▸ {summarizeToolCalls(toolCalls)}</Text>
                  <Text style={styles.toolCardStatus}>OK</Text>
                </>
              )}
            </View>
            {Platform.OS === "web" ? (
              <div className={`tool-stack-list${showTools ? " expanded" : ""}`}>
                {toolCalls.map((tc, i) => {
                  const info = toolInfo(resolveToolKey(tc));
                  return (
                    <View key={i} style={styles.toolCardRow}>
                      {isEH ? (
                        <Text style={[styles.toolCardEmoji, { fontSize: 8 }]}>·</Text>
                      ) : (
                        <Text style={styles.toolCardEmoji}>{info.emoji}</Text>
                      )}
                      <Text style={[styles.toolCardName, isEH && { fontFamily: "Silkscreen", fontSize: 7, letterSpacing: 1 }]}>{isEH ? info.label.toUpperCase() : info.label}</Text>
                      <Text style={styles.toolCardDetail} numberOfLines={1}>{tc.input_summary}</Text>
                    </View>
                  );
                })}
              </div>
            ) : showTools ? (
              <View style={styles.toolCardBody}>
                {toolCalls.map((tc, i) => {
                  const info = toolInfo(resolveToolKey(tc));
                  return (
                    <View key={i} style={styles.toolCardRow}>
                      <Text style={styles.toolCardEmoji}>{info.emoji}</Text>
                      <Text style={styles.toolCardName}>{info.label}</Text>
                      <Text style={styles.toolCardDetail} numberOfLines={1}>{tc.input_summary}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </TouchableOpacity>
        )}

        {hasBubbleContent && (() => {
          const segs = messageSegments.slice(0, visibleSegmentCount);
          const multi = messageSegments.length > 1;
          const ehCut = EH_BUBBLE_CUT;
          const frameStyle = [
            styles.bubbleFrame,
            isUser ? styles.bubbleFrameUser : styles.bubbleFrameAssistant,
            isFailed && styles.bubbleFrameFailed,
            isSending && styles.bubbleFrameSending,
            isPendingBatch && styles.bubbleFramePending,
            isEH && Platform.OS === "web" && { backgroundColor: "rgba(255,255,255,0.18)", clipPath: ehCut, padding: 1 } as any,
          ];
          const innerStyle = [
            styles.bubbleInner,
            isUser ? styles.bubbleInnerUser : isCursa ? styles.bubbleInnerCursa : styles.bubbleInnerAssistant,
            pixelBubbleSurface(isUser, message, theme),
          ];
          const txtStyle = [styles.text, isUser ? styles.textUser : styles.textAssistant];
          const txtProps = Platform.OS === "web" ? { dataSet: { class: "msg-text" } } : {};

          const statusEl = hasInlineStatus ? (
            <View style={styles.meta}>
              {isQueued && (
                <TouchableOpacity onPress={onRetry}>
                  <Text style={[styles.statusText, styles.pendingText]}>离线队列中 · 点我同步</Text>
                </TouchableOpacity>
              )}
              {isPendingBatch && null}
              {isFailed && (
                <TouchableOpacity onPress={onRetry}>
                  <Text style={styles.retryText}>发送失败 · 重试</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null;

          const reactEl = reactions.length > 0 ? (
            <View style={styles.reactions}>
              {reactions.map((r: string, i: number) => (
                <Text key={i} style={styles.reactionEmoji}>{r}</Text>
              ))}
            </View>
          ) : null;

          const feedbackMarkEl = !isUser && message.feedback_rating ? (
            <View style={styles.feedbackMark}>
              <Text style={styles.feedbackMarkText}>
                {message.feedback_rating === "like" ? "💛" : "🌑"}
                {message.feedback_reason ? ` ${message.feedback_reason}` : ""}
              </Text>
            </View>
          ) : null;

          const feedbackInputEl = feedbackDraft ? (
            <View style={[styles.feedbackInputBar, styles.actionsBarAssistant]}>
              <Text style={styles.feedbackInputLabel}>
                {feedbackDraft === "like" ? "💛 为什么喜欢" : "🌑 哪里不对"}
              </Text>
              <TextInput
                style={styles.feedbackInput}
                value={feedbackText}
                onChangeText={setFeedbackText}
                placeholder="写给凌晨五点的演化织机（可以不写）"
                placeholderTextColor={theme.messageBubble.placeholderText}
                multiline
                autoFocus
              />
              <View style={styles.feedbackInputBtns}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => { setFeedbackDraft(null); setFeedbackText(""); }} activeOpacity={0.7}>
                  <Text style={styles.actionBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.feedbackBtnActive]} onPress={submitFeedback} activeOpacity={0.7}>
                  <Text style={styles.actionBtnText}>记下</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null;

          const actionEl = (segmentIndex: number) => showActions && actionSegmentIndex === segmentIndex ? (
            <>
              {onReact && (
                <View style={[styles.emojiBar, isUser ? styles.actionsBarUser : styles.actionsBarAssistant]}>
                  {QUICK_EMOJIS.map((e) => (
                    <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => { setShowActions(false); onReact(e); }} activeOpacity={0.6}>
                      <Text style={styles.emojiBtnText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={[styles.actionsBar, isUser ? styles.actionsBarUser : styles.actionsBarAssistant]}>
                {onQuote && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => { setShowActions(false); onQuote(actionSegmentIndex, actionSegmentText); }} activeOpacity={0.7}>
                    <Text style={styles.actionBtnText}>引用</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.7}>
                  <Text style={styles.actionBtnText}>复制</Text>
                </TouchableOpacity>
                {canFeedback && (
                  <TouchableOpacity
                    style={[styles.actionBtn, message.feedback_rating === "like" && styles.feedbackBtnActive]}
                    onPress={() => startFeedback("like")}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnText}>💛</Text>
                  </TouchableOpacity>
                )}
                {canFeedback && (
                  <TouchableOpacity
                    style={[styles.actionBtn, message.feedback_rating === "dislike" && styles.feedbackBtnActive]}
                    onPress={() => startFeedback("dislike")}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnText}>🌑</Text>
                  </TouchableOpacity>
                )}
                {canDelete && (
                  <TouchableOpacity style={styles.actionBtn} onPress={handleDelete} activeOpacity={0.7}>
                    <Text style={[styles.actionBtnText, styles.actionBtnDanger]}>删除</Text>
                  </TouchableOpacity>
                )}
                {/* 硬重roll（压榨清单#2）：仅 API 船员消息——软删旧回复现场重构历史重跑 */}
                {!isUser && String(message.assistant || "").startsWith("crew:") && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setShowActions(false);
                      // 后端软删旧回复并重跑；新回复由轮询带回，旧气泡在下次进入时消失
                      api.chatRegenerate(String(message.assistant)).catch(() => {});
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnText}>♺ 重答</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : null;

          const ehSenderRow = null;

          if (!multi) {
            return (
              <>
              {ehSenderRow}
              <TouchableOpacity
                activeOpacity={1}
                delayLongPress={350}
                onLongPress={() => openActions(0, messageSegments[0])}
                onPress={showActions ? () => setShowActions(false) : undefined}
                style={frameStyle}
                {...(Platform.OS === "web" ? {
                  onContextMenu: (event: any) => { event.preventDefault(); event.stopPropagation(); openActions(0, messageSegments[0]); },
                } : {})}
              >
                <View
                  style={innerStyle}
                  {...(Platform.OS === "web" ? { dataSet: { breathe: isEH ? undefined : breatheColor } } : {})}
                >
                  {isEH && Platform.OS === "web" ? (
                    <>
                      {/* TL corner */}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", top: -1, left: -1 }}>
                        <path d="M0 12 L0 0 L12 0" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" fill="none" />
                        <rect x="0" y="0" width="3" height="3" fill="rgba(255,255,255,0.45)" />
                      </svg>
                      {/* BR corner */}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", bottom: -1, right: -1 }}>
                        <path d="M14 2 L14 14 L2 14" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" fill="none" />
                        <rect x="11" y="11" width="3" height="3" fill="rgba(255,255,255,0.45)" />
                      </svg>
                      {/* TR tick */}
                      <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ position: "absolute", top: -1, right: -1 }}>
                        <path d="M6 0 L6 6" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
                      </svg>
                      {/* BL tick */}
                      <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ position: "absolute", bottom: -1, left: -1 }}>
                        <path d="M0 6 L0 0" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
                      </svg>
                    </>
                  ) : (
                    <CornerBrackets color={cornerColor} size={6} offset={2} />
                  )}
                  {message.quoted_text && (
                    <View style={styles.quoted}>
                      <Text style={styles.quotedText} numberOfLines={2}>{message.quoted_text}</Text>
                    </View>
                  )}
                  {imageAttachments.length === 1 && resolvedImageUrls.length > 0 && (
                    <TouchableOpacity onPress={() => openLightbox(0)} activeOpacity={0.8}>
                      <Image source={{ uri: resolvedImageUrls[0] }} style={styles.attachmentImage} resizeMode="cover" />
                    </TouchableOpacity>
                  )}
                  {imageAttachments.length >= 2 && resolvedImageUrls.length > 0 && (
                    <View style={[styles.imageGrid, imageAttachments.length >= 3 && styles.imageGridWrap]}>
                      {resolvedImageUrls.map((uri, i) => (
                        <TouchableOpacity key={i} onPress={() => openLightbox(i)} activeOpacity={0.8}
                          style={[styles.imageGridItem, imageAttachments.length === 2 && styles.imageGridHalf, imageAttachments.length >= 3 && styles.imageGridQuarter]}>
                          <Image source={{ uri }} style={styles.imageGridImg} resizeMode="cover" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {fileAttachments.length > 0 && fileAttachments.map((a) => (
                    <TouchableOpacity key={a.id} style={styles.attachmentFile}
                      onPress={async () => { try { const url = await api.fetchAttachmentBlobUrl(a.url); if (Platform.OS === "web") window.open(url, "_blank"); } catch {} }}
                      activeOpacity={0.7}>
                      <Text style={styles.attachmentIcon}>📄</Text>
                      <Text style={styles.attachmentFileText} numberOfLines={1}>附件文件</Text>
                    </TouchableOpacity>
                  ))}
                  {hasVoice && (
                    <VoicePlayer
                      voiceUrl={message.voice_url!}
                      showingText={showVoiceText}
                      onToggleText={() => setShowVoiceText(v => !v)}
                    />
                  )}
                  {hasVoice && !showVoiceText
                    ? null
                    : messageSegments.length > 0 && <View {...txtProps}>{renderMarkdown(messageSegments[0], txtStyle, mdStyles)}</View>
                  }
                  {musicTags.map((mt, mi) => <MusicCard key={`music-${mi}`} songId={mt.songId} songName={mt.songName} artist={mt.artist} />)}
                  {statusEl}
                  {reactEl}
                  {feedbackMarkEl}
                </View>
              </TouchableOpacity>
              {actionEl(0)}
              {feedbackInputEl}
              </>
            );
          }

          return (
            <>
              {ehSenderRow}
              <TouchableOpacity
                activeOpacity={1}
                delayLongPress={350}
                onLongPress={() => openActions(0, messageSegments[0])}
                onPress={showActions ? () => setShowActions(false) : undefined}
                style={frameStyle}
                {...(Platform.OS === "web" ? {
                  onContextMenu: (event: any) => { event.preventDefault(); event.stopPropagation(); openActions(0, messageSegments[0]); },
                } : {})}
              >
                <View
                  style={innerStyle}
                  {...(Platform.OS === "web" ? { dataSet: { breathe: isEH ? undefined : breatheColor } } : {})}
                >
                  {isEH && Platform.OS === "web" ? (
                    <>
                      {/* TL corner */}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", top: -1, left: -1 }}>
                        <path d="M0 12 L0 0 L12 0" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" fill="none" />
                        <rect x="0" y="0" width="3" height="3" fill="rgba(255,255,255,0.45)" />
                      </svg>
                      {/* BR corner */}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", bottom: -1, right: -1 }}>
                        <path d="M14 2 L14 14 L2 14" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" fill="none" />
                        <rect x="11" y="11" width="3" height="3" fill="rgba(255,255,255,0.45)" />
                      </svg>
                      {/* TR tick */}
                      <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ position: "absolute", top: -1, right: -1 }}>
                        <path d="M6 0 L6 6" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
                      </svg>
                      {/* BL tick */}
                      <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ position: "absolute", bottom: -1, left: -1 }}>
                        <path d="M0 6 L0 0" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
                      </svg>
                    </>
                  ) : (
                    <CornerBrackets color={cornerColor} size={6} offset={2} />
                  )}
                  {message.quoted_text && (
                    <View style={styles.quoted}>
                      <Text style={styles.quotedText} numberOfLines={2}>{message.quoted_text}</Text>
                    </View>
                  )}
                  {imageAttachments.length === 1 && resolvedImageUrls.length > 0 && (
                    <TouchableOpacity onPress={() => openLightbox(0)} activeOpacity={0.8}>
                      <Image source={{ uri: resolvedImageUrls[0] }} style={styles.attachmentImage} resizeMode="cover" />
                    </TouchableOpacity>
                  )}
                  {imageAttachments.length >= 2 && resolvedImageUrls.length > 0 && (
                    <View style={[styles.imageGrid, imageAttachments.length >= 3 && styles.imageGridWrap]}>
                      {resolvedImageUrls.map((uri, i) => (
                        <TouchableOpacity key={i} onPress={() => openLightbox(i)} activeOpacity={0.8}
                          style={[styles.imageGridItem, imageAttachments.length === 2 && styles.imageGridHalf, imageAttachments.length >= 3 && styles.imageGridQuarter]}>
                          <Image source={{ uri }} style={styles.imageGridImg} resizeMode="cover" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {fileAttachments.length > 0 && fileAttachments.map((a) => (
                    <TouchableOpacity key={a.id} style={styles.attachmentFile}
                      onPress={async () => { try { const url = await api.fetchAttachmentBlobUrl(a.url); if (Platform.OS === "web") window.open(url, "_blank"); } catch {} }}
                      activeOpacity={0.7}>
                      <Text style={styles.attachmentIcon}>📄</Text>
                      <Text style={styles.attachmentFileText} numberOfLines={1}>附件文件</Text>
                    </TouchableOpacity>
                  ))}
                  {hasVoice && (
                    <VoicePlayer
                      voiceUrl={message.voice_url!}
                      showingText={showVoiceText}
                      onToggleText={() => setShowVoiceText(v => !v)}
                    />
                  )}
                  {hasVoice && !showVoiceText
                    ? null
                    : segs.length > 0 && <Text style={txtStyle} {...txtProps}>{segs[0]}</Text>
                  }
                </View>
              </TouchableOpacity>
              {actionEl(0)}
              {segs.slice(1).map((seg: string, si: number) => {
                const segmentIndex = si + 1;
                const isLast = segmentIndex === messageSegments.length - 1;
                return (
                  <Fragment key={segmentIndex}>
                  <TouchableOpacity
                    activeOpacity={1}
                    delayLongPress={350}
                    onLongPress={() => openActions(segmentIndex, seg)}
                    onPress={showActions ? () => setShowActions(false) : undefined}
                    style={[
                      frameStyle,
                      styles.segmentFrame,
                      Platform.OS === "web" ? ({ animationDelay: `${segmentIndex * 80}ms` } as any) : null,
                    ]}
                    {...(Platform.OS === "web" ? {
                      dataSet: { msgfade: "appear" },
                      onContextMenu: (event: any) => { event.preventDefault(); event.stopPropagation(); openActions(segmentIndex, seg); },
                    } : {})}
                  >
                    <View
                      style={innerStyle}
                      {...(Platform.OS === "web" ? { dataSet: { breathe: breatheColor } } : {})}
                    >
                      {isEH && Platform.OS === "web" ? (
                        <>
                          <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: 3, backgroundColor: "rgba(255,255,255,0.5)" }} />
                          <div style={{ position: "absolute", bottom: 0, right: 0, width: 3, height: 3, backgroundColor: "rgba(255,255,255,0.5)" }} />
                        </>
                      ) : (
                        <CornerBrackets color={cornerColor} size={6} offset={2} />
                      )}
                      <View {...txtProps}>{renderMarkdown(seg, txtStyle, mdStyles)}</View>
                      {isLast && musicTags.map((mt, mi) => <MusicCard key={`music-${mi}`} songId={mt.songId} songName={mt.songName} artist={mt.artist} />)}
                      {isLast && statusEl}
                      {isLast && reactEl}
                      {isLast && feedbackMarkEl}
                    </View>
                  </TouchableOpacity>
                  {actionEl(segmentIndex)}
                  </Fragment>
                );
              })}
              {feedbackInputEl}
            </>
          );
        })()}
        {isGroupEnd && (
          <View style={[styles.timeRow, isUser ? styles.timeRowUser : styles.timeRowAssistant]}>
            <Text
              style={[
                styles.messageTime,
                styles.timeBelow,
                isUser ? styles.timeBelowUser : styles.timeBelowAssistant,
              ]}
            >
              {formatTime(message.ts)}
            </Text>
            {isUser && (message.read_at || message.status === "sent") && (
              <Text style={styles.readReceipt}>✓</Text>
            )}
          </View>
        )}
      </View>
    </View>
    </>
  );
}

export default memo(
  MessageBubble,
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.text === next.message.text &&
    prev.message.status === next.message.status &&
    prev.message.reactions === next.message.reactions &&
    prev.message.feedback_rating === next.message.feedback_rating &&
    prev.message.feedback_reason === next.message.feedback_reason &&
    prev.message.thinking === next.message.thinking &&
    prev.message.content_blocks === next.message.content_blocks &&
    prev.message.tool_calls === next.message.tool_calls &&
    prev.message.attachments === next.message.attachments &&
    prev.message.voice_url === next.message.voice_url &&
    prev.message.read_at === next.message.read_at &&
    prev.isGroupStart === next.isGroupStart &&
    prev.isGroupEnd === next.isGroupEnd &&
    prev.animDelay === next.animDelay
);

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    ...(Platform.OS === "web" ? { contain: "layout style paint" } as any : {}),
  },
  rowGroupEnd: {
    paddingBottom: 6,
  },
  rowInGroup: {
    paddingBottom: 3,
  },
  rowUser: {
    alignItems: "flex-end",
  },
  rowAssistant: {
    alignItems: "flex-start",
  },
  bubbleStack: {
    maxWidth: "82%",
    ...(Platform.OS === "web" ? ({ width: "fit-content" } as any) : {}),
  },
  bubbleFrame: {
    position: "relative",
    backgroundColor: "transparent",
    maxWidth: "100%",
    ...(Platform.OS === "web" ? ({ width: "fit-content" } as any) : {}),
  },
  bubbleFrameUser: {
    alignSelf: "flex-end",
  },
  bubbleFrameAssistant: {
    alignSelf: "flex-start",
  },
  segmentFrame: {
    marginTop: 3,
  },
  bubbleFrameFailed: {},
  bubbleFrameSending: {
    opacity: 0.65,
  },
  bubbleFramePending: {
    opacity: 0.86,
  },
  bubbleInner: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 34,
    backgroundColor: theme.messageBubble.bubbleInnerBg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.messageBubble.bubbleInnerBorder,
    borderRadius: 4,
    maxWidth: "100%",
    ...(Platform.OS === "web" ? ({ width: "fit-content" } as any) : {}),
  },
  bubbleInnerUser: {
    backgroundColor: theme.messageBubble.bubbleInnerUserBg,
    borderColor: theme.messageBubble.bubbleInnerUserBorder,
  },
  bubbleInnerAssistant: {
    backgroundColor: theme.messageBubble.bubbleInnerAssistantBg,
    borderColor: theme.messageBubble.bubbleInnerAssistantBorder,
  },
  bubbleInnerCursa: {
    backgroundColor: theme.messageBubble.bubbleInnerCursaBg,
    borderColor: theme.messageBubble.bubbleInnerCursaBorder,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  messageHeaderUser: {
    alignSelf: "flex-end",
    justifyContent: "flex-end",
  },
  messageHeaderAssistant: {
    alignSelf: "flex-start",
    justifyContent: "flex-start",
  },
  messageTime: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: theme.textMuted,
  },
  timeBelow: {},
  timeBelowUser: {},
  timeBelowAssistant: {},
  senderName: {
    fontFamily: fonts.silkscreen,
    fontSize: 13,
    letterSpacing: 0,
    textShadowColor: theme.pixel.shadow,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  senderNameUser: {
    alignSelf: "flex-end",
    color: theme.pixel.gold,
  },
  senderNameAssistant: {
    alignSelf: "flex-start",
    color: theme.blueAccent,
  },
  senderNameCursa: {
    color: theme.messageBubble.senderCursa,
  },
  quoted: {
    borderLeftWidth: 2,
    borderLeftColor: theme.textMuted,
    paddingLeft: 8,
    marginBottom: 6,
  },
  quotedText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textMuted,
  },
  text: {
    fontFamily: fonts.chat,
    fontSize: 15,
    lineHeight: 24,
  },
  textUser: {
    color: theme.text,
  },
  textAssistant: {
    color: theme.text,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 4,
    gap: 8,
  },
  statusText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textDim,
  },
  pendingText: {
    color: theme.warning,
  },
  retryText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.error,
  },
  reactions: {
    flexDirection: "row",
    marginTop: 4,
    gap: 4,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 7,
  },
  timeRowUser: {
    alignSelf: "flex-end",
  },
  timeRowAssistant: {
    alignSelf: "flex-start",
  },
  readReceipt: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.textMuted,
  },
  systemChipRow: {
    paddingHorizontal: 12,
    marginVertical: 6,
    alignItems: "center",
  },
  systemChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    backgroundColor: theme.bgThinking,
    maxWidth: "82%",
  },
  systemChipText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    textAlign: "center",
  },
  thinkingChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 2,
    paddingVertical: 1,
    marginBottom: 4,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  thinkingChipActive: {
    opacity: 0.86,
  },
  thinkingChip_thinking: {
    borderColor: theme.accent,
  },
  thinkingChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  thinkingStar: {
    width: 10,
    height: 10,
    imageRendering: "pixelated",
  } as any,
  thinkingChipText: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.textDim,
  },
  thinkingFrame: {
    opacity: 0.7,
    marginBottom: 4,
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: theme.messageBubble.thinkingSurfaceBg,
  },
  thinkingBox: {
    padding: 6,
    maxHeight: 480,
  },
  thinkingText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: theme.textDim,
    lineHeight: 18,
  },
  attachmentImage: {
    width: 220,
    height: 220,
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: theme.pixel.border,
    marginBottom: 6,
  },
  imageGrid: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 6,
  },
  imageGridWrap: {
    flexWrap: "wrap",
    maxWidth: 224,
  },
  imageGridItem: {},
  imageGridHalf: {
    width: 108,
    height: 108,
  },
  imageGridQuarter: {
    width: 108,
    height: 108,
  },
  imageGridImg: {
    width: "100%",
    height: "100%",
    borderWidth: 1,
    borderColor: theme.pixel.border,
  },
  attachmentFile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.bgInput,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    gap: 8,
  },
  attachmentIcon: {
    fontSize: 20,
  },
  attachmentFileText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.text,
    flex: 1,
  },
  actionsBar: {
    flexDirection: "row",
    gap: 2,
    marginTop: 4,
  },
  actionsBarUser: {
    alignSelf: "flex-end",
  },
  actionsBarAssistant: {
    alignSelf: "flex-start",
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.messageBubble.actionBg,
    borderWidth: 1,
    borderColor: theme.pixel.border,
  },
  actionBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.text,
  },
  actionBtnDanger: {
    color: theme.error,
  },
  emojiBar: {
    flexDirection: "row",
    gap: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  emojiBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: theme.messageBubble.actionBg,
    borderWidth: 1,
    borderColor: theme.pixel.border,
  },
  emojiBtnText: {
    fontSize: 14,
  },
  feedbackBtnActive: {
    borderColor: theme.pixel.gold,
    backgroundColor: theme.messageBubble.feedbackActiveBg,
  },
  feedbackMark: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
  feedbackMarkText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.messageBubble.feedbackMarkText,
  },
  feedbackInputBar: {
    marginTop: 4,
    padding: 8,
    gap: 6,
    width: 260,
    backgroundColor: theme.messageBubble.feedbackInputBg,
    borderWidth: 1,
    borderColor: theme.pixel.gold,
  },
  feedbackInputLabel: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.pixel.gold,
    letterSpacing: 1,
  },
  feedbackInput: {
    fontFamily: fonts.pixel,
    // iOS Safari 对 <16px 的输入框聚焦时会强制放大页面，反馈框必须 ≥16
    fontSize: 16,
    color: theme.text,
    minHeight: 44,
    maxHeight: 120,
    padding: 6,
    backgroundColor: theme.messageBubble.feedbackInputFieldBg,
    borderWidth: 1,
    borderColor: theme.pixel.border,
    textAlignVertical: "top",
  },
  feedbackInputBtns: {
    flexDirection: "row",
    gap: 4,
    justifyContent: "flex-end",
  },
  toolCard: {
    marginBottom: 4,
    backgroundColor: theme.messageBubble.bubbleInnerAssistantBg,
    borderWidth: 1,
    borderColor: theme.messageBubble.toolBorder,
    borderRadius: 4,
    overflow: "hidden",
  },
  toolCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  toolCardProc: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: theme.messageBubble.toolProc,
    letterSpacing: 0.5,
  },
  toolCardStatus: {
    fontFamily: fonts.mono,
    fontSize: 7,
    color: theme.messageBubble.toolStatus,
    letterSpacing: 1,
    marginLeft: 8,
  },
  toolCardBody: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  toolCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 1,
  },
  toolCardEmoji: {
    fontSize: 10,
  },
  toolCardName: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.messageBubble.toolName,
  },
  toolCardDetail: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: theme.messageBubble.toolDetail,
    flex: 1,
  },
  });
}
