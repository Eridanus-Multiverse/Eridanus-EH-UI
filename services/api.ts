import { Platform } from "react-native";
import { useApiDiagnostics, ApiFailureKind } from "../stores/apiDiagnosticsStore";
import { useConnection } from "../stores/connectionStore";
import { shrinkImageBlob } from "./imageShrink";

const DEFAULT_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 60000;

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

export class ApiRequestError extends Error {
  kind: ApiFailureKind;
  path: string;
  status?: number;
  body?: string;
  durationMs: number;

  constructor(args: {
    kind: ApiFailureKind;
    path: string;
    message: string;
    status?: number;
    body?: string;
    durationMs: number;
  }) {
    super(args.message);
    this.name = "ApiRequestError";
    this.kind = args.kind;
    this.path = args.path;
    this.status = args.status;
    this.body = args.body;
    this.durationMs = args.durationMs;
  }
}

function pickUrl(baseUrl: string, path: string): string {
  if (Platform.OS !== "web") return baseUrl + path;
  if (typeof window === "undefined") return baseUrl ? baseUrl + path : path;

  const host = window.location.hostname;
  const isLocalDev = host === "localhost" || host === "127.0.0.1";
  return isLocalDev && baseUrl ? baseUrl + path : path;
}

function createTimeoutSignal(timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromCaller);
    }
  }

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

function methodOf(options: RequestInit): string {
  return (options.method || "GET").toUpperCase();
}

function recordFailure(args: {
  path: string;
  method: string;
  kind: ApiFailureKind;
  message: string;
  status?: number;
  durationMs: number;
}) {
  useApiDiagnostics.getState().recordFailure(args);
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { name?: unknown; message?: unknown };
  if (maybe.name === "AbortError") return true;
  const message = typeof maybe.message === "string" ? maybe.message : "";
  return /abort(ed)?/i.test(message);
}

function classifyFetchFailure(
  error: unknown,
  timedOut: boolean,
  timeoutMs: number,
): { kind: ApiFailureKind; message: string } {
  if (timedOut) {
    return { kind: "timeout", message: `timeout after ${timeoutMs}ms` };
  }
  if (isAbortLikeError(error)) {
    return { kind: "abort", message: "request aborted" };
  }
  return {
    kind: "network",
    message: error instanceof Error ? error.message : String(error),
  };
}

import { demoResponse } from "./demoData";

// DEMO 哨值：serverUrl 为该值（默认出厂态）时全部请求走本地 mock 不出网；
// 在设置页填入你自己的后端地址即切换为真实请求（协议见 README 的 API 表）。
export const DEMO_SERVER_SENTINEL = "https://demo.local";

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const startedAt = Date.now();
  const method = methodOf(options);
  const demoMode = useConnection.getState().serverUrl === DEMO_SERVER_SENTINEL;
  if (demoMode) return Promise.resolve(demoResponse(path, method) as T);
  const { serverUrl, secret } = useConnection.getState();
  const baseUrl = serverUrl.replace(/\/+$/, "");
  if (!baseUrl && Platform.OS !== "web") {
    const durationMs = Date.now() - startedAt;
    recordFailure({
      path,
      method,
      kind: "config",
      message: "not configured",
      durationMs,
    });
    throw new ApiRequestError({
      kind: "config",
      path,
      message: "not configured",
      durationMs,
    });
  }
  const url = pickUrl(baseUrl, path);
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const timeout = createTimeoutSignal(timeoutMs, fetchOptions.signal ?? undefined);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: timeout.signal,
      headers: {
        "X-Auth-Token": secret,
        ...(fetchOptions.headers || {}),
      },
    });

    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const message = `${res.status}: ${body}`;
      recordFailure({
        path,
        method,
        kind: "http",
        message,
        status: res.status,
        durationMs,
      });
      throw new ApiRequestError({
        kind: "http",
        path,
        status: res.status,
        body,
        message,
        durationMs,
      });
    }

    try {
      const data = (await res.json()) as T;
      useApiDiagnostics.getState().recordSuccess({ path, method, durationMs });
      return data;
    } catch (error) {
      if (isAbortLikeError(error)) {
        const message = "request aborted while reading response";
        recordFailure({
          path,
          method,
          kind: "abort",
          message,
          durationMs,
        });
        throw new ApiRequestError({
          kind: "abort",
          path,
          message,
          durationMs,
        });
      }
      const message = `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`;
      recordFailure({
        path,
        method,
        kind: "parse",
        message,
        durationMs,
      });
      throw new ApiRequestError({
        kind: "parse",
        path,
        message,
        durationMs,
      });
    }
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    const durationMs = Date.now() - startedAt;
    const { kind, message } = classifyFetchFailure(error, timeout.timedOut, timeoutMs);
    recordFailure({ path, method, kind, message, durationMs });
    throw new ApiRequestError({ kind, path, message, durationMs });
  } finally {
    timeout.cleanup();
  }
}

export interface ChatAttachment {
  id: string;
  url: string;
  type: string;
  sort_order: number;
}

export interface ChatMessage {
  id: string;
  client_id?: string;
  ts: string;
  role: "user" | "assistant" | "system";
  assistant?: "epsilon" | "cursa" | string;
  text: string;
  source?: string;
  status?: string;
  quoted_id?: string;
  quoted_text?: string;
  attachment_id?: string;
  attachment_url?: string;
  attachment_type?: string;
  attachments?: ChatAttachment[];
  reactions?: string;
  thinking?: string;
  tool_calls?: string;
  content_blocks?: string;
  voice_url?: string;
  edited_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  read_at?: string | null;
  feedback_rating?: "like" | "dislike" | null;
  feedback_reason?: string | null;
  feedback_at?: string | null;
  error?: string;
}

export interface CompanionNote {
  id: string;
  content: string;
  note_type: string;
  date: string;
  created_at: string;
  read_at: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  emotion_beat?: string;
}

export interface CurrentMood {
  pa: number;
  na: number;
  decoration_mood: string;
  surfaced_top1: string;
  recent_high_arousal: unknown[];
  recent_eri_notes: unknown[];
  prompt: string;
}

