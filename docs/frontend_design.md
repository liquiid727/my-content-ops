# Creator Studio 前端技术与目录设计

> 状态：MVP01 技术基线  
> 适用目录：`/creator-studio`  
> 产品需求：[`Creator_Studio_MVP01_PRD.md`](./Creator_Studio_MVP01_PRD.md)

## 1. 技术决策

Creator Studio 在当前仓库中新建独立的 `creator-studio/` 文件夹。旧的 `gpt_image_playground/` 已移除，不再作为图片、封面和视频生成能力的参考来源。

前端采用 Vite SPA，默认在本机运行。浏览器负责交互与编辑，本地 Node Server 负责数据持久化、AI Task、文件访问以及 Lark CLI / Obsidian 连接。

### 1.1 技术栈

| 类别 | 选型 | 使用范围 |
| --- | --- | --- |
| Framework | React + TypeScript | UI、交互与前端模块 |
| Build Tool | Vite | 开发服务器、HMR、生产构建 |
| Routing | React Router | 页面路由、Project 子路由、占位页面 |
| State | Zustand | Project Context、编辑状态、Task 状态、UI 状态 |
| Styling | Tailwind CSS | 布局、间距、排版、响应式和组件样式 |
| UI System | shadcn/ui | 可维护的业务组件基线 |
| Primitive | Radix UI / Base UI | Dialog、Popover、Tooltip、Menu 等无样式基础能力 |
| Theme | next-themes + CSS Variables | `dark / light / system` 切换，默认 `dark` |
| Icons | Lucide React | 产品图标，避免混用多套图标库 |
| Resizable Layout | react-resizable-panels | 工作区、Inspector、素材栏的可调整布局 |
| Rich Editor | Tiptap | 口播稿、图文内容与 AI Inline Action |
| AI Canvas | React Flow | Project 流程可视化与 P1 自由编排 |
| Drag & Drop | dnd-kit | 素材排序、分镜调整、时间线轻量拖动 |
| Table | TanStack Table | Project、Asset、Task 和 Connector 日志表格 |
| Validation | Zod | 前后端共享数据结构和 Connector 设置校验 |
| Video Timeline | 自研轻量版 | P0 仅支持轨道、片段、选中、移动和基础缩放 |
| Unit Test | Vitest + React Testing Library | Store、Module Interface 与组件交互 |
| E2E Test | Playwright | 新建 Project、生成流程和 Connector 设置 |

`next-themes` 只负责主题选择和根节点 class，即使项目使用 Vite 也可以独立使用，不依赖 Next.js。

## 2. 运行结构

```text
┌──────────────────────────────────────────────┐
│ Vite + React                                 │
│                                              │
│ AppShell / Routes / Modules / Zustand        │
└──────────────────────┬───────────────────────┘
                       │ HTTP + SSE
                       ▼
┌──────────────────────────────────────────────┐
│ Local Node Server                            │
│                                              │
│ Project / Task / Asset / Connector Modules   │
└───────────┬─────────────┬──────────────┬──────┘
            │             │              │
            ▼             ▼              ▼
         SQLite       Local Files     AI Providers
                          │
                    Lark CLI / Obsidian
```

- 普通 CRUD 使用 `/api/*` HTTP 接口。
- 长任务由 Server 创建 Task，前端通过 SSE 接收状态更新。
- Vite 开发环境将 `/api` 代理到本地 Node Server。
- 前端不直接执行 Shell、不直接读取任意本地路径，也不保存 CLI 凭据。
- 如果未来支持远程部署，再把 Connector 部分拆为 Local Bridge；MVP 不提前增加这一层。

## 3. 项目目录

