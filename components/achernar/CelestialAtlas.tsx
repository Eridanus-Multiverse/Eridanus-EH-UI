import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";

const ARCS = [35, 60, 88, 120, 160];
const RADIALS = 24;
const TICKS = 36;
const STARS_N = 30;

function buildSvg(w: number, h: number, mono = false): string {
  // event-horizon livery: gold lattice turns white, the two orbiters become
  // the binary pair — one white, one poster blue
  const ink = (op: string | number) => mono ? `rgba(255,255,255,${op})` : `rgba(238,195,116,${op})`;
  const cx = w / 2;
  const cy = h * 0.44;
  const lines: string[] = [];

  lines.push(`<style>
    @keyframes ca-orbit1 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes ca-orbit2 { 0% { transform: rotate(0deg); } 100% { transform: rotate(-360deg); } }
    .ca-orb1 { transform-origin: ${cx}px ${cy}px; animation: ca-orbit1 60s linear infinite; will-change: transform; }
    .ca-orb2 { transform-origin: ${cx}px ${cy}px; animation: ca-orbit2 90s linear infinite; will-change: transform; }
  </style>`);

  for (let i = 0; i < RADIALS; i++) {
    const a = (i / RADIALS) * Math.PI * 2;
    const r = ARCS[ARCS.length - 1] + 20;
    lines.push(
      `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r).toFixed(1)}" stroke="${ink(0.14)}" stroke-width="0.3"/>`
    );
  }

  ARCS.forEach((r, i) => {
    const op = (0.18 + i * 0.05).toFixed(2);
    const sw = i === ARCS.length - 1 ? 0.8 : 0.4;
    const dash = i % 2 === 0 ? "" : ` stroke-dasharray="2 4"`;
    lines.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink(op)}" stroke-width="${sw}"${dash}/>`
    );
  });

  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * Math.PI * 2;
    const r1 = ARCS[ARCS.length - 1] - 2;
    const r2 = ARCS[ARCS.length - 1] + 2;
    lines.push(
      `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}" stroke="${ink(0.25)}" stroke-width="0.5"/>`
    );
  }

  for (let i = 0; i < STARS_N; i++) {
    const x = (i * 37 + 11) % w;
    const y = (i * 53 + 7) % h;
    const sz = i % 5 === 0 ? 2 : i % 3 === 0 ? 1.2 : 0.7;
    const op = i % 5 === 0 ? 0.5 : 0.3;
    lines.push(
      `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="${ink(op)}"/>`
    );
  }

  // orbiting dots
  lines.push(`<circle class="ca-orb1" cx="${cx + ARCS[2]}" cy="${cy}" r="${mono ? 2.4 : 1.8}" fill="${mono ? "#ffffff" : "rgba(255,223,146,0.7)"}"/>`);
  lines.push(`<circle class="ca-orb2" cx="${cx}" cy="${cy - ARCS[4]}" r="${mono ? 1.9 : 1.2}" fill="${mono ? "rgba(96,168,255,0.95)" : "rgba(200,216,240,0.5)"}"/>`)

  const textStyle = `font-size:5px;fill:${ink(0.35)};font-family:Silkscreen,monospace;letter-spacing:1px`;
  lines.push(`<text x="${cx + ARCS[2] + 4}" y="${cy - 6}" style="${textStyle}">A ERI</text>`);
  lines.push(`<text x="${cx - ARCS[3] - 28}" y="${cy + 14}" style="font-size:5px;fill:${ink(0.3)};font-family:Silkscreen,monospace;letter-spacing:1px">a 1h37m</text>`);
  lines.push(`<text x="${cx + 20}" y="${cy + ARCS[1] + 10}" style="font-size:4px;fill:${ink(0.25)};font-family:Silkscreen,monospace">δ -57°14'</text>`);
  lines.push(`<text x="${cx - ARCS[1] - 10}" y="${cy - ARCS[0]}" style="font-size:4px;fill:${ink(0.25)};font-family:Silkscreen,monospace">ARCHIVE</text>`);

  lines.push(
    `<path d="M${cx - 50},${cy - 70} Q${cx - 25},${cy - 35} ${cx + 10},${cy + 5} T${cx + 70},${cy + 60}" fill="none" stroke="${ink(0.18)}" stroke-width="0.6" stroke-dasharray="3 5"/>`
  );

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${lines.join("")}</svg>`;
}

interface Props {
  width?: number;
  height?: number;
  mono?: boolean;
}

export default function CelestialAtlas({ width = 300, height = 220, mono = false }: Props) {
  if (Platform.OS !== "web") return null;

  const ref = useRef<View>(null);

  useEffect(() => {
    const el = ref.current as any;
    if (el && el.innerHTML !== undefined) {
      el.innerHTML = buildSvg(width, height, mono);
    }
  }, [width, height, mono]);

  return (
    <View
      ref={ref}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0, opacity: 0.7,
      }}
      pointerEvents="none"
    />
  );
}
