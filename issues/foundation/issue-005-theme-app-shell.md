# [Foundation] FND-05：建立 Design Tokens、主题系统与 App Shell

## Description

用 Tailwind CSS 建立平台视觉 token、暗色默认主题、light/system 切换机制和响应式 App Shell。先实现可复用结构，不在本 Issue 堆叠业务页面。

## Acceptance Criteria

- [x] Tailwind token 覆盖背景、surface、边界、文本、accent、danger、圆角、阴影和动效。
- [x] 首次渲染默认暗色，主题初始化不出现明显闪烁。
- [x] 支持 `dark`、`light`、`system`，system 会响应系统主题变化。
- [x] App Shell 包含侧栏、顶部上下文区、主内容区和全局通知区。
- [x] 360px、768px、1280px 下无横向溢出，侧栏在小屏可收起。
- [x] 基础 Button、Input、Select、Dialog、EmptyState、Skeleton、Toast 具备键盘 focus 状态。
- [x] 颜色对比度与主要交互满足 WCAG AA。

## Dependencies

- [FND-01](./issue-001-creator-studio-scaffold.md)

## Type

ui

## Priority

high

## SPEC Reference

- `specs/000-system/spec.md` §1.3、§3.1、§6、§8
- `specs/000-system/acceptance.md` FND-006、FND-007、FND-010、FND-011

## Implementation Notes

### 主要修改

- 建立 light/dark 语义 Design Tokens，并通过 Tailwind 暴露背景、surface、文本、边界、主色、危险色、圆角、阴影和动效。
- 使用阻塞式首屏脚本与 `next-themes` 实现默认暗色以及 `dark`、`light`、`system` 切换；system 模式监听系统配色变化。
- 实现响应式 App Shell，包含主导航侧栏、顶部上下文、主内容和全局 Toast 区；移动端侧栏支持打开、遮罩关闭与焦点回退。
- 新增 Button、Input、Select、Dialog、EmptyState、Skeleton、Toast 等共享 UI 基础组件和统一 focus-visible/reduced-motion 样式。

### 关键设计决定

- 视觉方向采用本地创作工作台，而非营销首页；以深墨色工作面和高对比粉色信号色构成主要层级。
- 首屏主题脚本与运行时 ThemeProvider 使用同一 storage key，避免 React 挂载前后的主题不一致和明显闪烁。
- 收起的移动侧栏使用 `visibility: hidden` 同步移出键盘与可访问性导航，桌面断点以 `md:visible` 恢复。
- 主题偏好当前保存在浏览器本地；用户设置 API 持久化属于后续设置相关 Issue，不在本 Issue 扩展。

### 测试命令与结果

- `npm run typecheck`：通过，contracts/web/server 均无类型错误。
- `npm run lint`：通过，0 warning。
- `npm test`：通过，3 个测试文件、19 个测试全部通过；覆盖 Shell 区域、移动导航、Dialog、三种主题、system 实时变化和 Toast。
- `npm run build`：通过，contracts、Vite Web 和 Hono Server 均成功构建。
- Playwright 浏览器验证：360px、768px、1280px 均无横向溢出；小屏菜单可收起，主题切换与键盘焦点可见，浏览器控制台无错误。
- 对比度抽查：主操作按钮前景/背景对比度约 5.79:1，达到 WCAG AA；交互控件键盘路径和 reduced-motion 样式通过验证。
- review-it：发现并修复 1 个 P2（移动侧栏隐藏后仍可聚焦）；复审通过。

### 未解决问题

- 无本 Issue 阻塞项。路由、业务页面和服务端主题偏好同步由其各自后续 Issue 实现。
