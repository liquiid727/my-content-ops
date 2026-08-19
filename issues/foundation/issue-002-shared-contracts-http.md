# [Foundation] FND-02：建立共享契约、HTTP 内核与错误模型

## Description

实现前后端共用的 Zod schema、ULID、时间序列化、分页、成功/错误 envelope、request ID 与 Hono 中间件。所有后续领域 API 必须通过这层注册。

## Acceptance Criteria

- [x] `packages/contracts` 不依赖浏览器、Node 文件系统或数据库实现。
- [x] 定义公共 ID、ISO 时间、游标分页、错误 envelope 与字段级校验错误 schema。
- [x] Hono 中间件提供 request ID、JSON 错误映射、404 和脱敏 500。
- [x] `/api/v1/health` 使用共享响应 schema，并区分 ready/unhealthy 状态。
- [x] 写接口支持 `Idempotency-Key` 的协议解析；持久化在 FND-03 接入。
- [x] 更新请求统一携带 `revision`，冲突映射为 `409 PROJECT_REVISION_CONFLICT`。
- [x] 契约测试覆盖合法响应、无效输入、404、500、冲突与幂等 key 复用。

## Dependencies

- [FND-01](./issue-001-creator-studio-scaffold.md)

## Type

fullstack

## Priority

high

## SPEC Reference

- `specs/000-system/api.md` §1～§3、§10～§12
- `specs/000-system/acceptance.md` FND-012、FND-014～FND-017

## Implementation Notes

### 主要修改

- 在 `packages/contracts` 增加 ULID、UTC ISO 时间、游标分页、revision、幂等 key、成功/列表/错误 envelope、字段级校验错误与 health Zod schema。
- 在 Server 增加统一 `/api/v1` Hono 内核、ULID request ID、JSON 404、已知错误映射、脱敏 500、字段校验转换和 `nosniff` 响应头。
- 新增 `/api/v1/health`，由可注入探针汇报 database/migrations；未接入 FND-03 时默认返回 503 unhealthy，不伪报健康。
- 增加纯协议级幂等解析与 replay/reuse 判定；持久化查询和 24 小时记录由 FND-03 Repository 接入。
- 增加领域级 `PROJECT_REVISION_CONFLICT` 共享 schema 与 Server 409 构造器，响应包含已校验的 `currentRevision` details。

### 关键设计决定

- Contracts 运行时只依赖 Zod，不引用浏览器、Node 文件系统、Hono 或数据库实现；ULID 生成属于 Server。
- 应用元数据使用 `@creator-studio/contracts/metadata` 子路径，避免 Web 仅显示版本时引入完整 Zod 契约，构建体积保持 FND-01 基线。
- Health 遵循 API 示例的整体 `ok/unhealthy`，database/migrations 使用 `ready/unhealthy`；探针异常统一降级为 unhealthy。
- Same-Origin session、Origin 校验与本地 Workspace 身份属于 FND-04，本 Issue 未提前实现。
- 按用户确认采用 API 契约中的领域错误码 `PROJECT_REVISION_CONFLICT`，并同步修正 `acceptance.md` 与 Foundation draft 中的旧通用码。

### 测试命令与结果

- `npm run typecheck`：通过，contracts/web/server 均无类型错误。
- `npm run lint`：通过，0 warning。
- `npm test`：通过，4 个测试文件、26 个测试全部通过。
- `npm run build`：通过；contracts、Vite Web 与 Hono Server 均成功构建。
- Contracts 边界检查：运行时代码无 Node、浏览器、Hono 或 Drizzle 引用，唯一运行时依赖为 `zod`。
- 生产冒烟：默认 health 返回 503，并准确报告 database/migrations unhealthy；response header 与 envelope 使用同一 ULID request ID；SPA 200、未知 API JSON 404。
- revision 冲突集成测试：旧 revision 返回 409、`PROJECT_REVISION_CONFLICT`、`retryable: false` 与当前 revision；共享 schema 明确拒绝旧 `REVISION_CONFLICT`。
- review-it：领域错误码定义、HTTP 映射和测试覆盖审查 clean，无可执行问题。

### 未解决问题

- 无。本 Issue 原有错误码冲突已由用户确认采用 `PROJECT_REVISION_CONFLICT` 并完成规格、实现与测试对齐。
