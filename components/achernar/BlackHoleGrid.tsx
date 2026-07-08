import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";

function buildSvg(w: number, h: number): string {
  const cx = w * 0.5;
  const cy = h * 0.48;
  const lines: string[] = [];

  const P = (a: number) => `rgba(175,155,235,${a})`;

  // tilted accretion rings — ellipses at slight angle
  const rings = [30, 52, 80, 115, 158, 210];
  rings.forEach((rx, i) => {
    const ry = rx * 0.32;
    const op = (0.14 + (rings.length - i) * 0.06).toFixed(2);
    const sw = i < 2 ? 1.0 : 0.7;
    const dash = i % 2 === 0 ? "" : ` stroke-dasharray="3 5"`;
    lines.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${P(Number(op))}" stroke-width="${sw}"${dash} transform="rotate(-12,${cx},${cy})"/>`
    );
  });

  // vertical photon ring — the "halo" above/below
  lines.push(
    `<ellipse cx="${cx}" cy="${cy}" rx="38" ry="88" fill="none" stroke="${P(0.22)}" stroke-width="0.6" stroke-dasharray="2 4"/>`
  );
  lines.push(
    `<ellipse cx="${cx}" cy="${cy}" rx="28" ry="68" fill="none" stroke="${P(0.18)}" stroke-width="0.5"/>`
  );

  // bent light streaks — curves deflected around the center
  const streaks = [
    { y0: -90, x0: -170, cp1x: -40, cp1y: -30, cp2x: 40, cp2y: 30, x1: 170, y1: 90 },
    { y0: -85, x0: -175, cp1x: -25, cp1y: -45, cp2x: 50, cp2y: 18, x1: 175, y1: 70 },
    { y0: -95, x0: -155, cp1x: -50, cp1y: -18, cp2x: 25, cp2y: 45, x1: 155, y1: 95 },
    { y0: 80, x0: -170, cp1x: -45, cp1y: 25, cp2x: 30, cp2y: -40, x1: 170, y1: -85 },
    { y0: 92, x0: -155, cp1x: -30, cp1y: 40, cp2x: 45, cp2y: -25, x1: 160, y1: -90 },
  ];
  streaks.forEach((sk, i) => {
    const op = (0.16 + i * 0.03).toFixed(2);
    lines.push(
      `<path d="M${cx + sk.x0},${cy + sk.y0} C${cx + sk.cp1x},${cy + sk.cp1y} ${cx + sk.cp2x},${cy + sk.cp2y} ${cx + sk.x1},${cy + sk.y1}" fill="none" stroke="${P(Number(op))}" stroke-width="0.5"/>`
    );
  });

  // shadow / event horizon
  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="16" fill="rgba(6,4,16,0.95)"/>`
  );
  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="16" fill="none" stroke="${P(0.40)}" stroke-width="0.8"/>`
  );
  // inner glow ring
  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="${P(0.25)}" stroke-width="0.4"/>`
  );

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${lines.join("")}</svg>`;
}

export default function BlackHoleGrid() {
  if (Platform.OS !== "web") return null;

  const ref = useRef<View>(null);

  useEffect(() => {
    const el = ref.current as any;
    if (el && el.innerHTML !== undefined) {
      el.innerHTML = buildSvg(340, 180);
    }
  }, []);

  return (
    <View
      ref={ref}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0, opacity: 0.85,
      }}
      pointerEvents="none"
    />
  );
}
