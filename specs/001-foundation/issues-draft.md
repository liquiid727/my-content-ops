# Creator Studio Foundation Issues（评审草案）

> 状态：待用户评审。本文只定义实施单元，不代表 Issue 已正式创建。评审确认后，再按选定平台生成独立 Issue。

## 1. 拆分目标

Foundation 要建立一个可运行、可持久化、可恢复、可继续扩展的个人创作平台骨架。它不实现完整的 Idea → Topic → Script → Rhythm → Shot → Voice → Video 链路，但必须证明 Project、Asset、Version、Task、Provider 与 Connector 这些公共基础可工作。

关联文档：

- [系统技术 SPEC](../000-system/spec.md)
- [API 契约](../000-system/api.md)
- [数据模型](../000-system/data-model.md)
- [系统验收标准](../000-system/acceptance.md)
- [前端设计与目录规范](../../docs/frontend_design.md)

## 2. 依赖图

```text
FND-01 Scaffold
├── FND-02 Shared Contracts & HTTP
│   └── FND-03 SQLite & Repositories
│       └── FND-04 Bootstrap & Local Identity
├── FND-05 Theme & App Shell
│   └── FND-06 Routing & Placeholders
│
├── FND-07 Project Vertical Slice ───────────┐
├── FND-08 Asset & Version Foundation ───────┤
├── FND-09 Persisted Task Runtime ──┐        │
│   └── FND-10 SSE & Recovery ──────┤        │
├── FND-11 Frontend Data Runtime ───┤        │
└── FND-12 Connector Settings ──────┤        │
                                    v        v
                           FND-13 Foundation Surfaces
                                      │
                                      v
                           FND-14 Hardening & Exit Gate
```

同一层无依赖的 Issue 可并行；有依赖的 Issue 只有在前置接口合并并通过测试后才能开始。

---

## FND-01：创建 Creator Studio 工程骨架与统一启动入口

**类型：** Infrastructure  
**优先级：** P0  
**依赖：** 无

### 描述

在当前仓库新增 `creator-studio/` 文件夹，建立 Vite + React + TypeScript 前端、本地 Node + Hono 服务端和共享包。提供开发、构建、类型检查、测试与生产启动脚本，同时保持旧项目行为不变。

### 验收标准

- [ ] 目录符合 `docs/frontend_design.md` 的模块边界，并包含 `apps/web`、`apps/server`、`packages/contracts`。
- [ ] 使用 npm workspace；依赖安装和脚本执行均不要求全局工具。
- [ ] 一个开发命令并行启动 web 与 server，进程退出时正确回收子进程。
- [ ] 生产构建由 server 托管前端静态文件，并支持 SPA 路由回退。
- [ ] 提供 `dev`、`build`、`start`、`typecheck`、`lint`、`test` 脚本。
- [ ] 根仓库仅增加明确命名的 Creator Studio 入口，不改变原有脚本语义。
- [ ] README 写明 Node 版本、安装、启动、构建和数据目录位置。

**SPEC 引用：** `spec.md` §1～§3、§10～§11；`acceptance.md` FND-001～FND-003、FND-044。

---

## FND-02：建立共享契约、HTTP 内核与错误模型

**类型：** Full-stack / Architecture  
**优先级：** P0  
**依赖：** FND-01

### 描述

实现前后端共用的 Zod schema、ULID、时间序列化、分页、成功/错误 envelope、request ID 与 Hono 中间件。所有后续领域 API 必须通过这层注册。

### 验收标准

- [ ] `packages/contracts` 不依赖浏览器、Node 文件系统或数据库实现。
- [ ] 定义公共 ID、ISO 时间、游标分页、错误 envelope 与字段级校验错误 schema。
- [ ] Hono 中间件提供 request ID、JSON 错误映射、404 和脱敏 500。
- [ ] `/api/v1/health` 使用共享响应 schema，并区分 ready/unhealthy 状态。
- [ ] 写接口支持 `Idempotency-Key` 的协议解析；持久化在 FND-03 接入。
- [ ] 更新请求统一携带 `revision`，冲突映射为 `409 PROJECT_REVISION_CONFLICT`。
- [ ] 契约测试覆盖合法响应、无效输入、404、500、冲突与幂等 key 复用。

