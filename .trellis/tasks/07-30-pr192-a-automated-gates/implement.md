# PR192 A 自动化门禁实施计划

## Preconditions

- A-base-core implementation 启动前：fixture contract、A-C2 schema/exact-test SHA、
  API-only `/users/me` projection SHA、PR #192 现有 domain runtime 与
  `A-ephemeral-db-bootstrap SHA` 已冻结，且 bootstrap 已独立 review PASS；不要求
  页面或 Web menu final handoff。
- A-route-evidence 启动前：A-base-core fixture handoff SHA 可校验，两份 canonical
  route SHA、Web menu/landing/deep-link SHA 与 API projection SHA 均已冻结；仅在
  Party target 已 handoff 时要求 housing tenant alias SHA，否则要求
  canonical Party target/alias evidence。
- Workbench Web 启动前：A-base handoff 与 `A-2.5-contract-closure SHA` 均冻结；
  Party target 与 alias SHA 已纳入最终 evidence。
- 测试 PostgreSQL、API、Web 和浏览器可用，目标环境明确非生产。
- 父任务的 IA/permission manifest、A-base 规格和 stopship 清单已审批。

## Batch A-pre — Ephemeral DB Bootstrap

Owner: `a-bootstrap-owner`

1. 独占 bootstrap source/tests；提取或新增可由 A0 独立调用的 migration harness。
2. 只允许 exact ephemeral container，复用 A-C2 的 exact run-id、双 label、running、
   `docker run --rm`、official PostgreSQL、显式 `POSTGRES_DB`、匿名 volume、拒绝
   DB URL override 与 cleanup residual=0 约束。
3. 执行 `000001`–`000174`，写结构化 `skip-record:000175`，再执行
   `000176`–`000183`；skip record 必须说明 000175 是空库 fail-fast 的生产数据
   补丁且不提供后续所需 schema。
4. 输出 `A-ephemeral-db-bootstrap SHA`、命令、迁移序列、skip record、cleanup 和
   container/volume deletion evidence。
5. 由非实现 checker 独立 review；P0/P1=0 才允许 A0 implementation 启动。

Machine gate A-pre：仅 exact ephemeral target；完整声明序列可复验；异常/中断清理
为零；无 URL override；独立 review PASS。

最终执行记录：独立 checker PASS，`open_P0_P1=[]`；冻结 handoff SHA：
`b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268`。
Reviewer 提出的 4 项 P1 均已修复；owner 自验 7 pass / 0 fail / 1 Windows platform
skip，Linux SIGTERM 1/1，same-run-id 双链 PASS；checker 关键 runtime 复验通过，
最终 residual=0。RISK-A-004 CLOSED；这是 bootstrap Gate 当时的记录，A0 随后已
provisioned/frozen。

## Batch A0 — A-base-core Provision

Owner: `a-profile-owner`

1. 校验 A-schema、API-only projection 与 `A-ephemeral-db-bootstrap SHA`；定义
   profile、role、
   traceability、evidence、cleanup JSON/JSONL schema 和中央 decoder。
2. 实现 `property-remediation-a-base-v1` builder、固定 clock/seed、canonical
   checksum 和 exact rows：
   building=3、floor=3、party=4000、booking=10000、booking_night=20000、
   lease=2000、housing_receivable=10000、charge_plan=2000、turnover=2000、
   handover=1000、purchase=1000、purchase_item=2000、work_order=1000、
   property_occupancy=6500、sys_file=2000；park=3、unit=100，保持 60/30/10。
   occupancy 固定为每 unit 65 条（3900/1950/650）；2,000 sys_file 关联小型有效
   测试 PNG。
3. 增加环境 denylist、专用测试 scope 标记和“无 B 数据/无 B 依赖”断言。
4. 实现 write-ahead manifest、fsync、signal/startup reconcile、幂等清理和 residual scan。
5. 以正常、SIGINT、SIGTERM、创建中崩溃和清理中崩溃验证零残留。
6. 生成包含 contract/schema/generator/profile checksum 和 artifact hashes 的 immutable
   handoff manifest，发布 canonical fixture handoff SHA 给 homestay/housing owner。
7. Support fixture 使用显式最小权限；exception super actor 只作为独立负向主体，
   不进入 support/普通岗位正向集合。
8. 所有生成结果写入 ignored `artifacts/property-remediation/runs/<run-id>/**`；
   `scripts/**` 只保留可提交 runner/profile/schema/tests，不生成或提交 runs。

Machine gate A0: 两次独立创建 checksum 相等；故障注入全部恢复；非测试环境 fail closed；residual=0；fixture handoff SHA 可复验。完成后标记 `A-base-core provisioned` 并释放 owner，不等待页面。

最终执行记录（2026-07-30）：

- source commit：`32ccc02852c3201c6f68e3b6b89e4398cb102a17`；
- final run：`abase20260730final32ccc01`；
- fixture handoff SHA：
  `3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`；
- profile checksum：`68da…107b`（按最终 evidence 中的 canonical 完整值校验）；
- owner gate：21 pass / 0 fail / 6 runtime skip；skip 均有运行时理由，真实双 run 已覆盖
  确定性与 cleanup；
- 两次 run 各生成 journals 10,010 events / 2,002 resources，均完成清理，
  final residual=0；
