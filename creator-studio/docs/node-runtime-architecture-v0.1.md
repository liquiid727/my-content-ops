# 个人自媒体创作台 — Node Runtime Architecture v0.1

> 目标：为「无限画布 + AI 创作 Pipeline」定义一套可长期扩展的节点架构，避免随着 Topic、Outline、Script、Cover、Image、Voice、Video、Publish 等能力增加而出现节点类型爆炸、状态耦合、渲染性能下降和执行逻辑不可维护的问题。

---

## 0. 文档结论

整个节点系统建议严格拆成 5 个核心概念：

```text
Node        = 画布上的表现实体
Artifact    = 真实内容实体
Version     = 内容版本
Operation   = 对内容执行的能力
Run         = 某一次 Operation 的实际执行
```

核心原则：

```text
Canvas 是表现层
Artifact 是内容层
Operation 是能力层
Run 是执行层
Version 是历史层
```

例如：

```text
Topic Artifact
    ↓
generate_outline Operation
    ↓
Run #001
    ↓
Outline Artifact v1
    ↓
polish Operation
    ↓
Run #002
    ↓
Outline Artifact v2
```

画布中仍然只需要：

```text
Topic ─────→ Outline
```

而不是：

```text
Topic
 ↓
Generate Outline
 ↓
Outline v1
 ↓
Polish Outline
 ↓
Outline v2
```

这条边界是整个系统是否能长期维护的关键。

---

# 1. 为什么不能「一个操作一个 Node」

如果把以下内容全部作为节点：

- 生成大纲
- 润色大纲
- 修改大纲
- 扩写大纲
- 精简大纲
- 生成封面
- 修改封面
- 扩图
- 高清化
- 生成视频
- 视频补帧
- 视频替换片段

Canvas 会迅速变成「操作日志」，而不是「内容关系图」。

最终的问题包括：节点数量爆炸、Edge 数量爆炸、版本关系与内容关系混在一起、前端出现大量类型分支、后端执行器与 UI 强绑定，以及性能越来越难控制。

正确模型应当是：

```text
内容变化但语义不变 → Version
内容阶段发生变化   → 新 Artifact / 新 Node
用户主动保留方向   → Branch
AI 执行过程        → Run
```

---

# 2. 核心领域模型

## 2.1 Project

Project 是一次完整创作任务，例如《AI Agent 到底有什么用？》。

Project 内包含：

- Graph
- Canvas Layout
- Artifacts
- Versions
- Edges
- Runs
- Project Context
- Selected Personal Style
- Assets
- Publish Records

建议：

```ts
interface Project {
  id: string
  title: string
  graphId: string
  contextId?: string
  personalStyleId?: string
  createdAt: string
  updatedAt: string
}
```

---

# 3. CanvasNode

CanvasNode 只负责「画布表现」。不要把正文、高清图片、视频 Blob、完整生成历史直接塞进 Node。

```ts
interface CanvasNode {
  id: string
  projectId: string
  artifactId: string
  x: number
  y: number
  width?: number
  height?: number
  collapsed?: boolean
  zIndex?: number
  renderer?: string
  createdAt: string
  updatedAt: string
}
```

CanvasNode 主要保存：

```text
artifactId
位置
尺寸
折叠状态
UI 状态
```

而不是：正文、视频、图片、生成历史、AI Prompt、所有配置。

---

# 4. Artifact

Artifact 是真正的内容实体。

例如：

```text
Topic
Outline
Script
Cover
Image
Voice
Video
Publish
```

不要把 Cover、Illustration、Thumbnail 全部分成数据库层面的不同大类，更适合：

```ts
interface Artifact {
  id: string
  projectId: string
  kind:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "action"
    | "collection"
  role: string
  currentVersionId?: string
  createdAt: string
  updatedAt: string
}
```

例如：

```ts
{ kind: "image", role: "cover" }
{ kind: "image", role: "illustration" }
{ kind: "text", role: "outline" }
{ kind: "text", role: "script" }
```

