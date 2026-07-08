// achernar 系共用的小工具：情绪星组件 + 数值钳制 + 标签解析。
// 之前在 achernar.tsx / AchernarMemory / AchernarCalendar 各复制了一份，现在归拢到这里。
import { Platform, View } from "react-native";
import { SurfaceMemory } from "../../services/api";

export function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function emotionStarColor(valence: unknown): string {
  const v = clampNum(valence, -1, 1, 0);
  if (v >= 0.8) return "#ff8352";
  if (v >= 0.5) return "#ffcd56";
  if (v > 0.12) return "#ffeb9d";
  if (v <= -0.8) return "#996aff";
  if (v <= -0.5) return "#5c95ff";
  if (v < -0.12) return "#8ebdff";
  return "#f4efe4";
}

export function parseTags(tags: string[] | string | null | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try { const p = JSON.parse(tags); return Array.isArray(p) ? p : []; } catch { return []; }
}

let _starCssInjected = false;
function injectStarCSS() {
  if (_starCssInjected || Platform.OS !== "web" || typeof document === "undefined") return;
  _starCssInjected = true;
  const el = document.createElement("style");
  el.textContent = `
@keyframes emotion-star-breath{0%,100%{opacity:.62;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}
@keyframes emotion-star-flicker{0%{opacity:.45;transform:scale(.96)}50%{opacity:1;transform:scale(1.14)}100%{opacity:.72;transform:scale(1)}}`;
  document.head.appendChild(el);
}

interface EmotionStarProps {
  m: SurfaceMemory;
  /** 覆盖按 importance 算出的尺寸 */
  size?: number;
  /** 行内模式：带右边距和垂直居中（标题行里贴着文字用） */
  inline?: boolean;
}

export default function EmotionStar({ m, size: sizeOverride, inline }: EmotionStarProps) {
  const imp = clampNum((m as any).importance, 1, 5, 3);
  const aro = clampNum((m as any).arousal, 0, 1, 0.45);
  const size = sizeOverride ?? 6 + imp * 1.4;
  const opacity = 0.34 + imp * 0.12;
  const color = emotionStarColor((m as any).valence);
  const mode = aro >= 0.65 ? "flicker" : aro <= 0.25 ? "breath" : "calm";
  const speed = mode === "flicker" ? `${(1.25 - aro * 0.45).toFixed(2)}s` : `${(4.2 - aro * 3).toFixed(2)}s`;
  const inlineStyle = inline ? { marginRight: 4, alignSelf: "center" as const } : {};

  if (Platform.OS === "web") {
    injectStarCSS();
    return (
      <View style={{
        width: size, height: size, backgroundColor: color, opacity,
        flexShrink: 0, ...inlineStyle,
        ...({
          clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 56%,79% 91%,50% 70%,21% 91%,32% 56%,2% 35%,39% 35%)",
          boxShadow: `0 0 ${(size * 1.1).toFixed(0)}px ${color}`,
          animation: mode !== "calm" ? `emotion-star-${mode} ${speed} ${mode === "flicker" ? "steps(2,end)" : "ease-in-out"} infinite` : "none",
        } as any),
      } as any} />
    );
  }
  return <View style={{ width: size, height: size, backgroundColor: color, opacity, borderRadius: size / 2, flexShrink: 0, ...inlineStyle }} />;
}
