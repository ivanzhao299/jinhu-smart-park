# B-2c stopship-permission runtime v1 handoff

日期：2026-08-02  
状态：PASS / FROZEN  
Owner：`b2c-stopship-permission-owner`（lane C）  
Open：`open_P0_P1_P2=[]`

## 冻结产物

- Source grammar：`research/b2c-stopship-permission-runtime-v1.grammar`
- Grammar SHA-256：`188b38ddd7f9670d0498b51935c438f57452469a3e535b7d94fce6717eb8af0a`
- Grammar contract：UTF-8、LF、12 条 path-bytewise 升序记录；每条记录为
  `path<TAB>bytes<TAB>raw_sha256`，raw hash 直接覆盖源文件 bytes。
- 独立复审：GO，`P0=[]`、`P1=[]`、`P2=[]`。

Grammar 只覆盖 lane C 的 12 个 production/spec 文件：homestay controller/service 及
spec、housing controller/service 及 spec、HTTP high-risk guard 及 spec、无 HTTP runtime
依赖的 stopship policy 及 spec。它不包含 approval/task runtime、property-operations、
shared contract、migration 或 AppModule 文件。

## 冻结行为

- 六个纯高风险 route 保留静态领域权限与 `property_approval:create`。
- 三个混合 route（homestay ledger、housing ledger、housing handover）保持原
  `PermissionGuard` metadata，低风险 HTTP variant 不新增 approval 权限。
- 高风险 homestay finance variant 在 service barrier 前精确要求
  `homestay:finance:waive` + `property_approval:create`。
- 高风险 housing finance variant 在 service barrier 前精确要求
  `housing:finance:waive` + `property_approval:create`；弱
  `housing:finance:register` 即使与 approval-create 组合也不能旁路。
- 高风险 move-out financial variant 在 service barrier 前精确要求
  `housing:handover:manage` + `property_approval:create`。
- 缺精确权限稳定返回 403；具备精确权限、superuser 或 wildcard 后进入稳定 409
  stop-ship。`PROPERTY_WORKBENCH_V2` 关闭不恢复 service-level 高风险直执。
- 低风险 ledger/handover service 路径保持原行为；本 slice 不创建 approval request、
  不接入或启用 approval runtime。

兼容说明：混合 route 的低风险 variant 继续使用原 route permission lattice；只有请求
实际命中冻结高风险 discriminator/predicate 时，service 才追加精确权限交集与 409
stop-ship。纯高风险 route 的 approval-create 静态要求保持不变。

## 验证命令与结果

```text
node --test --require ts-node/register \
  src/shared/property-workbench/property-high-risk-stopship.spec.ts \
  src/shared/guards/property-high-risk-action.guard.spec.ts \
  src/modules/homestay/homestay.controller.spec.ts \
  src/modules/homestay/homestay.service.spec.ts \
  src/modules/housing/housing.controller.spec.ts \
  src/modules/housing/housing.service.spec.ts
PASS: 6 files, 53 tests, 0 failures

eslint <12 frozen production/spec files>
PASS: 0 errors, 0 warnings

git diff --check -- <12 frozen production/spec files>
PASS

grammar row validation: sorted paths + byte counts + raw SHA-256 recomputation
PASS: verified_rows=12
```

API 全量 `tsc -p apps/api/tsconfig.json --noEmit` 在共享工作树被 lane 外并发文件
`apps/api/src/modules/property-tasks/property-task.contract.spec.ts:41` 的既有 TS2353
（`scanCandidates` 不属于当时可见的 `PropertyTaskSourceResolver`）阻断。该文件不在
本 grammar、owner 或修改范围；六个冻结 spec 的 ts-node 编译与独立复审均已通过。

## Ownership 与禁止路径审计

Lane C 行为修改与 spec 修改严格限制在 grammar 的 12 个文件；本 handoff 额外只新增
grammar 与本文。Lane C 对下列禁止路径的修改数均为零：

- `apps/api/src/modules/property-operations/**`：0
- `apps/api/src/modules/property-approvals/**`：0
- `apps/api/src/modules/property-tasks/**`：0
- `packages/shared/**`：0
- `database/migrations/**`：0
- `apps/api/src/app.module.ts`：0

共享工作树中其他 owner 的并发修改不属于本 handoff，未被回退、吸收或写入 grammar。
