# PSW-001 Implementation Plan

## Ordered checklist

- [x] 建立受保护 tenant-super 纯判定 helper/常量及对照测试。
- [x] 修改 SQL principal：同租户受保护 binding 独立求值；仅该身份绕过目标 park access link；普通目标角色/权限继续 park-scoped。
- [x] 同步初次登录/内存 authorization 路径，避免登录与 JWT 校验漂移。
- [x] 在 switch-context 增加 tenant-super 跨园区专用审计事件及正反测试。
- [x] 增加自建/他建/未来 park、disabled park、foreign tenant、普通 role、自定义 `*`、菜单/module/API scope 测试。
- [x] 运行 API 定向测试、lint、typecheck、build，并运行隔离 `first-release-context-switch`。
- [x] 使用 `trellis-check` 做全范围质量核验并修复发现。
- [x] 使用 `trellis-update-spec` 将 tenant-super 可执行契约写入 API backend spec。
- [x] 按 Trellis 提交确认流程提交，push 仅 `codex/fix-psw-001-tenant-super`。
- [ ] PR body `Closes #463`；review 最多 3 轮；CI 绿后合并；等待 main 双绿再开始 PSW-002。

## Validation commands

```bash
pnpm --filter @jinhu/api test
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api build
node scripts/e2e/first-release-context-switch.mjs
```

优先先运行受影响的 `node --test`/项目既有定向入口，再运行上述 package gate。E2E 需要隔离 PostgreSQL/API 环境，不使用生产或他人容器。

## Risk and rollback points

- 最高风险是把 literal `*` 或普通 `is_super` 误当 tenant identity；每次 SQL/helper 改动先跑 negative matrix。
- 第二风险是 access bypass 扩到 foreign tenant/disabled park；目标 park 与 tenant EXISTS 必须保留。
- 第三风险是 login/JWT 两条解析链不一致；必须以同一 helper 和镜像测试约束。
- 审计写入不得位于 refresh CAS 前，也不得因 best-effort 失败破坏 token rotation。
- 无迁移；若发现需要新增持久化授权源，停止实现并回 Phase 1 更新设计。

## Progress / resume point

- 2026-08-29：Issue #463、父/子 Trellis 任务和分支已创建；四路只读探索完成；规划工件已落盘。下一步：审阅工件、启动 task，然后从受保护身份 helper 与 principal SQL 测试开始。
- 2026-08-29：实现与 API gates 完成；全量单测 1575 pass / 40 skip / 0 fail。首次隔离 E2E 已证明 tenant-super 未来园区选择、切换、目标 principal 与审计均 PASS，随后在既有 building fixture 因随机 code 含小写被 DTO 400 阻断；环境完整 teardown。已将 fixture code 规范化为大写，下一步执行同题第二次且最后一次隔离复测。
- 2026-08-29：第二次隔离 E2E 全 PASS，包含目标资产写读、回切隔离与精确 fixture cleanup；compose containers/network/volumes 全部 teardown。剩余：提交确认、push、PR/review/CI/merge/main 双绿。
- 2026-08-29：用户已按既定两提交方案确认 `ok`；提交前复核 `git diff --check` 通过，准备依次提交 API 修复/spec 与 Trellis 队列工件，然后仅 push `codex/fix-psw-001-tenant-super`。
- 2026-08-29：PR #466 第 1 轮 Codex review 返回 2 个 P2：ORM tenant binding 完整性与 JWT 热路径重复 tenant-super lookup。已用共享 binding predicate 强制 link/role/user tenant 对齐，并用 materialized principal CTE 单次求值复用；定向测试第 2 次实际执行 20 项，19 pass，唯一失败为 SQL 入口别名契约已随 CTE 从 `usr` 改为 `candidate`，现已同步断言，后续以标准 API 全量门禁验证。
- 2026-08-29：第 1 轮 findings 修复后标准 API 全量单测 1616 tests / 1576 pass / 40 skip / 0 fail；API typecheck、build、受影响 ESLint、`git diff --check` 均通过。下一步提交并 push review fix，触发第 2 轮 Codex review。
