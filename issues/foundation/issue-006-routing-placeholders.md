# [Foundation] FND-06：实现路由、主导航与未开放模块占位

## Description

建立 Dashboard、Projects、Assets、Tasks、Settings 与 Project Detail 路由。尚未进入 Foundation 的创作阶段页面使用一致的占位结构，避免死链和伪完成状态。

## Acceptance Criteria

- [x] 所有主导航路由可直接打开和刷新，当前项有明确选中状态。
- [x] 未知前端路由显示 Not Found，并提供返回 Dashboard 的操作。
- [x] P1 占位页显示模块名、规划状态、简短说明和可返回路径。
- [x] 路由级懒加载具有 Skeleton 和 Error Boundary。
- [x] Project Detail 子路由保留 Overview、Ideas、Topics、Scripts、Rhythm、Shots、Assets、Tasks 入口。
- [x] 键盘操作可遍历导航，移动端打开/关闭侧栏后 focus 合理恢复。

## Dependencies

- [FND-05](./issue-005-theme-app-shell.md)

## Type

frontend

## Priority

high

## SPEC Reference

- `specs/000-system/spec.md` §4.1、§8
- `specs/000-system/acceptance.md` FND-008～FND-010

## Implementation Notes

### 主要修改

- 引入 React Router，并建立 Dashboard、Projects、Assets、Tasks、Settings、Project Detail 与 Not Found 路由。
- 主导航改为语义化 `NavLink`，根据当前 URL 标记 `aria-current="page"`；生产静态服务可直接打开和刷新所有前端路由。
- 为 Overview、Ideas、Topics、Scripts、Rhythm、Shots、Assets、Tasks 建立 Project Detail 子导航与统一规划状态页面。
- 所有页面入口使用 `React.lazy`，统一提供路由 Skeleton 和 Error Boundary 恢复页。
- 加强移动侧栏焦点管理：打开后聚焦关闭按钮、Tab/Shift+Tab 保持在抽屉内、Escape 全局关闭、关闭后恢复菜单按钮焦点。

### 关键设计决定

- `routes/` 只负责编排与静态状态说明，不创建 Project/Asset/Task Store，也不伪造后续 API 数据。
- Foundation 尚未实现的主模块明确标注对应后续 Issue；创作阶段入口标注 `P1` 并始终提供返回 Project Overview 的路径。
- Project Detail 当前使用预览 ID 证明路由契约，不将其解释为已存在的领域实体。
- 未知 URL 由前端 Not Found 处理；带扩展名的缺失静态资源仍由服务端返回 404，不被 SPA fallback 掩盖。

### 测试命令与结果

- `npm run typecheck`：通过，contracts/web/server 均无类型错误。
- `npm run lint`：通过，0 warning。
- `npm test`：通过，4 个测试文件、24 个测试全部通过；其中路由与边界测试覆盖 11 项。
- `npm run build`：通过；Vite 为各路由生成独立懒加载 chunk，Server 构建成功。
- Playwright 生产 E2E：Dashboard、Projects、Assets、Tasks、Settings 直接访问和刷新均返回 200，且当前主导航为 `aria-current=page`。
- Playwright 路由验证：8 个 Project Detail 子入口齐全；P1 标记与返回路径可见；未知路由显示 Not Found 并可返回 Dashboard；控制台无错误。
- Playwright 响应式/键盘验证：360px、768px、1280px 无横向溢出；移动抽屉打开、焦点循环、Escape 关闭与焦点恢复通过。
- review-it：发现并修复 1 个 P2（移动抽屉未限制 Tab 焦点）；复审通过。

### 未解决问题

- 无本 Issue 阻塞项。Project、Asset、Task、Settings 的真实数据和交互按后续 Foundation Issues 实现。
