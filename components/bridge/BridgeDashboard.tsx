import React, { Component, useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { api, BridgeDashboard as DashboardData, CompanionStatus, PatrolPayload } from "../../services/api";
import { useConnection } from "../../stores/connectionStore";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import UsageGauge from "./UsageGauge";

const W = "rgba(255,255,255,";

const glowBorder = Platform.OS === "web"
  ? { boxShadow: "0 0 18px rgba(200,216,240,0.2), 0 0 5px rgba(255,223,146,0.16), inset 0 0 18px rgba(200,216,240,0.13), inset 0 0 5px rgba(255,223,146,0.1), 3px 3px 0 #000" } as any : {};

class DashboardErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface CrewEntry {
  id: string;
  name: string;
  tag: string;
  status: string;
}

function crewEntry(c: CompanionStatus): CrewEntry {
  if (c.id === "tmux.horizon-chat") return { id: c.id, name: "UNIT-A", tag: "A Eri", status: c.status };
  if (c.id === "tmux.codex") return { id: c.id, name: "Cursa", tag: "B Eri", status: c.status };
  if (c.id === "bot.epsilon") return { id: c.id, name: "A TG-Link", tag: "TGBT-A", status: c.status };
  if (c.id === "bot.cursa") return { id: c.id, name: "B TG-Link", tag: "TGBT-B", status: c.status };
  return { id: c.id, name: c.label, tag: "—", status: c.status };
}

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  if (h < 24) return `${h}h ${Math.floor((seconds % 3600) / 60)}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function starDate(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return `${now.getFullYear()}.${String(dayOfYear).padStart(3, "0")}`;
}

function pickCrewForDisplay(crew: CompanionStatus[]): CompanionStatus[] {
  const ids = ["tmux.horizon-chat", "tmux.codex", "bot.epsilon", "bot.cursa"];
  const picked: CompanionStatus[] = [];
  for (const id of ids) {
    const found = crew.find((c) => c.id === id);
    if (found) picked.push(found);
  }
  return picked;
}

function FleetDot({ entry }: { entry: CrewEntry }) {
  const online = entry.status === "online";
  const dotColor = online ? "#75d879" : entry.status === "warning" ? "#ece4a4" : "#e05d5d";
  const dotGlow = online && Platform.OS === "web"
    ? { boxShadow: `0 0 5px ${dotColor}` } as any : {};
  return (
    <View style={fl.item}>
      <View style={[fl.dot, { backgroundColor: dotColor }, dotGlow]} />
      <Text style={[fl.name, online && fl.nameOn]}>{entry.name}</Text>
      <Text style={fl.tag}>{entry.tag}</Text>
    </View>
  );
}

export default function BridgeDashboard() {
  return (
    <DashboardErrorBoundary>
      <BridgeDashboardInner />
    </DashboardErrorBoundary>
  );
}

// ============ Event Horizon variant — mecha HUD panel ============

function ehCountdown(resetIso?: string): string {
  if (!resetIso) return "";
  const diff = new Date(resetIso).getTime() - Date.now();
  if (diff <= 0) return "RST";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}D ${h % 24}H`;
  return `${h}H ${m}M`;
}

/** uppercase ASCII only — String.toUpperCase turns A/B into Greek capitals that render as E/B */
function ehUpper(s: string): string {
  return s.replace(/[a-z]/g, (c) => c.toUpperCase());
}

/** Poster blue — the saturated pixel-poster blue, EH's only cool accent besides ice-blue. */
export const EH_BLUE = "rgba(96,168,255,0.95)";
/** EH semantic accents — green/gold were scattered as literals across 5 files. */
export const EH_GREEN = "#78c878";
export const EH_GOLD = "#e6b450";
/** The DM-bubble diagonal corner cut, shared by chat/group/voice surfaces. */
export const EH_BUBBLE_CUT = "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)";

function ehTier(pct: number): string {
  if (pct >= 85) return "#c85050";
  if (pct >= 60) return "#e6b450";
  return EH_BLUE;
}

function EhSegBar({ pct }: { pct: number }) {
  const blocks = 15;
  const active = Math.round((pct / 100) * blocks);
  const color = ehTier(pct);
  return (
    <div style={{ flex: 1, display: "flex", gap: 1.5, height: 10, border: `1px solid ${W}0.25)`, background: "#000", padding: 1, alignItems: "stretch" }}>
      {Array.from({ length: blocks }).map((_, i) => (
        <div key={i} style={{ flex: 1, backgroundColor: i < active ? color : `${W}0.05)` }} />
      ))}
    </div>
  );
}

