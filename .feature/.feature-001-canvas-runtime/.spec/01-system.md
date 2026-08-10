# SPEC 01: Canvas Runtime — 系统架构

> 来源：[`.prd`](../.prd) + 技术基线 `specs/000-system/spec.md`
> 生成日期：2026-08-10
> 技术决策：Canvas 渲染层选 `@xyflow/react`；真实 Provider 接入；Run 复用 Foundation Task Runtime
> 状态：待评审

## 1. Summary

### 1.1 What This SPEC Covers

本 spec 定义 Canvas Runtime（无限画布 + 节点创作 Pipeline）在 Foundation 之上的系统结构：模块边界、技术选型、数据归属、与既有 Task Runtime / Provider / Asset / Version 的关系、性能预算。数据模型/API/Runtime/UI 细节见 `02-data-model`、`03-api`、`04-runtime`、`05-canvas-ui`。

### 1.2 PRD Reference

- User Stories：US-001～US-009
- 来源：`creator-studio/docs/canvas-runtime/creator-workspace-prd-runtime-spec-v0.2.md`（62 节全量）

### 1.3 Design Decisions Summary

| 决策 | 选择 | 原因 |
| --- | --- | --- |
| Canvas 渲染层 | **`@xyflow/react`**（React Flow） | 节点/连线/平移/缩放/迷你图开箱即用，MVP 最快跑通骨架；自定义节点样式可控 |
| Run 模型 | **Run = Operation 语义层 + 复用 Foundation Task 执行层** | Task Runtime 已有持久化/幂等/SSE/恢复/重试，不另造轮子 |
| Artifact/Version | 新增 `artifacts`/`artifact_versions` 表 | Foundation `versions.subject_type` 枚举太窄（idea/topic/script/rhythm_plan/shot/asset），装不下任意 role |
| 媒体内容 | 复用 Foundation `assets`（contentRef → asset） | 二进制不进 SQLite，Blob 走文件存储 |
| Operation 注册 | 代码级 Registry + 可选 DB 覆盖 | MVP 静态注册足够，DB 覆盖留扩展位 |
| Provider | **扩展 GenerationProvider 能力集**（text/image/audio/video）+ 真实 Provider 配置 | 从 Seed 过渡到真实模型（LLM / 图片生成） |
| 画布持久化 | CanvasNode 布局存 DB（thin），内容全在 Artifact | 切 Tab/刷新恢复，同时 CanvasNode 不背内容 |
| 上下文注入 | Context Assembler 统一拼装，Personal Style 来自 creator-profile 契约 | 每个 Node 不自己拼 Prompt |

---

## 2. Architecture

### 2.1 System Context

```
┌─ Browser ───────────────────────────────────────────────┐
│  @xyflow/react Canvas │ Node Renderers │ Inspector       │
│  CanvasStore/ArtifactStore/RunStore/UIStore             │
└──────────┬───────────────────────────────────────────────┘
           │ Same-Origin REST + SSE
           ▼
┌─ Creator Studio Server ─────────────────────────────────┐
│  projects   : Project + graph 归属                        │
│  canvas     : nodes / edges 读写                          │
│  artifacts  : artifact / artifact_version 读写            │
│  operations : registry + run 编排                         │
│  runtime    : 复用 Foundation Task Runtime (执行/SSE/恢复) │
│  providers  : 扩展 GenerationProvider (text/image/audio)  │
│  context    : Context Assembler (+ creator-profile 注入)   │
└──┬──────────────┬────────────────────────────┬──────────┘
   ▼              ▼                            ▼
 SQLite        File Store (assets)         Vault / Lark connector
```

### 2.2 核心领域模型（严格分层）

```
CanvasNode      画布表现实体（布局 + artifactId + renderer）
Artifact        内容实体（kind + role + currentVersionId）
ArtifactVersion 内容版本（contentRef → asset 或 inline + source + operationRunId）
Edge            输入语义连线（source → target + inputSlot）
OperationDefinition  能力注册（behavior / input / output / executor / presentation）
Run             一次 Operation 执行（复用 Task 执行层）
```

一句话约束（来自来源文档 §62）：

> **Node 是内容容器，Operation 是可插拔能力，Version 管修改，Branch 管方向，Run 管执行，Canvas 只管理视觉关系。**

### 2.3 Module Boundaries（前端）

