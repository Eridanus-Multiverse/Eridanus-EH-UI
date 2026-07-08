import { Platform } from "react-native";
import { api } from "./api";

// base64url → Uint8Array (VAPID public key needs this for applicationServerKey)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type PushSupport =
  | { supported: false; reason: string }
  | { supported: true; permission: NotificationPermission };

const SERVICE_WORKER_URL = "/app/sw.js";
const SERVICE_WORKER_SCOPE = "/app/";
const VISIBILITY_HEARTBEAT_MS = 2000;
let visibilityInitialized = false;

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
  if (!reg) {
    reg = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: SERVICE_WORKER_SCOPE,
    });
  }
  if (reg.active) return reg;
  return withTimeout(
    navigator.serviceWorker.ready,
    10000,
    "Service Worker 未就绪，请刷新后再试"
  );
}

export function checkPushSupport(): PushSupport {
  if (Platform.OS !== "web") return { supported: false, reason: "仅支持 Web 端" };
  if (typeof window === "undefined") return { supported: false, reason: "无 window" };
  if (!("serviceWorker" in navigator)) return { supported: false, reason: "浏览器不支持 Service Worker" };
  if (!("PushManager" in window)) return { supported: false, reason: "浏览器不支持 Push API" };
  if (!("Notification" in window)) return { supported: false, reason: "浏览器不支持 Notification API" };

  // iOS-specific: Web Push only works in standalone (Add to Home Screen) mode
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isStandalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (window.navigator as any).standalone === true;
  if (isIOS && !isStandalone) {
    return { supported: false, reason: "iOS 需要先把应用『添加到主屏幕』，然后从桌面图标打开才能开推送" };
  }

  return { supported: true, permission: Notification.permission };
}

export async function enablePush(): Promise<{ ok: boolean; detail: string }> {
  const sup = checkPushSupport();
  if (!sup.supported) return { ok: false, detail: sup.reason };

  // Request permission (must be in a user gesture handler)
  let perm = sup.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") return { ok: false, detail: "通知权限被拒绝" };

  // Ensure SW is registered and ready. Without this, `ready` can hang forever
  // when index.html was not patched or the SW failed to install.
  let reg: ServiceWorkerRegistration;
  try {
    reg = await ensureServiceWorkerReady();
  } catch (e: any) {
    return { ok: false, detail: "Service Worker 启动失败: " + (e?.message || "unknown") };
  }

  // Fetch VAPID public key
  let publicKey: string;
  try {
    const r = await api.pushPublicKey();
    publicKey = r.publicKey;
  } catch (e: any) {
    return { ok: false, detail: "拉公钥失败: " + (e?.message || "unknown") };
  }

  // Subscribe (or reuse existing subscription)
  let subscription: PushSubscription;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      subscription = existing;
    } else {
      const key = urlBase64ToUint8Array(publicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer.slice(
          key.byteOffset,
          key.byteOffset + key.byteLength
        ) as ArrayBuffer,
      });
    }
  } catch (e: any) {
    return { ok: false, detail: "订阅失败: " + (e?.message || "unknown") };
  }

  // Send subscription to backend
  try {
    await api.pushSubscribe(subscription.toJSON() as PushSubscriptionJSON);
  } catch (e: any) {
    return { ok: false, detail: "上传订阅失败: " + (e?.message || "unknown") };
  }

  return { ok: true, detail: "推送已开启" };
}

export async function disablePush(): Promise<{ ok: boolean; detail: string }> {
  if (Platform.OS !== "web") return { ok: false, detail: "仅支持 Web 端" };
  try {
    const reg = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
    if (!reg) return { ok: true, detail: "已关闭推送" };
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try { await api.pushUnsubscribe(endpoint); } catch {}
    }
    return { ok: true, detail: "已关闭推送" };
  } catch (e: any) {
    return { ok: false, detail: "关闭失败: " + (e?.message || "unknown") };
  }
}

export function initPushVisibility(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (visibilityInitialized) return;
  visibilityInitialized = true;
  const notify = () => {
    api.pushVisibility(!document.hidden).catch(() => {});
    navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE).then((reg) => {
      if (reg?.active) {
        reg.active.postMessage({
          type: "VISIBILITY",
          visible: !document.hidden,
          ts: Date.now(),
        });
      }
    });
  };
  document.addEventListener("visibilitychange", notify);
  window.addEventListener("focus", notify);
  window.addEventListener("blur", notify);
  window.addEventListener("pagehide", notify);
  notify();
  window.setInterval(() => {
    if (!document.hidden) notify();
  }, VISIBILITY_HEARTBEAT_MS);
}

export async function isPushSubscribed(): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null && Notification.permission === "granted";
  } catch {
    return false;
  }
}
