# SPEC 05: Canvas Runtime — 画布与交互 UI

> 来源：`.prd` + `creator-workspace-ui-interaction-spec-v0.2.md`
> 技术决策：Canvas 渲染层用 **`@xyflow/react`**
> 状态：待评审

## 1. 视觉基准

**Dark / Low Saturation / Professional / Creator Tool / Canvas First / Quiet UI。**

- 布局：Topbar(56~64px) + Sidebar(176~208px，可折叠 Icon Rail) + Canvas + Inspector(320~380px，可关闭)。
- 禁大面积高饱和填色；Node 颜色只用于 icon / thin border / tiny badge / active glow。
- 分享/发布固定在右上角 Header，不作为 Canvas 悬浮主按钮。

## 2. `@xyflow/react` 集成方式

- 用 `<ReactFlowProvider>` 包裹 Canvas；`nodes`/`edges` 从 `CanvasStore` 派生（`node.id = canvas_node.id`，`data.artifact` = ArtifactStore 摘要，`type = 'text'|'image'|...`）。
- 自定义 `nodeTypes` 只实现 **6 个 Family Renderer**（Text/Image/Audio/Video/Collection/Action），业务角色通过 `data.artifact.role` 控制展示。
- `onNodesChange/onEdgesChange` 走 CanvasStore，节流写回服务端（移动结束 flush）。
- Pan/Zoom/Selection/Drag/多选/MiniMap/Controls 用 React Flow 内置能力，做样式定制（暗色 token）。
- **禁止**在节点组件里 `switch(node.type)` 堆操作按钮；操作一律来自 Inspector 的 Registry 查询。

## 3. Node Family Renderer

| Renderer | 展示 | Lazy |
|---|---|---|
| TextNode | role icon + title + 2~6 行 preview + metadata/status/version | 富文本编辑器双击才挂载 |
| ImageNode | 低清缩略图 + ratio + selected/result 状态 | 原图/编辑器不预载 |
| AudioNode | waveform + duration + voice name + status | 点击播放才 load audio |
| VideoNode | poster + duration + resolution + status | 点击才 mount `<video>`/player |
| CollectionNode | 候选网格 + selected 标记 + actions（Select/Compare/Regenerate/Generate More/Promote/Delete） | 候选缩略图懒加载 |
| ActionNode | 副作用图标 + 状态（publish/export） | — |

### LOD（来源 §36）

- `zoom < 0.35`：icon + title + status
- `0.35 <= zoom < 0.7`：title + basic preview + status
- `zoom >= 0.7`：full node card
- LOD 切换避免 layout jump，Node 中心在各级保持。

### 视口剔除（来源 §35）

视口外不 Mount 重组件、不加载原媒体、不挂 Editor、不加载结果详情；可退化为轻量 placeholder。由 React Flow 的 `onlyRenderVisibleElements` 辅助。

## 4. Canvas 交互

- **创建 Node**：① 双击/`+` → Node Picker → 创建；② 选中节点 → Inspector → Operation → 结果节点（主路径）；③ Handle 拖到空白 → Quick Insert（MVP 二期）。
- **选中**：单击 → selectedNodeId 更新 + selected border + Inspector 打开 + Lazy Load Versions/Operations；双击 → 打开对应 Advanced Editor。
- **Hover**：最多显示 Primary Action + More + Connection Handle。
- **Edge**：从 Node Handle 拖出到目标节点，选择 inputSlot（或按可连接性推断）。
- **空状态**：画布中心「开始你的第一个创作节点」+ [创建选题]/[输入文字]/[上传素材]，底部「双击画布也可以创建节点」。
- **键盘**（来源 §53）：Space+拖拽 Pan、Wheel Zoom、Cmd/Ctrl+Z 撤销、Cmd/Ctrl+Shift+Z 重做、Delete 删除、Cmd/Ctrl+C/V 复制粘贴、Cmd/Ctrl+D 复制、F 聚焦、Esc 清空/关菜单、Enter 打开节点。
- **Undo/Redo**：画布 UI 操作（move/resize/edge/node delete/group）；AI 内容恢复走 Version 历史，不走传统 Undo。

