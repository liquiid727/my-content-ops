# 个人自媒体创作台
# UI / Interaction Design SPEC v0.2

> 本文用于前端 Agent 按统一 UI 和交互实现工作台。  
> 视觉基准：暗黑、低饱和、专业创作者工具；Canvas 是视觉中心；操作收敛到 Inspector；Node 保持轻量。

---

# 1. 主工作台框架

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Logo │ Project A × │ Project B × │ + 新建项目 │ Search │ 分享 │ 发布 │
├───────────────┬───────────────────────────────────────┬──────────────┤
│               │                                       │              │
│ Sidebar       │              Canvas                   │ Inspector    │
│               │                                       │              │
│ 项目          │                                       │              │
│ 节点          │                                       │              │
│ 灵感          │                                       │              │
│ 素材          │                                       │              │
│ 个人风格      │                                       │              │
│ 模板          │                                       │              │
│ 发布          │                                       │              │
│ 历史          │                                       │              │
│               │                                       │              │
├───────────────┴───────────────────────────────────────┴──────────────┤
│                        Canvas Floating Toolbar                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

# 2. 布局尺寸建议

Desktop First。

参考：

```text
Topbar:            56~64px
Sidebar:           176~208px
Inspector:         320~380px
Canvas:            remaining
Bottom Toolbar:    floating
MiniMap:           bottom-left of canvas
```

Inspector 可关闭。

关闭后 Canvas 自动扩大。

Sidebar 可折叠为 Icon Rail。

---

# 3. Visual Direction

关键词：

```text
Dark
Low Saturation
Professional
Creator Tool
Canvas First
Quiet UI
```

禁止：

- 大面积高饱和紫色
- 不同 Node 整卡彩虹填色
- SaaS Dashboard 风格的大量表格
- 面包屑式后台导航
- 多层顶部工具条

Node 颜色只表达轻量语义。

---

# 4. Topbar

左侧：

```text
Logo
Project Tabs
+ New Project
```

右侧：

```text
Search
Notification
Share
Publish
Saved State
Avatar
```

## Project Tab 状态

Default：

```text
AI Agent 视频
```

Active：

- 较亮背景
- 1px subtle border
- title primary

Running：

```text
AI Agent 视频  ●
```

Completed unseen：

```text
AI Agent 视频  3
```

Dirty：

```text
AI Agent 视频  •
```

---

# 5. Sidebar

顺序：

```text
项目
节点
灵感
素材
个人风格
模板
发布
历史
```

底部：

```text
User
Plan
Storage
```

点击 Sidebar Item：

- 切换左侧内容上下文或进入对应 workspace view
- 不影响顶部 Project Tabs

Personal Style 属于全局 Creator Context。

---

# 6. Canvas

Canvas 背景：

- 深灰
- 低对比 dot grid
- grid 不得抢视觉
- connection line 中性灰

Canvas 上主要对象：

```text
Node
Edge
Group
Selection
Comment Marker（未来）
```

---

# 7. Node Base Anatomy

```text
┌──────────────────────────┐
│ [icon] Title        [···] │
│                          │
│ Preview                  │
│                          │
│ Metadata        Status   │
└──────────────────────────┘
```

Node 必须包含：

```text
Header
Preview
Footer
Connection Handles
```

可选：

```text
Run Progress
Avatar
Version
Badge
```

---

# 8. Node 尺寸

Text：

```text
min-width 220
default-width 260
```

Image：

```text
default-width 220~260
```

Video：

```text
default-width 260
```

Collection：

根据候选横向扩展，但建议：

```text
max visible candidates = 4
```

更多候选进入 Inspector。

---

# 9. Node State

## Default

- neutral background
- subtle border

## Hover

- border slightly brighter
- handles visible
- More visible
- Primary action 可显示

## Selected

- accent border
- subtle outer glow
- Inspector open

## Running

- 不要整卡闪烁
- Header 显示 AI running indicator
- Footer 显示 生成中 / progress
- 可 Cancel

## Completed

- muted success text/icon
- 不整卡绿色

## Failed

- subtle red border
- error badge
- Inspector 提供 retry

## Disabled / Waiting Input

- opacity lower
- label "等待输入"

---

# 10. Node LOD

## Far

只显示：

```text
icon
title
status dot
```