**SPEC 引用：** `api.md` §1～§3、§10～§12；`acceptance.md` FND-012、FND-014～FND-017。

---

## FND-03：实现 SQLite、Drizzle 迁移与仓储基础层

**类型：** Backend / Data  
**优先级：** P0  
**依赖：** FND-01、FND-02

### 描述

按数据模型建立 SQLite 数据库、迁移器、事务工具与模块化 Repository。为测试提供临时数据库工厂，不允许业务模块直接散落 Drizzle 查询。

### 验收标准

- [ ] 首个迁移创建 `data-model.md` §3 定义的所有 Foundation 表、索引、外键和 CHECK 约束。
- [ ] 启动时启用 foreign keys、WAL 和 busy timeout，并自动执行未应用迁移。
- [ ] 已应用迁移 checksum 改变时拒绝启动并返回明确错误。
- [ ] 默认数据目录和数据库文件可自动创建；不可写时快速失败。
- [ ] 实现 Workspace、Project、Asset、Version、Task、Config 和 Idempotency Repository 的最小接口。
- [ ] Repository 更新使用 revision；Version 当前标记与 Task 状态事件使用事务。
- [ ] 单元/集成测试使用独立临时目录，结束后不残留数据。

**SPEC 引用：** `data-model.md` 全文；`acceptance.md` FND-004、FND-005、FND-027、FND-029。

---

## FND-04：实现 Bootstrap、本地身份与服务安全边界

**类型：** Backend / Security  
**优先级：** P0  
**依赖：** FND-02、FND-03

### 描述

建立单机单用户 Workspace 身份、首次启动种子数据、bootstrap API、same-origin 策略与本地会话边界。浏览器不得自行指定或越权访问其他 Workspace ID。

### 验收标准

- [ ] 首次启动以事务幂等创建一个 Workspace 和 CreatorProfile。
- [ ] `GET /api/v1/bootstrap` 返回当前身份、偏好、能力开关与脱敏配置摘要。
- [ ] 服务默认只监听 loopback；Host/Origin 不符合策略的写请求被拒绝。
- [ ] Workspace ID 由服务端上下文注入，不接受客户端任意覆盖。
- [ ] 设置本地会话 cookie 的 SameSite、HttpOnly 等适用属性。
- [ ] 日志包含 request ID、路径、状态、耗时，不记录正文、凭据或绝对路径。
- [ ] 重启和并发首次请求不会创建重复身份记录。

**SPEC 引用：** `spec.md` §9、§11；`api.md` §4、§12；`acceptance.md` FND-004、FND-013、FND-038、FND-040。

---

## FND-05：建立 Design Tokens、主题系统与 App Shell

**类型：** Frontend / UI  
**优先级：** P0  
**依赖：** FND-01

### 描述

用 Tailwind CSS 建立平台视觉 token、暗色默认主题、light/system 切换机制和响应式 App Shell。先实现可复用结构，不在本 Issue 堆叠业务页面。

### 验收标准

- [ ] Tailwind token 覆盖背景、surface、边界、文本、accent、danger、圆角、阴影和动效。
- [ ] 首次渲染默认暗色，主题初始化不出现明显闪烁。
- [ ] 支持 `dark`、`light`、`system`，system 会响应系统主题变化。
- [ ] App Shell 包含侧栏、顶部上下文区、主内容区和全局通知区。
- [ ] 360px、768px、1280px 下无横向溢出，侧栏在小屏可收起。
- [ ] 基础 Button、Input、Select、Dialog、EmptyState、Skeleton、Toast 具备键盘 focus 状态。
- [ ] 颜色对比度与主要交互满足 WCAG AA。

**SPEC 引用：** `spec.md` §1.3、§3.1、§6、§8；`acceptance.md` FND-006、FND-007、FND-010、FND-011。

---

## FND-06：实现路由、主导航与未开放模块占位

**类型：** Frontend  
**优先级：** P0  
**依赖：** FND-05

### 描述

建立 Dashboard、Projects、Assets、Tasks、Settings 与 Project Detail 路由。尚未进入 Foundation 的创作阶段页面使用一致的占位结构，避免死链和伪完成状态。

