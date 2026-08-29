# LEA-003 实施计划与续跑记录

## Ordered checklist

- [x] 激活 Trellis 子任务并加载 API/Web/shared/migration 开发规范。
- [x] 亲自读取即将修改的源码和测试，冻结精确 rename map。
- [x] 更新 shared、API 菜单、Web 菜单与 housing 公共页面显示文案；code/route 不变。
- [x] 新增 `000283` forward-only、逐租户、name-only reconcile migration。
- [x] 更新迁移逐租户断言、API/Web 菜单契约、shared 权限显示名回归。
- [x] 运行 targeted tests、shared build、API/Web lint/typecheck/build 及必要的 migration validation。
- [x] 启动隔离测试环境，按成熟基建完成桌面/390px 浏览器检查、截图 manifest 与 Network 核验，并精确 teardown。
- [x] 执行 Trellis quality check，记录结果与残余风险。
- [ ] 提交、push 当前 `codex/fix-lea-003-rename-long-rental`，创建 `Closes #485` PR。
- [ ] review 最多 3 轮；CI 全绿后 squash merge；等待 main CI+Deploy 双绿并确认 Issue 关闭。
- [ ] 更新任务证据、归档 LEA-003，随后严格进入 LEA-004。

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
- 2026-08-29：已补齐任务制品并激活任务；完成 shared/API/Web canonical label、长租中性文案、审计显示名和 `000283` name-only reconcile，稳定 code/route/role binding 均未改。
- 2026-08-29：独立 quality review 指出的 permission 缺行 fail-open、registry cardinality/post-check、运行时旧文案、API surface label 重复源和仅静态 SQL 测试均已修正。
- 2026-08-29：targeted API 23 PASS/1 条 PostgreSQL fixture 因本机无 `DATABASE_URL` 条件跳过；Web menu 12/12、housing 28/28、workspace typecheck PASS。PostgreSQL fixture 将由带数据库的 CI 执行。
- 2026-08-29：隔离 mock API 浏览器检查 3/3 PASS：1440×960、390×844 展开菜单、390×844 无 read 权限边界；均无水平溢出、console error 或 network failure。证据 manifest 暂存于 `/tmp/lea003-20260829-browser-uat/evidence/manifest.json`，服务/浏览器/缓存已精确 teardown。
- 2026-08-29：`pnpm lint`、`pnpm typecheck`、`pnpm build`（190 pages）均 PASS；shared build、API/Web targeted tests 均 PASS；迁移编号仅保留仓库已知重复 `000136`，`000283` 唯一，`git diff --check` PASS。
- 2026-08-29：API 全量首轮 1641 tests：1597 PASS、3 个本次旧显示名断言 FAIL、41 条数据库条件 SKIP；同步断言后定向 8/8 PASS。按上限执行的第 2 轮全量中本次失败均已消失，唯一失败为无关 `code-rule-scope-migration.spec.ts` 文件级偶发启动；该既存测试随后独立 3/3 PASS，未发现稳定回归。本机 PostgreSQL integration 仍因无 `DATABASE_URL` 跳过，交 CI 数据库门禁。
- 2026-08-29：PR #486 / commit `de9df9f9` 已创建并触发 review。CI 首轮在 shared frozen role template hash 门禁失败：复核阶段曾越界修改签名角色/权限包名称但未变更版本与生产 seed。已撤回这些非 LEA-003 目标改动，保留 `sys_permission.name`/菜单/页面/审计展示改名；shared build/test 33/33/lint PASS，待推修复提交。
- 续跑点：提交并 push CI 修复，等待 PR #486 第 1 轮 review 与新 CI；随后按 findings（最多 3 轮）闭环、merge 并等待 main CI+Deploy 双绿。
