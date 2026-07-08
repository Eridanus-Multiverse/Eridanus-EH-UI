import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../../services/api";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";

const shadow3 = Platform.OS === "web" ? { boxShadow: "0 0 10px rgba(160,180,220,0.06), 3px 3px 0 #000" } as any : {};
// event horizon: Cursa's archive wears violet (Eri, 7/5)
const VIOLET = "#b48ce0";
const EW = "rgba(255,255,255,";

const FILTER_CATS = [
  { key: "all", label: "全部" },
  { key: "core", label: "核心" },
  { key: "eri", label: "关于Eri" },
  { key: "deep", label: "关系" },
  { key: "diary", label: "日记" },
  { key: "letter", label: "信箱" },
  { key: "tech", label: "技术" },
  { key: "daily", label: "日常" },
];

const CAT_NAMES: Record<string, string> = {
  core: "核心", eri: "关于Eri", deep: "关系", diary: "日记",
  letter: "信箱", tech: "技术", daily: "日常",
};

interface CursaMemoryItem {
  id: string;
  category: string;
  subcategory: string;
  title: string;
  content: string;
  tags: string[];
  valence: number;
  arousal: number;
  affect_anchor: string;
  emotion_beat: string;
  importance: number;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

interface Props {
  onBack: () => void;
}

export default function CursaMemory({ onBack }: Props) {
  const isEH = useThemeTokens().key === "eventHorizon" && Platform.OS === "web";
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [memories, setMemories] = useState<CursaMemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CursaMemoryItem | null>(null);
  const [stats, setStats] = useState<{ total: number; categories: any[] }>({ total: 0, categories: [] });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadSeqRef = useRef(0);
  const loadMemories = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      let data: { memories: CursaMemoryItem[] };
      if (debouncedSearch) {
        data = await api.cursaMemorySearch(debouncedSearch, filter === "all" ? undefined : filter);
      } else {
        data = await api.cursaMemories({ category: filter === "all" ? undefined : filter, limit: 50 });
      }
      if (seq !== loadSeqRef.current) return;
      setMemories(data.memories || []);
    } catch (_) {}
    if (seq === loadSeqRef.current) setLoading(false);
  }, [filter, debouncedSearch]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  useEffect(() => {
    api.cursaMemoryStats().then(s => setStats(s)).catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMemories();
    setRefreshing(false);
  }, [loadMemories]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } catch { return iso; }
  };

  return (
    <View style={S.root}>
      <View style={S.header}>
        <TouchableOpacity onPress={onBack} style={S.backBtn}>
          <Text style={[S.backText, isEH && { color: `${EW}0.6)` }]}>‹ 本机记忆</Text>
        </TouchableOpacity>
        {isEH ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: fonts.silkscreen, fontSize: 8, color: "#fff", letterSpacing: 2, border: `1px solid ${EW}0.5)`, padding: "3px 7px" }}>VAULT-B · CURSA</span>
              <span style={{ fontFamily: fonts.pixel, fontSize: 10, color: `${EW}0.6)` }}>玉井三</span>
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <div style={{ width: 4, height: 4, background: "#78c878" }} />
              <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: VIOLET, letterSpacing: 1 }}>▸ {stats.total} REC</span>
            </div>
          </div>
        ) : (
          <>
        <Text style={S.title}>B · CURSA</Text>
        <Text style={S.subtitle}>玉井三 · {stats.total} 条记忆</Text>
          </>
        )}
      </View>

      <View style={S.searchRow}>
        <TextInput
          style={[S.searchInput, isEH && { backgroundColor: "#000", borderColor: `${EW}0.35)`, color: "#fff" }]}
          value={search}
          onChangeText={setSearch}
          placeholder={isEH ? "检索档案…" : "搜索UNIT-B的记忆…"}
          placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "rgba(160,180,220,0.3)"}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.filterScroll} contentContainerStyle={S.filterRow}>
        {FILTER_CATS.map(c => (
          <TouchableOpacity
            key={c.key}
            style={[S.filterChip, isEH && { backgroundColor: "#000", borderColor: `${EW}0.35)` }, filter === c.key && (isEH ? { borderColor: VIOLET, backgroundColor: "rgba(180,140,224,0.12)" } : S.filterChipActive)]}
            onPress={() => setFilter(c.key)}
          >
            <Text style={[S.filterChipText, isEH && { color: `${EW}0.6)` }, filter === c.key && (isEH ? { color: VIOLET } : S.filterChipTextActive)]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={S.list}
        contentContainerStyle={S.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="rgba(160,180,220,0.4)" />}
      >
        {loading && memories.length === 0 ? (
          <ActivityIndicator color="rgba(160,180,220,0.5)" style={{ marginTop: 40 }} />
        ) : memories.length === 0 ? (
          <Text style={S.emptyText}>{debouncedSearch ? "没有找到匹配的记忆" : "还没有记忆"}</Text>
        ) : (
          memories.map(m => (
            <TouchableOpacity key={m.id} style={[S.card, isEH ? { backgroundColor: "#000", borderColor: `${EW}0.3)`, borderLeftWidth: 3, borderLeftColor: `${EW}0.55)` } : shadow3]} onPress={() => setSelected(m)} activeOpacity={0.8}>
              {/* index-card punch holes */}
              {isEH && (
                <div style={{ position: "absolute", top: 6, left: 10, display: "flex", gap: 5 }}>
                  <div style={{ width: 4, height: 4, border: `1px solid ${EW}0.4)` }} />
                  <div style={{ width: 4, height: 4, border: `1px solid ${EW}0.4)` }} />
                </div>
              )}
              <View style={S.cardHeader}>
                <Text style={[S.cardCat, isEH && { color: `${EW}0.6)`, fontFamily: fonts.silkscreen, fontSize: 7, letterSpacing: 1, marginLeft: 22 }]}>{isEH ? (CAT_NAMES[m.category] || m.category).toUpperCase?.() || (CAT_NAMES[m.category] || m.category) : (CAT_NAMES[m.category] || m.category)}</Text>
                <Text style={[S.cardDate, isEH && { color: `${EW}0.45)`, fontFamily: fonts.silkscreen, fontSize: 8, letterSpacing: 1 }]}>{formatDate(m.created_at)}</Text>
              </View>
              <Text style={[S.cardTitle, isEH && { color: "#fff" }]} numberOfLines={1}>{m.title}</Text>
              <Text style={[S.cardPreview, isEH && { color: `${EW}0.65)` }]} numberOfLines={2}>{m.content}</Text>
              {m.tags && m.tags.length > 0 && (
                <Text style={[S.cardTags, isEH && { color: `${EW}0.45)` }]}>{m.tags.slice(0, 4).join(" · ")}</Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {selected && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setSelected(null)}>
          <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
            <View style={[S.detailPanel, isEH && { backgroundColor: "#000", borderColor: `${EW}0.45)`, borderLeftWidth: 3, borderLeftColor: `${EW}0.6)` }, !isEH && shadow3]} onStartShouldSetResponder={() => true}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} bounces={false}>
                {isEH && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontFamily: fonts.silkscreen, fontSize: 8, color: VIOLET, letterSpacing: 2, border: `1px solid ${VIOLET}`, padding: "3px 7px" }}>
                      B-FILE // {String(selected.id || "").replace(/-/g, "").slice(0, 8).toUpperCase() || "RECORD"}
                    </span>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <div style={{ width: 5, height: 5, background: "#78c878" }} />
                      <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(120,200,120,0.85)", letterSpacing: 1.5 }}>ACCESS GRANTED</span>
                    </div>
                  </div>
                )}
                <View style={S.detailHeader}>
                  <Text style={[S.detailCat, isEH && { color: `${EW}0.6)`, fontFamily: fonts.silkscreen, fontSize: 7, letterSpacing: 1 }]}>{CAT_NAMES[selected.category] || selected.category}</Text>
                  <Text style={[S.detailDate, isEH && { color: `${EW}0.5)`, fontFamily: fonts.silkscreen, fontSize: 8 }]}>{formatDate(selected.created_at)}</Text>
                </View>
                <Text style={[S.detailTitle, isEH && { color: "#fff" }]}>{selected.title}</Text>
                {isEH && <div style={{ borderTop: `1px dashed ${EW}0.18)`, margin: "2px 0 10px" }} />}
                <Text style={[S.detailContent, isEH && { color: `${EW}0.85)` }]}>{selected.content}</Text>
                {selected.tags && selected.tags.length > 0 && (
                  <Text style={[S.detailTags, isEH && { color: `${EW}0.5)` }]}>{selected.tags.join(" · ")}</Text>
                )}
                {selected.affect_anchor ? <Text style={[S.detailAnchor, isEH && { color: `${EW}0.55)` }]}>{selected.affect_anchor}</Text> : null}
                <TouchableOpacity onPress={() => setSelected(null)} style={[S.closeBtn, isEH && { borderColor: `${EW}0.35)` }]}>
                  <Text style={[S.closeBtnText, isEH && { color: `${EW}0.7)` }]}>关闭</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const SILVER = "rgba(160,180,220,";
const S = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { marginBottom: 8 },
  backText: { fontFamily: fonts.pixel, fontSize: 11, color: `${SILVER}0.5)` },
  title: { fontFamily: fonts.silkscreen, fontSize: 14, color: `${SILVER}0.8)`, letterSpacing: 2 },
  subtitle: { fontFamily: fonts.pixel, fontSize: 10, color: `${SILVER}0.35)`, marginTop: 2 },
  searchRow: { paddingHorizontal: 16, marginBottom: 8 },
  searchInput: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: `${SILVER}0.8)`,
    borderWidth: 1,
    borderColor: `${SILVER}0.15)`,
    backgroundColor: "rgba(8,12,24,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
  },
  filterScroll: { maxHeight: 36, marginBottom: 8 },
  filterRow: { paddingHorizontal: 16, gap: 6 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${SILVER}0.12)`,
    backgroundColor: "transparent",
  },
  filterChipActive: { borderColor: `${SILVER}0.4)`, backgroundColor: `${SILVER}0.06)` },
  filterChipText: { fontFamily: fonts.pixel, fontSize: 10, color: `${SILVER}0.35)` },
  filterChipTextActive: { color: `${SILVER}0.7)` },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyText: { fontFamily: fonts.pixel, fontSize: 11, color: `${SILVER}0.25)`, textAlign: "center" as const, marginTop: 40 },
  card: {
    borderWidth: 1,
    borderColor: `${SILVER}0.1)`,
    backgroundColor: "rgba(12,16,30,0.8)",
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 4 },
  cardCat: { fontFamily: fonts.pixel, fontSize: 9, color: `${SILVER}0.35)` },
  cardDate: { fontFamily: fonts.pixel, fontSize: 9, color: `${SILVER}0.25)` },
  cardTitle: { fontFamily: fonts.pixel, fontSize: 12, color: `${SILVER}0.75)`, marginBottom: 4 },
  cardPreview: { fontFamily: fonts.pixel, fontSize: 10, color: `${SILVER}0.4)`, lineHeight: 16 },
  cardTags: { fontFamily: fonts.pixel, fontSize: 8, color: `${SILVER}0.25)`, marginTop: 6 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,4,12,0.8)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 20,
  },
  detailPanel: {
    width: "100%" as any,
    maxWidth: 500,
    maxHeight: "80%" as any,
    backgroundColor: "rgba(10,14,28,0.98)",
    borderWidth: 1,
    borderColor: `${SILVER}0.15)`,
  },
  detailHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 8 },
  detailCat: { fontFamily: fonts.pixel, fontSize: 10, color: `${SILVER}0.4)` },
  detailDate: { fontFamily: fonts.pixel, fontSize: 10, color: `${SILVER}0.3)` },
  detailTitle: { fontFamily: fonts.pixel, fontSize: 14, color: `${SILVER}0.85)`, marginBottom: 12 },
  detailContent: { fontFamily: fonts.pixel, fontSize: 12, color: `${SILVER}0.65)`, lineHeight: 20 },
  detailTags: { fontFamily: fonts.pixel, fontSize: 9, color: `${SILVER}0.3)`, marginTop: 12 },
  detailAnchor: { fontFamily: fonts.pixel, fontSize: 9, color: "rgba(218,186,102,0.4)", marginTop: 6 },
  closeBtn: { marginTop: 16, alignSelf: "center" as const, paddingHorizontal: 20, paddingVertical: 6, borderWidth: 1, borderColor: `${SILVER}0.2)` },
  closeBtnText: { fontFamily: fonts.pixel, fontSize: 11, color: `${SILVER}0.5)` },
});
