import { memo, useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { api, ContextUsage, ContextThresholdBand } from "../../services/api";
import { colors, fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";

const CELL_COUNT = 20;

const BAND_COLOR: Record<ContextThresholdBand, string> = {
  safe: "#c1bcad",
  soft: "#b8b299",
  hard: "#eccb67",
  emergency: colors.error,
};

const BAND_LABEL: Record<ContextThresholdBand, string> = {
  safe: "CTX",
  soft: "CTX",
  hard: "CTX",
  emergency: "CTX",
};

const BAND_TEXT: Record<ContextThresholdBand, string> = {
  safe: "充足",
  soft: "过半",
  hard: "偏紧",
  emergency: "快满",
};

function ContextHealthBar() {
  const theme = useThemeTokens();
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.getContextUsage();
      setUsage((previous) => {
        if (data.stale && previous && !previous.stale) {
          return { ...previous, stale: true };
        }
        return data;
      });
    } catch {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    const onFocus = () => load();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }
    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [load]);

  const refreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { refreshTimersRef.current.forEach((t) => clearTimeout(t)); }, []);

  const doRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      await api.refreshSession("manual");
      await load();
      refreshTimersRef.current.push(setTimeout(() => load(), 2000));
    } catch (e: any) {
      setRefreshError(e?.message || "换窗失败");
    } finally {
      refreshTimersRef.current.push(setTimeout(() => setRefreshing(false), 1500));
    }
  };

  if (!usage) {
    return null;
  }

  const stale = Boolean(usage.stale);
  const band = usage.threshold_band;
  const color = stale ? colors.textMuted : BAND_COLOR[band];
  const pct = Math.max(0, Math.min(1, usage.ratio || 0));
  const filledCount = Math.round(pct * CELL_COUNT);
  const isLow = band === "hard" || band === "emergency";
  const showRefreshButton = isLow;
  const statusText = BAND_TEXT[band];

  if (theme.key === "eventHorizon") return null;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{BAND_LABEL[band]}</Text>
      <View style={styles.gauge}>
        {Array.from({ length: CELL_COUNT }, (_, i) => {
          const filled = i < filledCount;
          return (
            <View
              key={i}
              style={[
                styles.cell,
                filled && { backgroundColor: color },
                filled && isLow && styles.cellLow,
                filled && Platform.OS === "web" ? ({
                  boxShadow: `0 0 4px ${color}60`,
                } as any) : {},
              ]}
            />
          );
        })}
      </View>
      <Text style={[styles.pctText, { color }]}>{statusText}</Text>
      {showRefreshButton && (
        <TouchableOpacity
          onPress={doRefresh}
          disabled={refreshing}
          style={[styles.refreshBtn, { borderColor: color }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.refreshText, { color }]}>
            {refreshing ? "换窗中…" : "↻"}
          </Text>
        </TouchableOpacity>
      )}
      {refreshError ? (
        <Text style={styles.errorText} numberOfLines={1}>{refreshError}</Text>
      ) : null}
    </View>
  );
}

export default memo(ContextHealthBar);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 5,
    backgroundColor: "rgba(5,12,31,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239,211,88,0.27)",
  },
  label: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 1,
    minWidth: 24,
  },
  gauge: {
    flex: 1,
    height: 10,
    borderWidth: 1,
    borderColor: "rgba(239,211,88,0.38)",
    flexDirection: "row",
    gap: 1,
    padding: 1,
  },
  cell: {
    flex: 1,
    backgroundColor: "rgba(239,211,88,0.16)",
  },
  cellLow: {
    backgroundColor: "#f77755",
  },
  pctText: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    minWidth: 28,
    textAlign: "right",
    letterSpacing: 1,
  },
  refreshBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    backgroundColor: colors.bgInput,
  },
  refreshText: {
    fontFamily: fonts.pixel,
    fontSize: 9,
  },
  errorText: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: colors.error,
  },
});
