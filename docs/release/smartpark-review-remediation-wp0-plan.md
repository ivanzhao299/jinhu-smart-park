# SmartPark WP0 首发回归入口恢复工作计划

生成日期：2026-06-16

任务类型：文档更新。

建议执行分支：`fix/first-release-menu-contract`

## 1. 目的

本文制定 WP0 的详细执行计划，不实施代码修改。WP0 对应整改总计划中的 R1，优先级为 P0。

WP0 目标是恢复首发菜单 / 路由 / 权限 / 回归脚本 contract，使：

- `node scripts/e2e/first-release-menu-whitelist.mjs` 通过。
- `node scripts/e2e/first-release-regression.mjs` 不再因菜单 contract 缺失在第一步失败。
- 首发菜单 contract、API 权限码、模块授权、前端菜单 / 按钮权限、E2E 白名单、production seed 授权范围保持同源或有明确同步机制，避免后续 WP4 权限治理再次漂移。

## 2. 背景

整改计划已识别 R1 为 P0：首发回归入口不可用。

当前背景是 `first-release-regression` 的第一脚本 `scripts/e2e/first-release-menu-whitelist.mjs` 依赖 `apps/web/lib/menu.ts` 中的 `FIRST_RELEASE_MENU_PATHS`、`FIRST_RELEASE_MENU_PATH_SET` 和 `filterFirstReleaseMenus(mergedMenus)` contract。整改总计划记录当前失败点为 `FIRST_RELEASE_MENU_PATHS` 缺失，导致统一回归入口在第一步失败，后续认证、幂等、文件、用户资产、工单、租赁脚本无法作为完整回归链路继续执行。

本计划仅描述后续 WP0 如何执行。本文档本身不代表已修复、不代表已执行测试、不代表回归已经通过。

## 3. 输入依据

| 文档 / 文件 | 用途 |
|---|---|
| `docs/release/smartpark-review-remediation-plan.md` | WP0 来源、R1/P0 定级、短期整改顺序和工作包边界 |
| `docs/testing/first-release-regression-plan.md` | 首发回归脚本设计、统一 runner 顺序和菜单白名单回归目标 |
| `scripts/e2e/first-release-menu-whitelist.mjs` | 当前菜单 contract 静态断言入口 |
| `scripts/e2e/first-release-regression.mjs` | 当前统一回归入口和第一步失败位置 |
| `apps/web/lib/menu.ts` | 前端菜单定义、后端菜单合并逻辑、当前 contract 漂移点 |
| `docs/deployment/production.md`、`docs/release/safety-module-production-release-record.md` | 首发菜单范围和安全模块开放口径的发布文档依据 |

## 4. WP0 四阶段计划

### 4.1 计划阶段

目标是确认 R1 的失败边界、首发菜单 contract 的权威来源、拟修改文件范围和验证口径。计划阶段只做只读预检和方案选择，不修改业务代码、不运行有副作用命令、不声称已修复。

计划阶段必须产出：

- R1 现状确认：`first-release-regression` 因 `FIRST_RELEASE_MENU_PATHS` 缺失在 `first-release-menu-whitelist.mjs` 第一步失败。
- 首发菜单 contract 推荐方案：优先恢复 `apps/web/lib/menu.ts` 中的 `FIRST_RELEASE_MENU_PATHS`、`FIRST_RELEASE_MENU_PATH_SET` 和 `filterFirstReleaseMenus`。
- WP0 与 WP4 同源要求：首发菜单 contract、API 权限码、模块授权、前端菜单 / 按钮权限、E2E 白名单、production seed 授权范围需保持同源或同步机制。
- 需要用户确认后才执行的有副作用命令清单。

### 4.2 实现阶段

目标是恢复首发菜单、路由、权限、回归脚本 contract，使 `first-release-menu-whitelist.mjs` 可验证同一首发菜单来源，并使 `first-release-regression.mjs` 不再因菜单 contract 缺失失败。

实现阶段应遵守：

- 先恢复或重建首发菜单 contract，再确认脚本读取方式。
- 优先让前端菜单过滤和静态脚本读取同一来源，避免复制两份路径清单。
- 只在必要时调整菜单白名单脚本的 contract 读取逻辑，不修改其它 E2E 业务脚本。
- 同步测试 / 发布文档中关于首发菜单 contract 的说明。

### 4.3 验证阶段

目标是先完成无副作用验证，再在用户确认 API/DB 和测试数据影响后考虑完整 regression。