这样可以共享同一套 Image/Text/Audio/Video 基础能力。

---

# 5. ArtifactVersion

同一个 Artifact 的修改，不应该不断产生新 Node，而应该生成新的 Version。

```text
Outline

v1 AI Generate
 ↓
v2 User Edit
 ↓
v3 AI Polish
 ↓
v4 User Edit
```

建议：

```ts
interface ArtifactVersion {
  id: string
  artifactId: string
  parentVersionId?: string
  contentRef: string
  metadata?: Record<string, unknown>
  source: "ai" | "user" | "import" | "system"
  operationRunId?: string
  createdBy?: string
  createdAt: string
}
```

---

# 6. Operation

Operation 表示「对一个或多个 Artifact 执行什么能力」。

例如：

```text
generate_outline
polish
rewrite
expand
shorten

generate_image
variation
inpaint
outpaint
upscale

tts
voice_clone

generate_video
replace_segment
extend_video

publish
```

建议：

```ts
interface OperationDefinition {
  id: string
  name: string
  accepts: InputSlotDefinition[]
  produces: OutputDefinition[]
  configSchema: unknown
  executor: string
  capabilityGroup?: string
  supportsStreaming?: boolean
  supportsCancellation?: boolean
  supportsRetry?: boolean
}
```

---

# 7. Run

Run 是一次真实执行。

```text
Run #1038
operation = generate_cover
status = running
progress = 63%
model = xxx
cost = xxx
```

```ts
type RunStatus =
  | "queued"
  | "running"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled"

interface Run {
  id: string
  projectId: string
  operationId: string
  inputVersionIds: string[]
  outputVersionIds?: string[]
  status: RunStatus
  progress?: number
  startedAt?: string
  completedAt?: string
  errorCode?: string
  errorMessage?: string
  cost?: number
  model?: string
  config?: Record<string, unknown>
}
```

---

# 8. Edge

Edge 表示内容之间的依赖关系，不应该只是视觉连线。

```ts
interface Edge {
  id: string
  projectId: string
  sourceArtifactId: string
  targetArtifactId: string
  inputSlot: string
  createdAt: string
}
```

例如：

```text
Topic ---- topic ----→ Outline
Outline ---- outline ----→ Script
Script ---- script ----→ Voice
```

这样执行 Operation 时可以明确知道输入来自哪里。

---

# 9. Node、Version、Branch、Run 的判断规则

## 新 Node

内容语义发生变化：

```text
Topic → Outline → Script → Voice
```

## 新 Version

同一个内容继续变化：

```text
Outline v1 → polish → Outline v2 → manual edit → Outline v3
```

Canvas 中仍然只是一个 Outline。

## Branch

用户希望明确保留多个方向：

```text
             Outline A
Topic ──────┤
             Outline B
```

或者：

```text
           Cover A
Script ─── Cover B
           Cover C
```

## Run

AI 的 queued / running / completed / failed / retry 只是执行状态，永远不是 Canvas Node。

---

# 10. Node Family

建议 MVP 先统一成 6 个 Node Family。

## 10.1 Text Node

包括 Topic、Research、Outline、Title、Script、Article、Xiaohongshu Copy、Podcast Outline。

```text
┌─────────────────────────┐
│ T  口播稿 v2         ··· │
│                         │
│ AI Agent 到底有什么用？  │
│ 今天我们来聊聊……        │
│                         │
│ 1324 字          已完成  │
└─────────────────────────┘
```

差异主要来自 role、prompt、output format、capabilities、default config。

## 10.2 Image Node

包括 Cover、Illustration、Thumbnail、Poster、Reference Image。

```text
┌────────────────────┐
│ ▧ 封面图 v2     ··· │
│                    │
│     [ Preview ]    │
│                    │
│ 9:16     已完成 ✓  │
└────────────────────┘
```

基础能力：Generate、Regenerate、Variation、Inpaint、Outpaint、Upscale、Replace、Edit Prompt。

Cover 专属：Edit Title、Typography、Safe Area、Platform Ratio。

