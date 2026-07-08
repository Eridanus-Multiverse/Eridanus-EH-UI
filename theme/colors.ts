import { Platform } from "react-native";
import { defaultTheme } from "./themes";

// Backwards-compatible default theme export for files not yet migrated to useTheme().
export const colors = defaultTheme;

const isWeb = Platform.OS === "web";

export const fonts = {
  pixel: isWeb ? "'Silkscreen', 'Zpix', monospace" : "Zpix",
  mono: isWeb ? "'Silkscreen', 'Zpix', monospace" : "Zpix",
  silkscreen: isWeb ? "'Silkscreen', 'Zpix', monospace" : "Zpix",
  silkscreenBold: isWeb ? "'SilkscreenBold', 'Zpix', monospace" : "Zpix",
  chat: isWeb ? "'Silkscreen', 'Zpix', monospace" : "Zpix",
};
