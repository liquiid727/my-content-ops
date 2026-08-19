---
name: loop-it-local
description: "Automated implementation loop for LOCAL issues with checkpoint/resume: scan .feature/ for .issues files → parse issues & dependency order → implement each issue end-to-end → review with /review-it → document with /note-it → local ship (commit + update .issues status + merge) → repeat. No GitHub dependency — works entirely on local .feature/.feature-<NNN>-<slug>/.issues. Persists state to .loop-local-state.json for crash recovery. Triggers on: loop-it-local, loop local issues, 本地实现, 实现本地issue, 循环实现, 批量实现, 恢复循环, resume local loop."
user-invocable: true
allowed-tools:
  - Bash(git:*)
  - Bash(cat:*)
  - Bash(mkdir:*)
---

# loop-it-local — 本地 Issue 自动化实现循环（带检查点恢复）

Scan the `.feature/` workspace for local `.issues` files, resolve dependency order, implement each Issue through the full pipeline (内联实现 → `/review-it` → `/note-it` → 本地 ship), persist progress to a per-feature state file, and resume from checkpoint on crash.

> **与 `/loop-it` 的区别**：`/loop-it` 从 GitHub 拉取 open issues，ship = 创建 PR 并合并；`/loop-it-local` 只处理本地 `.feature/.feature-<NNN>-<slug>/.issues` 文件，**不依赖 gh CLI**，ship = 本地提交 + 更新 `.issues` 状态 + 合并到默认分支。

> **⚠️ 关键前提：实现步骤由 agent 内联自主完成，不依赖任何外部 `/goal` 命令。**
> 本环境中不存在可调用的 `goal` 命令或 skill。因此「实现 issue」这一步**必须由 agent 内联完成**：直接读取该 issue 的标题与正文（含其引用的 `.prd`/`.spec` 与验收条件），自主完成"理解需求 → 写/改代码 → 跑测试与 lint → 满足全部验收条件"的闭环，持续工作直到该 issue 的验收条件全部满足且测试/构建通过。**不要**尝试用 Skill 工具调用 `goal`（会报 `goal is a UI command, not a skill`），也**不要**因为找不到 `/goal` 而中止循环。`/review-it`、`/note-it`、`/ship-it` 仍是真实 skill，经 Skill 工具调用。

---

## 目录约定 (Feature Workspace)

```
.feature/
└── .feature-<NNN>-<slug>/
    ├── .prd                    # 需求文档 PRD
    ├── .spec                   # 技术规格 SPEC
    ├── .issues                 # 本地 issue 列表 —— 本 skill 的输入/状态
    ├── .test                   # 测试计划 / 测试文档
    └── .loop-local-state.json  # 本 skill 的检查点状态文件（不入 git）
```

- `.issues` 由 `/to-issues` 生成，每条 Issue 以 `## Issue #N: <Title>` 分节，含 `**Status:**` 字段
- 本 skill 按 feature 目录逐个处理；处理完成后更新 `.issues` 里的 `**Status:**`，并写 `.loop-local-state.json`
- `.loop-local-state.json` 与 `.issues` 是双写的：状态文件管进度/恢复，`.issues` 管文档可见状态

---

## Overview

```
前置检查 → 选择 feature → 读取状态文件 → 解析 .issues → 构建依赖图 → 拓扑排序
                                                              |
    ┌───────────────────────────────────────────────────────────┘
    |
    v
┌──────────────── 单 Issue 循环 ────────────────┐
|                                               |
|  从检查点恢复？—— 跳过已完成/失败的             |
|                                               |
|  分支准备 (checkout 默认分支, pull, create branch) |
|        |                                      |
|  Skip/Blocked? ── 是 → 标记 skipped/blocked, 写检查点 |
|        |                                      |
|        否                                      |
|        |                                      |
|  内联实现 → 出错？→ 分类 → 恢复 → 重试        |
|        |              |                       |
|        |           失败 → 检查点, 下一个         |
|        |                                      |
|  /review-it → 有问题？→ 修复 → 重跑 review     |
|        |                                      |
|  /note-it (捕获实现笔记, best-effort)          |
|        |                                      |
|  本地 ship → 提交 + 更新 .issues 状态 + 合并   |
|        |                                      |
|  分支清理 (checkout 默认分支, pull, delete branch) |
|        |                                      |
|  检查点 (标记 shipped)                         |
|        |                                      |
└────────┴──────────────────────────────────────┘
         |
         v
    全部完成 → 最终 Summary
```

---

## 前置检查

开始循环前，按顺序验证所有前提条件。任何检查失败则停止并打印错误。

### Check 1: Git 仓库