## 5. Inspector

固定布局：Header / Tabs / Input Context / Artifact Preview / Config / Primary Actions / Secondary Actions / Results / Version。

- 操作区由 `GET /artifacts/:id/operations`（Registry）驱动，按 `presentation.group/placement/priority` 分组渲染。
- Run 流式：Inspector 实时显示 token 流；Canvas 节流（文本生成不按 token 刷 Node，500~2000ms，完成一次刷新）。
- 失败状态：[重试]/[修改参数]/[换模型]/[取消] + human-readable 错误 + provider message 折叠。
- 手动编辑 → `PATCH /artifacts/:id`（revision）→ 新 Version(source=user)。

## 6. Store 设计（来源 §37）

| Store | 状态 |
|---|---|
| CanvasStore | viewport、positions、selection、hover、dragging、edge editing |
| ArtifactStore | summaries、current versions、metadata |
| RunStore | active runs、progress、failures、queue |
| UIStore | inspector、modal、editor、context menu |

- Node Renderer 只订阅 node layout + artifact summary + active run summary + selection；不订阅整个 nodes 数组。
- 切 Project：不保留多个重 Canvas DOM；保存 viewport/selection/打开的 Inspector 节点，切回恢复。

## 7. 媒体与缓存

- Image：低清缩略图 + lazy decode（webp/avif preview）。
- Audio/Video：waveform/poster + duration，点击才 load。
- 缓存：Project Graph / Artifact Summary / Version Detail / Operation Registry / Run Realtime / Thumbnail。切 Project graph 可缓存，detail 按需，media lazy。

## 8. 设计 Token（来源 §51）

沿用 `styles/tokens.css` 语义 token，新增 Canvas 相关：

```text
bg.canvas  bg.node  bg.node.hover
border.default  border.selected
accent.primary  accent.ai
status.success  status.running  status.warning  status.error
node.text  node.image  node.audio  node.video  node.action
```

Node 不允许整卡高饱和填色。

## 9. 无障碍（来源 §52）

对比可读；Selected 不只靠颜色；Status 有 icon+text；键盘 focus 可见；Toolbar 有 tooltip；icon button 有 aria-label。

## 10. 前端文件结构

```
apps/web/src/
├── canvas/
│   ├── shell/canvas-shell.tsx        ReactFlowProvider + <ReactFlow>
│   ├── nodes/text-node.tsx image-node.tsx audio-node.tsx video-node.tsx collection-node.tsx action-node.tsx
│   ├── edges/edge.tsx  input-slot-label.tsx
│   ├── toolbar/canvas-toolbar.tsx  minimap/custom-minimap.tsx
│   ├── interactions/use-canvas-keyboard.ts use-canvas-drag.ts node-picker.tsx
│   └── store/canvas-store.ts
├── artifacts/ domain/ api/artifact-api.ts cache/artifact-cache.ts
├── operations/ registry/ registry-client.ts ui/operation-menu.tsx schemas/
├── runtime/ runs/run-store.ts events/sse.ts provider/provider-status.ts
├── inspector/ shell/ sections/ fields/ result-renderers/
├── editors/ text-editor.tsx image-editor.tsx audio-editor.tsx video-editor.tsx
└── shared/ 复用
```

## 11. 测试策略

- Store 单元：CanvasStore 变换、RunStore 事件归并、节流。
- 组件：Node Renderer LOD 三态、Collection 选择、Inspector 由 mock Registry 渲染。
- 集成：浏览器验证（`run` skill）——创建节点、拖动、连线、Inspector 执行、Run 状态流转、300 节点操作流畅。
- 性能：100/300/500 benchmark 脚本（来源 §55）。