验证阶段分为：

- 无副作用验证：`node scripts/e2e/first-release-menu-whitelist.mjs`、`pnpm --filter @jinhu/web typecheck`、`pnpm typecheck`、必要时 `pnpm lint`。
- 有副作用验证：`node scripts/e2e/first-release-regression.mjs`。完整 regression 依赖 API/DB，可能写业务测试数据，执行前必须确认环境和数据影响。

### 4.4 风险与回滚阶段

目标是避免为通过脚本而削弱真实菜单过滤、权限边界或发布口径。若发现首发菜单 contract 与发布范围、权限 seed 或 WP4 权限治理目标冲突，应停止扩大修改，回到计划阶段重新确认来源和边界。

回滚原则：

- 菜单 contract 修复失败时，回退 WP0 代码变更后重新确认断裂点。
- 非首发路径被暴露时，优先从首发 contract 移除路径并补充 forbidden 断言。
- 完整 regression 写入测试数据后的环境清理不得通过修改 migration / seed / baseline 解决。

## 5. 范围与边界

本计划阶段只新增本文档。

### 5.1 拟修改文件范围

后续 WP0 实现阶段允许拟修改的文件范围应限制在：

| 范围 | 目的 |
|---|---|
| `apps/web/lib/menu.ts` | 恢复或重建首发菜单 contract，确保菜单过滤入口可被前端和静态回归共同使用 |
| `scripts/e2e/first-release-menu-whitelist.mjs` | 如选择新 contract，更新静态断言读取方式，避免依赖脆弱字符串 |
| `docs/testing/first-release-regression-plan.md` | 同步首发菜单 contract 和回归设计说明 |
| `docs/deployment/production.md` | 同步生产首发菜单范围说明 |
| `docs/release/safety-module-production-release-record.md` 或相邻 release 记录 | 同步安全模块首发菜单开放 / 回滚口径 |

### 5.2 禁止修改范围

后续 WP0 实现阶段不应修改：

- 业务服务、controller、entity、DTO 或页面业务逻辑，除非只是 `apps/web/lib/menu.ts` 的首发菜单 contract 恢复。
- CI workflow。
- Dockerfile、compose 文件。
- migration、seed、数据库脚本。
- E2E 业务脚本，除 `scripts/e2e/first-release-menu-whitelist.mjs` 的 contract 读取方式外。
- `scripts/e2e/snapshots/**` 或任何 snapshot baseline。
- `package.json`、`pnpm-lock.yaml` 或其它依赖锁文件。

## 6. 只读预检命令

以下命令只用于确认现状，不应写文件、不应启动服务、不应连接数据库：

```bash
git status --short
git branch --show-current
rg -n "FIRST_RELEASE_MENU_PATHS|FIRST_RELEASE_MENU_PATH_SET|filterFirstReleaseMenus|first-release-menu-whitelist" apps packages scripts docs
sed -n '1,140p' scripts/e2e/first-release-menu-whitelist.mjs
sed -n '1,120p' scripts/e2e/first-release-regression.mjs
sed -n '1,360p' apps/web/lib/menu.ts
sed -n '1,180p' docs/deployment/production.md
sed -n '1,160p' docs/release/safety-module-production-release-record.md
```

预检产出应记录：

- 当前分支和工作区是否干净。
- `FIRST_RELEASE_MENU_PATHS` / `FIRST_RELEASE_MENU_PATH_SET` / `filterFirstReleaseMenus` 是否存在。
- 菜单白名单脚本当前断言依赖的是字符串 contract 还是可导入 contract。
- 当前首发允许路径和禁止路径清单是否与发布文档一致。

## 7. WP0 与 WP4 的依赖关系

WP0 只恢复首发回归入口，但不能把首发菜单当作孤立前端白名单处理。WP4 后续会治理权限、模块授权、数据范围和字段权限，因此两者必须共享同一 contract 或具备强同步机制。

必须保持同步的对象：

| 对象 | WP0 关注点 | WP4 依赖点 |
|---|---|---|
| 首发菜单 contract | 哪些 `href` 可见，哪些二期路径隐藏 | 菜单可见性不能绕过模块授权和权限判断 |
| API 权限码 | 菜单节点使用的 `permission` 是否存在且语义正确 | controller `RequirePermissions`、权限 seed 和共享常量一致 |
| 模块授权 | 菜单节点 `module` 是否处于首发授权范围 | API `RequireModule` / tenant module baseline 不应漏放或错放 |
| 前端菜单 / 按钮权限 | 菜单过滤后页面按钮仍按权限控制 | WP4 的字段、按钮和动作权限不能被菜单白名单掩盖 |
| E2E 白名单 | 静态脚本锁定首发路径和禁止路径 | 权限矩阵回归应复用同一首发范围 |
| production seed 授权范围 | production-safe seed 授予的模块和权限范围 | WP4 需验证 seed、权限、模块和菜单同源 |

