import { useEffect, useState } from "react";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";
const DESKTOP_BREAKPOINT = 900;

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (!isWeb || typeof window === "undefined") return false;
    return window.innerWidth >= DESKTOP_BREAKPOINT;
  });

  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return;
    const handleResize = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isDesktop;
}
