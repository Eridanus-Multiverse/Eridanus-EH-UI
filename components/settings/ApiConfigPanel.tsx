import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api, ApiChatConfig, ApiChatModelOption } from "../../services/api";
import { fonts } from "../../theme/colors";

const MODES = [
  { value: "tmux", label: "tmux", desc: "本地 Claude Code" },
  { value: "auto", label: "auto", desc: "tmux 优先，断了走 API" },
  { value: "api", label: "api", desc: "仅 API" },
] as const;

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai_compatible", label: "OpenAI 兼容" },
] as const;

export default function ApiConfigPanel() {
  const [config, setConfig] = useState<ApiChatConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [maxTokensInput, setMaxTokensInput] = useState("2048");
  const [temperatureInput, setTemperatureInput] = useState("0.7");
  const [msg, setMsg] = useState("");

  const [remoteModels, setRemoteModels] = useState<ApiChatModelOption[]>([]);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.getApiChatConfig();
      setConfig(r.config);
      setBaseUrlInput(r.config.base_url || "");
      setModelInput(r.config.model || "");
      setMaxTokensInput(String(r.config.max_tokens || 2048));
      setTemperatureInput(String(r.config.temperature ?? 0.7));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (msgTimerRef.current) clearTimeout(msgTimerRef.current); }, []);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setSaving(true);
    setMsg("");
    try {
      const r = await api.updateApiChatConfig(patch as any);
      if (r.ok) {
        setConfig(r.config);
        setBaseUrlInput(r.config.base_url || "");
        setModelInput(r.config.model || "");
        setApiKeyInput("");
        setMsg("已保存");
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
        msgTimerRef.current = setTimeout(() => setMsg(""), 2000);
      }
    } catch (e: any) {
      setMsg("保存失败");
    }
    setSaving(false);
  }, []);

  const fetchModels = useCallback(async () => {
    setModelsFetching(true);
    setModelsError("");
    setModelsOpen(true);
    try {
      const r = await api.fetchAvailableModels();
      if (r.ok) {
        setRemoteModels(r.models);
        if (r.models.length === 0) setModelsError("这个接口没有返回任何模型");
      } else {
        setModelsError("拉取失败");
      }
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("还没设")) {
        setModelsError(msg);
      } else {
        setModelsError("连接失败，检查 URL 和 Key");
      }
    }
    setModelsFetching(false);
  }, []);

  if (loading) return <ActivityIndicator color="#c8b467" style={{ padding: 20 }} />;
  if (!config) return <Text style={s.hint}>无法加载配置</Text>;

  return (
    <View style={s.wrap}>
      {/* mode */}
      <Text style={s.fieldLabel}>模式</Text>
      <View style={s.chips}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.value}
            style={[s.chip, config.mode === m.value && s.chipActive]}
            onPress={() => save({ mode: m.value })}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, config.mode === m.value && s.chipTextActive]}>
              {m.label}
            </Text>
            <Text style={s.chipDesc}>{m.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* provider */}
      <Text style={s.fieldLabel}>Provider</Text>
      <View style={s.chips}>
        {PROVIDERS.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[s.chip, config.provider === p.value && s.chipActive]}
            onPress={() => save({ provider: p.value })}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, config.provider === p.value && s.chipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* API key */}
      <Text style={s.fieldLabel}>
        API Key{config.api_key_configured ? ` (${config.api_key_masked || "已设置"})` : ""}
      </Text>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={apiKeyInput}
          onChangeText={setApiKeyInput}
          placeholder={config.api_key_configured ? "输入新 key 覆盖" : "sk-..."}
          placeholderTextColor="rgba(139,182,225,0.38)"
          secureTextEntry={Platform.OS !== "web"}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[s.saveBtn, !apiKeyInput.trim() && s.saveBtnDisabled]}
          onPress={() => apiKeyInput.trim() && save({ api_key: apiKeyInput.trim() })}
          activeOpacity={0.7}
          disabled={!apiKeyInput.trim()}
        >
          <Text style={s.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </View>

      {/* base URL */}
      <Text style={s.fieldLabel}>Base URL</Text>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={baseUrlInput}
          onChangeText={setBaseUrlInput}
          placeholder="https://api.anthropic.com"
          placeholderTextColor="rgba(139,182,225,0.38)"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={s.saveBtn}
          onPress={() => save({ base_url: baseUrlInput })}
          activeOpacity={0.7}
        >
          <Text style={s.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </View>

      {/* model — manual input */}
      <Text style={s.fieldLabel}>Model</Text>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={modelInput}
          onChangeText={setModelInput}
          placeholder="claude-sonnet-4-6"
          placeholderTextColor="rgba(139,182,225,0.38)"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={s.saveBtn}
          onPress={() => save({ model: modelInput })}
          activeOpacity={0.7}
        >
          <Text style={s.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </View>

      {/* max tokens & temperature */}
      <View style={s.compactRow}>
        <View style={s.compactField}>
          <Text style={s.fieldLabel}>Max Tokens</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={maxTokensInput}
              onChangeText={setMaxTokensInput}
              placeholder="2048"
              placeholderTextColor="rgba(139,182,225,0.38)"
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={s.saveBtn}
              onPress={() => save({ max_tokens: Number(maxTokensInput) || 2048 })}
              activeOpacity={0.7}
            >
              <Text style={s.saveBtnText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.compactField}>
          <Text style={s.fieldLabel}>Temperature</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={temperatureInput}
              onChangeText={setTemperatureInput}
              placeholder="0.7"
              placeholderTextColor="rgba(139,182,225,0.38)"
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={s.saveBtn}
              onPress={() => save({ temperature: Number(temperatureInput) || 0.7 })}
              activeOpacity={0.7}
            >
              <Text style={s.saveBtnText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* fetch models button */}
      <TouchableOpacity
        style={[s.fetchBtn, modelsFetching && s.fetchBtnLoading]}
        onPress={fetchModels}
        activeOpacity={0.7}
        disabled={modelsFetching}
      >
        <Text style={s.fetchBtnText}>
          {modelsFetching ? "正在拉取..." : "▸ 获取可用模型"}
        </Text>
        {!config.api_key_configured && (
          <Text style={s.fetchBtnHint}>需要先设好 key 和 URL</Text>
        )}
      </TouchableOpacity>

      {/* remote models list */}
      {modelsOpen && (
        <View style={s.modelListWrap}>
          {modelsFetching ? (
            <ActivityIndicator color="#c8b467" style={{ padding: 12 }} />
          ) : modelsError ? (
            <Text style={s.modelsError}>{modelsError}</Text>
          ) : (
            <>
              <Text style={s.modelListCount}>{remoteModels.length} 个可用模型</Text>
              <ScrollView
                style={s.modelListScroll}
                nestedScrollEnabled
              >
                {remoteModels.map((m) => {
                  const isActive = config.model === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[s.modelItem, isActive && s.modelItemActive]}
                      onPress={() => {
                        setModelInput(m.id);
                        save({ model: m.id });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.modelItemText, isActive && s.modelItemTextActive]}>
                        {m.id}
                      </Text>
                      {isActive && <Text style={s.modelItemCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      )}

      {(saving || !!msg) && (
        <Text style={[s.msg, msg === "保存失败" && s.msgErr]}>
          {saving ? "保存中..." : msg}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 4, paddingVertical: 8 },
  hint: { fontFamily: fonts.pixel, fontSize: 10, color: "rgba(139,182,225,0.5)", textAlign: "center", padding: 12 },
  fieldLabel: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: "rgba(254,214,109,0.6)",
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 4,
  },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(103,165,227,0.26)",
    backgroundColor: "rgba(4,19,45,0.6)",
  },
  chipActive: {
    borderColor: "rgba(254,214,109,0.5)",
    backgroundColor: "rgba(254,214,109,0.16)",
  },
  chipText: { fontFamily: fonts.pixel, fontSize: 9, color: "rgba(139,182,225,0.5)" },
  chipTextActive: { color: "#fed66d" },
  chipDesc: { fontFamily: fonts.pixel, fontSize: 7, color: "rgba(139,182,225,0.38)", marginTop: 2 },
  inputRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  input: {
    flex: 1,
    fontFamily: fonts.pixel,
    fontSize: 9,
    color: "#a2bfdc",
    borderWidth: 1,
    borderColor: "rgba(103,165,227,0.26)",
    backgroundColor: "rgba(4,19,45,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  saveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(254,214,109,0.5)",
    backgroundColor: "rgba(254,214,109,0.16)",
  },
  saveBtnDisabled: { opacity: 0.3 },
  saveBtnText: { fontFamily: fonts.pixel, fontSize: 9, color: "#fed66d" },
  compactRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  compactField: { flex: 1 },
  fetchBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(103,165,227,0.3)",
    borderStyle: "dashed" as any,
    backgroundColor: "rgba(4,19,45,0.5)",
  },
  fetchBtnLoading: { opacity: 0.5 },
  fetchBtnText: { fontFamily: fonts.pixel, fontSize: 9, color: "rgba(139,182,225,0.5)" },
  fetchBtnHint: { fontFamily: fonts.pixel, fontSize: 7, color: "rgba(139,182,225,0.38)", marginTop: 2 },
  modelListWrap: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(103,165,227,0.2)",
    backgroundColor: "rgba(3,12,31,0.6)",
  },
  modelsError: { fontFamily: fonts.pixel, fontSize: 9, color: "rgba(252,78,78,0.7)", padding: 12 },
  modelListCount: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: "rgba(139,182,225,0.38)",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  modelListScroll: { maxHeight: 240 },
  modelItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(103,165,227,0.12)",
  },
  modelItemActive: {
    backgroundColor: "rgba(254,214,109,0.12)",
  },
  modelItemText: { fontFamily: fonts.pixel, fontSize: 8, color: "rgba(139,182,225,0.5)", flex: 1 },
  modelItemTextActive: { color: "#fed66d" },
  modelItemCheck: { fontFamily: fonts.pixel, fontSize: 10, color: "#fed66d", marginLeft: 8 },
  msg: { fontFamily: fonts.pixel, fontSize: 8, color: "rgba(254,214,109,0.6)", marginTop: 8, textAlign: "center" },
  msgErr: { color: "rgba(252,78,78,0.7)" },
});
