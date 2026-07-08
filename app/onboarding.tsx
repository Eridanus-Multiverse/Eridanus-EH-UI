import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useConnection } from "../stores/connectionStore";
import { colors, fonts } from "../theme/colors";

export default function Onboarding() {
  const router = useRouter();
  const { save, clear } = useConnection();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState("");

  const beacon = (step: string) => {
    if (Platform.OS === "web") return;
    try {
      fetch("" /* demo: crash report disabled */, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fatal: false, message: "login step", where: step, platform: Platform.OS }),
      }).catch(() => {});
    } catch (_) {}
  };

  const handleConnect = async () => {
    beacon("connect:start");
    try {
      const cleaned = url.trim().replace(/\/+$/, "") || (Platform.OS === "web" ? window.location.origin : "");
      const sec = secret.trim();
      if (!sec) {
        setMsg("密钥要填的！");
        return;
      }
      if (!cleaned && Platform.OS !== "web") {
        setMsg("服务器地址要填的！");
        return;
      }

      setTesting(true);
      setMsg("连接中...");

      // On web, use relative path (same-origin) to avoid Safari "Load failed"
      // from CORS preflight on cross-origin auth headers. On native, need absolute.
      const testUrl =
        Platform.OS === "web"
          ? "/api/chat/poll?since=2099-01-01T00:00:00.000Z"
          : `${cleaned}/api/chat/poll?since=2099-01-01T00:00:00.000Z`;
      const testRes = await fetch(testUrl, {
        headers: { "X-Auth-Token": sec },
      });
      if (!testRes.ok) {
        beacon("connect:auth-fail-" + testRes.status);
        await clear();
        setTesting(false);
        setMsg("认证失败: " + testRes.status);
        return;
      }
      beacon("connect:auth-ok");

      await save(cleaned, sec);
      beacon("connect:saved");
      setTesting(false);
      setMsg("连上了！");
      router.replace("/(tabs)/chat");
      beacon("connect:navigated");
    } catch (e: any) {
      await clear();
      setTesting(false);
      setMsg("出错了: " + (e?.message || "unknown"));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Event Horizon</Text>
        <Text style={styles.subtitle}>连接到你的星星</Text>
        <Text style={{ position: "absolute", top: 4, right: 8, fontSize: 9, color: "rgba(200,216,240,0.4)" }}>OTA 0704.3</Text>

        <View style={styles.pixelBox}>
          <Text style={styles.label}>服务器地址</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder={Platform.OS === "web" ? "留空即可（同源模式）" : "https://你的服务器地址"}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>密钥</Text>
          <TextInput
            style={styles.input}
            value={secret}
            onChangeText={setSecret}
            placeholder="X-Auth-Token"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </View>

        {msg !== "" && (
          <Text style={styles.msg}>{msg}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, testing && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={testing}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>
            {testing ? "连接中..." : "连接"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: fonts.silkscreen,
    fontSize: 28,
    color: colors.primary,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.textDim,
    textAlign: "center",
    marginBottom: 40,
  },
  pixelBox: {
    backgroundColor: colors.bgCard,
    borderWidth: 2,
    borderColor: colors.pixel.border,
    padding: 20,
    marginBottom: 16,
  },
  label: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    letterSpacing: 0.5,
  },
  msg: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.accent,
    textAlign: "center",
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.pixel.highlight,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: fonts.silkscreen,
    fontSize: 16,
    color: colors.white,
  },
});
