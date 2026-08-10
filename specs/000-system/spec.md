# SPEC 000：Creator Studio 总体技术设计

> 来源：[`docs/Creator_Studio_MVP01_PRD.md`](../../docs/Creator_Studio_MVP01_PRD.md)  
> 前端基线：[`docs/frontend_design.md`](../../docs/frontend_design.md)  
> 生成日期：2026-08-09  
> 目标分支：`master`  
> 基线提交：`5c0be62`  
> 状态：待评审

## 1. 摘要

### 1.1 范围

本 SPEC 定义 Creator Studio MVP01 的总体工程结构、运行方式、Module Interface、数据所有权、Task Runtime、文件存储、Provider 与 Connector seam、错误处理、安全要求和阶段依赖。

Creator Studio 在当前仓库中新建 `creator-studio/` 文件夹。浏览器端使用 Vite + React + Zustand，本地 Node Server 提供持久化、Task 执行、Provider 调用和本地文件能力。旧 `gpt_image_playground/` 与 `vault-server/` 在迁移期保持独立运行。

### 1.2 不在本 SPEC 中确定的实现细节

- 各创作页面的具体布局和交互细节，由后续纵向 SPEC 定义。
- 具体 LLM、图片、TTS、视频模型及参数，由 Provider 配置定义。
- P1 的自由节点 Workflow Builder、自动发布、平台数据分析和插件系统不进入 MVP01 核心实现。
- 不迁移旧项目的 AppShell、页面 Store 和复合工作区组件。

### 1.3 设计决策

| 决策 | 选择 | 原因 |
| --- | --- | --- |
| 项目位置 | 当前仓库的 `creator-studio/` | 共享文档和迁移参考，同时避免在旧图片项目内继续堆叠 |
| 浏览器端 | Vite + React + TypeScript | 符合已确认技术基线，适合 Desktop First SPA |
| 前端状态 | Zustand，按 Module 拆分 | 保持 action 与 selector 小接口，避免单体 Store |
| 本地 Server | Node.js + Hono | 与现有 `vault-server` 技术方向一致，支持 REST、SSE 和本地文件访问 |
| 数据库 | SQLite + Drizzle ORM | 单用户本地优先，支持迁移、事务和类型化 Schema |
| 文件存储 | `creator-studio/data/files/` | 二进制文件不进入 SQLite，数据库只保存相对路径和元数据 |
| API | `/api/v1` REST + SSE | CRUD 使用 REST，长 Task 使用 SSE 推送状态 |
| Task Runtime | SQLite 持久化的进程内队列 | MVP 无需 Redis/独立 Worker，进程重启后可以恢复 |
| Theme | `dark / light / system`，默认 `dark` | 暗色设计稿为主要视觉基准，同时保留切换能力 |
| Connector | Server 内部 Module + Adapter | 浏览器不直接执行 CLI 或访问 Vault；未来可拆 Local Bridge |
| Auth | 单机 Workspace 身份 + Same-Origin 限制 | MVP 单人本地使用，不引入远程账户体系 |
| ID | ULID 字符串 | 本地可生成、可排序，后续迁移到远程数据库无需改主键形态 |

### 1.4 假设

- MVP01 在用户本机运行，Server 只监听 `127.0.0.1`。
- 默认只有一个 Workspace 和一个本地 Creator Profile，但所有核心实体保留 `workspace_id`。
- SQLite、Drizzle、Hono 是总体 SPEC 的推荐实现；如评审后更换，必须先更新本 SPEC，再拆实现 Issue。
- Foundation 阶段允许使用 Seed Provider 和 Seed Data，但 API、Task、Asset、Version 必须走正式 Interface。

## 2. 系统结构

```text
┌─────────────────────────────────────────────────────┐
│ Browser                                              │
│                                                     │
│ Vite / React / Router / Zustand / Tailwind          │
│ AppShell + Product Modules                          │
└────────────────────────┬────────────────────────────┘
                         │ Same-Origin HTTP + SSE
                         ▼
┌─────────────────────────────────────────────────────┐
│ Creator Studio Local Server                         │
│                                                     │
│ HTTP │ Domain Modules │ Task Runtime │ Adapters      │
└──────┬─────────┬────────────┬─────────────┬──────────┘
       │         │            │             │
       ▼         ▼            ▼             ▼
    SQLite   File Store   AI Providers   Connectors
                                           │
                                      Lark / Obsidian
```

