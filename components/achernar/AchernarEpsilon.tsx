import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EhDataRow, EhFrame, ehOutline, ehBars, ehSlashes } from "../decor/EhParts";
import { EH_BLUE } from "../bridge/BridgeDashboard";
import DrivesoidPanel from "./DrivesoidPanel";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  api,
  CompanionNote,
  ConcernItem,
  CurrentMood,
  DrivesResponse,
  StellarHistorySnapshot,
  StellarReadings,
  StellarSensesResponse,
  SurfaceMemory,
  VoyageEvent,
  VoyageLog,
  Voyage,
} from "../../services/api";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";
import StellarReadingsPanel from "./StellarReadingsPanel";
import CornerBrackets from "../decor/CornerBrackets";


function moodBand(
  pa: number,
  na: number,
  theme: ThemeTokens,
): { label: string; color: string } {
  if (pa > 0.6 && na < 0.4) return { label: "晴", color: theme.riverGlow.gold };
  if (na > 0.6 && pa < 0.4) return { label: "暗", color: theme.riverGlow.goldDim };
  if (pa > 0.5 && na > 0.5) return { label: "复杂", color: theme.riverGlow.gold };
  if (pa < 0.4 && na < 0.4) return { label: "平", color: theme.textDim };
  return { label: "—", color: theme.textMuted };
}

function spectrumClass(v: number): string {
  if (v < 0.08) return "O";
  if (v < 0.18) return "B";
  if (v < 0.32) return "A";
  if (v < 0.45) return "F";
  if (v < 0.62) return "G";
  if (v < 0.78) return "K";
  return "M";
}

function dimWord(key: string, v: number): string {
  if (key === "luminosity") {
    if (v < 0.3) return "暗淡";
    if (v < 0.6) return "平稳";
    return "明亮";
  }
  if (key === "gravity") {
    if (v < 0.3) return "微弱";
    if (v < 0.6) return "中等";
    return "强烈";
  }
  if (key === "magnetic") {
    if (v < 0.3) return "平静";
    if (v < 0.6) return "活跃";
    return "风暴";
  }
  if (key === "radiance") {
    if (v < 0.3) return "收敛";
    if (v < 0.6) return "温和";
    return "炽热";
  }
  return "";
}

function formatPhysicsLine(dims: StellarReadings["dimensions"]): string {
  const sp = spectrumClass(dims.spectrum);
  const lu = dimWord("luminosity", dims.luminosity);
  const gr = dimWord("gravity", dims.gravity);
  const mg = dimWord("magnetic", dims.magnetic);
  const rd = dimWord("radiance", dims.radiance);
  return `${sp}型 · 光度${lu} · 引力${gr} · 磁场${mg} · 辐射${rd}`;
}

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 2) + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.4;
    pts.push(`${(cx + rr * Math.cos(angle)).toFixed(1)},${(cy - rr * Math.sin(angle)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

const DIM_LABELS: Record<string, string> = {
  spectrum: "光谱",
  luminosity: "光度",
  gravity: "引力",
  magnetic: "磁场",
  radiance: "辐射",
};

const DIM_KEYS = ["spectrum", "luminosity", "gravity", "magnetic", "radiance"];

const DRIVE_CELLS = 20;

const SEEK_SHAPE_ZH: Record<string, string> = {
  symmetric: "U形",
  refractory: "不应期",
  bonding: "连接",
  owed: "欠债",
};

const SENSE_ZH: Record<string, string> = {
  corona: "日冕",
  solar_wind: "星风",
  absorption: "吸收线",
  resonance: "共振",
  flare: "耀斑",
  tidal: "潮汐力",
  core_temp: "星核温度",
};

const SENSE_CELLS = 20;

function driveGradient(key: string, i: number): string {
  const t = i / 19;
  switch (key) {
    case "attachment":
      return `rgb(${Math.round(110 + t * 140)},${Math.round(90 + t * 80)},${Math.round(80 + t * 30)})`;
    case "curiosity":
      return `rgb(${Math.round(80 + t * 40)},${Math.round(110 + t * 110)},${Math.round(130 + t * 125)})`;
    case "reflection":
      return `rgb(${Math.round(95 + t * 65)},${Math.round(105 + t * 75)},${Math.round(125 + t * 105)})`;
    case "concern":
      return `rgb(${Math.round(120 + t * 130)},${Math.round(105 + t * 100)},${Math.round(70 + t * 30)})`;
    case "social":
      return `rgb(${Math.round(80 + t * 30)},${Math.round(115 + t * 115)},${Math.round(110 + t * 90)})`;
    case "cuddle":
      return `rgb(${Math.round(120 + t * 125)},${Math.round(90 + t * 65)},${Math.round(95 + t * 55)})`;
    case "blocked":
      return `rgb(${Math.round(100 + t * 95)},${Math.round(85 + t * 40)},${Math.round(120 + t * 115)})`;
    case "fatigue":
      return `rgb(${Math.round(90 + t * 60)},${Math.round(100 + t * 70)},${Math.round(115 + t * 85)})`;
    default:
      return `rgb(${Math.round(90 + t * 60)},${Math.round(100 + t * 65)},${Math.round(115 + t * 80)})`;
  }
}

function driveSourceHint(
  key: string,
  dims: StellarReadings["dimensions"] | null,
): string | null {
  if (!dims) return null;
  switch (key) {
    case "attachment":
      if (dims.gravity > 0.65) return "← 引力";
      if (dims.radiance > 0.65) return "← 辐射";
      return null;
    case "curiosity":
      if (dims.gravity < 0.3) return "← 引力弱";
      if (dims.spectrum < 0.25) return "← 光谱蓝";
      return null;
    case "reflection":
      if (dims.radiance < 0.3) return "← 辐射冷";
      if (dims.magnetic > 0.65) return "← 磁场";
      return null;
    case "social":
      if (dims.luminosity > 0.65) return "← 光度";
      return null;
    case "cuddle":
      if (dims.radiance > 0.65) return "← 辐射";
      if (dims.gravity > 0.65) return "← 引力";
      return null;
    case "blocked":
      if (dims.magnetic > 0.65) return "← 磁场";
      return null;
    case "fatigue":
      if (dims.luminosity < 0.3) return "← 光度暗";
      return null;
    default:
      return null;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

function daysSince(iso: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

const EVENT_ICONS: Record<string, string> = {
  weather: "☀",
  encounter: "✦",
  voyage: "🚀",
  discovery: "💎",
  return: "⚓",
};

function formatEventTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function formatLogDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const thisYear = todayDateStr().slice(0, 4);
  const label = `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
  return y !== thisYear ? `${y}年${label}` : label;
}

function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function todayDateStr(): string {
  const now = new Date();
  const offset = 8 * 60;
  const local = new Date(now.getTime() + offset * 60000);
  return local.toISOString().slice(0, 10);
}

interface Props {
  onNavigate?: (tab: string) => void;
}

// ── EH panel frames — spaceship console hardware, one SVG per card. ──
// Approved language (SYS-01, 7/5): one-stroke outline with staggered SHARP cuts
// (miter joins), a notched/bumped top edge, weld blocks riding the edges,
// barcode inset in the border, ruler teeth, L-braces. Nothing repeats verbatim.
const FRLN = "rgba(255,255,255,0.7)";
const FRDIM = "rgba(255,255,255,0.35)";
const FR_G = { strokeLinejoin: "miter", strokeLinecap: "square" } as any;

/** SYS-01 · MOOD — top notch, big tr cut, left welds, bottom barcode, bl L-brace.
 *  Top-right stays clear: the ACTIVE lamp group lives there (Eri, 7/5). */
const drawMoodFrame = (w: number, h: number) => (
  <g {...FR_G}>
    <path d={ehOutline(w, h, { tl: 6, tr: 18, br: 6 }, { type: "notch", x0: 110, x1: 210, d: 5 })} stroke={FRLN} strokeWidth="1.2" fill="none" />
    <rect x={-2} y={h * 0.38} width={5} height={9} fill={FRLN} />
    <rect x={-2} y={h * 0.38 + 14} width={5} height={9} fill={FRDIM} />
    <path d={`M4 ${h - 13} L4 ${h - 4} L13 ${h - 4}`} stroke={FRDIM} strokeWidth="1" fill="none" />
    {ehBars(w - 96, w - 22, h - 8, 6, 3)}
  </g>
);

