# Canvas Visual V1 — SPEC

**Status:** Approved
**Supersedes:** visual direction in `creator-workspace-ui-interaction-spec-v0.2.md`（该文仍只作历史参考）
**Does not replace:** `.feature-003-creative-canvas-v1` 的图模型、Studio 路由、ChangeSet / MCP

参考图：`creator-studio/docs/0810.png`

## 1. 边界

画布继续投影 003 的 `WorkflowGraph`。视觉层只改 Renderer、Inspector 密度、画布 chrome。不改 command / recipe / execution / ChangeSet 契约。

| 对象 | 画布 | 离开画布 |
|---|---|---|
| Artifact 文本 | 2~6 行摘要 | 双击 → Text Studio |
| Artifact 图片 | 封面缩略图 | 双击 → Image Studio |
| Collection | 最多 4 个候选 | 双击 → Image Studio；点选在画布完成 |
| Recipe | 琥珀色工具卡 | 选中后走底部 execution shelf |
| Audio / Video | 只读预览 | V1 不提供新的生成 UI |

## 2. 节点解剖

所有 Artifact 卡共用同一骨架，禁止整卡高饱和填色。颜色只用于左边 2px 色条、icon、tiny badge、选中描边。

```text
┌──────────────────────────────┐
│ ▌ [icon] 标题            ··· │
│                              │
│ Preview                      │
│                              │
│ 已完成                    ✓  │
└──────────────────────────────┘
```

- **Header：** 角色 icon + 可读标题 + More。标题优先 `metadata.title`，否则本地化 role；图片 / Collection 在 `versionNumber > 1` 时追加 ` vN`。
- **Preview：** 见 §3。`zoom < 0.35` 只保留 icon + 标题 + 状态点，几何中心不变。
- **Footer：** 状态必须 icon + 文案。有内容且无进行中 Run →「已完成」；queued/running →「生成中」；failed →「失败」；无内容 →「草稿」。
- **Selected：** accent 边 + 外发光。选中不只靠颜色，Footer 对完成态保留勾。
- **More：** 复制 / 副本 / 删除。不在 hover 展开完整 Operation 列表。
- **Handle：** 左右各一（Recipe 用 typed ports）。`nodrag` 用于卡内按钮。

默认宽度：Text 260、Image 240、Audio 240、Video 260、Collection 440、Action 240、Recipe 208。React Flow 初始 `width/height` 必须接近实卡，避免 culling 误杀。

## 3. 预览

| Kind / role | Near 预览 |
|---|---|
| text / inspiration, topic, outline, script | 3~4 行 inline 文本；空则「暂无内容」 |
| image / cover, illustration | 大缩略图；封面可叠项目标题；原图不预载 |
| collection | 最多 4 格，标「方案 A..D」，选中打勾。数据走 `GET /artifacts/:id/collection-items`，失败回退 collection 自身 versions |
| audio | 自定义播放键 + 波形；点击才 mount `<audio>` |
| video | poster；无资源则占位。V1 只读 |
| action | 副作用说明；有平台 metadata 则显示 |
| recipe | 能力描述 + 执行中条。保持琥珀色，不混进内容卡 |

Collection 点选调用 `POST /artifacts/:id/collection-items/select`。画布不删除落选候选。

Role → tone（只作 accent，不作底色）：

| tone | roles |
|---|---|
| inspiration | inspiration, idea |
| topic | topic |
| structure | outline, brief, research, title, keyword |
| script | script, article |
| image | cover, illustration, image, collection |
| audio | voice, audio |
| video | video |
| action | publish, action |
| recipe | recipe 节点 |

未知 role 回退到 kind。

## 4. 画布 chrome

画布左上标题条（不是 AppShell）：

- 项目标题
- 「最近更新：{project.updatedAt}」
- SSE 点 + 进行中 Run 数
- 分享当前 URL、适应视图

底栏保持框选 / 平移 / 缩放 / 撤销。自动整理、对比版本本 SPEC 不实现。

空状态文案不变：引导双击或 `+` 创建节点。Node Picker 增加 inspiration / cover，与内容卡角色对齐。

## 5. Inspector

固定宽约 344px，可关。Header：tone icon + 可读标题 +「已选中」+ 关闭。

Tabs：

1. **详情** — Run 进度、预览、按 `presentation.group` 分组的操作、关联节点、打开 Studio
2. **评论** — 占位，不造数据
3. **历史版本** — 已有 Version History

操作分组（文案映射，不改 Registry id）：

| group | 标题 |
|---|---|
| generate | 继续创作 |
| edit | 优化当前 |
| media | 图像与媒体 |
| publish | 发布 |

Primary 用实心按钮，其余网格次级按钮。不在 Inspector 重做 Image Studio 的蒙版 / 扩图画板；若 `metadata.prompt|style|ratio` 存在则只读展示。

关联节点：当前节点的入边 / 出边，最多 4 个缩略。点击选中对应画布节点。

Recipe 选中不打开这份 Inspector，继续走 003 的 execution shelf。

## 6. 交互

- 单击：选中 + 打开 Inspector
- 双击文本 / 图片 / Collection：进 Studio
- Delete / 复制 / 粘贴 / 撤销：沿用现键盘与右键
- Hover 主操作、Handle → 空白 Quick Insert、Group：本 SPEC 不做

## 7. Token

沿用 `tokens.css` 语义色。新增 `--node-*` HSL 分量，仅节点 chrome 引用，页面其他控件不得使用。禁大面积高饱和紫。

## 8. 验收

- 文本节点标题是「选题 / 大纲 / 口播稿」，不是 `topic`
- 封面 Collection 能看出最多 4 个候选，选中有非颜色记号
- 选中节点后 Inspector 操作按组排列，评论 Tab 可见且为空态
- Recipe 仍为琥珀色工具卡
- `test:foundation` 与画布相关单测通过