function EhEngineRow({ tag, pct, reset }: { tag: string; pct?: number; reset?: string }) {
  const p = pct ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${W}0.55)`, width: 18 }}>{tag}</span>
      <EhSegBar pct={p} />
      <span style={{ fontFamily: fonts.pixel, fontSize: 10, color: pct == null ? `${W}0.4)` : ehTier(p), width: 34, textAlign: "right" }}>{pct == null ? "—" : `${p}%`}</span>
      <span style={{ fontFamily: fonts.pixel, fontSize: 7.5, color: `${W}0.5)`, width: 46, textAlign: "right" }}>{ehCountdown(reset)}</span>
    </div>
  );
}

function EhEngine({ name, available, offlineText, primary, secondary }: {
  name: string;
  available: boolean;
  offlineText: string;
  primary?: { utilization: number; resets_at: string };
  secondary?: { utilization: number; resets_at: string };
}) {
  const pct = primary?.utilization ?? 0;
  const status = !available ? offlineText : pct >= 85 ? "COIL CRIT" : pct >= 60 ? "ELEVATED" : "NOMINAL";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: fonts.pixel, fontSize: 8.5, color: `${W}0.75)`, letterSpacing: 1.5 }}>{name}</span>
        <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: !available ? `${W}0.4)` : pct >= 85 ? "#c85050" : "#fff" }}>{status}</span>
      </div>
      {available ? (
        <>
          <EhEngineRow tag="5H" pct={primary?.utilization} reset={primary?.resets_at} />
          <EhEngineRow tag="7D" pct={secondary?.utilization} reset={secondary?.resets_at} />
        </>
      ) : (
        <div style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${W}0.3)`, letterSpacing: 2, padding: "3px 0" }}>· · · NO TELEMETRY · · ·</div>
      )}
    </div>
  );
}

function EhSectionLine({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 0 7px" }}>
      <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${W}0.5)` }}>▸</span>
      <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${W}0.75)`, letterSpacing: 2 }}>{label}</span>
      <div style={{ flex: 1, height: 1, backgroundColor: `${W}0.2)` }} />
      <svg width="26" height="7" viewBox="0 0 26 7">
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={3 + i * 6} y1="7" x2={8 + i * 6} y2="0" stroke={`${W}0.5)`} strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}

/** Corner-only L brackets — the fingerprint-frame style */
function EhBrackets() {
  const c = `1px solid ${W}0.65)`;
  const b = { position: "absolute" as const, width: 8, height: 8 };
  return (
    <>
      <div style={{ ...b, top: 0, left: 0, borderTop: c, borderLeft: c }} />
      <div style={{ ...b, top: 0, right: 0, borderTop: c, borderRight: c }} />
      <div style={{ ...b, bottom: 0, left: 0, borderBottom: c, borderLeft: c }} />
      <div style={{ ...b, bottom: 0, right: 0, borderBottom: c, borderRight: c }} />
    </>
  );
}

