// Shared Event-Horizon panel hardware: bevelled-corner patches (and room for
// more parts as the fleet grows). Web-only decorations — gate with isEH.

import { useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";

export const EHW = "rgba(255,255,255,";

/* ═══ GHOST 像素星空（chat 页 Starfield 血统，静态确定性）═══
   四尖星 astroid dither + 对角尘带 + 散尘 + 十字闪光。
   rich=true 华丽版（星庭）：多星、双尘带、更密的闪光。 */

function buildEhPixelSky(w: number, h: number, rich = false): string {
  const R = (s: number) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const l: string[] = [];

  const star = (sx: number, sy: number, Rr: number, seed: number) => {
    const Lv = Rr * 2.1, Lh = Rr * 1.35, Ld = Rr * 1.25, p = 0.42;
    for (let gy = -Lv; gy <= Lv; gy += 2) {
      for (let gx = -Lv; gx <= Lv; gx += 2) {
        const f1 = Math.pow(Math.abs(gx / Lh), p) + Math.pow(Math.abs(gy / Lv), p);
        const u = (gx + gy) * 0.7071, v = (gx - gy) * 0.7071;
        const f2 = Math.pow(Math.abs(u / Ld), p) + Math.pow(Math.abs(v / (Ld * 0.9)), p);
        const I = Math.max(1 - f1, (1 - f2) * 0.92);
        if (I <= 0) continue;
        const density = Math.min(1, 0.06 + I * 2.1);
        if (R(seed + gx * 13.7 + gy * 7.3) >= density) continue;
        const bright = 0.5 + Math.min(1, I * 1.7) * 0.5;
        const px = I > 0.55 && R(seed + gx + gy * 3.1) > 0.5 ? 2 : 1;
        l.push(`<rect x="${(sx + gx).toFixed(0)}" y="${(sy + gy).toFixed(0)}" width="${px}" height="${px}" fill="rgba(235,243,255,${bright.toFixed(2)})"/>`);
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = R(seed + i * 3.3) * Math.PI * 2, rr = Lv * (0.7 + R(seed + i * 7.7) * 0.55);
      l.push(`<rect x="${(sx + Math.cos(a) * rr * 0.65).toFixed(0)}" y="${(sy + Math.sin(a) * rr).toFixed(0)}" width="1" height="1" fill="rgba(235,243,255,0.55)"/>`);
    }
  };

  const stream = (x0: number, y0: number, x1: number, y1: number, n: number, spread: number, seed: number, opBase = 0.14) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i < n; i++) {
      const t = R(i * 1.7 + seed);
      const g = (R(i * 2.3 + seed * 2) + R(i * 3.1 + seed * 3) + R(i * 4.7 + seed * 5) - 1.5) / 1.5;
      const px = x0 + dx * t + nx * spread * g, py = y0 + dy * t + ny * spread * g;
      if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;
      const op = opBase + R(i * 5.3 + seed * 7) * 0.4;
      l.push(`<rect x="${px.toFixed(0)}" y="${py.toFixed(0)}" width="1" height="1" fill="rgba(235,243,255,${op.toFixed(2)})"/>`);
    }
  };

  const cross = (cx: number, cy: number, r: number, op: number) => {
    l.push(`<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="rgba(235,243,255,${op})" stroke-width="1"/>`);
    l.push(`<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="rgba(235,243,255,${op})" stroke-width="1"/>`);
  };

  if (rich) {
    star(w * 0.82, h * 0.12, 28, 11);
    star(w * 0.12, h * 0.34, 18, 47);
    star(w * 0.88, h * 0.58, 14, 83);
    star(w * 0.3, h * 0.8, 11, 29);
    star(w * 0.55, h * 0.05, 8, 61);
    stream(-w * 0.05, h * 0.7, w * 1.05, h * 0.15, 260, 36, 5);
    stream(-w * 0.05, h * 0.25, w * 1.05, h * 0.85, 150, 24, 19, 0.1);
    for (let i = 0; i < 56; i++) {
      const px = R(i * 12.9 + 3) * w, py = R(i * 8.1 + 41) * h;
      const big = R(i * 6.7 + 13) > 0.82;
      l.push(`<rect x="${px.toFixed(0)}" y="${py.toFixed(0)}" width="${big ? 2 : 1}" height="${big ? 2 : 1}" fill="rgba(235,243,255,${(0.2 + R(i * 4.3 + 7) * 0.45).toFixed(2)})"/>`);
    }
    cross(w * 0.45, h * 0.2, 4, 0.6); cross(w * 0.92, h * 0.36, 3, 0.5);
    cross(w * 0.08, h * 0.62, 3, 0.5); cross(w * 0.68, h * 0.72, 4, 0.55);
    cross(w * 0.22, h * 0.08, 3, 0.45);
  } else {
    star(w * 0.8, h * 0.16, 26, 11);
    star(w * 0.13, h * 0.6, 15, 47);
    star(w * 0.32, h * 0.87, 9, 83);
    stream(-w * 0.05, h * 0.78, w * 1.05, h * 0.2, 210, 34, 5);
    for (let i = 0; i < 36; i++) {
      const px = R(i * 12.9 + 3) * w, py = R(i * 8.1 + 41) * h;
      const big = R(i * 6.7 + 13) > 0.85;
      l.push(`<rect x="${px.toFixed(0)}" y="${py.toFixed(0)}" width="${big ? 2 : 1}" height="${big ? 2 : 1}" fill="rgba(235,243,255,${(0.2 + R(i * 4.3 + 7) * 0.45).toFixed(2)})"/>`);
    }
    cross(w * 0.55, h * 0.08, 4, 0.6);
    cross(w * 0.9, h * 0.52, 3, 0.5);
    cross(w * 0.06, h * 0.3, 3, 0.45);
  }

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block">${l.join("")}</svg>`;
}

