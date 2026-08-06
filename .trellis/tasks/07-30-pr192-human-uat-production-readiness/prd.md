# PR192 人工 UAT 与生产就绪

## Goal

建立一条与 Codex 技术交付严格分离的外部真人岗位 UAT 与签署泳道。Codex 负责准备非生产环境、任务卡、证据模板、统计和缺陷回派；真实岗位代表亲自执行任务，业务/财务/安全/发布负责人亲自作出签署决定。该泳道长期等待时不占用常驻 subagent，只阻止 production readiness 和高风险生产 enforce，不阻止 Track C 技术工作。

## Role Separation

### Codex 可以做

- 校验 technical handoff、准备隔离 UAT 环境与 A-base/B-extension 数据。
- 生成无答案提示的岗位任务卡、观察表、缺陷表和签署模板。
- 提供测试账号领取/回收流程、证据收集、匿名化统计和报告。
- 根据真人发现创建缺陷、回派技术 owner、重建环境并安排回归。
- 计算机器指标和签署状态，但不能自行改变真人结论。

### Codex 不可以做

- 冒充前台、保洁、财务、审批、采购、审计等岗位代表。
- 把自动化浏览器执行、设计审查或 AI 角色扮演算作真人 UAT。
- 代替业务、财务、安全、运营或发布负责人签字。
- 因等待参与者而保持 subagent 常驻、轮询或阻塞 Track C。
- 在真人门禁未通过前宣布 production ready 或执行高风险生产动作。

## Human Cohorts

真人岗位至少覆盖：

- 园区管理员；
- 民宿前台、保洁、检查员、民宿财务；
- 住房租赁专员、审批人、交割人员、账单人员、收银、财务审批；
- 采购申请人、采购审批人、付款人员；
- 维修人员、审计人员。

每个岗位至少 5 名真人代表，每人完成 4 个标准任务，即每岗位 `n >= 20`。首次使用与重复使用分别统计，不得混合。

## Requirements

### H0. Machine Preflight

发放 UAT 前必须验证：

- Track B technical handoff SHA 与 evidence bundle 可校验；Track B 已蕴含其 Track A 前置，H0/H1 不等待 Track C；
- UAT 为隔离非生产环境，配置中无真实秘密和生产身份；
- 数据 profile/checksum 固定，账号为精确岗位、无 superuser/wildcard/宽权限；
- 关键高风险生产开关关闭；
- 每个任务可通过真实 UI 完成，失败状态、附件和移动入口可观察；
- reset/cleanup、账号回收、数据匿名化和 incident contact 可用。

H0 是机器门禁，不是人工签署。

### H1. 外部真人 UAT

任务必须从可识别业务入口开始，不预填不可见 UUID，不提供逐步答案，不由主持人代点。参与者在其自然设备上完成，至少覆盖 desktop 和 390px 手机关键流程。记录：

- 成功/失败、完成时间、交互数、错误数、求助次数；
- 首次/重复使用；
- 权限误达或误拒、找不到入口、错误恢复、移动可用性；
- 任务 ID、岗位、匿名 participant ID、环境 SHA/profile、开始/结束时间；
- 截图/录屏/日志需要用户同意并脱敏。

成功率、p90 完成时间、交互上限和可接受错误率由产品/运营/岗位负责人在执行前冻结；Codex 不得事后修改阈值。

### H2. Human Signoffs

以下必须由具名真人签署人作出 approve/reject/conditional：

- 产品/运营：IA、菜单命名、岗位 bundle、主流程和 UX 指标；
- 业务负责人：民宿、住房、共享房产流程与职责隔离；
- 财务负责人：账务分录、退款/减免/押金、采购、maker-checker；
- 安全/隐私负责人：身份、敏感字段、文件、break-glass 和审计；
- 技术/运维负责人：迁移、监控、备份、RPO/RTO、回滚演练；
- 发布负责人：灰度范围、观察期、扩量/回退条件和最终 go/no-go。

Codex 只能记录签署证据，不能把“未回复”推断为批准。

### H3. Production Readiness

Track C technical evidence 只在 Production Readiness 最终汇合时补齐，不是 H0/H1
的前置。`production_ready` 需要同时满足：

- Track A、B、C technical passed；
- H1 真人 UAT 达到冻结阈值，无开放 P0/P1；
- H2 所有必需签署明确 approve；
- rollout/rollback/监控/on-call/备份与恢复演练证据齐全；
- 高风险开关、租户/园区范围、灰度窗口和责任人已冻结。

任何 conditional signoff 必须有 owner、完成条件、期限和复核人；条件未满足等同未批准。

## Lane And Status Contract

```text
Codex: planned -> preparing -> environment_ready
       -> handoff_published -> released

Human: not_scheduled -> awaiting_participants -> in_human_uat
       -> awaiting_signoffs -> human_gate_passed | human_gate_rejected

Production: not_evaluated -> technical_ready -> awaiting_human_gate
            -> awaiting_rollout_approval -> production_ready | rejected
```

H1 `awaiting_participants` 是正常外部等待状态：H0/H1 只依赖 Track B technical handoff 与 UAT 环境准备；Codex 发布 handoff 后释放 subagent/slot，不常驻。Track C 与 H1 并行，直到 Production Readiness 最终汇合才要求提交 Track C technical evidence。H1 只阻 production readiness 和高风险生产 enforce。

## Stopship

- P0：跨租户/园区访问；身份/文件泄漏；财务重复/丢失；maker-checker 绕过；生产数据或真实用户被 UAT 污染；不可恢复迁移/回滚。
- P1：关键岗位主流程不可完成；菜单/权限与批准 bundle 不一致；移动关键任务不可用；阈值未冻结或样本不达标；必需签署缺失/拒绝；回滚/监控/on-call 不可执行。

P0/P1 不允许 waiver。未完成 H1/H2 时必须显示 `awaiting_human_gate`，不能显示近似“已就绪”。

## Acceptance Criteria

- [ ] H0 在 Track B technical 与环境准备完成后通过，不等待 Track C technical evidence；UAT 环境、账号、数据和高风险开关可证明隔离。
- [ ] 每个规定岗位有至少 5 名真人、每人 4 个标准任务，首次/重复分开统计。
- [ ] UAT 无 AI 代测、超管、预填 UUID、主持人代操作或逐步答案污染。
- [ ] 产品/运营、业务、财务、安全、技术/运维、发布签署均有具名真人证据。
- [ ] H1 awaiting 时 Codex 已发布 handoff 并释放 agent，不阻 Track C technical。
- [ ] P0/P1=0，指标达到冻结阈值，conditional 条件全部关闭。
- [ ] rollout、监控、on-call、备份、RPO/RTO 和回滚演练证据齐全后才计算 production ready。
- [ ] 未达到条件时状态准确停在 awaiting/rejected，不由 Codex冒充批准。
