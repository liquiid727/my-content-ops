# SPEC 04: Canvas Runtime — Operation Runtime 与 Provider

> 来源：`.prd` + `01-system` + 来源文档 §11-§19、§28、§60
> 基线：Foundation `tasks` / `task-runner` / `generations` / `providers`
> 状态：待评审

## 1. 目标

把「对 Artifact 执行 AI 能力」做成可插拔系统：Operation 通过 Registry 注册，执行复用 Foundation Task Runtime，Provider 能力从 Seed 扩展到真实模型。**新增能力不改 Node 组件。**

## 2. Operation Registry

### 2.1 四种行为

| behavior | 结果 | 数据动作 |
|---|---|---|
| `create` | 新语义 Artifact | 建 artifact + canvas_node + edge |
| `transform` | 同一 Artifact 新 Version | 建 artifact_version，更新 current_version_id |
| `branch` | 并行新 Artifact | 复制/新建 artifact，parent 链保留 |
| `action` | 副作用（publish/export） | 执行 Run，不产出内容 Artifact |

### 2.2 注册

代码级注册：`operations/registry/definitions.ts` 导出 `OperationDefinition[]`。Registry 提供：

```ts
function getAvailableOperations(ctx: {
  artifact: { kind; role }; connectedInputs: Edge[]; projectContext?: unknown;
  permissions?: unknown; featureFlags?: unknown
}): OperationDefinition[]
```

规则：按 `input.kinds/roles` 过滤 + 按输入 slot 满足度过滤 + 权限/feature flag。**禁止** `if (node.role === 'cover') { showInpaint() }` 式写死。

### 2.3 MVP Operation 矩阵（来源 §28）

- `topic`：edit / generate_outline / generate_script / research / branch
- `outline`：edit / polish / rewrite / expand / shorten / generate_script / generate_article / branch
- `script`：edit / polish / rewrite / shorten / expand / generate_cover / generate_images / generate_voice / generate_video / branch
- `image/cover`：edit_prompt / generate_variants / inpaint / upscale / change_ratio / branch
- `audio/voice`：regenerate / change_voice / change_speed / normalize / generate_video
- `video/draft`：regenerate / add_caption / replace_broll / change_music / publish
- `action/publish`：preview / publish / schedule / export

MVP 先实现：`generate_outline`、`generate_script`、`edit`（manual）、`polish`、`generate_cover`（collection）、`generate_voice`、`publish`（骨架）。其余进 registry 定义但 executor 可返回 `NOT_IMPLEMENTED` 或逐步补。

## 3. Executor 契约

```ts
interface OperationExecutor {
  execute(ctx: ExecutorContext, signal: AbortSignal): Promise<ExecutorResult>
}
interface ExecutorContext {
  projectId: string; runId: string; operationId: string;
  sourceArtifact?: ArtifactVersion;        // 输入内容
  connectedInputs: ArtifactVersion[];      // 上游内容
  config: Record<string, unknown>;
  contextText: string;                     // Context Assembler 产物
  provider: ProviderHandle;                // 按能力选择的 provider
}
interface ExecutorResult {
  outputBehavior: 'new_artifact' | 'new_version' | 'new_collection' | 'side_effect';
  contentRef?: { type: 'asset'; id: string } | { type: 'inline'; text: string };
  role?: string; metadata?: Record<string, unknown>;
  sideEffect?: { kind: string; detail: string };  // action 用
  candidates?: ExecutorResult[];                   // collection 用
}
```

执行器在 Task Runner 内运行：`type: 'operation.<operationId>'` 的 Task，其 handler 调用对应 executor，写回 `runs` 的 output，并产生 `artifact.created / artifact.version.created` 事件。

## 4. Run 生命周期（复用 Task Runtime）

```
queued → running → waiting_review → completed
                   ├── failed
                   └── cancelled
```

- **创建 Run** = 建 `runs` + 建 `tasks(type='operation.X')`，带 `idempotency_key`。
- **幂等**：重复创建同一 idempotencyKey → 返回既有 run（Foundation idempotency 中间件）。
- **取消**：Task Runner 支持 abort（`signal`），cancel 后 Run=cancelled，临时结果不设为 currentVersion；已完成的 provider 资源可保留 orphan，后台清理。
- **重试**：Retry 创建**新 Run**（新 task），不修改原 Run。
- **进度/事件**：SSE 经 Task 事件通道广播（`run.*`），文本生成不按 token 高频刷 Canvas（节流 500ms~2000ms，完成后一次刷新）。

## 5. Provider Seam 扩展

### 5.1 现状（Foundation）

`GenerationProvider` 仅 `text_generation` 能力；`GenerationProviderRegistry.require('text_generation')`；Seed 实现。

### 5.2 扩展

```ts
type ProviderCapability = 'text_generation' | 'image_generation' | 'audio_generation' | 'video_generation'
interface GenerationRequest { prompt: string; config?: Record<string, unknown>; refs?: string[] /* 图片引用 */ }
interface GenerationResult { model: string; text?: string; assetRef?: { type: 'asset'; id: string }; usage?: {...} }
```

- Registry 增加 `require(capability)` 按能力选 provider；executor 通过 `provider: ProviderHandle` 调用。
- `generations` 表已记录 provider/model/usage/latency，真实模型走同一表。
- **配置**：真实 provider（如 OpenAI 文本 + `gpt-image` 系列图片）经 `provider_configs` + `secret_store` 配置；模型 ID 属配置不硬编码。MVP 先接 **文本生成（LLM）** 跑通 Topic→Outline→Script，再接**图片生成**（Script→Cover）与 **TTS**（Script→Voice）。
- Seed provider 保留为无配置时的 fallback（`text_generation`），保证没配 key 也能演示。

## 6. Context Assembly（来源 §19）

统一拼装，禁止每个 Node 自己拼 Prompt：

```
System Capability Context（角色/能力说明）
+ Personal Style（creator-profile renderContext 注入，见 .feature-002/.spec）
+ Project Context（Project Context / brief）
+ Connected Artifact Inputs（上游版本内容）
+ Reference Assets（引用素材）
+ Operation Config
+ User Temporary Instruction（可选）
```

实现：`context/assembler.ts`，`GET /projects/:id/context?scope=X` 返回分层文本。Personal Style 通过 `projects.personal_style_id → creator_profiles.profile_json + injection_json → renderContext(profile, injection, scope)`。

## 7. 新 Operation 的扩展协议（来源 §60）

新增一个 Operation（如 `remove_background`）只需：
1. 注册 `OperationDefinition`（input/output/presentation）
2. 定义 Config Schema
3. 实现 `OperationExecutor`
4. （可选）实现 Result Renderer
5. 添加权限/feature flag
6. 添加测试
**不得修改 Base ImageNode。**

## 8. 错误处理

- Task 失败 → Run failed，`errorCode/errorMessage` 可读；Inspector 显示 human-readable + provider message（折叠）+ [重试]/[修改参数]/[换模型]/[取消]。
- 禁止把原始堆栈展示给普通用户（Foundation handler 已脱敏）。

## 9. 测试策略

- Registry 单元：输入过滤/权限/feature flag。
- Executor 契约：`create/transform/branch/collection/action` 五类结果各自落库正确。
- Run 生命周期：幂等、取消、重试（新 Run）、SSE 事件。
- Context Assembler：分层顺序、Personal Style 开关生效。
- Provider：Seed 回归 + 真实 provider 用 mock 的 HTTP 层。