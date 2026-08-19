# Capability Seam — 实现提示词卡

把 [`capability-seams.md`](./capability-seams.md) 拆成可复制到新对话的任务卡。一次只做一张 PR。做完验收，再开下一张。

## 怎么用

1. 新开一轮对话（或 `/clear`），不要把 Phase 2 和 Phase 3 塞进同一轮。
2. 先贴 **共用约束**，再贴对应 **PR 卡**。
3. 卡里的「不要做」比「要做」更重要。越界就停。
4. 内环命令跑绿再宣称完成。出门禁 `test:foundation` 留给每张 PR 结束，不要每存一次文件都跑。
5. `foundation-bundle.ts` / `index.ts` 串行改：PR-4 → PR-5 → PR-6 → PR-7。不要并行开这些卡。
6. PR-6a 可以随时先做，且必须在 PR-7 之前合入。

可并行：

```text
PR-0（文档）     ─┐
PR-6a（rewrite） ─┴─ 随时，不碰 kernel
PR-1 → PR-2 → PR-3 → PR-4 → PR-5 → PR-6 → PR-7 → …
```

---

## 共用约束（每张卡都先贴）

```
你在 /Users/liquiid/code/content-ops 的 Creator Studio 里实现 Capability Seam。

权威设计：creator-studio/docs/architecture/capability-seams.md
本卡范围之外的内容一律不做。

硬约束：
- 不引入 cordis / @deepseek-ai/dsh-* / 动态 import() 用户路径 / vm / 热更新。
- Spine 不是 Plugin：Project / Artifact / Version / Graph / Recipe 实例 / ChangeSet / 人审 / Task 状态机 / Run / SQLite 不要插件化。
- Host 放 creator-studio/apps/server/src/kernel/。不要新建 packages/kernel。
- catalog.ts 只允许依赖 @creator-studio/contracts 和并列 interface。禁止 import OperationRegistry / ProviderService / ResourceAdapterRegistry / TaskHandlerRegistry 实现类。
- *Registry 类保持 dumb，禁止 import kernel。
- 禁止 getHost() 模块单例。Consumer 只走构造函数注入。
- 不改 HTTP 契约、不改 SQLite schema、不改前端，除非本卡明确要求。
- UI 控件走 apps/web/src/shared/ui/，禁止页面裸 button/input。
- 包管理器 pnpm。内环用卡里的 vitest 命令。出门禁：pnpm -C creator-studio run test:foundation。
- 改完只陈述实际跑过的命令和结果。没跑过的不要说 pass。
```

---

## PR-0 — 文档交叉引用

**可与任何卡并行。代码零改，除 spec 交叉引用。**

```
实现 PR-0：docs: add Capability Seam architecture draft

已完成：creator-studio/docs/architecture/capability-seams.md 已在仓库。

还要做：
1. 在 specs/000-system/spec.md 的 §3.3 Provider seam 和 §3.4 Connector seam 末尾各加一小段，指向
   creator-studio/docs/architecture/capability-seams.md
   说明：实现层 CapabilityHost / Plugin / 注册点以该文档为准；本 SPEC 仍是产品/系统基线。
2. 可选：creator-studio/README.md 文档索引加一行。
3. 不要改 .feature-003 的 .prd / .spec。
4. 不要改任何运行时代码。

验收：链接路径真实存在；三词 Spine / Seam / Plugin 不在 spec 里被重新定义成另一套意思。
```

---

## PR-1 — CapabilityHost 内核

**先做这个再接 index.ts。本卡不要改 index.ts。**

```
实现 PR-1：feat(server): add in-process CapabilityHost

对照 capability-seams.md「CapabilityHost 接口草案」和 Phase 1。

新建（仅这些）：
- apps/server/src/kernel/types.ts
- apps/server/src/kernel/host.ts
- apps/server/src/kernel/catalog.ts
- apps/server/src/kernel/index.ts
- apps/server/src/kernel/host.test.ts

实现 CapabilityHost：
- provide / get / require / registry / on / emit / useWaterfall / waterfall / apply / dispose
- provide 同 key 第二次抛错，除非先 dispose
- registry.register 同 id 第二次抛错
- emit 同步；单个 listener throw 记日志，不阻断其余 listener
- waterfall 按注册顺序串行；listener throw 整条链失败
- dispose LIFO
- waterfall 无 listener 时返回原值
- Host 不持有 Database / Hono

catalog.ts 按文档写出 HostServices / HostRegistries / HostEvents / HostWaterfalls / PreExecuteState / HostEmitter / ProposeOnlyWorkflow / GenerationProviderFactory / RecipeCatalog 等类型。
Phase 1 只需要类型就位；registry / waterfall 可以先空转，但签名一次留全。

不要做：
- 不要改 index.ts
- 不要写 foundation-bundle.ts（那是 PR-2）
- 不要改 ProviderService.resolve、operationDefinitions、HTTP、schema、前端

单测必须覆盖：
- apply 后 require 拿到同一实例
- dispose 后 get 为 undefined；require 同步 throw
  用 expect(() => host.require(...)).toThrow()，不要 await expect(host.require(...))
- provide 冲突
- LIFO dispose
- apply 异步 plugin
- waterfall 空链返回原值
- emit 隔离异常

内环：pnpm -C creator-studio exec vitest run apps/server/src/kernel
出门禁：本卡结束时跑 test:foundation
```

