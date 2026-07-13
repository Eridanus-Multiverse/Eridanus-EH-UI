import { useEffect, useState, useCallback, useMemo } from "react";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Image, Platform, Pressable, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";
import { useChat } from "../../stores/chatStore";
import { useConnection } from "../../stores/connectionStore";
import { useWebKeyboardOpen } from "../../hooks/useWebKeyboard";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import DesktopSidebar from "../../components/desktop/DesktopSidebar";
import DesktopRightColumn from "../../components/desktop/DesktopRightColumn";
import DesktopVoyageStrip from "../../components/desktop/DesktopVoyageStrip";
import CrtScanlines from "../../components/decor/CrtScanlines";
import NoiseOverlay from "../../components/decor/NoiseOverlay";


const ICON_SOURCES = {
  chat: require("../../assets/tab-icons/chat.png"),
  group: require("../../assets/tab-icons/group.png"),
  home: require("../../assets/tab-icons/home.png"),
  star: require("../../assets/tab-icons/star.png"),
  terminal: require("../../assets/tab-icons/endpoint.png"),
  settings: require("../../assets/tab-icons/setting.png"),
};

const TAB_ICON_BY_ROUTE: Record<string, keyof typeof ICON_SOURCES> = {
  chat: "chat",
  group: "group",
  home: "home",
  terminal: "terminal",
  settings: "settings",
};