## Medium

显示：

```text
title
short preview
status
```

## Near

完整卡片。

注意：

不同 LOD 不改变 Node graph anchor。

---

# 11. Node Click

单击：

```text
Select Node
→ Open Inspector
→ Highlight Incoming/Outgoing Edges softly
```

再次点击已经选中的 Node：

不执行额外动作。

双击：

打开 Advanced Editor / Detail Viewer。

---

# 12. Node Hover Actions

最多：

```text
Primary Action
More
```

例如 Topic：

```text
[继续创作] [...]
```

Image：

```text
[生成变体] [...]
```

不要在 Hover 展示完整 Operation List。

---

# 13. Node More Menu

通用：

```text
重命名
复制
创建分支
移动到分组
查看历史版本
复制链接

断开连接
删除节点
```

Danger Action 分隔显示。

---

# 14. Inspector Shell

```text
┌─────────────────────────────┐
│ Node Icon  Title   Status X │
│                             │
│ 详情 │ 评论 │ 历史版本      │
├─────────────────────────────┤
│                             │
│ Scrollable Content          │
│                             │
└─────────────────────────────┘
```

MVP 评论 Tab 可占位。

---

# 15. Inspector — Details Tab

建议 section 顺序：

```text
1. Preview / Current Content
2. Inputs
3. Config
4. Continue Creation
5. Optimize Current
6. Result / Candidates
7. Metadata
```

不是所有 Node 都显示全部 section。

Schema 根据 Operation 动态渲染。

---

# 16. Inspector Operation Group

Operation 不直接扁平铺 20 个按钮。

按 Group：

```text
继续创作
优化当前内容
创建分支
高级处理
更多
```

例如 Outline：

```text
继续创作
[生成口播稿]
[生成文章]

优化当前内容
[润色]
[改写]
[扩写]
[精简]

分支
[创建另一版大纲]
```

---

# 17. Operation 数量扩展策略

未来一个 Node 可能有 30+ Operation。

UI 必须支持：

## Top 1~2 Primary

直接按钮。

## 3~6 Secondary

Button Grid / Row。

## 其他

```text
更多操作
```

打开 searchable Command Menu：

```text
搜索操作...
```

支持：

- 分类
- 搜索
- 最近使用
- 收藏操作（未来）

这样 Operation 数量增加不会撑爆 Inspector。

---

# 18. Operation Command Palette

当 Node Operation 很多时：

```text
更多操作
 ↓
┌────────────────────────────┐
│ 搜索操作...                 │
├────────────────────────────┤
│ 最近使用                    │
│ 生成变体                    │
│ 高清化                      │
│                             │
│ 图像编辑                    │
│ 局部重绘                    │
│ 扩图                        │
│ 去背景                      │
│                             │
│ 下一步                      │
│ 生成视频                    │
└────────────────────────────┘
```

Command Palette 数据直接来自 Registry。

---

# 19. Operation Configuration

点击 Operation 后三种模式：

## No Config

立即执行。

例如：

```text
Retry
```

## Lightweight Config

Inspector 内 inline 展开。

例如：

```text
润色
→ 强度 / 风格
→ [执行]
```

## Complex Config

打开右侧 Secondary Panel / Modal。

例如：

```text
局部重绘
Video Segment Replace
```

避免 Inspector 无限变长。

---

# 20. CREATE Flow

示例 Topic → Outline。

```text
Select Topic
 ↓
Inspector
 ↓
Generate Outline
 ↓
Config optional
 ↓
Start
 ↓
Canvas 创建 Ghost Node
 ↓
Running
 ↓
Completed
 ↓
Ghost 变真实 Outline
```

推荐创建 Ghost Node，让用户在生成中理解结果将出现在哪里。

Ghost Node：

```text
Outline
AI 正在生成...
Cancel
```

失败后 Ghost 保留：

```text
生成失败
Retry
```

用户可 Delete。

---

# 21. TRANSFORM Flow

示例 Outline Polish。

```text
Select Outline
 ↓
Polish
 ↓
Run
 ↓
Inspector Streaming Preview
 ↓
Completed
 ↓
currentVersion 更新
```

Canvas 不创建新 Node。

Node Footer：

```text
v3
```

完成后可 Toast：

```text
已生成新版本 · 查看对比
```