```text
content-ops/
├── creator-studio/
│   ├── src/                         # 浏览器端
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   ├── router.tsx
│   │   │   ├── providers.tsx
│   │   │   └── bootstrap.ts
│   │   │
│   │   ├── layouts/
│   │   │   ├── app-shell/
│   │   │   ├── project-shell/
│   │   │   └── tool-workspace/
│   │   │
│   │   ├── routes/
│   │   │   ├── dashboard/
│   │   │   ├── projects/
│   │   │   ├── ideas/
│   │   │   ├── canvas/
│   │   │   ├── assets/
│   │   │   ├── knowledge/
│   │   │   ├── settings/
│   │   │   └── placeholders/
│   │   │
│   │   ├── modules/
│   │   │   ├── projects/
│   │   │   ├── ideas/
│   │   │   ├── topics/
│   │   │   ├── scripts/
│   │   │   ├── rhythm/
│   │   │   ├── assets/
│   │   │   ├── tasks/
│   │   │   ├── versions/
│   │   │   ├── connectors/
│   │   │   └── command-palette/
│   │   │
│   │   ├── shared/
│   │   │   ├── ui/
│   │   │   ├── api/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── icons/
│   │   │
│   │   ├── styles/
│   │   │   ├── tokens.css
│   │   │   ├── globals.css
│   │   │   └── vendors.css
│   │   └── main.tsx
│   │
│   ├── server/                      # 本地 Node Server
│   │   ├── index.ts
│   │   ├── http/
│   │   ├── db/
│   │   ├── modules/
│   │   │   ├── projects/
│   │   │   ├── assets/
│   │   │   ├── tasks/
│   │   │   ├── providers/
│   │   │   └── connectors/
│   │   │       ├── lark/
│   │   │       └── obsidian/
│   │   └── storage/
│   │
│   ├── shared/                      # 浏览器端和 Server 共用
│   │   ├── contracts/
│   │   ├── domain/
│   │   └── errors/
│   │
│   ├── tests/
│   │   ├── integration/
│   │   └── e2e/
│   ├── data/                        # SQLite 与本地运行数据，禁止提交
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
│
├── vault-server/                    # 现有知识检索能力
└── docs/
```

MVP 阶段保持单个 `creator-studio` 工程。只有当某段代码同时被浏览器端、Server 或 Worker 使用时，才进入 `shared/`；不预先建立多个 workspace package。

## 4. 前端 Module 结构

`routes/` 只负责路由入口和页面编排，业务行为放在对应 `modules/` 中。一个 Module 对外只暴露 `index.ts` 中的 Interface，其他目录视为 Implementation。

以 `projects` 为例：

```text
src/modules/projects/
├── components/
│   ├── project-card.tsx
│   ├── project-header.tsx
│   └── project-pipeline.tsx
├── store/
│   ├── project.store.ts
│   └── project.selectors.ts
├── api/
│   └── project.client.ts
├── model/
│   ├── project.types.ts
│   └── project.mappers.ts
├── hooks/
│   └── use-active-project.ts
├── project.test.ts
└── index.ts
```

约束：

- Route 可以组合多个 Module，但不直接修改其他 Module 的 Store。
- Module 之间通过公开 action、selector 或共享 contract 协作。
- `shared/ui` 不读取业务 Store。
- Provider、Connector 和数据库结构不进入 React 组件。
- 同一能力只有一个对外 Interface，避免再加一层只做转发的 wrapper。

## 5. Zustand 状态设计

Zustand 按状态的生命周期和归属拆分，不建立一个覆盖全应用的单体 Store。

| Store | 负责 | 不负责 |
| --- | --- | --- |
| `workspaceStore` | 当前 Workspace、用户偏好、全局上下文 | Project 详情 |
| `projectStore` | Project 列表、当前 Project、Pipeline 概览 | Script 编辑细节 |
| `editorStore` | 当前编辑器草稿、选区、dirty/saving 状态 | 历史版本持久化 |
| `taskStore` | Task 队列、进度、错误、重试状态 | 具体 Provider 实现 |
| `assetStore` | Asset 索引、筛选、选择状态 | 二进制文件内容 |
| `connectorStore` | Connector 状态、测试结果、同步日志 | CLI 凭据明文 |
| `uiStore` | Theme、面板宽度、弹窗、Command Palette | 业务实体 |

### 5.1 Store 规则

- Action 使用产品意图命名，例如 `createProject`、`retryTask`，不暴露通用 `setState` 给页面。
- 组件通过 selector 订阅最小状态，避免订阅整个 Store。
- 跨 Store 流程放在显式 orchestrator action 中，不在 React effect 里串联多个 `getState()`。
- Server 返回的 Project、Task、Asset 和 Version 是权威数据；Zustand 只保存客户端快照与编辑状态。
- `persist` 只用于 Theme、布局、未提交草稿等客户端状态，不将领域数据库复制进 Local Storage。
- Store 测试通过公开 action 和 selector 完成，不依赖内部状态结构。

## 6. 路由结构

```text
/
/projects
/projects/:projectId
/projects/:projectId/overview
/projects/:projectId/script
/projects/:projectId/rhythm
/projects/:projectId/images
/projects/:projectId/cover
/projects/:projectId/voice
/projects/:projectId/video
/projects/:projectId/assets
/projects/:projectId/sources
/ideas
/canvas/:projectId?
/assets
/knowledge
/settings/models
/settings/connectors
/settings/appearance
```