### 2.1 浏览器端职责

- 渲染 AppShell、Project 工作区和设置面板。
- 维护编辑草稿、当前选择、面板布局和 Task 客户端快照。
- 调用 Server Contract，不直接读取数据库、Shell、绝对文件路径和 Provider Secret。
- 通过 SSE 订阅 Task 事件，刷新后重新请求 active Task。

### 2.2 Local Server 职责

- 校验请求和序列化响应。
- 执行 Project、Asset、Version、Task 等领域操作。
- 管理 SQLite transaction、migration 和 Seed Data。
- 管理文件导入、存储、缩略图和导出。
- 调用 Provider Adapter、Lark CLI Adapter 和 Obsidian Adapter。
- 保存 Task、Generation、Connector 和 Sync Log。

### 2.3 旧项目关系

```text
gpt_image_playground ──参考/逐项提取──▶ Creator Studio Provider Adapter
vault-server         ──HTTP 调用─────▶ Knowledge Search Adapter
```

新项目不能 import `gpt_image_playground/src/*`。需要复用的纯逻辑应在对应阶段复制到新 Module，补齐测试后再接入。`vault-server` 先保持独立进程，通过 HTTP 使用；只有出现两个稳定调用方后再评估提取共享 package。

## 3. Module 与 Interface

### 3.1 浏览器端 Module

| Module | 对外 Interface | 主要 Implementation |
| --- | --- | --- |
| Workspace | `loadWorkspace()`、workspace selector | Workspace Store、Bootstrap Client |
| Projects | `listProjects()`、`createProject()`、`updateProject()` | Project Store、Project Client、Project UI |
| Tasks | `subscribeTasks()`、`retryTask()`、`cancelTask()` | Task Store、SSE Client、Task UI |
| Assets | `listAssets()`、`importAsset()`、`selectAsset()` | Asset Store、Asset Client、Gallery |
| Versions | `listVersions()`、`restoreVersion()` | Version Client、History UI |
| Connectors | `loadConnectors()`、`testConnector()`、`saveConnector()` | Connector Store、Settings UI |
| UI | Theme、Panel、Dialog、Command Palette actions | UI Store、Layout primitives |

Route 只编排 Module。Route 不允许直接修改其他 Module 的 Zustand state，也不允许把 Server response shape 直接散布到页面组件。

### 3.2 Server Module

| Module | Interface | 数据所有权 |
| --- | --- | --- |
| Workspace | 创建默认 Workspace、读取设置 | `workspaces`、`creator_profiles` |
| Projects | Project 生命周期管理、Pipeline 计算 | `projects` |
| Assets | 导入、登记、读取、删除 | `assets`、File Store |
| Versions | 追加、列出、恢复版本 | `versions` |
| Tasks | 创建、执行、恢复、重试、取消、发事件 | `tasks`、`task_events` |
| Generations | 保存 Provider 输入输出与消耗 | `generations` |
| Providers | 按 capability 选择 Adapter | `provider_configs` |
| Connectors | 连接、测试、读取、写入、同步 | `connector_configs`、`sync_records` |
| Knowledge | Source 入库、检索、引用 | `sources` + vault-server Adapter |

### 3.3 Provider seam

业务 Module 只使用 capability Interface：

```ts
interface TextGenerationProvider {
  generate(input: TextGenerationInput, signal: AbortSignal): Promise<TextGenerationResult>
}

interface ImageGenerationProvider {
  generate(input: ImageGenerationInput, signal: AbortSignal): Promise<ImageGenerationResult>
}

interface SpeechGenerationProvider {
  generate(input: SpeechGenerationInput, signal: AbortSignal): Promise<SpeechGenerationResult>
}

interface VideoGenerationProvider {
  generate(input: VideoGenerationInput, signal: AbortSignal): Promise<VideoGenerationResult>
}
```

Adapter 负责模型参数、认证、轮询和供应商错误转换。业务 Module 不保存供应商 SDK 对象，不判断具体模型名称。

### 3.4 Connector seam

```ts
interface ExternalConnector {
  test(config: ConnectorConfig): Promise<ConnectorTestResult>
  search(query: ConnectorSearchQuery): Promise<ExternalItemSummary[]>
  read(ref: ExternalItemRef): Promise<ExternalDocument>
  write(command: ConnectorWriteCommand): Promise<ConnectorWriteResult>
  sync(command: ConnectorSyncCommand): Promise<SyncResult>
}
```

