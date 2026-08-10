# [Foundation] FND-03：实现 SQLite、Drizzle 迁移与仓储基础层

## Description

按数据模型建立 SQLite 数据库、迁移器、事务工具与模块化 Repository。为测试提供临时数据库工厂，不允许业务模块直接散落 Drizzle 查询。

## Acceptance Criteria

- [x] 首个迁移创建 `data-model.md` §3 定义的所有 Foundation 表、索引、外键和 CHECK 约束。
- [x] 启动时启用 foreign keys、WAL 和 busy timeout，并自动执行未应用迁移。
- [x] 已应用迁移 checksum 改变时拒绝启动并返回明确错误。
- [x] 默认数据目录和数据库文件可自动创建；不可写时快速失败。
- [x] 实现 Workspace、Project、Asset、Version、Task、Config 和 Idempotency Repository 的最小接口。
- [x] Repository 更新使用 revision；Version 当前标记与 Task 状态事件使用事务。
- [x] 单元/集成测试使用独立临时目录，结束后不残留数据。

## Dependencies

- [FND-01](./issue-001-creator-studio-scaffold.md)
- [FND-02](./issue-002-shared-contracts-http.md)

## Type

backend

## Priority

high

## SPEC Reference

- `specs/000-system/data-model.md` 全文
- `specs/000-system/acceptance.md` FND-004、FND-005、FND-027、FND-029

## Implementation Notes

### 主要修改

- 新增 `0001_foundation.sql`，创建 schema_migrations、Workspace/Profile、Project、Asset、Version、Task/Event、Generation、Provider/Connector、SyncRecord 和 IdempotencyRecord 全部 Foundation 表及其索引、外键和 CHECK。
- 建立 checksum 迁移器；启动时校验历史迁移、自动应用新迁移，并配置 `foreign_keys=ON`、WAL 和 5000ms busy timeout。
- 建立 Drizzle schema、数据库打开/关闭生命周期、默认 `data/` 与 `data/files/` 初始化，以及自动清理的临时数据库工厂。
- 实现 Workspace、Project、Asset、Version、Task、Config、Idempotency Repository；JSON 字段写入前通过共享 Zod JSON schema 校验。
- Server 启动前完成数据库与迁移初始化，成功后 health 将 database/migrations 报告为 ready；SIGINT/SIGTERM 关闭监听器和数据库连接。

### 关键设计决定

- SQL migration 是数据库约束的唯一历史事实，Drizzle schema 负责类型安全查询；不使用自动生成器修改已发布 migration。
- migration runner 自行记录 SHA-256，既拒绝已应用文件被修改，也拒绝数据库引用本地已缺失的历史 migration。
- Project Repository 在单条 `WHERE id AND revision` 更新中递增 revision；失败后读取当前 revision，向上层暴露领域冲突而不依赖 HTTP。
- Version 当前标记切换、Workspace/Profile 初始化、Task 创建/首事件和 Task 状态/事件均在单一 SQLite 事务中执行。
- 测试数据库始终使用 `mkdtemp` 独立文件目录并通过 `finally` 清理，不使用共享开发数据库或内存连接掩盖 WAL/文件行为。

### 测试命令与结果

- `npm run typecheck`：通过，contracts/web/server 均无类型错误。
- `npm run lint`：通过，0 warning。
- `npm test`：通过，6 个测试文件、35 个测试全部通过。
- `npm run build`：通过，contracts、Vite Web 与 Hono Server 均成功构建。
- 数据库专项测试：9 项通过，覆盖表/索引、FK/CHECK、PRAGMA、单次迁移、checksum 篡改拒绝、目录创建/失败、临时目录清理和 Repository 事务。
- 生产启动冒烟：临时 `CREATOR_STUDIO_DATA_DIR` 自动创建 sqlite/WAL/files，`/api/v1/health` 返回 database/migrations ready，SIGTERM 后端口释放并清理临时目录。
- review-it：审查 clean，无可执行问题。

### 未解决问题

- 无本 Issue 阻塞项。默认 Workspace/Profile 内容、身份会话和 bootstrap API 由 FND-004 实现。
