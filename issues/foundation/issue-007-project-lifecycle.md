# [Foundation] FND-07：完成 Project 生命周期纵向切片

## Description

从 Repository、Service、REST API、共享 schema 到 Zustand feature store 和创建/编辑表单，完整实现 Project 创建、读取、更新、归档与游标列表。这是后续所有创作对象的归属基础。

## Acceptance Criteria

- [x] 实现 `api.md` §5 的项目列表、创建、读取、更新、归档和 overview 接口。
- [x] 标题、说明、内容类型和状态在服务端使用共享 schema 校验。
- [x] 列表支持游标分页、状态筛选、更新时间排序，默认排除 archived 项目。
- [x] 更新 revision 冲突提供可恢复提示；归档不删除 Project 数据。
- [x] 创建成功后跳转 Project Overview；请求中断或重复提交不创建重复项目。
- [x] Project store 只保存跨组件领域状态，不保存表单临时输入。
- [x] API、Repository 和关键创建/编辑流程均有测试。

## Dependencies

- [FND-02](./issue-002-shared-contracts-http.md)
- [FND-03](./issue-003-sqlite-drizzle-repositories.md)
- [FND-04](./issue-004-bootstrap-local-identity.md)
- [FND-05](./issue-005-theme-app-shell.md)

## Type

fullstack

## Priority

high

## SPEC Reference

- `specs/000-system/api.md` §5
- `specs/000-system/data-model.md` §3.4
- `specs/000-system/acceptance.md` FND-018～FND-022

## Implementation Notes

### 主要修改

- 新增 Project 共享 schema、响应 envelope、状态与 Overview 契约，并在 Hono 中实现列表、创建、读取、更新、归档和 Overview 六个接口。
- 扩展 Project Repository：默认排除 archived、使用 `(updatedAt, id)` 稳定游标、workspace 作用域读取、Project 与幂等记录原子创建。
- 新增 ProjectService 计算 stage/pipeline，聚合活动 Task、最近 Asset/Version；`projects` 表不持久化 stage 或 progress。
- 将 Projects 占位页替换为真实列表、筛选和创建对话框；将 Overview 接入编辑、revision 冲突恢复、归档及 Task/Asset 空状态。
- 新增 Project API client 与 Zustand feature store；表单输入全部保留在 `ProjectForm` 本地状态。

### 关键设计决定

- 创建接口强制 `Idempotency-Key`；Project 与完成态幂等记录在同一 SQLite 事务中写入，相同请求重放原 Project，不同 payload 返回 `IDEMPOTENCY_KEY_REUSED`。
- revision 冲突沿用已确认的领域错误码 `PROJECT_REVISION_CONFLICT`，前端收到后重新读取最新 Overview 并保留可再次保存的编辑对话框。
- 归档通过 revisioned status 更新实现，不调用软删除；默认列表排除 archived，但 `status=archived` 可查询且详情仍可读取。
- 仅计算 SPEC 当前明确的 idea/script 流水线，未提前实现后续创作领域模块。

### 测试命令与结果

- `npm run typecheck`：通过，contracts/web/server 全部无类型错误。
- `npm run lint`：通过，0 warning、0 error。
- `npm test`：通过，9 个测试文件、48 项测试全部通过。
- `npx playwright test`：通过，1 项 Chromium E2E 覆盖创建跳转、Overview 空状态、编辑 revision、归档与 archived 筛选。
- `npm run build`：通过，contracts、Vite Web 和 Node Server 生产构建成功。
- `xmllint --html --noout docs/issue#0007.html`：通过。

### 未解决问题

- 无。本 Issue 未实现后续 Asset 上传、Version UI 或 Task Runtime；这些仍由对应后续 Issue 负责。
