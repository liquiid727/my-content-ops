# Creator Studio 数据模型

> 本文是 [系统技术 SPEC](./spec.md) 的数据契约，描述 MVP 的 SQLite 持久化结构、约束与迁移规则。接口字段以 [API 契约](./api.md) 为准。

## 1. 数据存储约定

- 数据库：SQLite，访问层使用 Drizzle ORM。
- 数据库文件：`creator-studio/data/creator-studio.sqlite`。
- 文件内容：`creator-studio/data/files/`，数据库只记录相对路径和元数据。
- ID：所有业务主键使用 ULID，以 `TEXT` 保存。
- 时间：数据库使用 Unix epoch milliseconds 的 `INTEGER`；API 层统一转换为 ISO 8601 UTC 字符串。
- 布尔值：使用 `INTEGER NOT NULL`，值仅允许 `0` 或 `1`。
- JSON：字段名以 `_json` 结尾，写入前必须通过共享 Zod schema 校验。
- 命名：表名和列名使用 `snake_case`，TypeScript 模型使用 `camelCase`。
- 外键：每次连接启用 `PRAGMA foreign_keys = ON`；运行时启用 WAL 模式与合理的 `busy_timeout`。
- 删除：项目及其核心业务对象默认软删除；TaskEvent、迁移记录等审计数据不提供软删除。

## 2. 核心关系

```text
Workspace
├── CreatorProfile
├── Project
│   ├── Asset
│   ├── Task
│   │   └── TaskEvent
│   └── Version (polymorphic subject)
├── ProviderConfig
├── ConnectorConfig
│   └── SyncRecord
└── IdempotencyRecord
```

MVP 只有一个本地 Workspace，但所有核心表仍保留 `workspace_id`，避免后续引入多工作区时重写数据模型。

## 3. 表定义

### 3.1 `schema_migrations`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `version` | `TEXT` | PK | 迁移版本号，例如 `0001_foundation` |
| `checksum` | `TEXT` | NOT NULL | 迁移文件 SHA-256 |
| `applied_at` | `INTEGER` | NOT NULL | 应用时间 |

### 3.2 `workspaces`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | Workspace ULID |
| `name` | `TEXT` | NOT NULL | 默认 `My Studio` |
| `slug` | `TEXT` | NOT NULL, UNIQUE | 本地固定工作区标识 |
| `settings_json` | `TEXT` | NOT NULL, default `{}` | 非敏感工作区设置 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `updated_at` | `INTEGER` | NOT NULL | 更新时间 |

首次启动在事务中创建唯一的默认 Workspace；重复启动必须保持幂等。

### 3.3 `creator_profiles`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | Profile ULID |
| `workspace_id` | `TEXT` | FK → `workspaces.id`, NOT NULL | 所属工作区 |
| `display_name` | `TEXT` | NOT NULL | 创作者显示名 |
| `avatar_asset_id` | `TEXT` | nullable | 头像 Asset；Foundation 阶段允许为空 |
| `bio` | `TEXT` | NOT NULL, default `''` | 简介 |
| `preferences_json` | `TEXT` | NOT NULL, default `{}` | 主题等用户偏好 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `updated_at` | `INTEGER` | NOT NULL | 更新时间 |

约束：`UNIQUE(workspace_id)`，MVP 每个 Workspace 只有一个 CreatorProfile。

### 3.4 `projects`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | Project ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `title` | `TEXT` | NOT NULL | 项目名称 |
| `brief` | `TEXT` | NOT NULL, default `''` | 项目说明 |
| `status` | `TEXT` | NOT NULL | `draft` / `active` / `archived` |
| `content_type` | `TEXT` | NOT NULL, default `general` | 内容类型 |
| `target_platform` | `TEXT` | nullable | 目标发布平台 |
| `target_duration_ms` | `INTEGER` | nullable, CHECK > 0 | 目标时长 |
| `cover_asset_id` | `TEXT` | nullable | 封面 Asset |
| `settings_json` | `TEXT` | NOT NULL, default `{}` | 项目级参数 |
| `created_by` | `TEXT` | FK → `creator_profiles.id`, NOT NULL | 创建者 |
| `revision` | `INTEGER` | NOT NULL, default `1` | 乐观并发版本 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `updated_at` | `INTEGER` | NOT NULL | 更新时间 |
| `deleted_at` | `INTEGER` | nullable | 软删除时间 |

索引：

