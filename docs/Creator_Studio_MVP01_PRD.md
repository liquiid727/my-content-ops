# Creator Studio — MVP01 产品需求文档（PRD）

> 版本：MVP01 / v0.1  
> 产品形态：个人自媒体 AI 创作工作台  
> 设计基准：以当前已提供的 Creator Studio UI 草稿为主要视觉方向  
> 目标：先完成一条“灵感 → 选题 → 口播稿 → 节奏 → 语音 → 图片/封面 → 视频 → 知识沉淀”的可用闭环，并为后续插件、工作流、发布、数据分析预留扩展能力。

---

## 0. 文档结论

MVP01 不做“大而全的 AI 工具箱”，而是做一个围绕 **Content Project（内容项目）** 运转的创作工作台。

用户不是先选择“GPT / 图片模型 / 视频模型”，而是先创建一条内容，然后让系统沿着统一流水线持续推进：

**灵感 → 选题 → 项目 → 口播稿 → 节奏 → 画面 → 封面 → 语音 → 视频 → 版本 → 知识沉淀**

底层模型、Agent、Prompt、CLI 和插件属于“能力层”，默认不抢占普通创作者的注意力。

---

# 1. 产品定位

## 1.1 一句话定位

Creator Studio 是一个面向个人内容创作者的 AI 原生内容生产工作台，帮助用户在一个项目上下文中完成从灵感、选题、脚本、节奏设计，到图片、封面、语音和视频生成，并把创作知识同步沉淀到 Lark / Obsidian。

## 1.2 MVP01 核心价值

MVP01 解决三个问题：

1. **创作上下文不再断裂**：每一条内容都属于一个 Project，脚本、图片、声音、视频、来源、版本全部互相关联。
2. **AI 不只是聊天，而是在推进创作流程**：系统知道当前项目做到哪一步、下一步是什么，并以 Task 的方式执行生成。
3. **知识资产可以回流**：灵感、资料、脚本、复盘内容能够与 Lark / Obsidian 连接，成为后续持续创作的个人知识库。

---

# 2. MVP01 范围

## 2.1 P0：必须完成

- 首页 Dashboard
- 内容项目 Project
- 灵感中心
- 选题中心
- 口播稿生成与编辑
- 节奏设计
- 图片生成 / 图片资产
- 封面制作
- 语音生成
- 视频生成
- 基础视频时间线
- 项目版本管理
- AI 任务运行状态
- 素材资产库
- Lark CLI 连接
- Obsidian 连接
- 基础知识检索
- 全局 AI 创作入口
- 统一 AppShell / Design System

## 2.2 P1：MVP01 后半段或 0.1.x

- 简化 AI Canvas
- Prompt 模板
- 创作者品牌档案
- 视频字幕样式
- BGM 基础能力
- 批量生成封面
- 多模型切换
- 自动从知识库补充创作上下文
- 项目模板
- 内容导出包

## 2.3 本阶段明确不做

- 完整剪映级非线性视频编辑器
- 多人协作
- 完整插件商城
- 复杂节点式 Workflow Builder
- 多平台自动发布
- 全平台数据分析
- 复杂计费系统
- 企业权限体系
- 移动端完整适配
- 直播能力
- 完整社媒账号矩阵管理

---

# 3. 目标用户

## 3.1 第一目标用户

个人知识型 / AI / 科技 / 教程类创作者。

典型工作：

- 收集热点与资料
- 写口播稿
- 做短视频
- 做知识卡片
- 做封面
- 配音
- 将灵感和资料沉淀到个人知识库

## 3.2 MVP 用户特点

- 单人使用优先
- Desktop First
- 愿意使用 AI
- 有自己的内容资料库
- 可能已经使用 Lark / 飞书和 Obsidian
- 对“模型技术细节”有一定接受度，但主要目标仍然是完成内容

---

# 4. 核心概念

## 4.1 Workspace

用户的创作工作区。MVP 可以默认每个用户只有一个 Workspace，但数据库结构必须保留 `workspace_id`。

