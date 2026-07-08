import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { colors, fonts } from "../../theme/colors";
import { api } from "../../services/api";

const isWeb = Platform.OS === "web";

interface Archive {
  id: string;
  session_number: number;
  started_at: string;
  ended_at: string;
  message_count: number;
  estimated_tokens: number;
  summary: string | null;
  tags: string | null;
  status: string;
  forge_reason: string | null;
}

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function tokenK(n: number | null): string {
  if (!n) return "—";
  return `${Math.round(n / 1000)}k`;
}

export default function SessionArchivesPanel() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.sessionArchives(50);
      const list = Array.isArray(data) ? data : (data as any)?.archives || [];
      setArchives(list);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.sessionArchiveScan();
      await load();
    } catch {} finally { setScanning(false); }
  };

  const parseTags = (raw: string | null): string[] => {
    if (!raw) return [];
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
  };

  if (loading) return <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />;

  return (
    <View style={S.root}>
      <View style={S.header}>
        <Text style={S.title}>SESSION ARCHIVES</Text>
        <TouchableOpacity style={S.scanBtn} onPress={handleScan} disabled={scanning} activeOpacity={0.7}>
          <Text style={S.scanBtnText}>{scanning ? "SCANNING..." : "SCAN"}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={S.list} contentContainerStyle={S.listContent}>
        {archives.length === 0 && <Text style={S.empty}>No archived sessions</Text>}
        {archives.map((a) => {
          const isExpanded = expanded === a.id;
          const tags = parseTags(a.tags);
          return (
            <TouchableOpacity
              key={a.id}
              style={[S.card, isExpanded && S.cardExpanded]}
              onPress={() => setExpanded(isExpanded ? null : a.id)}
              activeOpacity={0.8}
            >
              <View style={S.cardRow}>
                <Text style={S.number}>#{a.session_number}</Text>
                <Text style={S.date}>{formatDate(a.started_at)} → {formatDate(a.ended_at)}</Text>
                <Text style={S.msgs}>{a.message_count} msgs</Text>
                <Text style={S.tokens}>{tokenK(a.estimated_tokens)}</Text>
              </View>
              {a.summary && <Text style={S.summary} numberOfLines={isExpanded ? undefined : 2}>{a.summary}</Text>}
              {isExpanded && tags.length > 0 && (
                <View style={S.tagRow}>
                  {tags.map((t, i) => (
                    <View key={i} style={S.tag}>
                      <Text style={S.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              {isExpanded && (
                <View style={S.detailRow}>
                  <Text style={S.detailLabel}>ID: {a.id.slice(0, 12)}...</Text>
                  <Text style={S.detailLabel}>Status: {a.status}</Text>
                  {a.forge_reason && <Text style={S.detailLabel}>Forge: {a.forge_reason}</Text>}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(85,85,165,0.15)",
  },
  title: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    color: "rgba(200,216,240,0.4)",
    letterSpacing: 3,
  },
  scanBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.2)",
  },
  scanBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: colors.accent,
  },
  list: { flex: 1 },
  listContent: { padding: 10, gap: 6 },
  empty: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.3)",
    textAlign: "center",
    marginTop: 20,
  },
  card: {
    backgroundColor: "#0c0d22",
    borderWidth: 1,
    borderColor: "rgba(60,90,140,0.5)",
    padding: 10,
    ...(isWeb ? { boxShadow: "2px 2px 0 #000" } as any : {}),
  },
  cardExpanded: {
    borderColor: "rgba(200,216,240,0.3)",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  number: {
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    color: colors.accent,
  },
  date: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: "rgba(200,216,240,0.5)",
    flex: 1,
  },
  msgs: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: "rgba(200,216,240,0.4)",
  },
  tokens: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: "rgba(200,216,240,0.35)",
  },
  summary: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "rgba(200,216,240,0.6)",
    marginTop: 6,
    lineHeight: 16,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(85,85,165,0.3)",
    backgroundColor: "rgba(85,85,165,0.08)",
  },
  tagText: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: "rgba(200,216,240,0.5)",
  },
  detailRow: {
    marginTop: 6,
    gap: 2,
  },
  detailLabel: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: "rgba(200,216,240,0.3)",
  },
});