- Lark Adapter 只能执行预定义 CLI command 和参数数组。
- Obsidian Adapter 只能访问经过规范化且位于 Vault 根目录内的路径。
- 覆盖、删除和冲突处理必须由明确的 write command 表达，不能隐式发生。

## 4. 核心状态机

### 4.1 Project

```text
draft → active → archived
```

- `status` 表达项目生命周期；`archived` 可以从 `draft` 或 `active` 进入。
- `idea / topic / script / rhythm / shot / voice / video / completed` 是根据领域结果计算的 Pipeline Stage，不是可写的 Project status。
- Project 阶段不能只依赖前端进度条，也不能由客户端直接提交覆盖。
- MVP 不提供硬删除 Project；用户侧移除操作使用 archive。

### 4.2 Task

```text
queued → running → waiting_review → completed
   │        │              │
   ├────────┴──────────────┴──→ failed
   └──────────────────────────→ cancelled
```

规则：

- `completed / failed / cancelled` 为终态。
- `retry` 创建新 Task，并通过 `parent_task_id` 关联旧 Task；不重置旧记录。
- Server 启动时，将遗留 `running` Task 转为 `queued` 或 `failed`，由 Task 类型的恢复策略决定。
- Task 完成必须在同一 transaction 中写入 result reference 与终态。
- 页面等待人工确认时使用 `waiting_review`，不占用执行并发槽。

### 4.3 Version

- AI 生成和用户明确保存均追加 Version。
- 恢复旧 Version 会创建新的 current Version，不修改历史记录。
- Version payload 保存结构化快照；二进制内容保存为 Asset，并通过 ID 引用。

## 5. 数据流

### 5.1 创建 Project

```text
Dashboard Composer
  → POST /api/v1/projects
  → Project Module 校验并写入 SQLite
  → 返回 Project
  → Project Store 更新列表和 activeProjectId
  → 跳转 /projects/:projectId/overview
```

### 5.2 创建生成任务

```text
Product Module
  → POST /api/v1/tasks { type, projectId, input }
  → Task Module 写入 queued Task
  → Task Runner 领取 Task
  → Provider Adapter 执行
  → Generation / Version / Asset transaction
  → task_events 写入 completed
  → SSE 推送事件
  → Task Store 与对应 Product Module 刷新结果
```

### 5.3 文件导入

```text
Browser multipart upload / Connector import
  → 校验大小与 MIME
  → 写入临时文件
  → 计算 hash
  → 移动到 data/files/assets/<assetId>/
  → 写入 Asset metadata
  → 异步创建 thumbnail / text extraction Task
```

## 6. 前端状态原则

- SQLite 中的领域数据是权威数据；Zustand 保存客户端快照和编辑期状态。
- Theme、布局、Command Palette、未提交草稿可以使用 Zustand persist。
- Project、Task、Asset、Version 不完整复制到 Local Storage。
- Module action 使用业务意图命名，不对 Route 暴露通用 setter。
- SSE 断开后使用指数退避重连，重连成功后先查询 active Task 再继续消费事件。
- 编辑器保存使用 revision/updated_at 做乐观并发检查，冲突时保留本地草稿。

## 7. 错误处理

### 7.1 错误分类

| 分类 | 示例 | 前端行为 |
| --- | --- | --- |
| validation | 字段缺失、格式错误 | 标注具体字段，保留输入 |
| conflict | revision 冲突、Connector 两边均修改 | 展示比较与选择，不自动覆盖 |
| unavailable | Provider、CLI、Vault 不可用 | 显示原因和设置入口 |
| retryable | 网络超时、供应商限流 | 提供 Retry，保留旧版本 |
| permission | 路径越界、写权限关闭 | 阻止操作并说明需要的权限 |
| internal | 未分类 Server 错误 | 展示 request_id，记录 Server 日志 |

### 7.2 失败不变量

- 失败不能删除输入、上一 Version 和已经生成的 Asset。
- API 错误使用稳定 `error.code`，UI 不解析供应商原始 message 决定行为。
- Provider Secret、CLI 授权信息和本地绝对路径不能进入 Prompt、Task 公共输出或浏览器日志。

## 8. 安全

