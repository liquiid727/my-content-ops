---
name: prd
description: "Generate a Product Requirements Document (PRD) for a new feature and save it into the .feature workspace (.feature/.feature-<NNN>-<slug>/.prd). Use when planning a feature, starting a new project, or when asked to create a PRD. After PRD is confirmed, use /prd-to-spec (optional) for technical design, then /to-issues to create local implementable tickets. Triggers on: create a prd, write prd for, plan this feature, requirements for, spec out, 写PRD, 需求文档, 需求分析, 规格说明."
user-invocable: true
---

# PRD Generator

Create detailed Product Requirements Documents that are clear, actionable, and suitable for implementation. After PRD is confirmed, use `/to-issues` to decompose it into Issues, and optionally `/prd-to-spec` for technical design before that.

---

## 目录约定 (Feature Workspace)

所有需求文档默认写入仓库根目录下的 `.feature/` 工作区。每个 feature 一个独立目录，配套的 `.prd / .spec / .issues / .test` 需求文档都放在该目录下：

```
.feature/
└── .feature-<NNN>-<slug>/
    ├── .prd        # 需求文档 PRD —— 本 skill 产出
    ├── .spec       # 技术规格 SPEC —— /prd-to-spec 产出
    ├── .issues     # 本地 issue 列表 —— /to-issues 产出
    └── .test       # 测试计划 / 测试文档 —— 与实现配套
```

- `<NNN>`：三位序号，按已存在的 `.feature-*` 目录自动递增（001、002、…）
- `<slug>`：kebab-case 功能名，从 feature 描述中提取（如 `priority-system`）
- 定位规则：`/prd` 先创建目录，后续 `/prd-to-spec`、`/to-issues`、`/loop-it-local` 复用同一目录
- 文件名不带扩展名，内容为 Markdown

---

## The Job

1. Receive a feature description from the user
2. Ask clarifying questions to cover key ambiguities — scale the count to complexity, not a fixed number (see Step 1)
3. Generate a structured PRD based on answers
4. **Present PRD to user for review** — ask "Please review the PRD. Let me know if any adjustments are needed, or reply OK to confirm."
5. Apply any adjustments, then create `.feature/.feature-<NNN>-<slug>/` and save PRD to `.feature/.feature-<NNN>-<slug>/.prd`
6. **Suggest next steps** (see Step 3)

**Important:** Do NOT start implementing. Just create the PRD.

---

## Step 0: 确定 feature 目录

保存前确定并创建目标目录：

1. `ls -d .feature/.feature-*` 列出已有 feature 目录（无则从序号 001 开始）
2. 下一个序号 = max(已有序号) + 1，补零到 3 位（001、002、…）
3. feature 目录名 = `.feature-<NNN>-<slug>`，slug 取 kebab-case 功能名
4. `mkdir -p .feature/.feature-<NNN>-<slug>`
5. 若用户指定了已有 feature 目录，直接复用，不新建

---

## Step 1: Clarifying Questions

Ask only critical questions where the initial prompt is ambiguous. **Scale the number of questions to the feature's complexity — the goal is covering key ambiguities, not hitting a fixed count:**

- **Simple, well-scoped feature:** 2-3 questions
- **Typical feature:** 3-5 questions
- **Complex feature** (multiple user roles, cross-system integration, significant ambiguity): 6-8 questions

If a dimension is already unambiguous from the user's input, skip it — don't ask filler questions just to reach a number. Focus on:

- **Problem/Goal:** What problem does this solve?
- **Core Functionality:** What are the key actions?
- **Scope/Boundaries:** What should it NOT do?
- **Success Criteria:** How do we know it's done?

### Format Questions Like This:

```
1. What is the primary goal of this feature?
   A. Improve user onboarding experience
   B. Increase user retention
   C. Reduce support burden
   D. Other: [please specify]

2. Who is the target user?
   A. New users only
   B. Existing users only
   C. All users
   D. Admin users only

3. What is the scope?
   A. Minimal viable version
   B. Full-featured implementation
   C. Just the backend/API
   D. Just the UI
```

