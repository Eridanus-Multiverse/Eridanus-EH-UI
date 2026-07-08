import { Component, type ReactNode } from "react";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Text,
  TextInput,
} from "react-native";
import { Slot } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useConnection } from "../stores/connectionStore";
import { startOfflineMirrorSync } from "../services/offlineMirror";
import { initPushVisibility } from "../services/push";
import { fonts } from "../theme/colors";
import { useThemeTokens } from "../hooks/useTheme";
import type { ThemeTokens } from "../theme/themes";
import { useInstallWebKeyboardDataset } from "../hooks/useWebKeyboard";
import WelcomeScreen from "../components/WelcomeScreen";

// ── native crash reporter: the TestFlight build dies silently; phone home first ──
const CRASH_ENDPOINT = "" /* demo: crash report disabled */;
function reportCrash(payload: Record<string, unknown>) {
  try {
    fetch(CRASH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: Platform.OS, ...payload }),
    }).catch(() => {});
  } catch (_) {}
}
if (Platform.OS !== "web") {
  const EU: any = (globalThis as any).ErrorUtils;
  if (EU?.setGlobalHandler) {
    const prev = EU.getGlobalHandler?.();
    EU.setGlobalHandler((e: any, isFatal?: boolean) => {
      const payload = { fatal: !!isFatal, message: String(e?.message || e).slice(0, 500), stack: String(e?.stack || "").slice(0, 1500), where: "global" };
      // fatal crashes kill the process before fetch flushes — stash locally,
      // deliver posthumously on next launch
      try {
        const SecureStore = require("expo-secure-store");
        SecureStore.setItemAsync("pending-crash", JSON.stringify(payload)).catch(() => {});
      } catch (_) {}
      reportCrash(payload);
      if (prev) prev(e, isFatal);
    });
  }
  // posthumous delivery from a previous run
  try {
    const SecureStore = require("expo-secure-store");
    SecureStore.getItemAsync("pending-crash").then((raw: string | null) => {
      if (!raw) return;
      SecureStore.deleteItemAsync("pending-crash").catch(() => {});
      try { reportCrash({ ...JSON.parse(raw), where: "posthumous" }); } catch (_) {}
    }).catch(() => {});
  } catch (_) {}
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state: { err: string | null } = { err: null };
  static getDerivedStateFromError(e: any) {
    return { err: String(e?.message || e).slice(0, 300) };
  }
  componentDidCatch(e: any, info: any) {
    reportCrash({ fatal: true, message: String(e?.message || e).slice(0, 500), stack: String(info?.componentStack || e?.stack || "").slice(0, 1500), where: "render" });
  }
  render() {
    if (this.state.err) {
      return (
        <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: "#fff", fontSize: 14, marginBottom: 10 }}>出了点问题,已经报告给UNIT-A了</Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{this.state.err}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}


const pixelFontStyle = { fontFamily: fonts.pixel };

for (const Comp of [Text, TextInput] as Array<any>) {
  Comp.defaultProps = Comp.defaultProps || {};
  Comp.defaultProps.style = [pixelFontStyle, Comp.defaultProps.style];
}

export default function RootLayout() {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [ready, setReady] = useState(false);
  const [welcomeDone, setWelcomeDone] = useState(false);
  useInstallWebKeyboardDataset();
  const { load } = useConnection();

  const [fontsLoaded] = useFonts({
    Zpix: require("../assets/fonts/Zpix.ttf"),
    Silkscreen: require("../assets/fonts/Silkscreen-Regular.ttf"),
    SilkscreenBold: require("../assets/fonts/Silkscreen-Bold.ttf"),
    JetBrainsMono: require("../assets/fonts/JetBrainsMono-Regular.ttf"),
    ArkPixel: require("../assets/fonts/ArkPixel.ttf"),
    FusionPixel: require("../assets/fonts/FusionPixel.ttf"),
    Galmuri11: require("../assets/fonts/Galmuri11.ttf"),
    Galmuri9: require("../assets/fonts/Galmuri9.ttf"),
    Unifont: require("../assets/fonts/Unifont.ttf"),
  });

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => {
        startOfflineMirrorSync();
        initPushVisibility();
        setReady(true);
      });
  }, [load]);


  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onChunkError = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || e.reason?.toString() || "";
      if (msg.includes("Loading chunk") || msg.includes("Failed to fetch dynamically imported module") || msg.includes("ChunkLoadError")) {
        window.location.reload();
      }
    };
    window.addEventListener("unhandledrejection", onChunkError);
    return () => window.removeEventListener("unhandledrejection", onChunkError);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.style.backgroundColor = theme.bg;
    document.body.style.backgroundColor = theme.bg;
    const fontChain = "'Silkscreen', 'Zpix', monospace";
    document.documentElement.style.fontFamily = fontChain;
    document.body.style.fontFamily = fontChain;
    const root = document.getElementById("root");
    if (root) {
      root.style.backgroundColor = theme.bg;
      root.style.fontFamily = fontChain;
    }
    // static CSS — install once by id; this effect re-runs on theme change and
    // used to append a fresh duplicate <style> node every time
    if (!document.getElementById("eri-root-css")) {
      const style = document.createElement("style");
      style.id = "eri-root-css";
      style.textContent = [
        "@font-face { font-family: 'Silkscreen'; src: url('/Silkscreen-Regular.ttf') format('truetype'); font-weight: normal; }",
        "@font-face { font-family: 'Silkscreen'; src: url('/Silkscreen-Bold.ttf') format('truetype'); font-weight: bold; }",
        "@font-face { font-family: 'SilkscreenBold'; src: url('/Silkscreen-Bold.ttf') format('truetype'); }",
        "@font-face { font-family: 'Zpix'; src: url('/Zpix.ttf') format('truetype'); }",
        "* { scrollbar-width: none; -ms-overflow-style: none; }",
        "*::-webkit-scrollbar { display: none; }",
        "html[data-keyboard-open='1'] [data-keyboard-heavy='1'] * { animation-play-state: paused !important; }",
      ].join("\n");
      document.head.appendChild(style);
    }
  }, [theme.bg]);

  const appReady = ready && !!fontsLoaded;
  const handleWelcomeDone = useCallback(() => setWelcomeDone(true), []);

  return (
    <RootErrorBoundary>
      <View style={styles.appRoot}>
        <StatusBar style="light" />
        {appReady && <Slot />}
        {!welcomeDone && (
          <WelcomeScreen ready={appReady} onDone={handleWelcomeDone} />
        )}
      </View>
    </RootErrorBoundary>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  });
}