/** Full-viewport pixel starfield layer (EH only). Mount inside a flex:1 container, before the ScrollView. */
export function EhPixelSky({ rich }: { rich?: boolean }) {
  const { width, height } = useWindowDimensions();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.innerHTML = buildEhPixelSky(width, height, rich);
  }, [width, height, rich]);
  return (
    <div
      ref={ref}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

/** Self-measuring SVG frame layer. Mount inside a position:relative card (EH web only);
 *  draw() receives the card's live size and returns the panel hardware. */
export function EhFrame({ draw }: { draw: (w: number, h: number) => JSX.Element }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sz, setSz] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      setSz((p) => (Math.abs(p.w - r.width) > 1 || Math.abs(p.h - r.height) > 1 ? { w: r.width, h: r.height } : p));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
      {sz.w > 0 && (
        <svg width={sz.w} height={sz.h} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
          {draw(sz.w, sz.h)}
        </svg>
      )}
    </div>
  );
}

export interface EhCuts { tl?: number; tr?: number; br?: number; bl?: number }
export interface EhTopFeature { type: "notch" | "bump"; x0: number; x1: number; d: number }

/** One-stroke panel outline: staggered corner cuts + optional top-edge notch/bump.
 *  Sharp joins are the caller's job (strokeLinejoin="miter"). */
export function ehOutline(w: number, h: number, c: EhCuts, top?: EhTopFeature): string {
  const tl = c.tl || 0, tr = c.tr || 0, br = c.br || 0, bl = c.bl || 0;
  let d = `M${tl || 0.5} 0.5 `;
  if (top) {
    const slope = top.type === "notch" ? 6 : 5;
    const dy = top.type === "notch" ? top.d + 0.5 : 0.5 - top.d;
    d += `L${top.x0} 0.5 L${top.x0 + slope} ${dy} L${top.x1 - slope} ${dy} L${top.x1} 0.5 `;
  }
  d += `L${w - (tr || 0.5)} 0.5 `;
  if (tr) d += `L${w - 0.5} ${tr} `;
  d += `L${w - 0.5} ${h - (br || 0.5)} `;
  if (br) d += `L${w - br} ${h - 0.5} `;
  d += `L${bl || 0.5} ${h - 0.5} `;
  if (bl) d += `L0.5 ${h - bl} `;
  d += `L0.5 ${tl || 0.5} Z`;
  return d;
}

/** Slash group (////) — bridge-card corner hatching. dir=1 rises right, -1 falls right. */
export function ehSlashes(x: number, y: number, n = 4, len = 8, gap = 5, tint = "rgba(255,255,255,0.55)", dir: 1 | -1 = 1): JSX.Element[] {
  const out: JSX.Element[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = x + i * gap;
    out.push(dir === 1
      ? <line key={`sl${i}`} x1={x0} y1={y + len} x2={x0 + len} y2={y} stroke={tint} strokeWidth="1.4" />
      : <line key={`sl${i}`} x1={x0} y1={y} x2={x0 + len} y2={y + len} stroke={tint} strokeWidth="1.4" />);
  }
  return out;
}

