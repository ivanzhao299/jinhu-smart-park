# PR192 A 自动化门禁实施计划

## Preconditions

- A-base-core 启动前：fixture contract、A-C2 schema/exact-test SHA、API-only
  `/users/me` projection SHA 与 PR #192 现有 domain runtime 已冻结；不要求页面或
  Web menu final handoff。
- A-route-evidence 启动前：A-base-core fixture handoff SHA 可校验，两份 canonical
  route SHA、Web menu/landing/deep-link SHA、housing tenant alias SHA 与 API
  projection SHA 均已冻结。
- 测试 PostgreSQL、API、Web 和浏览器可用，目标环境明确非生产。
- 父任务的 IA/permission manifest、A-base 规格和 stopship 清单已审批。

## Batch A0 — A-base-core Provision

Owner: `a-profile-owner`

1. 校验 A-schema 与 API-only projection 输入 SHA；定义 profile、role、
   traceability、evidence、cleanup JSON/JSONL schema 和中央 decoder。
2. 实现 `property-remediation-a-base-v1` builder、固定 clock/seed、canonical checksum 和精确行数/分布断言。
3. 增加环境 denylist、专用测试 scope 标记和“无 B 数据/无 B 依赖”断言。
4. 实现 write-ahead manifest、fsync、signal/startup reconcile、幂等清理和 residual scan。
5. 以正常、SIGINT、SIGTERM、创建中崩溃和清理中崩溃验证零残留。
6. 生成包含 contract/schema/generator/profile checksum 和 artifact hashes 的 immutable
   handoff manifest，发布 canonical fixture handoff SHA 给 homestay/housing owner。

Machine gate A0: 两次独立创建 checksum 相等；故障注入全部恢复；非测试环境 fail closed；residual=0；fixture handoff SHA 可复验。完成后标记 `A-base-core provisioned` 并释放 owner，不等待页面。

## Batch A0.5 — Foundation First-route UI Checkpoint

Shared foundation 的 integration-ready handoff 只校验纯函数/组件静态与单测、
lint/typecheck/build，不创建 preview/生产 route。首个输出 canonical domain route
SHA 的 homestay/housing owner 必须在真实 route 上运行 desktop/mobile/keyboard/
focus/zoom/ARIA；shared owner 修复组件缺陷并签收，QA owner 记录
`A-foundation-first-route-ui` evidence。

该 checkpoint 未通过前不得标记 foundation final UI Gate；它也不替代两份 route
SHA 与 Web 接入完成后的 A-route-evidence。

## Batch A1 — A-route-evidence Authorization

Owner: `a-authz-owner`

1. 校验 A-base-core fixture handoff SHA、两份 route SHA、Web 接入 SHA 与 API
   projection SHA，再从已批准 manifest 生成精确岗位夹具，不手工复制宽权限。
2. 建立 module/menu/route/API/data/field/file 的实际采集器和双向差集比较器。
3. 执行 L0-L4：共享常量/元数据、策略单元、组件权限、Track A schema、真实 HTTP。
4. 对每个动作覆盖允许、最近禁止、跨 park、跨 tenant、disabled module superuser、旧入口和直接深链。
5. 增加敏感/财务/文件最小投影、共享 occupancy 与幂等行为的适用用例。

Machine gate A1: 所有 `actual == expected`；无 wildcard/super/legacy 宽码；所有负向用例默认拒绝；L0-L4 无未解释 skip。
property permission expected set 必须恰好 65 项（不是 69）；custom/legacy/wildcard
自动 granular 扩权一律失败。

### 已接收的 A-C2 前置证据（2026-07-30）

A-C2 migration+API-only projection slice 已在独立临时容器/volume 中
`CLOSED / PASS`，`open_P0_P1=[]`：
`000176`–`000182` 基线、000183 连续直跑两次、65 exact、多园区和
disabled/expired/missing/status-disabled 负向、timestamp 稳定、custom/legacy/
wildcard 不扩权；cleanup residual counters=`0|0|0|0`，容器和 volume 已删除。
cross-scope permission assignment 与 role tenant 一致性已验证。fixture fallback
exact rerun 绑定 exact run-id、双 label 和 running 状态，使用 `--rm`、official
PostgreSQL image、显式 `POSTGRES_DB`、匿名 volume，并拒绝数据库 URL override。

空库 `000175` 是会 fail-fast 回滚的生产数据补丁，不提供该 fixture 所需 schema，
故隔离基线跳过；A-route-evidence 不得把该记录宣传为全量空库 migration-chain PASS。
该前置证据允许 shared Web/A-base 启动，但不代表 workbenches、Web menu 或最终
Track A technical verdict 已通过。

## Batch A2 — A-route-evidence Browser, UX, Performance And Evidence

Owner: `a-browser-evidence-owner`

1. 建立需求 → 用户旅程 → 测试 → evidence 追溯矩阵和 waiver 校验器。
2. 执行 L5 浏览器矩阵，覆盖 landing、状态、picker、分页、刷新、深链和主流程。
3. 在 desktop、320/360/390/768px 检查 DS surface、移动卡片、无溢出和触控。
4. 执行 axe/键盘/focus 与固定资源下的 5 次性能采样。
5. 汇总 summary/evidence、artifact SHA-256、命令/exit/失败日志和 cleanup verdict。

Machine gate A2: 追溯 100%；UX/WCAG 2.2 AA/冻结阈值通过；artifact 完整且 hash 可验证。

## Integration Gate A3

1. 复验已发布 A0 handoff，在 route/menu/landing/alias/deep-link final handoff 上按
   A1 → A2 完整运行；无需重做未变化的 core，若重做必须得到相同 fixture SHA。
2. 独立 check agent 对 profile 边界、exact-set 双向差集、L0-L6 适用性、证据链和 cleanup 进行只读复核。
3. 记录 changed files、执行命令、结果、跳过项/理由和剩余风险。
4. Gate aggregator 仅在全部 machine gates 通过且 P0/P1=0 时写入 `track_a_technical_passed`。

## Pause, Resume And Dependency Rule

- A0 按 provision/cleanup manifest checkpoint 恢复；A1/A2 按 fixture SHA、route handoff
  SHA 和 test/evidence checkpoint 恢复。
- 页面未完成时，状态是 `A-base-core provisioned / A-route-evidence awaiting_handoff`，
  不是整个任务不能开始。
- 只有 foundation SHA、尚无真实 route 时，状态是
  `foundation handoff ready / final UI gate awaiting first route`，不能通过 preview
  route 改写。
- A0 依赖已冻结的 A-schema/API projection，但不依赖 homestay/housing 或 A1/A2
  完成；homestay/housing 只依赖 A0 fixture SHA；
  A1/A2 等待页面 final handoff。禁止把任何下游完成条件反写为 A0 前置。

## Expected Validation Commands

实现 owner 应以仓库最终脚本名替换占位符，并把实际命令写入 evidence：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api build
pnpm --filter @jinhu/web lint
pnpm typecheck
node scripts/e2e/<track-a-gate-entry>.mjs
```

UI 有意义变更必须实际浏览桌面和手机视口。涉及迁移时只在可用测试数据库执行相关迁移/重跑测试，不得触碰生产。

## Completion And Handoff

先行交付物是版本化 A-base 与 fixture handoff SHA；最终交付物再包括 exact-set
fixtures、traceability matrix、L0-L6 runner、evidence bundle、cleanup
manifest/recovery 测试和 technical verdict。该 verdict 只代表 Track A 技术通过，不代表真人 UAT、业务签署或生产就绪。