发布中心、数据分析、内容复盘和复杂自动化工作流允许保留导航入口。未实现页面统一进入 `routes/placeholders/`，显示功能范围、计划阶段和「即将开放」状态，不展示伪造的可操作结果。

## 7. Tailwind CSS 与主题

### 7.1 使用规则

- 布局、间距、字号、响应式和交互状态优先使用 Tailwind Utility。
- 颜色通过语义化 CSS Variables 提供，组件中不散落十六进制颜色。
- `tokens.css` 定义 Theme Token；`globals.css` 放 reset 和全局基础样式；`vendors.css` 只处理 Tiptap、React Flow 等第三方结构。
- shadcn/ui 组件可以修改，但业务变体留在业务 Module 中，不持续膨胀基础组件。
- 避免在 JSX 中维护大段任意值；同一视觉值重复三次以上时进入 Token 或 Tailwind Theme。

### 7.2 Theme

支持 `dark / light / system`，默认 `dark`。暗色设计稿是主要视觉验收基准。

```css
:root {
  --background: 240 20% 98%;
  --surface: 0 0% 100%;
  --foreground: 240 10% 10%;
  --muted-foreground: 240 5% 45%;
  --border: 240 6% 88%;
  --primary: 348 100% 65%;
}

.dark {
  --background: 228 12% 8%;
  --surface: 228 10% 13%;
  --foreground: 240 8% 96%;
  --muted-foreground: 240 5% 62%;
  --border: 228 8% 24%;
  --primary: 348 100% 65%;
}
```

AI 主操作可以使用粉、紫、橙渐变。渐变只出现在 Logo、主 CTA、Project 识别和生成状态中，不作为大面积页面背景。

## 8. 本地 Connector 设置

### 8.1 Lark CLI

设置项：

- CLI 可执行文件路径。
- 登录与授权状态。
- 默认知识库、空间和文档目录。
- 读取、写入权限。
- 测试连接、最近同步时间和错误日志。

Server 只允许执行预定义的 CLI command 和参数，不接受前端传入完整 Shell 命令。

### 8.2 Obsidian

设置项：

- Vault 根目录。
- Idea、Project、Script、Review 的目录映射。
- Frontmatter 模板。
- 只读、显式写入或双向同步策略。
- 冲突处理方式和同步日志。

Server 必须规范化路径，并验证所有读写目标都位于配置的 Vault 根目录内。写入默认由用户显式触发。

## 9. Task 与前端状态

所有长时间 AI 操作先创建 Task，再返回 `task_id`。页面不等待一个长 HTTP 请求完成。

```text
UI action
  → POST /api/tasks
  → taskStore 记录 queued task
  → SSE 接收 running / waiting_review / completed / failed
  → Module 根据 result_ref 获取 Version 或 Asset
```

刷新页面后，前端通过 `/api/tasks?status=active` 恢复任务。失败状态必须保留输入、上一版本和可重试操作。

## 10. 开发命令

建议使用一个 `package.json` 管理浏览器端和本地 Server：

```json
{
  "scripts": {
    "dev": "concurrently -k \"npm:dev:web\" \"npm:dev:server\"",
    "dev:web": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

Vite 开发代理：

```ts
server: {
  proxy: {
    '/api': 'http://127.0.0.1:4310',
  },
}
```

端口需要支持环境变量覆盖，默认只监听 `127.0.0.1`。

## 11. 旧项目能力迁移原则

- 不复制旧 AppShell、页面 Store 和 `ContentOpsWorkspace`（旧前端已移除）。
- 图片 Provider、文件下载、压缩和纯图片处理工具可以在对应阶段逐个提取。
- 提取前先为纯逻辑补测试，再接入新 Module Interface。
- 旧类型不能直接成为新 Project、Task、Asset、Version 的领域结构。
- 每次只迁移一条可验证能力，旧项目在迁移期间继续独立运行。

## 12. 前端完成标准

- 新项目在 `creator-studio/` 中独立启动和构建。
- 默认暗色，Theme 可以切换并在刷新后保持。
- AppShell、ProjectShell 和 ToolWorkspace 使用同一套 Token。
- Project 是所有创作页面的主上下文。
- 页面刷新可以恢复当前 Project、草稿与进行中的 Task。
- 长任务不阻塞页面请求。
- Lark CLI 和 Obsidian 可以在设置页配置并测试连接。
- P1 页面以统一占位状态呈现。
- Store、Module Interface 和关键流程有自动测试。
- Desktop First，并保证窄屏下导航和核心编辑操作可用。