- independent final review PASS，`open_P0_P1=[]`。

状态冻结为 `A-base-core provisioned / handoff frozen`。这不是
`track_a_technical_passed`；A-2.5 现已解除依赖并成为下一步，homestay/housing Web
继续 blocked，A-route-evidence 继续 awaiting handoff。

## Batch A0.25 — A-2.5 Workbench Contract Closure

在 A-base handoff 后串行执行；shared-contract、homestay-api、housing-api、
schema-migration、asset-party decision owners 交付各自不重叠输入，由独立 checker
汇总。检查 shared 全量 response types、两域 endpoint candidates、7 detail routes、
9 high-risk variants、financial/file-ID 最小投影、GET read permission、无 N+1/
route-local interface/bundle expansion，以及 Party target/acceptance decision。

Machine gate A0.25：`open_P0_P1=[]` 并输出 `A-2.5-contract-closure SHA`。此前
homestay/housing Web implementation 必须为 0；Track B high-risk 保持 unavailable。

## Batch A0.5 — Foundation First-route UI Checkpoint

Shared foundation 的 integration-ready handoff 只校验纯函数/组件静态与单测、
lint/typecheck/build，不创建 preview/生产 route。首个输出 canonical domain route
SHA 的 homestay/housing owner 必须在真实 route 上运行 desktop/mobile/keyboard/
focus/zoom/ARIA；shared owner 修复组件缺陷并签收，QA owner 记录
`A-foundation-first-route-ui` evidence。

该 checkpoint 未通过前不得标记 foundation final UI Gate；它也不替代两份 route
SHA 与 Web 接入完成后的 A-route-evidence。

已接收 integration-ready SHA：
`d2a015f9ba931b2024e6360570697c77b74ea3fb`
（`feat(property): add shared workbench foundation`）。三路 S2 final review PASS，
`open_P0_P1=[]`；14 specs、boundary 5/5、ESLint、workspace typecheck、shared/Web
build 通过。`A-foundation-first-route-ui` 仍 awaiting。

## Batch A1 — A-route-evidence Authorization

Owner: `a-authz-owner`

1. 校验 A-base-core、A-2.5 closure、两份 route、Web 接入与 API projection SHA，
   再从已批准 manifest 生成精确岗位夹具，不手工复制宽权限。
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
4. 执行 axe/键盘/focus 与固定资源下的 5 次性能采样。Candidate threshold 只记录
   观测，不得产生 PASS；只有带 owner/批准人/日期的冻结阈值可用于 Gate。
5. 汇总 summary/evidence、artifact SHA-256、命令/exit/失败日志和 cleanup verdict。

Machine gate A2: 追溯 100%；UX/WCAG 2.2 AA 通过；只有批准并冻结的性能阈值可判
PASS，candidate 状态保持 awaiting approval；artifact 完整且 hash 可验证。

## Integration Gate A3

1. 复验已发布 A0 handoff，在 route/menu/landing/alias/deep-link final handoff 上按
   A1 → A2 完整运行；无需重做未变化的 core，若重做必须得到相同 fixture SHA。
2. 独立 check agent 对 profile 边界、exact-set 双向差集、L0-L6 适用性、证据链和 cleanup 进行只读复核。
3. 记录 changed files、执行命令、结果、跳过项/理由和剩余风险。
4. Gate aggregator 仅在全部 machine gates 通过且 P0/P1=0 时写入 `track_a_technical_passed`。

## Pause, Resume And Dependency Rule

- A0 按 provision/cleanup manifest checkpoint 恢复；A1/A2 按 fixture SHA、route handoff
  SHA 和 test/evidence checkpoint 恢复。
- A-pre 已以
  `b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268`
  独立 review PASS；A0 已基于 source commit
  `32ccc02852c3201c6f68e3b6b89e4398cb102a17` 完成并冻结 fixture handoff
  `3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`。
  若任一输入 SHA 漂移，重新进入相应 provision Gate，不得复用 A-C2 一次性 shell
  继续。
- 页面未完成时，状态是 `A-base-core provisioned / A-route-evidence awaiting_handoff`，
  不是整个任务不能开始。
- 只有 foundation SHA、尚无真实 route 时，状态是
  `foundation handoff ready / final UI gate awaiting first route`，不能通过 preview
  route 改写。
- A0 依赖已冻结的 A-schema/API projection，但不依赖 homestay/housing 或
  A-route-evidence 完成；A-2.5 现只依赖已冻结的 A0 fixture handoff，并已
  unblocked。homestay/housing Web 还必须等待 A-2.5 closure；A-route-evidence
  等待页面 final handoff。禁止把任何下游完成条件反写为 A0 前置。

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

## 8. 2026-07-31 最终执行记录

最终 API full unit 91/91；此前 92 含临时 assets-unit-picker spec，撤销后不再采用。
Web default `tsc`/lint/build 154、独立多轮 Gate 与 DB evidence PASS，
`open_P0_P1=[]`。

唯一未执行的是 Chrome connector `sandboxCwd` 下的真实 desktop/390 visual、
keyboard、zoom/reflow；因此自动化任务保持 `in_progress`，且不得输出 A-2.5
完全 release-ready。
