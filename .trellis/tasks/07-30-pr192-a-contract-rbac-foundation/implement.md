# Track A 契约与 RBAC 实施计划

> 仅规划，不实现代码。

## 1. Subagent Batches

总槽位 4；根 Codex 占 1，最多三个 subagent。

### A-C0：证据和合同草案

并行：

- `contract-requirements-planner`：只产出六层 contract/schema request 和验收矩阵，不写 shared 或 migration 文件。
- `rbac-research-worker`：只读核对当前 permission/menu/module/migration。
- `contract-test-planner`：只规划 manifest/migration exact-set tests。

输出：contract draft，不改 menu/migration。

### A-C1：合同冻结

- 父表唯一 `shared-contract-owner` 根据批准的需求包完成 shared contract 和唯一 root export；本子任务不直接写 shared 文件。
- independent checker 校验 shared naming、兼容性和消费者影响。

Gate：

```text
pnpm --filter @jinhu/shared build
pnpm typecheck
```

输出：由 `shared-contract-owner` 提供的 `A-contract candidate SHA` 和 ownership
handoff 记录；独立 stop-ship 未关闭前不得称为最终 A-contract SHA。

### A-C1.5：Server Safety 与 Projection Stop-ship

依赖 A-contract candidate SHA；最多三个实现 owner 并行：

- `property-workbench-safety-owner`：唯一 feature-flag/fail-closed policy。
- `homestay-api-owner`：cancel、ledger discriminator 和
  booking/credential response projection。
- `housing-api-owner`：lease、ledger discriminator、purchase safety，以及 tenant
  list/create projection。

完成后由 `property-env-doc-owner` 串行同步 env examples 和 compatibility 文档，再由
非实现者执行：

```text
flag=unset/off: legacy characterization
flag=true: 8 actions × normal/super/wildcard = HTTP 409
homestay ledger: charge/payment safe neighbor; refund/waiver blocked
housing ledger: charge/payment safe neighbor; refund/waiver/deposit refund blocked
housing tenant list/create: mobile/email masked
homestay booking detail + credential issue/return: credentialReference masked
```

输出 `A-server-safety SHA`，随后 shared-contract-owner 发布内容不漂移的最终
`A-contract SHA`。任一矩阵或 projection 失败均为 stop-ship，A-1 继续
`in_progress`，不得进入 A-C2。

执行记录（2026-07-30）：A-C1.5 独立复审 PASS，`open_P0_P1=[]`。复审发现并修复
canonical metadata 缺失/不匹配时可能 fail open 的问题；focused tests 44/44，
API lint/typecheck/build、Shared build、Web typecheck、diff check 全部通过。
contract/server-safety candidate 已可冻结；当前没有 commit SHA，不填写虚构 SHA。
A-1 仍为 `in_progress`，因为 A-C2 migration/menu 尚未完成。

### A-C2：Menu 与 Migration

严格依赖最终 A-contract SHA 与 A-server-safety SHA，且 stop-ship
`open_P0_P1=[]`：

- 父表唯一 `schema-migration-owner`：接收本任务 schema request，是唯一 Track A migration writer。
- 父表唯一 `menu-projection-owner`：接收本任务 projection request，只改 Web menu 与 users menu projection。
- `migration-test-owner`：只写/运行 Track A migration exact-set tests。

三个 owner 不交叉文件。

### A-C3：Machine Gate

独立 checker：

- manifest/route/API coverage。
- tenant uniqueness / park grants / module predicates。
- legacy/wildcard/custom role 负向矩阵。

## 2. Checklist

- [ ] 读取相关 Trellis specs。
- [ ] 冻结 canonical route/page/action 清单。
- [ ] 冻结 bundle，不硬编码 Persona。
- [ ] 向 `shared-contract-owner` 交付六层 manifest、validator 和 response contract 需求包。
- [ ] 接收并验收 `shared-contract-owner` 的 contract candidate SHA；只有
  A-server-safety Gate 通过后才接收最终 contract SHA。
- [ ] 接收并验收 `property-workbench-safety-owner` 的 flag 三态与 super/wildcard
  fail-closed 证据。
- [ ] 接收 homestay/housing 两组 field projection response snapshot。
- [ ] 接收 `property-env-doc-owner` 的 env/default/409 compatibility 同步证据。
- [ ] 向 `schema-migration-owner` 交付 schema request；reservation 后验收 forward migration。
- [ ] 向 `menu-projection-owner` 交付 seeded/static menu 和 landing/redirect 要求并验收。
- [ ] 运行 exact-set migration 两次。
- [ ] 输出 before/after permission diff。
- [ ] 独立 checker 无 P0/P1。
- [ ] 生成 handoff SHA。

## 3. Machine Gates

- Shared build。
- Workspace typecheck。
- manifest validation。
- permission duplicate scan。
- migration rerun。
- active/missing/disabled/expired module matrix。
- normal/superuser matrix。
- single/multi-park matrix。
- exact fixture equality。
- legacy-only/custom-role negative cases。
- direct route landing/403 contract。
- `PROPERTY_WORKBENCH_V2` unset/off/true matrix。
- 8 high-risk action normal/super/wildcard 409 exact set。
- 两个 ledger discriminator 的 safe/high-risk 邻接矩阵。
- housing tenant list/create 与 homestay credential 三入口敏感字段负向 snapshot。

## 4. 风险与 Stop-ship

P0：

- 跨 tenant/park grant。
- wildcard 绕过 module。
- legacy permission 获得新高风险能力。
- `PROPERTY_WORKBENCH_V2=true` 时任一 high-risk action 可到达领域 mutation，或
  super/wildcard 绕过 409。
- API 返回完整 Party `mobile`/`email` 或 credential `credentialReference`。

P1：

- route/page/API manifest 缺项。
- migration rerun 产生不同结果。
- custom role 自动扩权。
- seeded/static menu 结果不一致。

## 5. Rollback

- 通过 feature flag 关闭新工作台。
- off/unset 只恢复 legacy API；不得用关闭 Web 掩盖 true 状态下缺失的 server gate。
- 不删除 permission/audit 数据。
- forward-fix migration。
- 恢复菜单前使用保存的 role-permission snapshot 验证，不批量恢复宽权限。

## 6. 人工 Gate

Codex 完成 machine Gate 后输出 IA/bundle 差异包。产品/业务负责人确认 page 名称和 bundle 含义。未签署不阻止文档和自动化完成，但阻止将合同标记为生产产品冻结。

## 7. Handoff

交付对象：

- `pr192-a-homestay-workbenches`
- `pr192-a-housing-workbenches`
- `pr192-a-automated-gates`
- Track B shared-contract owner

Handoff 必须包含 SHA、路径、命令、结果和 `open_P0_P1=[]`。