```bash
git rev-parse --is-inside-work-tree
```

失败 → 打印 `❌ 不在 git 仓库中`，退出。

### Check 2: Git 工作树清洁度

```bash
git status --porcelain
```

有输出（dirty）→ 打印 `⚠️ 工作树有未提交的更改`，提供选项：
- A. `git stash` 暂存后继续
- B. 中止，让用户自行处理
- C. 强制继续（不推荐）

默认 B。

### Check 3: 在默认分支上

```bash
git branch --show-current
```

不在 main/master → 打印 `⚠️ 当前在 {branch} 分支`，提供选项：
- A. `git checkout main/master && git pull` 切换
- B. 继续在当前分支

### Check 4: 存在 `.feature/` 工作区？

```bash
ls -d .feature/.feature-* 2>/dev/null
```

为空 → 打印 `❌ 没有找到 .feature/.feature-* 目录。先运行 /prd → /to-issues 生成需求与 issues。`，退出。

### Check 5: 状态文件存在？

```bash
cat .feature/.feature-<NNN>-<slug>/.loop-local-state.json
```

存在 → 打印进度摘要，提供选项：
- A. 从检查点恢复
- B. 从头开始（删除状态文件）
- C. 中止

> 远程可达性检查（`git ls-remote`）仅在你需要 push 时才有意义。本 skill 默认纯本地，**不要求远程**；若最终需要 push，检查一次 `git ls-remote --heads origin` 即可。

---

## 选择 feature

列出 `.feature/` 下所有含 `.issues` 的 feature 目录：

```
📋 发现 N 个 feature 含本地 issues：
  1. .feature-001-priority-system (4 issues)
  2. .feature-002-user-auth (3 issues)

要处理哪些？[1] [2] [1,2] [all]
```

- 默认处理全部（按序号升序）
- 每个 feature 独立运行 Step 1~3，使用各自的 `.loop-local-state.json`

---

## 状态文件

### 位置

`.feature/.feature-<NNN>-<slug>/.loop-local-state.json`，放在 feature 目录内。**必须添加到 `.gitignore`**（见 `.feature/**/.loop-local-state.json`）。如果文件被 git 跟踪，打印警告并建议用户添加到 `.gitignore`。

### 格式

```json
{
  "version": 1,
  "started_at": "2025-06-09T10:00:00Z",
  "updated_at": "2025-06-09T10:30:00Z",
  "feature": ".feature-001-priority-system",
  "issues_file": ".feature/.feature-001-priority-system/.issues",
  "total_issues": 4,
  "issues": {
    "1": {
      "status": "shipped",
      "branch": "feat/feature-001-issue-1-add-priority",
      "started_at": "2025-06-09T10:00:00Z",
      "completed_at": "2025-06-09T10:15:00Z",
      "attempts": 1
    },
    "2": {
      "status": "failed",
      "phase": "implement",
      "error_class": "build_failure",
      "branch": "feat/feature-001-issue-2-filter-tasks",
      "started_at": "2025-06-09T10:15:00Z",
      "updated_at": "2025-06-09T10:30:00Z",
      "attempts": 3,
      "last_error": "test TestFilterPriority failed: expected 3, got 0"
    },
    "3": {
      "status": "pending"
    }
  }
}
```

### 状态值

`pending` | `in_progress` | `skipped` | `shipped` | `failed` | `blocked`

### 写入规则

- 每次状态转换后立即写入（`pending` → `in_progress`、`in_progress` → `shipped`/`failed`/`skipped` 等）
- 写入使用 `cat > .feature/.feature-<NNN>-<slug>/.loop-local-state.json << 'LOOPSTATE'\n{json}\nLOOPSTATE`
- 同步更新 `.issues` 中对应 Issue 的 `**Status:**` 行（并可在 shipped 时把验收条件 `- [ ]` 勾成 `- [x]`）
- 如果状态文件已存在但内容损坏（非法 JSON），打印警告，提供从头开始或中止的选项。**绝不自动覆盖损坏文件**
- 循环完成后保留状态文件（作为记录），用户可手动删除

---

## Step 1: 解析 Local Issues & 构建依赖图

读取当前 feature 的 `.issues` 文件：

```bash
cat .feature/.feature-<NNN>-<slug>/.issues
```

### 解析规则

按 `## Issue #N: <Title>` 头拆分出每条 Issue；从 `##` 头取编号与标题，从 `**Status:**` 取当前状态（默认 `pending`）。若文件损坏或无法解析，打印错误并中止该 feature。

### Parse Dependencies

读取每条 Issue 的 `**Dependencies:**` 字段，例如 `None` 或 `#1, #2`。构建依赖图，按拓扑排序：

