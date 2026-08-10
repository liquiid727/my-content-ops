---
name: to-issues
description: "Decompose a PRD and/or SPEC into implementable Issues and save them locally into the .feature workspace (.feature/.feature-<NNN>-<slug>/.issues). Local storage is the default; GitHub / Baidu iCafe are opt-in. Use after /prd (and optionally /prd-to-spec) to turn requirements into actionable tickets. Triggers on: create issues, to-issues, 创建issue, 拆解issue, 生成卡片, 创建卡片, generate issues from PRD, issues from spec."
user-invocable: true
---

# to-issues — PRD/SPEC to Issues

Decompose a PRD and/or technical SPEC into small, independent, implementable Issues, then create them in your chosen platform. Works standalone — you don't need to have run `/prd` first.

---

## 目录约定 (Feature Workspace)

与 `/prd`、`/prd-to-spec` 共用 `.feature/` 工作区。每个 feature 一个目录，Issue 列表写到与输入文档相同的 feature 目录下：

```
.feature/
└── .feature-<NNN>-<slug>/
    ├── .prd        # 需求文档 PRD
    ├── .spec       # 技术规格 SPEC
    ├── .issues     # 本地 issue 列表 —— 本 skill 产出（默认本地存放）
    └── .test       # 测试计划 / 测试文档
```

- **默认本地存放**：`.issues` 是单个 Markdown 文件，列出该 feature 的全部 Issue
- 每个 Issue 带 `**Status:**` 字段，由 `/loop-it-local` 在实现过程中更新
- 需要同步 GitHub / iCafe 时，在确认后作为额外动作执行

---

## The Job

1. **Locate input** — find a PRD or SPEC file in `.feature/` (auto-detect or user-specified)
2. **Decompose into Issues** — break User Stories into implementable tickets
3. **Review with user** — present Issue list for approval and adjustment
4. **Create Issues** — write to `.issues` (local, default)；GitHub / iCafe 为可选
5. **Print summary** — report the resulting Issue list

---

## Step 1: Locate Input

Find the input document:

```
What should I base the Issues on?

A. Auto-detect: scan .feature/ for recent .prd and .spec
B. Specific feature dir (e.g., .feature/.feature-001-priority-system)
C. Specific PRD/SPEC file (e.g., .feature/.feature-001-priority-system/.prd)
D. Both PRD and SPEC (best: PRD for requirements, SPEC for technical contracts)
E. Paste requirements directly
```

If auto-detecting, list available files and let the user choose.

If both PRD and SPEC are available, use the SPEC's Section 10.2 (Issue Mapping) as the primary guide, supplemented by PRD's User Stories. If only PRD is available, generate Issues directly from User Stories.

---

## Step 2: Decompose into Issues

Based on the input document(s), generate a list of Issues. Follow these rules:

- **One Issue per User Story** — each US-XXX becomes at least one Issue
- **Split large stories** — if a US has 5+ acceptance criteria or spans frontend + backend, split into 2-3 smaller Issues with clear dependencies
- **Merge tiny stories** — if a US has only 1-2 trivial criteria, merge it with a related US into a single Issue
- **Each Issue must be independently implementable** — a single agent session should be able to complete it
- **Number Issues sequentially** starting from 1
- **If SPEC is available** — enrich Issues with SPEC references (API endpoints, data model sections, error handling contracts)

**Issue format (in `.issues`):**

```markdown
## Issue #N: [Title]

**Description:** [From US description, with context]

**Acceptance Criteria:**
- [ ] [From US acceptance criteria]
- [ ] ...

**Dependencies:** [None / #X]
**Type:** [backend / frontend / fullstack / ui / infra]
**Priority:** [high / medium / low]
**Status:** [pending]
**SPEC Reference:** [§X.Y — only if SPEC available]
```

**Present the Issue list for review:**

```
📋 Generated N Issues from [PRD/SPEC]:

#1: Add priority field to database (backend, high)
#2: Display priority indicator on task cards (frontend, high) — depends on #1
#3: Add priority selector to task edit (frontend, medium) — depends on #1
#4: Filter tasks by priority (frontend, medium) — depends on #1, #2

Please review. You can:
- Remove issues: "remove #3"
- Merge issues: "merge #2 and #3"
- Add issues: "add an issue for sorting by priority"
- Adjust: "change #2 priority to high"
- Confirm: reply OK to proceed
```

Wait for user confirmation before creating any Issues.

---

## Step 3: Choose Creation Mode

**默认直接写本地 `.issues`，无需询问。** 仅当用户明确要求同步到远程平台时，才询问：

