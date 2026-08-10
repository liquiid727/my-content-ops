# [Foundation] FND-12：实现 Provider、Lark CLI 与 Obsidian 设置面板

## Description

在 Settings 中提供 Provider、Lark CLI、Obsidian 三类配置面板，并在本地服务实现配置持久化、凭据引用和连接检查边界。Foundation 不做真实内容同步。

## Acceptance Criteria

- [x] Settings 分区展示启用状态、非敏感配置、是否已有凭据和最近检查结果。
- [x] Provider 凭据、Lark 凭据写入服务端 secret store；读取 API 永不返回原值。
- [x] Lark CLI 设置支持命令路径/名称和必要参数；未安装时给出可操作错误。
- [x] Obsidian 设置支持 Vault 根目录；拒绝非目录、不可读目录和逃逸路径。
- [x] “测试连接”使用统一 Connector/Provider 接口，不在浏览器执行 CLI 或文件系统访问。
- [x] Foundation 可使用 deterministic stub 返回连接成功；真实调用能力明确标注未开放。
- [x] 日志、Task、Generation 和错误响应中不出现凭据或通用诊断不需要的绝对路径。

## Dependencies

- [FND-02](./issue-002-shared-contracts-http.md)
- [FND-03](./issue-003-sqlite-drizzle-repositories.md)
- [FND-04](./issue-004-bootstrap-local-identity.md)
- [FND-05](./issue-005-theme-app-shell.md)

## Type

fullstack

## Priority

high

## SPEC Reference

- `specs/000-system/spec.md` §4.2、§5.3、§11
- `specs/000-system/data-model.md` §3.10～§3.12、§4
- `specs/000-system/acceptance.md` FND-036～FND-039

## Implementation Notes

### 主要修改
- 新增 Provider/Lark CLI/Obsidian 设置契约、持久化与测试连接端点，以及三分区 Settings UI。
- 新增原子写入且权限为 0600 的服务端 secret store；SQLite 只保存 secret ref。
- 新增 Lark 命令可执行检查、Obsidian realpath/目录/可读性校验和 deterministic stub 检查。

### 关键设计决定
- API、日志、Generation 和 Settings 状态只含 configured/非敏感配置，不含凭据值；password input 不进入 React/Zustand state，保存后立即清空。
- 错误响应不回显命令绝对路径、Vault 绝对路径或凭据。
- 真实 Provider/Connector 调用明确保持未开放。

### 测试命令与结果
- `npm run typecheck`、`npm run lint`、`npm run build`：全部通过。
- `npm test`：12 个文件、59 项测试通过。
- `npx playwright test`：3 项 Chromium E2E 通过。
- `xmllint --html --noout docs/issue#0012.html`：通过。

### 未解决问题
- 无；真实同步不属于 Foundation。
