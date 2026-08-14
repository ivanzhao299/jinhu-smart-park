# PR192 到当前版本住宿/民宿范围覆盖矩阵

Status: template package only  
Bound technical handoff: `../handoff/2026-08-14-technical-closure-to-human-gate.md`  
Bound technical candidate: `97669ed2df810c9bc1da0e1abeb271187a7b70a4`

这张矩阵用于回答一个非常具体的问题：PR192 之后到当前候选版本的住宿/民宿变更，是否都进入了真人 UAT 执行包与生产就绪门禁。它不是源码级 diff 清单，也不替代 GitHub PR、Issue 或 Codex Review 记录；它要求每一类变更至少绑定到以下一种证据：

- 技术闭环证据：候选 SHA、CI、E2E、迁移、Codex Review、部署/健康探针；
- 真人 UAT 任务卡：真实角色、真实入口、首次/重复使用、390px 手机任务、附件/审批/财务链路；
- 生产就绪门禁：H0 环境、阈值冻结、范围/账号/权限清单、签署、发布观察、回滚/恢复、清理；
- 明确后续范围：本轮不放开的能力必须 fail-closed，并有后续 Issue/任务承接。

如果下表任一 `生产就绪绑定` 为空，或 `范围状态` 不是 `covered` / `follow_up_fail_closed` / `out_of_scope_documented` 之一，则不得把 PR192 标记为 `production_ready`。

## 覆盖矩阵

