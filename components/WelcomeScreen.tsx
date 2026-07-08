import { memo, useEffect, useMemo, useState, useRef } from "react";
import { Platform, StyleSheet, View, Text } from "react-native";
import { colors, fonts } from "../theme/colors";
import { useThemeTokens } from "../hooks/useTheme";
import { EH_BLUE, ehHexPoints } from "./bridge/BridgeDashboard";
import { ehSparkle, ehCrossGlint, ehDust } from "./chat/Starfield";

const TITLE = "EVENT HORIZON";
const BAR_CELLS = 14;

const SYS_CHECKS = [
  { label: "HULL INTEGRITY", status: "OK" },
  { label: "LIFE SUPPORT", status: "OK" },
  { label: "NAVIGATION", status: "ONLINE" },
  { label: "DOCKING PORT", status: "READY" },
];

const STARS = [
  [5, 8, 1, 3.2, 0.1], [12, 22, 1, 4.6, 0.7], [22, 12, 1, 5.1, 1.4],
  [35, 38, 1, 3.8, 0.3], [45, 15, 1, 4.8, 1.2], [58, 30, 1, 5.4, 0.6],
  [72, 10, 1, 4.2, 1.7], [85, 28, 1, 3.6, 0.9], [15, 55, 1, 5.0, 1.1],
  [30, 70, 1, 4.4, 0.4], [45, 60, 1, 3.9, 1.5], [60, 75, 1, 5.2, 0.8],
  [75, 50, 1, 4.1, 1.9], [88, 68, 1, 4.7, 0.2], [95, 45, 1, 3.5, 1.3],
  [8, 85, 1, 4.0, 0.5], [50, 90, 1, 4.3, 1.0], [70, 85, 1, 3.7, 1.6],
  [20, 45, 1, 5.3, 0.3], [80, 40, 1, 4.5, 1.8], [3, 32, 1, 4.9, 0.9],
  [40, 5, 1, 3.4, 1.1], [92, 15, 1, 4.8, 0.4], [55, 48, 1, 3.6, 1.5],
  [25, 30, 2, 4.0, 0.2], [65, 20, 2, 3.5, 0.8], [50, 55, 2, 4.5, 1.3],
  [10, 70, 2, 3.8, 0.6], [82, 55, 2, 4.2, 1.0], [38, 82, 2, 3.9, 1.1],
  [17, 35, 1, 4.1, 0.3], [63, 42, 1, 3.3, 1.6], [78, 72, 1, 4.6, 0.7],
  [42, 28, 1, 5.0, 1.4], [90, 82, 1, 3.7, 0.5], [7, 62, 1, 4.3, 1.8],
] as const;

function installKeyframes() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("eri-welcome-kf")) return;
  const s = document.createElement("style");
  s.id = "eri-welcome-kf";
  s.textContent = `
    @keyframes eriWelcomeStar {
      0%, 100% { opacity: 0.04; }
      50% { opacity: 0.5; }
    }
    @keyframes eriStarBright {
      0%, 100% { opacity: 0.08; }
      50% { opacity: 0.85; }
    }
    @keyframes eriBlinkCaret {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    @keyframes eriBarGlow {
      0%, 100% { box-shadow: 0 0 4px rgba(255,223,146,0.4); }
      50% { box-shadow: 0 0 12px rgba(255,223,146,0.8); }
    }
    @keyframes eriPulseGlow {
      0% { opacity: 0; }
      50% { opacity: 0.12; }
      100% { opacity: 0; }
    }
    @keyframes eriStatusBlink {
      0%, 90%, 100% { opacity: 1; }
      95% { opacity: 0.3; }
    }
  `;
  document.head.appendChild(s);
}

function dotFill(label: string, total: number) {
  const dots = Math.max(2, total - label.length);
  return " " + "·".repeat(dots) + " ";
}

interface Props {
  ready: boolean;
  onDone: () => void;
}

