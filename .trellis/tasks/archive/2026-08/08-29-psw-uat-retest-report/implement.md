# PSW UAT 复测执行计划

## Ordered checklist

- [x] P0：记录 `origin/main` SHA、RUN_ID、独占端口/compose/project/profile/evidence root；冻结执行前容器和端口快照。
- [x] P1：完成设计-实现闭环审计表与 S1/S2/S3、G1–G7 流程/Case 矩阵。
- [x] P2：在 local-only evidence root 编写并亲自审阅专用 compose、fixture、raw CDP 和 teardown runner；结果不得包含秘密。
- [x] P3：启动独占 PostgreSQL/API，执行 migrate、production seed、bootstrap、strict baseline；启动本轮 Web 与专用 Windows Chrome，证明 origin/API/DB 链路归属。
- [x] P4：通过产品 API 创建 Park B、Park C、普通角色、用户与资产；输出唯一 `fixture-results.json`。
- [x] P5：执行 S1a/S1b，断言 super 身份、wildcard、菜单/业务能力与 `tenant_super_context_activated` 审计。
- [x] P6：执行 D5 pre-check 与 S2：access-only 专用空态、返回 A、desktop/窄窗口、显式 target-park 配角、重新切 B 正常；执行 D5 post-check。
- [x] P7：执行 S3/G6：双园区不同普通角色，单一目标 Park B ID，`/users/me`、Sidebar、route、statistics/buildings 与数据排除全部收敛。
- [x] P8：按固定顺序执行 G1–G5/G7 当前门禁与 workspace quality gates；保存 accepted logs/results。
- [x] P9：形成报告，更新调查 S1–S3 和 §15 G6 authority；执行证据敏感信息扫描、SHA256 manifest。
- [x] P10：真实 UI logout，Chrome about:blank；按 PID/fd、project label、精确文件根完成 teardown/residual 清零，删除专用 profile/env。
- [x] P11：运行 Trellis check、diff check 与文档一致性检查；全 PASS 后归档 PSW-001/002/003、UAT 子任务和父队列。
- [ ] P12：提交/推送 evidence 分支，开报告 PR；最多三轮 review，关闭发现；PR CI 绿后 squash merge。
- [ ] P13：确认 main CI 与 Deploy 双绿，核对健康检查和 production Docker cleanup；写最终终报。

## Validation commands

```bash
pnpm --filter @jinhu/api exec node --test --require ts-node/register \
  src/modules/users/users.service.property-menu.spec.ts \
  src/modules/saas-modules/saas-modules.property-dependency.spec.ts \
  src/modules/homestay/homestay.controller.spec.ts \
  src/modules/homestay/homestay-scope-matrix.spec.ts \
  src/modules/property-approvals/property-approval.decision.spec.ts \
  src/modules/property-approvals/property-approval.execution.spec.ts \
  src/modules/field-policies/field-policy.service.spec.ts \
  src/modules/files/file-business-access.service.spec.ts \
  src/modules/housing/housing-projection-access.spec.ts
pnpm --filter @jinhu/web test:unit:menu
pnpm --filter @jinhu/web test:unit:auth-routing
TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' \
  pnpm --filter @jinhu/web exec node --test --require ts-node/register lib/permissions.spec.ts
pnpm test:e2e:property-api
pnpm test:e2e:homestay-api
pnpm test:e2e:housing-rental-api
pnpm test:e2e:property-api-gate-contract
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
git diff --check
```

隔离初始化、浏览器 Case、D5、residual 与 teardown 命令以本轮 evidence root 内 accepted logs 为准，并在报告中列出，不把敏感命令参数复制入库。

## Risky points and rollback points

- 不复用历史 compose project、volume、端口、Chrome profile 或 token；任一归属不明立即停止。
- 不直接写业务表造 fixture；只读 DB 查询仅用于辅助断言和 residual 计数。
- `SUPER_ADMIN` 等受保护角色不经普通 target-park 配角 API；S2/S3 只分配产品 API 创建的普通角色。
- 每个浏览器 runner 只能读取 manifest 中的目标 Park B，出现 ID 不一致立即 BLOCKED。
- G7 前必须确认 G2/module runtime 已恢复；出现 partial/inconsistent 只允许销毁本轮独占 lifecycle 后重建一次。
- teardown 前逐一验证 PID 命令/fd、compose label、profile 和文件根；不使用模糊匹配或宽删除。

## Resume log

- 2026-08-29：PSW-001/002/003+D5 已全部合入且 main 双绿；创建并关联本 UAT 子任务与 `codex/evidence-psw-uat-retest`。
- 2026-08-29：完成历史报告、Windows Chrome SOP、调查报告与 API/harness 探索；确认旧 G6 双 ID 必须由本轮 A→B 单一目标 ID 动态证据替代。
- 2026-08-29：S1a/S1b/S2/S3、D5、G1–G7 全部完成；target Park B `23587739`；390×844 无横溢；官方 G7 Homestay/Housing PASS；project teardown 资源全 0。
- 2026-08-29：Trellis validate 与 diff/document consistency PASS；进入队列归档。
- Next：提交报告 PR，然后完成 review/CI/merge/main 双绿。