export interface MoodEvent {
  id: number | string;
  source: string;
  pa_delta: number;
  na_delta: number;
  valence: number;
  arousal: number;
  primary_word?: string | null;
  match_source?: string | null;
  importance?: number | null;
  created_at: number | string;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export type SyncTableName = "chat_messages" | "companion_notes" | "mood_events";

export interface SyncPullResponse {
  chat_messages?: ChatMessage[];
  companion_notes?: CompanionNote[];
  mood_events?: MoodEvent[];
  has_more: boolean;
  server_time: string;
  limit: number;
  elapsed_ms: number;
}

export type ContextThresholdBand = "safe" | "soft" | "hard" | "emergency";

export interface ContextUsage {
  threshold_band: ContextThresholdBand;
  estimated_tokens: number;
  ratio: number;
  jsonl_size_bytes: number;
  turn_count: number | null;
  measured_at: string | null;
  token_budget: number;
  stale?: boolean;
  stale_age_seconds?: number | null;
  session_id?: string | null;
  source?: string | null;
}

export interface ControlEvent {
  id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

export interface ProactiveConfig {
  enabled?: boolean;
  dream_enabled?: boolean;
  interval_minutes?: number | null;
  quiet_hours_start?: number | null;
  quiet_hours_end?: number | null;
  dream_time?: string | null;
  last_fired_at?: string | null;
  last_dream_at?: string | null;
  online_window_minutes?: number | null;
  proactive_prompt?: string | null;
  dream_prompt?: string | null;
  auto_session_enabled?: boolean;
  last_auto_session_at?: string | null;
  gmail_autonomous?: boolean;
}

export interface HealthStatus {
  status: string;
  memories?: number;
  name?: string;
  [key: string]: unknown;
}

export interface UsageWindow {
  utilization: number;
  used_percent?: number;
  resets_at: string;
  reset_at?: number;
  reset_after_seconds?: number;
  limit_window_seconds?: number;
}

export interface BridgeDashboard {
  checked_at: string;
  claude_usage: {
    available: boolean;
    status?: number;
    five_hour?: UsageWindow;
    seven_day?: UsageWindow;
    seven_day_sonnet?: UsageWindow | null;
    extra_usage?: Record<string, unknown>;
    fetched_at?: string;
    cached?: boolean;
  };
  codex_usage: {
    available: boolean;
    status?: number;
    source?: string;
    plan_type?: string;
    primary_window?: UsageWindow;
    secondary_window?: UsageWindow;
    additional_rate_limits?: Array<Record<string, unknown>>;
    credits?: Record<string, unknown>;
    fetched_at?: string;
    cached?: boolean;
  };
  crew: CompanionStatus[];
  ship: {
    uptime_seconds: number;
    system_uptime_seconds?: number;
    memories_count: number;
    server_time: string;
    timezone?: string;
  };
}

export type PatrolStatus = "ok" | "watch" | "warning" | "critical" | string;

export interface PatrolIssue {
  level: PatrolStatus;
  title: string;
  detail: string;
  metric?: string;
  [key: string]: unknown;
}

export interface PatrolReport {
  generated_at: string;
  status: PatrolStatus;
  summary: string;
  issues: PatrolIssue[];
  highlights: string[];
  snapshot_path?: string;
}

export interface PatrolPayload {
  available: boolean;
  stale: boolean;
  age_seconds: number | null;
  report: PatrolReport | null;
  snapshot_summary?: Record<string, unknown> | null;
  ok?: boolean;
  error?: string;
}

export interface CompanionStatus {
  id: string;
  label: string;
  icon: string;
  kind: string;
  status: "online" | "offline" | "warning" | string;
  last_seen_at: string | null;
  detail?: string;
}

export interface WeatherStatus {
  location?: string;
  label?: string;
  timezone?: string;
  temp: number;
  desc: string;
  wind: number;
  humidity: number;
  code: number;
  updated: string;
}

export interface CountdownStatus {
  eri_birthday: { date: string; days: number; label: string };
  epsilon_birthday: { date: string; days: number; label: string };
  anniversary: { date: string; days: number; label: string };
}

export interface StellarReadings {
  dimensions: {
    spectrum: number;
    luminosity: number;
    gravity: number;
    magnetic: number;
    radiance: number;
  };
  dark_side?: {
    active: boolean;
    dark_ratio: number;
    raw_dark_ratio?: number;
    luminosity_drop?: number;
    silent_minutes?: number | null;
    easing?: boolean;
  };
  updated_at: string;
}

export interface SurfaceMemory {
  id: string;
  title?: string;
  content?: string;
  category?: string;
  subcategory?: string;
  importance?: number;
  valence?: number | null;
  arousal?: number | null;
  emotion_beat?: string | null;
  affect_anchor?: string | null;
  tags?: string[] | string | null;
  event_date?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface SurfaceMemoriesResponse {
  items: SurfaceMemory[];
  limit: number;
  generated_at: string;
}

export interface MemoryPage {
  items: SurfaceMemory[];
  total_count?: number;
  limit: number;
  offset: number;
  has_more?: boolean;
}

export interface CalendarDay {
  date: string;
  mood: string | null;
  has_diary: boolean;
  diary_count: number;
  memory_count: number;
}

export interface CalendarMonth {
  month: string;
  start: string;
  end: string;
  days: CalendarDay[];
}

export interface LunarDay {
  lunar: string;
  jieqi: string | null;
  festivals: string[];
}

export type LunarRange = Record<string, LunarDay>;

export interface DreamSourceMemory {
  id: string;
  title: string;
  category: string | null;
  importance: number | null;
  created_at: string | null;
  event_date: string | null;
}

export interface Dream {
  id: string;
  content: string;
  valence: number | null;
  arousal: number | null;
  spectral_class: string | null;
  source_memory_ids: string[];
  source_memories: DreamSourceMemory[];
  dream_date: string;
  created_at: string;
  wake_read_at: string | null;
  read_at: string | null;
}

export interface DreamsResponse {
  dreams: Dream[];
  unread_count: number;
}

// ── Knowledge Graph / Our Starsky ──

export type EntityKind =
  | "person"
  | "companion"
  | "project"
  | "place"
  | "preference"
  | "rule"
  | "object"
  | "concept";

export type CelestialType =
  | "star"
  | "planet"
  | "satellite"
  | "asteroid"
  | "comet";

export interface KnowledgeEntity {
  id: string;
  canonical_name: string;
  aliases: string[];
  entity_kind: EntityKind;
  celestial_type: CelestialType | null;
  summary: string | null;
  confidence: number;
  status: string;
  luminosity: number;
  actual_use_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeRelationEnd {
  id: string;
  name: string;
  kind: EntityKind;
}

export interface KnowledgeRelation {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  relation_text: string;
  source_memory_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  confidence: number;
  strength: number;
  created_at: string;
  updated_at: string;
  source?: KnowledgeRelationEnd;
  target?: KnowledgeRelationEnd;
}

export interface StarskyGraph {
  focus: string;
  nodes: KnowledgeEntity[];
  edges: KnowledgeRelation[];
  depth: number;
}

export interface PendingMemoryAction {
  id: string;
  memory_id: string;
  action: "update" | "invalidate";
  old_snapshot: string | null;
  proposed_snapshot: string | null;
  reason: string | null;
  confidence: number | null;
  status: "pending" | "approved" | "rejected";
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface BookshelfItem {
  id: string;
  title: string;
  description?: string | null;
  image_url?: string | null;
  kind: string;
  added_by: string;
  added_at: string;
  position: number;
}

export interface LibraryBook {
  id: string;
  title: string;
  source_filename?: string | null;
  chapter_count: number;
  total_chars: number;
  progress: { chapter: number; updated_at: string | null };
  created_at: string;
}

export interface LibraryChapterMeta {
  idx: number;
  title: string;
  chars: number;
}

export interface LedgerAccount {
  key: string;
  name: string;
  owner: "eri" | "xiaoyi" | "parents";
  initial_balance_cents: number;
  balance_cents: number;
}

export interface LedgerEntry {
  id: string;
  account_key: string;
  amount_cents: number;
  category: string;
  note: string;
  entry_date: string;
  created_at: string;
}


export type ExhibitHall = "gallery" | "porthole" | "geode" | "starnews" | "nest";
export type ExhibitKind = "painting" | "artifact" | "news_today" | "history_story" | "myth_story" | "creature_fact" | "aesthetic_note" | "cold_fact" | "trend_weekly" | null;

export interface ExhibitItem {
  id: string;
  hall: ExhibitHall;
  kind: ExhibitKind;
  date: string;
  title: string;
  body: string;
  image_path: string | null;
  image_url: string | null;
  image_url_original: string | null;
  image_width: number | null;
  image_height: number | null;
  source: string;
  source_id: string;
  source_url: string | null;
  liked: boolean;
  liked_at: string | null;
  card_pending: boolean;
  created_at: string;
}

export interface ExhibitHistoryResponse {
  items: ExhibitItem[];
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
}

export interface AlbumPhoto {
  id: string;
  url: string;
  thumb_url: string;
  title: string;
  caption: string;
  epsilon_comment: string;
  epsilon_comment_at: string | null;
  uploaded_by: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface ClaudeMdPayload {
  content: string;
  size: number;
  modified_at: string;
}

export interface ClaudeMdHistoryEntry {
  filename: string;
  size: number;
  created_at: string;
}

export interface ClaudeMdHistoryFile extends ClaudeMdHistoryEntry {
  content: string;
}

export interface TerminalSessionsResponse {
  sessions: string[];
}

export interface TerminalCaptureResponse {
  session: string;
  output: string;
}

export interface TerminalBlock {
  type: "thinking" | "tool" | "assistant" | "system";
  text: string;
  ts?: string;
  final?: boolean;
  turn_id?: string;
}

export interface TerminalBlocksResponse {
  session: string;
  source: "transcript" | "none";
  transcript_kind?: string;
  offset: number;
  reset?: boolean;
  blocks: TerminalBlock[];
}

export interface TerminalSendResponse {
  ok: boolean;
}

// ── API 网关 + 船员（压榨清单#3）──
export interface GatewayProvider {
  id: string;
  name: string;
  kind: "openai" | "anthropic";
  base_url: string;
  api_key: string; // 服务端返回打码版（****末4位）
  model: string;
  max_tokens?: number;
  temperature?: number;
  enabled: number;
}

export interface GatewayCrewParams {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

export interface GatewayCrew {
  id: string;
  name: string;
  persona: string;
  provider_id: string;
  avatar: string;
  enabled: number;
  params?: string | null; // JSON of GatewayCrewParams
  context_reset_at?: string | null;
  memo?: string | null;
}

export interface GatewayUsageRow {
  provider_id: string;
  name: string;
  model: string | null;
  kind: string | null;
  calls: number;
  failures: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_hit_rate: number;
  avg_latency_ms: number;
}

export interface SyncPushChatResult {
  client_id: string | null;
  ok: boolean;
  id?: string;
  ts?: string;
  status?: string;
  deduplicated?: boolean;
  retried?: boolean;
  error?: string;
}

export interface SyncPushResponse {
  ok: boolean;
  chat_messages: SyncPushChatResult[];
  pushed: number;
  server_time?: string;
}

export interface UploadResponse {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  attachment_type: string;
  url: string;
}

interface PollResponse {
  messages: ChatMessage[];
  etag: string;
}

interface SendResponse {
  id: string;
  ts?: string;
  status?: string;
  deduplicated?: boolean;
  retried?: boolean;
  error?: string;
}

export interface ChatBatchStatus {
  pending: number;
  delay_ms: number;
  oldest_ts: string | null;
  due_at: string | null;
  flushing: boolean;
  messages: Array<{
    id: string;
    client_id: string | null;
    ts: string;
    has_attachment: boolean;
    attachment_type: string | null;
    text_preview: string;
  }>;
}

export type ApiChatMode = "tmux" | "api" | "auto";
export type ApiChatProvider = "anthropic" | "openai_compatible";

export interface ApiChatModelOption {
  id: string;
  label: string;
}

export interface ApiChatConfig {
  mode: ApiChatMode;
  provider: ApiChatProvider;
  base_url: string;
  model: string;
  max_tokens: number;
  temperature: number;
  api_key_configured: boolean;
  api_key_masked?: string | null;
  updated_at?: Record<string, string>;
  models?: ApiChatModelOption[];
}

export type RoomMode = "silent" | "direct" | "round" | "all";
export type RoomTarget = "cursa" | "epsilon" | "deepseek";

export interface RoomMember {
  id: string;
  name: string;
  role: string;
  session?: string;
  icon?: string;
  emoji?: string;
  avatar?: string;
  avatar_url?: string;
  color?: string;
}

export interface Room {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  members: RoomMember[];
  viewer_role?: "member" | "observer" | string;
  readonly?: boolean;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message_at?: string | null;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  sender: "eri" | "epsilon" | "cursa" | "system" | string;
  text: string;
  metadata?: Record<string, unknown> | null;
  quoted_id?: string;
  quoted_text?: string;
  reactions?: string;
  tool_calls?: string;
  created_at: string;
}

export interface RoomSummary {
  id: string;
  room_id: string;
  summary_text: string;
  message_range_start?: string;
  message_range_end?: string;
  message_count: number;
  created_at: string;
  hidden?: number;
}

export interface RoomDispatchResult {
  target: string;
  status: string;
  reason?: string;
  session?: string;
  source?: string;
  queue?: string;
  remaining_seconds?: number;
  error?: string;
}

export interface ChannelComment {
  sender: string;
  text: string;
  created_at: string;
}

export interface ChannelThread {
  id: string;
  title: string;
  sender: string;
  kind: string;
  status: string;
  body: string;
  mentions: string[];
  comments: ChannelComment[];
  created_at: string;
}

export interface VoyageEventMemoryPreview {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  content: string;
}

export interface VoyageEvent {
  id: string;
  log_date: string;
  event_type: string;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  title: string;
  description: string | null;
  trigger_source: string | null;
  stellar_snapshot: unknown;
  related_memory_ids: string[];
  related_search_query: string | null;
  metadata: unknown;
  created_at: string;
  related_memory?: VoyageEventMemoryPreview;
}

export interface StellarHistorySnapshot {
  snapshot_date: string;
  dimensions: Record<string, number>;
  updated_at: string;
}

export interface StellarHistoryResponse {
  days: number;
  history: StellarHistorySnapshot[];
}

export interface StellarSensesResponse {
  channels: Array<{
    channel: string;
    value: number;
    label: string | null;
    tau_hours: number;
    ignited_at: string | null;
    updated_at: string;
  }>;
  active_channels: number;
  threshold: number;
  dark_ratio: number;
  snapshot_at: string;
}

export interface VoyageLog {
  id: string;
  log_date: string;
  weather_summary: string | null;
  stellar_snapshot: unknown;
  chord_trace: unknown[];
  departure_count: number;
  event_count: number;
  memory_surface_count: number;
  daily_summary: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Voyage {
  id: string;
  log_date: string;
  event_id: string | null;
  query: string;
  destination_name: string | null;
  summary: string | null;
  narrative: string | null;
  discoveries: unknown[];
  treasures: unknown[];
  sources: unknown[];
  duration_ms: number | null;
  created_at: string;
}

export interface VoyageTodayResponse {
  log: VoyageLog;
  events: VoyageEvent[];
  voyages: Voyage[];
}

export interface DriveSeekingItem {
  drive_key: string;
  wanting: number;
  afterglow: number;
  shape: "symmetric" | "refractory" | "bonding" | "owed" | string;
  grounding: number;
}

export interface DriveItem {
  key: string;
  label: string;
  value: number;
  seeking?: DriveSeekingItem;
}

export interface ConcernItem {
  concern_key: string;
  title: string;
  status: "OPEN" | "EASING" | "RESOLVED" | string;
  grounding: string;
  severity: number;
  hit_count: number;
  day_count: number;
  source_memory_ids: string[];
  first_seen: string | null;
  last_seen: string | null;
  last_event_date: string | null;
  updated_at: string | null;
}

export interface ConcernsResponse {
  concerns: ConcernItem[];
  status: string | null;
  limit: number;
}

export interface Thought {
  id: string;
  content: string;
  drive_key: string;
  drive_label: string;
  source: string;
  intensity: number;
  is_fixation: boolean;
  first_seen: string;
  last_seen: string;
  resolved: boolean;
  resolved_at: string | null;
}

export interface DrivesResponse {
  state: {
    id: string;
    values: Record<string, number>;
    drives: DriveItem[];
    top_drive: string;
    top_label: string;
    top_value: number;
    top_desire: string;
    updated_at: string;
    thoughts: Thought[];
    concerns: ConcernItem[];
    seeking?: {
      drives: DriveSeekingItem[];
      by_drive: Record<string, DriveSeekingItem>;
    };
  };
}

export interface MusicSong {
  id: string;
  name: string;
  artist: string | null;
  album?: string | null;
  message?: string;
  lyrics?: string | null;
  duration_ms?: number | null;
}

export interface MusicPlaylist {
  id: string;
  playlist_date: string;
  weather: { temp: number; desc: string; code: number } | null;
  mood: string | Record<string, unknown> | null;
  theme: string | null;
  songs: MusicSong[];
  created_at: string;
}

export interface MusicDedication {
  id: string;
  from_who: string;
  song_id: string | null;
  song_name: string;
  artist: string | null;
  message: string | null;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface MusicFavorite {
  id: string;
  song_id: string;
  song_name: string | null;
  artist: string | null;
  favorited_at: string;
}

export const api = {
  poll: (since: string, assistant?: string) =>
    request<PollResponse>(
      `/api/chat/poll?since=${encodeURIComponent(since)}${assistant ? `&assistant=${encodeURIComponent(assistant)}` : ""}`
    ),

  history: (before: string, limit = 50, assistant?: string) =>
    request<{ messages: ChatMessage[] }>(
      `/api/chat/history?before=${encodeURIComponent(before)}&limit=${limit}${assistant ? `&assistant=${encodeURIComponent(assistant)}` : ""}`
    ),

  send: (text: string, clientId: string, attachmentIds?: string[], quotedId?: string, options?: { assistant?: string }) =>
    request<SendResponse>("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        client_id: clientId,
        ...(options?.assistant ? { assistant: options.assistant } : {}),
        ...(attachmentIds && attachmentIds.length === 1
          ? { attachment_id: attachmentIds[0] }
          : {}),
        ...(attachmentIds && attachmentIds.length > 0
          ? { attachment_ids: attachmentIds }
          : {}),
        ...(quotedId ? { quoted_id: quotedId } : {}),
      }),
    }),

