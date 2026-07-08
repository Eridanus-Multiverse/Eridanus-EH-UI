import { create } from "zustand";
import { Platform } from "react-native";
import { getItem, setItem, deleteItem } from "../services/storage";

function connectionUrl(serverUrl: string, path: string): string {
  const baseUrl = serverUrl.replace(/\/+$/, "");
  if (Platform.OS !== "web") return baseUrl + path;
  if (typeof window === "undefined") return baseUrl ? baseUrl + path : path;

  const host = window.location.hostname;
  const isLocalDev = host === "localhost" || host === "127.0.0.1";
  return isLocalDev && baseUrl ? baseUrl + path : path;
}

interface ConnectionState {
  serverUrl: string;
  secret: string;
  connected: boolean;
  configured: boolean;
  load: () => Promise<void>;
  save: (url: string, secret: string) => Promise<void>;
  setConnected: (v: boolean) => void;
  checkConnection: () => Promise<boolean>;
  clear: () => Promise<void>;
}

export const useConnection = create<ConnectionState>((set, get) => ({
  // 出厂默认 demo 模式（假数据展示）；设置页填入真实后端地址即切换
  serverUrl: "https://demo.local",
  secret: "demo",
  connected: true,
  configured: true,

  load: async () => {
    try {
      const url = await getItem("serverUrl");
      const secret = await getItem("secret");
      if (url && secret) {
        set({ serverUrl: url, secret, configured: true });
        await get().checkConnection();
      }
    } catch {}
  },

  save: async (url: string, secret: string) => {
    const cleaned = url.replace(/\/+$/, "");
    await setItem("serverUrl", cleaned);
    await setItem("secret", secret);
    set({ serverUrl: cleaned, secret, configured: true, connected: true });
  },

  setConnected: (v: boolean) => set({ connected: v }),

  checkConnection: async () => {
    // demo 哨值下永远视为已连接；真实地址走正常健康检查
    if (get().serverUrl === "https://demo.local") { set({ connected: true }); return true; }
    const { serverUrl, secret, configured } = get();
    if (!configured || !serverUrl || !secret) {
      set({ connected: false });
      return false;
    }

    try {
      const url = connectionUrl(
        serverUrl,
        "/api/chat/poll?since=2099-01-01T00:00:00.000Z"
      );
      const res = await fetch(url, {
        headers: { "X-Auth-Token": secret },
      });
      const ok = res.ok;
      set({ connected: ok });
      return ok;
    } catch {
      set({ connected: false });
      return false;
    }
  },

  clear: async () => {
    await deleteItem("serverUrl");
    await deleteItem("secret");
    set({ serverUrl: "", secret: "", configured: false, connected: false });
  },
}));