---

## PR-2 — foundation bundle 接启动

**依赖 PR-1。对外行为必须不变。**

```
实现 PR-2：refactor(server): assemble registries through CapabilityHost

对照 capability-seams.md「启动装配」和 Phase 1 迁移步骤 2–4。

新建：
- apps/server/src/kernel/foundation-bundle.ts

修改：
- apps/server/src/index.ts
  构造 Spine 依赖 → host.apply(foundationBundle(deps)) → 从 host.require 取出四个 port
  shutdown 调 await host.dispose()
  index.ts 不再直接 new OperationRegistry / new ResourceAdapterRegistry / new ProviderService
  OperationTaskHandler / KnowledgeTaskHandler / SeedTaskHandler 仍在 index.ts 构造，然后 register 到 handlers
  装配顺序与今天一致：先 catalog/adapters/providers，再 handler.register，再 TaskRunner

bundle 内部仍 new 现有 dumb 类，然后：
  host.provide('operations.catalog', operations)
  host.provide('providers.resolver', providers)
  host.provide('knowledge.adapters', adapters)
  host.provide('tasks.handlers', handlers)

不要做：
- 不要改 ProviderService.resolve 的 if/else
- 不要拆 operationDefinitions 静态表
- 不要上事件 / waterfall 的业务 listener
- 不要改 MCP dispatch（configureWorkflowMcpRoutes 保持原样）
- 不要让 *Registry 类 import kernel
- 不要 getHost() 单例
- Host.dispose 不得关闭 database

验收：
- 现有 operation-runtime / provider-integration / knowledge.integration 相关单测绿
- make dev-studio 能起（若本机可起）
内环：pnpm -C creator-studio exec vitest run apps/server/src/operations apps/server/src/providers apps/server/src/knowledge
出门禁：test:foundation
```

---

## PR-3 — seed-only Host 夹具

**依赖 PR-2。只加测试夹具。**

```
实现 PR-3：test(server): boot a minimal host with seed plugins

新建：
- apps/server/src/kernel/test-harness.ts
- apps/server/src/kernel/seed-host.test.ts

createTestHost()：只 apply 一个 seed bundle（最少：OperationRegistry(operationDefinitions) provide 到 operations.catalog）。
断言：host.require('operations.catalog').getById('generate_outline') 有值。
不要启动 HTTP，不要 openDatabase。

不要改生产装配，除非夹具需要从 foundation-bundle 抽一个纯函数（抽了也不能改对外行为）。

内环：pnpm -C creator-studio exec vitest run apps/server/src/kernel
出门禁：test:foundation
```

---

## PR-4 — Provider factory 替换 if/else

**依赖 PR-2。从此开始串行改 foundation-bundle.ts。**

```
实现 PR-4：refactor(server): resolve providers via registered factories

对照 capability-seams.md Phase 2「ProviderService.resolve Phase 2」和 GenerationProviderFactory。

目标：provider-service.ts 不再出现 capability === 'image_generation' / text_generation 分支。
改为构造注入 factories 列表，按 priority 降序 match → create。

ProviderService 新构造只吃 factories 列表 + configs + secrets + http。
不持有 CapabilityHost。

四个 Provider 各导出 factory（可留在原文件，不必新建目录）：
- OpenAI text：priority 高于 seed；match = enabled + secret + model
- OpenAI image：match = enabled + secret + (imageModel 或 providerKey 含 image 时的 model)
- Seed text：priority 最低；match 恒 true（仅当 capability 是 text_generation）
- Seed media：match 仅 CREATOR_STUDIO_DEMO_MEDIA === 'true' 或 NODE_ENV === 'test'

保留现有 demo media 开关语义。
单测锁定：有密钥 + model 时 resolve 的 key !== seed。

更新：
- provider-service.test.ts / openai-image-provider.test.ts / provider-integration.test.ts
- kernel/foundation-bundle.ts：构造 ProviderService 时传入 factory 列表
- kernel/plugins/providers.ts（若你把 factory 注册收到 plugin 里）
- kernel/catalog.ts 类型已有则不要重复发明

不要做：
- 不要删除 GenerationProviderRegistry 的启动路径（那是 PR-5）
- 不要改 SeedTaskHandler
- 不要改 MCP
- 不要上 waterfall

内环：pnpm -C creator-studio exec vitest run apps/server/src/providers
出门禁：test:foundation
```