function EhFleetCell({ entry, index }: { entry: CrewEntry; index: number }) {
  const online = entry.status === "online";
  const sc = online ? "#78c878" : entry.status === "warning" ? "#e6b450" : "#c85050";
  const sl = online ? "ONLINE" : entry.status === "warning" ? "WARN" : "OFFLINE";
  return (
    <div style={{ width: "calc(50% - 2px)", boxSizing: "border-box", border: `1px solid ${W}0.25)`, padding: "5px 7px", display: "flex", flexDirection: "column", gap: 3, background: `${W}0.02)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: fonts.pixel, fontSize: 9.5, color: online ? "#fff" : `${W}0.45)` }}>{ehUpper(entry.name)}</span>
        <span style={{ fontFamily: fonts.pixel, fontSize: 6.5, color: `${W}0.4)` }}>REG:{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: fonts.pixel, fontSize: 7.5, color: `${W}0.5)`, letterSpacing: 1 }}>{ehUpper(entry.tag)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 5, height: 5, backgroundColor: sc, display: "inline-block" }} />
          <span style={{ fontFamily: fonts.pixel, fontSize: 7.5, color: sc }}>{sl}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 6 }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: `${25 + Math.abs(Math.sin(i * 1.9 + index * 2.3)) * 75}%`, backgroundColor: online ? `${W}0.3)` : `${W}0.07)` }} />
        ))}
      </div>
    </div>
  );
}

export function ehHexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function EhSchematic() {
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", background: "#000", padding: "6px 0" }}>
      <EhBrackets />
      <svg width="210" height="72" viewBox="0 0 210 80" fill="none" stroke={`${W}0.65)`} strokeWidth="1.2">
        {/* hex cluster backdrop, lower-left */}
        <polygon points={ehHexPoints(30, 62, 9)} stroke={`${W}0.14)`} />
        <polygon points={ehHexPoints(45.5, 71, 9)} stroke={`${W}0.1)`} />
        <polygon points={ehHexPoints(45.5, 53, 9)} stroke={`${W}0.08)`} />
        {/* ship hull */}
        <path d="M105 10 L125 40 L168 45 L125 50 L105 70 L85 50 L42 45 L85 40 Z" strokeDasharray="2 2" />
        <line x1="105" y1="4" x2="105" y2="76" stroke={`${W}0.14)`} />
        <line x1="18" y1="45" x2="192" y2="45" stroke={`${W}0.14)`} strokeDasharray="4 4" />
        {/* hexagonal targeting reticle */}
        <polygon points={ehHexPoints(105, 45, 31)} stroke={`${W}0.3)`} />
        <polygon points={ehHexPoints(105, 45, 22)} stroke={`${W}0.15)`} strokeDasharray="3 3" />
        <path d="M100 70 L105 77 L110 70 Z" stroke="#fff" strokeWidth="1.5" />
        <circle cx="105" cy="45" r="3" fill={`${W}0.9)`} stroke="none">
          <animate attributeName="opacity" values="1;0.25;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <text x="140" y="24" fill={`${W}0.85)`} style={{ fontFamily: fonts.pixel, fontSize: 7 }}>TARGET LOCKED</text>
        <text x="20" y="20" fill={`${W}0.45)`} style={{ fontFamily: fonts.pixel, fontSize: 6.5 }}>A-CLASS</text>
      </svg>
    </div>
  );
}

/** Standard panel shell — notched top edge, three-side border, bevelled black title plate.
 *  flip mirrors the notch/bevel to the LEFT side so stacked panels don't look cloned. */
function EhPanelShell({ title, flip, children }: { title: string; flip?: boolean; children: React.ReactNode }) {
  const edge = `${W}0.7)`;
  return (
    <View style={{ position: "relative" as const }}>
      <div style={{ position: "relative", background: "#000", borderLeft: `1px solid ${W}0.55)`, borderRight: `1px solid ${W}0.55)`, borderBottom: `1px solid ${W}0.55)`, paddingBottom: 10 }}>

        {/* Notched top edge — straight run, 45° step down on one side (drawn, not masked) */}
        {flip ? (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 12, pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: 9, left: 0, width: 84, height: 1, background: edge }} />
            <svg style={{ position: "absolute", top: 0, left: 83 }} width="11" height="10"><line x1="0.5" y1="10" x2="10.5" y2="0" stroke={edge} strokeWidth="1.2" /></svg>
            <div style={{ position: "absolute", top: 0, left: 94, right: 0, height: 1, background: edge }} />
            {/* hide the stray borderLeft stub above the stepped-down run */}
            <div style={{ position: "absolute", top: 0, left: -1, width: 1, height: 9, background: "#000" }} />
          </div>
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 12, pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 94, height: 1, background: edge }} />
            <svg style={{ position: "absolute", top: 0, right: 83 }} width="11" height="10"><line x1="0.5" y1="0" x2="10.5" y2="10" stroke={edge} strokeWidth="1.2" /></svg>
            <div style={{ position: "absolute", top: 9, right: 0, width: 84, height: 1, background: edge }} />
            {/* hide the stray borderRight stub above the stepped-down run */}
            <div style={{ position: "absolute", top: 0, right: -1, width: 1, height: 9, background: "#000" }} />
          </div>
        )}

        {/* Title bar — black plate with a bright white frame, bevelled end echoing the notch side */}
        <div style={{ margin: "18px 10px 0", position: "relative", display: "flex", alignItems: "center", gap: 8, padding: flip ? "6px 11px 6px 26px" : "6px 26px 6px 11px", borderLeft: flip ? "none" : `1px solid ${W}0.75)`, borderRight: flip ? `1px solid ${W}0.75)` : "none", borderBottom: `1px solid ${W}0.75)` }}>
          {/* top edge stops where the bevel starts */}
          <div style={{ position: "absolute", top: 0, left: flip ? 12 : -1, right: flip ? -1 : 12, height: 1, background: `${W}0.75)` }} />
          {/* bevelled end, drawn */}
          <svg style={{ position: "absolute", top: 0, left: flip ? -1 : undefined, right: flip ? undefined : -1, height: "calc(100% + 1px)" }} width="13" viewBox="0 0 13 30" preserveAspectRatio="none">
            {flip
              ? <line x1="12.5" y1="0" x2="0.5" y2="30" stroke={`${W}0.75)`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              : <line x1="0.5" y1="0" x2="12.5" y2="30" stroke={`${W}0.75)`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
          </svg>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <polygon points={ehHexPoints(12, 12, 10)} stroke="#fff" strokeWidth="1.8" />
            <polygon points={ehHexPoints(12, 12, 4.5)} fill="#fff" />
          </svg>
          <span style={{ fontFamily: fonts.pixel, fontSize: 14, color: "#fff", letterSpacing: 2.5, fontWeight: 700 }}>{title}</span>
          <span style={{ flex: 1 }} />
          <svg width="30" height="9" viewBox="0 0 30 9">
            {[0, 1, 2, 3].map((i) => (
              flip
                ? <line key={i} x1={10 + i * 7} y1="9" x2={4 + i * 7} y2="0" stroke={`${W}0.8)`} strokeWidth="1.8" />
                : <line key={i} x1={4 + i * 7} y1="9" x2={10 + i * 7} y2="0" stroke={`${W}0.8)`} strokeWidth="1.8" />
            ))}
          </svg>
        </div>

        {children}
      </div>
    </View>
  );
}

/** Status line under the title bar — left caption, 3 signal ticks, status word. */
function EhStatusLine({ text, lit, tickColor, label, labelColor }: {
  text: string;
  lit: number;
  tickColor: string;
  label: string;
  labelColor: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "5px 10px 0" }}>
      <span style={{ fontFamily: fonts.pixel, fontSize: 7.5, color: `${W}0.55)`, letterSpacing: 2 }}>{text}</span>
      <span style={{ display: "flex", gap: 2, alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 4, height: 7, display: "inline-block", background: i < lit ? tickColor : `${W}0.12)` }} />
        ))}
        <span style={{ fontFamily: fonts.pixel, fontSize: 7.5, color: labelColor, marginLeft: 3 }}>{label}</span>
      </span>
    </div>
  );
}

/** TOPIC footer strip, MEDICAL HUD style. */
function EhTopicStrip({ topic, lit }: { topic: string; lit: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: `1px solid ${W}0.25)`, marginTop: 10, paddingTop: 6 }}>
      <span style={{ fontFamily: fonts.pixel, fontSize: 7.5, color: `${W}0.7)`, letterSpacing: 1.5 }}>{topic}</span>
      <span style={{ flex: 1 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ width: 5, height: 5, display: "inline-block", background: i < lit ? `${W}0.7)` : `${W}0.15)` }} />
      ))}
    </div>
  );
}

function EhBridgePanel({ data, error, entries, onlineCount }: {
  data: DashboardData | null;
  error: boolean;
  entries: CrewEntry[];
  onlineCount: number;
}) {
  const claude = data?.claude_usage;
  const codex = data?.codex_usage;
  const ship = data?.ship;
  const allOnline = entries.length > 0 && onlineCount === entries.length;
  return (
    <EhPanelShell title="BRIDGE_SYSTEMS">
      <EhStatusLine
        text={allOnline ? "FLEET NOMINAL · ALL SYSTEMS GO" : "FLEET CHECK · DIAGNOSTICS RUNNING"}
        lit={allOnline ? 3 : 1}
        tickColor="#78c878"
        label={allOnline ? "SYS OK" : "CHECK"}
        labelColor={allOnline ? "#78c878" : "#e6b450"}
      />

          <div style={{ padding: "0 10px" }}>

        {error && !data && (
          <div style={{ textAlign: "center", fontFamily: fonts.pixel, fontSize: 9, color: `${W}0.4)`, letterSpacing: 3, padding: "14px 0" }}>· · · SIGNAL LOST · · ·</div>
        )}

        {data && (
          <>
            <EhSectionLine label="FLIGHT_PROPULSION_METRIC" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <EhEngine
                name="CLAUDE COGNITIVE CORE"
                available={!!claude?.available}
                offlineText={claude?.status === 401 ? "AUTH REQ" : "OFFLINE"}
                primary={claude?.five_hour}
                secondary={claude?.seven_day}
              />
              <EhEngine
                name="CODEX REACTION CORE"
                available={!!codex?.available}
                offlineText={codex?.status === 401 ? "AUTH REQ" : "OFFLINE"}
                primary={codex?.primary_window}
                secondary={codex?.secondary_window}
              />
            </div>

            {/* nav readout grid */}
            <div style={{ display: "flex", border: `1px solid ${W}0.2)`, marginTop: 10, background: "#000" }}>
              {[
                { k: "STARDATE", v: starDate() },
                { k: "UPTIME", v: ship ? formatUptime(ship.system_uptime_seconds ?? ship.uptime_seconds) : "—" },
                { k: "MEMORIES", v: ship ? `${ship.memories_count} // SYS` : "—" },
              ].map((c, i) => (
                <div key={c.k} style={{ flex: 1, textAlign: "center", padding: "6px 0 5px", borderLeft: i > 0 ? `1px solid ${W}0.15)` : "none" }}>
                  <div style={{ fontFamily: fonts.pixel, fontSize: 7, color: `${W}0.55)`, letterSpacing: 1.5 }}>{c.k}</div>
                  <div style={{ fontFamily: fonts.pixel, fontSize: 12, color: "#fff", marginTop: 2 }}>{c.v}</div>
                </div>
              ))}
            </div>

            <EhSectionLine label="SPACECRAFT SCHEMATIC // TOP_VIEW" />
            <EhSchematic />

            <EhSectionLine label={`FLEET REGISTRY · ${onlineCount}/${entries.length} DOCKED`} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {entries.map((e, i) => (
                <EhFleetCell key={e.id} entry={e} index={i} />
              ))}
            </div>

            <EhTopicStrip topic="TOPIC : EH FLEET" lit={onlineCount + 1} />
          </>
        )}
          </div>
    </EhPanelShell>
  );
}

