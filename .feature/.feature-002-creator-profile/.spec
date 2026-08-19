# SPEC: Creator Profile（创作者画像 / 风格 / 记忆层）

> 来源：[`.prd`](../.prd)
> 生成日期：2026-08-10
> 技术基线：Foundation FND-01~14（Hono + SQLite/Drizzle + `/api/v1` + 错误 envelope + `revision` 乐观并发 + Task Runtime）
> **此 spec 同时定义 Personal Style 契约，供 canvas-runtime 的 Project 绑定与 Context Assembly 消费（跨 feature 契约）。**
> 状态：待评审
> 覆盖 US：US-001～US-005

## 1. Summary

### 1.1 What This SPEC Covers

Creator Profile 是创作者在所有 AI 创作节点上的基础上下文：一套「我是谁 / 面向谁 / 怎么表达 / 我知道什么」的可复用资产。本 spec 定义其数据模型（七块全量）、CRUD API、注入设置（Injection Settings）与 Context 渲染契约，并确保 canvas-runtime 的 Project 可绑定它、Context Assembly 可注入它。

### 1.2 PRD Reference

- 来源文档：`creator-studio/docs/creator-profile/feauture01-person.md`
- User Stories：US-001 查看编辑画像、US-002 维护 Voice、US-003 注入设置、US-004 Obsidian 导入、US-005 Personal Style 契约
- Functional Requirements：FR-1～FR-7

### 1.3 Design Decisions Summary

| 决策 | 选择 | 原因 |
| --- | --- | --- |
| Personal Style 契约归属 | 由 **creator-profile spec** 定义，canvas-runtime spec 引用 | 避免契约两处漂移；风格是画像的投影 |
| 存储形态 | 扩展现有 `creator_profiles` 表 + `preferences_json`，新增 `style_json`/`profile_json` | Foundation 已有 `creator_profiles` 雏形，只加 JSON 列，避免表爆炸 |
| 字段建模 | 结构化的七块 schema（Identity/Positioning/Audience/Voice/Knowledge/Memory/Rules）+ 允许 `extra` 自由扩展 | 常用字段强类型保证 UI/注入可用；自由扩展覆盖长尾 |
| 注入粒度 | Injection Settings 按「区块」开关 + 全局开关，输出确定性注入文本 | MVP 不做逐词权重，粒度到区块足够 |
| 导入 | Server 侧读 vault（走 connector/本地文件），不暴露绝对路径给浏览器 | 沿用 Foundation「浏览器不接触 Shell/绝对路径」约束 |
| 并发 | 沿用 `revision` 乐观并发 + `/api/v1` 错误 envelope | 与 Foundation 一致 |

---

## 2. Architecture

### 2.1 System Context

```
Browser (AppShell + 画像页 + Injection 预览)
        │ Same-Origin HTTP
        ▼
Creator Studio Server
  ├── creator-profile module  (CRUD + 渲染 + 导入)
  └── context-render          (inject(profile, scope) → 注入文本)
        │
        ├── SQLite: creator_profiles / projects
        └── Vault Connector (Obsidian 导入)

canvas-runtime
  └── Project.personalStyleId ──► 读 CreatorProfile ──► Context Assembly 注入
```

### 2.2 Component Design

- **contracts**：`creator-profile.ts` — CRUD 请求/响应 schema、`PersonalStyle` 类型、`InjectScope`、渲染结果。
- **server / creator-profile**：repository（读 `creator_profiles`）、service（CRUD + 渲染 + revision 校验）、routes（`/api/v1/creator-profile`）。
- **server / context-render**：纯函数 `inject(profile, scope)` 输出字符串。
- **web / modules/creator-profile**：api client、store、页面（表单区块 + Injection 预览）。

### 2.3 Module Interactions

- 查询：`GET /creator-profile` → service → repository → SQLite。
- 更新：`PATCH /creator-profile/:id`（含 `revision`）→ 404 或 409 `PROJECT_REVISION_CONFLICT`。
- 注入：canvas-runtime 场景调用 `renderContext({ profileId, scope })` 拿注入文本。

