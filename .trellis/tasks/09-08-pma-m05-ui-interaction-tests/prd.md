# PMA M-05 UI 真实交互测试

## Goal

为共享房产业务 Web 关键交互建立真实 mounted React 组件测试门禁，证明用户点击、键盘输入、焦点管理、受控状态回显和 mutation 接线真实工作，而不是只证明源码字符串存在。

## Confirmed facts

- GitHub Issue：#703。
- 当前 Web 单测使用 Node test runner、纯逻辑与源码契约；没有 DOM mount harness。
- S-03 `ConsequenceDialog` 已接入民宿、传统 leasing checkout 与共享房产控制面，但现有测试不证明真实 submit/focus 行为。
- `RemoteEntityPicker` 保存完整 option 并通过受控 value 回显；住房租约创建同时使用 unit/tenant picker。
- S-04 `useDirtyLeaveGuard` 已接入 `PropertyControlPlaneClient`，现有测试不证明 beforeunload、链接拦截和多实例生命周期。

## Requirements

- 在 `apps/web` 建立单一 React mounted component harness，使用 jsdom、Testing Library 与 user-event；继续复用现有 React/TypeScript 工具链。
- 新门禁必须接入 `test:unit:web` 和 CI/Deploy 已调用的 Web unit test 链，不能成为仅手工运行的孤岛。
- `ConsequenceDialog` 覆盖真实点击与 Enter 确认、必填原因、单飞、失败保持打开、成功关闭、Tab focus trap 与关闭后触发元素焦点恢复；至少一个 S-03 业务接入页必须证明真实确认后调用正确 mutation。
- picker 覆盖选择、键盘、清除、外部 value 更新回显；至少一个业务表单必须证明选择对象的 ID 进入提交 payload。
- `useDirtyLeaveGuard` 覆盖 dirty/busy 注册、beforeunload、普通链接确认/拒绝、多实例与最后卸载清理。
- 做至少三类 mutation 抽查：临时删除 dialog 确认、picker 回显/选择或 dirty guard 拦截中的关键实现时，对应 mounted 测试必须失败；随后完整恢复源码，并保存命令/失败断言摘要。
- 不修改 API、数据库、迁移、权限、金融状态或 mutation 业务语义；只补测试基建、测试和为可测试性所需的最小无行为变化 seam。
- 不读取或修改 HR 业务目录；不操作生产、他人容器或主 Chrome。

## Acceptance Criteria

- [ ] `apps/web` 存在可复用 DOM setup/render harness，测试真实 mount React 组件并派发 user-event/DOM 事件。
- [ ] ConsequenceDialog 组件和一个 S-03 接入路径的点击/键盘/焦点/mutation 测试通过。
- [ ] RemoteEntityPicker 回显/键盘/清除与一个业务 submit ID 测试通过。
- [ ] useDirtyLeaveGuard 的 beforeunload、链接确认、多实例清理测试通过。
- [ ] 三类 mutation 抽查均观察到预期红灯，恢复后完整新套件通过。
- [ ] 新套件纳入 `test:unit:web`；Web lint、typecheck、build 通过。
- [ ] review 不超过 3 轮；PR CI 通过并 squash merge。
- [ ] containing-main CI 与 Deploy Production 双绿；Issue #703 关闭；Trellis 任务归档。

## Out of Scope

- 不以本任务替代 L-04 的真实浏览器 27 路由与 390px UAT。
- 不扩展 S-03/S-04 产品范围或重做页面视觉。
- 不追求全仓覆盖率百分比；只覆盖列明的高价值交互链。

## Cost Guard

- 一次性完成 harness 与目标测试，按 dialog/picker/dirty 三组批量验证。
- 同一失败根因最多两次自动修复；第三次进入 COST_GUARD 和聚焦审计。
- mutation 抽查是有意红灯，不计作修复失败；每次都必须恢复并核对 clean diff。
