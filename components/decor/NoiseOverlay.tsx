import { useEffect } from "react";
import { Platform } from "react-native";
import { useThemeTokens } from "../../hooks/useTheme";

export default function NoiseOverlay() {
  const theme = useThemeTokens();
  const enabled = theme.decor.noiseOverlay ?? false;

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;
    const id = "noise-grain-css";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    /* Perf note (Eri, 7/5 "闪动还在而且很卡"): the CRT flicker animated whole-page
       opacity every 150ms (constant repaint) and all three grain layers used
       mix-blend-mode, forcing full-screen offscreen compositing on every scroll
       frame. On a pure-black背景 screen/multiply with white/black grain is
       mathematically identical to plain alpha compositing — so blends are gone,
       the flicker is gone, and each layer gets its own compositor layer. */
    style.textContent = `
      /* Layer 1: Film grain noise — plain alpha (≡ screen on black) */
      [data-noise="1"]::before {
        content: "";
        position: fixed;
        inset: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 9998;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='3' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");
        background-size: 200px 200px;
        opacity: 0.06;
        transform: translateZ(0);
      }

      /* Layer 2: Finer grain */
      [data-noise="1"]::after {
        content: "";
        position: fixed;
        inset: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 9999;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='fn'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23fn)' opacity='0.25'/%3E%3C/svg%3E");
        background-size: 128px 128px;
        opacity: 0.08;
        transform: translateZ(0);
      }

      /* Layer 3: Dark grain — plain black alpha (≡ multiply for pure-black grain);
         still etches bright lines/plates. Coarse frequency (0.45) so specks
         survive anti-aliasing on 1px strokes. */
      [data-noisedark] {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9999;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='dn'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.45' numOctaves='2' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='discrete' tableValues='0'/%3E%3CfeFuncG type='discrete' tableValues='0'/%3E%3CfeFuncB type='discrete' tableValues='0'/%3E%3CfeFuncA type='discrete' tableValues='0 0 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23dn)'/%3E%3C/svg%3E");
        background-size: 160px 160px;
        /* 0.4 read as dirt on bright plates (Eri, 7/3) — 0.28 keeps the etch without the grime */
        opacity: 0.28;
        transform: translateZ(0);
      }

      /* light rooms (jellyfish, atlas halls, lightbox) opt out — grain is
         invisible on black but reads as dirt on light UI */
      html[data-noisefree="1"] [data-noise="1"]::before,
      html[data-noisefree="1"] [data-noise="1"]::after,
      html[data-noisefree="1"] [data-noisedark] {
        display: none !important;
      }
    `;
    return () => { if (style) style.textContent = ""; };
  }, [enabled]);

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;
    // halftone scan-dot layer removed 2026-07-02 — a selector bug kept it invisible
    // since launch, and once fixed it read as an alien dot grid, not film grain
    document.getElementById("noise-scandots")?.remove();
    const id = "noise-darkgrain";
    if (document.getElementById(id)) return;
    const el = document.createElement("div");
    el.id = id;
    el.dataset.noisedark = "1";
    document.body.appendChild(el);
    return () => { el.remove(); };
  }, [enabled]);

  return null;
}

// Mount inside any light-colored screen to suspend the EH grain/flicker layers
// while it is on screen (multiple mounts stack via counter).
let _noiseFreeCount = 0;
export function useNoiseFree(active: boolean = true) {
  useEffect(() => {
    if (Platform.OS !== "web" || !active || typeof document === "undefined") return;
    _noiseFreeCount += 1;
    document.documentElement.dataset.noisefree = "1";
    return () => {
      _noiseFreeCount = Math.max(0, _noiseFreeCount - 1);
      if (_noiseFreeCount === 0) delete document.documentElement.dataset.noisefree;
    };
  }, [active]);
}
