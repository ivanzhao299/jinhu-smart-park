# IDY-F05 住房入住实名门槛

## Goal

在住房租约交接的 `move_in` 节点复用统一身份核验能力，确保主承租人及全部 occupant 均有当前有效的实名核验快照和住房入住同意后，才允许完成入住交接。

## Confirmed Facts

- Issue: #518；父队列 Issue: #509；Trellis parent: `08-31-identity-workbench-hard-defects`。
- 建租约、提交、审批、签署、activate 与 handover 是独立节点；当前 `move_in` 通过 `HousingHandoverCommandService` 直接完成。
- `biz_party.consent_status` 只是兼容投影；有效同意必须来自当前、未撤回、已生效、`operator_recorded`、`consent` 基础的事实。
- consent purpose 已支持 `housing_move_in`；现有民宿 verifier 固定使用 `accommodation_checkin`，不能直接冒充住房语义。
- 租约有主承租人 `tenant_party_id`，并可有零到多个 `rel_housing_lease_occupant`。

## Requirements

- 门槛只在 `completeHandover` 且 `handover_type=move_in` 时执行；`move_out` 行为不变。
- 建租约、提交、审批、签署和 activate 不消费实名门槛，也不因未核验或未同意而失败。
- 验证集合为主承租人加全部 occupant Party ID，去重后整体校验；零 occupant 时仍校验主承租人。
- 每个 Party 必须同 tenant/park、未删除、未受 processing restriction，并存在当前 `verified` submission、匹配 identity version 的不可变 snapshot 及未漂移的有效证据文件。
- 每个 Party 必须有当前同意事实：`status=granted`、`lawful_basis=consent`、`provenance=operator_recorded`、`processing_purpose=housing_move_in`、已生效且未撤回。
- 任一 Party 缺失、未核验、缺少/错误目的/未生效/已撤回同意，或 snapshot/file/version 漂移时，整个 move-in 事务 fail closed，不得完成部分入住。
- 复用同一 canonical verifier 内核，不在住房服务复制身份/同意 SQL；住房提供明确的 `verifyForHousingMoveIn` 语义入口。
- 错误响应不得泄露证件明文、密文、哈希、密钥或其他敏感证据内容。
- 更新发布文档，明确门槛节点、主体范围、失败语义，以及 create/sign/activate 不阻断。

## Acceptance Criteria

- [ ] 未核验主承租人或任一 occupant 的 move-in 被拒，handover 保持未完成。
- [ ] 主承租人或任一 occupant 缺少当前住房入住同意、同意目的错误、未生效或已撤回时被拒。
- [ ] 主承租人及全部 occupants 均核验通过且住房入住同意有效时，move-in 成功。
- [ ] 零、单个、多个 occupant 矩阵均有测试；多人场景任一失败即整体失败。
- [ ] Party 缺失/跨 scope/已删除/受限、identity version 或 snapshot/file 漂移均 fail closed。
- [ ] 建租约、提交、审批、签署与 activate 的未核验/未同意路径保持可用，并有防回退断言。
- [ ] move-out 与财务审批路径不受影响。
- [ ] API 单元/契约测试、住房 PostgreSQL 原子性测试、住房 E2E 与相关文档通过。
- [ ] PR `Closes #518`，review 不超过三轮，CI/Release Smoke、squash merge、main CI 与 Deploy 全绿后归档。

## Out of Scope

- 不修改 F01-F04 的加密、轮换、reveal 或留存执行语义。
- 不把住房门槛前移到建租约、签署或 activate。
- 不改 HR、不做生产直操作、不处理住宿业专项 P0-02/03/04。