/** Barcode rects to inset along an edge (deterministic). */
export function ehBars(x0: number, x1: number, y: number, hh: number, seed = 3, tint = "rgba(255,255,255,0.4)"): JSX.Element[] {
  const out: JSX.Element[] = [];
  let x = x0, k = 0;
  while (x < x1) {
    const v = Math.abs(Math.sin((k + seed) * 12.9898) * 43758.5453) % 1;
    const bw = v > 0.66 ? 3 : v > 0.33 ? 2 : 1;
    if (v > 0.25) out.push(<rect key={`b${seed}_${k}`} x={x} y={y} width={bw} height={hh} fill={tint} />);
    x += bw + 1.5; k += 1;
  }
  return out;
}

/** Bevelled-corner patch for bordered cards: mask the square corner, draw the cut. */
export function EhCut({ corner = "tr", n = 12 }: { corner?: "tr" | "tl" | "br" | "bl"; n?: number }) {
  const pos: any = {
    tr: { top: -1, right: -1 }, tl: { top: -1, left: -1 },
    br: { bottom: -1, right: -1 }, bl: { bottom: -1, left: -1 },
  }[corner];
  // exact geometry: the mask hides 12px of border on both edges, so the cut
  // line must run break-point to break-point — border centerline sits 1.5px
  // inside the mask (mask offset -1 + 1px border ÷ 2)
  const line = {
    tr: [0, 1.5, n - 1.5, n], tl: [n, 1.5, 1.5, n],
    br: [0, n - 1.5, n - 1.5, 0], bl: [n, n - 1.5, 1.5, 0],
  }[corner];
  return (
    <>
      <div style={{ position: "absolute", ...pos, width: n, height: n, background: "#000", zIndex: 2 }} />
      <svg style={{ position: "absolute", ...pos, pointerEvents: "none", zIndex: 2 }} width={n} height={n}>
        <line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke={`${EHW}0.7)`} strokeWidth="1.4" strokeLinecap="square" />
      </svg>
    </>
  );
}

/** deep-space → event-horizon literal gate. Pass-through when not EH. */
export function dsColor(v: string, isEH: boolean): string {
  if (!isEH) return v;
  const m = v.match(/^rgba\((\d+),\s?(\d+),\s?(\d+),\s?([0-9.]+)\)$/);
  if (m) {
    const r = Number(m[1]), g = Number(m[2]), a = Number(m[4]);
    if ((r === 200 && g === 216) || (r === 238 && g === 195) || (r === 255 && g === 223) || (r === 255 && g === 239)) {
      return `rgba(255,255,255,${a})`;
    }
    if ((r === 60 && g === 90) || (r === 80 && g === 120)) {
      return `rgba(255,255,255,${Math.min(0.45, a * 0.6).toFixed(2)})`;
    }
    if (r === 35 && g === 65) return `rgba(255,255,255,${Math.min(0.12, a * 0.4).toFixed(2)})`;
    if ((r === 3 && g === 6) || (r === 3 && g === 12)) return `rgba(0,0,0,${a})`;
    return v;
  }
  if (v === "#08091a" || v === "#0c0d22" || v === "#0a0e1a") return "#000000";
  if (v === "#ffdf92" || v === "#efede6") return "#ffffff";
  if (v === "#6aafdf") return "rgba(96,168,255,0.95)";
  return v;
}

/** Static waveform column — elementhud-style dressing for station bars. */
export function EhWave({ bars = 14, height = 12, tint = "rgba(255,255,255,0.4)" }: { bars?: number; height?: number; tint?: string }) {
  const hs = Array.from({ length: bars }, (_, i) => 0.25 + Math.abs(Math.sin(i * 2.7 + 1.3)) * 0.75);
  return (
    <svg width={bars * 3} height={height} style={{ display: "block" }}>
      {hs.map((h, i) => (
        <rect key={i} x={i * 3} y={height * (1 - h)} width="2" height={height * h} fill={tint} />
      ))}
    </svg>
  );
}