```
apps/web/src/
├── canvas/          # 画布壳 + @xyflow/react + 交互
│   ├── shell/ nodes/ edges/ toolbar/ minimap/ interactions/ store/
├── artifacts/       # domain / api / cache（摘要、当前版本）
├── operations/      # registry / schemas / ui（Inspector 操作渲染）
├── runtime/         # runs / events（SSE）/ provider 快照
├── inspector/       # shell / sections / fields / result-renderers
├── editors/         # text / image / audio / video（双击打开）
└── shared/          # 复用 shared/ui
```

后端（apps/server）新增模块：

```
apps/server/src/
├── canvas/          # nodes/edges routes + service
├── artifacts/       # artifact/version routes + service
├── operations/      # registry + definitions + run 编排 routes
├── context/         # Context Assembler
├── providers/       # 扩展：real 文本/图片 provider
└── db/              # schema/migrations 增表
```

### 2.4 与 Foundation 的关系

- **复用**：Task Runtime（执行/幂等/SSE/恢复）、Asset/File Store（媒体）、revision 乐观并发、错误 envelope、`shared/ui`、语义 token。
- **新增**：`artifacts`、`artifact_versions`、`canvas_nodes`、`edges`、`runs` 表；`operations/`、`canvas/`、`context/` 模块；Provider 能力扩展。
- **不修改**：既有 projects/assets/tasks API 的语义；新表与旧表通过 `project_id` 关联。

---

## 3. 非功能需求

### 3.1 性能预算（MVP）

| 节点数 | 目标 |
|---|---|
| 100 | 首屏可交互 < 1.5s（本地缓存命中）；Pan/Zoom 视觉流畅 |
| 300 | 普通操作保持流畅；Node Drag 不触发全图重渲染 |
| 500 | 开启 culling/LOD 后仍可用 |
| 1000 | 不作为强 SLA，但架构不得因全量 Mount 重组件而直接不可用 |

建立 benchmark 脚本（100/300/500/1000）。

### 3.2 性能手段

`Viewport Culling + LOD（zoom 分级）+ Lazy Media + Store 隔离 + Memoized Node Renderer + 增量数据拉取`。

### 3.3 Store 隔离

`CanvasStore`（viewport/positions/selection/hover/dragging/edge editing）｜`ArtifactStore`（summaries/current versions）｜`RunStore`（active runs/progress/failures）｜`UIStore`（inspector/modal/editor/context menu）。禁止 `node.data.everything`。

### 3.4 事件驱动

UI 通过 SSE 事件（`run.*` / `artifact.*` / `node.*` / `edge.*`）更新，不轮询整个 Project。详见 `03-api`。

---

## 4. 新增文件清单（后端子集）

```
apps/server/src/db/schema.ts         [MODIFY] +artifacts/artifact_versions/canvas_nodes/edges/runs
apps/server/src/db/migrations.ts     [MODIFY]
apps/server/src/artifacts/           [NEW]
apps/server/src/canvas/              [NEW]
apps/server/src/operations/          [NEW] registry + run 编排
apps/server/src/context/             [NEW] Context Assembler
apps/server/src/providers/           [MODIFY] 能力扩展 + 真实 provider
packages/contracts/src/              [NEW] canvas.ts / artifacts.ts / operations.ts
```

前端新增清单见 `05-canvas-ui`。

---

## 5. 实施阶段（对应来源文档 §58）

- Phase 0 Foundation（已完成 FND-01~14）
- Phase 1 画布骨架：Canvas + Node 渲染 + Edge + Pan/Zoom + 选择 + 拖动 + MiniMap + Toolbar（@xyflow/react）
- Phase 2 Artifact Runtime：Artifact + Version + Operation Registry + Run Store + Inspector 操作渲染
- Phase 3 第一条真实链路：Topic → Outline → Script（真实 Provider）
- Phase 4 媒体：Script → Cover / Voice / Video（真实 Provider + lazy media）
- Phase 5 性能：culling / LOD / cache / project unmount / benchmark

---

## 6. Open Questions

- `@xyflow/react` 与自定义 Node 的样式契约（由 `05-canvas-ui` 定案）。
- 真实 Provider 具体模型与密钥管理（provider_configs + secret_store 已有；模型 ID 属配置）。
- Publish 是否在 MVP 落地为真实 Action 还是骨架（倾向骨架 + Header 占位）。