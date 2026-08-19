# [Foundation] FND-01：创建 Creator Studio 工程骨架与统一启动入口

## Description

在当前仓库新增 `creator-studio/` 文件夹，建立 Vite + React + TypeScript 前端、本地 Node + Hono 服务端和共享包。提供开发、构建、类型检查、测试与生产启动脚本，同时保持旧项目行为不变。

## Acceptance Criteria

- [x] 目录符合 `docs/frontend_design.md` 的模块边界，并包含 `apps/web`、`apps/server`、`packages/contracts`。
- [x] 使用 npm workspace；依赖安装和脚本执行均不要求全局工具。
- [x] 一个开发命令并行启动 web 与 server，进程退出时正确回收子进程。
- [x] 生产构建由 server 托管前端静态文件，并支持 SPA 路由回退。
- [x] 提供 `dev`、`build`、`start`、`typecheck`、`lint`、`test` 脚本。
- [x] 根仓库仅增加明确命名的 Creator Studio 入口，不改变原有脚本语义。
- [x] README 写明 Node 版本、安装、启动、构建和数据目录位置。

## Dependencies

None.

## Type

infra

## Priority

high

## SPEC Reference

- `specs/000-system/spec.md` §1～§3、§10～§11
- `specs/000-system/acceptance.md` FND-001～FND-003、FND-044

## Implementation Notes

### 主要修改

- 新增独立的 `creator-studio/` npm workspace，包含 `apps/web`、`apps/server` 和 `packages/contracts`。
- 建立 Vite + React + TypeScript + Tailwind Web 入口、Node.js + Hono 本地服务，以及共享应用元数据包；Zustand 已作为前端技术基线依赖安装。
- 增加统一开发、构建、生产启动、类型检查、Lint 和测试脚本；生产 Hono 服务托管 Web 构建并为非 API 路由提供 SPA fallback。
- 根 `package.json` 仅增加 `creator-studio:*` 明确命名入口，保留原有脚本内容与语义。

### 关键设计决定

- 当前 Issue 采用其明确要求的 workspace 目录形态，同时在 Web 内保留 `app`、`styles` 等模块边界。
- `packages/contracts` 本阶段只承载应用元数据；Zod 契约、HTTP 错误模型和 health API 留给 FND-02。
- SQLite、Drizzle、数据目录初始化与迁移留给 FND-03；本阶段仅声明并忽略规范数据目录。
- 未复制或导入 `gpt_image_playground` 的页面、Store 或业务模块；Server 固定监听 `127.0.0.1`。

### 测试命令与结果

- `npm install`：通过，workspace 依赖与 `package-lock.json` 已生成，无需全局工具。
- `npm run typecheck`：通过，contracts/web/server 三个 workspace 均无类型错误。
- `npm run lint`：通过，0 warning。
- `npm test`：通过，2 个测试文件、4 个测试全部通过。
- `npm run build`：通过，contracts、Vite Web 和 Hono Server 均成功构建且无警告。
- 开发进程冒烟：Web `45173` 与 Server `44311` 同时就绪；向统一开发命令发送 `SIGINT` 后两个监听端口均释放。
- 生产冒烟：以 `CREATOR_STUDIO_PORT=44310 npm run start` 启动后，请求 `/projects/example/overview` 返回 200 和 Web SPA 内容。
- 根入口 `npm run creator-studio:typecheck`：通过。

### 未解决问题

- 无本 Issue 阻塞项。业务 API、数据库、完整主题/App Shell 按依赖顺序由后续 Foundation Issues 实现。
