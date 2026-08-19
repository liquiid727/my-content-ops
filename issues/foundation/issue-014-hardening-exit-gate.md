# [Foundation] FND-14：完成安全、性能、E2E 与 Foundation Exit Gate

## Description

按系统验收标准完成故障场景、关键 E2E、安全边界、性能基线和工程质量门禁。该 Issue 只允许修复验收缺口，不引入新的产品范围。

## Acceptance Criteria

- [x] 自动化执行 typecheck、lint、unit、contract、integration、E2E 和 production build。
- [x] 覆盖首次启动/重复启动、迁移失败、端口占用、数据目录不可写。
- [x] 覆盖创建项目、上传 Asset、Seed Task、SSE 断线恢复、主题持久化四条关键流程。
- [x] 验证路径穿越、非法 MIME、大小限制、Origin/Host、日志脱敏和 secret 不回传。
- [x] 在规定种子数据下记录 `acceptance.md` §4 的启动、页面和 API 性能结果。
- [x] 生产构建刷新任意前端路由成功，退出后无残留子进程或数据库锁。
- [x] 对 `acceptance.md` FND-001～FND-044 逐项留下通过证据或经确认的例外 Issue。
- [x] README 更新最终运行、测试、数据备份和故障排查步骤。

## Dependencies

- FND-01～FND-13

## Type

infra

## Priority

high

## SPEC Reference

- `specs/000-system/acceptance.md` 全文
- `specs/000-system/spec.md` §8～§12

## Implementation Notes

### 主要修改
- 新增 `test:foundation` 一键门禁，自动执行 typecheck、lint、unit、contract、integration、legacy boundary、production build、E2E、真实进程生命周期和性能基线。
- 新增端口占用、生产嵌套路由、SIGTERM、残留 PID、SQLite 锁释放检查，并补强数据目录不可写测试。
- Task 列表补齐稳定 cursor、默认 30/最大 100 和前端“加载更多”；新增 SSE 断线补发且不重复应用的 E2E。
- 新增 `creator-studio/docs/foundation-exit-gate.md` 的 FND-001～FND-044 证据矩阵，并扩充 README 运行、测试、备份、安全和排障说明。

### 关键设计决定
- 所有门禁数据均使用临时目录，不污染用户 `data/`；性能脚本固定 100 Project、1,000 Asset、1,000 TaskEvent 种子。
- 生产生命周期必须使用真实子进程验证，不能只依赖 Hono 内存请求测试。
- 实时恢复逐页校准全部 active Task；历史 Task 由用户显式加载下一页，保持服务端列表有界。

### 测试命令与结果
- `mise exec node@24.16.0 -- npm run test:foundation`：全部通过（Node v24.16.0 LTS）。
- Web unit：8 个文件、29 项；contract：1 个文件、7 项；server integration：10 个文件、47 项；Chromium E2E：9 项，全部通过。
- 生产 runtime：端口占用拒绝、嵌套路由刷新、干净退出、数据库锁释放全部通过；health ready 308.94ms。
- 性能：冷启动 258.52ms；Dashboard 837.39ms；只读 API p95 1.68ms；创建 Project p95 3.06ms，全部低于目标。
- `/review-it`：2 个 P2 已修复（Task UI 分页、SSE 去重 E2E 证据），定向复审通过。
- `xmllint --html --noout docs/issue#0014.html`：通过。

### 未解决问题
- 无；FND-001～FND-044 无例外项。
