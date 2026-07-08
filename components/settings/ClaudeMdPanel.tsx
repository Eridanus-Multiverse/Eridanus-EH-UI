import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api, ClaudeMdHistoryEntry, ClaudeMdHistoryFile } from "../../services/api";
import { colors, fonts } from "../../theme/colors";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "未知";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString();
}

function lineCount(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

function byteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

function compactLine(text: string, limit = 80): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact || "(空行)";
  return `${compact.slice(0, limit - 3)}...`;
}

function diffPreview(oldText: string, newText: string): string[] {
  if (oldText === newText) return ["没有改动"];
  const oldLines = oldText.split(/\r\n|\r|\n/);
  const newLines = newText.split(/\r\n|\r|\n/);
  const max = Math.max(oldLines.length, newLines.length);
  const samples: string[] = [];
  let changed = 0;
  for (let i = 0; i < max; i += 1) {
    if ((oldLines[i] ?? "") === (newLines[i] ?? "")) continue;
    changed += 1;
    if (samples.length < 6) {
      samples.push(`L${i + 1} - ${compactLine(oldLines[i] ?? "")}`);
      samples.push(`L${i + 1} + ${compactLine(newLines[i] ?? "")}`);
    }
  }
  return [`changed_lines=${changed}`, ...samples];
}

