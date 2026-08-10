# SPEC 000：HTTP 与事件 Contract

> 总体设计：[`spec.md`](./spec.md)  
> 数据模型：[`data-model.md`](./data-model.md)  
> 状态：待评审

## 1. Contract 原则

- Base URL：`/api/v1`。
- JSON 字段使用 `camelCase`；SQLite 字段使用 `snake_case`，转换由 Server Module 完成。
- 所有输入和输出通过 `shared/contracts` 的 Zod schema 校验。
- 时间使用 UTC ISO 8601；时长使用毫秒；文件大小使用 byte。
- ID 使用 ULID 字符串，不向调用方暴露数据库自增 ID。
- 列表使用 cursor pagination，不使用随数据变化漂移的 page number。
- 创建 Task 的接口快速返回 `202 Accepted`，不能保持 HTTP 连接等待模型完成。

## 2. 响应格式

### 2.1 成功

```json
{
  "data": {},
  "meta": {
    "requestId": "01J..."
  }
}
```

列表：

```json
{
  "data": [],
  "meta": {
    "requestId": "01J...",
    "nextCursor": "01J...",
    "hasMore": true
  }
}
```

### 2.2 错误

```json
{
  "error": {
    "code": "PROJECT_REVISION_CONFLICT",
    "message": "项目已在其他位置更新，请刷新后重试。",
    "retryable": false,
    "details": {
      "currentRevision": 8
    }
  },
  "meta": {
    "requestId": "01J..."
  }
}
```

`message` 可以直接显示给用户，但不能包含 Secret、绝对文件路径、供应商原始响应和调用栈。

## 3. 通用参数

### 3.1 Pagination

| 参数 | 类型 | 默认 | 限制 |
| --- | --- | --- | --- |
| `cursor` | string | 无 | 上一次响应的 `nextCursor` |
| `limit` | integer | 30 | 1–100 |

### 3.2 乐观并发

可编辑实体包含 `revision`。更新请求必须提交当前 revision：

```json
{
  "revision": 7,
  "patch": {
    "title": "新的项目标题"
  }
}
```

revision 不匹配返回 `409 PROJECT_REVISION_CONFLICT`，Server 不覆盖新数据。

### 3.3 Idempotency

可能重复提交的创建请求支持：

```http
Idempotency-Key: <client generated ULID>
```

同一 Workspace、endpoint 和 key 在 24 小时内返回第一次请求的结果。Task 创建、Connector 写入和 Video Render 必须支持该 Header。

## 4. Bootstrap 与 Workspace

### `GET /api/v1/health`

不读取业务数据，用于启动探测。

```json
{
  "data": {
    "status": "ok",
    "version": "0.1.0",
    "database": "ready"
  },
  "meta": { "requestId": "01J..." }
}
```

### `GET /api/v1/bootstrap`

返回首屏所需的最小结构数据：

```json
{
  "data": {
    "workspace": {
      "id": "01J...",
      "name": "个人创作空间"
    },
    "creatorProfile": {
      "id": "01J...",
      "displayName": "创作者"
    },
    "activeTasks": [],
    "capabilities": {
      "connectors": false,
      "providers": false
    }
  },
  "meta": { "requestId": "01J..." }
}
```

首次启动时 Server 在 transaction 中创建默认 Workspace 和 Creator Profile。

## 5. Project

### Endpoint

| Method | Path | 说明 | 状态码 |
| --- | --- | --- | --- |
| GET | `/projects` | 查询 Project | 200 |
| POST | `/projects` | 创建 Project | 201 |
| GET | `/projects/:projectId` | Project 详情 | 200 |
| PATCH | `/projects/:projectId` | 更新 Project | 200 |
| POST | `/projects/:projectId/archive` | 归档 Project | 200 |
| GET | `/projects/:projectId/overview` | Project Overview 聚合数据 | 200 |

### 创建 Project

```json
{
  "title": "普通人如何搭建第一个 AI Agent",
  "contentType": "short_video",
  "targetPlatform": "douyin",
  "targetDurationMs": 60000,
  "brief": "面向 AI 入门创作者的 60 秒口播视频"
}
```

