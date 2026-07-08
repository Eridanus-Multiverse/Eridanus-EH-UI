import { useMemo } from "react";
import { View, Image, Pressable, StyleSheet, Platform } from "react-native";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";

const isWeb = Platform.OS === "web";

const ICON_SOURCES = {
  chat: require("../../assets/tab-icons/chat.png"),
  group: require("../../assets/tab-icons/group.png"),
  home: require("../../assets/tab-icons/home.png"),
  star: require("../../assets/tab-icons/star.png"),
  terminal: require("../../assets/tab-icons/endpoint.png"),
  settings: require("../../assets/tab-icons/setting.png"),
};

const TAB_ITEMS: { key: string; icon: keyof typeof ICON_SOURCES }[] = [
  { key: "chat", icon: "chat" },
  { key: "terminal", icon: "terminal" },
  { key: "home", icon: "home" },
  { key: "group", icon: "group" },
  { key: "settings", icon: "settings" },
];

interface Props {
  activeTab?: string;
  onTabPress?: (tab: string) => void;
}

export default function DesktopVoyageStrip({ activeTab, onTabPress }: Props) {
  const theme = useThemeTokens();
  const S = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={S.root}>
      <View style={S.tabRow}>
        {TAB_ITEMS.map((t) => (
          <Pressable
            key={t.key}
            style={[S.tabItem, activeTab === t.key && S.tabItemActive]}
            onPress={() => onTabPress?.(t.key)}
          >
            <Image
              source={ICON_SOURCES[t.icon]}
              style={[S.tabIcon, { tintColor: activeTab === t.key ? theme.accent : theme.desktop.textMuted }]}
              resizeMode="contain"
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  root: {
    height: 120,
    backgroundColor: theme.desktop.rootBg,
    borderTopWidth: 1,
    borderTopColor: theme.desktop.borderSubtle,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  tabRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 2,
  },
  tabItem: {
    padding: 8,
  },
  tabItemActive: {
    backgroundColor: theme.desktop.activeBg,
  },
  tabIcon: {
    width: 20,
    height: 20,
  },
  });
}
