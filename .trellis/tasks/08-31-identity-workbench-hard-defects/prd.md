# 身份核验工作台硬伤组修复队列

## Goal

依据 `docs/reviews/identity-workbench-compliance-review-2026-08-31.md` 和 GitHub Issue #509，先完成身份核验内部底座硬伤闭环，再等待业务、法务与属地条件启动住宿业专项。

## Requirements

- F01 独立 PR：专用加密密钥启动 fail-closed、版本化双读、逐租户轮换与必达审计。
- F02/F03 数据模型 PR：同意事实、分层留存、主体权利与 legal hold，不伪造历史。
- F04/F05 消费侧 PR：默认脱敏/reveal 审计、住房 handover move-in 全 occupant 门槛。
- 每个 PR 串行完成 Issue/Trellis/分支、review 不超过 3 轮、CI、merge、main 双绿。
- 全部上线后完成统一 UAT、G1-G7 抽查、成熟基建验证、报告 PR、main 双绿与归档终报。
- 所有迁移 forward-only 并说明逐租户语义；不触碰 HR、生产环境或他人容器/Chrome；不记录秘密或真实身份数据。

## Acceptance Criteria

- [ ] F01、F02/F03、F04/F05 各自通过任务验收并合并。
- [ ] 密钥、同意、留存、reveal、住房门槛和民宿防回退 UAT 全部有真实可复核证据。
- [ ] G1-G7 与成熟基建验证完成，最终报告记录已完成项、跳过项、风险和住宿业专项启动条件。
- [ ] main 双绿，任务和开发日志归档。

## Out of Scope

- P0-02 住宿证件目录/有效期。
- P0-03 公安住宿登记/报送。
- P0-04 未成年人住宿“五必须”。

上述三项只能在产品、法务、运营和属地公安条件确认后另立任务。
