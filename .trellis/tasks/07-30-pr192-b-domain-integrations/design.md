# PR192 B 领域集成技术设计

## 1. 精确 Ownership

| Owner | 独占路径 |
|---|---|
| module-dependency-owner | `apps/api/src/modules/saas-modules/**` 及本领域 tests |
| homestay-api-owner | `apps/api/src/modules/homestay/**` 及本领域 API/integration tests |
| housing-api-owner | `apps/api/src/modules/housing/**` 及本领域 API/integration tests |
| homestay-b-web-owner | handoff 后的 `apps/web/app/homestay/**`、`apps/web/features/homestay/**` |
| housing-b-web-owner | handoff 后的 `apps/web/app/housing/**`、`apps/web/features/housing/**` |
| api-integration-owner | `apps/api/src/app.module.ts` |

Track A Web owner 必须先交付 SHA 并退出对应路径，B Web owner 才接管。所有 owner 知道
自己不是唯一 Agent，不得回退他人变更。

`module-dependency-owner` 仅在独立 B1/D0 milestone 持有 `saas-modules/**`。输出
`B-module-core SHA` 后必须记录验证结果、冻结 SHA、释放路径并退出；后续 B2c/B3
owner 不得重新取得或修改该路径。

明确禁止修改：

```text
packages/shared/**
database/migrations/**
database/seeds/**
apps/api/src/modules/property-approvals/**
apps/api/src/modules/property-tasks/**
apps/api/src/modules/property-operations/**
apps/web/features/property-shared/**
scripts/property-remediation/migration/**
```

## 2. 阶段 DAG

```text
B contract + schema expand
  → D0/B1 module dependency
  → B-module-core SHA
  → B2b B-extension-core
  → B2c homestay/housing adapters
  → B3 domain Web + app wiring
  → B-final-reconcile
```

`B-module-core SHA` 是规范产物名。D0/B1 不读取或等待 `B-extension-core`，也不等待
后续 adapter/Web 完成。B2c/B3 必须消费已冻结的 module SHA 和 extension core。

## 3. Adapter 边界

领域仅依赖冻结 ports/contracts：

```text
IdentityVerificationPort
PropertyApprovalCommandPort
PropertyApprovalProjectionPort
PropertyTaskAssignmentPort
PropertyTaskProjectionPort
PropertyOperationsPort
```

领域 adapter 不读取 runtime 内部表，不复制状态机，不自行发布第二类 approval/task
event。Port 版本或语义不够时提交 change request。

## 4. Homestay 集成

Check-in transaction：

```text
lock booking
→ lock sorted Parties
→ identity port locks/revalidates current verified submissions/snapshots/files
→ validate booking/occupancy/state/scope
→ write check-in + guest evidence audit
```

同一 transaction 贯穿，不能先获取 boolean eligibility。Audit 保存 submission/snapshot/
identity/file digest。取消、终止和财务适配依据 manifest approvalPolicy：创建 request
后对象进入受控 pending 状态，runtime execution 再调用稳定 domain command。

Web 在原 canonical booking/task/finance surfaces 中加入审批/identity 状态和允许动作，
不创建新 route 或第二份 query/mutation。

## 5. Housing 集成

每个高风险 action 映射一个稳定 domain command 和 approval action ID。执行前重新
验证状态、金额、scope、policy snapshot 和版本。住房金额保持 decimal string/scaled
integer，不经过 JS number；账务仍写 housing 子账。

Lease、finance、purchase adapters 使用 execution idempotency key 和领域 unique key。
Runtime 重试只得到同一业务效果。Web 只填充 Track A detail/tab 的 read-only slot，
根据 decision/execution/assignment projection 显示申请、待批、执行、失败和结果。

## 6. Module 与 Wiring

Module dependency service 在同一 tenant/park 验证 active assignment 和依赖；API、
`/users/me`、菜单由既有跨层合同保持一致。此任务不改 menu projection。

Module dependency 在 B1 独立 build/test 并输出 `B-module-core SHA`。后续 app wiring
只能消费其公开 module/provider contract，不修改已释放的 `saas-modules/**`。

`app.module.ts` 只在所有模块独立 build/test 和 handoff 后由 integration owner 修改。
Wiring checker 验证没有 circular dependency、dual provider、旧 service 与新 port 并行
注入或未受 module guard 的公开 controller。

## 7. Rollback

- Domain integration 使用父任务 flags 分 tenant/park shadow/enforce。
- 关闭 enforce 后，新 request/identity/audit 保留；已 executed 不回退。
- 旧客户端遇到 approval-required 返回明确兼容响应，不静默直执。
- Web flag 关闭恢复 Track A read-only surface。
- app wiring 回退不执行 destructive migration。
- 财务/审批 RPO=0；任何 partial effect 为 P0。

## 8. Machine Gates

B1 Module Core Gate：

- 只消费 B contract/schema expand。
- Module on/off、dependency、superuser、multi-park 和 409 行为通过。
- 输出 `B-module-core SHA`，冻结并释放 `saas-modules/**`。
- 对 Track A、B runtime、B-extension 和领域 adapters 的依赖数为零。

B2c/B3 Domain Gate：

- Ownership/import boundary 静态检查。
- 精确消费 `B-module-core SHA` 与 `B-extension-core SHA`。
- Homestay identity check-in concurrency、supersede race、TOCTOU。
- 每个 approval action 正向、maker/checker、状态冲突和最近越权。
- Runtime crash/reclaim/replay 下领域 financial effect 一次。
- Task claim/complete 调用 owning aggregate，list/count/rebuild 一致。
- Web canonical route、权限、状态、deep-link 和高风险 slot E2E。
- Old API/client compatibility、flag rollback/re-enable。
- API/Web/shared build、typecheck、targeted regression 和 app startup。
