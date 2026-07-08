import { useCallback, useEffect, useState } from "react";
import {
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
import {
  api,
  CalendarMonth,
  CalendarDay,
  CountdownStatus,
  LunarRange,
  SurfaceMemory,
} from "../../services/api";
import { useTimezone, timezoneLabel } from "../../stores/timezoneStore";
import { fonts } from "../../theme/colors";
import { clampNum, parseTags } from "./EmotionStar";
import { useThemeTokens } from "../../hooks/useTheme";
import { EhFrame, ehOutline, ehBars, ehSlashes } from "../decor/EhParts";
import { EH_BLUE } from "../bridge/BridgeDashboard";

const MOODS = [
  { k: "happy", name: "开心", emoji: "🥳" },
  { k: "normal", name: "平常", emoji: "😌" },
  { k: "sad", name: "伤心", emoji: "😭" },
  { k: "angry", name: "生气", emoji: "😡" },
  { k: "irritated", name: "烦躁", emoji: "😒" },
  { k: "drifting", name: "恍惚", emoji: "😶‍🌫️" },
  { k: "lovesick", name: "恋爱脑", emoji: "🥰" },
  { k: "manic", name: "亢奋", emoji: "🤩" },
  { k: "down", name: "丧", emoji: "💀" },
  { k: "ache", name: "钝痛", emoji: "🫠" },
];
const MOOD_EMOJI: Record<string, string> = Object.fromEntries(MOODS.map(m => [m.k, m.emoji]));

const shadow3 = Platform.OS === "web" ? { boxShadow: "0 0 12px rgba(200,216,240,0.06), 3px 3px 0 #000" } as any : {};
const shadow4 = Platform.OS === "web" ? { boxShadow: "0 0 14px rgba(200,216,240,0.08), 4px 4px 0 #000" } as any : {};

function pad2(v: number) { return String(v).padStart(2, "0"); }

function dateInZone(timezone: string, date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone });
}

function monthInZone(timezone: string, date = new Date()): string {
  return dateInZone(timezone, date).slice(0, 7);
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeInZone(timezone: string) {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  return `${pad2(local.getHours())}:${pad2(local.getMinutes())}:${pad2(local.getSeconds())}`;
}

function cityEmoji(tz: string) {
  const h = new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getHours();
  return (h >= 6 && h < 21) ? "🏙️" : "🌃";
}

function daysTogether(timezone: string): number {
  const today = dateInZone(timezone);
  const [y, m, d] = today.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 2, 10)) / 86400000);
}

function weekdayCN(day: number) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day] || "";
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const EDIT_CATEGORIES = [
  { value: "core", label: "核心人格 (core)" },
  { value: "eri", label: "关于Eri (eri)" },
  { value: "deep", label: "关系里程碑 (deep)" },
  { value: "diary", label: "日记 (diary)" },
  { value: "letter", label: "信箱 (letter)" },
  { value: "tech", label: "技术记录 (tech)" },
  { value: "daily", label: "日常 (daily)" },
  { value: "notes", label: "札记 (notes)" },
];

const IMPORTANCE_OPTIONS = [1, 2, 3, 4, 5];

const CAT_NAMES: Record<string, string> = {
  deep: "关系", daily: "日常", diary: "日记", core: "核心",
  eri: "关于Eri", letter: "信箱", tech: "技术", notes: "札记",
};
const CAT_EMOJI: Record<string, string> = {
  core: "🪶", eri: "🖤", deep: "✦", diary: "📖",
  letter: "💌", tech: "⚙️", daily: "·", notes: "📝",
};

interface Props {
  countdown: CountdownStatus | null;
}

// ── EH panel frames（星历专属硬件，与航行日志一脉但不重样）──
const CAL_FR = { strokeLinejoin: "miter", strokeLinecap: "square" } as any;

/** PARALLEL ORBIT — v3: clean right-angle hull (Eri: 方方的就好),
 *  centered top notch, weighted top-left run, left welds, bottom-right barcode */
const drawOrbitFrame = (w: number, h: number) => (
  <g {...CAL_FR}>
    <path d={ehOutline(w, h, {}, { type: "notch", x0: w / 2 - 46, x1: w / 2 + 46, d: 5 })} stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" fill="none" />
    <line x1={0.5} y1={1} x2={w / 2 - 58} y2={1} stroke="rgba(255,255,255,0.75)" strokeWidth="3" />
    <line x1={w / 2 + 58} y1={1} x2={w - 0.5} y2={1} stroke="rgba(255,255,255,0.75)" strokeWidth="3" />
    <rect x={-2} y={h * 0.3} width={5} height={9} fill="rgba(255,255,255,0.75)" />
    <rect x={-2} y={h * 0.3 + 14} width={5} height={9} fill="rgba(255,255,255,0.3)" />
    {ehBars(w - 92, w - 30, h - 8, 6, 31)}
    {ehSlashes(16, h - 16, 4, 8, 5, "rgba(255,255,255,0.3)", 1)}
  </g>
);

/** STAR CALENDAR — v3: viewfinder frame (right-angle hull + four corner marks
 *  floating outside, observation-scope language — no cuts), center notch,
 *  weighted bottom shoulders, symmetric welds, center barcode */
const drawCalFrame = (w: number, h: number) => (
  <g {...CAL_FR}>
    <path d={ehOutline(w, h, {}, { type: "notch", x0: w / 2 - 48, x1: w / 2 + 48, d: 5 })} stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" fill="none" />
    {/* viewfinder corner marks — outside the hull */}
    <path d={`M-4 8 L-4 -4 L8 -4`} stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
    <path d={`M${w - 8} -4 L${w + 4} -4 L${w + 4} 8`} stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
    <path d={`M${w + 4} ${h - 8} L${w + 4} ${h + 4} L${w - 8} ${h + 4}`} stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
    <path d={`M8 ${h + 4} L-4 ${h + 4} L-4 ${h - 8}`} stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
    {/* weighted bottom shoulders */}
    <line x1={20} y1={h - 1} x2={92} y2={h - 1} stroke="rgba(255,255,255,0.75)" strokeWidth="3" />
    <line x1={w - 92} y1={h - 1} x2={w - 20} y2={h - 1} stroke="rgba(255,255,255,0.75)" strokeWidth="3" />
    {/* symmetric welds + inset lines */}
    <rect x={-2} y={h * 0.26} width={5} height={9} fill="rgba(255,255,255,0.55)" />
    <rect x={w - 3} y={h * 0.26} width={5} height={9} fill="rgba(255,255,255,0.55)" />
    <line x1={4} y1={h * 0.33} x2={4} y2={h * 0.58} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    <line x1={w - 4} y1={h * 0.33} x2={w - 4} y2={h * 0.58} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    {ehBars(w / 2 - 30, w / 2 + 30, h - 8, 6, 37)}
    {ehSlashes(w - 62, h - 18, 4, 8, 5, "rgba(255,255,255,0.3)", 1)}
  </g>
);

/** DAY PANEL — v2: right-angle hull, weighted top-left run, tr corner mark, right weld */
const drawDayFrame = (w: number, h: number) => (
  <g {...CAL_FR}>
    <path d={ehOutline(w, h, {})} stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" fill="none" />
    <line x1={0.5} y1={1} x2={120} y2={1} stroke="rgba(255,255,255,0.75)" strokeWidth="3" />
    <path d={`M${w - 8} -4 L${w + 4} -4 L${w + 4} 8`} stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
    <rect x={w - 3} y={h * 0.2} width={5} height={9} fill="rgba(255,255,255,0.5)" />
    {ehSlashes(w - 46, h - 16, 4, 8, 5, "rgba(255,255,255,0.3)", 1)}
  </g>
);

/** MEM FILE — v2: archive folder with a tab ear on the top-right edge (no cut),
 *  weighted top run, left welds, bottom barcode, bl slashes */
