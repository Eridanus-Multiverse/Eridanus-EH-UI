import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api, ControlEvent } from "../../services/api";
import { useConnection } from "../../stores/connectionStore";
import { colors, fonts } from "../../theme/colors";

function previewPayload(payload: unknown): string {
  if (payload == null) return "";
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function formatTime(ts: string): string {
  const time = new Date(ts);
  if (Number.isNaN(time.getTime())) return ts;
  return time.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EventRow({ event }: { event: ControlEvent }) {
  const payload = previewPayload(event.payload);
  return (
    <View style={styles.eventRow}>
      <View style={styles.eventHeader}>
        <Text style={styles.eventType} numberOfLines={1}>
          {event.event_type}
        </Text>
        <Text style={styles.eventTime}>{formatTime(event.created_at)}</Text>
      </View>
      {payload ? (
        <Text style={styles.payload} numberOfLines={2}>
          {payload}
        </Text>
      ) : null}
    </View>
  );
}

export default function ControlEventsPanel() {
  const configured = useConnection((state) => state.configured);
  const secret = useConnection((state) => state.secret);
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<ControlEvent[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!configured || !secret) {
      setEvents([]);
      setCount(0);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api.getControlEvents({ limit: 12 });
      setEvents(result.events);
      setCount(result.count);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "读取失败");
    } finally {
      setLoading(false);
    }
  }, [configured, secret]);

  useEffect(() => {
    if (expanded) refresh();
  }, [expanded, refresh]);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((value) => !value)}
        activeOpacity={0.75}
      >
        <View style={styles.headerMain}>
          <Text style={styles.title}>行为日志</Text>
          <Text style={styles.subtitle}>
            {configured ? `${count || events.length} 条最近事件` : "连接服务器后显示"}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.toolbar}>
            <Text style={styles.toolbarText}>只显示最近 12 条 control events</Text>
            <TouchableOpacity
              style={[styles.refreshButton, loading && styles.disabled]}
              onPress={refresh}
              disabled={loading}
              activeOpacity={0.75}
            >
              <Text style={styles.refreshText}>{loading ? "刷新中" : "刷新"}</Text>
            </TouchableOpacity>
          </View>

          {loading && events.length === 0 ? (
            <ActivityIndicator color={colors.pixel.gold} style={styles.loader} />
          ) : events.length > 0 ? (
            <View style={styles.list}>
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>
              {configured ? "暂无行为日志。" : "连接服务器后显示行为日志。"}
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
    overflow: "hidden" as const,
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
  eventRow: {
    backgroundColor: "rgba(4,7,16,0.6)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.12)",
    padding: 10,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  eventType: {
    flex: 1,
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "#c8d8f0",
  },
  eventTime: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: "rgba(200,216,240,0.38)",
  },
  payload: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(200,216,240,0.38)",
    marginTop: 5,
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
