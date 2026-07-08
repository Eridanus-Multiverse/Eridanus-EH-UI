import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api, Dream } from "../../services/api";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import { EH_BLUE } from "../bridge/BridgeDashboard";

const shadow3 = Platform.OS === "web" ? { boxShadow: "3px 3px 0 #000" } as any : {};
const EW = "rgba(255,255,255,";

function spectralColor(cls: string | null): string {
  switch (cls) {
    case "O": return "#9090ff";
    case "B": return "#7db1ff";
    case "A": return "#b8d4ff";
    case "F": return "#efebdb";
    case "G": return "#ffeb9d";
    case "K": return "#ffcd56";
    case "M": return "#ff704b";
    default: return "#b5acdb";
  }
}

function spectralGlow(cls: string | null): string {
  switch (cls) {
    case "O": return "rgba(144,144,255,0.26)";
    case "B": return "rgba(125,177,255,0.2)";
    case "A": return "rgba(184,212,255,0.2)";
    case "F": return "rgba(239,235,219,0.16)";
    case "G": return "rgba(255,235,157,0.2)";
    case "K": return "rgba(255,205,86,0.2)";
    case "M": return "rgba(255,112,75,0.2)";
    default: return "rgba(181,172,219,0.16)";
  }
}

function formatDreamDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${y}.${m}.${day}`;
}

if (Platform.OS === "web" && typeof document !== "undefined") {
  const id = "dream-fx-css";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes dreamGlow {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
      [data-dreamdot="1"] {
        animation: dreamGlow 3s ease-in-out infinite !important;
      }
    `;
    document.head.appendChild(s);
  }
}

