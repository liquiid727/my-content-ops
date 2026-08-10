# Creator Studio 系统验收标准

> 本文定义总技术 SPEC 与 Foundation 阶段的可验证完成条件。产品范围来自 [MVP PRD](../../docs/Creator_Studio_MVP01_PRD.md)，技术契约见 [系统 SPEC](./spec.md)、[API](./api.md) 与 [数据模型](./data-model.md)。

## 1. 验收原则

- 每条标准必须能通过自动化测试、可重复操作或视觉对照明确判断通过/失败。
- Foundation 只证明平台骨架可承载后续创作链路，不要求真正接通 AI Provider、Lark CLI 或 Obsidian。
- 占位页面必须明确标注状态，不伪装成已完成能力。
- 验收环境为本地单用户、Node LTS、现代 Chromium 浏览器。
- 所有测试数据必须可通过临时数据库或独立测试数据目录清理，不污染用户数据。

## 2. Foundation 退出标准

### 2.1 启动与工程结构

| ID | 验收标准 | 验证方式 |
|---|---|---|
| FND-001 | `creator-studio/` 可在当前仓库内独立安装、开发和构建，不修改旧 `gpt_image_playground` 的运行行为 | CI/命令检查 |
| FND-002 | 一个开发命令可同时启动 Vite 前端与本地 Node 服务，并输出清晰的访问地址 | 手工冒烟测试 |
| FND-003 | 生产构建后由本地服务托管静态资源，刷新任意前端路由不会返回 404 | 集成测试 |
| FND-004 | 缺少数据目录时首次启动会自动创建目录、数据库、默认 Workspace 与 CreatorProfile；第二次启动不会重复创建 | 集成测试 |
| FND-005 | 数据库迁移失败、端口占用或数据目录不可写时，进程以非零状态退出并显示可操作错误 | 失败场景测试 |

### 2.2 UI Shell 与主题

| ID | 验收标准 | 验证方式 |
|---|---|---|
| FND-006 | 首次访问默认显示暗色主题，基础布局与 `docs/01 · 首页 Dashboard.png` 等设计稿的信息层级一致 | 视觉对照 |
| FND-007 | 设置中可切换 `dark`、`light`、`system`，选择持久化到 CreatorProfile 偏好；重载后保持一致 | E2E |
| FND-008 | Dashboard、Projects、Assets、Tasks、Settings 均可从侧边导航访问，当前路由有明确选中状态 | E2E |
| FND-009 | P1 页面可以占位，但必须显示页面名称、规划状态和返回可用路径，不出现空白页或死链 | E2E |
| FND-010 | 360px、768px、1280px 三种视口下无横向溢出；键盘可访问导航和主题控件 | 响应式/无障碍检查 |
| FND-011 | 所有交互控件都有可见 focus 状态；正文和主要控件满足 WCAG AA 对比度 | 自动检查 + 人工复核 |

### 2.3 API 与共享契约

| ID | 验收标准 | 验证方式 |
|---|---|---|
| FND-012 | `/api/v1/health` 返回服务、数据库和迁移状态；不可用组件不会被报告为健康 | 集成测试 |
| FND-013 | `/api/v1/bootstrap` 返回当前 Workspace、CreatorProfile、主题偏好、能力开关和已脱敏设置摘要 | 契约测试 |
| FND-014 | 前后端请求与响应共用 Zod schema；无效输入返回稳定错误 envelope 和字段级 details | 单元/契约测试 |
| FND-015 | 未知 API 路由返回 JSON `404 NOT_FOUND`，服务端异常返回脱敏的 `500 INTERNAL_ERROR` | 集成测试 |
| FND-016 | 写接口支持 `Idempotency-Key`；相同 key 与相同请求返回原结果，不同请求返回 409 | 集成测试 |
| FND-017 | 更新接口使用 `revision` 做乐观并发控制，旧 revision 返回 `409 PROJECT_REVISION_CONFLICT` | 集成测试 |

### 2.4 Project 基础能力