| 来源范围 | 住宿/民宿变更范围 | 涉及层 | 技术证据绑定 | 真人 UAT 绑定 | 生产就绪绑定 | 范围状态 |
| --- | --- | --- | --- | --- | --- | --- |
| PR192 baseline | 真人岗位 UAT、H0/H1/H2/H3/H4、生产 ready AND 门、停止线、观察期、签署链 | UAT / Release | `.trellis/tasks/07-30-pr192-human-uat-production-readiness/{prd.md,implement.md}`；本包 candidate SHA 绑定 | 全部 `task-cards.md`；`observation-ledger.csv`；`signoff-ledger.csv` | `readiness-evaluator-input.template.json` 的 `human_uat`、`signoffs`、`release_owner_go`、`computed_contract` | covered |
| #270 / PR274 | 数据库加固：住宿/民宿跨租户/园区 scope 约束、所有者/引用完整性、迁移校验、终态数据保护 | Database / API / E2E | `../handoff/2026-08-14-technical-closure-to-human-gate.md` 中 #270；CI / migration / E2E 证据 SHA | `PARK-ADMIN-*`、`HOMESTAY-INSPECTOR-04`、`HOUSING-APPROVER-*`、`HOUSING-HANDOVER-*`、`AUDITOR-04` 的跨范围拒绝和审计追踪 | `technical.track_b`、`human_uat.accepted_h0_profile_checksum`、`human_uat.all_observation_rows_match_h0_profile_checksum`、`signoffs.security_privacy`、`signoffs.technical_operations` | covered |
| #271 / PR276 | 高风险动作开放与 fail-closed：民宿取消、退款、减免；住房审批、作废、退租、采购付款/转收费、退款、押金退还；字段权限/敏感字段掩码 | API / Permissions / Audit / Web | `../handoff/2026-08-14-technical-closure-to-human-gate.md` 中 #271；Codex Review follow-up；字段策略/高风险动作测试证据 | `HOMESTAY-FINANCE-*`、`HOMESTAY-FRONTDESK-*`、`HOUSING-APPROVER-*`、`HOUSING-FINANCE-APPROVER-*`、`HOUSING-PURCHASE-*`、`AUDITOR-03` | `rollout_ops.high_risk_feature_flag_*`、`rollout_ops.high_risk_production_enforce_approved`、`signoffs.finance`、`signoffs.security_privacy`、`release_owner_go.explicit_go_for_candidate_sha` | covered |
| #271 后续范围 | 后端审批、权限、幂等、审计、终态约束尚未完整的动作继续关闭，不得通过前端或配置绕开 | API / Web / Release | Issue/PR 的后续范围说明；高风险 manifest / capability fail-closed 证据 | 观察中若发现入口可见或可执行，记 P0/P1 stopship | `human_uat.no_open_stopship_defects`、`computed_contract.required_true_fields`、`rollout_ops.all_high_risk_flags_match_freeze` | follow_up_fail_closed |
| #272 / PR279 | E2E 门禁：民宿 API E2E、住房 API E2E、幂等 replay/conflict、金额精度、终态不可变、附件/文件引用、release gate 接入 | E2E / CI / API / DB | `../handoff/2026-08-14-technical-closure-to-human-gate.md` 中 #272；GitHub Actions run id；E2E 日志哈希 | 真人任务不替代 E2E；仅抽样验证关键业务路径可用性与错误可理解性 | `technical.track_a`、`technical.track_b`、`technical.track_c`、`technical.main_ci`、`human_uat.machine_rerun_refs` | covered |
| #273 / PR281 | 前端真实回归：住宿/民宿页面、任务入口、运行时槽、390px 响应式、附件上传、权限正反、深链/菜单可发现性 | Web / Runtime / RBAC / Files | `../handoff/2026-08-14-technical-closure-to-human-gate.md` 中 #273；Windows/Chrome 或等效真实浏览器证据 | 所有角色任务卡的 `discoverable entry`、`phone_390px_class`、附件/审批/财务任务 | `human_uat.all_phone_required_tasks_observed_on_phone_390px_class`、`human_uat.all_device_requirements_match_frozen_task_cards`、`signoffs.product_operations` | covered |
| PR284 | Codex Review 后技术闭环：#270-#273 合并后的 review follow-up、候选版本一致性、main CI/deploy/health 证据 | Review / CI / Deploy | `../handoff/2026-08-14-technical-closure-to-human-gate.md` 的 technical closure 和 candidate SHA | 不作为真人样本；作为 H0 前置技术候选 | `technical.*.evidence_matches_candidate_sha`、`technical.production_deploy.deployed_sha_matches_candidate_sha` | covered |
| PR285 | 技术移交：把 #270-#273/#284 的证据转为 PR192 真人 UAT 前置输入 | Docs / UAT | `../handoff/2026-08-14-technical-closure-to-human-gate.md` | 本 UAT 包的 H0 输入来源 | `human_uat.accepted_h0_handoff_*`、`human_uat.all_observation_rows_match_accepted_h0_handoff` | covered |
| 民宿订单与入住链路 | 订单、到店、入住、退房、凭证、周转关联、取消审批、取消后终态/审计 | API / DB / Web / Audit | #271/#272 技术证据；订单/取消/入住/退房 E2E | `HOMESTAY-FRONTDESK-*`、`HOMESTAY-CLEANER-*`、`HOMESTAY-INSPECTOR-*`、`AUDITOR-*` | `human_uat.all_required_task_ids_observed_per_role`、`signoffs.business_homestay`、`signoffs.finance` | covered |
| 民宿财务链路 | 收款、费用、退款、减免、来源流水、可退/可免余额、财务字段权限、审批与 effect audit | API / DB / Web / Permissions | #271/#272 技术证据；字段策略和 finance source 回归 | `HOMESTAY-FINANCE-*`、`AUDITOR-03`、`PARK-ADMIN-04` | `signoffs.finance`、`signoffs.security_privacy`、`rollout_ops.high_risk_feature_flag_freeze_active` | covered |
| 民宿周转与文件 | 保洁开始/完成/异常/检查、现场照片、附件权限、移动端任务执行 | API / Web / Files / Mobile | #272/#273 技术证据；文件上传与权限回归 | `HOMESTAY-CLEANER-*`、`HOMESTAY-INSPECTOR-*` | `human_uat.all_media_evidence_has_valid_consent`、`human_uat.all_media_evidence_redaction_completed`、`cleanup.residual_files` | covered |
| 住房租客/租约链路 | 租客、租约提交、资格检查、审批、激活、作废、退租、终态约束 | API / DB / Web / Approval | #271/#272 技术证据；审批/版本/终态 E2E | `HOUSING-LEASING-*`、`HOUSING-APPROVER-*`、`AUDITOR-*` | `signoffs.business_housing`、`signoffs.finance`、`release_owner_go.decision_bound_to_reviewed_evidence_bundle_hash` | covered |
| 住房交割/维修/附件 | 入住交割、退租财务交割、维修报修/处理、现场图片、文件权限和移动端 | API / Web / Files / Mobile | #271/#272/#273 技术证据 | `HOUSING-HANDOVER-*`、`HOUSING-REPAIR-*`、`AUDITOR-03` | `human_uat.all_phone_required_tasks_observed_on_phone_390px_class`、`cleanup.residual_files`、`signoffs.security_privacy` | covered |
| 住房账单/财务 | 账单生成、重复生成冲突、收款、退款、减免、押金收退、金额上限、来源不可变 | API / DB / Web / Finance | #271/#272 技术证据；幂等/冲突/金额精度 E2E | `HOUSING-BILLING-*`、`HOUSING-CASHIER-*`、`HOUSING-FINANCE-APPROVER-*` | `signoffs.finance`、`human_uat.no_open_stopship_defects`、`rollout_ops.monitoring_verified_for_candidate_and_window` | covered |
| 住房采购 | 采购申请、审批、付款、退款/作废、转租客收费、已转收费后终态约束 | API / DB / Web / Approval | #271/#272 技术证据；purchase lifecycle/transfer 回归 | `HOUSING-PURCHASE-*`、`HOUSING-FINANCE-APPROVER-*`、`AUDITOR-*` | `signoffs.finance`、`signoffs.business_housing`、`rollout_ops.all_high_risk_flags_match_freeze` | covered |
| 共享权限/字段策略 | 菜单、模块启停、页面权限、数据范围、敏感字段、财务字段、跨园区拒绝 | Shared / API / Web / RBAC | #270/#271/#273 技术证据；账号 manifest checksum | `PARK-ADMIN-*`、`AUDITOR-*`、各业务角色负向用例 | `human_uat.accepted_h0_profile_checksum`、`signoffs.security_privacy`、`signoffs.technical_operations` | covered |
| 生产部署与监控 | 发布窗口、灰度范围、高风险 flag freeze、监控/告警/on-call、备份恢复、回滚演练、UAT 清理 | Release / Ops | PR284/PR285 技术移交；生产部署 workflow/health probe 证据 | 真人 UAT 不替代发布门；签署后进入发布观察 | `rollout_ops.*`、`restore_drill.*`、`cleanup.*`、`computed_contract.rollout_observation.*` | covered |

## 使用要求

1. H0 负责人必须在 `readiness-evaluator-input.template.json` 中记录本矩阵的冻结哈希。
2. 若 PR192 之后又合入任何住宿/民宿相关变更，必须先新增或更新本矩阵行，再冻结 task-card、阈值与观察账本。
3. 若某项变更只有技术证据、没有真人任务覆盖，必须说明原因；涉及用户可见业务路径的，默认不得只靠技术证据通过。
4. 若某项能力本轮继续关闭，必须保持 fail-closed：没有前端入口、没有可绕过权限的接口、没有生产 flag 打开，并在后续 Issue/任务中承接。
5. 本矩阵、任务卡、阈值、H0 handoff、观察账本和签署账本必须绑定同一个候选 SHA；任一不一致都使 `production_ready=false`。