This lets users respond with "1A, 2C, 3B" for quick iteration. Remember to indent the options.

---

## Edge Cases & Fallback

| Scenario | Handling |
|----------|----------|
| User skips clarifying questions (e.g., replies "whatever", "just write it") | Fill with reasonable defaults, mark with `[Assumption]` in PRD, prompt user to confirm during review |
| User input is too vague (e.g., "add a feature") | Ask once for specifics; if still vague, infer from project context and mark assumptions |
| `.feature/` directory does not exist | Auto-create `.feature/.feature-<NNN>-<slug>/` |
| feature-name is hard to extract from input | Ask the user directly: "Suggested feature dir is .feature-001-<slug>, please confirm or modify" |
| User requests PRD changes after review | Apply changes and re-save without re-running the clarification flow |
| PRD content exceeds 500 lines | Suggest the user consider splitting into multiple sub-feature PRDs |
| User declines to proceed | Just save the PRD, user can run `/to-issues` later |
| Issue creation needed later | Suggest running `/to-issues` with the saved `.prd` |

---

## Step 2: PRD Structure

Generate the PRD with these sections:

### 1. Introduction/Overview
Brief description of the feature and the problem it solves. Use plain language — avoid jargon or explain it. Assume the reader may be a junior developer or AI agent.

### 2. Goals
Specific, measurable objectives (bullet list).

### 3. User Stories
Each story needs:
- **Title:** Short descriptive name
- **Description:** "As a [user], I want [feature] so that [benefit]"
- **Acceptance Criteria:** Verifiable checklist of what "done" means

**Numbering rule:** US-001, US-002, US-003... (three digits, starting from 001). Each US should be independently implementable and small enough to complete within one focused agent session.

**Acceptance criteria self-check template:** Each criterion must satisfy at least one of the following, otherwise it is considered "vague" and must be rewritten:
- Observable: describes a specific UI state or API response (e.g., "button shows confirmation dialog")
- Testable: has clear input/output pairs (e.g., "entering an empty email shows a red warning")
- Verifiable: can be checked by tools (e.g., "Typecheck/lint passes")
- ❌ Bad example: "works correctly", "good user experience", "excellent performance" → these are unverifiable

**Format:**
```markdown
### US-001: [Title]
**Description:** As a [user], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] Specific verifiable criterion
- [ ] Another criterion
- [ ] Typecheck/lint passes
- [ ] **[UI stories only]** Verify in a browser (e.g., via the `run` skill)
```

**Important:** 
- Acceptance criteria must be verifiable, not vague. "Works correctly" is bad. "Button shows confirmation dialog before deleting" is good.
- **For any story with UI changes:** Always include "Verify in a browser" as acceptance criteria (e.g., via the `run` skill). This ensures visual verification of frontend work.

### 4. Functional Requirements
Numbered list of specific functionalities:
- "FR-1: The system must allow users to..."
- "FR-2: When a user clicks X, the system must..."

**FR specification:** Each FR starts with `FR-N:` (N increments from 1), uses "system must / system shall" phrasing, and describes **one** specific behavior. Avoid combining multiple "and"-linked behaviors in a single FR.

### 5. Non-Goals (Out of Scope)
What this feature will NOT include. Critical for managing scope.

### 6. Design Considerations (Optional)
- UI/UX requirements
- Link to mockups if available
- Relevant existing components to reuse

### 7. Technical Considerations (Optional)
- Known constraints or dependencies
- Integration points with existing systems
- Performance requirements

### 8. Success Metrics
How will success be measured?
- "Reduce time to complete X by 50%"
- "Increase conversion rate by 10%"

### 9. Open Questions
Remaining questions or areas needing clarification.

---

## Output

