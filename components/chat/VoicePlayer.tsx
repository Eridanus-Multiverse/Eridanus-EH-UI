import { memo, useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { api } from "../../services/api";
import { colors, fonts } from "../../theme/colors";

if (Platform.OS === "web" && typeof document !== "undefined") {
  const id = "voice-player-keyframes";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes vp-bar {
        0%, 100% { transform: scaleY(0.3); }
        50% { transform: scaleY(1); }
      }
      [data-vp-playing="1"] .vp-bar {
        animation: vp-bar 0.8s ease-in-out infinite;
      }
      [data-vp-playing="0"] .vp-bar {
        transform: scaleY(0.45);
      }
      .vp-progress-track {
        position: absolute;
        left: 0; bottom: 0;
        height: 2px;
        background: rgba(200,216,240,0.2);
        width: 100%;
        border-radius: 1px;
        overflow: hidden;
      }
      .vp-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, rgba(200,216,240,0.5), rgba(200,216,240,0.8));
        border-radius: 1px;
        transition: width 0.25s linear;
      }
    `;
    document.head.appendChild(s);
  }
}

interface Props {
  voiceUrl: string;
  onToggleText?: () => void;
  showingText?: boolean;
}

function formatDuration(sec: number) {
  if (!sec || !isFinite(sec)) return "0″";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}′${s.toString().padStart(2, "0")}″` : `${s}″`;
}

const BAR_COUNT = 18;
const BAR_DELAYS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const center = BAR_COUNT / 2;
  const dist = Math.abs(i - center) / center;
  return (dist * 0.4 + Math.sin(i * 0.7) * 0.15).toFixed(2);
});

function VoicePlayer({ voiceUrl, onToggleText, showingText }: Props) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const frameRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const ensureAudio = useCallback(async () => {
    if (audioRef.current) return audioRef.current;
    setLoading(true);
    setError(false);
    try {
      const blobUrl = await api.fetchVoiceBlobUrl(voiceUrl);
      blobUrlRef.current = blobUrl;
      const el = new Audio(blobUrl);
      el.preload = "auto";
      await new Promise<void>((resolve, reject) => {
        el.addEventListener("loadedmetadata", () => resolve(), { once: true });
        el.addEventListener("error", () => reject(new Error("load failed")), { once: true });
        el.load();
      });
      setDuration(el.duration);
      el.addEventListener("ended", () => {
        setPlaying(false);
        setProgress(0);
      });
      audioRef.current = el;
      return el;
    } catch {
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [voiceUrl]);

  const tickProgress = useCallback(() => {
    const el = audioRef.current;
    if (!el || el.paused) return;
    setProgress(el.duration > 0 ? el.currentTime / el.duration : 0);
    frameRef.current = requestAnimationFrame(tickProgress);
  }, []);

  const togglePlay = useCallback(async () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      setPlaying(false);
      return;
    }
    const el = await ensureAudio();
    if (!el) return;
    try {
      await el.play();
      setPlaying(true);
      tickProgress();
    } catch {
      setError(true);
    }
  }, [playing, ensureAudio, tickProgress]);

  const handleSeek = useCallback((e: any) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX || e.nativeEvent?.pageX || 0) - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    audioRef.current.currentTime = ratio * audioRef.current.duration;
    setProgress(ratio);
  }, []);

  return (
    <View style={s.root}>
      <View
        style={s.bar}
        {...(Platform.OS === "web" ? { dataSet: { vpPlaying: playing ? "1" : "0" } } : {})}
      >
        <TouchableOpacity
          onPress={togglePlay}
          style={s.playBtn}
          activeOpacity={0.6}
          disabled={loading}
        >
          <Text style={s.playIcon}>
            {loading ? "◌" : error ? "✕" : playing ? "⏸" : "▶"}
          </Text>
        </TouchableOpacity>

        {Platform.OS === "web" ? (
          <div
            style={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, height: 20, cursor: "pointer", position: "relative" }}
            onClick={handleSeek}
          >
            {BAR_DELAYS.map((delay, i) => {
              const filled = progress > i / BAR_COUNT;
              return (
                <div
                  key={i}
                  className="vp-bar"
                  style={{
                    width: 2.5,
                    height: 16,
                    borderRadius: 1,
                    background: filled
                      ? "rgba(200,216,240,0.8)"
                      : "rgba(200,216,240,0.3)",
                    transformOrigin: "center",
                    animationDelay: playing ? `${delay}s` : undefined,
                    transition: playing ? undefined : "transform 0.3s ease, background 0.2s ease",
                  }}
                />
              );
            })}
          </div>
        ) : (
          <View style={s.waveformNative}>
            {BAR_DELAYS.map((_, i) => {
              const filled = progress > i / BAR_COUNT;
              return (
                <View
                  key={i}
                  style={[
                    s.barNative,
                    { backgroundColor: filled ? "rgba(200,216,240,0.8)" : "rgba(200,216,240,0.3)" },
                  ]}
                />
              );
            })}
          </View>
        )}

        <Text style={s.duration}>
          {playing || progress > 0
            ? formatDuration((audioRef.current?.currentTime ?? 0))
            : formatDuration(duration)}
        </Text>
      </View>

      {onToggleText && (
        <TouchableOpacity onPress={onToggleText} style={s.textToggle} activeOpacity={0.6}>
          <Text style={s.textToggleLabel}>
            {showingText ? "收起文字" : "转文字"}
          </Text>
        </TouchableOpacity>
      )}

      {Platform.OS === "web" && (
        <div className="vp-progress-track">
          <div className="vp-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </View>
  );
}

export default memo(VoicePlayer, (prev, next) =>
  prev.voiceUrl === next.voiceUrl && prev.showingText === next.showingText
);

const s = StyleSheet.create({
  root: {
    position: "relative",
    marginBottom: 4,
    paddingBottom: 2,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    minWidth: 180,
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(200,216,240,0.2)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    fontSize: 12,
    color: colors.blueAccent,
    marginLeft: 1,
  },
  waveformNative: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1.5,
    flex: 1,
    height: 20,
  },
  barNative: {
    width: 2.5,
    height: 8,
    borderRadius: 1,
  },
  duration: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textDim,
    minWidth: 28,
    textAlign: "right",
  },
  textToggle: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(200,216,240,0.12)",
    borderWidth: 1,
    borderColor: "rgba(200,216,240,0.2)",
    borderRadius: 3,
  },
  textToggleLabel: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: colors.textDim,
  },
});
