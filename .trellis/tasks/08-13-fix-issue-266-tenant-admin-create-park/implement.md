# Implementation plan

- [x] 加载 API、Web、Shared 和项目运维规范，完整阅读即将修改的代码。
- [x] 复用 tenant onboarding 的园区作用域 provisioning primitives，避免复制 asset 初始化合同。
- [x] 收紧 `POST /parks` 的租户管理员授权并生成独立 `parkId`。
- [x] 原子创建根组织、管理员身份/访问、园区角色/权限、模块和 asset scope。
- [x] 调整同租户多园区列表/详情/写入目标作用域；前端请求响应合同不变。
- [x] 增加服务合同测试、唯一性迁移测试和 PostgreSQL 16 回放。
- [x] 运行定向测试、API 全量单测、lint、typecheck、build。
- [x] 执行 Trellis check、独立审查并更新 API 规范。
- [x] 处理线上复测三连问题：
  - [x] `TENANT_ADMIN` 历史 tenant-scoped 角色仅补正内置标记，park-scoped 异常继续 fail-closed。
  - [x] 移除阻断独立 scope 退役的旧保护，保留 active/inactive/asset-assignment 状态机。
  - [x] 修复楼栋新增的 `Invalid request origin`：前端不再为跨园区新增楼栋调用认证 context-switch，后端 `POST /buildings` 按显式 `parkId` 做目标园区鉴权、编码生成、写入和审计 scope override。
  - [x] 复审后收紧所有跨 scope 删除必须先停用，即使目标尚无 asset 投影；补充真实退役函数的 asset assignment 与 `asset_park` 软删除回归。
- [ ] 创建 `codex/` 分支，提交、推送并创建 Draft PR（Closes #266）。
- [ ] 针对每个最新 head 仅触发一次 Codex Review，处理并解决全部可操作 threads，复跑 CI。
- [ ] CI/Release Smoke/Codex Review 全绿后转 Ready 并自动合并。
- [ ] 监控生产 Deploy、health、login 与 Docker cleanup；失败时从首个真实错误继续同一闭环。

## Validation

- API parks/tenants/assets/orgs/users 定向单测。
- first-release 多园区专项 E2E 与 first-release regression。
- `pnpm lint`, `pnpm typecheck`, `pnpm build`。
- GitHub Verify、Release Smoke、Codex Review、Deploy production。

### 2026-08-15 local regression

- `node --test --require ts-node/register src/modules/tenants/tenants.permission-derivation.spec.ts src/modules/parks/parks.asset-scope.spec.ts` — 48 pass.
- `node --test --require ts-node/register src/modules/auth/auth-cookie-origin.spec.ts src/modules/auth/auth-refresh-cookie.spec.ts src/modules/tenants/tenants.service.additional-park.spec.ts` — 65 pass.
- `pnpm --filter @jinhu/api typecheck` — pass.
- `pnpm --filter @jinhu/api lint` — pass.
- `pnpm --filter @jinhu/api test:unit` — 1212 pass, 13 skipped, 0 failed.
- `tsc -p apps/api/tsconfig.build.json --outDir /tmp/jinhu-api-build-check-266-20260815092319 --noEmit false` — pass.
- `pnpm --filter @jinhu/api build` — blocked by pre-existing root-owned `apps/api/dist`; source compilation was verified with the temporary outDir command above.

### 2026-08-15 follow-up regression

- `pnpm --filter @jinhu/shared build` — pass.
- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/buildings/buildings.cross-park-create.spec.ts` — 3 pass.
- `pnpm --filter @jinhu/web test:unit:assets` — 11 pass.
- `pnpm --filter @jinhu/api typecheck` — pass.
- `pnpm --filter @jinhu/web typecheck` — pass.
- `pnpm --filter @jinhu/api lint` — pass.
- `pnpm --filter @jinhu/web lint` — pass.
- `pnpm --filter @jinhu/api build` — pass.
- `pnpm --filter @jinhu/web build` — pass.
- `git diff --check` — pass.

### 2026-08-15 review follow-up

- Independent read-only review raised a P2 to cover controller/audit propagation beyond source assertions and mocked service behavior.
- Added a pipeline-level API regression that invokes `BuildingsController.create` and `AuditLogInterceptor`, proving the explicit target park reaches `request.auditScopeOverride` and the audit entry.
- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/buildings/buildings.cross-park-create.spec.ts` — 4 pass.
- `pnpm --filter @jinhu/api typecheck` — pass.
- `pnpm --filter @jinhu/api lint` — pass.
- `git diff --check` — pass.

### 2026-08-15 post-merge deploy gate follow-up

- PR #292 merged successfully and main CI run `31863086110` passed; Release Smoke was skipped by scope detection.
- Production Deploy failed before release sync at `Enforce 000194 runtime control parity before deployment`.
- Root cause: independent park retirement deleted the runtime owner rows (`asset_park` and asset module assignment) for scopes that still retained exact 12 disabled property runtime controls and 24 immutable correction audits, producing `extra_control_scope`.
- Fixed future retirement to keep `asset_park`, disable all park module assignments to revoke stale scoped access, and avoid soft-deleting the retained owner rows.
- Added a bounded repair script for already-retired scopes that restores exactly one deleted `asset_park` and exactly one deleted disabled asset assignment only when the full 000194/000195 runtime-control audit evidence is complete and exactly one deleted `biz_park` source exists.
- Wired the repair into `prod-deploy.sh` and the GitHub production deployment between the 000189 and 000194 gates.
- Addressed Codex Review findings by qualifying repair `version` updates, no-oping before runtime-control tables exist, validating correction audit evidence before mutation, revoking non-asset assignments on future park retirement, and documenting the production data repair.
- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/parks/parks.asset-scope.spec.ts` — 13 pass.
- `node scripts/e2e/migration-prerequisite-contract.mjs` — pass.
- `sh scripts/e2e/prod-deploy-seed-precedence.sh` — pass.
- `sh -n scripts/repair-000194-retired-runtime-owner.sh scripts/prod-deploy.sh scripts/e2e/prod-deploy-seed-precedence.sh` — pass.
- `pnpm --filter @jinhu/api typecheck` — pass.
- `pnpm --filter @jinhu/api lint` — pass.
- `pnpm --filter @jinhu/api build` — pass.
- `git diff --check` — pass.

## Rollback points

- 若 schema 无法在单一 `sys_user` 身份下正确绑定新园区管理员，停止并拆分身份模型设计，不写半兼容逻辑。
- 若同租户列表放宽会泄漏普通用户数据，只为 tenant-admin 增加专用管理查询。
- 不修改已执行迁移，不放宽 canonical exact-one invariant。
