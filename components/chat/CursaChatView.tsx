import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Platform,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import { useWebViewportFit } from "../../hooks/useWebKeyboard";
import { useConnection } from "../../stores/connectionStore";
import { ChatMessage, api } from "../../services/api";
import MessageBubble from "./MessageBubble";
import TimeSeparator from "./TimeSeparator";
import { buildItems, type ListItem } from "./listItems";
import { uuid } from "../../utils/id";
import ThinkingIndicator from "./ThinkingIndicator";
import InputBar from "./InputBar";
import HudHeader from "./HudHeader";
import ThemeBackground from "../decor/ThemeBackground";
import CrtScanlines from "../decor/CrtScanlines";
import ImageLightbox from "./ImageLightbox";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";

const isWeb = Platform.OS === "web";
const POLL_IDLE = 1000;
const POLL_SLOW = 5000;


// 泛化（2026-07-07 压榨清单#3）：assistant 参数化后同一视图承载UNIT-B（cursa）
// 与任意 API 船员（crew:<id>）。默认值保持 cursa，旧调用零变化。
export default function CursaChatView({ onSwitchBack, assistant = "cursa", title }: { onSwitchBack: () => void; assistant?: string; title?: string }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const tabFocused = useIsFocused();
  const containerRef = useRef<View>(null);
  useWebViewportFit(containerRef, insets.bottom);
  const flatListRef = useRef<FlatList>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);
  const lastUserScrollTsRef = useRef(0);
  const messageCountRef = useRef(0);
  const connected = useConnection((state) => state.connected);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);

  const etag = useRef("");
  const initialLoaded = useRef(false);

  // 船员真用量（Eri 点子：EH 装饰 HUD 转正成真仪表）——收到新消息后刷新
  const isCrew = assistant.startsWith("crew:");
  const [crewUsage, setCrewUsage] = useState<{ bars: number[]; calls: number; total_tokens: number; avg_latency_ms: number; cache_hit_rate?: number } | null>(null);
  useEffect(() => {
    if (!isCrew) return;
    let cancelled = false;
    api.gatewayTagUsage(assistant).then((u) => { if (!cancelled) setCrewUsage(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isCrew, assistant, messages.length]);

  // 船员侧边栏（2026-07-07 Eri需求）：每个 API 船员是独立智能体的配置页
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPersona, setDrawerPersona] = useState("");
  const [drawerName, setDrawerName] = useState("");
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerNotice, setDrawerNotice] = useState("");
  // 控制台扩建（2026-07-08 #5）：调参 + 清空并总结（备忘接棒）
  const [drawerTemp, setDrawerTemp] = useState("");
  const [drawerTopP, setDrawerTopP] = useState("");
  const [drawerMaxTokens, setDrawerMaxTokens] = useState("");
  const [drawerMemo, setDrawerMemo] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const crewId = isCrew ? assistant.slice(5) : "";
  const openCrewDrawer = useCallback(async () => {
    setDrawerOpen(true);
    setDrawerNotice("");
    try {
      const r = await api.gatewayCrew();
      const me = (r.crew || []).find((c) => c.id === crewId);
      if (me) {
        setDrawerPersona(me.persona || "");
        setDrawerName(me.name || "");
        setDrawerMemo(me.memo || "");
        try {
          const p = me.params ? JSON.parse(me.params) : {};
          setDrawerTemp(p.temperature !== undefined ? String(p.temperature) : "");
          setDrawerTopP(p.top_p !== undefined ? String(p.top_p) : "");
          setDrawerMaxTokens(p.max_tokens !== undefined ? String(p.max_tokens) : "");
        } catch { /* params 坏了就当没配 */ }
      }
    } catch { setDrawerNotice("加载失败"); }
  }, [crewId]);
  const saveCrewDrawer = useCallback(async () => {
    if (drawerSaving) return;
    setDrawerSaving(true);
    try {
      const params: Record<string, number> = {};
      if (drawerTemp.trim() !== "" && Number.isFinite(Number(drawerTemp))) params.temperature = Number(drawerTemp);
      if (drawerTopP.trim() !== "" && Number.isFinite(Number(drawerTopP))) params.top_p = Number(drawerTopP);
      if (drawerMaxTokens.trim() !== "" && Number.isFinite(Number(drawerMaxTokens))) params.max_tokens = Number(drawerMaxTokens);
      await api.gatewayUpsertCrew({
        id: crewId,
        persona: drawerPersona,
        name: drawerName,
        params: Object.keys(params).length ? JSON.stringify(params) : null,
      } as any);
      setDrawerNotice("已保存，下一条消息生效");
    } catch (e: any) { setDrawerNotice(`保存失败: ${e?.message || e}`); }
    setDrawerSaving(false);
  }, [crewId, drawerPersona, drawerName, drawerSaving, drawerTemp, drawerTopP, drawerMaxTokens]);
  // API 船员没有驻留进程——"重启"的真身就是清空历史注入点，旧对话压成备忘接棒
  const resetCrewContext = useCallback(async () => {
    if (resetBusy) return;
    setResetBusy(true);
    setDrawerNotice("");
    try {
      const r = await api.gatewayCrewReset(crewId);
      setDrawerMemo(r.memo || "");
      setDrawerNotice(`已清空（${r.summarized_messages} 条压进备忘），下一条消息从新开始`);
    } catch (e: any) { setDrawerNotice(`清空失败: ${e?.message || e}`); }
    setResetBusy(false);
  }, [crewId, resetBusy]);

  const items = useMemo(() => buildItems(messages).reverse(), [messages]);

  const scrollToBottom = useCallback((animated = false) => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated });
      isNearBottomRef.current = true;
      scrollFrameRef.current = null;
    });
  }, []);

  useEffect(() => {
    return () => { if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current); };
  }, []);

  // initial load
  useEffect(() => {
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    (async () => {
      try {
        const res = await api.history(new Date().toISOString(), 50, assistant);
        setMessages(res.messages);
        setHasMore(res.messages.length >= 50);
      } catch {}
    })();
  }, []);

  // poll
  useEffect(() => {
    if (!tabFocused || !connected) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const doPoll = async () => {
      try {
        const since = messages.length > 0
          ? messages[messages.length - 1].ts
          : new Date(0).toISOString();
        const res = await api.poll(since, assistant);
        if (cancelled) return;
        if (res.messages.length > 0) {
          etag.current = res.etag;
          setMessages((cur) => {
            const existingIds = new Set(cur.map((m) => m.id));
            const localClientIds = new Set(cur.map((m) => m.client_id).filter(Boolean));
            const fresh = res.messages.filter(
              (m) => !existingIds.has(m.id) && !(m.client_id && localClientIds.has(m.client_id))
            );
            if (fresh.length === 0) return cur;
            const hasAssistant = fresh.some((m) => m.role === "assistant");
            if (hasAssistant) setAwaitingReply(false);
            return [...cur, ...fresh];
          });
        }
      } catch {}
      if (!cancelled) timer = setTimeout(doPoll, awaitingReply ? POLL_IDLE : POLL_SLOW);
    };
    timer = setTimeout(doPoll, POLL_IDLE);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tabFocused, connected, messages.length, awaitingReply]);

  // scroll on new messages
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

  const loadHistory = useCallback(async () => {
    if (!hasMore || loadingHistory || messages.length === 0) return;
    setLoadingHistory(true);
    try {
      const oldest = messages[0];
      const res = await api.history(oldest.ts, 50, assistant);
      if (res.messages.length > 0) {
        setMessages((cur) => {
          const existingIds = new Set(cur.map((m) => m.id));
          const older = res.messages.filter((m) => !existingIds.has(m.id));
          return [...older, ...cur];
        });
      }
      setHasMore(res.messages.length >= 50);
    } catch {}
    setLoadingHistory(false);
  }, [hasMore, loadingHistory, messages]);

  const handleImagePress = useCallback((images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  }, []);

  const handleSend = useCallback(
    async (text: string, attachments?: { id: string; url: string; type: string }[], quotedId?: string) => {
      if (!text.trim()) return;
      const clientId = uuid();
      const optimistic: ChatMessage = {
        id: clientId,
        client_id: clientId,
        role: "user",
        text: text.trim(),
        ts: new Date().toISOString(),
        status: "sending",
        assistant,
        quoted_id: quotedId,
      } as ChatMessage;
      setMessages((cur) => [...cur, optimistic]);
      setQuotedMessage(null);
      setAwaitingReply(true);
      scrollToBottom(false);
      try {
        const attachmentIds = attachments?.map((a) => a.id);
        const res = await api.send(text.trim(), clientId, attachmentIds, quotedId, { assistant });
        setMessages((cur) => {
          if (cur.some((m) => m.id === res.id && m.client_id !== clientId)) {
            // server copy already arrived via poll — retire the optimistic bubble
            return cur.filter((m) => m.client_id !== clientId);
          }
          return cur.map((m) =>
            m.client_id === clientId
              ? { ...m, id: res.id, ts: res.ts || m.ts, status: "sent" }
              : m
          );
        });
      } catch {
        setMessages((cur) =>
          cur.map((m) =>
            m.client_id === clientId ? { ...m, status: "failed" } : m
          )
        );
        setAwaitingReply(false);
      }
    },
    [scrollToBottom]
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "separator") {
        return <TimeSeparator date={item.date} />;
      }
      return (
        <MessageBubble
          message={item.data}
          senderName={title}
          isGroupStart={item.isGroupStart}
          isGroupEnd={item.isGroupEnd}
          onRetry={
            item.data.status === "failed"
              ? () => {
                  const msg = item.data;
                  setMessages((cur) => cur.filter((m) => m.id !== msg.id));
                  handleSend(msg.text);
                }
              : undefined
          }
          onQuote={(_segmentIndex, segmentText) =>
            setQuotedMessage(segmentText ? { ...item.data, text: segmentText } : item.data)
          }
          onImagePress={handleImagePress}
        />
      );
    },
    [handleImagePress, handleSend]
  );

  const keyExtractor = useCallback(
    (item: ListItem) =>
      item.type === "separator" ? `sep-${item.date}` : (item.data.client_id || item.data.id),
    []
  );

  return (
    <View ref={containerRef} style={styles.container}>
      {theme.key === "eventHorizon" ? (
        <ThemeBackground orbitSlot="none" scene="cursa" />
      ) : (
        <ThemeBackground orbitSlot="static-left-cursa" />
      )}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        {theme.key === "eventHorizon" ? (
          <View style={styles.headerScanline}>
            <View style={{ width: 4, height: 4, backgroundColor: connected ? "rgba(120,200,120,0.8)" : "rgba(200,80,80,0.8)" }} />
            <Text style={[styles.scanlineText, { color: "rgba(255,255,255,0.3)", letterSpacing: 2 }]}>SYS-DEMO</Text>
            <View style={styles.scanlineFill} />
            <Text style={[styles.scanlineText, { color: "rgba(255,255,255,0.2)", letterSpacing: 2 }]}>SEC_CHANNEL // B ERI</Text>
          </View>
        ) : (
          <View style={styles.headerScanline}>
            <Text style={styles.scanlineText}>SYS</Text>
            <View style={[styles.scanlineDot, connected && styles.scanlineDotOn]} />
            <Text style={styles.scanlineText}>{connected ? "LINKED" : "STANDBY"}</Text>
            <View style={styles.scanlineFill} />
            <Text style={styles.scanlineText}>{title ? `API · ${title.toUpperCase()}` : "B ERI · CURSA"}</Text>
          </View>
        )}
        <View style={styles.headerMain}>
          <View style={styles.headerTitleRow}>
            {isCrew && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onSwitchBack}
                style={[
                  styles.headerBtn,
                  { marginRight: 8 },
                  theme.key === "eventHorizon" && { borderRadius: 0, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(16,16,18,0.9)" },
                ]}
              >
                <Text style={styles.switchBtnText}>‹</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitle}>{title || "Cursa"}</Text>
            {theme.key !== "eventHorizon" && !isCrew && <Text style={{ fontSize: 14 }}>🐈‍⬛</Text>}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={isCrew ? () => openCrewDrawer() : onSwitchBack}
              style={[
                styles.headerBtn,
                theme.key === "eventHorizon" && { borderRadius: 0, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(16,16,18,0.9)" },
              ]}
            >
              <Text style={styles.switchBtnText}>{isCrew ? "☰" : "A"}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {theme.key !== "eventHorizon" && (
          <View style={styles.headerDivider}>
            <View style={styles.dividerTick} />
            <View style={styles.dividerLine} />
            <View style={styles.dividerTick} />
          </View>
        )}
      </View>
      <HudHeader connected={connected} variant="cursa" crewUsage={crewUsage} crewName={title} />

      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={awaitingReply ? () => <ThinkingIndicator forceShow variant="cursa" /> : null}
        inverted
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onEndReached={loadHistory}
        onEndReachedThreshold={0.15}
        onScroll={handleScroll}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({
            offset: Math.max(0, info.averageItemLength * info.index),
            animated: true,
          });
        }}
        scrollEventThrottle={80}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={11}
        removeClippedSubviews={!isWeb}
      />

      {unreadBelow > 0 && (
        <TouchableOpacity
          style={styles.newMsgBtn}
          onPress={handleScrollToNewest}
          activeOpacity={0.8}
        >
          <Text style={styles.newMsgText}>↓ {unreadBelow} 条新消息</Text>
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
          onClose={() => setLightboxImages(null)}
        />
      )}
      {/* 船员配置抽屉（2026-07-07）：人设指令 + 智能体设置，双主题 */}
      {drawerOpen && (() => {
        const eh = theme.key === "eventHorizon";
        const border = eh ? "rgba(255,255,255,0.2)" : "rgba(120,160,220,0.3)";
        const textC = eh ? "rgba(255,255,255,0.85)" : "rgba(210,222,240,0.9)";
        const dimC = eh ? "rgba(255,255,255,0.45)" : "rgba(160,180,210,0.6)";
        return (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setDrawerOpen(false)}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, flexDirection: "row", justifyContent: "flex-end" }}
          >
            <View
              onStartShouldSetResponder={() => true}
              style={{ width: "86%", maxWidth: 420, height: "100%", backgroundColor: eh ? "rgba(0,0,0,0.98)" : "rgba(8,12,26,0.98)", borderLeftWidth: 1, borderLeftColor: border, padding: 16, paddingTop: insets.top + 16 }}
            >
              <Text style={{ fontFamily: fonts.pixel, fontSize: 13, color: textC, letterSpacing: 1, marginBottom: 4 }}>◆ {drawerName || title} · 智能体控制台</Text>
              {drawerNotice ? <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: eh ? "#78c878" : "#7cc7a0", marginBottom: 4 }}>{drawerNotice}</Text> : null}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: dimC, letterSpacing: 2, marginTop: 10, marginBottom: 6 }}>名字</Text>
                <TextInput
                  value={drawerName}
                  onChangeText={setDrawerName}
                  style={{ borderWidth: 1, borderColor: border, borderRadius: eh ? 0 : 6, color: textC, fontFamily: fonts.pixel, fontSize: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.04)" }}
                />
                <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: dimC, letterSpacing: 2, marginTop: 14, marginBottom: 6 }}>人设指令</Text>
                <TextInput
                  value={drawerPersona}
                  onChangeText={setDrawerPersona}
                  multiline
                  style={{ minHeight: 150, maxHeight: 220, borderWidth: 1, borderColor: border, borderRadius: eh ? 0 : 6, color: textC, fontFamily: fonts.pixel, fontSize: 12, lineHeight: 18, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.04)", textAlignVertical: "top" }}
                />
                <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: dimC, letterSpacing: 2, marginTop: 14, marginBottom: 6 }}>参数调节 · 留空用默认</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {([
                    { label: "温度 0~2", value: drawerTemp, set: setDrawerTemp, ph: "0.8" },
                    { label: "top_p", value: drawerTopP, set: setDrawerTopP, ph: "1.0" },
                    { label: "回复上限", value: drawerMaxTokens, set: setDrawerMaxTokens, ph: "2048" },
                  ] as const).map((f) => (
                    <View key={f.label} style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 9, color: dimC, marginBottom: 4 }}>{f.label}</Text>
                      <TextInput
                        value={f.value}
                        onChangeText={f.set}
                        placeholder={f.ph}
                        placeholderTextColor={eh ? "rgba(255,255,255,0.25)" : "rgba(160,180,210,0.4)"}
                        keyboardType="decimal-pad"
                        style={{ borderWidth: 1, borderColor: border, borderRadius: eh ? 0 : 6, color: textC, fontFamily: fonts.pixel, fontSize: 12, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.04)", textAlign: "center" }}
                      />
                    </View>
                  ))}
                </View>
                <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: dimC, letterSpacing: 2, marginTop: 16, marginBottom: 6 }}>上下文</Text>
                <TouchableOpacity
                  onPress={resetCrewContext}
                  disabled={resetBusy}
                  style={{ alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: eh ? "rgba(230,180,80,0.5)" : "rgba(230,180,80,0.45)", backgroundColor: "rgba(230,180,80,0.08)", borderRadius: eh ? 0 : 6, opacity: resetBusy ? 0.5 : 1 }}
                >
                  <Text style={{ fontFamily: fonts.pixel, fontSize: 12, color: "#e6b450" }}>{resetBusy ? "总结中…" : "♻ 清空并总结"}</Text>
                </TouchableOpacity>
                <Text style={{ fontFamily: fonts.pixel, fontSize: 9, color: dimC, marginTop: 6, lineHeight: 14 }}>
                  把当前对话压缩成备忘录后从头开始——船员没有驻留进程，这就是他的"重启"。备忘会一直带在身上。
                </Text>
                {drawerMemo ? (
                  <>
                    <Text style={{ fontFamily: fonts.pixel, fontSize: 10, color: dimC, letterSpacing: 2, marginTop: 14, marginBottom: 6 }}>随身备忘录</Text>
                    <View style={{ borderWidth: 1, borderColor: border, borderRadius: eh ? 0 : 6, padding: 10, backgroundColor: "rgba(255,255,255,0.03)" }}>
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 11, color: textC, lineHeight: 17 }}>{drawerMemo}</Text>
                    </View>
                  </>
                ) : null}
              </ScrollView>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12, marginBottom: insets.bottom + 8 }}>
                <TouchableOpacity
                  onPress={saveCrewDrawer}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: eh ? "rgba(255,255,255,0.5)" : "rgba(120,200,150,0.5)", backgroundColor: eh ? "rgba(255,255,255,0.08)" : "rgba(120,200,150,0.12)", borderRadius: eh ? 0 : 6 }}
                >
                  <Text style={{ fontFamily: fonts.pixel, fontSize: 12, color: eh ? "#fff" : "#9fdcb8" }}>{drawerSaving ? "保存中…" : "保存"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDrawerOpen(false)} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                  <Text style={{ fontFamily: fonts.pixel, fontSize: 12, color: dimC }}>关闭</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        );
      })()}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: { backgroundColor: theme.bg, paddingHorizontal: 16, paddingBottom: 0 },
  headerScanline: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 2, paddingHorizontal: 2,
  },
  scanlineText: {
    fontFamily: fonts.pixel, fontSize: 7,
    color: theme.cursaChat.scanlineText, letterSpacing: 1,
  },
  scanlineDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: theme.cursaChat.scanlineDot,
  },
  scanlineDotOn: { backgroundColor: theme.success },
  scanlineFill: { flex: 1 },
  headerMain: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingVertical: 2,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: {
    fontFamily: fonts.silkscreen, fontSize: 20, color: theme.cursaChat.tone,
    ...(isWeb ? {
      textShadow: theme.cursaChat.titleShadowWeb,
    } as any : {
      textShadowColor: theme.cursaChat.titleShadowNative,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    }),
  },
  headerActions: { flexDirection: "row", gap: 6 },
  headerBtn: {
    borderWidth: 1, borderColor: theme.cursaChat.headerBtnBorder,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: theme.cursaChat.headerBtnBg,
  },
  switchBtnText: {
    fontFamily: fonts.silkscreen, fontSize: 13,
    color: theme.pixel.gold, fontWeight: "700" as const,
  },
  headerDivider: {
    flexDirection: "row", alignItems: "center",
    paddingTop: 3, paddingBottom: 3,
  },
  dividerTick: {
    width: 5, height: 5, borderWidth: 1,
    borderColor: theme.cursaChat.dividerTickBorder,
    backgroundColor: "transparent",
    transform: [{ rotate: "45deg" }],
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.cursaChat.dividerLine },
  list: {
    flex: 1,
    ...(isWeb ? { overscrollBehavior: "none" } as any : {}),
  },
  listContent: { paddingVertical: 8 },
  newMsgBtn: {
    alignSelf: "flex-start", marginLeft: 12, marginBottom: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: theme.cursaChat.newMsgBg,
    borderWidth: 1, borderColor: theme.cursaChat.tone, borderRadius: 14, zIndex: 50,
  },
  newMsgText: { fontFamily: fonts.pixel, fontSize: 11, color: theme.cursaChat.tone },
  crtOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
  },
});
}
