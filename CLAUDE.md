# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Content Ops — 项目说明

个人自媒体 AI 创作工作台 monorepo。创作者 Aiden（公众号「AI晚点」+ 小红书/抖音/B站多平台）。仓库当前有三条技术线，改动前先分清改的是哪一条。旧版前端 `gpt_image_playground/` 已删除。

## 三条技术线

1. **`vault-server/`** — Obsidian 知识检索 API（已运行）。Hono + tsx，监听 `127.0.0.1:3721`。
   - `GET /status` 健康检查；`GET /search?q=...&limit=N` BM25 全文检索。
   - 索引 `VAULT_PATH`（默认 `~/Journal/personal_journey`）下的 `.md`，chokidar 监听增量更新。
   - 被 content-knowledge agent 与 Creator Studio 的 Knowledge 模块使用。

2. **`infinite-canvas/`** — 创作画布宿主（钉死的 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 快照，见 `infinite-canvas/VENDOR.md`）。**不进 pnpm workspace**，`canvas-install` 用 npm 独立装。浏览器里配 API Key，数据在 IndexedDB，默认 `127.0.0.1:3300`。Studio 的 `/projects/:id/canvas` 路由用 iframe `?embed=1` 内嵌它；不要把它当 React 组件 import 进 `apps/web`。

3. **`creator-studio/`** — 创作工作台（当前主产品，Creative Canvas V1）。pnpm workspace：`apps/web`（Vite+React+Zustand+Tailwind）、`apps/server`（Hono+SQLite+Drizzle）、`packages/contracts`（前后端共享契约）。包管理器为 pnpm（根 `pnpm-workspace.yaml` + `pnpm-lock.yaml`）。
   - Web 默认 `127.0.0.1:5173`，Server 默认 `127.0.0.1:4310`，Vite 把 `/api` 代理到本地 Server。创作画布 = `/projects/:id/canvas` 路由内嵌 infinite-canvas 宿主（见上一条）。
   - 技术基线：`specs/000-system/spec.md` + `docs/frontend_design.md`（Task Runtime + SSE、Provider/Connector seam、`/api/v1` REST + 错误 envelope + `revision` 乐观并发）。服务端装配与可扩展边界以 `creator-studio/docs/architecture/capability-seams.md` 和 `apps/server/src/kernel/` 为准。
   - 增量以 `.feature/` 工作区驱动（Feature 进度见下，流程见 `AGENTS.md`）；退出门禁 `pnpm -C creator-studio run test:foundation`。
   - **UI 规范**：组件一律走 `apps/web/src/shared/ui/`（button/input/select/dialog/skeleton/toast/empty-state），图标用 `lucide-react`，Dialog 基于 Radix，主题用 next-themes + `styles/tokens.css` 语义 token（`--surface/--elevated/--primary/--border`…），默认暗色。**禁止在页面里直接铺裸 `<button>/<input>/<select>`**；需要新控件时先补进 `shared/ui`，样式用语义 token 而不是硬编码色值。

## Feature 进度（.feature 工作区）

需求/规格/issue 按 feature 独立目录存于仓库根 `.feature/.feature-<NNN>-<slug>/`（`.prd / .spec / .issues`；管线 `/prd → /prd-to-spec → /to-issues → /loop-it-local`，详见 `AGENTS.md`）。当前状态（以各 `.issues` 标注为准）：

| 目录 | 状态 |
| --- | --- |
| `001-canvas-runtime` | 已交付（13/13 shipped，历史基线；`@xyflow/react` 旧画布，方向被 003 + 005 取代） |
| `002-creator-profile` | 已交付（6/6 shipped：个人风格契约 + 画像 CRUD + 上下文注入 + Obsidian 导入） |
| `003-creative-canvas-v1` | 当前产品方向（12/12 completed：Workflow graph + Recipe 注册 + Text/Image Studio + ChangeSet 人审 + MCP propose） |
| `004-canvas-visual-v1` | 已完成（5/5：视觉规范、节点 chrome、内容卡预览、Inspector 密度） |
| `005-canvas-host-swap` | 核心已交付（CHS-01~03：vendored infinite-canvas + dev 命令 + 画布路由内嵌）；CHS-04 知识插件 / CHS-05 删除旧画布 待做 |
| Capability Seam 重构 | 进行中：`creator-studio/docs/architecture/capability-seams.md` 草案 + `apps/server/src/kernel/` Phase 1（CapabilityHost）已落地；Phase 2+（provider factory / Recipe 绑定表 / pre-execute waterfall）计划中 |

注意：003/004/005 与 kernel 的实现大多仍在 working tree 未提交，`git log` 只到 feature-001。

## 内容生产

- **内容策划**：用 content-knowledge agent 从 Obsidian 知识库检索素材、规划选题、给出各平台框架。知识库为 `~/Journal/personal_journey/`（PARA 结构），检索优先走 vault-server。
- **口播稿 / 视频演示**：`半年谈/`、`半年谈-v2/` 是 web-video-presentation skill 产出的点击驱动 HTML 演示（每章一个 html + script/outline）。预览用 `npx serve <目录> -l <port>`（见 `.claude/launch.json`）。

## 常用命令

```bash
make dev                 # vault + studio（web/API/画布宿主一起起）。日常只开 http://127.0.0.1:5173
make dev-vault           # 只启动 vault-server（端口 3721）
make dev-studio          # studio web + API + 画布宿主（5173 / 4310 / 3300）
make dev-canvas          # 只启动画布宿主（3300，一般不用单独开）
make canvas-install      # 安装 infinite-canvas/web 依赖
make dev-studio-web      # 只启动 creator-studio web
make dev-studio-server   # 只启动 creator-studio server
make build               # vault-server tsc + creator-studio build
make test                # creator-studio 单测（vitest）
make studio-test-foundation  # creator-studio 完整 foundation 退出门禁
make smoke               # 冒烟测试 vault + creator-studio
```

后端类型检查/构建：`pnpm -C vault-server run build`（tsc）
Creator Studio 完整检查入口：`pnpm -C creator-studio run test:foundation`

环境变量：`VAULT_PATH`（默认 `~/Journal/personal_journey`）、`VAULT_PORT`/`PORT`（3721）、`CREATOR_STUDIO_PORT`（4310）、`CREATOR_STUDIO_WEB_PORT`（5173）、`CREATOR_STUDIO_CANVAS_PORT`（3300）、`CREATOR_STUDIO_DATA_DIR`（数据目录，默认 `creator-studio/data/`）。

## 启动时自动扫描

每次对话开始时，扫描 `local-history/` 目录（可能不存在，用 `2>/dev/null` 容错），列出当前本地的历史项目和资源情况：

```bash
ls local-history/projects/ 2>/dev/null
ls local-history/assets/ 2>/dev/null
ls local-history/references/ 2>/dev/null
```

将扫描结果作为本次对话的上下文背景，方便在规划内容或选题时关联历史项目。`local-history/` 已在 `.gitignore` 忽略，不纳入版本控制。