```
默认写入本地 .issues 文件。是否需要额外同步到远程平台？

A. 仅本地（默认）—— 写入 .feature/.feature-<NNN>-<slug>/.issues
B. 同时同步 GitHub（需要 gh CLI）
C. 同时同步 Baidu iCafe（需要 icafe-cli）
D. 仅同步到远程，不写本地

Your choice:
```

用户不明确要求时，走默认的 A（仅本地）。

---

## Step 4: Mode-Specific Creation

### Mode A: Local（默认）

目标文件：`.feature/.feature-<NNN>-<slug>/.issues`（与输入 `.prd` / `.spec` 同目录）

**Actions:**
1. 确定目标 feature 目录（同输入文档所在目录）；不存在则自动创建
2. 生成 `.issues` 文件，头部含元信息，其后按 `## Issue #N: <Title>` 分节列出全部 Issue：

   ```markdown
   # Issues — <Feature Name>

   > Feature: .feature-<NNN>-<slug>
   > Source: .prd / .spec | Generated: <date>
   > 状态：Status 由 /loop-it-local 在实现过程中更新

   ---

   ## Issue #1: <Title>

   **Description:** <...>

   **Acceptance Criteria:**
   - [ ] <criterion 1>
   - [ ] <criterion 2>

   **Dependencies:** None / #X
   **Type:** backend / frontend / fullstack / ui / infra
   **Priority:** high / medium / low
   **Status:** pending
   **SPEC Reference:** §X.Y
   ```

3. 所有 Issue 初始 `**Status:** pending`
4. 报告文件路径

### Mode B: GitHub（可选）

**Prerequisites:** `gh` CLI installed and authenticated.

**Actions:**
1. For each Issue, run:
   ```bash
   gh issue create --title "[Title]" --body "[Description + Acceptance Criteria]" --label "[type]" --label "priority: [priority]"
   ```
2. If labels don't exist, create them first or skip the `--label` flag
3. Report created Issue numbers and URLs

### Mode C: Baidu iCafe（可选）

**Ask user:**
```
Please provide the iCafe space prefix code (--space):
```

Optionally ask:
```
Target branch for iCode CR? (default: master)
```

**Prerequisites:** `icafe-cli` installed and logged in.

**Actions:**
1. For each Issue, run:
   ```bash
   icafe-cli card create --space [SPACE] --title "[Title]" --description "[Description + Acceptance Criteria]" --cardtype "[Task/Bug/Story]"
   ```
   - Map Issue `type` to iCafe card type: `bug` → `Bug`, `ui`/`frontend` → `Story`, others → `Task`
   - Map `priority`: high → `高`, medium → `中`, low → `低`
2. If iCafe card creation fails for an Issue, log the error and continue with remaining Issues
3. Report created card sequence numbers

---

## Step 5: Summary Report

After all Issues are created, print a summary:

```
✅ Issue creation complete!

Source: [PRD/SPEC path]
Mode: Local（.feature/.feature-<NNN>-<slug>/.issues）
Issues created: N

#  | Title                                    | Status
---|------------------------------------------|--------
1  | Add priority field to database           | pending
2  | Display priority indicator               | pending
3  | Add priority selector                    | pending
4  | Filter tasks by priority                 | pending

💡 Tip: 实现这些 Issue：
  /loop-it-local   # 自动按依赖顺序实现 .issues 中的全部 Issue
```

---

## Edge Cases & Fallback

| Scenario | Handling |
|----------|----------|
| No PRD/SPEC found in `.feature/` | Ask user to provide a feature dir / file path, or paste requirements |
| PRD has no User Stories | Derive Issues from Functional Requirements instead |
| SPEC has Issue Mapping (Section 10.2) | Use it as primary source, cross-reference with PRD |
| `gh` CLI not authenticated for GitHub mode | Show error, suggest `gh auth login`, offer to fall back to Local mode |
| `icafe-cli` / `icode-cli` not installed for Baidu mode | Show error, suggest installation, offer to fall back to Local mode |
| `.feature-<NNN>-<slug>/` does not exist | Auto-create the directory, then write `.issues` |
| `.issues` already exists | Confirm with user: overwrite, or append new Issues? Default: confirm before overwrite |
| User declines Issue creation | Print the Issue list as a text summary, let user create manually later |

---

## Relationship to Other Skills

```
/prd  →  /prd-to-spec (optional)  →  /to-issues  →  /loop-it-local
 │              │                        │              │
 │  Requirements │  Technical design     │  Tickets     │  Implementation
 │  (what)       │  (how)                │  (units)     │  (code)
```

- **/prd** — produces the PRD (input to this skill)
- **/prd-to-spec** — produces the SPEC (optional, enriches Issues with technical detail)
- **/to-issues** — produces the local `.issues` file (this skill)
- **/loop-it-local** — implements local Issues one by one
