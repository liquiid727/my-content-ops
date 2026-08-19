# [Foundation] FND-11：建立前端 API Client 与 Zustand 数据运行层

## Description

实现类型安全 API client、bootstrap、session/theme、project、task stores 与 SSE 订阅适配器。明确 server state、领域状态和临时 UI 状态的边界，防止形成单一巨型 store。

## Acceptance Criteria

- [x] API client 解析共享 schema，统一处理 request ID、错误 envelope、超时和取消。
- [x] store 按 session、theme、project、task 领域拆分，并导出细粒度 selector。
- [x] 组件不直接持有 SSE 生命周期；Task store 负责订阅、去重、重连和清理。
- [x] bootstrap 成功后再渲染依赖身份的页面；失败有重试与诊断信息。
- [x] 主题偏好先本地即时应用，再同步 CreatorProfile；失败时明确回滚或提示。
- [x] Project/Task 页面刷新可从 API 恢复，不依赖内存中的上次导航。
- [x] store 与 SSE adapter 有单元测试，覆盖竞态、重复事件和卸载清理。

## Dependencies

- [FND-02](./issue-002-shared-contracts-http.md)
- [FND-04](./issue-004-bootstrap-local-identity.md)
- [FND-07](./issue-007-project-lifecycle.md)
- [FND-09](./issue-009-task-runtime-seed-provider.md)
- [FND-10](./issue-010-task-sse-recovery.md)

## Type

frontend

## Priority

high

## SPEC Reference

- `specs/000-system/spec.md` §4.1、§8
- `specs/000-system/api.md` §2、§4、§8.5
- `specs/000-system/acceptance.md` FND-007、FND-031

## Implementation Notes

### 主要修改
- 新增共享 schema-aware API client，统一成功/错误解析、request ID、15 秒默认超时、外部取消和网络错误。
- 新增 Session Store 与 SessionGate；Bootstrap 单飞完成后才渲染依赖身份的应用，失败页提供稳定错误、request ID 和重试。
- 新增 Theme Store 与 CreatorProfile preference 写入端点；本地主题即时应用，服务端同步失败会明确提示。
- Project、Asset、Settings、Task API 全部迁移到共享 client；Session、Theme、Project、Task 导出细粒度 selectors。
- Task Store 保持 SSE 生命周期、去重、重连、快照校准和卸载清理的唯一所有者。

### 关键设计决定
- SQLite/REST/SSE 仍是 Project 与 Task 的权威来源，不把领域快照复制进 Local Storage。
- Theme 请求使用递增版本防止乱序响应覆盖最后选择；失败保留已即时应用的本地主题并显示通知。
- 系统验收要求写回 CreatorProfile，但 API 表未命名写路径，因此仅新增严格 theme schema 的 `PATCH /creator-profile/preferences`，不扩展通用 Profile 编辑。
- BootstrapService 每次从仓储读取最新 Profile，避免同一服务进程内返回启动时的陈旧偏好。

### 测试命令与结果
- `npm run typecheck`、`npm run lint`、`npm run build`：全部通过。
- `npm test`：18 个测试文件、80 项测试通过。
- `npx playwright test`：5 项 Chromium E2E 通过。
- `xmllint --html --noout docs/issue#0011.html`：通过。
- `review-it`：目标范围复审 clean，无 P1～P3 actionable finding。

### 未解决问题
- 无；API 表未命名 preference 写入路径的规格缺口已用最小单用途端点记录并闭合。