// ============ Event Horizon boot (web only) ============
// Not a recolor — its own layout in the EH part language: GHOST four-point
// star + dither dust backdrop, notched dividers, plate-tagged panel with a
// bevelled corner, dry white docking bar. Shares the animation skeleton state.

const EHW = "rgba(255,255,255,";

function EhBootScreen({ typedLen, showSignal, showSubtitle, checksVisible, showBar, filledCells, dockComplete, showWelcome, fading }: {
  typedLen: number;
  showSignal: boolean;
  showSubtitle: boolean;
  checksVisible: number;
  showBar: boolean;
  filledCells: number;
  dockComplete: boolean;
  showWelcome: boolean;
  fading: boolean;
}) {
  // poster art backdrop — static, like print (no text in background: iron rule)
  // sparkle R must be >=~30 for the concave silhouette to read; below that the
  // dither collapses into a noise blob (chat scenes use 65/48 for heroes)
  const bgArt = useMemo(() => {
    const paths: JSX.Element[] = [];
    ehSparkle(paths, 308, 148, 56, 42);   // hero four-point star, top-right
    ehSparkle(paths, 66, 636, 30, 87);    // mid companion, bottom-left
    ehSparkle(paths, 352, 336, 10, 51);   // small, right edge
    ehCrossGlint(paths, 92, 220, 4, 3);
    ehCrossGlint(paths, 240, 712, 5, 6);
    ehDust(paths, 34, 11);
    return paths;
  }, []);

  const titleDisplay = TITLE.slice(0, typedLen);
  const typing = typedLen < TITLE.length;
  const pct = Math.round((filledCells / BAR_CELLS) * 100);
  const edge = `${EHW}0.5)`;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 999, background: "#000", overflow: "hidden",
        display: "flex", flexDirection: "column",
        transition: "opacity 0.9s ease-out",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
        {bgArt}
      </svg>

      {/* corner brackets */}
      {([["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]] as const).map(([v, h]) => (
        <div key={`${v}${h}`} style={{
          position: "absolute", [v]: 14, [h]: 14, width: 22, height: 22,
          [`border${v === "top" ? "Top" : "Bottom"}`]: `1px solid ${EHW}0.4)`,
          [`border${h === "left" ? "Left" : "Right"}`]: `1px solid ${EHW}0.4)`,
        } as any} />
      ))}

      {/* top boot scanline + notched divider */}
      <div style={{ position: "absolute", top: 24, left: 46, right: 46, zIndex: 2, transition: "opacity 0.4s ease-in", opacity: showSignal ? 1 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW}0.65)`, letterSpacing: 2 }}>BOOT</span>
          <svg width="6" height="6"><rect width="6" height="6" fill="#78c878"><animate attributeName="opacity" values="1;0.2;1" dur="2.5s" repeatCount="indefinite" /></rect></svg>
          <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW}0.65)`, letterSpacing: 2 }}>SEQUENCE</span>
          <div style={{ flex: 1, height: 1, background: `${EHW}0.15)` }} />
          <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 2 }}>EPS-04</span>
        </div>
        <svg width="100%" height="9" viewBox="0 0 300 9" preserveAspectRatio="none" style={{ display: "block", marginTop: 7 }}>
          <path d="M0 1.5 L180 1.5 L190 7 L262 7 L272 1.5 L300 1.5" stroke={`${EHW}0.55)`} strokeWidth="1.2" fill="none" />
        </svg>
      </div>

      {/* center column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15, position: "relative", zIndex: 2, padding: "0 30px" }}>
        {/* title row: hex badge + typewriter + block caret */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 34 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ transition: "opacity 0.3s", opacity: typedLen > 0 ? 1 : 0 }}>
            <polygon points={ehHexPoints(12, 12, 10)} stroke="#fff" strokeWidth="1.8" />
            <polygon points={ehHexPoints(12, 12, 4.5)} fill="#fff" />
          </svg>
          <span style={{ fontFamily: fonts.pixel, fontSize: 23, color: "#fff", letterSpacing: 5, fontWeight: 700, whiteSpace: "pre" }}>{titleDisplay || " "}</span>
          <span style={{
            width: 10, height: 20, background: "#fff", display: "inline-block",
            animation: typing ? undefined : "eriBlinkCaret 0.7s step-end infinite",
          }} />
        </div>

        {/* notched divider under the title */}
        <svg width="258" height="9" viewBox="0 0 258 9" style={{ display: "block", transition: "opacity 0.3s", opacity: typedLen >= TITLE.length ? 1 : 0 }}>
          <path d="M0 1.5 L150 1.5 L160 7 L224 7 L234 1.5 L258 1.5" stroke={`${EHW}0.7)`} strokeWidth="1.2" fill="none" />
        </svg>

        <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW}0.55)`, letterSpacing: 4, transition: "opacity 0.5s", opacity: showSubtitle ? 1 : 0 }}>
          DEEP FIELD · DEEP SPACE VESSEL
        </span>

        {/* SYS_CHECK panel — plate tag, bevelled top-right corner, lamp column */}
        <div style={{ position: "relative", width: 276, marginTop: 12, transition: "opacity 0.3s", opacity: showSubtitle ? 1 : 0 }}>
          <div style={{ position: "relative", background: "#000", border: `1px solid ${edge}`, padding: "16px 13px 11px" }}>
            <div style={{ position: "absolute", top: -1, right: -1, width: 13, height: 13, background: "#000" }} />
            <svg style={{ position: "absolute", top: -1, right: -1 }} width="13" height="13">
              <line x1="0.5" y1="0.5" x2="12.5" y2="12.5" stroke={edge} strokeWidth="1.2" />
            </svg>
            <span style={{ position: "absolute", top: -7, left: 10, background: "#000", padding: "0 6px", fontFamily: fonts.pixel, fontSize: 8, color: `${EHW}0.8)`, letterSpacing: 2, fontWeight: 700 }}>
              SYS_CHECK
            </span>
            {SYS_CHECKS.map((check, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", transition: "opacity 0.15s", opacity: i < checksVisible ? 1 : 0 }}>
                <span style={{ width: 5, height: 5, background: i < checksVisible ? "#78c878" : `${EHW}0.15)`, flexShrink: 0 }} />
                <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW}0.6)`, letterSpacing: 1 }}>{check.label}</span>
                <span style={{ flex: 1, borderBottom: `1px dotted ${EHW}0.18)`, margin: "0 2px", transform: "translateY(-2px)" }} />
                <span style={{ fontFamily: fonts.pixel, fontSize: 8, letterSpacing: 1, color: check.status === "READY" ? EH_BLUE : "#78c878" }}>{check.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* docking bar — dry white cells, blue percent */}
        <div style={{ width: 276, transition: "opacity 0.3s", opacity: showBar ? 1 : 0 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${EHW}0.6)`, letterSpacing: 3 }}>DOCKING SEQUENCE</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: fonts.pixel, fontSize: 9, color: EH_BLUE, letterSpacing: 1 }}>{pct}%</span>
          </div>
          <div style={{ border: `1px solid ${EHW}0.4)`, padding: 2, display: "flex", gap: 2, height: 10, marginTop: 6, boxSizing: "content-box" }}>
            {Array.from({ length: BAR_CELLS }).map((_, i) => (
              <span key={i} style={{ flex: 1, background: i < filledCells ? "#fff" : `${EHW}0.06)` }} />
            ))}
          </div>
          <div style={{ marginTop: 7, fontFamily: fonts.pixel, fontSize: 7, letterSpacing: 1.2, whiteSpace: "nowrap", transition: "opacity 0.3s, color 0.3s", opacity: dockComplete ? 1 : 0.6, color: dockComplete ? "#78c878" : `${EHW}0.4)` }}>
            {dockComplete ? "▸ DOCK COMPLETE · AIRLOCK PRESSURIZED · HATCH OPEN" : "AWAITING DOCK ..."}
          </div>
        </div>

        {/* welcome */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, transition: "opacity 0.7s ease-in", opacity: showWelcome ? 1 : 0 }}>
          <svg width="30" height="9" viewBox="0 0 30 9">
            {[0, 1, 2].map((i) => (
              <line key={i} x1={3 + i * 9} y1="9" x2={10 + i * 9} y2="0" stroke={`${EHW}0.65)`} strokeWidth="1.5" />
            ))}
          </svg>
          <span style={{ fontFamily: fonts.pixel, fontSize: 17, color: "#fff", letterSpacing: 8, fontWeight: 700 }}>欢迎回家</span>
          <svg width="30" height="9" viewBox="0 0 30 9">
            {[0, 1, 2].map((i) => (
              <line key={i} x1={3 + i * 9} y1="9" x2={10 + i * 9} y2="0" stroke={`${EHW}0.65)`} strokeWidth="1.5" />
            ))}
          </svg>
        </div>
      </div>

      {/* bottom system plate */}
      <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, zIndex: 2, display: "flex", justifyContent: "center", transition: "opacity 0.4s ease-in", opacity: showSignal ? 1 : 0 }}>
        <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: `${EHW}0.5)`, letterSpacing: 3, border: `1px solid ${EHW}0.25)`, padding: "3px 10px" }}>
          SYS · EH-a · SECTOR 7 · V2.6
        </span>
      </div>
    </div>
  );
}

function WelcomeScreen({ ready, onDone }: Props) {
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  const [typedLen, setTypedLen] = useState(0);
  const [showSignal, setShowSignal] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [checksVisible, setChecksVisible] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const [filledCells, setFilledCells] = useState(0);
  const [dockComplete, setDockComplete] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [fading, setFading] = useState(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(installKeyframes, []);

  useEffect(() => {
    const t = setTimeout(() => setShowSignal(true), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showSignal) return;
    let inner: ReturnType<typeof setInterval> | null = null;
    const delay = setTimeout(() => {
      let i = 0;
      inner = setInterval(() => {
        i++;
        setTypedLen(i);
        if (i >= TITLE.length && inner) clearInterval(inner);
      }, 80);
    }, 450);
    return () => { clearTimeout(delay); if (inner) clearInterval(inner); };
  }, [showSignal]);

  useEffect(() => {
    if (typedLen < TITLE.length) return;
    const t = setTimeout(() => setShowSubtitle(true), 300);
    return () => clearTimeout(t);
  }, [typedLen]);

  useEffect(() => {
    if (!showSubtitle) return;
    let count = 0;
    let inner: ReturnType<typeof setInterval> | null = null;
    const t = setTimeout(() => {
      inner = setInterval(() => {
        count++;
        setChecksVisible(count);
        if (count >= SYS_CHECKS.length && inner) clearInterval(inner);
      }, 180);
    }, 350);
    return () => { clearTimeout(t); if (inner) clearInterval(inner); };
  }, [showSubtitle]);

  useEffect(() => {
    if (checksVisible < SYS_CHECKS.length) return;
    const t = setTimeout(() => setShowBar(true), 300);
    return () => clearTimeout(t);
  }, [checksVisible]);

  useEffect(() => {
    if (!showBar) return;
    let cell = 0;
    // 嵌套链上的每个定时器都登记进 timers，卸载时全清（包括 waitForReady 轮询）
    const timers: ReturnType<typeof setTimeout>[] = [];
    let alive = true;
    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(() => { if (alive) fn(); }, ms));
    };
    const id = setInterval(() => {
      cell++;
      setFilledCells(cell);
      if (cell >= BAR_CELLS) {
        clearInterval(id);
        later(() => {
          setDockComplete(true);
          later(() => {
            setShowWelcome(true);
            later(() => {
              const startWait = Date.now();
              const waitForReady = () => {
                if (readyRef.current || Date.now() - startWait > 5000) {
                  setFading(true);
                  later(onDone, 900);
                } else {
                  later(waitForReady, 100);
                }
              };
              waitForReady();
            }, 700);
          }, 450);
        }, 250);
      }
    }, 50);
    return () => {
      alive = false;
      clearInterval(id);
      timers.forEach((t) => clearTimeout(t));
    };
  }, [showBar, onDone]);

  const stars = useMemo(
    () =>
      STARS.map(([left, top, size, dur, delay], i) => (
        <View
          key={i}
          style={[
            styles.star,
            {
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              borderRadius: size,
            },
            Platform.OS === "web"
              ? ({
                  animationName: size > 1 ? "eriStarBright" : "eriWelcomeStar",
                  animationDuration: `${dur}s`,
                  animationDelay: `${delay}s`,
                  animationIterationCount: "infinite",
                  animationTimingFunction: "ease-in-out",
                  boxShadow:
                    size > 1
                      ? "0 0 6px rgba(247,245,222,0.5)"
                      : "0 0 2px rgba(247,245,222,0.15)",
                } as any)
              : { opacity: 0.3 },
          ]}
        />
      )),
    [],
  );

  const titleDisplay = TITLE.slice(0, typedLen);
  const typing = typedLen < TITLE.length;
  const pct = Math.round((filledCells / BAR_CELLS) * 100);

  if (isEH) {
    return (
      <EhBootScreen
        typedLen={typedLen}
        showSignal={showSignal}
        showSubtitle={showSubtitle}
        checksVisible={checksVisible}
        showBar={showBar}
        filledCells={filledCells}
        dockComplete={dockComplete}
        showWelcome={showWelcome}
        fading={fading}
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        Platform.OS === "web"
          ? ({
              transition: "opacity 0.9s ease-out",
              opacity: fading ? 0 : 1,
              pointerEvents: fading ? "none" : "auto",
            } as any)
          : fading
            ? { opacity: 0 }
            : {},
      ]}
    >
      <View style={styles.sky}>{stars}</View>


      <View style={[styles.hud, styles.hudTL]} />
      <View style={[styles.hud, styles.hudTR]} />
      <View style={[styles.hud, styles.hudBL]} />
      <View style={[styles.hud, styles.hudBR]} />

      {/* Top signal bar */}
      <View
        style={[
          styles.topBar,
          Platform.OS === "web"
            ? ({
                transition: "opacity 0.4s ease-in",
                opacity: showSignal ? 0.7 : 0,
              } as any)
            : { opacity: showSignal ? 0.7 : 0 },
        ]}
      >
        <Text style={styles.topBarText}>▸ SIGNAL ACQUIRED · FREQ LOCKED · HANDSHAKE OK</Text>
      </View>

      <View style={styles.center}>
        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text
            style={[
              styles.titleDeco,
              Platform.OS === "web"
                ? ({
                    transition: "opacity 0.3s ease-in",
                    opacity: typedLen > 0 ? 0.5 : 0,
                  } as any)
                : { opacity: typedLen > 0 ? 0.5 : 0 },
            ]}
          >
            ◆ ─────── · ·
          </Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{titleDisplay || " "}</Text>
            <View
              style={[
                styles.caret,
                Platform.OS === "web" && !typing
                  ? ({
                      animationName: "eriBlinkCaret",
                      animationDuration: "0.7s",
                      animationIterationCount: "infinite",
                      animationTimingFunction: "step-end",
                    } as any)
                  : {},
              ]}
            />
          </View>
          <Text
            style={[
              styles.titleDeco,
              Platform.OS === "web"
                ? ({
                    transition: "opacity 0.3s ease-in",
                    opacity: typedLen >= TITLE.length ? 0.5 : 0,
                  } as any)
                : { opacity: typedLen >= TITLE.length ? 0.5 : 0 },
            ]}
          >
            · · ─────── ◆
          </Text>
        </View>

        {/* Subtitle */}
        <View
          style={[
            styles.subtitleWrap,
            Platform.OS === "web"
              ? ({
                  transition: "opacity 0.5s ease-in",
                  opacity: showSubtitle ? 1 : 0,
                } as any)
              : { opacity: showSubtitle ? 1 : 0 },
          ]}
        >
          <Text style={styles.subtitle}>Deep Space Vessel</Text>
        </View>

        {/* System checks */}
        <View style={styles.checksBlock}>
          {SYS_CHECKS.map((check, i) => (
            <View
              key={i}
              style={[
                styles.checkRow,
                Platform.OS === "web"
                  ? ({
                      transition: "opacity 0.15s ease-in",
                      opacity: i < checksVisible ? 1 : 0,
                    } as any)
                  : { opacity: i < checksVisible ? 1 : 0 },
              ]}
            >
              <Text style={styles.checkLabel}>{check.label}</Text>
              <Text style={styles.checkDots}>{dotFill(check.label, 24)}</Text>
              <Text
                style={[
                  styles.checkStatus,
                  { color: check.status === "READY" ? "#9bedff" : "#75d879" },
                ]}
              >
                {check.status}
              </Text>
            </View>
          ))}
        </View>

        {/* Docking bar */}
        <View
          style={[
            styles.barWrap,
            Platform.OS === "web"
              ? ({
                  transition: "opacity 0.3s ease-in",
                  opacity: showBar ? 1 : 0,
                } as any)
              : { opacity: showBar ? 1 : 0 },
          ]}
        >
          <Text style={styles.barLabel}>DOCKING SEQUENCE</Text>
          <View style={styles.barOuter}>
            <View style={styles.barContainer}>
              {Array.from({ length: BAR_CELLS }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.barCell,
                    i < filledCells && styles.barCellFilled,
                    Platform.OS === "web" && i < filledCells && i === filledCells - 1
                      ? ({
                          animationName: "eriBarGlow",
                          animationDuration: "0.4s",
                          animationIterationCount: "1",
                        } as any)
                      : {},
                  ]}
                />
              ))}
            </View>
            <Text style={styles.barPct}>{pct}%</Text>
          </View>
          <Text
            style={[
              styles.barStatus,
              Platform.OS === "web"
                ? ({
                    transition: "opacity 0.3s, color 0.3s",
                    opacity: dockComplete ? 1 : 0.6,
                    color: dockComplete ? "#75d879" : colors.textMuted,
                  } as any)
                : { color: dockComplete ? "#75d879" : colors.textMuted },
            ]}
          >
            {dockComplete ? "▸ DOCK COMPLETE · AIRLOCK PRESSURIZED · HATCH OPEN" : "AWAITING DOCK ..."}
          </Text>
        </View>

        {/* Welcome */}
        <View
          style={[
            styles.welcomeWrap,
            Platform.OS === "web"
              ? ({
                  transition: "opacity 0.7s ease-in",
                  opacity: showWelcome ? 1 : 0,
                } as any)
              : { opacity: showWelcome ? 1 : 0 },
          ]}
        >
          <Text style={styles.welcomeText}>欢迎回家</Text>
        </View>
      </View>

      {/* Bottom system ID */}
      <View
        style={[
          styles.bottomBar,
          Platform.OS === "web"
            ? ({
                transition: "opacity 0.4s ease-in",
                opacity: showSignal ? 0.4 : 0,
              } as any)
            : { opacity: showSignal ? 0.4 : 0 },
        ]}
      >
        <Text style={styles.bottomText}>SYS · EH-a · SECTOR 7 · v2.6</Text>
      </View>
    </View>
  );
}

export default memo(WelcomeScreen);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
    backgroundColor: colors.bg,
  },
  sky: {
    ...(StyleSheet.absoluteFill as any),
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? ({
          backgroundImage:
            "radial-gradient(ellipse at 30% 25%, rgba(40,70,160,0.15), transparent 50%), " +
            "radial-gradient(ellipse at 75% 70%, rgba(100,80,180,0.1), transparent 40%), " +
            "radial-gradient(ellipse at 50% 50%, rgba(20,40,80,0.2), transparent 60%)",
        } as any)
      : {}),
  },
  star: {
    position: "absolute" as const,
    backgroundColor: "#f7f5de",
  },
  hud: {
    position: "absolute" as const,
    width: 24,
    height: 24,
    zIndex: 2,
  },
  hudTL: {
    top: 16,
    left: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "rgba(255,223,146,0.3)",
  },
  hudTR: {
    top: 16,
    right: 16,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,223,146,0.3)",
  },
  hudBL: {
    bottom: 16,
    left: 16,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderColor: "rgba(255,223,146,0.3)",
  },
  hudBR: {
    bottom: 16,
    right: 16,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,223,146,0.3)",
  },
  topBar: {
    position: "absolute" as const,
    top: 24,
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: "center" as const,
  },
  topBarText: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "rgba(155,237,255,0.7)",
    letterSpacing: 2,
  },
  center: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 16,
    zIndex: 3,
  },
  titleBlock: {
    alignItems: "center" as const,
    gap: 6,
  },
  titleDeco: {
    fontFamily: fonts.silkscreen,
    fontSize: 8,
    color: "rgba(255,223,146,0.5)",
    letterSpacing: 4,
  },
  titleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minHeight: 32,
  },
  title: {
    fontFamily: fonts.silkscreen,
    fontSize: 22,
    color: "#ffdf92",
    letterSpacing: 6,
    textAlign: "center" as const,
    ...(Platform.OS === "web"
      ? ({
          textShadow:
            "0 0 24px rgba(255,223,146,0.5), 0 0 60px rgba(255,223,146,0.15)",
        } as any)
      : {}),
  },
  caret: {
    width: 2,
    height: 22,
    backgroundColor: "#ffdf92",
    marginLeft: 2,
  },
  subtitleWrap: {
    marginTop: -6,
  },
  subtitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 8,
    color: "rgba(200,216,240,0.55)",
    letterSpacing: 4,
  },
  checksBlock: {
    marginTop: 12,
    width: 260,
    gap: 4,
  },
  checkRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  checkLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "rgba(200,216,240,0.45)",
    letterSpacing: 1,
  },
  checkDots: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "rgba(200,216,240,0.15)",
    letterSpacing: 1,
    flex: 1,
  },
  checkStatus: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    letterSpacing: 1,
  },
  barWrap: {
    alignItems: "center" as const,
    gap: 6,
    marginTop: 8,
  },
  barLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "rgba(255,223,146,0.5)",
    letterSpacing: 3,
  },
  barOuter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  barContainer: {
    width: 200,
    height: 8,
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.25)",
    flexDirection: "row" as const,
    gap: 1.5,
    padding: 1.5,
  },
  barCell: {
    flex: 1,
    backgroundColor: "rgba(255,223,146,0.06)",
  },
  barCellFilled: {
    backgroundColor: "#ffdf92",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 0 4px rgba(255,223,146,0.5)",
        } as any)
      : {}),
  },
  barPct: {
    fontFamily: fonts.silkscreen,
    fontSize: 8,
    color: "rgba(255,223,146,0.6)",
    letterSpacing: 1,
    width: 28,
  },
  barStatus: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    letterSpacing: 2,
  },
  welcomeWrap: {
    marginTop: 12,
  },
  welcomeText: {
    fontFamily: fonts.pixel,
    fontSize: 16,
    color: "#ffdf92",
    letterSpacing: 8,
    ...(Platform.OS === "web"
      ? ({
          textShadow:
            "0 0 20px rgba(255,223,146,0.45), 0 0 50px rgba(255,223,146,0.15)",
        } as any)
      : {}),
  },
  bottomBar: {
    position: "absolute" as const,
    bottom: 24,
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: "center" as const,
  },
  bottomText: {
    fontFamily: fonts.silkscreen,
    fontSize: 6,
    color: "rgba(200,216,240,0.4)",
    letterSpacing: 3,
  },
});
