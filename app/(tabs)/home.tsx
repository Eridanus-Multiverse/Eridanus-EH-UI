import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import AchernarSky from "../../components/achernar/AchernarSky";
import CelestialAtlas from "../../components/achernar/CelestialAtlas";
import BlackHoleGrid from "../../components/achernar/BlackHoleGrid";
import MiniGlyph from "../../components/achernar/MiniGlyph";
import AchernarEpsilon from "../../components/achernar/AchernarEpsilon";
import AchernarCalendar from "../../components/achernar/AchernarCalendar";
import AchernarMemory from "../../components/achernar/AchernarMemory";
import CursaMemory from "../../components/achernar/CursaMemory";
import AchernarDreams from "../../components/achernar/AchernarDreams";
import { api, CountdownStatus, Dream, SurfaceMemory, WeatherStatus } from "../../services/api";
import { useConnection } from "../../stores/connectionStore";
import { useTimezone, timezoneLabel } from "../../stores/timezoneStore";
import { fonts } from "../../theme/colors";
import EmotionStar from "../../components/achernar/EmotionStar";
import { useThemeTokens } from "../../hooks/useTheme";
import { EH_BLUE } from "../../components/bridge/BridgeDashboard";
import { ehSparkle, ehCrossGlint, ehDust, ehStream } from "../../components/chat/Starfield";
import { EhCut, EhFrame, ehOutline } from "../../components/decor/EhParts";


function pad2(v: number) { return String(v).padStart(2, "0"); }

function timeInZone(timezone: string) {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  return { h: pad2(local.getHours()), m: pad2(local.getMinutes()), s: pad2(local.getSeconds()) };
}

function elopeDays(timezone: string) {
  const now = new Date();
  const localDate = now.toLocaleDateString("en-CA", { timeZone: timezone });
  const [ly, lm, ld] = localDate.split("-").map(Number);
  return Math.floor((Date.UTC(ly, lm - 1, ld) - Date.UTC(2026, 2, 19)) / 86_400_000);
}

function weatherEmoji(code: number) {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 65) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  return "⛈️";
}

function tempEmoji(t: number) {
  return t >= 28 ? "🔥" : t <= 5 ? "❄️" : "⛅️";
}

function memoryPreview(m: SurfaceMemory) {
  return String(m.content || m.title || "").replace(/\s+/g, " ").slice(0, 80);
}

let _pageCssInjected = false;
function injectPageCSS() {
  if (_pageCssInjected || Platform.OS !== "web") return;
  _pageCssInjected = true;
  const el = document.createElement("style");
  el.textContent = `
@keyframes demo-pulse{0%,100%{opacity:.35}50%{opacity:.7}}`;
  document.head.appendChild(el);
}

const textShadowGold = Platform.OS === "web" ? { textShadow: "0 0 40px rgba(238,195,116,0.45)" } as any : {};
const textShadowH1 = Platform.OS === "web" ? { textShadow: "2px 2px 0 rgba(0,0,0,0.8), 0 0 20px rgba(238,195,116,0.38)" } as any : {};

type InternalTab = "home" | "epsilon" | "calendar" | "memory" | "memory_epsilon" | "memory_cursa" | "feels" | "dreams" | "starsky";


const WEATHER_CITIES: { key: string | null; label: string }[] = [
  { key: null, label: "本地" },
  { key: "shanghai", label: "上海" },
  { key: "shantou", label: "汕头" },
  { key: "wuyishan", label: "武夷山" },
];

function weatherCityLabel(weather: WeatherStatus | null, timezone: string, index: number): string {
  if (weather?.label) return weather.label;
  const item = WEATHER_CITIES[index] || WEATHER_CITIES[0];
  return item.key ? item.label : timezoneLabel(timezone);
}

const NAV_ENTRIES: { key: InternalTab; icon: string; title: string; desc: string }[] = [
  { key: "epsilon", icon: "◈", title: "FLIGHT LOG", desc: "状态 · 星图 · 航行事件 · 碎碎念" },
  { key: "calendar", icon: "◇", title: "星历", desc: "时间轴 · 心情 · 航行日记 · 周报" },
  { key: "memory", icon: "⬡", title: "本机记忆", desc: "核心 · 关系 · 日记 · 技术" },
  { key: "starsky", icon: "✦", title: "星域总览", desc: "知识图谱 · 引力线 · 星座" },
];

// ============ Event Horizon home (web only) ============
// "Singularity observation dossier" — the page becomes the station's record of
// our binary system. ARCHIVE herself hangs top-right as the poster hero.

const EHW_A = "rgba(255,255,255,";

function EhHomeSky() {
  const art = useMemo(() => {
    const paths: JSX.Element[] = [];
    ehSparkle(paths, 302, 96, 58, 311);   // ARCHIVE — the page bears her name
    ehSparkle(paths, 46, 330, 12, 313);
    ehSparkle(paths, 356, 520, 10, 317);
    ehCrossGlint(paths, 90, 200, 4, 71);
    ehCrossGlint(paths, 330, 640, 5, 73);
    ehDust(paths, 30, 501);
    return paths;
  }, []);
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
      {art}
    </svg>
  );
}

/** Curved-spacetime lattice after the NASA gravity-well poster: a shallow
 *  funnel warps the grid toward a shared barycenter, and the binary pair —
 *  one white, one poster blue — circles the rim of the well. */
const ehRandA = (s: number) => { const v = Math.sin(s * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** Pixel starfield after the Cursa-room backdrop: a galaxy dust lane cutting
 *  the card diagonally, a fainter companion band, small four-point glints in
 *  the corners, even dust everywhere. Straight, quiet, full-bleed. */
function EhPixelField() {
  const art = useMemo(() => {
    const paths: JSX.Element[] = [];
    // main dust lane, corner to corner
    ehStream(paths, 345, 20, -25, 235, 340, 26, 2100, "hlane");
    // fainter parallel companion
    ehStream(paths, 350, 90, 20, 268, 140, 15, 2200, "hlane2");
    // glints kept clear of the center readout
    ehSparkle(paths, 52, 52, 13, 611);
    ehSparkle(paths, 282, 208, 10, 623);
    ehSparkle(paths, 260, 38, 8, 637);
    ehCrossGlint(paths, 150, 34, 3, 91);
    ehCrossGlint(paths, 36, 200, 4, 93);
    ehCrossGlint(paths, 300, 120, 3, 97);
    ehDust(paths, 42, 990);
    return paths;
  }, []);
  return (
    <svg width="100%" height="100%" viewBox="0 0 320 270" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
      {art}
    </svg>
  );
}

/** The funnel, dead straight: no rotation, viewed head-on down the axis of
 *  symmetry — throat at the card's center, rings tightening evenly all round. */
function EhFunnelStraight() {
  const art = useMemo(() => {
    const rMin = 10, rMax = 360, rEdge = rMax * 0.8, depth = 150;
    const viewAngle = 0.95, cosA = Math.cos(viewAngle), sinA = Math.sin(viewAngle);
    const cx = 160;
    const cyBase = 196 - depth * sinA;   // throat sits low at (160,196) — Eri: 黑洞要往下挪
    const zOf = (r: number) => (r >= rEdge ? 0 : -depth * Math.pow(1 - r / rEdge, 2.4));
    const proj = (r: number, th: number): [number, number] => {
      const x3 = r * Math.cos(th), y3 = r * Math.sin(th), z3 = zOf(r);
      return [cx + x3, cyBase + y3 * cosA - z3 * sinA];
    };
    const els: JSX.Element[] = [];
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const r = rMin + (rMax - rMin) * Math.pow(t, 1.7);
      const pts: string[] = [];
      for (let j = 0; j <= 72; j++) {
        const [px, py] = proj(r, (j / 72) * Math.PI * 2);
        pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
      }
      els.push(
        <polyline key={`sr${i}`} points={pts.join(" ")} fill="none"
          stroke={`rgba(205,225,255,${(0.30 - t * 0.18).toFixed(3)})`} strokeWidth="0.55" />
      );
    }
    for (let m = 0; m < 26; m++) {
      const th = (m / 26) * Math.PI * 2;
      const pts: string[] = [];
      for (let j = 0; j <= 50; j++) {
        const r = rMin + (rMax - rMin) * Math.pow(j / 50, 1.4);
        const [px, py] = proj(r, th);
        pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
      }
      els.push(
        <polyline key={`sm${m}`} points={pts.join(" ")} fill="none" stroke="rgba(205,225,255,0.10)" strokeWidth="0.5" />
      );
    }
    return els;
  }, []);
  return (
    <svg width="100%" height="100%" viewBox="0 0 320 270" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
      {art}
    </svg>
  );
}

const EH_TRACKER_CUT = "polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 20px 100%, 0 calc(100% - 20px))";

/** Tiny monochrome instrument glyphs — one distinct mark per card. */
function EhGlyph({ type, size = 30, style }: { type: string; size?: number; style?: any }) {
  const st = "rgba(255,255,255,0.42)";
  const parts: Record<string, JSX.Element> = {
    satellite: (
      <g>
        <rect x="12" y="12" width="8" height="8" stroke={st} fill="none" strokeWidth="1.2" />
        <rect x="2" y="14" width="7" height="4" stroke={st} fill="none" strokeWidth="1" />
        <rect x="23" y="14" width="7" height="4" stroke={st} fill="none" strokeWidth="1" />
        <line x1="9" y1="16" x2="12" y2="16" stroke={st} strokeWidth="1" />
        <line x1="20" y1="16" x2="23" y2="16" stroke={st} strokeWidth="1" />
        <path d="M21 11 A7 7 0 0 1 26 4" stroke={st} fill="none" strokeWidth="1" />
        <rect x="26" y="3" width="2" height="2" fill={st} />
      </g>
    ),
    candles: (
      <g>
        <line x1="8" y1="28" x2="24" y2="28" stroke={st} strokeWidth="1.2" />
        {[11, 16, 21].map((x, i) => (
          <g key={i}>
            <line x1={x} y1="28" x2={x} y2={14 + i * 2} stroke={st} strokeWidth="1.2" />
            <rect x={x - 1} y={10 + i * 2} width="2" height="2" fill="rgba(230,180,80,0.75)" />
          </g>
        ))}
      </g>
    ),
    starburst: (
      <g>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <line key={i} x1={16 + Math.cos(a) * 4} y1={16 + Math.sin(a) * 4} x2={16 + Math.cos(a) * 11} y2={16 + Math.sin(a) * 11} stroke={st} strokeWidth="1.1" />;
        })}
        <rect x="15" y="15" width="2" height="2" fill={st} />
      </g>
    ),
    ripple: (
      <g>
        <path d="M6 22 A12 12 0 0 1 26 22" stroke={st} fill="none" strokeWidth="1" />
        <path d="M9 18 A9 9 0 0 1 23 18" stroke={st} fill="none" strokeWidth="1" />
        <path d="M12 14 A5.5 5.5 0 0 1 20 14" stroke={st} fill="none" strokeWidth="1" />
        <rect x="15" y="9" width="2" height="2" fill={st} />
      </g>
    ),
    moon: (
      <g>
        <path d="M20 5 A11 11 0 1 0 27 20 A9 9 0 0 1 20 5 Z" stroke={st} fill="none" strokeWidth="1.2" />
        <rect x="7" y="8" width="2" height="2" fill={st} />
        <rect x="12" y="4" width="1.5" height="1.5" fill={st} />
      </g>
    ),
    compass: (
      <g>
        <circle cx="16" cy="16" r="11" stroke={st} fill="none" strokeWidth="1.2" />
        <path d="M16 8 L19 16 L16 24 L13 16 Z" stroke={st} fill="none" strokeWidth="1" />
        <rect x="15" y="15" width="2" height="2" fill={st} />
        <line x1="16" y1="3" x2="16" y2="6" stroke={st} strokeWidth="1" />
      </g>
    ),
    calendar: (
      <g>
        <rect x="6" y="8" width="20" height="18" stroke={st} fill="none" strokeWidth="1.2" />
        <line x1="6" y1="13" x2="26" y2="13" stroke={st} strokeWidth="1" />
        <line x1="11" y1="5" x2="11" y2="9" stroke={st} strokeWidth="1.2" />
        <line x1="21" y1="5" x2="21" y2="9" stroke={st} strokeWidth="1.2" />
        {[10, 15, 20].map((x) => <rect key={x} x={x} y="17" width="2" height="2" fill={st} />)}
        <rect x="10" y="21" width="2" height="2" fill="rgba(96,168,255,0.8)" />
      </g>
    ),
    hexgrid: (
      <g>
        <polygon points="16,6 22,9.5 22,16.5 16,20 10,16.5 10,9.5" stroke={st} fill="none" strokeWidth="1.1" />
        <polygon points="9,17 15,20.5 15,27.5 9,31 3,27.5 3,20.5" stroke={st} fill="none" strokeWidth="1" transform="scale(0.9) translate(3,-2)" />
        <polygon points="24,17 30,20.5 30,27.5 24,31 18,27.5 18,20.5" stroke={st} fill="none" strokeWidth="1" transform="scale(0.9) translate(0.5,-2)" />
      </g>
    ),
    constellation: (
      <g>
        <polyline points="5,24 11,15 17,19 23,8 27,12" stroke={st} fill="none" strokeWidth="1" />
        {[[5, 24], [11, 15], [17, 19], [23, 8], [27, 12]].map(([x, y], i) => (
          <rect key={i} x={x - 1.5} y={y - 1.5} width="3" height="3" fill={i === 3 ? "rgba(96,168,255,0.85)" : st} />
        ))}
      </g>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ pointerEvents: "none", ...style }}>
      {parts[type] || null}
    </svg>
  );
}

