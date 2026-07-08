import { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, Platform, Animated } from "react-native";
import { api } from "../../services/api";
import { fonts } from "../../theme/colors";
import { EH_BUBBLE_CUT } from "../bridge/BridgeDashboard";
import { useThemeTokens } from "../../hooks/useTheme";

const isWeb = Platform.OS === "web";

if (isWeb && typeof document !== "undefined") {
  const id = "voice-call-css";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes vcBreathe {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.7; }
      }
      @keyframes vcHalo {
        0%, 100% { transform: scale(1); opacity: 0.55; }
        50% { transform: scale(1.12); opacity: 0.9; }
      }
      @keyframes vcRingSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      [data-vc-breathe="1"] { animation: vcBreathe 3s ease-in-out infinite; }
      [data-vc-halo="1"] { animation: vcHalo 4.5s ease-in-out infinite; will-change: transform, opacity; }
      [data-vc-ring="1"] { animation: vcRingSpin 90s linear infinite; will-change: transform; }
      [data-vc-talk]:active { background-color: rgba(205,225,255,0.06) !important; }
      [data-vc-talk-ds]:active { background-color: rgba(80,208,246,0.08) !important; }
    `;
    document.head.appendChild(s);
  }
}

type CallPhase = "idle" | "recording" | "uploading" | "thinking" | "playing";

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: "STANDBY",
  recording: "RECORDING",
  uploading: "TRANSMITTING",
  thinking: "DECODING",
  playing: "RECEIVING",
};

const PHASE_CN: Record<CallPhase, string> = {
  idle: "线路已通，按住就能说话",
  recording: "听着呢",
  uploading: "信号上行中",
  thinking: "在想怎么回你",
  playing: "在说话",
};

// EH theme: white/ice system. Deep-space: warm cyan/gold system.
const EH_PHASE_COLOR: Record<CallPhase, string> = {
  idle: "rgba(205,225,255,0.55)",
  recording: "#e6b450",
  uploading: "rgba(205,225,255,0.7)",
  thinking: "rgba(235,243,255,0.85)",
  playing: "rgba(205,225,255,0.65)",
};

const DS_PHASE_COLOR: Record<CallPhase, string> = {
  idle: "rgba(80,208,246,0.4)",
  recording: "#f5a855",
  uploading: "#fed66d",
  thinking: "#50d0f6",
  playing: "#50dcc8",
};

const BAR_COUNT = 36;

// 径向波形环几何：辐条内端贴在 RING_R 半径上，向外最长 BAR_MAX
const RING_SIZE = 320;
const RING_R = 110;
const BAR_MAX = 42;
const RING_TOP_INSET = RING_SIZE / 2 - RING_R - BAR_MAX; // barWrap 的 top 偏移

function cleanError(raw: string): string {
  let s = raw.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (s.length > 60) s = s.slice(0, 57) + "...";
  return s;
}

interface Props {
  onClose: () => void;
}

export default function VoiceCall({ onClose }: Props) {
  const theme = useThemeTokens();
  const isEH = theme.key === "eventHorizon";

  const [phase, setPhase] = useState<CallPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioQueueRef = useRef<{ seq: number; url: string; text: string }[]>([]);
  const playingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const barHeights = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15))
  ).current;
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (mountedRef.current) setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    connectWs();

    api.voiceCallStatus().then((r) => {
      if (mountedRef.current) console.log("[VoiceCall] API reachable, active:", r.active);
    }).catch((e) => {
      console.error("[VoiceCall] API unreachable:", e);
      if (mountedRef.current) setError("API不可达: " + cleanError(String(e.message || e)));
    });

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopRecording();
      stopPlayback();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    animateBars();
  }, [phase]);

  const connectWs = useCallback(() => {
    try {
      const url = api.voiceCallWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        if (mountedRef.current) setError(null);
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === "string" ? evt.data : "");
          handleWsMessage(msg);
        } catch {}
      };
      ws.onerror = () => {
        if (mountedRef.current && !opened) setError("连接失败");
      };
      ws.onclose = () => {
        if (mountedRef.current && !opened) setError("连接失败");
      };
    } catch {
      setError("无法建立连接");
    }
  }, []);

  const handleWsMessage = useCallback((msg: any) => {
    if (!mountedRef.current) return;
    switch (msg.type) {
      case "voice_ready":
        setError(null);
        break;
      case "voice_request_sent":
        setPhase("thinking");
        break;
      case "voice_reply_start":
        setPhase("playing");
        break;
      case "voice_chunk":
        audioQueueRef.current.push({ seq: msg.seq, url: msg.voice_url, text: msg.text || "" });
        audioQueueRef.current.sort((a, b) => a.seq - b.seq);
        if (!playingRef.current) playNext();
        break;
      case "voice_done":
        break;
      case "voice_chunk_error":
        break;
      case "voice_ended":
        if (mountedRef.current) onClose();
        break;
      case "voice_error":
        if (mountedRef.current) setError(msg.message || "通话异常");
        break;
    }
  }, [onClose]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const ensureAudioCtx = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const playNext = useCallback(async () => {
    if (!mountedRef.current) return;
    if (audioQueueRef.current.length === 0) {
      playingRef.current = false;
      if (mountedRef.current) setPhase("idle");
      return;
    }

    playingRef.current = true;
    if (mountedRef.current) setPhase("playing");
    const chunk = audioQueueRef.current.shift()!;

    try {
      const blobUrl = await api.fetchVoiceBlobUrl(chunk.url);
      if (!mountedRef.current) return;
      const resp = await fetch(blobUrl);
      const arrayBuf = await resp.arrayBuffer();
      URL.revokeObjectURL(blobUrl);

      const ctx = ensureAudioCtx();
      if (!ctx) { playNext(); return; }
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }

      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      if (!mountedRef.current) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      currentSourceRef.current = source;

      source.onended = () => {
        analyserRef.current = null;
        currentSourceRef.current = null;
        try { source.disconnect(); analyser.disconnect(); } catch {}
        playNext();
      };
      source.start();
    } catch {
      playNext();
    }
  }, [ensureAudioCtx]);

  const stopPlayback = useCallback(() => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.onended = null; currentSourceRef.current.stop(); } catch {}
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    playingRef.current = false;
    analyserRef.current = null;
  }, []);

  const mimeRef = useRef("audio/webm;codecs=opus");

  const startRecording = useCallback(async () => {
    if (phase === "recording" || phase === "uploading" || phase === "thinking") return;
    ensureAudioCtx();
    stopPlayback();
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });

      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "",
      ];
      let mime = "";
      for (const c of candidates) {
        if (!c || (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(c))) {
          mime = c;
          break;
        }
      }
      mimeRef.current = mime || "audio/webm";

      const mrOpts: MediaRecorderOptions = mime ? { mimeType: mime } : {};
      const mr = new MediaRecorder(stream, mrOpts);
      mediaRecRef.current = mr;

      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      analyserRef.current = analyser;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        analyserRef.current = null;
        audioCtx.close().catch(() => {});
        handleRecordingDone();
      };

      mr.start(100);
      setPhase("recording");
    } catch (e: any) {
      console.error("[VoiceCall] startRecording failed:", e);
      const msg = e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError"
        ? "麦克风权限被拒绝"
        : "录音启动失败: " + cleanError(String(e.message || e));
      setError(msg);
    }
  }, [phase, ensureAudioCtx, stopPlayback]);

  const stopRecording = useCallback(() => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
    mediaRecRef.current = null;
  }, []);

  const handleRecordingDone = useCallback(async () => {
    if (!mountedRef.current) return;
    const blob = new Blob(chunksRef.current, { type: mimeRef.current });
    chunksRef.current = [];
    console.log("[VoiceCall] blob ready:", blob.size, "bytes, type:", blob.type);
    if (blob.size < 500) {
      setPhase("idle");
      setError("录音太短");
      return;
    }

    setPhase("uploading");

    let stt: { ok: boolean; text: string; duration_ms: number };
    try {
      stt = await api.voiceTranscribe(blob);
    } catch (e: any) {
      console.error("[VoiceCall] transcribe failed:", e);
      if (mountedRef.current) { setPhase("idle"); setError("转录失败: " + cleanError(String(e.message || e))); }
      return;
    }

    if (!stt.text || !stt.text.trim()) {
      if (mountedRef.current) { setPhase("idle"); setError("没听清"); }
      return;
    }

    try {
      await api.voiceCallSend(stt.text);
    } catch (e: any) {
      console.error("[VoiceCall] send failed:", e);
      if (mountedRef.current) { setPhase("idle"); setError("发送失败: " + cleanError(String(e.message || e))); }
    }
  }, []);

  const handleEnd = useCallback(async () => {
    stopPlayback();
    stopRecording();
    try { await api.voiceCallEnd(); } catch {}
    onClose();
  }, [onClose]);

  const animateBars = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const tick = () => {
      if (!mountedRef.current) return;
      const analyser = analyserRef.current;

      if (analyser && (phase === "recording" || phase === "playing")) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
        for (let i = 0; i < BAR_COUNT; i++) {
          const val = (data[Math.min(i * step, data.length - 1)] || 0) / 255;
          barHeights[i].setValue(Math.max(0.05, val));
        }
      } else if (phase === "thinking") {
        const t = Date.now() / 200;
        for (let i = 0; i < BAR_COUNT; i++) {
          const v = 0.15 + 0.25 * Math.sin(t + i * 0.5);
          barHeights[i].setValue(v);
        }
      } else {
        const t = Date.now() / 1500;
        for (let i = 0; i < BAR_COUNT; i++) {
          const v = 0.08 + 0.1 * Math.sin(t + i * 0.3);
          barHeights[i].setValue(v);
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [phase, barHeights]);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const phaseColor = isEH ? EH_PHASE_COLOR[phase] : DS_PHASE_COLOR[phase];
  const busy = phase === "uploading" || phase === "thinking";

  const S = getStyles(isEH, phaseColor, phase);

  const overlayWebStyle: any = isWeb ? (isEH ? {
    backgroundImage: [
      "radial-gradient(1px 1px at 12% 22%, rgba(235,243,255,0.35) 50%, transparent 50%)",
      "radial-gradient(1px 1px at 78% 14%, rgba(235,243,255,0.25) 50%, transparent 50%)",
      "radial-gradient(1.5px 1.5px at 88% 64%, rgba(235,243,255,0.3) 50%, transparent 50%)",
      "radial-gradient(1px 1px at 30% 80%, rgba(235,243,255,0.2) 50%, transparent 50%)",
      "radial-gradient(1px 1px at 62% 38%, rgba(205,225,255,0.2) 50%, transparent 50%)",
      "radial-gradient(1.5px 1.5px at 8% 58%, rgba(205,225,255,0.25) 50%, transparent 50%)",
      "radial-gradient(1px 1px at 46% 10%, rgba(235,243,255,0.3) 50%, transparent 50%)",
      "radial-gradient(ellipse 120% 80% at 50% 42%, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.99) 70%)",
    ].join(","),
  } : {
    backgroundImage: [
      "radial-gradient(1px 1px at 12% 22%, rgba(200,216,240,0.5) 50%, transparent 50%)",
      "radial-gradient(1px 1px at 78% 14%, rgba(200,216,240,0.35) 50%, transparent 50%)",
      "radial-gradient(1.5px 1.5px at 88% 64%, rgba(255,223,146,0.4) 50%, transparent 50%)",
      "radial-gradient(1px 1px at 30% 80%, rgba(200,216,240,0.3) 50%, transparent 50%)",
      "radial-gradient(1px 1px at 62% 38%, rgba(200,216,240,0.25) 50%, transparent 50%)",
      "radial-gradient(1.5px 1.5px at 8% 58%, rgba(80,208,246,0.3) 50%, transparent 50%)",
      "radial-gradient(1px 1px at 46% 10%, rgba(200,216,240,0.4) 50%, transparent 50%)",
      "radial-gradient(ellipse 120% 80% at 50% 42%, rgba(10,16,38,0.9) 0%, rgba(4,6,18,0.98) 70%)",
    ].join(","),
  }) : undefined;

  return (
    <View style={S.root}>
      {/* background overlay */}
      <View style={[S.overlay, overlayWebStyle]} />

      {/* top status */}
      <View style={S.topBar}>
        <View style={[S.topEdge, isWeb && {
          background: `linear-gradient(90deg, transparent 5%, ${phaseColor}44 30%, ${phaseColor}88 50%, ${phaseColor}44 70%, transparent 95%)`,
        } as any]} />
        <View style={S.topInner}>
          <Text style={[S.statusLabel, { color: phaseColor }]}>
            {isEH ? `·VOICE·LINK·${PHASE_LABEL[phase]}·` : `·VOICE·LINK·${PHASE_LABEL[phase]}·`}
          </Text>
        </View>
      </View>

      {/* the star */}
      <View style={S.starArea}>
        {/* halo */}
        <View
          style={[S.halo, isWeb && {
            background: `radial-gradient(circle, ${phaseColor}38 0%, ${phaseColor}14 45%, transparent 70%)`,
            filter: isEH ? "blur(1px)" : "blur(2px)",
          } as any]}
          {...(isWeb ? { dataSet: { "vc-halo": "1" } } : {})}
        />

        {/* 径向波形环 */}
        <View style={S.ring} {...(isWeb ? { dataSet: { "vc-ring": "1" } } : {})}>
          {barHeights.map((h, i) => (
            <View
              key={i}
              style={[S.barWrap, {
                transform: [{ rotate: `${(i * 360) / BAR_COUNT}deg` }],
                ...(isWeb ? { transformOrigin: `1px ${RING_SIZE / 2 - RING_TOP_INSET}px` } : {}),
              } as any]}
            >
              <Animated.View
                style={[
                  S.bar,
                  {
                    backgroundColor: phaseColor,
                    height: h.interpolate({ inputRange: [0, 1], outputRange: [2, BAR_MAX] }),
                    opacity: h.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 0.6, 1] }),
                  },
                  isWeb && { boxShadow: `0 0 ${isEH ? 2 : 3}px ${phaseColor}66` } as any,
                ]}
              />
            </View>
          ))}
        </View>

        {/* orbit rings */}
        <View style={[S.orbitOuter, { borderColor: `${phaseColor}22` }]} />
        <View style={[S.orbitInner, { borderColor: `${phaseColor}3a` }]} />

        {/* core */}
        <View style={[S.core, isWeb && {
          background: isEH
            ? `radial-gradient(circle, rgba(255,255,255,0.95) 0%, ${phaseColor}cc 22%, ${phaseColor}44 48%, transparent 70%)`
            : `radial-gradient(circle, rgba(255,255,255,0.92) 0%, ${phaseColor}cc 24%, ${phaseColor}44 50%, transparent 70%)`,
        } as any]}>
          <Text style={[S.coreGlyph, isWeb && {
            textShadow: isEH ? "0 0 6px rgba(0,0,0,0.7)" : "0 0 8px rgba(4,6,18,0.55)",
          } as any]}>A</Text>
        </View>
      </View>

      {/* timer */}
      <Text style={[S.timer, isWeb && { textShadow: `0 0 12px ${phaseColor}` } as any]}>
        {fmtTime(elapsed)}
      </Text>

      {/* phase label */}
      <Text style={[S.phaseCn, { color: phaseColor }]}>{PHASE_CN[phase]}</Text>
      <Text style={S.signalLabel}>
        {isEH ? "DEEP FIELD · 144.4 LY · SIG LOCK" : "EH-STAR · 144.4 ly · signal locked"}
      </Text>

      {/* error */}
      {error && (
        <Text style={S.errorText}>{error}</Text>
      )}

      {/* console buttons */}
      <View style={S.btnRow}>
        <TouchableOpacity
          style={[S.endBtn, isWeb && S.endBtnClip]}
          onPress={handleEnd}
          activeOpacity={0.6}
        >
          <View style={[S.panelTopline, { backgroundColor: isEH ? "rgba(200,80,80,0.4)" : "rgba(229,75,75,0.5)" }]} />
          <Text style={S.endIcon}>✕</Text>
          <Text style={S.endLabel}>END</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            S.talkBtn,
            isWeb && S.talkBtnClip,
            phase === "recording" && S.talkBtnActive,
            busy && { opacity: 0.5 },
          ]}
          onPressIn={startRecording}
          onPressOut={stopRecording}
          activeOpacity={0.75}
          disabled={busy}
          {...(isWeb ? { dataSet: { [isEH ? "vc-talk" : "vc-talk-ds"]: "1" } } : {})}
        >
          <View style={[S.panelTopline, {
            backgroundColor: phase === "recording"
              ? (isEH ? "rgba(230,180,80,0.5)" : "rgba(245,168,85,0.6)")
              : (isEH ? "rgba(205,225,255,0.2)" : "rgba(80,208,246,0.45)"),
          }]} />
          <View
            style={[S.lamp, {
              backgroundColor: phase === "recording"
                ? (isEH ? "#e6b450" : "#f5a855")
                : busy
                  ? (isEH ? "rgba(235,243,255,0.6)" : "#fed66d")
                  : (isEH ? "rgba(205,225,255,0.75)" : "rgba(80,208,246,0.85)"),
            }, isWeb && {
              boxShadow: phase === "recording"
                ? (isEH ? "0 0 6px rgba(230,180,80,0.8)" : "0 0 8px rgba(245,168,85,0.9)")
                : (isEH ? "0 0 5px rgba(205,225,255,0.5)" : "0 0 6px rgba(80,208,246,0.7)"),
            } as any]}
            {...(isWeb && (phase === "recording" || busy) ? { dataSet: { "vc-breathe": "1" } } : {})}
          />
          <View style={S.talkCol}>
            <Text style={[S.talkTitle, {
              color: phase === "recording"
                ? (isEH ? "#e6b450" : "#f5a855")
                : (isEH ? "rgba(205,225,255,0.85)" : "#50d0f6"),
            }]}>
              {phase === "recording" ? "TRANSMITTING" : busy ? "STAND BY" : "PUSH TO TALK"}
            </Text>
            <Text style={S.talkSub}>
              {phase === "recording" ? "松手发送" : busy ? "稍等一下" : "按住说话"}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={S.endBtnGhost} />
      </View>

      {/* bottom edge */}
      <View style={[S.bottomEdge, isWeb && {
        background: `linear-gradient(90deg, transparent 10%, ${phaseColor}33 50%, transparent 90%)`,
      } as any]} />
    </View>
  );
}

function getStyles(isEH: boolean, phaseColor: string, phase: string) {
  // EH: pure black, square corners, ice-blue palette
  // Deep-space: deep navy, rounded corners, warm cyan/gold palette
  const overlayBg = isEH ? "rgba(0,0,0,0.97)" : "rgba(4,6,18,0.96)";
  const coreBg = isEH ? "rgba(205,225,255,0.08)" : "rgba(80,208,246,0.25)";
  const haloBg = isEH ? "rgba(205,225,255,0.06)" : "rgba(80,208,246,0.08)";
  const timerColor = isEH ? "rgba(235,243,255,0.8)" : "rgba(200,216,240,0.75)";
  const signalColor = isEH ? "rgba(205,225,255,0.25)" : "rgba(200,216,240,0.3)";
  const talkSubColor = isEH ? "rgba(205,225,255,0.35)" : "rgba(200,216,240,0.4)";

  const endBtnBg = isEH ? "rgba(0,0,0,0.96)" : "rgba(18,10,16,0.92)";
  const endBtnBorder = isEH ? "rgba(200,80,80,0.4)" : "rgba(229,75,75,0.35)";
  const endIconColor = isEH ? "#c85050" : "#e54b4b";
  const endLabelColor = isEH ? "rgba(200,80,80,0.65)" : "rgba(229,75,75,0.7)";

  const talkBtnBg = isEH ? "rgba(0,0,0,0.96)" : "rgba(8,14,32,0.92)";
  const talkBtnBorder = isEH ? "rgba(205,225,255,0.3)" : "rgba(80,208,246,0.35)";
  const talkBtnActiveBg = isEH ? "rgba(0,0,0,0.96)" : "rgba(26,16,8,0.94)";
  const talkBtnActiveBorder = isEH ? "rgba(230,180,80,0.5)" : "rgba(245,168,85,0.55)";

  // Clip paths: EH = sharp square cuts, deep-space = same (both terminal-style)
  const endClip = isEH
    ? { clipPath: "polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)" }
    : { clipPath: "polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)" };
  const talkClip = isEH
    ? { clipPath: EH_BUBBLE_CUT }
    : { clipPath: EH_BUBBLE_CUT };

  const barBorderRadius = isEH ? 0 : 1;

  return {
    root: {
      position: "absolute" as const,
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 999,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    overlay: {
      position: "absolute" as const,
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: overlayBg,
    },
    topBar: {
      position: "absolute" as const,
      top: 0, left: 0, right: 0,
      zIndex: 10,
    },
    topEdge: {
      height: isEH ? 1 : 2,
      ...(isWeb ? {} : { backgroundColor: isEH ? "rgba(205,225,255,0.15)" : "rgba(80,208,246,0.2)" }),
    },
    topInner: {
      paddingVertical: 12,
      alignItems: "center" as const,
    },
    statusLabel: {
      fontFamily: fonts.silkscreen,
      fontSize: 10,
      letterSpacing: isEH ? 3 : 4,
    },
    starArea: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      zIndex: 2,
      marginBottom: 8,
    },
    halo: {
      position: "absolute" as const,
      width: RING_SIZE,
      height: RING_SIZE,
      borderRadius: RING_SIZE / 2,
      ...(isWeb ? {} : { backgroundColor: haloBg }),
    },
    ring: {
      position: "absolute" as const,
      width: RING_SIZE,
      height: RING_SIZE,
    },
    barWrap: {
      position: "absolute" as const,
      left: RING_SIZE / 2 - 2,
      top: RING_TOP_INSET,
      width: 4,
      height: BAR_MAX,
      justifyContent: "flex-end" as const,
      alignItems: "center" as const,
    },
    bar: {
      width: 2,
      borderRadius: barBorderRadius,
      minHeight: 2,
    },
    orbitOuter: {
      position: "absolute" as const,
      width: RING_R * 2 - 8,
      height: RING_R * 2 - 8,
      borderRadius: RING_R,
      borderWidth: 1,
    },
    orbitInner: {
      position: "absolute" as const,
      width: 150,
      height: 150,
      borderRadius: 75,
      borderWidth: 1,
    },
    core: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      ...(isWeb ? {} : { backgroundColor: coreBg }),
    },
    coreGlyph: {
      fontFamily: fonts.silkscreen,
      fontSize: 34,
      color: isEH ? "rgba(0,0,0,0.9)" : "rgba(8,12,30,0.88)",
      lineHeight: 40,
    },
    timer: {
      fontFamily: fonts.silkscreen,
      fontSize: 26,
      color: timerColor,
      letterSpacing: 3,
      marginTop: 4,
      zIndex: 2,
    },
    phaseCn: {
      fontFamily: fonts.pixel,
      fontSize: 12,
      letterSpacing: isEH ? 2 : 1,
      marginTop: 10,
      zIndex: 2,
    },
    signalLabel: {
      fontFamily: fonts.pixel,
      fontSize: 9,
      color: signalColor,
      letterSpacing: isEH ? 3 : 2,
      marginTop: 8,
      zIndex: 2,
    },
    errorText: {
      fontFamily: fonts.pixel,
      fontSize: 11,
      color: isEH ? "#c85050" : "#e54b4b",
      marginTop: 12,
      zIndex: 2,
    },
    btnRow: {
      flexDirection: "row" as const,
      gap: 18,
      zIndex: 2,
      position: "absolute" as const,
      bottom: 56,
      alignItems: "center" as const,
    },
    endBtnClip: endClip as any,
    talkBtnClip: talkClip as any,
    panelTopline: {
      position: "absolute" as const,
      top: 0,
      left: 12,
      right: 12,
      height: 1,
    },
    endBtn: {
      width: 64,
      height: 58,
      borderWidth: 1,
      borderColor: endBtnBorder,
      backgroundColor: endBtnBg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    endBtnGhost: {
      width: 64,
      height: 58,
    },
    endIcon: {
      fontFamily: fonts.silkscreen,
      fontSize: 14,
      color: endIconColor,
    },
    endLabel: {
      fontFamily: fonts.silkscreen,
      fontSize: 8,
      letterSpacing: 2,
      color: endLabelColor,
      marginTop: 3,
    },
    talkBtn: {
      width: 178,
      height: 58,
      borderWidth: 1,
      borderColor: talkBtnBorder,
      backgroundColor: talkBtnBg,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: 16,
      gap: 12,
    },
    talkBtnActive: {
      borderColor: talkBtnActiveBorder,
      backgroundColor: talkBtnActiveBg,
    },
    lamp: {
      width: 8,
      height: 8,
      borderRadius: isEH ? 0 : 4,
    },
    talkCol: {
      flex: 1,
    },
    talkTitle: {
      fontFamily: fonts.silkscreen,
      fontSize: 10,
      letterSpacing: 1.5,
    },
    talkSub: {
      fontFamily: fonts.pixel,
      fontSize: 9,
      color: talkSubColor,
      letterSpacing: 1,
      marginTop: 3,
    },
    bottomEdge: {
      position: "absolute" as const,
      bottom: 0, left: 0, right: 0,
      height: isEH ? 1 : 2,
      ...(isWeb ? {} : { backgroundColor: isEH ? "rgba(205,225,255,0.08)" : "rgba(80,208,246,0.1)" }),
    },
  };
}