WP0 完成后，应给 WP4 留下明确结论：首发菜单 contract 的唯一来源、同步责任、以及新增首发路径时必须同时检查的 API 权限码、模块授权、E2E 白名单和 production seed 授权范围。

## 8. 执行步骤

### 步骤 1：确认 R1 现状和 contract 断裂点

| 项目 | 内容 |
|---|---|
| 目的 | 确认 WP0 只处理 R1，不混入 R2-R12；明确当前失败是菜单 contract 缺失而非业务接口失败 |
| 输入 | `docs/release/smartpark-review-remediation-plan.md`、`scripts/e2e/first-release-menu-whitelist.mjs`、`apps/web/lib/menu.ts` |
| 操作 | 执行第 6 节只读预检；记录 `first-release-menu-whitelist` 对 `FIRST_RELEASE_MENU_PATHS` 的依赖；确认 `first-release-regression` 第一项就是菜单白名单脚本 |
| 产出 | 一段实现前说明，列出当前缺失 contract、第一步失败脚本、后续脚本未被证明失败或通过 |
| 验收标准 | 能明确复述：R1 为 P0，统一回归入口当前因 `FIRST_RELEASE_MENU_PATHS` 缺失在第一步失败 |

### 步骤 2：确定首发菜单 contract 的唯一来源

| 项目 | 内容 |
|---|---|
| 目的 | 避免前端菜单、脚本白名单、发布文档各自维护不同路径清单 |
| 输入 | `apps/web/lib/menu.ts`、`docs/deployment/production.md`、`docs/release/safety-module-production-release-record.md`、`docs/testing/first-release-regression-plan.md` |
| 操作 | 在实现前选择方案：A. 恢复 `apps/web/lib/menu.ts` 导出的 `FIRST_RELEASE_MENU_PATHS` / set / filter；B. 新增独立共享 contract 文件并让前端和脚本共同读取。WP0 推荐方案 A，因为改动面更小，且现有脚本和发布记录已指向 `apps/web/lib/menu.ts` |
| 产出 | 方案选择记录和拟修改文件列表 |
| 验收标准 | 只能存在一个首发路径权威来源；脚本断言和前端过滤读取同一来源或同一生成结果 |

### 步骤 3：恢复前端菜单过滤 contract

| 项目 | 内容 |
|---|---|
| 目的 | 让首发菜单范围重新被前端菜单入口稳定执行，并满足静态回归脚本的 contract |
| 输入 | 步骤 2 的方案选择、当前 `dashboardMenus` 和 `getDashboardMenus(userMenus)` 合并逻辑 |
| 操作 | 若采用推荐方案 A：在 `apps/web/lib/menu.ts` 恢复 `FIRST_RELEASE_MENU_PATHS`、`FIRST_RELEASE_MENU_PATH_SET`、`filterFirstReleaseMenus`；确保 `getDashboardMenus` 对合并后的菜单执行首发过滤；保留非首发菜单定义供过滤和后续二期开放使用 |
| 产出 | `apps/web/lib/menu.ts` 中可复用、可测试、可被脚本静态检查的首发菜单 contract |
| 验收标准 | `FIRST_RELEASE_MENU_PATHS` 包含首发允许路径；禁止路径仍保留在菜单定义但不会进入首发可见菜单；`filterFirstReleaseMenus(mergedMenus)` 或等价调用存在且清晰 |

### 步骤 4：对齐菜单白名单脚本断言

| 项目 | 内容 |
|---|---|
| 目的 | 让 `first-release-menu-whitelist` 不再因 contract 缺失失败，同时继续锁定首发允许 / 禁止路径 |
| 输入 | `scripts/e2e/first-release-menu-whitelist.mjs`、步骤 3 的 contract |
| 操作 | 若步骤 3 恢复旧 contract，尽量不改脚本；若采用新 contract，脚本应读取新 contract 并断言允许路径、禁止路径、过滤函数入口和非首发菜单定义仍存在 |
| 产出 | 静态菜单白名单回归脚本与前端 contract 一致 |
| 验收标准 | 脚本仍覆盖 required paths、forbidden paths、非首发菜单保留、首发过滤入口存在；不能通过删除非首发菜单定义来让脚本通过 |

