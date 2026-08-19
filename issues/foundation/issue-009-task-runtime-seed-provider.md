# [Foundation] FND-09：实现持久化 Task Runtime 与 Seed Provider

## Description

实现进程内但持久化的 Task 队列、handler registry、合法状态转换、取消与 Seed Task。Seed Provider 模拟一次模型生成并写入 Generation，用来证明 Provider 抽象和任务链路成立。

## Acceptance Criteria

- [x] 实现 Task 创建、查询、列表、取消端点以及共享状态 schema。
- [x] Task 与首个 event 同事务创建；每次状态转换同事务追加 event。
- [x] handler registry 拒绝未注册 type，并把异常映射为稳定失败状态。
- [x] 支持 queued、running、waiting_review、completed、failed、cancelled 的合法转换。
- [x] 取消 queued/running Task 可达稳定终态；取消终态 Task 返回 409。
- [x] Seed Provider 只通过 capability Provider 接口被调用，并写入脱敏 Generation 记录。
- [x] Seed Task 可完整经历 queued → running → completed，结果在重载后仍可读取。

## Dependencies

- [FND-02](./issue-002-shared-contracts-http.md)
- [FND-03](./issue-003-sqlite-drizzle-repositories.md)
- [FND-04](./issue-004-bootstrap-local-identity.md)

## Type

backend

## Priority

high

## SPEC Reference

- `specs/000-system/spec.md` §4.2、§5.2、§10
- `specs/000-system/api.md` §8
- `specs/000-system/data-model.md` §3.7～§3.9
- `specs/000-system/acceptance.md` FND-028、FND-029、FND-032、FND-034、FND-035

## Implementation Notes

### 主要修改
- 新增 Task 共享 schema、创建/列表/读取/取消 REST 端点、合法状态机、handler registry 和串行持久 runner。
- 新增 capability-based `GenerationProvider`、Seed Provider/handler，以及 Generation 与 Task completed/event 的原子提交。
- 扩展 Task Repository 的 workspace 查询、active/terminal/project/type 筛选与 compare-status transition。

### 关键设计决定
- 未注册 type 返回 `422 TASK_TYPE_UNSUPPORTED` 且不落库；handler 输入由其专属 schema 校验。
- queued/running/waiting_review 可按状态机取消；终态返回 `409 TASK_ALREADY_FINISHED`。取消与 handler 完成竞态由 compare-status 写入决定，runner 不崩溃。
- Generation request 只保存 prompt 长度和 SHA-256；handler 原始异常不进入 DB/API。
- retry、SSE、进程启动恢复属于 FND-010，本 Issue 未提前实现。

### 测试命令与结果
- `npm run typecheck`：通过。
- `npm run lint`：通过，0 warning、0 error。
- `npm test`：通过，11 个测试文件、57 项测试全部通过。
- `npm run build`：通过。
- `npx playwright test`：通过，2 项既有生产 E2E 无回归。
- `xmllint --html --noout docs/issue#0009.html`：通过。

### 未解决问题
- 无；SSE/retry/启动恢复按依赖顺序由 FND-010 继续。
