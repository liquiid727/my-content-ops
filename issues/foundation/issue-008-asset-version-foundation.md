# [Foundation] FND-08：建立 Asset 文件存储与 Version 基础能力

## Description

实现本地 Asset 上传、元数据提取、安全文件路径、列表/读取/软删除，以及通用 Version 的创建、查询和恢复。Foundation UI 只需提供最小列表与空/错状态。

## Acceptance Criteria

- [x] 实现 `api.md` §6、§7 的 Foundation 端点与共享 schema。
- [x] 上传采用临时文件 → 校验/摘要 → 数据库记录 → 原子移动流程。
- [x] 拒绝路径穿越、绝对路径、超限文件、非法 MIME；失败后无孤儿临时文件。
- [x] Asset 列表支持项目、类型、游标筛选并呈现 loading/empty/error/success 状态。
- [x] 文件读取设置正确 Content-Type，不暴露真实文件系统路径。
- [x] 恢复 Version 会创建新版本；数据库保证 subject 最多一个当前版本。
- [x] 软删除 Asset 不立即删除仍被 Version 或其他对象引用的物理文件。

## Dependencies

- [FND-02](./issue-002-shared-contracts-http.md)
- [FND-03](./issue-003-sqlite-drizzle-repositories.md)
- [FND-04](./issue-004-bootstrap-local-identity.md)

## Type

fullstack

## Priority

high

## SPEC Reference

- `specs/000-system/api.md` §6～§7
- `specs/000-system/data-model.md` §3.5～§3.6、§4
- `specs/000-system/acceptance.md` FND-023～FND-027

## Implementation Notes

### 主要修改

- 新增 Asset/Version 共享 schema，以及 Asset 列表、上传、元数据、content/Range、软删除和 Version 列表、读取、restore 端点。
- 新增受控 AssetFileStore：安全文件名、相对路径、逐段符号链接检查、临时文件、MIME/签名、SHA-256、图像尺寸、原子 rename 与补偿清理。
- 扩展 Asset/Version Repository，加入稳定游标、workspace 查询、引用检查、append-only restore 与唯一 current 事务。
- 将 Assets 占位页替换为类型/Project 筛选列表，覆盖 loading、empty、error、success 四态。

### 关键设计决定

- 默认单文件上限 200 MB，由服务端配置；客户端不能调高。当前 Foundation 使用有界缓冲，但所有落盘仍经过临时文件和原子移动。
- DELETE 发现 Version、Project cover 或 Creator Profile avatar 引用时返回 `ASSET_IN_USE`；任何 Asset DELETE 都不直接删除物理文件。
- Version restore 强制 `Idempotency-Key`，旧快照不修改，新 current 与幂等结果在一个 SQLite 事务中创建。
- 未实现 API §6 未定义的 thumbnail 端点，`thumbnailUrl` 返回 null，避免暴露无效能力。

### 测试命令与结果

- `npm run typecheck`：通过。
- `npm run lint`：通过，0 warning、0 error。
- `npm test`：通过，10 个测试文件、53 项测试全部通过。
- `npm run build`：通过，contracts、Web、Server 生产构建成功。
- `npx playwright test`：通过，2 项 Chromium E2E；Asset 四态与 Project 生命周期均通过。
- `xmllint --html --noout docs/issue#0008.html`：通过。

### 未解决问题

- 无。缩略图/文本抽取异步任务与大媒体流式优化不在本 Issue 范围内。
