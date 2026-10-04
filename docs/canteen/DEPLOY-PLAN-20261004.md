# canteen 模块安全推送与部署方案（2026-10-04）

> 分支：`codex/canteen-module-20261002`（HEAD=`50f25b028` + 待提交项）
> 目标：把 canteen 模块（含 RBAC 开通）安全推送并部署到生产，三端 commit 对齐、CI/CD 全绿、生产真生效。
> 本文档为执行方案；每步执行前均须用户确认，尤其涉及生产部署的动作。

---

## 1. 现状盘点（已核实）

| 项 | 状态 |
|---|---|
| 本地验收 | API UAT 27/27 连跑两遍全绿；typecheck/build 全绿；浏览器 E2E 全路径 + 修复复验通过；RBAC 权限矩阵 9 项 + 浏览器 2 视角验证通过 |
| 分支 | `codex/canteen-module-20261002`，未推送（远端无此分支）；相对 `origin/main`：**落后 15**（HR #807-#819）、**领先 34** |
| 本地 main | 落后 origin/main 49（保持阻塞，不动） |
| 未提交 | `docs/canteen/selfcheck/uat-pos-after-next.png`（中间产物，**不提交**）；`rbac-cashier-pos.png`、`rbac-contractor-dashboard.png`（验收截图，应提交）；`database/migrations/000329_canteen_rbac_roles.sql`（新建，幂等已验证） |
| 部署管线 | `.github/workflows/deploy-production.yml`：**push main** 触发（+workflow_dispatch）；classify（按 changed files 定 mode）→ verify（按 mode 全量检查）→ deploy（SSH+rsync 直连生产，读取 `.release.json` 旧 commit 作回滚锚点，`db-migrate.sh` 执行迁移） |
| CI | `ci.yml`：push 任意分支触发（不部署） |
| 合并冲突预检 | `git merge-tree`：canteen 文件无冲突；落后 15 个 HR commit 与分支内早期 merge 的 HR 内容在 **HR 测试文件**（yuzhou 档案回滚 spec）有交集，需在合并时解决 |

## 2. 推送前置补齐（必须完成，否则"推送≠完成"）

1. **RBAC 迁移 `000329_canteen_rbac_roles.sql`**（已生成、本地重放幂等验证 5 角色/76 绑定不变）：
   - 内容：5 个业务角色 + 76 条角色-权限绑定，幂等（NOT EXISTS），无用户账号、无 bundle 表写入；
   - 目的：生产库经 `db-migrate.sh` 自动补齐角色/权限（否则生产只有 SUPER_ADMIN/AUDITOR，与本地验收不一致）。
2. **生产用户账号策略**：账号不写死进迁移（避免验收密码入生产）。生产创建 `xu_shuwei`/收银员/财务账号由管理员在系统用户管理界面创建后，按 `rel_user_role` 分配（或部署后运维执行建号 SQL 模板，密码甲方设置）。
3. **提交清单**：`000329` 迁移 + `rbac-*.png` 2 张截图 commit；`uat-pos-after-next.png` 保留本地不提交（如需清理另行请示，遵守回收站规则）。

## 3. 同步策略（解决落后 15）

- 合并前先在 feature 分支执行 `git merge origin/main`（**不 push**），解决 HR 测试文件冲突（预计 1-2 个文件）；
- 合并后**重新本地验收**：typecheck + build + API UAT 复跑 +（视改动面）浏览器冒烟；
- 若用户希望最小风险：可先只 push feature 分支（触发 CI 检查，不部署），CI 全绿后再走 PR 合并。

## 4. 推送路径（三选一，推荐 B）

| 路径 | 动作 | 后果 | 适用 |
|---|---|---|---|
| **A. 只推分支** | `git push origin codex/canteen-module-20261002` | 远端备份 + CI 跑（**不部署**） | 先做，建立远端基线 |
| **B. 推分支 + PR 合并 main（推荐）** | A + `gh pr create` → 审阅 → merge main | merge main 即触发 deploy-production 自动部署 | 标准流程，main 历史一致（全为 PR merge） |
| C. 本地合并直推 main | 本地 main merge feature → push main | 立即触发部署；绕过 PR 审阅，main 历史不一致 | 不推荐 |

> 注意：**push main 即触发生产部署，无审批人**。无论哪条路径，执行 push main 前必须经用户明确指令。

## 5. 部署执行（push main 后自动）

1. `classify`：resolve-production-deploy-scope 按 changed files 判定 mode（含 canteen → 大概率 `full`，全量检查）；
2. `verify`：pnpm install --frozen-lockfile → 契约校验（production-deploy-* contracts、migration-prerequisite-contract）→ 按 mode 全量 typecheck/lint/test/build；
3. `deploy`：SSH 直连生产 → 记录 previous_commit（回滚锚点）→ rsync 同步 → `db-migrate.sh` 执行迁移（含 **000329**，幂等）→ 重启 API/Web → 回验（probe/observation）；
4. 部署失败自动回滚（previous_commit）。

## 6. 部署后回验清单（用户部署完成标准，逐项核验）

- [ ] `git rev-list origin/main..HEAD` 为 0；生产 `.release.json` commit = 推送 SHA（三端 commit 对齐）；
- [ ] GitHub Actions：deploy-production 全部 job 绿；失败邮件清零；
- [ ] 生产 API/Web 健康：登录 admin → canteen 页面可达；
- [ ] 生产库核对：`sys_role` 5 个 CANTEEN_* 角色、`rel_role_perm` 76 条绑定（与本地一致）；
- [ ] 生产页面回验：POS 收款闭环 + 承包方/财务账号登录权限过滤（页面/接口）；
- [ ] 进程重启 + 新 dist 已生效（verify-deploy 输出）。

## 7. 风险与管控

| 风险 | 管控 |
|---|---|
| 生产库迁移执行失败 | db-migrate 迁移幂等（000329 NOT EXISTS）；部署自动回滚；迁移前备份（production-backup-restore-gate） |
| HR 落后 15 合并冲突 | 预检已定位（HR 测试文件），合并时逐一解决并复验 |
| push main 误触发部署 | 推送 main 前必须用户明确指令（铁律）；先 A 路径建远端基线 |
| 生产用户密码 | 账号不进迁移，生产由管理员创建并设置密码，杜绝验收密码入生产 |
| 数据删除 | 全程无删除操作；中间产物保留本地；如需清理按铁律送回收站 |

## 8. 执行步骤（每步确认点）

| 步骤 | 动作 | 用户确认点 |
|---|---|---|
| 1 | commit：000329 + rbac 截图 | 确认提交清单（含不提交 uat-pos-after-next.png） |
| 2 | merge origin/main 到 feature + 解决冲突 + 重新本地验收 | 确认执行同步 |
| 3 | `git push origin codex/canteen-module-20261002`（路径 A） | 确认推送分支（不部署） |
| 4 | CI 全绿确认 | 等待 CI 结果 |
| 5 | `gh pr create` → 审阅 → **merge main** | **明确指令**后方可 merge/push main |
| 6 | 部署回验清单逐项核验 | 部署完成后核对 |
| 7 | 生产账号创建/分配（管理员界面） | 提供生产账号名单与密码策略 |

---

*方案依据：`.github/workflows/deploy-production.yml`、`ci.yml`、`scripts/db-migrate.sh`、`database/migrations/000329_canteen_rbac_roles.sql`（已生成并本地验证幂等）。*