- Server 默认监听 `127.0.0.1`，不监听所有网卡。
- 生产模式由 Server 提供静态前端文件，保持 Same-Origin。
- 开发模式仅允许配置的 Vite Origin；不开启通配 CORS。
- 所有请求体、query、path params 使用 Zod 校验并设置大小限制。
- CLI 使用 `spawn(executable, args, { shell: false })`，禁止拼接 Shell 字符串。
- Connector Secret 保存在 Server 配置区；API 只返回 masked value 和连接状态。
- 文件路径必须经过 `realpath`/规范化检查，并限制在 Workspace data 或配置的 Vault root 内。
- 文件名只作为显示信息，不参与最终存储路径拼接。

## 9. 性能与稳定性

### 9.1 性能目标

| 场景 | Foundation 目标 |
| --- | --- |
| Bootstrap 结构数据 | 本地开发数据下 P95 < 300ms |
| Project 列表 | 1000 个 Project 内 P95 < 300ms |
| Task 创建 | P95 < 150ms，不含实际生成 |
| Dashboard 首次可交互 | 开发机生产构建下 < 2s |
| 大 Asset | 不加载原文件，列表只读取 metadata/thumbnail |

### 9.2 SQLite

- 启用 WAL、foreign_keys 和 busy_timeout。
- 列表查询必须分页；默认 30，最大 100。
- `workspace_id`、`project_id`、`status`、`created_at` 按主要查询建立复合索引。
- Schema 变更只通过 migration，不在启动时执行 ad-hoc ALTER。

### 9.3 Task 恢复

- Task 写入数据库后 API 才返回成功。
- Task Event 先持久化再推送 SSE。
- Server 重启后恢复 queued Task；running Task 按恢复策略处理。
- Foundation 默认总并发 2，同一 Project 的视频类 Task 默认并发 1；具体 Provider 可以进一步限流。

## 10. 测试策略

### 10.1 单元测试

- 领域状态转换、Project Pipeline 计算。
- Zustand action 与 selector。
- API schema 和错误转换。
- 路径安全、CLI 参数生成和 Provider Adapter。

### 10.2 集成测试

- SQLite migration、repository transaction 和 restart recovery。
- Project / Asset / Version / Task HTTP Contract。
- Task Runner、Task Event 与 SSE。
- Connector 使用 fake Adapter，不调用真实外部账户。

### 10.3 E2E

- 首次启动创建默认 Workspace。
- Theme 切换并刷新保持。
- Dashboard 使用 Seed Data 展示 Project 与 Task。
- 新建 Project 后进入 Project Overview。
- 模拟 Task 从 queued 进入 completed/failed，并验证刷新恢复。
- P1 导航进入统一占位页面。

### 10.4 视觉验收

- 以 `docs/01 · 首页 Dashboard.png` 等设计稿为暗色主题基准。
- 验收 Desktop 1440×900 和 1920×1080。
- 亮色主题只要求 Token、层级、对比度和交互完整，不要求重新设计布局。

## 11. 实现阶段与依赖

```text
000-system
  ↓
001-foundation
  ↓
002-dashboard + 003-project
  ↓
004-ideas-topics
  ↓
005-script + 006-rhythm
  ↓
007-image + 008-cover
  ↓
009-voice + 010-video
  ↓
011-lark + 012-obsidian + 013-knowledge
```

Foundation 的退出条件是：新工程可独立运行；默认 Workspace、Project、Asset、Version、Task 可持久化；AppShell 和 Theme 可用；Dashboard 通过正式 API 读取 Seed Data；Task 可以异步更新与刷新恢复。

## 12. 风险与待评审项

| 风险/问题 | 当前处理 |
| --- | --- |
| PRD 视觉原则写暖浅灰，设计稿为暗色 | 以已确认决策为准：暗色默认，提供 Theme 切换 |
| 本地 Server 被其他网页请求 | Same-Origin、Origin allowlist、无通配 CORS、仅监听 loopback |
| SQLite 与长视频任务争用 | WAL、短 transaction、二进制不入库、Task 执行不持有 DB transaction |
| 旧 Provider 与新领域类型耦合 | 通过 capability Interface 和 Adapter 逐项迁移 |
| Lark CLI 行为不稳定 | Adapter 转换错误、保存 Sync Log、写操作显式触发 |
| Obsidian 路径越界或冲突 | Vault root 校验、显式同步、冲突不自动覆盖 |

评审时需要确认：

1. SQLite + Drizzle 是否作为 MVP01 的持久化方案。
2. Hono 是否作为 `creator-studio/server` 的 HTTP Framework。
3. 本地单 Workspace 身份是否满足 Foundation，远程账户登录是否继续留在范围外。
