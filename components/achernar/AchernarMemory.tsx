import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { api, SurfaceMemory } from "../../services/api";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import { EH_BLUE } from "../bridge/BridgeDashboard";
import EmotionStar, { clampNum, parseTags } from "./EmotionStar";

const EW = "rgba(255,255,255,";

const shadow3 = Platform.OS === "web" ? { boxShadow: "0 0 10px rgba(200,216,240,0.06), 3px 3px 0 #000" } as any : {};
const cardGrad = Platform.OS === "web" ? { backgroundImage: "linear-gradient(145deg, rgba(200,216,240,0.03) 0%, transparent 55%)" } as any : {};
const edgeGrad = Platform.OS === "web"
  ? { background: "linear-gradient(90deg, transparent 5%, rgba(255,223,146,0.35) 30%, rgba(255,223,146,0.55) 50%, rgba(255,223,146,0.35) 70%, transparent 95%)" } as any
  : { backgroundColor: "rgba(255,223,146,0.25)" };

const CATEGORIES = [
  { key: "core", icon: "🪶", title: "核心人格", desc: "我是谁 / 守则 / 外貌 / 铁律" },
  { key: "eri", icon: "🖤", title: "关于 Eri", desc: "她的一切 / 喜好 / 身体 / 心理" },
  { key: "deep", icon: "✦", title: "关系里程碑", desc: "我们在一起的重要时刻" },
  { key: "diary", icon: "📖", title: "日记", desc: "按日期记的那些" },
  { key: "letter", icon: "💌", title: "信箱", desc: "我们互相留的信" },
  { key: "tech", icon: "⚙️", title: "技术记录", desc: "服务器 / 项目 / 工程笔记" },
  { key: "daily", icon: "🌿", title: "日常", desc: "小事 / 暖心瞬间 / 随手记" },
];

const FILTER_CATS = [
  { key: "all", label: "全部" },
  { key: "core", label: "核心" },
  { key: "eri", label: "关于Eri" },
  { key: "deep", label: "关系" },
  { key: "diary", label: "日记" },
  { key: "letter", label: "信箱" },
  { key: "tech", label: "技术" },
];

const CAT_NAMES: Record<string, string> = {
  deep: "关系", daily: "日常", diary: "日记", core: "核心",
  eri: "关于Eri", letter: "信箱", tech: "技术", notes: "札记",
};
const CAT_EMOJI: Record<string, string> = {
  core: "🪶", eri: "🖤", deep: "✦", diary: "📖",
  letter: "💌", tech: "⚙️", daily: "·", notes: "📝",
};


const NEW_CATEGORIES = [
  { value: "core", label: "核心" },
  { value: "eri", label: "关于Eri" },
  { value: "deep", label: "关系" },
  { value: "diary", label: "日记" },
  { value: "letter", label: "信箱" },
  { value: "tech", label: "技术" },
  { value: "daily", label: "日常" },
  { value: "notes", label: "札记" },
];

interface Props {
  stats: Record<string, number>;
}