## 4.2 Content Project

所有创作流程的核心对象。

例如：**普通人如何搭建第一个 AI Agent**

一个项目中包含：

- Brief
- Sources
- Idea
- Topic
- Script
- Rhythm Plan
- Images
- Cover
- Voice
- Shots
- Video
- Assets
- Versions
- Tasks
- Knowledge Links

## 4.3 Asset

统一素材对象。类型包括：image / cover / audio / video / document / subtitle / source / thumbnail。

## 4.4 Version

任何 AI 生成结果都尽量版本化，例如 Script v1/v2/v3、Cover v1/v2/v3、Voice v1/v2、Video v1/v2。

原则：**生成不是覆盖，而是追加版本。**

## 4.5 Task

所有耗时 AI 任务统一抽象为 Task。

类型例如：research、topic_generation、script_generation、rhythm_generation、image_generation、cover_generation、voice_generation、shot_generation、video_generation、sync_lark、sync_obsidian。

状态：queued / running / waiting_review / completed / failed / cancelled。

---

# 5. 核心用户流程

## 5.1 Hero Flow

首页输入：

> 帮我做一期“普通人如何搭建第一个 AI Agent”的 60 秒口播视频。

系统：

1. 创建 Project
2. 读取创作者配置
3. 搜索 / 读取指定知识源
4. 生成 5–10 个选题角度
5. 推荐 1 个主选题
6. 生成口播稿
7. 自动拆分节奏段落
8. 生成画面建议
9. 生成必要图片
10. 生成 3 套封面
11. 生成语音
12. 生成视频分镜
13. 生成视频草稿
14. 用户人工调整
15. 保存最终版本
16. 可选：同步脚本 / 项目总结到 Lark / Obsidian

---

# 6. 信息架构

```text
Creator Studio
│
├── 首页
│
├── 创作
│   ├── 创作空间
│   ├── 灵感与选题
│   ├── AI 画布
│   ├── 封面制作
│   ├── 图像创作
│   ├── 视频制作
│   └── 音频与配音
│
├── 管理
│   ├── 内容项目
│   └── 素材资产
│
├── 洞察
│   └── 知识库
│
└── 系统
    ├── 自动化工作流（P1）
    ├── 模型与 API
    ├── 外部连接
    └── 设置
```

MVP01 中“发布中心、数据分析、内容复盘”可保留导航占位，但不进入 P0。AI Canvas 在 P0 可只作为当前 Project 流程可视化；复杂自由编排放 P1。

---

# 7. 全局 UI 规范

## 7.1 设计方向

整体视觉参考当前提供的 UI：

- 专业创作工具感
- 接近剪映 / Figma / Linear 类桌面生产工具
- 高信息密度
- 不做传统 CRM / 企业后台感
- Desktop First
- 主工作区优先
- AI 是功能，不是聊天页

## 7.2 全局 AppShell

```text
┌──────────────────────────────────────────────┐
│ Top Bar                                      │
├────────┬──────────────────────────────┬──────┤
│        │                              │      │
│ Left   │        Main Workspace        │Right │
│ Nav    │                              │Panel │
│        │                              │      │
├────────┴──────────────────────────────┴──────┤
│ Optional Timeline / Versions                 │
└──────────────────────────────────────────────┘
```

### 左侧导航

建议宽度 220–240px。包含 Logo、一级导航、API 使用量 / 额度、同步状态、用户信息。

### 顶部栏

包含全局搜索、导入素材、快速生成、新建创作、通知、用户头像。

### Main Workspace

占据绝大多数空间。

### Right Inspector

依据当前页面显示封面设置、视频生成设置、脚本属性、AI 助手、当前任务。

## 7.3 视觉原则

- 背景：暖浅灰
- 面板：白色 / 浅灰
- Border：低对比细边框
- 普通控件：黑白灰
- AI / 主 CTA：粉 → 紫 → 橙渐变
- 渐变禁止大面积滥用
- Radius 偏克制，避免“移动 App 大圆角”
- 字体层级紧凑
- 卡片不要过度堆叠