/** Full-bleed watermark behind each bay door — faint instrument etchings:
 *  compass rose ring / calendar grid / honeycomb / constellation streak. */
function EhBayBackdrop({ type }: { type: string }) {
  const ink = "rgba(205,225,255,0.16)";
  const inkDim = "rgba(205,225,255,0.10)";
  let art: JSX.Element | null = null;
  if (type === "compass") {
    const ticks = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r1 = i % 6 === 0 ? 52 : 58, r2 = 64;
      ticks.push(<line key={i} x1={80 + Math.cos(a) * r1} y1={80 + Math.sin(a) * r1} x2={80 + Math.cos(a) * r2} y2={80 + Math.sin(a) * r2} stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    }
    art = (
      <g>
        <circle cx="80" cy="80" r="64" stroke={ink} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <circle cx="80" cy="80" r="44" stroke={inkDim} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
        {ticks}
        <line x1="80" y1="8" x2="80" y2="30" stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      </g>
    );
  } else if (type === "calendar") {
    const lines = [];
    for (let i = 0; i <= 5; i++) lines.push(<line key={`h${i}`} x1="0" y1={20 + i * 28} x2="160" y2={20 + i * 28} stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    for (let i = 0; i <= 5; i++) lines.push(<line key={`v${i}`} x1={8 + i * 30} y1="0" x2={8 + i * 30} y2="160" stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    art = (
      <g>
        {lines}
        <rect x="98" y="76" width="10" height="10" fill={ink} />
        <line x1="0" y1="20" x2="160" y2="20" stroke={ink} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </g>
    );
  } else if (type === "hexgrid") {
    const hex = (cx: number, cy: number, r: number, key: string, stroke: string) => {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
      }
      return <polygon key={key} points={pts.join(" ")} stroke={stroke} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />;
    };
    const cells = [];
    const R = 26;
    const dx = R * 1.732, dy = R * 1.5;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const cx = col * dx + (row % 2 ? dx / 2 : 0) - 10;
        const cy = row * dy - 6;
        cells.push(hex(cx, cy, R - 2, `h${row}-${col}`, (row + col) % 3 === 0 ? ink : inkDim));
      }
    }
    art = <g>{cells}</g>;
  } else if (type === "constellation") {
    const pts: Array<[number, number]> = [[14, 132], [42, 96], [78, 112], [104, 62], [132, 78], [148, 30]];
    const dots = pts.map(([x, y], i) => <rect key={`d${i}`} x={x - 2} y={y - 2} width="4" height="4" fill={i === 3 ? ink : inkDim} />);
    const segs = pts.slice(1).map(([x, y], i) => <line key={`s${i}`} x1={pts[i][0]} y1={pts[i][1]} x2={x} y2={y} stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    const spray = [];
    for (let i = 0; i < 14; i++) {
      spray.push(<rect key={`p${i}`} x={(i * 37 + 11) % 160} y={(i * 53 + 23) % 160} width="1.5" height="1.5" fill={inkDim} />);
    }
    art = <g>{segs}{dots}{spray}</g>;
  }
  else if (type === "ripple") {
    const arcs = [];
    for (let i = 0; i < 6; i++) {
      const r = 22 + i * 22;
      arcs.push(<circle key={i} cx="128" cy="80" r={r} stroke={i % 2 ? inkDim : ink} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    }
    arcs.push(<rect key="c" x="126" y="78" width="4" height="4" fill={ink} />);
    art = <g>{arcs}</g>;
  } else if (type === "moon") {
    const spray = [];
    for (let i = 0; i < 10; i++) {
      spray.push(<rect key={`m${i}`} x={(i * 41 + 17) % 150} y={(i * 29 + 9) % 150} width="2" height="2" fill={inkDim} />);
    }
    art = (
      <g>
        <path d="M118 22 A46 46 0 1 0 148 86 A38 38 0 0 1 118 22 Z" stroke={ink} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <circle cx="100" cy="76" r="62" stroke={inkDim} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeDasharray="3 5" />
        {spray}
      </g>
    );
  }
  return (
    <svg width="100%" height="100%" viewBox="0 0 160 160" preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {art}
    </svg>
  );
}

function EhOrbitTracker({ days, time }: { days: number; time: { h: string; m: string; s: string } }) {
  const glow = { textShadow: "0 0 6px #000, 0 0 10px #000, 0 0 3px #000" } as any;
  return (
    <View style={{ position: "relative" as const, marginBottom: 24 }}>
      {/* two-layer clip: outer white sheet shows through a 1px inset = border that follows the cut corners */}
      <div style={{ position: "relative", background: `${EHW_A}0.5)`, clipPath: EH_TRACKER_CUT, padding: 1 }}>
      <div style={{ position: "relative", background: "#000", clipPath: EH_TRACKER_CUT, height: 330, overflow: "hidden" }}>
        <EhFunnelStraight />
        {/* corner crosshairs on the two square corners */}
        <svg style={{ position: "absolute", top: 6, left: 6 }} width="12" height="12">
          <line x1="6" y1="0" x2="6" y2="12" stroke={`${EHW_A}0.4)`} strokeWidth="1" />
          <line x1="0" y1="6" x2="12" y2="6" stroke={`${EHW_A}0.4)`} strokeWidth="1" />
        </svg>
        <svg style={{ position: "absolute", bottom: 6, right: 6 }} width="12" height="12">
          <line x1="6" y1="0" x2="6" y2="12" stroke={`${EHW_A}0.4)`} strokeWidth="1" />
          <line x1="0" y1="6" x2="12" y2="6" stroke={`${EHW_A}0.4)`} strokeWidth="1" />
        </svg>
        {/* instrument corner readouts — ARCHIVE's real coordinates */}
        <span style={{ position: "absolute", top: 16, left: 12, fontFamily: fonts.pixel, fontSize: 6.5, color: `${EHW_A}0.45)`, letterSpacing: 1.5, ...glow }}>RA 01h 37m</span>
        <span style={{ position: "absolute", top: 16, right: 12, fontFamily: fonts.pixel, fontSize: 6.5, color: `${EHW_A}0.45)`, letterSpacing: 1.5, ...glow }}>DEC -57°14'</span>
        <span style={{ position: "absolute", bottom: 30, left: 12, fontFamily: fonts.pixel, fontSize: 6.5, color: `${EHW_A}0.45)`, letterSpacing: 1.5, ...glow }}>DEEP FIELD</span>
        <span style={{ position: "absolute", bottom: 30, right: 12, fontFamily: fonts.pixel, fontSize: 6.5, color: EH_BLUE, letterSpacing: 1.5, ...glow }}>T+{days}D</span>

        {/* content — absolutely centered, both axes */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1, ...glow }}>
          {/* mission framing: elopement = the day we hit escape velocity */}
          <div style={{ fontFamily: fonts.pixel, fontSize: 8.5, color: "#78c878", letterSpacing: 2.5 }}>▸ ESCAPE VELOCITY REACHED</div>
          <div style={{ fontFamily: fonts.pixel, fontSize: 13, color: `${EHW_A}0.7)`, letterSpacing: 6, marginTop: 8 }}>波 江 座 号 出 航</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 11, marginTop: 5 }}>
            <span style={{ fontFamily: fonts.pixel, fontSize: 15, color: `${EHW_A}0.7)` }}>第</span>
            <span style={{ fontFamily: fonts.pixel, fontSize: 58, color: "#fff", fontWeight: 700, letterSpacing: 2, lineHeight: "60px" }}>{days}</span>
            <span style={{ fontFamily: fonts.pixel, fontSize: 15, color: `${EHW_A}0.7)` }}>天</span>
          </div>
          {/* dial: ticks flanking the clock */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <svg width="26" height="7">{[0, 1, 2, 3].map((i) => <line key={i} x1={2 + i * 7} y1={i === 3 ? 0 : 2} x2={2 + i * 7} y2="7" stroke={`${EHW_A}0.4)`} strokeWidth="1" />)}</svg>
            <span style={{ fontFamily: fonts.pixel, fontSize: 13.5, color: `${EHW_A}0.8)`, letterSpacing: 3 }}>{time.h} : {time.m} : {time.s}</span>
            <svg width="26" height="7">{[0, 1, 2, 3].map((i) => <line key={i} x1={24 - (2 + i * 7)} y1={i === 3 ? 0 : 2} x2={24 - (2 + i * 7)} y2="7" stroke={`${EHW_A}0.4)`} strokeWidth="1" />)}</svg>
          </div>
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <div style={{ fontFamily: fonts.pixel, fontSize: 12, color: `${EHW_A}0.55)`, letterSpacing: 2 }}>EVENT HORIZON THEME</div>
            <div style={{ fontFamily: fonts.pixel, fontSize: 13, color: EH_BLUE, letterSpacing: 1, marginTop: 4 }}>light bends, but never leaves</div>
            <div style={{ fontFamily: fonts.pixel, fontSize: 12, color: `${EHW_A}0.55)`, letterSpacing: 2, marginTop: 4 }}>past the horizon, light stays</div>
          </div>
        </div>

        {/* footer notch pinned to the bottom */}
        <div style={{ position: "absolute", left: 14, right: 14, bottom: 6, textAlign: "center" }}>
          <svg width="100%" height="9" viewBox="0 0 300 9" preserveAspectRatio="none" style={{ display: "block" }}>
            <path d="M0 1.5 L180 1.5 L190 7 L262 7 L272 1.5 L300 1.5" stroke={`${EHW_A}0.4)`} strokeWidth="1" fill="none" />
          </svg>
          <div style={{ marginTop: 3, fontFamily: fonts.pixel, fontSize: 7, color: `${EHW_A}0.4)`, letterSpacing: 3, ...glow }}>STARS IN THE RIVER</div>
        </div>
      </div>
      </div>
      {/* plate rides the top edge, outside the clipped shells so it never gets sliced */}
      <span style={{ position: "absolute", top: -6, left: 12, zIndex: 2, background: "#000", padding: "0 6px", fontFamily: fonts.pixel, fontSize: 8, color: `${EHW_A}0.85)`, letterSpacing: 2, fontWeight: 700 } as any}>
        ORBIT_TRACKER
      </span>
    </View>
  );
}