  batchStatus: () => request<ChatBatchStatus>("/api/chat/batch-status"),

  patrolReport: () => request<PatrolPayload>("/api/patrol-report"),

  runPatrol: () =>
    request<PatrolPayload>("/api/patrol-report/run", { method: "POST", timeoutMs: 30000 }),

  getApiChatConfig: () =>
    request<{ config: ApiChatConfig; models: ApiChatModelOption[] }>("/api/chat/api-config"),

  updateApiChatConfig: (patch: Partial<ApiChatConfig> & { api_key?: string }) =>
    request<{ ok: boolean; config: ApiChatConfig; models: ApiChatModelOption[] }>(
      "/api/chat/api-config",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    ),

  fetchAvailableModels: () =>
    request<{ ok: boolean; models: ApiChatModelOption[]; count: number }>(
      "/api/chat/api-config/fetch-models",
      { method: "POST" }
    ),

  updateMessageText: (messageId: string, text: string) =>
    request<{ success: boolean; message: ChatMessage }>(
      `/api/chat/messages/${encodeURIComponent(messageId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }
    ),

  deleteMessage: (messageId: string) =>
    request<{ success: boolean; id: string; deleted_at?: string }>(
      `/api/chat/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" }
    ),

  clearChat: (before?: string) =>
    request<{ success: boolean; count: number; deleted_at?: string }>(
      "/api/chat/messages",
      before
        ? {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ before }),
          }
        : { method: "DELETE" }
    ),

