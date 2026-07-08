import { memo } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useThemeTokens } from "../../hooks/useTheme";

type ThemeDividerVariant = "ornate" | "line";

interface ThemeDividerProps {
  variant?: ThemeDividerVariant;
  color?: string;
  tickColor?: string;
  tickSize?: number;
  gradient?: string;
  style?: StyleProp<ViewStyle>;
  lineStyle?: StyleProp<ViewStyle>;
}

function lineBackground(gradient: string, color: string) {
  return Platform.OS === "web" ? ({ background: gradient } as any) : { backgroundColor: color };
}

function ThemeDivider({ variant = "ornate", color, tickColor, tickSize, gradient, style, lineStyle }: ThemeDividerProps) {
  const theme = useThemeTokens();
  const lineColor = color ?? theme.decor.dividerLineColor;
  const tickBorder = tickColor ?? theme.decor.dividerTickColor;
  const size = tickSize ?? theme.decor.dividerTickSize;
  const bg = gradient ?? (color ? lineColor : theme.decor.dividerGradient);

  if (variant === "line") {
    return <View style={[styles.lineOnly, lineBackground(bg, lineColor), style, lineStyle]} />;
  }

  return (
    <View style={[styles.ornate, style]}>
      <View style={[styles.tick, { width: size, height: size, borderColor: tickBorder }]} />
      <View style={[styles.line, lineBackground(bg, lineColor), lineStyle]} />
      <View style={[styles.tick, { width: size, height: size, borderColor: tickBorder }]} />
    </View>
  );
}

export default memo(ThemeDivider);

const styles = StyleSheet.create({
  ornate: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 3,
    paddingBottom: 3,
  },
  tick: {
    borderWidth: 1,
    backgroundColor: "transparent",
    transform: [{ rotate: "45deg" }],
  },
  line: {
    flex: 1,
    height: 1,
  },
  lineOnly: {
    height: 1,
  },
});
