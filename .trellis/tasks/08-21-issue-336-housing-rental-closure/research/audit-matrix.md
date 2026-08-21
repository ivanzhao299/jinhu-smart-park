# Issue #336 住房出租需求—实现—验证追踪矩阵

基线：`f267215aab9ef7cd36c26529b86e013afc549ba3`
最终 PR head：`60f2b6e8c1e938e5a5d1191836f8d177ce9dbb62`
main merge SHA：`ed8cfd2450c6320e6e0be7dfc773db698d4c9303`

| ID | 合同/需求 | 当前证据 | 初始判断 | 本任务动作 | 验证门禁 |
|---|---|---|---|---|---|
| HOU-001 | 住房 canonical 工作台与 Party alias | 9 个 surface、4 个 detail、tenant alias 已存在 | 已实现 | 防回归 | Web contract/build/browser |
| HOU-002 | `housing_rental + asset` 模块依赖 | Controller 类级双模块 + route override 全覆盖；全部 route 枚举测试 | 技术已闭环 | 保持 exact test | controller/manifest tests PASS |
| HOU-003 | 租客来源域由服务端拥有 | API 固定 `housing_rental`；Web 不发送 source_domain | 已实现，Trellis 状态漂移 | 防回归并记录状态 | API/Web contract |
| HOU-004 | 长租合格房源和占用排他 | unit active/usage/long_rent/enabled/occupancy/商业租赁/turnover 检查 | 已实现 | 并发与关键阶段回归 | Housing unit/schema/E2E |
| HOU-005 | 租约全生命周期 | create/submit/approval/sign/activate/checkout/void | 已实现 | 核对 UUID、状态、审批和幂等 | API unit/E2E |
| HOU-006 | 高风险 maker-checker | Controller metadata、approval adapter、effect executor；租约/财务/采购共享后果确认 | 技术已闭环 | 真人岗位复核留 PR192 | approval specs/browser/E2E PASS |
| HOU-007 | 费用、账单、收款、押金 | 独立 housing receivable/ledger、账期排他、审批 effect | 已实现 | 财务边界回归 | finance specs/E2E |
| HOU-008 | 交割和证据 | move-in/out、金额、照片、签名、文件域 | 已实现 | 权限/移动/文件 UAT | handover specs/browser |
| HOU-009 | 报修复用工单 | housing_repair 文件、work order、幂等和 deep link | 已实现 | 权限/上传/离线回归 | repair specs/E2E/browser |
| HOU-010 | 采购与转收费 | purchase lifecycle/transfer/approval；目标租约 Remote Picker；后果确认 | 技术已闭环 | 真人业务可用性复核留 PR192 | purchase specs/browser/E2E PASS |
| HOU-011 | 列表 URL、分页缩减、返回上下文 | 超界页纯函数与 URL 自动收敛 | 技术已闭环 | 防回归 | Web unit/browser PASS |
| HOU-012 | empty-scope 可恢复 | 具备角色读取+数据范围绑定权限时跳角色页，否则联系管理员 | 技术已闭环 | 精确角色真人复核留 PR192 | Web contract/build PASS |
| HOU-013 | Feature 单一 owner | Picker loader 与分页规则由 `features/housing` 单一拥有；旧 picker 路径仅兼容导出 | 本次闭包完成 | 其余渐进迁移为非阻断债务 | typecheck/build PASS |
| HOU-014 | desktop/390/键盘/reflow | 1440×1000、390×844、Escape 焦点恢复、无横向溢出、a11y 100 | 技术 UAT 完成 | 真人 UAT 未完成 | evidence bundle PASS |
| HOU-015 | API E2E 发布门禁和 cleanup | 当前分支一次性 Docker housing suite 全链路 PASS；容器/卷 residual=0 | 技术已闭环 | PR Release Smoke 再验证 | local rehearsal PASS |
| HOU-016 | 真人岗位 UAT 与具名签署 | `awaiting_human_gate` | 未完成，外部依赖 | 准备 handoff，不冒充通过 | PR192 human UAT lane |
| HOU-017 | Issue/Trellis/UAT 状态一致 | Issue #336 closed；PR #337 merged；Trellis 本任务 completed；PR192 仍 awaiting_human_gate | 已完成 | 最终同步 Issue/PR/Trellis；保留人工门禁 | final documentation audit PASS |

## 优先级

- P0 stop-ship：跨租户/园区、敏感文件泄漏、财务重复/丢失、maker-checker 绕过、不可恢复 migration。
- P1：模块依赖不一致、关键岗位主流程不可完成、移动关键路径不可用、Release Smoke/住房 E2E 缺失。
- P2：分页、empty-scope、Remote Picker、确认对话框、feature 分层和状态文档漂移。
