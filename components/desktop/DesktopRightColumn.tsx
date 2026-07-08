import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, Platform } from "react-native";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";
import { api } from "../../services/api";

const isWeb = Platform.OS === "web";

function daysToBirthday() {
  const now = new Date();
  const year = now.getFullYear();
  let bday = new Date(year, 8, 1);
  if (bday.getTime() <= now.getTime()) bday = new Date(year + 1, 8, 1);
  return Math.ceil((bday.getTime() - now.getTime()) / 86400000);
}

export default function DesktopRightColumn() {
  const theme = useThemeTokens();
  const S = useMemo(() => createStyles(theme), [theme]);
  const [daysLeft, setDaysLeft] = useState(daysToBirthday());
  const [contextUsage, setContextUsage] = useState<any>(null);

  useEffect(() => {
    const t = setInterval(() => setDaysLeft(daysToBirthday()), 60000);
    return () => clearInterval(t);
  }, []);

  const loadUsage = useCallback(async () => {
    try { const d = await api.getContextUsage(); setContextUsage(d); } catch {}
  }, []);

  useEffect(() => { loadUsage(); }, [loadUsage]);
  useEffect(() => {
    const t = setInterval(loadUsage, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [loadUsage]);

  const ctxPct = contextUsage?.ratio ? Math.round(contextUsage.ratio * 100) : 0;
  const ctxBand = contextUsage?.threshold_band || "ok";

  return (
    <View style={S.root}>
      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>
        {/* birthday countdown */}
        <View style={S.card}>
          <Text style={S.cardLabel}>BIRTHDAY</Text>
          <Text style={S.bigNum}>{daysLeft}</Text>
          <Text style={S.subText}>days until Sep 1</Text>
        </View>

        {/* context usage */}
        <View style={S.card}>
          <Text style={S.cardLabel}>CTX USAGE</Text>
          <Text style={[S.bigNum, ctxBand === "hard" || ctxBand === "emergency" ? { color: theme.desktop.ctxHard } : ctxBand === "soft" ? { color: theme.desktop.ctxSoft } : {}]}>{ctxPct}%</Text>
          <View style={S.ctxBarBg}>
            <View style={[S.ctxBarFill, { width: `${Math.max(2, ctxPct)}%` as any }, ctxBand === "hard" || ctxBand === "emergency" ? { backgroundColor: theme.desktop.ctxHard } : ctxBand === "soft" ? { backgroundColor: theme.desktop.ctxSoft } : {}]} />
          </View>
          <Text style={S.subText}>{contextUsage?.estimated_tokens ? `${Math.round(contextUsage.estimated_tokens / 1000)}k tokens` : "..."}</Text>
        </View>

        {/* usage calendar placeholder */}
        <View style={S.card}>
          <Text style={S.cardLabel}>USAGE CALENDAR</Text>
          <View style={S.calendarGrid}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              const day = d.getDate();
              return (
                <View key={i} style={S.calDay}>
                  <Text style={S.calDayNum}>{day}</Text>
                  <View style={[S.calDot, i === 6 && S.calDotToday]} />
                </View>
              );
            })}
          </View>
        </View>

        {/* fleet status */}
        <View style={S.card}>
          <Text style={S.cardLabel}>FLEET STATUS</Text>
          {[
            { name: "UNIT-A", session: "horizon-chat" },
            { name: "Cursa", session: "codex" },
            { name: "UNIT-C", session: "omicron-work" },
          ].map((agent) => (
            <View key={agent.name} style={S.fleetRow}>
              <View style={S.fleetDot} />
              <Text style={S.fleetName}>{agent.name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  root: {
    width: 200,
    backgroundColor: theme.bg,
    borderLeftWidth: 1,
    borderLeftColor: theme.desktop.borderFaint,
  },
  scroll: {
    padding: 12,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: theme.desktop.activeBgSoft,
    borderWidth: 1,
    borderColor: theme.desktop.borderCard,
    /* no radius */
    padding: 12,
  },
  cardLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: theme.desktop.textSoft,
    letterSpacing: 3,
    marginBottom: 6,
  },
  bigNum: {
    fontFamily: fonts.silkscreen,
    fontSize: 28,
    color: theme.accent,
    ...(isWeb ? { textShadow: theme.desktop.accentShadow } as any : {}),
  },
  subText: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.desktop.textMuted,
    marginTop: 2,
  },
  ctxBarBg: {
    height: 4,
    backgroundColor: theme.desktop.barBg,
    /* no radius */
    overflow: "hidden" as const,
    marginTop: 6,
    marginBottom: 4,
  },
  ctxBarFill: {
    height: 4,
    /* no radius */
    backgroundColor: theme.accent,
    opacity: 0.6,
  },
  calendarGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  calDay: {
    alignItems: "center" as const,
    gap: 3,
  },
  calDayNum: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: theme.desktop.textMid,
  },
  calDot: {
    width: 6,
    height: 6,
    /* no radius */
    backgroundColor: theme.desktop.dotBg,
  },
  calDotToday: {
    backgroundColor: theme.accent,
    ...(isWeb ? { boxShadow: theme.desktop.dotShadow } as any : {}),
  },
  fleetRow: {
    flexDirection: "row",
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 4,
  },
  fleetDot: {
    width: 5,
    height: 5,
    /* no radius */
    backgroundColor: theme.success,
    ...(isWeb ? { boxShadow: theme.homePanel.successShadowSmall } as any : {}),
  },
  fleetName: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.desktop.textBright,
  },
  });
}
