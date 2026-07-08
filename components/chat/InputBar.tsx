import { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";
import { api, UploadResponse, ChatMessage } from "../../services/api";
import { shrinkImageFile } from "../../services/imageShrink";

if (Platform.OS === "web" && typeof document !== "undefined") {
  const id = "inputbar-fx-css";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes commPulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }
      [data-commpulse="1"] {
        animation: commPulse 2.5s ease-in-out infinite !important;
      }
    `;
    document.head.appendChild(s);
  }
}

interface Props {
  onSend: (text: string, attachments?: { id: string; url: string; type: string }[], quotedId?: string, quotedText?: string) => void;
  disabled?: boolean;
  quotedMessage?: ChatMessage | null;
  onClearQuote?: () => void;
}

interface PendingAttachment {
  id: string;
  filename: string;
  mime_type: string;
  attachment_type: string;
  url: string;
  previewBlobUrl?: string;
}

function inputFrameSurface(theme: ThemeTokens) {
  if (Platform.OS !== "web") {
    return {
      borderWidth: 0,
      borderRadius: 0,
    };
  }

  return {
    backgroundColor: theme.inputBar.frameSurfaceBg,
    borderWidth: 0,
    borderRadius: 0,
  } as any;
}

export default function InputBar({ onSend, disabled, quotedMessage, onClearQuote }: Props) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [text, setText] = useState("");
  const [pendingList, setPendingList] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sendBtnRef = useRef<View>(null);
  const attachBtnRef = useRef<View>(null);
  const pendingListRef = useRef<PendingAttachment[]>([]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const prevent = (e: Event) => e.preventDefault();
    const sendEl = sendBtnRef.current as unknown as HTMLElement;
    const attachEl = attachBtnRef.current as unknown as HTMLElement;
    if (sendEl) sendEl.addEventListener("pointerdown", prevent);
    if (attachEl) attachEl.addEventListener("pointerdown", prevent);
    return () => {
      if (sendEl) sendEl.removeEventListener("pointerdown", prevent);
      if (attachEl) attachEl.removeEventListener("pointerdown", prevent);
    };
  }, []);

  useEffect(() => {
    pendingListRef.current = pendingList;
  }, [pendingList]);

  useEffect(() => {
    return () => {
      pendingListRef.current.forEach((p) => {
        if (p.previewBlobUrl) URL.revokeObjectURL(p.previewBlobUrl);
      });
    };
  }, []);

  const handleSend = () => {
    const trimmed = text.trim();
    if (disabled || uploading) return;
    if (!trimmed && pendingList.length === 0) return;
    onSend(
      trimmed,
      pendingList.length > 0
        ? pendingList.map((p) => ({ id: p.id, url: p.url, type: p.attachment_type }))
        : undefined,
      quotedMessage?.id,
      quotedMessage?.text
    );
    setText("");
    pendingList.forEach((p) => { if (p.previewBlobUrl) URL.revokeObjectURL(p.previewBlobUrl); });
    setPendingList([]);
    setErr("");
    onClearQuote?.();
  };

  const pickFile = () => {
    if (Platform.OS !== "web") {
      setErr("移动端附件功能待加");
      return;
    }
    if (!fileInputRef.current) {
      const el = document.createElement("input");
      el.type = "file";
      el.multiple = true;
      el.accept = "image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip";
      el.onchange = handleWebFiles;
      fileInputRef.current = el;
    }
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const handleWebFiles = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const oversized = fileArray.find((f) => f.size > 25 * 1024 * 1024);
    if (oversized) {
      setErr(`文件 ${oversized.name} 太大（>25MB）`);
      return;
    }
    setUploading(true);
    setErr("");
    const newItems: PendingAttachment[] = [];
    try {
      for (const rawFile of fileArray) {
        // iPhone 原图 2~4MB → 长边 2048 JPEG，几百 KB；
        // 大图解码是 iOS 把页面杀掉重载的主因
        const file = await shrinkImageFile(rawFile);
        const res: UploadResponse = await api.upload(file, file.name);
        const previewBlobUrl =
          res.attachment_type === "image" ? URL.createObjectURL(file) : undefined;
        newItems.push({
          id: res.id,
          filename: res.filename,
          mime_type: res.mime_type,
          attachment_type: res.attachment_type,
          url: res.url,
          previewBlobUrl,
        });
      }
      setPendingList((prev) => [...prev, ...newItems]);
    } catch (e: any) {
      setErr("上传失败: " + (e?.message || "unknown"));
      // files uploaded before the failure are already on the server — keep them
      // attached instead of orphaning them
      if (newItems.length > 0) setPendingList((prev) => [...prev, ...newItems]);
    } finally {
      setUploading(false);
    }
  };

  const removePending = (index: number) => {
    setPendingList((prev) => {
      const item = prev[index];
      if (item?.previewBlobUrl) URL.revokeObjectURL(item.previewBlobUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAllPending = () => {
    pendingList.forEach((p) => { if (p.previewBlobUrl) URL.revokeObjectURL(p.previewBlobUrl); });
    setPendingList([]);
    setErr("");
  };

  const isEH = theme.key === "eventHorizon";

  return (
    <View style={styles.wrap}>
      {isEH && Platform.OS === "web" ? (
        <div style={{ position: "absolute", top: -10, left: 0, right: 0, height: 12, zIndex: 100, pointerEvents: "none" }}>
          {/* same part as HudHeader's bottom separator, NOT mirrored — notch dips down,
              tight twin rails; black fill runs below the rails to meet the input bar */}
          <svg width="100%" height="12" viewBox="0 0 360 12" preserveAspectRatio="none" style={{ position: "absolute", left: 0, top: 0, width: "100%" }}>
            <path d="M0 3 L80 3 L100 8 L260 8 L280 3 L360 3 L360 12 L0 12 Z" fill="#000" />
            <path d="M0 3 L80 3 L100 8 L260 8 L280 3 L360 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
            <path d="M0 6 L75 6 L97 10 L263 10 L285 6 L360 6" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* Labels on the black shoulders */}
          <div style={{ position: "absolute", left: 14, bottom: -6, display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 4, height: 4, backgroundColor: "rgba(120,200,120,0.8)" }} />
            <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: "rgba(255,255,255,0.55)", letterSpacing: 2 }}>TX_OPEN</span>
          </div>
          <div style={{ position: "absolute", right: 14, bottom: -6, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M2 7 A4 4 0 0 1 2 1" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" fill="none" />
              <path d="M4 6 A2.5 2.5 0 0 1 4 2" stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" fill="none" />
              <circle cx="6" cy="4" r="1.2" fill="rgba(255,255,255,0.65)" />
            </svg>
            <span style={{ fontFamily: "Silkscreen", fontSize: 7, color: "rgba(255,255,255,0.45)", letterSpacing: 2 }}>COMM</span>
          </div>
        </div>
      ) : (
        <View style={styles.commBar}>
          <View
            {...(Platform.OS === "web" ? { dataSet: { commpulse: "1" } } : {})}
            style={styles.commDot}
          />
          <Text style={styles.commLabel}>COMM</Text>
          <View style={styles.commSignal}>
            <View style={[styles.commSignalBar, styles.commSignalBar1]} />
            <View style={[styles.commSignalBar, styles.commSignalBar2]} />
            <View style={[styles.commSignalBar, styles.commSignalBar3]} />
            <View style={[styles.commSignalBar, styles.commSignalBar4]} />
          </View>
          <View style={styles.commLine} />
          <Text style={styles.commFreq}>TX·OPEN</Text>
        </View>
      )}
      {quotedMessage && (
        <View style={styles.quoteBar}>
          <View style={styles.quoteBarAccent} />
          <View style={styles.quoteBarContent}>
            <Text style={styles.quoteBarSender} numberOfLines={1}>
              {quotedMessage.role === "user" ? "CAPTAIN" : "UNIT-A"}
            </Text>
            <Text style={styles.quoteBarText} numberOfLines={2}>
              {quotedMessage.text}
            </Text>
          </View>
          <TouchableOpacity onPress={onClearQuote} style={styles.quoteBarClose}>
            <Text style={styles.quoteBarCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      {(pendingList.length > 0 || uploading || err) && (
        <View style={styles.preview}>
          {uploading && <Text style={styles.previewText}>上传中...</Text>}
          {err !== "" && <Text style={styles.errText}>{err}</Text>}
          {pendingList.length > 0 && (
            <View style={styles.previewRow}>
              {pendingList.map((p, i) => (
                <View key={p.id} style={styles.previewThumb}>
                  {p.previewBlobUrl ? (
                    <Image source={{ uri: p.previewBlobUrl }} style={styles.previewImage} />
                  ) : (
                    <Text style={styles.previewFileIcon}>📄</Text>
                  )}
                  <TouchableOpacity onPress={() => removePending(i)} style={styles.previewThumbClose}>
                    <Text style={styles.previewCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {pendingList.length > 1 && (
                <TouchableOpacity onPress={clearAllPending} style={styles.previewClearAll}>
                  <Text style={styles.previewCloseText}>全部清除</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
      <View style={styles.container}>
        <View
          style={[
            styles.inputRow,
            inputFrameSurface(theme),
            focused && styles.inputShellFocused,
          ]}
        >
          <TouchableOpacity
            ref={attachBtnRef as any}
            style={[styles.attachBtn, uploading && styles.sendBtnDisabled]}
            onPress={pickFile}
            disabled={uploading || disabled}
          >
            {isEH && Platform.OS === "web" ? (
              <svg width="24" height="22" viewBox="0 0 24 22" fill="none">
                <path d="M1 6 L1 20 L23 20 L23 6 L12 6 L10 3 L1 3 Z"
                  stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" fill="rgba(255,255,255,0.05)" />
                <line x1="1" y1="9" x2="23" y2="9" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
                <line x1="7" y1="12.5" x2="17" y2="12.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                <line x1="7" y1="15.5" x2="14" y2="15.5" stroke="rgba(255,255,255,0.33)" strokeWidth="1" />
              </svg>
            ) : (
              <Text style={styles.iconText}>+</Text>
            )}
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={isEH ? "TRANSMISSION..." : "说点什么..."}
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={4000}
            returnKeyType="default"
            blurOnSubmit={false}
            {...(Platform.OS === "web" ? { onKeyPress: (e: any) => {
              const ne = e.nativeEvent;
              if (ne.key === "Enter" && !ne.shiftKey && !ne.ctrlKey && !ne.metaKey && !ne.isComposing) {
                e.preventDefault?.();
                e.stopPropagation?.();
                handleSend();
              }
            }} : {})}
          />
          <TouchableOpacity
            ref={sendBtnRef as any}
            style={[
              styles.sendBtn,
              ((!text.trim() && pendingList.length === 0) || disabled || uploading) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={(!text.trim() && pendingList.length === 0) || disabled || uploading}
            activeOpacity={0.4}
            {...(Platform.OS === "web" ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
          >
            {isEH && Platform.OS === "web" ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                {/* Upward launch — octagonal frame with arrow */}
                <path d="M7 1 L17 1 L23 7 L23 17 L17 23 L7 23 L1 17 L1 7 Z"
                  stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" fill="rgba(255,255,255,0.05)" />
                <path d="M12 5 L17 13 L14 13 L14 18 L10 18 L10 13 L7 13 Z"
                  fill="rgba(255,255,255,0.7)" />
              </svg>
            ) : (
              <Text style={styles.iconText}>▲</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.inputBar.shellBg,
  },
  wrap: {
    backgroundColor: theme.inputBar.shellBg,
    position: "relative" as const,
    overflow: "visible" as const,
    borderTopWidth: theme.key === "eventHorizon" ? 0 : 1,
    borderBottomWidth: theme.key === "eventHorizon" ? 0 : 1,
    borderTopColor: theme.inputBar.shellBorderTop,
    borderBottomColor: theme.inputBar.shellBorderBottom,
  },
  commBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
    backgroundColor: theme.inputBar.commBg,
  },
  commDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.inputBar.commDot,
  },
  commLabel: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: theme.inputBar.commLabel,
    letterSpacing: 2,
  },
  commSignal: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 1,
    marginLeft: 6,
    height: 8,
  },
  commSignalBar: {
    width: 2,
    backgroundColor: theme.inputBar.commSignal,
  },
  commSignalBar1: { height: 2 },
  commSignalBar2: { height: 4 },
  commSignalBar3: { height: 6 },
  commSignalBar4: { height: 8 },
  commLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.inputBar.commLine,
  },
  commFreq: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: theme.inputBar.commSignal,
    letterSpacing: 1,
  },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 42,
  },
  inputShellFocused: {
  },
  input: {
    flex: 1,
    minHeight: 26,
    backgroundColor: "transparent",
    borderWidth: 0,
    color: theme.text,
    fontFamily: fonts.chat,
    // iOS Safari/PWA auto-zooms focused inputs below 16px.
    fontSize: 16,
    paddingHorizontal: 10,
    paddingTop: Platform.OS === "ios" ? 8 : 6,
    paddingBottom: Platform.OS === "ios" ? 8 : 6,
    maxHeight: 86,
    lineHeight: 22,
    ...(Platform.OS === "web"
      ? ({
          outlineStyle: "none",
          resize: "none",
        } as any)
      : {}),
  },
  attachBtn: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtn: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
    backgroundColor: "transparent",
  },
  iconText: {
    fontFamily: fonts.pixel,
    fontSize: 20,
    color: theme.pixel.gold,
  },
  preview: {
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: theme.bg,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  previewThumb: {
    position: "relative",
    width: 52,
    height: 52,
    backgroundColor: theme.bgInput,
    borderWidth: 1,
    borderColor: theme.pixel.goldDim,
    alignItems: "center",
    justifyContent: "center",
  },
  previewThumbClose: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.inputBar.overlayCloseBg,
    alignItems: "center",
    justifyContent: "center",
  },
  previewClearAll: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.pixel.goldDim,
    backgroundColor: theme.inputBar.previewClearBg,
  },
  previewImage: {
    width: 50,
    height: 50,
  },
  previewFileIcon: {
    fontSize: 24,
  },
  previewText: {
    flex: 1,
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.text,
  },
  previewCloseText: {
    color: theme.textDim,
    fontSize: 14,
  },
  errText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.error,
    paddingVertical: 4,
  },
  quoteBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.inputBar.quoteBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.inputBar.quoteBorder,
  },
  quoteBarAccent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: theme.blueAccent,
    marginRight: 8,
  },
  quoteBarContent: {
    flex: 1,
  },
  quoteBarSender: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.blueAccent,
    marginBottom: 2,
  },
  quoteBarText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.textMuted,
  },
  quoteBarClose: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quoteBarCloseText: {
    color: theme.textDim,
    fontSize: 14,
  },
  });
}
