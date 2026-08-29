# LEA-003 实施计划与续跑记录

## Ordered checklist

- [x] 激活 Trellis 子任务并加载 API/Web/shared/migration 开发规范。
- [x] 亲自读取即将修改的源码和测试，冻结精确 rename map。
- [x] 更新 shared、API 菜单、Web 菜单与 housing 公共页面显示文案；code/route 不变。
- [x] 新增 `000284` forward-only、逐租户、name-only reconcile migration。
- [x] 更新迁移逐租户断言、API/Web 菜单契约、shared 权限显示名回归。
- [x] 运行 targeted tests、shared build、API/Web lint/typecheck/build 及必要的 migration validation。
- [x] 启动隔离测试环境，按成熟基建完成桌面/390px 浏览器检查、截图 manifest 与 Network 核验，并精确 teardown。
- [x] 执行 Trellis quality check，记录结果与残余风险。
- [x] 提交、push 当前 `codex/fix-lea-003-rename-long-rental`，创建 `Closes #485` PR。
- [x] review 最多 3 轮；CI 全绿后 squash merge；等待 main CI+Deploy 双绿并确认 Issue 关闭。
- [x] 更新任务证据、归档 LEA-003，随后严格进入 LEA-004。

## Validation commands

- `pnpm --filter @jinhu/shared build`
- API 精确菜单/迁移/manifest/granular RBAC 测试（按现有 package test 入口执行）
- `pnpm --filter @jinhu/web run test:unit:menu`
- `pnpm --filter @jinhu/web run test:unit:housing`
- `pnpm --filter @jinhu/api run test:unit`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- migration filename/历史/逐租户 fixture 检查
- 浏览器：desktop + 390px，菜单、标题、权限边界、住宅/办公长租文案与 Network

## Risk and rollback points

- 高风险点：历史 migration 不能改；`sys_permission` 是 tenant-wide；菜单 canonical/fallback/API/Web 必须同步；shared 产物必须从当前 worktree 重建。
- 提交前核对 `git diff --name-only`，不得混入 HR、他人任务或未知脏改动。
- 数据库回滚只允许更高编号 forward-only reconcile，不创建 down migration。

## Progress / resume point

- 2026-08-29：Issue #485 已存在；分支已在 `8dce1137` 基线上创建；rename 触点与逐租户 name-only 方案已调查确认。
- 2026-08-29：已补齐任务制品并激活任务；完成 shared/API/Web canonical label、长租中性文案、审计显示名和 `000284` name-only reconcile，稳定 code/route/role binding 均未改。
- 2026-08-29：独立 quality review 曾要求 permission 缺行 fail closed；后续 production-shaped evidence 证明租户权限目录合法为子集，该假设已在 deploy 热修中纠正。registry cardinality/post-check、运行时旧文案、API surface label 重复源和 SQL 实跑测试仍保留。
- 2026-08-29：targeted API 23 PASS/1 条 PostgreSQL fixture 因本机无 `DATABASE_URL` 条件跳过；Web menu 12/12、housing 28/28、workspace typecheck PASS。PostgreSQL fixture 将由带数据库的 CI 执行。
- 2026-08-29：隔离 mock API 浏览器检查 3/3 PASS：1440×960、390×844 展开菜单、390×844 无 read 权限边界；均无水平溢出、console error 或 network failure。证据 manifest 暂存于 `/tmp/lea003-20260829-browser-uat/evidence/manifest.json`，服务/浏览器/缓存已精确 teardown。
- 2026-08-29：`pnpm lint`、`pnpm typecheck`、`pnpm build`（190 pages）均 PASS；shared build、API/Web targeted tests 均 PASS；当时本地基线仅保留仓库已知重复 `000136`。
- 2026-08-29：API 全量首轮 1641 tests：1597 PASS、3 个本次旧显示名断言 FAIL、41 条数据库条件 SKIP；同步断言后定向 8/8 PASS。按上限执行的第 2 轮全量中本次失败均已消失，唯一失败为无关 `code-rule-scope-migration.spec.ts` 文件级偶发启动；该既存测试随后独立 3/3 PASS，未发现稳定回归。本机 PostgreSQL integration 仍因无 `DATABASE_URL` 跳过，交 CI 数据库门禁。
- 2026-08-29：PR #486 / commit `de9df9f9` 已创建并触发 review。CI 首轮在 shared frozen role template hash 门禁失败：复核阶段曾越界修改签名角色/权限包名称但未变更版本与生产 seed。已撤回这些非 LEA-003 目标改动，保留 `sys_permission.name`/菜单/页面/审计展示改名；shared build/test 33/33/lint PASS，待推修复提交。
- 2026-08-29：修复提交 `7b363250` CI 全绿：verify 13m04s，PostgreSQL Release Smoke 19m05s，migration/failure-retry/seed/bootstrap/login/property E2E/teardown 全部 PASS。
- 2026-08-29：review round 1 共 3 条：签名漂移已由 `7b363250` 解决；补齐 authoritative product/UAT 文档；补齐全部 7 个 housing approval incident title 并新增精确回归。相关 API 14 PASS/1 PostgreSQL 条件 SKIP，repository 既有 10 PASS，lint/diff-check PASS。
- 2026-08-29：round-2 CI Unit tests 揭示远端 main 并发加入 HR `000283`；按 forward-only 唯一编号纪律将本任务迁移改为 `000284`，不触碰 HR migration。待 targeted 编号/迁移测试后推送。
- 2026-08-29：PR #486 已 squash merge 为 `1a0c6ba1`，#485 自动关闭；main Deploy 在 `000284` 发现 production tenant permission subset 并 fail closed，migration 未落库，workflow 已恢复上一版源码、health PASS、Docker cleanup 回收 4.662GB。#485 已重开，热修分支改为只 reconcile 已存在 tenant-code、缺失允许、重复拒绝。
- 2026-08-29：热修 commit `42f4a31e` / PR #487 仅 reconcile 每租户实际存在的 target permission rows；缺失权限不插入、不授权，重复 tenant-code 继续 fail closed。targeted 14 PASS、1 条本机 PostgreSQL 条件 SKIP，lint/diff-check PASS；Codex review 第 1 轮无 finding；PR verify 与 Release Smoke 全绿。
- 2026-08-29：PR #487 squash merge 为 `33679b0b`，#485 CLOSED。main CI `33243494366` SUCCESS；Deploy Production `33243494370` SUCCESS。生产日志确认 `000284` APPLY→SUCCESS、API liveness/readiness、Web 受保护验收和 Docker cleanup started→finished；未执行任何生产直操作。
- 续跑点：LEA-003 已满足双绿与生产形态迁移证据，归档后切换到 LEA-004 Issue/分支实施。
