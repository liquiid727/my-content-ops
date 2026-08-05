# Content Ops — 项目说明

## 启动时自动扫描

每次对话开始时，扫描 `local-history/` 目录，列出当前本地的历史项目和资源情况：

```bash
ls local-history/projects/
ls local-history/assets/
ls local-history/references/
```

将扫描结果作为本次对话的上下文背景，方便在规划内容或选题时关联历史项目。

## 本地历史目录

```
local-history/         # 本地专属，已在 .gitignore 忽略，不纳入版本控制
├── projects/          # 历史项目（代码、demo、实验）
├── assets/            # 素材资源（图片、视频、文案等）
└── references/        # 参考资料（截图、灵感、竞品分析等）
```

## 项目结构

```
content-ops/
├── vault-server/      # 知识库 API 服务
├── 半年谈/            # 内容专题目录
└── local-history/     # 本地历史（不入库）
```
