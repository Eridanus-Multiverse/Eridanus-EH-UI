import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";
import { api } from "../../services/api";
import DecorCornerBrackets from "../decor/CornerBrackets";

const isWeb = Platform.OS === "web";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function pad2(n: number) { return n < 10 ? "0" + n : String(n); }

function CornerBrackets() {
  const theme = useThemeTokens();
  return <DecorCornerBrackets color={theme.starcourt.cardGoldBorder} size={8} offset={4} />;
}

function ClockCard() {
  const theme = useThemeTokens();
  const S = useMemo(() => createStyles(theme), [theme]);
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<{ temp: number; desc: string; location?: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadWeather = useCallback(async () => {
    try {
      const w = await api.weather();
      setWeather({ temp: w.temp, desc: w.desc, location: w.location });
    } catch {}
  }, []);

  useEffect(() => { loadWeather(); }, [loadWeather]);
  useEffect(() => {
    const t = setInterval(loadWeather, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [loadWeather]);

  const hours24 = now.getHours();
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const h = pad2(hours24);
  const m = pad2(now.getMinutes());
  const s = pad2(now.getSeconds());
  const weekday = WEEKDAYS[now.getDay()];
  const month = MONTHS[now.getMonth()];
  const date = now.getDate();
  const year = now.getFullYear();

  return (
    <View style={[S.card, S.cardShadow, { flex: 6 }]}>
      <CornerBrackets />
      <View style={S.cardCenter}>
        <View style={S.rowCenter}>
          <Text style={S.clockAmpm}>{ampm} </Text>
          <Text style={S.clockTime}>{h}:{m}<Text style={S.clockSec}>:{s}</Text></Text>
        </View>
        <Text style={S.clockDateLine}>{year} · {weekday} {month} {date}</Text>
        {weather && (
          <Text style={S.weatherLine}>{weather.location}  {weather.temp}°  {weather.desc}</Text>
        )}
      </View>
    </View>
  );
}

const CAUSAL_NODES = [
  { key: "stellar_fusion", label: "星核", icon: "◉" },
  { key: "corona", label: "日冕", icon: "◎" },
  { key: "flare", label: "耀斑", icon: "✦" },
  { key: "tidal", label: "潮汐", icon: "≋" },
];

function CausalCard() {
  const theme = useThemeTokens();
  const S = useMemo(() => createStyles(theme), [theme]);
  const [overlay, setOverlay] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.stellarReadings();
      setOverlay((data as any)?.causal_overlay || null);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 30 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const co = overlay;
  if (!co?.active) {
    return (
      <View style={[S.card, S.cardShadow, { flex: 4 }]}>
        <View style={S.cardCenter}>
          <Text style={S.inactiveText}>CAUSAL</Text>
          <Text style={S.inactiveText}>STANDBY</Text>
        </View>
      </View>
    );
  }

  const chordColor = theme.homePanel.chordColors[co.base_chord_tag || co.chord_tag] || theme.homePanel.chordFallback;

  return (
    <View style={[S.card, S.cardShadow, { flex: 4 }]}>
      <View style={S.cardCenter}>
        <Text style={[S.chordText, { color: chordColor }]}>
          {co.chord_tag}{co.tidal_pull ? " +牵引" : ""}
        </Text>
        {co.chord_label && <Text style={[S.chordLabel, { color: chordColor }]}>{co.chord_label}</Text>}
        <View style={S.nodesRow}>
          {CAUSAL_NODES.map((n) => {
            const val = Number(co[n.key] || 0);
            const bright = val > 0.6 ? 1 : val > 0.35 ? 0.65 : 0.3;
            return (
              <View key={n.key} style={S.nodeCol}>
                <Text style={{ fontFamily: fonts.pixel, fontSize: 14, color: chordColor, opacity: bright }}>{n.icon}</Text>
                <Text style={S.nodeVal}>{Math.round(val * 100)}</Text>
                <Text style={S.nodeLabel}>{n.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function DesktopSidebar() {
  const theme = useThemeTokens();
  const S = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={S.root}>
      <View style={S.topRow}>
        <ClockCard />
        <CausalCard />
      </View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.desktop.rootBg,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  topRow: {
    flexDirection: "row" as const,
    gap: 6,
  },

  card: {
    backgroundColor: theme.homePanel.statusCardBg,
    borderWidth: 1.5,
    borderColor: theme.homePanel.statusCardBorderStrong,
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  cardShadow: isWeb ? {
    boxShadow: theme.homePanel.statusCardShadowStrong,
  } as any : {},
  cardCenter: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },


  rowCenter: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    justifyContent: "center" as const,
  },
  clockAmpm: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: theme.desktop.textMid,
    letterSpacing: 2,
  },
  clockTime: {
    fontFamily: fonts.silkscreen,
    fontSize: 36,
    color: theme.accent,
    letterSpacing: 2,
    ...(isWeb ? { textShadow: theme.starcourt.goldTitleShadow } as any : {}),
  },
  clockSec: {
    fontSize: 18,
    color: theme.starcourt.bayGold,
  },
  clockDateLine: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    color: theme.starcourt.paleText,
    letterSpacing: 2,
    marginTop: 4,
  },
  weatherLine: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.desktop.textMid,
    marginTop: 3,
    textAlign: "center" as const,
  },

  chordText: {
    fontFamily: fonts.silkscreen,
    fontSize: 14,
    ...(isWeb ? { textShadow: "0 0 10px currentColor" } as any : {}),
  },
  chordLabel: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    opacity: 0.7,
    marginTop: 2,
  },
  nodesRow: {
    flexDirection: "row" as const,
    justifyContent: "space-around" as const,
    width: "100%" as any,
    marginTop: 6,
  },
  nodeCol: {
    alignItems: "center" as const,
  },
  nodeVal: {
    fontFamily: fonts.silkscreen,
    fontSize: 8,
    color: theme.desktop.textBright,
    marginTop: 1,
  },
  nodeLabel: {
    fontFamily: fonts.pixel,
    fontSize: 6,
    color: theme.desktop.textSoft,
    marginTop: 1,
  },
  inactiveText: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: theme.desktop.textFaint,
    letterSpacing: 3,
  },

  });
}