- `INDEX(workspace_id, updated_at DESC)`：项目列表。
- `INDEX(workspace_id, status, updated_at DESC)`：状态筛选。
- `INDEX(workspace_id, deleted_at)`：排除已删除数据。

项目的创作阶段与进度由相关 Task、Asset 和领域对象实时计算，不存储为可漂移的冗余字段。

### 3.5 `assets`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | Asset ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `project_id` | `TEXT` | FK → `projects.id`, nullable | 可归属于项目 |
| `kind` | `TEXT` | NOT NULL | `image` / `audio` / `video` / `document` / `other` |
| `source` | `TEXT` | NOT NULL | `upload` / `generated` / `imported` |
| `display_name` | `TEXT` | NOT NULL | 用户可见名称 |
| `mime_type` | `TEXT` | NOT NULL | MIME 类型 |
| `size_bytes` | `INTEGER` | NOT NULL, CHECK ≥ 0 | 文件大小 |
| `storage_path` | `TEXT` | NOT NULL, UNIQUE | 相对 `data/files` 的路径 |
| `sha256` | `TEXT` | NOT NULL | 内容摘要 |
| `width` | `INTEGER` | nullable | 图像/视频宽度 |
| `height` | `INTEGER` | nullable | 图像/视频高度 |
| `duration_ms` | `INTEGER` | nullable | 音视频时长 |
| `metadata_json` | `TEXT` | NOT NULL, default `{}` | 类型相关元数据 |
| `created_by` | `TEXT` | FK, NOT NULL | 创建者 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `updated_at` | `INTEGER` | NOT NULL | 更新时间 |
| `deleted_at` | `INTEGER` | nullable | 软删除时间 |

索引：`INDEX(project_id, kind, created_at DESC)`、`INDEX(workspace_id, sha256)`。

文件写入使用“两阶段提交”：先写入临时文件并计算摘要，再在事务中插入记录，最后原子移动到目标路径；数据库失败时清理临时文件。

### 3.6 `versions`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | Version ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `project_id` | `TEXT` | FK, NOT NULL | 所属项目 |
| `subject_type` | `TEXT` | NOT NULL | `idea` / `topic` / `script` / `rhythm_plan` / `shot` / `asset` |
| `subject_id` | `TEXT` | NOT NULL | 被版本化对象 ID |
| `version_number` | `INTEGER` | NOT NULL, CHECK > 0 | 对象内递增版本号 |
| `snapshot_json` | `TEXT` | NOT NULL | 完整、可恢复的快照 |
| `change_summary` | `TEXT` | NOT NULL, default `''` | 修改摘要 |
| `is_current` | `INTEGER` | NOT NULL, CHECK IN (0,1) | 当前版本标记 |
| `created_by` | `TEXT` | FK, NOT NULL | 创建者 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |

约束与索引：

- `UNIQUE(workspace_id, subject_type, subject_id, version_number)`。
- 部分唯一索引确保每个对象最多一个 `is_current = 1`。
- `INDEX(project_id, subject_type, created_at DESC)`。

恢复旧版本不会覆盖历史记录，而是复制快照生成一个新的当前版本。切换当前版本必须在单一事务中完成。

### 3.7 `tasks`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | Task ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `project_id` | `TEXT` | FK, nullable | 所属项目 |
| `parent_task_id` | `TEXT` | FK → `tasks.id`, nullable | Retry 来源 Task |
| `type` | `TEXT` | NOT NULL | 注册的任务类型 |
| `status` | `TEXT` | NOT NULL | `queued` / `running` / `waiting_review` / `completed` / `failed` / `cancelled` |
| `progress` | `INTEGER` | NOT NULL, default `0`, CHECK 0..100 | 进度 |
| `input_json` | `TEXT` | NOT NULL | 已校验输入 |
| `output_json` | `TEXT` | nullable | 成功或待审核输出摘要 |
| `result_ref_type` | `TEXT` | nullable | 结果对象类型 |
| `result_ref_id` | `TEXT` | nullable | 结果对象 ID |
| `error_code` | `TEXT` | nullable | 稳定错误码 |
| `error_message` | `TEXT` | nullable | 用户可理解错误信息 |
| `attempt_count` | `INTEGER` | NOT NULL, default `0` | 已执行次数 |
| `max_attempts` | `INTEGER` | NOT NULL, default `1` | 最大执行次数 |
| `idempotency_key` | `TEXT` | nullable | 请求幂等键 |
| `created_by` | `TEXT` | FK, NOT NULL | 创建者 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `started_at` | `INTEGER` | nullable | 开始时间 |
| `finished_at` | `INTEGER` | nullable | 结束时间 |
| `updated_at` | `INTEGER` | NOT NULL | 更新时间 |

