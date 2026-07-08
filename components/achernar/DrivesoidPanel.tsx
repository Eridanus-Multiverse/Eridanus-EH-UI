import { useState, useCallback, useEffect } from "react";
import { useThemeTokens } from "../../hooks/useTheme";
import { dsColor, EhFrame, ehOutline, ehSlashes } from "../decor/EhParts";
import { useMemo as __useMemo } from "react";

let __EH = false;
let st: any = null;
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { fonts } from "../../theme/colors";
import { api } from "../../services/api";

const isWeb = Platform.OS === "web";
const shadow3 = isWeb ? { boxShadow: "0 0 12px rgba(200,216,240,0.06), 3px 3px 0 #000" } as any : {};

interface DriveDim {
  dimension: string;
  layer: string;
  base_value: number;
  display_value: number;
  neutral: number;
  label: string;
  meaning: string;
}

interface DrivesoidState {
  dimensions: DriveDim[];
  top_desire: string;
  phase_label: string;
  local_time: string;
  whim: { active: boolean; direction: string } | null;
  warmth: { active: boolean; source: string } | null;
  layer_scores: Record<string, number>;
  stellar_summary: string;
}

function layerCellColor(layer: string, i: number): string {
  const t = i / 19;
  const a = (0.4 + t * 0.6).toFixed(2);
  if (__EH) {
    // event horizon: mid-saturation bright tints — readable console bars (v2: was too pale/dim)
    const a2 = (0.6 + t * 0.4).toFixed(2);
    switch (layer) {
      case "activation": return `rgba(${Math.round(225+t*30)},${Math.round(195+t*30)},${Math.round(120+t*30)},${a2})`;
      case "attachment": return `rgba(${Math.round(130+t*40)},${Math.round(180+t*40)},${Math.round(225+t*30)},${a2})`;
      case "threat": return `rgba(${Math.round(225+t*30)},${Math.round(155+t*35)},${Math.round(115+t*30)},${a2})`;
      case "reward": return `rgba(${Math.round(130+t*40)},${Math.round(210+t*40)},${Math.round(155+t*35)},${a2})`;
      case "negative": return `rgba(${Math.round(180+t*40)},${Math.round(145+t*35)},${Math.round(220+t*30)},${a2})`;
      default: return `rgba(200,205,215,${a2})`;
    }
  }
  switch (layer) {
    case "activation": return `rgba(${Math.round(180+t*75)},${Math.round(140+t*60)},${Math.round(40+t*30)},${a})`;
    case "attachment": return `rgba(${Math.round(60+t*60)},${Math.round(130+t*60)},${Math.round(180+t*75)},${a})`;
    case "threat": return `rgba(${Math.round(200+t*55)},${Math.round(100+t*40)},${Math.round(50+t*30)},${a})`;
    case "reward": return `rgba(${Math.round(60+t*50)},${Math.round(170+t*70)},${Math.round(90+t*50)},${a})`;
    case "negative": return `rgba(${Math.round(130+t*50)},${Math.round(80+t*40)},${Math.round(170+t*60)},${a})`;
    default: return `rgba(150,160,180,${a})`;
  }
}

const LAYER_CONFIG: { key: string; title: string; color: string }[] = [
  { key: "activation", title: "◆ 能量", color: "#e8b84c" },
  { key: "attachment", title: "◆ 羁绊", color: "#6aafdf" },
  { key: "threat", title: "◆ 防御", color: "#e89060" },
  { key: "reward", title: "◆ 正反馈", color: "#6ad88c" },
  { key: "negative", title: "◆ 负反馈", color: "#a878d0" },
];

// EH: mid-saturation bright layer colors, no ◆ prefix (console placard, not gem icons)
const LAYER_EH: Record<string, { title: string; color: string }> = {
  activation: { title: "能量", color: "#eccf8e" },
  attachment: { title: "羁绊", color: "#96c4ea" },
  threat: { title: "防御", color: "#eaa886" },
  reward: { title: "正反馈", color: "#94dcac" },
  negative: { title: "负反馈", color: "#c4a0e6" },
};