### 验收标准

- [ ] 所有主导航路由可直接打开和刷新，当前项有明确选中状态。
- [ ] 未知前端路由显示 Not Found，并提供返回 Dashboard 的操作。
- [ ] P1 占位页显示模块名、规划状态、简短说明和可返回路径。
- [ ] 路由级懒加载具有 Skeleton 和 Error Boundary。
- [ ] Project Detail 子路由保留 Overview、Ideas、Topics、Scripts、Rhythm、Shots、Assets、Tasks 入口。
- [ ] 键盘操作可遍历导航，移动端打开/关闭侧栏后 focus 合理恢复。

**SPEC 引用：** `spec.md` §4.1、§8；`acceptance.md` FND-008～FND-010。

---

## FND-07：完成 Project 生命周期纵向切片

**类型：** Full-stack / Feature  
**优先级：** P0  
**依赖：** FND-02、FND-03、FND-04、FND-05

### 描述

从 Repository、Service、REST API、共享 schema 到 Zustand feature store 和创建/编辑表单，完整实现 Project 创建、读取、更新、归档与游标列表。这是后续所有创作对象的归属基础。

### 验收标准

- [ ] 实现 `api.md` §5 的项目列表、创建、读取、更新、删除和 overview 接口。
- [ ] 标题、说明、内容类型和状态在服务端使用共享 schema 校验。
- [ ] 列表支持游标分页、状态筛选、更新时间排序，默认排除 archived 项目。
- [ ] 更新 revision 冲突提供可恢复提示；归档不删除 Project 数据。
- [ ] 创建成功后跳转 Project Overview；请求中断或重复提交不创建重复项目。
- [ ] Project store 只保存跨组件领域状态，不保存表单临时输入。
- [ ] API、Repository 和关键创建/编辑流程均有测试。

**SPEC 引用：** `api.md` §5；`data-model.md` §3.4；`acceptance.md` FND-018～FND-022。

---

## FND-08：建立 Asset 文件存储与 Version 基础能力

**类型：** Full-stack / Feature  
**优先级：** P0  
**依赖：** FND-02、FND-03、FND-04

### 描述

实现本地 Asset 上传、元数据提取、安全文件路径、列表/读取/软删除，以及通用 Version 的创建、查询和恢复。Foundation UI 只需提供最小列表与空/错状态。

### 验收标准

- [ ] 实现 `api.md` §6、§7 的 Foundation 端点与共享 schema。
- [ ] 上传采用临时文件 → 校验/摘要 → 数据库记录 → 原子移动流程。
- [ ] 拒绝路径穿越、绝对路径、超限文件、非法 MIME；失败后无孤儿临时文件。
- [ ] Asset 列表支持项目、类型、游标筛选并呈现 loading/empty/error/success 状态。
- [ ] 文件读取设置正确 Content-Type，不暴露真实文件系统路径。
- [ ] 恢复 Version 会创建新版本；数据库保证 subject 最多一个当前版本。
- [ ] 软删除 Asset 不立即删除仍被 Version 或其他对象引用的物理文件。

**SPEC 引用：** `api.md` §6～§7；`data-model.md` §3.5～§3.6、§4；`acceptance.md` FND-023～FND-027。

---

## FND-09：实现持久化 Task Runtime 与 Seed Provider

**类型：** Backend / Runtime  
**优先级：** P0  
**依赖：** FND-02、FND-03、FND-04

### 描述

实现进程内但持久化的 Task 队列、handler registry、合法状态转换、取消与 Seed Task。Seed Provider 模拟一次模型生成并写入 Generation，用来证明 Provider 抽象和任务链路成立。

### 验收标准

- [ ] 实现 Task 创建、查询、列表、取消端点以及共享状态 schema。
- [ ] Task 与首个 event 同事务创建；每次状态转换同事务追加 event。
- [ ] handler registry 拒绝未注册 type，并把异常映射为稳定失败状态。
- [ ] 支持 queued、running、waiting_review、completed、failed、cancelled 的合法转换。
- [ ] 取消 queued/running Task 可达稳定终态；取消终态 Task 返回 409。
- [ ] Seed Provider 只通过 `GenerationProvider` 接口被调用，并写入脱敏 Generation 记录。
- [ ] Seed Task 可完整经历 queued → running → completed，结果在重载后仍可读取。

