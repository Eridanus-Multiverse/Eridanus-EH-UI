import { memo, useEffect, useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useThemeTokens } from "../../hooks/useTheme";

const STAR_COUNT = 20;

function seededStars() {
  const stars: Array<{ left: number; top: number; size: number; opacity: number; twinkleDelay: number; twinkleDur: number }> = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      left: ((i * 37 + 11) % 100),
      top: ((i * 53 + 7) % 100),
      size: (i % 7 === 0) ? 3 : (i % 3 === 0) ? 2 : 1,
      opacity: 0.2 + ((i * 7) % 5) / 10,
      twinkleDelay: ((i * 13 + 3) % 20) * 0.5,
      twinkleDur: 2 + ((i * 11) % 6),
    });
  }
  return stars;
}

const STARS_DATA = seededStars();

// ============ Event Horizon scene artwork (chat pages only) ============
// Poster-style halftone scenes. Deterministic pseudo-random so renders are stable.

const EH_W = 400, EH_H = 800;

const ehRand = (s: number) => {
  const v = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// GHOST-poster glint: concave-edged four-point star (astroid-ish silhouette),
// solid dense body dissolving into dither at the edges, plus a full
// 45°-rotated sub-star radiating into the four corners. Static, like print.
// (exported: WelcomeScreen's EH boot art reuses these poster parts)
export function ehSparkle(paths: JSX.Element[], sx: number, sy: number, R: number, seed: number) {
  const step = 2; // fine dither grid
  const Lv = R * 2.1;   // vertical spikes, way out
  const Lh = R * 1.35;  // horizontal spikes, stretched wide
  const Ld = R * 1.25;  // diagonal spikes — full rays
  const p = 0.42;       // <1 = concave star edges
  const rects: JSX.Element[] = [];
  let k = 0;
  for (let gy = -Lv; gy <= Lv; gy += step) {
    for (let gx = -Lv; gx <= Lv; gx += step) {
      const f1 = Math.pow(Math.abs(gx) / Lh, p) + Math.pow(Math.abs(gy) / Lv, p);
      const u = (gx + gy) * 0.7071, w = (gx - gy) * 0.7071;
      const f2 = Math.pow(Math.abs(u) / Ld, p) + Math.pow(Math.abs(w) / (Ld * 0.9), p);
      const I = Math.max(1 - f1, (1 - f2) * 0.92);
      if (I <= 0) continue;
      // near-solid inside, dissolving to sparse grain at the silhouette edge
      const density = Math.min(1, 0.06 + I * 2.1);
      if (ehRand(seed + gx * 13.7 + gy * 71.3) < density) {
        const bright = 0.5 + Math.min(1, I * 1.7) * 0.5;
        const sz = I > 0.55 && ehRand(seed + gx * 3.1 + gy * 9.7 + 5) > 0.5 ? 2 : 1;
        rects.push(
          <rect key={`sp${seed}-${k++}`} x={(sx + gx).toFixed(0)} y={(sy + gy).toFixed(0)}
            width={sz} height={sz} fill={`rgba(235,243,255,${bright.toFixed(2)})`} />
        );
      }
    }
  }
  // stray glint dots drifting off the star
  for (let i = 0; i < 8; i++) {
    const a = ehRand(seed + i * 3.3) * Math.PI * 2;
    const dd = R * (1.05 + ehRand(seed + i * 7.7) * 0.5);
    rects.push(
      <rect key={`sg${seed}-${i}`} x={(sx + Math.cos(a) * dd).toFixed(0)} y={(sy + Math.sin(a) * dd * 0.9).toFixed(0)}
        width="1" height="1" fill="rgba(220,232,255,0.4)" />
    );
  }
  paths.push(<g key={`star${seed}`}>{rects}</g>);
}

// Small cross glint — thin + shaped twinkle (these do blink)
export function ehCrossGlint(paths: JSX.Element[], gx: number, gy: number, s: number, seed: number) {
  const rects: JSX.Element[] = [];
  for (let i = -s; i <= s; i++) {
    const op = 0.75 - (Math.abs(i) / s) * 0.5;
    rects.push(<rect key={`cgv${seed}-${i}`} x={gx} y={gy + i * 2} width="1" height="1" fill={`rgba(230,240,255,${op.toFixed(2)})`} />);
    if (Math.abs(i) <= Math.ceil(s * 0.7))
      rects.push(<rect key={`cgh${seed}-${i}`} x={gx + i * 2} y={gy} width="1" height="1" fill={`rgba(230,240,255,${op.toFixed(2)})`} />);
  }
  rects.push(<rect key={`cgc${seed}`} x={gx - 1} y={gy - 1} width="2" height="2" fill="rgba(240,246,255,0.95)" />);
  paths.push(
    <g key={`cg${seed}`} style={{
      animation: `starTwinkle ${2.5 + (seed % 3)}s ease-in-out ${(seed % 4) * 0.5}s infinite`,
      ["--star-base" as any]: "0.5",
      ["--star-peak" as any]: "1",
    } as any}>{rects}</g>
  );
}

// Grainy star-stream band along a line (poster dust lane)
export function ehStream(paths: JSX.Element[], x0: number, y0: number, x1: number, y1: number, n: number, spread: number, seedBase: number, key: string) {
  const rects: JSX.Element[] = [];
  const nx = -(y1 - y0), ny = x1 - x0;
  const nl = Math.hypot(nx, ny);
  for (let i = 0; i < n; i++) {
    const t = ehRand(seedBase + i * 1.9);
    const off = (ehRand(seedBase + 10 + i * 3.7) + ehRand(seedBase + 20 + i * 5.1) - 1) * spread; // ~gaussian
    const px = x0 + (x1 - x0) * t + (nx / nl) * off;
    const py = y0 + (y1 - y0) * t + (ny / nl) * off;
    const op = 0.15 + ehRand(seedBase + 30 + i * 7.3) * 0.4;
    const sz = ehRand(seedBase + 40 + i) > 0.88 ? 2 : 1;
    rects.push(
      <rect key={`${key}${i}`} x={px.toFixed(0)} y={py.toFixed(0)} width={sz} height={sz}
        fill={`rgba(228,238,255,${op.toFixed(2)})`} />
    );
  }
  paths.push(<g key={key}>{rects}</g>);
}

// Sparse pixel dust across the whole canvas
export function ehDust(paths: JSX.Element[], n: number, seedBase: number) {
  for (let i = 0; i < n; i++) {
    const px = 12 + ehRand(seedBase + i * 3.1) * (EH_W - 24);
    const py = 20 + ehRand(seedBase + 10 + i * 7.7) * (EH_H - 40);
    const sz = ehRand(seedBase + 20 + i * 11.3) > 0.8 ? 2 : 1;
    paths.push(
      <rect key={`dust${seedBase}-${i}`} x={px.toFixed(0)} y={py.toFixed(0)} width={sz} height={sz}
        fill={`rgba(225,236,255,${(0.22 + ehRand(seedBase + 30 + i * 5.9) * 0.38).toFixed(2)})`} />
    );
  }
}

// Epsilon's chat: black-hole funnel bottom-right, stars falling toward it
function renderEhBlackhole(): JSX.Element[] {
  const paths: JSX.Element[] = [];

  // 3D gravity-well mesh (NASA-poster style)
  const cx = 300, cy = 580;  // funnel center, bottom-right
  const rMin = 11, rMax = 340;
  const rEdge = rMax * 0.8;  // where the pit starts bending
  const depth = 258;
  const viewAngle = 0.95;    // strong side view (~54°)
  const cosA = Math.cos(viewAngle), sinA = Math.sin(viewAngle);
  const rot = -0.78;         // disk rotated ~45° left
  const cosR = Math.cos(rot), sinR = Math.sin(rot);

  const zFunc = (r: number) => {
    if (r >= rEdge) return 0;
    const t = 1 - r / rEdge;
    return -depth * Math.pow(t, 2.4); // steep drop near the core
  };
  const project = (r: number, theta: number): [number, number] => {
    const x3 = r * Math.cos(theta);
    const y3 = r * Math.sin(theta);
    const z3 = zFunc(r);
    const sx = x3;
    const sy = y3 * cosA - z3 * sinA;
    return [cx + sx * cosR - sy * sinR, cy + sx * sinR + sy * cosR];
  };

  // Rings — denser toward the pit, brighter down the wall
  const ringCount = 22;
  for (let i = 0; i < ringCount; i++) {
    const t = i / (ringCount - 1);
    const r = rMin + (rMax - rMin) * Math.pow(t, 1.7);
    const pts: string[] = [];
    for (let j = 0; j <= 72; j++) {
      const [px, py] = project(r, (j / 72) * Math.PI * 2);
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    paths.push(
      <polyline key={`ring${i}`} points={pts.join(" ")}
        stroke={`rgba(205,225,255,${(0.37 - t * 0.22).toFixed(3)})`}
        strokeWidth="0.7" fill="none" />
    );
  }
  // Meridians — down into the pit
  for (let m = 0; m < 28; m++) {
    const theta = (m / 28) * Math.PI * 2;
    const pts: string[] = [];
    for (let j = 0; j <= 50; j++) {
      const r = rMin + (rMax - rMin) * Math.pow(j / 50, 1.4);
      const [px, py] = project(r, theta);
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    paths.push(
      <polyline key={`mer${m}`} points={pts.join(" ")}
        stroke="rgba(205,225,255,0.13)" strokeWidth="0.55" fill="none" />
    );
  }

  // Stars per Eri's sketch: big upper-center, mid left, smalls scattered
  ehSparkle(paths, 192, 205, 65, 11);  // the big one, upper-center
  ehSparkle(paths, 70, 358, 32, 23);   // left-mid
  ehSparkle(paths, 288, 292, 12, 51);  // small, right of center
  ehSparkle(paths, 88, 610, 12, 83);   // small, lower-left
  ehSparkle(paths, 148, 712, 10, 91);  // small, lower-left corner

  ehCrossGlint(paths, 150, 108, 5, 3);
  ehCrossGlint(paths, 34, 225, 4, 7);
  ehCrossGlint(paths, 255, 435, 5, 13);
  ehCrossGlint(paths, 352, 528, 3, 17);

  // Grainy star-stream slicing the top-right corner
  ehStream(paths, 235, 38, 402, 148, 240, 16, 900, "stm");

  ehDust(paths, 30, 500);

  // Eri's hand-dotted stray specks
  const specks: Array<[number, number]> = [
    [242, 172], [344, 212], [186, 335], [339, 366], [307, 418],
    [47, 552], [338, 538], [92, 615], [283, 592], [130, 118],
  ];
  specks.forEach(([px, py], i) => {
    paths.push(
      <rect key={`spk${i}`} x={px} y={py} width={i % 3 === 0 ? 2 : 1} height={i % 3 === 0 ? 2 : 1}
        fill={`rgba(225,236,255,${(0.35 + (i % 4) * 0.12).toFixed(2)})`} />
    );
  });

  return paths;
}

// Cursa's chat: sister artwork — a grainy galactic dust lane sweeping
// from top-right down to bottom-left, no funnel
function renderEhCursa(): JSX.Element[] {
  const paths: JSX.Element[] = [];

  // Main dust lane, wide and dense, cutting the whole canvas diagonally
  ehStream(paths, 420, 70, -20, 640, 620, 30, 1300, "lane");
  // A fainter parallel companion band
  ehStream(paths, 420, 170, 40, 740, 260, 18, 1400, "lane2");

  // Stars: big glint upper-left, smalls placed off the lane
  ehSparkle(paths, 90, 170, 48, 111);
  ehSparkle(paths, 300, 120, 14, 123);
  ehSparkle(paths, 62, 470, 18, 137);
  ehSparkle(paths, 315, 560, 10, 151);
  ehSparkle(paths, 190, 680, 13, 167);

  ehCrossGlint(paths, 230, 240, 5, 19);
  ehCrossGlint(paths, 44, 320, 4, 29);
  ehCrossGlint(paths, 340, 400, 4, 31);
  ehCrossGlint(paths, 120, 590, 3, 41);

  ehDust(paths, 30, 700);

  return paths;
}

// Bridge group rooms: the constellation itself — HORIZON the river, winding
// from top-right down to ARCHIVE (the big glint, bottom-left river's end).
// Node stars joined by hairline segments, dust following the two main reaches.
function renderEhHORIZON(): JSX.Element[] {
  const paths: JSX.Element[] = [];

  // river nodes hug the right edge and bottom, keeping the message area clear
  const river: Array<[number, number]> = [
    [372, 88], [332, 152], [352, 232], [302, 302], [332, 382],
    [272, 462], [302, 542], [222, 622], [152, 682], [88, 716],
  ];
  const segs: JSX.Element[] = [];
  for (let i = 0; i < river.length - 1; i++) {
    const [x0, y0] = river[i], [x1, y1] = river[i + 1];
    segs.push(<line key={`rs${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgba(205,225,255,0.16)" strokeWidth="1" />);
  }
  paths.push(<g key="river">{segs}</g>);
  // node stars — 2px pixels, brighter toward the river's end
  river.forEach(([x, y], i) => {
    const b = 0.4 + (i / river.length) * 0.35;
    paths.push(<rect key={`rn${i}`} x={x - 1} y={y - 1} width="2" height="2" fill={`rgba(235,243,255,${b.toFixed(2)})`} />);
  });

  // ARCHIVE — river's end, the hero glint
  ehSparkle(paths, 88, 716, 32, 211);
  // EH-STAR + one more small glint along the stream
  ehSparkle(paths, 352, 232, 11, 223);
  ehSparkle(paths, 272, 462, 10, 237);

  ehCrossGlint(paths, 60, 180, 4, 43);
  ehCrossGlint(paths, 200, 350, 3, 47);
  ehCrossGlint(paths, 350, 640, 4, 53);

  // dust following the upper and lower reaches
  ehStream(paths, 372, 88, 302, 302, 36, 16, 1500, "reach1");
  ehStream(paths, 302, 542, 88, 716, 44, 18, 1600, "reach2");
  ehDust(paths, 26, 900);

  return paths;
}

// ============ end EH scene artwork ============

function installKeyframes() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("horizon-starfield-css")) return;

  const style = document.createElement("style");
  style.id = "horizon-starfield-css";
  style.textContent = `
    @keyframes starTwinkle {
      0%, 100% { opacity: var(--star-base, 0.3); }
      50% { opacity: var(--star-peak, 0.8); }
    }
    [data-twinkle] {
      animation: starTwinkle var(--twinkle-dur, 4s) ease-in-out var(--twinkle-delay, 0s) infinite !important;
    }
    @keyframes chatRiverBreath {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 0.9; }
    }
    .chat-river-glow {
      position: absolute; bottom: -15%; left: -10%; width: 120%; height: 40%;
      background: radial-gradient(ellipse at 50% 100%, rgba(14,50,100,0.30) 0%, transparent 70%);
      pointer-events: none;
      animation: chatRiverBreath 10s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

function Starfield({ scene }: { scene?: "blackhole" | "cursa" | "horizon" }) {
  // `scene` gates the EH poster artwork — chat pages only, like the pixel theme's orrery
  const theme = useThemeTokens();
  const active = useIsFocused();
  useEffect(installKeyframes, []);

  const stars = useMemo(() => {
    return STARS_DATA.map((s, i) => (
      <View
        key={`star-${i}`}
        {...(Platform.OS === "web" ? { dataSet: { twinkle: "1" } } : {})}
        style={[
          styles.star,
          {
            left: `${s.left}%` as any,
            top: `${s.top}%` as any,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
          },
          { backgroundColor: theme.decor.starColor },
          Platform.OS === "web"
            ? ({
                imageRendering: "pixelated",
                "--star-base": String(s.opacity * 0.4),
                "--star-peak": String(Math.min(s.opacity * 1.8, 1)),
                "--twinkle-dur": `${s.twinkleDur}s`,
                "--twinkle-delay": `${s.twinkleDelay}s`,
              } as any)
            : {},
        ]}
      />
    ));
  }, [theme.decor.starColor]);

  const isEH = theme.key === "eventHorizon";

  const ehScene = useMemo(() => {
    if (Platform.OS !== "web" || !isEH || !scene) return null;
    return scene === "cursa" ? renderEhCursa() : scene === "horizon" ? renderEhHORIZON() : renderEhBlackhole();
  }, [isEH, scene]);

  if (!active) return <View pointerEvents="none" style={[styles.sky, { backgroundColor: theme.bg }]} />;

  return (
    <View pointerEvents="none" style={[styles.sky, { backgroundColor: theme.bg }]}>
      {Platform.OS === "web" && !isEH && <div className="chat-river-glow" />}
      {ehScene && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${EH_W} ${EH_H}`} preserveAspectRatio="xMidYMid slice" fill="none">
            {ehScene}
          </svg>
        </div>
      )}
      {stars}
    </View>
  );
}

export default memo(Starfield);

const styles = StyleSheet.create({
  sky: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  star: {
    position: "absolute",
    borderRadius: 0,
  },
});
