import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api, CompanionStatus } from "../../services/api";
import { useConnection } from "../../stores/connectionStore";
import { colors, fonts } from "../../theme/colors";

type StatusTone = "online" | "warning" | "offline";

function toneOf(status: string): StatusTone {
  if (status === "online") return "online";
  if (status === "warning") return "warning";
  return "offline";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    online: "在线",
    offline: "离线",
    warning: "异常",
  };
  return labels[status] || status;
}

function formatSeen(ts: string | null): string {
  if (!ts) return "未见心跳";
  const time = new Date(ts).getTime();
  if (Number.isNaN(time)) return ts;
  const diff = Math.max(0, Date.now() - time);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function Dot({ tone }: { tone: StatusTone }) {
  return (
    <View
      style={[
        styles.dot,
        tone === "online" && styles.dotOnline,
        tone === "warning" && styles.dotWarning,
        tone === "offline" && styles.dotOffline,
      ]}
    />
  );
}

function CompanionRow({ item }: { item: CompanionStatus }) {
  const tone = toneOf(item.status);
  return (
    <View style={styles.row}>
      <Text style={styles.icon}>{item.icon}</Text>
      <View style={styles.main}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={styles.statusPill}>
            <Dot tone={tone} />
            <Text
              style={[
                styles.statusText,
                tone === "online" && styles.statusOnline,
                tone === "warning" && styles.statusWarning,
              ]}
            >
              {statusLabel(item.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.detail} numberOfLines={2}>
          {[item.detail, formatSeen(item.last_seen_at)].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </View>
  );
}

export default function CompanionStatusPanel() {
  const configured = useConnection((state) => state.configured);
  const secret = useConnection((state) => state.secret);
  const [expanded, setExpanded] = useState(true);
  const [companions, setCompanions] = useState<CompanionStatus[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (companions.length === 0) return "未加载";
    const online = companions.filter((item) => item.status === "online").length;
    const warning = companions.filter((item) => item.status === "warning").length;
    return warning > 0 ? `${online}/${companions.length} 在线 · ${warning} 异常` : `${online}/${companions.length} 在线`;
  }, [companions]);

  const refresh = useCallback(async () => {
    if (!configured || !secret) {
      setCompanions([]);
      setCheckedAt(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api.companionsStatus();
      setCompanions(result.companions);
      setCheckedAt(result.checked_at);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "读取失败");
    } finally {
      setLoading(false);
    }
  }, [configured, secret]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((value) => !value)}
        activeOpacity={0.75}
      >
        <View style={styles.headerMain}>
          <Text style={styles.title}>连接状态总览</Text>
          <Text style={styles.subtitle}>
            {summary}
            {checkedAt ? ` · ${formatSeen(checkedAt)}` : ""}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.toolbar}>
            <Text style={styles.toolbarText}>每 30 秒自动刷新</Text>
            <TouchableOpacity
              style={[styles.refreshButton, loading && styles.disabled]}
              onPress={refresh}
              disabled={loading}
              activeOpacity={0.75}
            >
              <Text style={styles.refreshText}>{loading ? "刷新中" : "刷新"}</Text>
            </TouchableOpacity>
          </View>

          {loading && companions.length === 0 ? (
            <ActivityIndicator color={colors.pixel.gold} style={styles.loader} />
          ) : companions.length > 0 ? (
            <View style={styles.list}>
              {companions.map((item) => (
                <CompanionRow key={item.id} item={item} />
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>
              {configured ? "暂无连接状态。" : "连接服务器后显示状态。"}
            </Text>
          )}

          {error ? <Text style={styles.error}>同步失败：{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0c0d22",
    borderWidth: 1,
    borderColor: "rgba(238,195,116,0.26)",
    overflow: "hidden",
    ...(Platform.OS === "web" ? { boxShadow: "0 0 8px rgba(238,195,116,0.08), 3px 3px 0 #000" } as any : {}),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  headerMain: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.silkscreen,
    fontSize: 15,
    color: "#ffdf92",
    letterSpacing: 2,
    ...(Platform.OS === "web" ? { textShadow: "0 0 12px rgba(255,223,146,0.3)" } as any : {}),
  },
  subtitle: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.38)",
    marginTop: 4,
  },
  chevron: {
    fontFamily: fonts.pixel,
    fontSize: 17,
    color: "rgba(200,216,240,0.38)",
    width: 18,
    textAlign: "right",
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: "rgba(200,216,240,0.13)",
    padding: 12,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  toolbarText: {
    flex: 1,
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.38)",
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.38)",
    backgroundColor: "rgba(255,223,146,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: colors.pixel.gold,
  },
  disabled: {
    opacity: 0.45,
  },
  loader: {
    marginVertical: 14,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(4,7,16,0.6)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.12)",
    padding: 10,
  },
  icon: {
    width: 24,
    fontFamily: fonts.pixel,
    fontSize: 17,
    color: colors.text,
    textAlign: "center",
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flex: 1,
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    color: colors.text,
    letterSpacing: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotOnline: {
    backgroundColor: colors.success,
  },
  dotWarning: {
    backgroundColor: colors.warning,
  },
  dotOffline: {
    backgroundColor: colors.textMuted,
  },
  statusText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  statusOnline: {
    color: colors.success,
  },
  statusWarning: {
    color: colors.warning,
  },
  detail: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(200,216,240,0.38)",
    marginTop: 3,
  },
  empty: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "rgba(200,216,240,0.38)",
  },
  error: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.error,
    marginTop: 10,
  },
});