---

## PR-5 — 去掉 GenerationProviderRegistry，seed 永远 Seed

**依赖 PR-4。**

```
实现 PR-5：refactor(server): retire GenerationProviderRegistry dual path

对照 capability-seams.md KD-15 / Q7 = C。

要做：
- 启动路径删除 new GenerationProviderRegistry
- SeedTaskHandler 构造改为直接吃 SeedGenerationProvider（或 { generate } 窄接口）
- seed_generation 永远打 Seed，不调用 ProviderResolver.resolve
- 不改 packages/contracts 的 seedTaskInputSchema
- 不把 workspaceId 塞进 seed 任务

GenerationProviderRegistry 类可留在 generation-provider.ts 给旧测试，但生产 index.ts / foundation-bundle 不再 new 它。
相关测试改为直接 new SeedGenerationProvider()。

不要做：
- 不要让配了 OpenAI 的 workspace 改变 seed_generation 行为
- 不要改 operation 路径的 resolve

内环：pnpm -C creator-studio exec vitest run apps/server/src/tasks apps/server/src/providers
出门禁：test:foundation
```

---

## PR-6a — rewrite 接线（可最先做）

**不依赖 Host。必须先于 PR-7。**

```
实现 PR-6a：fix(operations): point rewrite at operation.rewrite

这是接线 bug，不是「保持 NOT_IMPLEMENTED」。

现状：
- operations/definitions.ts 里 id === 'rewrite' 的 executor 是 'operation.not_implemented'
- operations/executors.ts 已有 'operation.rewrite': createTextExecutor(...)

要做：
1. 把 rewrite.executor 改成 'operation.rewrite'
2. 在 operation-runtime.test.ts 补一条 rewrite 成功路径（不要把 NOT_IMPLEMENTED 写成金样）

不要改 Host、不要改绑定表、不要改 recipe enum。

内环：pnpm -C creator-studio exec vitest run apps/server/src/operations
出门禁：test:foundation
```

---

## PR-6 — Operation catalog 挂上 Host

**依赖 PR-5 与 PR-6a。串行改 bundle。**

```
实现 PR-6：refactor(server): host-owned operation catalog

对照 capability-seams.md 单源规则。

要做：
- kernel/plugins/operations.ts：apply 时把 operationDefinitions / executors / operationCapability 写入 host.registry(...)
- foundation-bundle 在全部 plugin apply 完后 host.registry('operations.definitions').list()，再 new OperationRegistry(defs)
- operations/registry.ts 保持 dumb，禁止 import kernel
- 进程启动后不要再往 OperationRegistry 实例里追加

不要做：
- 不要改 ResourceAdapterRegistry / TaskHandlerRegistry 门面
- 不要动 MCP
- 不要删模块级 recipe 表（那是 PR-7）
- 不要把 recipeCapabilityIdSchema 放宽成 string

内环：pnpm -C creator-studio exec vitest run apps/server/src/operations apps/server/src/kernel
出门禁：test:foundation
```

---

## PR-7 — RecipeCatalog + 绑定表

**依赖 PR-6 与 PR-6a。**