---

# 8. 首页 Dashboard

## 8.1 目标

回答用户三个问题：我现在有哪些内容项目？哪些任务正在运行？我下一步该做什么？

## 8.2 页面结构

### 欢迎区
- 时间问候
- 当前项目数量
- 待处理任务

### Universal Composer

输入支持自然语言、链接、文字资料、图片、音频、文件。

示例：`根据这篇文章帮我做一个 60 秒口播视频。`

提交后进入“新建 Project / AI 自动创建项目”的流程。

### 今日创作

显示 3–6 个活跃项目。项目卡信息：Project Title、Topic、Current Stage、Progress、当前 AI Task、Next Action。

### 创作流水线

阶段：灵感 / 选题 / 脚本 / 素材 / 制作 / 审核 / 完成 / 沉淀。点击阶段可筛选项目。

### 数据概览

MVP 仅展示本地创作数据：项目数、生成次数、资产数、本周完成内容。平台运营数据放后续版本。

### 最近资产

展示图片、封面、视频、音频、文档。

---

# 9. 灵感中心

## 9.1 目标

把散落想法和外部知识源转换为可创作的 Idea。

## 9.2 灵感来源

P0：手动输入、URL、粘贴文本、Markdown、Lark 文档、Obsidian Note、已有项目、已有素材。

P1：RSS、平台热点、自动订阅、浏览器收藏。

## 9.3 Idea 数据

- 标题
- 原始内容
- 来源
- 标签
- 关键词
- 收藏时间
- 内容摘要
- AI 提取观点
- 相关 Project
- 状态

状态：inbox / analyzed / shortlisted / converted / archived。

## 9.4 AI 操作

摘要、提炼观点、找争议点、找适合口播的切入点、找适合图文的切入点、生成 10 个选题、与历史知识关联、转为 Project。

## 9.5 验收

- 用户可创建灵感
- 用户可从 Lark / Obsidian 导入灵感
- AI 可生成摘要与候选选题
- 灵感可一键转为 Project
- 来源关系不能丢失

---

# 10. 选题中心

## 10.1 目标

将 Idea 转换为“可以直接进入内容生产”的 Topic。

## 10.2 Topic 字段

`title / angle / hook / target_audience / value_proposition / content_type / target_duration / platform_hint / source_ids / score / reason / status`

## 10.3 选题评分

MVP 可采用 AI 软评分：新鲜度、与账号定位匹配度、信息价值、情绪 / 冲突强度、口播可表达性、视觉化难度。总分仅用于辅助，不作为“真实爆款概率”。

## 10.4 核心交互

- 从单个 Idea 生成 10 个选题
- 从多个资料合并生成选题
- 收藏候选选题
- AI 改写切入角度
- 一键创建 Project
- 对比多个选题

---

# 11. Content Project / 创作空间

## 11.1 目标

Project 是整个 MVP 的主入口。

## 11.2 Project Header

显示标题、当前状态、类型、目标时长、当前版本、保存状态、Run / Generate、More。

## 11.3 Project Tabs

建议：概览 / 口播稿 / 节奏 / 图片 / 封面 / 语音 / 视频 / 资产 / 来源。

## 11.4 Project 状态

`draft / researching / scripting / producing / reviewing / completed / archived`

## 11.5 Project Overview

包含 Content Brief、当前选题、Sources、Pipeline Progress、Running Tasks、Latest Assets、Next Action。

---

# 12. 口播稿模块

## 12.1 目标

生成“可直接说出口”的脚本，而不是普通文章。

## 12.2 Script 结构

```text
Hook
↓
Context
↓
Core Point 1
↓
Core Point 2
↓
Example / Proof
↓
Conclusion
↓
CTA
```

不是强制所有稿子都完整使用这些段落。

## 12.3 Script 属性

目标时长、字数、语速、情绪、风格、目标受众、口语化程度、专业程度、是否允许英文术语、CTA 类型。

## 12.4 AI 操作

