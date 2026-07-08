import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Alert,
  View,
  FlatList,
  StyleSheet,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWebViewportFit } from "../../hooks/useWebKeyboard";
import { useChat } from "../../stores/chatStore";
import { useConnection } from "../../stores/connectionStore";
import { ChatMessage, api } from "../../services/api";
import MessageBubble from "../../components/chat/MessageBubble";
import TimeSeparator from "../../components/chat/TimeSeparator";
import InputBar from "../../components/chat/InputBar";
import ThinkingIndicator from "../../components/chat/ThinkingIndicator";
import ContextHealthBar from "../../components/chat/ContextHealthBar";
import StatusStar from "../../components/chat/StatusStar";
import ImageLightbox from "../../components/chat/ImageLightbox";
import VoiceCall from "../../components/chat/VoiceCall";
import CursaChatView from "../../components/chat/CursaChatView";
import ThemeBackground from "../../components/decor/ThemeBackground";
import HudHeader from "../../components/chat/HudHeader";
import CrtScanlines from "../../components/decor/CrtScanlines";
import CornerBrackets from "../../components/decor/CornerBrackets";
import ThemeDivider from "../../components/decor/ThemeDivider";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import { buildItems, type ListItem } from "../../components/chat/listItems";
import type { ThemeTokens } from "../../theme/themes";

function installChatWebStyles(theme: ThemeTokens) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;

  const id = "crt-scanlines-css";
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = `
      html, body { overscroll-behavior: none; overflow: hidden; }
      :root { --orbit-play: running; }
      .page-hidden { --orbit-play: paused; }
      .page-hidden [data-twinkle] { animation-play-state: paused !important; }
      .page-hidden .chat-river-glow { animation-play-state: paused !important; }
      @keyframes msgAppear {
        from { opacity: 0; transform: translate3d(0, 8px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
      }
      @keyframes msgSend {
        from { opacity: 0; transform: translate3d(0, 6px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
      }
      [data-msgfade="appear"] {
        will-change: transform, opacity;
        animation-name: msgAppear !important;
        animation-duration: 0.5s !important;
        animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1) !important;
        animation-fill-mode: both !important;
      }
      [data-msgfade="send"] {
        will-change: transform, opacity;
        animation-name: msgSend !important;
        animation-duration: 0.4s !important;
        animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1) !important;
        animation-fill-mode: both !important;
      }
    `;

  if (!document.getElementById("horizon-visibility-pause")) {
    const vis = document.createElement("script");
    vis.id = "horizon-visibility-pause";
    vis.textContent = 'document.addEventListener("visibilitychange",function(){document.documentElement.classList.toggle("page-hidden",document.hidden)})';
    document.head.appendChild(vis);
  }
}