Illustration 专属：Match Paragraph、Character Consistency、Visual Style Consistency。

## 10.3 Audio Node

包括 TTS、Voice、BGM、SFX。

```text
┌──────────────────────┐
│ ♫ 配音            ··· │
│                      │
│ ▷ ～～～～～～～～    │
│                      │
│ 02:31       已完成 ✓ │
└──────────────────────┘
```

基础能力：Generate、Regenerate、Change Voice、Change Speed、Change Emotion、Noise Reduction、Normalize。

## 10.4 Video Node

包括 Video Draft、Image-to-Video、Talking Avatar、Montage、Final Video。

```text
┌─────────────────────┐
│ ▷ 视频草稿 v1    ··· │
│                     │
│      [Preview]      │
│         ▶           │
│                     │
│ 02:31     已完成 ✓  │
└─────────────────────┘
```

基础能力：Generate、Regenerate、Replace Segment、Extend、Add Caption、Add Voice、Open Editor。

## 10.5 Collection Node

AI 一次通常生成多个候选，因此 Collection 应成为一等公民。

同一模型可用于：多标题、多封面、多开头、多 B-roll、多 Voice、多视频版本。

```ts
interface CollectionArtifact {
  candidateArtifactIds: string[]
  selectedArtifactId?: string
}
```

## 10.6 Action Node

包括 Publish、Export、Save to Obsidian、Send to Lark、Upload to Platform。

```text
┌──────────────────────┐
│ ↗ 发布                │
│                      │
│ 抖音   B站   视频号   │
│                      │
│              已发布 ✓│
└──────────────────────┘
```

---

# 11. Capability Registry

这是整个系统最重要的扩展点之一。

不要在 UI 中不断写：

```ts
if (node.type === "cover") ...
if (node.type === "outline") ...
if (node.type === "video") ...
```

统一使用：

```ts
getCapabilities(artifact)
```

```ts
interface CapabilityDefinition {
  id: string
  acceptsKinds: string[]
  acceptsRoles?: string[]
  label: string
  configSchema?: unknown
  executor: string
  placement: "primary" | "secondary" | "more"
  createsNewArtifact?: boolean
  createsNewVersion?: boolean
}
```

示例：

```text
outline:
  generate
  edit
  polish
  rewrite
  expand
  shorten
  branch
  generate_script

image:
  generate
  variation
  inpaint
  outpaint
  upscale
  replace

video:
  generate
  replace_segment
  extend
  caption
  voice
  open_editor
```

---

# 12. 每个 Operation 必须声明结果语义

Operation 必须明确执行完之后是：新 Artifact、新 Version、新 Collection，还是副作用。

```text
polish_outline
→ SAME_ARTIFACT_NEW_VERSION

generate_script_from_outline
→ NEW_ARTIFACT

generate_cover_variants
→ NEW_COLLECTION

upscale_image
→ SAME_ARTIFACT_NEW_VERSION
```

```ts
type OutputBehavior =
  | "new_artifact"
  | "new_version"
  | "new_collection"
  | "side_effect"
```

---

# 13. MVP Node 规格

## 13.1 Topic

Input：Inspiration、User Input、Research、Personal Style。

Config：Platform、Audience、Content Goal、Topic Angle。

Operations：Generate、Rewrite、Expand、Research、Generate Outline、Generate Script、Generate Cover。

Output：`Text Artifact / role = topic`。

Next：Research、Outline、Script、Cover。

## 13.2 Outline

Input：Topic、Research、Personal Style、References。

Config：Structure、Length、Platform、Tone、Detail Level。

Operations：Generate、Polish、Rewrite、Expand、Shorten、Manual Edit、Create Branch、Generate Script、Generate Article。

Polish / Rewrite / Expand / Shorten / Manual Edit 默认产生同 Artifact 的新 Version。

## 13.3 Script

Input：Topic、Outline、Research、Personal Style。

Config：Platform、Duration、Tone、Speaking Style、Hook Type。

