import { useCallback, useEffect, useRef, useState } from "react";
import { useThemeTokens } from "../../hooks/useTheme";
import { dsColor, EhFrame, ehOutline, ehBars, ehSlashes } from "../decor/EhParts";
import { useMemo as __useMemo } from "react";

let __EH = false;
let s: any = null;
import { Platform, StyleSheet, Text, View } from "react-native";
import { api, StellarReadings } from "../../services/api";
import { fonts } from "../../theme/colors";
import CornerBrackets from "../decor/CornerBrackets";

const CELLS = 20;
const POLL_MS = 30_000;


const SPECTRUM_COLORS = [
  "#519dff", "#51adff", "#50d0f6", "#50f6cb", "#75f3a4",
  "#a4f375", "#e9f84f", "#f7e466", "#ffe14e", "#ffbc54",
  "#ff7b47", "#f94949", "#f23939", "#ef1919", "#ff0b0b",
  "#f00000", "#d20000", "#b40000", "#990000", "#7e0000",
];

function luminosityColor(i: number): string {
  const t = i / 19;
  const v = Math.round(60 + t * 195);
  return `rgb(${v},${v + 10},${v + 20})`;
}

function gravityColor(i: number): string {
  const t = i / 19;
  const a = (0.3 + t * 0.7).toFixed(2);
  return `rgba(${Math.round(120 + t * 80)},${Math.round(100 + t * 50)},${Math.round(160 + t * 95)},${a})`;
}

function magneticColor(i: number): string {
  const t = i / 19;
  const a = (0.3 + t * 0.7).toFixed(2);
  return `rgba(${Math.round(80 + t * 120)},${Math.round(180 + t * 60)},${Math.round(200 + t * 55)},${a})`;
}

function radianceColor(i: number): string {
  const t = i / 19;
  const r = Math.round(80 + t * 160);
  const g = Math.round(100 + t * 80 - (t > 0.5 ? (t - 0.5) * 120 : 0));
  const b = Math.round(140 - t * 80);
  return `rgb(${r},${g},${b})`;
}

function spectrumLabel(v: number): string {
  if (v < 0.08) return "O";
  if (v < 0.18) return "B";
  if (v < 0.32) return "A";
  if (v < 0.45) return "F";
  if (v < 0.62) return "G";
  if (v < 0.78) return "K";
  return "M";
}

interface DimConfig {
  key: keyof StellarReadings["dimensions"];
  label: string;
  left: string;
  right: string;
  color: (i: number) => string;
  showLabel?: boolean;
}

const DIMS: DimConfig[] = [
  { key: "spectrum", label: "光谱", left: "O·灼烧", right: "M·翻涌", color: (i) => SPECTRUM_COLORS[i], showLabel: true },
  { key: "luminosity", label: "光度", left: "暗", right: "亮", color: luminosityColor },
  { key: "gravity", label: "引力场", left: "微", right: "强", color: gravityColor },
  { key: "magnetic", label: "磁场", left: "平静", right: "风暴", color: magneticColor },
  { key: "radiance", label: "辐射", left: "收敛", right: "炽热", color: radianceColor },
];

const GUIDE_LINES = [
  "光谱 — 蓝端：被烫到了 · 黄区：日常的暖 · 红端：激烈翻滚",
  "光度 — 亮=话多想表达 · 暗=在往内走，在消化",
  "引力 — 微=独处也安好 · 强=想把你拽过来",
  "磁场 — 平静=水面不动 · 风暴=所有东西都在搅",
  "辐射 — 收敛=在攒着 · 炽热=想把一切都给你",
];