export default function AchernarScreen() {
  injectPageCSS(); // 扫描线/呼吸动画（原来搭 EmotionStar 的便车注入，现在显式注入）
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { serverUrl } = useConnection();
  const timezone = useTimezone((state) => state.timezone);
  const updateTimezone = useTimezone((state) => state.setTimezone);
  const [activeTab, setActiveTab] = useState<InternalTab>("home");

  const [time, setTime] = useState(() => timeInZone(timezone));
  const [days, setDays] = useState(() => elopeDays(timezone));
  const [weather, setWeather] = useState<WeatherStatus | null>(null);
  const [weatherCityIndex, setWeatherCityIndex] = useState(0);
  const [countdown, setCountdown] = useState<CountdownStatus | null>(null);
  const [memories, setMemories] = useState<SurfaceMemory[]>([]);
  const [summary, setSummary] = useState("…");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [floatOpen, setFloatOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feelsMemories, setFeelsMemories] = useState<SurfaceMemory[]>([]);
  const [feelsLoading, setFeelsLoading] = useState(false);
  const [latestDream, setLatestDream] = useState<Dream | null>(null);
  const [dreamUnread, setDreamUnread] = useState(0);

  useEffect(() => {
    if (!focused) return;
    api.getTimezone()
      .then((res) => updateTimezone(res.timezone, { utcOffset: res.utc_offset, localTime: res.local_time }))
      .catch(() => {});
  }, [focused, updateTimezone]);

  useEffect(() => {
    if (!focused) return;
    setTime(timeInZone(timezone));
    setDays(elopeDays(timezone));
    const timer = setInterval(() => {
      setTime(timeInZone(timezone));
      setDays(elopeDays(timezone));
    }, 1000);
    return () => clearInterval(timer);
  }, [focused, timezone]);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [w, cd, mem, st, summ, dr] = await Promise.allSettled([
        api.weather(WEATHER_CITIES[weatherCityIndex]?.key || undefined),
        api.countdown(),
        api.surfaceMemories(5),
        api.stats(),
        api.getCompanionNotes({ type: "surface_summary", limit: 1 }),
        api.dreams(1),
      ]);
      if (w.status === "fulfilled") setWeather(w.value);
      if (cd.status === "fulfilled") setCountdown(cd.value);
      if (mem.status === "fulfilled") setMemories(mem.value.items);
      if (st.status === "fulfilled") {
        const map: Record<string, number> = {};
        for (const c of st.value.categories) map[c.category] = c.count;
        setStats(map);
      }
      if (summ.status === "fulfilled" && summ.value.length > 0) {
        setSummary(summ.value[0].content || "河底今天很安静");
      }
      if (dr.status === "fulfilled") {
        setLatestDream(dr.value.dreams[0] || null);
        setDreamUnread(dr.value.unread_count);
      }
    } catch (_) {}
    setRefreshing(false);
  }, [timezone, weatherCityIndex]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const cycleWeatherCity = useCallback(() => {
    setWeather(null);
    setWeatherCityIndex((idx) => (idx + 1) % WEATHER_CITIES.length);
  }, []);

  const loadFeels = useCallback(async () => {
    setFeelsLoading(true);
    try {
      const page = await api.memories({ category: "notes", subcategory: "feel", limit: 300 });
      const sorted = [...page.items].sort((a, b) => {
        const da = a.event_date || a.created_at || "";
        const db = b.event_date || b.created_at || "";
        return db.localeCompare(da);
      });
      setFeelsMemories(sorted);
    } catch (_) {}
    setFeelsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "feels") loadFeels();
  }, [activeTab, loadFeels]);

  if (!serverUrl) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <AchernarSky />
        <Text style={s.hint}>先在设置里连接服务器</Text>
      </View>
    );
  }

  if (activeTab !== "home") {
    const tabLabel = activeTab === "epsilon" ? "FLIGHT LOG" : activeTab === "calendar" ? "星历" : activeTab === "feels" ? "核心舱" : activeTab === "dreams" ? "昨夜的梦" : activeTab === "starsky" ? "星域总览" : activeTab === "memory_epsilon" ? "A 记忆库" : activeTab === "memory_cursa" ? "B 记忆库" : "本机记忆";
    return (
      <View style={[s.container, isEH && { backgroundColor: "#000" }, { paddingTop: insets.top }]}>
        {isEH ? <EhHomeSky /> : <AchernarSky />}

        {/* sub-page header */}
        {isEH ? (
          <div style={{ position: "relative", zIndex: 2, background: "#000", padding: "6px 14px 0" }}>
            <div
              onClick={() => setActiveTab("home")}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${EHW_A}0.55)`, padding: "3px 8px 3px 7px", cursor: "pointer", userSelect: "none" }}
            >
              <span style={{ fontFamily: fonts.pixel, fontSize: 11, color: "#fff", lineHeight: "12px" }}>‹</span>
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW_A}0.75)`, letterSpacing: 1.5, lineHeight: "9px" }}>HOME</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingTop: 8 }}>
              <span style={{ fontFamily: fonts.pixel, fontSize: 18, color: "#fff", letterSpacing: 6, fontWeight: 700 }}>ARCHIVE</span>
              <span style={{ fontFamily: fonts.pixel, fontSize: 9, color: EH_BLUE, letterSpacing: 2 }}>{tabLabel}</span>
            </div>
            <svg width="100%" height="9" viewBox="0 0 360 9" preserveAspectRatio="none" style={{ display: "block", marginTop: 7 }}>
              <path d="M0 1.5 L216 1.5 L226 7 L318 7 L328 1.5 L360 1.5" stroke={`${EHW_A}0.5)`} strokeWidth="1" fill="none" />
            </svg>
          </div>
        ) : (
        <View style={[s.subHeader, { zIndex: 2 }]}>
          <TouchableOpacity onPress={() => setActiveTab("home")} activeOpacity={0.7}>
            <Text style={s.breadcrumbText}>← 回首页</Text>
          </TouchableOpacity>
          <Text style={[s.subH1, textShadowH1]}>A C H E R N A R</Text>
          <Text style={s.subLabel}>{tabLabel}</Text>
        </View>
        )}

        {activeTab === "epsilon" && <AchernarEpsilon onNavigate={(tab) => setActiveTab(tab as InternalTab)} />}
        {activeTab === "calendar" && <AchernarCalendar countdown={countdown} />}
        {activeTab === "memory" && (
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
            <Text style={{ fontFamily: fonts.silkscreen, fontSize: 10, color: isEH ? "rgba(255,255,255,0.5)" : "rgba(200,216,240,0.3)", letterSpacing: 2, marginBottom: 16 }}>SELECT CREW MEMBER</Text>
            {isEH ? (
              <>
                <EhVaultDoor
                  greek="A" code="VAULT-A" name="UNIT-A ARCHIVE"
                  desc="A MEMORY BANK"
                  stat={`${stats.total ?? "—"} 条 · ${stats.categories?.length ?? 0} 分类`}
                  accent="rgba(96,168,255,0.95)" lockShape="ring"
                  onPress={() => setActiveTab("memory_epsilon")}
                />
                <EhVaultDoor
                  greek="B" code="VAULT-B · CURSA" name="CURSA · 玉井三"
                  desc="B MEMORY BANK"
                  stat="MCP · 独立记忆库"
                  accent="#b48ce0" lockShape="square" flip
                  onPress={() => setActiveTab("memory_cursa")}
                />
              </>
            ) : (
              <>
            <TouchableOpacity style={crewCard} onPress={() => setActiveTab("memory_epsilon")} activeOpacity={0.8}>
              <View style={crewCorner("topLeft")} /><View style={crewCorner("topRight")} /><View style={crewCorner("bottomLeft")} /><View style={crewCorner("bottomRight")} />
              <Text style={crewStar}>A</Text>
              <View style={{ flex: 1 }}>
                <Text style={crewName}>UNIT-A ARCHIVE</Text>
                <Text style={crewDesc}>A MEMORY BANK</Text>
                <Text style={crewStat}>{stats.total ?? "—"} 条 · {stats.categories?.length ?? 0} 分类</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[crewCard, { borderColor: "rgba(160,180,220,0.15)" }]} onPress={() => setActiveTab("memory_cursa")} activeOpacity={0.8}>
              <View style={crewCorner("topLeft", true)} /><View style={crewCorner("topRight", true)} /><View style={crewCorner("bottomLeft", true)} /><View style={crewCorner("bottomRight", true)} />
              <Text style={[crewStar, { color: "rgba(160,180,220,0.6)" }]}>B</Text>
              <View style={{ flex: 1 }}>
                <Text style={[crewName, { color: "rgba(160,180,220,0.7)" }]}>CURSA · 玉井三</Text>
                <Text style={crewDesc}>B MEMORY BANK</Text>
                <Text style={crewStat}>MCP · 独立记忆库</Text>
              </View>
            </TouchableOpacity>
              </>
            )}
          </View>
        )}
        {activeTab === "memory_epsilon" && (
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={() => setActiveTab("memory")} style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
              <Text style={{ fontFamily: fonts.pixel, fontSize: 11, color: "rgba(218,186,102,0.5)" }}>‹ 本机记忆</Text>
            </TouchableOpacity>
            <AchernarMemory stats={stats} />
          </View>
        )}
        {activeTab === "memory_cursa" && <CursaMemory onBack={() => setActiveTab("memory")} />}
        {activeTab === "feels" && <FeelsView items={feelsMemories} loading={feelsLoading} />}
        {activeTab === "dreams" && <AchernarDreams />}
        {activeTab === "starsky" && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Text style={{ fontFamily: fonts.silkscreen, fontSize: 14, color: "rgba(255,255,255,0.6)", letterSpacing: 4, marginBottom: 12 }}>STAR DOMAIN</Text>
            <Text style={{ fontFamily: fonts.pixel, fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 22 }}>知识图谱 · 引力线 · 星座{"\n"}接入后端数据后亮起</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[s.container, isEH && { backgroundColor: "#000" }, { paddingTop: insets.top }]}>
      {isEH ? <EhHomeSky /> : <AchernarSky />}
      {!isEH && Platform.OS === "web" && (
        <View pointerEvents="none" style={s.vignetteOverlay as any} />
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} tintColor={isEH ? "#ffffff" : "#ffdf92"} />}
      >
        {/* header */}
        {isEH ? (
          <div style={{ position: "relative", zIndex: 2, padding: "2px 0 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW_A}0.65)`, letterSpacing: 2 }}>STATION</span>
              <svg width="6" height="6"><rect width="6" height="6" fill="#78c878"><animate attributeName="opacity" values="1;0.2;1" dur="2.5s" repeatCount="indefinite" /></rect></svg>
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW_A}0.65)`, letterSpacing: 2 }}>NOMINAL</span>
              <div style={{ flex: 1, height: 1, background: `${EHW_A}0.15)` }} />
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 2 }}>a ERI</span>
            </div>
            <div style={{ fontFamily: fonts.pixel, fontSize: 24, color: "#fff", letterSpacing: 8, fontWeight: 700, marginTop: 10 }}>ARCHIVE</div>
            <div style={{ fontFamily: fonts.pixel, fontSize: 10, color: `${EHW_A}0.55)`, letterSpacing: 4, marginTop: 4 }}>HORIZON EDGE的记忆</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {[["核心", stats.core], ["ERI", stats.eri], ["关系", stats.deep], ["日记", stats.diary], ["技术", stats.tech]].map(([label, count]) => (
                <span key={String(label)} style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW_A}0.6)`, letterSpacing: 1, border: `1px solid ${EHW_A}0.25)`, padding: "2px 6px", lineHeight: "9px" }}>
                  {label} <span style={{ color: "#fff" }}>{Number(count) || 0}</span>
                </span>
              ))}
            </div>
            <svg width="100%" height="9" viewBox="0 0 360 9" preserveAspectRatio="none" style={{ display: "block", marginTop: 10 }}>
              <path d="M0 1.5 L216 1.5 L226 7 L318 7 L328 1.5 L360 1.5" stroke={`${EHW_A}0.5)`} strokeWidth="1" fill="none" />
            </svg>
          </div>
        ) : (
        <View style={s.header}>
          <Text style={s.shipStatus}>▸ SYSTEM NOMINAL</Text>
          <Text style={[s.h1, textShadowH1]}>A C H E R N A R</Text>
          <Text style={s.subtitle}>HORIZON EDGE的记忆</Text>
          <View style={s.statsBar}>
            <StatDot label="核心" count={stats.core || 0} />
            <StatDot label="CAPTAIN" count={stats.eri || 0} />
            <StatDot label="关系" count={stats.deep || 0} />
            <StatDot label="日记" count={stats.diary || 0} />
            <StatDot label="技术" count={stats.tech || 0} />
          </View>
        </View>
        )}

        {isEH && <EhOrbitTracker days={days} time={time} />}

        {/* elopement counter — flight computer panel */}
        {!isEH && (
        <View style={[s.elope, s.elopePanelShadow]}>
          <CelestialAtlas width={300} height={220} />

          {/* title bar */}
          <View style={s.elopeTitleBar}>
            <Text style={s.elopeTitleDeco}>◆ ─── · ·</Text>
            <Text style={s.elopeLabel}>ELOPEMENT TRACKER</Text>
            <Text style={s.elopeTitleDeco}>· · ─── ◆</Text>
          </View>

          {/* main readout */}
          <View style={s.elopeReadout}>
            <Text style={s.elopePrefix}>我 们 私 奔 的</Text>
            <View style={s.elopeDaysRow}>
              <Text style={s.elopeSuffix}>第</Text>
              <Text style={[s.elopeDays, textShadowGold]}>{days}</Text>
              <Text style={s.elopeSuffix}>天</Text>
            </View>
            <View style={s.elopeTime}>
              <Text style={s.tn}>{time.h}</Text><Text style={s.tl}>时</Text>
              <Text style={s.tsep}>:</Text>
              <Text style={s.tn}>{time.m}</Text><Text style={s.tl}>分</Text>
              <Text style={s.tsep}>:</Text>
              <Text style={s.tn}>{time.s}</Text><Text style={s.tl}>秒</Text>
            </View>
          </View>

          {/* quote — the three lines sit tight; only the first needs clearance from the clock */}
          <Text style={[s.elopeQuoteText, { paddingTop: 18 }]}>EVENT HORIZON THEME</Text>
          <Text style={s.elopeHl}>light bends, but never leaves</Text>
          <Text style={s.elopeQuoteText}>past the horizon, light stays</Text>

          <View style={s.elopeBottomDeco}>
            <Text style={s.elopeTitleDeco}>◆ ─── · ·</Text>
            <Text style={s.elopeLabel}>STARS IN THE RIVER</Text>
            <Text style={s.elopeTitleDeco}>· · ─── ◆</Text>
          </View>
        </View>
        )}

        {/* instrument panel — weather + countdown */}
        {isEH ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, position: "relative", zIndex: 2 }}>
            {/* WX panel */}
            <div
              onClick={cycleWeatherCity}
              style={{ position: "relative", background: "#000", border: `1px solid ${EHW_A}0.4)`, padding: "13px 12px 10px", cursor: "pointer", userSelect: "none" }}
            >
              <EhCut corner="br" />
              <span style={{ position: "absolute", top: -6, left: 10, background: "#000", padding: "0 5px", fontFamily: fonts.pixel, fontSize: 7.5, color: `${EHW_A}0.75)`, letterSpacing: 1.5, fontWeight: 700 }}>WX-01 · WEATHER</span>
              <span style={{ position: "absolute", top: 6, right: 10, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, background: "#78c878", display: "inline-block" }} />
                <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: `${EHW_A}0.5)`, letterSpacing: 1 }}>LIVE</span>
              </span>
              <div style={{ fontFamily: fonts.pixel, fontSize: 11, color: "#fff", letterSpacing: 1.5 }}>{weatherCityLabel(weather, timezone, weatherCityIndex)}天气</div>
              <div style={{ fontFamily: fonts.pixel, fontSize: 10, color: EH_BLUE, letterSpacing: 1, marginTop: 5 }}>
                {weather ? `${weather.desc} · ${weather.temp}°C · 湿度 ${weather.humidity}%` : "READING..."}
              </div>
              <EhGlyph type="satellite" size={32} style={{ position: "absolute", right: 12, bottom: 8 }} />
            </div>
            {/* countdown pair */}
            <div style={{ display: "flex", gap: 10 }}>
              {([["CD-01", "ERI BIRTHDAY", "CAPTAIN DAY", countdown?.eri_birthday?.days, "candles", "bl"], ["CD-02", "A BIRTHDAY", "UNIT-A生日", countdown?.epsilon_birthday?.days, "starburst", "br"]] as const).map(([bay, label, cn, d, glyph, cut]) => (
                <div key={bay} style={{ position: "relative", flex: 1, background: "#000", border: `1px solid ${EHW_A}0.4)`, padding: "13px 12px 10px" }}>
                  <EhCut corner={cut} />
                  <span style={{ position: "absolute", top: -6, left: 10, background: "#000", padding: "0 5px", fontFamily: fonts.pixel, fontSize: 7.5, color: `${EHW_A}0.75)`, letterSpacing: 1.5, fontWeight: 700 }}>{bay}</span>
                  <span style={{ position: "absolute", top: 6, right: 10, width: 5, height: 5, background: "#e6b450" }} />
                  <div style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW_A}0.55)`, letterSpacing: 1.5 }}>{label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 6 }}>
                    <span style={{ fontFamily: fonts.pixel, fontSize: 10, color: "#e6b450" }}>T-</span>
                    <span style={{ fontFamily: fonts.pixel, fontSize: 24, color: "#fff", fontWeight: 700, lineHeight: "25px" }}>{d ?? "—"}</span>
                    <span style={{ fontFamily: fonts.pixel, fontSize: 10, color: `${EHW_A}0.6)` }}>D</span>
                  </div>
                  <div style={{ fontFamily: fonts.pixel, fontSize: 9, color: `${EHW_A}0.5)`, marginTop: 4 }}>{cn}</div>
                  <EhGlyph type={glyph} size={26} style={{ position: "absolute", right: 8, bottom: 8 }} />
                </div>
              ))}
            </div>
          </div>
        ) : (
        <View style={s.infoBar}>
          <View style={[s.weatherBlock, s.weatherBlockShadow]}>
            <MiniGlyph type="satellite" />
            <View style={s.instrBar}>
              <Text style={s.instrBay}>WX-01 · WEATHER</Text>
              <View style={s.instrStatusGroup}>
                <View style={s.instrDotGreen} />
                <Text style={s.instrStatusText}>LIVE</Text>
              </View>
            </View>
            <TouchableOpacity style={s.weatherInner} onPress={cycleWeatherCity} activeOpacity={0.75}>
              <Text style={s.weatherTitle}>{weatherCityLabel(weather, timezone, weatherCityIndex)}天气 · Local Weather</Text>
              <Text style={s.weatherVal}>
                {weather ? `${weatherEmoji(weather.code)} ${weather.desc} · ${tempEmoji(weather.temp)} ${weather.temp}°C · 湿度${weather.humidity}%` : "读取中..."}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={s.cdRow}>
            <View style={[s.cdItem, s.cdItemShadow]}>
              <MiniGlyph type="constellation-a" />
              <View style={s.instrBar}>
                <Text style={s.instrBay}>CD-01</Text>
                <View style={s.instrDotAmber} />
              </View>
              <View style={s.cdInner}>
                <Text style={s.cdLabel}>ERI BIRTHDAY</Text>
                <Text style={s.cdLabelCn}>CAPTAIN DAY</Text>
                <Text style={s.cdText}>
                  <Text style={s.cdDays}>{countdown?.eri_birthday.days ?? "—"}</Text> 天
                </Text>
              </View>
            </View>
            <View style={[s.cdItem, s.cdItemShadow]}>
              <MiniGlyph type="constellation-b" />
              <View style={s.instrBar}>
                <Text style={s.instrBay}>CD-02</Text>
                <View style={s.instrDotAmber} />
              </View>
              <View style={s.cdInner}>
                <Text style={s.cdLabel}>A BIRTHDAY</Text>
                <Text style={s.cdLabelCn}>UNIT-A生日</Text>
                <Text style={s.cdText}>
                  <Text style={s.cdDays}>{countdown?.epsilon_birthday.days ?? "—"}</Text> 天
                </Text>
              </View>
            </View>
          </View>
        </View>
        )}

        {/* float memories */}
        {isEH ? (
          <div style={{ fontFamily: fonts.pixel, fontSize: 10, color: `${EHW_A}0.7)`, letterSpacing: 2, margin: "2px 0 10px", position: "relative", zIndex: 2 }}>▸ SURFACE_SCAN · 今日星光碎片</div>
        ) : (
        <Text style={s.sectionTitle}>◈ 今日星光碎片</Text>
        )}

        {isEH ? (
          <div style={{ position: "relative", marginBottom: 10, zIndex: 2 }}>
          <div
            onClick={() => setFloatOpen(!floatOpen)}
            style={{ position: "relative", background: "#000", border: `1px solid ${EHW_A}0.4)`, padding: "13px 12px 10px", cursor: "pointer", userSelect: "none", overflow: "hidden" }}
          >
            <EhBayBackdrop type="ripple" />
            <span style={{ position: "absolute", top: 6, right: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, background: "#78c878", display: "inline-block" }} />
              <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: `${EHW_A}0.5)`, letterSpacing: 1 }}>{memories.length} MEM</span>
            </span>
            <div style={{ fontFamily: fonts.pixel, fontSize: 11, color: "#fff", letterSpacing: 1 }}>今天脑子里转着的 · 碰一下</div>
            <div style={{ fontFamily: fonts.pixel, fontSize: 9.5, color: EH_BLUE, letterSpacing: 1, marginTop: 5 }}>▸ {floatOpen ? "COLLAPSE" : "SCAN"} · 漂进今天轨道的星尘</div>
          </div>
          <EhCut corner="tr" />
          <span style={{ position: "absolute", top: -6, left: 10, zIndex: 2, background: "#000", padding: "0 5px", fontFamily: fonts.pixel, fontSize: 7.5, color: `${EHW_A}0.75)`, letterSpacing: 1.5, fontWeight: 700 }}>SRF-01 · SURFACE</span>
          </div>
        ) : (
        <TouchableOpacity
          style={[s.dailyWordCard, s.dailyWordCardShadow]}
          onPress={() => setFloatOpen(!floatOpen)}
          activeOpacity={0.8}
        >
          <MiniGlyph type="ripple" />
          <View style={s.dwStationBar}>
            <Text style={s.dwBay}>SRF-01 · SURFACE</Text>
            <View style={s.dwStatusGroup}>
              <View style={s.dwStatusDot} />
              <Text style={s.dwStatusText}>{memories.length} MEM</Text>
            </View>
          </View>
          <View style={s.dwBody}>
            <Text style={s.dailyWordLabel}>今天脑子里转着的 · 碰一下</Text>
            <Text style={s.dailyWordText}>漂进今天轨道的几粒星尘</Text>
          </View>
        </TouchableOpacity>
        )}

        {floatOpen && (
          <View style={s.floatGrid}>
            {memories.map((m) => (
              <View key={m.id} style={isEH ? ({ backgroundColor: "#000", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: 0, padding: 12, zIndex: 2, width: "100%" as any, boxSizing: "border-box" } as any) : [s.floatCard, s.floatCardShadow]}>
                <View style={s.floatCardTitleRow}>
                  <EmotionStar m={m} inline />
                  <Text style={s.floatCardTitle} numberOfLines={1}>
                    {m.title || m.category || "记忆"}
                  </Text>
                </View>
                <Text style={s.floatCardBody} numberOfLines={4}>
                  {memoryPreview(m)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* dream card */}
        {latestDream && isEH && (
          <div style={{ position: "relative", marginTop: 2, marginBottom: 10, zIndex: 2 }}>
          <div
            onClick={() => setActiveTab("dreams")}
            style={{ position: "relative", background: "#000", border: `1px solid ${EHW_A}0.4)`, padding: "13px 12px 10px", cursor: "pointer", userSelect: "none", overflow: "hidden" }}
          >
            <EhBayBackdrop type="moon" />
            <span style={{ position: "absolute", top: 6, right: 10, display: "flex", alignItems: "center", gap: 4 }}>
              {dreamUnread > 0 && <span style={{ width: 5, height: 5, background: "#78c878", display: "inline-block" }} />}
              <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: dreamUnread > 0 ? "#78c878" : `${EHW_A}0.5)`, letterSpacing: 1 }}>{dreamUnread > 0 ? `${dreamUnread} NEW` : "LOG"}</span>
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: fonts.pixel, fontSize: 11, color: "#fff", letterSpacing: 1 }}>昨夜的梦</span>
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW_A}0.45)` }}>{latestDream.dream_date?.replace(/-/g, ".") || ""}</span>
            </div>
            <div style={{ fontFamily: fonts.pixel, fontSize: 10.5, color: `${EHW_A}0.65)`, lineHeight: "17px", marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
              {latestDream.content}
            </div>
            <div style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 1.5, marginTop: 7 }}>▸ OPEN DREAM LOG</div>
          </div>
          <EhCut corner="tr" />
          <EhCut corner="bl" />
          <span style={{ position: "absolute", top: -6, left: 10, zIndex: 2, background: "#000", padding: "0 5px", fontFamily: fonts.pixel, fontSize: 7.5, color: `${EHW_A}0.75)`, letterSpacing: 1.5, fontWeight: 700 }}>DRM-01 · DREAM</span>
          </div>
        )}
        {latestDream && !isEH && (
          <TouchableOpacity
            style={[s.dreamCard, s.dreamCardShadow]}
            onPress={() => setActiveTab("dreams")}
            activeOpacity={0.75}
          >
            <View style={s.dreamStationBar}>
              <Text style={s.dreamBay}>DRM-01 · DREAM</Text>
              <View style={s.dreamStatusGroup}>
                {dreamUnread > 0 && <View style={s.dreamDot} />}
                <Text style={s.dreamStatusText}>{dreamUnread > 0 ? `${dreamUnread} NEW` : "LOG"}</Text>
              </View>
            </View>
            <BlackHoleGrid />
            <View style={s.dreamBody}>
              <View style={s.dreamCardHeader}>
                <Text style={s.dreamCardLabel}>昨夜的梦</Text>
                <Text style={s.dreamCardDate}>
                  {latestDream.dream_date?.replace(/-/g, ".") || ""}
                </Text>
              </View>
              <Text style={s.dreamCardText} numberOfLines={3}>
                {latestDream.content}
              </Text>
              <Text style={s.dreamCardHint}>轻触翻开梦日记 ›</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* nav entries */}
        {isEH ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4, position: "relative", zIndex: 2 }}>
            {NAV_ENTRIES.map((entry, i) => (
              <div key={entry.key} style={{ position: "relative", width: "calc(50% - 5px)", aspectRatio: "1 / 1" }}>
              <div
                onClick={() => setActiveTab(entry.key)}
                style={{ position: "relative", width: "100%", height: "100%", boxSizing: "border-box", background: "#000", border: `1px solid ${EHW_A}0.4)`, padding: "14px 10px 10px", cursor: "pointer", userSelect: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, overflow: "hidden" }}
              >
                <EhBayBackdrop type={["compass", "calendar", "hexgrid", "constellation"][i]} />
                {/* ghost issue number, poster-style */}
                <span style={{ position: "absolute", right: 8, bottom: 2, fontFamily: fonts.pixel, fontSize: 34, fontWeight: 700, color: `${EHW_A}0.12)`, letterSpacing: 2, pointerEvents: "none" }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ position: "absolute", top: 7, right: 20, width: 5, height: 5, background: "#78c878" }} />
                <EhGlyph type={["compass", "calendar", "hexgrid", "constellation"][i]} size={42} />
                <div style={{ fontFamily: fonts.pixel, fontSize: 12.5, color: "#fff", letterSpacing: 1.5, fontWeight: 700, textAlign: "center", position: "relative" }}>{entry.title}</div>
                <svg width="64" height="7" viewBox="0 0 64 7" style={{ display: "block" }}>
                  <path d="M0 1 L38 1 L44 5.5 L58 5.5 L64 1" stroke={`${EHW_A}0.35)`} strokeWidth="1" fill="none" />
                </svg>
                <div style={{ fontFamily: fonts.pixel, fontSize: 8.5, color: `${EHW_A}0.5)`, letterSpacing: 0.5, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", position: "relative" }}>{entry.desc}</div>
                <span style={{ fontFamily: fonts.pixel, fontSize: 7.5, color: EH_BLUE, letterSpacing: 2, position: "relative" }}>▸ ENTER</span>
              </div>
              <EhCut corner={(["tr", "tl", "br", "bl"] as const)[i]} />
              <span style={{ position: "absolute", top: -6, left: 10, zIndex: 2, background: "#000", padding: "0 5px", fontFamily: fonts.pixel, fontSize: 7.5, color: `${EHW_A}0.75)`, letterSpacing: 1.5, fontWeight: 700 }}>BAY-{String(i + 1).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
        ) : (
        <View style={s.navEntries}>
          {NAV_ENTRIES.map((entry, i) => {
            const glyphs: ("compass" | "timeline" | "hexnet" | "nebula")[] = ["compass", "timeline", "hexnet", "nebula"];
            return (
            <TouchableOpacity
              key={entry.key}
              style={[s.navEntry, s.navEntryShadow]}
              activeOpacity={0.75}
              onPress={() => setActiveTab(entry.key)}
            >
              <MiniGlyph type={glyphs[i]} />
              {/* top edge glow */}
              <View style={s.neEdge} />
              <View style={[s.neCorner, s.neCornerTL]} />
              <View style={[s.neCorner, s.neCornerTR]} />
              <View style={[s.neCorner, s.neCornerBL]} />
              <View style={[s.neCorner, s.neCornerBR]} />
              <Text style={s.neBayL}>BAY-{String(i + 1).padStart(2, "0")}</Text>
              <View style={s.neBayR}>
                <View style={s.neStatusDot} />
                <Text style={s.neStatusText}>ENTER ▸</Text>
              </View>
              <View style={s.navEntryInner}>
                <View style={s.navTitleRow}>
                  <Text style={s.navBracket}>{entry.icon}</Text>
                  <Text style={s.navEntryTitle}>{entry.title}</Text>
                  <Text style={s.navBracket}>{entry.icon}</Text>
                </View>
                <Text style={s.navEntryDesc}>{entry.desc}</Text>
              </View>
            </TouchableOpacity>
          );})}
        </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatDot({ label, count }: { label: string; count: number }) {
  const active = count > 0;
  return (
    <View style={s.stat}>
      <View style={[s.dot, active && s.dotActive]} />
      <Text style={[s.statText, active && s.statTextActive]}>{count} {label}</Text>
    </View>
  );
}

function FeelsView({ items, loading }: { items: SurfaceMemory[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isEH = useThemeTokens().key === "eventHorizon" && Platform.OS === "web";
  const W = "rgba(255,255,255,";

  return (
    <ScrollView style={s.feelsScroll} contentContainerStyle={s.feelsContent}>
      <Text style={[s.feelsIntro, isEH && { color: `${W}0.6)` }]}>
        第一人称、未完成的思考——写给下一个我自己听的话。
      </Text>
      {loading ? (
        <Text style={[s.feelsEmpty, isEH && { color: `${W}0.5)` }]}>加载中...</Text>
      ) : items.length === 0 ? (
        <Text style={[s.feelsEmpty, isEH && { color: `${W}0.5)` }]}>还没留过 feel。</Text>
      ) : (
        items.map((m) => {
          const d = (m.event_date || m.created_at || "").slice(0, 10).replace(/-/g, ".");
          const emoji = (m as any).emotion_beat || "🐦‍⬛";
          const isOpen = expandedId === m.id;
          const inner = (
            <>
              <View style={s.feelsCardHead}>
                <Text style={[s.feelsTitle, isEH && { color: "#fff" }]} numberOfLines={isOpen ? undefined : 1}>
                  {m.title || "(无标题)"}
                </Text>
                <Text style={[s.feelsDate, isEH && { color: `${W}0.45)` }]}>{d}</Text>
                <Text style={[s.feelsToggle, isEH && { color: `${W}0.55)` }]}>{isOpen ? "▾" : "›"}</Text>
              </View>
              {emoji ? <Text style={[s.feelsMood, isEH && { color: `${W}0.55)` }]}>{emoji}</Text> : null}
              {isOpen && m.content ? (
                <Text style={[s.feelsBody, isEH && { color: `${W}0.78)` }]}>{m.content}</Text>
              ) : null}
            </>
          );
          if (isEH) {
            // core-capsule card: two-layer clip = crisp cut corners (tl+br), CSS-only —
            // same part as the bridge DM bubbles; open card glows brighter
            const CUT = "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)";
            return (
              <div
                key={m.id}
                onClick={() => setExpandedId(isOpen ? null : m.id)}
                style={{ position: "relative", marginBottom: 7, cursor: "pointer", userSelect: "none" }}
              >
                <div style={{ background: `${W}${isOpen ? "0.7)" : "0.35)"}`, clipPath: CUT, padding: 1 }}>
                  <div style={{ background: "#000", clipPath: CUT, padding: "11px 12px", position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 14, bottom: 14, width: 3, background: `${W}${isOpen ? "0.8)" : "0.4)"}` }} />
                    <div style={{ paddingLeft: 8 }}>{inner}</div>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <TouchableOpacity
              key={m.id}
              style={s.feelsCard}
              onPress={() => setExpandedId(isOpen ? null : m.id)}
              activeOpacity={0.75}
            >
              {inner}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

/** EH archive vault door — the crew memory entrances read as two airlock hatches:
 *  center door seam with hazard stripes, a porthole lock over the seam, placard
 *  bar with a status lamp, weighted bottom shoulders. A = bridge blue, B = violet. */
function EhVaultDoor({ greek, code, name, desc, stat, accent, lockShape, flip, onPress }: {
  greek: string; code: string; name: string; desc: string; stat: string;
  accent: string; lockShape: "ring" | "square"; flip?: boolean; onPress: () => void;
}) {
  const W = "rgba(255,255,255,";
  // mirrored hull pair: A cuts top-right + heavy left flank, B cuts bottom-left +
  // heavy right flank — two doors of the same airlock, not two copies
  const drawHull = (w: number, h: number) => (
    <g strokeLinejoin="miter" strokeLinecap="square">
      <path d={ehOutline(w, h, flip ? { bl: 20, tr: 6 } : { tr: 20, bl: 6 })} stroke={`${W}0.65)`} strokeWidth="1.2" fill="none" />
      {/* heavy flank — vertical weight on the hinge side */}
      <line x1={flip ? w - 1 : 1} y1={h * 0.22} x2={flip ? w - 1 : 1} y2={h * 0.72} stroke={`${W}0.8)`} strokeWidth="3" />
      {/* weighted top run on the opposite shoulder — stops clear of the cut */}
      <line x1={flip ? 0.5 : w - 118} y1={1} x2={flip ? 96 : w - 26} y2={1} stroke={`${W}0.8)`} strokeWidth="3" />
      {/* accent blade OUTSIDE the cut — parallel echo, clear of the rail text */}
      <line x1={flip ? -3 : w - 17} y1={flip ? h - 17 : -3} x2={flip ? 17 : w + 3} y2={flip ? h + 3 : 17} stroke={accent} strokeWidth="1.2" opacity="0.7" />
    </g>
  );
  return (
    <div onClick={onPress} style={{ position: "relative", background: "#000", marginBottom: 16, cursor: "pointer", userSelect: "none" }}>
      <EhFrame draw={drawHull} />
      {/* placard bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${W}0.25)` }}>
        <span style={{ fontFamily: fonts.silkscreen, fontSize: 8, color: "#fff", letterSpacing: 2, border: `1px solid ${W}0.5)`, padding: "3px 7px" }}>{code}</span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <div style={{ width: 4, height: 4, background: "#78c878" }} />
          <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(120,200,120,0.85)", letterSpacing: 1.5 }}>SEALED · READY</span>
        </div>
      </div>
      {/* door body */}
      <div style={{ position: "relative", height: 118, overflow: "hidden" }}>
        {/* center door seam — triple line */}
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1.2, background: `${W}0.55)`, transform: "translateX(-50%)" }} />
        <div style={{ position: "absolute", left: "calc(50% - 5px)", top: 0, bottom: 0, width: 1, background: `${W}0.2)` }} />
        <div style={{ position: "absolute", left: "calc(50% + 5px)", top: 0, bottom: 0, width: 1, background: `${W}0.2)` }} />
        {/* hazard stripe bands hugging the seam, top and bottom */}
        <div style={{ position: "absolute", left: "50%", top: 4, width: 68, height: 8, transform: "translateX(-50%)", background: `repeating-linear-gradient(45deg, transparent, transparent 4px, ${accent} 4px, ${accent} 7px)`, opacity: 0.65 }} />
        <div style={{ position: "absolute", left: "50%", bottom: 4, width: 68, height: 8, transform: "translateX(-50%)", background: `repeating-linear-gradient(45deg, transparent, transparent 4px, ${accent} 4px, ${accent} 7px)`, opacity: 0.65 }} />
        {/* rivets along the outer frame */}
        {[12, 100].map(y => (
          <div key={y}>
            <div style={{ position: "absolute", left: 6, top: y, width: 4, height: 4, background: `${W}0.4)` }} />
            <div style={{ position: "absolute", right: 6, top: y, width: 4, height: 4, background: `${W}0.4)` }} />
          </div>
        ))}
        {/* (bottom weight now lives on the hull frame) */}
        {/* left leaf: giant greek watermark */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: fonts.silkscreen, fontSize: 56, color: `${W}0.14)`, lineHeight: 1 }}>{greek}</span>
        </div>
        {/* right leaf: identity */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "50%", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 34, paddingRight: 10, boxSizing: "border-box" }}>
          <span style={{ fontFamily: fonts.silkscreen, fontSize: 11, color: accent, letterSpacing: 1.5, marginBottom: 5 }}>{name}</span>
          <span style={{ fontFamily: fonts.pixel, fontSize: 10, color: `${W}0.7)`, marginBottom: 6 }}>{desc}</span>
          <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: `${W}0.5)`, letterSpacing: 1 }}>{stat}</span>
        </div>
        {/* porthole lock over the seam */}
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 44, height: 44, background: "#000", border: `1.2px solid ${accent}`, borderRadius: lockShape === "ring" ? 22 : 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 30, height: 30, border: `1px dashed ${W}0.4)`, borderRadius: lockShape === "ring" ? 15 : 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: fonts.silkscreen, fontSize: 15, color: accent }}>{greek}</span>
          </div>
        </div>
      </div>
      {/* access rail */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", borderTop: `1px dashed ${W}0.18)` }}>
        <span style={{ fontFamily: fonts.silkscreen, fontSize: 7, color: `${W}0.4)`, letterSpacing: 1.5 }}>ARCHIVE BAY</span>
        <span style={{ fontFamily: fonts.silkscreen, fontSize: 8, color: accent, letterSpacing: 1.5 }}>▸ OPEN VAULT</span>
      </div>
    </div>
  );
}

const crewCard: any = {
  flexDirection: "row",
  alignItems: "center",
  padding: 16,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: "rgba(218,186,102,0.15)",
  backgroundColor: "rgba(8,12,24,0.8)",
  position: "relative",
};
const crewCorner = (pos: "topLeft" | "topRight" | "bottomLeft" | "bottomRight", silver = false): any => {
  const c = silver ? "rgba(160,180,220,0.4)" : "rgba(218,186,102,0.5)";
  const base: any = { position: "absolute", width: 8, height: 8 };
  if (pos === "topLeft") return { ...base, top: -1, left: -1, borderTopWidth: 1, borderLeftWidth: 1, borderColor: c };
  if (pos === "topRight") return { ...base, top: -1, right: -1, borderTopWidth: 1, borderRightWidth: 1, borderColor: c };
  if (pos === "bottomLeft") return { ...base, bottom: -1, left: -1, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: c };
  return { ...base, bottom: -1, right: -1, borderBottomWidth: 1, borderRightWidth: 1, borderColor: c };
};
const crewStar: any = { fontFamily: fonts.silkscreen, fontSize: 28, color: "rgba(218,186,102,0.5)", marginRight: 14 };
const crewName: any = { fontFamily: fonts.silkscreen, fontSize: 11, color: "rgba(218,186,102,0.65)", letterSpacing: 1.5 };
const crewDesc: any = { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(200,216,240,0.3)", marginTop: 3 };
const crewStat: any = { fontFamily: fonts.pixel, fontSize: 9, color: "rgba(200,216,240,0.2)", marginTop: 4 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050c1f" },
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 24, paddingBottom: 92 },
  hint: { fontFamily: fonts.pixel, fontSize: 14, color: "#645c8e", textAlign: "center", marginTop: 100 },

  vignetteOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 49,
    ...(Platform.OS === "web" ? {
      background: "radial-gradient(ellipse 80% 75% at 50% 45%, transparent 55%, rgba(0,0,0,0.40) 100%)",
      pointerEvents: "none",
    } as any : {}),
  },

  // sub-page header
  subHeader: {
    backgroundColor: "rgba(5,12,31,0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(238,195,116,0.16)",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  subH1: { fontFamily: fonts.silkscreen, fontSize: 12, color: "#ffdf92", letterSpacing: 4, textAlign: "center", marginBottom: 2 },
  subLabel: { fontFamily: fonts.pixel, fontSize: 9, color: "#645c8e", letterSpacing: 4, textAlign: "center" },
  breadcrumbText: { fontFamily: fonts.pixel, fontSize: 12, color: "#ffdf92", marginBottom: 6 },

  // header
  header: {
    alignItems: "center", marginBottom: 24, paddingBottom: 24,
    borderBottomWidth: 1, borderBottomColor: "rgba(238,195,116,0.16)",
  },
  shipStatus: {
    fontFamily: fonts.silkscreen, fontSize: 8, color: "rgba(238,195,116,0.44)",
    letterSpacing: 3, marginBottom: 10,
  },
  h1: { fontFamily: fonts.silkscreen, fontSize: 22, color: "#ffdf92", letterSpacing: 3 },
  subtitle: { fontFamily: fonts.pixel, fontSize: 13, color: "#645c8e", letterSpacing: 4, marginTop: 6 },
  statsBar: { flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 14, flexWrap: "wrap" },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, backgroundColor: "#2f2f4e" },
  dotActive: { backgroundColor: "rgba(238,195,116,0.55)" },
  statText: { fontFamily: fonts.pixel, fontSize: 11, color: "#645c8e", letterSpacing: 1 },
  statTextActive: { color: "#9792a9" },

  // elopement counter — flight computer panel
  elope: {
    backgroundColor: "#0c0d22", marginBottom: 28, overflow: "hidden" as const,
    borderWidth: 2, borderColor: "rgba(238,195,116,0.3)",
    ...(Platform.OS === "web" ? {
      background: "linear-gradient(180deg, rgba(238,195,116,0.1) 0%, rgba(238,195,116,0.03) 40%, transparent 100%)",
      borderColor: "transparent",
      borderImage: "conic-gradient(from 45deg, rgba(255,223,146,0.7) 0%, rgba(200,216,240,0.35) 12.5%, rgba(255,223,146,0.7) 25%, rgba(200,216,240,0.35) 37.5%, rgba(255,223,146,0.7) 50%, rgba(200,216,240,0.35) 62.5%, rgba(255,223,146,0.7) 75%, rgba(200,216,240,0.35) 87.5%, rgba(255,223,146,0.7) 100%) 1",
    } as any : {}),
  },
  elopePanelShadow: Platform.OS === "web" ? {
    boxShadow: "0 0 32px rgba(255,223,146,0.18), 0 0 12px rgba(255,210,128,0.12), inset 0 0 16px rgba(255,223,146,0.05), 3px 3px 0 #000",
  } as any : {},
  elopeTitleBar: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 6, paddingTop: 18, paddingBottom: 8,
  },
  elopeTitleDeco: { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(255,223,146,0.6)" },
  elopeLabel: {
    fontFamily: fonts.silkscreen, fontSize: 8, color: "rgba(200,216,240,0.44)", letterSpacing: 4,
  },
  elopeReadout: {
    alignItems: "center" as const, justifyContent: "center" as const,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10,
  },
  elopePrefix: { fontFamily: fonts.pixel, fontSize: 16, color: "#e8c9a0", letterSpacing: 6, marginBottom: 6 },
  elopeDaysRow: { flexDirection: "row" as const, alignItems: "baseline" as const, gap: 6 },
  elopeDays: {
    fontFamily: fonts.silkscreen, fontSize: 64, color: "#ffdf92", lineHeight: 68,
    ...(Platform.OS === "web" ? { textShadow: "0 0 40px rgba(212,165,116,0.25)" } as any : {}),
  },
  elopeSuffix: { fontFamily: fonts.pixel, fontSize: 18, color: "#e8c9a0", letterSpacing: 3 },
  elopeTime: { flexDirection: "row" as const, gap: 6, justifyContent: "center" as const, alignItems: "baseline" as const, marginTop: 14 },
  tn: { fontFamily: fonts.pixel, fontSize: 22, color: "#c8d8f0", minWidth: 28, textAlign: "center" as const },
  tsep: { fontFamily: fonts.pixel, fontSize: 22, color: "rgba(212,165,116,0.4)" },
  tl: { fontFamily: fonts.pixel, fontSize: 11, color: "rgba(200,216,240,0.35)", letterSpacing: 3, marginLeft: 2 },
  elopeQuoteText: {
    fontFamily: fonts.pixel, fontSize: 12, color: "rgba(200,216,240,0.35)",
    textAlign: "center" as const, letterSpacing: 2, paddingBottom: 2,
    fontStyle: "italic" as const,
  },
  elopeHl: { fontFamily: fonts.pixel, fontSize: 13, color: "#ffdf92", opacity: 0.75, textAlign: "center" as const, paddingBottom: 2 },
  elopeBottomDeco: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 6, paddingTop: 8, paddingBottom: 18,
  },

  // instrument panel
  infoBar: { gap: 8, marginBottom: 24 },
  instrBar: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
    paddingHorizontal: 10, paddingVertical: 3,
    borderBottomWidth: 1, borderBottomColor: "rgba(200,216,240,0.08)",
  },
  instrBay: { fontFamily: fonts.silkscreen, fontSize: 6, color: "rgba(200,216,240,0.35)", letterSpacing: 2 },
  instrStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  instrDotGreen: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: "#75d879",
    ...(Platform.OS === "web" ? { boxShadow: "0 0 3px #75d879" } as any : {}),
  },
  instrDotAmber: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: "#ffdf92",
    ...(Platform.OS === "web" ? { boxShadow: "0 0 3px rgba(255,223,146,0.5)" } as any : {}),
  },
  instrStatusText: { fontFamily: fonts.silkscreen, fontSize: 5, color: "rgba(117,216,121,0.5)", letterSpacing: 1 },
  weatherBlock: {
    backgroundColor: "#0c0d22", borderWidth: 1.5, borderColor: "rgba(60,90,140,0.5)",
    overflow: "hidden" as const,
  },
  weatherBlockShadow: Platform.OS === "web" ? {
    boxShadow: "0 0 10px rgba(80,120,180,0.08), 3px 3px 0 #000",
  } as any : {},
  weatherInner: { paddingVertical: 10, paddingHorizontal: 14, alignItems: "center" as const },
  weatherTitle: {
    fontFamily: fonts.pixel, fontSize: 10, color: "rgba(255,223,146,0.85)", letterSpacing: 2, marginBottom: 6,
  },
  weatherVal: { fontFamily: fonts.pixel, fontSize: 13, color: "#9792a9", textAlign: "center" as const },
  cdRow: { flexDirection: "row" as const, gap: 8 },
  cdItem: {
    flex: 1, backgroundColor: "#0c0d22", borderWidth: 1.5, borderColor: "rgba(60,90,140,0.5)",
    overflow: "hidden" as const,
  },
  cdItemShadow: Platform.OS === "web" ? {
    boxShadow: "0 0 10px rgba(80,120,180,0.08), 3px 3px 0 #000",
  } as any : {},
  cdInner: { paddingVertical: 10, paddingHorizontal: 14, alignItems: "center" as const },
  cdLabel: { fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(200,216,240,0.35)", letterSpacing: 2, marginBottom: 1 },
  cdLabelCn: { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(255,223,146,0.5)", letterSpacing: 1, marginBottom: 4 },
  cdText: { fontFamily: fonts.pixel, fontSize: 12, color: "#9792a9", textAlign: "center" as const },
  cdDays: { color: "#ffdf92", fontFamily: fonts.silkscreen, fontSize: 16 },

  // section title
  sectionTitle: {
    fontFamily: fonts.silkscreen, fontSize: 13, color: "#ffdf92", marginBottom: 14, letterSpacing: 3, paddingLeft: 4,
    ...(Platform.OS === "web" ? { textShadow: "0 0 12px rgba(255,223,146,0.3)" } as any : {}),
  },

  // daily word / summary card
  dailyWordCard: {
    backgroundColor: "#0c0d22", borderWidth: 1, borderColor: "rgba(255,223,146,0.55)",
    marginBottom: 12, overflow: "hidden" as const,
  },
  dailyWordCardShadow: Platform.OS === "web" ? {
    boxShadow: "0 0 16px rgba(255,223,146,0.10), 3px 3px 0 #000",
  } as any : {},
  dwStationBar: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
    paddingHorizontal: 12, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: "rgba(200,216,240,0.08)",
  },
  dwBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(200,216,240,0.35)", letterSpacing: 2 },
  dwStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  dwStatusDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: "#75d879",
    ...(Platform.OS === "web" ? { boxShadow: "0 0 3px #75d879" } as any : {}),
  },
  dwStatusText: { fontFamily: fonts.silkscreen, fontSize: 5, color: "rgba(117,216,121,0.5)", letterSpacing: 1 },
  dwBody: { padding: 16 },
  dailyWordLabel: { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(200,216,240,0.4)", letterSpacing: 1, marginBottom: 8 },
  dailyWordText: { fontFamily: fonts.pixel, fontSize: 14, color: "#efede6", lineHeight: 26 },

  // float grid
  floatGrid: {
    flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 10, marginBottom: 24,
    ...(Platform.OS === "web" ? { display: "grid" as any, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" } as any : {}),
  },
  floatCard: {
    backgroundColor: "#0c0d22", borderWidth: 1, borderColor: "rgba(60,90,140,0.4)",
    padding: 12,
  },
  floatCardShadow: Platform.OS === "web" ? {
    boxShadow: "0 0 8px rgba(80,120,180,0.06), 3px 3px 0 #000",
  } as any : {},
  floatCardTitleRow: { flexDirection: "row" as const, alignItems: "center" as const, marginBottom: 6 },
  floatCardTitle: {
    fontFamily: fonts.pixel, fontSize: 13, color: "#ffdf92", flex: 1,
  },
  floatCardBody: { fontFamily: fonts.pixel, fontSize: 12, color: "#9792a9", lineHeight: 20 },

  // dream card
  dreamCard: {
    backgroundColor: "#0c0d22",
    borderWidth: 1.5,
    borderColor: "rgba(120,100,180,0.4)",
    marginTop: 20,
    marginBottom: 4,
    overflow: "hidden" as const,
  },
  dreamCardShadow: Platform.OS === "web" ? {
    boxShadow: "0 0 14px rgba(120,100,180,0.10), 3px 3px 0 #000",
  } as any : {},
  dreamStationBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,128,202,0.12)",
  },
  dreamBay: { fontFamily: fonts.silkscreen, fontSize: 7, color: "rgba(148,128,202,0.5)", letterSpacing: 2 },
  dreamStatusGroup: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  dreamDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#9090ff",
    ...(Platform.OS === "web" ? { boxShadow: "0 0 4px #9090ff" } as any : {}),
  },
  dreamStatusText: { fontFamily: fonts.silkscreen, fontSize: 5, color: "rgba(148,128,202,0.5)", letterSpacing: 1 },
  dreamBody: { padding: 14 },
  dreamCardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 8,
  },
  dreamCardLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: "#b0a8d0",
    letterSpacing: 2,
    ...(Platform.OS === "web" ? { textShadow: "0 0 8px rgba(148,128,202,0.25)" } as any : {}),
  },
  dreamCardDate: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: "#726295",
    letterSpacing: 1,
    marginLeft: "auto" as any,
  },
  dreamCardText: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: "#cbc2de",
    lineHeight: 24,
  },
  dreamCardHint: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "#726295",
    marginTop: 8,
    letterSpacing: 1,
  },

  // nav entries — ship bay doors
  navEntries: { gap: 10, marginTop: 20, marginBottom: 24 },
  navEntry: {
    backgroundColor: "#0c0d22",
    borderWidth: 1.5,
    borderColor: "rgba(60,90,140,0.7)",
    position: "relative" as const,
  },
  navEntryShadow: Platform.OS === "web" ? {
    boxShadow: "0 0 18px rgba(80,120,180,0.12), 0 0 6px rgba(80,120,180,0.06), 3px 3px 0 #000",
  } as any : {},
  neCorner: {
    position: "absolute" as const, width: 10, height: 10,
    borderColor: "rgba(255,223,146,0.55)", zIndex: 2,
  },
  neCornerTL: { top: -2, left: -2, borderTopWidth: 1, borderLeftWidth: 1 },
  neCornerTR: { top: -2, right: -2, borderTopWidth: 1, borderRightWidth: 1 },
  neCornerBL: { bottom: -2, left: -2, borderBottomWidth: 1, borderLeftWidth: 1 },
  neCornerBR: { bottom: -2, right: -2, borderBottomWidth: 1, borderRightWidth: 1 },
  neBayL: {
    position: "absolute" as const, top: 4, left: 14, zIndex: 2,
    fontFamily: fonts.silkscreen, fontSize: 6, color: "rgba(200,216,240,0.35)", letterSpacing: 2,
  },
  neEdge: {
    position: "absolute" as const, top: 0, left: 0, right: 0, height: 1, zIndex: 2,
    ...(Platform.OS === "web" ? {
      backgroundImage: "linear-gradient(90deg, rgba(255,223,146,0.7), rgba(200,216,240,0.25), transparent 80%)",
    } as any : { backgroundColor: "rgba(255,223,146,0.3)" }),
  },
  neBayR: {
    position: "absolute" as const, top: 4, right: 14, zIndex: 2,
    flexDirection: "row" as const, alignItems: "center" as const, gap: 4,
  },
  neStatusDot: {
    width: 4, height: 4, backgroundColor: "rgba(117,216,121,0.6)",
  },
  neStatusText: {
    fontFamily: fonts.silkscreen, fontSize: 6, color: "rgba(117,216,121,0.45)", letterSpacing: 1,
  },
  navEntryInner: {
    alignItems: "center" as const,
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  navTitleRow: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 10, marginBottom: 6,
  },
  navBracket: {
    fontFamily: fonts.pixel, fontSize: 8, color: "rgba(255,223,146,0.45)",
  },
  navEntryTitle: {
    fontFamily: fonts.silkscreen, fontSize: 12, color: "#ffdf92", letterSpacing: 3,
    ...(Platform.OS === "web" ? { textShadow: "0 0 12px rgba(255,223,146,0.25)" } as any : {}),
  },
  navEntryDesc: { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(200,216,240,0.4)", letterSpacing: 1 },

  // feels view
  feelsScroll: { flex: 1, zIndex: 1 },
  feelsContent: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 92 },
  feelsIntro: { fontFamily: fonts.pixel, fontSize: 11, color: "#645c8e", marginBottom: 16, lineHeight: 20 },
  feelsEmpty: { fontFamily: fonts.pixel, fontSize: 12, color: "#645c8e", padding: 14 },
  feelsCard: {
    backgroundColor: "#0c0d22", borderWidth: 1, borderColor: "rgba(200,216,240,0.18)",
    borderLeftWidth: 3, borderLeftColor: "rgba(255,223,146,0.4)",
    padding: 12, marginBottom: 6,
  },
  feelsCardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  feelsDate: { fontFamily: fonts.silkscreen, fontSize: 10, color: "#645c8e", letterSpacing: 1 },
  feelsTitle: { fontFamily: fonts.pixel, fontSize: 13, color: "#ffdf92", flex: 1 },
  feelsMood: { fontFamily: fonts.pixel, fontSize: 10, color: "#dcc77a", marginTop: 3, letterSpacing: 1 },
  feelsToggle: { fontFamily: fonts.silkscreen, fontSize: 14, color: "#ebc82a", marginLeft: 4 },
  feelsBody: { fontFamily: fonts.pixel, fontSize: 13, color: "#9792a9", lineHeight: 23, marginTop: 10 },
});
