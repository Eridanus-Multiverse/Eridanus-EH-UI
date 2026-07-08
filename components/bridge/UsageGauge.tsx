import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { fonts } from "../../theme/colors";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

function tierColor(pct: number): string {
  if (pct >= 85) return "#f75656";
  if (pct >= 60) return "#ece4a4";
  return "#75d879";
}

function formatCountdown(resetIso: string): string {
  const diff = new Date(resetIso).getTime() - Date.now();
  if (diff <= 0) return "resetting";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  return `${h}h ${m}m`;
}

const CELL_COUNT = 16;

function PixelBar({ percent, color }: { percent: number; color: string }) {
  const filled = Math.round((percent / 100) * CELL_COUNT);
  return (
    <View style={barStyles.track}>
      {Array.from({ length: CELL_COUNT }).map((_, i) => (
        <View
          key={i}
          style={[
            barStyles.cell,
            { backgroundColor: i < filled ? color : "rgba(200,216,240,0.16)" },
          ]}
        />
      ))}
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: 1,
    flex: 1,
  },
  cell: {
    flex: 1,
    height: 4,
  },
});

export default function UsageGauge({
  label,
  windowLabel,
  utilization,
  resetsAt,
  secondaryLabel,
  secondaryUtilization,
  secondaryResetsAt,
  unavailable,
  unavailableText,
}: {
  label: string;
  windowLabel?: string;
  utilization?: number;
  resetsAt?: string;
  secondaryLabel?: string;
  secondaryUtilization?: number;
  secondaryResetsAt?: string;
  unavailable?: boolean;
  unavailableText?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (unavailable) return;
    const t = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(t);
  }, [unavailable]);

  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    if (!unavailable) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 2000, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 2000, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [unavailable, pulseAnim]);

  if (unavailable) {
    return (
      <Animated.View style={[s.container, { opacity: pulseAnim }]}>
        <Text style={s.engineLabel}>{label}</Text>
        <Text style={s.offlineText}>{unavailableText || "USAGE OFFLINE"}</Text>
      </Animated.View>
    );
  }

  const pct = utilization ?? 0;
  const color = tierColor(pct);
  const secPct = secondaryUtilization ?? 0;
  const secColor = tierColor(secPct);

  return (
    <View style={s.container}>
      <Text style={s.engineLabel}>{label}</Text>

      <View style={s.row}>
        <Text style={s.windowTag}>{windowLabel || "5H"}</Text>
        <PixelBar percent={pct} color={color} />
        <Text style={[s.pctText, { color }]}>{pct}%</Text>
        {resetsAt && <Text style={s.resetText}>{formatCountdown(resetsAt)}</Text>}
      </View>

      {secondaryLabel && (
        <View style={s.row}>
          <Text style={s.windowTag}>{secondaryLabel}</Text>
          <PixelBar percent={secPct} color={secColor} />
          <Text style={[s.pctText, { color: secColor }]}>{secPct}%</Text>
          {secondaryResetsAt && <Text style={s.resetText}>{formatCountdown(secondaryResetsAt)}</Text>}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    gap: 6,
  },
  engineLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: "#c8d8f0",
    letterSpacing: 2,
    marginBottom: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  windowTag: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: "rgba(200,216,240,0.5)",
    width: 22,
    letterSpacing: 1,
  },
  pctText: {
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    width: 38,
    textAlign: "right",
  },
  resetText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "#645c8e",
    width: 50,
    textAlign: "right",
  },
  offlineText: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    color: "#645c8e",
    letterSpacing: 2,
  },
});
