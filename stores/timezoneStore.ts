import { create } from "zustand";

const DEFAULT_TIMEZONE = "Europe/London";

export function timezoneLabel(timezone: string | null | undefined): string {
  if (timezone === "Asia/Shanghai") return "北京";
  if (timezone === "Europe/London") return "伦敦";
  return timezone || "读取中";
}

interface TimezoneState {
  timezone: string;
  utcOffset: string | null;
  localTime: string | null;
  setTimezone: (timezone: string, meta?: { utcOffset?: string | null; localTime?: string | null }) => void;
}

export const useTimezone = create<TimezoneState>((set) => ({
  timezone: DEFAULT_TIMEZONE,
  utcOffset: null,
  localTime: null,
  setTimezone: (timezone, meta = {}) =>
    set({
      timezone: timezone || DEFAULT_TIMEZONE,
      utcOffset: meta.utcOffset ?? null,
      localTime: meta.localTime ?? null,
    }),
}));