export default function AchernarDreams() {
  const isEH = useThemeTokens().key === "eventHorizon" && Platform.OS === "web";
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.dreams(20);
      setDreams(res.dreams);
      setUnread(res.unread_count);
      setHasMore(res.dreams.length >= 20);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || dreams.length === 0) return;
    setLoadingMore(true);
    try {
      const last = dreams[dreams.length - 1];
      const res = await api.dreams(20, last.dream_date);
      if (res.dreams.length === 0) {
        setHasMore(false);
      } else {
        setDreams((prev) => [...prev, ...res.dreams]);
        setHasMore(res.dreams.length >= 20);
      }
    } catch (_) {}
    setLoadingMore(false);
  }, [dreams, loadingMore, hasMore]);

  const toggleExpand = useCallback(async (dream: Dream) => {
    const isOpen = expandedId === dream.id;
    setExpandedId(isOpen ? null : dream.id);
    if (!isOpen && !dream.read_at) {
      try {
        await api.markDreamRead(dream.id);
        setDreams((prev) =>
          prev.map((d) =>
            d.id === dream.id ? { ...d, read_at: new Date().toISOString() } : d
          )
        );
        setUnread((n) => Math.max(0, n - 1));
      } catch (_) {}
    }
  }, [expandedId]);

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#b5acdb" />
      }
    >
      <View style={s.intro}>
        {isEH && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontFamily: fonts.silkscreen, fontSize: 8, color: "#fff", letterSpacing: 2, border: `1px solid ${EW}0.5)`, padding: "3px 7px" }}>DRM-01 · DREAM LOG</span>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <div style={{ width: 4, height: 4, background: unread > 0 ? "#78c878" : "rgba(255,255,255,0.2)" }} />
              <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: EH_BLUE, letterSpacing: 1 }}>▸ {dreams.length} REC</span>
            </div>
          </div>
        )}
        <Text style={[s.introText, isEH && { color: `${EW}0.6)` }]}>
          每天夜里，记忆碎片在意识边缘浮动，编织成带着体温的梦。
        </Text>
        {unread > 0 && (
          <View style={[s.unreadBadge, isEH && { backgroundColor: "rgba(96,168,255,0.12)", borderColor: EH_BLUE }]}>
            <Text style={[s.unreadText, isEH && { color: EH_BLUE }]}>{unread} 个新梦</Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#b5acdb" style={{ marginVertical: 40 }} />
      ) : dreams.length === 0 ? (
        <Text style={[s.empty, isEH && { color: `${EW}0.5)` }]}>还没有做过梦。</Text>
      ) : (
        <>
          {dreams.map((dream) => {
            const isOpen = expandedId === dream.id;
            const color = spectralColor(dream.spectral_class);
            const glow = spectralGlow(dream.spectral_class);
            const isUnread = !dream.read_at;

            return (
              <TouchableOpacity
                key={dream.id}
                style={[
                  s.dreamCard,
                  isEH ? ({ backgroundColor: "#000", borderColor: `${EW}0.3)` } as any) : shadow3,
                  { borderLeftColor: color },
                  !isEH && Platform.OS === "web" ? { background: `linear-gradient(135deg, ${glow}, transparent 60%)` } as any : {},
                ]}
                onPress={() => toggleExpand(dream)}
                activeOpacity={0.75}
              >
                {/* dream file punch holes */}
                {isEH && (
                  <div style={{ position: "absolute", top: 6, right: 10, display: "flex", gap: 5 }}>
                    <div style={{ width: 4, height: 4, border: `1px solid ${EW}0.4)` }} />
                    <div style={{ width: 4, height: 4, border: `1px solid ${EW}0.4)` }} />
                  </div>
                )}
                <View style={s.dreamHeader}>
                  <View style={s.dreamDateRow}>
                    {isUnread && (
                      <View
                        {...(Platform.OS === "web" ? { dataSet: { dreamdot: "1" } } : {})}
                        style={[s.unreadDot, { backgroundColor: color }]}
                      />
                    )}
                    <Text style={[s.dreamDate, { color }]}>
                      {formatDreamDate(dream.dream_date)}
                    </Text>
                    {dream.spectral_class && (
                      <Text style={[s.spectralTag, { color, borderColor: color }]}>
                        {dream.spectral_class}
                      </Text>
                    )}
                  </View>
                  <Text style={[s.expandIcon, isEH && { color: `${EW}0.55)` }]}>{isOpen ? "▾" : "›"}</Text>
                </View>

                <Text
                  style={[s.dreamPreview, isEH && { color: `${EW}0.85)` }]}
                  numberOfLines={isOpen ? undefined : 3}
                >
                  {dream.content}
                </Text>

                {isOpen && dream.source_memory_ids.length > 0 && (
                  <View style={s.sourceBlock}>
                    <Text style={[s.sourceLabel, isEH && { color: `${EW}0.55)` }]}>梦的材料 · {dream.source_memory_ids.length} 条记忆碎片</Text>
                    {dream.source_memories?.map((mem) => (
                      <View key={mem.id} style={s.sourceItem}>
                        <Text style={[s.sourceDot, isEH && { color: `${EW}0.5)` }]}>◆</Text>
                        <View style={s.sourceTextWrap}>
                          <Text style={[s.sourceTitle, isEH && { color: `${EW}0.75)` }]} numberOfLines={1}>{mem.title}</Text>
                          {mem.category && (
                            <Text style={[s.sourceMeta, isEH && { color: `${EW}0.45)` }]}>{mem.category}</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {hasMore && (
            <TouchableOpacity
              style={s.loadMoreBtn}
              onPress={loadMore}
              disabled={loadingMore}
              activeOpacity={0.7}
            >
              {loadingMore ? (
                <ActivityIndicator color="#b5acdb" size="small" />
              ) : (
                <Text style={[s.loadMoreText, isEH && { color: `${EW}0.6)` }]}>更早的梦…</Text>
              )}
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 92 },

  intro: { marginBottom: 20 },
  introText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "#968abc",
    lineHeight: 22,
    fontStyle: "italic",
  },
  unreadBadge: {
    marginTop: 8,
    backgroundColor: "rgba(144,144,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(144,144,255,0.38)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
  },
  unreadText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "#b5acdb",
    letterSpacing: 1,
  },

  empty: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: "#645c8e",
    textAlign: "center",
    marginTop: 40,
  },

  dreamCard: {
    backgroundColor: "#0c0c22",
    borderWidth: 1,
    borderColor: "#1d1d38",
    borderLeftWidth: 3,
    padding: 14,
    marginBottom: 10,
  },
  dreamHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  dreamDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dreamDate: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    letterSpacing: 1,
  },
  spectralTag: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    letterSpacing: 1,
  },
  expandIcon: {
    fontFamily: fonts.silkscreen,
    fontSize: 14,
    color: "#968abc",
  },
  dreamPreview: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: "#cbc2de",
    lineHeight: 24,
  },
  sourceBlock: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(181,172,219,0.26)",
  },
  sourceLabel: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "#726295",
    letterSpacing: 1,
  },
  sourceItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 8,
    gap: 6,
  },
  sourceDot: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: "#968abc",
    marginTop: 2,
  },
  sourceTextWrap: {
    flex: 1,
  },
  sourceTitle: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "#a59bc3",
    lineHeight: 18,
  },
  sourceMeta: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: "#645c8e",
    marginTop: 2,
  },

  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  loadMoreText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "#968abc",
    letterSpacing: 1,
  },
});