export default function ClaudeMdPanel() {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [size, setSize] = useState(0);
  const [modifiedAt, setModifiedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<ClaudeMdHistoryEntry[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<ClaudeMdHistoryFile | null>(null);
  const [historyBusy, setHistoryBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const dirty = draft !== content;
  const draftBytes = useMemo(() => byteLength(draft), [draft]);
  const summary = useMemo(() => {
    const oldLines = lineCount(content);
    const newLines = lineCount(draft);
    const lineDelta = newLines - oldLines;
    const byteDelta = draftBytes - size;
    return `lines ${oldLines} -> ${newLines} (${lineDelta >= 0 ? "+" : ""}${lineDelta}) · bytes ${size} -> ${draftBytes} (${byteDelta >= 0 ? "+" : ""}${byteDelta})`;
  }, [content, draft, draftBytes, size]);
  const previewLines = useMemo(() => diffPreview(content, draft), [content, draft]);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const [current, historyResult] = await Promise.all([
        api.getClaudeMd(),
        api.getClaudeMdHistory(),
      ]);
      setContent(current.content);
      setDraft(current.content);
      setSize(current.size);
      setModifiedAt(current.modified_at);
      setHistory(historyResult.history);
      setSelectedHistory(null);
      setLoaded(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const toggle = useCallback(() => {
    setExpanded((value) => {
      const next = !value;
      if (next && !loaded && !busy) {
        requestAnimationFrame(() => load());
      }
      return next;
    });
  }, [busy, load, loaded]);

  const doSave = useCallback(async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await api.updateClaudeMd(draft);
      setContent(draft);
      setSize(result.size);
      setModifiedAt(result.modified_at);
      const historyResult = await api.getClaudeMdHistory();
      setHistory(historyResult.history);
      setMessage(`已保存，备份 ${result.backup}。下次UNIT-A新窗时生效。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const confirmSave = useCallback(() => {
    if (!dirty || saving) return;
    const text = `这会写入 /home/ubuntu/CLAUDE.md，并在保存前自动备份。\n\n${summary}`;
    if (Platform.OS === "web") {
      if (window.confirm(text)) doSave();
      return;
    }
    Alert.alert("保存 CLAUDE.md", text, [
      { text: "取消", style: "cancel" },
      { text: "保存", onPress: doSave },
    ]);
  }, [dirty, doSave, saving, summary]);

  const resetDraft = useCallback(() => {
    setDraft(content);
    setMessage("已撤回到当前线上内容");
  }, [content]);

  const viewHistory = useCallback(async (item: ClaudeMdHistoryEntry) => {
    setHistoryBusy(item.filename);
    setMessage("");
    try {
      const result = await api.getClaudeMdHistoryFile(item.filename);
      setSelectedHistory(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setHistoryBusy(null);
    }
  }, []);

  const applyHistory = useCallback(
    async (item: ClaudeMdHistoryEntry) => {
      const run = async () => {
        setHistoryBusy(item.filename);
        setMessage("");
        try {
          const result = selectedHistory?.filename === item.filename
            ? selectedHistory
            : await api.getClaudeMdHistoryFile(item.filename);
          setSelectedHistory(result);
          setDraft(result.content);
          setMessage(`已把 ${item.filename} 填入编辑框；确认无误后再点保存。`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        } finally {
          setHistoryBusy(null);
        }
      };

      if (!dirty) {
        run();
        return;
      }

      const text = "当前编辑框里有未保存内容，恢复历史版本会覆盖编辑框草稿，但不会直接写入文件。继续？";
      if (Platform.OS === "web") {
        if (window.confirm(text)) run();
        return;
      }
      Alert.alert("恢复历史版本", text, [
        { text: "取消", style: "cancel" },
        { text: "恢复到编辑框", onPress: run },
      ]);
    },
    [dirty, selectedHistory]
  );

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.75}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>CLAUDE.md</Text>
          <Text style={styles.subtitle}>
            {loaded
              ? `${formatBytes(size)} · ${formatTime(modifiedAt)}`
              : "UNIT-A人格设定编辑器"}
          </Text>
        </View>
        <Text style={styles.toggle}>{expanded ? "收起" : "展开"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.outlineButton, busy && styles.disabled]}
              onPress={load}
              disabled={busy}
              activeOpacity={0.75}
            >
              <Text style={styles.outlineButtonText}>
                {busy ? "加载中" : "刷新"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.outlineButton, (!dirty || saving) && styles.disabled]}
              onPress={resetDraft}
              disabled={!dirty || saving}
              activeOpacity={0.75}
            >
              <Text style={styles.outlineButtonText}>撤回</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, (!dirty || saving) && styles.disabled]}
              onPress={confirmSave}
              disabled={!dirty || saving}
              activeOpacity={0.75}
            >
              <Text style={styles.primaryButtonText}>
                {saving ? "保存中" : "保存"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.meta}>{summary}</Text>
          {dirty ? (
            <View style={styles.diffBox}>
              {previewLines.map((line, index) => (
                <Text key={`${index}-${line}`} style={styles.diffLine}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          <TextInput
            style={styles.editor}
            value={draft}
            onChangeText={setDraft}
            placeholder="加载 CLAUDE.md..."
            placeholderTextColor={colors.textMuted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            editable={loaded && !busy && !saving}
            textAlignVertical="top"
          />

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.historyBlock}>
            <Text style={styles.historyTitle}>历史备份</Text>
            {history.length === 0 ? (
              <Text style={styles.historyMeta}>暂无备份</Text>
            ) : (
              history.slice(0, 5).map((item) => (
                <View key={item.filename} style={styles.historyRow}>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyName}>{item.filename}</Text>
                    <Text style={styles.historyMeta}>
                      {formatBytes(item.size)} · {formatTime(item.created_at)}
                    </Text>
                  </View>
                  <View style={styles.historyActions}>
                    <TouchableOpacity
                      style={[styles.smallButton, historyBusy === item.filename && styles.disabled]}
                      onPress={() => viewHistory(item)}
                      disabled={historyBusy === item.filename}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.smallButtonText}>
                        {historyBusy === item.filename ? "..." : "查看"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallButton, historyBusy === item.filename && styles.disabled]}
                      onPress={() => applyHistory(item)}
                      disabled={historyBusy === item.filename}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.smallButtonText}>恢复</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {selectedHistory ? (
            <View style={styles.historyPreview}>
              <Text style={styles.historyTitle}>备份预览</Text>
              <Text style={styles.historyMeta}>
                {selectedHistory.filename} · {formatBytes(selectedHistory.size)}
              </Text>
              <TextInput
                style={styles.previewEditor}
                value={selectedHistory.content}
                multiline
                editable={false}
                textAlignVertical="top"
              />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0c0d22",
    borderWidth: 1,
    borderColor: "rgba(238,195,116,0.26)",
    padding: 14,
    overflow: "hidden",
    ...(Platform.OS === "web" ? { boxShadow: "0 0 8px rgba(238,195,116,0.08), 3px 3px 0 #000" } as any : {}),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.silkscreen,
    fontSize: 15,
    color: "#ffdf92",
    letterSpacing: 2,
    ...(Platform.OS === "web" ? { textShadow: "0 0 6px rgba(255,223,146,0.38)" } as any : {}),
  },
  subtitle: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.38)",
    marginTop: 3,
  },
  toggle: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "rgba(200,216,240,0.38)",
  },
  body: {
    marginTop: 12,
    gap: 10,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  outlineButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    backgroundColor: "rgba(4,7,16,0.6)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.2)",
  },
  outlineButtonText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: "rgba(200,216,240,0.5)",
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    backgroundColor: "rgba(255,223,146,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.5)",
  },
  primaryButtonText: {
    fontFamily: fonts.silkscreen,
    fontSize: 12,
    color: "#ffdf92",
  },
  disabled: {
    opacity: 0.45,
  },
  meta: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: "rgba(200,216,240,0.38)",
    lineHeight: 15,
  },
  diffBox: {
    backgroundColor: "rgba(4,7,16,0.6)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 3,
  },
  diffLine: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: "rgba(200,216,240,0.5)",
    lineHeight: 15,
  },
  editor: {
    minHeight: 260,
    maxHeight: 420,
    backgroundColor: "rgba(4,7,16,0.9)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.2)",
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 10,
    paddingVertical: 10,
    ...(Platform.OS === "web"
      ? ({
          outlineStyle: "none",
          resize: "vertical",
          overflowY: "auto",
        } as any)
      : {}),
  },
  message: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "#ffdf92",
    lineHeight: 15,
  },
  historyBlock: {
    gap: 6,
  },
  historyTitle: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.textMuted,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "rgba(4,7,16,0.6)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  historyInfo: {
    flex: 1,
    minWidth: 0,
  },
  historyName: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: "#c8d8f0",
  },
  historyMeta: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "rgba(200,216,240,0.38)",
  },
  historyActions: {
    flexDirection: "row",
    gap: 6,
  },
  smallButton: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: "rgba(255,223,146,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,223,146,0.38)",
  },
  smallButtonText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: colors.pixel.gold,
  },
  historyPreview: {
    gap: 6,
  },
  previewEditor: {
    minHeight: 140,
    maxHeight: 220,
    backgroundColor: "rgba(4,7,16,0.6)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.12)",
    color: "rgba(200,216,240,0.5)",
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 9,
    paddingVertical: 8,
    ...(Platform.OS === "web"
      ? ({
          outlineStyle: "none",
          resize: "vertical",
          overflowY: "auto",
        } as any)
      : {}),
  },
});