必填：`title`、`contentType`。`title` 1–160 字符；`brief` 最大 5000 字符；`targetDurationMs` 为 1000–3,600,000。

### Project Response

```json
{
  "id": "01J...",
  "workspaceId": "01J...",
  "title": "普通人如何搭建第一个 AI Agent",
  "status": "draft",
  "stage": "idea",
  "contentType": "short_video",
  "targetPlatform": "douyin",
  "targetDurationMs": 60000,
  "brief": "面向 AI 入门创作者的 60 秒口播视频",
  "revision": 1,
  "createdAt": "2026-08-09T09:00:00.000Z",
  "updatedAt": "2026-08-09T09:00:00.000Z"
}
```

### Overview Response

```json
{
  "project": {},
  "pipeline": [
    { "stage": "idea", "status": "completed", "resultRef": null },
    { "stage": "script", "status": "not_started", "resultRef": null }
  ],
  "activeTasks": [],
  "latestAssets": [],
  "latestVersions": [],
  "nextAction": {
    "type": "generate_topics",
    "label": "生成选题方向"
  }
}
```

`stage` 和 `nextAction` 由 Project Module 根据现有结果计算，前端不能提交任意进度百分比覆盖它们。

## 6. Asset

| Method | Path | 说明 | 状态码 |
| --- | --- | --- | --- |
| GET | `/assets` | 按类型、Project、标签查询 | 200 |
| POST | `/assets/upload` | multipart 上传文件 | 201 |
| GET | `/assets/:assetId` | Asset 元数据 | 200 |
| GET | `/assets/:assetId/content` | 读取文件或 Range stream | 200/206 |
| DELETE | `/assets/:assetId` | 标记删除未引用 Asset | 204 |

上传限制：

- 默认单文件最大 200 MB，可通过本地设置调低，不能由浏览器调高。
- MIME 与文件签名不一致时拒绝。
- 文件写入完成并校验 hash 后才创建 Asset 记录。
- Asset response 只返回相对内容 URL，不返回本地绝对路径。

```json
{
  "id": "01J...",
  "projectId": "01J...",
  "type": "image",
  "name": "cover-reference.png",
  "mimeType": "image/png",
  "size": 483920,
  "width": 1080,
  "height": 1440,
  "durationMs": null,
  "contentUrl": "/api/v1/assets/01J.../content",
  "thumbnailUrl": "/api/v1/assets/01J.../thumbnail",
  "createdAt": "2026-08-09T09:00:00.000Z"
}
```

## 7. Version

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/projects/:projectId/versions` | 查询版本，支持 subjectType 筛选 |
| GET | `/versions/:versionId` | 读取结构化快照 |
| POST | `/versions/:versionId/restore` | 从旧版本创建新 current Version |

Restore 必须提供 `Idempotency-Key`。恢复不会修改旧 Version，也不会删除当前 Version。

## 8. Task

### Endpoint

| Method | Path | 说明 | 状态码 |
| --- | --- | --- | --- |
| GET | `/tasks` | 查询 Task，支持 active/project/type | 200 |
| POST | `/tasks` | 创建 Task | 202 |
| GET | `/tasks/:taskId` | Task 详情 | 200 |
| POST | `/tasks/:taskId/retry` | 创建 retry Task | 202 |
| POST | `/tasks/:taskId/cancel` | 请求取消 | 202/409 |
| GET | `/task-events` | SSE 事件流 | 200 |

### 创建 Task

```json
{
  "projectId": "01J...",
  "type": "script_generation",
  "input": {
    "topicId": "01J...",
    "targetDurationMs": 60000
  }
}
```

Task type 对应独立 Zod input schema。不能接受无约束的任意 JSON 后直接传给 Provider。

### Task Response

```json
{
  "id": "01J...",
  "projectId": "01J...",
  "type": "script_generation",
  "status": "queued",
  "progress": 0,
  "resultRef": null,
  "parentTaskId": null,
  "retryCount": 0,
  "error": null,
  "createdAt": "2026-08-09T09:00:00.000Z",
  "startedAt": null,
  "finishedAt": null
}
```

### SSE

```http
GET /api/v1/task-events?projectId=<optional>
Accept: text/event-stream
Last-Event-ID: 1242
```

```text
id: 1243
event: task.updated
data: {"taskId":"01J...","status":"running","progress":35,"occurredAt":"..."}
```

事件类型：

- `task.created`
- `task.updated`
- `task.completed`
- `task.failed`
- `task.cancelled`
- `stream.reset`

Server 根据 `Last-Event-ID` 补发保留期内事件。事件已清理或 cursor 不存在时发送 `stream.reset`，前端重新查询 active Task。

Task Event 默认保留 7 天。Server 每 15 秒发送 SSE comment heartbeat。

### Cancel

- queued Task 可直接进入 `cancelled`。
- running Task 触发 AbortSignal；Provider 不支持取消时保持 `running`，最终结果到达后根据 cancel request 丢弃生成结果并进入 `cancelled`。
- 终态 Task 返回 `409 TASK_ALREADY_FINISHED`。

## 9. Provider 配置

Foundation 只要求 Provider Interface、Seed Adapter 和配置列表，不要求真实模型连接。

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/providers` | 返回 capability、masked config 和状态 |
| POST | `/providers/:providerId/test` | 创建 provider_test Task |
| PATCH | `/providers/:providerId` | 更新 Server 侧配置 |