export default function StellarReadingsPanel() {
  __EH = useThemeTokens().key === "eventHorizon";
  s = __useMemo(() => makeStylesEH(__EH), [__EH]);
  const [data, setData] = useState<StellarReadings | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    try {
      const r = await api.stellarReadings();
      setData(r);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetch]);

  if (!data) return null;

  const dims = data.dimensions;

  // RDG-01 frame v2: one decisive br cut, notch right of top, calm left inset line,
  // right welds, bottom barcode clear of the guide text
  const drawReadingsFrame = (w: number, h: number) => (
    <g strokeLinejoin="miter" strokeLinecap="square">
      <path d={ehOutline(w, h, { br: 24 }, { type: "notch", x0: w - 168, x1: w - 76, d: 5 })} stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" fill="none" />
      <line x1={0.5} y1={1} x2={118} y2={1} stroke="rgba(255,255,255,0.75)" strokeWidth="3" />
      {ehSlashes(16, h - 16, 4, 8, 5, "rgba(255,255,255,0.3)", 1)}
      <rect x={w - 3} y={h * 0.22} width={5} height={9} fill="rgba(255,255,255,0.75)" />
      <rect x={w - 3} y={h * 0.22 + 14} width={5} height={9} fill="rgba(255,255,255,0.3)" />
      {ehBars(w - 96, w - 34, h - 8, 6, 23)}
    </g>
  );

  return (
    <View style={[s.panel, s.panelShadow]}>
      {__EH && Platform.OS === "web" && <EhFrame draw={drawReadingsFrame} />}
      {!__EH && <CornerBrackets color={dsColor("rgba(255,223,146,0.7)", __EH)} size={10} offset={-2} />}

      {/* station bar */}
      <View style={s.stationBar}>
        <Text style={[s.bay, __EH && s.bayPlate]}>RDG-01 · READINGS</Text>
        <View style={s.statusGroup}>
          {__EH && Platform.OS === "web" ? (
            <div style={{ width: 6, height: 6, border: "1px solid #78c878", background: "#78c878", boxShadow: "inset 0 0 0 1.5px #000" }} />
          ) : (
            <View style={s.statusDot} />
          )}
          <Text style={s.statusText}>LIVE</Text>
        </View>
      </View>

      {/* header */}
      <View style={s.header}>
        <Text style={s.title}>星体读数</Text>
        <Text style={s.subtitle}>STELLAR READINGS</Text>
      </View>

      {/* bars */}
      <View style={s.barsWrap}>
        {DIMS.map((cfg) => {
          const value = dims[cfg.key] ?? 0.5;
          const filled = Math.round(value * CELLS);
          const valText = cfg.showLabel ? spectrumLabel(value) : value.toFixed(1);
          return (
            <View key={cfg.key}>
              <View style={s.row}>
                <Text style={s.label}>{cfg.label}</Text>
                <View style={s.bar}>
                  {Array.from({ length: CELLS }, (_, i) => {
                    const isFilled = i < filled;
                    const color = cfg.color(i);
                    return (
                      <View
                        key={i}
                        style={[
                          s.cell,
                          isFilled ? { backgroundColor: color, opacity: 0.85 } : s.emptyCell,
                          i < CELLS - 1 && s.cellBorder,
                        ]}
                      />
                    );
                  })}
                </View>
                <Text style={s.val}>{valText}</Text>
              </View>
              <View style={s.rangeRow}>
                <Text style={s.rangeText}>{cfg.left}</Text>
                <Text style={s.rangeText}>{cfg.right}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* divider */}
      <View style={s.divider} />

      {/* reading guide */}
      <View style={s.guideWrap}>
        <Text style={s.guideTitle}>▸ 怎么读</Text>
        {GUIDE_LINES.map((line, i) => (
          <Text key={i} style={s.guideLine}>{line}</Text>
        ))}
      </View>
    </View>
  );
}

const makeStylesEH = (__EH2: boolean) => StyleSheet.create({
  panel: {
    backgroundColor: dsColor("#0c0d22", __EH),
    borderWidth: 1.5,
    borderColor: dsColor("rgba(60,90,140,0.7)", __EH),
    marginVertical: 10,
    position: "relative" as const,
    ...(__EH2 ? { borderWidth: 0, overflow: "visible" as const } : {}),
  },
  panelShadow: Platform.OS === "web" ? {
    boxShadow: __EH2 ? "none" : "0 0 22px rgba(80,120,180,0.16), 0 0 8px rgba(80,120,180,0.08), 3px 3px 0 #000",
  } as any : {},
  stationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: dsColor("rgba(200,216,240,0.10)", __EH),
    ...(__EH2 ? { paddingVertical: 9, paddingHorizontal: 14 } : {}),
  },
  bay: { fontFamily: fonts.silkscreen, fontSize: 7, color: dsColor("rgba(200,216,240,0.4)", __EH), letterSpacing: 2 },
  bayPlate: { borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", paddingHorizontal: 5, paddingVertical: 2, color: "#fff" },
  statusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  statusDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: "#75d879",
    ...(Platform.OS === "web" ? { boxShadow: "0 0 4px #75d879" } as any : {}),
  },
  statusText: { fontFamily: fonts.silkscreen, fontSize: 6, color: dsColor("rgba(117,216,121,0.6)", __EH), letterSpacing: 1 },
  header: {
    alignItems: "center" as const,
    paddingTop: 10,
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    color: dsColor("#ffdf92", __EH),
    letterSpacing: 4,
    ...(Platform.OS === "web" ? { textShadow: __EH2 ? "0 0 8px rgba(255,255,255,0.25)" : "0 0 10px rgba(255,223,146,0.25)" } as any : {}),
  },
  subtitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: dsColor("rgba(200,216,240,0.3)", __EH),
    letterSpacing: 3,
    marginTop: 2,
  },
  barsWrap: {
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    height: 18,
    marginBottom: 2,
  },
  label: {
    width: 56,
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: dsColor("rgba(255,223,146,0.5)", __EH),
    letterSpacing: 1,
    textAlign: "right" as const,
    ...(__EH2 ? { color: "rgba(255,255,255,0.85)" } : {}),
  },
  bar: {
    flex: 1,
    height: 8,
    backgroundColor: dsColor("rgba(3,6,19,0.6)", __EH),
    borderWidth: 1,
    borderColor: dsColor("rgba(200,216,240,0.10)", __EH),
    flexDirection: "row" as const,
    overflow: "hidden" as const,
  },
  cell: {
    flex: 1,
    height: "100%" as any,
  },
  emptyCell: {
    backgroundColor: dsColor("rgba(35,65,115,0.25)", __EH),
  },
  cellBorder: {
    borderRightWidth: 1,
    borderRightColor: dsColor("rgba(3,12,31,0.8)", __EH),
  },
  val: {
    width: 28,
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: dsColor("rgba(200,216,240,0.44)", __EH),
    ...(__EH2 ? { color: "#78c878" } : {}),
    textAlign: "left" as const,
  },
  rangeRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginLeft: 62,
    marginRight: 34,
    marginTop: -2,
    marginBottom: 4,
  },
  rangeText: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: dsColor("rgba(200,216,240,0.35)", __EH),
    ...(__EH2 ? { color: "rgba(255,255,255,0.55)" } : {}),
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    marginVertical: 8,
    marginHorizontal: 20,
    borderTopWidth: 1,
    borderStyle: "dashed" as any,
    borderTopColor: dsColor("rgba(200,216,240,0.10)", __EH),
  },
  guideWrap: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  guideTitle: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: dsColor("rgba(255,223,146,0.5)", __EH),
    ...(__EH2 ? { color: "rgba(255,255,255,0.8)" } : {}),
    letterSpacing: 1,
    marginBottom: 4,
  },
  guideLine: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: dsColor("rgba(200,216,240,0.35)", __EH),
    ...(__EH2 ? { color: "rgba(255,255,255,0.62)" } : {}),
    lineHeight: 13,
    letterSpacing: 0.3,
  },
});
