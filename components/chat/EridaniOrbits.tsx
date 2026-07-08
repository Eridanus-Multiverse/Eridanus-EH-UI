import { useEffect, useRef } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";

interface Orbit { r: number; tone: "line" | "pale"; opacity: number; sw: number; dash?: string; }
interface Orb { r: number; size: number; hollow: boolean; tone: "line" | "pale"; opacity: number; dur: number; reverse?: boolean; startAngle?: number; }

const ORBITS: Orbit[] = [
  { r: 45,  tone: "line", opacity: 0.18, sw: 0.5 },
  { r: 58,  tone: "line", opacity: 0.20, sw: 0.5 },
  { r: 110, tone: "line", opacity: 0.25, sw: 0.5, dash: "4 8" },
  { r: 160, tone: "pale", opacity: 0.30, sw: 0.7, dash: "6 10" },
  { r: 250, tone: "pale", opacity: 0.25, sw: 0.5, dash: "3 12" },
  { r: 380, tone: "line", opacity: 0.26, sw: 0.7, dash: "8 14" },
  { r: 480, tone: "line", opacity: 0.20, sw: 0.5, dash: "2 16" },
];

const ORBS: Orb[] = [
  { r: 58,  size: 3.5, hollow: false, tone: "line", opacity: 0.75, dur: 80 },
  { r: 160, size: 7,   hollow: true,  tone: "pale", opacity: 0.50, dur: 140, reverse: true, startAngle: 45 },
  { r: 250, size: 2.5, hollow: false, tone: "pale", opacity: 0.55, dur: 200 },
  { r: 380, size: 9,   hollow: true,  tone: "line", opacity: 0.45, dur: 280, reverse: true, startAngle: 170 },
  { r: 480, size: 5,   hollow: true,  tone: "pale", opacity: 0.35, dur: 360, startAngle: 90 },
];

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}

function buildSvg(viewW: number, viewH: number, centered: boolean, theme: ThemeTokens): string {
  const BLUE = (a: number) => rgba(theme.decor.orbitLineRgb, a);
  const PALE = (a: number) => rgba(theme.decor.orbitPaleRgb, a);
  const tone = (kind: "line" | "pale", alpha: number) => kind === "line" ? BLUE(alpha) : PALE(alpha);
  const scale = centered ? 1.8 : 1;
  const cx = centered ? viewW * 0.5 : 0;
  const cy = centered ? viewH * 0.28 : viewH * 0.42;
  const lines: string[] = [];

  const styles: string[] = [];
  ORBS.forEach((orb, i) => {
    const dir = orb.reverse ? -360 : 360;
    styles.push(`
      .eo-orb-${i} {
        transform-origin: ${cx}px ${cy}px;
        animation: eo-spin-${i} ${orb.dur}s linear infinite;
        animation-play-state: var(--orbit-play, running);
      }
      @keyframes eo-spin-${i} {
        0% { transform: rotate(${orb.startAngle ?? 0}deg); }
        100% { transform: rotate(${(orb.startAngle ?? 0) + dir}deg); }
      }
    `);
  });
  lines.push(`<style>${styles.join("")}</style>`);
  lines.push(`<defs></defs>`);

  const maxR = 500 * scale;

  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r1 = 30 * scale;
    const opacity = i % 6 === 0 ? 0.32 : 0.18;
    const sw = i % 6 === 0 ? 0.6 : 0.35;
    lines.push(
      `<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * maxR}" y2="${cy + Math.sin(a) * maxR}" stroke="${BLUE(opacity)}" stroke-width="${sw}"/>`
    );
  }

  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const r1 = 55 * scale;
    const r2 = 61 * scale;
    lines.push(
      `<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cy + Math.sin(a) * r2}" stroke="${BLUE(0.15)}" stroke-width="0.3"/>`
    );
  }

  ORBITS.forEach((o) => {
    const r = o.r * scale;
    const dash = o.dash ? ` stroke-dasharray="${o.dash}"` : "";
    lines.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${tone(o.tone, o.opacity)}" stroke-width="${o.sw}"${dash}/>`
    );
  });

  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="${45 * scale}" fill="none" stroke="${BLUE(0.10)}" stroke-width="6" stroke-dasharray="1 3"/>`
  );
  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="${380 * scale}" fill="none" stroke="${BLUE(0.07)}" stroke-width="14" stroke-dasharray="2 8"/>`
  );

  const ts = `font-size:5px;font-family:Silkscreen,monospace;letter-spacing:1px`;
  lines.push(`<text x="${cx + 48 * scale}" y="${cy - 64 * scale}" style="${ts};fill:${BLUE(0.28)}">A Eri b · 3.5 AU</text>`);
  lines.push(`<text x="${cx + 130 * scale}" y="${cy - 170 * scale}" style="${ts};fill:${PALE(0.22)}">DUST BELT · 20 AU</text>`);
  lines.push(`<text x="${cx + 12 * scale}" y="${cy + 48 * scale}" style="font-size:4px;font-family:Silkscreen,monospace;fill:${BLUE(0.22)}">INNER BELT · 3 AU</text>`);

  lines.push(`<circle cx="${cx}" cy="${cy}" r="${3 * scale}" fill="${BLUE(0.12)}"/>`);
  lines.push(`<circle cx="${cx}" cy="${cy}" r="${1.5 * scale}" fill="${BLUE(0.25)}"/>`);
  lines.push(`<circle cx="${cx}" cy="${cy}" r="${8 * scale}" fill="none" stroke="${BLUE(0.12)}" stroke-width="0.4"/>`);

  ORBS.forEach((orb, i) => {
    const ox = cx + orb.r * scale;
    const oy = cy;
    const sz = orb.size * scale;
    if (orb.hollow) {
      lines.push(
        `<circle class="eo-orb-${i}" cx="${ox}" cy="${oy}" r="${sz}" fill="none" stroke="${tone(orb.tone, orb.opacity)}" stroke-width="0.8"/>`
      );
    } else {
      lines.push(
        `<circle class="eo-orb-${i}" cx="${ox}" cy="${oy}" r="${sz}" fill="${tone(orb.tone, orb.opacity)}"/>`
      );
    }
  });

  for (let i = 0; i < 8; i++) {
    const x = (i * 43 + 17) % viewW;
    const y = (i * 71 + 31) % viewH;
    const sz = i % 4 === 0 ? 1.5 : 0.7;
    lines.push(`<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="${BLUE(0.3)}"/>`);
  }

  return `<svg viewBox="0 0 ${viewW} ${viewH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">${lines.join("")}</svg>`;
}

export default function EridaniOrbits() {
  if (Platform.OS !== "web") return null;

  const { width, height } = useWindowDimensions();
  const isDesktop = useIsDesktop();
  const theme = useThemeTokens();
  const ref = useRef<View>(null);
  const viewH = Math.max(height, 700);
  const viewW = Math.max(width, 500);

  useEffect(() => {
    const el = ref.current as any;
    if (el && el.innerHTML !== undefined) {
      el.innerHTML = buildSvg(viewW, viewH, isDesktop, theme);
    }
  }, [viewW, viewH, isDesktop, theme]);

  return (
    <View
      ref={ref}
      {...(Platform.OS === "web" ? { dataSet: { keyboardHeavy: "1" } } : {})}
      style={{
        position: "absolute" as any,
        left: 0,
        top: 0,
        bottom: 0,
        width: "100%" as any,
        zIndex: 0,
        opacity: 0.9,
      }}
      pointerEvents="none"
    />
  );
}