Operations：Generate、Rewrite、Polish、Shorten、Expand、Generate Hook、Manual Edit、Generate Voice、Generate Cover、Generate Video。

Output：`Text Artifact / role = script`。

## 13.4 Cover

Input：Topic、Script、Personal Style、References。

Config：Prompt、Style、Ratio、Model、Reference Images、Title Text、Platform。

Operations：Generate、Regenerate、Generate Variants、Edit Prompt、Inpaint、Outpaint、Upscale、Edit Title、Change Layout、Select Candidate。

Output：`Image Artifact / role = cover`。

## 13.5 Illustration

Input：Script、Article Paragraph、Reference Assets、Visual Style。

Config：Prompt、Ratio、Style、Character Consistency、Scene。

Operations：Generate、Variation、Inpaint、Outpaint、Upscale、Replace、Match Style。

Output：`Image Artifact / role = illustration`。

## 13.6 Voice

Input：Script、Voice Profile。

Config：Voice、Speed、Emotion、Pause、Language。

Operations：Generate、Regenerate、Change Voice、Change Speed、Change Emotion、Noise Reduction。

Output：`Audio Artifact / role = voice`。

## 13.7 Video

Input：Script、Voice、Images、Cover、B-roll、Music。

Config：Ratio、Duration、Template、Style、Caption、Transition。

Operations：Generate、Regenerate、Replace Segment、Extend、Add Subtitle、Replace B-roll、Change Music、Open Timeline Editor。

Output：`Video Artifact / role = draft | final`。

## 13.8 Publish

Input：Final Video / Article / Image。

Config：Platform、Title、Description、Tags、Schedule、Privacy。

Operations：Preview、Publish、Schedule、Republish、Export。

Output 主要是 Side Effect：`PublishRecord`。

---

# 14. Canvas Node UI 规则

Node 本身只负责：

```text
Preview
Status
Primary Action
More
```

不要把所有操作塞在 Node 上。

例如：

```text
┌──────────────────────┐
│ T  大纲 v3        ··· │
│                      │
│ 1. AI Agent 是什么   │
│ 2. 为什么突然火了     │
│ 3. 实际场景           │
│                      │
│ 1230字        已完成 ✓│
└──────────────────────┘
```

Hover 可显示 `[继续创作] [...]`，完整操作进入右侧 Inspector。

---

# 15. Inspector Architecture

推荐固定结构：

```text
HEADER
节点名称 / 状态 / More

TABS
详情 / 评论 / 历史版本

INPUT
上游输入

CONFIG
Prompt / 参数 / 参考资料 / 模型

PRIMARY ACTION
生成 / 修改

RESULT
生成结果 / 候选

SECONDARY ACTION
变体 / 对比 / 重试 / 编辑
```

整个 Inspector 应由 Schema 驱动。

```ts
interface FieldDefinition {
  id: string
  type:
    | "text"
    | "textarea"
    | "select"
    | "slider"
    | "switch"
    | "asset"
    | "model"
    | "ratio"
  label: string
  defaultValue?: unknown
  options?: unknown[]
}

interface NodeDefinition {
  kind: string
  role: string
  renderer: string
  fields: FieldDefinition[]
  capabilities: string[]
}
```

```text
NodeDefinition
      ↓
Inspector Renderer
      ↓
动态生成配置表单
```

---

# 16. Node 生命周期

推荐统一：

```text
Draft
 ↓
Ready
 ↓
Queued
 ↓
Running
 ↓
Completed
 ├─ Selected
 └─ Regenerate

Failed
Waiting Input
Cancelled
```

UI 可简化为：

```text
○ 未配置
○ 待生成
◌ 生成中
✓ 已完成
● 已选中
! 失败
```

---

# 17. 性能架构总原则

Canvas 不应采用传统 Virtual List 作为核心思路，更适合：

```text
Viewport Culling
+
LOD
+
Lazy Content
+
State Isolation
+
Media Preview
```

Virtual List 主要用于 Asset Library、History、Run Log、Version List、Search Result、Template List。

---

# 18. Viewport Culling