生成整稿、改短、改长、更口语、更有冲突、更像本人、重写 Hook、重写结尾、单段改写、基于知识库补充事实、从当前稿生成 3 个版本。

## 12.5 编辑器

支持富文本 / Markdown、段落选择、AI inline action、Undo / Redo、字数 / 预计口播时长、Version History。

## 12.6 验收

- 用户可生成 30 / 60 / 90 秒口播稿
- 可单段重写而不覆盖全文
- 每次生成保存新版本
- 可从 Script 进入 Rhythm
- Script 与 Project Source 保持引用关联

---

# 13. 节奏模块 Rhythm Director

## 13.1 定位

“节奏”是 MVP01 的核心差异能力之一。它把文本脚本转换为 **时间、语气、停顿、画面变化**。

## 13.2 Script Segment

每段包含：order、type、text、estimated_duration、speech_rate、pause_before、pause_after、emphasis、emotion、visual_cue、shot_hint、transition_hint。

## 13.3 Segment Type

hook / setup / point / contrast / proof / example / pause / climax / conclusion / cta。

## 13.4 UI

推荐“上文下时间线”或“左段落右属性”。Timeline 中每个 Script Segment 显示对应时长。

用户可以拖动段落、修改时长、增加停顿、设置强调词、调整语速、标记切镜位置、标记 B-roll / 图片位置。

## 13.5 AI 操作

自动节奏分析、优化前 3 秒、加快中段、增加停顿、提升信息密度、自动插入换镜点、自动生成 Shot Plan。

## 13.6 验收

- Script 可自动转换为 Rhythm Plan
- 时长汇总接近目标视频时长
- 修改某段时长后总时长实时更新
- Rhythm 能作为 Voice 和 Video 的上游数据源

---

# 14. 图片创作模块

## 14.1 目标

生成项目需要的视觉资产。

## 14.2 支持类型

B-roll 图片、信息图、背景图、插画、概念图、封面底图。

## 14.3 输入

Prompt、Script Segment、Topic、Reference Image、Style Preset、Ratio。

## 14.4 输出

每次生成形成 Generation Task、1–N Asset、Prompt snapshot、model/provider metadata、Version / batch。

## 14.5 核心交互

生成、重新生成、改提示词、设为镜头素材、设为封面候选、保存到素材库、查看历史版本。

---

# 15. 封面制作

## 15.1 页面结构

遵循现有 UI：

```text
LEFT
模板 / 素材 / 品牌

CENTER
Cover Canvas

RIGHT
封面设置 / AI 设置

BOTTOM
Generation History / Versions
```

## 15.2 P0 能力

- 常用比例
- 标题
- 副标题
- 背景
- 基础文字位置
- 基础模板
- AI 生成 3 套方案
- 历史版本
- 设为 Project Cover
- 导出 PNG/JPEG

## 15.3 P0 不做

Photoshop 级自由编辑、复杂蒙版、完整图层特效体系、专业矢量编辑。

## 15.4 核心原则

系统应优先提供“快速生成一个可发布封面”，而不是“提供无限画布编辑能力”。

---

# 16. 语音与配音

## 16.1 目标

从 Script + Rhythm Plan 生成口播语音。

## 16.2 Voice Profile

`provider / voice_id / name / gender_hint / language / speed / pitch / emotion / style`

## 16.3 生成方式

支持全文生成、按 Segment 生成、单段重新生成。推荐内部按 Segment 生成，以支持后续局部修改。

## 16.4 Rhythm 映射

Voice 需要读取 speech_rate、pause_before、pause_after、emphasis、emotion。

## 16.5 UI

音色选择、试听、语速、情绪、分段列表、波形 / 基础 Timeline、当前生成进度。

## 16.6 验收

- 用户可从当前 Script 一键生成整条口播音频
- 支持局部 Segment 重生成
- 修改单段后无需强制生成全文
- 语音资产绑定 Project Version

---

# 17. 视频制作

## 17.1 定位

MVP01 视频模块是 **AI 视频组装器 + 基础时间线**，不是完整剪映替代品。

## 17.2 Pipeline