### 2.4 File Structure

```
creator-studio/packages/contracts/src/
  creator-profile.ts            [NEW]  PersonalStyle 契约 + CRUD schema + 渲染契约
  index.ts                      [MODIFY] 导出
creator-studio/apps/server/src/
  creator-profile/              [NEW]
    creator-profile-routes.ts
    creator-profile-service.ts
    creator-profile-repository.ts
    context-render.ts           纯函数 inject/render
    index.ts
  db/schema.ts                  [MODIFY] creator_profiles 加列
  db/migrations.ts              [MODIFY] 新迁移
  repositories/或直接模块内       [MODIFY 或 NEW]
creator-studio/apps/web/src/
  modules/creator-profile/      [NEW]
    creator-profile-api.ts
    creator-profile-store.ts
    creator-profile-form.tsx
    injection-preview.tsx
    index.ts
  routes/creator-profile-page.tsx  [NEW]
  app/router                     [MODIFY]
```

---

## 3. Data Model

### 3.1 Schema Change（扩展 `creator_profiles`）

现有列：`id, workspace_id, display_name, avatar_asset_id, bio, preferences_json, created_at, updated_at`

新增列：

| 列 | 类型 | 说明 |
|---|---|---|
| `profile_json` | text (JSON) | 七块画像内容 + `extra` 自由扩展（见 3.2） |
| `injection_json` | text (JSON) | Injection Settings 开关（见 3.4） |

不新增表：单 workspace 单人，画像数据量小，JSON 列足够且避免过度规范化。未来记忆层可拆独立表 `creator_memories`。

### 3.2 Entity Definitions — PersonalStyle（契约）

```ts
// packages/contracts/src/creator-profile.ts
interface CreatorIdentity {
  creatorName: string        // 主账号名
  nicknames: Record<string, string>  // 平台 → 昵称（公众号/抖音/...）
  currentRole?: string
  background?: string
  personalStory?: string
  mission?: string
}

interface Positioning {
  summary: string
  nicheTags: string[]        // AI Coding / AI工具 / 独立开发
  differentiation?: string
  valueProposition?: string  // 用户声明，自由文本
  channels?: { platform: string; focus: string }[]
}

interface Audience {
  primaryAudience: string
  knowledgeLevel?: string
  painPoints: string[]
  goals: string[]
}

interface Voice {
  tone: { like: string[]; avoid: string[] }
  writingStyle: { preferredAspects: string[]; sentencePatterns: string[] } // 第一人称、先问后析结...
  vocabulary: { common: string[]; banned: string[] }
}

interface Knowledge {
  domains: string[]
  toolsAndSkills?: string[]
  strengths?: string[]
}

interface Memory {
  pastWorks: { title: string; platform?: string; reflections?: string }[]
  learnings?: string[]        // 后续记忆层演进位
}

interface ContentRules {
  principles: string[]        / content principles
  likedStructures?: string[]
  likedHooks?: string[]
  bannedWords?: string[]
}

interface CreatorProfileData {
  identity: CreatorIdentity
  positioning: Positioning
  audience: Audience
  voice: Voice
  knowledge: Knowledge
  memory: Memory
  rules: ContentRules
  extra?: Record<string, unknown>   // 自由扩展
}
```

zod：`personalStyleSchema` = 上述对象的 strict JSON schema，`extra` 允许任意键（不做深层 strict）。

### 3.3 Relationships

- `projects.personalStyleId`（canvas-runtime 新增）→ `creator_profiles.id`（可空）。MVP 单画像，但保留外键形态。
- 现有 `creator_profiles` 表已含 `display_name/avatar_asset_id/bio`，作为画像的顶层摘要，与 `profile_json` 并存（摘要字段用于列表/头像）。

### 3.4 Injection Settings（`injection_json`）

```ts
interface InjectionSettings {
  enabled: boolean                      // 全局总开关
  sections: Record<SectionKey, boolean> // identity|positioning|audience|voice|knowledge|memory|rules
}
```

MVP 到区块粒度。渲染输出按 `enabled && sections[key]` 决定是否包含该区块文本。