视口外节点：

```text
不挂载复杂 Node UI
不加载媒体
不加载 Editor
不创建 Video Player
不加载完整 Waveform
```

视口进入后再恢复。

---

# 19. LOD — Level of Detail

根据 Zoom Level 渲染不同 UI。

## Zoom < 35%

只显示 Icon、Title、Status。

## Zoom 35% ~ 70%

显示 Title、Thumbnail、Status、Basic Metadata。

## Zoom > 70%

显示 Preview、Metadata、Hover Action、Detail Status。

---

# 20. Media Lazy Loading

## Video Node

Canvas 不要长期挂真实 `<video>`。只保存 poster、duration、status，用户点击播放后再 mount real player。

## Audio Node

Canvas 使用 pre-generated waveform preview。真正 Waveform Editor 只在高级编辑器加载。

## Text Node

Canvas 只显示约 100~200 字 Preview。真正编辑器放在 Inspector / Modal / Advanced Editor。

---

# 21. State Isolation

推荐至少三套 Store。

## CanvasStore

```text
positions
viewport
selection
dragging
hover
zoom
```

## ArtifactStore

```text
content
metadata
versions
currentVersion
```

## RunStore

```text
queue
generating
progress
error
cost
```

不要全部堆在 `node.data`。

---

# 22. React Render 边界

Node Component 应尽量只订阅自己需要的数据。

错误：所有 Node 都订阅整个 `nodes[]`。

正确：Node A 只订阅 artifact A summary + node A layout + run A status。

Selection、Dragging 等状态也应独立，避免位置更新导致所有内容组件 re-render。

---

# 23. AI Streaming 更新策略

不要让每一个 Token 都刷新 Canvas。

建议：

- Inspector：允许 Streaming。
- Canvas：低频显示 `Generating...` 或粗粒度 Progress。
- 完成后一次性刷新 Preview。

视频、图片、语音生成同理。

---

# 24. 多项目 Tab

顶部可以同时显示多个 Project，但不要同时 mount 多个 Canvas。

正确模型：

```text
Current Project
      ↓
Active Canvas
```

非当前项目只保存 viewport、selection、layout、dirty state、run summary，切回来再恢复 Canvas。

---

# 25. Canvas Component Architecture

```text
CanvasRoot
│
├── ViewportLayer
├── EdgeLayer
├── NodeLayer
│   ├── TextNode
│   ├── ImageNode
│   ├── AudioNode
│   ├── VideoNode
│   ├── CollectionNode
│   └── ActionNode
│
├── SelectionLayer
├── MiniMap
├── CanvasToolbar
└── ContextMenu
```

---

# 26. Runtime Architecture

```text
User
 ↓
UI Command
 ↓
Capability Registry
 ↓
Operation Definition
 ↓
Resolve Inputs
 ↓
Create Run
 ↓
Execution Engine
 ↓
Provider / Model
 ↓
Result
 ↓
Artifact Version
 ↓
Update Artifact
 ↓
Update Canvas Preview
```

React 组件不应直接调用模型 Provider。

```ts
interface OperationExecutor {
  execute(
    run: Run,
    context: ExecutionContext
  ): Promise<ExecutionResult>
}

interface ExecutionContext {
  projectId: string
  inputs: ResolvedInput[]
  personalStyle?: unknown
  projectContext?: unknown
  references?: unknown[]
  signal?: AbortSignal
}
```

---

# 27. Provider Adapter

Operation 不应该直接绑定 Provider。

```text
ImageProvider
├─ Provider A
├─ Provider B
└─ Provider C

LLMProvider
├─ Provider A
└─ Provider B

VoiceProvider
└─ ...

VideoProvider
└─ ...
```

Operation 如 `generate_cover` 只知道需要 image generation capability，具体调用哪家由 Provider Router 决定。

---

# 28. Event System

推荐 Runtime 通过 Event 驱动 UI。

```text
run.created
run.started
run.progress
run.completed
run.failed

artifact.created
artifact.version.created
artifact.updated

node.created
node.moved

edge.created
edge.deleted
```