function HudTabIcon({ name, focused }: { name: string; focused: boolean }) {
  const c = focused ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)";
  const s = 26;
  const icons: Record<string, JSX.Element> = {
    chat: (
      <svg width={s} height={s} viewBox="0 0 26 26" fill="none">
        {/* Cut-corner comm bubble */}
        <path d="M5 3 L20 3 L23 6 L23 16 L20 19 L10 19 L6 24 L6 19 L3 16 L3 6 Z"
          stroke={c} strokeWidth="1.1" fill="none" />
        <line x1="8" y1="8" x2="18" y2="8" stroke={c} strokeWidth="0.8" />
        <line x1="8" y1="11" x2="16" y2="11" stroke={c} strokeWidth="0.8" />
        <line x1="8" y1="14" x2="13" y2="14" stroke={c} strokeWidth="0.8" />
      </svg>
    ),
    group: (
      <svg width={s} height={s} viewBox="0 0 26 26" fill="none">
        {/* 3 nodes connected — network/bridge */}
        <rect x="2" y="2" width="6" height="6" stroke={c} strokeWidth="1" />
        <rect x="18" y="2" width="6" height="6" stroke={c} strokeWidth="1" />
        <rect x="10" y="17" width="6" height="6" stroke={c} strokeWidth="1" />
        <line x1="8" y1="5" x2="18" y2="5" stroke={c} strokeWidth="0.8" />
        <line x1="5" y1="8" x2="13" y2="17" stroke={c} strokeWidth="0.8" />
        <line x1="21" y1="8" x2="13" y2="17" stroke={c} strokeWidth="0.8" />
        <circle cx="5" cy="5" r="1.5" fill={focused ? c : "none"} stroke={c} strokeWidth="0.5" />
        <circle cx="21" cy="5" r="1.5" fill={focused ? c : "none"} stroke={c} strokeWidth="0.5" />
        <circle cx="13" cy="20" r="1.5" fill={focused ? c : "none"} stroke={c} strokeWidth="0.5" />
      </svg>
    ),
    home: (
      <svg width={s} height={s} viewBox="0 0 26 26" fill="none">
        {/* Hexagonal base — station */}
        <path d="M13 2 L23 8 L23 18 L13 24 L3 18 L3 8 Z" stroke={c} strokeWidth="1.2" fill="none" />
        <path d="M13 7 L19 10.5 L19 17.5 L13 21 L7 17.5 L7 10.5 Z" stroke={c} strokeWidth="0.8" fill="none" />
        <circle cx="13" cy="14" r="2" fill={focused ? c : "none"} stroke={c} strokeWidth="0.8" />
      </svg>
    ),
    star: (
      <svg width={s} height={s} viewBox="0 0 26 26" fill="none">
        {/* Starcourt — star chart with crosshair */}
        <circle cx="13" cy="13" r="11" stroke={c} strokeWidth="0.8" strokeDasharray="3 2" />
        <line x1="13" y1="1" x2="13" y2="6" stroke={c} strokeWidth="0.8" />
        <line x1="13" y1="20" x2="13" y2="25" stroke={c} strokeWidth="0.8" />
        <line x1="1" y1="13" x2="6" y2="13" stroke={c} strokeWidth="0.8" />
        <line x1="20" y1="13" x2="25" y2="13" stroke={c} strokeWidth="0.8" />
        <circle cx="13" cy="13" r="3" stroke={c} strokeWidth="1" />
        <circle cx="9" cy="8" r="1" fill={c} />
        <circle cx="18" cy="10" r="0.8" fill={c} />
        <circle cx="16" cy="18" r="0.6" fill={c} />
        <circle cx="7" cy="16" r="0.7" fill={c} />
      </svg>
    ),
    terminal: (
      <svg width={s} height={s} viewBox="0 0 26 26" fill="none">
        {/* Terminal — bracket + cursor */}
        <path d="M4 4 L2 4 L2 22 L4 22" stroke={c} strokeWidth="1.2" fill="none" />
        <path d="M22 4 L24 4 L24 22 L22 22" stroke={c} strokeWidth="1.2" fill="none" />
        <path d="M7 13 L11 9 M7 13 L11 17" stroke={c} strokeWidth="1.2" fill="none" />
        <line x1="13" y1="17" x2="19" y2="17" stroke={c} strokeWidth="1.2" />
      </svg>
    ),
    settings: (
      <svg width={s} height={s} viewBox="0 0 26 26" fill="none">
        {/* Control panel — sliders */}
        <line x1="5" y1="4" x2="5" y2="22" stroke={c} strokeWidth="0.8" />
        <line x1="13" y1="4" x2="13" y2="22" stroke={c} strokeWidth="0.8" />
        <line x1="21" y1="4" x2="21" y2="22" stroke={c} strokeWidth="0.8" />
        <rect x="3" y="7" width="4" height="3" rx="0.5" fill={c} />
        <rect x="11" y="14" width="4" height="3" rx="0.5" fill={c} />
        <rect x="19" y="10" width="4" height="3" rx="0.5" fill={c} />
        <line x1="2" y1="4" x2="8" y2="4" stroke={c} strokeWidth="0.6" />
        <line x1="10" y1="4" x2="16" y2="4" stroke={c} strokeWidth="0.6" />
        <line x1="18" y1="4" x2="24" y2="4" stroke={c} strokeWidth="0.6" />
      </svg>
    ),
  };
  return (Platform.OS === "web" ? icons[name] : null) || null;
}

const EH_TAB_LABELS: Record<string, { en: string; zh: string }> = {
  chat: { en: "CHAT", zh: "聊天" },
  group: { en: "GROUPS", zh: "群组" },
  home: { en: "HOME", zh: "主页" },
  terminal: { en: "TERM", zh: "终端" },
  settings: { en: "SETTINGS", zh: "设置" },
};

function TabIcon({ name, focused }: { name: keyof typeof ICON_SOURCES; focused: boolean }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Image
      key={`${name}-${focused ? 1 : 0}`}
      source={ICON_SOURCES[name]}
      style={[
        styles.icon,
        { tintColor: focused ? theme.accent : theme.textMuted },
      ]}
      resizeMode="contain"
    />
  );
}