**SPEC 引用：** `spec.md` §4.2、§5.2、§10；`api.md` §8；`data-model.md` §3.7～§3.9；`acceptance.md` FND-028、FND-029、FND-032、FND-034、FND-035。

---

## FND-10：实现 Task SSE、断线续传与启动恢复

**类型：** Full-stack / Runtime  
**优先级：** P0  
**依赖：** FND-09

### 描述

使用持久化 TaskEvent 提供 SSE 流，支持事件补发、心跳、自动重连、REST 快照校准和服务重启后的运行任务恢复。

### 验收标准

- [ ] `GET /api/v1/task-events` 按 `task_events.id` 输出 SSE id 与类型，并支持 project 筛选。
- [ ] 服务每 15 秒发送 heartbeat，连接关闭时释放订阅资源。
- [ ] 客户端使用 `Last-Event-ID` 恢复遗漏事件，重复事件不会重复修改状态。
- [ ] SSE 重连采用有上限的指数退避；45 秒无数据触发重连。
- [ ] 页面刷新先拉取 REST 快照，再订阅后续事件，避免订阅窗口丢事件。
- [ ] 启动恢复器按 handler 的 recoverable 声明重新排队或标记失败。
- [ ] 集成测试覆盖断线、补发、重复、重启和终态连接关闭。

**SPEC 引用：** `api.md` §8.5；`data-model.md` §3.7～§3.8；`acceptance.md` FND-030、FND-031、FND-033。

---

## FND-11：建立前端 API Client 与 Zustand 数据运行层

**类型：** Frontend / State  
**优先级：** P0  
**依赖：** FND-02、FND-04、FND-07、FND-09、FND-10

### 描述

实现类型安全 API client、bootstrap、session/theme、project、task stores 与 SSE 订阅适配器。明确 server state、领域状态和临时 UI 状态的边界，防止形成单一巨型 store。

### 验收标准

- [ ] API client 解析共享 schema，统一处理 request ID、错误 envelope、超时和取消。
- [ ] store 按 session、theme、project、task 领域拆分，并导出细粒度 selector。
- [ ] 组件不直接持有 SSE 生命周期；Task store 负责订阅、去重、重连和清理。
- [ ] bootstrap 成功后再渲染依赖身份的页面；失败有重试与诊断信息。
- [ ] 主题偏好先本地即时应用，再同步 CreatorProfile；失败时明确回滚或提示。
- [ ] Project/Task 页面刷新可从 API 恢复，不依赖内存中的上次导航。
- [ ] store 与 SSE adapter 有单元测试，覆盖竞态、重复事件和卸载清理。

**SPEC 引用：** `spec.md` §4.1、§8；`api.md` §2、§4、§8.5；`acceptance.md` FND-007、FND-031。

---

## FND-12：实现 Provider、Lark CLI 与 Obsidian 设置面板

**类型：** Full-stack / Integration Foundation  
**优先级：** P0  
**依赖：** FND-02、FND-03、FND-04、FND-05

### 描述

在 Settings 中提供 Provider、Lark CLI、Obsidian 三类配置面板，并在本地服务实现配置持久化、凭据引用和连接检查边界。Foundation 不做真实内容同步。

### 验收标准

- [ ] Settings 分区展示启用状态、非敏感配置、是否已有凭据和最近检查结果。
- [ ] Provider 凭据、Lark 凭据写入服务端 secret store；读取 API 永不返回原值。
- [ ] Lark CLI 设置支持命令路径/名称和必要参数；未安装时给出可操作错误。
- [ ] Obsidian 设置支持 Vault 根目录；拒绝非目录、不可读目录和逃逸路径。
- [ ] “测试连接”使用统一 Connector/Provider 接口，不在浏览器执行 CLI 或文件系统访问。
- [ ] Foundation 可使用 deterministic stub 返回连接成功；真实调用能力明确标注未开放。
- [ ] 日志、Task、Generation 和错误响应中不出现凭据或通用诊断不需要的绝对路径。