- **Format:** Markdown（存为无扩展名的 `.prd` 文件，内容是 Markdown）
- **Location:** `.feature/.feature-<NNN>-<slug>/`
- **File:** `.prd`
- 每个 feature 目录里只放一份 `.prd`；迭代更新直接覆盖 `.prd`

---

## Step 3: Next Steps

After the PRD is saved, suggest the user:

```
✅ PRD saved to .feature/.feature-<NNN>-<slug>/.prd

Next steps:
  /prd-to-spec    →  Generate technical SPEC → .feature/.feature-<NNN>-<slug>/.spec (optional)
  /to-issues      →  Decompose into local Issues → .feature/.feature-<NNN>-<slug>/.issues

Or go straight to implementation:
  /to-issues      →  Create local Issues, then /loop-it-local to implement
```

If the user wants to proceed, invoke the corresponding skill.

---

## Example PRD

```markdown
# PRD: Task Priority System

## Introduction

Add priority levels to tasks so users can focus on what matters most. Tasks can be marked as high, medium, or low priority, with visual indicators and filtering to help users manage their workload effectively.

## Goals

- Allow assigning priority (high/medium/low) to any task
- Provide clear visual differentiation between priority levels
- Enable filtering and sorting by priority
- Default new tasks to medium priority

## User Stories

### US-001: Add priority field to database
**Description:** As a developer, I need to store task priority so it persists across sessions.

**Acceptance Criteria:**
- [ ] Add priority column to tasks table: 'high' | 'medium' | 'low' (default 'medium')
- [ ] Generate and run migration successfully
- [ ] Typecheck passes

### US-002: Display priority indicator on task cards
**Description:** As a user, I want to see task priority at a glance so I know what needs attention first.

**Acceptance Criteria:**
- [ ] Each task card shows colored priority badge (red=high, yellow=medium, gray=low)
- [ ] Priority visible without hovering or clicking
- [ ] Typecheck passes
- [ ] Verify in a browser (e.g., via the `run` skill)

### US-003: Add priority selector to task edit
**Description:** As a user, I want to change a task's priority when editing it.

**Acceptance Criteria:**
- [ ] Priority dropdown in task edit modal
- [ ] Shows current priority as selected
- [ ] Saves immediately on selection change
- [ ] Typecheck passes
- [ ] Verify in a browser (e.g., via the `run` skill)

### US-004: Filter tasks by priority
**Description:** As a user, I want to filter the task list to see only high-priority items when I'm focused.

**Acceptance Criteria:**
- [ ] Filter dropdown with options: All | High | Medium | Low
- [ ] Filter persists in URL params
- [ ] Empty state message when no tasks match filter
- [ ] Typecheck passes
- [ ] Verify in a browser (e.g., via the `run` skill)

## Functional Requirements

- FR-1: Add `priority` field to tasks table ('high' | 'medium' | 'low', default 'medium')
- FR-2: Display colored priority badge on each task card
- FR-3: Include priority selector in task edit modal
- FR-4: Add priority filter dropdown to task list header
- FR-5: Sort by priority within each status column (high to medium to low)

## Non-Goals

- No priority-based notifications or reminders
- No automatic priority assignment based on due date
- No priority inheritance for subtasks

## Technical Considerations

- Reuse existing badge component with color variants
- Filter state managed via URL search params
- Priority stored in database, not computed

## Success Metrics

- Users can change priority in under 2 clicks
- High-priority tasks immediately visible at top of lists
- No regression in task list performance

## Open Questions

- Should priority affect task ordering within a column?
- Should we add keyboard shortcuts for priority changes?
```

---

## Checklist

Before saving the PRD:

- [ ] Asked clarifying questions with lettered options
- [ ] Incorporated user's answers
- [ ] User stories are small and specific
- [ ] Functional requirements are numbered and unambiguous
- [ ] Non-goals section defines clear boundaries
- [ ] Created `.feature/.feature-<NNN>-<slug>/` and saved PRD to `.prd`
- [ ] Suggested next steps: `/prd-to-spec` (optional) and `/to-issues`