索引：

- `INDEX(workspace_id, status, created_at)`：启动恢复和队列拉取。
- `INDEX(project_id, created_at DESC)`：项目活动流。
- `UNIQUE(workspace_id, idempotency_key)`，仅对非空值生效。

状态约束由 Task Runtime 在事务中执行；数据库层使用 `CHECK` 限定状态集合。进程异常退出后，启动恢复器将残留 `running` 任务重新置为 `queued` 或标记为可重试失败，具体依据任务处理器的 `recoverable` 声明。

### 3.8 `task_events`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `INTEGER` | PK AUTOINCREMENT | SSE 可续传事件序号 |
| `task_id` | `TEXT` | FK → `tasks.id`, NOT NULL | 所属任务 |
| `event_type` | `TEXT` | NOT NULL | `created` / `started` / `progress` / `waiting_review` / `completed` / `failed` / `cancelled` |
| `payload_json` | `TEXT` | NOT NULL | 事件负载 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |

索引：`INDEX(task_id, id)`。SSE 的 `id` 直接使用该表主键，客户端通过 `Last-Event-ID` 续传。

### 3.9 `generations`

用于统一记录模型调用，与具体 Provider 解耦。

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | Generation ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `project_id` | `TEXT` | FK, nullable | 所属项目 |
| `task_id` | `TEXT` | FK, NOT NULL | 触发任务 |
| `provider_key` | `TEXT` | NOT NULL | Provider 注册键 |
| `model` | `TEXT` | NOT NULL | 模型标识 |
| `request_json` | `TEXT` | NOT NULL | 脱敏后的请求参数 |
| `response_json` | `TEXT` | nullable | 脱敏后的响应摘要 |
| `usage_json` | `TEXT` | nullable | Token、图像等用量 |
| `latency_ms` | `INTEGER` | nullable | 调用耗时 |
| `status` | `TEXT` | NOT NULL | `running` / `completed` / `failed` |
| `error_code` | `TEXT` | nullable | Provider 映射后的错误码 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `finished_at` | `INTEGER` | nullable | 完成时间 |

禁止写入 API Key、完整 Authorization header 或其他凭据。

### 3.10 `provider_configs`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | 配置 ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `provider_key` | `TEXT` | NOT NULL | Provider 注册键 |
| `display_name` | `TEXT` | NOT NULL | 显示名称 |
| `config_json` | `TEXT` | NOT NULL | 不含凭据的参数 |
| `secret_ref` | `TEXT` | nullable | 本地 secret store 引用 |
| `enabled` | `INTEGER` | NOT NULL, default `1` | 是否启用 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `updated_at` | `INTEGER` | NOT NULL | 更新时间 |

约束：`UNIQUE(workspace_id, provider_key)`。

### 3.11 `connector_configs`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | 配置 ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `connector_key` | `TEXT` | NOT NULL | `lark_cli` / `obsidian` |
| `display_name` | `TEXT` | NOT NULL | 显示名称 |
| `config_json` | `TEXT` | NOT NULL | Vault 路径、CLI 参数等非凭据配置 |
| `secret_ref` | `TEXT` | nullable | 本地 secret store 引用 |
| `enabled` | `INTEGER` | NOT NULL, default `0` | 是否启用 |
| `last_checked_at` | `INTEGER` | nullable | 最近检查时间 |
| `last_check_status` | `TEXT` | nullable | `ok` / `error` |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `updated_at` | `INTEGER` | NOT NULL | 更新时间 |

约束：`UNIQUE(workspace_id, connector_key)`。绝对路径可以通过设置接口返回，但不得出现在通用日志、Task 输出或导出文件中。

### 3.12 `sync_records`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | 同步记录 ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `project_id` | `TEXT` | FK, nullable | 所属项目 |
| `connector_config_id` | `TEXT` | FK, NOT NULL | Connector 配置 |
| `local_ref_type` | `TEXT` | NOT NULL | 本地对象类型 |
| `local_ref_id` | `TEXT` | NOT NULL | 本地对象 ID |
| `remote_ref` | `TEXT` | NOT NULL | Lark 文档 ID 或 Vault 相对路径 |
| `direction` | `TEXT` | NOT NULL | `import` / `export` |
| `content_hash` | `TEXT` | nullable | 同步内容摘要 |
| `status` | `TEXT` | NOT NULL | `running` / `completed` / `failed` |
| `error_message` | `TEXT` | nullable | 失败说明 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |
| `finished_at` | `INTEGER` | nullable | 完成时间 |