### 步骤 5：同步发布和测试文档

| 项目 | 内容 |
|---|---|
| 目的 | 防止发布文档、测试文档和代码 contract 再次漂移 |
| 输入 | `docs/testing/first-release-regression-plan.md`、`docs/deployment/production.md`、`docs/release/safety-module-production-release-record.md` 或相邻 release 记录 |
| 操作 | 更新首发菜单 contract 来源说明；列出新增或确认的首发路径；保留二期禁止路径；明确新增首发路径时必须同步菜单 contract、脚本白名单、API 权限码、模块授权、production seed 授权范围 |
| 产出 | 文档与 WP0 实现一致 |
| 验收标准 | 文档不再指向不存在的 contract；文档没有声称完整 regression 已通过，除非验证阶段真实执行并记录结果 |

### 步骤 6：运行无副作用验证

| 项目 | 内容 |
|---|---|
| 目的 | 先验证静态 contract 和基础构建质量，不触碰 API/DB |
| 输入 | WP0 代码和文档变更 |
| 操作 | 执行 `node scripts/e2e/first-release-menu-whitelist.mjs`、`pnpm --filter @jinhu/web typecheck`、`pnpm typecheck`、必要时执行 `pnpm lint` |
| 产出 | 静态验证结果 |
| 验收标准 | 菜单白名单脚本通过；TypeScript 类型检查通过；如 lint 被执行则应通过或记录与 WP0 无关的既有失败 |

### 步骤 7：经用户确认后运行完整首发回归

| 项目 | 内容 |
|---|---|
| 目的 | 验证统一 runner 不再因菜单 contract 缺失在第一步失败，并尽量覆盖首发业务主链 |
| 输入 | 可用 API 服务、测试数据库、管理员账号、必要环境变量 |
| 操作 | 在用户确认环境和数据影响后执行 `node scripts/e2e/first-release-regression.mjs` |
| 产出 | 完整 regression 运行记录 |
| 验收标准 | 至少证明 runner 不再在 `first-release-menu-whitelist.mjs` 失败；若后续业务脚本失败，需要按真实失败归类到对应工作包，不能把后续 API/DB 失败包装成 WP0 菜单失败 |

## 9. 验收命令

建议按顺序执行：

```bash
node scripts/e2e/first-release-menu-whitelist.mjs
pnpm --filter @jinhu/web typecheck
pnpm typecheck
pnpm lint
```

需要 API/DB 环境、并可能写业务测试数据的命令：

```bash
node scripts/e2e/first-release-regression.mjs
```

完整 regression 依赖 API/DB，可能通过用户、文件、工单、租赁等 E2E 脚本写入业务测试数据。执行前必须确认：

- 当前连接的不是生产库或不可污染库。
- `API_BASE_URL`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`DEFAULT_TENANT_ID`、`DEFAULT_PARK_ID` 等环境变量指向允许回归的环境。
- 回归写入数据有清理策略或可接受的数据污染边界。
- 失败日志中不输出真实密码、token 或生产敏感信息。

## 10. 需要用户确认后才执行的有副作用命令

以下命令不得在未确认目标环境和数据影响前执行：

```bash
node scripts/e2e/first-release-regression.mjs
node scripts/e2e/first-release-auth-health.mjs
node scripts/e2e/first-release-idempotency.mjs
node scripts/e2e/first-release-files.mjs
node scripts/e2e/first-release-users-assets.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-leasing.mjs
pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
pnpm db:bootstrap:admin
pnpm db:check:init
docker compose -f infra/docker/docker-compose.prod.yml up -d api
bash scripts/verify-api-login-dockerexec.sh
```

WP0 实现通常不需要执行 migration、seed、bootstrap、Docker 或 API login smoke。这些命令列在这里是为了明确边界：如为排查完整 regression 环境而需要执行，必须先取得用户确认。

## 11. 风险与回滚