### 3.5 Migration Plan

迁移 `M0XXX_add_creator_profile_json.sql`：`ALTER TABLE creator_profiles ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}'`、`ADD COLUMN injection_json TEXT NOT NULL DEFAULT '{}'`。向后兼容：缺省值当「空画像/全开」。已有 `creator_profiles` 行升级为默认模板或空。

---

## 4. API Design

### 4.1 Endpoints

| Method | Path | Desc | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/creator-profile` | 获取当前画像（含 profile_json + injection_json） | local | — | 200 `CreatorProfileResponse` |
| PATCH | `/api/v1/creator-profile/:id` | 更新画像（revision 乐观并发） | local | `revisionedPatch` | 200 profile / 404 / 409 |
| POST | `/api/v1/creator-profile/import` | 从 vault 导入素材到区块 | local | `{ vaultPath, targetSection }` | 200 `{ profile, imported }` |
| POST | `/api/v1/creator-profile/render` | 给定 profile + scope 渲染注入文本 | local | `{ scope }` | 200 `{ text }` |
| GET | `/api/v1/creator-profile/default` | 获取 seed 示例画像（阿篓） | local | — | 200 profile |

MVP 默认单画像，`GET` 不带 id 取当前；`PATCH` 显式带 id。多画像后续加列表接口，不破坏本 schema。

### 4.2 Request/Response Schemas

```ts
createImportRequestSchema: { vaultPath: string; targetSection: SectionKey }
renderRequestSchema:       { profileId?: string; scope: InjectScope }
renderResponseSchema:      { text: string }

