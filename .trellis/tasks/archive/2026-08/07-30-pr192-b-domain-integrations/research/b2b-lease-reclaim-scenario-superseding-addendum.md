# B-2b 租约回收场景窄幅纠偏补充合同

日期：2026-08-01  
状态：待独立复审  
作用范围：仅取代
`b2b-module-core-precondition-correction-plan.md` 中“task lease reclaim”这一项。

## 1. 纠偏事实

当前已签任务合同、`000188`、`000194` 及 `property-tasks` runtime 没有
`lease_expires_at`、`worker_id` 或到期 reclaim API。任务 assignment 只有领取、开始、
阻塞、解除阻塞、释放，以及 `claim_epoch/claim_token` fencing。强行实现 task lease
reclaim 会扩张已冻结 schema/API/runtime，不属于 B-2b fixture 权限。

审批执行 runtime 已在 `000186` 和 B-approval-runtime 中冻结
`claim_epoch/claim_token/worker_id/lease_expires_at/heartbeat_at`、过期回收、CAS fencing
和 reclaim audit，因此它是本验收项的合法 owner。

## 2. Superseding 场景

- 保留 `task_claim_race`：同一 open assignment、两个竞争者并发 claim，成功数必须
  恰为 1；assignment 进入 claimed/version+1，assignment audit、mutation receipt、
  projection rebuild audit 各为精确 1；败者返回稳定任务冲突，不得新增副作用。
- 删除不可实现的 `task_lease_reclaim`。
- 新增 `approval_execution_lease_reclaim`：seed approved + executing + expired lease；
  两个 worker 并发 reclaim，成功数恰为 1；`claim_epoch` 恰加 1，token/worker 被替换，
  lease 延后，attempt 恰加 1，`reconcile_required=true`，reclaim audit 恰为 1。
- 败者以及旧 epoch/token 对 heartbeat/complete 的调用均返回稳定
  `property-version-conflict`，effect、receipt、outbox 不得重复。

## 3. 边界

- 只消费已签 `000186`、`B-approval-runtime SHA`、`B-property-task-runtime SHA`。
- 不新增或修改 task/approval schema、路由、shared contract 或 runtime 行为。
- 原 task 与 approval handoff SHA 保持不变。
- 本补充合同必须作为 regular sidecar 固定 path/bytes/raw SHA，进入
  before-container、after-local、after-pg、after-cleanup 四阶段冻结。
- 本文件独立复审 GO 且 P0/P1/P2=0 前不得运行 B-extension Docker Gate。

## 4. 未变化部分

原纠偏计划的其余输入、状态矩阵、迁移顺序、A-base 保护、消息场景、失败证据、
Docker 生命周期、fixture/validation 双签及 B-2c 放行边界全部保持不变。