**SPEC 引用：** `spec.md` §4.2、§5.3、§11；`data-model.md` §3.10～§3.12、§4；`acceptance.md` FND-036～FND-039。

---

## FND-13：组装 Dashboard、Project Overview 与 Foundation 状态界面

**类型：** Frontend / Product Surface  
**优先级：** P0  
**依赖：** FND-06、FND-07、FND-08、FND-10、FND-11、FND-12

### 描述

将 Foundation 能力组装为可实际操作的产品表面：Dashboard、Project Overview、Assets、Tasks 和 Settings。信息架构遵循设计稿，但不复制旧 gpt-image 产品文案或交互。

### 验收标准

- [ ] Dashboard 显示项目入口、最近项目、最近任务与清晰空状态。
- [ ] Project Overview 显示基本信息、阶段摘要、最近 Task、Asset 摘要和后续创作模块入口。
- [ ] Assets 页面支持最小上传、筛选和结果展示。
- [ ] Tasks 页面显示状态、进度、错误、取消操作和 SSE 实时更新。
- [ ] Settings 完成主题、Provider、Lark CLI、Obsidian 配置交互。
- [ ] 每个数据区域均覆盖 loading、empty、error、success；写操作提供进行中和失败反馈。
- [ ] 暗色视觉与设计稿的信息层级一致，light 主题保持可读和完整。
- [ ] 关键流程在 360px、768px、1280px 下可用且无横向溢出。

**SPEC 引用：** `spec.md` §1.3、§3.1、§6、§8；`acceptance.md` FND-006～FND-011、FND-018、FND-020、FND-025、FND-036。

---

## FND-14：完成安全、性能、E2E 与 Foundation Exit Gate

**类型：** Quality / Hardening  
**优先级：** P0  
**依赖：** FND-01～FND-13

### 描述

按系统验收标准完成故障场景、关键 E2E、安全边界、性能基线和工程质量门禁。该 Issue 只允许修复验收缺口，不引入新的产品范围。

### 验收标准

- [ ] 自动化执行 typecheck、lint、unit、contract、integration、E2E 和 production build。
- [ ] 覆盖首次启动/重复启动、迁移失败、端口占用、数据目录不可写。
- [ ] 覆盖创建项目、上传 Asset、Seed Task、SSE 断线恢复、主题持久化四条关键流程。
- [ ] 验证路径穿越、非法 MIME、大小限制、Origin/Host、日志脱敏和 secret 不回传。
- [ ] 在规定种子数据下记录 `acceptance.md` §4 的启动、页面和 API 性能结果。
- [ ] 生产构建刷新任意前端路由成功，退出后无残留子进程或数据库锁。
- [ ] 对 `acceptance.md` FND-001～FND-044 逐项留下通过证据或经确认的例外 Issue。
- [ ] README 更新最终运行、测试、数据备份和故障排查步骤。

**SPEC 引用：** `acceptance.md` 全文；`spec.md` §8～§12。

## 3. 建议里程碑

| 里程碑 | Issues | 可验证结果 |
|---|---|---|
| M0 工程可运行 | FND-01～FND-06 | 应用可启动、迁移、bootstrap、切换主题和访问完整路由壳层 |
| M1 核心底座 | FND-07～FND-12 | Project、Asset、Version、Task、SSE、设置边界可工作 |
| M2 Foundation 完成 | FND-13～FND-14 | 产品表面组装完成，全部 Foundation 验收门禁通过 |

## 4. 评审时需要确认

正式生成 Issue 前，需要确认以下三项：

1. Foundation 是否接受 SQLite + Drizzle、Hono 和单本地 Workspace 这三个技术决定。
2. Issue 创建位置选择 GitHub、仓库内 Local Issues，还是其他平台。
3. 是否按上述 14 个 Issue 粒度执行；若希望首批更小，建议优先拆 FND-09 和 FND-13，不建议合并 P0 基础 Issue。

确认后，正式 Issue 应逐条复制对应描述、验收标准、依赖、优先级和 SPEC 链接，并在标题统一增加 `[Foundation]` 前缀。