UI 不直接知道后端执行细节。

---

# 29. 数据持久化层

推荐逻辑表：

```text
projects
canvas_nodes
canvas_edges
artifacts
artifact_versions
operation_definitions
runs
project_contexts
personal_styles
assets
publish_records
```

---

# 30. 推荐 TypeScript 总模型

```ts
type ArtifactKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "collection"
  | "action"

interface Artifact {
  id: string
  projectId: string
  kind: ArtifactKind
  role: string
  currentVersionId?: string
}

interface CanvasNode {
  id: string
  artifactId: string
  x: number
  y: number
  width?: number
  height?: number
  collapsed?: boolean
}

interface ArtifactVersion {
  id: string
  artifactId: string
  parentVersionId?: string
  contentRef: string
  source: "ai" | "user" | "import" | "system"
  operationRunId?: string
}

interface Edge {
  id: string
  sourceArtifactId: string
  targetArtifactId: string
  inputSlot: string
}

interface OperationDefinition {
  id: string
  accepts: InputSlotDefinition[]
  produces: OutputDefinition[]
  configSchema: unknown
  executor: string
  outputBehavior:
    | "new_artifact"
    | "new_version"
    | "new_collection"
    | "side_effect"
}

interface Run {
  id: string
  operationId: string
  inputVersionIds: string[]
  status:
    | "queued"
    | "running"
    | "waiting_input"
    | "completed"
    | "failed"
    | "cancelled"
  progress?: number
  outputVersionIds?: string[]
}
```

---

# 31. 推荐目录结构

```text
src/
├── canvas/
│   ├── components/
│   ├── nodes/
│   ├── edges/
│   ├── toolbar/
│   ├── minimap/
│   └── store/
│
├── artifacts/
│   ├── domain/
│   ├── repository/
│   └── services/
│
├── operations/
│   ├── registry/
│   ├── definitions/
│   ├── executors/
│   └── schemas/
│
├── runtime/
│   ├── engine/
│   ├── queue/
│   ├── events/
│   └── providers/
│
├── inspector/
│   ├── renderer/
│   ├── fields/
│   └── actions/
│
├── versions/
├── projects/
└── shared/
```

---

# 32. 第一阶段不要做的东西

MVP 阶段建议避免：

1. 完整 DAG 自动调度器
2. 任意循环 Graph
3. 所有节点后台自动执行
4. Canvas 内完整视频剪辑器
5. Canvas 内完整富文本编辑器
6. 每个 Provider 独立一套 Node
7. 每个操作独立一种 Node
8. 把全部 Artifact 数据塞 Node Store
9. 所有 Project Canvas 同时 mount
10. 每 Token 更新 Canvas

---

# 33. MVP 推荐运行方式

第一阶段更适合 User Driven Pipeline：

```text
Topic
 ↓ 点击生成 Outline
Outline
 ↓ 点击生成 Script
Script
 ↓ 点击生成 Cover
 ↓ 点击生成 Voice
 ↓ 点击生成 Video
```

后续再升级：

```text
Semi Automatic
→ Run Next
→ Run Branch
→ Run Pipeline
```

再后续才进入 Agentic Workflow。

因此底层可以按 DAG 建模，但第一版 UI 不必暴露完整 Workflow Engine。

---

# 34. Node 创建入口

推荐至少三个入口：

1. 从当前 Node 继续
2. Canvas 空白处 `+ Add Node`
3. Edge Quick Insert

例如 Topic 的「继续创作」：

```text
生成大纲
生成口播稿
生成封面
深度调研
```

---

# 35. Node 操作分层

不要一次显示所有 Capability。

## Primary

```text
Generate
Continue
Open
```

## Secondary

```text
Regenerate
Edit
Variation
Compare
```

## More

```text
Duplicate
Branch
Disconnect
Delete
Version History
```

---

# 36. Inspector 与 Advanced Editor

统一采用：

```text
Canvas Node
    ↓
Inspector
    ↓
Advanced Editor
```

