# LEA-004 一期出租状态同步

## Goal

在住房长租与民宿的权威生命周期事务中，将 `biz_unit.rental_status` 同步为可招商（10）或已出租（30），并通过同事务 `biz_unit_status_log` 保留可追溯双写审计，避免业务占用与台账房态漂移。GitHub Issue：#488。

## Requirements

- 住房租约生效为 `active` 后，同事务同步对应运营房源为 30。
- 住房退租审批最终置为 `terminated`、occupancy 释放后，同事务尝试同步为 10。
- 民宿订单入住为 `checked_in` 后，同事务同步为 30。
- 民宿订单退房为 `checked_out` 后，同事务尝试同步为 10。
- 同步使用调用方已有 `EntityManager`，锁定 tenant/park scoped `biz_unit`；不得部分成功。
- 每次真实房态变化写 `biz_unit_status_log`，`source_type=system`，reason 明确业务动作与来源 ID；幂等重放不重复写日志。

## Conflict priority

1. tenant/park、未删除、unit active 与行锁是不可绕过边界。
2. 进入占用（30）只允许从 10/30；20 锁定、50 维修、60 自用、70 已售为强状态，冲突时整笔业务事务失败。
3. 释放（10）以统一 occupancy 与 live aggregate 为权威；若仍有其他有效占用则保持 30，不错误释放。
4. 释放时若 unit 已是 20/50/60/70，保留强状态，不覆盖回 10。
5. 同一 source 的幂等重放不产生新的 unit status log。

## Acceptance Criteria

- [ ] 住房 activate 与民宿 check-in 证明 10→30 + system status log，同事务失败回滚。
- [ ] 住房 terminated 与民宿 check-out 证明无其他占用时 30→10。
- [ ] 释放时存在其他有效占用保持 30；强状态不被释放覆盖。
- [ ] 进入占用遇到强状态返回 conflict，业务状态、房态和日志全部不变。
- [ ] 多租户/园区边界、pessimistic lock、幂等行为有回归测试。
- [ ] targeted tests、lint、typecheck、build、PR/main CI 与 Deploy 全绿。

## Out of scope

- 不修改经营 mode/用途矩阵、Web 表单或 HR。
- 不回填历史数据，不直接操作生产；存量漂移只用既有只读审计脚本识别。
- 不改变住房/民宿/商业租赁生命周期定义。