---

# 22. BRANCH Flow

```text
Select Node
 ↓
Create Branch
 ↓
Choose Operation / duplicate
 ↓
New Artifact
 ↓
New Node
 ↓
Parallel Edge
```

位置：

从 source 向右下 / 右上自动避让。

Branch Node 可显示 tiny branch badge。

---

# 23. ACTION Flow

例如 Publish。

```text
Select Video
 ↓
Publish
 ↓
Platform Config
 ↓
Run
 ↓
Publishing
 ↓
Success / Failed
```

Side effect 不强制创建新 Artifact。

可创建 Publish ActionNode 记录状态。

---

# 24. Node Create — Blank Canvas

双击空白：

```text
Quick Create
```

内容：

```text
常用
Topic
Text
Image
Upload

AI
Generate Image
Research

更多
...
```

第一版简化：

```text
Topic
Text
Image
Upload
```

---

# 25. Node Create — Drag Handle

从 Handle 拖到空白：

显示：

```text
+ Add Next
```

松开：

只显示与 source compatible 的 Operation / Node。

例如 Topic：

```text
生成大纲
深度调研
生成口播稿
生成封面
```

不是显示所有 Node Type。

---

# 26. Node Picker 与 Operation Picker 的区别

Blank Canvas：

**Node Picker**

基于「我要创建什么」。

From Existing Node：

**Operation Picker**

基于「我可以继续做什么」。

必须区分。

---

# 27. Text Node

Canvas Preview：

```text
role label
title
2~6 line content
word count
version
status
```

Inspector：

```text
Current Content
Inputs
Prompt / Style
Continue
Optimize
Version
```

Advanced Editor：

打开完整 text editor。

---

# 28. Image Node

Canvas：

```text
Header
Thumbnail
ratio
status
```

Inspector：

```text
Prompt
Style
Ratio
References
Model

Primary
Generate / Continue Generate

Secondary
Variant
Inpaint
Outpaint
Upscale

Results
[A][B][C][D]
```

---

# 29. Cover Role

Cover 是 Image Node 的 role。

增加：

```text
Title Text
Typography
Safe Area
Platform Ratio
```

不要创建完全独立的 Cover Renderer，除非后续差异足够大。

---

# 30. Collection Node

Canvas：

最多显示 4 个候选。

```text
┌─────────────────────────────┐
│ Cover Variants              │
│ [A] [B] [C✓] [D]           │
│ 4 results                   │
└─────────────────────────────┘
```

点击 Candidate：

- selectedCandidate 更新
- Inspector 展示 candidate detail

双击：

打开 Viewer。

---

# 31. Candidate Select

点击 Select：

```text
Collection.selectedArtifactId = candidate
```

下游默认解析 selected candidate。

如果没有 selected：

下游 Operation 启动前要求用户选择。

---

# 32. Audio Node

Canvas 不做完整编辑。

点击 Play：

Lazy mount audio.

Inspector：

```text
Voice
Speed
Emotion
Language
Input Script
Generate
```

---

# 33. Video Node

Canvas：

poster + duration + status。

Play：

Lazy Player Overlay。

Inspector：

```text
Source
Voice
Visual Assets
Template
Caption
Generate

Replace Segment
Caption
Music
Open Editor
```

---

# 34. Publish

Header 中始终保留主 Publish 按钮。

点击：

若当前项目存在 Final Artifact：

直接进入 Publish Panel。

否则提示：

```text
选择要发布的内容
```

Canvas 的 Publish ActionNode：

用于记录流程，不替代 Header 入口。

---

# 35. Version History

Inspector Tab：

```text
v4 当前
AI · Polish · 20:14

v3
手动编辑 · 19:58

v2
AI · Rewrite · 19:42

v1
AI Generate · 19:10
```

操作：

```text
Preview
Compare
Restore
Create Branch From Version
```

Restore 不删除新版本。

---

# 36. Compare Version

未来可使用 Split View。

MVP：

Text：

- basic diff

Image：

- side-by-side

Video：

- metadata + preview switch

---

# 37. Edge

默认：

- neutral thin line

Hover：

- brighter

Selected Node：

- incoming/outgoing softly highlighted

Running：

不要让 Edge 频繁流光。

最多可有低饱和轻动画。

