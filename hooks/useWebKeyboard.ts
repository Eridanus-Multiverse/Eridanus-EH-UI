import { useState, useEffect, RefObject, useRef } from "react";
import { Platform, View } from "react-native";

export function useWebKeyboardOpen() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    let raf: number | null = null;
    const update = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;
        const kb = Math.round(window.innerHeight - vv.height - vv.offsetTop);
        const next = kb > 80;
        if (openRef.current !== next) {
          openRef.current = next;
          setOpen(next);
        }
      });
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  return open;
}

export function useInstallWebKeyboardDataset() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    let raf: number | null = null;
    let current = "0";
    const update = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;
        const kb = Math.round(window.innerHeight - vv.height - vv.offsetTop);
        const next = kb > 80 ? "1" : "0";
        if (current !== next) {
          current = next;
          document.documentElement.dataset.keyboardOpen = next;
        }
      });
    };

    // Safari 的 keyboard avoidance 会把页面 scroll/viewport 推走。
    // 拦不住它，但可以立刻拉回来——会闪一下但不会飞走。
    const onWindowScroll = () => {
      window.scrollTo(0, 0);
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("scroll", onWindowScroll);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("scroll", onWindowScroll);
      if (raf !== null) cancelAnimationFrame(raf);
      delete document.documentElement.dataset.keyboardOpen;
    };
  }, []);
}

export function useWebViewportFit(
  containerRef: RefObject<View | null>,
  bottomInset: number,
) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    let raf: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHeight = 0;
    let lastResizeAt = 0;
    let predictUntil = 0;

    const update = (smooth = true) => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;
        const nextHeight = Math.round(vv.height);
        if (nextHeight < 200 || nextHeight > window.innerHeight + 50) return;
        const kb = Math.round(window.innerHeight - nextHeight - Math.round(vv.offsetTop));
        if (kb > 80) {
          try { localStorage.setItem("vvKbHeight", String(kb)); } catch {}
        }
        if (Math.abs(nextHeight - lastHeight) < 2) return;
        lastHeight = nextHeight;
        const el = containerRef.current as unknown as HTMLElement;
        if (!el) return;
        el.style.transition = smooth ? "max-height 0.12s ease-out" : "none";
        el.style.maxHeight = `${nextHeight}px`;
      });
    };

    const onVvResize = () => {
      const now = performance.now();
      if (now < predictUntil) {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => update(true), 180);
        return;
      }
      const rapid = now - lastResizeAt < 150;
      lastResizeAt = now;
      update(!rapid);
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => update(true), 180);
    };

    const onVvScroll = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => update(true), 120);
    };

    const keyboardOpen = () =>
      Math.round(window.innerHeight - vv.height - vv.offsetTop) > 80;

    const onFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag !== "TEXTAREA" && tag !== "INPUT") return;
      if (keyboardOpen()) return;
      let cached = 0;
      try { cached = Number(localStorage.getItem("vvKbHeight")) || 0; } catch {}
      if (cached <= 80 || cached > window.innerHeight * 0.7) return;
      const el = containerRef.current as unknown as HTMLElement;
      if (!el) return;
      const predicted = window.innerHeight - cached;
      el.style.transition = "none";
      el.style.maxHeight = `${predicted}px`;
      lastHeight = predicted;
      predictUntil = performance.now() + 650;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => update(true), 700);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!keyboardOpen() || !e.cancelable) return;
      let node = e.target as HTMLElement | null;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        const scrollable =
          ((cs.overflowY === "auto" || cs.overflowY === "scroll") &&
            node.scrollHeight > node.clientHeight + 1) ||
          ((cs.overflowX === "auto" || cs.overflowX === "scroll") &&
            node.scrollWidth > node.clientWidth + 1);
        if (scrollable) return;
        node = node.parentElement;
      }
      e.preventDefault();
    };

    const onVisChange = () => {
      if (document.hidden) return;
      if (!keyboardOpen()) return;
      let cached = 0;
      try { cached = Number(localStorage.getItem("vvKbHeight")) || 0; } catch {}
      if (cached <= 80 || cached > window.innerHeight * 0.7) return;
      const el = containerRef.current as unknown as HTMLElement;
      if (!el) return;
      const predicted = window.innerHeight - cached;
      el.style.transition = "none";
      el.style.maxHeight = `${predicted}px`;
      lastHeight = predicted;
      predictUntil = performance.now() + 650;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => update(true), 700);
    };

    vv.addEventListener("resize", onVvResize);
    vv.addEventListener("scroll", onVvScroll);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("visibilitychange", onVisChange);
    update();

    return () => {
      vv.removeEventListener("resize", onVvResize);
      vv.removeEventListener("scroll", onVvScroll);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("visibilitychange", onVisChange);
      if (raf !== null) cancelAnimationFrame(raf);
      if (settleTimer) clearTimeout(settleTimer);
      const el = containerRef.current as unknown as HTMLElement | null;
      if (el) {
        el.style.maxHeight = "";
        el.style.transition = "";
      }
    };
  }, [containerRef, bottomInset]);
}