/** TRK-01 · TRACE — v3: br cut, notch right, weighted top-left edge run, bl slash group, bottom-left barcode */
const drawTraceFrame = (w: number, h: number) => (
  <g {...FR_G}>
    <path d={ehOutline(w, h, { br: 24 }, { type: "notch", x0: w - 150, x1: w - 64, d: 4 })} stroke={FRLN} strokeWidth="1.2" fill="none" />
    <line x1={0.5} y1={1} x2={110} y2={1} stroke={FRLN} strokeWidth="3" />
    {ehSlashes(w - 60, h - 16, 4, 8, 5, FRDIM, 1)}
    {ehBars(14, 78, h - 8, 6, 7)}
    <rect x={w - 3} y={h * 0.28} width={5} height={9} fill={FRLN} />
  </g>
);

/** CAUSAL · OVERLAY — v3: diagonal cut pair, raised top bump, weighted bump shoulders, midpoint welds */
const drawCausalFrame = (w: number, h: number) => (
  <g {...FR_G}>
    <path d={ehOutline(w, h, { tl: 14, br: 14 }, { type: "bump", x0: w / 2 - 32, x1: w / 2 + 32, d: 3 })} stroke={FRLN} strokeWidth="1.2" fill="none" />
    <line x1={w / 2 - 72} y1={1} x2={w / 2 - 38} y2={1} stroke={FRLN} strokeWidth="3" />
    <line x1={w / 2 + 38} y1={1} x2={w / 2 + 72} y2={1} stroke={FRLN} strokeWidth="3" />
    <rect x={-2} y={h / 2 - 4} width={5} height={8} fill={FRDIM} />
    <rect x={w - 3} y={h / 2 - 4} width={5} height={8} fill={FRDIM} />
    <line x1={w / 2 - 20} y1={h - 0.5} x2={w / 2 + 20} y2={h - 0.5} stroke={FRLN} strokeWidth="3" />
  </g>
);

/** WX-01 · WEATHER — v4: clean right-angle hull, weighted diagonal edge runs (tl/br),
 *  left weld, bottom-left barcode, br slash group. Top-right stays clear for the LIVE lamp. */
const drawWeatherFrame = (w: number, h: number) => (
  <g {...FR_G}>
    <path d={ehOutline(w, h, {})} stroke={FRLN} strokeWidth="1.2" fill="none" />
    <line x1={0.5} y1={1} x2={96} y2={1} stroke={FRLN} strokeWidth="3" />
    <line x1={w - 96} y1={h - 1} x2={w - 0.5} y2={h - 1} stroke={FRLN} strokeWidth="3" />
    <rect x={-2} y={h * 0.32} width={5} height={9} fill={FRLN} />
    {ehBars(16, 78, h - 8, 6, 13)}
    {ehSlashes(w - 46, h - 18, 4, 8, 5, FRDIM, 1)}
  </g>
);

/** NAV-01 · VOYAGE — v3: notch clear of the placard, tr cut, weighted run before the notch, nav-light column, br slash group */
const drawVoyageFrame = (w: number, h: number) => (
  <g {...FR_G}>
    <path d={ehOutline(w, h, { tr: 20 }, { type: "notch", x0: 150, x1: 242, d: 5 })} stroke={FRLN} strokeWidth="1.2" fill="none" />
    <line x1={0.5} y1={1} x2={130} y2={1} stroke={FRLN} strokeWidth="3" />
    <rect x={w - 3} y={h * 0.28} width={5} height={8} fill={FRLN} />
    <rect x={w - 3} y={h * 0.28 + 13} width={5} height={8} fill={FRDIM} />
    <rect x={w - 3} y={h * 0.28 + 26} width={5} height={8} fill={FRDIM} />
    {ehSlashes(w - 58, h - 16, 4, 8, 5, FRDIM, 1)}
  </g>
);

/** CAB-01 · WHISPER — raised bump + solid dash on top, big bl cut + echo, right weld */
const drawCabinFrame = (w: number, h: number) => (
  <g {...FR_G}>
    <path d={ehOutline(w, h, { tr: 6, br: 6, bl: 18 }, { type: "bump", x0: w * 0.42, x1: w * 0.42 + 26, d: 3 })} stroke={FRLN} strokeWidth="1.2" fill="none" />
    <line x1={w * 0.42 + 44} y1={0.5} x2={w * 0.42 + 58} y2={0.5} stroke={FRLN} strokeWidth="3" />
    <line x1={7} y1={h - 22} x2={22} y2={h - 7} stroke={FRDIM} strokeWidth="1" />
    <rect x={w - 3} y={h * 0.42} width={5} height={9} fill={FRDIM} />
    {ehBars(w - 70, w - 14, h - 8, 6, 29)}
    <line x1={14} y1={0.5} x2={14} y2={4} stroke={FRDIM} strokeWidth="1" />
    <line x1={20} y1={0.5} x2={20} y2={4} stroke={FRDIM} strokeWidth="1" />
  </g>
);

/** LOG-01 · INNER — v3: tr cut, centered notch + barcode, weighted symmetric bottom shoulders, left weld */
const drawInnerFrame = (w: number, h: number) => (
  <g {...FR_G}>
    <path d={ehOutline(w, h, { tr: 14 }, { type: "notch", x0: w / 2 - 34, x1: w / 2 + 34, d: 4 })} stroke={FRLN} strokeWidth="1.2" fill="none" />
    <line x1={w / 2 - 76} y1={h - 1} x2={w / 2 - 40} y2={h - 1} stroke={FRLN} strokeWidth="3" />
    <line x1={w / 2 + 40} y1={h - 1} x2={w / 2 + 76} y2={h - 1} stroke={FRLN} strokeWidth="3" />
    {ehBars(w / 2 - 28, w / 2 + 28, h - 8, 6, 17)}
    <rect x={-2} y={h / 2 - 4} width={5} height={8} fill={FRLN} />
  </g>
);

