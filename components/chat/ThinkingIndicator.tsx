import { memo, useEffect } from "react";
import { Platform, StyleSheet, View, Image } from "react-native";
import { useChat } from "../../stores/chatStore";
import { colors } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";

// 发送后等待回复时显示在列表底部的"思考中"占位气泡。
// 仿 assistant 气泡皮肤；动画只用透明度呼吸（UI 铁律：不弹跳不位移），
// 三个像素方块错相位 + 思考星缓慢脉冲，steps() 保持像素感。
// 由 chatStore.awaitingReplySince 驱动：send 点亮、poll 到回复熄灭、
// 超时兜底熄灭（防止服务端异常时占位变僵尸）。

const AWAIT_TIMEOUT_MS = 5 * 60 * 1000;

function installKeyframes() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("eri-thinking-kf")) return;
  const s = document.createElement("style");
  s.id = "eri-thinking-kf";
  s.textContent = `
    @keyframes eriThinkCell {
      0%, 100% { opacity: 0.22; }
      50% { opacity: 0.92; }
    }
    @keyframes eriThinkStar {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

const starSource = require("../../assets/chat/thinking-star.png");

function cellAnim(delayMs: number) {
  if (Platform.OS !== "web") return {};
  return {
    animationName: "eriThinkCell",
    animationDuration: "1.6s",
    animationDelay: `${delayMs}ms`,
    animationIterationCount: "infinite",
    animationTimingFunction: "steps(4, end)",
  } as any;
}

function ThinkingIndicator({ forceShow, variant }: { forceShow?: boolean; variant?: "epsilon" | "cursa" } = {}) {
  useEffect(installKeyframes, []);
  const isCursa = variant === "cursa";
  const theme = useThemeTokens();
  const isEH = theme.key === "eventHorizon";

  const awaitingSince = useChat((s) => s.awaitingReplySince);
  const clearAwaitingReply = useChat((s) => s.clearAwaitingReply);

  useEffect(() => {
    if (forceShow || awaitingSince === null) return;
    const remain = AWAIT_TIMEOUT_MS - (Date.now() - awaitingSince);
    if (remain <= 0) {
      clearAwaitingReply();
      return;
    }
    const timer = setTimeout(clearAwaitingReply, remain);
    return () => clearTimeout(timer);
  }, [awaitingSince, clearAwaitingReply, forceShow]);

  if (!forceShow && awaitingSince === null) return null;

  if (isEH && Platform.OS === "web") {
    const ehCut = "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)";
    return (
      <View style={styles.row} {...{ dataSet: { msgfade: "appear" } } as any}>
        <div style={{
          backgroundColor: "rgba(255,255,255,0.12)",
          clipPath: ehCut,
          padding: 1,
          width: "fit-content",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingLeft: 12,
            paddingRight: 14,
            paddingTop: 8,
            paddingBottom: 8,
            backgroundColor: "rgba(24,24,26,0.94)",
            clipPath: ehCut,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
              animationName: "eriThinkStar",
              animationDuration: "2.4s",
              animationIterationCount: "infinite",
              animationTimingFunction: "steps(3, end)",
            }}>
              <circle cx="6" cy="6" r="4" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" fill="none" />
              <circle cx="6" cy="6" r="1.5" fill="rgba(255,255,255,0.6)" />
            </svg>
            <div style={{ ...cellAnim(0), width: 5, height: 5, backgroundColor: "rgba(255,255,255,0.8)" }} />
            <div style={{ ...cellAnim(280), width: 5, height: 5, backgroundColor: "rgba(255,255,255,0.8)" }} />
            <div style={{ ...cellAnim(560), width: 5, height: 5, backgroundColor: "rgba(255,255,255,0.8)" }} />
          </div>
        </div>
      </View>
    );
  }

  const cursaBubbleStyle = isCursa ? {
    backgroundColor: "rgba(26,20,42,0.75)",
    borderColor: "rgba(160,140,220,0.35)",
    ...(Platform.OS === "web" ? {
      boxShadow: "0 2px 12px rgba(0,0,0,0.4), 0 0 10px rgba(160,140,220,0.12)",
    } as any : {}),
  } : null;
  const cellColor = isCursa ? "#d7c8f8" : colors.pixel.gold;

  return (
    <View
      style={styles.row}
      {...(Platform.OS === "web" ? { dataSet: { msgfade: "appear" } } : {})}
    >
      <View style={[styles.bubble, cursaBubbleStyle]}>
        <Image
          source={starSource}
          style={[
            styles.star,
            isCursa && { tintColor: "#d7c8f8" },
            Platform.OS === "web"
              ? ({
                  animationName: "eriThinkStar",
                  animationDuration: "2.4s",
                  animationIterationCount: "infinite",
                  animationTimingFunction: "steps(3, end)",
                } as any)
              : {},
          ]}
          resizeMode="contain"
        />
        <View style={[styles.cell, { backgroundColor: cellColor }, cellAnim(0)]} />
        <View style={[styles.cell, { backgroundColor: cellColor }, cellAnim(280)]} />
        <View style={[styles.cell, { backgroundColor: cellColor }, cellAnim(560)]} />
      </View>
    </View>
  );
}

export default memo(ThinkingIndicator);

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    alignItems: "flex-start",
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 34,
    backgroundColor: "rgba(22,26,42,0.75)",
    borderWidth: 1,
    borderColor: "rgba(100,155,240,0.25)",
    borderRadius: 4,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 2px 12px rgba(0,0,0,0.4), 0 0 6px rgba(80,140,240,0.06)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          width: "fit-content",
        } as any)
      : {}),
  },
  star: {
    width: 13,
    height: 13,
    marginRight: 2,
    tintColor: colors.pixel.gold,
    ...(Platform.OS !== "web" ? { opacity: 0.8 } : {}),
  },
  cell: {
    width: 5,
    height: 5,
    backgroundColor: colors.pixel.gold,
    ...(Platform.OS !== "web" ? { opacity: 0.5 } : {}),
  },
});
