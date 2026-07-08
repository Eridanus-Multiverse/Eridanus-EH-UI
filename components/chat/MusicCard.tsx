import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, ScrollView } from "react-native";
import { Audio } from "expo-av";
import { api } from "../../services/api";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";

interface LrcLine { time: number; text: string; ttext?: string }

function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/^\[(\d+):(\d+)\.(\d+)\](.*)/);
    if (!m) continue;
    const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 2 ? 100 : 1000);
    const text = m[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function mergeTlyric(lines: LrcLine[], tlyric: string): LrcLine[] {
  const tlines = parseLrc(tlyric);
  const tmap = new Map(tlines.map(t => [Math.round(t.time * 10), t.text]));
  return lines.map(l => ({ ...l, ttext: tmap.get(Math.round(l.time * 10)) }));
}

interface Props {
  songId: string;
  songName: string;
  artist: string;
}

export default function MusicCard({ songId, songName, artist }: Props) {
  const theme = useThemeTokens();
  const S = useMemo(() => createStyles(theme), [theme]);
  const mc = theme.musicCard;

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const soundRef = useRef<Audio.Sound | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lyricsScrollRef = useRef<ScrollView>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    setPlaying(false);
    setProgress(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const togglePlay = useCallback(async () => {
    if (playing && soundRef.current) {
      await soundRef.current.pauseAsync();
      setPlaying(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    if (soundRef.current) {
      await soundRef.current.playAsync();
      setPlaying(true);
      startProgressUpdater();
      return;
    }
    setLoading(true);
    try {
      const data = await api.musicPlay(songId);
      if (!data.url) throw new Error("no url");
      const { sound } = await Audio.Sound.createAsync({ uri: data.url }, { shouldPlay: true });
      soundRef.current = sound;
      const status = await sound.getStatusAsync();
      if (status.isLoaded) setDuration(status.durationMillis || 0);
      setPlaying(true);
      startProgressUpdater();
      sound.setOnPlaybackStatusUpdate((s) => {
        if (!s.isLoaded) return;
        if (s.didJustFinish) { setPlaying(false); setProgress(0); if (intervalRef.current) clearInterval(intervalRef.current); }
      });
    } catch {} finally { setLoading(false); }
  }, [playing, songId]);

  const startProgressUpdater = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      if (!soundRef.current) return;
      const s = await soundRef.current.getStatusAsync();
      if (s.isLoaded) {
        const pos = s.positionMillis || 0;
        const dur = s.durationMillis || 1;
        setProgress(pos / dur);
        setDuration(dur);
        updateActiveLyric(pos / 1000);
      }
    }, 300);
  }, []);

  const updateActiveLyric = useCallback((timeSec: number) => {
    if (!lyrics.length) return;
    let idx = -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (timeSec >= lyrics[i].time) { idx = i; break; }
    }
    setActiveLine(idx);
  }, [lyrics]);

  const toggleLyrics = useCallback(async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (lyrics.length) return;
    setLyricsLoading(true);
    try {
      const data = await api.musicLyrics(songId);
      if (data.lrc) {
        let lines = parseLrc(data.lrc);
        if (data.tlyric) lines = mergeTlyric(lines, data.tlyric);
        setLyrics(lines);
      }
    } catch {} finally { setLyricsLoading(false); }
  }, [expanded, lyrics.length, songId]);

  useEffect(() => {
    if (activeLine >= 0 && lyricsScrollRef.current && expanded) {
      lyricsScrollRef.current.scrollTo({ y: Math.max(0, activeLine * 44 - 60), animated: true });
    }
  }, [activeLine, expanded]);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <View style={S.card}>
      <View style={S.header}>
        <View style={S.info}>
          <Text style={S.title} numberOfLines={1}>{songName}</Text>
          <Text style={S.artist} numberOfLines={1}>{artist}</Text>
        </View>
        <TouchableOpacity style={S.playBtn} onPress={togglePlay} activeOpacity={0.7}>
          {loading ? (
            <ActivityIndicator size="small" color={mc.controlColor} />
          ) : (
            <Text style={S.playIcon}>{playing ? "■" : "▶"}</Text>
          )}
        </TouchableOpacity>
      </View>
      <View style={S.progressRow}>
        <View style={S.progressBar}>
          <View style={[S.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>
        <Text style={S.timeText}>{duration ? formatTime(progress * duration) : "0:00"}</Text>
      </View>
      <TouchableOpacity onPress={toggleLyrics} activeOpacity={0.7}>
        <Text style={S.lyricToggle}>{expanded ? "收起歌词 ▲" : "展开歌词 ▼"}</Text>
      </TouchableOpacity>
      {expanded && (
        <ScrollView ref={lyricsScrollRef} style={S.lyricBox} nestedScrollEnabled>
          {lyricsLoading ? (
            <ActivityIndicator color={mc.lyricDimColor} style={{ marginVertical: 16 }} />
          ) : lyrics.length === 0 ? (
            <Text style={S.lyricLine}>暂无歌词</Text>
          ) : (
            lyrics.map((l, i) => (
              <View key={i} style={S.lyricItem}>
                <Text style={[S.lyricLine, i === activeLine && S.lyricLineActive]}>{l.text}</Text>
                {l.ttext && <Text style={[S.lyricTrans, i === activeLine && S.lyricTransActive]}>{l.ttext}</Text>}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const mc = theme.musicCard;
  return StyleSheet.create({
    card: {
      backgroundColor: mc.bg,
      borderWidth: 1,
      borderColor: mc.border,
      padding: 12,
      marginVertical: 4,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
    },
    info: { flex: 1, marginRight: 10 },
    title: { fontFamily: fonts.pixel, fontSize: 12, color: mc.titleColor },
    artist: { fontFamily: fonts.pixel, fontSize: 10, color: mc.artistColor, marginTop: 2 },
    playBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: mc.controlBg,
      justifyContent: "center",
      alignItems: "center",
    },
    playIcon: { fontFamily: fonts.silkscreen, fontSize: 12, color: mc.controlColor },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      gap: 8,
    },
    progressBar: {
      flex: 1,
      height: 3,
      backgroundColor: mc.progressBg,
      overflow: "hidden" as const,
    },
    progressFill: {
      height: 3,
      backgroundColor: mc.progressFill,
    },
    timeText: { fontFamily: fonts.pixel, fontSize: 8, color: mc.artistColor, width: 30 },
    lyricToggle: {
      fontFamily: fonts.pixel,
      fontSize: 9,
      color: mc.lyricDimColor,
      textAlign: "center" as const,
      marginTop: 8,
    },
    lyricBox: {
      maxHeight: 240,
      marginTop: 8,
      backgroundColor: mc.lyricBg,
      padding: 10,
    },
    lyricItem: { paddingVertical: 6 },
    lyricLine: {
      fontFamily: fonts.pixel,
      fontSize: 12,
      color: mc.lyricColor,
      textAlign: "center" as const,
      lineHeight: 18,
    },
    lyricLineActive: { color: mc.lyricActiveColor },
    lyricTrans: {
      fontFamily: fonts.pixel,
      fontSize: 10,
      color: mc.lyricDimColor,
      textAlign: "center" as const,
      marginTop: 2,
    },
    lyricTransActive: { color: mc.lyricColor },
  });
}
