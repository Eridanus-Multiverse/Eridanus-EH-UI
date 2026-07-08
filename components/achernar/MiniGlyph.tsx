import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";

type GlyphType = "satellite" | "constellation-a" | "constellation-b" | "ripple" | "compass" | "timeline" | "hexnet" | "nebula";

const G = (a: number) => `rgba(238,195,116,${a})`;
const B = (a: number) => `rgba(150,180,230,${a})`;
const P = (a: number) => `rgba(170,150,230,${a})`;
const T = (a: number) => `rgba(100,190,180,${a})`;

function buildGlyph(type: GlyphType, w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const l: string[] = [];

  switch (type) {
    case "satellite": {
      const r = [18, 30, 44, 60, 78, 98, 120, 145];
      r.forEach((rv, i) => {
        const op = (0.25 - i * 0.025).toFixed(2);
        const dash = i % 2 === 0 ? "" : ` stroke-dasharray="3 5"`;
        l.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rv}" ry="${rv * 0.55}" fill="none" stroke="${B(Number(op))}" stroke-width="0.5"${dash} transform="rotate(-15,${cx},${cy})"/>`);
      });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        l.push(`<line x1="${cx + Math.cos(a) * 14}" y1="${cy + Math.sin(a) * 8}" x2="${cx + Math.cos(a) * 150}" y2="${cy + Math.sin(a) * 82}" stroke="${B(0.1)}" stroke-width="0.3"/>`);
      }
      l.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${B(0.4)}"/>`);
      l.push(`<circle cx="${cx + 44}" cy="${cy - 10}" r="2" fill="${B(0.5)}"/>`);
      l.push(`<circle cx="${cx - 25}" cy="${cy - 35}" r="1.5" fill="${B(0.4)}"/>`);
      l.push(`<circle cx="${cx + 78}" cy="${cy + 18}" r="1.8" fill="${B(0.35)}"/>`);
      l.push(`<circle cx="${cx - 60}" cy="${cy + 12}" r="1.2" fill="${B(0.3)}"/>`);
      break;
    }
    case "constellation-a": {
      // countdown dial — concentric arcs with tick marks
      const rMax = Math.min(w, h) * 0.85;
      l.push(`<circle cx="${cx}" cy="${cy}" r="${rMax}" fill="none" stroke="${T(0.15)}" stroke-width="0.4"/>`);
      l.push(`<circle cx="${cx}" cy="${cy}" r="${rMax * 0.65}" fill="none" stroke="${T(0.2)}" stroke-width="0.5"/>`);
      l.push(`<circle cx="${cx}" cy="${cy}" r="${rMax * 0.35}" fill="none" stroke="${T(0.15)}" stroke-width="0.3" stroke-dasharray="2 3"/>`);
      // 24 ticks
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const r1 = i % 6 === 0 ? rMax * 0.5 : rMax * 0.85;
        const sw = i % 6 === 0 ? 0.6 : 0.3;
        const op = i % 6 === 0 ? 0.35 : 0.18;
        l.push(`<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * rMax}" y2="${cy + Math.sin(a) * rMax}" stroke="${T(op)}" stroke-width="${sw}"/>`);
      }
      // marker dot at ~70% around
      const mAngle = Math.PI * 1.1;
      l.push(`<circle cx="${cx + Math.cos(mAngle) * rMax * 0.65}" cy="${cy + Math.sin(mAngle) * rMax * 0.65}" r="2.5" fill="${T(0.5)}"/>`);
      l.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="${T(0.4)}"/>`);
      break;
    }
    case "constellation-b": {
      // spiral countdown — Fibonacci spiral feel
      const rMax = Math.min(w, h) * 0.85;
      const bx = cx + w * 0.15;
      const by = cy - h * 0.15;
      // concentric partial arcs
      for (let i = 1; i <= 5; i++) {
        const r = rMax * (i / 5);
        const startA = -90 + i * 30;
        const endA = startA + 200 - i * 15;
        const s1 = (startA * Math.PI) / 180;
        const s2 = (endA * Math.PI) / 180;
        const x1 = bx + Math.cos(s1) * r;
        const y1 = by + Math.sin(s1) * r;
        const x2 = bx + Math.cos(s2) * r;
        const y2 = by + Math.sin(s2) * r;
        const op = (0.28 - i * 0.03).toFixed(2);
        l.push(`<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 1,1 ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${T(Number(op))}" stroke-width="0.5"/>`);
      }
      // dots along spiral
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const r = rMax * 0.2 + rMax * 0.8 * t;
        const a = t * Math.PI * 3 - Math.PI / 2;
        const sz = i % 3 === 0 ? 2 : 1.2;
        l.push(`<circle cx="${(bx + Math.cos(a) * r).toFixed(1)}" cy="${(by + Math.sin(a) * r).toFixed(1)}" r="${sz}" fill="${T(0.3 + t * 0.2)}"/>`);
      }
      l.push(`<circle cx="${bx}" cy="${by}" r="2" fill="${T(0.45)}"/>`);
      break;
    }
    case "ripple": {
      for (let i = 1; i <= 8; i++) {
        const rx = i * 18;
        const ry = i * 8;
        const op = (0.30 - i * 0.03).toFixed(2);
        l.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${B(Number(op))}" stroke-width="0.5"/>`);
      }
      l.push(`<circle cx="${cx}" cy="${cy}" r="2.5" fill="${B(0.4)}"/>`);
      // water shimmer lines
      for (let i = 0; i < 5; i++) {
        const y = cy - 20 + i * 10;
        const x0 = cx - 60 + i * 8;
        l.push(`<path d="M${x0},${y} Q${x0 + 25},${y - 3} ${x0 + 50},${y} T${x0 + 100},${y}" fill="none" stroke="${B(0.12)}" stroke-width="0.3"/>`);
      }
      break;
    }
    case "compass": {
      const rMax = Math.max(w, h) * 0.55;
      const rings = [rMax * 0.2, rMax * 0.38, rMax * 0.56, rMax * 0.74, rMax * 0.92];
      rings.forEach((r, i) => {
        const op = (0.25 - i * 0.03).toFixed(2);
        const dash = i % 2 === 1 ? ` stroke-dasharray="2 4"` : "";
        l.push(`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${G(Number(op))}" stroke-width="0.5"${dash}/>`);
      });
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const cosA = Math.abs(Math.cos(a));
        if (cosA > 0.85) continue;
        const r1 = rMax * 0.82;
        const r2 = rMax * 0.95;
        const sw = i % 5 === 0 ? 0.6 : 0.3;
        const op = i % 5 === 0 ? 0.3 : 0.12;
        l.push(`<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cy + Math.sin(a) * r2}" stroke="${G(op)}" stroke-width="${sw}"/>`);
      }
      l.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${G(0.45)}"/>`);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        if (Math.abs(Math.cos(a)) > 0.85) continue;
        const tr = rMax * 0.56;
        l.push(`<line x1="${cx + Math.cos(a) * (tr - 2)}" y1="${cy + Math.sin(a) * (tr - 2)}" x2="${cx + Math.cos(a) * (tr + 2)}" y2="${cy + Math.sin(a) * (tr + 2)}" stroke="${G(0.16)}" stroke-width="0.3"/>`);
      }
      break;
    }
    case "timeline": {
      // sweeping arc with dots along it
      const arcR = 80;
      const arcCx = cx;
      const arcCy = h + 20;
      for (let i = 0; i < 3; i++) {
        const r = arcR + i * 18;
        const op = (0.2 - i * 0.05).toFixed(2);
        l.push(`<circle cx="${arcCx}" cy="${arcCy}" r="${r}" fill="none" stroke="${G(Number(op))}" stroke-width="0.4"/>`);
      }
      // timeline dots on the arc
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.15 - (i / 9) * Math.PI * 0.55;
        const x = arcCx + Math.cos(a) * arcR;
        const y = arcCy + Math.sin(a) * arcR;
        const big = i === 2 || i === 5 || i === 7;
        l.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? 2.2 : 1.2}" fill="${G(big ? 0.5 : 0.3)}"/>`);
      }
      // radial lines from arc center
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI * 0.1 - (i / 12) * Math.PI * 0.6;
        l.push(`<line x1="${arcCx + Math.cos(a) * 70}" y1="${arcCy + Math.sin(a) * 70}" x2="${arcCx + Math.cos(a) * 120}" y2="${arcCy + Math.sin(a) * 120}" stroke="${G(0.1)}" stroke-width="0.3"/>`);
      }
      break;
    }
    case "hexnet": {
      const hs = 14;
      const hr = 6.5;
      const cols = Math.ceil(w / (hs * 1.5)) + 2;
      const rows = Math.ceil(h / (hs * 0.87)) + 2;
      const halfW = w * 0.5;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const hx = col * hs * 1.5 + (row % 2 ? hs * 0.75 : 0) - hs;
          const hy = row * hs * 0.87;
          const dx = Math.abs(hx - cx);
          const fade = Math.max(0, 1 - dx / halfW);
          const op = (0.05 + fade * fade * 0.22).toFixed(2);
          for (let v = 0; v < 6; v++) {
            const a1 = (v / 6) * Math.PI * 2 - Math.PI / 6;
            const a2 = ((v + 1) / 6) * Math.PI * 2 - Math.PI / 6;
            l.push(`<line x1="${(hx + Math.cos(a1) * hr).toFixed(1)}" y1="${(hy + Math.sin(a1) * hr).toFixed(1)}" x2="${(hx + Math.cos(a2) * hr).toFixed(1)}" y2="${(hy + Math.sin(a2) * hr).toFixed(1)}" stroke="${B(Number(op))}" stroke-width="0.4"/>`);
          }
        }
      }
      l.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="${B(0.4)}"/>`);
      l.push(`<circle cx="${cx + 22}" cy="${cy - 8}" r="1.5" fill="${B(0.3)}"/>`);
      l.push(`<circle cx="${cx - 18}" cy="${cy + 10}" r="1.2" fill="${B(0.25)}"/>`);
      break;
    }
    case "nebula": {
      // flowing wisps edge to edge
      const curves = [
        { y: 0.12, amp: 14, op: 0.2 },
        { y: 0.25, amp: 18, op: 0.22 },
        { y: 0.38, amp: 12, op: 0.18 },
        { y: 0.5, amp: 16, op: 0.25 },
        { y: 0.62, amp: 20, op: 0.2 },
        { y: 0.75, amp: 14, op: 0.22 },
        { y: 0.88, amp: 16, op: 0.16 },
      ];
      curves.forEach((c) => {
        const baseY = h * c.y;
        l.push(`<path d="M${-w * 0.05},${baseY} Q${w * 0.15},${baseY - c.amp} ${w * 0.3},${baseY + 3} T${w * 0.5},${baseY - c.amp * 0.6} T${w * 0.75},${baseY + c.amp * 0.4} T${w * 1.05},${baseY - c.amp * 0.3}" fill="none" stroke="${P(c.op)}" stroke-width="0.6"/>`);
      });
      // scattered star dots
      const dots = [[0.05, 0.2], [0.18, 0.45], [0.32, 0.15], [0.45, 0.7], [0.58, 0.3], [0.72, 0.55], [0.85, 0.18], [0.95, 0.65], [0.1, 0.8], [0.5, 0.9], [0.78, 0.8], [0.38, 0.5]];
      dots.forEach(([px, py], i) => {
        const r = i % 3 === 0 ? 2.2 : 1.3;
        l.push(`<circle cx="${w * px}" cy="${h * py}" r="${r}" fill="${P(i < 4 ? 0.4 : 0.25)}"/>`);
      });
      break;
    }
  }

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${l.join("")}</svg>`;
}

interface Props {
  type: GlyphType;
  size?: number;
  position?: "tr" | "br" | "tl" | "bl";
}

export default function MiniGlyph({ type }: Props) {
  if (Platform.OS !== "web") return null;

  const ref = useRef<View>(null);

  useEffect(() => {
    const el = ref.current as any;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const w = parent.offsetWidth || 160;
    const h = parent.offsetHeight || 80;
    el.innerHTML = buildGlyph(type, w, h);
  }, [type]);

  return (
    <View
      ref={ref}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0,
      }}
      pointerEvents="none"
    />
  );
}