/** Pixel barcode strip — deterministic, decorative. */
export function EhBarcode({ width = 72, height = 10, seed = 7, tint = "rgba(255,255,255,0.45)" }: { width?: number; height?: number; seed?: number; tint?: string }) {
  const bars: JSX.Element[] = [];
  let x = 0, k = 0;
  while (x < width) {
    const v = Math.abs(Math.sin((k + seed) * 12.9898) * 43758.5453) % 1;
    const w = v > 0.66 ? 3 : v > 0.33 ? 2 : 1;
    if (v > 0.28) bars.push(<rect key={k} x={x} y="0" width={w} height={height} fill={tint} />);
    x += w + 1; k += 1;
  }
  return <svg width={width} height={height} style={{ display: "block" }}>{bars}</svg>;
}

/** Tiny data readout row: label + value pairs in pixel type. */
export function EhDataRow({ items }: { items: Array<[string, string]> }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      {items.map(([k, v], i) => (
        <span key={i} style={{ fontFamily: "Zpix, Silkscreen, monospace", fontSize: 7, letterSpacing: 1, color: "rgba(255,255,255,0.4)" }}>
          {k} <span style={{ color: "rgba(255,255,255,0.75)" }}>{v}</span>
        </span>
      ))}
    </div>
  );
}

/** Concentric radiation arcs — stellar/radiation motif for MOOD card. */
export function EhRadiation({ size = 44, tint = "rgba(255,255,255,0.25)" }: { size?: number; tint?: string }) {
  const arcs: JSX.Element[] = [];
  for (let i = 1; i <= 4; i++) {
    const r = 6 + i * 8;
    arcs.push(
      <path key={`a${i}`} d={`M${size - r} ${size} A${r} ${r} 0 0 1 ${size} ${size - r}`}
        fill="none" stroke={tint} strokeWidth={i === 2 ? "1" : "0.6"}
        strokeDasharray={i % 2 === 0 ? "none" : "3 2"} />
    );
  }
  arcs.push(<line key="r1" x1={size} y1={size} x2={size - 4} y2={size - 4} stroke={tint} strokeWidth="0.5" />);
  arcs.push(<line key="r2" x1={size} y1={size} x2={size - 6} y2={size} stroke={tint} strokeWidth="0.5" />);
  arcs.push(<line key="r3" x1={size} y1={size} x2={size} y2={size - 6} stroke={tint} strokeWidth="0.5" />);
  arcs.push(<circle key="c" cx={size} cy={size} r="1.5" fill={tint} />);
  return <svg width={size} height={size} style={{ display: "block" }}>{arcs}</svg>;
}

/** Grid crosshair — tracker/trajectory motif. */
export function EhGridCross({ size = 36, tint = "rgba(255,255,255,0.2)" }: { size?: number; tint?: string }) {
  const mid = size / 2;
  const els: JSX.Element[] = [];
  for (let i = 0; i < 5; i++) {
    const y = 4 + i * (size - 8) / 4;
    els.push(<line key={`h${i}`} x1="2" y1={y} x2={size - 2} y2={y} stroke={tint} strokeWidth="0.4" strokeDasharray="2 3" />);
  }
  for (let i = 0; i < 5; i++) {
    const x = 4 + i * (size - 8) / 4;
    els.push(<line key={`v${i}`} x1={x} y1="2" x2={x} y2={size - 2} stroke={tint} strokeWidth="0.4" strokeDasharray="2 3" />);
  }
  els.push(<line key="cx" x1={mid - 5} y1={mid} x2={mid + 5} y2={mid} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />);
  els.push(<line key="cy" x1={mid} y1={mid - 5} x2={mid} y2={mid + 5} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />);
  els.push(<rect key="dot" x={mid - 1} y={mid - 1} width="2" height="2" fill="rgba(255,255,255,0.5)" />);
  return <svg width={size} height={size} style={{ display: "block" }}>{els}</svg>;
}

/** Wind arcs — weather/solar-wind motif. */
export function EhWindArcs({ width = 48, height = 28, tint = "rgba(255,255,255,0.22)" }: { width?: number; height?: number; tint?: string }) {
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={`M4 ${height - 2} Q${width * 0.4} ${height * 0.2} ${width - 4} ${height * 0.3}`} fill="none" stroke={tint} strokeWidth="0.7" />
      <path d={`M8 ${height - 1} Q${width * 0.5} ${height * 0.4} ${width - 2} ${height * 0.5}`} fill="none" stroke={tint} strokeWidth="0.5" strokeDasharray="3 2" />
      <path d={`M2 ${height - 4} Q${width * 0.3} ${height * 0.1} ${width * 0.7} ${height * 0.15}`} fill="none" stroke={tint} strokeWidth="0.5" />
      {[0, 1, 2, 3, 4].map(i => (
        <circle key={i} cx={8 + i * 9 + Math.sin(i * 2.3) * 3} cy={height * 0.6 + Math.cos(i * 1.7) * 5} r="0.8" fill={tint} />
      ))}
    </svg>
  );
}