function CustomTabBar({ state, descriptors, navigation }: any) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom || 0, 0);
  const keyboardVisible = useWebKeyboardOpen();
  const pathname = usePathname();
  const activeSegment = pathname.replace(/^\//, "").split("/")[0] || "";

  const isEH = theme.key === "eventHorizon";

  return (
    <View
      pointerEvents={keyboardVisible ? "none" : "auto"}
      style={[
        isEH ? styles.tabBarShellEH : styles.tabBarShell,
        { height: (isEH ? 62 : 68) + bottomInset, paddingBottom: bottomInset + (isEH ? 4 : 6) },
        keyboardVisible && styles.tabBarHidden,
      ]}
    >
      {isEH && Platform.OS === "web" && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
      )}
      <View style={isEH ? styles.tabBarContentEH : styles.tabBarContent}>
        {state.routes.map((route: any, index: number) => {
          const options = descriptors[route.key]?.options || {};
          const focused = activeSegment
            ? route.name === activeSegment
            : state.index === index;
          const ehLabel = EH_TAB_LABELS[route.name];
          const label = isEH
            ? (ehLabel?.zh || route.name)
            : (options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name);
          const iconName = TAB_ICON_BY_ROUTE[route.name] || "chat";

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={isEH ? styles.tabButtonEH : styles.tabButton}
            >
              {isEH ? (
                <>
                  <HudTabIcon name={iconName} focused={focused} />
                  {Platform.OS === "web" && focused && (
                    <div style={{ position: "absolute", bottom: 0, left: "25%", right: "25%", height: 2, backgroundColor: "rgba(255,255,255,0.7)" }} />
                  )}
                </>
              ) : (
                <TabIcon name={iconName} focused={focused} />
              )}
              {isEH && ehLabel ? (
                <View style={{ alignItems: "center", gap: 0 }}>
                  <Text style={[styles.tabLabelEHen, { color: focused ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)" }]}>
                    {ehLabel.en}
                  </Text>
                  <Text style={[styles.tabLabelEH, { color: focused ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }]}>
                    {ehLabel.zh}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.tabLabel, { color: focused ? theme.accent : theme.textMuted }]}>
                  {String(label)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const desktopStyles = useMemo(() => createDesktopStyles(theme), [theme]);
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const startPolling = useChat((state) => state.startPolling);
  const stopPolling = useChat((state) => state.stopPolling);
  const setPollActive = useChat((state) => state.setPollActive);
  const checkConnection = useConnection((state) => state.checkConnection);


  useEffect(() => {
    checkConnection();
    startPolling();
    return () => stopPolling();
  }, [checkConnection, startPolling, stopPolling]);

  // Keep the PWA system chrome (status bar / home-indicator zone / over-scroll)
  // in the theme's background instead of the manifest's deep-space blue.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const color = theme.key === "eventHorizon" ? "#000000" : theme.bg;
    document.body.style.backgroundColor = color;
    document.documentElement.style.backgroundColor = color;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;

    const motionId = "eh-motion-css";
    if (!document.getElementById(motionId)) {
      const style = document.createElement("style");
      style.id = motionId;
      style.textContent = [
        ":root { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1); --dur-fast: 150ms; --dur-normal: 250ms; --dur-slow: 350ms; }",
        "@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.15s !important; animation-iteration-count: 1 !important; transition-duration: 0.15s !important; } }",
        "* { scrollbar-width: none; -ms-overflow-style: none; } *::-webkit-scrollbar { display: none; }",
        "@keyframes voyCardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }",
        "[data-voy-card] { animation: voyCardIn 400ms cubic-bezier(0.23,1,0.32,1) both; }",
        "[data-voy-btn='1'] { transition: transform 100ms ease-out, opacity 100ms ease; }",
        "[data-voy-btn='1']:active { transform: scale(0.90) !important; opacity: 0.7 !important; }",
        "[data-voy-event] { transition: transform 150ms ease-out; }",
        "[data-voy-event]:active { transform: scale(0.98) !important; }",
        "@keyframes commCardIn { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }",
        "[data-comm-card='1'] { animation: commCardIn 350ms cubic-bezier(0.23,1,0.32,1) both; }",
      ].join("\n");
      document.head.appendChild(style);
    }
  }, [theme]);

  useEffect(() => {
    const activeSegment = pathname.replace(/^\//, "").split("/")[0] || "chat";
    setPollActive(activeSegment === "chat");
  }, [pathname, setPollActive]);

  useEffect(() => {
    if (isDesktop) {
      const seg = pathname.replace(/^\//, "").split("/")[0] || "";
      if (seg !== "chat" && seg !== "terminal") {
        router.replace("/chat");
      }
    }
  }, [isDesktop]);

  const activeSegment = pathname.replace(/^\//, "").split("/")[0] || "chat";

  if (isDesktop) {
    return (
      <View style={desktopStyles.root}>
        <CrtScanlines color={theme.layout.crtScanlineBg} style={desktopStyles.crtOverlay} />
        {/* left dashboard column */}
        <View style={desktopStyles.leftDash}>
          <DesktopSidebar />
        </View>
        {/* right: chat area */}
        <View style={desktopStyles.rightSide}>
          <View style={desktopStyles.chatArea}>
            <View style={desktopStyles.content}>
              <Tabs
                tabBar={() => null}
                screenOptions={{
                  headerShown: false,
                  sceneStyle: styles.scene,
                }}
              >
                <Tabs.Screen name="chat" />
                <Tabs.Screen name="group" />
                <Tabs.Screen name="home" />
                <Tabs.Screen name="terminal" />
                <Tabs.Screen name="settings" />
              </Tabs>
            </View>
          </View>
          {/* bottom strip: calendar */}
          <DesktopVoyageStrip activeTab={activeSegment} onTabPress={(tab) => router.replace(`/${tab}`)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} {...(Platform.OS === "web" ? { dataSet: { noise: theme.decor.noiseOverlay ? "1" : "0" } } as any : {})}>
    <NoiseOverlay />
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: "聊天",
          tabBarIcon: ({ focused }) => <TabIcon name="chat" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="group"
        options={{
          title: "群组",
          tabBarIcon: ({ focused }) => <TabIcon name="group" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: "主页",
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          title: "终端",
          tabBarIcon: ({ focused }) => <TabIcon name="terminal" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "设置",
          tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />,
        }}
      />
    </Tabs>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  scene: {
    backgroundColor: theme.bg,
  },
  tabBarShell: {
    backgroundColor: theme.bg,
    borderTopColor: theme.layout.tabBarBorder,
    borderTopWidth: 1,
  },
  tabBarShellEH: {
    backgroundColor: "#000",
    borderTopWidth: 0,
  },
  tabBarHidden: {
    opacity: 0,
    transform: [{ translateY: 8 }],
  },
  tabBarContent: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: theme.bg,
  },
  tabBarContentEH: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#000",
  },
  tabButton: {
    flex: 1,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 0,
  },
  tabButtonEH: {
    flex: 1,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minWidth: 0,
    position: "relative" as const,
  },
  tabLabel: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
  },
  tabLabelEHen: {
    fontFamily: "Silkscreen",
    fontSize: 6,
    lineHeight: 8,
    textAlign: "center",
    letterSpacing: 1,
  },
  tabLabelEH: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    lineHeight: 12,
    textAlign: "center",
  },
  icon: {
    width: 26,
    height: 26,
  },
  });
}

function createDesktopStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: theme.bg,
  },
  leftDash: {
    width: "33%" as any,
    borderRightWidth: 1,
    borderRightColor: theme.layout.desktopBorderRight,
  },
  rightSide: {
    flex: 1,
    flexDirection: "column",
  },
  chatArea: {
    flex: 1,
    flexDirection: "column",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.layout.desktopHeaderBorder,
    backgroundColor: theme.bg,
    gap: 4,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tabBtnActive: {
    backgroundColor: theme.layout.desktopTabActiveBg,
  },
  tabIcon: {
    width: 20,
    height: 20,
  },
  tabBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: theme.textMuted,
  },
  tabBtnTextActive: {
    color: theme.accent,
  },
  tabBtnSm: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tabBtnSmText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.layout.desktopTabMutedText,
  },
  content: {
    flex: 1,
  },
  crtOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  });
}