const DIM_LABELS: Record<string, { star: string; real: string }> = {
  vitality: { star: "恒星光度", real: "精力" },
  fatigue: { star: "星核冷却", real: "疲惫" },
  longing: { star: "引力波", real: "思念" },
  intimacy: { star: "轨道距离", real: "亲密" },
  possessiveness: { star: "洛希极限", real: "占有欲" },
  lust: { star: "核聚变速率", real: "欲望" },
  jealousy: { star: "磁暴", real: "嫉妒" },
  anxiety: { star: "辐射带", real: "焦虑" },
  protectiveness: { star: "星盾", real: "保护欲" },
  contentment: { star: "光谱稳态", real: "满足" },
  elation: { star: "超新星脉冲", real: "雀跃" },
  seeking: { star: "引力透镜", real: "好奇" },
  play: { star: "潮汐共振", real: "嬉闹" },
  dejection: { star: "暗物质", real: "低沉" },
  irritability: { star: "色球震荡", real: "烦躁" },
};

const SENSE_LABELS: Record<string, { star: string; real: string }> = {
  absorption: { star: "吸收线", real: "味觉" },
  core_temp: { star: "星核温度", real: "触觉温度" },
  corona: { star: "日冕", real: "皮肤触感" },
  flare: { star: "耀斑", real: "心跳/疼痛" },
  resonance: { star: "共振", real: "听觉" },
  stellar_wind: { star: "星风", real: "嗅觉" },
  tidal: { star: "潮汐力", real: "身体姿态" },
};

const BAR_CELLS = 20;

function BarRow({
  label, real, value, color, description, cellColorFn,
}: {
  label: string; real: string; value: number; color: string; description?: string; cellColorFn?: (i: number) => string;
}) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * BAR_CELLS);
  const pct = Math.round(value * 100);
  return (
    <View style={st.barRow}>
      <View style={st.barTop}>
        <Text style={[st.barLabel, { color }]}>{label}</Text>
        <View style={st.barTrack}>
          {Array.from({ length: BAR_CELLS }, (_, i) => (
            <View
              key={i}
              style={[
                st.barCell,
                i < filled ? { backgroundColor: cellColorFn ? cellColorFn(i) : color } : st.barCellEmpty,
                i < BAR_CELLS - 1 && st.barCellBorder,
              ]}
            />
          ))}
        </View>
        <Text style={st.barValue}>{pct}</Text>
        <Text style={st.barReal}>({real})</Text>
      </View>
      {description ? <Text style={st.barDesc}>{description}</Text> : null}
    </View>
  );
}