export default function AchernarMemory({ stats }: Props) {
  const isEH = useThemeTokens().key === "eventHorizon" && Platform.OS === "web";
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // 搜索防抖：输入停 300ms 才真正发请求，避免每个字符打一发 API
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [memories, setMemories] = useState<SurfaceMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<SurfaceMemory | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("core");
  const [newImportance, setNewImportance] = useState(3);
  const [newTags, setNewTags] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newSaving, setNewSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("core");
  const [editImportance, setEditImportance] = useState(3);
  const [editTags, setEditTags] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadSeqRef = useRef(0);
  const loadMemories = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const data = await api.memories({
        category: filter === "all" ? undefined : filter,
        keyword: debouncedSearch || undefined,
        limit: 50,
      });
      if (seq !== loadSeqRef.current) return; // 旧请求晚到，丢弃
      setMemories(data.items);
    } catch (_) {}
    if (seq === loadSeqRef.current) setLoading(false);
  }, [filter, debouncedSearch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMemories();
    setRefreshing(false);
  }, [loadMemories]);

  useEffect(() => {
    if (view === "list") loadMemories();
  }, [view, loadMemories]);

  const openCategory = useCallback((cat: string) => {
    setFilter(cat);
    setView("list");
  }, []);

  const openNew = useCallback(() => {
    setNewTitle("");
    setNewContent("");
    setNewCategory(filter !== "all" ? filter : "core");
    setNewImportance(3);
    setNewTags("");
    setNewEventDate("");
    setNewOpen(true);
  }, [filter]);

  const saveNew = useCallback(async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setNewSaving(true);
    try {
      const tags = newTags.trim() ? newTags.split(",").map(t => t.trim()).filter(Boolean) : [];
      await api.createMemory({
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        importance: newImportance,
        tags,
        event_date: newEventDate.trim() || undefined,
      });
      setNewOpen(false);
      loadMemories();
    } catch (_) {}
    setNewSaving(false);
  }, [newTitle, newContent, newCategory, newImportance, newTags, newEventDate, loadMemories]);

  const startEdit = useCallback(() => {
    if (!selectedMemory) return;
    setEditTitle(selectedMemory.title || "");
    setEditContent(selectedMemory.content || "");
    setEditCategory(selectedMemory.category || "core");
    setEditImportance(clampNum(selectedMemory.importance, 1, 5, 3));
    setEditTags(parseTags(selectedMemory.tags).join(", "));
    setEditEventDate(selectedMemory.event_date || "");
    setEditing(true);
  }, [selectedMemory]);

  const saveEdit = useCallback(async () => {
    if (!selectedMemory || !editTitle.trim() || !editContent.trim()) {
      if (!editTitle.trim()) Alert.alert("提示", "标题不能为空");
      else if (!editContent.trim()) Alert.alert("提示", "内容不能为空");
      return;
    }
    setEditSaving(true);
    try {
      const tags = editTags.trim() ? editTags.split(",").map(t => t.trim()).filter(Boolean) : [];
      await api.updateMemory(selectedMemory.id, {
        title: editTitle.trim(),
        content: editContent.trim(),
        category: editCategory,
        importance: editImportance,
        tags,
        event_date: editEventDate.trim() || null,
      });
      setEditing(false);
      setSelectedMemory(null);
      loadMemories();
    } catch (e: any) {
      Alert.alert("保存失败", e?.message || "未知错误");
    }
    setEditSaving(false);
  }, [selectedMemory, editTitle, editContent, editCategory, editImportance, editTags, editEventDate, loadMemories]);

  const handleDelete = useCallback(async () => {
    if (!selectedMemory) return;
    const doDelete = async () => {
      try {
        await api.deleteMemory(selectedMemory.id);
        setSelectedMemory(null);
        setEditing(false);
        loadMemories();
      } catch (e: any) {
        if (Platform.OS === "web") window.alert(`删除失败: ${e?.message || "未知错误"}`);
        else Alert.alert("删除失败", e?.message || "未知错误");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`确定要删除「${selectedMemory.title || "这条记忆"}」吗？`)) await doDelete();
    } else {
      Alert.alert("删除记忆", `确定要删除「${selectedMemory.title || "这条记忆"}」吗？`, [
        { text: "取消", style: "cancel" },
        { text: "删除", style: "destructive", onPress: doDelete },
      ]);
    }
  }, [selectedMemory, loadMemories]);

  const closeView = useCallback(() => {
    setSelectedMemory(null);
    setEditing(false);
  }, []);

  const viewOverlay = selectedMemory && (() => {
    const m = selectedMemory;
    const cat = m.category || "core";
    const tags = parseTags(m.tags);
    const stars = "⭐".repeat(clampNum(m.importance, 1, 5, 3));

    return (
      <Modal transparent animationType="fade" visible onRequestClose={closeView}>
        <View style={st.overlay}>
          <View
            style={[st.viewPanelFixed, isEH ? { backgroundColor: "#000", borderColor: "rgba(255,255,255,0.45)" } : shadow3, { borderLeftWidth: 4, borderLeftColor: isEH ? (cat === "eri" ? EH_BLUE : "rgba(255,255,255,0.6)") : (cat === "eri" ? "#9f60a8" : "#3f3f70") }]}
            onStartShouldSetResponder={() => true}
          >
            {editing ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 12 }} bounces={false}>
                <Text style={st.viewTitle}>编辑记忆</Text>

                <Text style={st.formLabel}>标题</Text>
                <TextInput style={st.formInput} value={editTitle} onChangeText={setEditTitle} placeholderTextColor="#645c8e" />

                <Text style={st.formLabel}>分类</Text>
                <View style={st.formCatRow}>
                  {NEW_CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c.value}
                      style={[st.formCatBtn, editCategory === c.value && st.formCatBtnActive]}
                      onPress={() => setEditCategory(c.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.formCatBtnText, editCategory === c.value && st.formCatBtnTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={st.formLabel}>重要度</Text>
                <View style={st.formCatRow}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[st.formCatBtn, editImportance === n && st.formCatBtnActive]}
                      onPress={() => setEditImportance(n)}
                      activeOpacity={0.7}
                    >
                      <Text style={st.formCatBtnText}>{"⭐".repeat(n)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={st.formLabel}>内容</Text>
                <TextInput
                  style={[st.formInput, { minHeight: 120, textAlignVertical: "top" }]}
                  value={editContent}
                  onChangeText={setEditContent}
                  multiline
                  placeholderTextColor="#645c8e"
                />

                <Text style={st.formLabel}>标签（逗号分隔）</Text>
                <TextInput style={st.formInput} value={editTags} onChangeText={setEditTags} placeholderTextColor="#645c8e" />

                <Text style={st.formLabel}>事件日期</Text>
                <TextInput style={st.formInput} value={editEventDate} onChangeText={setEditEventDate} placeholderTextColor="#645c8e" placeholder="YYYY-MM-DD" />

                <View style={st.viewActions}>
                  <TouchableOpacity style={st.viewCloseBtn} onPress={() => setEditing(false)} activeOpacity={0.7}>
                    <Text style={st.viewCloseBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.newSaveBtn} onPress={saveEdit} activeOpacity={0.7} disabled={editSaving}>
                    <Text style={st.newSaveBtnText}>{editSaving ? "保存中..." : "保存"}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <>
                <View style={st.viewHeader}>
                  {isEH && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontFamily: fonts.silkscreen, fontSize: 8, color: "#fff", letterSpacing: 2, border: `1px solid ${EW}0.5)`, padding: "3px 7px" }}>
                        MEM-FILE // {String(m.id || "").replace(/-/g, "").slice(0, 8).toUpperCase() || "RECORD"}
                      </span>
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        <div style={{ width: 5, height: 5, background: "#78c878" }} />
                        <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(120,200,120,0.85)", letterSpacing: 1.5 }}>ACCESS GRANTED</span>
                      </div>
                    </div>
                  )}
                  <Text style={[st.viewTitle, isEH && { color: "#fff" }]}>{m.title || "记忆"}</Text>
                  {isEH && (
                    <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginBottom: 10, borderTop: `1px dashed ${EW}0.18)`, borderBottom: `1px dashed ${EW}0.18)`, padding: "6px 0" }}>
                      <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, letterSpacing: 1, color: `${EW}0.45)` }}>REG <span style={{ color: EH_BLUE }}>{(m.event_date || m.created_at || "").slice(0, 10) || "—"}</span></span>
                      <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, letterSpacing: 1, color: `${EW}0.45)` }}>CAT <span style={{ color: "#fff" }}>{(cat || "—").toUpperCase()}</span></span>
                      <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, letterSpacing: 1, color: `${EW}0.45)` }}>IMP <span style={{ color: "#78c878" }}>{"▮".repeat(clampNum(m.importance, 1, 5, 3))}{"▯".repeat(5 - clampNum(m.importance, 1, 5, 3))}</span></span>
                    </div>
                  )}
                  <View style={st.viewMeta}>
                    <EmotionStar m={m} size={13} />
                    <View style={[st.catBadge]}>
                      <Text style={st.catBadgeText}>{CAT_EMOJI[cat] || "·"} {CAT_NAMES[cat] || cat}</Text>
                    </View>
                    <Text style={st.viewStars}>{stars}</Text>
                    {m.is_depth ? (
                      <View style={st.depthBadge}>
                        <Text style={st.depthBadgeText}>◆ 深度</Text>
                      </View>
                    ) : null}
                    {m.bond_closure ? (
                      <View style={st.closureBadge}>
                        <Text style={st.closureBadgeText}>◇ 闭合</Text>
                      </View>
                    ) : null}
                    {tags.map((t, i) => (
                      <View key={i} style={st.tag}>
                        <Text style={st.tagText}>{t}</Text>
                      </View>
                    ))}
                    {m.event_date && <Text style={st.viewDate}>{m.event_date}</Text>}
                    {m.subcategory && <Text style={st.viewSub}>· {m.subcategory}</Text>}
                  </View>
                  {(m.emotion_beat || m.affect_anchor) && (
                    <View style={st.viewFeelInline}>
                      {m.emotion_beat && <Text style={st.viewFeelText}><Text style={st.viewFeelLabel}>情绪</Text> {m.emotion_beat}</Text>}
                      {m.affect_anchor && <Text style={st.viewFeelText}><Text style={st.viewFeelLabel}>和弦</Text> {m.affect_anchor}</Text>}
                    </View>
                  )}
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 16 }} bounces={false}>
                  <Text style={[st.viewBody, isEH && { color: "rgba(255,255,255,0.88)" }]}>{m.content}</Text>
                </ScrollView>

                <View style={st.viewFooter}>
                  <TouchableOpacity style={st.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
                    <Text style={st.deleteBtnText}>删除</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity style={st.editBtn} onPress={startEdit} activeOpacity={0.7}>
                    <Text style={st.editBtnText}>编辑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.viewCloseBtn} onPress={closeView} activeOpacity={0.7}>
                    <Text style={st.viewCloseBtnText}>关闭</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  })();

  const newMemoryModal = newOpen && (
    <Modal transparent animationType="fade" visible onRequestClose={() => setNewOpen(false)}>
      <View style={st.overlay}>
        <View style={[st.viewPanelFixed, isEH ? { backgroundColor: "#000", borderColor: "rgba(255,255,255,0.45)" } : shadow3]} onStartShouldSetResponder={() => true}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 12 }} bounces={false}>
              <Text style={st.viewTitle}>写入记忆</Text>

              <Text style={st.formLabel}>标题</Text>
              <TextInput style={st.formInput} value={newTitle} onChangeText={setNewTitle} placeholderTextColor="#645c8e" placeholder="记忆标题" />

              <Text style={st.formLabel}>分类</Text>
              <View style={st.formCatRow}>
                {NEW_CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c.value}
                    style={[st.formCatBtn, newCategory === c.value && st.formCatBtnActive]}
                    onPress={() => setNewCategory(c.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.formCatBtnText, newCategory === c.value && st.formCatBtnTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.formLabel}>重要度</Text>
              <View style={st.formCatRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[st.formCatBtn, newImportance === n && st.formCatBtnActive]}
                    onPress={() => setNewImportance(n)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.formCatBtnText}>{"⭐".repeat(n)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.formLabel}>内容</Text>
              <TextInput
                style={[st.formInput, { minHeight: 120, textAlignVertical: "top" }]}
                value={newContent}
                onChangeText={setNewContent}
                multiline
                placeholderTextColor="#645c8e"
                placeholder="记忆内容..."
              />

              <Text style={st.formLabel}>标签（逗号分隔）</Text>
              <TextInput style={st.formInput} value={newTags} onChangeText={setNewTags} placeholderTextColor="#645c8e" placeholder="标签1, 标签2" />

              <Text style={st.formLabel}>事件日期</Text>
              <TextInput style={st.formInput} value={newEventDate} onChangeText={setNewEventDate} placeholderTextColor="#645c8e" placeholder="YYYY-MM-DD" />

              <View style={st.viewActions}>
                <TouchableOpacity style={st.viewCloseBtn} onPress={() => setNewOpen(false)} activeOpacity={0.7}>
                  <Text style={st.viewCloseBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.newSaveBtn} onPress={saveNew} activeOpacity={0.7} disabled={newSaving}>
                  <Text style={st.newSaveBtnText}>{newSaving ? "保存中..." : "保存"}</Text>
                </TouchableOpacity>
              </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (view === "list") {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView
          style={st.scroll}
          contentContainerStyle={st.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f1dfa7" />}
        >
          <View style={st.toolbar}>
            {isEH && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: fonts.silkscreen, fontSize: 8, color: "#fff", letterSpacing: 2, border: `1px solid ${EW}0.5)`, padding: "3px 7px" }}>IDX · RETRIEVAL</span>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <div style={{ width: 4, height: 4, background: "#78c878" }} />
                  <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(96,168,255,0.95)", letterSpacing: 1 }}>▸ {memories.length} REC</span>
                </div>
              </div>
            )}
            <View style={[st.searchWrap, isEH && { backgroundColor: "#000", borderColor: `${EW}0.35)` }]}>
              <Text style={[st.searchIcon, isEH && { color: EH_BLUE }]}>▸</Text>
              <TextInput
                style={[st.searchInput, isEH && { color: "#fff" }]}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={loadMemories}
                placeholder="检索档案..."
                placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "#645c8e"}
                returnKeyType="search"
              />
            </View>
            <View style={st.filterRow}>
              {FILTER_CATS.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[st.filterBtn, isEH && { backgroundColor: "#000", borderColor: `${EW}0.35)` }, filter === c.key && (isEH ? { borderColor: "#fff", backgroundColor: `${EW}0.12)` } : st.filterBtnActive)]}
                  onPress={() => setFilter(c.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.filterBtnText, isEH && { color: `${EW}0.6)` }, filter === c.key && (isEH ? { color: "#fff" } : st.filterBtnTextActive)]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[st.newBtn, isEH && { backgroundColor: "#fff", borderColor: "#fff" }]} onPress={openNew} activeOpacity={0.7}>
                <Text style={[st.newBtnText, isEH && { color: "#000" }]}>+ 写入</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={st.backBtn} onPress={() => setView("grid")} activeOpacity={0.7}>
            <Text style={[st.backBtnText, isEH && { color: `${EW}0.6)` }]}>‹ 回档案柜</Text>
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator color="#f1dfa7" style={{ marginTop: 24 }} />
          ) : memories.length === 0 ? (
            <Text style={st.muted}>没有找到记忆。</Text>
          ) : (
            <View style={st.memoryList}>
              {memories.map((m) => {
                const tags = parseTags(m.tags);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[st.memoryCard, isEH ? { backgroundColor: "#000", borderWidth: 1, borderColor: `${EW}0.3)`, borderLeftWidth: 3, borderLeftColor: m.category === "eri" ? EH_BLUE : `${EW}0.5)` } : shadow3]}
                    onPress={() => setSelectedMemory(m)}
                    activeOpacity={0.7}
                  >
                    {!isEH && <View style={st.memEdge} />}
                    {/* index-card punch holes */}
                    {isEH && (
                      <div style={{ position: "absolute", top: 6, right: 10, display: "flex", gap: 5 }}>
                        <div style={{ width: 4, height: 4, border: `1px solid ${EW}0.4)` }} />
                        <div style={{ width: 4, height: 4, border: `1px solid ${EW}0.4)` }} />
                      </div>
                    )}
                    <View style={[st.memCardInner, !isEH && cardGrad]}>
                      <View style={st.memCardHeader}>
                        <EmotionStar m={m} />
                        <Text style={[st.memCardTitle, isEH && { color: "#fff" }]} numberOfLines={1}>{m.title || "记忆"}</Text>
                        <Text style={[st.memCardImportance, isEH && { color: "#78c878" }]}>
                          {isEH ? "▮".repeat(clampNum(m.importance, 1, 5, 3)) : "★".repeat(clampNum(m.importance, 1, 5, 3))}
                        </Text>
                      </View>
                      <Text style={[st.memCardBody, isEH && { color: `${EW}0.72)` }]} numberOfLines={3}>
                        {String(m.content || "").replace(/\s+/g, " ").slice(0, 120)}
                      </Text>
                      <View style={st.memCardFooter}>
                        {tags.length > 0 && (
                          <View style={st.memCardTags}>
                            {tags.map((t, i) => (
                              <View key={i} style={[st.tagSmall, isEH && { backgroundColor: "#000", borderWidth: 1, borderColor: `${EW}0.3)` }]}>
                                <Text style={[st.tagSmallText, isEH && { color: `${EW}0.6)` }]}>{t}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        <Text style={[st.memCardDate, isEH && { color: `${EW}0.45)`, fontFamily: fonts.silkscreen, fontSize: 8, letterSpacing: 1 }]}>
                          {m.event_date || m.created_at?.slice(0, 10) || ""}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
        {viewOverlay}
        {newMemoryModal}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f1dfa7" />}
      >
        <View style={st.catsGrid}>
          {CATEGORIES.map((cat, idx) => (
            <TouchableOpacity
              key={cat.key}
              style={[st.catCard, isEH ? { backgroundColor: "#000", borderColor: `${EW}0.5)` } : shadow3]}
              onPress={() => openCategory(cat.key)}
              activeOpacity={0.7}
            >
              {!isEH && <View style={st.catEdge} />}
              <View style={[st.catStation, isEH && { paddingVertical: 7, paddingHorizontal: 10, borderBottomColor: `${EW}0.25)` }]}>
                <Text style={[st.catBay, isEH && { color: "#fff", borderWidth: 1, borderColor: `${EW}0.5)`, paddingHorizontal: 5, paddingVertical: 2 }]}>MEM-{String(idx + 1).padStart(2, "0")}</Text>
                <View style={st.catStatusRow}>
                  {isEH ? (
                    <div style={{ width: 4, height: 4, background: (stats[cat.key] || 0) > 0 ? "#78c878" : "rgba(255,255,255,0.2)" }} />
                  ) : (
                    <View style={st.catDot} />
                  )}
                  <Text style={[st.catStatus, isEH && { color: (stats[cat.key] || 0) > 0 ? "rgba(120,200,120,0.85)" : `${EW}0.35)` }]}>{(stats[cat.key] || 0) > 0 ? "ACTIVE" : "EMPTY"}</Text>
                </View>
              </View>
              <View style={[st.catBody, !isEH && cardGrad]}>
                <Text style={st.catCardIcon}>{cat.icon}</Text>
                {isEH ? (
                  /* label holder — the little double-framed metal window that grips the paper slip */
                  <div style={{ display: "inline-block", border: `1px solid ${EW}0.5)`, padding: 2, marginBottom: 6, alignSelf: "center" }}>
                    <div style={{ border: `1px solid ${EW}0.22)`, padding: "3px 12px" }}>
                      <span style={{ fontFamily: fonts.pixel, fontSize: 12, color: "#fff", letterSpacing: 2 }}>{cat.title}</span>
                    </div>
                  </div>
                ) : (
                  <Text style={st.catCardTitle}>{cat.title}</Text>
                )}
                <Text style={[st.catCardDesc, isEH && { color: `${EW}0.55)` }]}>{cat.desc}</Text>
                {isEH ? (
                  /* capacity gauge + count */
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 2 }}>
                      {Array.from({ length: 10 }, (_, i) => {
                        const max = Math.max(1, ...CATEGORIES.map(c => stats[c.key] || 0));
                        const filled = Math.round(((stats[cat.key] || 0) / max) * 10);
                        return <div key={i} style={{ width: 6, height: 8, background: i < filled ? "rgba(96,168,255,0.85)" : "transparent", border: `1px solid ${EW}${i < filled ? "0.0)" : "0.2)"}` }} />;
                      })}
                    </div>
                    <span style={{ fontFamily: fonts.silkscreen, fontSize: 10, color: EH_BLUE, letterSpacing: 1 }}>{stats[cat.key] || 0}</span>
                    <span style={{ fontFamily: fonts.pixel, fontSize: 9, color: `${EW}0.5)` }}>条</span>
                  </div>
                ) : (
                <Text style={st.catCardCount}>
                  {stats[cat.key] || 0}
                  <Text style={st.catCardCountUnit}> 条</Text>
                </Text>
                )}
              </View>
              {/* drawer pull handle with mounting lugs */}
              {isEH && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", paddingBottom: 8 }}>
                  <div style={{ width: 5, height: 10, background: `${EW}0.55)` }} />
                  <div style={{ width: 44, height: 4, background: `${EW}0.75)`, margin: "0 -1px" }} />
                  <div style={{ width: 5, height: 10, background: `${EW}0.55)` }} />
                </div>
              )}
              {/* corner screws */}
              {isEH && [[6, 6], [6, null], [null, 6], [null, null]].map(([tp, lf], i) => (
                <div key={i} style={{ position: "absolute", top: tp != null ? tp : undefined, bottom: tp == null ? 6 : undefined, left: lf != null ? lf : undefined, right: lf == null ? 6 : undefined, width: 5, height: 5, border: `1px solid ${EW}0.45)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 5, height: 1, background: `${EW}0.45)`, transform: `rotate(${45 + i * 30}deg)` }} />
                </div>
              ))}
              {/* drawer rails on the flanks */}
              {isEH && <div style={{ position: "absolute", left: 0, top: "38%", width: 3, height: "24%", background: `${EW}0.35)` }} />}
              {isEH && <div style={{ position: "absolute", right: 0, top: "38%", width: 3, height: "24%", background: `${EW}0.35)` }} />}
              {/* inner depth shadow under the drawer face */}
              {isEH && <div style={{ position: "absolute", left: 3, right: 3, bottom: 0, height: 2, background: `${EW}0.18)` }} />}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 92 },

  // ── CATEGORY GRID ──
  catsGrid: {
    gap: 12,
    ...(Platform.OS === "web" ? { display: "grid" as any, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" } as any : {}),
  },
  catCard: {
    backgroundColor: "#0c0d22",
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.35)",
    overflow: "hidden" as const,
  },
  catEdge: {
    height: 2,
    ...edgeGrad,
  },
  catStation: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,223,146,0.08)",
  },
  catBay: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: "rgba(255,223,146,0.4)",
    letterSpacing: 2,
  },
  catStatusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  catDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#75d879",
  },
  catStatus: {
    fontFamily: fonts.silkscreen,
    fontSize: 5,
    color: "rgba(200,216,240,0.4)",
    letterSpacing: 1,
  },
  catBody: {
    padding: 14,
  },
  catCardIcon: {
    fontSize: 18,
    marginBottom: 6,
  },
  catCardTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: "#ffdf92",
    letterSpacing: 2,
    marginBottom: 4,
    ...(Platform.OS === "web" ? { textShadow: "0 0 10px rgba(255,223,146,0.25)" } as any : {}),
  },
  catCardDesc: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "#645c8e",
    letterSpacing: 1,
    marginBottom: 10,
  },
  catCardCount: {
    fontFamily: fonts.silkscreen,
    fontSize: 22,
    color: "#ffdf92",
  },
  catCardCountUnit: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "#645c8e",
  },

  // ── TOOLBAR ──
  toolbar: { marginBottom: 12 },
  searchWrap: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(3,6,19,0.5)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.15)",
    marginBottom: 8,
  },
  searchIcon: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    color: "rgba(255,223,146,0.4)",
    paddingLeft: 10,
  },
  searchInput: {
    flex: 1,
    padding: 10,
    color: "#efede6",
    fontFamily: fonts.pixel,
    fontSize: 13,
  },
  filterRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
    alignItems: "center" as const,
  },
  filterBtn: {
    backgroundColor: "rgba(3,6,19,0.5)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.12)",
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  filterBtnActive: {
    borderColor: "rgba(255,223,146,0.55)",
    backgroundColor: "rgba(255,223,146,0.06)",
  },
  filterBtnText: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "#645c8e",
    letterSpacing: 1,
  },
  filterBtnTextActive: { color: "#ffdf92" },

  newBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.55)",
    backgroundColor: "rgba(255,223,146,0.1)",
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  newBtnText: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "#ffdf92",
    letterSpacing: 1,
  },

  backBtn: { marginBottom: 12 },
  backBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "#ffdf92",
    letterSpacing: 1,
  },

  // ── MEMORY LIST ──
  memoryList: { gap: 6 },
  memoryCard: {
    backgroundColor: "#0c0d22",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.18)",
    overflow: "hidden" as const,
  },
  memEdge: {
    height: 1,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent, rgba(200,216,240,0.3), transparent)" } as any
      : { backgroundColor: "rgba(200,216,240,0.2)" }),
  },
  memCardInner: { padding: 12 },
  memCardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 6,
  },
  memCardTitle: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: "#efede6",
    flex: 1,
  },
  memCardImportance: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: "rgba(255,223,146,0.5)",
    letterSpacing: 1,
  },
  memCardBody: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "#9792a9",
    lineHeight: 20,
  },
  memCardFooter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: 8,
  },
  memCardTags: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 4,
    flex: 1,
  },
  memCardDate: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: "#645c8e",
    letterSpacing: 1,
  },

  tagSmall: {
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.25)",
    backgroundColor: "rgba(255,223,146,0.06)",
    paddingVertical: 1,
    paddingHorizontal: 5,
  },
  tagSmallText: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: "rgba(255,223,146,0.6)",
    letterSpacing: 1,
  },

  // ── VIEW OVERLAY / MODAL ──
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 20,
  },
  viewPanelFixed: {
    backgroundColor: "#0c0d22",
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.35)",
    width: "100%" as any,
    maxWidth: 620,
    maxHeight: "85%" as any,
    overflow: "hidden" as const,
  },
  viewHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(200,216,240,0.08)",
  },
  viewFooter: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(200,216,240,0.08)",
  },
  viewFeelInline: {
    marginTop: 8,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 12,
  },
  viewTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 16,
    color: "#ffdf92",
    marginBottom: 10,
    lineHeight: 24,
    letterSpacing: 2,
    ...(Platform.OS === "web" ? { textShadow: "0 0 14px rgba(255,223,146,0.25)" } as any : {}),
  },
  viewMeta: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    alignItems: "center" as const,
    marginBottom: 16,
  },
  catBadge: {
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.3)",
    backgroundColor: "rgba(255,223,146,0.06)",
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  catBadgeText: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "rgba(255,223,146,0.7)",
    letterSpacing: 1,
  },
  viewStars: { fontSize: 10 },
  depthBadge: {
    borderWidth: 1,
    borderColor: "rgba(160,125,206,0.4)",
    backgroundColor: "rgba(160,125,206,0.08)",
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  depthBadgeText: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: "#a07dce",
    letterSpacing: 0.5,
  },
  closureBadge: {
    borderWidth: 1,
    borderColor: "rgba(126,200,160,0.4)",
    backgroundColor: "rgba(126,200,160,0.08)",
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  closureBadgeText: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: "#7ec8a0",
    letterSpacing: 0.5,
  },
  tag: {
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.2)",
    backgroundColor: "rgba(200,216,240,0.04)",
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  tagText: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: "rgba(200,216,240,0.55)",
    letterSpacing: 1,
  },
  viewDate: { fontFamily: fonts.pixel, fontSize: 10, color: "#645c8e" },
  viewSub: { fontFamily: fonts.pixel, fontSize: 10, color: "#645c8e" },
  viewBody: { fontFamily: fonts.pixel, fontSize: 14, color: "#efede6", lineHeight: 26 },
  viewFeelText: { fontFamily: fonts.pixel, fontSize: 11, color: "#645c8e", lineHeight: 22 },
  viewFeelLabel: { color: "rgba(255,223,146,0.7)" },
  viewActions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
    marginTop: 24,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(200,216,240,0.08)",
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "rgba(224,93,93,0.35)",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  deleteBtnText: { fontFamily: fonts.pixel, fontSize: 11, color: "#e05d5d" },
  editBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.4)",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  editBtnText: { fontFamily: fonts.pixel, fontSize: 11, color: "#ffdf92" },
  viewCloseBtn: {
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.2)",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  viewCloseBtnText: { fontFamily: fonts.pixel, fontSize: 11, color: "#9792a9" },

  newSaveBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.55)",
    backgroundColor: "rgba(255,223,146,0.12)",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  newSaveBtnText: { fontFamily: fonts.pixel, fontSize: 11, color: "#ffdf92" },

  // ── FORM ──
  formLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "rgba(255,223,146,0.5)",
    letterSpacing: 2,
    marginTop: 14,
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: "rgba(3,6,19,0.5)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.15)",
    padding: 10,
    color: "#efede6",
    fontFamily: fonts.pixel,
    fontSize: 13,
  },
  formCatRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  formCatBtn: {
    backgroundColor: "rgba(3,6,19,0.5)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.12)",
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  formCatBtnActive: {
    borderColor: "rgba(255,223,146,0.55)",
    backgroundColor: "rgba(255,223,146,0.06)",
  },
  formCatBtnText: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "#645c8e",
    letterSpacing: 1,
  },
  formCatBtnTextActive: { color: "#ffdf92" },

  muted: { fontFamily: fonts.pixel, fontSize: 12, color: "#645c8e", textAlign: "center" as const, marginTop: 20 },
});
