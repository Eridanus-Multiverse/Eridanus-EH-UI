import { memo } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useThemeTokens } from "../../hooks/useTheme";

interface CrtScanlinesProps {
  color?: string;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

function CrtScanlines({ color, enabled, style }: CrtScanlinesProps) {
  const theme = useThemeTokens();
  const active = enabled ?? theme.decor.crtScanlines;
  if (!active) return null;
  const scanline = color ?? theme.decor.crtScanlineColor;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.overlay,
        Platform.OS === "web"
          ? ({
              background: "repeating-linear-gradient(0deg, transparent, transparent 2px, " + scanline + " 2px, " + scanline + " 4px)",
            } as any)
          : {},
        style,
      ]}
    />
  );
}

export default memo(CrtScanlines);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
});