```
实现 PR-7：refactor(server): bind recipes to operations via RecipeCatalog

对照 capability-seams.md RecipeCatalog live port、bindings 表、Consumer 构造注入。

要做：
1. 新增 operations/bindings.ts，内容为文档里的 defaultRecipeBindings 七条。
   text.rewrite → rewrite（PR-6a 之后这条必须可跑通）。
2. kernel/plugins/recipes.ts 把 recipeCapabilities + bindings 注册进
   host.registry('recipes.capabilities') / host.registry('recipes.bindings')
3. RecipeCatalog 是 live port：闭包 host.registry，请求期 require。
   不要做成启动快照。
4. WorkflowService 构造增加 recipes: RecipeCatalog。
   删除内联 operationByCapability。
   一律 this.recipes.require(id) / this.recipes.bindingFor(id)。
5. 删除 workflow/capabilities.ts 的模块级 getRecipeCapability。
   静态数组可留作 plugin 的数据源，生产路径不得再 import 它来做校验。
6. configureWorkflowRoutes 增加 recipes 参数，去掉 import { recipeCapabilities }。
7. workflow-service.test.ts 传入内存 RecipeCatalog。禁止模块单例。
8. 不要改 configureWorkflowMcpRoutes 的 dispatch。

不要做：
- 不要改 recipeCapabilityIdSchema enum
- 不要改 ChangeSet 审批
- 不要上 waterfall

验收：
- workflow-service.ts 无 operationByCapability
- 未知 recipeCapabilityId 抛明确错误
- text.rewrite 绑定到 rewrite 且 executor 可跑

内环：pnpm -C creator-studio exec vitest run apps/server/src/workflow
出门禁：test:foundation
```

---

## PR-8 — 放宽 recipe enum（默认跳过）

**第 8 个 recipe 出现时再开。现在不要做。**

```
实现 PR-8：feat(contracts): accept registered recipe capability ids

仅当产品要加第 8 个 RecipeCapabilityId 时执行。

同一 PR 必须同时：
- recipeCapabilityIdSchema 改为 z.string().min(1).max(80)
- WorkflowService.createRecipe / graph create_recipe_node / createExecutionPlan / executePlan
  对 RecipeCatalog.require；未知 id → 422
- 缺 binding → 明确错误
- 更新依赖 enum 字面量的 web 测试

没有 Host catalog require 就放宽 enum，视为违规，停下来。

内环：pnpm -C creator-studio exec vitest run packages/contracts apps/server/src/workflow
出门禁：test:foundation
```

---

## PR-9 — 「只改注册点」集成测试

**依赖 PR-4 与 PR-7。**

```
实现 PR-9：test(server): register-only provider/executor extension

新建 apps/server/src/kernel/extension.integration.test.ts

证明：
- 测试里 host.registry('generation.factories').register(...) 一条假 factory，resolve 能命中
- 测试里用现有 enum id（不要发明 text.fake）挂假 executor，catalog 能 require 到
- 解析中枢（ProviderService / OperationRegistry 构造）无需为这条测试改分支

不要宣称「新 recipe 只改注册点」——enum 还没放宽。
不要改生产代码，除非发现 PR-4/7 无法在测试里 register（那是 bug，修回对应 PR 的契约）。

内环：pnpm -C creator-studio exec vitest run apps/server/src/kernel
出门禁：test:foundation
```

---

## PR-10 — pre-execute waterfall

**依赖 PR-6。这是 Phase 3 的第一刀，单独一轮对话。**

```
实现 PR-10：refactor(server): operation pre-execute waterfall

对照 capability-seams.md 事件模型、PreExecuteState、Phase 3、KD-13。

值类型必须是 PreExecuteState，不是裸 ExecutorContext。
waterfall 必须转发 AbortSignal。

handler 固定步骤（禁止做成 listener）：
1. 填 PreExecuteState（project.personalStyleId 来自这一次 projectRecord，禁止闭包装配期 Project）
2. 若 operation 有 capability：调用 ProviderResolver；若无 operationCapability：跳过，不抛 OPERATION_PROVIDER_UNAVAILABLE
3. host.waterfall('operation/pre-execute', state, signal)
4. assembleContext(...) 必须在 handler 内调用
5. hydrateImageConfig / 挂 saveMedia 必须在 handler 内，在 waterfall 之后
6. 再调 executor

injector plugin（只读 state）：
- profile injector：写 personalStyleText
- knowledge injector：写 externalKnowledgeText / citations
- demo 标记、配额 no-op 可注册
禁止把图片字节放进 layers / contextText / generations.requestJson

失败语义：
- listener throw → execute reject → 现有 TaskRunner onFailed
- 不要把 Host 事件打进 SSE
- run.started 位置不变（waterfall 之前就发）
- 不要动 TaskRunner 里 generations 插入点
- pre-execute 失败时还没有 saveMedia，不要写 finally 清理临时文件

回归：
- edit / branch / publish 在 waterfall 之后仍无 provider 且成功
- 知识缺资料时的抛错/空文本与重构前一致
- 取消中的 Run 不把 abort 知识错误写成 OPERATION_FAILED
- contextText 在绑定了 personal_style_id 的项目上与重构前逐字节相等（能做金样就做）

OperationTaskHandler 构造增加 preExecute: (state, signal) => host.waterfall('operation/pre-execute', state, signal)
或更窄的 PreExecute port。不要让 handler import 具体 injector。

不要做：
- 不要把 applyResult / 画布写节点做成 waterfall
- 不要改 MCP
- 不要写失败 generations 行
- 不要改 contracts / SSE 事件名

内环：pnpm -C creator-studio exec vitest run apps/server/src/operations apps/server/src/context apps/server/src/kernel
出门禁：test:foundation
```