Secret 字段写入后不再返回，只返回 `configured: true` 和 masked hint。

## 10. Connector 配置

Connector 完整行为由后续 SPEC 定义，总体 Contract 预留：

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/connectors` | Connector 列表与状态 |
| POST | `/connectors/:type` | 创建配置 |
| PATCH | `/connectors/:connectorId` | 更新配置 |
| POST | `/connectors/:connectorId/test` | 创建 connector_test Task |
| POST | `/connectors/:connectorId/import` | 创建 import Task |
| POST | `/connectors/:connectorId/export` | 创建 export Task |
| GET | `/connectors/:connectorId/sync-records` | 同步日志 |

Foundation 设置页可以显示未配置状态；不得使用假连接结果。

## 11. Error Taxonomy

| Code | HTTP | Retryable | 条件 |
| --- | --- | --- | --- |
| `VALIDATION_FAILED` | 400 | false | Zod 校验失败 |
| `RESOURCE_NOT_FOUND` | 404 | false | Workspace 内不存在或不可见 |
| `PROJECT_REVISION_CONFLICT` | 409 | false | 乐观并发冲突 |
| `TASK_ALREADY_FINISHED` | 409 | false | 对终态 Task cancel/retry 不合法 |
| `TASK_TYPE_UNSUPPORTED` | 422 | false | 未注册 Task handler |
| `ASSET_IN_USE` | 409 | false | 删除仍被版本或镜头引用的 Asset |
| `FILE_TOO_LARGE` | 413 | false | 超过 Server 限制 |
| `FILE_TYPE_UNSUPPORTED` | 415 | false | MIME/签名不支持 |
| `PROVIDER_UNAVAILABLE` | 503 | true | Provider 未配置或暂时不可用 |
| `PROVIDER_RATE_LIMITED` | 429 | true | Provider 限流 |
| `CONNECTOR_UNAVAILABLE` | 503 | true | CLI、Vault 或认证不可用 |
| `CONNECTOR_PATH_DENIED` | 403 | false | 路径不在允许范围 |
| `INTERNAL_ERROR` | 500 | false | 未分类错误 |

## 12. HTTP 安全与限制

- Server 仅接受预期 Host 和 Origin。
- 除 `/health` 外，所有 `/api/v1` 请求必须包含 Server 启动时生成的 same-origin session cookie；cookie 为 `HttpOnly`、`SameSite=Strict`。
- 修改类请求校验 `Origin`，不提供通配 CORS。
- JSON body 默认上限 2 MB；multipart 单独按 Asset 规则限制。
- 静态文件和 Asset content 设置 `X-Content-Type-Options: nosniff`。
- 日志记录 method、route、status、duration、requestId，不记录完整 prompt、Secret 和文件正文。