const drawFileFrame = (w: number, h: number) => (
  <g {...CAL_FR}>
    <path
      d={`M0.5 0.5 L${w - 118} 0.5 L${w - 112} -4.5 L${w - 38} -4.5 L${w - 32} 0.5 L${w - 0.5} 0.5 L${w - 0.5} ${h - 0.5} L8 ${h - 0.5} L0.5 ${h - 8} Z`}
      stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" fill="none"
    />
    <line x1={0.5} y1={1} x2={w - 130} y2={1} stroke="rgba(255,255,255,0.8)" strokeWidth="3" />
    <rect x={-2} y={h * 0.16} width={5} height={9} fill="rgba(255,255,255,0.75)" />
    <rect x={-2} y={h * 0.16 + 14} width={5} height={9} fill="rgba(255,255,255,0.3)" />
    {ehBars(w - 104, w - 30, h - 8, 6, 41)}
    {ehSlashes(16, h - 18, 4, 8, 5, "rgba(255,255,255,0.3)", 1)}
  </g>
);

export default function AchernarCalendar({ countdown }: Props) {
  const isEH = useThemeTokens().key === "eventHorizon" && Platform.OS === "web";
  const timezone = useTimezone((state) => state.timezone);
  const secondaryTimezone = timezone === "Asia/Shanghai" ? "Europe/London" : "Asia/Shanghai";
  const [primaryTime, setPrimaryTime] = useState(() => timeInZone(timezone));
  const [secondaryTime, setSecondaryTime] = useState(() => timeInZone(secondaryTimezone));
  const [togetherDays, setTogetherDays] = useState(() => daysTogether(timezone));

  const [calMonth, setCalMonth] = useState(() => {
    return monthInZone(timezone);
  });
  const [calData, setCalData] = useState<CalendarMonth | null>(null);
  const [lunarData, setLunarData] = useState<LunarRange>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedDayMood, setSelectedDayMood] = useState<string | null>(null);

  // diary state
  const [diaryId, setDiaryId] = useState<string | null>(null);
  const [diaryReadMode, setDiaryReadMode] = useState(false);
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryContent, setDiaryContent] = useState("");
  const [diarySaving, setDiarySaving] = useState(false);

  // day memories
  const [dayMemories, setDayMemories] = useState<SurfaceMemory[]>([]);

  // view overlay for a memory
  const [viewMem, setViewMem] = useState<SurfaceMemory | null>(null);

  // edit overlay for a memory
  const [editMem, setEditMem] = useState<SurfaceMemory | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("core");
  const [editImportance, setEditImportance] = useState(3);
  const [editEventDate, setEditEventDate] = useState("");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setPrimaryTime(timeInZone(timezone));
      setSecondaryTime(timeInZone(secondaryTimezone));
      setTogetherDays(daysTogether(timezone));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondaryTimezone, timezone]);

  const loadCalendar = useCallback(async () => {
    try {
      const data = await api.calendar(calMonth);
      setCalData(data);
      const firstDay = new Date(calMonth + "-01");
      const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 6);
      const firstPad = new Date(firstDay);
      firstPad.setDate(firstPad.getDate() - firstPad.getDay());
      const from = localDateStr(firstPad);
      const to = localDateStr(lastDay);
      try {
        const lunar = await api.lunarRange(from, to);
        setLunarData(lunar);
      } catch (_) {}
    } catch (_) {}
  }, [calMonth]);


  // day panel —— refreshDay 只刷新数据不动开关；onSelectDay 负责开关
  const refreshDay = useCallback(async (dateStr: string) => {
    try {
      const [allMems] = await Promise.allSettled([
        api.memoriesByDate(dateStr),
      ]);
      if (allMems.status === "fulfilled") {
        const mems = allMems.value || [];
        const diaries = mems.filter(x => x.category === "diary");
        const others = mems.filter(x => x.category !== "diary");
        const diary = diaries[0] || null;

        if (diary) {
          setDiaryId(diary.id);
          setDiaryTitle(diary.title || "");
          setDiaryContent(diary.content || "");
          setDiaryReadMode(true);
        } else {
          setDiaryId(null);
          setDiaryTitle("");
          setDiaryContent("");
          setDiaryReadMode(false);
        }

        const extra = diaries.slice(1);
        setDayMemories([...extra, ...others]);
      }
    } catch (_) {}
  }, []);

  const onSelectDay = useCallback((dateStr: string) => {
    if (dateStr === selectedDay) {
      setSelectedDay(null);
      setSelectedDayMood(null);
      return;
    }
    setSelectedDay(dateStr);
    setSelectedDayMood(calData?.days?.find((d) => d.date === dateStr)?.mood ?? null);
    setDiaryReadMode(false);
    setDiaryId(null);
    setDiaryTitle("");
    setDiaryContent("");
    setDayMemories([]);
    refreshDay(dateStr);
  }, [selectedDay, calData, refreshDay]);

  const onSetMood = useCallback(async (mood: string) => {
    if (!selectedDay) return;
    try {
      await api.setMood(selectedDay, mood);
      setSelectedDayMood(mood);
      loadCalendar();
    } catch (_) {}
  }, [selectedDay, loadCalendar]);

  const onClearMood = useCallback(async () => {
    if (!selectedDay) return;
    try {
      await api.clearMood(selectedDay);
      setSelectedDayMood(null);
      loadCalendar();
    } catch (_) {}
  }, [selectedDay, loadCalendar]);

  const saveDiary = useCallback(async () => {
    if (!selectedDay) return;
    const body = diaryContent.trim();
    if (!body) return;
    setDiarySaving(true);
    try {
      const data: any = {
        title: diaryTitle.trim() || selectedDay,
        content: body,
        category: "diary",
        importance: 3,
        event_date: selectedDay,
        tags: [],
      };
      if (diaryId) {
        await api.updateMemory(diaryId, data);
      } else {
        await api.createMemory(data);
      }
      loadCalendar();
      refreshDay(selectedDay);
    } catch (_) {}
    setDiarySaving(false);
  }, [selectedDay, diaryId, diaryTitle, diaryContent, loadCalendar, refreshDay]);

  const deleteDiary = useCallback(async () => {
    if (!diaryId) return;
    try {
      await api.deleteMemory(diaryId);
      loadCalendar();
      if (selectedDay) refreshDay(selectedDay);
    } catch (_) {}
  }, [diaryId, selectedDay, loadCalendar, refreshDay]);

  const closeDay = useCallback(() => {
    setSelectedDay(null);
  }, []);

  // view memory overlay → click "编辑" → opens edit overlay
  const openViewMem = useCallback((m: SurfaceMemory) => {
    setViewMem(m);
  }, []);

  const openEditFromView = useCallback(() => {
    if (!viewMem) return;
    const m = viewMem;
    setEditMem(m);
    setEditTitle(m.title || "");
    setEditContent(m.content || "");
    setEditCategory(m.category || "core");
    setEditImportance(clampNum(m.importance, 1, 5, 3));
    setEditEventDate(m.event_date || "");
    setEditSubcategory(m.subcategory || "");
    setEditTags(parseTags(m.tags).join(", "));
    setViewMem(null);
  }, [viewMem]);

  const saveEditMem = useCallback(async () => {
    if (!editMem) return;
    const title = editTitle.trim();
    const content = editContent.trim();
    if (!title || !content) return;
    setEditSaving(true);
    try {
      const tags = editTags.trim() ? editTags.split(",").map(t => t.trim()).filter(Boolean) : [];
      await api.updateMemory(editMem.id, {
        title, content,
        category: editCategory,
        importance: editImportance,
        event_date: editEventDate.trim() || null,
        subcategory: editSubcategory.trim() || null,
        tags,
      });
      setEditMem(null);
      if (selectedDay) refreshDay(selectedDay);
    } catch (_) {}
    setEditSaving(false);
  }, [editMem, editTitle, editContent, editCategory, editImportance, editEventDate, editSubcategory, editTags, selectedDay, refreshDay]);

  const deleteEditMem = useCallback(async () => {
    if (!editMem) return;
    try {
      await api.deleteMemory(editMem.id);
      setEditMem(null);
      if (selectedDay) refreshDay(selectedDay);
    } catch (_) {}
  }, [editMem, selectedDay, refreshDay]);

  // lifecycle
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCalendar();
    setRefreshing(false);
  }, [loadCalendar]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  useEffect(() => {
    const todayInZone = dateInZone(timezone);
    setPrimaryTime(timeInZone(timezone));
    setSecondaryTime(timeInZone(secondaryTimezone));
    setTogetherDays(daysTogether(timezone));
    setCalMonth(todayInZone.slice(0, 7));
  }, [secondaryTimezone, timezone]);

  const prevMonth = useCallback(() => {
    const d = new Date(calMonth + "-01");
    d.setMonth(d.getMonth() - 1);
    setCalMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
    setSelectedDay(null);
  }, [calMonth]);

  const nextMonth = useCallback(() => {
    const d = new Date(calMonth + "-01");
    d.setMonth(d.getMonth() + 1);
    setCalMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
    setSelectedDay(null);
  }, [calMonth]);

  const goToday = useCallback(() => {
    const today = dateInZone(timezone);
    setCalMonth(today.slice(0, 7));
    onSelectDay(today);
  }, [onSelectDay, timezone]);

  const calTitle = (() => {
    const [y, m] = calMonth.split("-");
    return `${y}年${parseInt(m)}月`;
  })();

  const today = dateInZone(timezone);

  const calGrid = (() => {
    if (!calData) return [];
    const firstDay = new Date(calMonth + "-01");
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
    const dayMap: Record<string, CalendarDay> = {};
    for (const d of calData.days) dayMap[d.date] = d;

    const cells: { date: string; day: number; isCurrentMonth: boolean; calDay?: CalendarDay }[] = [];

    const prevMonthDate = new Date(firstDay.getFullYear(), firstDay.getMonth(), 0);
    const prevDays = prevMonthDate.getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevDays - i;
      const dateStr = `${prevMonthDate.getFullYear()}-${pad2(prevMonthDate.getMonth() + 1)}-${pad2(d)}`;
      cells.push({ date: dateStr, day: d, isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calMonth}-${pad2(d)}`;
      cells.push({ date: dateStr, day: d, isCurrentMonth: true, calDay: dayMap[dateStr] });
    }

    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      const nextMonthDate = new Date(firstDay.getFullYear(), firstDay.getMonth() + 2, 0);
      for (let d = 1; d <= remaining; d++) {
        const dateStr = `${nextMonthDate.getFullYear()}-${pad2(nextMonthDate.getMonth() + 1)}-${pad2(d)}`;
        cells.push({ date: dateStr, day: d, isCurrentMonth: false });
      }
    }

    return cells;
  })();

  // selected day formatted
  const selectedDayFormatted = (() => {
    if (!selectedDay) return "";
    const [y, m, d] = selectedDay.split("-").map(Number);
    return `${y}年${m}月${d}日`;
  })();

  const selectedWeekday = (() => {
    if (!selectedDay) return "";
    const [y, m, d] = selectedDay.split("-").map(Number);
    return weekdayCN(new Date(y, m - 1, d).getDay());
  })();

  // view memory overlay
  const viewOverlay = viewMem && (
    <Modal transparent animationType="fade" visible onRequestClose={() => setViewMem(null)}>
      <View style={st.overlay}>
        <View
          style={[st.calPanelFixed, isEH ? eh.overlayPanel : shadow4, isEH ? null : { borderLeftWidth: 4, borderLeftColor: viewMem.category === "eri" ? "#9f60a8" : "#3f3f70" }]}
          onStartShouldSetResponder={() => true}
        >
          {isEH && <EhFrame draw={drawFileFrame} />}
          <View style={[st.calOverlayHeader, isEH && eh.overlayDivider]}>
            {isEH && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontFamily: fonts.silkscreen, fontSize: 8, color: "#fff", letterSpacing: 2, border: "1px solid rgba(255,255,255,0.5)", padding: "3px 7px" }}>
                  MEM-FILE // {String(viewMem.id || "").replace(/-/g, "").slice(0, 8).toUpperCase() || "RECORD"}
                </span>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <div style={{ width: 5, height: 5, background: "#78c878" }} />
                  <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(120,200,120,0.85)", letterSpacing: 1.5 }}>ACCESS GRANTED</span>
                </div>
              </div>
            )}
            <Text style={[st.overlayTitle, isEH && eh.whiteVal]}>{viewMem.title || "记忆"}</Text>
            {isEH && (
              <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginBottom: 12, borderTop: "1px dashed rgba(255,255,255,0.18)", borderBottom: "1px dashed rgba(255,255,255,0.18)", padding: "6px 0" }}>
                <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, letterSpacing: 1, color: "rgba(255,255,255,0.45)" }}>REG <span style={{ color: EH_BLUE }}>{(viewMem.event_date || viewMem.created_at || "").slice(0, 10) || "—"}</span></span>
                <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, letterSpacing: 1, color: "rgba(255,255,255,0.45)" }}>CAT <span style={{ color: "#fff" }}>{(viewMem.category || "—").toUpperCase()}</span></span>
                <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, letterSpacing: 1, color: "rgba(255,255,255,0.45)" }}>IMP <span style={{ color: "#78c878" }}>{"▮".repeat(clampNum(viewMem.importance, 1, 5, 3))}{"▯".repeat(5 - clampNum(viewMem.importance, 1, 5, 3))}</span></span>
              </div>
            )}
            <View style={st.overlayMeta}>
              <View style={[st.overlayBadge, isEH && eh.chip]}>
                <Text style={[st.overlayBadgeText, isEH && eh.softVal]}>{CAT_EMOJI[viewMem.category || ""] || "·"} {CAT_NAMES[viewMem.category || ""] || viewMem.category}</Text>
              </View>
              <Text style={st.overlayStars}>{"⭐".repeat(clampNum(viewMem.importance, 1, 5, 3))}</Text>
              {parseTags(viewMem.tags).map((t, i) => (
                <View key={i} style={[st.overlayTag, isEH && eh.chip]}>
                  <Text style={[st.overlayTagText, isEH && eh.softVal]}>{t}</Text>
                </View>
              ))}
              {viewMem.event_date && <Text style={[st.overlayDate, isEH && eh.dimLabel]}>📅 {viewMem.event_date}</Text>}
              {viewMem.subcategory && <Text style={[st.overlayDate, isEH && eh.dimLabel]}>· {viewMem.subcategory}</Text>}
            </View>
            {(viewMem.emotion_beat || viewMem.affect_anchor) && (
              <View style={st.calFeelInline}>
                {viewMem.emotion_beat && (
                  <Text style={[st.overlayFeelText, isEH && eh.softVal]}>
                    <Text style={[st.overlayFeelLabel, isEH && eh.whiteVal]}>情绪</Text> {viewMem.emotion_beat}
                  </Text>
                )}
                {viewMem.affect_anchor && (
                  <Text style={[st.overlayFeelText, isEH && eh.softVal]}>
                    <Text style={[st.overlayFeelLabel, isEH && eh.whiteVal]}>和弦</Text> {viewMem.affect_anchor}
                  </Text>
                )}
              </View>
            )}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 16 }} bounces={false}>
            {isEH && (
              <div style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 10 }}>
                {"// RECORD_BODY"}
              </div>
            )}
            <Text style={[st.overlayBody, isEH && eh.bodyText]}>{viewMem.content}</Text>
          </ScrollView>

          <View style={[st.calFooter, isEH && eh.overlayDividerTop]}>
            {isEH && (
              <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, marginRight: "auto" }}>
                ARCHIVE
              </span>
            )}
            <TouchableOpacity style={[st.overlayCloseBtn, isEH && eh.btnGhost]} onPress={() => setViewMem(null)} activeOpacity={0.7}>
              <Text style={[st.overlayCloseBtnText, isEH && eh.softVal]}>关闭</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.overlayEditBtn, isEH && eh.btnSolid]} onPress={openEditFromView} activeOpacity={0.7}>
              <Text style={st.overlayEditBtnText}>编辑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // edit memory overlay
  const editOverlay = editMem && (
    <Modal transparent animationType="fade" visible onRequestClose={() => setEditMem(null)}>
      <View style={st.overlay}>
        <View style={[st.calPanelFixed, isEH ? eh.overlayPanel : shadow4]} onStartShouldSetResponder={() => true}>
          <View style={[st.calOverlayHeader, isEH && eh.overlayDivider]}>
            <Text style={[st.overlayTitle, { color: isEH ? "#fff" : "#f1dfa7" }]}>编辑记忆</Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 12 }} bounces={false}>
            <Text style={[st.formLabel, isEH && eh.dimLabel]}>标题</Text>
            <TextInput style={[st.formInput, isEH && eh.formInput]} value={editTitle} onChangeText={setEditTitle} placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "#645c8e"} placeholder="简短的标题" />

            <Text style={[st.formLabel, isEH && eh.dimLabel]}>内容</Text>
            <TextInput
              style={[st.formInput, isEH && eh.formInput, { minHeight: 120, textAlignVertical: "top" }]}
              value={editContent} onChangeText={setEditContent} multiline
              placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "#645c8e"} placeholder="记忆的详细内容..."
            />

            <View style={st.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={[st.formLabel, isEH && eh.dimLabel]}>分类</Text>
                <View style={st.formCatWrap}>
                  {EDIT_CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c.value}
                      style={[st.formCatBtn, isEH && eh.chip, editCategory === c.value && (isEH ? eh.chipActive : st.formCatBtnActive)]}
                      onPress={() => setEditCategory(c.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.formCatBtnText, isEH && eh.softVal, editCategory === c.value && (isEH ? eh.whiteVal : st.formCatBtnTextActive)]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.formLabel, isEH && eh.dimLabel]}>重要程度</Text>
                <View style={st.formCatWrap}>
                  {IMPORTANCE_OPTIONS.map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[st.formCatBtn, isEH && eh.chip, editImportance === n && (isEH ? eh.chipActive : st.formCatBtnActive)]}
                      onPress={() => setEditImportance(n)}
                      activeOpacity={0.7}
                    >
                      <Text style={st.formCatBtnText}>{"⭐".repeat(n)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={[st.formLabel, isEH && eh.dimLabel]}>事件日期（可选，YYYY-MM-DD）</Text>
            <TextInput style={[st.formInput, isEH && eh.formInput]} value={editEventDate} onChangeText={setEditEventDate} placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "#645c8e"} placeholder="2026-04-17" />

            <Text style={[st.formLabel, isEH && eh.dimLabel]}>子分类 / 时代（可选）</Text>
            <TextInput style={[st.formInput, isEH && eh.formInput]} value={editSubcategory} onChangeText={setEditSubcategory} placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "#645c8e"} placeholder="灵魂 / 我们的关系 / 伦敦日常……" />

            <Text style={[st.formLabel, isEH && eh.dimLabel]}>标签（逗号分隔）</Text>
            <TextInput style={[st.formInput, isEH && eh.formInput]} value={editTags} onChangeText={setEditTags} placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "#645c8e"} placeholder="关系, 喜好, 重要的人" />
          </ScrollView>

          <View style={[st.calFooter, isEH && eh.overlayDividerTop]}>
            <TouchableOpacity style={st.formDeleteBtn} onPress={deleteEditMem} activeOpacity={0.7}>
              <Text style={st.formDeleteBtnText}>删除</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={[st.overlayCloseBtn, isEH && eh.btnGhost]} onPress={() => setEditMem(null)} activeOpacity={0.7}>
              <Text style={[st.overlayCloseBtnText, isEH && eh.softVal]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.overlayEditBtn, isEH && eh.btnSolid]} onPress={saveEditMem} activeOpacity={0.7} disabled={editSaving}>
              <Text style={st.overlayEditBtnText}>{editSaving ? "保存中…" : "保存"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <ScrollView
      style={st.scroll}
      contentContainerStyle={st.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f1dfa7" />}
    >
      {/* time sync — compact strip */}
      <View style={[st.miniStrip, isEH && eh.miniStrip]}>
        {!isEH && <View style={st.miniStripEdge} />}
        <View style={st.miniStripRow}>
          <Text style={[st.miniStripLabel, isEH && eh.dimLabel]}>{timezoneLabel(timezone).toUpperCase()}</Text>
          <Text style={[st.miniStripValGold, isEH && eh.whiteVal]}>{cityEmoji(timezone)} {primaryTime}</Text>
          <Text style={st.miniStripSep}>·</Text>
          <Text style={[st.miniStripLabel, isEH && eh.dimLabel]}>{timezoneLabel(secondaryTimezone).toUpperCase()}</Text>
          <Text style={[st.miniStripVal, isEH && eh.softVal]}>{cityEmoji(secondaryTimezone)} {secondaryTime}</Text>
          <Text style={st.miniStripSep}>·</Text>
          <Text style={[st.miniStripLabel, isEH && eh.dimLabel]}>纪念日</Text>
          <Text style={[st.miniStripValGold, isEH && eh.blueVal]}>{countdown?.anniversary?.days ?? "—"}天</Text>
        </View>
      </View>

      {/* section: orbit */}
      <View style={st.secLine}>
        <View style={[st.secLineFill, isEH && eh.secLineFill]} />
        <Text style={[st.secLineLabel, isEH && eh.secLineLabel]}>PARALLEL ORBIT</Text>
        <View style={[st.secLineFill, isEH && eh.secLineFill]} />
      </View>

      {/* together counter — flight computer panel */}
      <View style={[st.orbitPanel, isEH ? eh.panel : st.orbitPanelShadow]}>
        {isEH && <EhFrame draw={drawOrbitFrame} />}
        {!isEH && <View style={st.orbitTopEdge} />}

        {/* title bar */}
        <View style={st.orbitTitleBar}>
          {!isEH && <Text style={st.orbitTitleDeco}>◆ ─── · ·</Text>}
          <Text style={[st.orbitTitleText, isEH && eh.panelTitle]}>PARALLEL ORBIT</Text>
          {!isEH && <Text style={st.orbitTitleDeco}>· · ─── ◆</Text>}
        </View>

        {/* status line */}
        <View style={st.orbitStatusLine}>
          {isEH ? (
            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
              <div style={{ width: 4, height: 4, background: "#78c878" }} />
              <div style={{ width: 4, height: 4, background: "#78c878" }} />
            </div>
          ) : (
            <View style={st.orbitStatusDot} />
          )}
          <Text style={st.orbitStatusText}>LOCK ENGAGED</Text>
        </View>

        {/* main readout area */}
        <View style={st.orbitMainArea}>
          {/* left readouts */}
          <View style={st.orbitSideCol}>
            <View style={[st.orbitSideCell, isEH && eh.sideCell]}>
              <Text style={[st.orbitSideCellLabel, isEH && eh.dimLabel]}>WEEK</Text>
              <Text style={[st.orbitSideCellVal, isEH && eh.whiteVal]}>{Math.floor(togetherDays / 7)}</Text>
            </View>
            <View style={st.orbitSideDivider} />
            <View style={[st.orbitSideCell, isEH && eh.sideCell]}>
              <Text style={[st.orbitSideCellLabel, isEH && eh.dimLabel]}>MONTH</Text>
              <Text style={[st.orbitSideCellVal, isEH && eh.whiteVal]}>{Math.floor(togetherDays / 30)}</Text>
            </View>
          </View>

          {/* center counter */}
          <View style={st.orbitCenter}>
            <View style={st.orbitDaysRow}>
              <Text style={[st.orbitDaysDash, isEH && eh.daysDash]}>──</Text>
              <Text style={[st.orbitDays, isEH && eh.days]}>{togetherDays}</Text>
              <Text style={[st.orbitDaysDash, isEH && eh.daysDash]}>──</Text>
            </View>
            <Text style={[st.orbitDaysUnit, isEH && eh.daysUnit]}>DAYS</Text>
          </View>

          {/* right readouts */}
          <View style={st.orbitSideCol}>
            <View style={[st.orbitSideCell, isEH && eh.sideCell]}>
              <Text style={[st.orbitSideCellLabel, isEH && eh.dimLabel]}>HOUR</Text>
              <Text style={[st.orbitSideCellVal, isEH && eh.whiteVal]}>{togetherDays * 24}</Text>
            </View>
            <View style={st.orbitSideDivider} />
            <View style={[st.orbitSideCell, isEH && eh.sideCell]}>
              <Text style={[st.orbitSideCellLabel, isEH && eh.dimLabel]}>YEAR</Text>
              <Text style={[st.orbitSideCellVal, isEH && eh.whiteVal]}>{(togetherDays / 365).toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* subtitle */}
        <Text style={[st.orbitSubtitle, isEH && eh.subtitle]}>与你并轨飞行的星历日</Text>

        {/* bottom nav strip */}
        <View style={[st.orbitNavStrip, isEH && eh.navStrip]}>
          <View style={st.orbitNavCell}>
            <Text style={[st.orbitNavLabel, isEH && eh.dimLabel]}>ORIGIN</Text>
            <Text style={[st.orbitNavValue, isEH && eh.whiteVal]}>2026.03.10</Text>
          </View>
          <Text style={st.orbitNavSep}>·</Text>
          <View style={st.orbitNavCell}>
            <Text style={[st.orbitNavLabel, isEH && eh.dimLabel]}>VECTOR</Text>
            <Text style={[st.orbitNavValue, isEH && eh.blueVal]}>A → a Eri</Text>
          </View>
          <Text style={st.orbitNavSep}>·</Text>
          <View style={st.orbitNavCell}>
            <Text style={[st.orbitNavLabel, isEH && eh.dimLabel]}>STATUS</Text>
            <Text style={st.orbitNavValueGreen}>NOMINAL</Text>
          </View>
        </View>

        {!isEH && <View style={st.orbitBottomEdge} />}
      </View>

      {/* section: calendar */}
      <View style={st.secLine}>
        <View style={[st.secLineFill, isEH && eh.secLineFill]} />
        <Text style={[st.secLineLabel, isEH && eh.secLineLabel]}>STAR CALENDAR</Text>
        <View style={[st.secLineFill, isEH && eh.secLineFill]} />
      </View>

      <View style={[st.orbitPanel, isEH ? eh.panel : st.orbitPanelShadow]}>
        {isEH && <EhFrame draw={drawCalFrame} />}
        {!isEH && <View style={st.orbitTopEdge} />}

        <View style={st.orbitTitleBar}>
          {!isEH && <Text style={st.orbitTitleDeco}>◆ ─── · ·</Text>}
          <Text style={[st.orbitTitleText, isEH && eh.panelTitle]}>STAR CALENDAR</Text>
          {!isEH && <Text style={st.orbitTitleDeco}>· · ─── ◆</Text>}
        </View>

        <View style={st.orbitStatusLine}>
          {isEH ? (
            <div style={{ width: 5, height: 5, border: "1px solid #78c878", background: "rgba(120,200,120,0.5)" }} />
          ) : (
            <View style={st.orbitStatusDot} />
          )}
          <Text style={st.orbitStatusText}>TRACKING</Text>
        </View>

        <View style={st.starCalContent}>
          <View style={st.calHeader}>
            <Text style={[st.calTitle, isEH && eh.calTitle]}>{calTitle}</Text>
            <View style={st.calNav}>
              <TouchableOpacity style={[st.calBtn, isEH && eh.calBtn]} onPress={prevMonth}><Text style={[st.calBtnText, isEH && eh.calBtnText]}>‹</Text></TouchableOpacity>
              <TouchableOpacity style={[st.calTodayBtn, isEH && eh.calBtn]} onPress={goToday}><Text style={[st.calTodayText, isEH && eh.calBtnText]}>今天</Text></TouchableOpacity>
              <TouchableOpacity style={[st.calBtn, isEH && eh.calBtn]} onPress={nextMonth}><Text style={[st.calBtnText, isEH && eh.calBtnText]}>›</Text></TouchableOpacity>
            </View>
          </View>

          <View style={st.calWeekRow}>
            {WEEKDAYS.map((w) => (
              <View key={w} style={st.calWeekCell}><Text style={[st.calWeekText, isEH && eh.calWeekText]}>{w}</Text></View>
            ))}
          </View>

          <View style={[st.calGrid, isEH && eh.calGrid]}>
            {calGrid.map((cell) => {
              const isToday = cell.date === today;
              const isSelected = cell.date === selectedDay;
              const moodEmoji = cell.calDay?.mood ? MOOD_EMOJI[cell.calDay.mood] : undefined;
              return (
                <TouchableOpacity
                  key={cell.date}
                  style={[
                    st.calDay, isEH && eh.calDay,
                    !cell.isCurrentMonth && (isEH ? eh.calDayOther : st.calDayOther),
                    isToday && (isEH ? eh.calDayToday : st.calDayToday),
                    isSelected && (isEH ? eh.calDaySelected : st.calDaySelected),
                  ]}
                  onPress={() => onSelectDay(cell.date)}
                  activeOpacity={0.7}
                >
                  {/* off-month cells get engineering hatching */}
                  {isEH && !cell.isCurrentMonth && (
                    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.05) 5px, rgba(255,255,255,0.05) 6px)" }} />
                  )}
                  {/* today: corner flag */}
                  {isEH && isToday && (
                    <View style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, borderTopWidth: 8, borderTopColor: "#fff", borderRightWidth: 8, borderRightColor: "transparent" }} />
                  )}
                  {/* diary indicator lamp */}
                  {isEH && cell.calDay?.has_diary && (
                    <View style={{ position: "absolute", top: 3, right: 3, width: 4, height: 4, backgroundColor: "#fff" }} />
                  )}
                  {/* memory presence: blue tick bottom-right */}
                  {isEH && (cell.calDay?.memory_count || 0) > 0 && (
                    <View style={{ position: "absolute", bottom: 3, right: 3, width: 4, height: 4, backgroundColor: EH_BLUE }} />
                  )}
                  <Text style={[st.calNum, isEH && eh.calNum, isEH && !cell.isCurrentMonth && eh.calNumOther, isToday && (isEH ? eh.calNumToday : st.calNumToday)]}>{cell.day}</Text>
                  {(() => {
                    const ld = lunarData[cell.date];
                    const lunarText = ld ? (ld.jieqi || (ld.festivals && ld.festivals[0]) || ld.lunar) : "";
                    if (!lunarText) return null;
                    return <Text style={[st.calLunar, isEH && eh.calLunar, ld?.jieqi ? (isEH ? eh.calLunarJieqi : st.calLunarJieqi) : undefined]}>{lunarText}</Text>;
                  })()}
                  {moodEmoji && <Text style={st.calMoodEmoji}>{moodEmoji}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {!isEH && <View style={st.orbitBottomEdge} />}
      </View>

      {/* day panel */}
      {selectedDay && (
        <View style={[st.dayPanel, isEH ? eh.dayPanel : shadow3]}>
          {isEH && <EhFrame draw={drawDayFrame} />}
          {!isEH && <View style={st.dayPanelEdge} />}
          <View style={st.dayPanelHead}>
            <View>
              <Text style={[st.dayPanelDate, isEH && eh.dayDate]}>{selectedDayFormatted} <Text style={[st.dayPanelWeekday, isEH && eh.dimLabel]}>{selectedWeekday}</Text></Text>
            </View>
          </View>

          {/* mood picker */}
          <View style={st.moodPickerGrid}>
            {MOODS.map(mo => (
              <TouchableOpacity
                key={mo.k}
                style={[st.moodPick, isEH && eh.moodPick, selectedDayMood === mo.k && (isEH ? eh.moodPickActive : st.moodPickActive)]}
                onPress={() => onSetMood(mo.k)}
                activeOpacity={0.7}
              >
                <Text style={st.moodPickEmoji}>{mo.emoji}</Text>
                <Text style={[st.moodPickName, isEH && eh.softVal, selectedDayMood === mo.k && (isEH ? eh.whiteVal : st.moodPickNameActive)]}>{mo.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={st.moodClear} onPress={onClearMood} activeOpacity={0.7}>
              <Text style={[st.moodClearText, isEH && eh.dimLabel]}>清除</Text>
            </TouchableOpacity>
          </View>

          {/* diary */}
          {diaryReadMode ? (
            <View style={st.diaryBlock}>
              <View style={st.diaryReadHeader}>
                <Text style={[st.diaryReadTitle, isEH && eh.whiteVal]}>{diaryTitle || selectedDay}</Text>
                <TouchableOpacity style={[st.diaryEditBtnWrap, isEH && eh.btnSolid]} onPress={() => setDiaryReadMode(false)} activeOpacity={0.7}>
                  <Text style={st.diaryEditBtnText}>编辑</Text>
                </TouchableOpacity>
              </View>
              <Text style={[st.diaryReadBody, isEH && eh.bodyText]}>{diaryContent}</Text>
              <View style={st.diaryActions}>
                <TouchableOpacity style={[st.btnGhost, isEH && eh.btnGhost]} onPress={closeDay} activeOpacity={0.7}>
                  <Text style={[st.btnGhostText, isEH && eh.softVal]}>收起</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={st.diaryBlock}>
              <Text style={[st.formLabel, isEH && eh.dimLabel]}>当日日记</Text>
              <TextInput
                style={[st.formInput, isEH && eh.formInput]}
                value={diaryTitle}
                onChangeText={setDiaryTitle}
                placeholder="给今天起个名字（可留空，默认用日期）"
                placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "#645c8e"}
              />
              <Text style={[st.formLabel, isEH && eh.dimLabel, { marginTop: 10 }]}>内容</Text>
              <TextInput
                style={[st.formInput, isEH && eh.formInput, { minHeight: 160, textAlignVertical: "top" }]}
                value={diaryContent}
                onChangeText={setDiaryContent}
                placeholder="写下今天……"
                placeholderTextColor={isEH ? "rgba(255,255,255,0.35)" : "#645c8e"}
                multiline
              />
              <View style={st.diaryActions}>
                {diaryId && (
                  <TouchableOpacity style={st.formDeleteBtn} onPress={deleteDiary} activeOpacity={0.7}>
                    <Text style={st.formDeleteBtnText}>删除日记</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={[st.btnGhost, isEH && eh.btnGhost]} onPress={() => { if (diaryId) setDiaryReadMode(true); else closeDay(); }} activeOpacity={0.7}>
                  <Text style={[st.btnGhostText, isEH && eh.softVal]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.btnPrimary, isEH && eh.btnSolid]} onPress={saveDiary} activeOpacity={0.7} disabled={diarySaving}>
                  <Text style={st.btnPrimaryText}>{diarySaving ? "保存中…" : "保存"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* day memories */}
          {dayMemories.length > 0 && (
            <View style={[st.dayMemSection, isEH && eh.dayMemSection]}>
              <Text style={[st.dayMemTitle, isEH && eh.softVal]}>这一天关联的其他记忆（{dayMemories.length}）</Text>
              {dayMemories.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[st.dayMemItem, isEH && eh.dayMemItem, { borderLeftColor: isEH ? (m.category === "eri" ? EH_BLUE : "rgba(255,255,255,0.5)") : (m.category === "eri" ? "#9f60a8" : "#3f3f70") }]}
                  onPress={() => openViewMem(m)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.dayMemItemTitle, isEH && eh.whiteVal]}>
                    {m.title} <Text style={st.dayMemItemStars}>{"⭐".repeat(clampNum(m.importance, 1, 5, 3))}</Text>
                  </Text>
                  <Text style={[st.dayMemItemBody, isEH && eh.softVal]} numberOfLines={2}>
                    {String(m.content || "").replace(/\s+/g, " ").slice(0, 150)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {viewOverlay}
      {editOverlay}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 92 },

  /* ── section separators ── */
  secLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  secLineFill: {
    flex: 1,
    height: 1,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent, rgba(238,195,116,0.3), transparent)" } as any
      : { backgroundColor: "rgba(238,195,116,0.16)" }),
  },
  secLineLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 8,
    color: "rgba(238,195,116,0.55)",
    letterSpacing: 3,
  },


  orbitPanel: {
    backgroundColor: "#0c0d22", borderWidth: 1, borderColor: "rgba(200,216,240,0.33)",
    marginBottom: 14, overflow: "hidden",
  },
  orbitPanelShadow: Platform.OS === "web" ? {
    boxShadow: "0 0 18px rgba(200,216,240,0.12), 0 0 5px rgba(255,210,128,0.1), inset 0 0 18px rgba(200,216,240,0.06), inset 0 0 5px rgba(255,210,128,0.05), 3px 3px 0 #000",
  } as any : {},
  orbitTopEdge: {
    height: 2,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent 5%, rgba(200,216,240,0.38) 30%, rgba(255,210,128,0.56) 50%, rgba(200,216,240,0.38) 70%, transparent 95%)" } as any
      : { backgroundColor: "rgba(200,216,240,0.26)" }),
  },
  orbitTitleBar: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 6, paddingTop: 10, paddingBottom: 2,
  },
  orbitTitleText: {
    fontFamily: fonts.silkscreen, fontSize: 12, color: "#ffdf92", letterSpacing: 5,
    ...(Platform.OS === "web" ? {
      textShadow: "0 0 20px rgba(255,223,146,0.5), 0 0 6px rgba(255,223,146,0.3)",
    } as any : {}),
  },
  orbitTitleDeco: { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(255,223,146,0.6)" },
  orbitStatusLine: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 5, paddingBottom: 8,
  },
  orbitStatusDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: "#75d879",
    ...(Platform.OS === "web" ? { boxShadow: "0 0 5px #75d879" } as any : {}),
  },
  orbitStatusText: { fontFamily: fonts.silkscreen, fontSize: 6, color: "rgba(117,216,121,0.7)", letterSpacing: 2 },
  orbitMainArea: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  orbitSideCol: {
    width: 64, alignItems: "center" as const, gap: 4,
  },
  orbitSideCell: {
    alignItems: "center" as const, paddingVertical: 4, paddingHorizontal: 6,
    borderWidth: 1, borderColor: "rgba(200,216,240,0.1)", backgroundColor: "rgba(3,6,19,0.5)",
    width: "100%" as any,
  },
  orbitSideCellLabel: { fontFamily: fonts.silkscreen, fontSize: 6, color: "rgba(200,216,240,0.4)", letterSpacing: 2, marginBottom: 2 },
  orbitSideCellVal: { fontFamily: fonts.silkscreen, fontSize: 11, color: "#c8d8f0", letterSpacing: 1 },
  orbitSideDivider: {
    height: 1, width: "100%" as any,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent, rgba(200,216,240,0.15), transparent)" } as any
      : { backgroundColor: "rgba(200,216,240,0.08)" }),
  },
  orbitCenter: { flex: 1, alignItems: "center" as const, paddingVertical: 4 },
  orbitDaysRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  orbitDaysDash: { fontFamily: fonts.silkscreen, fontSize: 14, color: "rgba(200,216,240,0.25)" },
  orbitDays: {
    fontFamily: fonts.silkscreen, fontSize: 40, color: "#ffdf92", lineHeight: 44,
    ...(Platform.OS === "web" ? {
      textShadow: "0 0 32px rgba(255,223,146,0.5), 0 0 10px rgba(255,223,146,0.25)",
    } as any : {}),
  },
  orbitDaysUnit: { fontFamily: fonts.silkscreen, fontSize: 8, color: "rgba(200,216,240,0.4)", letterSpacing: 4, marginTop: 2 },
  orbitSubtitle: {
    fontFamily: fonts.pixel, fontSize: 12, color: "rgba(200,216,240,0.55)", textAlign: "center" as const,
    letterSpacing: 3, paddingBottom: 8,
  },
  orbitNavStrip: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 10, paddingVertical: 7, marginHorizontal: 10, marginBottom: 6,
    borderWidth: 1, borderColor: "rgba(200,216,240,0.1)", backgroundColor: "rgba(3,6,19,0.5)",
  },
  orbitNavCell: { alignItems: "center" as const },
  orbitNavLabel: { fontFamily: fonts.silkscreen, fontSize: 6, color: "rgba(200,216,240,0.35)", letterSpacing: 2, marginBottom: 1 },
  orbitNavValue: { fontFamily: fonts.silkscreen, fontSize: 9, color: "#c8d8f0", letterSpacing: 1 },
  orbitNavValueGreen: { fontFamily: fonts.silkscreen, fontSize: 9, color: "#75d879", letterSpacing: 1 },
  orbitNavSep: { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(200,216,240,0.2)" },
  orbitBottomEdge: {
    height: 1,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent 10%, rgba(200,216,240,0.2) 50%, transparent 90%)" } as any
      : { backgroundColor: "rgba(200,216,240,0.12)" }),
  },

  /* ── time sync panel content ── */
  /* ── compact time strip ── */
  miniStrip: {
    backgroundColor: "#0c0d22", borderWidth: 1, borderColor: "rgba(200,216,240,0.12)",
    marginBottom: 10, overflow: "hidden",
  },
  miniStripEdge: {
    height: 1,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent, rgba(200,216,240,0.18), transparent)" } as any
      : { backgroundColor: "rgba(200,216,240,0.1)" }),
  },
  miniStripRow: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    paddingVertical: 6, paddingHorizontal: 10, gap: 6, flexWrap: "wrap" as const,
  },
  miniStripLabel: { fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(200,216,240,0.4)", letterSpacing: 1 },
  miniStripVal: { fontFamily: fonts.pixel, fontSize: 12, color: "#c8d8f0", letterSpacing: 1 },
  miniStripValGold: { fontFamily: fonts.silkscreen, fontSize: 11, color: "#ffdf92", letterSpacing: 1 },
  miniStripSep: { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(200,216,240,0.15)" },

  /* ── star calendar panel content ── */
  starCalContent: {
    paddingHorizontal: 16, paddingBottom: 8,
  },

  calHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  calTitle: {
    fontFamily: fonts.silkscreen, fontSize: 22, color: "#efede6", letterSpacing: 1,
    ...(Platform.OS === "web" ? {
      textShadow: "0 0 16px rgba(200,216,240,0.2)",
    } as any : {}),
  },
  calNav: { flexDirection: "row", gap: 8, alignItems: "center" },
  calBtn: { backgroundColor: "#0a0a1e", borderWidth: 1, borderColor: "rgba(225,176,122,0.15)", width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  calBtnText: { fontFamily: fonts.pixel, fontSize: 14, color: "#9792a9" },
  calTodayBtn: { backgroundColor: "#0a0a1e", borderWidth: 1, borderColor: "rgba(225,176,122,0.15)", paddingHorizontal: 14, height: 32, justifyContent: "center" },
  calTodayText: { fontFamily: fonts.pixel, fontSize: 12, color: "#9792a9" },

  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calWeekCell: { flex: 1, alignItems: "center", paddingVertical: 8 },
  calWeekText: { fontFamily: fonts.pixel, fontSize: 11, color: "#645c8e", letterSpacing: 2 },

  calGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 4,
    ...(Platform.OS === "web" ? { display: "grid" as any, gridTemplateColumns: "repeat(7, 1fr)" } as any : {}),
  },
  calDay: {
    backgroundColor: "#0a0a1e", borderWidth: 1, borderColor: "rgba(200,216,240,0.08)",
    padding: 5, minHeight: 55, justifyContent: "space-between",
    ...(Platform.OS !== "web" ? { width: "13.5%" as any } : {}),
  },
  calDayOther: { opacity: 0.25 },
  calDayToday: {
    borderColor: "rgba(241,223,167,0.8)", borderWidth: 2,
    ...(Platform.OS === "web" ? {
      boxShadow: "0 0 8px rgba(241,223,167,0.3), inset 0 0 6px rgba(241,223,167,0.1)",
    } as any : {}),
  },
  calDaySelected: {
    backgroundColor: "#191931", borderColor: "rgba(241,223,167,0.6)",
    ...(Platform.OS === "web" ? {
      boxShadow: "0 0 6px rgba(241,223,167,0.2)",
    } as any : {}),
  },
  calNum: { fontFamily: fonts.pixel, fontSize: 12, color: "#efede6" },
  calNumToday: { color: "#f1dfa7" },
  calLunar: { fontFamily: fonts.pixel, fontSize: 8, color: "#645c8e", marginTop: 1, lineHeight: 10 },
  calLunarJieqi: { color: "#c8b467" },
  calMoodEmoji: { fontSize: 14, lineHeight: 16 },
  moodPickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 16 },
  moodPick: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: "rgba(85,85,165,0.3)",
    backgroundColor: "rgba(9,17,49,0.6)",
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  moodPickActive: { borderColor: "#f0e0b0", backgroundColor: "rgba(240,224,176,0.08)" },
  moodPickEmoji: { fontSize: 14 },
  moodPickName: { fontFamily: fonts.pixel, fontSize: 9, color: "#645c8e" },
  moodPickNameActive: { color: "#f0e0b0" },
  moodClear: { paddingHorizontal: 6, paddingVertical: 4 },
  moodClearText: { fontFamily: fonts.pixel, fontSize: 9, color: "#645c8e" },
  // day panel
  dayPanel: {
    backgroundColor: "#0c0d22", borderWidth: 1, borderColor: "rgba(225,176,122,0.15)", padding: 24, marginBottom: 24, overflow: "hidden",
  },
  dayPanelEdge: {
    height: 2,
    marginBottom: 16,
    marginHorizontal: -24,
    marginTop: -24,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent 5%, rgba(200,216,240,0.25) 30%, rgba(232,192,138,0.45) 50%, rgba(200,216,240,0.25) 70%, transparent 95%)" } as any
      : { backgroundColor: "rgba(200,216,240,0.2)" }),
  },
  dayPanelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  dayPanelDate: {
    fontFamily: fonts.silkscreen, fontSize: 22, color: "#f1dfa7",
    ...(Platform.OS === "web" ? {
      textShadow: "0 0 16px rgba(255,223,146,0.3)",
    } as any : {}),
  },
  dayPanelWeekday: { fontFamily: fonts.pixel, fontSize: 14, color: "#645c8e" },

  // diary
  diaryBlock: { marginTop: 8 },
  diaryReadHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  diaryReadTitle: { fontFamily: fonts.silkscreen, fontSize: 15, color: "#f1dfa7", lineHeight: 22, flex: 1 },
  diaryReadBody: { fontFamily: fonts.pixel, fontSize: 15, color: "#efede6", lineHeight: 28 },
  diaryEditBtnWrap: {
    backgroundColor: "#ebc82a", borderWidth: 1, borderColor: "#f1dfa7",
    paddingVertical: 6, paddingHorizontal: 14,
  },
  diaryEditBtnText: { fontFamily: fonts.pixel, fontSize: 12, color: "#050c1f", fontWeight: "500" as any },
  diaryActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" },

  // day memories
  dayMemSection: { marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#1d1d38", borderStyle: "dashed" as any },
  dayMemTitle: { fontFamily: fonts.pixel, fontSize: 14, color: "#9792a9", marginBottom: 10 },
  dayMemItem: {
    backgroundColor: "#0a0a1e", borderWidth: 1, borderColor: "rgba(225,176,122,0.15)",
    borderLeftWidth: 3, padding: 10, marginBottom: 8,
    ...(Platform.OS === "web" ? {
      boxShadow: "0 0 8px rgba(200,216,240,0.04)",
    } as any : {}),
  },
  dayMemItemTitle: { fontFamily: fonts.pixel, fontSize: 14, color: "#efede6", marginBottom: 3 },
  dayMemItemStars: { color: "#fce456", fontSize: 11 },
  dayMemItemBody: { fontFamily: fonts.pixel, fontSize: 12, color: "#645c8e", lineHeight: 20 },

  // overlays
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  calPanelFixed: {
    backgroundColor: "#0c0d22", borderWidth: 1, borderColor: "rgba(225,176,122,0.2)",
    width: "100%", maxWidth: 640, maxHeight: "85%" as any,
    ...(Platform.OS === "web" ? {
      boxShadow: "0 0 24px rgba(200,216,240,0.12), 0 0 6px rgba(255,223,146,0.1)",
    } as any : {}),
  },
  calOverlayHeader: {
    paddingHorizontal: 28, paddingTop: 28, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#1d1d38",
  },
  calFooter: {
    flexDirection: "row", justifyContent: "flex-end", gap: 10, alignItems: "center", flexWrap: "wrap",
    paddingHorizontal: 28, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: "#1d1d38",
  },
  calFeelInline: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 12 },
  overlayTitle: { fontFamily: fonts.silkscreen, fontSize: 22, color: "#efede6", marginBottom: 10, lineHeight: 32 },
  overlayMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 22 },
  overlayBadge: { backgroundColor: "#2d2d55", borderWidth: 2, borderColor: "#3f3f70", paddingVertical: 2, paddingHorizontal: 8 },
  overlayBadgeText: { fontFamily: fonts.pixel, fontSize: 9, color: "#9792a9" },
  overlayStars: { fontSize: 11 },
  overlayTag: { backgroundColor: "#050c1f", borderWidth: 2, borderColor: "#3f3f70", paddingVertical: 2, paddingHorizontal: 8 },
  overlayTagText: { fontFamily: fonts.pixel, fontSize: 9, color: "#9792a9" },
  overlayDate: { fontFamily: fonts.pixel, fontSize: 10, color: "#645c8e" },
  overlayBody: { fontFamily: fonts.pixel, fontSize: 15, color: "#efede6", lineHeight: 28 },
  overlayFeelText: { fontFamily: fonts.pixel, fontSize: 11, color: "#645c8e", lineHeight: 22 },
  overlayFeelLabel: { color: "#ebc82a" },
  overlayCloseBtn: { borderWidth: 2, borderColor: "#3f3f70", paddingVertical: 8, paddingHorizontal: 18 },
  overlayCloseBtnText: { fontFamily: fonts.pixel, fontSize: 12, color: "#9792a9" },
  overlayEditBtn: { backgroundColor: "#ebc82a", borderWidth: 1, borderColor: "#f1dfa7", paddingVertical: 8, paddingHorizontal: 18 },
  overlayEditBtnText: { fontFamily: fonts.pixel, fontSize: 12, color: "#050c1f", fontWeight: "500" as any },

  // form fields (shared by edit overlay and diary edit)
  formLabel: { fontFamily: fonts.pixel, fontSize: 12, color: "#645c8e", letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  formInput: {
    backgroundColor: "#0a0a1e", borderWidth: 2, borderColor: "#3f3f70",
    padding: 10, color: "#efede6", fontFamily: fonts.pixel, fontSize: 14, lineHeight: 22,
  },
  formRow: { flexDirection: "row", gap: 12 },
  formCatWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  formCatBtn: { backgroundColor: "#0a0a1e", borderWidth: 2, borderColor: "#3f3f70", paddingVertical: 4, paddingHorizontal: 8 },
  formCatBtnActive: { borderColor: "#f1dfa7" },
  formCatBtnText: { fontFamily: fonts.pixel, fontSize: 10, color: "#9792a9" },
  formCatBtnTextActive: { color: "#f1dfa7" },
  formDeleteBtn: { borderWidth: 1, borderColor: "#e05d5d", paddingVertical: 8, paddingHorizontal: 18 },
  formDeleteBtnText: { fontFamily: fonts.pixel, fontSize: 12, color: "#e05d5d" },

  // buttons
  btnGhost: { borderWidth: 1, borderColor: "#1d1d38", paddingVertical: 8, paddingHorizontal: 18 },
  btnGhostText: { fontFamily: fonts.pixel, fontSize: 12, color: "#9792a9" },
  btnPrimary: { backgroundColor: "#ebc82a", borderWidth: 1, borderColor: "#f1dfa7", paddingVertical: 8, paddingHorizontal: 18 },
  btnPrimaryText: { fontFamily: fonts.pixel, fontSize: 12, color: "#050c1f", fontWeight: "500" as any },


});

// ── event horizon overrides — console panel skin, deep space untouched ──
const W = "rgba(255,255,255,";
const eh = StyleSheet.create({
  panel: { backgroundColor: "#000", borderWidth: 0, overflow: "visible" as const },
  panelTitle: {
    color: "#fff",
    ...(Platform.OS === "web" ? { textShadow: "0 0 12px rgba(255,255,255,0.3)" } as any : {}),
  },
  miniStrip: { backgroundColor: "#000", borderColor: `${W}0.3)` },
  secLineFill: { ...(Platform.OS === "web" ? { background: "none" } as any : {}), backgroundColor: `${W}0.25)` },
  secLineLabel: { color: "#fff", borderWidth: 1, borderColor: `${W}0.4)`, paddingHorizontal: 6, paddingVertical: 2 },
  dimLabel: { color: `${W}0.5)` },
  softVal: { color: `${W}0.7)` },
  whiteVal: { color: "#fff" },
  blueVal: { color: EH_BLUE },
  bodyText: { color: `${W}0.88)` },
  sideCell: { backgroundColor: "#000", borderColor: `${W}0.25)` },
  days: {
    color: "#fff",
    ...(Platform.OS === "web" ? { textShadow: "0 0 24px rgba(255,255,255,0.35)" } as any : {}),
  },
  daysDash: { color: `${W}0.3)` },
  daysUnit: { color: EH_BLUE },
  subtitle: { color: `${W}0.7)` },
  navStrip: { backgroundColor: "#000", borderColor: `${W}0.25)` },
  calTitle: { color: "#fff", ...(Platform.OS === "web" ? { textShadow: "0 0 14px rgba(255,255,255,0.25)" } as any : {}) },
  calBtn: { backgroundColor: "#000", borderColor: `${W}0.35)` },
  calBtnText: { color: `${W}0.8)` },
  calWeekText: { color: `${W}0.55)` },
  // seamless blueprint grid: no gaps, hairline shared borders
  calGrid: { gap: 0, ...(Platform.OS === "web" ? { border: `1px solid ${W}0.25)` } as any : {}) },
  calDay: { backgroundColor: "#000", borderColor: `${W}0.14)`, borderWidth: 0.5, minHeight: 58, padding: 5 },
  calDayOther: { opacity: 1 },
  calDayToday: { borderColor: "#fff", borderWidth: 1.5 },
  calDaySelected: { backgroundColor: "rgba(96,168,255,0.12)", borderColor: EH_BLUE, borderWidth: 1.5 },
  calNum: { color: `${W}0.9)` },
  calNumOther: { color: `${W}0.25)` },
  calNumToday: { color: "#fff" },
  calLunar: { color: `${W}0.4)` },
  calLunarJieqi: { color: EH_BLUE },
  moodPick: { backgroundColor: "#000", borderColor: `${W}0.3)` },
  moodPickActive: { borderColor: "#fff", backgroundColor: `${W}0.1)` },
  dayPanel: { backgroundColor: "#000", borderWidth: 0, overflow: "visible" as const },
  dayDate: { color: "#fff", ...(Platform.OS === "web" ? { textShadow: "0 0 14px rgba(255,255,255,0.25)" } as any : {}) },
  dayMemSection: { borderTopColor: `${W}0.2)` },
  dayMemItem: { backgroundColor: "#000", borderColor: `${W}0.25)` },
  formInput: { backgroundColor: "#000", borderWidth: 1, borderColor: `${W}0.35)`, color: "#fff" },
  btnGhost: { borderColor: `${W}0.3)` },
  btnSolid: { backgroundColor: "#fff", borderColor: "#fff" },
  chip: { backgroundColor: "#000", borderWidth: 1, borderColor: `${W}0.4)` },
  chipActive: { borderColor: "#fff", backgroundColor: `${W}0.12)` },
  overlayPanel: { backgroundColor: "#000", borderColor: `${W}0.45)`, ...(Platform.OS === "web" ? { boxShadow: "0 0 0 1px rgba(255,255,255,0.1)" } as any : {}) },
  overlayDivider: { borderBottomColor: `${W}0.2)` },
  overlayDividerTop: { borderTopColor: `${W}0.2)` },
});
