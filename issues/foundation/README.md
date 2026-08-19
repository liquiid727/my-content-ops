# Creator Studio Foundation Issues

状态：已确认，可实施。  
创建模式：Local Markdown。  
范围：只建立 Creator Studio 基础平台，不实现完整内容创作链路。

## 已确认的技术决定

- 新项目位于当前仓库的 `creator-studio/` 文件夹。
- 前端使用 Vite + React + TypeScript + Zustand + Tailwind CSS。
- 本地服务使用 Node.js + Hono。
- 数据持久化使用 SQLite + Drizzle。
- 默认暗色主题，支持 light/system。
- Provider、Lark CLI、Obsidian 通过本地服务和 Settings 配置。
- Issue 暂不发布到 GitHub，以本目录文件为执行依据。

## Issues

| 顺序 | Issue | 类型 | 依赖 |
|---|---|---|---|
| 1 | [FND-01 工程骨架](./issue-001-creator-studio-scaffold.md) | infra | 无 |
| 2 | [FND-02 共享契约与 HTTP](./issue-002-shared-contracts-http.md) | fullstack | FND-01 |
| 3 | [FND-03 SQLite 与仓储](./issue-003-sqlite-drizzle-repositories.md) | backend | FND-01、02 |
| 4 | [FND-04 Bootstrap 与本地身份](./issue-004-bootstrap-local-identity.md) | backend | FND-02、03 |
| 5 | [FND-05 Theme 与 App Shell](./issue-005-theme-app-shell.md) | ui | FND-01 |
| 6 | [FND-06 路由与占位页](./issue-006-routing-placeholders.md) | frontend | FND-05 |
| 7 | [FND-07 Project 生命周期](./issue-007-project-lifecycle.md) | fullstack | FND-02～05 |
| 8 | [FND-08 Asset 与 Version](./issue-008-asset-version-foundation.md) | fullstack | FND-02～04 |
| 9 | [FND-09 Task Runtime](./issue-009-task-runtime-seed-provider.md) | backend | FND-02～04 |
| 10 | [FND-10 Task SSE 与恢复](./issue-010-task-sse-recovery.md) | fullstack | FND-09 |
| 11 | [FND-11 前端数据运行层](./issue-011-frontend-data-runtime.md) | frontend | FND-02、04、07、09、10 |
| 12 | [FND-12 Connector 设置](./issue-012-connector-settings.md) | fullstack | FND-02～05 |
| 13 | [FND-13 Foundation 产品界面](./issue-013-foundation-surfaces.md) | ui | FND-06～12 的相关能力 |
| 14 | [FND-14 Hardening 与退出门禁](./issue-014-hardening-exit-gate.md) | infra | FND-01～13 |

## 推荐执行批次

```text
批次 A：FND-01
批次 B：FND-02 + FND-05
批次 C：FND-03 + FND-06
批次 D：FND-04
批次 E：FND-07 + FND-08 + FND-09 + FND-12
批次 F：FND-10
批次 G：FND-11
批次 H：FND-13
批次 I：FND-14
```

同一批次只表示依赖允许并行，不要求并行执行。每个 Issue 完成后应先测试和评审，再开始依赖它的 Issue。

## 规格来源

- [总体技术 SPEC](../../specs/000-system/spec.md)
- [API 契约](../../specs/000-system/api.md)
- [数据模型](../../specs/000-system/data-model.md)
- [系统验收标准](../../specs/000-system/acceptance.md)
- [Foundation 拆分记录](../../specs/001-foundation/issues-draft.md)

