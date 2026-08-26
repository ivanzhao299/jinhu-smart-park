# Technical Design

## Boundaries and authority

- 方法权威：`docs/testing/windows-chrome-cdp-uat.md`。
- 产品权威：住房 MVP/PR192/Issue #244/Issue #336 设计、shared access manifest、当前 API/Web/DB 实现、AGENTS.md 财务与迁移规则。
- 验收轮与修复轮分离：首轮产品源码零改动；报告合并后才按独立队列修复。

## Audit model

闭环表以“设计声明→Web→API→DB/副作用→结果”为一行，分类为已实现、部分实现、未实现、偏离设计。重点冻结：

1. `housing_rental + asset` 模块依赖、unit/property/party/occupancy scope 与裸 UUID FK 风险。
2. 租约、账单/应收、流水/押金、交割、报修/工单、采购/转收费、派生任务、dashboard 状态投影。
3. approval action→policy→request→executor→effect proof/outbox 的 maker-checker 完整性。
4. Web surface/menu/capability/picker/file/offline draft 与后端端点/校验一致性。
5. tenant+park+unit 数据范围、scope 内唯一约束、跨租户 id 访问 fail-closed。

## Browser and data flow

浏览器 UI 创建基础租户/园区/角色/用户/asset/party fixture，再通过 housing UI 推动业务状态。每个 UI 写动作后允许只读 API/DB 佐证，但不代替 UI 反馈。角色切换严格 logout→清残留→表单登录；同 origin 不并发多账号。

主链按租约 draft→pending_approval→pending_signature→active→checkout_pending→terminated；支链覆盖 void、审批拒绝、部分/全额收款、waiver/refund/deposit refund、move-in/move-out、repair/workorder、purchase approve/pay/transfer/refund/void、task 与 dashboard 投影。

## Isolation and evidence

- RUN_ID 贯穿 compose、端口、fixture、文件根和报告。
- 截图直接写 `/tmp/jinhu-housing-uat-<RUN_ID>/screenshots/`，同时生成证据文本和 screenshot manifest。
- residual 在 fixture 前冻结表和谓词，保存 before/after 原始日志；清理后再删除隔离 volume，不能用 volume 删除倒推逐表为零。

## Fix and rollout model

首轮报告先独立合并并核验 main 双绿。每个缺陷独立 issue/Trellis/branch/PR，按 P0→P1→P2 串行；任何 migration 必须验证逐租户语义与 failed-only checksum 规则。全部上线后从最新 main 新建复测证据分支，复现 before、验证 after 与防回退。

## Risks and rollback

- 裸 UUID FK 可能是 DB 契约缺口，但若 service 已 scope fail-closed，应作为独立 gap/负向 Case，不未经证据扩张迁移。
- repair task adapter 状态可能与 workbench 投影分叉，需由完成工单后的真实任务状态证明。
- 直接 move-out 与审批 move-out 的押金余额校验路径不同，需专门覆盖零金额/有抵扣分支。
- 证据、环境或外部 gate 失败不通过修改报告降级；按 FAIL/BLOCKED 如实保留任务。