---

# 38. Connection Validation

不允许连接时：

- handle red / disabled
- tooltip：

```text
该节点不能作为此输入
```

兼容性来自 Operation/Input Slot Schema。

---

# 39. Context Menu

Canvas 空白右键：

```text
新建节点
粘贴
全选
自动整理
适应画布
```

Node 右键：

通用 More Menu。

Edge 右键：

```text
断开连接
```

---

# 40. Multi Selection

框选 / Shift Click。

多选 Node 时 Inspector 变为 Batch Inspector：

```text
已选择 6 个节点

[分组]
[移动]
[删除]
```

不要显示单 Node Operation。

---

# 41. Group

MVP 可先只做 visual group。

后续支持 Subflow。

Collapsed Group：

内部 Node 不渲染详情。

这是未来大 Canvas 性能策略之一。

---

# 42. Canvas Toolbar

Bottom Floating：

```text
Hand
Select
Zoom -
Zoom %
Zoom +
Auto Arrange
Compare
Settings
```

选中工具必须明显。

---

# 43. MiniMap

Bottom Left。

显示：

- Node blocks
- viewport rectangle
- current selection approximate

不要显示缩略图媒体。

---

# 44. Running UX

Operation 开始后：

Inspector：

```text
生成中...
progress
Cancel
```

Canvas：

```text
生成中
```

不要逐 token 重绘全文。

Text streaming 只在 Inspector preview 中。

---

# 45. Completed UX

CREATE：

- Ghost Node → Completed Node
- subtle success animation
- Auto select 可配置

TRANSFORM：

- currentVersion 更新
- Node preview refresh
- Toast "已生成 v4"

BRANCH：

- New Node 轻量出现动画

---

# 46. Failed UX

Canvas：

```text
失败
```

Inspector：

```text
生成失败
简要原因

[重试]
[修改参数]

技术信息 ▸
```

---

# 47. Cancel UX

Cancel 后：

```text
已取消
```

Ghost Node 提供：

```text
重新生成
删除
```

---

# 48. Loading UX

Inspector Operation List 未返回：

Skeleton Button。

不要阻塞 Node 选中。

Node 内容未加载：

Node Summary 先显示，详情后加载。

---

# 49. Empty Canvas

```text
开始你的第一个创作

[创建选题]
[输入文本]
[上传素材]

双击画布也可以快速创建节点
```

---

# 50. Toast

适合：

- Version created
- Saved
- Copied
- Publish success
- Retry started

不要用 Toast 显示长期 Run 进度。

---

# 51. Modal 使用边界

Modal 用于：

- destructive confirm
- complex setup
- platform publish config
- asset picker

轻量 Operation 不用 Modal。

---

# 52. Advanced Editor

打开后可以：

## Desktop

覆盖 Canvas 中央区域，保留 Topbar / Sidebar。

Inspector 可以变成 Editor Inspector。

退出后回 Canvas。

---

# 53. Personal Style 注入可视化

Operation Config 中：

```text
使用个人风格 ✓
张小北 Creator Style
```

用户可临时关闭。

Project 默认由 Project Context 决定。

---

# 54. Operation 来源展示

高级模式可显示：

```text
来自：
Script v3
Personal Style
Reference × 3
```

帮助用户理解 AI 为什么这样生成。

---

# 55. Inspector 可扩展 Section

所有 Section 用统一 Slot：

```ts
type InspectorSection =
  | "preview"
  | "inputs"
  | "config"
  | "operations"
  | "results"
  | "versions"
  | "metadata"
  | string
```

Plugin Operation 可以注册自定义 Section。

---

# 56. Result Renderer Registry

不同 Operation 结果：

```text
text
image-grid
audio
video
comparison
publish-result
```

使用：

```ts
resultRendererRegistry
```

禁止在 Inspector 写大量 Operation id 条件。

---

# 57. Operation UI Schema

示例：

```ts
{
  id: "generate_cover",
  presentation: {
    group: "continue",
    priority: 10,
    placement: "primary"
  },
  configSchema: {
    prompt: { type: "textarea" },
    ratio: { type: "ratio" },
    style: { type: "select" },
    references: { type: "asset-picker" }
  },
  resultRenderer: "image-grid"
}
```

Inspector 自动生成。

---