function HighlightedSnippet({ snippet }: { snippet: string }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const parts = snippet.split(/(<mark>.*?<\/mark>)/g);
  return (
    <Text style={styles.searchSnippet} numberOfLines={3}>
      {parts.map((part, i) => {
        const match = part.match(/^<mark>(.*)<\/mark>$/);
        if (match) {
          return (
            <Text key={i} style={styles.searchHighlight}>
              {match[1]}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

function useDripMessages(messages: ChatMessage[], interval = 420): ChatMessage[] {
  const [visibleCount, setVisibleCount] = useState(messages.length);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownRef = useRef(messages.length);
  const prevLastIdRef = useRef(messages[messages.length - 1]?.id || "");

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    const target = messages.length;
    const lastId = messages[target - 1]?.id || "";
    const appended = target > shownRef.current && prevLastIdRef.current !== lastId;

    if (!appended || shownRef.current === 0) {
      shownRef.current = target;
      prevLastIdRef.current = lastId;
      setVisibleCount(target);
      return;
    }

    function drip() {
      shownRef.current = Math.min(shownRef.current + 1, target);
      setVisibleCount(shownRef.current);
      if (shownRef.current < target) {
        timerRef.current = setTimeout(drip, interval);
      } else {
        prevLastIdRef.current = lastId;
      }
    }

    timerRef.current = setTimeout(drip, 80);
  }, [messages.length, messages[messages.length - 1]?.id, interval]);

  return useMemo(
    () => messages.slice(0, visibleCount),
    [messages, visibleCount]
  );
}


export default function ChatScreen() {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    installChatWebStyles(theme);
  }, [theme]);
  const insets = useSafeAreaInsets();
  const containerRef = useRef<View>(null);
  useWebViewportFit(containerRef, insets.bottom);
  const flatListRef = useRef<FlatList>(null);
  // API 船员聊天入口在群组「通讯频段」（Eri 拍板），聊天只留 A/萨
  const [chatMode, setChatMode] = useState<string>("epsilon");
  const scrollFrameRef = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);
  // 最近一次用户滚动的时间戳——快速滑动时 scroll 事件稀疏（throttle 80ms），
  // isNearBottomRef 可能基于过期位置误判"在底部"，新消息一到就把人拽回底部（鬼畜跳）。
  // 滚动后 600ms 内不做程序性自动滚动。
  const lastUserScrollTsRef = useRef(0);
  const messageCountRef = useRef(0);

  const [unreadBelow, setUnreadBelow] = useState(0);
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"all" | "image" | "file" | "link">("all");
  const [searchResults, setSearchResults] = useState<(ChatMessage & { match_snippet?: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const messages = useChat((state) => state.messages);
  const send = useChat((state) => state.send);
  const retryFailed = useChat((state) => state.retryFailed);
  const deleteMessage = useChat((state) => state.deleteMessage);
  const updateMessageText = useChat((state) => state.updateMessageText);
  const clearChat = useChat((state) => state.clearChat);
  const react = useChat((state) => state.react);
  const feedback = useChat((state) => state.feedback);
  const loadHistory = useChat((state) => state.loadHistory);
  const hasMore = useChat((state) => state.hasMore);
  const loadingHistory = useChat((state) => state.loadingHistory);
  const cacheHydrated = useChat((state) => state.cacheHydrated);
  const cacheUpdatedAt = useChat((state) => state.cacheUpdatedAt);
  const connected = useConnection((state) => state.connected);

  // Inverted FlatList: build items oldest→newest then reverse.
  // Item 0 (newest) appears at the visual bottom; history (oldest)
  // is at the array end = visual top. Loading history appends to the
  // end, so the scroll position stays put — no offset compensation.
  const dripped = useDripMessages(messages);
  const items = useMemo(() => buildItems(dripped).reverse(), [dripped]);

  const scrollToBottom = useCallback((animated = false) => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated });
      isNearBottomRef.current = true;
      scrollFrameRef.current = null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const handleImagePress = useCallback((images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  }, []);

  const handleLightboxClose = useCallback(() => {
    setLightboxImages(null);
  }, []);

  const handleSend = useCallback(
    (text: string, attachments?: { id: string; url: string; type: string }[], quotedId?: string, quotedText?: string) => {
      send(text, attachments, quotedId, quotedText);
    },
    [send]
  );

  const showError = useCallback((title: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const alertFn = (globalThis as any).alert;
    if (Platform.OS === "web" && typeof alertFn === "function") {
      alertFn(`${title}\n${message}`);
      return;
    }
    Alert.alert(title, message);
  }, []);

  const showNotice = useCallback((message: string) => {
    const alertFn = (globalThis as any).alert;
    if (Platform.OS === "web" && typeof alertFn === "function") {
      alertFn(message);
      return;
    }
    Alert.alert(message);
  }, []);

  const handleDeleteMessage = useCallback(
    async (message: ChatMessage, segmentIndex?: number, segmentText?: string) => {
      try {
        if (typeof segmentIndex === "number") {
          const segments = message.text
            ? message.text.split(/\n---\n/).map((part) => part.replace(/^---\s*$/, "").trim()).filter(Boolean)
            : [];
          const targetIndex = (() => {
            if (!segmentText) return segmentIndex;
            let visibleIndex = 0;
            for (let index = 0; index < segments.length; index++) {
              if (/^\s*(?:\[skip\]|【skip】)\s*$/i.test(segments[index])) continue;
              if (visibleIndex === segmentIndex && segments[index] === segmentText) return index;
              visibleIndex += 1;
            }
            return segmentIndex;
          })();
          if (segments.length > 1 && targetIndex >= 0 && targetIndex < segments.length) {
            const nextText = segments.filter((_, index) => index !== targetIndex).join("\n---\n").trim();
            if (nextText) await updateMessageText(message.id, nextText);
            else await deleteMessage(message.id);
            return;
          }
        }
        await deleteMessage(message.id);
      } catch (error) {
        showError("删除失败", error);
      }
    },
    [deleteMessage, showError, updateMessageText]
  );

  const handleClearChat = useCallback(() => {
    if (messages.length === 0) return;
    const run = async () => {
      try {
        await clearChat();
        showNotice("已清空");
      } catch (error) {
        showError("清空失败", error);
      }
    };
    const confirm = (globalThis as any).confirm;
    if (Platform.OS === "web" && typeof confirm === "function") {
      if (confirm("确定要清空所有聊天记录吗？")) void run();
      return;
    }
    Alert.alert("清空聊天记录", "确定要清空所有聊天记录吗？", [
      { text: "取消", style: "cancel" },
      { text: "清空", style: "destructive", onPress: () => void run() },
    ]);
  }, [clearChat, messages.length, showError, showNotice]);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSearch = useCallback((q: string, type: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults([]); setSearching(false); setSearchHasMore(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.search(q.trim(), { type, limit: 50 });
        setSearchResults(res.messages);
        setSearchHasMore(res.has_more);
      } catch {
        setSearchResults([]);
        setSearchHasMore(false);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, []);
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    doSearch(q, searchType);
  }, [doSearch, searchType]);
  const handleSearchType = useCallback((type: "all" | "image" | "file" | "link") => {
    setSearchType(type);
    doSearch(searchQuery, type);
  }, [doSearch, searchQuery]);

  const closeSearch = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setShowSearch(false);
    setSearchQuery("");
    setSearchType("all");
    setSearchResults([]);
    setSearching(false);
    setSearchHasMore(false);
  }, []);

  const replaceMessages = useChat((state) => state.replaceMessages);
  const jumpToSearchResult = useCallback(
    async (msg: ChatMessage) => {
      const localIndex = items.findIndex(
        (item) => item.type === "message" && item.data.id === msg.id
      );
      closeSearch();
      if (localIndex >= 0) {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToIndex({ index: localIndex, animated: true, viewPosition: 0.5 });
        });
        return;
      }
      try {
        const res = await api.around(msg.ts, 30, 30);
        if (res.messages.length > 0 && replaceMessages) {
          replaceMessages(res.messages);
          const newItems = buildItems(res.messages).reverse();
          const targetIdx = newItems.findIndex(
            (item) => item.type === "message" && item.data.id === msg.id
          );
          requestAnimationFrame(() => {
            if (targetIdx >= 0) {
              flatListRef.current?.scrollToIndex({ index: targetIdx, animated: true, viewPosition: 0.5 });
            }
          });
        }
      } catch {
        showNotice("跳转失败，请重试");
      }
    },
    [closeSearch, items, replaceMessages, showNotice]
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const prevCount = messageCountRef.current;
    messageCountRef.current = messages.length;
    if (messages.length > prevCount) {
      const userScrolling = Date.now() - lastUserScrollTsRef.current < 600;
      if (isNearBottomRef.current && !userScrolling) {
        scrollToBottom(false);
      } else {
        setUnreadBelow((n) => n + (messages.length - prevCount));
      }
    }
  }, [messages.length, scrollToBottom]);

  const handleScrollToNewest = useCallback(() => {
    scrollToBottom(true);
    setUnreadBelow(0);
  }, [scrollToBottom]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = event.nativeEvent;
      const near = contentOffset.y < 120;
      isNearBottomRef.current = near;
      lastUserScrollTsRef.current = Date.now();
      if (near) setUnreadBelow(0);
    },
    []
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingHistory) return;
    loadHistory();
  }, [hasMore, loadingHistory, loadHistory]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "separator") {
        return <TimeSeparator date={item.date} />;
      }
      const stagger = (item.data as any)._stagger as { batch: number; index: number } | undefined;
      return (
        <MessageBubble
          message={item.data}
          isGroupStart={item.isGroupStart}
          isGroupEnd={item.isGroupEnd}
          animDelay={stagger ? stagger.index * 600 : 0}
          onRetry={
            item.data.status === "failed"
              ? () => retryFailed(item.data.id)
              : undefined
          }
          onDelete={(segmentIndex, segmentText) => handleDeleteMessage(item.data, segmentIndex, segmentText)}
          onQuote={(_segmentIndex, segmentText) => setQuotedMessage(segmentText ? { ...item.data, text: segmentText } : item.data)}
          onReact={(emoji: string) => react(item.data.id, emoji)}
          onFeedback={(rating, reason) => feedback(item.data.id, rating, reason)}
          onImagePress={handleImagePress}
        />
      );
    },
    [handleDeleteMessage, handleImagePress, react, retryFailed]
  );

  const keyExtractor = useCallback(
    (item: ListItem, _index: number) =>
      item.type === "separator" ? `sep-${item.date}` : (item.data.client_id || item.data.id),
    []
  );

  if (chatMode === "cursa") {
    return <CursaChatView onSwitchBack={() => setChatMode("epsilon")} />;
  }

  return (
    <View
      ref={containerRef}
      style={styles.container}
    >
      <ThemeBackground scene="blackhole" />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        {theme.key === "eventHorizon" ? (
          <View style={styles.headerScanline}>
            <View style={{ width: 4, height: 4, backgroundColor: connected ? "rgba(120,200,120,0.8)" : "rgba(200,80,80,0.8)" }} />
            <Text style={[styles.scanlineText, { color: "rgba(255,255,255,0.3)", letterSpacing: 2 }]}>SYS_A</Text>
            <View style={styles.scanlineFill} />
            <Text style={[styles.scanlineText, { color: "rgba(255,255,255,0.2)", letterSpacing: 2 }]}>SEC_CHANNEL // A ERI</Text>
          </View>
        ) : (
          <View style={styles.headerScanline}>
            <Text style={styles.scanlineText}>SYS</Text>
            <View style={[styles.scanlineDot, connected && styles.scanlineDotOn]} />
            <Text style={styles.scanlineText}>{connected ? "LINKED" : "STANDBY"}</Text>
            <View style={styles.scanlineFill} />
            <Text style={styles.scanlineText}>A ERI · λ 427.3</Text>
          </View>
        )}
        <View style={styles.headerMain}>
          <View style={styles.headerTitleRow}>
            {theme.key === "eventHorizon" ? (
              <View style={styles.hudStatusDot}>
                <View style={[styles.hudDotInner, connected && styles.hudDotOn]} />
              </View>
            ) : (
              <StatusStar connected={connected} />
            )}
            <Text style={styles.headerTitle}>UNIT-A</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setMenuOpen(v => !v)} style={styles.menuToggle}>
            <Text style={styles.menuToggleText}>{menuOpen ? "✕" : "◇"}</Text>
          </TouchableOpacity>
        </View>
        {!connected && cacheHydrated && cacheUpdatedAt ? (
          <Text style={styles.headerMeta}>离线缓存 · {new Date(cacheUpdatedAt).toLocaleString()}</Text>
        ) : null}
        {theme.key !== "eventHorizon" && (
          <View style={styles.headerDivider}>
            <View style={styles.dividerTick} />
            <View style={styles.dividerLine} />
            <View style={styles.dividerTick} />
          </View>
        )}
      </View>

      <HudHeader connected={connected} />
      <ContextHealthBar />

      {showSearch && (
        <View style={styles.searchOverlay}>
          <View style={[styles.searchBarRow, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearch}
              placeholder="搜索聊天记录..."
              placeholderTextColor={theme.textMuted}
              autoFocus
              returnKeyType="search"
              {...(Platform.OS === "web"
                ? ({ outlineStyle: "none" } as any)
                : {})}
            />
            {searchQuery !== "" && (
              <TouchableOpacity
                onPress={() => { setSearchQuery(""); setSearchResults([]); setSearchHasMore(false); }}
                style={styles.searchClearBtn}
              >
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={closeSearch}
              style={styles.searchCancelBtn}
            >
              <Text style={styles.searchCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchFilterRow}>
            {(["all", "image", "file", "link"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.searchFilterPill, searchType === t && styles.searchFilterPillActive]}
                onPress={() => handleSearchType(t)}
                activeOpacity={0.7}
              >
                <Text style={[styles.searchFilterText, searchType === t && styles.searchFilterTextActive]}>
                  {{ all: "全部", image: "图片", file: "文件", link: "链接" }[t]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {searching && (
            <View style={styles.searchStatus}>
              <ActivityIndicator size="small" color={theme.pixel.gold} />
              <Text style={styles.searchStatusText}>搜索中…</Text>
            </View>
          )}
          {!searching && searchQuery.trim() !== "" && searchResults.length === 0 && (
            <View style={styles.searchStatus}>
              <Text style={styles.searchStatusText}>没有找到相关消息</Text>
            </View>
          )}
          {searchResults.length > 0 && (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              style={styles.searchResultsList}
              renderItem={({ item }) => {
                const d = new Date(item.ts);
                const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                const hasImage = item.attachment_type === "image" || item.attachments?.some((a) => a.type === "image");
                const hasFile = item.attachment_type === "file" || item.attachments?.some((a) => a.type !== "image");
                return (
                  <TouchableOpacity
                    style={styles.searchResultItem}
                    activeOpacity={0.7}
                    onPress={() => jumpToSearchResult(item)}
                  >
                    <View style={styles.searchResultHeader}>
                      <View style={styles.searchResultSenderRow}>
                        <Text style={styles.searchResultSender}>
                          {item.role === "user" ? "CAPTAIN" : "UNIT-A"}
                        </Text>
                        {hasImage && <Text style={styles.searchResultBadge}>图</Text>}
                        {hasFile && <Text style={styles.searchResultBadge}>附</Text>}
                      </View>
                      <Text style={styles.searchResultTime}>{timeStr}</Text>
                    </View>
                    {item.match_snippet ? (
                      <HighlightedSnippet snippet={item.match_snippet} />
                    ) : (
                      <Text style={styles.searchSnippet} numberOfLines={3}>
                        {item.text}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        // inverted 列表的 header 渲染在视觉底部——"思考中"占位气泡钉在这里，
        // 不进 items 数组，历史回填/缓存恢复永远不会冒出假占位
        ListHeaderComponent={ThinkingIndicator}
        inverted
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.15}
        onScroll={handleScroll}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({
            offset: Math.max(0, info.averageItemLength * info.index),
            animated: true,
          });
        }}
        scrollEventThrottle={16}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={11}
        removeClippedSubviews={Platform.OS !== "web"}
        {...(Platform.OS !== "web" ? {
          decelerationRate: "normal" as const,
          overScrollMode: "never" as const,
        } : {})}
      />

      {unreadBelow > 0 && (
        <TouchableOpacity
          style={[styles.newMsgBtn, theme.key === "eventHorizon" && { borderRadius: 0, borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(20,20,22,0.95)" }]}
          onPress={handleScrollToNewest}
          activeOpacity={0.8}
        >
          <Text style={[styles.newMsgText, theme.key === "eventHorizon" && { fontFamily: "Silkscreen", fontSize: 8, color: "rgba(255,255,255,0.7)", letterSpacing: 1 }]}>
            {theme.key === "eventHorizon" ? `▼ ${unreadBelow} NEW` : `↓ ${unreadBelow} 条新消息`}
          </Text>
        </TouchableOpacity>
      )}
      <InputBar
        onSend={handleSend}
        quotedMessage={quotedMessage}
        onClearQuote={() => setQuotedMessage(null)}
      />
      <View style={{ height: insets.bottom, backgroundColor: theme.inputBar.shellBg }} />
      <CrtScanlines color={theme.chatPage.crtScanlineBg} style={styles.crtOverlay} />
      {lightboxImages && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={handleLightboxClose}
        />
      )}
      {voiceCallOpen && (
        <VoiceCall onClose={() => setVoiceCallOpen(false)} />
      )}
      {menuOpen && (
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View
            style={styles.menuCard}
            onStartShouldSetResponder={() => true}
            {...(Platform.OS === "web" && theme.key === "eventHorizon" ? { style: { ...StyleSheet.flatten(styles.menuCard), clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))" } } as any : {})}
          >
            {theme.key !== "eventHorizon" && <CrtScanlines color={theme.chatPage.crtScanlineBg} style={styles.menuScanline} />}
            {theme.key !== "eventHorizon" && <CornerBrackets color={theme.decor.controlCornerColor} size={10} offset={-1} />}
            <Text style={styles.menuTitle}>SYS · CONTROL</Text>
            <View style={{ height: 1, backgroundColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.08)" : theme.decor.controlDividerColor, marginVertical: 8 }} />
            <View style={styles.menuGrid}>
              {[
                { icon: "CLR", label: "PURGE", dot: null, onPress: () => { setMenuOpen(false); handleClearChat(); } },
                { icon: "SCN", label: "SCAN", dot: "on", onPress: () => { setMenuOpen(false); setShowSearch(true); } },
                { icon: "COM", label: "VOICE", dot: null, onPress: () => { setMenuOpen(false); setVoiceCallOpen(true); } },
                { icon: "B", label: "CURSA", dot: "beta", onPress: () => { setMenuOpen(false); setChatMode("cursa"); } },
              ].map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.menuItem}
                  onPress={btn.onPress}
                  {...(Platform.OS === "web" && theme.key === "eventHorizon" ? { style: { ...StyleSheet.flatten(styles.menuItem), clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))" } } as any : {})}
                >
                  <View style={[styles.menuItemDot, btn.dot === "on" && styles.menuItemDotOn, btn.dot === "beta" && styles.menuItemDotBeta]} />
                  <Text style={styles.menuItemIcon}>[{btn.icon}]</Text>
                  <Text style={styles.menuItemLabel}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: 1, backgroundColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.08)" : theme.decor.controlDividerColor, marginVertical: 8 }} />
            <Text style={styles.menuFooter}>A ERI · ARCHIVE</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    overflow: "hidden" as const,
  },
  header: {
    backgroundColor: theme.bg,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  headerScanline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  scanlineText: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: theme.chatPage.scanlineText,
    letterSpacing: 1,
  },
  scanlineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.chatPage.scanlineDot,
  },
  scanlineDotOn: {
    backgroundColor: theme.chatPage.scanlineDotOn,
  },
  scanlineFill: {
    flex: 1,
  },
  headerMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
    position: "relative" as const,
    zIndex: 50,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 20,
    color: theme.pixel.gold,
    ...(Platform.OS === "web" ? {
      textShadow: theme.chatPage.headerTitleShadowWeb,
    } as any : {
      textShadowColor: theme.chatPage.headerTitleShadowNative,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    }),
  },
  menuToggle: {
    padding: 6,
  },
  menuToggleText: {
    fontFamily: fonts.silkscreen,
    fontSize: 14,
    color: theme.pixel.gold,
  },
  menuOverlay: {
    position: "absolute" as const,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
    backgroundColor: "transparent",
    elevation: 999,
    justifyContent: "flex-start" as const,
    alignItems: "flex-end" as const,
    paddingTop: 70,
    paddingRight: 14,
  },
  hudStatusDot: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  hudDotInner: {
    width: 4,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  hudDotOn: {
    backgroundColor: "rgba(120,200,120,0.9)",
  },
  menuCard: {
    backgroundColor: theme.key === "eventHorizon" ? "#000" : "rgba(6,8,20,1)",
    borderWidth: 1,
    borderColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.12)" : "rgba(80,140,220,0.3)",
    padding: 14,
    minWidth: 180,
    position: "relative" as const,
  },
  menuTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: theme.key === "eventHorizon" ? "rgba(255,255,255,0.4)" : "rgba(100,170,240,0.65)",
    letterSpacing: 3,
    textAlign: "center" as const,
    marginBottom: 6,
  },
  menuDivider: {
    marginVertical: 8,
  },
  menuFooter: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: theme.key === "eventHorizon" ? "rgba(255,255,255,0.2)" : "rgba(80,140,220,0.35)",
    letterSpacing: 2,
    textAlign: "center" as const,
    marginTop: 2,
  },
  menuScanline: {
    position: "absolute" as const,
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.4,
    zIndex: 0,
  },
  menuGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
    justifyContent: "center" as const,
  },
  menuItem: {
    alignItems: "center" as const,
    width: 60,
    gap: 3,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.08)" : "rgba(80,140,220,0.15)",
    backgroundColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.02)" : "rgba(80,140,220,0.04)",
  },
  menuItemDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.25)" : "rgba(80,140,220,0.4)",
    marginBottom: 2,
  },
  menuItemDotOn: {
    backgroundColor: "rgba(100,220,160,0.7)",
  },
  menuItemDotBeta: {
    backgroundColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.5)" : "rgba(130,170,240,0.7)",
  },
  menuItemIcon: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.key === "eventHorizon" ? "rgba(255,255,255,0.7)" : "rgba(110,170,240,0.8)",
    letterSpacing: 1,
  },
  menuItemLabel: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: theme.key === "eventHorizon" ? "rgba(255,255,255,0.4)" : "rgba(100,160,230,0.6)",
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 6,
  },
  headerBtn: {
    borderWidth: 1,
    borderColor: theme.chatPage.headerBtnBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.chatPage.headerBtnBg,
  },
  headerBtnDisabled: {
    opacity: 0.4,
  },
  headerBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.pixel.gold,
  },
  switchBtnText: {
    fontFamily: fonts.silkscreen,
    fontSize: 13,
    color: theme.chatPage.switchText,
    fontWeight: "700" as const,
  },
  headerMeta: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
    marginTop: 2,
  },
  headerDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 3,
    paddingBottom: 3,
  },
  dividerTick: {
    width: 5,
    height: 5,
    borderWidth: 1,
    borderColor: theme.chatPage.dividerTickBorder,
    backgroundColor: "transparent",
    transform: [{ rotate: "45deg" }],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.chatPage.dividerLine,
  },
  list: {
    flex: 1,
    ...(Platform.OS === "web" ? ({ overscrollBehavior: "none" } as any) : {}),
  },
  listContent: {
    paddingVertical: 8,
  },
  newMsgBtn: {
    alignSelf: "flex-start",
    marginLeft: 12,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.chatPage.newMsgBg,
    borderWidth: 1,
    borderColor: theme.blueAccent,
    borderRadius: 14,
    zIndex: 50,
  },
  newMsgText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.blueAccent,
  },
  crtOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  searchOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.bg,
    zIndex: 90,
  },
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.chatPage.searchBarBorder,
    backgroundColor: theme.chatPage.searchBarBg,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.pixel,
    fontSize: 16,
    color: theme.text,
    backgroundColor: theme.chatPage.searchInputBg,
    borderWidth: 1,
    borderColor: theme.chatPage.searchInputBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
  },
  searchClearBtn: {
    paddingHorizontal: 4,
  },
  searchClearText: {
    color: theme.textDim,
    fontSize: 14,
  },
  searchCancelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  searchCancelText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.pixel.gold,
  },
  searchStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 8,
  },
  searchStatusText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.textMuted,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.chatPage.searchResultBorder,
  },
  searchResultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  searchResultSender: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.blueAccent,
  },
  searchResultTime: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.textMuted,
  },
  searchSnippet: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.textDim,
    lineHeight: 18,
  },
  searchHighlight: {
    color: theme.pixel.gold,
    fontFamily: fonts.pixel,
  },
  searchFilterRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.chatPage.searchFilterBorder,
  },
  searchFilterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.chatPage.searchFilterPillBorder,
    backgroundColor: "transparent",
  },
  searchFilterPillActive: {
    borderColor: theme.pixel.gold,
    backgroundColor: theme.chatPage.searchFilterPillActiveBg,
  },
  searchFilterText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
  },
  searchFilterTextActive: {
    color: theme.pixel.gold,
  },
  searchResultSenderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  searchResultBadge: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: theme.blueAccent,
    borderWidth: 1,
    borderColor: theme.chatPage.searchResultBadgeBorder,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  });
}
