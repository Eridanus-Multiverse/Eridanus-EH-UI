import { themes, type ThemeTokens } from "../theme/themes";

// EH demo：主题锁定 eventHorizon（开源版只带事件视界皮肤）
export function useThemeTokens(): ThemeTokens {
  return themes.eventHorizon;
}
