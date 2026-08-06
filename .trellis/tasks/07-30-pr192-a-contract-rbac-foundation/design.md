# Track A 契约与 RBAC 技术设计

## 1. 权威文件和 Ownership

本子任务是 Track A 契约/RBAC 的需求、验收与 handoff 容器，不取得父任务
Ownership 表中任何文件的局部 ownership。实现只能由父任务指定的唯一 owner
写入：

| 父级唯一 owner | 可写范围 | 本子任务职责 |
|---|---|---|
| `shared-contract-owner` | `packages/shared/src/property-business/**`、`packages/shared/src/index.ts` | 提供六层契约需求、验收矩阵并接收 contract SHA |
| `property-workbench-safety-owner` | `apps/api/src/shared/property-workbench/**` | 实现唯一 flag 解析、409 fail-closed policy 和矩阵测试 |
| `homestay-api-owner` | `apps/api/src/modules/homestay/**` | 接入 cancel/ledger safety policy；闭合 booking/credential projection |
| `housing-api-owner` | `apps/api/src/modules/housing/**` | 接入 lease/ledger/purchase safety policy；闭合 tenant list/create projection |
| `property-env-doc-owner` | `.env.example`、`.env.production.example`、相关环境/部署/测试文档 | 冻结 flag 默认值、三态语义、409 compatibility 和 rollout 说明 |
| `menu-projection-owner` | 分阶段独占 `apps/api/src/modules/users/users.service.ts` property projection 与 `apps/web/lib/menu.ts` | A-C2 先交付 API-only SHA；收到两份 domain route SHA 后才写 Web menu/landing/redirect |
| `schema-migration-owner` | `database/migrations/<reserved-A-permission-menu>.sql` | 提交 schema request，验收 reservation、rerun、diff 和 checksum |

本子任务中的 planner、reviewer 和 checker 不得写入上述文件。需要实现或修复时，
向对应父级唯一 owner 发出带 base SHA 的工作包；完成后仅接收 handoff SHA 和证据。

本子任务规划/复审者不修改：

- `apps/web/app/homestay/**`
- `apps/web/app/housing/**`
- `apps/api/src/modules/homestay/**`（只由父表 `homestay-api-owner` 写）
- `apps/api/src/modules/housing/**`（只由父表 `housing-api-owner` 写）
- `apps/api/src/modules/property-operations/**`
- 其他子任务目录

`database/migrations` 文件名只由父计划的 `schema-migration-owner` 在 reservation 后创建。本子任务只提出 schema request 和验收 SQL 结果。

## 2. Contract 模块

建议结构：

```text
packages/shared/src/property-business/
  access-manifest.ts
  permissions.ts
  permission-bundles.ts
  routes.ts
  response-contracts.ts
  index.ts
```

`@jinhu/shared` 只保存跨 API/Web 类型、权限和状态；不得放 React 或浏览器 helper。

Access manifest 记录：

```text
featureId
module.required/dependencies
surface.menuCode/pageCode/route/detailRoutes/legacyAliases
actions[].method/path/permission/idempotency/approvalPolicy
data.dimensions/enforcement
fields[].classification/readPermission/projection
files[].bizTypes/read/upload/delete/referenceScope
```

Manifest validator 必须检查：

- route/page/action 唯一性。
- permission code 格式和重复。
- mutation idempotency 声明。
- sensitive/financial field projection。
- protected file policy。
- legacy alias 不能成为新页面授权来源。

## 2.1 A-server-safety 合同

共享 contract 中的 `blocked-until-track-b` 不是运行时控制。A-C1 后必须增加独立
server safety Gate：

```text
PROPERTY_WORKBENCH_V2 off/unset -> legacy API
PROPERTY_WORKBENCH_V2 true
  -> safe read/mutation 保持现有合同
  -> 9 high-risk action/variant 在领域 service/transaction 前返回 409 approval-required
```

infrastructure owner 只提供单一 policy，不解析领域 DTO。homestay/housing owner 在
DTO validation 后传入稳定 action ID；ledger 必须传入 `entry_type` 判别结果。Policy
不能读取 `is_super` 或 wildcard 作为 bypass。

Policy 必须以 canonical manifest metadata 为权威解析 action。独立复审发现过
metadata 缺失/不匹配时可能 fail open 的实现；该路径必须 default-deny，调用方不能
通过未知 action ID、自声明风险级别或遗漏 discriminator 绕过 409。

A-2.5 新增第 9 个
`housing.handovers.complete-move-out-financial` discriminator：
`handover_type=move_out` 且 damage/unsettled/deposit deduction 任一非零。它与原 8
action 一样，在 Track B adapter 前 unavailable。

## 2.2 A-2.5 Response Closure

Shared contract 必须覆盖所有现有/新增 workbench response types。Homestay closure
覆盖 tasks、stays、turnover detail、finance 与 guest/work-order candidates；
Housing 覆盖 tasks、handover list/detail、billing、finance、repair list/detail。
GET 使用精确 read permission，财务字段与附件 ID 使用最小投影。禁止 N+1 拼装、
route-local interface 和扩大 bundle。

新增 `/homestay/stays/[stayId]` authorized detail alias，使 detail routes 从 6 到 7。
Party canonical target 已交付为 `/assets/parties` 与
`/assets/parties/[partyId]`，使用独立 `asset:party` 页面权限；它不属于
`PROPERTY_BUSINESS_PERMISSIONS` 或 14 个 bundles。

