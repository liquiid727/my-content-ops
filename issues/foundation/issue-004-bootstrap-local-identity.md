# [Foundation] FND-04：实现 Bootstrap、本地身份与服务安全边界

## Description

建立单机单用户 Workspace 身份、首次启动种子数据、bootstrap API、same-origin 策略与本地会话边界。浏览器不得自行指定或越权访问其他 Workspace ID。

## Acceptance Criteria

- [x] 首次启动以事务幂等创建一个 Workspace 和 CreatorProfile。
- [x] `GET /api/v1/bootstrap` 返回当前身份、偏好、能力开关与脱敏配置摘要。
- [x] 服务默认只监听 loopback；Host/Origin 不符合策略的写请求被拒绝。
- [x] Workspace ID 由服务端上下文注入，不接受客户端任意覆盖。
- [x] 设置本地会话 cookie 的 SameSite、HttpOnly 等适用属性。
- [x] 日志包含 request ID、路径、状态、耗时，不记录正文、凭据或绝对路径。
- [x] 重启和并发首次请求不会创建重复身份记录。

## Dependencies

- [FND-02](./issue-002-shared-contracts-http.md)
- [FND-03](./issue-003-sqlite-drizzle-repositories.md)

## Type

backend

## Priority

high

## SPEC Reference

- `specs/000-system/spec.md` §9、§11
- `specs/000-system/api.md` §4、§12
- `specs/000-system/acceptance.md` FND-004、FND-013、FND-038、FND-040

## Implementation Notes

### 主要修改

- 新增 bootstrap 共享 Zod schema，覆盖 Workspace、CreatorProfile/preferences、活动 Task、能力开关和脱敏 Provider/Connector 摘要。
- Server 启动时通过单一事务幂等创建默认 Workspace/Profile，并在启动监听前完成身份加载。
- 新增本地安全中间件：校验 Host、受保护 API session、写请求 Origin，向 Hono context 注入服务端 Workspace/Profile ID，并限制 JSON 正文为 2 MB。
- 新增 HttpOnly、SameSite=Strict、Path=/ 的本地 session cookie；bootstrap 可在首次访问或服务重启 cookie 过期时重新签发。
- 新增结构化请求日志，记录 requestId、method、path、status、durationMs，不读取或记录请求正文、配置值、secret ref 和本地文件路径。

### 关键设计决定

- `/health` 保持无 session 启动探测；`GET /bootstrap` 是唯一允许缺失/过期 session 的握手入口，否则浏览器无法首次获得 HttpOnly cookie 或在 Server 重启后恢复。
- session token 每次进程启动随机生成，不持久化到 SQLite；过期 cookie 只能通过合法 Host 上的 bootstrap GET 替换。
- 所有业务路由从 Server context 读取 Workspace/Profile，客户端提交同名字段不会覆盖身份上下文。
- Bootstrap 只返回 `configured`/`enabled` 摘要，永不返回 config JSON、secret ref 或凭据值。
- 生产 Server 继续固定监听 `127.0.0.1`；允许 Host/Origin 仅包含当前端口的 localhost、127.0.0.1 和 IPv6 loopback。

### 测试命令与结果

- `npm run typecheck`：通过，contracts/web/server 均无类型错误。
- `npm run lint`：通过，0 warning。
- `npm test`：通过，7 个测试文件、40 个测试全部通过。
- `npm run build`：通过，contracts、Vite Web 与 Hono Server 均成功构建。
- FND-004 专项测试：4 项通过，覆盖并发/重启幂等、cookie 属性与过期恢复、Host/session/Origin、身份注入、配置脱敏、结构化日志和 2 MB 限制。
- 生产重启冒烟：两次进程启动返回相同 Workspace/Profile，数据库记录数均为 1；无 cookie 访问保护路由返回 401，bootstrap cookie 属性与结构化日志正确。
- review-it：发现并修复 1 个 P2（重启后旧 cookie 无法自愈）；复审通过。

### 未解决问题

- 无本 Issue 阻塞项。浏览器 bootstrap client 与统一请求运行层由 FND-011 实现。