```text
Script
↓
Rhythm
↓
Shot Plan
↓
Visual Assets
↓
Voice
↓
Subtitle
↓
Timeline
↓
Video Render
```

## 17.3 Shot

字段：id、order、script_segment_id、duration、visual_type、asset_id、prompt、transition、subtitle、generation_status。

## 17.4 页面布局

按当前视频 UI：左侧脚本与分镜列表；中间视频 Preview；右侧生成设置；底部 Timeline（Video / Voice / Subtitle / Music P1）。

## 17.5 P0 操作

自动拆分分镜、调整顺序、替换镜头素材、单镜头重新生成、调整镜头时长、预览、生成整片、查看生成状态、下载 / 导出。

## 17.6 P0 视频渲染

最小可用：拼接视觉素材、添加 Voice、自动字幕、基础淡入淡出、适配 9:16、导出 MP4。

## 17.7 验收

- 60 秒左右项目可以从 Script 生成可播放草稿
- 单镜头修改不需要重新编辑整套 Project 数据
- 视频生成失败可重试
- 最终 Video 作为 Asset 进入项目

---

# 18. AI Canvas

## 18.1 MVP01 定位

不要做 Dify / n8n 式复杂通用工作流。MVP 先做 **Content Pipeline Visualizer**。

默认节点显示业务动作：资料 → 选题 → 口播稿 → 节奏 → 图片 → 语音 → 视频。

高级模式可显示 Provider / Model / Prompt / Task。

## 18.2 P0

- 查看当前流水线
- 查看节点状态
- 点击节点打开对应工作区
- 重新运行节点
- 查看输入输出

## 18.3 P1

拖拽节点、自定义连接、保存 Workflow、Plugin Node、条件分支。

---

# 19. Lark CLI 集成

## 19.1 产品目标

让 Creator Studio 可以把飞书 / Lark 中的文档和知识作为灵感来源、研究资料、Project Source、输出沉淀目标。

## 19.2 MVP01 场景

### Read
- 指定文档 → 导入为 Source
- 指定 Wiki 内容 → 导入为 Source
- 指定表格 / Base 数据 → 转为结构化 Source（能力允许时）

### Write
- 将 Script 保存到指定文档
- 将 Project Summary 写入指定文档
- 将灵感 Inbox 同步到指定位置
- 将生成完成状态写回指定记录（P1）

## 19.3 Connector

统一接口：

```text
ExternalConnector

connect()
disconnect()
test()
search()
read()
write()
sync()
```

Lark 只是其中一个 Adapter。

## 19.4 安全要求

- 用户授权信息不写入代码仓库
- Secret 不进入 Prompt
- 所有写操作有明确目标
- 关键覆盖动作需要确认
- 保存 Sync Log

---

# 20. Obsidian 集成

## 20.1 产品目标

让 Obsidian 成为用户自己的长期知识仓，而 Creator Studio 是创作执行层。

## 20.2 MVP01 模式

优先支持 Markdown 文件导入、Vault 指定目录读取、Vault 指定目录写入、打开指定 Note、Project 与 Note 建立双向链接字段。

## 20.3 推荐目录约定

```text
Creator/
├── Inbox/
├── Sources/
├── Ideas/
├── Topics/
├── Scripts/
└── Projects/
```

系统不能强制用户采用该结构，但可以提供默认模板。

## 20.4 Frontmatter 建议

```yaml
creator_project_id:
creator_type:
status:
topic:
created_at:
updated_at:
source_ids:
tags:
```

## 20.5 同步原则

MVP01 优先 **显式同步 > 自动双向实时同步**。

用户点击“从 Obsidian 导入”或“同步到 Obsidian”，避免第一版就处理复杂冲突。

## 20.6 冲突

如两边均发生变化：不自动覆盖，显示冲突，用户选择使用 Creator Studio、使用 Obsidian、创建副本。

---

# 21. Lark + Obsidian 的组合定位

建议：

- **Lark**：偏外部资料、协作文档、在线表格、云知识库、后续团队协作。
- **Obsidian**：偏个人知识库、长期内容资产、灵感、私人笔记、Markdown 原稿。

