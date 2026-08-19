# SPEC 03: Canvas Runtime — API 契约

> 来源：`.prd` + `02-data-model` + 来源文档 §41-§44
> 基线：Foundation `/api/v1` REST + 错误 envelope + `revision` 乐观并发 + SSE
> 状态：待评审

## 1. 约定

- 前缀 `/api/v1`，错误沿用 Foundation envelope（`code/message/details`）。
- 写操作沿用 revision 乐观并发（涉及 Artifact 内容时）。
- SSE 事件经 Foundation Task SSE 通道扩展，新增 canvas/artifact/run 事件类型。
- 幂等：创建 Run 必须带 `idempotencyKey`（Foundation idempotency 中间件）。

## 2. Endpoints

### 2.1 Graph / Canvas

| Method | Path | Desc | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/api/v1/projects/:id/graph` | 取整图（nodes+edges） | — | 200 `{ nodes, edges }` |
| POST | `/api/v1/projects/:id/nodes` | 创建 CanvasNode（绑定已有 artifact 或新建） | `{ artifactId?, kind?, role?, x, y }` | 201 `{ node, artifact? }` |
| PATCH | `/api/v1/nodes/:id` | 移动/改布局/折叠 | `{ x?, y?, width?, height?, collapsed?, zIndex? }` | 200 node |
| DELETE | `/api/v1/nodes/:id` | 删除表现实体（artifact 变 orphan） | — | 204 |
| POST | `/api/v1/edges` | 建 Edge | `{ sourceArtifactId, targetArtifactId, inputSlot }` | 201 edge |
| DELETE | `/api/v1/edges/:id` | 删 Edge | — | 204 |

### 2.2 Artifact / Version

| Method | Path | Desc | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/api/v1/artifacts/:id` | Artifact 摘要 + 当前版本摘要 | — | 200 artifact |
| GET | `/api/v1/artifacts/:id/versions` | 版本列表（分页/游标） | `?cursor&limit` | 200 list |
| GET | `/api/v1/artifact-versions/:id` | 版本详情（content） | — | 200 version |
| POST | `/api/v1/artifacts/:id/versions/restore` | 恢复历史版本为 current | `{ versionId }` | 200 |
| PATCH | `/api/v1/artifacts/:id` | 手动编辑当前内容 → 新 Version(source=user) | revisionedPatch | 200 |

### 2.3 Operations / Runs

| Method | Path | Desc | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/api/v1/artifacts/:id/operations` | Registry 计算可执行 Operation | — | 200 `OperationDefinition[]` |
| POST | `/api/v1/operations/:operationId/runs` | 创建 Run（async） | `{ projectId, sourceArtifactId?, inputVersionIds?, config?, idempotencyKey }` | 202 `{ runId, status }` |
| GET | `/api/v1/runs/:id` | Run 详情（含 task 派生状态） | — | 200 run |
| POST | `/api/v1/runs/:id/cancel` | 取消 | — | 200 `{ status: 'cancelled' }` |
| POST | `/api/v1/runs/:id/retry` | 重试（新 Run） | `{ idempotencyKey }` | 202 new run |

### 2.4 Context

| Method | Path | Desc | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/api/v1/projects/:id/context` | 组装好的 AI 上下文（分层，见 04-runtime） | `?scope=script` | 200 `{ layers, text }` |

## 3. 请求/响应示例

**创建 Run：**
```json
POST /api/v1/operations/generate_outline/runs
{
  "projectId": "p_1",
  "sourceArtifactId": "artifact_topic_1",
  "inputVersionIds": ["v_topic_3"],
  "config": { "length": "medium", "style": "structured" },
  "idempotencyKey": "k_abc"
}
// 202
{ "runId": "run_1", "status": "queued", "taskId": "task_1" }
```

**完成事件（SSE）：**
```json
{ "type": "run.completed", "runId": "run_1", "taskId": "task_1",
  "outputArtifactIds": ["artifact_outline_1"], "outputVersionIds": ["v_outline_1"] }
```

前端依据 `operation.output.behavior` 决定：`new_artifact` → 建节点+edge；`new_version` → 更新同节点；`new_collection` → 建 Collection 节点；`side_effect` → 展示副作用结果。

## 4. SSE 事件类型（扩展 Foundation task 事件）

来源 §41 全部保留语义，前缀归并：

```
run.created / run.started / run.progress / run.completed / run.failed / run.cancelled
artifact.created / artifact.updated / artifact.version.created
node.created / node.updated / node.deleted
edge.created / edge.deleted
stream.reset
```

实现：复用 `/api/v1/tasks/events` SSE 通道，事件 payload 增加 `runId/artifactIds/nodeIds` 关联字段；或新增 `/api/v1/projects/:id/events` 按 project 过滤（推荐，前端订阅当前 project）。

## 5. 错误码（本 feature 新增）

| code | HTTP | 条件 |
|---|---|---|
| `ARTIFACT_NOT_FOUND` | 404 | artifact 不存在 |
| `OPERATION_NOT_AVAILABLE` | 422 | 对当前 artifact 的 kind/role 不可执行该 operation |
| `OPERATION_INPUT_REQUIRED` | 400 | 缺少必填 input slot |
| `RUN_ALREADY_CANCELLED` | 409 | 已取消的 Run 重复 cancel |
| `EDGE_CYCLE` | 400 | Edge 造成环（MVP 若禁止环） |
| `NODE_NOT_FOUND` / `EDGE_NOT_FOUND` | 404 | 不存在 |
| `REVISION_CONFLICT` | 409 | 沿用 Foundation |

## 6. 分页/游标

版本列表与 Run 列表用 Foundation pagination 约定（cursor + limit，稳定排序）。画布 graph 全量返回（MVP 单 project 节点量级可承受；1000+ 时再加增量拉取）。

## 7. 兼容性

- 全部新增端点，无既有端点破坏。
- Project 响应新增 `graphId/personalStyleId/contextId` 字段（可空，向后兼容）。
- `tasks.status` 若追加 `waiting_input` 属 Foundation 迁移，需同步更新 contracts/UI 映射（见 02 §3.5）。