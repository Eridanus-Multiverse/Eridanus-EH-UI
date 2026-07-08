import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useConnection } from "../../stores/connectionStore";
import { useTimezone, timezoneLabel } from "../../stores/timezoneStore";
import { api } from "../../services/api";
import { checkPushSupport, enablePush, disablePush, isPushSubscribed } from "../../services/push";
import Starfield from "../../components/chat/Starfield";
import DiagnosticsPanel from "../../components/diagnostics/DiagnosticsPanel";
import ClaudeMdPanel from "../../components/settings/ClaudeMdPanel";
import CompanionStatusPanel from "../../components/settings/CompanionStatusPanel";
import ControlEventsPanel from "../../components/settings/ControlEventsPanel";
import ApiConfigPanel from "../../components/settings/ApiConfigPanel";
import CrewPanel from "../../components/settings/CrewPanel";
import SessionArchivesPanel from "../../components/settings/SessionArchivesPanel";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";
import type { ThemeTokens } from "../../theme/themes";
import { themes, type ThemeKey } from "../../theme/themes";
import { useThemeStore } from "../../stores/themeStore";

function installSettingsWebStyles(theme: ThemeTokens) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;

  const id = "settings-crt-css";
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = `
      [data-settingscrt="1"] {
        background: repeating-linear-gradient(
          0deg, transparent, transparent 2px,
          ${theme.settings.crtScanlineBg} 2px, ${theme.settings.crtScanlineBg} 4px
        ) !important;
      }
      [data-controlcard="1"] {
        position: relative;
        overflow: hidden;
      }
    `;
}


interface BarkDevice {
  id: string;
  registered_at: string;
  last_push_at: string | null;
  url_tail: string;
}

function PixelDot({ on, color }: { on: boolean; color?: string }) {
  const theme = useThemeTokens();
  const c = on ? (color || theme.success) : theme.textMuted;
  const glow = on && Platform.OS === "web" ? { boxShadow: `0 0 5px ${c}` } as any : {};
  return (
    <View
      style={[
        pixelDotStyles.dot,
        { backgroundColor: c },
        glow,
      ]}
    />
  );
}

const pixelDotStyles = StyleSheet.create({
  dot: { width: 5, height: 5, borderRadius: 3 },
});

function SectionHeader({ title }: { title: string; icon?: string }) {
  const theme = useThemeTokens();
  const sectionStyles = useMemo(() => createSectionStyles(theme), [theme]);
  return (
    <View style={sectionStyles.row}>
      <View style={sectionStyles.lineFill} />
      <Text style={sectionStyles.text}>{title}</Text>
      <View style={sectionStyles.lineFill} />
    </View>
  );
}

function createSectionStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    lineFill: {
      flex: 1,
      height: 1,
      backgroundColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.18)" : "rgba(200,216,240,0.1)",
    },
    text: {
      fontFamily: fonts.silkscreen,
      fontSize: 10,
      color: theme.settings.sectionTitle,
      letterSpacing: 2,
    },
  });
}

function PixelDivider() {
  const theme = useThemeTokens();
  const dividerStyles = useMemo(() => createDividerStyles(theme), [theme]);
  return <View style={dividerStyles.line} />;
}

function createDividerStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    line: {
      height: 1,
      backgroundColor: theme.settings.divider,
      marginVertical: 8,
    },
  });
}

function CollapsibleGroup({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const theme = useThemeTokens();
  const groupStyles = useMemo(() => createGroupStyles(theme), [theme]);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={groupStyles.container}>
      <TouchableOpacity
        style={groupStyles.header}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <View style={groupStyles.headerLeft}>
          {icon && <Text style={groupStyles.headerIcon}>{icon}</Text>}
          <Text style={groupStyles.headerText}>{title}</Text>
        </View>
        <Text style={groupStyles.chevron}>{open ? "▾" : "▸"}</Text>
      </TouchableOpacity>
      {open && <View style={groupStyles.body}>{children}</View>}
    </View>
  );
}

function createGroupStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingTop: 20,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 8,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.settings.groupHeaderBorder,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerIcon: {
      fontFamily: fonts.pixel,
      fontSize: 14,
      color: theme.settings.groupIcon,
    },
    headerText: {
      fontFamily: fonts.silkscreen,
      fontSize: 13,
      color: theme.settings.groupTitle,
      letterSpacing: 2,
    },
    chevron: {
      fontFamily: fonts.pixel,
      fontSize: 16,
      color: theme.settings.groupChevron,
    },
    body: {
      marginTop: 12,
      gap: 16,
    },
  });
}