# 58. Operation 搜索

当 available operations > 8：

Inspector 必须出现：

```text
查看全部操作
```

Command Palette：

- fuzzy search
- group
- keyboard select
- recent operations

这是未来操作持续增加时保持 UI 可用的关键。

---

# 59. Operation Pinning（后续）

用户可把常用操作 Pin 到 Node/Inspector Primary。

例如：

```text
Cover:
Generate Variant
Upscale
```

作为高级个性化能力。

MVP 不实现，但 Registry 数据模型预留。

---

# 60. 操作兼容性

Operation 不兼容时不要展示。

例如：

Image 没有 mask：

`inpaint` 可以展示，但点击先进入 mask editor。

Video 没有 audio：

`replace_voice` 可以 disabled，并说明 required input。

---

# 61. Unsaved State

Canvas layout：

optimistic local update。

后台保存：

debounce。

Topbar：

```text
保存中...
已保存
保存失败
```

Artifact Version 创建必须后端确认后再标 Completed。

---

# 62. Project Switch

切换 Tab：

1. 保存 viewport
2. 保存 selection
3. unmount previous heavy canvas
4. load target graph summary
5. restore viewport
6. restore selected Node if still exists

Run 不停止。

Tab 可显示后台 Run 状态。

---

# 63. Performance UI Rules

任何 Node Renderer：

- 不允许 mount full editor
- 不允许 mount full video
- 不允许同步解析巨大 markdown
- 不允许订阅 global nodes[]
- 不允许加载所有 Versions

所有 detail：

按选中后 Lazy。

---

# 64. Interaction Acceptance Cases

## Case A Topic → Outline

Given：

Topic completed。

When：

点击 Topic → Inspector → 生成大纲。

Then：

- create Run
- Ghost Outline 出现
- Edge 出现
- Run running
- 完成后 Outline Preview 出现
- Inspector 切换到结果或保持 source（产品可配置，MVP 建议自动选中新 Node）

---

## Case B Outline Polish

When：

Outline → 润色。

Then：

- 不创建 Node
- Run running
- Inspector streaming
- complete 后 Version +1
- Node preview 更新

---

## Case C Cover Variants

When：

Script → 生成封面。

Then：

- create Collection / Cover results
- Canvas 展示候选最多 4 个
- Inspector 展示全部结果
- Candidate 可 Select
- selected result 可作为下游 input

---

## Case D Failed

When：

Run failed。

Then：

- Canvas 不消失
- 保留 error state
- Inspector 提供 retry
- Retry creates new Run

---

# 65. 设计验收清单

- [ ] 暗黑低饱和
- [ ] Header 有多项目 Tabs
- [ ] 分享 / 发布在右上角
- [ ] Sidebar 有个人风格
- [ ] Canvas 是主视觉
- [ ] Inspector 固定右侧
- [ ] Node 卡片颜色克制
- [ ] Operation 不堆在 Canvas Node
- [ ] Operation 可从 Registry 扩展
- [ ] 超过 8 个 Operation 可进入搜索列表
- [ ] Text/Image/Audio/Video/Collection 状态一致
- [ ] Running / Failed / Completed 明确
- [ ] Transform 不创建 Node
- [ ] Create 会产生新 Node
- [ ] Branch 视觉明确
- [ ] Version History 可追溯
- [ ] Result Collection 可选择
- [ ] Media Lazy
- [ ] Project Switch 有恢复行为

---

# 66. Agent UI 实现顺序

## UI-01 Shell

- Topbar
- Project Tabs
- Sidebar
- Canvas Shell
- Inspector Shell

## UI-02 Node Base

- BaseNode
- TextNode
- ImageNode
- AudioNode
- VideoNode
- CollectionNode
- ActionNode

## UI-03 Interaction

- select
- hover
- drag
- edge
- context menu
- quick create

## UI-04 Inspector

- schema fields
- operation groups
- results
- version

## UI-05 Run States

- ghost node
- running
- complete
- failed
- retry
- cancel

## UI-06 Performance

- LOD
- culling
- lazy media
- project unmount

---

# 67. 最终交互原则

> **用户在 Canvas 上理解创作，用户在 Inspector 中操作创作，用户在 Version 中追溯创作，Operation Registry 让能力持续增长而不破坏 UI。**
