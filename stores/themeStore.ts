import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultThemeKey, themes, type ThemeKey } from "../theme/themes";

interface ThemeState {
  themeKey: ThemeKey;
  setTheme: (key: ThemeKey) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeKey: defaultThemeKey,
      setTheme: (key) => {
        if (!themes[key]) return;
        set({ themeKey: key });
      },
    }),
    {
      name: "horizon-theme",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