索引：`INDEX(connector_config_id, created_at DESC)`、`INDEX(local_ref_type, local_ref_id)`。

### 3.13 `idempotency_records`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TEXT` | PK | 记录 ULID |
| `workspace_id` | `TEXT` | FK, NOT NULL | 所属工作区 |
| `key` | `TEXT` | NOT NULL | 客户端幂等键 |
| `request_hash` | `TEXT` | NOT NULL | 方法、路径和请求体摘要 |
| `response_status` | `INTEGER` | nullable | 已完成响应状态 |
| `response_json` | `TEXT` | nullable | 已完成响应 |
| `resource_type` | `TEXT` | nullable | 创建的资源类型 |
| `resource_id` | `TEXT` | nullable | 创建的资源 ID |
| `expires_at` | `INTEGER` | NOT NULL | 到期时间 |
| `created_at` | `INTEGER` | NOT NULL | 创建时间 |

约束：`UNIQUE(workspace_id, key)`。相同 key 但不同 `request_hash` 返回 `409 IDEMPOTENCY_KEY_REUSED`。

## 4. 本地文件与凭据

```text
creator-studio/data/
├── creator-studio.sqlite
├── creator-studio.sqlite-wal
├── creator-studio.sqlite-shm
├── files/
│   ├── assets/<asset-id>/<original-name>
│   └── generated/<yyyy>/<mm>/<asset-id>.<ext>
└── secrets.json
```

- `storage_path` 必须是规范化相对路径；拒绝 `..`、绝对路径和符号链接逃逸。
- 上传文件名仅用于展示，实际目录由 Asset ID 决定。
- `secrets.json` 由服务端创建为 `0600`，只保存 Provider/Connector 凭据；MVP 接受“未加密但仅本机用户可读”的限制。
- API 的读取响应只返回 `hasSecret: boolean`，不返回凭据值。
- 删除 Asset 时先软删除数据库记录；垃圾回收任务在确认无 Version 或其他对象引用后再删除物理文件。

## 5. 事务边界

以下操作必须是单一数据库事务：

1. 创建 Task 与首条 `created` TaskEvent。
2. Task 状态变更与对应 TaskEvent 追加。
3. 创建新 Version、撤销旧 `is_current`、设置新当前版本。
4. 创建默认 Workspace 与 CreatorProfile。
5. 项目软删除及其仍在运行 Task 的取消请求。

文件系统无法参与 SQLite 事务，因此 Asset 使用临时文件、原子移动和补偿清理保证最终一致性。

## 6. 迁移与备份

- 迁移只允许向前执行，应用启动前自动检查并执行尚未应用的迁移。
- 已应用迁移的 checksum 不一致时拒绝启动，避免静默修改历史。
- 破坏性迁移前复制数据库到 `data/backups/<timestamp>-creator-studio.sqlite`。
- Foundation 首个迁移创建 Workspace、Profile、Project、Asset、Version、Task、TaskEvent、Generation、ProviderConfig、ConnectorConfig、SyncRecord 和 IdempotencyRecord。
- 后续创作阶段对象以独立迁移加入，不修改 Foundation 迁移文件。

## 7. 仓储接口边界

业务模块不得直接依赖 Drizzle 查询对象。服务端提供以下最小仓储接口：

```ts
interface ProjectRepository {
  list(input: ProjectListQuery): Promise<Page<ProjectRecord>>;
  getById(id: string): Promise<ProjectRecord | null>;
  create(input: NewProjectRecord): Promise<ProjectRecord>;
  update(id: string, revision: number, patch: ProjectPatch): Promise<ProjectRecord>;
  softDelete(id: string, revision: number): Promise<void>;
}

interface TaskRepository {
  enqueue(input: NewTaskRecord): Promise<TaskRecord>;
  claimNext(): Promise<TaskRecord | null>;
  transition(input: TaskTransition): Promise<TaskRecord>;
  appendEvent(input: NewTaskEvent): Promise<TaskEventRecord>;
  listEventsAfter(taskId: string, eventId: number): Promise<TaskEventRecord[]>;
}
```

Asset、Version、ProviderConfig 和 ConnectorConfig 采用同样的模块内仓储边界。这样测试可使用临时 SQLite 数据库，也能在未来替换存储实现而不改动业务层。