1. 无依赖的 Issue 在前（按编号升序）
2. 依赖全部已 shipped/closed 的 Issue 其次
3. 依赖其他未完成 Issue 的（blocked）最后
4. 循环依赖 → 打印警告 `⚠️ 循环依赖检测到: #A ↔ #B，按编号顺序处理`，break cycle by number order

如果没有任何依赖字段，退化为按编号升序。

打印有序列表：

```
📋 Found N issues in .feature-001-priority-system (topological sort):
  #1: Add priority field (无依赖)
  #2: Display indicator (依赖 #1)
  #3: Add selector (依赖 #1)
  #4: Filter view (依赖 #1, #2)
```

如果没有可处理的 Issue（全部已 shipped）→ 打印 `✅ 该 feature 的 issues 已全部完成。` 并跳到下一个 feature。

---

## Step 2: Resume or Initialize

### If `.loop-local-state.json` exists (from 前置检查 Check 5)

1. Read the file
2. Print progress summary:

```
📊 从检查点恢复 (上次更新: {updated_at})
   ✅ Shipped:  #1
   ⏭️  Skipped:   #2 (question)
   ❌ Failed:    #3 (build_failure — 3 attempts)
   📋 Remaining: #4
```

3. For each `failed` issue: ask user — retry or skip?
4. For `in_progress` issues: check if branch exists, changes exist → decide resume from current state or restart
5. Skip all `shipped`/`skipped` issues
6. Continue from first pending/retryable issue

### If no state file

1. Initialize new state file with all parsed issues as `pending`
2. Start from first issue in topological order

---

## Step 3: Process Single Issue

For each issue, print a banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Processing Issue #N: {title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3a. Branch Prep

Prepare a clean git environment for this issue:

```bash
# 确认在默认分支上（main 或 master，以仓库实际为准）
git checkout main   # 或 master
git pull            # 仅在远程可达时执行；纯本地可跳过

# 创建功能分支
git checkout -b feat/issue-{N}-{short-desc}
```

Branch naming: `feat/issue-N-short-desc` 或 `fix/issue-N-short-desc`。

### 3b. Skip or Implement

Read the issue title and body. Decide if it needs code implementation:

**Skip if the issue is:**
- A question / discussion / clarification
- Documentation-only (typos, wording)
- Already implemented (check codebase)
- A duplicate of another issue
- Not actionable (no clear acceptance criteria and cannot infer any)

**Skip (blocked) if the issue has unresolved dependencies:**
- Check the dependency graph from Step 1
- If any dependency issue is not `shipped` (still `pending`, `failed`, `blocked`, or not in state file) → skip as blocked
- The dependency issue itself may have failed or been skipped — in either case, this issue cannot proceed safely

When skipping:

```
⏭️  Skipping Issue #N: {title}
   Reason: {why}
```

When blocked:

```
🔒 Blocking Issue #N: {title}
   Reason: dependency #{dep_number} not shipped ({status})
```

Update state: `pending` → `skipped` or `pending` → `blocked`（同步更新 `.issues` 的 `**Status:**`），写检查点，运行 **3h Branch Cleanup**，进入下一个 issue。

### 3c. Implement (内联自主实现)

Update state: `pending` → `in_progress`, `phase: "implement"`, write checkpoint.

**由 agent 内联完成实现**（本环境无 `goal` 命令/skill 可调用，必须自己干）：

1. 读取该 issue 的标题与正文，提取需求与全部验收条件（Acceptance Criteria）；若正文引用了同目录的 `.prd`/`.spec` 文件，一并读取作为上下文
2. 阅读相关现有代码，遵循项目既有风格、命名与依赖约定
3. 实现/修改代码以满足全部验收条件
4. 跑项目的构建、测试与 lint（如 `npm --prefix vault-server run build`、`make test`、`go test ./...` 等，按项目实际来）
5. 持续工作直到该 issue 的验收条件**全部满足**且测试/构建/lint 通过

> 不要尝试用 Skill 工具调用 `goal`（会报 `goal is a UI command, not a skill`），也不要因找不到 `/goal` 而中止——实现就是你自己内联完成的工作。

**On success:**

```
✅ Issue #N implementation complete
```

Write checkpoint with `phase: "implement_done"`.

**On failure** — classify error (see 错误分类与恢复), apply recovery strategy, retry up to max attempts. If all retries exhausted:

```
⚠️  Issue #N failed: {error_class} after {attempts} attempts
   Manual intervention required.
```

Update state: `in_progress` → `failed`, write checkpoint, run **3h Branch Cleanup**, proceed to next issue.

### 3d. Review with /review-it