Creator Studio 在中间完成：

```text
Lark / Web / Files
       ↓
    Sources
       ↓
 Creator Studio
       ↓
 Project / Content
       ↓
 Obsidian / Lark
```

---

# 22. 素材资产中心

## 22.1 Asset 字段

`id / workspace_id / project_id / type / name / file_url / local_path / thumbnail / mime_type / size / width / height / duration / source / tags / created_at`

## 22.2 页面

Tabs：全部 / 图片 / 封面 / 视频 / 音频 / 文档。

支持搜索、Project 筛选、标签筛选、类型筛选、最近使用。

---

# 23. 知识库

## 23.1 MVP01 定位

不是独立笔记软件。它只解决：**AI 创作时可以找到“我的资料”。**

## 23.2 Source 类型

manual / web / file / lark / obsidian / project / transcript。

## 23.3 P0 能力

Source 入库、文本提取、Metadata、分块、基础检索、Project 绑定 Source、AI 生成时可引用绑定知识。

## 23.4 引用

AI 输出尽量记录 source_id、chunk_id / reference、generation_id，为后续“这句话从哪里来”预留能力。

---

# 24. 全局 AI 助手

## 24.1 定位

不是独立 ChatGPT，而是 Context-aware Copilot。

## 24.2 Context

助手应该知道 Workspace、Current Project、Current Page、Current Selection、Active Script、Current Version、Related Sources、Current Task。

## 24.3 示例

在封面页说“字少一点”，等价于基于当前封面创建标题更短的新版本。

在 Script 说“前三秒不够抓人”，等价于重写 Hook 并保持其余 Script 不变。

---

# 25. 数据模型

## 25.1 MVP 核心 Entity

```text
User
Workspace
CreatorProfile

Project
Idea
Topic
Source

Script
ScriptVersion
ScriptSegment
RhythmPlan

Asset
Generation
Task

Cover
CoverVersion

VoiceProfile
VoiceRender

Shot
VideoProject
VideoRender

ExternalConnector
SyncRecord
```

## 25.2 关系简图

```text
Workspace
│
├── Ideas
├── Topics
├── Sources
├── Assets
│
└── Projects
      │
      ├── Sources
      ├── Script Versions
      │      └── Segments
      │             └── Rhythm
      │
      ├── Cover Versions
      ├── Voice Renders
      ├── Shots
      ├── Video Renders
      ├── Assets
      └── Tasks
```

---

# 26. Task Runtime

## 26.1 为什么 MVP 必须先做

图片、语音、视频都不是稳定的同步请求。UI 必须处理排队、生成、进度、失败、重试、取消、恢复查看。

## 26.2 Task Schema

建议字段：id、workspace_id、project_id、type、status、progress、input、output、provider、model、retry_count、error_code、error_message、created_at、started_at、finished_at。

## 26.3 前端表现

Dashboard、AI Canvas、编辑器都读取统一 Task。例如：`正在生成第 2 / 3 张封面 · 62%`，而不是每个模块自己创造 loading 逻辑。

---

# 27. Generation Provider 抽象

MVP01 不要把业务组件与具体模型绑定。

定义：LLMProvider / ImageProvider / TTSProvider / VideoProvider / EmbeddingProvider。

业务调用：generateScript() / generateImage() / generateSpeech() / generateVideo()。

Provider 决定具体使用哪个模型。这样后续增加模型 / 插件不需要重写 Cover Editor / Video Editor。

---

# 28. API 概念

以下仅作为 Contract 方向，具体 REST / RPC 可由工程规范决定。

## Project
```text
POST   /projects
GET    /projects
GET    /projects/:id
PATCH  /projects/:id
```

## Idea / Topic
```text
POST /ideas
POST /ideas/:id/analyze
POST /ideas/:id/topics
POST /topics/:id/project
```

## Script
```text
POST /projects/:id/scripts/generate
PATCH /scripts/:id
POST /scripts/:id/rewrite
POST /scripts/:id/rhythm
```