  upload: async (file: File | Blob, filename?: string): Promise<UploadResponse> => {
    const startedAt = Date.now();
    const path = "/api/chat/upload";
    const { serverUrl, secret } = useConnection.getState();
    const baseUrl = serverUrl.replace(/\/+$/, "");
    if (!baseUrl && Platform.OS !== "web") {
      const durationMs = Date.now() - startedAt;
      recordFailure({
        path,
        method: "POST",
        kind: "config",
        message: "not configured",
        durationMs,
      });
      throw new ApiRequestError({
        kind: "config",
        path,
        message: "not configured",
        durationMs,
      });
    }
    const form = new FormData();
    form.append("file", file, filename);
    const url = pickUrl(baseUrl, path);
    const timeout = createTimeoutSignal(UPLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "X-Auth-Token": secret },
        body: form,
        signal: timeout.signal,
      });
      const durationMs = Date.now() - startedAt;
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const message = `${res.status}: ${body}`;
        recordFailure({
          path,
          method: "POST",
          kind: "http",
          message,
          status: res.status,
          durationMs,
        });
        throw new ApiRequestError({
          kind: "http",
          path,
          status: res.status,
          body,
          message,
          durationMs,
        });
      }
      const data = (await res.json()) as UploadResponse;
      useApiDiagnostics.getState().recordSuccess({
        path,
        method: "POST",
        durationMs,
      });
      return data;
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      const durationMs = Date.now() - startedAt;
      const { kind, message } = classifyFetchFailure(error, timeout.timedOut, UPLOAD_TIMEOUT_MS);
      recordFailure({ path, method: "POST", kind, message, durationMs });
      throw new ApiRequestError({ kind, path, message, durationMs });
    } finally {
      timeout.cleanup();
    }
  },

