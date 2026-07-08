# EVENT HORIZON UI

> A monochrome sci-fi PWA theme for AI companion apps — four-point stars, DM corner-cut bubbles, and a black-hole funnel of light. Built with Expo / React Native Web.

事件视界——单色系科幻 PWA 主题。四尖星、45° 切角气泡、黑洞光锥。开箱即看，接上你自己的后端即用，组件可单独拆走。

**Live demo**: 打开即是 demo 模式（本地假数据，不出网）。

---

## 两种用法

### 1. Demo 模式（默认）

```bash
npm install
npx expo export --platform web
# dist/ 部署到任意静态服务器即可
```

出厂即 demo：所有请求被 `services/demoData.ts` 在本地应答，零后端、零配置、零网络请求。适合看皮肤、抄样式。

### 2. 连接你自己的后端

设置页填入你的后端地址和令牌即切换为真实请求。你的后端需要实现下面的最小协议：

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/chat/poll?since=<iso>` | — | `{ messages: Message[] }` |
| GET | `/api/chat/history?before=<iso>&limit=50` | — | `{ messages: Message[] }` |
| POST | `/api/chat/send` | `{ text }` | `{ message: Message }` |
| GET | `/api/rooms` | — | `{ rooms: Room[] }` |
| GET | `/api/rooms/:id/messages` | — | `{ room, messages: RoomMessage[] }` |
| POST | `/api/rooms/:id/send` | `{ text, mode?, target? }` | `{ message, dispatch }` |
| GET | `/api/terminal/capture?session=&lines=` | — | `{ session, output }` |

认证：所有请求带 `X-Auth-Token` 头。核心类型：

```ts
Message = { id, role: "user"|"assistant", text, ts, status,
            thinking?, tool_calls?, content_blocks? }   // 思考链与工具卡可选
Room    = { id, name, members: { id, name, role }[] }
```

没实现的端点返回空对象即可——UI 对缺数据一律优雅降级。

---

## 组件拆用地图

每个组件都可以单独搬走。公共依赖只有两个：`theme/themes.ts`（design tokens）和 `theme/colors.ts` 里的像素字体声明——把这两个文件带上，其余按需取用。

| 组件 | 位置 | 说明 |
|---|---|---|
| **Starfield** | `components/chat/Starfield.tsx` | 黑洞光锥 / 星场背景，三套场景，procedural 四尖星 |
| **MessageBubble** | `components/chat/MessageBubble.tsx` | DM 切角气泡 + 思考链折叠 + 工具卡 + 按真实顺序交错的时序流渲染 |
| **HudHeader** | `components/chat/HudHeader.tsx` | 聊天页 HUD 仪表头（波形 / 读数 / 状态灯） |
| **WelcomeScreen** | `components/WelcomeScreen.tsx` | 开屏：打字机标题 + 系统自检清单 + 进度格 |
| **EhParts** | `components/decor/EhParts.tsx` | 装饰件族：外框 / 斜线纹 / 徽记 / 六角坐标 |
| **CrtScanlines** | `components/decor/CrtScanlines.tsx` | CRT 扫描线覆层 |
| **CornerBrackets** | `components/decor/CornerBrackets.tsx` | 四角括号 |
| **Terminal view** | `app/(tabs)/terminal.tsx` | tmux 终端镜像页（ANSI 渲染 / 断线重连） |
| **Theme tokens** | `theme/themes.ts` | `eventHorizon` 主题定义——单色系 + 唯一蓝的全部色板 |

### 设计语言三原则

1. **Monochrome + one blue** — 黑白灰为骨，唯一强调色 `#60a8ff`，绿色只给"成功"。
2. **45° corner cuts** — 气泡与卡片用 clip-path 切角，不用圆角。
3. **Four-point stars** — 星星是四尖的（`drawStar4`），不是圆点。

---

## License

MIT © Eridanus-Multiverse