## Image
```text
POST /projects/:id/images/generate
```

## Cover
```text
POST /projects/:id/covers/generate
POST /projects/:id/covers/:coverId/select
```

## Voice
```text
POST /projects/:id/voice/generate
POST /projects/:id/voice/segments/:segmentId/regenerate
```

## Video
```text
POST /projects/:id/shots/generate
PATCH /shots/:id
POST /projects/:id/video/render
```

## Tasks
```text
GET  /tasks/:id
POST /tasks/:id/retry
POST /tasks/:id/cancel
```

## Connectors
```text
GET  /connectors
POST /connectors/:type/connect
POST /connectors/:id/test
POST /connectors/:id/import
POST /connectors/:id/export
```

---

# 29. Local Bridge（建议）

由于 MVP01 包含 Lark CLI 与 Obsidian 本地 Vault，建议预留本地连接层：

```text
Creator Studio Web/Desktop
        │
        ▼
 Creator Local Bridge
        │
   ┌────┴─────┐
   ▼          ▼
Lark CLI   Obsidian Vault
```

Local Bridge 负责调用本地 CLI、文件读取、Vault 写入、本地认证、返回结构化结果。

原则：Creator Studio Product Domain 不直接依赖 CLI 命令，CLI / 文件系统只是 Connector Adapter。

---

# 30. 页面状态规范

所有核心页面至少考虑：empty / loading / ready / dirty / saving / generating / success / partial_success / error / offline / connector unavailable。

生成失败必须保留输入、显示失败原因、提供 Retry、不破坏上一版本。

---

# 31. 产品级快捷键

P0：

- Cmd/Ctrl + K：全局搜索 / Command
- Cmd/Ctrl + S：保存
- Cmd/Ctrl + Z：Undo
- Cmd/Ctrl + Shift + Z：Redo
- Esc：关闭浮层 / 取消选择

---

# 32. 搜索

MVP 全局搜索范围：Project、Idea、Topic、Source、Asset、Script、Obsidian imported notes、Lark imported content。返回结果要标注类型和来源。

---

# 33. 非功能要求

## 33.1 性能

- Dashboard 首屏优先返回结构数据
- 大素材懒加载
- 视频使用缩略图 / Proxy
- 长 AI 任务全部异步化
- 不允许长时间 HTTP 阻塞式等待视频生成

## 33.2 稳定性

- Task 可恢复
- 生成结果持久化
- 页面刷新不丢当前任务
- Draft 自动保存
- 写入外部 Connector 有日志

## 33.3 可扩展性

所有核心表保留 workspace_id、created_by、metadata。未来可扩展到多 Workspace、Plugin、Marketplace、Billing、Team。

---

# 34. MVP01 关键指标

第一阶段关注产品闭环：

- **Activation**：用户是否完成第一个 Project → 第一个最终视频
- **Time to First Draft**：创建 Project 到第一版 Script
- **Time to First Video**：创建 Project 到可播放 Video Draft
- **Completion Rate**：创建 Project 后最终生成视频的比例
- **AI Retry Rate**：不同 Task 的失败 / 重试率
- **Manual Edit Rate**：Script、Rhythm、Cover、Voice、Shot 的人工修改比例

---

# 35. MVP01 开发顺序

## Phase 0 — Foundation

- Monorepo
- AppShell
- Design System
- Auth 基础
- Workspace
- Project
- Asset
- Task
- Version
- Provider interfaces
- 文件存储

完成标准：Dashboard 可以使用 Mock / Seed Data 运行，并与现有 UI 方向一致。

## Phase 1 — Dashboard + Project

实现 Dashboard、New Project、Project Overview、Project Pipeline、Global Task 状态、Asset 基础。

完成标准：用户可以创建 Project，并在 Dashboard 看到进度。

## Phase 2 — 灵感 + 选题

实现 Idea Inbox、Source、Topic Generator、Convert to Project、Lark / Obsidian 首批只读导入。

完成标准：外部笔记 → Idea → Topic → Project 跑通。

