# Implementation Progress

## Plan

- [x] 创建 Issue #661、分支与 Trellis 任务。
- [x] 对照 PMA-008/009/010/014 复核最新 main，识别已有覆盖与真实缺口。
- [x] 收紧 operating-space candidates actor/data scope 并补 fixture。
- [x] 统一 homestay hard dependency module gate 与 UUID path pipe/测试矩阵。
- [x] 添加 deleteUnit active projection 事务防线和测试。
- [x] 记录显式解绑契约与 M-01 边界。
- [ ] 本地验证、最多三轮 review、PR CI/Smoke、合并、main 双绿、归档。

## Evidence Log

- 2026-09-06：从 `origin/main@f09783b9` 创建 `codex/fix-pma-s02`；Issue #661。
- 2026-09-06：最新 main 的 `homestay.controller.spec.ts` 已覆盖部分 GET module/UUID 契约，但 audit 所列写 endpoint 裸 UUID 与全 endpoint hard dependency 尚未闭合；不重复已有覆盖。
- 2026-09-06：`AssetsController.operatingSpaceCandidates` 仍未注入 actor，`AssetsService.deleteUnit` 仍直接软删且不检查 active `biz_unit` 投影。
- 2026-09-06：首次误跑不存在的 API `test` script 返回 0，未计作测试证据；随后真实全量 `test:unit` dot reporter 出现 X 且因遍历环境型 spec 长时间不终态，主动停止并改用本次定向详细 reporter。
- 2026-09-06：定向测试首次揭示 3 个测试自身问题（controller 前缀断言、fake builder thenable、方法名错误）及解绑分支断言形态错误；修正后 assets controller/mapping + homestay controller 共 19/19 PASS。
- 2026-09-06：`pnpm --filter @jinhu/api lint`、API typecheck、workspace `pnpm typecheck`、API build、`git diff --check` 全部 PASS。
- 2026-09-06：核对 `UnitEntity` 与现有 service 后确认 active 持久值为 smallint `status=1`，已避免错误使用展示字符串 `enabled`。删除与 convertUnit 锁同一 source row，不留检查后新增 active 投影窗口；零 migration/seed。

## Risks

- data scope 组合语义必须复用现有服务，禁止自造弱化过滤。
- 删除检查必须与源记录锁在同一事务，避免检查后竞争窗口。
- `status=1 AND is_deleted=false` 是本轮 active 投影最小定义；更完整业务停用/解绑归 M-01。