Write checkpoint with `phase: "review"`.

```
/review-it
```

**If review finds actionable issues:**

```
🔍 Review found N issue(s) for #N. Fixing...
```

Fix each accepted finding, re-run `/review-it`. Repeat until clean or max 2 review rounds.

**If review is clean:**

```
✅ Review clean for Issue #N
```

Write checkpoint with `phase: "review_done"`.

### 3e. Document with /note-it

After review, before ship — capture implementation notes:

```
/note-it
```

This creates `docs/issue#XXXX.html` with design decisions, deviations, tradeoffs, and open questions.

**On success:**

```
📝 Issue #N notes captured
```

**On failure** (can't determine issue number, etc.) — print warning but **do not block shipping**:

```
⚠️  /note-it failed for Issue #N: {reason}. Continuing to ship.
```

Write checkpoint with `phase: "note_done"`.

### 3f. Local Ship（本地提交 + 状态更新 + 合并）

本 skill 的 ship = 纯本地操作，**不创建 PR、不 push**：

1. **更新 `.issues`**：将该 Issue 的 `**Status:** pending` → `**Status:** shipped`，并把其验收条件 `- [ ]` 全部勾选为 `- [x]`（已满足的）
2. **提交**到功能分支：

   ```bash
   git add -A
   git commit -m "feat: implement issue #N - {title}"
   ```

3. **合并到默认分支**（本地 fast-forward 合并，替代远端 PR merge）：

   ```bash
   git checkout main   # 或 master
   git pull            # 仅在远程可达时执行
   git merge --ff-only feat/issue-{N}-{short-desc}
   ```

   - 若用户明确要求保留功能分支不合并（比如要自己 review），则跳过合并，仅提交并标记 shipped，分支保留
4. 写检查点：`in_progress` → `shipped`，记录 `completed_at`

**On success:**

```
🚀 Issue #N shipped locally!
```

**On failure** — classify error (see 错误分类与恢复), apply recovery. If unresolvable:

```
⚠️  Issue #N ship failed: {error}. Manual merge required.
```

Update state: `in_progress` → `failed`, `phase: "ship"`, write checkpoint, run **3h Branch Cleanup**, proceed to next issue.

### 3g. Checkpoint

After successful ship, update state: `in_progress` → `shipped`, set `completed_at`, write checkpoint. Print progress (see 进度可观测性).

### 3h. Branch Cleanup

After each issue (shipped, skipped, or failed):

```bash
# 切回默认分支
git checkout main   # 或 master
git pull            # 仅在远程可达时执行

# 删除本地功能分支（仅当 shipped 且已合并时）
git branch -d feat/issue-{N}-{short-desc}
```

**For failed issues**: do NOT delete the branch. Keep it for investigation.

### Next Issue

Return to Step 3 for the next issue in topological order.

When all issues in the feature processed, print final summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Loop Complete — .feature-001-priority-system
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Shipped:   N issues  (#1, #3, ...)
  ⏭️  Skipped:   N issues  (#2 — reason, #5 — reason, ...)
  🔒 Blocked:   N issues  (#7 — depends on #4, ...)
  ❌ Failed:    N issues  (#4 — error, ...)
  📋 Total:     N issues
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

然后继续下一个 feature（若选择了多个）。全部完成时打印总览。

---

## 错误分类与恢复

当错误发生时，先分类，再按策略恢复。

| 错误类别 | 检测信号 | 恢复策略 | 最大重试 |
|----------|---------|---------|---------|
| build_failure | 编译错误、undefined、类型错误 | 读错误，修代码，重新构建 | 3 |
| test_failure | 断言失败、test failed | 读测试输出，修实现，重跑测试 | 3 |
| lint_failure | lint 错误、格式问题 | 自动修复 (lint --fix)，重跑 | 2 |
| merge_conflict | CONFLICT 标记 | rebase 默认分支，解决冲突，重试合并 | 2 |
| auth_failure | 403、401、认证错误 | 停止，告知用户重新认证 | 0 |
| network_error | timeout、connection refused | 等待 30s，重试 | 3 |
| issue_unclear | issue 无验收条件且无法推断需求 | 跳过，标记 failed | 0 |
| unknown | 其他情况 | 记录完整错误，跳过 | 0 |

**恢复协议：**

1. 匹配错误类别
2. 匹配成功 → 应用恢复策略，重试最多 N 次
3. 重试全部失败 → 标记 `failed`，写检查点，继续下一个 issue
4. 无法匹配 → 标记 `failed`（error_class: `unknown`），继续
5. **绝不无限重试。绝不未经确认 force-push / force-merge。**

---

## 进度可观测性

每完成一个 issue 后，打印结构化进度：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Progress: 3/4 issues (75%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Shipped:  #1, #2
  ⏭️  Skipped:   #4 (question)
  ❌ Failed:    #3 (build_failure — 3 attempts)
  📋 Remaining: —
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Logging Rules

Every key step MUST print a log line with emoji prefix:

| Emoji | Meaning |
|-------|---------|
| 📋 | Fetch / list |
| 🔄 | Processing issue |
| ⏭️ | Skip |
| 🔒 | Blocked (dependency not shipped) |
| ✅ | Success |
| ❌ | Failure |
| 🔍 | Review |
| 📝 | Notes (/note-it) |
| 🚀 | Ship |
| ⚠️ | Warning / retry |
| 📊 | Progress / summary |

---

## Safety Guards

- **Never force-push / force-merge to main/master** — always use feature branches and `--ff-only`
- **Never skip review** — always run `/review-it` before shipping
- **Never skip notes** — always run `/note-it` before shipping（best-effort，不阻塞）
- **Max retries per error class** — 参见错误分类与恢复表，不无限重试
- **Max 2 review rounds** — don't over-polish
- **Never auto-delete failed branches** — 保留供调查
- **Checkpoint at every transition** — 每次状态变更写检查点，不仅仅在 ship 时
- **State file integrity** — 损坏时警告用户，绝不自动覆盖
- **State file in .gitignore** — 提醒用户添加 `.feature/**/.loop-local-state.json`
- **Strictly sequential** — 一次只处理一个 issue（实现会修改工作树，不能并行）
- **Skip dependency-blocked issues** — 依赖的 issue 未 shipped 时标记 `blocked`
- **纯本地，不依赖 gh** — 本 skill 不调用 gh CLI；不 push、不建 PR（除非用户明确要求）
- **实现由 agent 内联完成** — 本环境无 `goal` 命令/skill 可调用；「实现 issue」必须由 agent 自己读 issue、写代码、跑测试完成。报 `goal is a UI command, not a skill` 时不要中止，直接内联实现

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| 没有任何 `.feature-*/` 目录 | 打印提示先运行 `/prd` → `/to-issues`，退出 |
| `.issues` 文件缺失 | 打印提示先运行 `/to-issues` 生成该 feature 的 `.issues`，退出 |
| `.issues` 无法解析（损坏） | 警告用户，提供从头开始或中止选项，绝不自动覆盖 |
| 所有 issue 都是 question | Skip all, report summary |
| Issue 无正文 | 只用标题判断 skip/implement |
| Issue 引用了 `.prd`/`.spec` | 读取同目录的 `.prd`/`.spec` 作为上下文，agent 内联实现 |
| 多个 issue 互相依赖 | 拓扑排序；依赖已 shipped 的先处理 |
| Git 工作树 dirty | 前置检查 Check 2: stash/abort/force |
| 状态文件损坏 (invalid JSON) | 警告用户，提供从头开始或中止选项。绝不自动覆盖 |
| 状态文件属于不同 feature | 状态文件在 feature 目录内，天然隔离；不匹配则警告并提供从头开始选项 |
| Issue `in_progress` from previous run | 检查分支是否存在、是否有变更 → 恢复或重新开始 |
| User aborts mid-loop | 状态文件已包含最新检查点，下次运行可恢复 |
| 循环期间新增 issue | 不重新解析。完成当前批次后运行新 `/loop-it-local` |
| Circular dependencies | 打印警告，按编号顺序打破循环 |
| `/note-it` can't find issue number | 打印警告，跳过 /note-it，继续 ship |
| `.loop-local-state.json` is git-tracked | 警告用户添加到 .gitignore，继续 |
| 用户想要 push / 建 PR | 本地 ship 之外额外询问远程仓库地址，`git push -u origin <branch>` 后可选创建 PR（需 gh） |
| 误以为需要外部 `goal` 命令 | 本环境无此命令；「实现 issue」由 agent 内联完成（读 issue → 写代码 → 测试），不要中止循环 |

---

## Relationship to Other Skills

```
/loop-it-local
  ├── 内联实现   ← implement each issue（agent 自主读 issue、写代码、测试；非外部命令）
  ├── /review-it  ← review code before shipping（skill）
  ├── /note-it    ← capture implementation notes (best-effort)（skill）
  └── 本地 ship    ← commit + 更新 .issues 状态 + 本地合并（不 push / 不建 PR）
```

Part of the local feature workflow pipeline:

```
/prd → /prd-to-spec → /to-issues → /loop-it-local (→ 内联实现 → /review-it → /note-it → 本地ship)×N
```
