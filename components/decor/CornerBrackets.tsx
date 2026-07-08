import { memo } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useThemeTokens } from "../../hooks/useTheme";

interface CornerBracketsProps {
  color?: string;
  size?: number;
  offset?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}

function CornerBrackets({ color, size, offset, strokeWidth, style }: CornerBracketsProps) {
  const theme = useThemeTokens();
  const cornerSize = size ?? theme.decor.cornerSize;
  const cornerOffset = offset ?? theme.decor.cornerOffset;
  const width = strokeWidth ?? theme.decor.cornerStrokeWidth;
  const borderColor = color ?? theme.decor.cornerColor;
  const base = { width: cornerSize, height: cornerSize, borderColor };

  return (
    <View pointerEvents="none" style={[styles.root, style]}>
      <View style={[styles.corner, base, { top: cornerOffset, left: cornerOffset, borderTopWidth: width, borderLeftWidth: width }]} />
      <View style={[styles.corner, base, { top: cornerOffset, right: cornerOffset, borderTopWidth: width, borderRightWidth: width }]} />
      <View style={[styles.corner, base, { bottom: cornerOffset, left: cornerOffset, borderBottomWidth: width, borderLeftWidth: width }]} />
      <View style={[styles.corner, base, { bottom: cornerOffset, right: cornerOffset, borderBottomWidth: width, borderRightWidth: width }]} />
    </View>
  );
}

export default memo(CornerBrackets);

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  corner: {
    position: "absolute",
  },
});