| ID | 验收标准 | 验证方式 |
|---|---|---|
| FND-018 | 用户可创建包含标题、说明和内容类型的 Project，创建后进入 Project Overview | E2E |
| FND-019 | 项目列表支持游标分页、状态筛选和更新时间排序，默认查询不返回 archived 项目 | API/集成测试 |
| FND-020 | Project Overview 能显示项目基本信息、最近 Task 与 Asset 空状态 | E2E |
| FND-021 | 项目编辑正确递增 revision；归档后默认列表不再显示，但仍可按 archived 状态查询 | 集成测试 |
| FND-022 | 项目 `stage` 和 `progress` 来自领域状态计算，不以独立可写字段持久化 | 仓储测试/代码审查 |

### 2.5 Asset 与 Version 基础能力

| ID | 验收标准 | 验证方式 |
|---|---|---|
| FND-023 | 支持上传允许类型的小型测试文件；响应包含 Asset 元数据且文件落在受控数据目录 | 集成测试 |
| FND-024 | `../`、绝对路径、超限文件和不允许 MIME 类型被拒绝，临时文件得到清理 | 安全/失败场景测试 |
| FND-025 | Asset 列表可按项目和类型筛选，页面具有加载、空、错误和成功四类状态 | API + E2E |
| FND-026 | Version 可按 subject 查询；恢复旧版本会新增版本，不覆盖或删除历史版本 | 集成测试 |
| FND-027 | 同一 subject 在任意时刻最多只有一个当前 Version | 数据库约束测试 |

### 2.6 Task Runtime 与实时状态

| ID | 验收标准 | 验证方式 |
|---|---|---|
| FND-028 | 创建 Seed Task 返回 `202` 和持久化 Task，状态按 `queued → running → completed` 转换 | 集成测试 |
| FND-029 | 状态变更与 TaskEvent 在同一事务内提交，不产生“状态已变但无事件”的记录 | 故障注入测试 |
| FND-030 | SSE 按事件 ID 推送进度；断线后携带 `Last-Event-ID` 可补发遗漏事件且不重复应用 | 集成/E2E |
| FND-031 | 刷新页面后可通过 REST 快照恢复当前 Task 状态，不依赖浏览器内存 | E2E |
| FND-032 | 取消 queued/running Task 得到稳定终态；已完成 Task 的取消请求返回 409 | 集成测试 |
| FND-033 | 服务异常退出后，启动恢复器按照 handler 的 recoverable 声明处理残留 running Task | 重启恢复测试 |
| FND-034 | 未注册任务类型、handler 异常和无效状态转换均落为可诊断错误，不导致进程崩溃 | 失败场景测试 |

### 2.7 Provider 与 Connector 边界

| ID | 验收标准 | 验证方式 |
|---|---|---|
| FND-035 | Seed Provider 通过统一 `GenerationProvider` 接口注册；业务模块不直接调用特定 SDK | 单元测试/代码审查 |
| FND-036 | Settings 显示 Provider、Lark CLI、Obsidian 三个配置区；未配置时有明确说明和测试连接入口占位 | E2E |
| FND-037 | Connector 配置由本地服务持有，浏览器不直接执行 CLI 或读取 Vault 文件系统 | 架构测试/代码审查 |
| FND-038 | API Key 或 Connector 凭据不出现在 API 响应、日志、Generation 请求快照和前端状态中 | 安全测试 |
| FND-039 | Obsidian 路径配置拒绝非目录、不可读目录和路径逃逸；Lark CLI 未安装时返回可操作错误 | 失败场景测试 |

### 2.8 可观测性与质量