Track B approval adapter 接管时，仍使用同一 action ID，将 409 替换为创建 approval
request；未取得 Track B SHA 时 fail closed。

两组 projection 由领域 owner 在 server response boundary 修复：

- housing tenant list item 与 create response 共用 Party public/masked projection，
  不返回完整 `mobile`/`email`。
- homestay booking detail、issue credential、return credential 共用 credential
  projection，不返回完整 `credentialReference`。

## 3. Menu Projection

数据库 seeded menu 是首选运行时来源，静态 menu 是兼容 fallback。两者必须使用相同 canonical route、page permission 和 module code。

当前 canonical Web routes 尚未全部存在，会被 catch-all placeholder 接住。因此
projection 分两段：

1. A-C2 API-only：`/users/me` 仅按 active enabledModules、granular page permission
   和当前 tenant+park role/relation 过滤；custom、legacy operations、wildcard
   不得推导新 page。Web menu/feature flag 不暴露这些 route。
2. route SHA 后：menu owner 消费 homestay/housing route SHA，再实现 Web menu、
   legacy landing 与 unknown property deep-link fail-closed；housing Web owner 在其
   app route 独占范围实现 tenant alias redirect/guard。

Menu tree：

- 民宿父菜单 `homestay`。
- 住房父菜单 `housing_rental`。
- 子页面只按各自 page permission 展示。
- 父菜单无直接业务 mutation。

`GET /users/me` 返回：

- permission codes。
- enabled modules。
- park-scoped menu tree。

Module inference 必须识别 canonical routes，但不得把拥有 `homestay:*` 或 `housing:*` 任一 API 权限等价成整个菜单。

## 4. Permission Definition 和 Grant

Permission definition：

```text
UNIQUE (tenant_id, code) WHERE is_deleted=false
```

由于 permission row 的 `park_id` 只是 tenant-wide 定义的存储 scope：

- 选择 deterministic active park 保存 definition。
- 不为每个 park 插入重复 definition。
- 不通过反复更新 definition.park_id 表示每 park 授权。

Grant：

- 枚举 active `rel_tenant_module`。
- 与同 tenant/park 的 role 相交。
- 按 explicit bundle → permission mapping 建立 role grant。
- custom role 只保留原授权或管理员显式选择，不自动扩权。

Migration 必须幂等、forward-only，并提供：

- before/after role-permission diff。
- 新增/缺失/多余 grant 报告。
- rerun 结果。
- expected permission exact set 为 65，不是 69。
- `000183_*` 在创建前只作为候选；schema owner 重扫工作树/history 并实际创建后，
  `000183_property_business_granular_rbac.sql` 成为本切片 reservation。

隔离 runtime fixture 的 container fallback 必须绑定 exact run-id、双 label 和
running 状态；只允许 `docker run --rm`、official PostgreSQL image、显式
`POSTGRES_DB`、匿名 volume，拒绝数据库 URL override。permission assignment 与 role
必须属于同一 tenant，cross-scope 错配 fail closed。

## 5. Landing 和 Redirect

Legacy route handler：

1. 读取当前 user enabled modules 和 page permissions。
2. module 未启用：module 403，返回 `/dashboard` 安全入口。
3. 按固定 priority 找首个 page permission。
4. 无 page permission：module-specific 403。
5. 忽略 `next`、`returnTo`、实体 ID、filter 对 landing 的影响。

`returnTo` 只由具体 detail page 使用同源 allowlist。

## 6. Compatibility

- 原 API permission constants 保留，除非明确拆分并完成消费者迁移。
- legacy page permission 保留两个发布周期。
- 新页面不得接受 legacy permission 作为替代。
- Shared contract 字段保持当前 snake/camel case，不进行无关清理。
- Track B 可在 A handoff SHA 后提出 approval/identity contract 变更请求，但仍只能由父表中的同一 `shared-contract-owner` 写入，并完成显式 handoff。

## 7. Rollback

- 关闭 `PROPERTY_WORKBENCH_V2` 恢复 legacy Web 入口。
- `PROPERTY_WORKBENCH_V2` off/unset 同时保持 legacy API 行为；true 时 server-side
  409 是 Track A 安全边界，不能只回退 Web。
- 新 permission definitions 和 grants 不删除。
- rollback 不恢复 legacy 宽权限对新页面的授权。
- migration 问题只用 forward-fix。
- 菜单 rollback 前保存 role-permission snapshot。

## 8. Handoff

向民宿、住房和自动化子任务交付：

```text
handoff_sha
manifest_version
canonical_routes
page/action permissions
bundle matrix
migration reservation/result
validation commands/results
open P0/P1
```

`open P0/P1` 必须为空。交接后，本子任务冻结需求基线；需要变更时由
`shared-contract-owner` 回收文件 ownership、发布新 contract SHA，再通知所有消费者。

## 9. 2026-07-31 最终设计证据

交付链 `3766509`、`44d6769`、`8a0bd17`、`5a557e5`、`d33fad9` 已完成 shared、
双域 API、RBAC、集成合同与 Party target；后续 `bc2ed7f`、`992a6a4` 证明双域 Web
消费者已落地。最终独立 Gate 为 `open_P0_P1=[]`。

唯一未闭合的是 connector 基础设施下的真实视觉证据，不是契约、权限、DB 或
消费者代码缺口，因此本 contract 子任务完成，但不能据此宣称整体 release-ready。