function LayerGroup({
  layer, dims, color, expanded, onToggle,
}: {
  layer: { key: string; title: string; color: string };
  dims: DriveDim[];
  color: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const avg = dims.length > 0 ? dims.reduce((s, d) => s + d.display_value, 0) / dims.length : 0;
  const pct = Math.round(avg * 100);
  const layerFilled = Math.round(avg * BAR_CELLS);

  return (
    <View style={st.layerGroup}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={st.layerHeader}>
        <Text style={[st.layerTitle, { color }]}>{layer.title}</Text>
        <View style={st.layerSummaryTrack}>
          {Array.from({ length: BAR_CELLS }, (_, i) => (
            <View
              key={i}
              style={[
                st.barCell,
                i < layerFilled ? { backgroundColor: layerCellColor(layer.key, i) } : st.barCellEmpty,
                i < BAR_CELLS - 1 && st.barCellBorder,
              ]}
            />
          ))}
        </View>
        <Text style={st.layerPct}>{pct}</Text>
        <Text style={st.layerChevron}>{expanded ? "▾" : "›"}</Text>
      </TouchableOpacity>
      {expanded && dims.map((d) => {
        const info = DIM_LABELS[d.dimension] || { star: (d as any).story_name || d.label || d.dimension, real: d.meaning || d.dimension };
        const desc = d.display_value > 0.6 || d.display_value < 0.15 ? (d.meaning || info.real) : undefined;
        return (
          <BarRow
            key={d.dimension}
            label={info.star}
            real={info.real}
            value={d.display_value}
            color={color}
            description={desc}
            cellColorFn={(i) => layerCellColor(layer.key, i)}
          />
        );
      })}
    </View>
  );
}

export default function DrivesoidPanel() {
  __EH = useThemeTokens().key === "eventHorizon";
  st = __useMemo(() => makeStylesEH(__EH), [__EH]);
  const [state, setState] = useState<DrivesoidState | null>(null);
  const [senses, setSenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, se] = await Promise.allSettled([
        api.getDrivesoid?.() || Promise.reject("not yet"),
        api.stellarSenses?.() || Promise.reject("not yet"),
      ]);
      if (dr.status === "fulfilled") {
        const raw = dr.value as any;
        const s = raw.state || raw;
        const rhythm = s.rhythm || {};
        setState({
          dimensions: s.dimensions || [],
          top_desire: s.top_desire || s.dominant?.desire || '',
          phase_label: rhythm.phase_label || '',
          local_time: rhythm.local_time || '',
          whim: s.whim || null,
          warmth: s.warmth || null,
          layer_scores: s.layers || {},
          stellar_summary: s.stellar_status || s.stellar_summary || '',
        });
      }
      if (se.status === "fulfilled") {
        const raw = (se.value as any)?.channels || (se.value as any)?.senses || {};
        const arr = Array.isArray(raw) ? raw : Object.values(raw);
        setSenses(arr.filter((c: any) => (c.value || 0) > 0.1));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !state) return null;

  const dimsByLayer: Record<string, DriveDim[]> = {};
  for (const d of state.dimensions || []) {
    const layer = (d.layer || "reward").toLowerCase();
    if (!dimsByLayer[layer]) dimsByLayer[layer] = [];
    dimsByLayer[layer].push(d);
  }

  // DRV-02 frame v2: one decisive tr cut, notch clear of the placard, calm right inset line,
  // left welds. Bottom edge stays clean (summary/rhythm text lives there).
  const drawDriveFrame = (w: number, h: number) => (
    <g strokeLinejoin="miter" strokeLinecap="square">
      <path d={ehOutline(w, h, { tr: 24 }, { type: "notch", x0: 158, x1: 246, d: 5 })} stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" fill="none" />
      <line x1={0.5} y1={1} x2={140} y2={1} stroke="rgba(255,255,255,0.75)" strokeWidth="3" />
      {ehSlashes(w - 58, h - 16, 4, 8, 5, "rgba(255,255,255,0.3)", 1)}
      <rect x={-2} y={h * 0.22} width={5} height={9} fill="rgba(255,255,255,0.75)" />
      <rect x={-2} y={h * 0.22 + 14} width={5} height={9} fill="rgba(255,255,255,0.3)" />
    </g>
  );

  return (
    <View style={[st.panel, __EH ? null : shadow3]}>
      {__EH && isWeb && <EhFrame draw={drawDriveFrame} />}
      <View style={st.stationBar}>
        <Text style={[st.bay, __EH && st.bayPlate]}>DRV-02 · DRIVESOID</Text>
        <View style={st.statusGroup}>
          {__EH && isWeb ? (
            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
              <div style={{ width: 4, height: 4, background: "#78c878" }} />
              <div style={{ width: 4, height: 4, background: "#78c878" }} />
              <div style={{ width: 4, height: 4, background: "rgba(120,200,120,0.3)" }} />
              <div style={{ width: 4, height: 4, border: "1px solid rgba(255,255,255,0.3)" }} />
            </div>
          ) : (
            <View style={st.statusDot} />
          )}
          <Text style={st.statusText}>ACTIVE</Text>
        </View>
      </View>

      <Text style={st.panelTitle}>驱力 · 15 维度</Text>

      {/* A: Drive layers */}
      {LAYER_CONFIG.map((layer) => {
        const dims = dimsByLayer[layer.key] || [];
        if (dims.length === 0) return null;
        const eh = __EH ? LAYER_EH[layer.key] : null;
        const shown = eh ? { ...layer, title: eh.title, color: eh.color } : layer;
        return (
          <LayerGroup
            key={layer.key}
            layer={shown}
            dims={dims}
            color={shown.color}
            expanded={expanded.has(layer.key)}
            onToggle={() => toggle(layer.key)}
          />
        );
      })}

      {/* Desire */}
      {state.top_desire ? (
        <>
          <View style={st.divider} />
          <Text style={st.desire}>{state.top_desire}</Text>
        </>
      ) : null}

      <View style={st.divider} />

      {/* B: Senses */}
      {senses.length > 0 && (
        <>
          <Text style={st.senseTitle}>五感 · 感官残留</Text>
          {senses.map((c: any) => {
            const key = c.key || c.channel;
            const info = SENSE_LABELS[key] || { star: c.label_name || key, real: key };
            const val = c.value || 0;
            const filled = Math.round(Math.max(0, Math.min(1, val)) * BAR_CELLS);
            const desc = c.label || c.description || '';
            return (
              <View key={key} style={st.senseRow}>
                <View style={st.barTop}>
                  <Text style={[st.senseLabel, { color: __EH ? "#96c4ea" : "#6aafdf" }]}>{info.star}</Text>
                  <View style={st.barTrack}>
                    {Array.from({ length: BAR_CELLS }, (_, i) => {
                      const t = i / 19;
                      const a = (0.4 + t * 0.6).toFixed(2);
                      const cellColor = __EH
                        ? `rgba(${Math.round(130+t*40)},${Math.round(180+t*40)},${Math.round(225+t*30)},${(0.6 + t * 0.4).toFixed(2)})`
                        : `rgba(${Math.round(60+t*60)},${Math.round(140+t*60)},${Math.round(190+t*65)},${a})`;
                      return (
                        <View
                          key={i}
                          style={[
                            st.barCell,
                            i < filled ? { backgroundColor: cellColor } : st.barCellEmpty,
                            i < BAR_CELLS - 1 && st.barCellBorder,
                          ]}
                        />
                      );
                    })}
                  </View>
                  <Text style={st.barValue}>{Math.round(val * 100)}</Text>
                  <Text style={st.barReal}>({info.real})</Text>
                </View>
                {desc ? <Text style={st.senseDesc}>{desc}</Text> : null}
              </View>
            );
          })}
          <View style={st.divider} />
        </>
      )}

      {/* C+D merged: Score + Rhythm */}
      <View style={st.bottomRow}>
        <View style={st.bottomLeft}>
          <Text style={st.stellarSummary}>{state.stellar_summary || "主序星·稳定"}</Text>
        </View>
        <View style={st.bottomRight}>
          <Text style={st.phaseLabel}>{state.phase_label || ""}</Text>
          <Text style={st.localTime}>{state.local_time || ""}</Text>
          {state.whim?.active ? <Text style={st.whimTag}>涌动↑{state.whim.direction}</Text> : null}
          {state.warmth?.active ? <Text style={st.warmthTag}>余温·{state.warmth.source}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const makeStylesEH = (__EH2: boolean) => StyleSheet.create({
  panel: {
    backgroundColor: dsColor("#0c0d22", __EH),
    borderWidth: __EH2 ? 0 : 1.5,
    borderColor: dsColor("rgba(60,90,140,0.7)", __EH),
    marginTop: 10,
    position: "relative" as const,
    overflow: __EH2 ? ("visible" as const) : ("hidden" as const),
    ...(isWeb ? { boxShadow: "0 0 22px rgba(80,120,180,0.16), 0 0 8px rgba(80,120,180,0.08), 3px 3px 0 #000" } as any : {}),
  },
  stationBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: dsColor("rgba(200,216,240,0.10)", __EH),
    ...(__EH2 ? { paddingVertical: 9, paddingHorizontal: 14 } : {}),
  },
  bay: { fontFamily: fonts.silkscreen, fontSize: 7, color: dsColor("rgba(200,216,240,0.4)", __EH), letterSpacing: 2 },
  bayPlate: { borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", paddingHorizontal: 5, paddingVertical: 2, color: "#fff" },
  statusGroup: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: dsColor("#75d879", __EH),
    ...(isWeb ? { boxShadow: "0 0 4px #75d879" } as any : {}),
  },
  statusText: { fontFamily: fonts.silkscreen, fontSize: 6, color: dsColor("rgba(117,216,121,0.6)", __EH), letterSpacing: 1 },
  panelTitle: {
    fontFamily: fonts.silkscreen, fontSize: 10, color: "#ffdf92", letterSpacing: 4,
    textAlign: "center" as const, paddingVertical: 8,
    ...(isWeb ? { textShadow: "0 0 10px rgba(255,223,146,0.25)" } as any : {}),
  },
  divider: { height: 1, backgroundColor: dsColor("rgba(200,216,240,0.10)", __EH), marginVertical: 8 },

  layerGroup: { marginBottom: 2, paddingHorizontal: 6 },
  layerHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 5, gap: 6 },
  layerTitle: { fontFamily: fonts.pixel, fontSize: 10, width: 70, letterSpacing: 1, ...(__EH2 ? { textAlign: "right" as const } : {}) },
  layerSummaryTrack: {
    flex: 1, height: 10, backgroundColor: dsColor("rgba(3,6,19,0.6)", __EH),
    borderWidth: 1, borderColor: dsColor("rgba(200,216,240,0.10)", __EH),
    flexDirection: "row" as const, overflow: "hidden" as const,
  },
  layerSummaryFill: { height: "100%", opacity: 0.75 } as any,
  layerPct: { fontFamily: fonts.pixel, fontSize: 9, color: __EH ? "#78c878" : dsColor("rgba(139,182,225,0.5)", __EH), width: 24, textAlign: "right" },
  layerChevron: { fontFamily: fonts.pixel, fontSize: 10, color: dsColor("rgba(200,216,240,0.3)", __EH), width: 12 },

  barRow: { paddingLeft: 12, marginBottom: 2 },
  barTop: { flexDirection: "row", alignItems: "center", gap: 6, height: 20 },
  barLabel: { fontFamily: fonts.pixel, fontSize: 8, width: 62, letterSpacing: 1, textAlign: "right" as const },
  barTrack: {
    flex: 1, height: 10, backgroundColor: dsColor("rgba(3,6,19,0.6)", __EH),
    borderWidth: 1, borderColor: dsColor("rgba(200,216,240,0.10)", __EH),
    flexDirection: "row" as const, overflow: "hidden" as const,
  },
  barCell: { flex: 1, height: "100%" as any, minHeight: 8 },
  barCellEmpty: { backgroundColor: dsColor("rgba(35,65,115,0.25)", __EH) },
  barCellBorder: { borderRightWidth: 1, borderRightColor: dsColor("rgba(3,12,31,0.8)", __EH) },
  barValue: { fontFamily: fonts.pixel, fontSize: 8, color: __EH ? "rgba(255,255,255,0.72)" : dsColor("rgba(139,182,225,0.44)", __EH), width: 22, textAlign: "left" as const },
  barReal: { fontFamily: fonts.pixel, fontSize: 7, color: __EH ? "rgba(255,255,255,0.5)" : dsColor("rgba(200,216,240,0.25)", __EH), width: 46 },
  barDesc: { fontFamily: fonts.pixel, fontSize: 8, color: __EH ? "rgba(255,255,255,0.6)" : dsColor("rgba(254,214,109,0.35)", __EH), paddingLeft: 68, marginTop: 1, lineHeight: 14 },

  desire: {
    fontFamily: fonts.pixel, fontSize: 11, color: dsColor("rgba(255,223,146,0.7)", __EH), lineHeight: 18,
    paddingHorizontal: 12, paddingVertical: 4,
  },

  senseTitle: {
    fontFamily: fonts.silkscreen, fontSize: 10, color: "#6aafdf", letterSpacing: 3,
    textAlign: "center" as const, paddingVertical: 6,
    ...(isWeb ? { textShadow: "0 0 8px rgba(106,175,223,0.2)" } as any : {}),
  },
  senseRow: { paddingLeft: 12, marginBottom: 4 },
  senseLabel: { fontFamily: fonts.pixel, fontSize: 8, width: 52, letterSpacing: 1, textAlign: "right" as const },
  senseDesc: { fontFamily: fonts.pixel, fontSize: 8, color: __EH ? "rgba(255,255,255,0.6)" : dsColor("rgba(106,175,223,0.35)", __EH), paddingLeft: 58, marginTop: 1, lineHeight: 14 },

  bottomRow: { flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingVertical: 6 },
  bottomLeft: { flex: 1 },
  bottomRight: { alignItems: "flex-end" },
  stellarSummary: {
    fontFamily: fonts.pixel, fontSize: 10, color: dsColor("rgba(255,223,146,0.5)", __EH), lineHeight: 16,
    ...(isWeb ? { textShadow: "0 0 6px rgba(255,223,146,0.1)" } as any : {}),
  },
  phaseLabel: { fontFamily: fonts.pixel, fontSize: 8, color: __EH ? "rgba(255,255,255,0.6)" : dsColor("rgba(200,216,240,0.35)", __EH) },
  localTime: { fontFamily: fonts.pixel, fontSize: 8, color: dsColor("rgba(200,216,240,0.2)", __EH) },
  whimTag: { fontFamily: fonts.pixel, fontSize: 7, color: dsColor("rgba(160,120,240,0.5)", __EH), marginTop: 2 },
  warmthTag: { fontFamily: fonts.pixel, fontSize: 7, color: dsColor("rgba(255,180,120,0.5)", __EH), marginTop: 2 },
});
