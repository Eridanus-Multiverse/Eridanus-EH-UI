import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { fonts } from "../../theme/colors";

interface Props {
  date: string;
}

function TimeSeparator({ date }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.text}>{date}</Text>
      </View>
    </View>
  );
}

export default memo(TimeSeparator);

const styles = StyleSheet.create({
  container: {
    alignItems: "center" as const,
    paddingVertical: 10,
  },
  badge: {
    backgroundColor: "rgba(200,216,240,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  text: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: "rgba(200,216,240,0.45)",
    letterSpacing: 1,
  },
});
