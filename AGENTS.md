# AGENTS.md

Guidance for coding agents (Codex / Claude Code) working in this repository. 与 `CLAUDE.md` 互补：`CLAUDE.md` 面向 Claude Code，本文件面向所有 agent，重点补充 **Feature 工作流（`.feature` 工作区）** 的约定。

# Content Ops — 项目说明

个人自媒体 AI 创作工作台 monorepo。创作者 Aiden（公众号「AI晚点」+ 小红书/抖音/B站多平台）。仓库当前有三条技术线，改动前先分清改的是哪一条。旧版前端 `gpt_image_playground/` 已删除。

## 三条技术线

1. **`vault-server/`** — Obsidian 知识检索 API（已运行）。Hono + tsx，监听 `127.0.0.1:3721`。
   - `GET /status` 健康检查；`GET /search?q=...&limit=N` BM25 全文检索。
   - 索引 `VAULT_PATH`（默认 `~/Journal/personal_journey`）下的 `.md`，chokidar 监听增量更新。
   - 被内容知识 agent 与 Creator Studio 的 Knowledge 模块使用。

2. **`infinite-canvas/`** — 创作画布宿主（钉死的 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 快照，见 `VENDOR.md`）。**不进 pnpm workspace**，`canvas-install` 用 npm 独立装。浏览器里配 API Key，数据在 IndexedDB。默认 `127.0.0.1:3300`。Studio 的 `/projects/:id/canvas` 路由用 iframe `?embed=1` 内嵌它（`apps/web/src/canvas/host/canvas-host.tsx`）；不要把它当 React 组件 import 进 `creator-studio/apps/web`。

3. **`creator-studio/`** — 创作工作台（当前主产品，Creative Canvas V1）。pnpm workspace：`apps/web`（Vite+React+Zustand+Tailwind）、`apps/server`（Hono+SQLite+Drizzle）、`packages/contracts`（前后端共享契约）。包管理器为 pnpm（根 `pnpm-workspace.yaml` + `pnpm-lock.yaml`）。
   - Web 默认 `127.0.0.1:5173`，Server 默认 `127.0.0.1:4310`，Vite 把 `/api` 代理到本地 Server。创作画布 = `/projects/:id/canvas` 内嵌 infinite-canvas 宿主。
   - 技术基线：`specs/000-system/spec.md` + `docs/frontend_design.md`（Task Runtime + SSE、Provider/Connector seam、`/api/v1` REST + 错误 envelope + `revision` 乐观并发）。服务端装配与可扩展边界以 `creator-studio/docs/architecture/capability-seams.md` + `apps/server/src/kernel/` 为准。
   - 实施记录：Foundation FND-01～FND-14 已过关；增量以 `.feature/` 工作区驱动（见下），退出门禁 `pnpm -C creator-studio run test:foundation`。
   - **UI 规范**：组件一律走 `apps/web/src/shared/ui/`（button/input/select/dialog/skeleton/toast/empty-state），图标用 `lucide-react`，Dialog 基于 Radix，主题 next-themes + `styles/tokens.css` 语义 token（`--surface/--elevated/--primary/--border`…），默认暗色。**禁止在页面里直接铺裸 `<button>/<input>/<select>`**；需要新控件时先补进 `shared/ui`。

## Feature 工作流（.feature 工作区）

所有需求文档默认写入仓库根目录下的 `.feature/` 工作区。每个 feature 一个独立目录，配套的 `.prd / .spec / .issues / .test` 需求文档都放在该目录下：

```
.feature/
└── .feature-<NNN>-<slug>/
    ├── .prd                    # 需求文档 PRD —— /prd 产出
    ├── .spec                   # 技术规格 SPEC —— /prd-to-spec 产出
    ├── .issues                 # 本地 issue 列表 —— /to-issues 产出（默认本地存放）
    ├── .test                   # 测试计划 / 测试文档
    └── .loop-local-state.json  # /loop-it-local 检查点状态（已加入 .gitignore，不入库）
```

- **命名**：`<NNN>` 三位序号按已有目录自动递增（001、002、…），`<slug>` 取 kebab-case 功能名（如 `priority-system`）
- **文件名不带扩展名，内容为 Markdown**
- **默认本地**：issues 默认写在 `.issues`，不自动同步 GitHub / iCafe（可选同步）

### 需求文档管线

```
/prd → /prd-to-spec（可选）→ /to-issues → /loop-it-local
 │          │                │            │
 │ 需求(what) │ 技术(how)      │ tickets    │ 实现(code)
```

- **`/prd`**：从 feature 描述生成 PRD → 创建 `.feature/.feature-<NNN>-<slug>/` → 写入 `.prd`
- **`/prd-to-spec`**：读取 `.prd` → 生成技术 SPEC → 写入同目录 `.spec`
- **`/to-issues`**：读取 `.prd`/`.spec` → 拆解为 Issue 列表 → 写入同目录 `.issues`（每条带 `**Status:**`）
- **`/loop-it-local`**：解析 `.issues` → 按依赖拓扑排序 → 逐个「内联实现 → `/review-it` → `/note-it` → 本地 ship（commit + 更新 `.issues` 状态 + `--ff-only` 合并）」→ 重复直到全部完成。纯本地，不依赖 gh CLI。

### 当前 Feature 进度

| 目录 | 状态 |
| --- | --- |
| `001-canvas-runtime` | 已交付（13/13 shipped，历史基线；`@xyflow/react` 旧画布，方向被 003 + 005 取代） |
| `002-creator-profile` | 已交付（6/6 shipped） |
| `003-creative-canvas-v1` | 当前产品方向（12/12 completed：Workflow graph + Recipe + Text/Image Studio + ChangeSet 人审 + MCP propose） |
| `004-canvas-visual-v1` | 已完成（5/5） |
| `005-canvas-host-swap` | 核心已交付（CHS-01~03）；CHS-04 知识插件 / CHS-05 删除旧画布 待做 |
| Capability Seam 重构 | 进行中：`creator-studio/docs/architecture/capability-seams.md` + `apps/server/src/kernel/` Phase 1 已落地；Phase 2+ 计划中 |

注意：003/004/005 与 kernel 的实现大多仍在 working tree 未提交，`git log` 只到 feature-001；动手前 `git status` 确认。

## 内容生产

- **内容策划**：用内容知识 agent 从 Obsidian 知识库检索素材、规划选题、给出各平台框架。知识库为 `~/Journal/personal_journey/`（PARA 结构），检索优先走 vault-server。
- **口播稿 / 视频演示**：`半年谈/`、`半年谈-v2/` 是 web-video-presentation skill 产出的点击驱动 HTML 演示（每章一个 html + script/outline）。预览用 `npx serve <目录> -l <port>`。

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

环境变量：`VAULT_PATH`（默认 `~/Journal/personal_journey`）、`VAULT_PORT`/`PORT`（3721）、`CREATOR_STUDIO_PORT`（4310）、`CREATOR_STUDIO_WEB_PORT`（5173）、`CREATOR_STUDIO_CANVAS_PORT`（3300）、`CREATOR_STUDIO_DATA_DIR`（数据目录，默认 `creator-studio/data/`）。