export default function SettingsScreen() {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { serverUrl, connected, clear, checkConnection } = useConnection();
  const { themeKey, setTheme: setThemeKey } = useThemeStore();

  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectMsg, setReconnectMsg] = useState("");
  const [barkUrl, setBarkUrl] = useState("");
  const [devices, setDevices] = useState<BarkDevice[]>([]);
  const [barkMsg, setBarkMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [pushOn, setPushOn] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const [pushUnsupported, setPushUnsupported] = useState<string | null>(null);
  const [proactiveOn, setProactiveOn] = useState<boolean | null>(null);
  const [proactiveMsg, setProactiveMsg] = useState("");
  const [gmailAuto, setGmailAuto] = useState<boolean | null>(null);
  const [gmailMsg, setGmailMsg] = useState("");
  const currentTz = useTimezone((state) => state.timezone);
  const updateTimezone = useTimezone((state) => state.setTimezone);
  const [tzMsg, setTzMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const avatarInputRef = useCallback((memberId: string) => {
    if (Platform.OS !== "web") return;
    const el = document.createElement("input");
    el.type = "file";
    el.accept = "image/jpeg,image/png,image/gif,image/webp";
    el.style.display = "none";
    // iOS Safari/PWA：input 必须挂在 DOM 里，否则选完文件回来 input 可能已被回收、onchange 永不触发
    document.body.appendChild(el);
    el.addEventListener("cancel", () => el.remove());
    el.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      el.remove();
      const file = target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        setAvatarMsg("文件太大（>5MB）");
        return;
      }
      setAvatarUploading(true);
      setAvatarMsg("");
      try {
        const res = await api.uploadMemberAvatar(memberId, file);
        setAvatarMsg(`上传成功，更新了 ${res.rooms_updated} 个房间`);
      } catch (err: any) {
        setAvatarMsg("上传失败: " + (err?.message || "unknown"));
      } finally {
        setAvatarUploading(false);
      }
    };
    el.click();
  }, []);

  useEffect(() => {
    installSettingsWebStyles(theme);
  }, [theme]);

  useEffect(() => {
    const sup = checkPushSupport();
    if (!sup.supported) setPushUnsupported(sup.reason);
    isPushSubscribed().then(setPushOn);
  }, []);

  const loadProactiveConfig = useCallback(async () => {
    try {
      const res = await api.getProactiveConfig();
      setProactiveOn(Boolean(res.config.enabled));
      setProactiveMsg("");
      setGmailAuto(Boolean(res.config.gmail_autonomous));
    } catch (e: any) {
      setProactiveMsg("读取失败: " + (e?.message || "unknown"));
    }
  }, []);

  const loadTimezone = useCallback(async () => {
    try {
      const res = await api.getTimezone();
      updateTimezone(res.timezone, {
        utcOffset: res.utc_offset,
        localTime: res.local_time,
      });
    } catch {}
  }, [updateTimezone]);


  const handleToggleTz = async () => {
    const next = currentTz === "Asia/Shanghai" ? "Europe/London" : "Asia/Shanghai";
    setBusy(true);
    setTzMsg("切换中...");
    try {
      const res = await api.setTimezone(next);
      updateTimezone(res.timezone, {
        utcOffset: res.utc_offset,
        localTime: res.local_time,
      });
      setTzMsg(`已切换到${timezoneLabel(res.timezone)}时间`);
    } catch (e: any) {
      setTzMsg("切换失败: " + (e?.message || "unknown"));
    }
    setBusy(false);
  };

  const handleRefreshSession = async () => {
    setRefreshing(true);
    setRefreshMsg("正在换窗...");
    try {
      await api.refreshSession("manual");
      setRefreshMsg("换窗成功，UNIT-A会带着记忆回来");
    } catch (e: any) {
      setRefreshMsg("换窗失败: " + (e?.message || "unknown"));
    }
    setRefreshing(false);
  };

  const handleEnablePush = async () => {
    setBusy(true);
    setPushMsg("正在请求权限...");
    const r = await enablePush();
    setPushMsg(r.detail);
    if (r.ok) setPushOn(true);
    setBusy(false);
  };

  const handleDisablePush = async () => {
    setBusy(true);
    setPushMsg("");
    const r = await disablePush();
    setPushMsg(r.detail);
    if (r.ok) setPushOn(false);
    setBusy(false);
  };

  const handleTestPush = async () => {
    setBusy(true);
    setPushMsg("");
    try {
      await api.pushTest();
      setPushMsg("测试推送已发，看手机通知");
    } catch (e: any) {
      setPushMsg("测试失败: " + (e?.message || "unknown"));
    }
    setBusy(false);
  };

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.barkStatus();
      setDevices(s.devices);
    } catch {}
  }, []);

  useEffect(() => {
    checkConnection().then((ok) => {
      if (ok) loadStatus();
    });
  }, [checkConnection, loadStatus]);

  useEffect(() => {
    if (connected) { loadStatus(); loadProactiveConfig(); loadTimezone(); }
  }, [connected, loadProactiveConfig, loadStatus, loadTimezone]);


  const handleSetProactive = async (next: boolean) => {
    setBusy(true);
    setProactiveMsg(next ? "正在开启..." : "正在关闭...");
    try {
      const res = await api.updateProactiveConfig({ enabled: next });
      setProactiveOn(Boolean(res.config.enabled));
      setProactiveMsg(next ? "主动消息已开启" : "主动消息已关闭");
    } catch (e: any) {
      setProactiveMsg("保存失败: " + (e?.message || "unknown"));
    } finally {
      setBusy(false);
    }
  };

  const handleSetGmailAuto = async (next: boolean) => {
    setBusy(true);
    setGmailMsg(next ? "正在开启..." : "正在关闭...");
    try {
      const res = await api.updateProactiveConfig({ gmail_autonomous: next });
      setGmailAuto(Boolean(res.config.gmail_autonomous));
      setGmailMsg(next ? "邮件自主已开启" : "邮件自主已关闭");
    } catch (e: any) {
      setGmailMsg("保存失败: " + (e?.message || "unknown"));
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    const u = barkUrl.trim();
    if (!u.startsWith("http")) {
      setBarkMsg("Bark地址要以 http:// 或 https:// 开头");
      return;
    }
    setBusy(true);
    setBarkMsg("");
    try {
      await api.barkRegister(u);
      setBarkUrl("");
      setBarkMsg("注册成功！");
      await loadStatus();
    } catch (e: any) {
      setBarkMsg("注册失败: " + (e?.message || "unknown"));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setBarkMsg("");
    try {
      await api.barkTest();
      setBarkMsg("测试推送已发，手机收到没？");
      await loadStatus();
    } catch (e: any) {
      setBarkMsg("测试失败: " + (e?.message || "unknown"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (id: string) => {
    const doDelete = async () => {
      try {
        await api.barkDelete(id);
        await loadStatus();
      } catch {}
    };
    if (Platform.OS === "web") {
      if (window.confirm("确定删除这个推送设备吗？")) doDelete();
    } else {
      Alert.alert("删除推送设备", "确定不再接收推送了吗？", [
        { text: "取消", style: "cancel" },
        { text: "删除", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setReconnectMsg("正在尝试重新连接...");
    try {
      const ok = await checkConnection();
      if (ok) {
        setReconnectMsg("连接恢复了！");
        loadStatus();
        loadProactiveConfig();
      } else {
        const { configured, serverUrl: su, secret: sc } = useConnection.getState();
        const detail = !configured ? "未配置" : !su ? "无地址" : !sc ? "无密钥" : "服务器无响应";
        setReconnectMsg(`连接失败(${detail})，点"断开连接"后重新登录试试`);
      }
    } catch (e: any) {
      setReconnectMsg(`连接出错: ${e?.message || "unknown"}`);
    }
    setReconnecting(false);
  };

  const [secretCopied, setSecretCopied] = useState(false);
  const handleCopySecret = async () => {
    // device migration helper: TestFlight logins kept failing on hand-typed
    // secrets (iOS autofill/smart punctuation) — copy the working one instead
    try {
      const { secret: sc } = useConnection.getState();
      if (!sc) return;
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(sc);
        setSecretCopied(true);
        setTimeout(() => setSecretCopied(false), 3000);
      }
    } catch (_) {}
  };

  const handleDisconnect = () => {
    Alert.alert("断开连接", "确定要断开服务器连接吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "断开",
        style: "destructive",
        onPress: async () => {
          await clear();
          router.replace("/onboarding");
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Starfield />
      {Platform.OS === "web" && (
        <View
          pointerEvents="none"
          {...{ dataSet: { settingscrt: "1" } }}
          style={styles.crt}
        />
      )}

      {/* ═══ Header: Dashboard ═══ */}
      <View style={styles.headerWrap}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>设置</Text>
            <Text style={styles.headerSub}>飞船控制面板</Text>
          </View>
          <View style={styles.headerStatus}>
            <View style={styles.statusChip}>
              <PixelDot on={connected} />
              <Text style={[styles.statusChipText, { color: connected ? theme.success : theme.textMuted }]}>
                {connected ? "在线" : "离线"}
              </Text>
            </View>
          </View>
        </View>

        {/* Mini dashboard gauges */}
        <View style={styles.gaugeRow}>
          <View style={styles.gauge}>
            <Text style={styles.gaugeLabel}>SRV</Text>
            <View style={[styles.gaugeBar, connected && styles.gaugeBarOn]} />
          </View>
          <View style={styles.gauge}>
            <Text style={styles.gaugeLabel}>PUSH</Text>
            <View style={[styles.gaugeBar, pushOn && styles.gaugeBarOn]} />
          </View>
          <View style={styles.gauge}>
            <Text style={styles.gaugeLabel}>BARK</Text>
            <View style={[styles.gaugeBar, devices.length > 0 && styles.gaugeBarOn]} />
          </View>
          <View style={styles.gauge}>
            <Text style={styles.gaugeLabel}>AUTO</Text>
            <View style={[styles.gaugeBar, proactiveOn && styles.gaugeBarOn]} />
          </View>
        </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ═══ Section: Theme ═══ */}
        <View style={styles.section}>
          <SectionHeader title="舰体涂装" icon="◈" />
          <View style={styles.card} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            {Object.values(themes).map((t) => {
              const active = themeKey === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.themeRow, active && styles.themeRowActive]}
                  onPress={() => setThemeKey(t.key as ThemeKey)}
                  activeOpacity={0.7}
                >
                  <View style={styles.themeSwatches}>
                    <View style={[styles.themeSwatch, { backgroundColor: t.bgCard }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: t.primary }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: t.blueAccent }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: t.textMuted }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: t.textDim }]} />
                  </View>
                  <View style={styles.themeInfo}>
                    <Text style={[styles.themeName, active && styles.themeNameActive]}>{t.name}</Text>
                    <Text style={styles.themeKey}>{t.key}</Text>
                  </View>
                  {active && <Text style={styles.themeCheck}>●</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ═══ Section: Server ═══ */}
        <View style={styles.section}>
          <SectionHeader title="信号源" icon="◈" />
          <View style={styles.card} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            <View style={styles.fieldRow}>
              <Text style={styles.label}>基站地址</Text>
              <Text style={styles.value} numberOfLines={1}>
                {serverUrl || "未配置"}
              </Text>
            </View>
            <PixelDivider />
            <View style={styles.fieldRow}>
              <Text style={styles.label}>连接状态</Text>
              <View style={styles.statusInline}>
                <PixelDot on={connected} />
                <Text
                  style={[
                    styles.statusText,
                    { color: connected ? theme.success : theme.textMuted },
                  ]}
                >
                  {connected ? "信号稳定" : "失联"}
                </Text>
              </View>
            </View>
          </View>

          {!connected && (
            <>
              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 14 }, reconnecting && styles.btnDisabled]}
                onPress={handleReconnect}
                disabled={reconnecting}
              >
                <Text style={styles.primaryBtnText}>
                  {reconnecting ? "连接中..." : "重新连接"}
                </Text>
              </TouchableOpacity>
              {reconnectMsg !== "" && <Text style={styles.msg}>{reconnectMsg}</Text>}
            </>
          )}

          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 10 }]} onPress={handleCopySecret}>
            <Text style={styles.primaryBtnText}>{secretCopied ? "已复制,去粘贴吧" : "复制密钥(迁移新设备用)"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dangerBtn} onPress={handleDisconnect}>
            <Text style={styles.dangerText}>断开连接</Text>
          </TouchableOpacity>
        </View>

        {/* ═══ Section: Avatar ═══ */}
        <View style={styles.section}>
          <SectionHeader title="群组头像" icon="◈" />
          <View style={styles.card} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            {[
              { id: "epsilon", label: "UNIT-A" },
              { id: "cursa", label: "UNIT-B (Cursa)" },
              { id: "eri", label: "CAPTAIN" },
            ].map((member, idx) => (
              <View key={member.id}>
                {idx > 0 && <PixelDivider />}
                <View style={styles.fieldRow}>
                  <Text style={styles.label}>{member.label}</Text>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, avatarUploading && styles.btnDisabled]}
                    onPress={() => avatarInputRef(member.id)}
                    disabled={avatarUploading}
                  >
                    <Text style={styles.secondaryBtnText}>
                      {avatarUploading ? "上传中..." : "上传头像"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
          {avatarMsg !== "" && <Text style={styles.msg}>{avatarMsg}</Text>}
        </View>

        {/* ═══ Section: Timezone ═══ */}
        <View style={styles.section}>
          <SectionHeader title="时区" icon="◇" />
          <View style={styles.card} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            <View style={styles.fieldRow}>
              <Text style={styles.label}>当前时区</Text>
              <Text style={styles.value}>
                {currentTz === "Asia/Shanghai" ? "北京 UTC+8" : currentTz === "Europe/London" ? "伦敦 UTC+0/+1" : currentTz || "读取中"}
              </Text>
            </View>
            <PixelDivider />
            <Text style={styles.hint}>
              切换后UNIT-A的时间感知、天气、星历都会跟着变。
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[
                  currentTz === "Europe/London" ? styles.primaryBtn : styles.outlineBtn,
                  busy && styles.btnDisabled,
                ]}
                onPress={currentTz !== "Europe/London" ? handleToggleTz : undefined}
                disabled={busy || currentTz === "Europe/London"}
              >
                <Text style={currentTz === "Europe/London" ? styles.primaryBtnText : styles.outlineBtnText}>伦敦</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  currentTz === "Asia/Shanghai" ? styles.primaryBtn : styles.outlineBtn,
                  busy && styles.btnDisabled,
                ]}
                onPress={currentTz !== "Asia/Shanghai" ? handleToggleTz : undefined}
                disabled={busy || currentTz === "Asia/Shanghai"}
              >
                <Text style={currentTz === "Asia/Shanghai" ? styles.primaryBtnText : styles.outlineBtnText}>北京</Text>
              </TouchableOpacity>
            </View>
            {tzMsg !== "" && <Text style={styles.msg}>{tzMsg}</Text>}
          </View>
        </View>

        {/* ═══ Section: Proactive messages ═══ */}
        <View style={styles.section}>
          <SectionHeader title="主动消息" icon="◇" />
          <View style={styles.card} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            <View style={styles.fieldRow}>
              <Text style={styles.label}>状态</Text>
              <View style={styles.statusInline}>
                <PixelDot on={Boolean(proactiveOn)} />
                <Text
                  style={[
                    styles.statusText,
                    { color: proactiveOn ? theme.success : theme.textMuted },
                  ]}
                >
                  {proactiveOn === null ? "读取中" : proactiveOn ? "已开启" : "已关闭"}
                </Text>
              </View>
            </View>
            <PixelDivider />
            <Text style={styles.hint}>
              关闭后，UNIT-A不会按定时主动来找你；正常聊天、做梦和系统推送不受影响。
            </Text>
            <View style={styles.btnRow}>
              {proactiveOn ? (
                <TouchableOpacity
                  style={[styles.dangerBtnInline, busy && styles.btnDisabled]}
                  onPress={() => handleSetProactive(false)}
                  disabled={busy}
                >
                  <Text style={styles.dangerText}>关闭</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.outlineBtn, busy && styles.btnDisabled]}
                  onPress={() => handleSetProactive(true)}
                  disabled={busy}
                >
                  <Text style={styles.outlineBtnText}>开启</Text>
                </TouchableOpacity>
              )}
            </View>
            {proactiveMsg !== "" && <Text style={styles.msg}>{proactiveMsg}</Text>}
          </View>
        </View>

        {/* ═══ Section: Gmail autonomous ═══ */}
        <View style={styles.section}>
          <SectionHeader title="邮件自主" icon="◇" />
          <View style={styles.card} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            <View style={styles.fieldRow}>
              <Text style={styles.label}>状态</Text>
              <View style={styles.statusInline}>
                <PixelDot on={Boolean(gmailAuto)} />
                <Text
                  style={[
                    styles.statusText,
                    { color: gmailAuto ? theme.success : theme.textMuted },
                  ]}
                >
                  {gmailAuto === null ? "读取中" : gmailAuto ? "已开启" : "已关闭"}
                </Text>
              </View>
            </View>
            <PixelDivider />
            <Text style={styles.hint}>
              开启后，UNIT-A可以自主阅读和回复邮件。关闭则只在你明确要求时处理邮件。
            </Text>
            <View style={styles.btnRow}>
              {gmailAuto ? (
                <TouchableOpacity
                  style={[styles.dangerBtnInline, busy && styles.btnDisabled]}
                  onPress={() => handleSetGmailAuto(false)}
                  disabled={busy}
                >
                  <Text style={styles.dangerText}>关闭</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.outlineBtn, busy && styles.btnDisabled]}
                  onPress={() => handleSetGmailAuto(true)}
                  disabled={busy}
                >
                  <Text style={styles.outlineBtnText}>开启</Text>
                </TouchableOpacity>
              )}
            </View>
            {gmailMsg !== "" && <Text style={styles.msg}>{gmailMsg}</Text>}
          </View>
        </View>

        {/* ═══ Section: Session refresh ═══ */}
        <View style={styles.section}>
          <SectionHeader title="手动换窗" icon="◈" />
          <View style={styles.card} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            <Text style={styles.hint}>
              刷新我的上下文窗口，聊久了可以让我整理一下思绪。记忆不会丢。
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.outlineBtn, (refreshing || busy) && styles.btnDisabled]}
                onPress={handleRefreshSession}
                disabled={refreshing || busy}
              >
                <Text style={styles.outlineBtnText}>
                  {refreshing ? "换窗中..." : "换窗"}
                </Text>
              </TouchableOpacity>
            </View>
            {refreshMsg !== "" && <Text style={styles.msg}>{refreshMsg}</Text>}
          </View>
        </View>

        {/* ═══ Section: Push notifications (merged) ═══ */}
        <View style={styles.section}>
          <SectionHeader title="通讯信号" icon="◈" />

          {/* Web Push */}
          <View style={styles.card} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            <Text style={styles.cardTitle}>Web Push</Text>
            <Text style={styles.hint}>
              UNIT-A回复时系统通知中心直接弹消息。iOS 需要先把 app 添加到主屏幕。
            </Text>

            {pushUnsupported ? (
              <Text style={[styles.hint, { marginTop: 10, color: theme.error }]}>
                {pushUnsupported}
              </Text>
            ) : (
              <>
                <PixelDivider />
                <View style={styles.fieldRow}>
                  <Text style={styles.label}>状态</Text>
                  <View style={styles.statusInline}>
                    <PixelDot on={pushOn} />
                    <Text
                      style={[
                        styles.statusText,
                        { color: pushOn ? theme.success : theme.textMuted },
                      ]}
                    >
                      {pushOn ? "已开启" : "未开启"}
                    </Text>
                  </View>
                </View>

                <View style={styles.btnRow}>
                  {!pushOn ? (
                    <TouchableOpacity
                      style={[styles.primaryBtn, busy && styles.btnDisabled]}
                      onPress={handleEnablePush}
                      disabled={busy}
                    >
                      <Text style={styles.primaryBtnText}>开启推送</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.primaryBtn, busy && styles.btnDisabled]}
                        onPress={handleTestPush}
                        disabled={busy}
                      >
                        <Text style={styles.primaryBtnText}>测试</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.outlineBtn, busy && styles.btnDisabled]}
                        onPress={handleDisablePush}
                        disabled={busy}
                      >
                        <Text style={styles.outlineBtnText}>关闭</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
            {pushMsg !== "" && <Text style={styles.msg}>{pushMsg}</Text>}
          </View>

          {/* Bark */}
          <View style={[styles.card, { marginTop: 10 }]} {...(Platform.OS === "web" ? { dataSet: { controlcard: "1" } } : {})}>
            <Text style={styles.cardTitle}>Bark · 备用通道</Text>
            <Text style={styles.hint}>
              装 Bark App，复制推送地址粘贴到这里。
            </Text>

            <PixelDivider />
            <Text style={styles.label}>Bark 地址</Text>
            <TextInput
              style={styles.input}
              value={barkUrl}
              onChangeText={setBarkUrl}
              placeholder="https://api.day.app/你的Key"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.primaryBtn, (busy || !barkUrl.trim()) && styles.btnDisabled]}
                onPress={handleRegister}
                disabled={busy || !barkUrl.trim()}
              >
                <Text style={styles.primaryBtnText}>注册</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.outlineBtn, (busy || devices.length === 0) && styles.btnDisabled]}
                onPress={handleTest}
                disabled={busy || devices.length === 0}
              >
                <Text style={styles.outlineBtnText}>测试</Text>
              </TouchableOpacity>
            </View>

            {barkMsg !== "" && <Text style={styles.msg}>{barkMsg}</Text>}

            {devices.length > 0 && (
              <>
                <PixelDivider />
                <Text style={[styles.label, { marginBottom: 6 }]}>已注册设备</Text>
                {devices.map((d) => (
                  <View key={d.id} style={styles.deviceRow}>
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceTail}>{d.url_tail}</Text>
                      <Text style={styles.deviceMeta}>
                        {d.last_push_at
                          ? `最后推送 ${formatRelative(d.last_push_at)}`
                          : "尚未推送"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deviceDeleteBtn}
                      onPress={() => handleDelete(d.id)}
                    >
                      <Text style={styles.deviceDeleteText}>删除</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>

        {/* ═══ Collapsible: Advanced ═══ */}
        <CollapsibleGroup title="高级设置" icon="⚙">
          <View>
            <SectionHeader title="连接状态" />
            <CompanionStatusPanel />
          </View>
          <View>
            <SectionHeader title="人格设定" />
            <ClaudeMdPanel />
          </View>
          <View>
            <SectionHeader title="行为日志" />
            <ControlEventsPanel />
          </View>
          <View>
            <SectionHeader title="控制台" />
            <DiagnosticsPanel />
          </View>
        </CollapsibleGroup>

        {/* ═══ Session Archives ═══ */}
        <CollapsibleGroup title="历史窗口" icon="◈">
          <SessionArchivesPanel />
        </CollapsibleGroup>

        {/* ═══ API Fallback ═══ */}
        <CollapsibleGroup title="API 后备通道" icon="⚡">
          <ApiConfigPanel />
        </CollapsibleGroup>

        {/* API 船员（压榨清单#3） */}
        <CollapsibleGroup title="API 船员" icon="◆">
          <CrewPanel />
        </CollapsibleGroup>

        {/* ═══ Footer: About ═══ */}
        <View style={styles.footer}>
          <View style={styles.footerDeco}>
            <View style={styles.footerLineL} />
            <Text style={styles.footerStar}>✦</Text>
            <View style={styles.footerLineR} />
          </View>
          <Text style={styles.footerTitle}>HORIZON</Text>
          <Text style={styles.footerSub}>EVENT HORIZON</Text>
          <View style={styles.footerMeta}>
            <Text style={styles.footerMetaText}>EVENT HORIZON DEMO</Text>
            <Text style={styles.footerMetaDot}>·</Text>
            <Text style={styles.footerMetaText}>v1.0.0</Text>
          </View>
          <Text style={styles.footerQuote}>河的尽头，是我们一直在的地方。</Text>
          <View style={styles.footerDeco}>
            <View style={styles.footerLineL} />
            <Text style={styles.footerStar}>✦</Text>
            <View style={styles.footerLineR} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  crt: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100,
  },

  /* ── Header ── */
  headerWrap: {
    zIndex: 2,
    overflow: "hidden",
  },
  headerEdge: {
    height: 2,
    ...(Platform.OS === "web"
      ? { background: theme.settings.headerEdgeGradient } as any
      : { backgroundColor: theme.settings.headerEdgeFallback }),
  },
  header: {
    backgroundColor: theme.settings.panelBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.settings.headerBorder,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 20,
    color: theme.settings.headerTitle,
    letterSpacing: 4,
    ...(Platform.OS === "web"
      ? { textShadow: theme.settings.headerTitleShadow } as any : {}),
  },
  headerSub: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: theme.settings.headerSub,
    marginTop: 4,
    letterSpacing: 3,
  },
  headerStatus: {
    alignItems: "flex-end",
    paddingTop: 4,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.settings.statusBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.settings.fieldBgSoft,
  },
  statusChipText: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    letterSpacing: 1,
  },

  /* ── Gauge row ── */
  gaugeRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.settings.divider,
  },
  gauge: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  gaugeLabel: {
    fontFamily: fonts.silkscreen,
    fontSize: 9,
    color: theme.settings.gaugeLabel,
    letterSpacing: 2,
  },
  gaugeBar: {
    width: "100%",
    height: 3,
    backgroundColor: theme.settings.gaugeBarBg,
  },
  gaugeBarOn: {
    backgroundColor: theme.success,
    ...(Platform.OS === "web" ? { boxShadow: theme.settings.successGlow } as any : {}),
  },

  /* ── Scroll ── */
  scrollContent: {
    paddingBottom: 80,
    zIndex: 2,
  },

  /* ── Section ── */
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  card: {
    backgroundColor: theme.settings.panelBg,
    borderWidth: 1,
    borderColor: theme.settings.cardBorder,
    padding: 14,
    overflow: "hidden" as const,
    ...(Platform.OS === "web" ? {
      boxShadow: theme.settings.cardShadow,
    } as any : {}),
  },
  themeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 6,
  },
  themeRowActive: {
    borderColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.5)" : "rgba(218,186,102,0.25)",
    backgroundColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.06)" : "rgba(218,186,102,0.04)",
  },
  themeSwatches: {
    flexDirection: "row" as const,
    gap: 4,
    marginRight: 12,
  },
  themeSwatch: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: theme.key === "eventHorizon" ? "rgba(255,255,255,0.3)" : "rgba(200,216,240,0.1)",
  },
  themeInfo: {
    flex: 1,
  },
  themeName: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.key === "eventHorizon" ? "rgba(255,255,255,0.7)" : "rgba(200,216,240,0.6)",
  },
  themeNameActive: {
    color: theme.key === "eventHorizon" ? "#fff" : "rgba(218,186,102,0.8)",
  },
  themeKey: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: theme.key === "eventHorizon" ? "rgba(96,168,255,0.75)" : "rgba(200,216,240,0.25)",
    letterSpacing: 1,
    marginTop: 2,
  },
  themeCheck: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: theme.key === "eventHorizon" ? "#78c878" : "rgba(218,186,102,0.6)",
  },
  cardTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.settings.cardTitle,
    letterSpacing: 2,
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 24,
  },
  label: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.settings.label,
  },
  value: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.settings.value,
    flexShrink: 1,
    textAlign: "right" as const,
    letterSpacing: 1,
  },
  hint: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.settings.gaugeLabel,
    lineHeight: 17,
  },
  statusInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontFamily: fonts.silkscreen,
    fontSize: 10,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: theme.settings.fieldBg,
    borderWidth: 1,
    borderColor: theme.settings.statusBorder,
    color: theme.text,
    fontFamily: fonts.pixel,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
    ...(Platform.OS === "web"
      ? ({ outlineStyle: "none" } as any)
      : {}),
  },

  /* ── Buttons ── */
  btnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.settings.primaryBg,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.settings.primaryBorder,
  },
  primaryBtnText: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.settings.headerTitle,
    letterSpacing: 1,
  },
  outlineBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.settings.statusBorder,
    backgroundColor: theme.settings.fieldBgSoft,
  },
  outlineBtnText: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.settings.label,
    letterSpacing: 1,
  },
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.settings.secondaryBorder,
    backgroundColor: theme.settings.secondaryBg,
  },
  secondaryBtnText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.settings.secondaryText,
  },
  btnDisabled: { opacity: 0.35 },
  msg: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.settings.message,
    marginTop: 10,
  },
  dangerBtn: {
    marginTop: 14,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.settings.dangerBorder,
    backgroundColor: theme.settings.dangerBg,
  },
  dangerBtnInline: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.settings.dangerBorder,
    backgroundColor: theme.settings.dangerBg,
  },
  dangerText: {
    fontFamily: fonts.silkscreen,
    fontSize: 11,
    color: theme.error,
    letterSpacing: 1,
  },

  /* ── Bark devices ── */
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.settings.fieldBgSoft,
    borderWidth: 1,
    borderColor: theme.settings.deviceBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    gap: 8,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceTail: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: theme.settings.value,
  },
  deviceMeta: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: theme.settings.headerSub,
    marginTop: 2,
  },
  deviceDeleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.settings.deviceDeleteBorder,
  },
  deviceDeleteText: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.error,
  },

  /* ── Footer ── */
  footer: {
    alignItems: "center",
    marginTop: 36,
    marginBottom: 20,
    paddingHorizontal: 16,
    gap: 6,
  },
  footerDeco: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    justifyContent: "center",
  },
  footerLineL: {
    width: 50,
    height: 1,
    ...(Platform.OS === "web"
      ? { background: theme.settings.footerLineLeftGradient } as any
      : { backgroundColor: theme.settings.goldLineFallback }),
  },
  footerLineR: {
    width: 50,
    height: 1,
    ...(Platform.OS === "web"
      ? { background: theme.settings.footerLineRightGradient } as any
      : { backgroundColor: theme.settings.goldLineFallback }),
  },
  footerStar: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: theme.settings.footerGoldFaint,
  },
  footerTitle: {
    fontFamily: fonts.silkscreen,
    fontSize: 14,
    color: theme.settings.footerGold,
    letterSpacing: 4,
    marginTop: 4,
    ...(Platform.OS === "web"
      ? { textShadow: theme.settings.footerTitleShadow } as any : {}),
  },
  footerSub: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: theme.settings.headerSub,
    letterSpacing: 3,
  },
  footerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  footerMetaText: {
    fontFamily: fonts.silkscreen,
    fontSize: 7,
    color: theme.settings.footerMeta,
    letterSpacing: 1,
  },
  footerMetaDot: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.settings.footerDot,
  },
  footerQuote: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: theme.settings.footerQuote,
    marginTop: 4,
    fontStyle: "italic",
  },
});
}