| 风险 | 影响 | 缓解 | 回滚 |
|---|---|---|---|
| 只恢复脚本期望但未恢复真实前端过滤 | 脚本通过但 Web 菜单仍暴露二期模块 | 验证 `getDashboardMenus` 对合并菜单执行过滤；必要时增加人工浏览器检查 | 回退 `apps/web/lib/menu.ts` 的 WP0 commit |
| 首发路径清单与发布文档不一致 | 发布验收和自动化回归口径冲突 | 文档同步作为 WP0 DoD；PR 中列出允许 / 禁止路径差异 | 回退文档变更或路径清单，重新确认发布口径 |
| 禁止路径被误加入白名单 | 二期模块提前开放 | `first-release-menu-whitelist` 必须保留 forbidden paths 断言 | 从 contract 移除误加路径并补充断言 |
| 通过删除非首发菜单定义绕过过滤 | 二期菜单定义丢失，后续开放成本增加 | 脚本继续断言非首发菜单定义存在 | 恢复被删除的菜单定义 |
| 完整 regression 后续脚本失败 | WP0 菜单修复被误判失败 | 将菜单脚本通过和后续 API/DB 失败分开记录 | 不回滚 WP0；把后续失败归入对应工作包 |
| WP0 与 WP4 权限 contract 不同源 | 后续权限治理再次漂移 | 在 WP0 PR 描述和文档中明确同步机制 | WP4 前冻结新增首发路径，先补同源 contract |

回滚策略：

1. 若菜单白名单脚本仍因 contract 失败，回退 WP0 代码变更，重新执行步骤 1-4。
2. 若 Web 菜单暴露非首发路径，立即从首发 contract 移除相关路径并补充 forbidden 断言。
3. 若完整 regression 写入测试数据后失败，优先使用既有清理脚本或环境重置策略，不通过修改 production seed / migration 纠正测试污染。
4. 若发布文档与实际 contract 冲突，以发布负责人确认的首发范围为准，再同步代码和脚本。

## 12. PR 描述模板

```markdown
## Summary

- Restore WP0 first-release menu contract for R1/P0.
- Ensure `first-release-menu-whitelist` reads the same first-release menu source as the Web menu filtering path.
- Sync release/testing docs for the first-release menu contract.

## Scope

- Risk: R1, P0.
- Branch: `fix/first-release-menu-contract`.
- In scope:
  - `apps/web/lib/menu.ts`
  - `scripts/e2e/first-release-menu-whitelist.mjs` if the script contract changes
  - related release/testing docs
- Out of scope:
  - business API behavior
  - CI
  - Docker
  - migration/seed/database scripts
  - package files and lock files

## Verification

- [ ] `node scripts/e2e/first-release-menu-whitelist.mjs`
- [ ] `pnpm --filter @jinhu/web typecheck`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `node scripts/e2e/first-release-regression.mjs` after API/DB/test-data confirmation

## Data / Side Effects

- Static menu whitelist verification has no API/DB side effects.
- Full first-release regression depends on API/DB and may write business test data. Record the target environment before running it.

## WP0 / WP4 Contract Notes

- First-release menu contract source:
- API permission codes checked:
- Module authorization / production seed impact:
- E2E whitelist paths changed:
- Forbidden paths preserved:

## Rollback

- Revert this PR if menu filtering exposes non-first-release paths or if the contract cannot be reconciled with release scope.
- Do not modify migration/seed files as a rollback for WP0.
```

## 13. 完成定义 DoD

WP0 完成必须同时满足：

- R1 背景被清楚记录：`first-release-regression` 当前第一脚本失败源于菜单 contract 缺失。
- 首发菜单 contract 有唯一来源或明确同步机制。
- 前端菜单过滤、菜单白名单脚本、发布文档和测试文档的首发路径口径一致。
- `node scripts/e2e/first-release-menu-whitelist.mjs` 通过。
- `node scripts/e2e/first-release-regression.mjs` 已在用户确认 API/DB 和测试数据影响后执行，或明确记录未执行原因；未执行时不得声称完整 regression 已通过。
- 若完整 regression 后续脚本失败，失败被记录为对应工作包或环境问题，且确认不再因菜单 contract 缺失在第一步失败。
- 未修改业务代码、CI、Docker、migration、seed、E2E 业务脚本、package 文件或锁文件，除 WP0 明确允许范围内的菜单 contract / 菜单白名单脚本 / 文档同步。
- `git diff --check` 无空白错误。
- PR 描述使用第 12 节模板，包含验证证据和有副作用命令说明。

## 14. 本计划阶段交付

本次仅交付 WP0 详细工作计划文档：`docs/release/smartpark-review-remediation-wp0-plan.md`。

本次不修复 `FIRST_RELEASE_MENU_PATHS`，不运行有副作用回归，不修改业务代码、测试脚本、CI、Docker、数据库脚本或锁文件。
