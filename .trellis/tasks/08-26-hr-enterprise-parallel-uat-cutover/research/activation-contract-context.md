# Activation contract context

本文件是本任务 implement/check 代理的聚焦上下文，解决两个上游权威文件超过 Trellis 单文件注入上限的问题。它不替代上游规范；实现遇到冲突时仍以列出的源文件为准。

## Authoritative sources

- `.trellis/spec/api/backend/hr-management.md`：HR 范围、敏感投影、required audit、工资不可变、在线零副作用，以及玉舟 T0～T5 各域迁移合同。
- `.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/research/final-cutover-gap-and-plan.md`：当前能力证据、未关闭缺口、两次全域演练强定义、增量/冻结、T4、UAT、恢复和生产 HOLD。
- `.trellis/tasks/08-26-hr-enterprise-parallel-uat-cutover/research/planning-artifact-blueprint.md`：本任务八个 slice、资源拓扑、证据 schema 和激活边界。

## Contracts that every slice must preserve

1. HR 行、引用和文件均为 tenant + park scope；后端只解析 `park | managed_org_tree | self | none`，客户端过滤只能收窄。跨租户、跨园区、跨组织树和猜 UUID 必须安全拒绝。
2. 敏感读取使用 allowlist projection；required audit 必须先成功，失败时不得返回 metadata/header/stream。姓名、证件、银行卡、手机号、工资明细、连接串、token、旧密码和完整请求体不得进入普通日志或 evidence。
3. `hr_employee` 当前态只由在线 lifecycle action 改变；历史导入不得改员工当前态。确认工资/工资条不可变，历史 T4 与双轨 reconciliation 不得创建或修改正式 payroll run、payslip、payment/bank/tax/message/outbox。
4. 玉舟六域固定为 T0 组织/岗位/员工、T1 异动、T2 合同、T3 考勤/保险、T4 历史工资、T5 招聘/档案/培训/奖惩；顺序加载 T0→T5，反序回滚 T5→T0。每域使用 immutable source snapshot、稳定 identity、精确 record map、隔离 reason 和领域 checks。
5. 历史成功 migration 不得修改；fresh、真实 predecessor upgrade、checksum replay、production seed twice 必须各自验证。迁移失败立即停止，不继续 seed/load/UAT/import。

## Full-cutover proof, not historical fragments

- 当前领域工具可复用，但不存在已证明的 full-domain orchestrator、A/B 连续演练、统一 parent manifest/global ledger、S0→S1 delta 等价、全量 T4 双轨、迁移数据三角色 UAT、HR restore verifier、Go/No-Go compiler 或生产专用 import workflow。
- Rehearsal A/B 必须有不同 DB/Compose/volume/container/ports/file/staging/evidence/accounts/run，均从 `template0` 开始，并逐字节复用同一 `codeSha/sourceSnapshotHash/mappingContractHash`。
- 每轮在六域和本轮三角色 API + desktop/390 browser 技术矩阵完成前不得 rollback。过去分域的 load/rollback/reload 不能拼装为 A/B；C/S/M 任一变化会使依赖旧三元组的两轮证据失效。
- 每个 source object 必须验证 `source = loaded + quarantined + approvedIgnored`。`approvedIgnored` 只能用受控 reason code 和 detached approval。跨域 employee/contract/event/insurance/payroll/file owner 零孤儿。
- Canonical hash 使用稳定 source identity、规范业务值和关系 source identity，排除目标 UUID、sequence、run id、created_at；金额以 PostgreSQL numeric/decimal string 计算，NULL 与 0 分离。A/B ledger、canonical hash 和 quarantine reason ledger 必须一致。

## Source freeze, delta and T4

- S0/S1 均绑定 backup、catalog、read-only proof 和 table ledger hash。可证明 identity 的表才允许 insert/update/delete delta；无稳定键或无法证明删除的表必须在停写后重新全量。
- Delta 候选 clone 与 S1 空库 full load 必须获得相同 global/canonical hash；source unlock、rewrite 或 drift 使候选失效。
- T4 当前真实 extraction evidence 仍未完成。真实门禁必须守恒 35 tables、46,092 payroll rows、711 items、244 formulas、1,431 closes、647 members、9 tax rates，并按 table/scheme/period/employee/item 分层核对。
- 双轨只执行 `approved_for_simulation` 公式，解析失败不得当零；输出 old/new/delta/tolerance/reason/reviewer。未解释差异为零或有逐项风险接受及 HR/payroll/finance detached attestations。只算不发，无银行/税务/社保外部动作。

## UAT, restore, cleanup and authorization

- A/B 各自运行同一 versioned task-card 的 HR/manager/employee 自动 API 和 desktop/390 browser 技术矩阵，覆盖范围、原子动作、字段、required audit、直链/UUID、403/not-found、空态、错误恢复和敏感清理。
- 指定最终签署环境由真人重放同一任务卡；技术证据与真人 detached attestation 分离，自动化不得代签。
- Backup 使用 `pg_dump -Fc`、TOC/hash，故障注入后 restore-to-new-db，不覆盖事故库；验证平台+HR+file canonical hash 并记录实际 RTO/RPO。
- 反序 rollback 后实际枚举 DB/container/volume/role/directory/account/file/port/process/credential artifact，总账必须为 `planned/observed/removed/residualCount=0`，不能只信退出码。
- staging/evidence/credential 目录 `0700`、文件 `0600`；权限漂移或敏感扫描命中立即停止。
- 未决 stop-write、无稳定键策略、T4 容差/签署、真人 UAT、RTO/RPO 和 on-call 输入不阻断 Slice 1～3，也不阻断后续 schema/fixture/negative/dry-run 工程；它们只通过稳定 reason code 保持 `NO_GO/productionImport=HOLD`。
- Production import 和 restore 是两个独立 workflow、两个 operation/run、两个一次性秘密授权和两个最小临时角色。授权不得继承、复用、跨操作，且不得进入日志/manifest/evidence；普通 deploy、migration、seed 与 lab rehearsal 均不能到达生产写入口。
