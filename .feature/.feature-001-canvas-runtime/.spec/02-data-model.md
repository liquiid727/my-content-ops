# SPEC 02: Canvas Runtime — 数据模型

> 来源：`.prd` + `01-system` + 来源文档 §5-§10
> 状态：待评审

## 1. 设计原则

- **CanvasNode 不背内容**：不存正文/高清媒体/全部版本/全部 Runs/Prompt 历史。
- **Artifact 用 `kind + role` 表达业务**，不为每种业务建底层类型（`text/topic`、`image/cover`…）。
- **媒体内容走 Foundation `assets`**（`contentRef → asset_id`），二进制不进 SQLite。
- **Run 复用 Task 执行层**：`runs` 表只存 operation 语义字段，状态/进度/SSE 由 `tasks` 驱动。
- 所有新表带 `workspace_id`、ULID 主键、`created_at/updated_at`，沿用 Foundation 约定。

## 2. Project 扩展

`projects` 表新增列（向后兼容，可空）：

| 列 | 类型 | 说明 |
|---|---|---|
| `graph_id` | text (ULID) nullable | 画布图归属（MVP 1:1 project） |
| `context_id` | text nullable | Project Context 引用（MVP 可空） |
| `personal_style_id` | text nullable | → `creator_profiles.id`（Personal Style 契约） |

contracts：`projects.ts` 的 `projectSchema` 增加 `graphId/personalStyleId/contextId`，`createProjectSchema` 增加可选 `personalStyleId`。

## 3. 新增表

### 3.1 `artifacts`

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | ULID |
| workspace_id | text NN | |
| project_id | text NN | |
| kind | enum | `text`/`image`/`audio`/`video`/`collection`/`action` |
| role | text NN | 业务角色：topic/outline/script/cover/illustration/voice/draft/publish… |
| current_version_id | text nullable | → artifact_versions.id |
| created_by | text NN | |
| created_at / updated_at | int NN | |
| deleted_at | int nullable | 软删除（orphan GC） |

### 3.2 `artifact_versions`

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | ULID |
| artifact_id | text NN → artifacts.id | |
| version_number | int NN | 从 1 递增 |
| parent_version_id | text nullable | 版本链 |
| content_ref_type | enum nullable | `asset`/`inline` |
| content_ref_id | text nullable | → assets.id（媒体）或 inline 文本 |
| inline_text | text nullable | kind=text 且未走 asset 时的正文 |
| metadata_json | text NN default '{}' | prompt、模型、ratio 等 |
| source | enum | `ai`/`user`/`import`/`system` |
| operation_run_id | text nullable | → runs.id（AI 来源时的产生 Run） |
| created_by / created_at | | |

### 3.3 `canvas_nodes`

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | ULID |
| project_id | text NN | |
| artifact_id | text NN → artifacts.id | |
| x / y | real NN | 布局 |
| width / height | real nullable | |
| collapsed | boolean default false | |
| z_index | int default 0 | |
| renderer | text NN | 默认 `TextNode`/`ImageNode`… 由 kind 推断，留扩展 |
| created_at / updated_at | | |

### 3.4 `edges`

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | ULID |
| project_id | text NN | |
| source_artifact_id | text NN | |
| target_artifact_id | text NN | |
| input_slot | text NN | 输入语义：`topic`/`outline`/`script`/`visual`/`voice`… |
| created_at | | |

### 3.5 `runs`

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | ULID |
| workspace_id / project_id | text NN | |
| task_id | text NN unique → tasks.id | 执行层 |
| operation_id | text NN | → operations registry |
| source_artifact_id | text nullable | |
| input_version_ids_json | text NN default '[]' | |
| output_version_ids_json | text nullable | 完成后回填 |
| output_artifact_ids_json | text nullable | 完成后回填 |
| config_json | text NN default '{}' | Operation 配置 |
| created_at / updated_at | | |

**Run 状态**：由 `tasks.status` 派生（queued/running/waiting_review/completed/failed/cancelled）。UI 若需要 `waiting_input`，可给 `tasks.status` 枚举追加 `waiting_input`（Foundation 迁移）或 MVP 用 `waiting_review` 表达「需要用户确认」。

