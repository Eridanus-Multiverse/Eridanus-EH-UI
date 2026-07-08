import { create } from "zustand";

export type ApiFailureKind = "config" | "http" | "network" | "timeout" | "parse" | "abort";

export interface ApiFailure {
  id: number;
  at: string;
  method: string;
  path: string;
  kind: ApiFailureKind;
  message: string;
  status?: number;
  durationMs: number;
}

interface ApiDiagnosticsState {
  totalRequests: number;
  okRequests: number;
  failedRequests: number;
  timeoutRequests: number;
  lastRequestAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailure: ApiFailure | null;
  recentFailures: ApiFailure[];
  recordSuccess: (meta: { path: string; method: string; durationMs: number }) => void;
  recordFailure: (failure: Omit<ApiFailure, "id" | "at">) => void;
  clear: () => void;
}

let nextFailureId = 1;

export const useApiDiagnostics = create<ApiDiagnosticsState>((set) => ({
  totalRequests: 0,
  okRequests: 0,
  failedRequests: 0,
  timeoutRequests: 0,
  lastRequestAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailure: null,
  recentFailures: [],

  recordSuccess: () => {
    const now = new Date().toISOString();
    set((state) => ({
      totalRequests: state.totalRequests + 1,
      okRequests: state.okRequests + 1,
      lastRequestAt: now,
      lastSuccessAt: now,
    }));
  },

  recordFailure: (failure) => {
    const now = new Date().toISOString();
    const fullFailure: ApiFailure = {
      ...failure,
      id: nextFailureId++,
      at: now,
      message:
        failure.message.length > 180
          ? `${failure.message.slice(0, 177)}...`
          : failure.message,
    };
    set((state) => ({
      totalRequests: state.totalRequests + 1,
      failedRequests: state.failedRequests + 1,
      timeoutRequests:
        state.timeoutRequests + (failure.kind === "timeout" ? 1 : 0),
      lastRequestAt: now,
      lastFailureAt: now,
      lastFailure: fullFailure,
      recentFailures: [fullFailure, ...state.recentFailures].slice(0, 6),
    }));
  },

  clear: () =>
    set({
      totalRequests: 0,
      okRequests: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      lastRequestAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailure: null,
      recentFailures: [],
    }),
}));