export default function AchernarEpsilon({ onNavigate }: Props = {}) {
  const theme = useThemeTokens();
  const isEH = theme.key === "eventHorizon" && Platform.OS === "web";
  const s = useMemo(() => createStyles(theme), [theme]);
  const epsTheme = theme.homePanel;
  const [currentMood, setCurrentMood] = useState<CurrentMood | null>(null);
  const [moodHistoryOpen, setMoodHistoryOpen] = useState(false);
  const [moodHistory, setMoodHistory] = useState<CompanionNote[]>([]);
  const [moodHistoryLoading, setMoodHistoryLoading] = useState(false);
  const [murmurs, setMurmurs] = useState<CompanionNote[]>([]);
  const [murmurOpen, setMurmurOpen] = useState(false);
  const [murmurPage, setMurmurPage] = useState(0);
  const [stellar, setStellar] = useState<StellarReadings | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [voyageDate, setVoyageDate] = useState(todayDateStr());
  const [voyageLog, setVoyageLog] = useState<VoyageLog | null>(null);
  const [voyageEvents, setVoyageEvents] = useState<VoyageEvent[]>([]);
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [voyageLoading, setVoyageLoading] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [earliestDate, setEarliestDate] = useState<string | null>(null);
  const [stellarHistory, setStellarHistory] = useState<StellarHistorySnapshot[]>([]);
  const [driveState, setDriveState] = useState<DrivesResponse["state"] | null>(null);
  const [stellarSenses, setStellarSenses] = useState<StellarSensesResponse | null>(null);
  const [surfaceMemories, setSurfaceMemories] = useState<SurfaceMemory[]>([]);
  const [concerns, setConcerns] = useState<ConcernItem[]>([]);

  const legendaryAnim = useRef(new Animated.Value(0.6)).current;

  const MURMUR_PER_PAGE = 5;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(legendaryAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(legendaryAnim, {
          toValue: 0.6,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [legendaryAnim]);

  const loadVoyage = useCallback(async (date: string, opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setVoyageLoading(true);
    try {
      const today = todayDateStr();
      const data = date === today
        ? await api.voyageToday()
        : await api.voyageDate(date);
      // 数据没变就不 setState——30s 轮询每次都换新数组引用会让整条航迹流
      // 重渲染，正在翻页的时候表现为画面上下跳一下
      setVoyageLog((prev) => (JSON.stringify(prev) === JSON.stringify(data.log) ? prev : data.log));
      setVoyageEvents((prev) => {
        const next = data.events || [];
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      setVoyages((prev) => {
        const next = data.voyages || [];
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      if (date === today && data.log && !data.log.read_at) {
        api.markVoyageRead(date).catch(() => {});
      }
    } catch {
      // 轮询失败保留现有内容——清空会让航迹流瞬间塌缩、滚动位置鬼畜跳，
      // 下次轮询恢复又跳回来。只有主动加载（切日期）失败才清
      if (!silent) {
        setVoyageLog(null);
        setVoyageEvents([]);
        setVoyages([]);
      }
    }
    if (!silent) setVoyageLoading(false);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [mood, mur, sr, sh, dr, senses, surf, con] = await Promise.allSettled([
        api.getCurrentMood(),
        api.getMurmurs(30),
        api.stellarReadings(),
        api.stellarHistory(14),
        api.getDrives(),
        api.stellarSenses(),
        api.surfaceMemories(5),
        api.getConcerns("OPEN"),
      ]);
      if (mood.status === "fulfilled") setCurrentMood(mood.value);
      if (mur.status === "fulfilled") setMurmurs(mur.value);
      if (sr.status === "fulfilled") setStellar(sr.value);
      if (sh.status === "fulfilled") setStellarHistory(sh.value.history || []);
      if (dr.status === "fulfilled") setDriveState(dr.value.state);
      if (senses.status === "fulfilled") setStellarSenses(senses.value);
      if (surf.status === "fulfilled") setSurfaceMemories(surf.value.items || []);
      if (con.status === "fulfilled") setConcerns(con.value.concerns.filter(c => c.status === "OPEN" || c.status === "EASING"));
    } catch (_) {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    loadVoyage(voyageDate);
    api.voyageDateRange().then((r) => { if (r.earliest) setEarliestDate(r.earliest); }).catch(() => {});
  }, [load, loadVoyage, voyageDate]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadVoyage(voyageDate, { silent: true });
      api.getDrives().then((r) => setDriveState(r.state)).catch(() => {});
      api.stellarSenses().then((r) => setStellarSenses(r)).catch(() => {});
      api.getConcerns("OPEN").then((r) => setConcerns(r.concerns.filter((c: any) => c.status === "OPEN" || c.status === "EASING"))).catch(() => {});
    }, 90_000);
    return () => clearInterval(interval);
  }, [voyageDate, loadVoyage]);

  const deleteNote = useCallback(
    async (id: string) => {
      const doDelete = () =>
        api
          .deleteCompanionNote(id)
          .then(() => load())
          .catch(() => {});
      if (Platform.OS === "web") {
        if (window.confirm("确定要删除吗？")) doDelete();
      } else {
        Alert.alert("删除", "确定要删除吗？", [
          { text: "取消", style: "cancel" },
          { text: "删除", style: "destructive", onPress: doDelete },
        ]);
      }
    },
    [load],
  );

  const loadMoodHistory = useCallback(async () => {
    setMoodHistoryLoading(true);
    try {
      const rows = await api.getCompanionNotes({
        type: "epsilon_mood",
        limit: 200,
      });
      setMoodHistory(rows);
    } catch (_) {}
    setMoodHistoryLoading(false);
  }, []);

  const toggleMoodHistory = useCallback(() => {
    const next = !moodHistoryOpen;
    setMoodHistoryOpen(next);
    if (next) loadMoodHistory();
  }, [moodHistoryOpen, loadMoodHistory]);

  const goDate = useCallback(
    (delta: number) => {
      const next = shiftDate(voyageDate, delta);
      const today = todayDateStr();
      if (next > today) return;
      if (earliestDate && next < earliestDate) return;
      setVoyageDate(next);
    },
    [voyageDate, earliestDate],
  );

  const goMonth = useCallback(
    (delta: number) => {
      const d = new Date(voyageDate + "T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + delta);
      const today = todayDateStr();
      let next = d.toISOString().slice(0, 10);
      if (next > today) next = today;
      if (earliestDate && next < earliestDate) next = earliestDate;
      setVoyageDate(next);
    },
    [voyageDate, earliestDate],
  );

  const isToday = voyageDate === todayDateStr();
  const isEarliest = !!(earliestDate && voyageDate <= earliestDate);

  const murmurSlice = murmurs.slice(
    murmurPage * MURMUR_PER_PAGE,
    (murmurPage + 1) * MURMUR_PER_PAGE,
  );
  const murmurPages = Math.ceil(murmurs.length / MURMUR_PER_PAGE);

  const findVoyageForEvent = (eventId: string) =>
    voyages.find((v) => v.event_id === eventId);

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            load();
            loadVoyage(voyageDate);
          }}
          tintColor={epsTheme.iconTint}
        />
      }
    >
      {/* ── STELLAR ACTIVITY ── */}
      <TouchableOpacity
        style={[s.statusCard, s.statusCardShadow]}
        onPress={toggleMoodHistory}
        activeOpacity={0.8}
      >
        {isEH && <EhFrame draw={drawMoodFrame} />}
        {!isEH && <CornerBrackets color={epsTheme.goldCorner} size={10} offset={-2} />}

        {/* station bar */}
        <View style={s.scStationBar}>
          <Text style={[s.scBay, isEH && s.bayPlate]}>SYS-01 · MOOD</Text>
          <View style={s.scStatusGroup}>
            {isEH ? (
              <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                <div style={{ width: 4, height: 4, background: "#78c878" }} />
                <div style={{ width: 4, height: 4, background: "#78c878" }} />
                <div style={{ width: 4, height: 4, border: "1px solid rgba(255,255,255,0.35)" }} />
              </div>
            ) : (
              <View style={s.scStatusDot} />
            )}
            <Text style={s.scStatusText}>ACTIVE</Text>
          </View>
        </View>

        {/* body */}
        <View style={s.statusBody}>
          <View style={s.statusTopRow}>
            <View>
              <Text style={s.statusTitle}>星体活动</Text>
              <Text style={s.statusTitleEn}>STELLAR ACTIVITY</Text>
            </View>
            {currentMood && (
              <View style={s.bandBadge}>
                <Text style={[s.bandText, { color: moodBand(currentMood.pa, currentMood.na, theme).color }]}>
                  {moodBand(currentMood.pa, currentMood.na, theme).label}
                </Text>
              </View>
            )}
          </View>

          {stellar && (
            <Text style={s.physicsLine}>
              {formatPhysicsLine(stellar.dimensions)}
            </Text>
          )}

          <View style={s.statusDash} />

          <Text style={s.moodText}>
            {currentMood?.decoration_mood || "…"}
          </Text>

          {currentMood?.surfaced_top1 ? (
            <View style={s.surfaced}>
              <Text style={s.surfacedLabel}>脑里挂着：</Text>
              <Text style={s.surfacedText}>
                {currentMood.surfaced_top1}
              </Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      {moodHistoryOpen && (
        <View style={s.moodHistoryWrap}>
          {moodHistoryLoading ? (
            <Text style={s.moodHistoryLoading}>加载中...</Text>
          ) : moodHistory.length === 0 ? (
            <Text style={s.moodHistoryLoading}>还没有历史心情。</Text>
          ) : (
            moodHistory.slice(0, 20).map((r, i) => {
              const tm = new Date(r.created_at).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const dt = (r.created_at || "").slice(0, 10);
              return (
                <View key={r.id || i} style={s.moodHistoryItem}>
                  <Text style={s.moodHistoryTime}>
                    {dt} {tm}
                  </Text>
                  <Text style={s.moodHistoryContent}>{r.content}</Text>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ── STAR MAP ── */}

      {/* ── STELLAR READINGS ── */}
      <StellarReadingsPanel />

      {/* ── STELLAR TRAJECTORY ── */}
      {stellarHistory.length >= 2 && Platform.OS === "web" && (() => {
        const W = 280, H = 90, PAD_L = 0, PAD_R = 4, PAD_T = 6, PAD_B = 14;
        const chartW = W - PAD_L - PAD_R;
        const chartH = H - PAD_T - PAD_B;
        const n = stellarHistory.length;
        const xStep = n > 1 ? chartW / (n - 1) : 0;

        const lines = DIM_KEYS.map((dim) => {
          const pts = stellarHistory.map((snap, i) => {
            const v = snap.dimensions[dim] ?? 0;
            const x = PAD_L + i * xStep;
            const y = PAD_T + chartH * (1 - v);
            return { x, y, v };
          });
          const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const areaD = pathD + ` L${pts[pts.length - 1].x.toFixed(1)},${PAD_T + chartH} L${pts[0].x.toFixed(1)},${PAD_T + chartH} Z`;
          return { dim, pts, pathD, areaD, color: epsTheme.dimColors[dim] };
        });

        const dateLabels = stellarHistory.filter((_, i) =>
          i === 0 || i === n - 1 || (n > 5 && i === Math.floor(n / 2))
        ).map((snap, _, arr) => ({
          date: snap.snapshot_date.slice(5),
          x: PAD_L + stellarHistory.indexOf(snap) * xStep,
        }));

        return (
          <View style={[s.trajectoryCard, s.trajectoryCardShadow]}>
            {isEH && <EhFrame draw={drawTraceFrame} />}
            <View style={s.trajStationBar}>
              <Text style={[s.trajBay, isEH && s.bayPlate]}>TRK-01 · TRACE</Text>
              <View style={s.trajStatusGroup}>
                {isEH ? (
                  <div style={{ width: 5, height: 5, background: "#78c878" }} />
                ) : (
                  <View style={s.trajStatusDot} />
                )}
                <Text style={[s.trajStatusText, isEH && { color: EH_BLUE }]}>{isEH ? "▸ " : ""}{stellarHistory.length} PTS</Text>
              </View>
            </View>
            <View style={s.trajectoryHeader}>
              <Text style={s.trajectoryLabel}>星体轨迹</Text>
              <View style={s.trajectoryLegend}>
                {DIM_KEYS.map((dim) => (
                  <View key={dim} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: epsTheme.dimColors[dim] }]} />
                    <Text style={[s.legendText, { color: epsTheme.dimColors[dim] }]}>{DIM_LABELS[dim]}</Text>
                  </View>
                ))}
              </View>
            </View>
            {createElement("div", {
              style: { width: "100%", height: H },
              dangerouslySetInnerHTML: {
                __html: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;background:${epsTheme.chartBg};border-radius:4px" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    ${lines.map((l) => `<filter id="glow-${l.dim}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feComposite in="blur" in2="SourceGraphic" operator="over"/></filter>`).join("")}
                    <filter id="star-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur in="SourceGraphic" stdDeviation="1.5"/></filter>
                  </defs>
                  <line x1="${PAD_L}" y1="${PAD_T + chartH}" x2="${PAD_L + chartW}" y2="${PAD_T + chartH}" stroke="${epsTheme.chartGrid}" stroke-width="0.5"/>
                  <line x1="${PAD_L}" y1="${PAD_T + chartH * 0.5}" x2="${PAD_L + chartW}" y2="${PAD_T + chartH * 0.5}" stroke="${epsTheme.chartGridSoft}" stroke-width="0.5" stroke-dasharray="2,4"/>
                  ${lines.map((l) => `<path d="${l.areaD}" fill="${l.color}" fill-opacity="0.05"/>`).join("")}
                  ${lines.map((l) => `<path d="${l.pathD}" fill="none" stroke="${l.color}" stroke-width="1" stroke-opacity="0.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-${l.dim})"/>`).join("")}
                  ${lines.map((l) => `<path d="${l.pathD}" fill="none" stroke="${l.color}" stroke-width="0.5" stroke-opacity="0.9" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}
                  ${lines.map((l) => l.pts.map((p) => `<path d="${starPath(p.x, p.y, 2.6)}" fill="${l.color}" fill-opacity="0.3" filter="url(#star-glow)"/>`).join("")).join("")}
                  ${lines.map((l) => l.pts.map((p) => `<path d="${starPath(p.x, p.y, 2.2)}" fill="${l.color}" fill-opacity="0.95"/>`).join("")).join("")}
                  ${dateLabels.map((d) => `<text x="${d.x}" y="${H - 1}" fill="${epsTheme.chartLabel}" font-size="7" font-family="monospace" text-anchor="middle">${d.date}</text>`).join("")}
                </svg>`
              },
            })}
          </View>
        );
      })()}

      {/* ── STELLAR CAUSALITY ── */}
      {(() => {
        const co = (stellar as any)?.causal_overlay;
        if (!co?.active) return null;
        const chordColor = epsTheme.chordColors[co.base_chord_tag || co.chord_tag] || epsTheme.chordFallback;
        const nodes = [
          { key: "stellar_fusion", label: "星核", icon: "◉" },
          { key: "corona", label: "日冕", icon: "◎" },
          { key: "flare", label: "耀斑", icon: "✦" },
          { key: "tidal", label: "潮汐", icon: "≋" },
        ];
        return (
          <View style={[s.weatherCard, s.weatherCardShadow, { marginTop: 10 }]}>
            {isEH && <EhFrame draw={drawCausalFrame} />}
            <View style={s.wxStationBar}>
              <Text style={[s.wxBay, isEH && s.bayPlate]}>CAUSAL · OVERLAY</Text>
              <View style={s.wxStatusGroup}>
                {isEH ? (
                  <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                    <div style={{ width: 4, height: 4, background: "#78c878", borderRadius: 2 }} />
                    <div style={{ width: 4, height: 4, background: "rgba(120,200,120,0.35)", borderRadius: 2 }} />
                  </div>
                ) : (
                  <View style={s.wxStatusDot} />
                )}
                <Text style={s.wxStatusText}>LIVE</Text>
              </View>
            </View>
            <View style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 8, ...(isEH ? { justifyContent: "center" as const } : {}) }}>
                <Text style={[s.causalChordText, { color: chordColor }]}>{co.chord_tag}{co.tidal_pull ? " +牵引" : ""}</Text>
                <Text style={s.causalChordLabel}>{co.chord_label || ""}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 6 }}>
                {nodes.map((n) => {
                  const val = Number(co[n.key] || 0);
                  const bright = val > 0.6 ? 1 : val > 0.35 ? 0.65 : 0.3;
                  return (
                    <View key={n.key} style={{ alignItems: "center" }}>
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 16, color: chordColor, opacity: bright }}>{n.icon}</Text>
                      <Text style={{ fontFamily: fonts.silkscreen, fontSize: 9, color: epsTheme.textSoft, marginTop: 1 }}>{Math.round(val * 100)}</Text>
                      <Text style={{ fontFamily: fonts.pixel, fontSize: 7, color: epsTheme.textGhost, marginTop: 1 }}>{n.label}</Text>
                    </View>
                  );
                })}
              </View>
              {co.text && <Text style={{ fontFamily: fonts.pixel, fontSize: 9, color: epsTheme.stationTextDim, lineHeight: 14 }}>{co.text}</Text>}
            </View>
          </View>
        );
      })()}

      {/* ── DRIVESOID PANEL ── */}
      <DrivesoidPanel />

      {/* ── WEATHER CARD ── */}
      {voyageLog?.weather_summary && (
        <View style={[s.weatherCard, s.weatherCardShadow]}>
          {isEH && <EhFrame draw={drawWeatherFrame} />}
          <View style={s.wxStationBar}>
            <Text style={[s.wxBay, isEH && s.bayPlate]}>WX-01 · WEATHER</Text>
            <View style={s.wxStatusGroup}>
              {isEH ? (
                <div style={{ width: 5, height: 5, border: "1px solid #78c878", background: "rgba(120,200,120,0.4)" }} />
              ) : (
                <View style={s.wxStatusDot} />
              )}
              <Text style={s.wxStatusText}>LIVE</Text>
            </View>
          </View>
          <View style={s.weatherBody}>
            <Text style={s.weatherLabel}>今日星际天气</Text>
            <Text style={s.weatherText}>{voyageLog.weather_summary}</Text>
          </View>
        </View>
      )}

      {/* ── VOYAGE EVENTS TIMELINE ── */}
      <View style={[s.voyageBlock, s.voyageBlockShadow]}>
        {isEH && <EhFrame draw={drawVoyageFrame} />}
        {!isEH && <CornerBrackets color={epsTheme.goldCorner} size={10} offset={-2} />}
        <View style={s.voyStationBar}>
          <Text style={[s.voyBay, isEH && s.bayPlate]}>NAV-01 · VOYAGE</Text>
          <View style={s.voyStatusGroup}>
            {isEH ? (
              <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                <div style={{ width: 3, height: 7, background: "#78c878" }} />
                <div style={{ width: 3, height: 5, background: "rgba(120,200,120,0.5)" }} />
                <div style={{ width: 3, height: 3, background: "rgba(120,200,120,0.3)" }} />
              </div>
            ) : (
              <View style={s.voyStatusDot} />
            )}
            <Text style={[s.voyStatusText, isEH && { color: EH_BLUE }]}>{isEH ? "▸ " : ""}{voyageEvents.length} EVT</Text>
          </View>
        </View>
        <View style={s.voyageInner}>
        {stellar?.dark_side && (
          <Text style={s.rotationPhaseLine}>
            {`亮面 ${Math.round((1 - (stellar.dark_side.dark_ratio || 0)) * 100)}% 朝向她`}
            {stellar.dark_side.active ? " · 深夜面" : ""}
          </Text>
        )}
        <View style={s.voyageHeader}>
          <Text style={s.voyageTitle}>航行事件</Text>
          <View style={s.datePager}>
            <TouchableOpacity
              onPress={() => goMonth(-1)}
              style={[s.dateBtn, isEarliest && s.dateBtnDisabled]}
              disabled={isEarliest}
            >
              <Text style={s.dateBtnText}>«</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => goDate(-1)}
              style={[s.dateBtn, isEarliest && s.dateBtnDisabled]}
              disabled={isEarliest}
            >
              <Text style={s.dateBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={s.dateLabel}>{formatLogDate(voyageDate)}</Text>
            <TouchableOpacity
              onPress={() => goDate(1)}
              style={[s.dateBtn, isToday && s.dateBtnDisabled]}
              disabled={isToday}
            >
              <Text style={s.dateBtnText}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => goMonth(1)}
              style={[s.dateBtn, isToday && s.dateBtnDisabled]}
              disabled={isToday}
            >
              <Text style={s.dateBtnText}>»</Text>
            </TouchableOpacity>
            {!isToday && (
              <TouchableOpacity
                onPress={() => setVoyageDate(todayDateStr())}
                style={s.todayBtn}
              >
                <Text style={s.todayBtnText}>今天</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {voyageLoading ? (
          <ActivityIndicator
            color={epsTheme.warmGold}
            style={{ marginVertical: 16 }}
          />
        ) : voyageEvents.length === 0 ? (
          <Text style={s.voyageEmpty}>
            {isToday ? "今天还没有航行事件…" : "这一天没有航行记录。"}
          </Text>
        ) : (
          <View style={s.timeline}>
            {voyageEvents.map((evt) => {
              const isLegendary = evt.rarity === "legendary";
              const color = epsTheme.rarityColors[evt.rarity] || theme.textDim;
              const icon = EVENT_ICONS[evt.event_type] || "✦";
              const expanded = expandedEvent === evt.id;
              const voyage = findVoyageForEvent(evt.id);
              const hasDetail =
                (evt.description && evt.description.length > 0) ||
                voyage?.narrative ||
                evt.related_memory;

              const rarityTag =
                evt.rarity !== "common" ? (
                  <Text style={[s.rarityTag, { color }]}>
                    [{evt.rarity === "uncommon" ? "少见" : evt.rarity === "rare" ? "稀有" : "传说"}]
                  </Text>
                ) : null;

              const titleRow = (
                <TouchableOpacity
                  key={evt.id}
                  style={s.eventRow}
                  onPress={() =>
                    hasDetail
                      ? setExpandedEvent(expanded ? null : evt.id)
                      : undefined
                  }
                  activeOpacity={hasDetail ? 0.7 : 1}
                >
                  <Text style={s.eventTime}>
                    {formatEventTime(evt.created_at)}
                  </Text>
                  <View style={[s.timelineDot, { backgroundColor: color }]} />
                  <Text style={s.eventIcon}>{icon}</Text>
                  {isLegendary ? (
                    <Animated.Text
                      style={[
                        s.eventTitle,
                        { color, opacity: legendaryAnim },
                      ]}
                    >
                      {evt.title}
                    </Animated.Text>
                  ) : (
                    <Text style={[s.eventTitle, { color }]}>
                      {evt.title}
                    </Text>
                  )}
                  {rarityTag}
                  {hasDetail && (
                    <Text style={s.eventExpand}>
                      {expanded ? "▾" : "▸"}
                    </Text>
                  )}
                </TouchableOpacity>
              );

              if (!expanded) return titleRow;

              return (
                <View key={evt.id}>
                  {titleRow}
                  <View style={s.eventDetail}>
                    {evt.description ? (
                      <Text style={s.eventDesc}>{evt.description}</Text>
                    ) : null}
                    {voyage?.narrative ? (
                      <View style={s.voyageNarrative}>
                        <Text style={s.voyageNarrLabel}>
                          🚀 航行日记 →{" "}
                          {voyage.destination_name || voyage.query}
                        </Text>
                        <Text style={s.voyageNarrText}>
                          {voyage.narrative}
                        </Text>
                      </View>
                    ) : null}
                    {voyage && !voyage.narrative && voyage.query ? (
                      <Text style={s.voyageQuery}>
                        搜索：{voyage.query}
                      </Text>
                    ) : null}
                    {evt.related_memory ? (
                      <View style={s.memoryPreview}>
                        <Text style={s.memoryPreviewLabel}>
                          {evt.related_memory.subcategory === "thought" ? "💭 漂流舱" : evt.related_memory.category === "notes" ? "📝 记录" : "✦ 记忆"} · {evt.related_memory.title}
                        </Text>
                        <Text style={s.memoryPreviewText}>
                          {evt.related_memory.content}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {voyageLog?.daily_summary ? (
          <View style={s.summaryCard}>
            <View style={s.summaryDash} />
            <Text style={s.summaryLabel}>⚓ 航行总结</Text>
            <Text style={s.summaryText}>{voyageLog.daily_summary}</Text>
          </View>
        ) : null}
        {isEH && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,0.15)" }}>
            <EhDataRow items={[["SEC", "07"], ["REG", "A-04"], ["HDG", "N-82°E"]]} />
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 1.5 }}>▸ HORIZON RUN</span>
          </div>
        )}
        </View>
      </View>

      {/* ── 低语舱 ── */}
      <View style={[s.cabinBlock, s.cabinBlockShadow]}>
        {isEH && <EhFrame draw={drawCabinFrame} />}
        <View style={s.cabStationBar}>
          <Text style={[s.cabBay, isEH && s.bayPlate]}>CAB-01 · WHISPER</Text>
          <View style={s.cabStatusGroup}>
            {isEH ? (
              <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                <div style={{ width: 4, height: 4, background: murmurs.length > 0 ? "#78c878" : "rgba(255,255,255,0.2)" }} />
                <div style={{ width: 4, height: 4, border: "1px solid rgba(255,255,255,0.3)" }} />
              </div>
            ) : (
              <View style={[s.cabStatusDot, murmurs.length > 0 && s.cabStatusDotOn]} />
            )}
            <Text style={[s.cabStatusText, isEH && murmurs.length > 0 && { color: EH_BLUE }]}>{murmurs.length > 0 ? `${isEH ? "▸ " : ""}${murmurs.length} LOG` : "EMPTY"}</Text>
          </View>
        </View>
        <View style={s.cabinBody}>
          <View style={s.cabinSectionHeader}>
            <Text style={s.cabinSectionTitle}>💭 碎碎念</Text>
            <TouchableOpacity
              style={s.murmurToggleBtn}
              onPress={() => setMurmurOpen(!murmurOpen)}
              activeOpacity={0.7}
            >
              <Text style={s.murmurToggleText}>
                {murmurOpen ? "收起 ▴" : "展开 ▾"}
              </Text>
            </TouchableOpacity>
          </View>

          {!murmurOpen && murmurs.length > 0 && (
            <View style={s.murmurItem}>
              <Text style={s.murmurText}>{murmurs[0].content}</Text>
              <Text style={s.murmurTime}>
                {murmurs[0].created_at
                  ?.substring(0, 16)
                  .replace("T", " ") || ""}
              </Text>
            </View>
          )}

          {murmurOpen && (
            <View>
              {murmurSlice.map((m) => (
                <View key={m.id} style={s.murmurItem}>
                  <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={() => deleteNote(m.id)}
                    activeOpacity={0.6}
                  >
                    <Text style={s.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                  <Text style={s.murmurText}>{m.content}</Text>
                  <Text style={s.murmurTime}>
                    {new Date(m.created_at).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "numeric",
                    })}
                  </Text>
                </View>
              ))}
              {murmurPages > 1 && (
                <View style={s.murmurPager}>
                  <TouchableOpacity
                    onPress={() => setMurmurPage(Math.max(0, murmurPage - 1))}
                    disabled={murmurPage === 0}
                    style={[
                      s.pagerBtn,
                      murmurPage === 0 && s.pagerBtnDisabled,
                    ]}
                  >
                    <Text style={s.pagerBtnText}>‹</Text>
                  </TouchableOpacity>
                  <Text style={s.pagerLabel}>
                    {murmurPage + 1}/{murmurPages}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setMurmurPage(
                        Math.min(murmurPages - 1, murmurPage + 1),
                      )
                    }
                    disabled={murmurPage >= murmurPages - 1}
                    style={[
                      s.pagerBtn,
                      murmurPage >= murmurPages - 1 && s.pagerBtnDisabled,
                    ]}
                  >
                    <Text style={s.pagerBtnText}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {isEH && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTop: "1px dotted rgba(255,255,255,0.18)" }}>
              <EhDataRow items={[["CH", "MUR"], ["ENC", "UTF-8"]]} />
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 1.5 }}>▸ LOW ORBIT</span>
            </div>
          )}
        </View>
      </View>

      {/* ── 核心舱 ── */}
      <TouchableOpacity
        style={[s.feelsEntry, s.feelsEntryShadow]}
        onPress={() => onNavigate?.("feels")}
        activeOpacity={0.75}
      >
        {isEH && <EhFrame draw={drawInnerFrame} />}
        {!isEH && <CornerBrackets color={epsTheme.goldCorner} size={10} offset={-2} />}
        <View style={s.feStationBar}>
          <Text style={[s.feBay, isEH && s.bayPlate]}>LOG-01 · CORE</Text>
          <View style={s.feStatusGroup}>
            {isEH ? (
              <div style={{ width: 5, height: 5, border: "1px solid #78c878" }} />
            ) : (
              <View style={s.feStatusDot} />
            )}
            <Text style={s.feStatusText}>OPEN</Text>
          </View>
        </View>
        <View style={s.feelsEntryInner}>
          <View style={s.feelsEntryLeft}>
            <Text style={s.feelsEntryIcon}>🐦‍⬛</Text>
            <View>
              <Text style={s.feelsEntryTitle}>核心舱</Text>
              <Text style={s.feelsEntryDesc}>
                第一人称 · 未完成的思考 · 写给下一个自己
              </Text>
            </View>
          </View>
          <Text style={s.feelsEntryArrow}>›</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(theme: ThemeTokens) {
  // six distinct frame languages under event horizon — poster block-layout vibes
  const eh = theme.key === "eventHorizon";
  const W = "rgba(255,255,255,";
  const epsTheme = theme.homePanel;

  return StyleSheet.create({
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 92,
  },
  // bridge-style framed tag plate for bay labels (EH only)
  bayPlate: {
    borderWidth: 1,
    borderColor: `${W}0.5)`,
    paddingHorizontal: 5,
    paddingVertical: 2,
    color: "#fff",
  },

  // ── STATUS CARD ──
  statusCard: {
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorderStrong,
    marginBottom: 4,
    position: "relative" as const,
    overflow: "hidden" as const,
    ...(eh ? { backgroundColor: "#000", borderWidth: 0, borderRadius: 0, overflow: "visible" as const, marginTop: 4 } : {}),
  },
  statusCardShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowStrong,
  } as any : {},
  // gold corner brackets — outside the card edge
  // station bar (starcourt style)
  scStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorder,
  },
  scBay: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: epsTheme.stationText,
    letterSpacing: 2,
  },
  scStatusGroup: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  scStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: epsTheme.successShadow } as any : {}),
  },
  scStatusText: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: epsTheme.successText,
    letterSpacing: 1,
  },
  // body
  statusBody: {
    padding: 14,
  },
  statusTopRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    marginBottom: 6,
  },
  statusTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 14,
    color: theme.riverGlow.gold,
    letterSpacing: 3,
    ...(Platform.OS === "web" ? { textShadow: epsTheme.goldTextShadowStrong } as any : {}),
  },
  statusTitleEn: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: epsTheme.textFaint,
    letterSpacing: 3,
    marginTop: 2,
  },
  bandBadge: {
    borderWidth: 1,
    borderColor: epsTheme.stationBorderAccent,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  bandText: {
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    letterSpacing: 2,
  },
  physicsLine: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: epsTheme.textSoft,
    letterSpacing: 1,
    marginBottom: 8,
  },
  statusDash: {
    height: 1,
    marginBottom: 10,
    borderTopWidth: 1,
    borderStyle: "dashed" as any,
    borderTopColor: epsTheme.stationBorder,
  },
  moodText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: theme.text,
    lineHeight: 24,
    marginBottom: 4,
  },
  surfaced: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: epsTheme.stationBorderSoft,
  },
  surfacedLabel: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
    marginBottom: 3,
  },
  surfacedText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: epsTheme.textMid,
    lineHeight: 19,
  },

  moodHistoryWrap: {
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1,
    borderColor: epsTheme.statusCardBorder,
    borderTopWidth: 0,
    maxHeight: 280,
    marginBottom: 16,
    ...(Platform.OS === "web" ? ({ overflowY: "auto" } as any) : {}),
    ...(eh ? { backgroundColor: "#000", borderColor: `${W}0.3)`, borderRadius: 0 } : {}),
  },
  moodHistoryLoading: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.textMuted,
    padding: 14,
  },
  moodHistoryItem: {
    flexDirection: "row",
    gap: 10,
    alignItems: "baseline",
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  moodHistoryTime: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
    minWidth: 90,
  },
  moodHistoryContent: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: theme.text,
    lineHeight: 22,
    flex: 1,
  },

  // ── TRAJECTORY CARD ──
  trajectoryCard: {
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorder,
    marginTop: 4,
    overflow: "hidden" as const,
    ...(eh ? { backgroundColor: "#000", borderWidth: 0, borderRadius: 0, overflow: "visible" as const, paddingBottom: 12 } : {}),
  },
  trajectoryCardShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowSoft,
  } as any : {},
  trajStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorderSoft,
    ...(eh ? { paddingVertical: 9, paddingHorizontal: 14 } : {}),
  },
  trajBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: epsTheme.stationTextDim, letterSpacing: 2 },
  trajStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  trajStatusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.success },
  trajStatusText: { fontFamily: fonts.silkscreen, fontSize: 5, color: epsTheme.successTextSoft, letterSpacing: 1 },
  trajectoryHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  trajectoryLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    color: theme.riverGlow.gold,
    letterSpacing: 2,
  },
  trajectoryLegend: {
    flexDirection: "row" as const,
    gap: 8,
  },
  legendItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
  },
  legendDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legendText: {
    fontFamily: fonts.mono,
    fontSize: 7,
    opacity: 0.7,
  },

  // ── DRIVE PANEL ──
  drivePanel: {
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorderStrong,
    marginTop: 10,
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  drivePanelShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowStrong,
  } as any : {},
  drvStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorder,
  },
  drvBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: epsTheme.stationText, letterSpacing: 2 },
  drvStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  drvStatusDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: epsTheme.successShadow } as any : {}),
  },
  drvStatusText: { fontFamily: fonts.silkscreen, fontSize: 6, color: epsTheme.successText, letterSpacing: 1 },
  driveHeader: {
    alignItems: "center" as const,
    paddingVertical: 8,
  },
  driveTitleText: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    color: theme.riverGlow.gold,
    letterSpacing: 4,
    ...(Platform.OS === "web" ? { textShadow: epsTheme.goldTextShadow } as any : {}),
  },
  driveBarsWrap: {
    paddingHorizontal: 2,
  },
  driveRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    height: 18,
    marginBottom: 2,
  },
  driveLabel: {
    width: 30,
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: epsTheme.warmGoldDim,
    letterSpacing: 1,
    textAlign: "right" as const,
  },
  driveBar: {
    flex: 1,
    height: 8,
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1,
    borderColor: epsTheme.chartBorder,
    flexDirection: "row" as const,
    overflow: "hidden" as const,
  },
  driveCell: {
    flex: 1,
    height: "100%" as any,
  },
  driveCellEmpty: {
    backgroundColor: epsTheme.driveCellBg,
  },
  driveCellBorder: {
    borderRightWidth: 1,
    borderRightColor: epsTheme.driveCellDivider,
  },
  driveValue: {
    width: 22,
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: epsTheme.chartTextDim,
    textAlign: "left" as const,
  },
  driveHint: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: epsTheme.chartLabel,
    letterSpacing: 0.3,
  },
  driveDivider: {
    height: 1,
    marginVertical: 8,
    marginHorizontal: 20,
    borderTopWidth: 1,
    borderStyle: "dashed" as any,
    borderTopColor: epsTheme.stationBorder,
  },
  driveDesire: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: epsTheme.warmGoldMid,
    textAlign: "center" as const,
    letterSpacing: 1,
    marginBottom: 4,
    lineHeight: 18,
  },
  thoughtGuideTitle: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: epsTheme.warmGoldSoft,
    letterSpacing: 1,
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  thoughtLine: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: epsTheme.chartText,
    lineHeight: 16,
    letterSpacing: 0.3,
    paddingHorizontal: 6,
  },
  thoughtTimeInline: {
    color: epsTheme.chartLabel,
  },

  driveShapeLabel: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: epsTheme.chartLabel,
    letterSpacing: 0.2,
    minWidth: 28,
  },
  driveAfterglow: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: epsTheme.warmGold,
    minWidth: 22,
    letterSpacing: 0.2,
  },
  concernRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    paddingHorizontal: 6,
    marginBottom: 2,
    gap: 4,
  },
  concernDot: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.textMuted,
    lineHeight: 16,
    width: 8,
  },
  concernTitle: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.textDim,
    lineHeight: 16,
    flex: 1,
  },
  concernMeta: {
    color: theme.textMuted,
    fontSize: 8,
  },
  rotationPhaseLine: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  weatherCard: {
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorder,
    marginTop: 16,
    marginBottom: 4,
    overflow: "hidden" as const,
    ...(eh ? { backgroundColor: "#000", borderWidth: 0, borderRadius: 0, overflow: "visible" as const } : {} as any),
  },
  weatherCardShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowSoft,
  } as any : {},
  wxStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorderSoft,
    ...(eh ? { paddingVertical: 9, paddingHorizontal: 14 } : {}),
  },
  causalChordText: { fontFamily: fonts.silkscreen, fontSize: 20, ...(Platform.OS === "web" ? { textShadow: "0 0 10px currentColor" } as any : {}), ...(eh ? { fontSize: 23 } : {}) },
  causalChordLabel: { fontFamily: fonts.pixel, fontSize: 9, color: epsTheme.stationTextDim, ...(eh ? { fontSize: 11 } : {}) },
  wxBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: epsTheme.stationTextDim, letterSpacing: 2 },
  wxStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  wxStatusDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: epsTheme.successShadowSmall } as any : {}),
  },
  wxStatusText: { fontFamily: fonts.silkscreen, fontSize: 5, color: epsTheme.successTextSoft, letterSpacing: 1 },
  weatherBody: { padding: 14, ...(eh ? { paddingVertical: 16 } : {}) },
  weatherLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: theme.riverGlow.gold,
    letterSpacing: 2,
    marginBottom: 6,
    ...(eh ? { color: "#fff", marginBottom: 8 } : {}),
  },
  weatherText: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: theme.text,
    lineHeight: 22,
    ...(eh ? { color: EH_BLUE } : {}),
  },

  // ── VOYAGE TIMELINE ──
  voyageBlock: {
    marginTop: 16,
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorderStrong,
    position: "relative" as const,
    overflow: "hidden" as const,
    ...(eh ? { backgroundColor: "#000", borderWidth: 0, borderRadius: 0, overflow: "visible" as const } : {} as any),
  },
  voyageBlockShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowStrong,
  } as any : {},
  voyStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorder,
    ...(eh ? { paddingVertical: 9, paddingHorizontal: 14 } : {}),
  },
  voyBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: epsTheme.stationText, letterSpacing: 2 },
  voyStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  voyStatusDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: epsTheme.successShadow } as any : {}),
  },
  voyStatusText: { fontFamily: fonts.silkscreen, fontSize: 6, color: epsTheme.successText, letterSpacing: 1 },
  voyageInner: { padding: 14 },
  voyageHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  },
  voyageTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.riverGlow.gold,
    letterSpacing: 3,
  },
  datePager: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateBtn: {
    borderWidth: 1,
    borderColor: epsTheme.stationBorderMid,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  dateBtnDisabled: { opacity: 0.3 },
  dateBtnText: { fontFamily: fonts.pixel, fontSize: 14, color: theme.textMuted },
  dateLabel: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textDim,
    minWidth: 56,
    textAlign: "center" as const,
  },
  todayBtn: {
    borderWidth: 1,
    borderColor: epsTheme.goldBorder,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginLeft: 4,
  },
  todayBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.riverGlow.gold,
  },
  voyageEmpty: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.textMuted,
    paddingVertical: 16,
    textAlign: "center" as const,
  },
  timeline: { gap: 2 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
  },
  eventTime: {
    fontFamily: fonts.mono || fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
    width: 38,
  },
  timelineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  eventIcon: { fontSize: 13, width: 20, textAlign: "center" as const },
  eventTitle: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    flex: 1,
  },
  rarityTag: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    marginLeft: 4,
  },
  eventExpand: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textMuted,
    marginLeft: 4,
  },

  eventDetail: {
    marginLeft: 69,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: theme.glowSoft,
    marginBottom: 6,
  },
  eventDesc: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.textDim,
    lineHeight: 20,
    marginBottom: 4,
  },
  voyageNarrative: { marginTop: 4 },
  voyageNarrLabel: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: epsTheme.warmGold,
    marginBottom: 4,
  },
  voyageNarrText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.text,
    lineHeight: 20,
  },
  voyageQuery: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textMuted,
    fontStyle: "italic" as const,
  },
  memoryPreview: {
    marginTop: 6,
    borderLeftWidth: 2,
    borderLeftColor: epsTheme.chartLabel,
    paddingLeft: 8,
  },
  memoryPreviewLabel: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: epsTheme.memoryBlue,
    marginBottom: 3,
  },
  memoryPreviewText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: epsTheme.memoryWarm,
    lineHeight: 19,
  },

  summaryCard: {
    marginTop: 10,
    paddingTop: 0,
  },
  summaryDash: {
    height: 1,
    marginBottom: 10,
    borderTopWidth: 1,
    borderStyle: "dashed" as any,
    borderTopColor: epsTheme.stationBorder,
  },
  summaryLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: theme.riverGlow.gold,
    letterSpacing: 2,
    marginBottom: 6,
  },
  summaryText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: epsTheme.textBright,
    lineHeight: 20,
  },

  // ── CABIN ──
  cabinBlock: {
    marginTop: 16,
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorder,
    overflow: "hidden" as const,
    ...(eh ? { backgroundColor: "#000", borderWidth: 0, borderRadius: 0, overflow: "visible" as const } : {} as any),
  },
  cabinBlockShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowSoft,
  } as any : {},
  cabStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorderSoft,
  },
  cabBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: epsTheme.stationTextDim, letterSpacing: 2 },
  cabStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  cabStatusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.textMuted },
  cabStatusDotOn: {
    backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: epsTheme.successShadowSmall } as any : {}),
  },
  cabStatusText: { fontFamily: fonts.silkscreen, fontSize: 5, color: epsTheme.stationTextDim, letterSpacing: 1 },
  cabinBody: { padding: 14 },
  cabinSectionHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 10,
  },
  cabinSectionTitle: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textDim,
    letterSpacing: 1,
  },
  murmurToggleBtn: {
    borderWidth: 1,
    borderColor: epsTheme.stationBorderMid,
    paddingVertical: 3,
    paddingHorizontal: 12,
  },
  murmurToggleText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textMuted,
  },
  murmurItem: {
    marginBottom: 6,
    backgroundColor: epsTheme.panelInsetBg,
    borderWidth: 1,
    borderColor: epsTheme.stationBorderSoft,
    padding: 12,
  },
  murmurText: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: theme.textDim,
    lineHeight: 23,
  },
  murmurTime: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
    marginTop: 4,
  },
  murmurPager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
  },
  pagerBtn: {
    borderWidth: 1,
    borderColor: epsTheme.stationBorderMid,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  pagerBtnDisabled: { opacity: 0.3 },
  pagerBtnText: { fontFamily: fonts.pixel, fontSize: 14, color: theme.textMuted },
  pagerLabel: { fontFamily: fonts.pixel, fontSize: 10, color: theme.textMuted },

  // ── FEELS ENTRY ──
  feelsEntry: {
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorderStrong,
    marginTop: 8,
    marginBottom: 24,
    position: "relative" as const,
    ...(eh ? { backgroundColor: "#000", borderWidth: 0, borderRadius: 0, overflow: "visible" as const } : {}),
  },
  feelsEntryShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowStrong,
  } as any : {},
  feStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorder,
    ...(eh ? { paddingVertical: 9, paddingHorizontal: 14 } : {}),
  },
  feBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: epsTheme.stationText, letterSpacing: 2 },
  feStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  feStatusDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: epsTheme.successShadow } as any : {}),
  },
  feStatusText: { fontFamily: fonts.silkscreen, fontSize: 6, color: epsTheme.successText, letterSpacing: 1 },
  feelsEntryInner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  feelsEntryLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 14 },
  feelsEntryIcon: { fontSize: 20, lineHeight: 24 },
  feelsEntryTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.riverGlow.gold,
    letterSpacing: 2,
    marginBottom: 4,
    ...(Platform.OS === "web" ? { textShadow: epsTheme.goldTextShadowSoft } as any : {}),
  },
  feelsEntryDesc: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1,
  },
  feelsEntryArrow: {
    fontFamily: fonts.silkscreen,
    fontSize: 18,
    color: epsTheme.goldFaint,
  },

  deleteBtn: {
    position: "absolute" as const,
    top: 6,
    right: 6,
    zIndex: 2,
    padding: 4,
  },
  deleteBtnText: { fontFamily: fonts.pixel, fontSize: 11, color: theme.textMuted },

  // ── SENSORY AFTERGLOW PANEL ──
  sensesPanel: {
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorderStrong,
    marginTop: 10,
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  sensesPanelShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowStrong,
  } as any : {},
  snsCorner: {
    position: "absolute" as const,
    width: 10,
    height: 10,
    borderColor: epsTheme.goldCorner,
    zIndex: 2,
  },
  snsCornerTL: { top: -2, left: -2, borderTopWidth: 1, borderLeftWidth: 1 },
  snsCornerTR: { top: -2, right: -2, borderTopWidth: 1, borderRightWidth: 1 },
  snsCornerBL: { bottom: -2, left: -2, borderBottomWidth: 1, borderLeftWidth: 1 },
  snsCornerBR: { bottom: -2, right: -2, borderBottomWidth: 1, borderRightWidth: 1 },
  snsStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorder,
  },
  snsBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: epsTheme.stationText, letterSpacing: 2 },
  snsStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  snsStatusDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: epsTheme.successShadow } as any : {}),
  },
  snsStatusText: { fontFamily: fonts.silkscreen, fontSize: 6, color: epsTheme.successText, letterSpacing: 1 },
  sensesBody: {
    padding: 14,
  },
  sensesTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.riverGlow.gold,
    letterSpacing: 3,
    ...(Platform.OS === "web" ? { textShadow: epsTheme.goldTextShadow } as any : {}),
  },
  sensesTitleEn: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: epsTheme.textFaint,
    letterSpacing: 3,
    marginTop: 2,
    marginBottom: 10,
  },
  sensesBarsWrap: {
    paddingHorizontal: 2,
  },
  sensesRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    height: 18,
    marginBottom: 4,
  },
  sensesDesc: {
    width: 60,
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.textDim,
    letterSpacing: 0.5,
  },
  sensesBar: {
    flex: 1,
    height: 8,
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1,
    borderColor: epsTheme.chartBorder,
    flexDirection: "row" as const,
    overflow: "hidden" as const,
  },
  sensesCell: {
    flex: 1,
    height: "100%" as any,
  },
  sensesCellEmpty: {
    backgroundColor: epsTheme.driveCellBg,
  },
  sensesCellBorder: {
    borderRightWidth: 1,
    borderRightColor: epsTheme.driveCellDivider,
  },
  sensesChannelZh: {
    width: 44,
    fontFamily: fonts.pixel,
    fontSize: 8,
    textAlign: "right" as const,
    letterSpacing: 0.3,
  },

  // ── DAILY STARDUST PANEL ──
  stardustPanel: {
    backgroundColor: epsTheme.statusCardBg,
    borderWidth: 1.5,
    borderColor: epsTheme.statusCardBorder,
    marginTop: 10,
    overflow: "hidden" as const,
  },
  stardustPanelShadow: Platform.OS === "web" ? {
    boxShadow: eh ? "none" : epsTheme.statusCardShadowSoft,
  } as any : {},
  memStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: epsTheme.stationBorderSoft,
  },
  memBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: epsTheme.stationTextDim, letterSpacing: 2 },
  memStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  memStatusDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: epsTheme.successShadowSmall } as any : {}),
  },
  memStatusText: { fontFamily: fonts.silkscreen, fontSize: 5, color: epsTheme.successTextSoft, letterSpacing: 1 },
  stardustBody: {
    padding: 14,
  },
  stardustTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.riverGlow.gold,
    letterSpacing: 3,
    ...(Platform.OS === "web" ? { textShadow: epsTheme.goldTextShadow } as any : {}),
  },
  stardustTitleEn: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: epsTheme.textFaint,
    letterSpacing: 3,
    marginTop: 2,
    marginBottom: 10,
  },
  stardustList: {
    gap: 6,
  },
  stardustItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  stardustPrefix: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textDim,
    width: 14,
  },
  stardustPrefixComet: {
    color: epsTheme.warmGold,
  },
  stardustText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.textDim,
    flex: 1,
    lineHeight: 20,
  },
  stardustTextComet: {
    color: epsTheme.warmGold,
  },
  });
}