creatorProfileResponseSchema: successEnvelope({
  id, workspaceId,
  displayName, avatarAssetId, bio,
  profile: personalStyleSchema,
  injection: injectionSettingsSchema,
  revision, createdAt, updatedAt,
})
```

`InjectScope`：`'project' | 'topic' | 'outline' | 'script' | 'cover' | 'voice' | 'video' | 'publish'`（供 canvas-runtime Context Assembly 按场景注入，MVP 前端先用 `project`）。

### 4.3 Error Responses（沿用 Foundation envelope）

| code | HTTP | 条件 | 用户消息 |
|---|---|---|---|
| `NOT_FOUND` | 404 | id 不存在 | 画像不存在 |
| `REVISION_CONFLICT` | 409 | revision 不匹配 | 内容已被他人修改，请刷新 |
| `VALIDATION` | 400 | schema 校验失败 | 具体字段错误 |
| `IMPORT_FAILED` | 422 | vault 路径不可读/不存在 | 无法读取该路径 |

### 4.4 Breaking Changes

无。全部为新增接口与新增 JSON 列；既有 `creator_profiles` 行通过默认值兼容。

---

## 5. Business Logic

### 5.1 Core Algorithms

**renderContext(profile, injection, scope)：**
1. 收集 `sections` 中 `enabled && sections[key]===true` 的区块。
2. 对每个区块调用区块渲染器（如 `voice.renderVoice(voice)`），产出一段带标题的 markdown 片段。
3. 用固定模板拼接为单一注入文本（含系统提示头「以下是创作者的风格与背景，请遵循」+ scope 意图）。
4. 若 `injection.enabled===false` 或无不启用区块 → 返回空文本。

**importVault(vaultPath, targetSection)：**
1. 校验路径在允许的 vault 根内（防路径穿越）。
2. 经 connector 或本地文件读 `.md` 文本。
3. 按 `targetSection` 的解析器尝试结构化抽取（定位→positioning 等）；解析失败则整体放入该区块的 `summary/freeText` 草稿。
4. 返回更新后的 profile + `imported` 摘要。

### 5.2 Validation Rules

- `vaultPath` 必须解析于配置的 vault 根之下。
- `displayName` 非空；`nicknames` 键为已知平台；数组字段去重。
- revision 乐观并发（缺省 409）。

### 5.3 State Machine

无复杂状态机。画像为普通可编辑文档，靠 `revision` 保证并发一致。

### 5.4 Edge Cases

- 空画像：全区块为空 → 列表正常、注入输出空文本。
- 自由扩展 `extra`：UI 只读不回写未知键，不走样。
- 导入增量重复：`imported` 返回实际写入区块清单，幂等（重复导入覆盖该区块）。

---

## 6. Error Handling

同 4.3。导入失败返回 `IMPORT_FAILED` 带可读消息，不抛堆栈。渲染永不失败（区块缺省空字符串拼接）。

## 7. Security

- Server 侧负责 vault 读取，浏览器只传 vault 相对路径；校验路径穿越。
- 沿用本地身份（Same-Origin），无远程账户。
- 头像走 asset（`avatar_asset_id`），不直接暴露任意磁盘路径。

## 8. Performance

- 单画像 JSON < 几十 KB；`GET` 可整体返回，无需分页。
- 渲染是纯字符串拼接，O(sections)，常驻缓存 profile 后可忽略不计。

## 9. Testing Strategy

### 9.1 Unit Tests

- `context-render.test.ts`：开关组合、空画像、scope 前缀、`extra` 忽略。
- schema 校验：合法七块通过、非法字段拒绝、`extra` 自由扩展不报错。

### 9.2 Integration Tests

- CRUD：GET / PATCH(with revision) / 409 冲突 / 404。
- import：合法路径成功、越界路径 422、文件缺失 422。

### 9.3 Edge Case Tests

- 一次 `import` 覆盖同名区块、幂等。
- `injection.enabled=false` 渲染空。

### 9.4 Acceptance Criteria Mapping

| US | Test | Type |
|---|---|---|
| US-001 编辑 | CRUD + 字段持久化 | integration + browser |
| US-002 Voice | Voice schema + 区块渲染 | unit |
| US-003 注入 | injection 开关 → 渲染文本变化 | unit + integration |
| US-004 导入 | import 成功/越界/缺失 | integration |
| US-005 契约 | contracts 导出 + 渲染函数 | unit |

## 10. Implementation Plan

### 10.1 Phases

1. 契约：`creator-profile.ts` + schema + types。
2. 后端：迁移 → repository → service（CRUD/render/import skeleton）→ routes。
3. 前端：api/store → 画像编辑页（区块表单）→ Injection 预览。
4. seed：阿篓示例画像。
5. 导入：vault connector 读取 + 解析。

### 10.2 Issue Mapping

| Issue | SPEC Sections | Priority | Depends |
|---|---|---|---|
| 契约与数据模型 | 3, 4.2 | high | — |
| CRUD + revision + 路由 | 3.5, 4, 5 | high | 契约 |
| Context 渲染契约 | 2.2, 5.1, 4.2 | high | 契约 |
| 画像编辑 UI | 2.4, US-001/002 | high | CRUD |
| 注入设置与预览 | 3.4, US-003, 5.1 | medium | UI |
| vault 导入 | 5.1, US-004 | medium | CRUD |
| seed + hardening | US-005, 9 | medium | CRUD |

### 10.3 Incremental Delivery

先契约并对齐 canvas-runtime 消费方 → 后端 API → UI。导入/seed 最后。

## 11. Open Questions & Risks

### 11.1 Unresolved

- 设计稿 `482a7ff6.…png` 需还原确认布局。
- 导入解析器是「整篇塞草稿」还是结构化抽取，取决于 vault 文档有无约定结构（当前 `00-账号定位.md` 有分节，倾向结构化）。

### 11.2 Technical Risks

| Risk | Impact | Mitigation |
|---|---|---|
| JSON 列自由度过高 | 校验/注入不一致 | 七块强 schema，仅 `extra` 自由 |
| 与 Foundation `creator_profiles` 既有字段冲突 | 数据不一致 | 摘要字段与 profile_json 并存，迁移默认值 |
| canvas-runtime 依赖此契约未对齐 | 返工 | 契约先行，两端同步 review |

### 11.3 Assumptions

- 单 workspace 单画像（沿用 Foundation 假设）。
- Personal Style 契约由本 spec 全权定义，canvas-runtime 只引用不重定义。