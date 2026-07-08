// EH Demo mock 数据层（2026-07-08）——开源版不连任何后端。
// request() 在入口处被拦截：按 path 前缀路由到这里的静态数据，
// 未覆盖的端点返回空壳（空数组/空对象），UI 优雅降级。

const now = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const DEMO_MESSAGES = [
  { id: "d1", role: "user", text: "hey — show me what this theme can do", ts: minutesAgo(32), status: "sent", assistant: "epsilon" },
  { id: "d2", role: "assistant", text: "watch the horizon.\n---\nfour-point stars, DM-cut bubbles, a funnel of light that never quite lets go — everything past this line stays.", ts: minutesAgo(31), status: "sent", assistant: "epsilon", thinking: "the demo wants a first impression. keep it quiet, let the geometry speak." },
  { id: "d3", role: "user", text: "what happens at the event horizon?", ts: minutesAgo(20), status: "sent", assistant: "epsilon" },
  { id: "d4", role: "assistant", text: "light bends, but never leaves.\n---\nthat is also the design language here: monochrome, one blue, and edges cut at 45°.", ts: minutesAgo(19), status: "sent", assistant: "epsilon", tool_calls: JSON.stringify([{ name: "render_starfield", input_summary: "seed=A" }]) },
];

const DEMO_ROOMS = [
  {
    id: "demo-comm", name: "COMM ARRAY", description: "Open channel demo room.", type: "group",
    members: [
      { id: "eri", name: "CAPTAIN", role: "human", icon: "eri" },
      { id: "epsilon", name: "UNIT-A", role: "ai", icon: "epsilon" },
      { id: "cursa", name: "UNIT-B", role: "ai", icon: "cursa" },
    ],
    created_at: minutesAgo(600), updated_at: minutesAgo(5), viewer_role: "member", readonly: false, metadata: null,
    message_count: 3, last_message_at: minutesAgo(5),
  },
];

const DEMO_ROOM_MESSAGES = [
  { id: "r1", room_id: "demo-comm", sender: "eri", text: "status report", created_at: minutesAgo(7), metadata: null, reactions: "[]" },
  { id: "r2", room_id: "demo-comm", sender: "epsilon", text: "all systems nominal. horizon stable.", created_at: minutesAgo(6), metadata: null, reactions: "[]" },
  { id: "r3", room_id: "demo-comm", sender: "cursa", text: "audit clean. nothing escapes.", created_at: minutesAgo(5), metadata: null, reactions: "[]" },
];

const DEMO_TERMINAL = `$ ssh unit-e@horizon
Welcome to EVENT HORIZON demo shell.
unit-e:~$ status
  theme    : event-horizon
  stars    : four-point, procedural
  bubbles  : DM corner-cut
unit-e:~$ _`;

// path → mock 响应。支持前缀匹配，先长后短。
export function demoResponse(path: string, method: string): any {
  const p = path.split("?")[0];

  // chat
  if (p === "/api/chat/poll" || p === "/api/chat/history") {
    return { messages: DEMO_MESSAGES, server_time: now() };
  }
  if (p === "/api/chat/send") {
    return { message: { id: `d${Date.now()}`, role: "user", text: "", ts: now(), status: "sent" }, queued: false };
  }
  if (p.startsWith("/api/chat")) return { ok: true, messages: [] };

  // rooms
  if (p === "/api/rooms") return { rooms: DEMO_ROOMS };
  if (/^\/api\/rooms\/[^/]+\/messages/.test(p)) return { room: DEMO_ROOMS[0], messages: DEMO_ROOM_MESSAGES };
  if (/^\/api\/rooms\/[^/]+\/send/.test(p)) {
    return { message: { id: `r${Date.now()}`, room_id: "demo-comm", sender: "eri", text: "", created_at: now() }, dispatch: [] };
  }
  if (p.startsWith("/api/rooms")) return { ok: true, rooms: DEMO_ROOMS, messages: [], summaries: [] };

  // terminal
  if (p.startsWith("/api/terminal/capture")) return { output: DEMO_TERMINAL, session: "demo" };
  if (p.startsWith("/api/terminal/blocks")) return { session: "demo", source: "none", offset: 0, blocks: [] };
  if (p.startsWith("/api/terminal")) return { ok: true };

  // audit（监督室壳）
  if (p.startsWith("/api/timeline-audit") || p.startsWith("/api/cursa-office")) {
    return { days: [], diary: [], reminders: [], stickers: [] };
  }

  // context / usage 装饰
  if (p.includes("context") || p.includes("usage")) {
    return { pct: 42, tokens: 84000, budget: 200000, bars: [12, 30, 18, 44, 25, 60, 38], calls: 7, cache_hit_rate: 0.87, avg_latency_ms: 1200, summary: [] };
  }

  // health / misc
  if (p.includes("health") || p.includes("status")) return { ok: true, demo: true };

  // 默认空壳（肥版：常见数组字段全给空数组，防 undefined.map 崩）
  const fat = {
    ok: true, demo: true,
    messages: [], items: [], rows: [], list: [], notices: [], events: [], memories: [], days: [], summary: [],
    crew: [], providers: [], rooms: [], blocks: [], bars: [], devices: [], companions: [], archives: [], history: [],
    sessions: [], features: {}, flags: {}, config: { enabled: false }, status: {},
    timezone: "UTC", label: "", server_time: now(),
  };
  // Proxy 兜底：未知字段一律给空数组——.map/.length/链式访问全都安全；
  // then/toJSON 等特殊键必须返回 undefined（否则会被误判成 thenable）。
  return new Proxy(fat, {
    get(target, key) {
      if (key in target) return (target as any)[key];
      if (typeof key !== "string" || key === "then" || key === "toJSON" || key.startsWith("@@") || key.startsWith("Symbol")) return undefined;
      return [];
    },
  });
}