| ID | 验收标准 | 验证方式 |
|---|---|---|
| FND-040 | 请求日志包含 request ID、方法、路径、状态和耗时，但不记录正文、凭据或本地绝对路径 | 日志测试 |
| FND-041 | Task 失败可由 Task ID 关联到状态、事件与脱敏错误信息 | 手工诊断演练 |
| FND-042 | 单元、契约、集成和关键 E2E 测试可由仓库脚本一次运行，失败返回非零状态 | CI/命令检查 |
| FND-043 | TypeScript 类型检查、ESLint 和生产构建无错误 | CI |
| FND-044 | 新增代码不依赖旧 `gpt_image_playground` 的内部模块；允许共享明确提取的纯工具包 | 依赖边界检查 |

## 3. 关键端到端场景

### 场景 A：首次启动并创建项目

1. 在不存在 `creator-studio/data` 的环境启动应用。
2. 打开浏览器，默认进入暗色 Dashboard。
3. 创建一个项目并跳转到 Project Overview。
4. 刷新页面后项目仍存在，Workspace 和 Profile 未重复创建。

预期：过程无未处理错误；数据库、项目和偏好均持久化。

### 场景 B：异步任务与断线恢复

1. 在项目内创建 Seed Task。
2. Task 运行期间断开 SSE，再重新连接。
3. 客户端补齐遗漏事件并显示 completed。
4. 刷新页面，从 REST 快照恢复同一终态。

预期：事件不丢失、不重复作用；Task 状态与事件记录一致。

### 场景 C：文件安全边界

1. 上传合法图片并在 Asset 列表查看。
2. 分别提交超限文件、伪造 MIME 和路径穿越输入。
3. 检查数据目录、数据库和日志。

预期：仅合法文件落盘；失败请求无孤儿临时文件，日志不泄露本地路径或敏感数据。

### 场景 D：主题与占位模块

1. 在 Settings 依次切换 dark、light、system。
2. 访问 Assets、Tasks 和尚未实现的 P1 页面。
3. 重载应用并改变系统主题。

预期：主题行为符合选择；所有路由均有完整壳层、清晰状态与可返回路径。

## 4. 非功能基线

以下指标在本地开发基准机、100 个项目、1,000 个 Asset、1,000 个 TaskEvent 的种子数据下验证：

- 冷启动至 health ready：目标小于 3 秒。
- Dashboard 首次可交互：目标小于 2 秒。
- 常用只读 API 的 p95：目标小于 200 ms。
- 创建项目 API 的 p95：目标小于 300 ms。
- SSE 心跳：每 15 秒一次；客户端 45 秒未收到数据视为断线并重连。
- 列表接口默认 30 条，最大 100 条，禁止无界返回。

这些是 Foundation 的工程基线，不是线上 SLA；超出目标时必须记录测量环境和原因，不允许直接删除指标。

## 5. 下一阶段准入条件

只有满足以下条件，才开始 Idea/Topic 等业务能力：

- FND-001 至 FND-044 全部通过，或存在经确认且有明确后续 Issue 的非阻断例外。
- 数据迁移、Task Runtime、SSE 恢复和文件边界至少各有一个集成测试。
- 暗色主主题、主题切换和响应式 App Shell 通过视觉复核。
- Project、Asset、Version 的接口已冻结为 `v1` Foundation 契约。
- Seed Provider 能完整走通“创建 Task → Generation 记录 → 结果持久化”的模拟链路。
- Foundation Issues 中没有未关闭的 P0 阻断项。

## 6. PRD 追踪

| PRD 能力 | Foundation 覆盖 | 后续阶段 |
|---|---|---|
| Workspace / CreatorProfile | 初始化、偏好、单工作区身份 | 多工作区与权限 |
| Project | CRUD、Overview、活动摘要 | 完整创作流程编排 |
| Asset | 本地上传、列表、安全存储 | 素材库增强、生成素材 |
| Version | 通用版本仓储与恢复 | 脚本、节奏、分镜的版本 UI |
| Task | 持久化队列、状态机、SSE | 各领域任务处理器 |
| Provider | 接口、注册表、Seed Provider | 文本、图片、语音、视频 Provider |
| Lark CLI / Obsidian | 设置结构、连接检查边界 | 真实导入、导出与同步 |
| Theme | dark/light/system | 更多品牌化主题 |