## Phase 3 — Script + Rhythm

实现 Script Editor、AI Generate、Rewrite、Versions、Script Segment、Rhythm Plan、Timing。

完成标准：一个选题可以生成 60 秒口播稿，并自动形成节奏时间线。

## Phase 4 — Image + Cover

实现 Image Generation、Asset Gallery、Cover Editor、3 个 Cover Variants、Select Cover。

完成标准：Script / Topic 可以生成项目图片和最终封面。

## Phase 5 — Voice

实现 Voice Profile、Segment TTS、Full Voice、Segment Retry、Basic waveform。

完成标准：Script + Rhythm 可以生成完整口播音轨。

## Phase 6 — Video

实现 Shot Plan、Storyboard、Visual binding、Voice、Subtitle、Timeline、Render。

完成标准：Project 能生成一条 9:16 可播放 MP4。

## Phase 7 — Knowledge Sync

实现 Lark Write、Obsidian Write、Sync Record、Conflict protection。

完成标准：用户可以将 Project / Script / Summary 显式沉淀回自己的知识系统。

---

# 36. Codex / Agent 实现任务模板

建议目录：

```text
/specs

001-foundation
002-dashboard
003-project
004-ideas-topics
005-script
006-rhythm
007-image
008-cover
009-voice
010-video
011-lark-connector
012-obsidian-connector
013-knowledge
```

每个目录：

```text
spec.md
ui.md
api.md
acceptance.md
```

执行 Prompt 模板：

```text
Implement spec XXX.

Read first:
- AGENTS.md
- docs/design/ui-rules.md
- specs/XXX/spec.md
- specs/XXX/ui.md
- specs/XXX/api.md
- specs/XXX/acceptance.md

Requirements:
1. Inspect the current codebase before implementation.
2. Reuse existing AppShell, domain models and packages.
3. Do not redesign the product structure.
4. Use the reference screenshot as visual direction.
5. Improve spacing/alignment consistency where the mockup is incomplete.
6. Implement frontend + backend contract for this vertical slice.
7. Long AI operations must use Task Runtime.
8. Add tests.
9. Run the actual page and visually inspect it.
10. Report changed files, tests and remaining gaps.
```

---

# 37. MVP01 Definition of Done

用户可以完整完成：

```text
导入 / 创建灵感
↓
生成选题
↓
创建 Project
↓
生成口播稿
↓
生成节奏
↓
生成视觉图片
↓
生成封面
↓
生成语音
↓
生成分镜
↓
生成视频
↓
保存最终版本
↓
同步到 Obsidian / Lark
```

产品级要求：

- 页面使用统一 Design System
- Project 是唯一主上下文
- 所有 AI 长任务使用 Task
- 所有生成内容可追踪版本
- 所有 Asset 可回到来源 Project
- 页面刷新不会丢 Task 状态
- 关键页面有 Empty / Loading / Error / Success
- Lark / Obsidian 不直接污染 Product Domain
- 用户可以替换具体 Model Provider

---

# 38. 最重要的产品原则

1. **用户看到“创作阶段”，而不是“AI 模型”**。默认展示选题 → 脚本 → 节奏 → 图片 → 语音 → 视频，高级设置再展示模型。
2. **AI 要服从 Project Context**。不能每个 AI 功能都从 0 开始问用户背景。
3. **不急着做完整剪辑器**。MVP 视频编辑目标是 AI 生成 80%，用户控制关键 20%。
4. **Lark / Obsidian 是知识层，不是产品中心**。它们为 Creator Studio 提供输入和沉淀。
5. **先闭环，再平台化**。Plugin / Marketplace / Team / Billing 在核心 Domain 稳定后再进入。

---

# 39. 推荐的 MVP01 产品心智

最终用户应该感觉：

> 我不是在分别使用写稿 AI、图片 AI、语音 AI、视频 AI。
>
> 我是在 Creator Studio 里做一条内容，AI 帮我把它一步一步生产出来。

这就是 MVP01 应该验证的核心产品假设。