/** Compass reticle — navigation motif for voyage/log cards. */
export function EhCompass({ size = 34, tint = "rgba(255,255,255,0.3)" }: { size?: number; tint?: string }) {
  const mid = size / 2;
  const r1 = size * 0.42, r2 = size * 0.28;
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={mid} cy={mid} r={r1} fill="none" stroke={tint} strokeWidth="0.5" strokeDasharray="4 3" />
      <circle cx={mid} cy={mid} r={r2} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" />
      <line x1={mid} y1={mid - r1 - 1} x2={mid} y2={mid - r2 + 1} stroke={tint} strokeWidth="0.7" />
      <line x1={mid} y1={mid + r2 - 1} x2={mid} y2={mid + r1 + 1} stroke={tint} strokeWidth="0.7" />
      <line x1={mid - r1 - 1} y1={mid} x2={mid - r2 + 1} y2={mid} stroke={tint} strokeWidth="0.7" />
      <line x1={mid + r2 - 1} y1={mid} x2={mid + r1 + 1} y2={mid} stroke={tint} strokeWidth="0.7" />
      <rect x={mid - 1} y={mid - 1} width="2" height="2" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

/** Waveform — whisper/audio motif for murmur cards. Vertical stack by default; horizontal reads like a voice memo. */
export function EhVoiceWave({ height = 60, width = 10, tint = "rgba(255,255,255,0.25)", horizontal = false }: { height?: number; width?: number; tint?: string; horizontal?: boolean }) {
  const bars: JSX.Element[] = [];
  if (horizontal) {
    const n = Math.floor(width / 4);
    for (let i = 0; i < n; i++) {
      const v = Math.abs(Math.sin(i * 1.8 + 0.7));
      const h = 2 + v * (height - 3);
      bars.push(<rect key={i} x={i * 4} y={(height - h) / 2} width="2.5" height={h} rx="0.5" fill={tint} opacity={0.4 + v * 0.6} />);
    }
  } else {
    const n = Math.floor(height / 4);
    for (let i = 0; i < n; i++) {
      const v = Math.abs(Math.sin(i * 1.8 + 0.7));
      const w = 2 + v * (width - 3);
      bars.push(<rect key={i} x={(width - w) / 2} y={i * 4} width={w} height="2.5" rx="0.5" fill={tint} opacity={0.4 + v * 0.6} />);
    }
  }
  return <svg width={width} height={height} style={{ display: "block" }}>{bars}</svg>;
}

/** Heartbeat / ECG line — inner feelings motif. */
export function EhHeartline({ width = 80, height = 16, tint = "rgba(255,255,255,0.3)" }: { width?: number; height?: number; tint?: string }) {
  const mid = height / 2;
  const d = `M0 ${mid} L${width * 0.15} ${mid} L${width * 0.22} ${mid - 5} L${width * 0.28} ${mid + 3} L${width * 0.32} ${mid - 8} L${width * 0.38} ${mid + 2} L${width * 0.42} ${mid} L${width * 0.55} ${mid} L${width * 0.6} ${mid - 3} L${width * 0.65} ${mid + 1} L${width * 0.68} ${mid} L${width} ${mid}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={tint} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Full-bleed watermark behind voyage-log cards — same faint instrument-etching
 *  language as the home tab's EhBayBackdrop (ink 205,225,255 @ 0.16/0.10). */
export function EhVoyBackdrop({ type }: { type: string }) {
  const ink = "rgba(205,225,255,0.16)";
  const inkDim = "rgba(205,225,255,0.10)";
  let art: JSX.Element | null = null;
  if (type === "radiation") {
    // stellar activity — concentric flare arcs bursting from the top-right corner
    const arcs = [];
    for (let i = 0; i < 5; i++) {
      const r = 26 + i * 26;
      arcs.push(<circle key={i} cx="152" cy="8" r={r} stroke={i % 2 ? inkDim : ink} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeDasharray={i === 3 ? "4 4" : undefined} />);
    }
    const rays = [];
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i / 4) * Math.PI / 2;
      rays.push(<line key={`r${i}`} x1={152 + Math.cos(a + Math.PI) * 18} y1={8 - Math.sin(a + Math.PI) * 18} x2={152 + Math.cos(a + Math.PI) * 132} y2={8 - Math.sin(a + Math.PI) * 132} stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    }
    art = <g>{arcs}{rays}<rect x="149" y="5" width="5" height="5" fill={ink} /></g>;
  } else if (type === "gauge") {
    // stellar readings — big bottom-anchored dial with dense ticks and a needle
    const ticks = [];
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (i / 20) * Math.PI;
      const major = i % 5 === 0;
      const r1 = major ? 52 : 58, r2 = 66;
      ticks.push(<line key={i} x1={80 + Math.cos(a) * r1} y1={158 + Math.sin(a) * r1} x2={80 + Math.cos(a) * r2} y2={158 + Math.sin(a) * r2} stroke={major ? ink : inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    }
    const na = Math.PI + 0.72 * Math.PI;
    art = (
      <g>
        <path d="M14 158 A66 66 0 0 1 146 158" stroke={ink} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <path d="M36 158 A44 44 0 0 1 124 158" stroke={inkDim} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
        {ticks}
        <line x1="80" y1="158" x2={80 + Math.cos(na) * 48} y2={158 + Math.sin(na) * 48} stroke={ink} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <rect x="77" y="153" width="6" height="6" fill={ink} />
      </g>
    );
  } else if (type === "trace") {
    // trajectory — rising track points joined by segments, faint star spray
    const pts: Array<[number, number]> = [[10, 128], [38, 104], [64, 118], [92, 72], [120, 88], [150, 40]];
    const dots = pts.map(([x, y], i) => <rect key={`d${i}`} x={x - 2} y={y - 2} width="4" height="4" fill={i === 5 ? ink : inkDim} />);
    const segs = pts.slice(1).map(([x, y], i) => <line key={`s${i}`} x1={pts[i][0]} y1={pts[i][1]} x2={x} y2={y} stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    const spray = [];
    for (let i = 0; i < 12; i++) spray.push(<rect key={`p${i}`} x={(i * 43 + 19) % 160} y={(i * 61 + 13) % 160} width="1.5" height="1.5" fill={inkDim} />);
    art = <g><line x1="0" y1="140" x2="160" y2="140" stroke={inkDim} strokeWidth="0.8" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />{segs}{dots}{spray}</g>;
  } else if (type === "causal") {
    // causal overlay — node graph: diamond of squares wired together
    const nodes: Array<[number, number]> = [[80, 20], [26, 80], [80, 140], [134, 80]];
    const wires = [
      <line key="w0" x1="80" y1="20" x2="26" y2="80" stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />,
      <line key="w1" x1="26" y1="80" x2="80" y2="140" stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />,
      <line key="w2" x1="80" y1="140" x2="134" y2="80" stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />,
      <line key="w3" x1="134" y1="80" x2="80" y2="20" stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />,
      <line key="w4" x1="80" y1="20" x2="80" y2="140" stroke={inkDim} strokeWidth="0.8" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />,
    ];
    art = (
      <g>
        <circle cx="80" cy="80" r="62" stroke={inkDim} fill="none" strokeWidth="0.8" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        {wires}
        {nodes.map(([x, y], i) => <rect key={`n${i}`} x={x - 3} y={y - 3} width="6" height="6" fill={i === 0 ? ink : inkDim} stroke={i === 0 ? undefined : ink} strokeWidth={i === 0 ? undefined : 0.5} />)}
      </g>
    );
  } else if (type === "radar") {
    // drivesoid — radar chart skeleton: nested hexagons + spokes
    const hex = (r: number, key: string, stroke: string, dash?: string) => {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${(80 + Math.cos(a) * r).toFixed(1)},${(80 + Math.sin(a) * r).toFixed(1)}`);
      }
      return <polygon key={key} points={pts.join(" ")} stroke={stroke} fill="none" strokeWidth="0.8" strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
    };
    const spokes = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      spokes.push(<line key={`s${i}`} x1="80" y1="80" x2={80 + Math.cos(a) * 70} y2={80 + Math.sin(a) * 70} stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    }
    art = <g>{spokes}{hex(70, "h0", ink)}{hex(48, "h1", inkDim)}{hex(26, "h2", inkDim, "3 3")}<rect x="78" y="78" width="4" height="4" fill={ink} /></g>;
  } else if (type === "wind") {
    // weather — sweeping stream lines with particle spray
    const spray = [];
    for (let i = 0; i < 10; i++) spray.push(<rect key={`p${i}`} x={(i * 47 + 23) % 160} y={(i * 31 + 60) % 100 + 20} width="1.5" height="1.5" fill={inkDim} />);
    art = (
      <g>
        <path d="M-4 96 Q40 60 84 76 T164 58" stroke={ink} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <path d="M-4 116 Q48 84 96 96 T164 80" stroke={inkDim} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <path d="M-4 76 Q36 44 88 56 T164 36" stroke={inkDim} fill="none" strokeWidth="0.8" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        {spray}
      </g>
    );
  } else if (type === "compassNav") {
    // voyage — compass rose pushed to the right, dashed course line crossing it
    const ticks = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r1 = i % 6 === 0 ? 44 : 50, r2 = 56;
      ticks.push(<line key={i} x1={118 + Math.cos(a) * r1} y1={80 + Math.sin(a) * r1} x2={118 + Math.cos(a) * r2} y2={80 + Math.sin(a) * r2} stroke={i % 6 === 0 ? ink : inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />);
    }
    art = (
      <g>
        <circle cx="118" cy="80" r="56" stroke={ink} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <circle cx="118" cy="80" r="34" stroke={inkDim} fill="none" strokeWidth="0.8" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        {ticks}
        <line x1="-4" y1="128" x2="164" y2="30" stroke={inkDim} strokeWidth="0.8" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        <line x1="118" y1="34" x2="118" y2="52" stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <rect x="115" y="77" width="6" height="6" fill={ink} />
      </g>
    );
  } else if (type === "sonar") {
    // whisper cabin — sonar ripples opening from the left edge, tiny echo targets
    const arcs = [];
    for (let i = 0; i < 5; i++) {
      const r = 24 + i * 26;
      arcs.push(<circle key={i} cx="4" cy="80" r={r} stroke={i % 2 ? inkDim : ink} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeDasharray={i === 2 ? "4 4" : undefined} />);
    }
    art = (
      <g>
        {arcs}
        <rect x="1" y="77" width="6" height="6" fill={ink} />
        <rect x="96" y="46" width="4" height="4" fill={inkDim} stroke={ink} strokeWidth="0.5" />
        <rect x="128" y="108" width="4" height="4" fill={inkDim} />
      </g>
    );
  } else if (type === "pages") {
    // porthole library — open book: page lines + a folded corner + quote marks
    art = (
      <g>
        {[36, 52, 68, 84, 100].map((y, i) => (
          <line key={i} x1={22} y1={y} x2={i === 4 ? 96 : 138} y2={y} stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        ))}
        <path d="M138 20 L118 20 L138 40 Z" fill="none" stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <line x1={138} y1={20} x2={138} y2={110} stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <line x1={22} y1={20} x2={118} y2={20} stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <line x1={22} y1={20} x2={22} y2={110} stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <line x1={22} y1={110} x2={138} y2={110} stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <rect x={30} y={26} width={3} height={5} fill={ink} /><rect x={36} y={26} width={3} height={5} fill={ink} />
      </g>
    );
  } else if (type === "drift") {
    // drift pod — waves and a dashed drift trajectory with a tiny bottle
    art = (
      <g>
        <path d="M-4 96 Q30 86 60 96 T124 96 T188 96" fill="none" stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <path d="M-4 112 Q30 102 60 112 T124 112 T188 112" fill="none" stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <path d="M14 60 Q60 30 106 48 T160 34" fill="none" stroke={inkDim} strokeWidth="0.8" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <g transform="rotate(-14 118 78)">
          <rect x={110} y={72} width={16} height={10} fill="none" stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          <rect x={126} y={75} width={5} height={4} fill="none" stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        </g>
        <rect x={40} y={88} width={2} height={2} fill={ink} />
      </g>
    );
  } else if (type === "beacon") {
    // signal beacon — mast + expanding broadcast arcs
    art = (
      <g>
        <line x1={40} y1={116} x2={40} y2={46} stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <line x1={32} y1={116} x2={48} y2={116} stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <rect x={37} y={42} width={6} height={6} fill={ink} />
        {[18, 36, 54, 72].map((r, i) => (
          <path key={i} d={`M ${40 + r * 0.5} ${45 - r * 0.87} A ${r} ${r} 0 0 1 ${40 + r} 45`} fill="none" stroke={i % 2 ? inkDim : ink} strokeWidth="0.8" strokeDasharray={i === 2 ? "3 3" : undefined} vectorEffect="non-scaling-stroke" />
        ))}
        <rect x={118} y={30} width={2.5} height={2.5} fill={inkDim} />
        <rect x={132} y={52} width={2} height={2} fill={inkDim} />
      </g>
    );
  } else if (type === "shelf") {
    // study shelves — two rows of spines, staggered heights
    art = (
      <g>
        {[58, 108].map((base, row) => (
          <g key={row}>
            <line x1={16} y1={base} x2={144} y2={base} stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
            {[20, 32, 42, 56, 66, 80, 92, 104, 116, 128].map((x, i) => {
              const h = 18 + ((i * 7 + row * 5) % 14);
              return <rect key={i} x={x} y={base - h} width={8} height={h} fill="none" stroke={(i + row) % 3 ? inkDim : ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />;
            })}
          </g>
        ))}
      </g>
    );
  } else if (type === "bubbles") {
    // deep sea — jellyfish bell + trailing tendrils + rising bubbles
    art = (
      <g>
        <path d="M96 64 A26 26 0 0 1 148 64 L144 72 L138 66 L130 74 L122 66 L114 74 L106 66 L100 72 Z" fill="none" stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        {[104, 114, 124, 134].map((x, i) => (
          <path key={i} d={`M${x} 74 Q${x - 4} 92 ${x + 3} 108`} fill="none" stroke={inkDim} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        ))}
        {[[36, 96, 5], [26, 70, 3], [46, 48, 4], [30, 28, 2.5], [56, 20, 3]].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={i % 2 ? inkDim : ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    );
  } else if (type === "pulse") {
    // inner log — ECG line running across mid-card over a dashed baseline
    art = (
      <g>
        <line x1="0" y1="84" x2="160" y2="84" stroke={inkDim} strokeWidth="0.8" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
        <path d="M0 84 L36 84 L46 70 L54 92 L60 54 L68 96 L76 84 L104 84 L112 76 L120 88 L126 84 L160 84" stroke={ink} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <rect x="58" y="52" width="3" height="3" fill={ink} />
        {Array.from({ length: 8 }, (_, i) => <rect key={i} x={(i * 53 + 29) % 160} y={(i * 37 + 17) % 60 + (i % 2 ? 8 : 108)} width="1.5" height="1.5" fill={inkDim} />)}
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

/** Ruler ticks — measurement motif for readings panels. */
export function EhRuler({ width = 70, height = 10, tint = "rgba(255,255,255,0.4)" }: { width?: number; height?: number; tint?: string }) {
  const ticks: JSX.Element[] = [];
  const n = Math.floor(width / 5);
  for (let i = 0; i <= n; i++) {
    const major = i % 5 === 0;
    ticks.push(<line key={i} x1={i * 5} y1={height} x2={i * 5} y2={major ? 1 : height * 0.45} stroke={tint} strokeWidth={major ? "1" : "0.5"} />);
  }
  ticks.push(<line key="base" x1="0" y1={height - 0.5} x2={n * 5} y2={height - 0.5} stroke={tint} strokeWidth="0.6" />);
  return <svg width={width} height={height} style={{ display: "block" }}>{ticks}</svg>;
}

/** Dot matrix — GHOST poster-style pixel cluster. */
export function EhDotMatrix({ cols = 5, rows = 4, dotSize = 2, gap = 3, seed = 0, tint = "rgba(255,255,255,0.3)" }: { cols?: number; rows?: number; dotSize?: number; gap?: number; seed?: number; tint?: string }) {
  const dots: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = Math.abs(Math.sin((r * cols + c + seed) * 12.9898) * 43758.5453) % 1;
      if (v > 0.3) {
        dots.push(<rect key={`${r}_${c}`} x={c * (dotSize + gap)} y={r * (dotSize + gap)} width={dotSize} height={dotSize} fill={tint} opacity={0.3 + v * 0.7} />);
      }
    }
  }
  return <svg width={cols * (dotSize + gap)} height={rows * (dotSize + gap)} style={{ display: "block" }}>{dots}</svg>;
}