## 4. 领域实体（contracts）

```ts
// packages/contracts/src/artifacts.ts
type ArtifactKind = 'text' | 'image' | 'audio' | 'video' | 'collection' | 'action'
interface Artifact { id; projectId; kind: ArtifactKind; role: string; currentVersionId?: string; createdAt; updatedAt }
interface ArtifactVersion {
  id; artifactId; versionNumber; parentVersionId?: string;
  contentRef?: { type: 'asset'; id: string } | { type: 'inline'; text: string };
  metadata?: Record<string, unknown>;
  source: 'ai' | 'user' | 'import' | 'system'; operationRunId?: string; createdBy; createdAt
}

// packages/contracts/src/canvas.ts
interface CanvasNode { id; projectId; artifactId; x; y; width?; height?; collapsed?; zIndex?; renderer: string; updatedAt }
interface Edge { id; projectId; sourceArtifactId; targetArtifactId; inputSlot: string; createdAt }
interface Graph { nodes: CanvasNode[]; edges: Edge[] }

// packages/contracts/src/operations.ts
type OperationBehavior = 'create' | 'transform' | 'branch' | 'action'
type OperationOutputBehavior = 'new_artifact' | 'new_version' | 'new_collection' | 'side_effect'
interface OperationDefinition {
  id: string; label: string; description?: string;
  behavior: OperationBehavior;
  input: { kinds?: ArtifactKind[]; roles?: string[]; slots?: string[] };
  output?: { kind?: ArtifactKind; role?: string; behavior: OperationOutputBehavior };
  configSchema?: unknown; defaultConfig?: Record<string, unknown>;
  executor: string;
  presentation: { group: string; priority: number; icon?: string; placement: 'primary'|'secondary'|'more'; danger?: boolean };
  runtime?: { streaming?: boolean; cancellable?: boolean; retryable?: boolean; expectedDuration?: 'instant'|'short'|'medium'|'long' };
}

// packages/contracts/src/runs.ts
interface Run {
  id; projectId; taskId; operationId;
  sourceArtifactId?: string;
  inputVersionIds: string[]; outputVersionIds?: string[]; outputArtifactIds?: string[];
  status: 'queued'|'running'|'waiting_review'|'completed'|'failed'|'cancelled';
  progress?: number; config: Record<string, unknown>;
  error?: { code: string; message: string }; createdAt; updatedAt;
}
```

## 5. Version / Branch / Collection 规则（来源 §29）

- **新 Version**：`transform`（polish/rewrite/expand/shorten/manual_edit/upscale/inpaint…）→ 同一 Artifact 新 `artifact_versions`，`parent_version_id` 指向上代。
- **新 Node**：`create`（generate_outline/generate_script…）→ 新 Artifact + CanvasNode + Edge。
- **Branch**：`branch` → 基于当前版本新建并行 Artifact（复制 contentRef 或空），保留 parent 链。
- **Collection**：一次生成多候选 → `artifacts.kind='collection'`，candidates 存在 `metadata_json`（`candidateVersionIds[]`），`selectedVersionId` 记录选中。
- **恢复历史版本**：创建新 `current_version_id` 引用或 restore Version，不删历史链。

## 6. 迁移计划

单个迁移 `M0XXX_canvas_runtime.sql`：
1. `ALTER TABLE projects ADD COLUMN graph_id/context_id/personal_style_id`（可空）。
2. 建 `artifacts` / `artifact_versions` / `canvas_nodes` / `edges` / `runs` 表 + 索引（project_id、artifact_id、edge source/target）。
3. `runs.task_id` 建 unique 索引。
4. （可选）`ALTER TABLE tasks ADD COLUMN waiting_input` 状态——若 MVP 需要 `waiting_input`。

回滚：表可 DROP；列可 DROP（数据迁移前备份）。既有数据不受影响（全可空）。

## 7. 一致性

- 删除 Artifact：默认只删 CanvasNode；Artifact 无引用标记 `deleted_at`（orphan），延迟 GC。
- 用户明确「同时删除内容」→ soft delete artifact + 可选 asset。
- Artifact 与 CanvasNode 通过 `project_id + artifact_id` 强关联；Edge 引用的 artifact 必须同 project。