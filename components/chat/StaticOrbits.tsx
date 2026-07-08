import { useEffect, useRef } from "react";
import { Platform, View, useWindowDimensions } from "react-native";

type Side = "left" | "right";
type Theme = "home" | "cursa";

const THEMES = {
  home: {
    line: (a: number) => `rgba(140,175,220,${a})`,
    pale: (a: number) => `rgba(180,200,230,${a})`,
    label: "A ERI",
    coord: "a 1h37m",
  },
  cursa: {
    line: (a: number) => `rgba(195,180,240,${a})`,
    pale: (a: number) => `rgba(215,200,248,${a})`,
    label: "B ERI",
    coord: "a 5h08m",
  },
};

function buildSvg(w: number, h: number, side: Side, theme: Theme): string {
  const t = THEMES[theme];
  const cx = side === "right" ? w : 0;
  const cy = h * 0.42;
  const l: string[] = [];

  const orbits = [50, 85, 130, 190, 270, 370, 490];

  // radial spokes
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r1 = 35;
    const r2 = 510;
    const major = i % 6 === 0;
    l.push(
      `<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cy + Math.sin(a) * r2}" stroke="${t.line(major ? 0.22 : 0.10)}" stroke-width="${major ? 0.5 : 0.3}"/>`
    );
  }

  // orbital rings
  orbits.forEach((r, i) => {
    const dash = i % 2 === 1 ? ` stroke-dasharray="4 8"` : "";
    const op = (0.12 + (orbits.length - i) * 0.025).toFixed(2);
    l.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.line(Number(op))}" stroke-width="${i < 2 ? 0.4 : 0.5}"${dash}/>`
    );
  });

  // tick marks
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    l.push(
      `<line x1="${cx + Math.cos(a) * (orbits[1] - 2)}" y1="${cy + Math.sin(a) * (orbits[1] - 2)}" x2="${cx + Math.cos(a) * (orbits[1] + 2)}" y2="${cy + Math.sin(a) * (orbits[1] + 2)}" stroke="${t.line(0.12)}" stroke-width="0.3"/>`
    );
  }

  // center hollow sphere
  l.push(`<circle cx="${cx}" cy="${cy}" r="20" fill="rgba(5,10,22,0.9)"/>`);
  l.push(`<circle cx="${cx}" cy="${cy}" r="20" fill="none" stroke="${t.line(0.30)}" stroke-width="0.7"/>`);
  l.push(`<circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="${t.line(0.18)}" stroke-width="0.4" stroke-dasharray="2 3"/>`);
  l.push(`<circle cx="${cx}" cy="${cy}" r="25" fill="none" stroke="${t.line(0.12)}" stroke-width="0.3"/>`);

  // orbiting bodies——名副其实地 static 了：SVG 内部的 CSS rotate 不走合成器，
  // 每帧重绘整张星轨图，是聊天页发烫元凶之一（2026-06-11 Eri 验明正身）。
  // 球钉在各自的起始相位上，构图不变，功耗归零。
  const orbs = [
    { r: 85, size: 3.5, filled: true, start: 0 },
    { r: 190, size: 6, filled: false, start: 45 },
    { r: 270, size: 2.5, filled: true, start: 120 },
    { r: 370, size: 8, filled: false, start: 170 },
    { r: 490, size: 4.5, filled: false, start: 90 },
  ];
  orbs.forEach((orb) => {
    const a = (orb.start * Math.PI) / 180;
    const ox = (cx + Math.cos(a) * orb.r).toFixed(1);
    const oy = (cy + Math.sin(a) * orb.r).toFixed(1);
    if (orb.filled) {
      l.push(`<circle cx="${ox}" cy="${oy}" r="${orb.size}" fill="${t.pale(0.55)}"/>`);
    } else {
      l.push(`<circle cx="${ox}" cy="${oy}" r="${orb.size}" fill="none" stroke="${t.pale(0.40)}" stroke-width="0.8"/>`);
    }
  });

  // dust belt glow
  l.push(`<circle cx="${cx}" cy="${cy}" r="55" fill="none" stroke="${t.line(0.08)}" stroke-width="6" stroke-dasharray="1 3"/>`);
  l.push(`<circle cx="${cx}" cy="${cy}" r="370" fill="none" stroke="${t.line(0.05)}" stroke-width="10" stroke-dasharray="2 6"/>`);

  // label text
  const ts = `font-size:5px;font-family:Silkscreen,monospace;letter-spacing:1px`;
  const tx = side === "right" ? cx - 120 : cx + 40;
  l.push(`<text x="${tx}" y="${cy - 70}" style="${ts};fill:${t.line(0.22)}">${t.label}</text>`);
  l.push(`<text x="${tx}" y="${cy + 80}" style="font-size:4px;font-family:Silkscreen,monospace;fill:${t.line(0.16)}">${t.coord}</text>`);

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${l.join("")}</svg>`;
}

interface Props {
  side: Side;
  theme: Theme;
}

export default function StaticOrbits({ side, theme }: Props) {
  if (Platform.OS !== "web") return null;

  const { height } = useWindowDimensions();
  const ref = useRef<View>(null);
  const viewH = Math.max(height, 700);

  useEffect(() => {
    const el = ref.current as any;
    if (el && el.innerHTML !== undefined) {
      el.innerHTML = buildSvg(500, viewH, side, theme);
    }
  }, [viewH, side, theme]);

  return (
    <View
      ref={ref}
      {...(Platform.OS === "web" ? { dataSet: { keyboardHeavy: "1" } } : {})}
      style={{
        position: "absolute" as any,
        [side === "right" ? "right" : "left"]: 0,
        top: 0,
        bottom: 0,
        width: 500,
        zIndex: 0,
        opacity: 0.7,
      }}
      pointerEvents="none"
    />
  );
}
