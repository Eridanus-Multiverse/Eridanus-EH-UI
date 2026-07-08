import { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import { api, ContextUsage } from "../../services/api";

interface CrewUsage { bars: number[]; calls: number; total_tokens: number; avg_latency_ms: number; cache_hit_rate?: number }
interface Props { connected: boolean; variant?: "epsilon" | "cursa"; crewUsage?: CrewUsage | null; crewName?: string }
const W = "rgba(255,255,255,";

function VDivider({ h = 44 }: { h?: number }) {
  return (
    <svg width="7" height={h} viewBox={`0 0 7 ${h}`} fill="none" style={{ margin: "0 1px", flexShrink: 0 }}>
      <line x1="3.5" y1="0" x2="3.5" y2={h} stroke={`${W}0.55)`} strokeWidth="1.2" strokeDasharray="3 2" />
      <line x1="1" y1="0" x2="6" y2="0" stroke={`${W}0.75)`} strokeWidth="1.5" />
      <line x1="1" y1={h} x2="6" y2={h} stroke={`${W}0.75)`} strokeWidth="1.5" />
      <rect x="2" y={h / 2 - 2} width="3" height="4" fill={`${W}0.45)`} />
    </svg>
  );
}

export default function HudHeader({ connected, variant = "epsilon", crewUsage = null, crewName = "" }: Props) {
  const theme = useThemeTokens();
  const isEH = theme.key === "eventHorizon";
  const isCursa = variant === "cursa";
  const [usage, setUsage] = useState<ContextUsage | null>(null);

  const loadUsage = useCallback(async () => {
    try { setUsage(await api.getContextUsage()); } catch {}
  }, []);

  useEffect(() => {
    if (!isEH || isCursa) return; // CTX usage is Epsilon's — no fake numbers for Cursa
    loadUsage();
    const i = setInterval(loadUsage, 30_000);
    return () => clearInterval(i);
  }, [isEH, isCursa, loadUsage]);

  if (!isEH || Platform.OS !== "web") return null;

  const ratio = usage?.ratio ?? 0;
  const tokens = usage?.estimated_tokens ?? 0;
  const budget = usage?.token_budget ?? 1000000;
  const turns = usage?.turn_count ?? 0;
  const band = usage?.threshold_band ?? "safe";
  const pct = Math.round(ratio * 100);
  const tokensK = Math.round(tokens / 1000);
  const budgetK = Math.round(budget / 1000);
  const bc = band === "safe" ? "#78c878" : band === "soft" ? "#e6b450" : "#c85050";

  return (
    <View style={{ paddingHorizontal: 10, overflow: "visible" as const, zIndex: 10 }}>
      <View style={S.outer}>
      <div style={{ display: "flex", alignItems: "stretch", height: 48 }}>

        {/* Target */}
        <div style={{ width: "18%", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <svg width="34" height="34" viewBox="0 0 52 52" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="26" cy="26" r="22" stroke={`${W}0.5)`} strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx="26" cy="26" r="14" stroke={`${W}0.65)`} strokeWidth="1.5" />
            <circle cx="26" cy="26" r="7" stroke={`${W}0.8)`} strokeWidth="1.5" />
            <line x1="2" y1="26" x2="16" y2="26" stroke={`${W}0.6)`} strokeWidth="1.5" />
            <line x1="36" y1="26" x2="50" y2="26" stroke={`${W}0.6)`} strokeWidth="1.5" />
            <line x1="26" y1="2" x2="26" y2="16" stroke={`${W}0.6)`} strokeWidth="1.5" />
            <line x1="26" y1="36" x2="26" y2="50" stroke={`${W}0.6)`} strokeWidth="1.5" />
            <path d="M11 19 A17 17 0 0 1 19 11" stroke={`${W}0.7)`} strokeWidth="1.8" />
            <path d="M33 11 A17 17 0 0 1 41 19" stroke={`${W}0.7)`} strokeWidth="1.8" />
            <path d="M41 33 A17 17 0 0 1 33 41" stroke={`${W}0.7)`} strokeWidth="1.8" />
            <path d="M19 41 A17 17 0 0 1 11 33" stroke={`${W}0.7)`} strokeWidth="1.8" />
            <circle cx="26" cy="26" r="3" fill={connected ? "#78c878" : "#c85050"} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: `${W}0.55)`, letterSpacing: 1 }}>SYS</span>
            <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: connected ? "#78c878" : "#c85050" }}>
              {connected ? "LNK" : "IDL"}
            </span>
          </div>
        </div>

        <VDivider h={44} />

        {isCursa && crewUsage ? (
          /* CREW usage — REAL bars: each bar is output_tokens of one real call
             (2026-07-07 Eri's idea: decorative HUD promoted to live gauge) */
          (() => {
            const bars = crewUsage.bars.length ? crewUsage.bars : [0];
            const maxBar = Math.max(...bars, 1);
            const pad = Array.from({ length: Math.max(0, 28 - bars.length) });
            return (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "3px 8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: `${W}0.65)`, letterSpacing: 2 }}>LOAD</span>
                  <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: "rgba(96,168,255,0.85)", border: "1px solid rgba(96,168,255,0.4)", padding: "1px 5px", letterSpacing: 1 }}>{(crewName || "CREW").toUpperCase().slice(0, 10)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", flex: 1, gap: 1 }}>
                  {pad.map((_, i) => (<div key={`p${i}`} style={{ flex: 1, height: "1px", backgroundColor: `${W}0.06)` }} />))}
                  {bars.map((v, i) => {
                    const h = Math.max(6, Math.round((v / maxBar) * 90));
                    return (<div key={i} style={{ flex: 1, height: `${h}%`, backgroundColor: connected ? `${W}0.7)` : `${W}0.2)` }} />);
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: `${W}0.5)` }}>7D:{crewUsage.calls}</span>
                  <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: (crewUsage.cache_hit_rate || 0) > 0 ? "#78c878" : `${W}0.4)` }}>HIT:{Math.round((crewUsage.cache_hit_rate || 0) * 100)}%</span>
                  <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: `${W}0.5)` }}>LAT:{Math.round((crewUsage.avg_latency_ms || 0) / 100) / 10}S</span>
                </div>
              </div>
            );
          })()
        ) : isCursa ? (
          /* COMM channel display — decorative bars, no fake metrics */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "3px 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
              <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: `${W}0.65)`, letterSpacing: 2 }}>COMM</span>
              <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: `${W}0.6)`, border: `1px solid ${W}0.3)`, padding: "1px 5px", letterSpacing: 1 }}>UNIT-B</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", flex: 1, gap: 1 }}>
              {Array.from({ length: 28 }).map((_, i) => {
                const h = 20 + Math.abs(Math.sin(i * 2.7 + 1.3)) * 55;
                return (<div key={i} style={{ flex: 1, height: `${h.toFixed(0)}%`, backgroundColor: connected ? `${W}0.35)` : `${W}0.1)` }} />);
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: `${W}0.5)` }}>CHN:BETA</span>
              <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: `${W}0.5)` }}>CURSA</span>
            </div>
          </div>
        ) : (
          /* CTX waveform */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "3px 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
              <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: `${W}0.65)`, letterSpacing: 2 }}>CTX</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: bc, border: `1px solid ${bc}50`, padding: "1px 5px", letterSpacing: 1 }}>{band.toUpperCase()}</span>
                <span style={{ fontFamily: "Silkscreen", fontSize: 13, color: band === "safe" ? "#fff" : bc }}>{pct}<span style={{ fontSize: 8, opacity: 0.4 }}>%</span></span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", flex: 1, gap: 1 }}>
              {Array.from({ length: 28 }).map((_, i) => {
                const filled = i < Math.floor(pct / 3.6);
                const crit = i >= 20;
                return (<div key={i} style={{ flex: 1, height: filled ? "75%" : "1px", backgroundColor: filled ? (crit ? "#c85050" : `${W}0.8)`) : `${W}0.06)`, transition: "height 0.3s" }} />);
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: `${W}0.5)` }}>{tokensK}K/{budgetK}K</span>
              <span style={{ fontFamily: "Silkscreen", fontSize: 6, color: `${W}0.5)` }}>T:{turns}</span>
            </div>
          </div>
        )}

        <VDivider h={44} />

        {/* Metrics */}
        <div style={{ width: "22%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "2px 8px", gap: 0 }}>
          {(isCursa && crewUsage ? [
            { k: "TKN", v: crewUsage.total_tokens >= 1000 ? `${Math.round(crewUsage.total_tokens / 1000)}K` : String(crewUsage.total_tokens), c: "#ddd" },
            { k: "CALL", v: String(crewUsage.calls), c: "#ddd" },
            { k: "LNK", v: connected ? "UP" : "DN", c: connected ? "#78c878" : "#c85050" },
          ] : isCursa ? [
            { k: "CHN", v: "UNIT-B", c: "#ddd" },
            { k: "MOD", v: "CURSA", c: "#ddd" },
            { k: "LNK", v: connected ? "UP" : "DN", c: connected ? "#78c878" : "#c85050" },
          ] : [
            { k: "TKN", v: `${tokensK}K`, c: "#ddd" },
            { k: "BND", v: band.toUpperCase(), c: bc },
            { k: "LNK", v: connected ? "UP" : "DN", c: connected ? "#78c878" : "#c85050" },
          ]).map((m, i, arr) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: `${W}0.55)` }}>{m.k}</span>
                <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: m.c }}>{m.v}</span>
              </div>
              {i < arr.length - 1 && <div style={{ height: 1, backgroundColor: `${W}0.15)`, marginTop: 1, marginBottom: 1 }} />}
            </div>
          ))}
        </div>
      </div>

      </View>
      {/* Bottom separator — black fill above the line, transparent below */}
      <View style={{ position: "absolute" as const, bottom: -10, left: 0, right: 0, height: 12, zIndex: 100 }} pointerEvents="none">
        <svg width="100%" height="12" viewBox="0 0 360 12" preserveAspectRatio="none">
          <path d="M0 0 L360 0 L360 6 L285 6 L263 10 L97 10 L75 6 L0 6 Z" fill="#000" />
          <path d="M0 3 L80 3 L100 8 L260 8 L280 3 L360 3" stroke={`${W}0.6)`} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
          <path d="M0 6 L75 6 L97 10 L263 10 L285 6 L360 6" stroke={`${W}0.45)`} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  outer: {
    backgroundColor: "#000",
    paddingTop: 2,
    paddingBottom: 0,
  },
});
