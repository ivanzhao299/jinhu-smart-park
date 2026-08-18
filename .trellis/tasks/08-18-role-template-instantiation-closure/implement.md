# 实施计划

## 1. Shared Helper

- 在 `packages/shared/src/property-business/role-templates.ts` 增加按 code 查找模板的 helper。
- 增加计算模板最终权限集合的 helper，复用 `TRACK_B_PERMISSION_BUNDLES`。
- 补 shared 测试，覆盖 `民宿经办` 最终权限和 unknown code。

## 2. API 实例化

- 修改 `RolesService.copy`：managed template 分支先解析 shared 定义。
- 校验模板 version/hash。
- 用 shared 最终权限 code 解析权限实体并写入 `rel_role_perm`。
- 默认数据范围使用 shared `dataScopeRuleCode`，字段策略保持数据库复制。
- 对缺失权限、hash 漂移、未知模板 fail closed。
- 补 API/源码契约测试，证明 copy 路径消费 shared helper，不再依赖数据库模板权限绑定。

## 3. Web 闭环

- 角色页新增实例化 modal/drawer，替换模板复制 prompt。
- 保护提示旁增加实例化 CTA 和权限不足说明。
- 用户页候选为空时增加“模板不可直接分配，请先实例化”的说明和角色管理跳转。
- 补 Web logic specs 覆盖文案和入口。

## 4. 文档与 Seed 契约

- 更新生产 seed README，明确 `000015` 是 shared 模板定义的数据库 reconcile。
- 更新静态 seed/template 契约脚本，要求实例化路径引用 shared resolver。

## 5. 验证

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm --filter @jinhu/shared build`
- [x] `pnpm --filter @jinhu/shared test`
- [x] `pnpm --filter @jinhu/shared typecheck`
- [x] `cd apps/api && TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/roles/roles.authorization-scope.spec.ts`
- [x] `pnpm --filter @jinhu/api build`
- [x] `pnpm --filter @jinhu/api lint`
- [x] `pnpm --filter @jinhu/web test:unit:system`
- [x] `pnpm --filter @jinhu/web typecheck`
- [x] `pnpm --filter @jinhu/web lint`
- [x] `pnpm --filter @jinhu/web build`
- [x] `node scripts/e2e/property-role-template-reconcile-contract.mjs`
- [x] `git diff --check`
- [ ] Browser desktop/mobile inspection: skipped in the clean Linux worktree because no Chrome/Chromium binary or Playwright/Puppeteer dependency is available. Web build, typecheck, lint, and system logic tests passed.

## 6. PR 闭环

- 提交 clean branch。
- 创建 PR 到 `main`。
- 每次 push 后评论 `@codex review`。
- 读取并修复所有 actionable review threads。
- CI 绿后合并，跟踪合并/部署状态，并更新任务记录。