---

## PR-11 — prompt snapshot

**依赖 PR-10。只补可见即记录，不改失败路径。**

```
实现 PR-11：feat(server): record assembled prompt hash and text

在成功路径的 generations.requestJson 增加：
- promptSha256
- 截断后的 promptText

断言：不含 secret、不含图片二进制、不含绝对本地路径。

不要做：
- 不要在失败路径 insert generations
- 不要移动 TaskRunner.drain 里 insertCompleted 相对 onCompleted 的顺序
- 不要把 Host 事件进 SSE

内环：pnpm -C creator-studio exec vitest run apps/server/src/operations apps/server/src/tasks
出门禁：test:foundation
```

---

## PR-12 — HostEmitter 审计事件

**依赖 PR-10。**

```
实现 PR-12：feat(server): emit host events for run and provider resolve

补窄 port HostEmitter { emit }。

RunService / ProviderService 构造增加 emitter?: HostEmitter。
index.ts 传入 { emit: host.emit.bind(host) }。
这两类禁止 import CapabilityHost。

发出：
- run/create
- provider/resolve（含 fallback: boolean）

不要改 SSE，不要改 contracts，不要把 listener 失败回滚 Spine 写入。

内环：pnpm -C creator-studio exec vitest run apps/server/src/kernel apps/server/src/operations apps/server/src/providers
出门禁：test:foundation
```

---

## PR-13 — MCP ProposeOnly

**Phase 2 完成（PR-7）之后。单独一轮。**

```
实现 PR-13：refactor(server): host-owned MCP propose tools

对照 capability-seams.md ProposeOnlyWorkflow 与 Security。

今天的门是结构门：workflow-mcp-routes.ts 写死四分支
getSnapshot / validate / proposeChangeSet / getChangeSet。

要做：
- configureWorkflowMcpRoutes 的依赖类型改成 ProposeOnlyWorkflow
- handler 闭包里不能有 approveChangeSet / rejectChangeSet / applyCommands / queueExecutionPlan / RunService.create
- 名字黑名单只是第二道
- JSON-RPC 表面不变

单测：
- 拒绝名为 approve / execute 的 tool
- 断言传入对象的键不含上述写方法（结构门）

不要把完整 WorkflowService 传进通用 registry.get(name).handler(args)。

内环：pnpm -C creator-studio exec vitest run apps/server/src/workflow
出门禁：test:foundation
```

---

## PR-14 — TS Profile（按需）

**仅当 local / demo / mcp 三种装配开始分叉时再开。**

```
实现 PR-14：feat(server): select startup plugins via CREATOR_STUDIO_PROFILE

kernel/profiles/*.ts：local-creator / demo / mcp-agent。
默认 profile 必须与当前装配行为逐项等价。
启动日志打印 plugin 名称列表。
用 TS 模块 + env，不要上 yaml。

内环：pnpm -C creator-studio exec vitest run apps/server/src/kernel
出门禁：test:foundation
```

---

## 修偏提示词（实现跑偏时贴）

```
对照 creator-studio/docs/architecture/capability-seams.md 的 Key Decisions 审当前未提交改动。

只回答三件事：
1. 哪些 diff 越界（引入 Cordis、Registry import kernel、getHost 单例、改了 schema/HTTP/前端、动了 MCP 审批、放宽了 enum、把 assembleContext 放进 waterfall）
2. 最小回退方案
3. 回到哪张 PR 卡重做

不要继续加功能。先停在当前 Phase。
```

## 收工提示词（每张 PR 结束贴）

```
按 verification-before-completion 收工：
1. 列出本卡范围内实际改动的文件
2. 贴出你跑过的内环命令和输出摘要
3. 对照本卡「不要做」逐条确认没越界
4. 若本卡要求出门禁，跑 pnpm -C creator-studio run test:foundation 并报告结果
5. 不要 commit，除非我明确说 ship / commit
```
