import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { api, GatewayProvider, GatewayCrew } from "../../services/api";
import { fonts } from "../../theme/colors";
import { useThemeTokens } from "../../hooks/useTheme";

// API 船员招募面板（2026-07-07 压榨清单#3）
// Provider = 接进来的 API 通道；船员 = 挂在某个通道上的成员（名字+人格）。
// 招募完成后，聊天页 ☰ 菜单里会出现船员按钮，点击即可切换对话。

export default function CrewPanel() {
  const theme = useThemeTokens();
  const isEH = theme.key === "eventHorizon";
  const S = useMemo(() => makeStyles(isEH), [isEH]);

  const [providers, setProviders] = useState<GatewayProvider[]>([]);
  const [crew, setCrew] = useState<GatewayCrew[]>([]);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [showCrewForm, setShowCrewForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [pForm, setPForm] = useState<{ name: string; kind: "openai" | "anthropic"; base_url: string; api_key: string; model: string }>({ name: "", kind: "openai", base_url: "", api_key: "", model: "" });
  const [cForm, setCForm] = useState({ name: "", provider_id: "", persona: "" });

  const reload = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.gatewayProviders(), api.gatewayCrew()]);
      setProviders(p.providers || []);
      setCrew(c.crew || []);
    } catch {}
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(""), 4000); };

  const saveProvider = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.gatewayUpsertProvider(pForm);
      setPForm({ name: "", kind: "openai", base_url: "", api_key: "", model: "" });
      setShowProviderForm(false);
      flash("通道已保存");
      reload();
    } catch (e: any) {
      flash(`保存失败: ${e?.message || e}`);
    }
    setBusy(false);
  };

  const testProvider = async (id: string) => {
    if (busy) return;
    setBusy(true);
    flash("试航中…");
    try {
      const r = await api.gatewayTestProvider(id);
      flash(r.ok ? `连通 ✓ ${r.latency_ms}ms · "${(r.reply || "").slice(0, 30)}"` : `失败: ${r.error}`);
    } catch (e: any) {
      flash(`失败: ${e?.message || e}`);
    }
    setBusy(false);
  };

  const deleteProvider = async (id: string, name: string) => {
    const ok = Platform.OS === "web" ? (globalThis as any).confirm?.(`删除通道「${name}」？`) : true;
    if (!ok) return;
    await api.gatewayDeleteProvider(id).catch(() => {});
    reload();
  };

  const saveCrew = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.gatewayUpsertCrew(cForm);
      setCForm({ name: "", provider_id: "", persona: "" });
      setShowCrewForm(false);
      flash("船员已登舰——回聊天页 ☰ 菜单找 TA");
      reload();
    } catch (e: any) {
      flash(`招募失败: ${e?.message || e}`);
    }
    setBusy(false);
  };

  const deleteCrew = async (id: string, name: string) => {
    const ok = Platform.OS === "web" ? (globalThis as any).confirm?.(`让「${name}」下船？聊天记录保留。`) : true;
    if (!ok) return;
    await api.gatewayDeleteCrew(id).catch(() => {});
    reload();
  };

  return (
    <View style={S.card}>
      <Text style={S.title}>API 船员 · CREW REGISTRY</Text>
      {notice ? <Text style={S.notice}>{notice}</Text> : null}

      {/* ── 通道（provider）── */}
      <Text style={S.sectionLabel}>API 通道</Text>
      {providers.map((p) => (
        <View key={p.id} style={S.row}>
          <View style={{ flex: 1 }}>
            <Text style={S.rowName}>{p.name} <Text style={S.rowMeta}>{p.kind}</Text></Text>
            <Text style={S.rowMeta} numberOfLines={1}>{p.model} · {p.base_url}</Text>
          </View>
          <TouchableOpacity onPress={() => testProvider(p.id)} style={S.miniBtn}>
            <Text style={S.miniBtnText}>TEST</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteProvider(p.id, p.name)} style={S.miniBtn}>
            <Text style={[S.miniBtnText, S.danger]}>删</Text>
          </TouchableOpacity>
        </View>
      ))}
      {showProviderForm ? (
        <View style={S.form}>
          <TextInput style={S.input} placeholder="名字（如 GLM / DeepSeek）" placeholderTextColor={S._ph} value={pForm.name} onChangeText={(v) => setPForm((f) => ({ ...f, name: v }))} />
          <View style={S.kindRow}>
            {(["openai", "anthropic"] as const).map((k) => (
              <TouchableOpacity key={k} onPress={() => setPForm((f) => ({ ...f, kind: k }))} style={[S.kindBtn, pForm.kind === k && S.kindBtnOn]}>
                <Text style={[S.miniBtnText, pForm.kind === k && S.kindTextOn]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={S.input} placeholder="base_url（如 https://open.bigmodel.cn/api/paas/v4 去掉尾部/chat/completions）" placeholderTextColor={S._ph} value={pForm.base_url} onChangeText={(v) => setPForm((f) => ({ ...f, base_url: v }))} autoCapitalize="none" />
          <TextInput style={S.input} placeholder="api_key" placeholderTextColor={S._ph} value={pForm.api_key} onChangeText={(v) => setPForm((f) => ({ ...f, api_key: v }))} autoCapitalize="none" secureTextEntry />
          <TextInput style={S.input} placeholder="model（如 glm-4-plus / deepseek-chat）" placeholderTextColor={S._ph} value={pForm.model} onChangeText={(v) => setPForm((f) => ({ ...f, model: v }))} autoCapitalize="none" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={saveProvider} style={S.saveBtn}><Text style={S.saveBtnText}>保存通道</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowProviderForm(false)}><Text style={S.cancelText}>取消</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setShowProviderForm(true)} style={S.addBtn}>
          <Text style={S.addBtnText}>+ 接入新通道</Text>
        </TouchableOpacity>
      )}

      {/* ── 船员（crew）── */}
      <Text style={S.sectionLabel}>船员</Text>
      {crew.map((c) => {
        const prov = providers.find((p) => p.id === c.provider_id);
        return (
          <View key={c.id} style={S.row}>
            <View style={{ flex: 1 }}>
              <Text style={S.rowName}>◆ {c.name}</Text>
              <Text style={S.rowMeta} numberOfLines={1}>{prov ? `${prov.name} · ${prov.model}` : "⚠ 通道已失联"}</Text>
            </View>
            <TouchableOpacity onPress={() => deleteCrew(c.id, c.name)} style={S.miniBtn}>
              <Text style={[S.miniBtnText, S.danger]}>下船</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      {showCrewForm ? (
        <View style={S.form}>
          <TextInput style={S.input} placeholder="船员名字" placeholderTextColor={S._ph} value={cForm.name} onChangeText={(v) => setCForm((f) => ({ ...f, name: v }))} />
          <Text style={S.rowMeta}>挂载通道：</Text>
          <View style={S.kindRow}>
            {providers.map((p) => (
              <TouchableOpacity key={p.id} onPress={() => setCForm((f) => ({ ...f, provider_id: p.id }))} style={[S.kindBtn, cForm.provider_id === p.id && S.kindBtnOn]}>
                <Text style={[S.miniBtnText, cForm.provider_id === p.id && S.kindTextOn]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[S.input, { minHeight: 90, textAlignVertical: "top" }]}
            placeholder="人格 prompt（TA 是谁、怎么说话、和 Eri 的关系……）"
            placeholderTextColor={S._ph}
            value={cForm.persona}
            onChangeText={(v) => setCForm((f) => ({ ...f, persona: v }))}
            multiline
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={saveCrew} style={S.saveBtn}><Text style={S.saveBtnText}>登舰</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCrewForm(false)}><Text style={S.cancelText}>取消</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setShowCrewForm(true)} style={S.addBtn} disabled={!providers.length}>
          <Text style={S.addBtnText}>{providers.length ? "+ 招募船员" : "先接入一个通道才能招人"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(eh: boolean) {
  const border = eh ? "rgba(255,255,255,0.18)" : "rgba(120,160,220,0.25)";
  const text = eh ? "rgba(255,255,255,0.85)" : "rgba(210,222,240,0.9)";
  const dim = eh ? "rgba(255,255,255,0.45)" : "rgba(160,180,210,0.6)";
  const styles = StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: eh ? 0 : 10,
      backgroundColor: eh ? "rgba(0,0,0,0.6)" : "rgba(10,16,34,0.6)",
      padding: 14,
      marginBottom: 16,
    },
    title: { fontFamily: fonts.pixel, fontSize: 12, color: text, letterSpacing: 1, marginBottom: 6 },
    notice: { fontFamily: fonts.pixel, fontSize: 10, color: eh ? "#78c878" : "#7cc7a0", marginBottom: 6 },
    sectionLabel: { fontFamily: fonts.pixel, fontSize: 10, color: dim, letterSpacing: 2, marginTop: 10, marginBottom: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border },
    rowName: { fontFamily: fonts.pixel, fontSize: 12, color: text },
    rowMeta: { fontFamily: fonts.pixel, fontSize: 9, color: dim },
    miniBtn: { borderWidth: 1, borderColor: border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: eh ? 0 : 4 },
    miniBtnText: { fontFamily: fonts.pixel, fontSize: 9, color: text },
    danger: { color: eh ? "#c85050" : "#e07070" },
    form: { marginTop: 8, gap: 8 },
    input: {
      borderWidth: 1, borderColor: border, borderRadius: eh ? 0 : 6,
      color: text, fontFamily: fonts.pixel, fontSize: 12,
      paddingHorizontal: 10, paddingVertical: 8,
      backgroundColor: eh ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.04)",
    },
    kindRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    kindBtn: { borderWidth: 1, borderColor: border, paddingHorizontal: 10, paddingVertical: 5, borderRadius: eh ? 0 : 4 },
    kindBtnOn: { backgroundColor: eh ? "rgba(255,255,255,0.12)" : "rgba(120,170,240,0.2)", borderColor: eh ? "rgba(255,255,255,0.5)" : "rgba(120,170,240,0.6)" },
    kindTextOn: { color: eh ? "#fff" : "#bcd6ff" },
    saveBtn: { borderWidth: 1, borderColor: eh ? "rgba(255,255,255,0.5)" : "rgba(120,200,150,0.5)", backgroundColor: eh ? "rgba(255,255,255,0.08)" : "rgba(120,200,150,0.12)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: eh ? 0 : 6 },
    saveBtnText: { fontFamily: fonts.pixel, fontSize: 11, color: eh ? "#fff" : "#9fdcb8" },
    cancelText: { fontFamily: fonts.pixel, fontSize: 11, color: dim, paddingVertical: 8 },
    addBtn: { marginTop: 6, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderStyle: "dashed", borderColor: border, borderRadius: eh ? 0 : 6 },
    addBtnText: { fontFamily: fonts.pixel, fontSize: 11, color: dim },
  });
  return Object.assign(styles, { _ph: dim });
}
