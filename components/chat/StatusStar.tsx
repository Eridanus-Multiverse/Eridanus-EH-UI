import { memo, useEffect } from "react";
import { Platform, StyleSheet, View, Text, Image } from "react-native";
import { colors, fonts } from "../../theme/colors";

function installKeyframes() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("eri-status-star-kf")) return;
  const s = document.createElement("style");
  s.id = "eri-status-star-kf";
  s.textContent = `
    @keyframes eriStatusPulse {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

const starSource = require("../../assets/chat/thinking-star.png");

function StatusStar({ connected }: { connected: boolean }) {
  useEffect(installKeyframes, []);

  return (
    <View style={styles.wrap}>
      <Image
        source={starSource}
        style={[
          styles.star,
          !connected && styles.starOff,
          Platform.OS === "web" && connected
            ? ({
                animationName: "eriStatusPulse",
                animationDuration: "2.4s",
                animationIterationCount: "infinite",
                animationTimingFunction: "steps(3, end)",
              } as any)
            : {},
        ]}
        resizeMode="contain"
      />
      <Text
        style={[styles.label, connected ? styles.labelOn : styles.labelOff]}
      >
        {connected ? "在线" : "离线"}
      </Text>
    </View>
  );
}

export default memo(StatusStar);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  star: {
    width: 18,
    height: 18,
    tintColor: colors.pixel.gold,
  },
  starOff: {
    tintColor: colors.textMuted,
    opacity: 0.35,
  },
  label: {
    fontFamily: fonts.pixel,
    fontSize: 8,
  },
  labelOn: {
    color: colors.pixel.goldDim,
  },
  labelOff: {
    color: colors.textMuted,
  },
});
