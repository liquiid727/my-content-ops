# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Content Ops — 项目说明

个人自媒体 AI 创作工作台 monorepo。创作者 Aiden（公众号「AI晚点」+ 小红书/抖音/B站多平台）。仓库当前有两条技术线，改动前先分清改的是哪一条。旧版前端 `gpt_image_playground/` 已删除。

## 两条技术线

1. **`vault-server/`** — Obsidian 知识检索 API（已运行）。Hono + tsx，监听 `127.0.0.1:3721`。
   - `GET /status` 健康检查；`GET /search?q=...&limit=N` BM25 全文检索。
   - 索引 `VAULT_PATH`（默认 `~/Journal/personal_journey`）下的 `.md`，chokidar 监听增量更新。
   - 被 content-knowledge agent 与 Creator Studio 的 Knowledge 模块使用。

2. **`creator-studio/`** — 新创作工作台（建设中，Foundation 阶段）。pnpm workspace：`apps/web`（Vite+React+Zustand+Tailwind）、`apps/server`（Hono+SQLite+Drizzle）、`packages/contracts`（前后端共享契约）。包管理器为 pnpm（根 `pnpm-workspace.yaml` + `pnpm-lock.yaml`）。
   - Web 默认 `127.0.0.1:5173`，Server 默认 `127.0.0.1:4310`，Vite 把 `/api` 代理到本地 Server。
   - 技术基线：`specs/000-system/spec.md` + `docs/frontend_design.md`（Task Runtime + SSE、Provider/Connector seam、`/api/v1` REST + 错误 envelope + `revision` 乐观并发）。
   - 实施单元：`issues/foundation/` 的 FND-01～FND-14，按依赖图推进；完成条件见 `specs/000-system/acceptance.md`。
   - **UI 规范**：组件一律走 `apps/web/src/shared/ui/`（button/input/select/dialog/skeleton/toast/empty-state），图标用 `lucide-react`，Dialog 基于 Radix，主题用 next-themes + `styles/tokens.css` 语义 token（`--surface/--elevated/--primary/--border`…），默认暗色。**禁止在页面里直接铺裸 `<button>/<input>/<select>`**；需要新控件时先补进 `shared/ui`，样式用语义 token 而不是硬编码色值。

## 内容生产

- **内容策划**：用 content-knowledge agent 从 Obsidian 知识库检索素材、规划选题、给出各平台框架。知识库为 `~/Journal/personal_journey/`（PARA 结构），检索优先走 vault-server。
- **口播稿 / 视频演示**：`半年谈/`、`半年谈-v2/` 是 web-video-presentation skill 产出的点击驱动 HTML 演示（每章一个 html + script/outline）。预览用 `npx serve <目录> -l <port>`（见 `.claude/launch.json`）。

## 常用命令

```bash
make dev                 # vault-server + creator-studio web+server 一起起（scripts/dev.mjs，并行管理子进程）
make dev-vault           # 只启动 vault-server（端口 3721）
make dev-studio          # 只启动 creator-studio web+server（web:5173，server:4310）
make dev-studio-web      # 只启动 creator-studio web
make dev-studio-server   # 只启动 creator-studio server
make build               # vault-server tsc + creator-studio build
make test                # creator-studio 单测（vitest）
make studio-test-foundation  # creator-studio 完整 foundation 退出门禁
make smoke               # 冒烟测试 vault + creator-studio
```

后端类型检查/构建：`pnpm -C vault-server run build`（tsc）
Creator Studio 完整检查入口：`pnpm -C creator-studio run test:foundation`

环境变量：`VAULT_PATH`（默认 `~/Journal/personal_journey`）、`VAULT_PORT`/`PORT`（3721）、`CREATOR_STUDIO_PORT`（4310）、`CREATOR_STUDIO_WEB_PORT`（5173）、`CREATOR_STUDIO_DATA_DIR`（数据目录，默认 `creator-studio/data/`）。

## 启动时自动扫描

每次对话开始时，扫描 `local-history/` 目录（可能不存在，用 `2>/dev/null` 容错），列出当前本地的历史项目和资源情况：

```bash
ls local-history/projects/ 2>/dev/null
ls local-history/assets/ 2>/dev/null
ls local-history/references/ 2>/dev/null
```

将扫描结果作为本次对话的上下文背景，方便在规划内容或选题时关联历史项目。`local-history/` 已在 `.gitignore` 忽略，不纳入版本控制。
