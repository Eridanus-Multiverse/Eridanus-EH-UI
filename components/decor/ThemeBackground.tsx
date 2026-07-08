import { memo } from "react";
import { Platform } from "react-native";
import { useThemeTokens } from "../../hooks/useTheme";
import EridaniOrbits from "../chat/EridaniOrbits";
import Starfield from "../chat/Starfield";
import StaticOrbits from "../chat/StaticOrbits";
import CrtScanlines from "./CrtScanlines";

type BackgroundSlot = "starfield" | "none";
export type OrbitSlot = "" | "none" | "static-left-cursa" | "static-right-home";

interface ThemeBackgroundProps {
  backgroundSlot?: BackgroundSlot;
  orbitSlot?: OrbitSlot;
  crt?: boolean;
  crtColor?: string;
  /** chat-only scene artwork (EH posters), like the orrery slot */
  scene?: "blackhole" | "cursa" | "horizon";
}

function ThemeBackground({ backgroundSlot, orbitSlot, crt = false, crtColor, scene }: ThemeBackgroundProps) {
  const theme = useThemeTokens();
  const bg = backgroundSlot ?? theme.decor.backgroundSlot;
  // orrery decorations belong to the deep-space theme — event horizon paints its
  // own poster scenes, so page-passed orbit slots are suppressed wholesale here
  const orbit = theme.key === "eventHorizon" ? "none" : (orbitSlot ?? theme.decor.orbitSlot);

  return (
    <>
      {bg === "starfield" && <Starfield scene={scene} />}
      {orbit === "" && <EridaniOrbits />}
      {Platform.OS === "web" && orbit === "static-left-cursa" && <StaticOrbits side="left" theme="cursa" />}
      {Platform.OS === "web" && orbit === "static-right-home" && <StaticOrbits side="right" theme="home" />}
      {crt && <CrtScanlines color={crtColor} />}
    </>
  );
}

export default memo(ThemeBackground);