// ─── EH Hull Scan (patrol) panel ───

const EH_PATROL_TONE: Record<string, string> = { ok: "#78c878", watch: "#e6b450", warning: "#e6b450", critical: "#c85050" };

function ehPatrolAge(seconds: number | null | undefined): string {
  if (seconds == null) return "尚未巡逻";
  if (seconds < 60) return "刚刚";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

/** semantic-colored value parser for patrol highlight strings like "disk 42% used" */
function ehParseHighlight(h: string): { label: string; value: string; color: string } {
  const m = h.match(/^(.+?)\s+([\d.]+%?\s*.*)$/);
  const label = m ? m[1] : h;
  const value = m ? m[2] : "";
  let color = "#fff";
  if (/ok$/i.test(value)) color = "#78c878";
  else if (/available/i.test(label) || /memory/i.test(label)) {
    const pct = parseFloat(value);
    color = pct > 50 ? "#78c878" : pct > 20 ? "#e6b450" : "#c85050";
  } else if (/disk/i.test(label) || /used/i.test(value)) {
    const pct = parseFloat(value);
    color = pct < 70 ? "#78c878" : pct < 85 ? "#e6b450" : "#c85050";
  } else if (/load/i.test(label)) {
    const val = parseFloat(value);
    color = val < 1 ? "#78c878" : val < 2 ? "#e6b450" : "#c85050";
  }
  return { label, value, color };
}

export function EhPatrolPanel({ payload, loading, running, error, onRun }: {
  payload: PatrolPayload | null;
  loading: boolean;
  running: boolean;
  error: string;
  onRun: () => void;
}) {
  const report = payload?.report;
  const status = report?.status || (payload?.available ? "ok" : "unknown");
  const tone = EH_PATROL_TONE[status] || `${W}0.5)`;
  const issues = report?.issues || [];
  const highlights = (report?.highlights || []).slice(0, 6).map(ehParseHighlight);
  const statusLabel = status === "ok" ? "ALL CLEAR" : status === "watch" ? "WATCH" : status === "warning" ? "ALERT" : status === "critical" ? "CRITICAL" : "STANDBY";
  const lit = status === "ok" ? 3 : status === "watch" ? 2 : status === "warning" || status === "critical" ? 1 : 0;
  const busy = running || loading;

  return (
    <EhPanelShell title="HULL_SCAN" flip>
      <EhStatusLine text="B ERI · 航路巡检" lit={lit} tickColor={tone} label={statusLabel} labelColor={tone} />

      <div style={{ padding: "0 10px" }}>
        <EhSectionLine label="SCAN_REPORT // INTEGRITY" />

        <div style={{ fontFamily: fonts.pixel, fontSize: 12, color: `${W}0.85)`, lineHeight: 1.7 }}>
          {loading && !report ? "信号接收中..." : report?.summary || "尚未收到巡检报告。"}
        </div>

        {issues.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {issues.slice(0, 3).map((issue: any, i: number) => {
              const lc = String(issue.level).toLowerCase() === "critical" ? "#c85050" : "#e6b450";
              return (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", border: `1px solid ${W}0.2)`, borderLeft: `3px solid ${lc}`, padding: "4px 7px", background: `${W}0.02)` }}>
                  <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: lc, letterSpacing: 1, whiteSpace: "nowrap", paddingTop: 2 }}>{ehUpper(String(issue.level))}</span>
                  <span style={{ fontFamily: fonts.pixel, fontSize: 11, color: `${W}0.8)`, lineHeight: 1.5 }}>{issue.title}: {issue.detail}</span>
                </div>
              );
            })}
          </div>
        )}

        {issues.length === 0 && highlights.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {highlights.map((p, i) => (
              <div key={i} style={{ width: "calc(33.33% - 3px)", boxSizing: "border-box", border: `1px solid ${W}0.2)`, background: "#000", textAlign: "center", padding: "6px 2px 5px" }}>
                <div style={{ fontFamily: fonts.pixel, fontSize: 12, color: p.color }}>{p.value || "—"}</div>
                <div style={{ fontFamily: fonts.pixel, fontSize: 7, color: `${W}0.55)`, letterSpacing: 1, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{ehUpper(p.label)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ fontFamily: fonts.pixel, fontSize: 9, color: `${W}0.5)` }}>
            最近扫描：{ehPatrolAge(payload?.age_seconds)}{payload?.stale ? " · 信号过期" : ""}
          </span>
          <div
            onClick={busy ? undefined : onRun}
            style={{ fontFamily: fonts.pixel, fontSize: 9.5, color: "#fff", letterSpacing: 1.5, border: `1px solid ${W}0.7)`, background: "#000", padding: "5px 12px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.4 : 1, userSelect: "none" as const }}
          >
            {running ? "▸ SCANNING..." : "▸ RUN SCAN"}
          </div>
        </div>

        {error ? <div style={{ fontFamily: fonts.pixel, fontSize: 9, color: "#c85050", marginTop: 6 }}>{error}</div> : null}

        <EhTopicStrip topic="TOPIC : HULL INTEGRITY" lit={lit + 2} />
      </div>
    </EhPanelShell>
  );
}

// ─── EH page header (top HUD) ───

export function EhBridgeHeader({ paddingTop, label, title, countText, onBack, backLabel = "BRIDGE" }: {
  paddingTop: number;
  label: string;
  title: string;
  countText: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div style={{ position: "relative", zIndex: 2, background: "#000", padding: `${paddingTop + 6}px 14px 0` }}>
      {/* status scanline */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${W}0.65)`, letterSpacing: 2 }}>{label}</span>
        <svg width="6" height="6"><rect width="6" height="6" fill="#78c878"><animate attributeName="opacity" values="1;0.2;1" dur="2.5s" repeatCount="indefinite" /></rect></svg>
        <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${W}0.65)`, letterSpacing: 2 }}>ACTIVE</span>
        <div style={{ flex: 1, height: 1, background: `${W}0.15)` }} />
        <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${W}0.65)`, letterSpacing: 2 }}>{countText}</span>
      </div>
      {/* title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10 }}>
        {onBack ? (
          <div
            onClick={onBack}
            style={{ border: `1px solid ${W}0.55)`, padding: "3px 8px 3px 7px", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 5 }}
          >
            <span style={{ fontFamily: fonts.pixel, fontSize: 11, color: "#fff", lineHeight: "12px" }}>‹</span>
            <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: `${W}0.75)`, letterSpacing: 1.5, lineHeight: "9px" }}>{backLabel}</span>
          </div>
        ) : null}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <polygon points={ehHexPoints(12, 12, 10)} stroke="#fff" strokeWidth="1.8" />
          <polygon points={ehHexPoints(12, 12, 4.5)} fill="#fff" />
        </svg>
        <span style={{ fontFamily: fonts.pixel, fontSize: 21, color: "#fff", letterSpacing: 4, fontWeight: 700 }}>{title}</span>
        <span style={{ flex: 1 }} />
        <svg width="38" height="11" viewBox="0 0 38 11">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={4 + i * 7} y1="11" x2={11 + i * 7} y2="0" stroke={`${W}0.65)`} strokeWidth="1.5" />
          ))}
        </svg>
      </div>
      {/* notched divider — flat run with a shallow trapezoid groove near the right */}
      <svg width="100%" height="11" viewBox="0 0 360 11" preserveAspectRatio="none" style={{ display: "block", marginTop: 8 }}>
        <path d="M0 1.5 L216 1.5 L228 8.5 L318 8.5 L330 1.5 L360 1.5" stroke={`${W}0.75)`} strokeWidth="1.2" fill="none" />
      </svg>
    </div>
  );
}

// ─── EH entry cards (COMM / CMD) ───

/** Compact tappable entry card — bevelled top corner (right for comm, left for cmd, echoing
 *  the panel-shell flip pairing), tag plate, pixel title, blue meta line. */
export function EhEntryCard({ tag, name, desc, meta, count, variant, onPress }: {
  tag: string;
  name: string;
  desc: string;
  meta: string;
  count?: number;
  variant: "comm" | "cmd" | "audit";
  onPress: () => void;
}) {
  const flip = variant === "cmd";
  const edge = `${W}0.55)`;
  return (
    <View style={{ position: "relative" as const }}>
      <div
        onClick={onPress}
        style={{ position: "relative", background: "#000", border: `1px solid ${edge}`, padding: "10px 12px 9px", cursor: "pointer", userSelect: "none" }}
      >
        {/* bevelled corner — mask the square corner, draw the 45° cut */}
        <div style={{ position: "absolute", top: -1, ...(flip ? { left: -1 } : { right: -1 }), width: 14, height: 14, background: "#000" }} />
        <svg style={{ position: "absolute", top: -1, ...(flip ? { left: -1 } : { right: -1 }) }} width="14" height="14">
          {flip
            ? <line x1="13.5" y1="0.5" x2="0.5" y2="13.5" stroke={edge} strokeWidth="1.2" />
            : <line x1="0.5" y1="0.5" x2="13.5" y2="13.5" stroke={edge} strokeWidth="1.2" />}
        </svg>

        <div style={{ display: "flex", gap: 12 }}>
          {/* left column: tag + name / desc / meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: fonts.pixel, fontSize: 9, color: "#fff", letterSpacing: 1.5, border: `1px solid ${W}0.75)`, padding: "2px 6px", fontWeight: 700 }}>{tag}</span>
              <span style={{ fontFamily: fonts.pixel, fontSize: 15, color: "#fff", letterSpacing: 2, fontWeight: 700 }}>{name}</span>
            </div>
            <div style={{ fontFamily: fonts.pixel, fontSize: 11, color: `${W}0.6)`, marginTop: 7, letterSpacing: 1 }}>{desc}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <span style={{ fontFamily: fonts.pixel, fontSize: 8, color: EH_BLUE, letterSpacing: 1.5 }}>{meta}</span>
              <span style={{ flex: 1 }} />
            </div>
          </div>

          {/* right column: channel lamps (comm) / chevron stack (cmd) */}
          {variant === "comm" ? (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, paddingLeft: 12, borderLeft: `1px dashed ${W}0.2)` }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 5, height: 5, display: "inline-block", background: i <= (count ?? 0) ? "#78c878" : `${W}0.15)` }} />
                  <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: `${W}0.5)`, letterSpacing: 1 }}>CH-{String(i).padStart(2, "0")}</span>
                </div>
              ))}
              <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: EH_BLUE, letterSpacing: 1, marginTop: 2 }}>FREQ OK</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 5, paddingLeft: 12, borderLeft: `1px dashed ${W}0.2)` }}>
              <svg width="26" height="12" viewBox="0 0 26 12">
                {[0, 1].map((i) => (
                  <path key={i} d={`M${2 + i * 10} 1 L${9 + i * 10} 6 L${2 + i * 10} 11`} stroke={`${W}0.8)`} strokeWidth="1.5" fill="none" />
                ))}
              </svg>
              <span style={{ fontFamily: fonts.pixel, fontSize: 7, color: `${W}0.5)`, letterSpacing: 1 }}>EXEC</span>
            </div>
          )}
        </div>
      </div>
    </View>
  );
}

// ============ end Event Horizon variant ============

function BridgeDashboardInner() {
  const configured = useConnection((s) => s.configured);
  const themeTokens = useThemeTokens();
  const isEH = themeTokens.key === "eventHorizon" && Platform.OS === "web";
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.bridgeDashboard();
      setData(res);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [configured, load]);

  const claude = data?.claude_usage;
  const codex = data?.codex_usage;
  const crew = useMemo(() => pickCrewForDisplay(data?.crew || []), [data?.crew]);
  const entries = useMemo(() => crew.map(crewEntry), [crew]);
  const ship = data?.ship;
  const allOnline = entries.length > 0 && entries.every((e) => e.status === "online");
  const onlineCount = entries.filter((e) => e.status === "online").length;

  if (!configured || (!data && !error)) return null;

  if (isEH) {
    return <EhBridgePanel data={data} error={error} entries={entries} onlineCount={onlineCount} />;
  }

  return (
    <View style={[s.panel, glowBorder]}>
      <View style={s.topEdge} />

      {/* title */}
      <View style={s.titleBlock}>
        <Text style={s.titleDeco}>◆ ─── · ·</Text>
        <Text style={s.titleText}>BRIDGE SYSTEMS</Text>
        <Text style={s.titleDeco}>· · ─── ◆</Text>
      </View>
      <Text style={s.subtitle}>
        {allOnline ? "FLEET NOMINAL · ALL SYSTEMS GO" : "FLEET CHECK · DIAGNOSTICS RUNNING"}
      </Text>

      {error && !data && (
        <Text style={s.offlineText}>· · · SIGNAL LOST · · ·</Text>
      )}

      {data && (
        <>
          {/* propulsion */}
          <View style={s.sectionLine}>
            <View style={s.sectionLineFill} />
            <Text style={s.sectionLabel}>PROPULSION</Text>
            <View style={s.sectionLineFill} />
          </View>

          <View style={s.enginesCol}>
            <UsageGauge
              label="CLAUDE CODE"
              windowLabel="5H"
              utilization={claude?.available ? claude.five_hour?.utilization : undefined}
              resetsAt={claude?.available ? claude.five_hour?.resets_at : undefined}
              secondaryLabel="7D"
              secondaryUtilization={claude?.available ? claude.seven_day?.utilization : undefined}
              secondaryResetsAt={claude?.available ? claude.seven_day?.resets_at : undefined}
              unavailable={!claude?.available}
              unavailableText={claude?.status === 401 ? "USAGE AUTH" : "USAGE OFFLINE"}
            />
            <View style={s.engineDivider} />
            <UsageGauge
              label="CODEX"
              windowLabel="5H"
              utilization={codex?.available ? codex.primary_window?.utilization : undefined}
              resetsAt={codex?.available ? codex.primary_window?.resets_at : undefined}
              secondaryLabel="7D"
              secondaryUtilization={codex?.available ? codex.secondary_window?.utilization : undefined}
              secondaryResetsAt={codex?.available ? codex.secondary_window?.resets_at : undefined}
              unavailable={!codex?.available}
              unavailableText={codex?.status === 401 ? "USAGE AUTH" : "USAGE OFFLINE"}
            />
          </View>

          {/* nav readout strip */}
          <View style={s.navStrip}>
            <View style={s.navCell}>
              <Text style={s.navLabel}>STARDATE</Text>
              <Text style={s.navValue}>{starDate()}</Text>
            </View>
            <Text style={s.navSep}>·</Text>
            <View style={s.navCell}>
              <Text style={s.navLabel}>UPTIME</Text>
              <Text style={s.navValue}>{ship ? formatUptime(ship.system_uptime_seconds ?? ship.uptime_seconds) : "—"}</Text>
            </View>
            <Text style={s.navSep}>·</Text>
            <View style={s.navCell}>
              <Text style={s.navLabel}>MEMORIES</Text>
              <Text style={s.navValue}>{ship?.memories_count ?? "—"}</Text>
            </View>
          </View>

          {/* fleet registry */}
          <View style={s.sectionLine}>
            <View style={s.sectionLineFill} />
            <Text style={s.sectionLabel}>FLEET · {onlineCount}/{entries.length} DOCKED</Text>
            <View style={s.sectionLineFill} />
          </View>

          <View style={s.fleetGrid}>
            {entries.map((e) => (
              <FleetDot key={e.id} entry={e} />
            ))}
          </View>
        </>
      )}

      <View style={s.bottomEdge} />
    </View>
  );
}

const fl = StyleSheet.create({
  item: {
    flexBasis: "48%" as any,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  name: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: "#645c8e",
    letterSpacing: 1,
  },
  nameOn: {
    color: "#c8d8f0",
  },
  tag: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: "#413d6d",
  },
});

const s = StyleSheet.create({
  panel: {
    backgroundColor: "#0c0d22",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.33)",
    overflow: "hidden",
  },

  topEdge: {
    height: 2,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent 5%, rgba(200,216,240,0.38) 30%, rgba(255,223,146,0.56) 50%, rgba(200,216,240,0.38) 70%, transparent 95%)" } as any
      : { backgroundColor: "rgba(200,216,240,0.26)" }),
  },
  bottomEdge: {
    height: 1,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent 10%, rgba(200,216,240,0.26) 50%, transparent 90%)" } as any
      : { backgroundColor: "rgba(200,216,240,0.16)" }),
  },

  titleBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 12,
    paddingBottom: 2,
  },
  titleText: {
    fontFamily: fonts.silkscreen,
    fontSize: 15,
    color: "#fee2a0",
    letterSpacing: 5,
    ...(Platform.OS === "web"
      ? { textShadow: "0 0 24px rgba(255,223,146,0.56), 0 0 6px rgba(255,223,146,0.38)" } as any : {}),
  },
  titleDeco: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(254,226,160,0.8)",
  },
  subtitle: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.44)",
    textAlign: "center",
    letterSpacing: 3,
    paddingBottom: 8,
  },

  offlineText: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: "#645c8e",
    letterSpacing: 3,
    textAlign: "center",
    paddingVertical: 12,
  },

  sectionLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionLineFill: {
    flex: 1,
    height: 1,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(90deg, transparent, rgba(255,223,146,0.38), transparent)" } as any
      : { backgroundColor: "rgba(255,223,146,0.16)" }),
  },
  sectionLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 8,
    color: "rgba(254,226,160,0.85)",
    letterSpacing: 2,
  },

  enginesCol: {
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  engineDivider: {
    height: 1,
    backgroundColor: "rgba(200,216,240,0.1)",
    marginVertical: 8,
  },

  navStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.13)",
    backgroundColor: "rgba(3,6,19,0.5)",
  },
  navCell: {
    alignItems: "center",
  },
  navLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: "rgba(200,216,240,0.44)",
    letterSpacing: 2,
    marginBottom: 2,
  },
  navValue: {
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    color: "#c8d8f0",
    letterSpacing: 1,
  },
  navSep: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "rgba(200,216,240,0.26)",
  },

  fleetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});