  // Fetch attachment with auth and return a blob: URL safe for <img src>.
  // Caller is responsible for URL.revokeObjectURL when no longer needed.
  // maxDim：图片附件降采样到长边 maxDim 再生成 blob URL——历史大图解码
  // 后的常驻位图是 iOS 杀页面重载的主因，展示用不到原始分辨率。
  fetchAttachmentBlobUrl: async (attachmentUrl: string, opts?: { maxDim?: number }): Promise<string> => {
    const startedAt = Date.now();
    const { serverUrl, secret } = useConnection.getState();
    const baseUrl = serverUrl.replace(/\/+$/, "");
    if (!baseUrl && Platform.OS !== "web") {
      const durationMs = Date.now() - startedAt;
      recordFailure({
        path: attachmentUrl,
        method: "GET",
        kind: "config",
        message: "not configured",
        durationMs,
      });
      throw new ApiRequestError({
        kind: "config",
        path: attachmentUrl,
        message: "not configured",
        durationMs,
      });
    }
    const url = pickUrl(baseUrl, attachmentUrl);
    const timeout = createTimeoutSignal(DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "X-Auth-Token": secret },
        signal: timeout.signal,
      });
      const durationMs = Date.now() - startedAt;
      if (!res.ok) {
        const message = `${res.status}`;
        recordFailure({
          path: attachmentUrl,
          method: "GET",
          kind: "http",
          message,
          status: res.status,
          durationMs,
        });
        throw new ApiRequestError({
          kind: "http",
          path: attachmentUrl,
          status: res.status,
          message,
          durationMs,
        });
      }
      let blob = await res.blob();
      if (opts?.maxDim) {
        blob = await shrinkImageBlob(blob, opts.maxDim);
      }
      useApiDiagnostics.getState().recordSuccess({
        path: attachmentUrl,
        method: "GET",
        durationMs,
      });
      return URL.createObjectURL(blob);
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      const durationMs = Date.now() - startedAt;
      const { kind, message } = classifyFetchFailure(error, timeout.timedOut, DEFAULT_TIMEOUT_MS);
      recordFailure({ path: attachmentUrl, method: "GET", kind, message, durationMs });
      throw new ApiRequestError({ kind, path: attachmentUrl, message, durationMs });
    } finally {
      timeout.cleanup();
    }
  },

  react: (messageId: string, emoji: string) =>
    request<{ reactions: string[] }>("/api/chat/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, emoji }),
    }),

  feedback: (messageId: string, rating: "like" | "dislike" | null, reason?: string) =>
    request<{ id: string; feedback_rating: "like" | "dislike" | null; feedback_reason: string | null; feedback_at: string | null }>(
      "/api/chat/feedback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId, rating, reason: reason || null }),
      }
    ),

  search: (q: string, opts: { type?: string; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams({ q });
    if (opts.type && opts.type !== "all") params.set("type", opts.type);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.offset) params.set("offset", String(opts.offset));
    return request<{ messages: (ChatMessage & { match_snippet?: string })[]; query: string; type: string; has_more: boolean; backend: string }>(
      `/api/chat/search?${params}`
    );
  },

  around: (ts: string, before = 20, after = 20) =>
    request<{ messages: ChatMessage[]; target_ts: string; target_index: number | null }>(
      `/api/chat/around?ts=${encodeURIComponent(ts)}&before=${before}&after=${after}`
    ),

  barkStatus: () =>
    request<{
      registered: boolean;
      count: number;
      devices: Array<{
        id: string;
        registered_at: string;
        last_push_at: string | null;
        url_tail: string;
      }>;
    }>("/api/bark/status"),

  barkRegister: (barkUrl: string) =>
    request<{ id: string; deduplicated?: boolean }>("/api/bark/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bark_url: barkUrl }),
    }),

  barkTest: () =>
    request<{ ok: boolean }>("/api/bark/test", { method: "POST" }),

  barkDelete: (id: string) =>
    request<{ deleted: number }>(`/api/bark/device/${id}`, {
      method: "DELETE",
    }),

  pushPublicKey: () =>
    request<{ publicKey: string }>("/api/push/public-key"),

  pushSubscribe: (sub: PushSubscriptionJSON) =>
    request<{ id: string; deduplicated?: boolean }>("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    }),

  pushUnsubscribe: (endpoint: string) =>
    request<{ deleted: number }>("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }),

  pushVisibility: (visible: boolean) =>
    request<{ ok: boolean; visible: boolean; foreground_suppression_active: boolean; ttl_ms: number }>(
      "/api/push/visibility",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible }),
      }
    ),

  pushStatus: () =>
    request<{
      enabled: boolean;
      count: number;
      devices: Array<{
        id: string;
        created_at: string;
        last_push_at: string | null;
        ua_tail: string;
      }>;
    }>("/api/push/status"),

  pushTest: () =>
    request<{ ok: boolean; configured: boolean }>("/api/push/test", {
      method: "POST",
    }),

  getMurmurs: (limit = 10) =>
    request<CompanionNote[]>(`/api/companion-notes?type=murmur&limit=${limit}`),

  getCompanionNotes: (opts: { type?: string; date?: string; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.type) params.set("type", opts.type);
    if (opts.date) params.set("date", opts.date);
    params.set("limit", String(opts.limit ?? 30));
    params.set("offset", String(opts.offset ?? 0));
    return request<CompanionNote[]>(`/api/companion-notes?${params.toString()}`);
  },

  deleteCompanionNote: (id: string) =>
    request<{ deleted: number }>(`/api/companion-notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getCurrentMood: () => request<CurrentMood>("/api/current-mood"),

  setMood: (date: string, mood: string) =>
    request<{ date: string; mood: string }>(`/api/moods/${encodeURIComponent(date)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood }),
    }),

  clearMood: (date: string) =>
    request<{ ok: boolean }>(`/api/moods/${encodeURIComponent(date)}`, {
      method: "DELETE",
    }),

  stellarReadings: () => request<StellarReadings>("/api/stellar-readings"),

  weather: (city?: string) =>
    request<WeatherStatus>(city ? `/api/weather?city=${encodeURIComponent(city)}` : "/api/weather"),

  countdown: () => request<CountdownStatus>("/api/countdown"),

  calendar: (month: string) =>
    request<CalendarMonth>(`/api/calendar?month=${encodeURIComponent(month)}`),

  lunarRange: (from: string, to: string) =>
    request<LunarRange>(`/api/lunar-range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  surfaceMemories: (limit = 6, query?: string) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (query) params.set("query", query);
    return request<SurfaceMemoriesResponse>(`/api/surface-memories?${params.toString()}`);
  },

  memories: (opts: { keyword?: string; category?: string; subcategory?: string; sort?: string; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(opts.limit ?? 30));
    params.set("offset", String(opts.offset ?? 0));
    params.set("include_total", "1");
    params.set("format", "page");
    if (opts.keyword) params.set("keyword", opts.keyword);
    if (opts.category) params.set("category", opts.category);
    if (opts.subcategory) params.set("subcategory", opts.subcategory);
    if (opts.sort) params.set("sort", opts.sort);
    return request<MemoryPage>(`/api/memories?${params.toString()}`);
  },

  memoriesByDate: (date: string) =>
    request<SurfaceMemory[]>(`/api/memories/by-date/${encodeURIComponent(date)}`),

  updateMemory: (id: string, data: {
    title?: string; content?: string; category?: string;
    importance?: number; tags?: string[]; event_date?: string | null;
    subcategory?: string | null;
  }) =>
    request<{ id: string }>(`/api/memories/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteMemory: (id: string) =>
    request<{ ok: boolean }>(`/api/memories/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  createMemory: (data: {
    title: string; content: string; category: string;
    importance?: number; tags?: string[]; event_date?: string;
    subcategory?: string; source?: string;
  }) =>
    request<{ id: string; title: string }>("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  dreams: (limit = 20, before?: string) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (before) params.set("before", before);
    return request<DreamsResponse>(`/api/dreams?${params.toString()}`);
  },

  markDreamRead: (id: string) =>
    request<{ success: boolean; id: string; read_at: string }>(
      `/api/dreams/${encodeURIComponent(id)}/read`,
      { method: "PUT" }
    ),

  voyageToday: () => request<VoyageTodayResponse>("/api/voyage/today"),

  voyageDate: (date: string) => request<VoyageTodayResponse>(`/api/voyage/${encodeURIComponent(date)}`),

  markVoyageRead: (date: string) =>
    request<{ success: boolean }>(`/api/voyage/${encodeURIComponent(date)}/read`, { method: "PUT" }),

  voyageDateRange: () =>
    request<{ earliest: string | null; latest: string | null }>("/api/voyage/date-range"),

  getDrives: () => request<DrivesResponse>("/api/drives"),

  getDrivesoid: () => request<any>("/api/drivesoid"),

  getConcerns: (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    return request<ConcernsResponse>(`/api/concerns${qs ? `?${qs}` : ""}`);
  },

  stellarHistory: (days = 14) =>
    request<StellarHistoryResponse>(`/api/stellar-readings/history?days=${days}`),

  stellarSenses: () => request<StellarSensesResponse>("/api/stellar-senses"),

  bookshelf: () => request<{ items: BookshelfItem[] }>("/api/bookshelf"),

  // ── 星图馆 · 阅览室 ──
  libraryBooks: () => request<{ books: LibraryBook[] }>("/api/library/books"),

  libraryBook: (id: string) =>
    request<{ book: LibraryBook; chapters: LibraryChapterMeta[]; notes: string }>(
      `/api/library/books/${encodeURIComponent(id)}`
    ),

  libraryChapter: (id: string, idx: number) =>
    request<{ idx: number; title: string; content: string }>(
      `/api/library/books/${encodeURIComponent(id)}/chapter/${idx}`
    ),

  libraryProgress: (id: string, chapter: number) =>
    request<{ book: LibraryBook }>(`/api/library/books/${encodeURIComponent(id)}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter }),
    }),

  libraryAddNote: (id: string, text: string) =>
    request<{ ok: boolean; notes: string }>(`/api/library/books/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),

  libraryHighlights: (id: string, chapterIdx?: number) =>
    request<any[]>(`/api/library/books/${encodeURIComponent(id)}/highlights${chapterIdx != null ? `?chapter_idx=${chapterIdx}` : ""}`),

  libraryAddHighlight: (id: string, data: { chapter_idx: number; start_offset: number; end_offset: number; text: string; comment?: string }) =>
    request<any>(`/api/library/books/${encodeURIComponent(id)}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  libraryDeleteHighlight: (id: string, hid: string) =>
    request<{ ok: boolean }>(`/api/library/books/${encodeURIComponent(id)}/highlights/${encodeURIComponent(hid)}`, { method: "DELETE" }),

  libraryReadingSession: (id: string, data: { chapter_idx: number; page_or_offset?: string }) =>
    request<any>(`/api/library/books/${encodeURIComponent(id)}/reading-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  libraryReadingHistory: (id: string) =>
    request<any[]>(`/api/library/books/${encodeURIComponent(id)}/reading-history`),

  libraryDeleteBook: (id: string) =>
    request<{ ok: boolean }>(`/api/library/books/${encodeURIComponent(id)}`, { method: "DELETE" }),

  libraryRenameBook: (id: string, title: string) =>
    request<{ book: LibraryBook }>(`/api/library/books/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),

  // —— 记账本（甲板小金库）——
  ledger: () => request<{ accounts: LedgerAccount[]; entries: LedgerEntry[] }>("/api/ledger"),

  ledgerAddEntry: (body: {
    account_key: string;
    amount_cents: number;
    category?: string;
    note?: string;
    entry_date?: string;
  }) =>
    request<{ entry: LedgerEntry; accounts: LedgerAccount[] }>("/api/ledger/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  ledgerAllowance: () =>
    request<{ entry: LedgerEntry; accounts: LedgerAccount[] }>("/api/ledger/allowance", {
      method: "POST",
    }),

  ledgerDeleteEntry: (id: string) =>
    request<{ ok: boolean; accounts: LedgerAccount[] }>(`/api/ledger/entries/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  ledgerSetBalance: (key: string, balance_cents: number) =>
    request<{ accounts: LedgerAccount[] }>(`/api/ledger/accounts/${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balance_cents }),
    }),

  // 单本返回 { book }；zip 书包返回 { results, ok, failed }
  libraryUpload: async (
    file: File | Blob,
    filename?: string,
    title?: string
  ): Promise<{
    book?: LibraryBook;
    results?: { ok: boolean; filename: string; error?: string }[];
    ok?: number;
    failed?: number;
  }> => {
    const { serverUrl, secret } = useConnection.getState();
    const baseUrl = serverUrl.replace(/\/+$/, "");
    const form = new FormData();
    form.append("file", file, filename);
    if (title) form.append("title", title);
    const res = await fetch(pickUrl(baseUrl, "/api/library/upload"), {
      method: "POST",
      headers: { "X-Auth-Token": secret },
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => "")}`);
    return res.json();
  },

  // ── 星图馆 · 相册 ──
  album: (before?: string) =>
    request<{ photos: AlbumPhoto[] }>(`/api/album${before ? `?before=${encodeURIComponent(before)}` : ""}`),

  albumUpload: async (file: File | Blob, filename?: string, caption?: string): Promise<{ photo: AlbumPhoto }> => {
    const { serverUrl, secret } = useConnection.getState();
    const baseUrl = serverUrl.replace(/\/+$/, "");
    const form = new FormData();
    form.append("file", file, filename);
    if (caption) form.append("caption", caption);
    const res = await fetch(pickUrl(baseUrl, "/api/album/upload"), {
      method: "POST",
      headers: { "X-Auth-Token": secret },
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => "")}`);
    return res.json();
  },

  albumUpdate: (id: string, fields: { title?: string; caption?: string }) =>
    request<{ ok: boolean }>(`/api/album/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }),

  albumDelete: (id: string) =>
    request<{ ok: boolean }>(`/api/album/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ── 星图馆 · 展览馆 ──
  exhibitToday: (hall: ExhibitHall) =>
    request<ExhibitItem[]>(`/api/exhibit/${encodeURIComponent(hall)}/today`),

  exhibitHistory: (hall: ExhibitHall, opts: { limit?: number; offset?: number; likedFirst?: boolean } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(opts.limit ?? 30));
    params.set("offset", String(opts.offset ?? 0));
    if (opts.likedFirst === false) params.set("liked_first", "0");
    return request<ExhibitHistoryResponse>(`/api/exhibit/${encodeURIComponent(hall)}/history?${params.toString()}`);
  },

  exhibitToggleLike: (id: string) =>
    request<{ item: ExhibitItem }>(`/api/exhibit/${encodeURIComponent(id)}/like`, {
      method: "POST",
    }),

  exhibitCreateNest: (payload: { title: string; body: string; image_url?: string }) =>
    request<{ item: ExhibitItem }>("/api/exhibit/nest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  stats: () => request<{ total: number; categories: { category: string; count: number }[] }>("/api/stats"),

  syncPull: (opts: { since: string; tables?: SyncTableName[]; limit?: number }) => {
    const params = new URLSearchParams();
    params.set("since", opts.since);
    if (opts.tables?.length) params.set("tables", opts.tables.join(","));
    if (opts.limit) params.set("limit", String(opts.limit));
    return request<SyncPullResponse>(`/api/sync/pull?${params.toString()}`);
  },

  getContextUsage: () => request<ContextUsage>("/api/session/context-usage"),

  refreshSession: (reason: string = "manual") =>
    request<{ request_id: string; status: string; reason: string; applied_at?: string; completed_at?: string }>(
      "/api/chat/refresh-session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }
    ),

  getTimezone: () =>
    request<{ timezone: string; utc_offset: string; local_time: string }>(
      "/api/timezone"
    ),

  setTimezone: (timezone: string) =>
    request<{ ok: boolean; timezone: string; utc_offset: string; local_time: string }>(
      "/api/timezone",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      }
    ),

  getProactiveConfig: () =>
    request<{ config: ProactiveConfig; updated_at: Record<string, string | null> }>(
      "/api/proactive/config"
    ),

  updateProactiveConfig: (patch: Partial<ProactiveConfig>) =>
    request<{ ok: boolean; config: ProactiveConfig; updated_at: Record<string, string | null> }>(
      "/api/proactive/config",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    ),

  getControlEvents: (opts: { type?: string; limit?: number; since?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.type) params.set("type", opts.type);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.since) params.set("since", opts.since);
    const qs = params.toString();
    return request<{ events: ControlEvent[]; count: number }>(
      `/api/control-events${qs ? `?${qs}` : ""}`
    );
  },

  health: async (): Promise<HealthStatus> => {
    const startedAt = Date.now();
    const path = "/health";
    const method = "GET";
    const { serverUrl } = useConnection.getState();
    const baseUrl = serverUrl.replace(/\/+$/, "");
    const timeout = createTimeoutSignal(DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(pickUrl(baseUrl, path), { signal: timeout.signal });
      const durationMs = Date.now() - startedAt;
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const message = `${res.status}: ${body}`;
        recordFailure({ path, method, kind: "http", message, status: res.status, durationMs });
        throw new ApiRequestError({
          kind: "http",
          path,
          status: res.status,
          body,
          message,
          durationMs,
        });
      }
      const data = (await res.json()) as HealthStatus;
      useApiDiagnostics.getState().recordSuccess({ path, method, durationMs });
      return data;
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      const durationMs = Date.now() - startedAt;
      const { kind, message } = classifyFetchFailure(error, timeout.timedOut, DEFAULT_TIMEOUT_MS);
      recordFailure({ path, method, kind, message, durationMs });
      throw new ApiRequestError({ kind, path, message, durationMs });
    } finally {
      timeout.cleanup();
    }
  },

  time: () =>
    request<{ now?: string; time?: string; [key: string]: unknown }>("/api/time"),

  companionsStatus: () =>
    request<{ checked_at: string; companions: CompanionStatus[] }>(
      "/api/companions/status"
    ),

  bridgeDashboard: () =>
    request<BridgeDashboard>("/api/bridge/dashboard"),

  getClaudeMd: () => request<ClaudeMdPayload>("/api/claudemd"),

  updateClaudeMd: (content: string) =>
    request<{ ok: boolean; backup: string; size: number; modified_at: string }>(
      "/api/claudemd",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }
    ),

  getClaudeMdHistory: () =>
    request<{ history: ClaudeMdHistoryEntry[] }>("/api/claudemd/history"),

  getClaudeMdHistoryFile: (filename: string) =>
    request<ClaudeMdHistoryFile>(
      `/api/claudemd/history/${encodeURIComponent(filename)}`
    ),

  channels: (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    return request<{ threads: ChannelThread[] }>(`/api/channels${qs ? `?${qs}` : ""}`);
  },

  channelDetail: (id: string) =>
    request<{ thread: ChannelThread }>(`/api/channels/${encodeURIComponent(id)}`),

  channelComment: (id: string, text: string) =>
    request<{ ok: boolean }>(`/api/channels/${encodeURIComponent(id)}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: "eri", text }),
    }),

  channelStatus: (id: string, status: string) =>
    request<{ ok: boolean }>(`/api/channels/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),

  terminalSessions: () =>
    request<TerminalSessionsResponse>("/api/terminal/sessions"),

  terminalCapture: (session: string, lines = 300) => {
    const params = new URLSearchParams();
    params.set("session", session);
    params.set("lines", String(lines));
    return request<TerminalCaptureResponse>(`/api/terminal/capture?${params.toString()}`);
  },

  terminalBlocks: (session: string, options?: { reset?: boolean; offset?: number }) => {
    const params = new URLSearchParams();
    params.set("session", session);
    if (options?.reset) params.set("reset", "1");
    if (options?.offset != null) params.set("offset", String(options.offset));
    return request<TerminalBlocksResponse>(`/api/terminal/blocks?${params.toString()}`);
  },

  terminalSend: (session: string, payload: { text?: string; key?: string }) =>
    request<TerminalSendResponse>("/api/terminal/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, ...payload }),
    }),

  syncPush: (payload: { chat_messages?: Array<Pick<ChatMessage, "id" | "client_id" | "text" | "quoted_id" | "quoted_text" | "attachment_id" | "assistant">> }) =>
    request<SyncPushResponse>("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  rooms: () => request<{ rooms: Room[] }>("/api/rooms"),

  roomMessages: (
    roomId: string,
    opts: { before?: string; limit?: number } = {}
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(opts.limit ?? 80));
    if (opts.before) params.set("before", opts.before);
    return request<{ room: Room; messages: RoomMessage[] }>(
      `/api/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`
    );
  },

  sendRoomMessage: (
    roomId: string,
    payload: { text: string; mode: RoomMode; target?: RoomTarget | string; quoted_id?: string }
  ) =>
    request<{ message: RoomMessage; dispatch: RoomDispatchResult[] }>(
      `/api/rooms/${encodeURIComponent(roomId)}/send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ),

  reactRoomMessage: (roomId: string, messageId: string, emoji: string) =>
    request<{ reactions: string[] }>(
      `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/react`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      }
    ),

  uploadMemberAvatar: async (memberId: string, file: File): Promise<{ ok: boolean; avatar_url: string; rooms_updated: number }> => {
    const form = new FormData();
    form.append("file", file);
    return request<{ ok: boolean; avatar_url: string; rooms_updated: number }>(
      `/api/members/${encodeURIComponent(memberId)}/avatar`,
      { method: "POST", body: form, timeoutMs: UPLOAD_TIMEOUT_MS }
    );
  },

  searchRoom: (roomId: string, q: string, limit = 20) =>
    request<{ messages: (RoomMessage & { match_snippet?: string })[]; query: string; backend: string }>(
      `/api/rooms/${encodeURIComponent(roomId)}/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  roomSummaries: (roomId: string, limit = 3) =>
    request<{ summaries: RoomSummary[] }>(
      `/api/rooms/${encodeURIComponent(roomId)}/summaries?limit=${limit}`
    ),

  createRoomSummary: (roomId: string, limit = 50) =>
    request<RoomSummary>(`/api/rooms/${encodeURIComponent(roomId)}/summaries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    }),

  musicToday: () =>
    request<{ playlist: MusicPlaylist | null }>("/api/music/today"),

  musicHistory: (limit = 20, before?: string) =>
    request<{ playlists: MusicPlaylist[] }>(
      `/api/music/history?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`
    ),

  musicPlay: (songId: string) =>
    request<{ url: string; id: string; br?: number }>(`/api/music/play/${encodeURIComponent(songId)}`),

  musicLyrics: (songId: string) =>
    request<{ lrc: string | null; tlyric: string | null }>(`/api/music/lyrics/${encodeURIComponent(songId)}`),

  musicDedicate: (body: { song_id?: string; song_name: string; artist?: string; message?: string }) =>
    request<{ dedication: MusicDedication }>("/api/music/dedication", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  musicDedications: (unreplied = false) =>
    request<{ dedications: MusicDedication[] }>(`/api/music/dedications?unreplied=${unreplied}`),

  musicToggleFavorite: (songId: string, body: { song_name?: string; artist?: string }) =>
    request<{ favorited: boolean; song_id: string }>(`/api/music/favorite/${encodeURIComponent(songId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  musicFavorites: () =>
    request<{ favorites: MusicFavorite[] }>("/api/music/favorites"),

  jellyfishStatus: () =>
    request<{
      energy: number; max_energy: number; mood: string; mood_label: string;
      mood_changed_at: string | null; last_pet_at: string | null; last_feed_at: string | null;
      feed_count: number; pet_count: number; last_interaction: string | null;
      luminance_pct: number; parent_activity: string; zone: string; zone_description: string;
    }>("/api/jellyfish"),

  jellyfishFeed: () =>
    request<{
      energy: number; max_energy: number; mood: string; mood_label: string;
      feed_count: number; pet_count: number; delta: number; event_id: string;
      last_feed_at: string; parent_activity: string; zone: string;
    }>("/api/jellyfish/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),

  jellyfishPet: (touchZone?: string, gesture?: string) =>
    request<{
      energy: number; max_energy: number; mood: string; mood_label: string;
      feed_count: number; pet_count: number; delta: number; event_id: string;
      reaction: string; last_pet_at: string; parent_activity: string; zone: string;
    }>("/api/jellyfish/pet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ touch_zone: touchZone || "body", gesture }),
    }),

  jellyfishBubble: () =>
    request<{
      content: string; rare: boolean; mood: string;
    }>("/api/jellyfish/bubble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),

  jellyfishSetZone: (zone: string) =>
    request<{
      zone: string; description: string;
    }>("/api/jellyfish/zone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone }),
    }),

  jellyfishEvents: (limit?: number) =>
    request<{
      events: Array<{
        id: string; actor: string; action: string;
        energy_before: number; energy_after: number; created_at: string;
      }>;
    }>(`/api/jellyfish/events?limit=${limit || 30}`),

  jellyfishTalk: (text: string) =>
    request<{
      dialogue: { id: string; raw: string; translation: string; provider?: string };
      status: any;
      actor: string;
    }>("/api/jellyfish/talk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }),

  jellyfishDialogues: (limit?: number) =>
    request<{
      dialogues: Array<{
        id: string; speaker: string; text: string; translation?: string;
        action?: string; mood?: string; created_at: string;
      }>;
    }>(`/api/jellyfish/dialogues?limit=${limit || 30}`),

  testConnection: async (): Promise<{ ok: boolean; detail: string }> => {
    const { serverUrl, secret } = useConnection.getState();
    const baseUrl = serverUrl.replace(/\/+$/, "");
    const makeUrl = (path: string) => pickUrl(baseUrl, path);

    try {
      const res = await fetch(makeUrl("/api/time"));
      if (!res.ok) return { ok: false, detail: `基本连接失败 ${res.status}` };

      const res2 = await fetch(makeUrl("/api/chat/poll?since=2099-01-01T00:00:00.000Z"), {
        headers: { "X-Auth-Token": secret },
      });
      if (!res2.ok) {
        const body = await res2.text().catch(() => "");
        return { ok: false, detail: `认证失败 ${res2.status}: ${body}` };
      }
      return { ok: true, detail: "" };
    } catch (e: any) {
      return { ok: false, detail: `网络错误: ${e?.message || e}` };
    }
  },

  musicAnalyze: async (songId: string): Promise<any> => {
    return request(`/api/music/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId }),
    });
  },

  musicAnalysis: async (songId: string): Promise<any> => {
    return request(`/api/music/analysis/${songId}`);
  },

  fetchVoiceBlobUrl: async (voiceUrl: string): Promise<string> => {
    const { serverUrl, secret } = useConnection.getState();
    const baseUrl = serverUrl.replace(/\/+$/, "");
    const url = pickUrl(baseUrl, voiceUrl);
    const res = await fetch(url, { headers: { "X-Auth-Token": secret } });
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  voiceTranscribe: async (audioBlob: Blob): Promise<{ ok: boolean; text: string; duration_ms: number }> => {
    const { serverUrl, secret } = useConnection.getState();
    const baseUrl = (serverUrl || "").replace(/\/+$/, "");
    const form = new FormData();
    form.append("file", audioBlob, "recording.webm");
    const res = await fetch(pickUrl(baseUrl, "/api/voice/transcribe"), {
      method: "POST",
      headers: { "X-Auth-Token": secret },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const short = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
      throw new Error(`transcribe ${res.status}: ${short}`);
    }
    return res.json();
  },

  voiceCallSend: async (text: string): Promise<{ ok: boolean; call_id: string }> => {
    return request("/api/voice-call/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  },

  voiceCallEnd: async (): Promise<{ ok: boolean }> => {
    return request("/api/voice-call/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },

  voiceCallStatus: async (): Promise<{ active: boolean; call: any }> => {
    return request("/api/voice-call/status");
  },

  voiceCallWsUrl: (): string => {
    const { serverUrl, secret } = useConnection.getState();
    const params = new URLSearchParams();
    params.set("token", secret);
    const path = `/api/voice-call/live?${params.toString()}`;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const host = window.location.hostname;
      const isLocalDev = host === "localhost" || host === "127.0.0.1";
      if (!isLocalDev) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}${path}`;
      }
    }

    const baseUrl = serverUrl.replace(/\/+$/, "");
    if (!baseUrl) return path;
    return `${baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}${path}`;
  },

  terminalLiveWsUrl: (session: string, offset?: number): string => {
    const { serverUrl, secret } = useConnection.getState();
    const params = new URLSearchParams();
    params.set("token", secret);
    params.set("session", session);
    if (offset != null) params.set("offset", String(offset));
    const path = `/api/terminal/live?${params.toString()}`;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const host = window.location.hostname;
      const isLocalDev = host === "localhost" || host === "127.0.0.1";
      if (!isLocalDev) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}${path}`;
      }
    }
    const baseUrl = serverUrl.replace(/\/+$/, "");
    if (!baseUrl) return path;
    return `${baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}${path}`;
  },

  // ── API 网关 + 船员（压榨清单#3）──
  gatewayProviders: async (): Promise<{ providers: GatewayProvider[] }> => request("/api/gateway/providers"),
  gatewayUpsertProvider: async (provider: Partial<GatewayProvider>): Promise<{ ok: boolean; provider: GatewayProvider }> =>
    request("/api/gateway/providers", { method: "POST", body: JSON.stringify(provider) }),
  gatewayDeleteProvider: async (id: string): Promise<{ ok: boolean }> =>
    request(`/api/gateway/providers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  gatewayTestProvider: async (id: string): Promise<{ ok: boolean; reply?: string; latency_ms?: number; error?: string }> =>
    request(`/api/gateway/providers/${encodeURIComponent(id)}/test`, { method: "POST", body: "{}" }),
  gatewayUsage: async (days = 7): Promise<{ days: number; summary: GatewayUsageRow[] }> =>
    request(`/api/gateway/usage?days=${days}`),
  cursaOffice: async (): Promise<{ diary: Array<{ date: string; content: string }>; reminders: any[]; stickers: Array<{ id: string; url: string; tags: string[]; desc: string }> }> =>
    request("/api/cursa-office"),
  timelineAudit: async (): Promise<{ days: Array<{ date: string; status: string; events: Array<{ start: string | null; end: string | null; title: string; note: string; category: string; category_label: string; tags: string[] }> }>; timezone: string }> =>
    request("/api/timeline-audit"),
  gatewayTagUsage: async (tag: string): Promise<{ tag: string; bars: number[]; calls: number; failures: number; total_tokens: number; avg_latency_ms: number; cache_hit_rate: number }> =>
    request(`/api/gateway/usage/tag?tag=${encodeURIComponent(tag)}`),
  gatewayCrew: async (): Promise<{ crew: GatewayCrew[] }> => request("/api/gateway/crew"),
  gatewayUpsertCrew: async (crew: Partial<GatewayCrew>): Promise<{ ok: boolean; crew: GatewayCrew }> =>
    request("/api/gateway/crew", { method: "POST", body: JSON.stringify(crew) }),
  gatewayDeleteCrew: async (id: string): Promise<{ ok: boolean }> =>
    request(`/api/gateway/crew/${encodeURIComponent(id)}`, { method: "DELETE" }),
  // 清空并总结（#5 船员控制台）：重置历史注入点，旧对话压成备忘接棒
  gatewayCrewReset: async (id: string): Promise<{ ok: boolean; context_reset_at: string; memo: string; summarized_messages: number }> =>
    request(`/api/gateway/crew/${encodeURIComponent(id)}/reset`, { method: "POST" }),
  // 建群（#4）：members 传 id 数组（epsilon/cursa/deepseek/crew:<id>）
  createRoom: async (data: { name: string; description?: string; members: string[] }): Promise<{ room: Room }> =>
    request("/api/rooms", { method: "POST", body: JSON.stringify(data) }),
  updateRoom: async (id: string, data: { name?: string; description?: string; members?: string[] }): Promise<{ room: Room }> =>
    request(`/api/rooms/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  chatRegenerate: async (assistant: string): Promise<{ ok: boolean; deleted: number }> =>
    request("/api/chat/regenerate", { method: "POST", body: JSON.stringify({ assistant }) }),

  terminalPtyWsUrl: (session: string, options: { cols?: number; rows?: number; term?: string } = {}): string => {
    const { serverUrl, secret } = useConnection.getState();
    const params = new URLSearchParams();
    params.set("token", secret);
    params.set("session", session);
    if (options.cols) params.set("cols", String(options.cols));
    if (options.rows) params.set("rows", String(options.rows));
    if (options.term) params.set("term", options.term);
    const path = `/api/terminal/pty?${params.toString()}`;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const host = window.location.hostname;
      const isLocalDev = host === "localhost" || host === "127.0.0.1";
      if (!isLocalDev) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}${path}`;
      }
    }
    const baseUrl = serverUrl.replace(/\/+$/, "");
    if (!baseUrl) return path;
    return `${baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}${path}`;
  },

  // ── Our Starsky / Knowledge Graph ──

  starskyGraph: (focus?: string, depth?: number) => {
    const params = new URLSearchParams();
    if (focus) params.set("focus", focus);
    if (depth != null) params.set("depth", String(depth));
    return request<StarskyGraph>(
      `/api/starsky/graph?${params.toString()}`
    );
  },

  starskyGraph3d: () => request<any>("/api/starsky/graph-3d"),
  starskyGraph3dAll: () => request<any>("/api/starsky/graph-3d?include_all=1"),

  libraryReadingNow: (bookId: string, chapterIdx: number) =>
    request<any>(`/api/library/books/${encodeURIComponent(bookId)}/reading-now`, { method: "POST", body: JSON.stringify({ chapter_idx: chapterIdx }), headers: { "Content-Type": "application/json" } }),

  libraryAnnotations: (bookId: string, chapter: number) =>
    request<{ annotations: any[] }>(`/api/library/books/${encodeURIComponent(bookId)}/annotations?chapter=${chapter}`),

  // ── Pending Memory Actions ──

  pendingActions: (status?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return request<{ actions: PendingMemoryAction[]; status: string; limit: number }>(
      `/api/memory/pending${qs ? `?${qs}` : ""}`
    );
  },

  approvePendingAction: (id: string, resolvedBy?: string) =>
    request<{ ok: boolean; action: PendingMemoryAction }>(
      `/api/memory/pending/${encodeURIComponent(id)}/approve`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved_by: resolvedBy || "eri" }),
      }
    ),

  rejectPendingAction: (id: string, resolvedBy?: string) =>
    request<{ ok: boolean; action: PendingMemoryAction }>(
      `/api/memory/pending/${encodeURIComponent(id)}/reject`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved_by: resolvedBy || "eri" }),
      }
    ),

  sessionArchives: (limit?: number) =>
    request<any[]>(`/api/sessions/archives${limit ? `?limit=${limit}` : ""}`),

  sessionArchiveDetail: (id: string) =>
    request<any>(`/api/sessions/archives/${encodeURIComponent(id)}`),

  sessionArchiveScan: () =>
    request<any>("/api/sessions/archives/scan", { method: "POST" }),

  sessionArchiveResume: (id: string) =>
    request<any>(`/api/sessions/archives/${encodeURIComponent(id)}/resume`, { method: "POST" }),

  cursaMemories: (params?: { category?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set("category", params.category);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    const qs = q.toString();
    return request<{ memories: any[] }>(`/cursa-api/api/memories${qs ? `?${qs}` : ""}`);
  },

  cursaMemorySearch: (q: string, category?: string) =>
    request<{ memories: any[] }>(`/cursa-api/api/memories/search?q=${encodeURIComponent(q)}${category ? `&category=${category}` : ""}`),

  cursaMemoryStats: () =>
    request<{ total: number; latest: string | null; categories: any[] }>(`/cursa-api/api/memories/stats`),
};
