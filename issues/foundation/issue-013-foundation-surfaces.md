# [Foundation] FND-13：组装 Dashboard、Project Overview 与 Foundation 状态界面

## Description

将 Foundation 能力组装为可实际操作的产品表面：Dashboard、Project Overview、Assets、Tasks 和 Settings。信息架构遵循设计稿，但不复制旧 gpt-image 产品文案或交互。

## Acceptance Criteria

- [x] Dashboard 显示项目入口、最近项目、最近任务与清晰空状态。
- [x] Project Overview 显示基本信息、阶段摘要、最近 Task、Asset 摘要和后续创作模块入口。
- [x] Assets 页面支持最小上传、筛选和结果展示。
- [x] Tasks 页面显示状态、进度、错误、取消操作和 SSE 实时更新。
- [x] Settings 完成主题、Provider、Lark CLI、Obsidian 配置交互。
- [x] 每个数据区域均覆盖 loading、empty、error、success；写操作提供进行中和失败反馈。
- [x] 暗色视觉与设计稿的信息层级一致，light 主题保持可读和完整。
- [x] 关键流程在 360px、768px、1280px 下可用且无横向溢出。

## Dependencies

- [FND-06](./issue-006-routing-placeholders.md)
- [FND-07](./issue-007-project-lifecycle.md)
- [FND-08](./issue-008-asset-version-foundation.md)
- [FND-10](./issue-010-task-sse-recovery.md)
- [FND-11](./issue-011-frontend-data-runtime.md)
- [FND-12](./issue-012-connector-settings.md)

## Type

ui

## Priority

high

## SPEC Reference

- `specs/000-system/spec.md` §1.3、§3.1、§6、§8
- `specs/000-system/acceptance.md` FND-006～FND-011、FND-018、FND-020、FND-025、FND-036

## Implementation Notes

### 主要修改
- 将 Dashboard、Project Overview、Assets、Tasks、Settings 组装为可操作的 Foundation 产品表面，并复用既有领域 Store。
- Assets 新增本地文件上传；Tasks 新增取消与 SSE 状态反馈；Settings 补齐主题、Provider、Lark CLI、Obsidian 的保存和连接检查交互。
- 补充响应式 E2E、上传/取消 E2E，以及 Settings 已保存非敏感字段回填回归测试。

### 关键设计决定
- 页面不建立第二套业务状态；Project、Asset、Task 数据继续由各自 Zustand 模块拥有。
- 后续创作模块只提供明确入口，不提前实现 Ideas、Topics、Scripts 业务。
- Settings 只回填非敏感配置；凭据不进入 React/Zustand state，也不从 API 回显。

### 测试命令与结果
- `npm run typecheck`、`npm run lint`、`npm run build`：全部通过。
- `npm test`：19 个文件、81 项测试通过。
- `npx playwright test`：8 项 Chromium E2E 通过，覆盖上传、取消和 360/768/1280px 无横向溢出。
- `/review-it`：1 个 P2 已修复（连接器字段加载回填），定向复审通过。
- `xmllint --html --noout docs/issue#0013.html`：通过。

### 未解决问题
- 无；后续创作模块不属于本 Issue。