Canvas：看结果、看状态、看关系。

Inspector：配置、生成、轻量修改、版本。

Advanced Editor：复杂正文编辑、图片局部编辑、视频 Timeline、高级音频编辑。

---

# 37. 性能目标建议

初始目标可设：

- 普通项目：100~300 Nodes 保持流畅。
- 中大型项目：500~1000 Nodes 通过 viewport culling、LOD、lazy media、collapsed groups 仍可用。
- 超大项目：通过 group collapse、subflow、scene/project split 拆分，而不是无限堆在一个 Canvas。

---

# 38. 性能测试清单

建立基准项目：

```text
100 Nodes
300 Nodes
500 Nodes
1000 Nodes
```

测试：

- Initial Load
- Pan FPS
- Zoom FPS
- Node Drag
- Multi Select
- Edge Create
- Inspector Open
- Node Update
- Generation Progress Update
- Project Switch
- Memory Usage

重点关注 Panning、Dragging、Selection、Run Progress、Media Mount。

---

# 39. 最重要的 10 条原则

1. **Node 代表内容，不代表操作。**
2. **同一内容修改使用 Version，不创建新 Node。**
3. **AI 执行过程使用 Run，不创建 Node。**
4. **不同语义内容才创建新的 Artifact / Node。**
5. **用户明确保留不同方向时才 Branch。**
6. **所有操作统一通过 Capability Registry 注册。**
7. **CanvasNode 与 Artifact 数据彻底分离。**
8. **Canvas 使用 Viewport Culling + LOD + Lazy Media，而不是传统 Virtual List。**
9. **Canvas 只做预览，复杂编辑进入 Inspector / Advanced Editor。**
10. **运行时 Runtime 与 React UI 解耦。**

---

# 40. 推荐 MVP 实现顺序

## Phase 1 — Domain

先实现：Project、CanvasNode、Artifact、ArtifactVersion、Edge、Run。

## Phase 2 — Base Canvas

实现：Text Node、Image Node、Audio Node、Video Node、Action Node、Collection Node。

## Phase 3 — Capability Registry

先支持：Generate、Edit、Regenerate、Branch、Version。

## Phase 4 — MVP Operations

实现：Topic、Outline、Script、Cover、Image、Voice、Video、Publish。

## Phase 5 — Runtime

加入：Queue、Progress、Retry、Cancel、Provider Adapter。

## Phase 6 — Performance

加入：Viewport Culling、LOD、Lazy Media、Store Isolation、Project Canvas Unmount。

## Phase 7 — Advanced Editor

最后再进入：Rich Text Editor、Image Editor、Video Timeline、Audio Editor。

---

# 41. 正式开发前需要继续确认的问题

1. Edge 是否允许一个 Input Slot 连接多个 Artifact？
2. Node 删除时是否删除 Artifact？
3. Branch 后 Version 如何继承？
4. Candidate / Collection 是否保存所有 Artifact？
5. AI Run 是否支持 Undo？
6. 多个 Run 同时修改同一 Artifact 如何做冲突处理？
7. Personal Style 在 Operation 的哪个阶段注入？
8. Project Context 如何参与 Prompt Assembly？
9. Provider 切换时如何保存生成参数？
10. Video 是否属于一个 Artifact，还是 Scene Collection？
11. Publish 是否应该是 Canvas Node，还是纯 Project Action？
12. 自动 Pipeline 最终允许到什么程度？

---

# 42. 后续建议拆出的文档

```text
Node Runtime Architecture v0.1   ← 当前文档

MVP Node Specification v0.1
├─ Topic
├─ Outline
├─ Script
├─ Cover
├─ Image
├─ Voice
├─ Video
└─ Publish

Canvas Performance Architecture v0.1
Operation Registry Specification v0.1
Database Schema v0.1
```

这样后续可以直接进入 TypeScript 类型、数据库 Schema、API、Canvas Node Renderer、Runtime Engine，而不需要继续在 UI 和架构之间来回推翻。
