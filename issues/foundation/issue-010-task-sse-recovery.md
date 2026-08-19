# [Foundation] FND-10：实现 Task SSE、断线续传与启动恢复

## Description

使用持久化 TaskEvent 提供 SSE 流，支持事件补发、心跳、自动重连、REST 快照校准和服务重启后的运行任务恢复。

## Acceptance Criteria

- [x] `GET /api/v1/task-events` 按 `task_events.id` 输出 SSE id 与类型，并支持 project 筛选。
- [x] 服务每 15 秒发送 heartbeat，连接关闭时释放订阅资源。
- [x] 客户端使用 `Last-Event-ID` 恢复遗漏事件，重复事件不会重复修改状态。
- [x] SSE 重连采用有上限的指数退避；45 秒无数据触发重连。
- [x] 页面刷新先拉取 REST 快照，再订阅后续事件，避免订阅窗口丢事件。
- [x] 启动恢复器按 handler 的 recoverable 声明重新排队或标记失败。
- [x] 集成测试覆盖断线、补发、重复、重启和终态连接关闭。

## Dependencies

- [FND-09](./issue-009-task-runtime-seed-provider.md)

## Type

fullstack

## Priority

high

## SPEC Reference

- `specs/000-system/api.md` §8.5
- `specs/000-system/data-model.md` §3.7～§3.8
- `specs/000-system/acceptance.md` FND-030、FND-031、FND-033

## Implementation Notes

### 主要修改
- 新增持久化 TaskEvent SSE 路由、project 过滤、15 秒 heartbeat、游标补发、无效游标 `stream.reset` 与连接释放。
- 新增 fetch-stream 客户端、SSE parser、`Last-Event-ID` 去重、45 秒静默看门狗、上限 10 秒的指数退避和 REST 快照校准。
- 新增按 handler `recoverable` 能力执行的启动恢复器，并在启动时清理超过 7 天的 TaskEvent。
- 将 Tasks 页面从规划占位升级为实时运行账本，展示快照、连接状态、进度、终态与错误。

### 关键设计决定
- `task_events.id` 是唯一续传游标；SQLite 保持权威状态，Zustand 不持久化领域快照。
- `stream.reset` 携带最新有效 workspace 游标，客户端采用该游标并重新校准 active Task，避免重复 reset。
- 使用 fetch streaming 而非原生 EventSource，以便显式控制 Header、退避、静默超时与连接终止。
- Task Store 启动采用单飞保护，快速导航/重试不会创建重复 SSE 连接。

### 测试命令与结果
- `npm run typecheck`、`npm run lint`、`npm run build`：全部通过。
- `npm test`：14 个测试文件、72 项测试通过。
- `npx playwright test`：4 项 Chromium E2E 通过。
- `xmllint --html --noout docs/issue#0010.html`：通过。
- `review-it`：接受并修复 2 条 P2（并发启动重复订阅、取消初始化 loading 清理）；复审无剩余 actionable finding。

### 未解决问题
- 无；真实 Provider 执行与后续领域 Task handler 不属于本 Issue。
